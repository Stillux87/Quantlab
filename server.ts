import express, { Request, Response } from 'express';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import { serverPaperTradingEngine } from './src/services/serverPaperTradingEngine';
import { serverSavedStrategyService } from './src/services/serverSavedStrategyService';
import { aiAutopilotService } from './src/services/aiAutopilotService';
import { INSTRUMENTS_DATABASE } from './src/data/instruments';
import { calculateEMA, calculateRSI, calculateATR } from './src/services/indicators';
import { Bar, Instrument, Timeframe } from './src/types';
import {
  AuthenticatedRequest,
  createRateLimiter,
  requireAuth,
  resolveRequestAuth,
  validateDateParam,
  validateFiniteNumber,
  validateSafeId,
  validateTicker,
  validateTimeframe,
} from './src/services/apiSecurity';
import {
  aggregateHourlyBars,
  DataProvenance,
  DataStatus,
  FxRateResult,
  validateAndCleanBars,
} from './src/services/marketDataIntegrity';

process.on('uncaughtException', (err) => {
  console.error('[Server] Fatal Uncaught Exception:', err?.stack || err?.message || err);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[Server] Unhandled Promise Rejection:', reason);
});

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '512kb' }));

// Global API rate limiter (120 req/min) + stricter limiter for mutating/AI routes (25 req/min)
const apiRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 120,
  keyPrefix: 'api',
});
const mutationRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 25,
  keyPrefix: 'mut',
});

app.use('/api', apiRateLimiter);

// In-memory cache for market quotes & history to reduce latency and respect rate limits
const cache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 20_000; // 20 seconds for quotes
const HISTORY_CACHE_TTL_MS = 60_000; // 60 seconds for historical bars
const FX_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes max freshness for FX rate

/**
 * Normalizes symbols for Yahoo Finance v8 API and detects virtual portfolio aliases
 */
function normalizeYahooTicker(rawTicker: string): { yahooSymbol: string; isVirtual: boolean } {
  const t = rawTicker.trim().toUpperCase();
  if (!t || t === 'PORTFOLIO' || t.startsWith('PORT_') || t.startsWith('PORTFOLIO_')) {
    return { yahooSymbol: '', isVirtual: true };
  }
  const ALIASES: Record<string, string> = {
    EURUSD: 'EURUSD=X',
    GBPUSD: 'GBPUSD=X',
    USDJPY: 'USDJPY=X',
    AUDUSD: 'AUDUSD=X',
    EURGBP: 'EURGBP=X',
    EURCHF: 'EURCHF=X',
    EURJPY: 'EURJPY=X',
    USDCAD: 'USDCAD=X',
    USDCHF: 'USDCHF=X',
    NZDUSD: 'NZDUSD=X',
    FDAX: '^GDAXI',
    FGBL: 'FGBL=F',
    FIB: 'FTSEMIB.MI',
    'ES=F': 'ES=F',
    'NQ=F': 'NQ=F',
    'CL=F': 'CL=F',
    'GC=F': 'GC=F',
    'NG=F': 'NG=F',
    'SI=F': 'SI=F',
    'HG=F': 'HG=F',
    'ZC=F': 'ZC=F',
    'KC=F': 'KC=F',
  };
  return { yahooSymbol: ALIASES[t] || t, isVirtual: false };
}

/**
 * Resolves instrument metadata strictly for descriptive labels (never for price fallback).
 */
function getInstrumentMeta(ticker: string): Instrument {
  const found = INSTRUMENTS_DATABASE.find((i) => i.ticker.toUpperCase() === ticker.toUpperCase());
  if (found) return found;

  return {
    id: ticker.toLowerCase(),
    ticker,
    isin: ticker,
    name: ticker,
    type: 'STOCK',
    market: 'Global',
    exchangeCode: 'MTA',
    currency: 'EUR',
    currencySymbol: '€',
    currentPrice: 0,
    change24h: 0,
    change24hAmount: 0,
    volume24h: 0,
    sector: 'Diversified',
    description: `Asset di mercato ${ticker}`,
    dataRange: { startDate: '', endDate: '', totalBarsDaily: 0 },
    dataQuality: {
      score: 0,
      missingBarsPct: 0,
      duplicateBarsCount: 0,
      volumeCompletenessPct: 0,
      priceAnomalyCount: 0,
      status: 'GOOD',
    },
  };
}

// Fetch wrapper with query1/query2 failover, timeout and explicit error handling
async function fetchYahoo(
  url: string,
  timeoutMs = 7000
): Promise<{ ok: boolean; status: number; statusText: string; data: any }> {
  const trySingleUrl = async (targetUrl: string) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      });
      clearTimeout(timer);
      if (!res.ok) {
        return { ok: false, status: res.status, statusText: res.statusText, data: null };
      }
      const json = await res.json();
      return { ok: true, status: 200, statusText: 'OK', data: json };
    } catch (err: any) {
      return { ok: false, status: 500, statusText: err?.message || 'Fetch failed', data: null };
    }
  };

  const primary = await trySingleUrl(url);
  if (primary.ok && primary.data) return primary;

  if (url.includes('query1.finance.yahoo.com')) {
    const backupUrl = url.replace('query1.finance.yahoo.com', 'query2.finance.yahoo.com');
    const secondary = await trySingleUrl(backupUrl);
    if (secondary.ok && secondary.data) return secondary;
  }

  return primary;
}

// Strict Live EUR/USD FX provider (ZERO hardcoded fallbacks such as 1.085 or 0.92)
let cachedEurUsdRate: number | null = null;
let lastEurUsdFetchMs = 0;

async function getLiveEurUsdFx(): Promise<FxRateResult> {
  const now = Date.now();
  if (cachedEurUsdRate !== null && now - lastEurUsdFetchMs < FX_CACHE_TTL_MS) {
    return {
      pair: 'EUR/USD',
      rate: cachedEurUsdRate,
      usdToEur: parseFloat((1 / cachedEurUsdRate).toFixed(6)),
      isVerified: true,
      source: 'Yahoo Finance FX (EURUSD=X)',
      fetchedAt: new Date(lastEurUsdFetchMs).toISOString(),
      status: now - lastEurUsdFetchMs < 60_000 ? 'LIVE_VERIFIED' : 'CACHED_RECENT',
    };
  }

  try {
    const res = await fetchYahoo(
      'https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=1d&range=5d',
      4500
    );
    const price = res.data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof price === 'number' && Number.isFinite(price) && price > 0.5 && price < 2.0) {
      cachedEurUsdRate = parseFloat(price.toFixed(6));
      lastEurUsdFetchMs = now;
      return {
        pair: 'EUR/USD',
        rate: cachedEurUsdRate,
        usdToEur: parseFloat((1 / cachedEurUsdRate).toFixed(6)),
        isVerified: true,
        source: 'Yahoo Finance FX (EURUSD=X)',
        fetchedAt: new Date(now).toISOString(),
        status: 'LIVE_VERIFIED',
      };
    }
  } catch {
    // Handled explicitly below without fabricating a static rate
  }

  // Expire stale cache rather than masking FX outage
  cachedEurUsdRate = null;
  return {
    pair: 'EUR/USD',
    rate: null,
    usdToEur: null,
    isVerified: false,
    source: 'Yahoo Finance FX (EURUSD=X)',
    fetchedAt: null,
    status: 'UNAVAILABLE',
    warning:
      'Cambio reale EUR/USD temporaneamente non disponibile. Nessun tasso arbitrario sostituito.',
  };
}

function resolveCurrencyFx(
  currency: string,
  fx: FxRateResult
): { fxRateToEur: number | null; fxVerified: boolean } {
  const curr = currency.toUpperCase();
  if (curr === 'EUR') {
    return { fxRateToEur: 1.0, fxVerified: true };
  }
  if (curr === 'USD' && fx.isVerified && fx.usdToEur !== null) {
    return { fxRateToEur: parseFloat(fx.usdToEur.toFixed(4)), fxVerified: true };
  }
  return { fxRateToEur: null, fxVerified: false };
}

function checkSessionOwnership(
  session: { ownerUid?: string } | undefined,
  req: AuthenticatedRequest
): boolean {
  if (!req.authUser) return false;
  if (req.authUser.isAdmin) return true;
  if (!session?.ownerUid) return true; // Legacy pre-auth session manageable by verified user
  return session.ownerUid === req.authUser.uid;
}

