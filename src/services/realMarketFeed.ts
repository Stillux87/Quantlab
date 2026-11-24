/**
 * QuantLab Real Market Data Fetcher for Live Paper Trading
 * Retrieves authentic real-time price quotes, native currencies, FX conversion rates,
 * and historical/intraday bars directly from market APIs.
 */
import { Bar, Timeframe } from '../types';

export interface RealMarketQuote {
  symbol: string;
  price: number;
  previousClose?: number;
  change: number;
  changePercent: number;
  volume: number;
  currency: string;
  currencySymbol: string;
  fxRateToEur: number;
  exchange?: string;
  isLiveVerified?: boolean;
  timestamp: number;
  marketState?: 'REGULAR' | 'CLOSED' | 'PRE' | 'POST' | 'UNKNOWN';
}

/**
 * Fetch latest real price quote for a symbol, preserving native currency ($ vs €) and live EUR/USD FX rate
 */
export async function fetchLiveRealQuote(symbol: string): Promise<RealMarketQuote | null> {
  const cleanSymbol = (symbol || '').trim().toUpperCase();
  if (!cleanSymbol || cleanSymbol === 'PORTFOLIO' || cleanSymbol.startsWith('PORT_') || cleanSymbol.startsWith('PORTFOLIO_')) {
    return null;
  }

  try {
    const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/market/quote?ticker=${encodeURIComponent(cleanSymbol)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data.price !== 'number' || data.price <= 0) return null;

    const currency = (data.currency || (cleanSymbol.includes('.MI') || cleanSymbol.includes('.DE') || cleanSymbol.includes('.PA') || cleanSymbol.includes('.AS') ? 'EUR' : 'USD')).toUpperCase();
    const currencySymbol = data.currencySymbol || (currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€');
    const fxRateToEur = typeof data.fxRateToEur === 'number' && data.fxRateToEur > 0
      ? data.fxRateToEur
      : currency === 'USD'
      ? 0.92
      : 1.0;

    return {
      symbol: cleanSymbol,
      price: data.price,
      previousClose: data.previousClose ?? data.price,
      change: data.change24hAmount ?? 0,
      changePercent: data.change24h ?? 0,
      volume: data.volume24h ?? 0,
      currency,
      currencySymbol,
      fxRateToEur,
      exchange: data.exchange || '',
      isLiveVerified: data.isLiveVerified ?? true,
      timestamp: data.lastUpdated ? new Date(data.lastUpdated).getTime() : Date.now(),
      marketState: data.marketState || 'REGULAR',
    };
  } catch (err) {
    console.warn(`[RealMarketFeed] Avviso recupero quote per ${symbol}:`, (err as any)?.message || err);
    return null;
  }
}

/**
 * Fetch latest real OHLCV bar for a given timeframe
 */
export async function fetchLiveRealBar(symbol: string, timeframe: Timeframe): Promise<Bar | null> {
  const bars = await fetchLiveRealBarsSeries(symbol, timeframe, 5);
  return bars && bars.length > 0 ? bars[bars.length - 1] : null;
}

/**
 * Fetch a historical series of authentic real bars
 */
export async function fetchLiveRealBarsSeries(symbol: string, timeframe: Timeframe, minBars = 50): Promise<Bar[]> {
  const cleanSymbol = (symbol || '').trim().toUpperCase();
  if (!cleanSymbol || cleanSymbol === 'PORTFOLIO' || cleanSymbol.startsWith('PORT_') || cleanSymbol.startsWith('PORTFOLIO_')) {
    return [];
  }

  try {
    const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/market/history?ticker=${encodeURIComponent(cleanSymbol)}&timeframe=${timeframe}`);
    if (!res.ok) return [];
    const data = await res.json();
    if (data && data.isRealData === true && Array.isArray(data.bars) && data.bars.length > 0) {
      return data.bars;
    }
    return [];
  } catch (err) {
    console.warn(`[RealMarketFeed] Avviso recupero serie barre per ${symbol}:`, (err as any)?.message || err);
    return [];
  }
}
