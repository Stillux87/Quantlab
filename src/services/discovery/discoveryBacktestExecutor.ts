/**
 * QuantLab - AI Strategy Discovery Backtest & Validation Engine (Zero Look-Ahead, Real Data Only)
 *
 * Fixes applied:
 * - Signal generated on bar `i` close executes strictly on bar `i + 1` open (no same-bar close fills).
 * - True periodic equity-curve Sharpe Ratio via `quantMetrics.ts` (no `cagr / maxDd * 0.8` hack).
 * - Deterministic seeded Monte Carlo (Mulberry32 + Fisher-Yates); honest insufficient-sample flag when < 10 trades.
 * - Cross-Asset validation uses ONLY real provided bars (NEVER generates random-walk synthetic bars!).
 */
import { Bar, Instrument } from '../../types';
import {
  StrategyDNA,
  DiscoveryHypothesis,
  DiscoveryReport,
  DiscoveryCategory,
} from '../../types/discovery';
import { calculateNoveltyScore } from './dnaEngine';
import {
  computeDrawdownStats,
  computePeriodicReturnMetrics,
  runMonteCarloSimulation,
} from '../quantMetrics';
import { validateAndCleanBars } from '../marketDataIntegrity';

interface TradeRecord {
  entryIndex: number;
  entryDate: string;
  entryPrice: number;
  exitIndex: number;
  exitDate: string;
  exitPrice: number;
  shares: number;
  pnlNetEur: number;
  pnlNetPct: number;
  exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIME_EXIT';
  isOos: boolean;
}

function isDayOfWeek(
  dateStr: string,
  targetDay?: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'ANY'
): boolean {
  if (!targetDay || targetDay === 'ANY') return true;
  const d = new Date(dateStr);
  const dayIndex = d.getUTCDay();
  const map: Record<string, number> = {
    MONDAY: 1,
    TUESDAY: 2,
    WEDNESDAY: 3,
    THURSDAY: 4,
    FRIDAY: 5,
  };
  return dayIndex === map[targetDay];
}

function isDayOfMonth(
  dateStr: string,
  target?: 'START_OF_MONTH' | 'END_OF_MONTH' | 'MID_MONTH' | 'ANY'
): boolean {
  if (!target || target === 'ANY') return true;
  const d = new Date(dateStr);
  const day = d.getUTCDate();
  if (target === 'START_OF_MONTH') return day <= 4;
  if (target === 'END_OF_MONTH') return day >= 26;
  if (target === 'MID_MONTH') return day >= 13 && day <= 17;
  return true;
}

/**
 * Executes a bar-by-bar backtest of a Strategy DNA with strict bar `i + 1` execution (zero look-ahead).
 */