// -------------------------------------------------------------
// API Routes
// -------------------------------------------------------------

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Real-Time Quote for a single ticker
app.get('/api/market/quote', async (req: Request, res: Response) => {
  try {
    const tickerCheck = validateTicker(req.query.ticker);
    if (!tickerCheck.ok) {
      return res.status(400).json({ error: tickerCheck.error });
    }
    const ticker = tickerCheck.value;
    const { yahooSymbol, isVirtual } = normalizeYahooTicker(ticker);
    const inst = getInstrumentMeta(ticker);

    if (isVirtual) {
      return res.status(400).json({
        symbol: ticker,
        price: null,
        isLiveVerified: false,
        dataStatus: 'UNAVAILABLE' as DataStatus,
        error: 'Ticker virtuale di portafoglio: nessuna quotazione diretta di borsa disponibile.',
        lastUpdated: new Date().toISOString(),
      });
    }

    const cacheKey = `quote_${ticker}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.json({ ...cached.data, _cached: true });
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`;
    const fetchRes = await fetchYahoo(url);

    if (!fetchRes.ok || !fetchRes.data) {
      return res.status(503).json({
        symbol: ticker,
        name: inst.name,
        price: null,
        isLiveVerified: false,
        dataStatus: 'UNAVAILABLE' as DataStatus,
        error: 'Quotazione reale momentaneamente non raggiungibile dal feed di borsa',
        lastUpdated: new Date().toISOString(),
      });
    }

    const result = fetchRes.data.chart?.result?.[0];
    if (!result || !result.meta) {
      return res.status(503).json({
        symbol: ticker,
        name: inst.name,
        price: null,
        isLiveVerified: false,
        dataStatus: 'UNAVAILABLE' as DataStatus,
        error: 'Dati di mercato reali non disponibili per questo ticker',
        lastUpdated: new Date().toISOString(),
      });
    }

    const meta = result.meta;
    const hasRegularPrice =
      typeof meta.regularMarketPrice === 'number' &&
      Number.isFinite(meta.regularMarketPrice) &&
      meta.regularMarketPrice > 0;
    const hasPrevClose =
      typeof meta.previousClose === 'number' &&
      Number.isFinite(meta.previousClose) &&
      meta.previousClose > 0;

    const price = hasRegularPrice ? meta.regularMarketPrice : hasPrevClose ? meta.previousClose : null;
    if (price === null) {
      return res.status(503).json({
        symbol: ticker,
        name: inst.name,
        price: null,
        isLiveVerified: false,
        dataStatus: 'UNAVAILABLE' as DataStatus,
        error: 'Prezzo reale non valido dal feed di borsa',
        lastUpdated: new Date().toISOString(),
      });
    }

    const dataStatus: DataStatus =
      hasRegularPrice && meta.marketState === 'REGULAR'
        ? 'REALTIME'
        : hasRegularPrice
        ? 'LAST_AVAILABLE'
        : 'DELAYED';

    const prevClose =
      typeof meta.chartPreviousClose === 'number' && meta.chartPreviousClose > 0
        ? meta.chartPreviousClose
        : typeof meta.previousClose === 'number' && meta.previousClose > 0
        ? meta.previousClose
        : price;
    const change = price - prevClose;
    const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

    const isEuropeanTicker =
      ticker.endsWith('.MI') ||
      ticker.endsWith('.DE') ||
      ticker.endsWith('.PA') ||
      ticker.endsWith('.AS');
    const resolvedCurrency = isEuropeanTicker
      ? 'EUR'
      : (meta.currency || inst.currency || 'USD').toUpperCase();
    const resolvedSymbol =
      resolvedCurrency === 'USD' ? '$' : resolvedCurrency === 'GBP' ? '£' : '€';

    const fx = await getLiveEurUsdFx();
    const { fxRateToEur, fxVerified } = resolveCurrencyFx(resolvedCurrency, fx);

    const quoteData = {
      symbol: meta.symbol || ticker,
      name: meta.shortName || meta.longName || inst.name,
      price: parseFloat(price.toFixed(4)),
      previousClose: parseFloat(prevClose.toFixed(4)),
      change24hAmount: parseFloat(change.toFixed(4)),
      change24h: parseFloat(changePct.toFixed(2)),
      currency: resolvedCurrency,
      currencySymbol: resolvedSymbol,
      fxRateToEur,
      fxVerified,
      eurUsdRate: fx.rate,
      fxStatus: fx.status,
      isLiveVerified: true,
      dataStatus,
      source: 'Yahoo Finance Market Feed',
      high24h: meta.regularMarketDayHigh ?? meta.dayHigh ?? price,
      low24h: meta.regularMarketDayLow ?? meta.dayLow ?? price,
      volume24h: meta.regularMarketVolume ?? 0,
      exchange: meta.exchangeName || inst.market,
      exchangeTimezone: meta.exchangeTimezoneName || undefined,
      marketState: meta.marketState || 'CLOSED',
      marketTime: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString()
        : undefined,
      lastUpdated: new Date().toISOString(),
    };

    cache.set(cacheKey, { timestamp: Date.now(), data: quoteData });
    res.json(quoteData);
  } catch (err: any) {
    console.warn('[MarketQuote] Avviso recupero quote:', err?.message || err);
    res.status(503).json({
      symbol: String(req.query.ticker || '').trim().toUpperCase(),
      price: null,
      isLiveVerified: false,
      dataStatus: 'UNAVAILABLE' as DataStatus,
      error: 'Errore temporaneo nel collegamento al feed di borsa',
      lastUpdated: new Date().toISOString(),
    });
  }
});

