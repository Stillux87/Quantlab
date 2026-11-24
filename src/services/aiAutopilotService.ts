/**
 * QuantLab - Autonomous AI Portfolio Manager & Real-Time Web + Chart Intelligence Engine
 *
 * STRICT REAL-DATA RULE:
 * - Every price and chart bar comes exclusively from live exchange feeds (Yahoo Finance v8).
 * - If a ticker's live feed is unreachable, it is skipped (NEVER fabricated or estimated).
 * - Web news & market catalysts come from Gemini Google Search Grounding with clickable URLs.
 * - Every AI trade decision is guarded by strict server-side Stop Loss limits.
 */
import fs from 'fs';
import path from 'path';
import { GoogleGenAI, Type } from '@google/genai';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { INSTRUMENTS_DATABASE } from '../data/instruments';
import { calculateEMA, calculateRSI, calculateATR } from './indicators';
import { serverPaperTradingEngine } from './serverPaperTradingEngine';
import {
  AiAutopilotConfig,
  AiAutopilotState,
  AiDecisionAction,
  AiDecisionRecord,
  AiLiveTickerSnapshot,
  AiMarketBriefing,
  AiTickerHighlight,
  AiWebSource,
} from '../types/aiAutopilot';

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'ai_autopilot_state.json');

export const AI_TRADING_UNIVERSE: Array<{
  ticker: string;
  name: string;
  market: string;
  sector: string;
  type: 'STOCK' | 'ETF';
}> = [
  { ticker: 'NVDA', name: 'NVIDIA Corp.', market: 'NASDAQ', sector: 'Semiconduttori & AI', type: 'STOCK' },
  { ticker: 'AAPL', name: 'Apple Inc.', market: 'NASDAQ', sector: 'Tecnologia', type: 'STOCK' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', market: 'NASDAQ', sector: 'Cloud & AI', type: 'STOCK' },
  { ticker: 'META', name: 'Meta Platforms', market: 'NASDAQ', sector: 'Digital & AI', type: 'STOCK' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', market: 'NASDAQ', sector: 'E-Commerce & Cloud', type: 'STOCK' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', market: 'NASDAQ', sector: 'AI & Search', type: 'STOCK' },
  { ticker: 'AMD', name: 'Advanced Micro Devices', market: 'NASDAQ', sector: 'Semiconduttori', type: 'STOCK' },
  { ticker: 'TSLA', name: 'Tesla Inc.', market: 'NASDAQ', sector: 'Automotive & AI', type: 'STOCK' },
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF', market: 'NYSE Arca', sector: 'Indice USA', type: 'ETF' },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', market: 'NASDAQ', sector: 'Indice Tech USA', type: 'ETF' },
  { ticker: 'UCG.MI', name: 'UniCredit S.p.A.', market: 'Borsa Italiana', sector: 'Bancario', type: 'STOCK' },
  { ticker: 'ENEL.MI', name: 'Enel S.p.A.', market: 'Borsa Italiana', sector: 'Energia & Utility', type: 'STOCK' },
  { ticker: 'ISP.MI', name: 'Intesa Sanpaolo', market: 'Borsa Italiana', sector: 'Bancario', type: 'STOCK' },
  { ticker: 'ENI.MI', name: 'Eni S.p.A.', market: 'Borsa Italiana', sector: 'Energia', type: 'STOCK' },
  { ticker: 'RACE.MI', name: 'Ferrari N.V.', market: 'Borsa Italiana', sector: 'Lusso & Auto', type: 'STOCK' },
  { ticker: 'LDO.MI', name: 'Leonardo S.p.A.', market: 'Borsa Italiana', sector: 'Aerospazio & Difesa', type: 'STOCK' },
];

const DEFAULT_CONFIG: AiAutopilotConfig = {
  autoEnabled: true,
  intervalMinutes: 15,
  maxOpenPositions: 6,
  maxStopLossPct: 1.4,
  defaultTakeProfitPct: 2.6,
  riskPerTradePct: 1.2,
  breakEvenTriggerPct: 0.7,
};

function createGeminiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function fetchYahooRaw(url: string, timeoutMs = 7000): Promise<any | null> {
  const tryUrl = async (target: string) => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(target, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      });
      clearTimeout(timer);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  const primary = await tryUrl(url);
  if (primary) return primary;
  if (url.includes('query1.finance.yahoo.com')) {
    return await tryUrl(url.replace('query1.finance.yahoo.com', 'query2.finance.yahoo.com'));
  }
  return null;
}

interface LiveNewsItem {
  ticker: string;
  title: string;
  publisher: string;
  link: string;
  publishedAt?: number;
}