export function executeDnaBacktestOnBars(
  dna: StrategyDNA,
  rawBars: Bar[],
  initialCapital = 50000,
  commissionRate = 0.0005, // 5 bps per side
  slippagePct = 0.0005 // 5 bps per side
): {
  trades: TradeRecord[];
  equityCurve: { dateStr: string; equity: number; isOos: boolean; timestamp?: number }[];
  totalReturnPct: number;
  cagrPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  winRatePct: number;
  totalTrades: number;
  totalPnlAmount: number;
  avgTradePct: number;
  avgTradeAmount: number;
  sharpeRatio: number;
} {
  const { bars } = validateAndCleanBars(rawBars, '1D');

  if (bars.length < 30) {
    return {
      trades: [],
      equityCurve: [],
      totalReturnPct: 0,
      cagrPct: 0,
      profitFactor: 0,
      maxDrawdownPct: 0,
      winRatePct: 0,
      totalTrades: 0,
      totalPnlAmount: 0,
      avgTradePct: 0,
      avgTradeAmount: 0,
      sharpeRatio: 0,
    };
  }

  // Chronological 70% Train+Val / 30% OOS (or 85/15 aligned with standard OOS)
  const oosStartIndex = Math.floor(bars.length * 0.7);

  // Strictly causal SMA 200
  const sma200: number[] = new Array(bars.length).fill(0);
  let sum200 = 0;
  for (let i = 0; i < bars.length; i++) {
    sum200 += bars[i].close;
    if (i >= 200) {
      sum200 -= bars[i - 200].close;
      sma200[i] = sum200 / 200;
    } else {
      sma200[i] = sum200 / (i + 1);
    }
  }

  // Strictly causal 20-day historical volatility
  const histVol: number[] = new Array(bars.length).fill(0.015);
  for (let i = 20; i < bars.length; i++) {
    let mean = 0;
    const rets: number[] = [];
    for (let k = i - 19; k <= i; k++) {
      const r = (bars[k].close - bars[k - 1].close) / bars[k - 1].close;
      rets.push(r);
      mean += r;
    }
    mean /= 20;
    const variance = rets.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / 19;
    histVol[i] = Math.sqrt(variance);
  }

  // Strictly causal 20-day average volume
  const avgVol20: number[] = new Array(bars.length).fill(0);
  let sumVol = 0;
  for (let i = 0; i < bars.length; i++) {
    sumVol += bars[i].volume || 0;
    if (i >= 20) {
      sumVol -= bars[i - 20].volume || 0;
      avgVol20[i] = sumVol / 20;
    } else {
      avgVol20[i] = sumVol / (i + 1);
    }
  }

  let capital = initialCapital;
  let inPosition = false;
  let pendingEntry = false;
  let entryPrice = 0;
  let entryIndex = 0;
  let shares = 0;

  const trades: TradeRecord[] = [];
  const equityCurve: { dateStr: string; equity: number; isOos: boolean; timestamp: number }[] = [];

  const startIndex = Math.max(25, (dna.priceFactor.lookbackDays ?? 3) + 5);

  for (let i = startIndex; i < bars.length; i++) {
    const currentBar = bars[i];
    const prevBar = bars[i - 1];
    const isOos = i >= oosStartIndex;

    // 1. Execute pending entry queued from bar i-1 close strictly at bar i open
    if (!inPosition && pendingEntry) {
      pendingEntry = false;
      const rawEntry = currentBar.open * (1 + slippagePct);
      const riskPct = dna.riskRule.stopLossPct ?? 3.0;
      const riskAmount = capital * 0.015;
      const maxAllocation = capital * 0.95;
      const targetAllocation = Math.min(maxAllocation, riskAmount / Math.max(0.002, riskPct / 100));
      const allocValue = Math.min(maxAllocation, Math.max(0, targetAllocation));
      const qty = Math.floor(allocValue / rawEntry);

      if (qty > 0 && capital >= qty * rawEntry * (1 + commissionRate)) {
        shares = qty;
        entryPrice = rawEntry;
        entryIndex = i;
        capital -= shares * entryPrice * (1 + commissionRate);
        inPosition = true;
      }
    }

    // 2. Check exit if in position (conservative: SL checked before TP, gap-open respected)
    if (inPosition) {
      const holdingBars = i - entryIndex;
      const stopLossPrice = dna.riskRule.stopLossPct
        ? entryPrice * (1 - dna.riskRule.stopLossPct / 100)
        : -Infinity;
      const takeProfitPrice = dna.riskRule.takeProfitPct
        ? entryPrice * (1 + dna.riskRule.takeProfitPct / 100)
        : Infinity;

      let shouldExit = false;
      let exitPrice = currentBar.close;
      let exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIME_EXIT' = 'TIME_EXIT';

      if (currentBar.low <= stopLossPrice) {
        shouldExit = true;
        exitPrice = Math.min(currentBar.open, stopLossPrice) * (1 - slippagePct);
        exitReason = 'STOP_LOSS';
      } else if (currentBar.high >= takeProfitPrice) {
        shouldExit = true;
        exitPrice = Math.max(currentBar.open >= takeProfitPrice ? currentBar.open : takeProfitPrice, takeProfitPrice) * (1 - slippagePct);
        exitReason = 'TAKE_PROFIT';
      } else if (holdingBars >= dna.timeFactor.holdingPeriodBars) {
        shouldExit = true;
        exitPrice = currentBar.close * (1 - slippagePct);
        exitReason = 'TIME_EXIT';
      }

      if (shouldExit) {
        const grossValue = shares * exitPrice;
        const exitCost = grossValue * commissionRate;
        const netProceeds = grossValue - exitCost;
        capital += netProceeds;

        const entryCostTotal = shares * entryPrice * (1 + commissionRate);
        const pnlNetEur = netProceeds - entryCostTotal;
        const pnlNetPct = entryCostTotal > 0 ? (pnlNetEur / entryCostTotal) * 100 : 0;

        trades.push({
          entryIndex,
          entryDate: bars[entryIndex].dateStr,
          entryPrice,
          exitIndex: i,
          exitDate: currentBar.dateStr,
          exitPrice,
          shares,
          pnlNetEur,
          pnlNetPct,
          exitReason,
          isOos: entryIndex >= oosStartIndex,
        });

        inPosition = false;
        shares = 0;
      }
    }

    // 3. Mark-to-market equity strictly at bar i close
    const currentEquity = inPosition ? capital + shares * currentBar.close : capital;
    equityCurve.push({
      dateStr: currentBar.dateStr,
      equity: parseFloat(currentEquity.toFixed(2)),
      isOos,
      timestamp: currentBar.timestamp,
    });

    // 4. Evaluate entry rules strictly on bars 0..i and queue order for bar i+1
    if (!inPosition && i < bars.length - 1) {
      const matchesDay = isDayOfWeek(currentBar.dateStr, dna.timeFactor.dayOfWeek);
      const matchesDom = isDayOfMonth(currentBar.dateStr, dna.timeFactor.dayOfMonth);

      let matchesRegime = true;
      if (dna.regimeFactor.type === 'INDEX_ABOVE_SMA200') {
        matchesRegime = currentBar.close > sma200[i];
      } else if (dna.regimeFactor.type === 'INDEX_BELOW_SMA200') {
        matchesRegime = currentBar.close < sma200[i];
      }

      let matchesVol = true;
      if (dna.volatilityFactor.type === 'VOLATILITY_PERCENTILE') {
        matchesVol = histVol[i] < 0.0165;
      }

      let matchesVolume = true;
      if (dna.volumeFactor.type === 'RELATIVE_VOLUME_SURGE') {
        const ratio = (currentBar.volume || 0) / Math.max(1, avgVol20[i]);
        matchesVolume = ratio >= (dna.volumeFactor.thresholdRatio ?? 1.35);
      }

      let matchesPrice = true;
      const lb = dna.priceFactor.lookbackDays ?? 3;
      if (dna.priceFactor.type === 'PREV_RETURN_N_DAYS') {
        const pastBar = bars[i - lb];
        const returnLb = ((currentBar.close - pastBar.close) / pastBar.close) * 100;
        if (dna.priceFactor.condition === 'WORST_RETURN') {
          matchesPrice = returnLb < (dna.priceFactor.threshold ?? -1.5);
        } else {
          matchesPrice = returnLb > (dna.priceFactor.threshold ?? 1.5);
        }
      } else if (dna.priceFactor.type === 'CONSECUTIVE_STREAK') {
        let isStreak = true;
        for (let k = 0; k < lb; k++) {
          const idx = i - k;
          if (idx <= 0) {
            isStreak = false;
            break;
          }
          if (dna.priceFactor.condition === 'CONSECUTIVE_DOWN') {
            if (bars[idx].close >= bars[idx - 1].close) isStreak = false;
          } else {
            if (bars[idx].close <= bars[idx - 1].close) isStreak = false;
          }
        }
        matchesPrice = isStreak;
      } else if (dna.priceFactor.type === 'BREAKOUT_DONCHIAN') {
        let highestHigh = -Infinity;
        for (let k = 1; k <= lb; k++) {
          if (bars[i - k].high > highestHigh) highestHigh = bars[i - k].high;
        }
        matchesPrice = currentBar.close > highestHigh;
      } else if (dna.priceFactor.type === 'GAP_DETECTION') {
        const gapPct = ((currentBar.open - prevBar.close) / prevBar.close) * 100;
        matchesPrice = gapPct <= (dna.priceFactor.threshold ?? -1.2);
      }

      if (matchesDay && matchesDom && matchesRegime && matchesVol && matchesVolume && matchesPrice) {
        pendingEntry = true;
      }
    }
  }

  // Finalize any open position at last bar close
  if (inPosition && bars.length > 0) {
    const lastBar = bars[bars.length - 1];
    const exitPrice = lastBar.close * (1 - slippagePct);
    const grossValue = shares * exitPrice;
    const exitCost = grossValue * commissionRate;
    capital += grossValue - exitCost;
    const entryCostTotal = shares * entryPrice * (1 + commissionRate);
    const pnlNetEur = grossValue - exitCost - entryCostTotal;
    const pnlNetPct = entryCostTotal > 0 ? (pnlNetEur / entryCostTotal) * 100 : 0;

    trades.push({
      entryIndex,
      entryDate: bars[entryIndex].dateStr,
      entryPrice,
      exitIndex: bars.length - 1,
      exitDate: lastBar.dateStr,
      exitPrice,
      shares,
      pnlNetEur,
      pnlNetPct,
      exitReason: 'TIME_EXIT',
      isOos: entryIndex >= oosStartIndex,
    });
    if (equityCurve.length > 0) {
      equityCurve[equityCurve.length - 1].equity = parseFloat(capital.toFixed(2));
    }
  }

  const periodic = computePeriodicReturnMetrics(equityCurve, '1D');
  const dd = computeDrawdownStats(equityCurve);
  const totalPnlAmount = parseFloat((capital - initialCapital).toFixed(2));

  let grossProfits = 0;
  let grossLosses = 0;
  let winningTrades = 0;
  let sumTradePct = 0;

  for (const t of trades) {
    sumTradePct += t.pnlNetPct;
    if (t.pnlNetEur > 0) {
      grossProfits += t.pnlNetEur;
      winningTrades++;
    } else {
      grossLosses += Math.abs(t.pnlNetEur);
    }
  }

  const profitFactor =
    grossLosses > 0
      ? parseFloat((grossProfits / grossLosses).toFixed(2))
      : grossProfits > 0
      ? 99.99
      : 0;

  const winRatePct =
    trades.length > 0 ? parseFloat(((winningTrades / trades.length) * 100).toFixed(1)) : 0;

  return {
    trades,
    equityCurve,
    totalReturnPct: periodic.totalReturnPct,
    cagrPct: periodic.cagrPct,
    profitFactor,
    maxDrawdownPct: dd.maxDrawdownPct,
    winRatePct,
    totalTrades: trades.length,
    totalPnlAmount,
    avgTradePct: trades.length > 0 ? parseFloat((sumTradePct / trades.length).toFixed(2)) : 0,
    avgTradeAmount:
      trades.length > 0 ? parseFloat((totalPnlAmount / trades.length).toFixed(2)) : 0,
    sharpeRatio: periodic.sharpeRatio,
  };
}