// Real-Time Batch Quotes (strict: never falls back to static catalog prices)
app.get('/api/market/quotes', async (req: Request, res: Response) => {
  try {
    const rawList = String(req.query.tickers || '')
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    if (rawList.length === 0) {
      return res.status(400).json({ error: 'Parametro tickers obbligatorio' });
    }
    if (rawList.length > 40) {
      return res.status(400).json({ error: 'Massimo 40 ticker per richiesta batch' });
    }

    const validTickers: string[] = [];
    for (const raw of rawList) {
      const check = validateTicker(raw);
      if (check.ok) validTickers.push(check.value);
    }

    const quotes: Record<string, any> = {};
    const fx = await getLiveEurUsdFx();

    await Promise.all(
      validTickers.map(async (ticker) => {
        try {
          const { yahooSymbol, isVirtual } = normalizeYahooTicker(ticker);
          const inst = getInstrumentMeta(ticker);

          if (isVirtual) {
            quotes[ticker] = {
              symbol: ticker,
              name: inst.name,
              price: null,
              isLiveVerified: false,
              dataStatus: 'UNAVAILABLE' as DataStatus,
              error: 'Ticker virtuale non quotato direttamente',
              lastUpdated: new Date().toISOString(),
            };
            return;
          }

          const cacheKey = `quote_${ticker}`;
          const cached = cache.get(cacheKey);
          if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS && cached.data?.currencySymbol) {
            quotes[ticker] = cached.data;
            return;
          }

          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`;
          const fetchRes = await fetchYahoo(url);
          const result = fetchRes.ok ? fetchRes.data?.chart?.result?.[0] : null;

          if (result && result.meta) {
            const meta = result.meta;
            const hasRegularPrice =
              typeof meta.regularMarketPrice === 'number' &&
              Number.isFinite(meta.regularMarketPrice) &&
              meta.regularMarketPrice > 0;
            const hasPrevClose =
              typeof meta.previousClose === 'number' &&
              Number.isFinite(meta.previousClose) &&
              meta.previousClose > 0;
            const price = hasRegularPrice
              ? meta.regularMarketPrice
              : hasPrevClose
              ? meta.previousClose
              : null;

            if (price === null) {
              quotes[ticker] = {
                symbol: ticker,
                name: inst.name,
                price: null,
                isLiveVerified: false,
                dataStatus: 'UNAVAILABLE' as DataStatus,
                error: 'Prezzo non disponibile dal feed',
                lastUpdated: new Date().toISOString(),
              };
              return;
            }

            const dataStatus: DataStatus =
              hasRegularPrice && meta.marketState === 'REGULAR'
                ? 'REALTIME'
                : hasRegularPrice
                ? 'LAST_AVAILABLE'
                : 'DELAYED';

            const prevClose =
              typeof meta.chartPreviousClose === 'number' && meta.chartPreviousClose > 0
                ? meta.chartPreviousClose
                : typeof meta.previousClose === 'number' && meta.previousClose > 0
                ? meta.previousClose
                : price;
            const change = price - prevClose;
            const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

            const isEuropeanTicker =
              ticker.endsWith('.MI') ||
              ticker.endsWith('.DE') ||
              ticker.endsWith('.PA') ||
              ticker.endsWith('.AS');
            const resolvedCurrency = isEuropeanTicker
              ? 'EUR'
              : (meta.currency || inst.currency || 'USD').toUpperCase();
            const resolvedSymbol =
              resolvedCurrency === 'USD' ? '$' : resolvedCurrency === 'GBP' ? '£' : '€';
            const { fxRateToEur, fxVerified } = resolveCurrencyFx(resolvedCurrency, fx);

            const q = {
              symbol: meta.symbol || ticker,
              name: meta.shortName || meta.longName || inst.name,
              price: parseFloat(price.toFixed(4)),
              previousClose: parseFloat(prevClose.toFixed(4)),
              change24hAmount: parseFloat(change.toFixed(4)),
              change24h: parseFloat(changePct.toFixed(2)),
              currency: resolvedCurrency,
              currencySymbol: resolvedSymbol,
              fxRateToEur,
              fxVerified,
              eurUsdRate: fx.rate,
              fxStatus: fx.status,
              isLiveVerified: true,
              dataStatus,
              source: 'Yahoo Finance Market Feed',
              high24h: meta.regularMarketDayHigh ?? meta.dayHigh ?? price,
              low24h: meta.regularMarketDayLow ?? meta.dayLow ?? price,
              volume24h: meta.regularMarketVolume ?? 0,
              exchange: meta.exchangeName || inst.market,
              marketState: meta.marketState || 'CLOSED',
              lastUpdated: new Date().toISOString(),
            };
            cache.set(cacheKey, { timestamp: Date.now(), data: q });
            quotes[ticker] = q;
          } else {
            quotes[ticker] = {
              symbol: ticker,
              name: inst.name,
              price: null,
              isLiveVerified: false,
              dataStatus: 'UNAVAILABLE' as DataStatus,
              error: 'Feed non raggiungibile',
              lastUpdated: new Date().toISOString(),
            };
          }
        } catch {
          quotes[ticker] = {
            symbol: ticker,
            price: null,
            isLiveVerified: false,
            dataStatus: 'UNAVAILABLE' as DataStatus,
            error: 'Feed non raggiungibile',
            lastUpdated: new Date().toISOString(),
          };
        }
      })
    );

    res.json({
      quotes,
      fx,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.warn('[MarketQuotes] Avviso recupero batch quotes:', err?.message || err);
    res.status(503).json({ quotes: {}, error: 'Errore recupero quotazioni batch' });
  }
});

// Helper: Checks whether a date range spans more than 2 years
function isRangeOverTwoYearsServer(startDate?: string, endDate?: string): boolean {
  if (!startDate) return false;
  const startMs = new Date(`${startDate}T00:00:00Z`).getTime();
  if (isNaN(startMs)) return false;
  const endMs = endDate ? new Date(`${endDate}T23:59:59Z`).getTime() : Date.now();
  const twoYearsMs = 735 * 24 * 60 * 60 * 1000;
  return endMs - startMs > twoYearsMs;
}

// Real Historical OHLCV Bars (100% REAL MARKET DATA ONLY — ZERO SYNTHETIC FALLBACK)
app.get('/api/market/history', async (req: Request, res: Response) => {
  const fetchedAt = new Date().toISOString();
  try {
    const tickerCheck = validateTicker(req.query.ticker);
    if (!tickerCheck.ok) {
      return res.status(400).json({ error: tickerCheck.error });
    }
    const ticker = tickerCheck.value;

    const tfCheck = validateTimeframe(req.query.timeframe || '1D');
    if (!tfCheck.ok) {
      return res.status(400).json({ error: tfCheck.error });
    }
    let timeframe: Timeframe = tfCheck.value;

    const startCheck = validateDateParam(req.query.startDate);
    const endCheck = validateDateParam(req.query.endDate);
    if (!startCheck.ok) return res.status(400).json({ error: startCheck.error });
    if (!endCheck.ok) return res.status(400).json({ error: endCheck.error });
    const startDate = startCheck.value || '';
    const endDate = endCheck.value || '';

    const { yahooSymbol, isVirtual } = normalizeYahooTicker(ticker);
    const inst = getInstrumentMeta(ticker);

    if (isVirtual) {
      const provenance: DataProvenance = {
        source: 'QuantLab Data Integrity Gate',
        timeframe,
        dataStatus: 'UNAVAILABLE',
        isRealData: false,
        isLiveVerified: false,
        fetchedAt,
        warnings: ['Simbolo virtuale di portafoglio: utilizzare le serie reali dei singoli costituenti.'],
      };
      return res.status(400).json({
        ticker,
        currency: inst.currency,
        currentPrice: null,
        timeframe,
        barsCount: 0,
        startDate: '',
        endDate: '',
        bars: [],
        isRealData: false,
        dataStatus: 'UNAVAILABLE',
        provenance,
        error: 'Serie storica non disponibile per simboli virtuali di portafoglio.',
      });
    }

    const isOverTwoYears = isRangeOverTwoYearsServer(startDate, endDate);
    let wasAutoAdjustedTo1D = false;
    let autoAdjustmentNote = '';
    const warnings: string[] = [];

    if (isOverTwoYears && timeframe !== '1D') {
      timeframe = '1D';
      wasAutoAdjustedTo1D = true;
      autoAdjustmentNote =
        'Periodo oltre 2 anni rilevato: timeframe impostato automaticamente a 1D (giornaliero) per garantire il 100% di dati storici reali senza serie sintetiche.';
      warnings.push(autoAdjustmentNote);
    }

    const cacheKey = `history_${ticker}_${timeframe}_${startDate || 'all'}_${endDate || 'all'}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < HISTORY_CACHE_TTL_MS) {
      return res.json({ ...cached.data, _cached: true });
    }

    let interval = '1d';
    let range = '10y';
    switch (timeframe) {
      case '1m':
        interval = '1m';
        range = '7d';
        break;
      case '5m':
        interval = '5m';
        range = '60d';
        break;
      case '15m':
        interval = '15m';
        range = '60d';
        break;
      case '30m':
        interval = '30m';
        range = '60d';
        break;
      case '1h':
      case '2h':
      case '4h':
        interval = '1h';
        range = '730d';
        break;
      case '1D':
      default:
        interval = '1d';
        range = '10y';
        break;
    }

    let url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}&includePrePost=false`;
    let fetchRes = await fetchYahoo(url);

    // Explicit fallback ONLY to real 1D bars (never synthetic) if intraday unavailable on exchange
    if ((!fetchRes.ok || !fetchRes.data) && interval !== '1d') {
      interval = '1d';
      timeframe = '1D';
      wasAutoAdjustedTo1D = true;
      autoAdjustmentNote =
        'Dati intraday reali non disponibili dal feed di borsa per questo ticker: timeframe impostato esplicitamente a 1D reale.';
      warnings.push(autoAdjustmentNote);
      url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5y&includePrePost=false`;
      fetchRes = await fetchYahoo(url);
    }

    if (!fetchRes.ok || !fetchRes.data) {
      const provenance: DataProvenance = {
        source: 'Yahoo Finance Real-Time Market API',
        timeframe,
        dataStatus: 'UNAVAILABLE',
        isRealData: false,
        isLiveVerified: false,
        fetchedAt,
        warnings: [`Feed di borsa non raggiungibile (HTTP ${fetchRes.status}).`],
      };
      return res.status(503).json({
        ticker,
        currency: inst.currency,
        currentPrice: null,
        timeframe,
        barsCount: 0,
        startDate: '',
        endDate: '',
        bars: [],
        isRealData: false,
        dataStatus: 'UNAVAILABLE',
        provenance,
        error: 'Dati storici reali temporaneamente non disponibili dal feed di borsa',
        source: 'Exchange Feed Temporarily Unavailable',
      });
    }

    const result = fetchRes.data.chart?.result?.[0];
    if (!result || !Array.isArray(result.timestamp) || result.timestamp.length === 0) {
      const provenance: DataProvenance = {
        source: 'Yahoo Finance Real-Time Market API',
        timeframe,
        dataStatus: 'UNAVAILABLE',
        isRealData: false,
        isLiveVerified: false,
        fetchedAt,
        warnings: ['Nessuna candela storica restituita dal feed.'],
      };
      return res.status(503).json({
        ticker,
        currency: inst.currency,
        currentPrice: null,
        timeframe,
        barsCount: 0,
        startDate: '',
        endDate: '',
        bars: [],
        isRealData: false,
        dataStatus: 'UNAVAILABLE',
        provenance,
        error: 'Nessuna candela storica reale restituita per questo ticker',
        source: 'Exchange Feed Empty',
      });
    }

    const timestamps: number[] = result.timestamp;
    const quotes = result.indicators?.quote?.[0];
    if (!quotes) {
      return res.status(503).json({
        ticker,
        bars: [],
        barsCount: 0,
        isRealData: false,
        dataStatus: 'UNAVAILABLE',
        error: `Dati OHLCV mancanti dal feed per ${ticker}`,
      });
    }

    const opens: (number | null)[] = quotes.open || [];
    const highs: (number | null)[] = quotes.high || [];
    const lows: (number | null)[] = quotes.low || [];
    const closes: (number | null)[] = quotes.close || [];
    const volumes: (number | null)[] = quotes.volume || [];

    const rawBars: Bar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const tsSec = timestamps[i];
      const c = closes[i];
      if (!Number.isFinite(tsSec) || typeof c !== 'number' || !Number.isFinite(c) || c <= 0) {
        // Never invent or forward-fill missing exchange bars
        continue;
      }
      const o = typeof opens[i] === 'number' && Number.isFinite(opens[i]!) && opens[i]! > 0 ? opens[i]! : c;
      const hRaw = typeof highs[i] === 'number' && Number.isFinite(highs[i]!) && highs[i]! > 0 ? highs[i]! : Math.max(o, c);
      const lRaw = typeof lows[i] === 'number' && Number.isFinite(lows[i]!) && lows[i]! > 0 ? lows[i]! : Math.min(o, c);
      const v = typeof volumes[i] === 'number' && Number.isFinite(volumes[i]!) && volumes[i]! >= 0 ? volumes[i]! : 0;

      const tMs = tsSec * 1000;
      const d = new Date(tMs);
      const dateStr =
        interval === '1d'
          ? d.toISOString().substring(0, 10)
          : `${d.toISOString().substring(0, 10)} ${d.toISOString().substring(11, 16)}`;

      rawBars.push({
        timestamp: tMs,
        dateStr,
        open: parseFloat(o.toFixed(4)),
        high: parseFloat(Math.max(hRaw, o, c).toFixed(4)),
        low: parseFloat(Math.min(lRaw, o, c).toFixed(4)),
        close: parseFloat(c.toFixed(4)),
        volume: Math.round(v),
      });
    }

    const meta = result.meta || {};
    const exchangeTimezone: string | undefined = meta.exchangeTimezoneName || undefined;

    // Clean, sort, deduplicate, and exclude currently-forming incomplete bar
    const baseTf: Timeframe = interval === '1h' ? '1h' : timeframe;
    const cleanedBase = validateAndCleanBars(rawBars, baseTf, {
      excludeIncompleteLastBar: true,
    });
    warnings.push(...cleanedBase.quality.warnings);

    // Properly aggregate 2h and 4h respecting session days & timezone boundaries
    let finalBars: Bar[] = cleanedBase.bars;
    let finalQuality = cleanedBase.quality;
    if ((timeframe === '2h' || timeframe === '4h') && interval === '1h') {
      const aggregated = aggregateHourlyBars(cleanedBase.bars, timeframe, {
        exchangeTimezone,
      });
      warnings.push(...aggregated.warnings);
      const cleanedAgg = validateAndCleanBars(aggregated.bars, timeframe, {
        excludeIncompleteLastBar: false,
      });
      finalBars = cleanedAgg.bars;
      finalQuality = cleanedAgg.quality;
    }

    // Filter to explicit user date range if specified
    if (startDate || endDate) {
      const filterStartMs = startDate ? new Date(`${startDate}T00:00:00Z`).getTime() : 0;
      const filterEndMs = endDate ? new Date(`${endDate}T23:59:59Z`).getTime() : Infinity;
      const filtered = finalBars.filter(
        (b) => b.timestamp >= filterStartMs && b.timestamp <= filterEndMs
      );
      if (filtered.length > 0) {
        finalBars = filtered;
      } else {
        warnings.push(
          `Nessuna barra reale trovata esattamente tra ${startDate || '...'} e ${endDate || '...'}: restituita serie storica reale disponibile del feed.`
        );
      }
    }

    if (finalBars.length === 0) {
      const provenance: DataProvenance = {
        source: 'Yahoo Finance Real-Time Market API',
        timeframe,
        dataStatus: 'UNAVAILABLE',
        isRealData: false,
        isLiveVerified: false,
        fetchedAt,
        exchangeTimezone,
        quality: finalQuality,
        warnings: [...warnings, 'Nessuna barra valida dopo la validazione di integrità.'],
      };
      return res.status(503).json({
        ticker: meta.symbol || ticker,
        currency: meta.currency || inst.currency,
        currentPrice: null,
        timeframe,
        barsCount: 0,
        startDate: '',
        endDate: '',
        bars: [],
        isRealData: false,
        dataStatus: 'UNAVAILABLE',
        provenance,
        error: 'Nessuna barra OHLCV valida disponibile per questo strumento/timeframe.',
      });
    }

    const resolvedCurrency = (meta.currency || inst.currency || 'USD').toUpperCase();
    const provenance: DataProvenance = {
      source:
        timeframe === '2h' || timeframe === '4h'
          ? `Yahoo Finance 1h Real Bars → Session-Aware ${timeframe} Aggregation`
          : 'Yahoo Finance Real-Time Market API',
      timeframe,
      dataStatus: 'HISTORICAL_REAL',
      isRealData: true,
      isLiveVerified: true,
      fetchedAt,
      currency: resolvedCurrency,
      exchangeTimezone,
      quality: finalQuality,
      warnings,
    };

    const responsePayload = {
      ticker: meta.symbol || ticker,
      currency: resolvedCurrency,
      currentPrice:
        typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0
          ? parseFloat(meta.regularMarketPrice.toFixed(4))
          : finalBars[finalBars.length - 1].close,
      timeframe,
      barsCount: finalBars.length,
      startDate: finalBars[0]?.dateStr || '',
      endDate: finalBars[finalBars.length - 1]?.dateStr || '',
      bars: finalBars,
      isRealData: true,
      dataStatus: 'HISTORICAL_REAL' as DataStatus,
      provenance,
      autoAdjustedTimeframe: wasAutoAdjustedTo1D ? '1D' : undefined,
      autoAdjustmentNote: wasAutoAdjustedTo1D ? autoAdjustmentNote : undefined,
      source: provenance.source,
    };

    cache.set(cacheKey, { timestamp: Date.now(), data: responsePayload });
    res.json(responsePayload);
  } catch (err: any) {
    console.error('[MarketHistory] Errore acquisizione dati storici reali:', err?.message || err);
    return res.status(503).json({
      ticker: String(req.query.ticker || '').trim().toUpperCase(),
      currency: null,
      currentPrice: null,
      timeframe: String(req.query.timeframe || '1D'),
      barsCount: 0,
      startDate: '',
      endDate: '',
      bars: [],
      isRealData: false,
      dataStatus: 'UNAVAILABLE' as DataStatus,
      error: 'Errore imprevisto nel recupero dei dati storici reali. Nessun dato sintetico generato.',
      provenance: {
        source: 'Yahoo Finance Real-Time Market API',
        timeframe: (req.query.timeframe as Timeframe) || '1D',
        dataStatus: 'UNAVAILABLE',
        isRealData: false,
        isLiveVerified: false,
        fetchedAt,
        warnings: ['Errore interno durante l’elaborazione del feed reale.'],
      } satisfies DataProvenance,
    });
  }
});

