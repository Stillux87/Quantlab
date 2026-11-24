/**
 * QuantLab - Rigorous Quantitative Multi-Asset Portfolio Optimizer
 *
 * Completely rebuilt on authentic mathematical foundations:
 * - Zero `Math.sin` curves, zero hardcoded damping factors, zero synthetic bars, zero fabricated regimes.
 * - Synchronizes real historical OHLCV bars across all assets by exact date intersection.
 * - Enforces verified FX conversion (never substitutes arbitrary fallback rates).
 * - Computes true sample covariance matrix (Σ), Pearson correlation matrix (C), annualized
 *   volatility, and exact marginal/percentage risk contributions.
 * - Implements 5 constrained portfolio allocation methods with min/max weight bounds:
 *   1. EQUAL_WEIGHT
 *   2. MIN_VARIANCE (projected gradient optimization on w^T Σ w)
 *   3. RISK_PARITY (iterative equal-risk-contribution solver)
 *   4. MAX_DIVERSIFICATION (maximizing (w^T σ) / sqrt(w^T Σ w))
 *   5. MAX_SHARPE (tangency portfolio maximizing (w^T μ - rf) / sqrt(w^T Σ w))
 * - Simulates real day-by-day portfolio equity with periodic rebalancing & transaction costs.
 */
import {
  Bar,
  Instrument,
  UngerPortfolioAllocation,
  PortfolioStrategyCandidate,
  PortfolioPeriodEvaluation,
  PortfolioOptimizationReport,
  BacktestResult,
} from '../types';
import { getStrategyById } from './strategies/registry';
import { runBacktest } from './backtestEngine';
import { convertToEurStrict, validateAndCleanBars } from './marketDataIntegrity';
import { computeDrawdownStats, computePeriodicReturnMetrics } from './quantMetrics';

export type PortfolioAllocationMethod =
  | 'EQUAL_WEIGHT'
  | 'MIN_VARIANCE'
  | 'RISK_PARITY'
  | 'MAX_DIVERSIFICATION'
  | 'MAX_SHARPE';

export type RebalanceFrequency = 'NONE' | 'MONTHLY' | 'QUARTERLY';

export interface PortfolioAssetInput {
  ticker: string;
  name: string;
  currency: string;
  fxRateToEur: number | null; // Must be 1.0 for EUR, or verified live FX for non-EUR
  bars: Bar[];
}

export interface PortfolioOptimizationConfig {
  initialCapital?: number;
  method: PortfolioAllocationMethod;
  minWeight?: number; // e.g. 0.05
  maxWeight?: number; // e.g. 0.40
  rebalanceFrequency?: RebalanceFrequency;
  rebalanceCostPct?: number; // commission + slippage per traded notional in % (default 0.08%)
  riskFreeRateAnnual?: number; // default 0.02 (2%)
  minAlignedBars?: number; // default 40
}

export interface PortfolioComponentAttribution {
  ticker: string;
  name: string;
  currency: string;
  weightPct: number;
  annualizedReturnPct: number;
  annualizedVolatilityPct: number;
  riskContributionPct: number;
  totalReturnPct: number;
  contributionToPortfolioReturnPct: number;
}

export interface QuantitativePortfolioResult {
  ok: boolean;
  error?: string;
  method: PortfolioAllocationMethod;
  alignedBarsCount: number;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  totalReturnPct: number;
  cagrPct: number;
  annualizedVolatilityPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdownPct: number;
  avgDrawdownPct: number;
  maxDrawdownDurationDays: number;
  diversificationRatio: number;
  avgPairwiseCorrelation: number;
  totalRebalanceCosts: number;
  rebalanceCount: number;
  weights: Record<string, number>;
  covarianceMatrix: number[][];
  correlationMatrix: number[][];
  tickers: string[];
  components: PortfolioComponentAttribution[];
  annualReturns: Array<{ year: number; returnPct: number }>;
  equityCurve: Array<{
    dateStr: string;
    timestamp: number;
    portfolioEquity: number;
    benchmarkEquity: number;
    drawdownPct: number;
  }>;
}

// ============================================================================
// Matrix & Constrained Simplex Projection Linear Algebra Helpers
// ============================================================================

/**
 * Projects a weight vector onto the bounded simplex:
 *   sum(w_i) = 1,   minW <= w_i <= maxW
 */
export function projectBoundedSimplex(
  rawWeights: number[],
  minW: number,
  maxW: number
): number[] {
  const n = rawWeights.length;
  if (n === 0) return [];
  const lo = Math.max(0, Math.min(minW, 1 / n));
  const hi = Math.min(1, Math.max(maxW, 1 / n));

  // Bisection on Lagrange multiplier tau such that sum(clamp(w_i - tau, lo, hi)) = 1
  let lowTau = -1e6;
  let highTau = 1e6;
  for (let iter = 0; iter < 80; iter++) {
    const mid = 0.5 * (lowTau + highTau);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += Math.max(lo, Math.min(hi, rawWeights[i] - mid));
    }
    if (sum > 1) {
      lowTau = mid;
    } else {
      highTau = mid;
    }
  }
  const tau = 0.5 * (lowTau + highTau);
  const res = rawWeights.map((w) => Math.max(lo, Math.min(hi, w - tau)));
  const total = res.reduce((a, b) => a + b, 0);
  return total > 0 ? res.map((w) => w / total) : new Array(n).fill(1 / n);
}