function evaluateWalkForward(
  dna: StrategyDNA,
  bars: Bar[]
): {
  efficiencyPct: number;
  windowsTested: number;
  positiveWindows: number;
  stability: 'HIGH' | 'MEDIUM' | 'FRAGILE';
} {
  const windowCount = 4;
  const sliceSize = Math.floor(bars.length / windowCount);
  if (sliceSize < 50) {
    return { efficiencyPct: 0, windowsTested: 0, positiveWindows: 0, stability: 'FRAGILE' };
  }

  let positiveWindows = 0;
  for (let w = 0; w < windowCount; w++) {
    const windowBars = bars.slice(w * sliceSize, (w + 1) * sliceSize);
    const res = executeDnaBacktestOnBars(dna, windowBars, 50000);
    if (res.totalReturnPct > 0 && res.totalTrades > 0) positiveWindows++;
  }

  const passRatio = positiveWindows / windowCount;
  const efficiencyPct = Math.round(passRatio * 100);
  const stability: 'HIGH' | 'MEDIUM' | 'FRAGILE' =
    passRatio >= 0.75 ? 'HIGH' : passRatio >= 0.5 ? 'MEDIUM' : 'FRAGILE';

  return {
    efficiencyPct,
    windowsTested: windowCount,
    positiveWindows,
    stability,
  };
}