// Real-Time Market Intelligence & News Feed (ZERO fabricated articles)
app.get('/api/market/intelligence', async (req: Request, res: Response) => {
  try {
    const tickerCheck = validateTicker(req.query.ticker);
    if (!tickerCheck.ok) {
      return res.status(400).json({ error: tickerCheck.error });
    }
    const ticker = tickerCheck.value;
    const timeframe = String(req.query.timeframe || '1D');

    const { yahooSymbol, isVirtual } = normalizeYahooTicker(ticker);
    if (isVirtual) {
      return res.json({
        ticker,
        yahooSymbol: '',
        timeframe,
        news: [],
        quoteSummary: null,
        newsStatus: 'UNAVAILABLE',
        isRealNews: true,
        dataQuality: 'UNAVAILABLE',
        timestamp: new Date().toISOString(),
      });
    }

    const cacheKey = `intel_${yahooSymbol}_${timeframe}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 3 * 60 * 1000) {
      return res.json({ ...cached.data, _cached: true });
    }

    let newsItems: any[] = [];
    let quoteSummaryData: any = null;

    const inst = getInstrumentMeta(ticker);
    const companyKeywords = [
      ticker.toLowerCase(),
      yahooSymbol.toLowerCase(),
      ticker.split('.')[0].toLowerCase(),
      ...inst.name
        .toLowerCase()
        .split(/[\s,()]+/)
        .filter((w) => w.length > 3 && !['ucits', 'etf', 'acc', 'dist', 'shares', 'trust'].includes(w)),
    ];

    try {
      const searchNewsUrl = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(yahooSymbol)}&quotesCount=1&newsCount=20`;
      const searchRes = await fetchYahoo(searchNewsUrl);
      if (searchRes.ok && searchRes.data && Array.isArray(searchRes.data.news)) {
        const rawNews = searchRes.data.news;
        newsItems = rawNews.filter((item: any) => {
          const t = (item.title || '').toLowerCase();
          const rel = Array.isArray(item.relatedTickers)
            ? item.relatedTickers.map((r: string) => r.toUpperCase())
            : [];
          if (rel.includes(ticker) || rel.includes(yahooSymbol)) return true;
          return companyKeywords.some((kw) => t.includes(kw));
        });
      }
    } catch (e) {
      console.warn('[MarketIntelligence] Yahoo search news query error:', e);
    }

    try {
      const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=summaryProfile,financialData,defaultKeyStatistics,recommendationTrend,calendarEvents`;
      const summaryRes = await fetchYahoo(summaryUrl);
      if (summaryRes.ok && summaryRes.data?.quoteSummary?.result?.[0]) {
        quoteSummaryData = summaryRes.data.quoteSummary.result[0];
      }
    } catch {
      // Non-critical
    }

    const newsStatus = newsItems.length > 0 ? 'LIVE_VERIFIED' : 'UNAVAILABLE';
    const dataQuality = newsItems.length >= 2 ? 'HIGH' : newsItems.length > 0 ? 'MEDIUM' : 'UNAVAILABLE';

    const payload = {
      ticker,
      yahooSymbol,
      timeframe,
      news: newsItems,
      quoteSummary: quoteSummaryData,
      newsStatus,
      isRealNews: true,
      dataQuality,
      timestamp: new Date().toISOString(),
    };

    cache.set(cacheKey, { timestamp: Date.now(), data: payload });
    res.json(payload);
  } catch (err: any) {
    console.warn('[MarketIntelligence] Errore recupero notizie reali:', err?.message || err);
    res.status(503).json({
      ticker: String(req.query.ticker || '').trim().toUpperCase(),
      news: [],
      newsStatus: 'UNAVAILABLE',
      isRealNews: true,
      dataQuality: 'UNAVAILABLE',
      timestamp: new Date().toISOString(),
    });
  }
});

// Search Tickers
app.get('/api/market/search', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 64);
    if (!q) {
      return res.json({ results: [] });
    }

    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;
    const fetchRes = await fetchYahoo(url);
    const quotes = fetchRes.ok ? fetchRes.data?.quotes || [] : [];

    const results = quotes
      .filter(
        (item: any) =>
          item.symbol &&
          (item.quoteType === 'EQUITY' || item.quoteType === 'ETF' || item.quoteType === 'MUTUALFUND')
      )
      .map((item: any) => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol,
        exchange: item.exchange || item.exchDisp || '',
        type: item.quoteType === 'ETF' ? 'ETF' : 'STOCK',
        sector: item.sector || item.industry || 'Market Equities',
      }));

    res.json({ results });
  } catch (err: any) {
    console.warn('[MarketSearch] Avviso ricerca tickers:', err?.message || err);
    res.json({ results: [] });
  }
});

// -------------------------------------------------------------
// Paper Trading 24/7 Cloud Background Routes (Authenticated Mutations)
// -------------------------------------------------------------
app.get('/api/paper/sessions', (_req: Request, res: Response) => {
  try {
    const sessions = serverPaperTradingEngine.getAllSessions();
    const deletedSessionIds = serverPaperTradingEngine.getDeletedSessionIds();
    res.json({ sessions, deletedSessionIds });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to fetch sessions' });
  }
});

app.post(
  '/api/paper/sessions',
  mutationRateLimiter,
  requireAuth(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const config = req.body;
      if (!config || typeof config.strategyId !== 'string' || !config.instrument?.ticker) {
        return res.status(400).json({ error: 'Configurazione sessione incompleta' });
      }
      const tickerCheck = validateTicker(config.instrument.ticker);
      if (!tickerCheck.ok) {
        return res.status(400).json({ error: tickerCheck.error });
      }
      const capitalCheck = validateFiniteNumber(
        config.initialCapital ?? 10000,
        'initialCapital',
        100,
        10_000_000
      );
      if (!capitalCheck.ok) {
        return res.status(400).json({ error: capitalCheck.error });
      }
      const tfCheck = validateTimeframe(config.timeframe || '1h');
      if (!tfCheck.ok) {
        return res.status(400).json({ error: tfCheck.error });
      }

      const session = await serverPaperTradingEngine.createSession({
        ...config,
        timeframe: tfCheck.value,
        initialCapital: capitalCheck.value,
      });
      if (req.authUser?.uid) {
        session.ownerUid = req.authUser.uid;
      }
      res.status(201).json({ session });
    } catch (err: any) {
      console.error('Error creating paper session:', err);
      res.status(500).json({ error: err?.message || 'Failed to create session' });
    }
  }
);

app.get('/api/paper/sessions/:id', (req: Request, res: Response) => {
  const idCheck = validateSafeId(req.params.id, 'sessionId');
  if (!idCheck.ok) return res.status(400).json({ error: idCheck.error });
  const session = serverPaperTradingEngine.getSession(idCheck.value);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json({ session });
});

app.post(
  '/api/paper/sessions/:id/pause',
  mutationRateLimiter,
  requireAuth(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const idCheck = validateSafeId(req.params.id, 'sessionId');
      if (!idCheck.ok) return res.status(400).json({ error: idCheck.error });
      const existing = serverPaperTradingEngine.getSession(idCheck.value);
      if (!existing) return res.status(404).json({ error: 'Session not found' });
      if (!checkSessionOwnership(existing, req)) {
        return res.status(403).json({ error: 'Permessi insufficienti per questa sessione.' });
      }
      const updated = await serverPaperTradingEngine.togglePauseSession(idCheck.value);
      if (!updated) return res.status(404).json({ error: 'Session not found' });
      res.json({ session: updated });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Errore pausa sessione' });
    }
  }
);

app.post(
  '/api/paper/sessions/:id/stop',
  mutationRateLimiter,
  requireAuth(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const idCheck = validateSafeId(req.params.id, 'sessionId');
      if (!idCheck.ok) return res.status(400).json({ error: idCheck.error });
      const existing = serverPaperTradingEngine.getSession(idCheck.value);
      if (!existing) return res.status(404).json({ error: 'Session not found' });
      if (!checkSessionOwnership(existing, req)) {
        return res.status(403).json({ error: 'Permessi insufficienti per questa sessione.' });
      }
      const updated = await serverPaperTradingEngine.stopSession(idCheck.value);
      if (!updated) return res.status(404).json({ error: 'Session not found' });
      res.json({ session: updated });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Errore arresto sessione' });
    }
  }
);

app.delete(
  '/api/paper/sessions/:id',
  mutationRateLimiter,
  requireAuth(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const idCheck = validateSafeId(req.params.id, 'sessionId');
      if (!idCheck.ok) return res.status(400).json({ error: idCheck.error });
      const existing = serverPaperTradingEngine.getSession(idCheck.value);
      if (existing && !checkSessionOwnership(existing, req)) {
        return res.status(403).json({ error: 'Permessi insufficienti per eliminare questa sessione.' });
      }
      const success = await serverPaperTradingEngine.deleteSession(idCheck.value);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Errore eliminazione sessione' });
    }
  }
);

// SECURITY: Authoritative server-side position closure — NEVER trusts client-supplied price!
app.post(
  '/api/paper/sessions/:id/close-position',
  mutationRateLimiter,
  requireAuth(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const idCheck = validateSafeId(req.params.id, 'sessionId');
      if (!idCheck.ok) return res.status(400).json({ error: idCheck.error });
      const posCheck = validateSafeId(req.body?.positionId, 'positionId');
      if (!posCheck.ok) return res.status(400).json({ error: posCheck.error });

      const existing = serverPaperTradingEngine.getSession(idCheck.value);
      if (!existing) return res.status(404).json({ error: 'Session not found' });
      if (!checkSessionOwnership(existing, req)) {
        return res.status(403).json({ error: 'Permessi insufficienti per chiudere posizioni in questa sessione.' });
      }

      // Intentionally ignores req.body.currentPrice; server fetches verified live market quote + FX.
      const result = await serverPaperTradingEngine.manualClosePosition(
        idCheck.value,
        posCheck.value
      );
      if (!result.ok || !result.session) {
        const statusCode = result.error?.includes('non trovata') ? 404 : 422;
        return res.status(statusCode).json({ error: result.error || 'Chiusura posizione non riuscita' });
      }
      res.json({ session: result.session });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Errore chiusura posizione' });
    }
  }
);

app.post(
  '/api/paper/sessions/:id/read-alert',
  mutationRateLimiter,
  requireAuth(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const idCheck = validateSafeId(req.params.id, 'sessionId');
      if (!idCheck.ok) return res.status(400).json({ error: idCheck.error });
      const alertCheck = validateSafeId(req.body?.alertId, 'alertId');
      if (!alertCheck.ok) return res.status(400).json({ error: alertCheck.error });
      await serverPaperTradingEngine.markAlertAsRead(idCheck.value, alertCheck.value);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Errore lettura alert' });
    }
  }
);

app.post(
  '/api/paper/sessions/:id/step',
  mutationRateLimiter,
  requireAuth(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const idCheck = validateSafeId(req.params.id, 'sessionId');
      if (!idCheck.ok) return res.status(400).json({ error: idCheck.error });
      const existing = serverPaperTradingEngine.getSession(idCheck.value);
      if (!existing) return res.status(404).json({ error: 'Session not found' });
      if (!checkSessionOwnership(existing, req)) {
        return res.status(403).json({ error: 'Permessi insufficienti per questa sessione.' });
      }
      const updated = await serverPaperTradingEngine.stepSession(idCheck.value);
      if (!updated) return res.status(404).json({ error: 'Session not found' });
      res.json({ session: updated });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Errore step sessione' });
    }
  }
);

app.get('/api/paper/status', (_req: Request, res: Response) => {
  res.json(serverPaperTradingEngine.getServerStatus());
});

app.post(
  '/api/paper/consolidate',
  mutationRateLimiter,
  requireAuth(),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await serverPaperTradingEngine.consolidateSingleSessionsIntoPortfolio();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Errore durante il consolidamento' });
    }
  }
);

app.post(
  '/api/paper/reset-clean',
  mutationRateLimiter,
  requireAuth(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body || {};
      if (body.initialCapital !== undefined) {
        const capCheck = validateFiniteNumber(body.initialCapital, 'initialCapital', 500, 10_000_000);
        if (!capCheck.ok) return res.status(400).json({ error: capCheck.error });
      }
      if (body.timeframe !== undefined) {
        const tfCheck = validateTimeframe(body.timeframe);
        if (!tfCheck.ok) return res.status(400).json({ error: tfCheck.error });
      }
      const result = await serverPaperTradingEngine.resetCleanAndStartAiSwingPortfolio(body);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Errore durante il reset pulito' });
    }
  }
);

// -------------------------------------------------------------
// AI Dynamic Opportunity Scanner (100% Real Verified Bars & Live FX)
// -------------------------------------------------------------
const SCANNER_UNIVERSE = [
  'NVDA',
  'AAPL',
  'MSFT',
  'META',
  'AMZN',
  'SPY',
  'QQQ',
  'SMH',
  'UCG.MI',
  'ENEL.MI',
  'ISP.MI',
  'ENI.MI',
  'RACE.MI',
  'PRY.MI',
];

async function runAiDynamicScanner(timeframe: Timeframe = '1h', useGeminiAi = false) {
  const fx = await getLiveEurUsdFx();
  const opportunities: any[] = [];

  await Promise.all(
    SCANNER_UNIVERSE.map(async (ticker) => {
      try {
        const inst = getInstrumentMeta(ticker);
        const { yahooSymbol } = normalizeYahooTicker(ticker);
        const isEur =
          ticker.endsWith('.MI') ||
          ticker.endsWith('.DE') ||
          ticker.endsWith('.PA') ||
          ticker.endsWith('.AS');
        const currency = isEur ? 'EUR' : 'USD';
        const currencySymbol = isEur ? '€' : '$';
        const { fxRateToEur, fxVerified } = resolveCurrencyFx(currency, fx);

        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1h&range=60d&includePrePost=false`;
        const fetchRes = await fetchYahoo(url, 6000);
        const result = fetchRes.ok ? fetchRes.data?.chart?.result?.[0] : null;

        if (!result || !Array.isArray(result.timestamp) || result.timestamp.length < 25) {
          return;
        }

        const ts: number[] = result.timestamp;
        const q = result.indicators?.quote?.[0] || {};
        const rawBars: Bar[] = [];
        for (let i = 0; i < ts.length; i++) {
          const c = q.close?.[i];
          if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) continue;
          const o = typeof q.open?.[i] === 'number' && q.open[i] > 0 ? q.open[i] : c;
          const h = typeof q.high?.[i] === 'number' && q.high[i] > 0 ? q.high[i] : Math.max(o, c);
          const l = typeof q.low?.[i] === 'number' && q.low[i] > 0 ? q.low[i] : Math.min(o, c);
          const tMs = ts[i] * 1000;
          const d = new Date(tMs);
          rawBars.push({
            timestamp: tMs,
            dateStr: `${d.toISOString().substring(0, 10)} ${d.toISOString().substring(11, 16)}`,
            open: parseFloat(o.toFixed(4)),
            high: parseFloat(Math.max(h, o, c).toFixed(4)),
            low: parseFloat(Math.min(l, o, c).toFixed(4)),
            close: parseFloat(c.toFixed(4)),
            volume: Math.round(q.volume?.[i] ?? 0),
          });
        }

        const cleaned = validateAndCleanBars(rawBars, '1h', { excludeIncompleteLastBar: true });
        let bars = cleaned.bars;
        if ((timeframe === '2h' || timeframe === '4h') && bars.length >= 16) {
          bars = aggregateHourlyBars(bars, timeframe, {
            exchangeTimezone: result.meta?.exchangeTimezoneName,
          }).bars;
        }

        if (bars.length < 20) return;

        const livePrice = result.meta?.regularMarketPrice ?? bars[bars.length - 1]?.close ?? 0;
        if (!Number.isFinite(livePrice) || livePrice <= 0) return;
        const prevClose =
          result.meta?.chartPreviousClose ??
          result.meta?.previousClose ??
          (bars.length > 7 ? bars[bars.length - 8].close : livePrice);
        const change24hPct = prevClose > 0 ? ((livePrice - prevClose) / prevClose) * 100 : 0;

        const closes = bars.map((b) => b.close);
        const ema20Arr = calculateEMA(closes, 20);
        const ema50Arr = calculateEMA(closes, Math.min(50, Math.max(10, closes.length - 2)));
        const rsiArr = calculateRSI(closes, 14);
        const atrArr = calculateATR(bars, 14);

        const ema20 = ema20Arr[ema20Arr.length - 1] ?? livePrice;
        const ema20Prev = ema20Arr[ema20Arr.length - 2] ?? ema20;
        const ema50 = ema50Arr[ema50Arr.length - 1] ?? livePrice;
        const rsi14 = rsiArr[rsiArr.length - 1] ?? 50;
        const rsiPrev = rsiArr[rsiArr.length - 2] ?? 50;
        const atr = atrArr[atrArr.length - 1] ?? livePrice * 0.01;
        const atrPct = (atr / Math.max(0.01, livePrice)) * 100;

        const bar6Ago = bars[Math.max(0, bars.length - 7)]?.close || livePrice;
        const momentum6BarsPct = ((livePrice - bar6Ago) / bar6Ago) * 100;

        let score = 62;
        const isBullishTrend = livePrice >= ema50 * 0.994 && ema20 >= ema20Prev * 0.999;
        if (isBullishTrend) score += 14;
        if (rsi14 >= 38 && rsi14 <= 64 && rsi14 >= rsiPrev) score += 12;
        if (momentum6BarsPct > 0.25 && momentum6BarsPct < 3.5) score += 8;
        if (atrPct >= 0.45 && atrPct <= 2.4) score += 5;
        if (rsi14 > 73) score -= 14;
        score = Math.max(45, Math.min(97, Math.round(score)));

        const stopLossPct = parseFloat(Math.max(0.85, Math.min(1.45, atrPct * 1.15 || 1.1)).toFixed(2));
        const takeProfitPct = parseFloat(Math.max(1.75, Math.min(2.85, stopLossPct * 2.05)).toFixed(2));
        const stopLossPrice = parseFloat((livePrice * (1 - stopLossPct / 100)).toFixed(2));
        const takeProfitPrice = parseFloat((livePrice * (1 + takeProfitPct / 100)).toFixed(2));

        let signalStatus: 'BUY_READY' | 'PULLBACK_WATCH' | 'HOLD_WAIT' = 'PULLBACK_WATCH';
        let setupLabel = 'Pullback su EMA 20 in formazione';
        if (score >= 80) {
          signalStatus = 'BUY_READY';
          setupLabel =
            rsi14 < 50
              ? `Ripartenza da Pullback RSI (${rsi14.toFixed(1)}) + Trend EMA20`
              : `Breakout Swing ${timeframe} con Momentum (+${momentum6BarsPct.toFixed(2)}%)`;
        } else if (score < 64) {
          signalStatus = 'HOLD_WAIT';
          setupLabel =
            rsi14 > 70 ? 'Ipercomprato di breve: attendere ritracciamento' : 'Consolidamento laterale';
        }

        const rationale =
          signalStatus === 'BUY_READY'
            ? `Setup su ${timeframe}: prezzo reale verificato ${currencySymbol}${livePrice.toFixed(2)} sopra EMA20 (${currencySymbol}${ema20.toFixed(2)}), RSI ${rsi14.toFixed(1)}. Target +${takeProfitPct}% (${currencySymbol}${takeProfitPrice}), Stop -${stopLossPct}%.`
            : `Prezzo reale ${currencySymbol}${livePrice.toFixed(2)} (RSI ${rsi14.toFixed(1)}). Monitoraggio attivo su ${timeframe} con rischio controllato (-${stopLossPct}%).`;

        opportunities.push({
          ticker,
          name: inst.name,
          sector: inst.sector,
          market: inst.market,
          type: inst.type,
          timeframe,
          price: parseFloat(livePrice.toFixed(2)),
          change24h: parseFloat(change24hPct.toFixed(2)),
          currency,
          currencySymbol,
          fxRateToEur,
          fxVerified,
          isLiveVerified: true,
          dataStatus: 'REALTIME' as DataStatus,
          rsi14: parseFloat(rsi14.toFixed(1)),
          ema20: parseFloat(ema20.toFixed(2)),
          ema50: parseFloat(ema50.toFixed(2)),
          atrPct: parseFloat(atrPct.toFixed(2)),
          momentum6BarsPct: parseFloat(momentum6BarsPct.toFixed(2)),
          score,
          signalStatus,
          setupLabel,
          stopLossPct,
          takeProfitPct,
          stopLossPrice,
          takeProfitPrice,
          breakEvenTriggerPct: 0.8,
          expectedHoldHours: timeframe === '1h' ? '8h - 36h' : '1 - 4 giorni',
          rationale,
          instrument: {
            ...inst,
            currentPrice: parseFloat(livePrice.toFixed(2)),
            change24h: parseFloat(change24hPct.toFixed(2)),
            currency,
            currencySymbol,
          },
        });
      } catch (e) {
        console.warn(`[AIScanner] Errore scansione ${ticker}:`, e);
      }
    })
  );

  opportunities.sort((a, b) => b.score - a.score);

  let aiMarketSummary =
    'Scanner quantitativo su candele storiche reali e chiuse (1h–4h): priorità ai titoli con trend EMA20/50 positivo e RSI controllato, con gestione rigorosa di Stop Loss e cambio valutario live.';

  if (useGeminiAi && process.env.GEMINI_API_KEY && opportunities.length > 0) {
    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });
      const top6 = opportunities.slice(0, 6).map((o) => ({
        ticker: o.ticker,
        price: `${o.currencySymbol}${o.price}`,
        change24h: `${o.change24h}%`,
        rsi14: o.rsi14,
        ema20: o.ema20,
        score: o.score,
        tp: `+${o.takeProfitPct}%`,
        sl: `-${o.stopLossPct}%`,
      }));

      const resp = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Sei un Quantitative Swing Trader istituzionale. Analizza questi 6 titoli scansionati su dati reali di mercato su timeframe ${timeframe}:
