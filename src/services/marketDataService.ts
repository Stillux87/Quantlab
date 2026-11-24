/**
 * QuantLab - Real Market Data Client Service
 * Interacts with the backend proxy to fetch real Yahoo Finance / Exchange data
 */
import { Instrument, Timeframe, Bar } from '../types';
import { isRangeOverTwoYears } from '../components/DateRangeSelector';

export interface MarketHistoryResponse {
  ticker: string;
  currency: string;
  currentPrice: number;
  timeframe: Timeframe;
  barsCount: number;
  startDate: string;
  endDate: string;
  bars: Bar[];
  isRealData: boolean;
  autoAdjustedTimeframe?: Timeframe;
  autoAdjustmentNote?: string;
  source: string;
}

export interface LiveQuote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change24hAmount: number;
  change24h: number;
  currency: string;
  currencySymbol: string;
  high24h: number;
  low24h: number;
  volume24h: number;
  exchange: string;
  lastUpdated: string;
}

/**
 * Resilient fetch with automatic retries and exponential backoff
 */
async function fetchWithRetry(url: string, maxRetries = 2, delayMs = 600): Promise<Response> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
      if (res.status >= 500 && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }
      return res;
    } catch (err: any) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

/**
 * Fetch real market historical bars for backtesting.
 * STRICT ENFORCEMENT: Never produces synthetic data for real market tickers.
 * If range spans more than 2 years, automatically requests 1D (Daily) to guarantee real quotes.
 */
export async function fetchRealHistoricalBars(
  instrument: Instrument,
  timeframe: Timeframe,
  startDate?: string,
  endDate?: string
): Promise<{
  bars: Bar[];
  isRealData: boolean;
  realPrice?: number;
  realChange?: number;
  autoAdjustedTimeframe?: Timeframe;
  autoAdjustmentNote?: string;
}> {
  // If date range is > 2 years, intraday data cannot exist in real market feeds. Force 1D.
  let requestedTf = timeframe;
  let clientAdjustmentNote: string | undefined;

  if (isRangeOverTwoYears(startDate, endDate) && timeframe !== '1D') {
    requestedTf = '1D';
    clientAdjustmentNote =
      'Periodo oltre 2 anni selezionato: timeframe impostato automaticamente a 1D (giornaliero) per garantire l\'esclusivo utilizzo di dati storici reali ed escludere qualsiasi serie sintetica.';
  }

  try {
    const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
    let url = `${baseUrl}/api/market/history?ticker=${encodeURIComponent(instrument.ticker)}&timeframe=${requestedTf}`;
    if (startDate) url += `&startDate=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&endDate=${encodeURIComponent(endDate)}`;

    let res = await fetchWithRetry(url, 2, 500);

    // If failed on intraday, attempt immediate fallback to 1D (Daily)
    if (!res.ok && requestedTf !== '1D') {
      console.warn(`[MarketDataService] Ticker ${instrument.ticker} non reperibile su ${requestedTf}. Riprovo su 1D (Daily) reale.`);
      requestedTf = '1D';
      clientAdjustmentNote =
        'Dati intraday non disponibili per l\'intervallo richiesto: timeframe regolato su 1D per garantire dati storici reali.';
      let retryUrl = `${baseUrl}/api/market/history?ticker=${encodeURIComponent(instrument.ticker)}&timeframe=1D`;
      if (startDate) retryUrl += `&startDate=${encodeURIComponent(startDate)}`;
      if (endDate) retryUrl += `&endDate=${encodeURIComponent(endDate)}`;
      res = await fetchWithRetry(retryUrl, 2, 600);
    }

    if (res.ok) {
      const data: MarketHistoryResponse = await res.json();

      if (data && Array.isArray(data.bars) && data.bars.length >= 5) {
        const lastBar = data.bars[data.bars.length - 1];
        const prevBar = data.bars.length > 1 ? data.bars[data.bars.length - 2] : lastBar;
        const realPrice = data.currentPrice || lastBar.close;
        const changeAmt = realPrice - prevBar.close;
        const changePct = prevBar.close > 0 ? (changeAmt / prevBar.close) * 100 : 0;

        return {
          bars: data.bars,
          isRealData: data.isRealData ?? true,
          realPrice: parseFloat(realPrice.toFixed(4)),
          realChange: parseFloat(changePct.toFixed(2)),
          autoAdjustedTimeframe: data.autoAdjustedTimeframe || (requestedTf !== timeframe ? '1D' : undefined),
          autoAdjustmentNote: data.autoAdjustmentNote || clientAdjustmentNote,
        };
      }
    }
  } catch (err) {
    console.warn(`[MarketDataService] Avviso recupero dati storici per ${instrument.ticker}:`, (err as any)?.message || err);
  }

  // Strict Real-Data Policy: never fabricate synthetic bars when exchange feed is unreachable
  return {
    bars: [],
    isRealData: false,
    autoAdjustedTimeframe: requestedTf !== timeframe ? '1D' : undefined,
    autoAdjustmentNote:
      clientAdjustmentNote ||
      'Feed storico reale momentaneamente non raggiungibile. Nessuna serie sintetica è stata generata.',
  };
}

/**
 * Fetch real-time quote for a single instrument
 */
export async function fetchLiveQuote(ticker: string): Promise<LiveQuote | null> {
  const tickerUpper = (ticker || '').toUpperCase();
  if (!tickerUpper || tickerUpper === 'PORTFOLIO' || tickerUpper.startsWith('PORT_') || tickerUpper.startsWith('PORTFOLIO_')) {
    return null;
  }

  try {
    const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
    const res = await fetchWithRetry(`${baseUrl}/api/market/quote?ticker=${encodeURIComponent(ticker)}`, 1, 400);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[MarketDataService] Quote non disponibile per ${ticker}:`, (err as any)?.message || err);
    return null;
  }
}

/**
 * Search real tickers across global exchanges
 */
export async function searchRealTickers(query: string): Promise<Array<{
  symbol: string;
  name: string;
  exchange: string;
  type: 'ETF' | 'STOCK';
  sector: string;
}>> {
  try {
    const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/market/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.warn('[MarketDataService] Search failed:', err);
    return [];
  }
}