function evaluateMonteCarlo(
  trades: TradeRecord[],
  initialCapital: number
): {
  maxDrawdown95Pct: number;
  ruinProbabilityPct: number;
  worstCaseReturn5Pct: number;
  distributionSummary: string;
} {
  const mc = runMonteCarloSimulation(
    trades.map((t) => ({ pnlAmount: t.pnlNetEur })),
    initialCapital,
    { iterations: 400, seed: 20260401 }
  );

  if (!mc.available) {
    return {
      maxDrawdown95Pct: 0,
      ruinProbabilityPct: 0,
      worstCaseReturn5Pct: 0,
      distributionSummary: mc.reason || 'Campione insufficiente (< 10 trade): simulazione Monte Carlo non disponibile.',
    };
  }

  return {
    maxDrawdown95Pct: mc.maxDrawdownP95Pct ?? 0,
    ruinProbabilityPct: mc.ruinProbabilityPct ?? 0,
    worstCaseReturn5Pct: mc.terminalReturnP05Pct ?? 0,
    distributionSummary: `Monte Carlo deterministico (${mc.iterations} iterazioni): 95° percentile drawdown -${mc.maxDrawdownP95Pct}%, Rischio Rovina ${mc.ruinProbabilityPct}%, 5° percentile rendimento ${mc.terminalReturnP05Pct}%.`,
  };
}

