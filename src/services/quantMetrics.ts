/**
 * QuantLab - Rigorous Quantitative Performance, Risk, Walk-Forward & Seeded Monte Carlo Engine
 *
 * Strict Mathematical Standards:
 * - Zero fixed multipliers or heuristic estimates for drawdown, Sharpe, Sortino, or duration.
 * - Sharpe and Sortino are computed from periodic equity-curve returns annualized by true
 *   timeframe periods per year (Sortino uses downside deviation over all N periods).
 * - Maximum drawdown, average drawdown, and max drawdown duration (in calendar days) are
 *   derived directly from the actual bar-by-bar equity curve timestamps.
 * - CAGR uses true elapsed calendar time (with explicit minimum-span guard).
 * - Monte Carlo uses deterministic seeded Mulberry32 PRNG + Fisher-Yates permutation AND
 *   bootstrap resampling with replacement; honestly reports `available: false` when < 10 trades.
 */
import { Bar, EquityPoint, Timeframe, Trade } from '../types';

export function getPeriodsPerYear(timeframe: Timeframe): number {
  const map: Record<Timeframe, number> = {
    '1m': 252 * 390,
    '5m': 252 * 78,
    '15m': 252 * 26,
    '30m': 252 * 13,
    '1h': 252 * 6.5,
    '2h': 252 * 3.5,
    '4h': 252 * 2,
    '1D': 252,
  };
  return map[timeframe] ?? 252;
}

export interface DrawdownStats {
  maxDrawdownPct: number;
  avgDrawdownPct: number;
  maxDrawdownDurationDays: number;
  currentDrawdownPct: number;
  peakEquity: number;
  troughEquity: number;
}

export function computeDrawdownStats(
  equityPoints: Array<{ timestamp: number; equity: number }>
): DrawdownStats {
  if (!equityPoints || equityPoints.length === 0) {
    return {
      maxDrawdownPct: 0,
      avgDrawdownPct: 0,
      maxDrawdownDurationDays: 0,
      currentDrawdownPct: 0,
      peakEquity: 0,
      troughEquity: 0,
    };
  }

  let peak = equityPoints[0].equity;
  let peakTs = equityPoints[0].timestamp;
  let maxDdPct = 0;
  let maxDdDurationMs = 0;
  let ddSum = 0;
  let troughAtMaxDd = peak;

  for (let i = 0; i < equityPoints.length; i++) {
    const pt = equityPoints[i];
    if (pt.equity >= peak) {
      peak = pt.equity;
      peakTs = pt.timestamp;
    } else if (peak > 0) {
      const ddPct = ((peak - pt.equity) / peak) * 100;
      ddSum += ddPct;
      if (ddPct > maxDdPct) {
        maxDdPct = ddPct;
        troughAtMaxDd = pt.equity;
      }
      const durationMs = Math.max(0, pt.timestamp - peakTs);
      if (durationMs > maxDdDurationMs) {
        maxDdDurationMs = durationMs;
      }
    }
  }

  const lastEq = equityPoints[equityPoints.length - 1].equity;
  const currentDrawdownPct = peak > 0 && lastEq < peak ? ((peak - lastEq) / peak) * 100 : 0;

  return {
    maxDrawdownPct: parseFloat(maxDdPct.toFixed(2)),
    avgDrawdownPct: parseFloat((ddSum / equityPoints.length).toFixed(2)),
    maxDrawdownDurationDays: parseFloat((maxDdDurationMs / 86_400_000).toFixed(1)),
    currentDrawdownPct: parseFloat(currentDrawdownPct.toFixed(2)),
    peakEquity: parseFloat(peak.toFixed(2)),
    troughEquity: parseFloat(troughAtMaxDd.toFixed(2)),
  };
}

export interface PeriodicReturnMetrics {
  totalReturnPct: number;
  cagrPct: number;
  cagrReliable: boolean;
  elapsedYears: number;
  volatilityPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  recoveryFactor: number;
  returnsCount: number;
  metricsAvailable: boolean;
}