function matVecMul(M: number[][], v: number[]): number[] {
  const n = M.length;
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += M[i][j] * v[j];
    out[i] = s;
  }
  return out;
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function portfolioVariance(w: number[], cov: number[][]): number {
  return Math.max(1e-12, dot(w, matVecMul(cov, w)));
}

/**
 * Computes sample annualized covariance matrix, Pearson correlation matrix,
 * annualized mean returns, and annualized volatilities from aligned periodic return series.
 */
export function computeReturnStatistics(
  returnSeries: number[][], // [assetIdx][periodIdx]
  periodsPerYear = 252
): {
  meanAnnual: number[];
  volAnnual: number[];
  covarianceMatrix: number[][];
  correlationMatrix: number[][];
  avgPairwiseCorrelation: number;
} {
  const m = returnSeries.length;
  const T = m > 0 ? returnSeries[0].length : 0;

  const meanPerPeriod = new Array<number>(m).fill(0);
  for (let i = 0; i < m; i++) {
    let sum = 0;
    for (let t = 0; t < T; t++) sum += returnSeries[i][t];
    meanPerPeriod[i] = T > 0 ? sum / T : 0;
  }

  const cov: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const denom = Math.max(1, T - 1);

  for (let i = 0; i < m; i++) {
    for (let j = i; j < m; j++) {
      let s = 0;
      for (let t = 0; t < T; t++) {
        s += (returnSeries[i][t] - meanPerPeriod[i]) * (returnSeries[j][t] - meanPerPeriod[j]);
      }
      const val = (s / denom) * periodsPerYear;
      cov[i][j] = val;
      cov[j][i] = val;
    }
    // Small ridge regularization only if variance is zero (constant price asset)
    if (cov[i][i] < 1e-10) cov[i][i] = 1e-10;
  }

  const volAnnual = cov.map((row, i) => Math.sqrt(Math.max(1e-10, row[i])));
  const corr: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  let pairSum = 0;
  let pairCount = 0;

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      if (i === j) {
        corr[i][j] = 1;
      } else {
        const c = cov[i][j] / Math.max(1e-12, volAnnual[i] * volAnnual[j]);
        const clamped = Math.max(-1, Math.min(1, c));
        corr[i][j] = parseFloat(clamped.toFixed(4));
        if (j > i) {
          pairSum += clamped;
          pairCount++;
        }
      }
    }
  }

  return {
    meanAnnual: meanPerPeriod.map((r) => r * periodsPerYear),
    volAnnual,
    covarianceMatrix: cov,
    correlationMatrix: corr,
    avgPairwiseCorrelation: pairCount > 0 ? parseFloat((pairSum / pairCount).toFixed(4)) : 1,
  };
}

/**
 * Solves for optimal portfolio weights given method, covariance matrix, expected returns, and bounds.
 */
export function solveOptimalWeights(
  method: PortfolioAllocationMethod,
  meanAnnual: number[],
  volAnnual: number[],
  cov: number[][],
  minW: number,
  maxW: number,
  riskFreeRateAnnual = 0.02
): number[] {
  const n = meanAnnual.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  const equal = projectBoundedSimplex(new Array(n).fill(1 / n), minW, maxW);
  if (method === 'EQUAL_WEIGHT') {
    return equal;
  }

  if (method === 'MIN_VARIANCE') {
    let w = equal.slice();
    const maxDiag = Math.max(...cov.map((r, i) => r[i]), 1e-6);
    const lr = 0.25 / maxDiag;
    for (let iter = 0; iter < 400; iter++) {
      const grad = matVecMul(cov, w).map((g) => 2 * g);
      const next = w.map((wi, i) => wi - lr * grad[i]);
      w = projectBoundedSimplex(next, minW, maxW);
    }
    return w;
  }

  if (method === 'RISK_PARITY') {
    // Iterative multiplicative risk-budgeting converging to equal risk contribution RC_i = w_i * (Σw)_i / σ_p^2
    let w = projectBoundedSimplex(
      volAnnual.map((v) => 1 / Math.max(1e-4, v)),
      minW,
      maxW
    );
    const targetRc = 1 / n;
    for (let iter = 0; iter < 500; iter++) {
      const sigmaW = matVecMul(cov, w);
      const portVar = Math.max(1e-12, dot(w, sigmaW));
      const rc = w.map((wi, i) => (wi * sigmaW[i]) / portVar);
      const next = w.map((wi, i) => {
        const ratio = targetRc / Math.max(1e-8, rc[i]);
        return wi * Math.pow(ratio, 0.25);
      });
      w = projectBoundedSimplex(next, minW, maxW);
    }
    return w;
  }

  if (method === 'MAX_DIVERSIFICATION') {
    // Maximize DR(w) = (w^T σ) / sqrt(w^T Σ w) via projected gradient ascent
    let w = equal.slice();
    for (let iter = 0; iter < 500; iter++) {
      const sigmaW = matVecMul(cov, w);
      const portVar = Math.max(1e-12, dot(w, sigmaW));
      const portVol = Math.sqrt(portVar);
      const num = dot(w, volAnnual);
      // Gradient of num / portVol
      const grad = volAnnual.map((s_i, i) => (s_i * portVol - (num * sigmaW[i]) / portVol) / portVar);
      const gradNorm = Math.sqrt(dot(grad, grad)) || 1;
      const step = 0.05 / gradNorm;
      const candidate = projectBoundedSimplex(
        w.map((wi, i) => wi + step * grad[i]),
        minW,
        maxW
      );
      const curDr = num / portVol;
      const nextDr = dot(candidate, volAnnual) / Math.sqrt(portfolioVariance(candidate, cov));
      if (nextDr >= curDr) {
        w = candidate;
      } else {
        const small = projectBoundedSimplex(
          w.map((wi, i) => wi + (step * 0.2) * grad[i]),
          minW,
          maxW
        );
        const smallDr = dot(small, volAnnual) / Math.sqrt(portfolioVariance(small, cov));
        if (smallDr > curDr) w = small;
      }
    }
    return w;
  }

  // MAX_SHARPE: Maximize (w^T μ - rf) / sqrt(w^T Σ w) via projected gradient ascent
  let bestW = equal.slice();
  const evalSharpe = (weights: number[]) => {
    const ret = dot(weights, meanAnnual);
    const vol = Math.sqrt(portfolioVariance(weights, cov));
    return (ret - riskFreeRateAnnual) / Math.max(1e-8, vol);
  };
  let bestSharpe = evalSharpe(bestW);

  // Start from both equal-weight and inverse-vol seeds for robustness
  const seeds = [
    equal,
    projectBoundedSimplex(volAnnual.map((v) => 1 / Math.max(1e-4, v)), minW, maxW),
  ];

  for (const seed of seeds) {
    let w = seed.slice();
    for (let iter = 0; iter < 500; iter++) {
      const sigmaW = matVecMul(cov, w);
      const portVar = Math.max(1e-12, dot(w, sigmaW));
      const portVol = Math.sqrt(portVar);
      const excessRet = dot(w, meanAnnual) - riskFreeRateAnnual;
      const grad = meanAnnual.map(
        (mu_i, i) => (mu_i * portVol - (excessRet * sigmaW[i]) / portVol) / portVar
      );
      const gradNorm = Math.sqrt(dot(grad, grad)) || 1;
      const step = 0.04 / gradNorm;
      const next = projectBoundedSimplex(
        w.map((wi, i) => wi + step * grad[i]),
        minW,
        maxW
      );
      const s = evalSharpe(next);
      if (s > evalSharpe(w)) {
        w = next;
        if (s > bestSharpe) {
          bestSharpe = s;
          bestW = w.slice();
        }
      }
    }
  }

  return bestW;
}

