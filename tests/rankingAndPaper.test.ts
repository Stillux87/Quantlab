import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateStrategyQualification,
  rankStrategyResults,
} from '../src/services/rankingEngine';
import type { BacktestResult, BacktestMetrics, Instrument } from '../src/types';

const MOCK_INST: Instrument = {
  id: 'inst_1',
  ticker: 'UCG.MI',
  isin: 'IT0005239360',
  name: 'UniCredit',
  type: 'STOCK',
  market: 'Borsa Italiana',
  exchangeCode: 'MTA',
  currency: 'EUR',
  currencySymbol: '€',
  currentPrice: 40,
  change24h: 0,
  change24hAmount: 0,
  volume24h: 1000000,
  sector: 'Financials',
  description: 'Test',
  dataRange: { startDate: '2024-01-01', endDate: '2025-01-01', totalBarsDaily: 252 },
  dataQuality: {
    score: 100,
    missingBarsPct: 0,
    duplicateBarsCount: 0,
    volumeCompletenessPct: 100,
    priceAnomalyCount: 0,
    status: 'EXCELLENT',
  },
};

function makeBacktestResult(
  id: string,
  overrides: Partial<BacktestMetrics>,
  oosTradesCount = 8
): BacktestResult {
  const baseMetrics: BacktestMetrics = {
    totalReturnPct: 18,
    totalPnlAmount: 1800,
    cagrPct: 18,
    profitFactor: 1.8,
    winRatePct: 55,
    totalTrades: 35,
    winningTrades: 19,
    losingTrades: 16,
    avgWinPct: 2.5,
    avgLossPct: -1.4,
    riskRewardRatio: 1.79,
    expectancy: 51,
    maxDrawdownPct: 11,
    avgDrawdownPct: 4.2,
    maxDrawdownDurationDays: 20,
    avgDurationMinutes: 360,
    sharpeRatio: 1.4,
    sortinoRatio: 1.9,
    calmarRatio: 1.6,
    recoveryFactor: 1.64,
    marketExposurePct: 40,
    score: 82,
    trainReturnPct: 12,
    valReturnPct: 4,
    oosReturnPct: 6,
    oosDegradationPenalty: 0,
    overfittingRisk: 'LOW',
    confidenceLevel: 'ALTA',
    confidenceScore: 84,
    marketRegimeConsistency: 80,
    monteCarloAvailable: true,
    monteCarloMaxDrawdown95Pct: 18,
    ...overrides,
  };

  return {
    strategyId: id,
    strategyName: `Strategy ${id}`,
    strategyCategory: 'TREND_FOLLOWING',
    instrument: MOCK_INST,
    timeframe: '1h',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    totalBars: 500,
    params: {},
    metrics: baseMetrics,
    trainMetrics: {
      totalReturnPct: baseMetrics.trainReturnPct,
      maxDrawdownPct: 10,
      profitFactor: 1.7,
      totalTrades: Math.max(0, baseMetrics.totalTrades - oosTradesCount),
    },
    valMetrics: {
      totalReturnPct: baseMetrics.valReturnPct,
      maxDrawdownPct: 6,
      profitFactor: 1.5,
      totalTrades: 4,
    },
    oosMetrics: {
      totalReturnPct: baseMetrics.oosReturnPct,
      totalPnlAmount: baseMetrics.oosReturnPct * 100,
      cagrPct: baseMetrics.oosReturnPct,
      maxDrawdownPct: 7,
      avgDrawdownPct: 3,
      maxDrawdownDurationDays: 10,
      profitFactor: 1.5,
      winRatePct: 54,
      totalTrades: oosTradesCount,
      winningTrades: Math.round(oosTradesCount * 0.55),
      losingTrades: oosTradesCount - Math.round(oosTradesCount * 0.55),
      sharpeRatio: 1.2,
      sortinoRatio: 1.5,
      expectancy: 40,
    },
    dataProvenance: {
      source: 'Real Exchange OHLCV',
      timeframe: '1h',
      dataStatus: 'HISTORICAL_REAL',
      isRealData: true,
      fetchedAt: new Date().toISOString(),
      warnings: [],
    },
    trades: [],
    equityCurve: [],
    indicators: [],
    scoreBreakdown: {
      oosComponent: 25,
      profitFactorComponent: 18,
      drawdownComponent: 15,
      winRateComponent: 10,
      sharpeComponent: 14,
      overfittingPenalty: 0,
      total: baseMetrics.score,
    },
    benchmarkMetrics: {
      totalReturnPct: 10,
      cagrPct: 10,
      maxDrawdownPct: 15,
      finalCapital: 11000,
      startPrice: 40,
      endPrice: 44,
    },
  };
}

test('Ranking engine assigns accurate 4-tier verdicts and NEVER forces a recommended strategy when none qualifies', () => {
  const losing = makeBacktestResult('loser', {
    totalReturnPct: -12,
    totalPnlAmount: -1200,
    cagrPct: -12,
    profitFactor: 0.75,
    oosReturnPct: -5,
    sharpeRatio: -0.4,
    totalTrades: 30,
  });

  const lowSample = makeBacktestResult('tiny_sample', {
    totalReturnPct: 25,
    totalPnlAmount: 2500,
    cagrPct: 25,
    profitFactor: 2.5,
    totalTrades: 4,
    oosReturnPct: 10,
  }, 1);

  const borderline = makeBacktestResult('borderline', {
    totalReturnPct: 8,
    totalPnlAmount: 800,
    cagrPct: 8,
    profitFactor: 1.15,
    totalTrades: 22,
    sharpeRatio: 0.3,
    oosReturnPct: -1.5, // OOS negative -> DA_OSSERVARE, not PROMOSSA
  });

  assert.equal(evaluateStrategyQualification(losing).verdict, 'RESPINTA');
  assert.equal(evaluateStrategyQualification(lowSample).verdict, 'DATI_INSUFFICIENTI');
  assert.equal(evaluateStrategyQualification(borderline).verdict, 'DA_OSSERVARE');

  const batchWithoutWinner = rankStrategyResults([losing, lowSample, borderline], MOCK_INST, '1h');
  assert.equal(batchWithoutWinner.hasPromotedStrategy, false);
  assert.equal(batchWithoutWinner.recommendedStrategy, null);
  assert.equal(batchWithoutWinner.bestStrategy, null);

  // Now add a truly qualified strategy
  const strong = makeBacktestResult('strong_winner', {});
  assert.equal(evaluateStrategyQualification(strong).verdict, 'PROMOSSA');

  const batchWithWinner = rankStrategyResults([losing, borderline, strong], MOCK_INST, '1h');
  assert.equal(batchWithWinner.hasPromotedStrategy, true);
  assert.equal(batchWithWinner.recommendedStrategy?.strategyId, 'strong_winner');
  assert.equal(batchWithWinner.results[0].strategyId, 'strong_winner');
});