export function computePeriodicReturnMetrics(
  equityPoints: Array<{ timestamp: number; equity: number }>,
  timeframe: Timeframe,
  riskFreeRateAnnual = 0
): PeriodicReturnMetrics {
  if (!equityPoints || equityPoints.length < 2) {
    return {
      totalReturnPct: 0,
      cagrPct: 0,
      cagrReliable: false,
      elapsedYears: 0,
      volatilityPct: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      recoveryFactor: 0,
      returnsCount: 0,
      metricsAvailable: false,
    };
  }

  const startEq = equityPoints[0].equity;
  const endEq = equityPoints[equityPoints.length - 1].equity;
  const totalReturnPct = startEq > 0 ? ((endEq - startEq) / startEq) * 100 : 0;

  const startTs = equityPoints[0].timestamp;
  const endTs = equityPoints[equityPoints.length - 1].timestamp;
  const elapsedDays = Math.max(0, (endTs - startTs) / 86_400_000);
  const elapsedYears = elapsedDays / 365.25;
  const cagrReliable = elapsedDays >= 30;

  let cagrPct = 0;
  if (startEq > 0 && endEq > 0 && elapsedYears > 0) {
    if (elapsedDays >= 14) {
      const ratio = endEq / startEq;
      cagrPct = (Math.pow(ratio, 1 / elapsedYears) - 1) * 100;
      if (!Number.isFinite(cagrPct)) cagrPct = 0;
      cagrPct = Math.max(-99.99, Math.min(1000, cagrPct));
    } else {
      // Very short window (< 14 days): do not extrapolate explosive annualized CAGR
      cagrPct = totalReturnPct;
    }
  } else if (endEq <= 0) {
    cagrPct = -100;
  }

  // Periodic bar-to-bar simple returns
  const returns: number[] = [];
  for (let i = 1; i < equityPoints.length; i++) {
    const prev = equityPoints[i - 1].equity;
    const curr = equityPoints[i].equity;
    if (prev > 0 && Number.isFinite(curr)) {
      returns.push((curr - prev) / prev);
    }
  }

  const n = returns.length;
  const periodsPerYear = getPeriodsPerYear(timeframe);
  const rfPerPeriod = riskFreeRateAnnual / periodsPerYear;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += returns[i];
  mean = n > 0 ? mean / n : 0;

  // Unbiased sample variance (n - 1)
  let sumSq = 0;
  let downsideSumSq = 0;
  for (let i = 0; i < n; i++) {
    const diff = returns[i] - mean;
    sumSq += diff * diff;
    const excessDown = Math.min(0, returns[i] - rfPerPeriod);
    downsideSumSq += excessDown * excessDown;
  }

  const stdDev = n > 1 ? Math.sqrt(sumSq / (n - 1)) : 0;
  // Standard Sortino downside deviation divides by TOTAL N periods
  const downsideDev = n > 0 ? Math.sqrt(downsideSumSq / n) : 0;

  const annFactor = Math.sqrt(periodsPerYear);
  const volatilityPct = stdDev * annFactor * 100;

  const sharpeRatio =
    n >= 2 && stdDev > 1e-12 ? ((mean - rfPerPeriod) / stdDev) * annFactor : 0;
  const sortinoRatio =
    n >= 2 && downsideDev > 1e-12
      ? ((mean - rfPerPeriod) / downsideDev) * annFactor
      : mean > rfPerPeriod && stdDev > 1e-12
      ? sharpeRatio
      : 0;

  const dd = computeDrawdownStats(equityPoints);
  const calmarRatio = dd.maxDrawdownPct > 0.01 ? cagrPct / dd.maxDrawdownPct : 0;
  const recoveryFactor = dd.maxDrawdownPct > 0.01 ? totalReturnPct / dd.maxDrawdownPct : 0;

  return {
    totalReturnPct: parseFloat(totalReturnPct.toFixed(2)),
    cagrPct: parseFloat(cagrPct.toFixed(2)),
    cagrReliable,
    elapsedYears: parseFloat(elapsedYears.toFixed(3)),
    volatilityPct: parseFloat(volatilityPct.toFixed(2)),
    sharpeRatio: parseFloat(Math.max(-20, Math.min(20, sharpeRatio)).toFixed(2)),
    sortinoRatio: parseFloat(Math.max(-30, Math.min(30, sortinoRatio)).toFixed(2)),
    calmarRatio: parseFloat(Math.max(-20, Math.min(20, calmarRatio)).toFixed(2)),
    recoveryFactor: parseFloat(Math.max(-50, Math.min(50, recoveryFactor)).toFixed(2)),
    returnsCount: n,
    metricsAvailable: n >= 2,
  };
}

