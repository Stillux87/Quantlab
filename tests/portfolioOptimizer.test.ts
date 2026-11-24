import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runQuantitativePortfolioOptimization,
  PortfolioAllocationMethod,
} from '../src/services/portfolioOptimizerService';
import type { Bar } from '../src/types';

function makeDeterministicSeries(
  startPrice: number,
  dailyReturns: number[],
  startIso = '2024-01-02T00:00:00Z'
): Bar[] {
  const start = Date.parse(startIso);
  let price = startPrice;
  const bars: Bar[] = [];
  for (let i = 0; i < dailyReturns.length; i++) {
    const open = price;
    price = price * (1 + dailyReturns[i]);
    const ts = start + i * 24 * 60 * 60 * 1000;
    bars.push({
      timestamp: ts,
      dateStr: new Date(ts).toISOString().slice(0, 10),
      open: parseFloat(open.toFixed(4)),
      high: parseFloat((Math.max(open, price) * 1.005).toFixed(4)),
      low: parseFloat((Math.min(open, price) * 0.995).toFixed(4)),
      close: parseFloat(price.toFixed(4)),
      volume: 50000,
    });
  }
  return bars;
}

// 90 deterministic trading days with distinct volatility/correlation profiles
const n = 90;
const rAssetA = Array.from({ length: n }, (_, i) => (i % 3 === 0 ? 0.012 : i % 3 === 1 ? -0.005 : 0.004));
const rAssetB = Array.from({ length: n }, (_, i) => (i % 4 === 0 ? -0.003 : 0.0025)); // low vol, low corr
const rAssetC = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 0.018 : -0.013)); // higher vol

const barsA = makeDeterministicSeries(100, rAssetA);
const barsB = makeDeterministicSeries(50, rAssetB);
const barsC = makeDeterministicSeries(200, rAssetC);

test('Quantitative Portfolio Optimizer runs all 5 allocation methods with real covariance, valid weight sums, and bounds', () => {
  const methods: PortfolioAllocationMethod[] = [
    'EQUAL_WEIGHT',
    'MIN_VARIANCE',
    'RISK_PARITY',
    'MAX_DIVERSIFICATION',
    'MAX_SHARPE',
  ];

  for (const method of methods) {
    const result = runQuantitativePortfolioOptimization(
      [
        { ticker: 'AAA.MI', name: 'Asset A', currency: 'EUR', fxRateToEur: 1.0, bars: barsA },
        { ticker: 'BBB.MI', name: 'Asset B', currency: 'EUR', fxRateToEur: 1.0, bars: barsB },
        { ticker: 'CCC.MI', name: 'Asset C', currency: 'EUR', fxRateToEur: 1.0, bars: barsC },
      ],
      {
        method,
        initialCapital: 10000,
        minWeight: 0.1,
        maxWeight: 0.7,
        rebalanceFrequency: 'MONTHLY',
        rebalanceCostPct: 0.1,
      }
    );

    assert.equal(result.ok, true, `Method ${method} should succeed`);
    assert.equal(result.alignedBarsCount, n);
    const weightValues = Object.values(result.weights);
    assert.equal(weightValues.length, 3);

    const sumWeights = weightValues.reduce((s, w) => s + w, 0);
    assert.ok(Math.abs(sumWeights - 100) < 0.2, `Weights for ${method} must sum to ~100%, got ${sumWeights}`);

    for (const w of weightValues) {
      assert.ok(w >= 9.9 && w <= 70.1, `Weight bound violated in ${method}: ${w}`);
    }

    // Correlation matrix invariants: symmetric & diagonal = 1
    assert.equal(result.correlationMatrix.length, 3);
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(result.correlationMatrix[i][i] - 1) < 1e-4);
      for (let j = 0; j < 3; j++) {
        assert.ok(Math.abs(result.correlationMatrix[i][j] - result.correlationMatrix[j][i]) < 1e-4);
      }
    }

    assert.equal(result.equityCurve.length, n);
    assert.ok(result.totalRebalanceCosts >= 0);
  }
});

test('MIN_VARIANCE assigns highest weight to lowest-volatility asset and missing FX rejects mixed-currency portfolio', () => {
  const minVar = runQuantitativePortfolioOptimization(
    [
      { ticker: 'AAA.MI', name: 'Asset A', currency: 'EUR', fxRateToEur: 1.0, bars: barsA },
      { ticker: 'BBB.MI', name: 'Low Vol B', currency: 'EUR', fxRateToEur: 1.0, bars: barsB },
      { ticker: 'CCC.MI', name: 'High Vol C', currency: 'EUR', fxRateToEur: 1.0, bars: barsC },
    ],
    {
      method: 'MIN_VARIANCE',
      initialCapital: 10000,
      minWeight: 0.05,
      maxWeight: 0.8,
      rebalanceFrequency: 'MONTHLY',
      rebalanceCostPct: 0.1,
    }
  );
  const wB = minVar.weights['BBB.MI'];
  const wC = minVar.weights['CCC.MI'];
  assert.ok(wB > wC, `Expected low-vol BBB.MI (${wB}) > high-vol CCC.MI (${wC})`);

  // Missing USD FX rate must explicitly reject mixed EUR+USD aggregation
  const missingFx = runQuantitativePortfolioOptimization(
    [
      { ticker: 'AAA.MI', name: 'EUR Asset', currency: 'EUR', fxRateToEur: 1.0, bars: barsA },
      { ticker: 'NVDA', name: 'USD Asset', currency: 'USD', fxRateToEur: null, bars: barsB },
    ],
    {
      method: 'RISK_PARITY',
      initialCapital: 10000,
    }
  );
  assert.equal(missingFx.ok, false);
  assert.ok(missingFx.error && missingFx.error.includes('USD'));
});
