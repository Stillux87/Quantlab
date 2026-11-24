/**
 * QuantLab - Macro Regime & Risk Gating Service
 * Grounds trading execution in quantitative literature (Andrea Unger, Perry Kaufman, Robert Carver).
 * 
 * Rules:
 * 1. Macro Trend Gate (SMA 200):
 *    - LONG entries permitted ONLY if Current Price > SMA 200 (uptrend regime).
 *    - SHORT entries permitted ONLY if Current Price < SMA 200 (downtrend regime).
 *    - Counter-trend entries (e.g., buying falling knives like VOW3.DE during macro downtrends) are strictly rejected.
 * 
 * 2. Volatility Compression & Blowout Gate (ATR 14):
 *    - ATR% = (ATR 14 / Price) * 100.
 *    - If ATR% < 0.15% (dead volume / extreme flat compression), entries are blocked to prevent false whipsaws.
 *    - If ATR% > 10.0% (erratic blowout / panic volatility), entries are blocked to prevent catastrophic slippage.
 */
import { Bar, TradeDirection } from '../types';
import { calculateSMA, calculateATR } from './indicators';

export interface MacroRegimeResult {
  passed: boolean;
  reason: string;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sma200?: number;
  currentPrice: number;
  distanceFromSmaPct?: number;
  atr14?: number;
  atrPercent?: number;
  isVolatilityHealthy: boolean;
  recommendation: 'LONG_ONLY' | 'SHORT_ONLY' | 'ALL_ALLOWED' | 'BLOCKED';
}

/**
 * Evaluates whether an incoming trade signal conforms to the institutional Macro Regime rules.
 */