export interface TradeStatsSummary {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number;
  profitFactor: number;
  avgWinPct: number;
  avgLossPct: number;
  avgWinAmount: number;
  avgLossAmount: number;
  riskRewardRatio: number;
  expectancy: number;
  expectancyPct: number;
  avgTradeAmount: number;
  avgTradePct: number;
  avgDurationMinutes: number;
  marketExposurePct: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  totalCommissionPaid: number;
  totalSlippagePaid: number;
}

export function computeTradeStats(
  trades: Trade[],
  totalBars: number,
  barsInPosition: number
): TradeStatsSummary {
  const totalTrades = trades.length;
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRatePct: 0,
      profitFactor: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      avgWinAmount: 0,
      avgLossAmount: 0,
      riskRewardRatio: 0,
      expectancy: 0,
      expectancyPct: 0,
      avgTradeAmount: 0,
      avgTradePct: 0,
      avgDurationMinutes: 0,
      marketExposurePct: totalBars > 0 ? parseFloat(((barsInPosition / totalBars) * 100).toFixed(1)) : 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
      totalCommissionPaid: 0,
      totalSlippagePaid: 0,
    };
  }

  let grossProfit = 0;
  let grossLoss = 0;
  let winCount = 0;
  let lossCount = 0;
  let sumWinPct = 0;
  let sumLossPct = 0;
  let sumDuration = 0;
  let sumPnl = 0;
  let sumPnlPct = 0;
  let totalCommissionPaid = 0;
  let totalSlippagePaid = 0;

  let curW = 0;
  let curL = 0;
  let maxW = 0;
  let maxL = 0;

  for (const t of trades) {
    sumPnl += t.pnlAmount;
    sumPnlPct += t.pnlPercent;
    sumDuration += t.durationMinutes || 0;
    totalCommissionPaid += t.commission || 0;
    totalSlippagePaid += t.slippage || 0;

    if (t.pnlAmount > 0) {
      winCount++;
      grossProfit += t.pnlAmount;
      sumWinPct += t.pnlPercent;
      curW++;
      curL = 0;
      if (curW > maxW) maxW = curW;
    } else if (t.pnlAmount < 0) {
      lossCount++;
      grossLoss += Math.abs(t.pnlAmount);
      sumLossPct += Math.abs(t.pnlPercent);
      curL++;
      curW = 0;
      if (curL > maxL) maxL = curL;
    } else {
      curW = 0;
      curL = 0;
    }
  }

  const winRate = winCount / totalTrades;
  const lossRate = lossCount / totalTrades;
  const avgWinAmt = winCount > 0 ? grossProfit / winCount : 0;
  const avgLossAmt = lossCount > 0 ? grossLoss / lossCount : 0;
  const avgWinPct = winCount > 0 ? sumWinPct / winCount : 0;
  const avgLossPct = lossCount > 0 ? sumLossPct / lossCount : 0;

  const profitFactor =
    grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.99 : 0;
  const riskRewardRatio = avgLossAmt > 0 ? avgWinAmt / avgLossAmt : avgWinAmt > 0 ? 99.99 : 0;
  const expectancy = winRate * avgWinAmt - lossRate * avgLossAmt;
  const expectancyPct = winRate * avgWinPct - lossRate * avgLossPct;

  return {
    totalTrades,
    winningTrades: winCount,
    losingTrades: lossCount,
    winRatePct: parseFloat((winRate * 100).toFixed(1)),
    profitFactor: parseFloat(Math.min(99.99, profitFactor).toFixed(2)),
    avgWinPct: parseFloat(avgWinPct.toFixed(2)),
    avgLossPct: parseFloat(avgLossPct.toFixed(2)),
    avgWinAmount: parseFloat(avgWinAmt.toFixed(2)),
    avgLossAmount: parseFloat(avgLossAmt.toFixed(2)),
    riskRewardRatio: parseFloat(Math.min(99.99, riskRewardRatio).toFixed(2)),
    expectancy: parseFloat(expectancy.toFixed(2)),
    expectancyPct: parseFloat(expectancyPct.toFixed(2)),
    avgTradeAmount: parseFloat((sumPnl / totalTrades).toFixed(2)),
    avgTradePct: parseFloat((sumPnlPct / totalTrades).toFixed(2)),
    avgDurationMinutes: Math.round(sumDuration / totalTrades),
    marketExposurePct:
      totalBars > 0 ? parseFloat(((barsInPosition / totalBars) * 100).toFixed(1)) : 0,
    maxConsecutiveWins: maxW,
    maxConsecutiveLosses: maxL,
    totalCommissionPaid: parseFloat(totalCommissionPaid.toFixed(2)),
    totalSlippagePaid: parseFloat(totalSlippagePaid.toFixed(2)),
  };
}