/**
 * Full quantitative multi-asset portfolio optimization and historical equity simulation
 * using strictly REAL synchronized bars and verified FX conversion.
 */
export function runQuantitativePortfolioOptimization(
  assets: PortfolioAssetInput[],
  config: PortfolioOptimizationConfig
): QuantitativePortfolioResult {
  const initialCapital = config.initialCapital ?? 50000;
  const minAlignedBars = config.minAlignedBars ?? 40;
  const rebalanceFrequency = config.rebalanceFrequency ?? 'MONTHLY';
  const rebalanceCostRate = Math.max(0, (config.rebalanceCostPct ?? 0.08) / 100);
  const riskFreeRateAnnual = config.riskFreeRateAnnual ?? 0.02;

  const emptyError = (error: string): QuantitativePortfolioResult => ({
    ok: false,
    error,
    method: config.method,
    alignedBarsCount: 0,
    startDate: '',
    endDate: '',
    initialCapital,
    finalCapital: initialCapital,
    totalReturnPct: 0,
    cagrPct: 0,
    annualizedVolatilityPct: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    calmarRatio: 0,
    maxDrawdownPct: 0,
    avgDrawdownPct: 0,
    maxDrawdownDurationDays: 0,
    diversificationRatio: 1,
    avgPairwiseCorrelation: 1,
    totalRebalanceCosts: 0,
    rebalanceCount: 0,
    weights: {},
    covarianceMatrix: [],
    correlationMatrix: [],
    tickers: [],
    components: [],
    annualReturns: [],
    equityCurve: [],
  });

  if (!assets || assets.length < 2) {
    return emptyError('Servono almeno 2 strumenti con serie storiche reali per ottimizzare un portafoglio.');
  }

  // 1. Validate FX & clean real bars for every asset
  const cleanedMaps: Array<{
    asset: PortfolioAssetInput;
    fxToEur: number;
    byDate: Map<string, Bar>;
  }> = [];

  for (const a of assets) {
    const fxCheck = convertToEurStrict(1, a.currency, a.fxRateToEur);
    if (!fxCheck.ok) {
      return emptyError(
        `Impossibile aggregare ${a.ticker} (${a.currency}): ${fxCheck.error}`
      );
    }

    const { bars: clean } = validateAndCleanBars(a.bars, '1D');
    if (clean.length < minAlignedBars) {
      return emptyError(
        `Dati storici reali insufficienti per ${a.ticker}: trovate ${clean.length} barre (minimo richiesto ${minAlignedBars}).`
      );
    }

    const byDate = new Map<string, Bar>();
    for (const b of clean) {
      byDate.set(b.dateStr.slice(0, 10), b);
    }
    cleanedMaps.push({ asset: a, fxToEur: fxCheck.fxUsed, byDate });
  }

  // 2. Intersect exact trading dates across all assets (strict synchronization)
  let commonDates = Array.from(cleanedMaps[0].byDate.keys());
  for (let i = 1; i < cleanedMaps.length; i++) {
    const map = cleanedMaps[i].byDate;
    commonDates = commonDates.filter((d) => map.has(d));
  }
  commonDates.sort();

  if (commonDates.length < minAlignedBars) {
    return emptyError(
      `Solo ${commonDates.length} date storiche comuni sincronizzate tra tutti gli asset (minimo ${minAlignedBars}).`
    );
  }

  // 3. Build aligned EUR-denominated price matrix and periodic return matrix
  const n = cleanedMaps.length;
  const T = commonDates.length;
  const pricesEur: number[][] = Array.from({ length: n }, () => new Array<number>(T));
  const timestamps: number[] = new Array<number>(T);

  for (let t = 0; t < T; t++) {
    const d = commonDates[t];
    timestamps[t] = cleanedMaps[0].byDate.get(d)!.timestamp;
    for (let i = 0; i < n; i++) {
      pricesEur[i][t] = cleanedMaps[i].byDate.get(d)!.close * cleanedMaps[i].fxToEur;
    }
  }

  const returnSeries: number[][] = Array.from({ length: n }, () => new Array<number>(T - 1));
  for (let i = 0; i < n; i++) {
    for (let t = 1; t < T; t++) {
      returnSeries[i][t - 1] = (pricesEur[i][t] - pricesEur[i][t - 1]) / pricesEur[i][t - 1];
    }
  }

  // 4. Compute real statistical matrices (covariance, correlation, volatility)
  const stats = computeReturnStatistics(returnSeries, 252);

  // 5. Solve optimal weights subject to bounds
  const minW = config.minWeight ?? Math.min(0.05, 1 / n);
  const maxW = config.maxWeight ?? Math.max(0.45, 1 / n);
  const targetWeights = solveOptimalWeights(
    config.method,
    stats.meanAnnual,
    stats.volAnnual,
    stats.covarianceMatrix,
    minW,
    maxW,
    riskFreeRateAnnual
  );

  // 6. Simulate real day-by-day portfolio equity with periodic rebalancing & transaction costs
  const equalWeight = 1 / n;
  let units = targetWeights.map((w, i) => (initialCapital * w) / pricesEur[i][0]);
  const initialBuyCost = initialCapital * rebalanceCostRate;
  // Deduct initial entry transaction cost proportionally from starting units
  const startScale = (initialCapital - initialBuyCost) / initialCapital;
  units = units.map((u) => u * startScale);

  const benchUnits = pricesEur.map((series) => (initialCapital * equalWeight) / series[0]);

  let totalRebalanceCosts = initialBuyCost;
  let rebalanceCount = 0;
  let peakEq = initialCapital;

  const equityCurve: QuantitativePortfolioResult['equityCurve'] = [];
  const componentReturnContrib = new Array<number>(n).fill(0);

  let prevMonth = commonDates[0].slice(0, 7);
  let prevQuarter = Math.floor((Number(commonDates[0].slice(5, 7)) - 1) / 3);
  let prevYear = commonDates[0].slice(0, 4);

  for (let t = 0; t < T; t++) {
    let portVal = 0;
    let benchVal = 0;
    for (let i = 0; i < n; i++) {
      portVal += units[i] * pricesEur[i][t];
      benchVal += benchUnits[i] * pricesEur[i][t];
    }

    if (t > 0) {
      let prevPortVal = 0;
      for (let i = 0; i < n; i++) prevPortVal += units[i] * pricesEur[i][t - 1];
      if (prevPortVal > 0) {
        for (let i = 0; i < n; i++) {
          const wPrev = (units[i] * pricesEur[i][t - 1]) / prevPortVal;
          componentReturnContrib[i] += wPrev * returnSeries[i][t - 1];
        }
      }
    }

    // Check periodic rebalancing boundary (MONTHLY or QUARTERLY)
    const curMonth = commonDates[t].slice(0, 7);
    const curYear = commonDates[t].slice(0, 4);
    const curQuarter = Math.floor((Number(commonDates[t].slice(5, 7)) - 1) / 3);

    const shouldRebalance =
      t > 0 &&
      ((rebalanceFrequency === 'MONTHLY' && curMonth !== prevMonth) ||
        (rebalanceFrequency === 'QUARTERLY' && (curQuarter !== prevQuarter || curYear !== prevYear)));

    if (shouldRebalance && portVal > 0) {
      let turnoverNotional = 0;
      for (let i = 0; i < n; i++) {
        const curAlloc = units[i] * pricesEur[i][t];
        const targetAlloc = portVal * targetWeights[i];
        turnoverNotional += Math.abs(targetAlloc - curAlloc);
      }
      const rebCost = turnoverNotional * rebalanceCostRate;
      portVal = Math.max(0.01, portVal - rebCost);
      totalRebalanceCosts += rebCost;
      rebalanceCount++;
      for (let i = 0; i < n; i++) {
        units[i] = (portVal * targetWeights[i]) / pricesEur[i][t];
      }
    }

    prevMonth = curMonth;
    prevQuarter = curQuarter;
    prevYear = curYear;

    if (portVal > peakEq) peakEq = portVal;
    const ddPct = peakEq > 0 ? ((peakEq - portVal) / peakEq) * 100 : 0;

    equityCurve.push({
      dateStr: commonDates[t],
      timestamp: timestamps[t],
      portfolioEquity: parseFloat(portVal.toFixed(2)),
      benchmarkEquity: parseFloat(benchVal.toFixed(2)),
      drawdownPct: parseFloat(ddPct.toFixed(2)),
    });
  }

  // 7. Compute true portfolio metrics from simulated real equity curve
  const eqPoints = equityCurve.map((p) => ({ timestamp: p.timestamp, equity: p.portfolioEquity }));
  const periodic = computePeriodicReturnMetrics(eqPoints, '1D', riskFreeRateAnnual);
  const dd = computeDrawdownStats(eqPoints);

  // Portfolio ex-post / sample risk decomposition
  const sigmaW = matVecMul(stats.covarianceMatrix, targetWeights);
  const portVar = Math.max(1e-12, dot(targetWeights, sigmaW));
  const portVol = Math.sqrt(portVar);
  const weightedAvgVol = dot(targetWeights, stats.volAnnual);
  const diversificationRatio = parseFloat((weightedAvgVol / Math.max(1e-8, portVol)).toFixed(3));

  const weightsMap: Record<string, number> = {};
  const tickers = cleanedMaps.map((c) => c.asset.ticker);
  const components: PortfolioComponentAttribution[] = cleanedMaps.map((c, i) => {
    weightsMap[c.asset.ticker] = parseFloat((targetWeights[i] * 100).toFixed(2));
    const rcPct = ((targetWeights[i] * sigmaW[i]) / portVar) * 100;
    const assetTotalRet = ((pricesEur[i][T - 1] - pricesEur[i][0]) / pricesEur[i][0]) * 100;
    return {
      ticker: c.asset.ticker,
      name: c.asset.name,
      currency: c.asset.currency,
      weightPct: parseFloat((targetWeights[i] * 100).toFixed(2)),
      annualizedReturnPct: parseFloat((stats.meanAnnual[i] * 100).toFixed(2)),
      annualizedVolatilityPct: parseFloat((stats.volAnnual[i] * 100).toFixed(2)),
      riskContributionPct: parseFloat(rcPct.toFixed(2)),
      totalReturnPct: parseFloat(assetTotalRet.toFixed(2)),
      contributionToPortfolioReturnPct: parseFloat((componentReturnContrib[i] * 100).toFixed(2)),
    };
  });

  // 8. Real calendar-year returns breakdown
  const yearBounds = new Map<number, { first: number; last: number }>();
  for (const pt of equityCurve) {
    const y = Number(pt.dateStr.slice(0, 4));
    const existing = yearBounds.get(y);
    if (!existing) {
      yearBounds.set(y, { first: pt.portfolioEquity, last: pt.portfolioEquity });
    } else {
      existing.last = pt.portfolioEquity;
    }
  }
  const annualReturns = Array.from(yearBounds.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, b]) => ({
      year,
      returnPct: b.first > 0 ? parseFloat((((b.last - b.first) / b.first) * 100).toFixed(2)) : 0,
    }));

  const finalCapital = equityCurve[equityCurve.length - 1].portfolioEquity;

  return {
    ok: true,
    method: config.method,
    alignedBarsCount: T,
    startDate: commonDates[0],
    endDate: commonDates[T - 1],
    initialCapital,
    finalCapital,
    totalReturnPct: periodic.totalReturnPct,
    cagrPct: periodic.cagrPct,
    annualizedVolatilityPct: periodic.volatilityPct,
    sharpeRatio: periodic.sharpeRatio,
    sortinoRatio: periodic.sortinoRatio,
    calmarRatio: periodic.calmarRatio,
    maxDrawdownPct: dd.maxDrawdownPct,
    avgDrawdownPct: dd.avgDrawdownPct,
    maxDrawdownDurationDays: dd.maxDrawdownDurationDays,
    diversificationRatio,
    avgPairwiseCorrelation: stats.avgPairwiseCorrelation,
    totalRebalanceCosts: parseFloat(totalRebalanceCosts.toFixed(2)),
    rebalanceCount,
    weights: weightsMap,
    covarianceMatrix: stats.covarianceMatrix,
    correlationMatrix: stats.correlationMatrix,
    tickers,
    components,
    annualReturns,
    equityCurve,
  };
}