${JSON.stringify(top6)}
Fornisci in JSON:
1) "summary": una sintesi operativa chiara (max 2 frasi in italiano) basata esclusivamente sui numeri reali forniti.
2) "insights": array di oggetti { "ticker": string, "comment": string } con 1 frase tattica per ciascuno dei 6 titoli.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              insights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    ticker: { type: Type.STRING },
                    comment: { type: Type.STRING },
                  },
                  required: ['ticker', 'comment'],
                },
              },
            },
            required: ['summary', 'insights'],
          },
        },
      });

      if (resp.text) {
        const parsed = JSON.parse(resp.text);
        if (parsed.summary) aiMarketSummary = parsed.summary;
        if (Array.isArray(parsed.insights)) {
          for (const ins of parsed.insights) {
            const match = opportunities.find((o) => o.ticker === ins.ticker);
            if (match && ins.comment) {
              match.rationale = ins.comment;
            }
          }
        }
      }
    } catch (aiErr: any) {
      console.warn('[AIScanner] Gemini sintesi fallback quantitativo:', aiErr?.message || aiErr);
    }
  }

  return {
    timeframe,
    eurUsdRate: fx.rate,
    fxVerified: fx.isVerified,
    fxStatus: fx.status,
    fxWarning: fx.warning,
    updatedAt: new Date().toISOString(),
    aiMarketSummary,
    topPicks: opportunities.slice(0, 5).map((o) => o.ticker),
    opportunities,
  };
}