// ============================================================================
// Deterministic Seeded PRNG (Mulberry32) & Fisher-Yates Shuffle
// ============================================================================
export function createMulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function fisherYatesShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.floor((sortedAsc.length - 1) * p)));
  return sortedAsc[idx];
}

export interface MonteCarloReport {
  available: boolean;
  reason?: string;
  iterations: number;
  seed: number;
  sampleTrades: number;
  // Sequence permutation (drawdown & path dependency)
  maxDrawdownP50Pct: number | null;
  maxDrawdownP95Pct: number | null;
  ruinProbabilityPct: number | null; // % paths breaching ruinThresholdPct drawdown
  // Bootstrap resampling (return & CAGR distribution)
  terminalReturnP05Pct: number | null;
  terminalReturnP50Pct: number | null;
  terminalReturnP95Pct: number | null;
  cagrP05Pct: number | null;
  cagrP50Pct: number | null;
  cagrP95Pct: number | null;
  lossProbabilityPct: number | null; // % bootstrap paths ending below initial capital
}

/**
 * Deterministic seeded Monte Carlo stress test:
 * 1. Trade-sequence permutation (Fisher-Yates) for Max Drawdown 50th/95th percentiles & Ruin Probability.
 * 2. Bootstrap resampling with replacement for Terminal Return & CAGR 5th/50th/95th percentiles & Loss Probability.
 * Returns `available: false` when < 10 trades (never invents parametric fallback constants).
 */
