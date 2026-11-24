import test from 'node:test';
import assert from 'node:assert/strict';
import { runBacktest } from '../src/services/backtestEngine';
import {
  evaluateIntrabarExit,
  updateTrailingStopAfterBar,
  ManagedPositionState,
} from '../src/services/executionMath';
import { runMonteCarloSimulation } from '../src/services/quantMetrics';
import type { BaseStrategy } from '../src/services/strategies/types';
import type { Bar, Instrument } from '../src/types';

const TEST_INSTRUMENT: Instrument = {
  id: 'test_eq',
  ticker: 'TEST.MI',
  isin: 'IT0000000001',
  name: 'Test Equity',
  type: 'STOCK',
  market: 'Borsa Italiana',
  exchangeCode: 'MTA',
  currency: 'EUR',
  currencySymbol: '€',
  currentPrice: 100,
  change24h: 0,
  change24hAmount: 0,
  volume24h: 100000,
  sector: 'Test',
  description: 'Deterministic regression test instrument',
  dataRange: { startDate: '2024-01-01', endDate: '2024-12-31', totalBarsDaily: 250 },
  dataQuality: {
    score: 100,
    missingBarsPct: 0,
    duplicateBarsCount: 0,
    volumeCompletenessPct: 100,
    priceAnomalyCount: 0,
    status: 'EXCELLENT',
  },
};

function buildDailyBars(closes: number[], customBars?: Partial<Record<number, Partial<Bar>>>): Bar[] {
  const start = Date.parse('2024-01-02T00:00:00Z');
  return closes.map((c, idx) => {
    const prev = idx > 0 ? closes[idx - 1] : c;
    const ts = start + idx * 24 * 60 * 60 * 1000;
    const base: Bar = {
      timestamp: ts,
      dateStr: new Date(ts).toISOString().slice(0, 10),
      open: prev,
      high: Math.max(prev, c) * 1.005,
      low: Math.min(prev, c) * 0.995,
      close: c,
      volume: 10000,
    };
    return { ...base, ...(customBars?.[idx] || {}) };
  });
}

// Deterministic test strategy that buys on bar 10 and exits on bar 15
const fixedWindowStrategy: BaseStrategy = {
  definition: {
    id: 'test_fixed_window',
    name: 'Test Fixed Window',
    category: 'TREND_FOLLOWING',
    description: 'Deterministic test strategy',
    rationale: 'Test zero look-ahead execution',
    defaultParams: { entryBar: 10, exitBar: 15 },
    paramDefinitions: [],
    recommendedTimeframes: ['1D'],
    supportsShorting: false,
  },
  evaluate(bars, index, params, currentPos) {
    const bar = bars[index];
    if (currentPos === 'NONE' && index === Number(params.entryBar)) {
      return {
        action: 'BUY',
        price: bar.close,
        timestamp: bar.timestamp,
        reason: 'Deterministic entry signal at bar close',
        stopLoss: bar.close * 0.9,
        takeProfit: bar.close * 1.5,
      };
    }
    if (currentPos === 'LONG' && index === Number(params.exitBar)) {
      return {
        action: 'EXIT_LONG',
        price: bar.close,
        timestamp: bar.timestamp,
        reason: 'Deterministic exit signal at bar close',
      };
    }
    return { action: 'HOLD', price: bar.close, timestamp: bar.timestamp, reason: 'Hold' };
  },
  computeIndicators() {
    return [];
  },
};

test('ZERO LOOK-AHEAD: signal on bar i executes strictly at bar i+1 open and future mutation does not alter earlier trades', () => {
  const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
  const barsOriginal = buildDailyBars(closes, {
    10: { open: 109, high: 111, low: 108, close: 110 },
    11: { open: 120, high: 122, low: 119, close: 121 }, // distinct open on bar i+1!
    15: { open: 125, high: 126, low: 124, close: 125 },
    16: { open: 132, high: 134, low: 131, close: 133 }, // exit executes on bar 16 open!
  });

  // Mutate everything AFTER bar 20 violently
  const barsFutureMutated = barsOriginal.map((b, idx) =>
    idx > 20 ? { ...b, open: b.open * 3, high: b.high * 3, low: b.low * 3, close: b.close * 3 } : b
  );

  const resOriginal = runBacktest(fixedWindowStrategy, TEST_INSTRUMENT, '1D', barsOriginal, undefined, {
    initialCapital: 10000,
    commissionPct: 0,
    slippagePct: 0,
    spreadPct: 0,
  });
  const resMutated = runBacktest(fixedWindowStrategy, TEST_INSTRUMENT, '1D', barsFutureMutated, undefined, {
    initialCapital: 10000,
    commissionPct: 0,
    slippagePct: 0,
    spreadPct: 0,
  });

  assert.equal(resOriginal.trades.length, 1);
  assert.equal(resMutated.trades.length, 1);
  // Entry MUST be bar 11 open (120), NOT bar 10 close (110)
  assert.equal(resOriginal.trades[0].entryPrice, 120);
  // Exit MUST be bar 16 open (132), NOT bar 15 close (125)
  assert.equal(resOriginal.trades[0].exitPrice, 132);
  // Future mutation after bar 20 MUST NOT change trade #1 at all
  assert.deepEqual(resOriginal.trades[0], resMutated.trades[0]);
});