function evaluateParameterPlateau(
  dna: StrategyDNA,
  bars: Bar[],
  baseReturnPct: number
): {
  stabilityScore: number;
  isPlateau: boolean;
  neighborsTested: number;
  neighborsProfitable: number;
  status: 'PLATEAU' | 'PEAK' | 'FRAGILE';
  perturbations: {
    paramName: string;
    variationLabel: string;
    returnPct: number;
    profitable: boolean;
  }[];
} {
  const perturbations: {
    paramName: string;
    variationLabel: string;
    returnPct: number;
    profitable: boolean;
  }[] = [];

  const baseSl = dna.riskRule.stopLossPct ?? 3.0;
  const baseHold = dna.timeFactor.holdingPeriodBars ?? 5;

  const testVariations: Array<{ name: string; sl: number; hold: number }> = [
    { name: `SL -25% (${(baseSl * 0.75).toFixed(1)}%)`, sl: baseSl * 0.75, hold: baseHold },
    { name: `SL +25% (${(baseSl * 1.25).toFixed(1)}%)`, sl: baseSl * 1.25, hold: baseHold },
    { name: `Hold -1d (${Math.max(1, baseHold - 1)}d)`, sl: baseSl, hold: Math.max(1, baseHold - 1) },
    { name: `Hold +1d (${baseHold + 1}d)`, sl: baseSl, hold: baseHold + 1 },
  ];

  let profitableCount = 0;
  for (const v of testVariations) {
    const perturbedDna: StrategyDNA = {
      ...dna,
      timeFactor: { ...dna.timeFactor, holdingPeriodBars: v.hold },
      riskRule: { ...dna.riskRule, stopLossPct: v.sl, maxHoldingBars: v.hold },
    };
    const res = executeDnaBacktestOnBars(perturbedDna, bars, 50000);
    const isProfitable = res.totalReturnPct > 0;
    if (isProfitable) profitableCount++;

    perturbations.push({
      paramName: v.name,
      variationLabel: v.name,
      returnPct: res.totalReturnPct,
      profitable: isProfitable,
    });
  }

  const passRatio = profitableCount / testVariations.length;
  const stabilityScore = Math.max(
    10,
    Math.min(100, Math.round(passRatio * 85 + (baseReturnPct > 0 ? 15 : 0)))
  );
  const isPlateau = stabilityScore >= 60;
  const status: 'PLATEAU' | 'PEAK' | 'FRAGILE' =
    stabilityScore >= 70 ? 'PLATEAU' : stabilityScore >= 45 ? 'PEAK' : 'FRAGILE';

  return {
    stabilityScore,
    isPlateau,
    neighborsTested: testVariations.length,
    neighborsProfitable: profitableCount,
    status,
    perturbations,
  };
}