export function runMonteCarloSimulation(
  trades: Array<{ pnlAmount: number }>,
  initialCapital: number,
  options?: {
    iterations?: number;
    seed?: number;
    ruinThresholdPct?: number;
    elapsedYears?: number;
    minTrades?: number;
  }
): MonteCarloReport {
  const iterations = Math.max(100, Math.min(5000, options?.iterations ?? 500));
  const seed = options?.seed ?? 20260401;
  const ruinThresholdPct = options?.ruinThresholdPct ?? 35;
  const minTrades = options?.minTrades ?? 10;
  const elapsedYears = options?.elapsedYears ?? 1;

  if (!trades || trades.length < minTrades || initialCapital <= 0) {
    return {
      available: false,
      reason: `Campione insufficiente (${trades?.length ?? 0} trade < ${minTrades} minimi) per una simulazione Monte Carlo affidabile.`,
      iterations: 0,
      seed,
      sampleTrades: trades?.length ?? 0,
      maxDrawdownP50Pct: null,
      maxDrawdownP95Pct: null,
      ruinProbabilityPct: null,
      terminalReturnP05Pct: null,
      terminalReturnP50Pct: null,
      terminalReturnP95Pct: null,
      cagrP05Pct: null,
      cagrP50Pct: null,
      cagrP95Pct: null,
      lossProbabilityPct: null,
    };
  }

  const rng = createMulberry32(seed);
  const pnls = trades.map((t) => t.pnlAmount);
  const n = pnls.length;

  const permMaxDds: number[] = [];
  let ruinCount = 0;

  const bootReturns: number[] = [];
  const bootCagrs: number[] = [];
  let lossCount = 0;

  for (let s = 0; s < iterations; s++) {
    // 1. Sequence Permutation (exact same trade set, shuffled order)
    const shuffled = fisherYatesShuffle(pnls, rng);
    let eq = initialCapital;
    let peak = initialCapital;
    let worstDd = 0;

    for (let i = 0; i < n; i++) {
      eq = Math.max(0.01, eq + shuffled[i]);
      if (eq > peak) peak = eq;
      const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 100;
      if (dd > worstDd) worstDd = dd;
    }
    permMaxDds.push(worstDd);
    if (worstDd >= ruinThresholdPct) ruinCount++;

    // 2. Bootstrap Resampling with Replacement (sampling uncertainty of returns/CAGR)
    let bootEq = initialCapital;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      bootEq = Math.max(0.01, bootEq + pnls[idx]);
    }
    const retPct = ((bootEq - initialCapital) / initialCapital) * 100;
    bootReturns.push(retPct);
    if (retPct < 0) lossCount++;

    const cagr =
      elapsedYears >= 0.08
        ? (Math.pow(Math.max(0.001, bootEq / initialCapital), 1 / elapsedYears) - 1) * 100
        : retPct;
    bootCagrs.push(Math.max(-99.9, Math.min(1000, cagr)));
  }

  permMaxDds.sort((a, b) => a - b);
  bootReturns.sort((a, b) => a - b);
  bootCagrs.sort((a, b) => a - b);

  return {
    available: true,
    iterations,
    seed,
    sampleTrades: n,
    maxDrawdownP50Pct: parseFloat(percentile(permMaxDds, 0.5).toFixed(2)),
    maxDrawdownP95Pct: parseFloat(percentile(permMaxDds, 0.95).toFixed(2)),
    ruinProbabilityPct: parseFloat(((ruinCount / iterations) * 100).toFixed(1)),
    terminalReturnP05Pct: parseFloat(percentile(bootReturns, 0.05).toFixed(2)),
    terminalReturnP50Pct: parseFloat(percentile(bootReturns, 0.5).toFixed(2)),
    terminalReturnP95Pct: parseFloat(percentile(bootReturns, 0.95).toFixed(2)),
    cagrP05Pct: parseFloat(percentile(bootCagrs, 0.05).toFixed(2)),
    cagrP50Pct: parseFloat(percentile(bootCagrs, 0.5).toFixed(2)),
    cagrP95Pct: parseFloat(percentile(bootCagrs, 0.95).toFixed(2)),
    lossProbabilityPct: parseFloat(((lossCount / iterations) * 100).toFixed(1)),
  };
}

// ============================================================================
// Chronological Walk-Forward Analysis (Rolling Train -> OOS Windows)
// ============================================================================
export interface WalkForwardWindowResult {
  windowIndex: number;
  trainStartDate: string;
  trainEndDate: string;
  oosStartDate: string;
  oosEndDate: string;
  trainReturnPct: number;
  oosReturnPct: number;
  oosTrades: number;
  oosMaxDrawdownPct: number;
}

export interface WalkForwardSummary {
  available: boolean;
  windowsCount: number;
  positiveOosWindows: number;
  efficiencyPct: number;
  avgOosReturnPct: number;
  windows: WalkForwardWindowResult[];
}