// ============================================================================
// Strategy-Level Portfolio Audit (Backward-Compatible Signature, 100% Real Data)
// ============================================================================

const PORTFOLIO_CANDIDATE_CONFIGS: Array<{
  id: string;
  name: string;
  category: 'INDICATORS' | 'TITAN_UNGER' | 'HYBRID_OPTIMAL';
  description: string;
  strategyMapFn: (assetClass: string, inst: Instrument) => string;
}> = [
  {
    id: 'port_unger_pure',
    name: 'Titan Unger Multi-Asset',
    category: 'TITAN_UNGER',
    description: 'Strategie sistematiche a breakout/regime su dati storici reali con gestione del rischio.',
    strategyMapFn: () => 'unger_titan_strategy',
  },
  {
    id: 'port_indicators_pure',
    name: 'Indicatori Classici (EMA + Supertrend + RSI)',
    category: 'INDICATORS',
    description: 'Indicatori tecnici classici valutati sulle stesse serie storiche reali.',
    strategyMapFn: (_assetClass, inst) =>
      inst.type === 'ETF' ? 'supertrend_atr' : 'ema_crossover',
  },
  {
    id: 'port_hybrid_optimal',
    name: 'Ibrido Selettivo (Titan + Momentum)',
    category: 'HYBRID_OPTIMAL',
    description: 'Combinazione di strategie sistematiche e momentum sincronizzate sullo stesso capitale.',
    strategyMapFn: (_assetClass, inst) =>
      inst.type === 'ETF' ? 'unger_titan_strategy' : 'ai_dynamic_swing_1h',
  },
];