test('TRAILING STOP ZERO LOOK-AHEAD & CONSERVATIVE SL-BEFORE-TP COLLISION', () => {
  // Position LONG with SL=95, TP=115, no prior trailing stop.
  // Current bar spikes to high=120 AND drops to low=94 (hits BOTH SL and TP on same bar).
  const bar: Bar = {
    timestamp: Date.parse('2024-02-01T00:00:00Z'),
    dateStr: '2024-02-01',
    open: 102,
    high: 120,
    low: 94,
    close: 105,
    volume: 1000,
  };

  const posCollision: ManagedPositionState = {
    direction: 'LONG',
    entryPrice: 100,
    quantity: 10,
    stopLoss: 95,
    takeProfit: 115,
    trailingStop: undefined,
    highestPriceSinceEntry: 102,
    lowestPriceSinceEntry: 100,
  };

  // Evaluate exit strictly BEFORE updating trailing stop on current bar
  const exit = evaluateIntrabarExit(posCollision, bar, {
    slippagePct: 0,
    spreadPct: 0,
  });
  assert.equal(exit.exited, true);
  assert.equal(exit.exitReason, 'STOP_LOSS'); // Conservative rule: SL wins over TP on same-bar collision
  assert.equal(exit.exitPrice, 95);

  // Test non-retroactive trailing stop: bar spikes to 110 (5% trailing -> 104.5) and low is 103.
  // Because prior bar had NO trailing stop yet (only SL=95), current bar must NOT stop out at 104.5!
  const spikeBar: Bar = {
    timestamp: Date.parse('2024-02-02T00:00:00Z'),
    dateStr: '2024-02-02',
    open: 103.5,
    high: 110,
    low: 103,
    close: 108,
    volume: 1000,
  };
  const posSpike: ManagedPositionState = {
    direction: 'LONG',
    entryPrice: 100,
    quantity: 10,
    stopLoss: 95,
    takeProfit: 120,
    trailingStop: undefined,
    highestPriceSinceEntry: 103,
    lowestPriceSinceEntry: 100,
  };
  const exitBeforeUpdate = evaluateIntrabarExit(posSpike, spikeBar, {
    slippagePct: 0,
    spreadPct: 0,
  });
  assert.equal(exitBeforeUpdate.exited, false);

  updateTrailingStopAfterBar(posSpike, spikeBar, 5);
  assert.equal(posSpike.highestPriceSinceEntry, 110);
  assert.ok(Math.abs((posSpike.trailingStop ?? 0) - 104.5) < 1e-6);
});

test('Zero-ratio split options (0) are respected via ?? instead of being overwritten by || defaults', () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 + i * 0.5);
  const bars = buildDailyBars(closes);

  const resAllOos = runBacktest(fixedWindowStrategy, TEST_INSTRUMENT, '1D', bars, undefined, {
    trainRatio: 0,
    valRatio: 0,
    oosRatio: 1,
    initialCapital: 10000,
  });

  assert.equal(resAllOos.trades.length, 1);
  assert.equal(resAllOos.trades[0].splitType, 'OOS');
  assert.equal(resAllOos.splitRatios?.train, 0);
  assert.equal(resAllOos.splitRatios?.oos, 1);
});

test('Deterministic numerical regression: exact net P&L, commission, win rate, and seeded Monte Carlo', () => {
  const closes = Array.from({ length: 30 }, () => 100);
  const bars = buildDailyBars(closes, {
    10: { open: 100, high: 100, low: 100, close: 100 },
    11: { open: 100, high: 101, low: 99, close: 100 },
    15: { open: 110, high: 110, low: 110, close: 110 },
    16: { open: 110, high: 111, low: 109, close: 110 },
  });

  const res = runBacktest(fixedWindowStrategy, TEST_INSTRUMENT, '1D', bars, undefined, {
    initialCapital: 10000,
    commissionPct: 0.1, // 0.1% per side
    slippagePct: 0,
    spreadPct: 0,
    riskPerTradePct: 10, // Risk €1000 with SL at 90 (10/share) -> qty capped by 95% equity = 95 shares
  });

  assert.equal(res.trades.length, 1);
  const t = res.trades[0];
  assert.equal(t.entryPrice, 100);
  assert.equal(t.exitPrice, 110);
  // Gross PnL = (110 - 100) * qty; Commission = (100 * qty + 110 * qty) * 0.001
  const expectedGross = (110 - 100) * t.quantity;
  const expectedComm = (100 * t.quantity + 110 * t.quantity) * 0.001;
  const expectedNet = expectedGross - expectedComm;
  assert.ok(Math.abs(t.pnlAmount - expectedNet) < 0.05);
  assert.equal(res.metrics.winRatePct, 100);
  assert.equal(res.metrics.monteCarloAvailable, false); // Only 1 trade (< 10 minimum)

  // Verify Monte Carlo determinism with >= 10 trades
  const sampleTrades = [120, -45, 80, 150, -60, 95, -30, 110, -50, 75, 130, -40].map((pnlAmount) => ({
    pnlAmount,
  }));
  const mcA = runMonteCarloSimulation(sampleTrades, 10000, { iterations: 250, seed: 42 });
  const mcB = runMonteCarloSimulation(sampleTrades, 10000, { iterations: 250, seed: 42 });
  assert.equal(mcA.available, true);
  assert.deepEqual(mcA, mcB);
});