export function runWalkForwardAnalysis(
  bars: Bar[],
  evaluateSlice: (sliceBars: Bar[]) => { totalReturnPct: number; totalTrades: number; maxDrawdownPct: number },
  options?: { numWindows?: number; trainFraction?: number; minBarsPerWindow?: number }
): WalkForwardSummary {
  const numWindows = Math.max(2, Math.min(8, options?.numWindows ?? 4));
  const trainFraction = Math.max(0.5, Math.min(0.85, options?.trainFraction ?? 0.7));
  const minBarsPerWindow = options?.minBarsPerWindow ?? 60;

  if (!bars || bars.length < minBarsPerWindow * numWindows) {
    return {
      available: false,
      windowsCount: 0,
      positiveOosWindows: 0,
      efficiencyPct: 0,
      avgOosReturnPct: 0,
      windows: [],
    };
  }

  const windowSize = Math.floor(bars.length / numWindows);
  const windows: WalkForwardWindowResult[] = [];
  let positiveOos = 0;
  let oosReturnSum = 0;

  for (let w = 0; w < numWindows; w++) {
    const startIdx = w * windowSize;
    const endIdx = w === numWindows - 1 ? bars.length : (w + 1) * windowSize;
    const slice = bars.slice(startIdx, endIdx);
    const splitIdx = Math.floor(slice.length * trainFraction);
    if (splitIdx < 20 || slice.length - splitIdx < 15) continue;

    const trainSlice = slice.slice(0, splitIdx);
    const oosSlice = slice.slice(splitIdx);

    const trainRes = evaluateSlice(trainSlice);
    const oosRes = evaluateSlice(oosSlice);

    if (oosRes.totalReturnPct > 0) positiveOos++;
    oosReturnSum += oosRes.totalReturnPct;

    windows.push({
      windowIndex: w + 1,
      trainStartDate: trainSlice[0].dateStr,
      trainEndDate: trainSlice[trainSlice.length - 1].dateStr,
      oosStartDate: oosSlice[0].dateStr,
      oosEndDate: oosSlice[oosSlice.length - 1].dateStr,
      trainReturnPct: trainRes.totalReturnPct,
      oosReturnPct: oosRes.totalReturnPct,
      oosTrades: oosRes.totalTrades,
      oosMaxDrawdownPct: oosRes.maxDrawdownPct,
    });
  }

  const count = windows.length;
  return {
    available: count >= 2,
    windowsCount: count,
    positiveOosWindows: positiveOos,
    efficiencyPct: count > 0 ? Math.round((positiveOos / count) * 100) : 0,
    avgOosReturnPct: count > 0 ? parseFloat((oosReturnSum / count).toFixed(2)) : 0,
    windows,
  };
}

/**
 * Helper to slice an equity curve and its trades by split label ('TRAIN' | 'VAL' | 'OOS')
 * and compute TRUE independent metrics strictly from that split's equity trajectory.
 */
export function computeSplitIndependentMetrics(
  equityCurve: EquityPoint[],
  trades: Trade[],
  splitType: 'TRAIN' | 'VAL' | 'OOS',
  timeframe: Timeframe
): {
  totalReturnPct: number;
  cagrPct: number;
  maxDrawdownPct: number;
  avgDrawdownPct: number;
  maxDrawdownDurationDays: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  recoveryFactor: number;
  volatilityPct: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number;
  profitFactor: number;
  expectancy: number;
  expectancyPct: number;
} {
  const splitEquity = equityCurve.filter((pt) => pt.splitType === splitType);
  const splitTrades = trades.filter((t) => t.splitType === splitType);

  const dd = computeDrawdownStats(splitEquity);
  const periodic = computePeriodicReturnMetrics(splitEquity, timeframe);
  const tradeStats = computeTradeStats(splitTrades, splitEquity.length, 0);

  return {
    totalReturnPct: periodic.totalReturnPct,
    cagrPct: periodic.cagrPct,
    maxDrawdownPct: dd.maxDrawdownPct,
    avgDrawdownPct: dd.avgDrawdownPct,
    maxDrawdownDurationDays: dd.maxDrawdownDurationDays,
    sharpeRatio: periodic.sharpeRatio,
    sortinoRatio: periodic.sortinoRatio,
    calmarRatio: periodic.calmarRatio,
    recoveryFactor: periodic.recoveryFactor,
    volatilityPct: periodic.volatilityPct,
    totalTrades: tradeStats.totalTrades,
    winningTrades: tradeStats.winningTrades,
    losingTrades: tradeStats.losingTrades,
    winRatePct: tradeStats.winRatePct,
    profitFactor: tradeStats.profitFactor,
    expectancy: tradeStats.expectancy,
    expectancyPct: tradeStats.expectancyPct,
  };
}