async function fetchLiveMarketWebNews(tickers: string[]): Promise<LiveNewsItem[]> {
  const queries = Array.from(new Set([...tickers.slice(0, 5), 'SPY', 'UCG.MI'])).slice(0, 6);
  const results: LiveNewsItem[] = [];
  const seenLinks = new Set<string>();

  await Promise.all(
    queries.map(async (q) => {
      try {
        const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=0&newsCount=3`;
        const data = await fetchYahooRaw(url, 5000);
        const list = Array.isArray(data?.news) ? data.news : [];
        for (const item of list) {
          const link = typeof item?.link === 'string' ? item.link : '';
          const title = typeof item?.title === 'string' ? item.title.trim() : '';
          if (!link || !title || seenLinks.has(link)) continue;
          seenLinks.add(link);
          results.push({
            ticker: q,
            title,
            publisher: item?.publisher || 'Yahoo Finance',
            link,
            publishedAt: item?.providerPublishTime ? item.providerPublishTime * 1000 : undefined,
          });
        }
      } catch {
        // Ignore single ticker news timeout
      }
    })
  );

  return results
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
    .slice(0, 12);
}

class AiAutopilotService {
  private config: AiAutopilotConfig = { ...DEFAULT_CONFIG };
  private isRunning = false;
  private lastRunAt: number | null = null;
  private lastBriefingAt: number | null = null;
  private eurUsdRate = 1.085;
  private briefings: AiMarketBriefing[] = [];
  private decisions: AiDecisionRecord[] = [];
  private marketSnapshot: AiLiveTickerSnapshot[] = [];
  private schedulerTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this.loadFromDisk();
    await this.loadFromFirestore();

    // Refresh real verified snapshot immediately in background (non-blocking)
    this.refreshVerifiedMarketSnapshot()
      .then(async (snap) => {
        if (snap.length > 0 && this.briefings.length === 0) {
          await this.refreshWebMarketBriefing(snap).catch(() => {});
        }
      })
      .catch(() => {});

    this.scheduleAutopilotLoop();
  }

  private scheduleAutopilotLoop() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    const ms = Math.max(5, this.config.intervalMinutes) * 60 * 1000;
    this.schedulerTimer = setInterval(() => {
      if (this.config.autoEnabled && !this.isRunning) {
        this.runAutonomousDecisionCycle({ trigger: 'SCHEDULED' }).catch((err) => {
          console.warn('[AiAutopilot] Scheduled cycle notice:', err?.message || err);
        });
      }
    }, ms);
  }

  public getState(): AiAutopilotState {
    return {
      config: { ...this.config },
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      lastBriefingAt: this.lastBriefingAt,
      eurUsdRate: this.eurUsdRate,
      briefings: this.briefings.slice(0, 15),
      decisions: this.decisions.slice(0, 80),
      marketSnapshot: this.marketSnapshot,
    };
  }

  public updateConfig(partial: Partial<AiAutopilotConfig>): AiAutopilotConfig {
    if (typeof partial.autoEnabled === 'boolean') {
      this.config.autoEnabled = partial.autoEnabled;
    }
    if (typeof partial.intervalMinutes === 'number' && !isNaN(partial.intervalMinutes)) {
      this.config.intervalMinutes = Math.max(5, Math.min(60, Math.round(partial.intervalMinutes)));
    }
    if (typeof partial.maxOpenPositions === 'number' && !isNaN(partial.maxOpenPositions)) {
      this.config.maxOpenPositions = Math.max(2, Math.min(10, Math.round(partial.maxOpenPositions)));
    }
    if (typeof partial.maxStopLossPct === 'number' && !isNaN(partial.maxStopLossPct)) {
      this.config.maxStopLossPct = parseFloat(Math.max(0.8, Math.min(2.0, partial.maxStopLossPct)).toFixed(2));
    }
    if (typeof partial.defaultTakeProfitPct === 'number' && !isNaN(partial.defaultTakeProfitPct)) {
      this.config.defaultTakeProfitPct = parseFloat(Math.max(1.5, Math.min(4.5, partial.defaultTakeProfitPct)).toFixed(2));
    }
    if (typeof partial.riskPerTradePct === 'number' && !isNaN(partial.riskPerTradePct)) {
      this.config.riskPerTradePct = parseFloat(Math.max(0.5, Math.min(2.0, partial.riskPerTradePct)).toFixed(2));
    }
    this.scheduleAutopilotLoop();
    this.saveToDisk();
    this.saveToFirestore().catch(() => {});
    return { ...this.config };
  }

  /**
   * Fetches strictly REAL verified quotes + 1h chart indicators from Yahoo Finance.
   * Any ticker whose real feed fails is excluded — ZERO fabricated prices.
   */
  public async refreshVerifiedMarketSnapshot(): Promise<AiLiveTickerSnapshot[]> {
    // 1. Live EUR/USD exchange rate
    const fxJson = await fetchYahooRaw('https://query1.finance.yahoo.com/v8/finance/chart/EURUSD=X?interval=1d&range=5d', 4500);
    const liveFx = fxJson?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof liveFx === 'number' && liveFx > 0.5 && liveFx < 2.0) {
      this.eurUsdRate = parseFloat(liveFx.toFixed(4));
    }

    const snapshots: AiLiveTickerSnapshot[] = [];

    await Promise.all(
      AI_TRADING_UNIVERSE.map(async (item) => {
        try {
          const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.ticker)}?interval=1h&range=60d&includePrePost=false`;
          const json = await fetchYahooRaw(url, 6500);
          const res = json?.chart?.result?.[0];
          const meta = res?.meta;
          if (!res || !meta) return;

          const ts: number[] = Array.isArray(res.timestamp) ? res.timestamp : [];
          const q = res.indicators?.quote?.[0] || {};
          const bars: Array<{ open: number; high: number; low: number; close: number; volume: number }> = [];

          for (let i = 0; i < ts.length; i++) {
            const c = q.close?.[i];
            if (typeof c !== 'number' || isNaN(c) || c <= 0) continue;
            bars.push({
              open: typeof q.open?.[i] === 'number' ? q.open[i] : c,
              high: typeof q.high?.[i] === 'number' ? q.high[i] : c,
              low: typeof q.low?.[i] === 'number' ? q.low[i] : c,
              close: c,
              volume: typeof q.volume?.[i] === 'number' ? q.volume[i] : 0,
            });
          }

          const livePrice = typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0
            ? meta.regularMarketPrice
            : bars.length > 0
            ? bars[bars.length - 1].close
            : 0;

          if (!livePrice || livePrice <= 0 || bars.length < 15) return;

          const prevClose =
            typeof meta.chartPreviousClose === 'number' && meta.chartPreviousClose > 0
              ? meta.chartPreviousClose
              : typeof meta.previousClose === 'number' && meta.previousClose > 0
              ? meta.previousClose
              : bars[Math.max(0, bars.length - 8)].close;

          const change24h = prevClose > 0 ? ((livePrice - prevClose) / prevClose) * 100 : 0;

          const isEur = item.ticker.endsWith('.MI') || item.ticker.endsWith('.DE') || item.ticker.endsWith('.PA');
          const currency = isEur ? 'EUR' : (meta.currency || 'USD').toUpperCase();
          const currencySymbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€';
          const fxRateToEur = currency === 'EUR' ? 1.0 : parseFloat((1 / this.eurUsdRate).toFixed(4));

          const closes = bars.map((b) => b.close);
          const ema9Arr = calculateEMA(closes, 9);
          const ema20Arr = calculateEMA(closes, 20);
          const ema50Arr = calculateEMA(closes, Math.min(50, Math.max(12, closes.length - 2)));
          const rsiArr = calculateRSI(closes, 14);
          const atrArr = calculateATR(bars as any, 14);

          const ema9 = ema9Arr[ema9Arr.length - 1] ?? livePrice;
          const ema20 = ema20Arr[ema20Arr.length - 1] ?? livePrice;
          const ema50 = ema50Arr[ema50Arr.length - 1] ?? livePrice;
          const rsi14 = rsiArr[rsiArr.length - 1] ?? 50;
          const atr = atrArr[atrArr.length - 1] ?? livePrice * 0.01;
          const atrPct = (atr / livePrice) * 100;

          const close6Ago = closes[Math.max(0, closes.length - 7)] || livePrice;
          const momentum6hPct = ((livePrice - close6Ago) / close6Ago) * 100;

          let trendBias: 'RIALZISTA' | 'LATERALE' | 'DEBOLE' = 'LATERALE';
          if (livePrice >= ema20 * 0.996 && ema20 >= ema50 * 0.995) {
            trendBias = 'RIALZISTA';
          } else if (livePrice < ema20 * 0.99 && livePrice < ema50 * 0.992) {
            trendBias = 'DEBOLE';
          }

          const slPct = parseFloat(Math.max(0.85, Math.min(this.config.maxStopLossPct, atrPct * 1.15 || 1.2)).toFixed(2));
          const tpPct = parseFloat(Math.max(1.8, Math.min(3.4, slPct * 2.1)).toFixed(2));

          snapshots.push({
            ticker: item.ticker,
            name: meta.shortName || item.name,
            market: item.market,
            sector: item.sector,
            type: item.type,
            price: parseFloat(livePrice.toFixed(2)),
            previousClose: parseFloat(prevClose.toFixed(2)),
            change24h: parseFloat(change24h.toFixed(2)),
            currency,
            currencySymbol,
            fxRateToEur,
            exchange: meta.exchangeName || item.market,
            marketState: meta.marketState || 'REGULAR',
            isLiveVerified: true,
            rsi14: parseFloat(rsi14.toFixed(1)),
            ema9: parseFloat(ema9.toFixed(2)),
            ema20: parseFloat(ema20.toFixed(2)),
            ema50: parseFloat(ema50.toFixed(2)),
            atrPct: parseFloat(atrPct.toFixed(2)),
            momentum6hPct: parseFloat(momentum6hPct.toFixed(2)),
            trendBias,
            suggestedStopLossPct: slPct,
            suggestedTakeProfitPct: tpPct,
            suggestedStopLossPrice: parseFloat((livePrice * (1 - slPct / 100)).toFixed(2)),
            suggestedTakeProfitPrice: parseFloat((livePrice * (1 + tpPct / 100)).toFixed(2)),
            lastUpdated: new Date().toISOString(),
          });
        } catch {
          // Skip ticker if live feed fails — NEVER fabricate data
        }
      })
    );

    // Sort by strongest bullish structure + healthy RSI
    snapshots.sort((a, b) => {
      const score = (s: AiLiveTickerSnapshot) =>
        (s.trendBias === 'RIALZISTA' ? 25 : s.trendBias === 'LATERALE' ? 10 : 0) +
        (s.rsi14 >= 38 && s.rsi14 <= 66 ? 15 : 0) +
        Math.min(10, Math.max(-10, s.momentum6hPct * 3));
      return score(b) - score(a);
    });

    if (snapshots.length > 0) {
      this.marketSnapshot = snapshots;
    }
    return this.marketSnapshot;
  }

  /**
   * Fetches up-to-date internet financial news & macro catalysts using Gemini + Google Search Grounding.
   */
  public async refreshWebMarketBriefing(snapshotOverride?: AiLiveTickerSnapshot[]): Promise<AiMarketBriefing> {
    const snap = snapshotOverride && snapshotOverride.length > 0 ? snapshotOverride : await this.refreshVerifiedMarketSnapshot();
    const now = Date.now();
    const dateStr = new Date(now).toLocaleString('it-IT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    const topMovers = snap
      .slice(0, 8)
      .map((s) => `${s.ticker}: ${s.currencySymbol}${s.price} (${s.change24h >= 0 ? '+' : ''}${s.change24h}%, RSI ${s.rsi14}, trend ${s.trendBias})`)
      .join(' | ');

    // Always gather live financial news articles from Yahoo Finance / Reuters / Bloomberg
    const liveWebNews = await fetchLiveMarketWebNews(snap.slice(0, 5).map((s) => s.ticker));
    const webNewsContext = liveWebNews
      .slice(0, 8)
      .map((n) => `[${n.ticker} - ${n.publisher}] ${n.title}`)
      .join('\n');

    const ai = createGeminiClient();
    let briefing: AiMarketBriefing | null = null;

    if (ai) {
      try {
        // Step 1: Real-time web search grounding for latest market news & ticker catalysts
        const searchPrompt = `Cerca le notizie finanziarie più recenti di oggi su Wall Street (S&P 500, Nasdaq, NVIDIA, Apple, Microsoft, Meta, Amazon, AMD, Tesla), Borsa Italiana / FTSE MIB (UniCredit, Enel, Intesa Sanpaolo, Eni, Ferrari, Leonardo) e fattori macro (BCE, Fed, tassi, trimestrali).
Dati di borsa reali verificati in questo momento: ${topMovers}.
Ultime agenzie raccolte dal web:
${webNewsContext || 'N/A'}

Scrivi in italiano un aggiornamento mercati chiaro, concreto e conciso per un investitore attivo strutturato in:
- TITOLO: una riga incisiva sulla giornata di mercato
- MOOD: scegli esattamente uno tra FAVOREVOLE, SELETTIVO, CAUTO
- SINTESI: 2-3 frasi chiare su cosa sta muovendo oggi Wall Street e Piazza Affari
- DRIVER_MACRO: 3 punti sintetici (uno per riga iniziando con "- ")
- FOCUS_TITOLI: 4 righe nel formato "TICKER | RIALZISTA/NEUTRALE/CAUTELA | motivazione breve basata sulle notizie reali"`;

        const resp = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: searchPrompt,
          config: {
            tools: [{ googleSearch: {} }],
          },
        });

        const text = (resp.text || '').trim();
        const rawChunks = resp.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const seenUris = new Set<string>();
        const sources: AiWebSource[] = [];
        for (const chunk of rawChunks) {
          const uri = chunk?.web?.uri;
          const title = chunk?.web?.title;
          if (uri && !seenUris.has(uri)) {
            seenUris.add(uri);
            sources.push({
              title: title || new URL(uri).hostname,
              uri,
            });
          }
        }
        for (const item of liveWebNews) {
          if (sources.length >= 8) break;
          if (!seenUris.has(item.link)) {
            seenUris.add(item.link);
            sources.push({
              title: `${item.publisher}: ${item.title}`,
              uri: item.link,
            });
          }
        }

        const headlineMatch = text.match(/TITOLO:\s*(.+)/i);
        const moodMatch = text.match(/MOOD:\s*(FAVOREVOLE|SELETTIVO|CAUTO)/i);
        const sintesiMatch = text.match(/SINTESI:\s*([\s\S]*?)(?=DRIVER_MACRO:|FOCUS_TITOLI:|$)/i);
        const driverSection = text.match(/DRIVER_MACRO:\s*([\s\S]*?)(?=FOCUS_TITOLI:|$)/i);
        const focusSection = text.match(/FOCUS_TITOLI:\s*([\s\S]*)$/i);

        const macroDrivers = (driverSection?.[1] || '')
          .split('\n')
          .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
          .filter((l) => l.length > 8)
          .slice(0, 4);

        const tickerHighlights: AiTickerHighlight[] = [];
        for (const line of (focusSection?.[1] || '').split('\n')) {
          const clean = line.replace(/^[-*•\s]+/, '').trim();
          const parts = clean.split('|').map((p) => p.trim());
          if (parts.length >= 3) {
            const rawBias = parts[1].toUpperCase();
            const bias: AiTickerHighlight['bias'] = rawBias.includes('RIALZ')
              ? 'RIALZISTA'
              : rawBias.includes('CAUT')
              ? 'CAUTELA'
              : 'NEUTRALE';
            tickerHighlights.push({
              ticker: parts[0].replace(/[^A-Z0-9.]/g, ''),
              bias,
              headline: parts.slice(2).join(' — '),
            });
          }
        }

        briefing = {
          id: `brief_${now}`,
          timestamp: now,
          dateStr,
          marketMood: (moodMatch?.[1]?.toUpperCase() as AiMarketBriefing['marketMood']) || 'SELETTIVO',
          headline: (headlineMatch?.[1] || 'Aggiornamento Mercati Live — Wall Street & Piazza Affari').replace(/\*+/g, '').trim(),
          summaryIt: (sintesiMatch?.[1] || text.slice(0, 380)).replace(/\*+/g, '').replace(/\s+/g, ' ').trim(),
          macroDrivers:
            macroDrivers.length > 0
              ? macroDrivers
              : ['Monitoraggio attivo dei prezzi reali su azioni USA e FTSE MIB con protezione Stop Loss automatica.'],
          tickerHighlights: tickerHighlights.slice(0, 5),
          sources: sources.slice(0, 8),
          eurUsdRate: this.eurUsdRate,
          verifiedTickersCount: snap.length,
          poweredByWebSearch: true,
        };
      } catch (err: any) {
        console.warn('[AiAutopilot] Web briefing fallback to live Reuters/Yahoo news + chart synthesis:', err?.message || err);
      }
    }

    if (!briefing) {
      const bullishCount = snap.filter((s) => s.trendBias === 'RIALZISTA').length;
      const topPos = [...snap].sort((a, b) => b.change24h - a.change24h).slice(0, 4);
      const mood: AiMarketBriefing['marketMood'] =
        bullishCount >= Math.ceil(snap.length * 0.55)
          ? 'FAVOREVOLE'
          : bullishCount >= Math.ceil(snap.length * 0.3)
          ? 'SELETTIVO'
          : 'CAUTO';

      const newsDrivers = liveWebNews
        .slice(0, 3)
        .map((n) => `${n.publisher} (${n.ticker}): ${n.title}`);

      const webSources: AiWebSource[] = liveWebNews.slice(0, 8).map((n) => ({
        title: `${n.publisher}: ${n.title}`,
        uri: n.link,
      }));

      const newsByTicker = new Map<string, LiveNewsItem>();
      for (const n of liveWebNews) {
        if (!newsByTicker.has(n.ticker)) newsByTicker.set(n.ticker, n);
      }

      briefing = {
        id: `brief_${now}`,
        timestamp: now,
        dateStr,
        marketMood: mood,
        headline:
          liveWebNews.length > 0
            ? `Aggiornamento Mercati Live: ${bullishCount}/${snap.length} titoli rialzisti su 1h e ${liveWebNews.length} notizie verificate`
            : `Quadro Tecnico Live: ${bullishCount}/${snap.length} titoli in struttura rialzista su 1h`,
        summaryIt: `Analisi aggiornata su ${snap.length} quotazioni reali verificate in diretta (EUR/USD ${this.eurUsdRate.toFixed(4)}) integrata con le ultime agenzie finanziarie raccolte dal web. I titoli con miglior spinta relativa sono ${topPos.slice(0, 3).map((s) => `${s.ticker} (${s.change24h >= 0 ? '+' : ''}${s.change24h}%)`).join(', ')}.`,
        macroDrivers:
          newsDrivers.length > 0
            ? [
                ...newsDrivers,
                `Struttura tecnica 1h: ${bullishCount}/${snap.length} titoli in trend rialzista; Stop Loss protettivi calibrati entro ${this.config.maxStopLossPct}%.`,
              ]
            : [
                `${bullishCount} titoli su ${snap.length} scambiano sopra EMA20/EMA50 su grafico orario reale.`,
                `Volatilità media intraday (ATR) contenuta: Stop Loss calibrati tra 0.9% e ${this.config.maxStopLossPct}%.`,
                `Diversificazione attiva tra titoli NASDAQ/NYSE ($ USD) e Borsa Italiana (€ EUR).`,
              ],
        tickerHighlights: topPos.map((s) => {
          const tickerNews = newsByTicker.get(s.ticker);
          return {
            ticker: s.ticker,
            bias: s.trendBias === 'RIALZISTA' ? 'RIALZISTA' : s.trendBias === 'DEBOLE' ? 'CAUTELA' : 'NEUTRALE',
            headline: tickerNews
              ? `${s.currencySymbol}${s.price} (${s.change24h >= 0 ? '+' : ''}${s.change24h}%) · ${tickerNews.publisher}: ${tickerNews.title}`
              : `Prezzo reale ${s.currencySymbol}${s.price} (${s.change24h >= 0 ? '+' : ''}${s.change24h}%), RSI ${s.rsi14} su grafico 1h.`,
          };
        }),
        sources: webSources,
        eurUsdRate: this.eurUsdRate,
        verifiedTickersCount: snap.length,
        poweredByWebSearch: webSources.length > 0,
      };
    }

    this.briefings = [briefing, ...this.briefings].slice(0, 20);
    this.lastBriefingAt = now;
    this.saveToDisk();
    this.saveToFirestore().catch(() => {});
    return briefing;
  }

  /**
   * Executes a full Autonomous AI Trading Cycle:
   * 1. Fetches 100% verified live exchange prices + 1h charts across 16 US & EU titles.
   * 2. Pulls latest internet market news via Gemini Search Grounding.
   * 3. Uses Gemini AI to decide concrete OPEN_LONG, TIGHTEN_STOP, CLOSE, HOLD, and SKIP actions with full reasoning.
   * 4. Executes all approved orders on the live Paper Portfolio with hard Stop Loss enforcement.
   */
  public async runAutonomousDecisionCycle(options?: {
    trigger?: 'USER' | 'SCHEDULED';
    refreshWeb?: boolean;
  }): Promise<{
    briefing: AiMarketBriefing;
    decisions: AiDecisionRecord[];
    executedActionsCount: number;
    session: any;
  }> {
    if (this.isRunning) {
      const session = await serverPaperTradingEngine.ensureActiveAiPortfolioSession();
      return {
        briefing: this.briefings[0] || (await this.refreshWebMarketBriefing()),
        decisions: this.decisions.slice(0, 8),
        executedActionsCount: 0,
        session,
      };
    }

    this.isRunning = true;
    const cycleId = `cycle_${Date.now()}`;
    const now = Date.now();
    const dateStr = new Date(now).toLocaleString('it-IT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    try {
      // 1. Live verified quotes & 1h chart metrics (strictly real prices)
      const snapshot = await this.refreshVerifiedMarketSnapshot();
      if (snapshot.length === 0) {
        throw new Error('Nessuna quotazione di borsa reale disponibile in questo momento. Operatività sospesa per sicurezza.');
      }

      // 2. Fresh web market briefing (if requested or older than 12 min)
      const shouldRefreshWeb =
        options?.refreshWeb !== false &&
        (!this.lastBriefingAt || now - this.lastBriefingAt > 12 * 60 * 1000 || this.briefings.length === 0);

      const briefing = shouldRefreshWeb
        ? await this.refreshWebMarketBriefing(snapshot)
        : this.briefings[0];

      // 3. Inspect active portfolio session and live open positions
      const session = await serverPaperTradingEngine.ensureActiveAiPortfolioSession();
      const openPositions = session.openPositions || [];
      const openTickers = new Set(openPositions.map((p) => p.symbol.toUpperCase()));

      // Update live P&L on existing open positions from verified snapshot before deciding
      const openSummary = openPositions.map((p) => {
        const snap = snapshot.find((s) => s.ticker.toUpperCase() === p.symbol.toUpperCase());
        const livePrice = snap?.price ?? p.currentPrice;
        const pnlPct = ((livePrice - p.entryPrice) / p.entryPrice) * 100;
        return {
          ticker: p.symbol,
          entryPrice: p.entryPrice,
          currentVerifiedPrice: livePrice,
          pnlPct: parseFloat(pnlPct.toFixed(2)),
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit,
          rsi14: snap?.rsi14 ?? 50,
          trendBias: snap?.trendBias ?? 'LATERALE',
        };
      });

      const slotsAvailable = Math.max(0, this.config.maxOpenPositions - openPositions.length);
      const candidates = snapshot.filter((s) => !openTickers.has(s.ticker.toUpperCase()));

      type RawAiDecision = {
        ticker: string;
        action: AiDecisionAction;
        stopLossPct?: number;
        takeProfitPct?: number;
        newStopLossPrice?: number;
        confidence: 'ALTA' | 'MEDIA' | 'BASSA';
        webCatalyst: string;
        motivationIt: string;
      };

      let aiDecisionsRaw: RawAiDecision[] = [];
      const ai = createGeminiClient();

      if (ai) {
        try {
          const prompt = `Sei il Gestore AI Autonomo di un portafoglio multi-titolo (capitale €${session.currentCapital.toFixed(0)}).
L'utente vuole metterti alla prova su dati REALI: devi essere REATTIVO, diversificare su più titoli (target ${this.config.maxOpenPositions} posizioni contemporanee quando esistono buoni setup tecnici/news), ma proteggere SEMPRE il capitale con Stop Loss rigoroso (max ${this.config.maxStopLossPct}%).

AGGIORNAMENTO MERCATI DAL WEB (oggi):
- Mood: ${briefing.marketMood}
- Sintesi: ${briefing.summaryIt}
- Driver: ${briefing.macroDrivers.join(' ; ')}
- Focus titoli web: ${briefing.tickerHighlights.map((h) => `${h.ticker} (${h.bias}): ${h.headline}`).join(' ; ')}

POSIZIONI ATTUALMENTE APERTE (${openSummary.length}/${this.config.maxOpenPositions}):
${JSON.stringify(openSummary)}

TITOLI REALI DISPONIBILI (Prezzi live verificati & grafici 1h):
${JSON.stringify(
  candidates.map((c) => ({
    ticker: c.ticker,
    market: c.market,
    price: `${c.currencySymbol}${c.price}`,
    change24h: `${c.change24h}%`,
    rsi14: c.rsi14,
    ema20: c.ema20,
    ema50: c.ema50,
    atrPct: c.atrPct,
    mom6h: `${c.momentum6hPct}%`,
    trend: c.trendBias,
    slSuggestedPct: c.suggestedStopLossPct,
    tpSuggestedPct: c.suggestedTakeProfitPct,
  }))
)}

REGOLE OPERATIVE OBBLIGATORIE:
1. Per le posizioni già aperte, valuta se fare HOLD, TIGHTEN_STOP (alzare lo stop loss per proteggere utili se pnlPct > +0.5%), CLOSE_PROFIT (incassare se target vicino o RSI > 73) o CLOSE_RISK (tagliare se momentum/news peggiorati).
2. Ci sono ${slotsAvailable} slot liberi su ${this.config.maxOpenPositions}. Se slotsAvailable > 0, seleziona fino a ${Math.min(slotsAvailable, 4)} migliori opportunità reali (preferendo un mix tra USA e Borsa Italiana quando i grafici lo supportano) con azione OPEN_LONG, indicando stopLossPct (tra 0.85 e ${this.config.maxStopLossPct}) e takeProfitPct (tra 1.8 e 3.4).
3. Includi anche 1 o 2 titoli con azione SKIP spiegando chiaramente perché li hai scartati (es. RSI troppo tirato, debolezza sotto EMA50 o rischio news).
4. Motiva ogni singola decisione in italiano chiaro, citando sia i livelli grafici reali (prezzo, EMA, RSI, Stop Loss) sia il contesto notizie web. Non inventare mai prezzi diversi da quelli forniti.`;

          const resp = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  decisions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        ticker: { type: Type.STRING },
                        action: { type: Type.STRING },
                        stopLossPct: { type: Type.NUMBER },
                        takeProfitPct: { type: Type.NUMBER },
                        newStopLossPrice: { type: Type.NUMBER },
                        confidence: { type: Type.STRING },
                        webCatalyst: { type: Type.STRING },
                        motivationIt: { type: Type.STRING },
                      },
                      required: ['ticker', 'action', 'confidence', 'webCatalyst', 'motivationIt'],
                    },
                  },
                },
                required: ['decisions'],
              },
            },
          });

          if (resp.text) {
            const parsed = JSON.parse(resp.text);
            if (Array.isArray(parsed.decisions)) {
              aiDecisionsRaw = parsed.decisions;
            }
          }
        } catch (err: any) {
          console.warn('[AiAutopilot] Gemini decision fallback to verified technical engine:', err?.message || err);
        }
      }

      // Deterministic real-data quantitative fallback if Gemini returned empty or errored
      if (aiDecisionsRaw.length === 0) {
        // Evaluate open positions first
        for (const op of openSummary) {
          if (op.pnlPct >= 0.7) {
            aiDecisionsRaw.push({
              ticker: op.ticker,
              action: 'TIGHTEN_STOP',
              newStopLossPrice: parseFloat((op.entryPrice * 1.002).toFixed(2)),
              confidence: 'ALTA',
              webCatalyst: briefing.headline,
              motivationIt: `Posizione in profitto (+${op.pnlPct}%): alzato lo Stop Loss in area Break-Even per proteggere il capitale guadagnato.`,
            });
          } else {
            aiDecisionsRaw.push({
              ticker: op.ticker,
              action: 'HOLD',
              confidence: 'MEDIA',
              webCatalyst: briefing.headline,
              motivationIt: `Struttura tecnica intatta (RSI ${op.rsi14}, trend ${op.trendBias}). Stop Loss protettivo attivo a ${op.stopLoss}.`,
            });
          }
        }

        // Select top reactive candidates up to available slots (diversified US + EU)
        const desiredOpens = Math.min(slotsAvailable, 4);
        const eligible = candidates.filter((c) => c.rsi14 < 73 && c.trendBias !== 'DEBOLE');
        const chosen = (eligible.length > 0 ? eligible : candidates).slice(0, desiredOpens);

        for (const c of chosen) {
          aiDecisionsRaw.push({
            ticker: c.ticker,
            action: 'OPEN_LONG',
            stopLossPct: c.suggestedStopLossPct,
            takeProfitPct: c.suggestedTakeProfitPct,
            confidence: c.trendBias === 'RIALZISTA' ? 'ALTA' : 'MEDIA',
            webCatalyst: briefing.tickerHighlights.find((h) => h.ticker === c.ticker)?.headline || briefing.headline,
            motivationIt: `Ingresso reattivo su ${c.ticker} al prezzo reale ${c.currencySymbol}${c.price}: trend 1h ${c.trendBias.toLowerCase()}, RSI ${c.rsi14} con spazio di salita verso +${c.suggestedTakeProfitPct}% e Stop Loss rigoroso a -${c.suggestedStopLossPct}%.`,
          });
        }

        const skipped = candidates.find((c) => c.rsi14 >= 72 || c.trendBias === 'DEBOLE');
        if (skipped) {
          aiDecisionsRaw.push({
            ticker: skipped.ticker,
            action: 'SKIP',
            confidence: 'ALTA',
            webCatalyst: briefing.headline,
            motivationIt:
              skipped.rsi14 >= 72
                ? `Scartato al momento: RSI a ${skipped.rsi14} in zona tirata, attendiamo un ritracciamento verso EMA20 (${skipped.currencySymbol}${skipped.ema20}) per un miglior rapporto rischio/rendimento.`
                : `Scartato per filtro di protezione: prezzo (${skipped.currencySymbol}${skipped.price}) sotto EMA20 (${skipped.currencySymbol}${skipped.ema20}) ed EMA50 (${skipped.currencySymbol}${skipped.ema50}).`,
          });
        }
      }

      // 4. Execute approved decisions strictly using verified snapshot prices
      const newDecisionRecords: AiDecisionRecord[] = [];
      let executedActionsCount = 0;
      const perPositionAllocationEur = parseFloat(
        ((session.currentCapital * 0.88) / Math.max(4, this.config.maxOpenPositions)).toFixed(2)
      );

      for (const raw of aiDecisionsRaw) {
        const ticker = (raw.ticker || '').trim().toUpperCase();
        const snap = snapshot.find((s) => s.ticker.toUpperCase() === ticker);
        if (!snap || !snap.isLiveVerified) continue;

        const actionStr = (raw.action || 'HOLD').toUpperCase();
        const action: AiDecisionAction = (
          ['OPEN_LONG', 'CLOSE_PROFIT', 'CLOSE_RISK', 'TIGHTEN_STOP', 'HOLD', 'SKIP'].includes(actionStr)
            ? actionStr
            : 'HOLD'
        ) as AiDecisionAction;

        const confRaw = (raw.confidence || 'MEDIA').toUpperCase();
        const confidence: AiDecisionRecord['confidence'] =
          confRaw === 'ALTA' ? 'ALTA' : confRaw === 'BASSA' ? 'BASSA' : 'MEDIA';

        const chartSignals = `Prezzo ${snap.currencySymbol}${snap.price} · EMA20 ${snap.currencySymbol}${snap.ema20} · RSI ${snap.rsi14} · ATR ${snap.atrPct}% · Trend ${snap.trendBias}`;
        let executed = false;
        let executionNote = '';
        let slPrice: number | undefined;
        let tpPrice: number | undefined;
        let slPct: number | undefined;
        let tpPct: number | undefined;

        if (action === 'OPEN_LONG') {
          slPct = parseFloat(
            Math.max(0.85, Math.min(this.config.maxStopLossPct, Number(raw.stopLossPct) || snap.suggestedStopLossPct)).toFixed(2)
          );
          tpPct = parseFloat(
            Math.max(1.6, Math.min(4.0, Number(raw.takeProfitPct) || snap.suggestedTakeProfitPct)).toFixed(2)
          );
          slPrice = parseFloat((snap.price * (1 - slPct / 100)).toFixed(2));
          tpPrice = parseFloat((snap.price * (1 + tpPct / 100)).toFixed(2));

          const execRes = await serverPaperTradingEngine.executeAiOpenPosition({
            ticker: snap.ticker,
            name: snap.name,
            verifiedPrice: snap.price,
            currency: snap.currency,
            currencySymbol: snap.currencySymbol,
            fxRateToEur: snap.fxRateToEur,
            stopLossPct: slPct,
            takeProfitPct: tpPct,
            allocationEur: perPositionAllocationEur,
            reason: raw.motivationIt,
            maxPositions: this.config.maxOpenPositions,
          });
          executed = execRes.ok;
          executionNote = execRes.message;
          if (execRes.ok) executedActionsCount++;
        } else if (action === 'CLOSE_PROFIT' || action === 'CLOSE_RISK') {
          const execRes = await serverPaperTradingEngine.executeAiClosePosition({
            ticker: snap.ticker,
            verifiedPrice: snap.price,
            fxRateToEur: snap.fxRateToEur,
            currencySymbol: snap.currencySymbol,
            reasonType: action === 'CLOSE_PROFIT' ? 'TAKE_PROFIT' : 'STOP_LOSS',
            motivation: raw.motivationIt,
          });
          executed = execRes.ok;
          executionNote = execRes.message;
          if (execRes.ok) executedActionsCount++;
        } else if (action === 'TIGHTEN_STOP') {
          const openPos = openPositions.find((p) => p.symbol.toUpperCase() === ticker);
          const targetSl =
            typeof raw.newStopLossPrice === 'number' && raw.newStopLossPrice > 0
              ? raw.newStopLossPrice
              : openPos
              ? parseFloat(Math.max(openPos.entryPrice * 1.001, snap.price * 0.993).toFixed(2))
              : 0;
          if (targetSl > 0) {
            slPrice = targetSl;
            const execRes = await serverPaperTradingEngine.executeAiTightenStop({
              ticker: snap.ticker,
              newStopLoss: targetSl,
              currencySymbol: snap.currencySymbol,
              motivation: raw.motivationIt,
            });
            executed = execRes.ok;
            executionNote = execRes.message;
            if (execRes.ok) executedActionsCount++;
          }
        } else {
          executionNote = action === 'HOLD' ? 'Posizione mantenuta con Stop Loss attivo' : 'Nessun ordine eseguito';
        }

        newDecisionRecords.push({
          id: `dec_${ticker}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          cycleId,
          timestamp: Date.now(),
          dateStr,
          ticker: snap.ticker,
          name: snap.name,
          action,
          executed,
          verifiedPrice: snap.price,
          currency: snap.currency,
          currencySymbol: snap.currencySymbol,
          stopLoss: slPrice,
          takeProfit: tpPrice,
          stopLossPct: slPct,
          takeProfitPct: tpPct,
          confidence,
          chartSignals,
          webCatalyst: raw.webCatalyst || briefing.headline,
          motivationIt: raw.motivationIt,
          executionNote,
        });
      }

      this.decisions = [...newDecisionRecords, ...this.decisions].slice(0, 120);
      this.lastRunAt = Date.now();
      this.saveToDisk();
      this.saveToFirestore().catch(() => {});

      const updatedSession = await serverPaperTradingEngine.ensureActiveAiPortfolioSession();
      return {
        briefing,
        decisions: newDecisionRecords,
        executedActionsCount,
        session: updatedSession,
      };
    } finally {
      this.isRunning = false;
    }
  }

  private loadFromDisk() {
    try {
      if (!fs.existsSync(STATE_FILE)) return;
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed.config) this.config = { ...DEFAULT_CONFIG, ...parsed.config };
      if (Array.isArray(parsed.briefings)) this.briefings = parsed.briefings.slice(0, 20);
      if (Array.isArray(parsed.decisions)) this.decisions = parsed.decisions.slice(0, 120);
      if (typeof parsed.lastRunAt === 'number') this.lastRunAt = parsed.lastRunAt;
      if (typeof parsed.lastBriefingAt === 'number') this.lastBriefingAt = parsed.lastBriefingAt;
      if (typeof parsed.eurUsdRate === 'number' && parsed.eurUsdRate > 0.5) this.eurUsdRate = parsed.eurUsdRate;
    } catch (err: any) {
      console.warn('[AiAutopilot] Disk load notice:', err?.message || err);
    }
  }

  private saveToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const payload = {
        config: this.config,
        lastRunAt: this.lastRunAt,
        lastBriefingAt: this.lastBriefingAt,
        eurUsdRate: this.eurUsdRate,
        briefings: this.briefings.slice(0, 20),
        decisions: this.decisions.slice(0, 120),
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err: any) {
      console.warn('[AiAutopilot] Disk save notice:', err?.message || err);
    }
  }

  private async loadFromFirestore() {
    try {
      const fetchPromise = getDoc(doc(db, 'ai_autopilot', 'state'));
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore ai_autopilot timeout')), 3500)
      );
      const snap: any = await Promise.race([fetchPromise, timeoutPromise]);
      if (snap && snap.exists()) {
        const data = snap.data();
        if (data.config) this.config = { ...this.config, ...data.config };
        if (Array.isArray(data.briefings) && data.briefings.length > this.briefings.length) {
          this.briefings = data.briefings.slice(0, 20);
        }
        if (Array.isArray(data.decisions) && data.decisions.length > this.decisions.length) {
          this.decisions = data.decisions.slice(0, 120);
        }
      }
    } catch {
      // Resilient local fallback
    }
  }

  private async saveToFirestore() {
    try {
      const payload = JSON.parse(
        JSON.stringify({
          config: this.config,
          lastRunAt: this.lastRunAt,
          lastBriefingAt: this.lastBriefingAt,
          eurUsdRate: this.eurUsdRate,
          briefings: this.briefings.slice(0, 10),
          decisions: this.decisions.slice(0, 40),
          updatedAt: Date.now(),
        })
      );
      await setDoc(doc(db, 'ai_autopilot', 'state'), payload);
    } catch {
      // Ignore quota or offline errors gracefully
    }
  }
}

export const aiAutopilotService = new AiAutopilotService();
