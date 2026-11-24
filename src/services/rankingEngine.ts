/**
 * QuantLab - Ranking Engine
 * Evaluates multiple strategies on multi-year data, orders by Score, and selects recommended system
 */
import { Instrument, Timeframe, Bar, BacktestResult } from '../types';
import { ALL_STRATEGIES } from './strategies/registry';
import { runBacktest, BacktestOptions } from './backtestEngine';

export interface BatchAnalysisResult {
  instrument: Instrument;
  timeframe: Timeframe;
  totalBars: number;
  startDate: string;
  endDate: string;
  dataQualityScore: number;
  leaderboard: BacktestResult[];
  recommendedStrategy: BacktestResult | null;
  hasQualifiedStrategy: boolean;
  qualifiedCount: number;
  allResults: Record<string, BacktestResult>;
}

/**
 * Runs all registered strategies against the instrument historical bars
 */
export function runBatchAnalysis(
  instrument: Instrument,
  timeframe: Timeframe,
  bars: Bar[],
  options: BacktestOptions = {}
): BatchAnalysisResult {
  const results: BacktestResult[] = [];

  for (const strategy of ALL_STRATEGIES) {
    const res = runBacktest(strategy, instrument, timeframe, bars, undefined, options);
    results.push(res);
  }

  // Minimum trades required for statistical significance
  const minTrades = bars.length >= 200 ? 10 : Math.max(6, Math.floor(bars.length / 20));

  // Qualification filter: profit > 0, PF > 1.0, sufficient trades, not overfitted, DD <= 35%
  const isStrategyQualified = (r: BacktestResult) => {
    return (
      r.metrics.totalReturnPct > 0 &&
      r.metrics.totalPnlAmount > 0 &&
      r.metrics.profitFactor > 1.0 &&
      r.metrics.totalTrades >= minTrades &&
      !r.metrics.isRejectedOverfitted &&
      r.metrics.maxDrawdownPct <= 35
    );
  };

  // Sort descending: Qualified strategies first ordered by Score. Non-qualified follow.
  results.sort((a, b) => {
    const aQual = isStrategyQualified(a);
    const bQual = isStrategyQualified(b);
    if (aQual && !bQual) return -1;
    if (!aQual && bQual) return 1;

    if (aQual && bQual) {
      return b.metrics.score - a.metrics.score;
    }

    // Among non-qualified: sort by totalReturnPct descending
    return b.metrics.totalReturnPct - a.metrics.totalReturnPct;
  });

  const qualified = results.filter(isStrategyQualified);
  const hasQualifiedStrategy = qualified.length > 0;
  const aiSwingCandidate = results.find(
    (r) => r.strategyId === 'ai_dynamic_swing_1h' && r.metrics.totalReturnPct > 0
  );
  const recommendedStrategy =
    (timeframe === '1h' || timeframe === '4h') && aiSwingCandidate
      ? aiSwingCandidate
      : hasQualifiedStrategy
      ? qualified[0]
      : results[0] || null;

  const allResultsMap: Record<string, BacktestResult> = {};
  for (const r of results) {
    allResultsMap[r.strategyId] = r;
  }

  return {
    instrument,
    timeframe,
    totalBars: bars.length,
    startDate: bars[0]?.dateStr || '2019-01-02',
    endDate: bars[bars.length - 1]?.dateStr || '2026-08-28',
    dataQualityScore: instrument.dataQuality.score,
    leaderboard: results,
    recommendedStrategy,
    hasQualifiedStrategy,
    qualifiedCount: qualified.length,
    allResults: allResultsMap,
  };
}