/**
 * Validates the DNA ONLY on real historical bars provided for other assets.
 * NEVER fabricates random-walk synthetic series!
 */
function evaluateCrossAssetGeneralization(
  dna: StrategyDNA,
  primaryInstrument: Instrument,
  realCrossAssetSeries?: Array<{ instrument: Instrument; bars: Bar[] }>
): {
  testedAssetsCount: number;
  profitableAssetsCount: number;
  generalizationScore: number;
  isCrossMarketProven: boolean;
  assets: {
    ticker: string;
    name: string;
    returnPct: number;
    profitFactor: number;
    trades: number;
    passed: boolean;
  }[];
} {
  const validPeers = (realCrossAssetSeries || []).filter(
    (entry) =>
      entry.instrument.ticker !== primaryInstrument.ticker &&
      Array.isArray(entry.bars) &&
      entry.bars.length >= 60
  );

  if (validPeers.length === 0) {
    return {
      testedAssetsCount: 0,
      profitableAssetsCount: 0,
      generalizationScore: 0,
      isCrossMarketProven: false,
      assets: [],
    };
  }

  const assetResults: Array<{
    ticker: string;
    name: string;
    returnPct: number;
    profitFactor: number;
    trades: number;
    passed: boolean;
  }> = [];

  let profitableCount = 0;
  for (const peer of validPeers) {
    const res = executeDnaBacktestOnBars(dna, peer.bars, 50000);
    const passed = res.totalReturnPct > 0 && res.profitFactor > 1.0 && res.totalTrades >= 5;
    if (passed) profitableCount++;

    assetResults.push({
      ticker: peer.instrument.ticker,
      name: peer.instrument.name,
      returnPct: res.totalReturnPct,
      profitFactor: res.profitFactor,
      trades: res.totalTrades,
      passed,
    });
  }

  const genScore = Math.round((profitableCount / validPeers.length) * 100);
  return {
    testedAssetsCount: validPeers.length,
    profitableAssetsCount: profitableCount,
    generalizationScore: genScore,
    isCrossMarketProven: validPeers.length >= 3 && genScore >= 60,
    assets: assetResults,
  };
}

