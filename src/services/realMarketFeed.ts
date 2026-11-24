/**
 * QuantLab Real Market Data Fetcher for Live Paper Trading
 * Retrieves authentic real-time price quotes, native currencies, verified FX conversion rates,
 * and historical/intraday bars directly from market APIs — ZERO synthetic or hardcoded FX fallbacks.
 */
import { Bar, Timeframe } from '../types';
import { DataStatus } from './marketDataIntegrity';

export interface RealMarketQuote {
  symbol: string;
  price: number;
  previousClose?: number;
  change: number;
  changePercent: number;
  volume: number;
  currency: string;
  currencySymbol: string;
  fxRateToEur: number | null; // null if FX is unavailable for non-EUR asset!
  fxVerified: boolean;
  exchange?: string;
  isLiveVerified: boolean;
  dataStatus: DataStatus;
  timestamp: number;
  marketState?: 'REGULAR' | 'CLOSED' | 'PRE' | 'POST' | 'UNKNOWN';
}

/**
 * Fetch latest real price quote for a symbol, preserving native currency ($ vs €)
 * and strictly verified EUR FX conversion rate (never fabricates 0.92 / 1.085).
 */
export async function fetchLiveRealQuote(symbol: string): Promise<RealMarketQuote | null> {
  const cleanSymbol = (symbol || '').trim().toUpperCase();
  if (
    !cleanSymbol ||
    cleanSymbol === 'PORTFOLIO' ||
    cleanSymbol.startsWith('PORT_') ||
    cleanSymbol.startsWith('PORTFOLIO_')
  ) {
    return null;
  }

  try {
    const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/market/quote?ticker=${encodeURIComponent(cleanSymbol)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data.price !== 'number' || !Number.isFinite(data.price) || data.price <= 0) {
      return null;
    }

    const currency = (
      data.currency ||
      (cleanSymbol.includes('.MI') ||
      cleanSymbol.includes('.DE') ||
      cleanSymbol.includes('.PA') ||
      cleanSymbol.includes('.AS')
        ? 'EUR'
        : 'USD')
    ).toUpperCase();
    const currencySymbol = data.currencySymbol || (currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€');

    const fxRateToEur =
      currency === 'EUR'
        ? 1.0
        : typeof data.fxRateToEur === 'number' && Number.isFinite(data.fxRateToEur) && data.fxRateToEur > 0
        ? data.fxRateToEur
        : null;
    const fxVerified = currency === 'EUR' ? true : fxRateToEur !== null && data.fxVerified !== false;

    const marketState = data.marketState || 'UNKNOWN';
    const dataStatus: DataStatus =
      data.dataStatus ||
      (marketState === 'REGULAR' ? 'REALTIME' : data.isLiveVerified ? 'LAST_AVAILABLE' : 'DELAYED');

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
      fxVerified,
      exchange: data.exchange || '',
      isLiveVerified: data.isLiveVerified === true,
      dataStatus,
      timestamp: data.lastUpdated ? new Date(data.lastUpdated).getTime() : Date.now(),
      marketState,
    };
  } catch (err) {
    console.warn(`[RealMarketFeed] Avviso recupero quote per ${symbol}:`, (err as any)?.message || err);
    return null;
  }
}

export async function fetchLiveRealBar(symbol: string, timeframe: Timeframe): Promise<Bar | null> {
  const bars = await fetchLiveRealBarsSeries(symbol, timeframe);
  return bars && bars.length > 0 ? bars[bars.length - 1] : null;
}

export async function fetchLiveRealBarsSeries(symbol: string, timeframe: Timeframe): Promise<Bar[]> {
  const cleanSymbol = (symbol || '').trim().toUpperCase();
  if (
    !cleanSymbol ||
    cleanSymbol === 'PORTFOLIO' ||
    cleanSymbol.startsWith('PORT_') ||
    cleanSymbol.startsWith('PORTFOLIO_')
  ) {
    return [];
  }

  try {
    const baseUrl = typeof window !== 'undefined' ? '' : 'http://localhost:3000';
    const res = await fetch(
      `${baseUrl}/api/market/history?ticker=${encodeURIComponent(cleanSymbol)}&timeframe=${encodeURIComponent(timeframe)}`
    );
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