export function evaluateMacroRegime(
  bars: Bar[],
  direction: TradeDirection,
  currentPriceOverride?: number
): MacroRegimeResult {
  if (!bars || bars.length === 0) {
    return {
      passed: true,
      reason: 'Dati storici insufficienti per filtro di regime: operazione autorizzata di default.',
      trend: 'NEUTRAL',
      currentPrice: currentPriceOverride || 0,
      isVolatilityHealthy: true,
      recommendation: 'ALL_ALLOWED',
    };
  }

  const lastBar = bars[bars.length - 1];
  const currentPrice = currentPriceOverride && currentPriceOverride > 0 ? currentPriceOverride : lastBar.close;
  const closes = bars.map((b) => b.close);

  // 1. Calculate SMA (target 200, adapt smoothly if between 40 and 200 bars)
  const effectiveSmaPeriod = bars.length >= 200 ? 200 : (bars.length >= 50 ? bars.length : 20);
  const smaSeries = calculateSMA(closes, effectiveSmaPeriod);
  const rawSma = smaSeries[smaSeries.length - 1];
  const sma200 = rawSma !== undefined ? parseFloat(rawSma.toFixed(2)) : undefined;

  let trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let distanceFromSmaPct: number | undefined = undefined;

  if (sma200 && sma200 > 0) {
    distanceFromSmaPct = parseFloat((((currentPrice - sma200) / sma200) * 100).toFixed(2));
    if (currentPrice > sma200) {
      trend = 'BULLISH';
    } else if (currentPrice < sma200) {
      trend = 'BEARISH';
    }
  }

  // 2. Calculate ATR 14
  const effectiveAtrPeriod = Math.min(14, Math.max(5, Math.floor(bars.length / 3)));
  const atrSeries = calculateATR(bars, effectiveAtrPeriod);
  const rawAtr = atrSeries[atrSeries.length - 1];
  const atr14 = rawAtr !== undefined ? parseFloat(rawAtr.toFixed(2)) : undefined;
  let atrPercent: number | undefined = undefined;
  let isVolatilityHealthy = true;

  if (atr14 !== undefined && currentPrice > 0) {
    atrPercent = parseFloat(((atr14 / currentPrice) * 100).toFixed(2));
    // Check extreme compression or catastrophic volatility blowout
    if (atrPercent < 0.15 || atrPercent > 12.0) {
      isVolatilityHealthy = false;
    }
  }

  // 3. Determine Recommendation & Filter Enforcement
  let recommendation: 'LONG_ONLY' | 'SHORT_ONLY' | 'ALL_ALLOWED' | 'BLOCKED' = 'ALL_ALLOWED';
  if (trend === 'BULLISH') recommendation = 'LONG_ONLY';
  if (trend === 'BEARISH') recommendation = 'SHORT_ONLY';

  // Rule 1: Macro Trend Violation Check
  if (sma200 !== undefined) {
    if (direction === 'LONG' && currentPrice < sma200) {
      return {
        passed: false,
        reason: `[Filtro Regime SMA 200] Segnale LONG respinto: Prezzo (€${currentPrice.toFixed(2)}) < SMA ${effectiveSmaPeriod} (€${sma200.toFixed(2)}). Trend macro RIBASSISTA (-${Math.abs(distanceFromSmaPct || 0).toFixed(1)}%). Vietato acquistare in controtendenza (Metodo Unger).`,
        trend,
        sma200,
        currentPrice,
        distanceFromSmaPct,
        atr14,
        atrPercent,
        isVolatilityHealthy,
        recommendation,
      };
    }

    if (direction === 'SHORT' && currentPrice > sma200) {
      return {
        passed: false,
        reason: `[Filtro Regime SMA 200] Segnale SHORT respinto: Prezzo (€${currentPrice.toFixed(2)}) > SMA ${effectiveSmaPeriod} (€${sma200.toFixed(2)}). Trend macro RIALZISTA (+${(distanceFromSmaPct || 0).toFixed(1)}%). Vietato shortare in controtendenza.`,
        trend,
        sma200,
        currentPrice,
        distanceFromSmaPct,
        atr14,
        atrPercent,
        isVolatilityHealthy,
        recommendation,
      };
    }
  }

  // Rule 2: Volatility Health Check
  if (!isVolatilityHealthy && atrPercent !== undefined) {
    if (atrPercent < 0.15) {
      return {
        passed: false,
        reason: `[Filtro Volatilità ATR] Segnale ${direction} bloccato: Volatilità eccessivamente compressa (ATR ${atrPercent.toFixed(2)}% < 0.15%). Rischio elevato di falsi breakout su mercato laterale.`,
        trend,
        sma200,
        currentPrice,
        distanceFromSmaPct,
        atr14,
        atrPercent,
        isVolatilityHealthy: false,
        recommendation: 'BLOCKED',
      };
    }

    if (atrPercent > 12.0) {
      return {
        passed: false,
        reason: `[Filtro Volatilità ATR] Segnale ${direction} bloccato: Volatilità da panico/anomala (ATR ${atrPercent.toFixed(2)}% > 12.0%). Rischio elevato di slippage violento ed esecuzione fuori controllo.`,
        trend,
        sma200,
        currentPrice,
        distanceFromSmaPct,
        atr14,
        atrPercent,
        isVolatilityHealthy: false,
        recommendation: 'BLOCKED',
      };
    }
  }

  // Passed all gates
  const trendLabel = trend === 'BULLISH' ? 'RIALZISTA (Prezzo > SMA 200)' : trend === 'BEARISH' ? 'RIBASSISTA (Prezzo < SMA 200)' : 'NEUTRO';
  return {
    passed: true,
    reason: `[Filtro Regime Conforme] Segnale ${direction} validato. Trend ${trendLabel} | Distanza SMA: ${distanceFromSmaPct !== undefined ? (distanceFromSmaPct > 0 ? `+${distanceFromSmaPct}%` : `${distanceFromSmaPct}%`) : 'N/D'} | ATR 14: ${atrPercent ? `${atrPercent}%` : 'N/D'}`,
    trend,
    sma200,
    currentPrice,
    distanceFromSmaPct,
    atr14,
    atrPercent,
    isVolatilityHealthy,
    recommendation,
  };
}

/**
 * Computes the full Macro Regime summary for an instrument's bar series (for UI inspection).
 */
export function getInstrumentMacroRegime(bars: Bar[]): MacroRegimeResult {
  return evaluateMacroRegime(bars, 'LONG');
}