app.get('/api/ai/scanner', async (req: Request, res: Response) => {
  try {
    const tfCheck = validateTimeframe(req.query.timeframe || '1h');
    if (!tfCheck.ok) return res.status(400).json({ error: tfCheck.error });
    const tf = tfCheck.value;
    const useAi = req.query.ai === 'true';
    const cacheKey = `ai_scanner_${tf}_${useAi ? 'ai' : 'quant'}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 30_000 && !req.query.force) {
      return res.json({ ...cached.data, _cached: true });
    }
    const payload = await runAiDynamicScanner(tf, useAi);
    cache.set(cacheKey, { timestamp: Date.now(), data: payload });
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Errore scanner AI' });
  }
});

app.post(
  '/api/ai/scanner',
  mutationRateLimiter,
  requireAuth(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const tfCheck = validateTimeframe(req.body?.timeframe || '1h');
      if (!tfCheck.ok) return res.status(400).json({ error: tfCheck.error });
      const tf = tfCheck.value;
      const useAi = Boolean(req.body?.useAi ?? true);
      const payload = await runAiDynamicScanner(tf, useAi);
      cache.set(`ai_scanner_${tf}_quant`, { timestamp: Date.now(), data: payload });
      res.json(payload);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Errore scanner AI' });
    }
  }
);

// -------------------------------------------------------------
// Saved Strategy Presets Persistence Routes (Owner-Scoped & Authenticated)
// -------------------------------------------------------------
app.get('/api/saved-strategies', async (req: Request, res: Response) => {
  try {
    const authUser = await resolveRequestAuth(req);
    const presets = serverSavedStrategyService.getAll(authUser?.uid, authUser?.isAdmin);
    res.json({ presets });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to fetch saved strategies' });
  }
});

app.post(
  '/api/saved-strategies',
  mutationRateLimiter,
  requireAuth(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const preset = req.body;
      if (!preset || !preset.id || !preset.name || !preset.strategyId) {
        return res.status(400).json({ error: 'Preset incompleto' });
      }
      const idCheck = validateSafeId(preset.id, 'presetId');
      if (!idCheck.ok) return res.status(400).json({ error: idCheck.error });

      const saved = await serverSavedStrategyService.save(
        { ...preset, id: idCheck.value },
        req.authUser?.uid
      );
      res.status(201).json({ preset: saved });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to save preset' });
    }
  }
);

app.delete(
  '/api/saved-strategies/:id',
  mutationRateLimiter,
  requireAuth(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const idCheck = validateSafeId(req.params.id, 'presetId');
      if (!idCheck.ok) return res.status(400).json({ error: idCheck.error });

      const result = await serverSavedStrategyService.delete(
        idCheck.value,
        req.authUser?.uid,
        req.authUser?.isAdmin
      );
      if (!result.ok) {
        const code = result.error?.includes('Permessi') ? 403 : 404;
        return res.status(code).json({ success: false, error: result.error });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to delete preset' });
    }
  }
);

// -------------------------------------------------------------
// Autonomous AI Portfolio Manager & Live Web Briefing Routes
// -------------------------------------------------------------
app.get('/api/ai/state', async (req: Request, res: Response) => {
  try {
    if (
      req.query.refreshSnapshot === 'true' ||
      aiAutopilotService.getState().marketSnapshot.length === 0
    ) {
      await aiAutopilotService.refreshVerifiedMarketSnapshot();
    }
    res.json(aiAutopilotService.getState());
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Errore stato AI' });
  }
});

app.post(
  '/api/ai/autopilot/run',
  mutationRateLimiter,
  requireAuth(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const refreshWeb = req.body?.refreshWeb !== false;
      const result = await aiAutopilotService.runAutonomousDecisionCycle({
        trigger: 'USER',
        refreshWeb,
      });
      res.json({
        ...result,
        state: aiAutopilotService.getState(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Errore durante il ciclo decisionale AI' });
    }
  }
);

app.post(
  '/api/ai/autopilot/config',
  mutationRateLimiter,
  requireAuth(),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body || {};
      if (body.maxOpenPositions !== undefined) {
        const c = validateFiniteNumber(body.maxOpenPositions, 'maxOpenPositions', 1, 15);
        if (!c.ok) return res.status(400).json({ error: c.error });
      }
      if (body.defaultStopLossPct !== undefined) {
        const c = validateFiniteNumber(body.defaultStopLossPct, 'defaultStopLossPct', 0.5, 5);
        if (!c.ok) return res.status(400).json({ error: c.error });
      }
      if (body.defaultTakeProfitPct !== undefined) {
        const c = validateFiniteNumber(body.defaultTakeProfitPct, 'defaultTakeProfitPct', 1, 15);
        if (!c.ok) return res.status(400).json({ error: c.error });
      }
      const config = aiAutopilotService.updateConfig(body);
      res.json({ config });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Configurazione non valida' });
    }
  }
);

app.post(
  '/api/ai/briefing/refresh',
  mutationRateLimiter,
  requireAuth(),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const briefing = await aiAutopilotService.refreshWebMarketBriefing();
      res.json({ briefing, state: aiAutopilotService.getState() });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Errore aggiornamento notizie mercati' });
    }
  }
);

app.post(
  '/api/ai/execute-manual-trade',
  mutationRateLimiter,
  requireAuth(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ticker, stopLossPct, takeProfitPct, allocationEur } = req.body || {};
      const tickerCheck = validateTicker(ticker);
      if (!tickerCheck.ok) {
        return res.status(400).json({ error: tickerCheck.error });
      }
      const cleanTicker = tickerCheck.value;

      if (stopLossPct !== undefined) {
        const c = validateFiniteNumber(stopLossPct, 'stopLossPct', 0.5, 5);
        if (!c.ok) return res.status(400).json({ error: c.error });
      }
      if (takeProfitPct !== undefined) {
        const c = validateFiniteNumber(takeProfitPct, 'takeProfitPct', 1, 15);
        if (!c.ok) return res.status(400).json({ error: c.error });
      }
      if (allocationEur !== undefined) {
        const c = validateFiniteNumber(allocationEur, 'allocationEur', 150, 100_000);
        if (!c.ok) return res.status(400).json({ error: c.error });
      }

      // Always re-verify the live exchange quote + FX directly on the server before executing!
      const freshSnapshots = await aiAutopilotService.refreshVerifiedMarketSnapshot();
      const snap = freshSnapshots.find((s) => s.ticker === cleanTicker);

      if (!snap || !snap.isLiveVerified || snap.price <= 0) {
        return res.status(503).json({
          error: `Quotazione reale non disponibile al momento per ${cleanTicker}. Ordine rifiutato per sicurezza.`,
        });
      }
      if (!Number.isFinite(snap.fxRateToEur) || snap.fxRateToEur <= 0) {
        return res.status(503).json({
          error: `Cambio reale ${snap.currency}/EUR non verificabile: ordine su ${cleanTicker} rifiutato.`,
        });
      }

      const result = await serverPaperTradingEngine.executeAiOpenPosition({
        ticker: snap.ticker,
        name: snap.name,
        verifiedPrice: snap.price,
        currency: snap.currency,
        currencySymbol: snap.currencySymbol,
        fxRateToEur: snap.fxRateToEur,
        stopLossPct: Number(stopLossPct) || snap.suggestedStopLossPct,
        takeProfitPct: Number(takeProfitPct) || snap.suggestedTakeProfitPct,
        allocationEur: Number(allocationEur) || 1400,
        reason: `Ordine manuale verificato lato server (${snap.currencySymbol}${snap.price}, RSI ${snap.rsi14}, EMA20 ${snap.currencySymbol}${snap.ema20})`,
        maxPositions: aiAutopilotService.getState().config.maxOpenPositions,
      });

      if (!result.ok) {
        return res.status(400).json({ error: result.message });
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Errore esecuzione ordine' });
    }
  }
);

// -------------------------------------------------------------
// Vite Middleware / Static Server
// -------------------------------------------------------------
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vitePromise = (async () => {
      const { createServer: createViteServer } = await import('vite');
      return createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: 'spa',
      });
    })();

    app.use(async (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QuantLab Full-Stack Server active on http://0.0.0.0:${PORT}`);
  });

  serverSavedStrategyService.init().catch((err) => {
    console.warn('[ServerSavedStrategyService] Init warning:', err?.message || err);
  });

  serverPaperTradingEngine.init().catch((err) => {
    console.warn('[PaperTradingServerEngine] Init warning:', err?.message || err);
  });

  aiAutopilotService.init().catch((err) => {
    console.warn('[AiAutopilotService] Init warning:', err?.message || err);
  });
}

start().catch((err) => {
  console.error('Fatal server startup error:', err);
});