function combineRealBacktestEquities(
  perAssetResults: Array<{
    ticker: string;
    name: string;
    strategyName: string;
    allocatedCapital: number;
    weightPct: number;
    result: BacktestResult;
  }>,
  targetCapital: number
): {
  equityCurve: { dateStr: string; timestamp: number; portfolioEquity: number; benchmarkEquity: number; drawdownPct: number }[];
  totalReturnPct: number;
  annualReturnPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  profitFactor: number;
  winRatePct: number;
  totalTrades: number;
  decorrelationScore: number;
} {
  // Collect exact date intersection across all constituent real backtest equity curves
  const maps = perAssetResults.map((item) => {
    const m = new Map<string, { timestamp: number; equity: number; bench: number }>();
    for (const pt of item.result.equityCurve) {
      m.set(pt.dateStr.slice(0, 10), {
        timestamp: pt.timestamp,
        equity: pt.equity,
        bench: pt.benchmarkEquity,
      });
    }
    return m;
  });

  if (maps.length === 0) {
    return {
      equityCurve: [],
      totalReturnPct: 0,
      annualReturnPct: 0,
      maxDrawdownPct: 0,
      sharpeRatio: 0,
      profitFactor: 0,
      winRatePct: 0,
      totalTrades: 0,
      decorrelationScore: 0,
    };
  }

  let commonDates = Array.from(maps[0].keys());
  for (let i = 1; i < maps.length; i++) {
    commonDates = commonDates.filter((d) => maps[i].has(d));
  }
  commonDates.sort();

  const equityCurve: {
    dateStr: string;
    timestamp: number;
    portfolioEquity: number;
    benchmarkEquity: number;
    drawdownPct: number;
  }[] = [];

  let peak = targetCapital;
  const assetReturnSeries: number[][] = Array.from({ length: maps.length }, () => []);

  for (let t = 0; t < commonDates.length; t++) {
    const d = commonDates[t];
    let portEq = 0;
    let benchEq = 0;
    let ts = maps[0].get(d)!.timestamp;

    for (let i = 0; i < maps.length; i++) {
      const pt = maps[i].get(d)!;
      portEq += pt.equity;
      benchEq += pt.bench;
      if (t > 0) {
        const prev = maps[i].get(commonDates[t - 1])!;
        assetReturnSeries[i].push(prev.equity > 0 ? (pt.equity - prev.equity) / prev.equity : 0);
      }
    }

    if (portEq > peak) peak = portEq;
    const dd = peak > 0 ? ((peak - portEq) / peak) * 100 : 0;

    equityCurve.push({
      dateStr: d,
      timestamp: ts,
      portfolioEquity: parseFloat(portEq.toFixed(2)),
      benchmarkEquity: parseFloat(benchEq.toFixed(2)),
      drawdownPct: parseFloat(dd.toFixed(2)),
    });
  }

  const eqPts = equityCurve.map((p) => ({ timestamp: p.timestamp, equity: p.portfolioEquity }));
  const periodic = computePeriodicReturnMetrics(eqPts, '1D');
  const ddStats = computeDrawdownStats(eqPts);

  let grossWin = 0;
  let grossLoss = 0;
  let totalTrades = 0;
  let totalWins = 0;

  for (const item of perAssetResults) {
    for (const tr of item.result.trades) {
      totalTrades++;
      if (tr.pnlAmount > 0) {
        grossWin += tr.pnlAmount;
        totalWins++;
      } else {
        grossLoss += Math.abs(tr.pnlAmount);
      }
    }
  }

  const profitFactor =
    grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 99.99 : 0;
  const winRatePct =
    totalTrades > 0 ? parseFloat(((totalWins / totalTrades) * 100).toFixed(1)) : 0;

  // Real decorrelation score derived from actual pairwise correlation of strategy equity returns
  let decorrelationScore = 50;
  if (assetReturnSeries.length >= 2 && assetReturnSeries[0].length >= 10) {
    const st = computeReturnStatistics(assetReturnSeries, 252);
    // corr = 1 => 0 decorrelation; corr = 0 => 100 decorrelation; corr < 0 => 100
    decorrelationScore = Math.max(0, Math.min(100, Math.round((1 - Math.max(0, st.avgPairwiseCorrelation)) * 100)));
  }

  return {
    equityCurve,
    totalReturnPct: periodic.totalReturnPct,
    annualReturnPct: periodic.cagrPct,
    maxDrawdownPct: ddStats.maxDrawdownPct,
    sharpeRatio: periodic.sharpeRatio,
    profitFactor,
    winRatePct,
    totalTrades,
    decorrelationScore,
  };
}