export function evaluateDiscoveryHypothesis(
  hypothesis: DiscoveryHypothesis,
  bars: Bar[],
  instrument: Instrument,
  allTestedDnas: StrategyDNA[] = [],
  totalHypothesesExplored = 50,
  realCrossAssetSeries?: Array<{ instrument: Instrument; bars: Bar[] }>
): DiscoveryReport {
  const dna = hypothesis.dna;
  const fullBacktest = executeDnaBacktestOnBars(dna, bars, 50000);

  // Real equity-curve IS vs OOS separation
  const isEquity = fullBacktest.equityCurve.filter((pt) => !pt.isOos);
  const oosEquity = fullBacktest.equityCurve.filter((pt) => pt.isOos);
  const isPeriodic = computePeriodicReturnMetrics(
    isEquity.map((e) => ({ timestamp: e.timestamp ?? 0, equity: e.equity })),
    '1D'
  );
  const oosPeriodic = computePeriodicReturnMetrics(
    oosEquity.map((e) => ({ timestamp: e.timestamp ?? 0, equity: e.equity })),
    '1D'
  );

  const isTrades = fullBacktest.trades.filter((t) => !t.isOos);
  const oosTrades = fullBacktest.trades.filter((t) => t.isOos);

  let isProfit = 0;
  let isLoss = 0;
  isTrades.forEach((t) => {
    if (t.pnlNetEur > 0) isProfit += t.pnlNetEur;
    else isLoss += Math.abs(t.pnlNetEur);
  });
  const isPF = isLoss > 0 ? parseFloat((isProfit / isLoss).toFixed(2)) : isProfit > 0 ? 99.99 : 0;

  let oosProfit = 0;
  let oosLoss = 0;
  oosTrades.forEach((t) => {
    if (t.pnlNetEur > 0) oosProfit += t.pnlNetEur;
    else oosLoss += Math.abs(t.pnlNetEur);
  });
  const oosPF = oosLoss > 0 ? parseFloat((oosProfit / oosLoss).toFixed(2)) : oosProfit > 0 ? 99.99 : 0;

  const oosRetentionRatio =
    isPeriodic.cagrPct > 0
      ? parseFloat((oosPeriodic.cagrPct / isPeriodic.cagrPct).toFixed(2))
      : oosPeriodic.totalReturnPct > 0
      ? 1.0
      : 0;

  const wf = evaluateWalkForward(dna, bars);
  const mc = evaluateMonteCarlo(fullBacktest.trades, 50000);
  const paramPlateau = evaluateParameterPlateau(dna, bars, fullBacktest.totalReturnPct);
  const crossAsset = evaluateCrossAssetGeneralization(dna, instrument, realCrossAssetSeries);
  const noveltyScore = calculateNoveltyScore(dna, allTestedDnas);

  const multipleTestingPenalty = Math.min(
    12,
    Math.round(Math.log10(Math.max(10, totalHypothesesExplored)) * 4)
  );
  const complexityScore = dna.complexityScore;
  const complexityPenalty = complexityScore > 50 ? Math.round((complexityScore - 50) * 0.35) : 0;

  const oosScoreComponent = Math.min(100, Math.max(0, oosRetentionRatio * 75));
  const mcScoreComponent = fullBacktest.totalTrades >= 10 ? Math.max(0, 100 - mc.maxDrawdown95Pct * 2.2) : 25;
  const tradeVolumeBonus = Math.min(100, (fullBacktest.totalTrades / 25) * 100);

  const rawRobustness =
    oosScoreComponent * 0.25 +
    wf.efficiencyPct * 0.25 +
    mcScoreComponent * 0.20 +
    paramPlateau.stabilityScore * 0.15 +
    (crossAsset.testedAssetsCount > 0 ? crossAsset.generalizationScore * 0.05 : 0) +
    tradeVolumeBonus * 0.10 -
    multipleTestingPenalty -
    complexityPenalty;

  const robustnessScore = Math.max(5, Math.min(98, Math.round(rawRobustness)));
  const confidenceScore = Math.max(
    10,
    Math.min(
      95,
      Math.round(
        robustnessScore * 0.6 +
          paramPlateau.stabilityScore * 0.25 +
          (crossAsset.testedAssetsCount > 0 ? crossAsset.generalizationScore * 0.15 : wf.efficiencyPct * 0.15)
      )
    )
  );

  const disqualificationReasons: string[] = [];
  if (fullBacktest.totalReturnPct <= 0 || fullBacktest.totalPnlAmount <= 0) {
    disqualificationReasons.push(
      `Rendimento Netto Negativo (${fullBacktest.totalReturnPct}%): L’ipotesi non produce profitto al netto dei costi.`
    );
  }
  if (fullBacktest.profitFactor <= 1.05) {
    disqualificationReasons.push(
      `Profit Factor Insufficiente (${fullBacktest.profitFactor} ≤ 1.05): Assenza di edge statistico favorevole.`
    );
  }
  if (fullBacktest.totalTrades < 10) {
    disqualificationReasons.push(
      `Campione Statistico Insufficiente (${fullBacktest.totalTrades} trade < 10 minimi): Alto rischio di casualità.`
    );
  }
  if (fullBacktest.maxDrawdownPct > 30) {
    disqualificationReasons.push(
      `Drawdown Eccessivo (${fullBacktest.maxDrawdownPct}% > 30%): Rischio di calo capitale fuori tolleranza.`
    );
  }
  if (oosTrades.length < 3 || oosPeriodic.totalReturnPct <= 0) {
    disqualificationReasons.push(
      `Out-of-Sample Non Confermato (${oosPeriodic.totalReturnPct}% su ${oosTrades.length} trade).`
    );
  }

  const isQualified = disqualificationReasons.length === 0;
  let category: DiscoveryCategory = 'DISQUALIFIED';
  const categoryBadges: string[] = [];

  if (isQualified) {
    if (robustnessScore >= 75 && fullBacktest.totalReturnPct > 15) {
      category = 'BEST_ROBUST';
      categoryBadges.push('Best Robust');
    } else if (noveltyScore >= 75 && robustnessScore >= 55) {
      category = 'MOST_NOVEL';
      categoryBadges.push('Most Novel');
    } else if (mc.maxDrawdown95Pct <= 18 && wf.stability === 'HIGH') {
      category = 'MOST_ROBUST';
      categoryBadges.push('Most Robust');
    } else if (fullBacktest.totalReturnPct / Math.max(1, fullBacktest.maxDrawdownPct) >= 2.0) {
      category = 'BEST_RISK_REWARD';
      categoryBadges.push('Best Risk/Reward');
    } else if (complexityScore <= 35 && robustnessScore >= 60) {
      category = 'BEST_SIMPLE';
      categoryBadges.push('Best Simple');
    } else {
      category = 'MOST_INTERESTING';
      categoryBadges.push('Most Interesting');
    }
  }

  return {
    hypothesis,
    category,
    categoryBadges,
    qualificationStatus: isQualified ? 'QUALIFIED' : 'DISQUALIFIED',
    qualificationVerdict: isQualified
      ? 'Ipotesi verificata su dati storici reali con esecuzione a barra successiva e validazione OOS.'
      : 'Ipotesi scartata: non soddisfa i requisiti minimi di robustezza quantitativa.',
    disqualificationReason: disqualificationReasons[0] || undefined,
    metrics: {
      totalReturnPct: fullBacktest.totalReturnPct,
      cagrPct: fullBacktest.cagrPct,
      profitFactor: fullBacktest.profitFactor,
      maxDrawdownPct: fullBacktest.maxDrawdownPct,
      totalTrades: fullBacktest.totalTrades,
      winRatePct: fullBacktest.winRatePct,
      sharpeRatio: fullBacktest.sharpeRatio,
      avgTradePct: fullBacktest.avgTradePct,
      avgTradeAmount: fullBacktest.avgTradeAmount,
      totalPnlAmount: fullBacktest.totalPnlAmount,
    },
    inSampleMetrics: {
      totalReturnPct: isPeriodic.totalReturnPct,
      profitFactor: isPF,
      trades: isTrades.length,
    },
    outOfSampleMetrics: {
      totalReturnPct: oosPeriodic.totalReturnPct,
      profitFactor: oosPF,
      trades: oosTrades.length,
      oosRetentionRatio,
    },
    scores: {
      robustnessScore,
      noveltyScore,
      complexityScore,
      confidenceScore,
    },
    walkForward: wf,
    monteCarlo: mc,
    parameterStability: paramPlateau,
    crossAssetValidation: crossAsset,
    explainability: {
      coreInsight: `Ipotesi '${hypothesis.name}' (${dna.family}): rendimento netto ${fullBacktest.totalReturnPct}% su ${fullBacktest.totalTrades} trade, PF ${fullBacktest.profitFactor}, Sharpe reale ${fullBacktest.sharpeRatio}.`,
      whyNovel: `Novelty Score ${noveltyScore}/100, complessità ${complexityScore}/100.`,
      riskCaveat: mc.distributionSummary,
    },
    equityCurve: fullBacktest.equityCurve,
    trades: fullBacktest.trades,
  };
}