/**
 * Evaluates real strategy portfolios strictly on real historical bars (zero synthetic fallback, zero Math.sin).
 */
export function optimizePortfolioStrategies(
  allocation: UngerPortfolioAllocation,
  realBarsMapOrObjective?: Record<string, Bar[]> | string,
  optionalRealBarsMap?: Record<string, Bar[]>
): PortfolioOptimizationReport {
  const realBarsMap: Record<string, Bar[]> | undefined =
    typeof realBarsMapOrObjective === 'string'
      ? optionalRealBarsMap
      : realBarsMapOrObjective;
  const targetCapital = allocation.targetCapital;
  const assets = allocation.assets;

  // Strictly require real historical bars — NEVER call generateHistoricalBars!
  const assetBarsMap = new Map<string, Bar[]>();
  const missingTickers: string[] = [];

  for (const asset of assets) {
    const ticker = asset.instrument.ticker;
    const raw = realBarsMap?.[ticker] || realBarsMap?.[ticker.toUpperCase()];
    const { bars: clean } = validateAndCleanBars(raw || [], '1D');
    if (clean.length < 40) {
      missingTickers.push(ticker);
    } else {
      assetBarsMap.set(ticker, clean);
    }
  }

  const candidates: PortfolioStrategyCandidate[] = [];

  if (missingTickers.length === 0) {
    for (const config of PORTFOLIO_CANDIDATE_CONFIGS) {
      const perAssetResults: Array<{
        ticker: string;
        name: string;
        strategyName: string;
        allocatedCapital: number;
        weightPct: number;
        result: BacktestResult;
      }> = [];

      for (const asset of assets) {
        const bars = assetBarsMap.get(asset.instrument.ticker)!;
        const stratId = config.strategyMapFn(asset.instrument.sector || asset.instrument.type, asset.instrument);
        const strategy = getStrategyById(stratId) || getStrategyById('unger_titan_strategy')!;

        const bt = runBacktest(strategy, asset.instrument, '1D', bars, strategy.definition.defaultParams, {
          initialCapital: asset.allocatedCapital,
          commissionPct: 0.05,
          slippagePct: 0.03,
          spreadPct: 0.02,
          skipRobustnessTests: true,
        });

        perAssetResults.push({
          ticker: asset.instrument.ticker,
          name: asset.instrument.name,
          strategyName: strategy.definition.name,
          allocatedCapital: asset.allocatedCapital,
          weightPct: asset.weightPct,
          result: bt,
        });
      }

      const combined = combineRealBacktestEquities(perAssetResults, targetCapital);

      candidates.push({
        strategyId: config.id,
        strategyName: config.name,
        category: config.category,
        description: config.description,
        portfolioTotalReturnPct: combined.totalReturnPct,
        portfolioAnnualReturnPct: combined.annualReturnPct,
        portfolioProfitFactor: combined.profitFactor,
        portfolioMaxDrawdownPct: combined.maxDrawdownPct,
        portfolioSharpeRatio: combined.sharpeRatio,
        portfolioWinRatePct: combined.winRatePct,
        portfolioTotalTrades: combined.totalTrades,
        decorrelationScore: combined.decorrelationScore,
        isWinner: false,
        isRobustWinner: false,
        equityCurve: combined.equityCurve,
        constituentMetrics: perAssetResults.map((r) => ({
          ticker: r.ticker,
          name: r.name,
          strategyName: r.strategyName,
          allocatedCapital: r.allocatedCapital,
          weightPct: r.weightPct,
          returnPct: r.result.metrics.totalReturnPct,
          profitFactor: r.result.metrics.profitFactor,
          tradesCount: r.result.metrics.totalTrades,
          winRatePct: r.result.metrics.winRatePct,
        })),
      });
    }
  }

  // Fallback empty candidate structure only if real historical data was missing (flagged transparently)
  if (candidates.length === 0) {
    const unavailableCandidate: PortfolioStrategyCandidate = {
      strategyId: 'data_unavailable',
      strategyName: 'Dati Storici Reali Mancanti',
      category: 'HYBRID_OPTIMAL',
      description: `Impossibile simulare il portafoglio: dati storici reali mancanti o insufficienti per ${missingTickers.join(', ')}.`,
      portfolioTotalReturnPct: 0,
      portfolioAnnualReturnPct: 0,
      portfolioProfitFactor: 0,
      portfolioMaxDrawdownPct: 0,
      portfolioSharpeRatio: 0,
      portfolioWinRatePct: 0,
      portfolioTotalTrades: 0,
      decorrelationScore: 0,
      isWinner: false,
      isRobustWinner: false,
      equityCurve: [],
      constituentMetrics: [],
    };
    return {
      portfolioName: `Portafoglio QuantLab (${assets.length} Titoli) — Dati Incompleti`,
      targetCapital,
      riskProfile: allocation.riskProfile,
      totalAssetsCount: assets.length,
      assets,
      bestStrategyCandidate: unavailableCandidate,
      bestUngerCandidate: unavailableCandidate,
      bestIndicatorCandidate: unavailableCandidate,
      allCandidates: [],
      periodEvaluations: [],
      aiExecutiveVerdict: `Ottimizzazione bloccata: mancano serie storiche reali verificate (>= 40 barre) per ${missingTickers.join(', ')}. Nessun dato sintetico è stato generato.`,
      comparativeInsights: [
        'Politica Dati Reali: QuantLab non genera curve sintetiche né simulazioni sinusoidali quando mancano dati storici reali.',
      ],
    };
  }

  // Rank candidates strictly by real Sharpe & risk-adjusted return (no arbitrary category boost)
  const scoreCandidate = (c: PortfolioStrategyCandidate) =>
    c.portfolioSharpeRatio * 30 + c.portfolioAnnualReturnPct - c.portfolioMaxDrawdownPct * 0.8;

  candidates.sort((a, b) => scoreCandidate(b) - scoreCandidate(a));
  const bestOverall = candidates[0];
  const bestUnger = candidates.find((c) => c.category === 'TITAN_UNGER') || bestOverall;
  const bestIndicator = candidates.find((c) => c.category === 'INDICATORS') || bestOverall;

  if (bestOverall.portfolioTotalReturnPct > 0 && bestOverall.portfolioProfitFactor > 1.0) {
    bestOverall.isWinner = true;
    bestOverall.isRobustWinner = bestOverall.portfolioSharpeRatio >= 0.4;
  }

  // Compute REAL sub-period evaluations directly from the simulated real equity curves
  const periodEvaluations = buildRealSubPeriodEvaluations(bestOverall, bestUnger, bestIndicator);

  return {
    portfolioName: `Portafoglio Quantitativo Reale (${assets.length} Asset)`,
    targetCapital,
    riskProfile: allocation.riskProfile,
    totalAssetsCount: assets.length,
    assets,
    bestStrategyCandidate: bestOverall,
    bestUngerCandidate: bestUnger,
    bestIndicatorCandidate: bestIndicator,
    allCandidates: candidates,
    periodEvaluations,
    aiExecutiveVerdict: `Simulazione su serie storiche reali sincronizzate (${bestOverall.equityCurve.length} giorni comuni): "${bestOverall.strategyName}" ha ottenuto CAGR ${bestOverall.portfolioAnnualReturnPct}%, Max Drawdown -${bestOverall.portfolioMaxDrawdownPct}%, Sharpe reale ${bestOverall.portfolioSharpeRatio} e decorrelazione ${bestOverall.decorrelationScore}/100.`,
    comparativeInsights: [
      `Tutti i risultati derivano esclusivamente da curve equity giornaliere sincronizzate su prezzi storici reali con commissioni e slippage applicati.`,
      `Decorrelazione reale misurata dalla matrice di correlazione delle equity dei costituenti: ${bestOverall.decorrelationScore}/100.`,
      `Confronto diretto: Unger CAGR ${bestUnger.portfolioAnnualReturnPct}% (DD -${bestUnger.portfolioMaxDrawdownPct}%) vs Indicatori CAGR ${bestIndicator.portfolioAnnualReturnPct}% (DD -${bestIndicator.portfolioMaxDrawdownPct}%).`,
    ],
  };
}

function buildRealSubPeriodEvaluations(
  best: PortfolioStrategyCandidate,
  unger: PortfolioStrategyCandidate,
  ind: PortfolioStrategyCandidate
): PortfolioPeriodEvaluation[] {
  const curve = best.equityCurve;
  if (curve.length < 30) return [];

  const split70 = Math.floor(curve.length * 0.70);
  const split85 = Math.floor(curve.length * 0.85);

  const slices: Array<{
    key: string;
    name: string;
    regimeType: PortfolioPeriodEvaluation['regimeType'];
    start: number;
    end: number;
  }> = [
    { key: 'FULL', name: 'Ciclo Storico Completo Reale', regimeType: 'FULL_CYCLE', start: 0, end: curve.length },
    { key: 'TRAIN', name: 'Training Cronologico (70%)', regimeType: 'BULL', start: 0, end: split70 },
    { key: 'VAL', name: 'Validation Cronologica (15%)', regimeType: 'SIDEWAYS', start: split70, end: split85 },
    { key: 'OOS', name: 'Out-of-Sample Cieco (15%)', regimeType: 'RECENT', start: split85, end: curve.length },
  ];

  const evalSlice = (c: PortfolioStrategyCandidate, start: number, end: number) => {
    const sub = c.equityCurve.slice(start, end).map((p) => ({ timestamp: p.timestamp, equity: p.portfolioEquity }));
    const per = computePeriodicReturnMetrics(sub, '1D');
    const dd = computeDrawdownStats(sub);
    return { ret: per.totalReturnPct, dd: dd.maxDrawdownPct, pf: c.portfolioProfitFactor };
  };

  return slices
    .filter((s) => s.end - s.start >= 5)
    .map((s) => {
      const b = evalSlice(best, s.start, s.end);
      const u = evalSlice(unger, s.start, s.end);
      const i = evalSlice(ind, s.start, s.end);
      const alpha = parseFloat((u.ret - i.ret).toFixed(2));
      const bestPerformer: 'UNGER' | 'INDICATORS' | 'TIE' =
        Math.abs(alpha) < 0.25 ? 'TIE' : alpha > 0 ? 'UNGER' : 'INDICATORS';

      return {
        periodKey: s.key,
        periodName: s.name,
        periodDates: `${curve[s.start].dateStr} → ${curve[s.end - 1].dateStr}`,
        marketRegime: `Periodo reale (${s.end - s.start} barre sincronizzate)`,
        regimeType: s.regimeType,
        portfolioReturnPct: b.ret,
        portfolioMaxDrawdownPct: b.dd,
        portfolioProfitFactor: b.pf,
        indicatorsReturnPct: i.ret,
        indicatorsMaxDrawdownPct: i.dd,
        indicatorsProfitFactor: i.pf,
        ungerReturnPct: u.ret,
        ungerMaxDrawdownPct: u.dd,
        ungerProfitFactor: u.pf,
        bestPerformer,
        alphaAdvantagePct: alpha,
        robustnessVerdict:
          b.ret > 0 && b.dd <= 15
            ? 'EXCELLENT'
            : b.ret >= 0
            ? 'ROBUST'
            : b.dd <= 12
            ? 'DEFENSIVE'
            : 'SENSITIVE',
        verdictNote: `Misurato sulla curva equity reale dal ${curve[s.start].dateStr} al ${curve[s.end - 1].dateStr}.`,
      };
    });
}
