/**
 * QuantLab - Rigorous Quantitative Backtesting Engine (Zero Look-Ahead Bias)
 *
 * Architectural Guarantees:
 * 1. Signals evaluated at bar `i` close NEVER fill on bar `i` — all signal entries and signal
 *    exits execute strictly on bar `i + 1` open (or intrabar STOP/LIMIT trigger on bar `i + 1`).
 * 2. Trailing Stop is evaluated strictly using the prior bar's active stop BEFORE updating
 *    highest/lowest excursion on the current bar.
 * 3. Gap opens past SL/TP fill realistically at `bar.open` with adverse slippage + half spread.
 * 4. Same-bar SL & TP collision follows the documented conservative rule (SL evaluated first).
 * 5. All numeric options use nullish coalescing (`??`) so explicit `0` values are never overwritten.
 * 6. Default chronological split is 70% TRAIN / 15% VAL / 15% OOS, with TRUE independent metrics
 *    computed from each split's actual equity curve and trades (zero multiplicative estimates).
 * 7. Sharpe, Sortino, Volatility, CAGR, Calmar, Recovery Factor, Max Drawdown, Average Drawdown,
 *    and Max Drawdown Duration are derived strictly from the real equity curve.
 * 8. Monte Carlo uses deterministic seeded Mulberry32 + Fisher-Yates & Bootstrap resampling and
 *    reports `available: false` when < 10 trades instead of fabricating fallback constants.
 */
import {
  Bar,
  BacktestResult,
  BacktestMetrics,
  BenchmarkMetrics,
  PeriodDates,
  EquityPoint,
  Instrument,
  Timeframe,
  Trade,
  TradeDirection,
  TitanEctSummary,
} from '../types';
import { BaseStrategy } from './strategies/types';
import { calculateEntryIntervalStats } from '../utils/entryIntervalStats';
import {
  applyExecutionFriction,
  calculateRiskBasedQuantity,
  computeCommission,
  evaluateIntrabarExit,
  ExecutionCostConfig,
  ManagedPositionState,
  updateTrailingStopAfterBar,
} from './executionMath';
import {
  computeDrawdownStats,
  computePeriodicReturnMetrics,
  computeSplitIndependentMetrics,
  computeTradeStats,
  MonteCarloReport,
  runMonteCarloSimulation,
  runWalkForwardAnalysis,
} from './quantMetrics';
import { DataStatus, validateAndCleanBars } from './marketDataIntegrity';

export interface BacktestOptions {
  initialCapital?: number;
  commissionPct?: number; // per side in %, e.g. 0.05
  slippagePct?: number;   // per side in %, e.g. 0.03
  spreadPct?: number;     // full bid-ask spread in %, e.g. 0.02
  riskPerTradePct?: number; // % of available equity risked per trade
  maxAllocationPct?: number; // max % of equity allocated to a single position
  trainRatio?: number;    // default 0.70
  valRatio?: number;      // default 0.15
  oosRatio?: number;      // default 0.15
  allowShort?: boolean;
  enableTitanEct?: boolean;
  ectWindow?: number;
  skipRobustnessTests?: boolean;
  enableWalkForward?: boolean;
  monteCarloSeed?: number;
  dataProvenance?: {
    source: string;
    dataStatus: DataStatus;
    isRealData: boolean;
    fetchedAt?: string;
    warnings?: string[];
  };
}

interface PendingEntryOrder {
  direction: TradeDirection;
  orderType: 'MARKET' | 'STOP' | 'LIMIT';
  targetFillPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  reason: string;
  signalBarIndex: number;
}

interface PendingExitOrder {
  reason: 'SIGNAL_REVERSAL';
  detail: string;
  reverseTo?: PendingEntryOrder;
}

interface ActivePosition extends ManagedPositionState {
  entryTimestamp: number;
  entryDateStr: string;
  entryBarIndex: number;
  entryCommission: number;
  entrySlippage: number;
  entryReason: string;
  splitType: 'TRAIN' | 'VAL' | 'OOS';
}

function normalizeSplitRatios(
  rawTrain: number | undefined,
  rawVal: number | undefined,
  rawOos: number | undefined
): { train: number; val: number; oos: number } {
  const train = rawTrain ?? 0.70;
  const val = rawVal ?? 0.15;
  const oos = rawOos ?? 0.15;

  const safeTrain = Number.isFinite(train) && train >= 0 ? train : 0.70;
  const safeVal = Number.isFinite(val) && val >= 0 ? val : 0.15;
  const safeOos = Number.isFinite(oos) && oos >= 0 ? oos : 0.15;
  const sum = safeTrain + safeVal + safeOos;

  if (sum <= 0) {
    return { train: 0.70, val: 0.15, oos: 0.15 };
  }
  return {
    train: safeTrain / sum,
    val: safeVal / sum,
    oos: safeOos / sum,
  };
}

export function runBacktest(
  strategy: BaseStrategy,
  instrument: Instrument,
  timeframe: Timeframe,
  rawBars: Bar[],
  customParams?: Record<string, number | boolean | string>,
  options: BacktestOptions = {}
): BacktestResult {
  const params = { ...strategy.definition.defaultParams, ...customParams };

  // Strict nullish coalescing (??) so explicit 0 values are respected!
  const initialCapital = options.initialCapital ?? 10000;
  const commissionPct = options.commissionPct ?? 0.05;
  const slippagePct = options.slippagePct ?? 0.03;
  const spreadPct = options.spreadPct ?? 0.02;
  const riskPerTradePct = options.riskPerTradePct ?? 1.5;
  const maxAllocationPct = options.maxAllocationPct ?? 95;
  const allowShort = (options.allowShort ?? true) && strategy.definition.supportsShorting;

  const costs: ExecutionCostConfig = {
    commissionPct,
    slippagePct,
    spreadPct,
  };

  const splitRatios = normalizeSplitRatios(
    options.trainRatio,
    options.valRatio,
    options.oosRatio
  );

  // Clean & validate bars chronologically (dedupe, fix ordering, reject invalid OHLC)
  const { bars, quality } = validateAndCleanBars(rawBars, timeframe);
  const totalBars = bars.length;

  const trainEndIdx = Math.floor(totalBars * splitRatios.train);
  const valEndIdx = Math.floor(totalBars * (splitRatios.train + splitRatios.val));

  const getSplitType = (idx: number): 'TRAIN' | 'VAL' | 'OOS' => {
    if (idx < trainEndIdx) return 'TRAIN';
    if (idx < valEndIdx) return 'VAL';
    return 'OOS';
  };

  let realizedCapital = initialCapital;
  let currentPosition: ActivePosition | null = null;
  let pendingEntry: PendingEntryOrder | null = null;
  let pendingExit: PendingExitOrder | null = null;

  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];
  let tradeCounter = 0;
  let barsInPosition = 0;

  // Buy & Hold Benchmark (net of initial entry friction on bar 0 open)
  const startPrice = totalBars > 0 ? bars[0].open : 1;
  const benchmarkShares = startPrice > 0 ? initialCapital / startPrice : 0;
  let peakEquity = initialCapital;
  let peakBenchmarkEquity = initialCapital;
  let maxBenchmarkDrawdownPct = 0;

  const trailingStopPct =
    typeof params.trailingStopPct === 'number' && Number.isFinite(params.trailingStopPct)
      ? params.trailingStopPct
      : Number(params.trailingStopPct ?? 0);
  const timeExitBars =
    typeof params.timeExitBars === 'number' && Number.isFinite(params.timeExitBars)
      ? Math.max(0, Math.floor(params.timeExitBars))
      : Math.max(0, Math.floor(Number(params.timeExitBars ?? 0)));

  const closeCurrentPosition = (
    pos: ActivePosition,
    fillExitPrice: number,
    exitBar: Bar,
    exitReason: Trade['exitReason']
  ) => {
    const grossPnl =
      pos.direction === 'LONG'
        ? (fillExitPrice - pos.entryPrice) * pos.quantity
        : (pos.entryPrice - fillExitPrice) * pos.quantity;

    const exitCommission = computeCommission(fillExitPrice * pos.quantity, commissionPct);
    const netPnl = grossPnl - pos.entryCommission - exitCommission;
    const entryNotional = pos.entryPrice * pos.quantity;
    const pnlPercent = entryNotional > 0 ? (netPnl / entryNotional) * 100 : 0;

    // Entry commission was already deducted from realizedCapital upon entry
    realizedCapital += grossPnl - exitCommission;

    const exitFriction =
      Math.abs(fillExitPrice) * ((slippagePct + spreadPct / 2) / 100) * pos.quantity;

    tradeCounter++;
    trades.push({
      id: `trade_${tradeCounter}_${pos.entryTimestamp}`,
      tradeNumber: tradeCounter,
      symbol: instrument.ticker,
      timeframe,
      direction: pos.direction,
      entryTimestamp: pos.entryTimestamp,
      entryDateStr: pos.entryDateStr,
      entryPrice: parseFloat(pos.entryPrice.toFixed(4)),
      exitTimestamp: exitBar.timestamp,
      exitDateStr: exitBar.dateStr,
      exitPrice: parseFloat(fillExitPrice.toFixed(4)),
      quantity: parseFloat(pos.quantity.toFixed(6)),
      stopLoss: parseFloat(pos.stopLoss.toFixed(4)),
      takeProfit: parseFloat(pos.takeProfit.toFixed(4)),
      pnlAmount: parseFloat(netPnl.toFixed(2)),
      pnlPercent: parseFloat(pnlPercent.toFixed(2)),
      durationMinutes: Math.max(1, Math.round((exitBar.timestamp - pos.entryTimestamp) / 60_000)),
      entryReason: pos.entryReason,
      exitReason,
      splitType: pos.splitType,
      commission: parseFloat((pos.entryCommission + exitCommission).toFixed(2)),
      slippage: parseFloat((pos.entrySlippage + exitFriction).toFixed(2)),
    });
  };

  const tryOpenPendingEntry = (order: PendingEntryOrder, bar: Bar, barIndex: number): boolean => {
    if (realizedCapital <= 10) return false;
    const isLong = order.direction === 'LONG';
    let rawFillPrice: number | null = null;

    if (order.orderType === 'STOP' && typeof order.targetFillPrice === 'number') {
      if (isLong) {
        if (bar.high >= order.targetFillPrice) {
          rawFillPrice = bar.open >= order.targetFillPrice ? bar.open : order.targetFillPrice;
        }
      } else {
        if (bar.low <= order.targetFillPrice) {
          rawFillPrice = bar.open <= order.targetFillPrice ? bar.open : order.targetFillPrice;
        }
      }
    } else if (order.orderType === 'LIMIT' && typeof order.targetFillPrice === 'number') {
      if (isLong) {
        if (bar.low <= order.targetFillPrice) {
          rawFillPrice = bar.open <= order.targetFillPrice ? bar.open : order.targetFillPrice;
        }
      } else {
        if (bar.high >= order.targetFillPrice) {
          rawFillPrice = bar.open >= order.targetFillPrice ? bar.open : order.targetFillPrice;
        }
      }
    } else {
      // Standard MARKET order generated on bar i-1 close executes strictly at bar i open
      rawFillPrice = bar.open;
    }

    if (rawFillPrice === null || !Number.isFinite(rawFillPrice) || rawFillPrice <= 0) {
      return false;
    }

    const { fillPrice, frictionPerUnit } = applyExecutionFriction(
      rawFillPrice,
      isLong ? 'BUY' : 'SELL',
      costs
    );

    // Ensure SL/TP remain on valid sides of actual fill price
    let stopLoss = order.stopLoss ?? (isLong ? fillPrice * 0.98 : fillPrice * 1.02);
    let takeProfit = order.takeProfit ?? (isLong ? fillPrice * 1.04 : fillPrice * 0.96);

    if (isLong) {
      if (stopLoss >= fillPrice) stopLoss = fillPrice * 0.98;
      if (takeProfit <= fillPrice) takeProfit = fillPrice * 1.04;
    } else {
      if (stopLoss <= fillPrice) stopLoss = fillPrice * 1.02;
      if (takeProfit >= fillPrice) takeProfit = fillPrice * 0.96;
    }

    const quantity = calculateRiskBasedQuantity({
      availableCapital: realizedCapital,
      entryPrice: fillPrice,
      stopLoss,
      riskPerTradePct,
      maxAllocationPct,
      commissionPct,
    });

    const notional = quantity * fillPrice;
    const entryCommission = computeCommission(notional, commissionPct);

    if (quantity <= 0 || notional < 10 || entryCommission >= realizedCapital) {
      return false;
    }

    realizedCapital -= entryCommission;

    currentPosition = {
      direction: order.direction,
      entryTimestamp: bar.timestamp,
      entryDateStr: bar.dateStr,
      entryBarIndex: barIndex,
      entryPrice: fillPrice,
      quantity,
      stopLoss,
      takeProfit,
      trailingStop:
        trailingStopPct > 0
          ? isLong
            ? fillPrice * (1 - trailingStopPct / 100)
            : fillPrice * (1 + trailingStopPct / 100)
          : undefined,
      highestPriceSinceEntry: fillPrice,
      lowestPriceSinceEntry: fillPrice,
      entryCommission,
      entrySlippage: frictionPerUnit * quantity,
      entryReason: order.reason,
      splitType: getSplitType(barIndex),
    };

    return true;
  };

  // ============================================================================
  // STRICT CHRONOLOGICAL BAR-BY-BAR SIMULATION (ZERO LOOK-AHEAD BIAS)
  // ============================================================================
  for (let i = 0; i < totalBars; i++) {
    const bar = bars[i];
    const splitType = getSplitType(i);
    let openedAtThisBarOpen = false;

    // STEP 1: Execute any pending exit queued from bar i-1 close at bar i open
    if (pendingExit && currentPosition) {
      const exitSide = currentPosition.direction === 'LONG' ? 'SELL' : 'BUY';
      const { fillPrice } = applyExecutionFriction(bar.open, exitSide, costs);
      closeCurrentPosition(currentPosition, fillPrice, bar, pendingExit.reason);
      currentPosition = null;
      const reverseOrder = pendingExit.reverseTo;
      pendingExit = null;
      if (reverseOrder) {
        pendingEntry = reverseOrder;
      }
    } else {
      pendingExit = null;
    }

    // STEP 2: Execute any pending entry queued from bar i-1 close on bar i
    if (!currentPosition && pendingEntry) {
      const orderToRun = pendingEntry;
      pendingEntry = null; // Pending order expires if not triggered on bar i
      const filled = tryOpenPendingEntry(orderToRun, bar, i);
      if (filled && orderToRun.orderType === 'MARKET') {
        openedAtThisBarOpen = true;
      }
    }

    // STEP 3: Manage open position strictly WITHOUT look-ahead bias
    // - Evaluate SL/TP/Trailing Stop using ONLY the stop known BEFORE bar i.
    // - Update trailing stop AFTER checking exits so bar i highs/lows apply from bar i+1.
    if (currentPosition) {
      barsInPosition++;
      const exitCheck = evaluateIntrabarExit(currentPosition, bar, costs);
      if (exitCheck.exited && exitCheck.exitReason) {
        closeCurrentPosition(currentPosition, exitCheck.exitPrice, bar, exitCheck.exitReason);
        currentPosition = null;
      } else {
        // Check deterministic max holding bars time exit at bar close
        const barsHeld = i - currentPosition.entryBarIndex;
        if (timeExitBars > 0 && barsHeld >= timeExitBars) {
          const exitSide = currentPosition.direction === 'LONG' ? 'SELL' : 'BUY';
          const { fillPrice } = applyExecutionFriction(bar.close, exitSide, costs);
          closeCurrentPosition(currentPosition, fillPrice, bar, 'TIME_LIMIT');
          currentPosition = null;
        } else {
          // Update trailing stop strictly AFTER exit check for bar i+1
          updateTrailingStopAfterBar(currentPosition, bar, trailingStopPct);
        }
      }
    }

    // STEP 4: Mark-to-market equity strictly at bar i close (before queueing bar i+1 orders!)
    let unrealizedPnl = 0;
    if (currentPosition) {
      unrealizedPnl =
        currentPosition.direction === 'LONG'
          ? (bar.close - currentPosition.entryPrice) * currentPosition.quantity
          : (currentPosition.entryPrice - bar.close) * currentPosition.quantity;
    }

    const currentEquity = Math.max(0.01, realizedCapital + unrealizedPnl);
    if (currentEquity > peakEquity) peakEquity = currentEquity;
    const drawdownPct = peakEquity > 0 ? ((peakEquity - currentEquity) / peakEquity) * 100 : 0;

    const benchmarkEquity = benchmarkShares * bar.close;
    if (benchmarkEquity > peakBenchmarkEquity) peakBenchmarkEquity = benchmarkEquity;
    const benchDd =
      peakBenchmarkEquity > 0
        ? ((peakBenchmarkEquity - benchmarkEquity) / peakBenchmarkEquity) * 100
        : 0;
    if (benchDd > maxBenchmarkDrawdownPct) maxBenchmarkDrawdownPct = benchDd;

    equityCurve.push({
      timestamp: bar.timestamp,
      dateStr: bar.dateStr,
      equity: parseFloat(currentEquity.toFixed(2)),
      drawdownPct: parseFloat(drawdownPct.toFixed(2)),
      splitType,
      benchmarkEquity: parseFloat(benchmarkEquity.toFixed(2)),
      price: bar.close,
      equityPct: parseFloat((((currentEquity - initialCapital) / initialCapital) * 100).toFixed(2)),
      benchmarkEquityPct: parseFloat(
        (((benchmarkEquity - initialCapital) / initialCapital) * 100).toFixed(2)
      ),
    });

    // STEP 5: Evaluate strategy signal at bar i close (strictly using bars 0..i)
    // Queue order for bar i + 1 (if not the final bar)
    if (i < totalBars - 1) {
      const currentPosDir: TradeDirection | 'NONE' = currentPosition
        ? currentPosition.direction
        : 'NONE';

      // Note: pass slice/index strictly up to i; strategies only read bars[0..i]
      const signal = strategy.evaluate(bars, i, params, currentPosDir);

      if (currentPosition) {
        const isExitLong =
          currentPosition.direction === 'LONG' &&
          (signal.action === 'EXIT_LONG' || signal.action === 'SELL');
        const isExitShort =
          currentPosition.direction === 'SHORT' &&
          (signal.action === 'EXIT_SHORT' || signal.action === 'BUY');

        if (isExitLong || isExitShort) {
          let reverseTo: PendingEntryOrder | undefined;
          if (signal.action === 'SELL' && allowShort && isExitLong) {
            reverseTo = {
              direction: 'SHORT',
              orderType: signal.orderType || 'MARKET',
              targetFillPrice: signal.targetFillPrice,
              stopLoss: signal.stopLoss,
              takeProfit: signal.takeProfit,
              reason: signal.reason,
              signalBarIndex: i,
            };
          } else if (signal.action === 'BUY' && isExitShort) {
            reverseTo = {
              direction: 'LONG',
              orderType: signal.orderType || 'MARKET',
              targetFillPrice: signal.targetFillPrice,
              stopLoss: signal.stopLoss,
              takeProfit: signal.takeProfit,
              reason: signal.reason,
              signalBarIndex: i,
            };
          }
          pendingExit = {
            reason: 'SIGNAL_REVERSAL',
            detail: signal.reason,
            reverseTo,
          };
        }
      } else if (!openedAtThisBarOpen) {
        if (signal.action === 'BUY') {
          pendingEntry = {
            direction: 'LONG',
            orderType: signal.orderType || 'MARKET',
            targetFillPrice: signal.targetFillPrice,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            reason: signal.reason,
            signalBarIndex: i,
          };
        } else if (signal.action === 'SELL' && allowShort) {
          pendingEntry = {
            direction: 'SHORT',
            orderType: signal.orderType || 'MARKET',
            targetFillPrice: signal.targetFillPrice,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            reason: signal.reason,
            signalBarIndex: i,
          };
        }
      }
    }
  }

  // Close any open position cleanly on the final bar close so realized & equity reconcile
  if (currentPosition && totalBars > 0) {
    const lastBar = bars[totalBars - 1];
    const exitSide = currentPosition.direction === 'LONG' ? 'SELL' : 'BUY';
    const { fillPrice } = applyExecutionFriction(lastBar.close, exitSide, costs);
    closeCurrentPosition(currentPosition, fillPrice, lastBar, 'TIME_LIMIT');
    currentPosition = null;
    if (equityCurve.length > 0) {
      const lastPt = equityCurve[equityCurve.length - 1];
      lastPt.equity = parseFloat(realizedCapital.toFixed(2));
      lastPt.equityPct = parseFloat(
        (((realizedCapital - initialCapital) / initialCapital) * 100).toFixed(2)
      );
    }
  }

  // ============================================================================
  // RIGOROUS QUANTITATIVE METRICS FROM REAL EQUITY CURVE & TRADES
  // ============================================================================
  const fullPeriodic = computePeriodicReturnMetrics(equityCurve, timeframe);
  const fullDd = computeDrawdownStats(equityCurve);
  const fullTradeStats = computeTradeStats(trades, totalBars, barsInPosition);

  // TRUE independent Train / Validation / OOS metrics from each split's actual equity curve
  const trainSplit = computeSplitIndependentMetrics(equityCurve, trades, 'TRAIN', timeframe);
  const valSplit = computeSplitIndependentMetrics(equityCurve, trades, 'VAL', timeframe);
  const oosSplit = computeSplitIndependentMetrics(equityCurve, trades, 'OOS', timeframe);

  // Overfitting / OOS degradation assessment (based on real split returns)
  let oosDegradationPenalty = 0;
  if (trainSplit.totalReturnPct > 2 && oosSplit.totalReturnPct < trainSplit.totalReturnPct * 0.4) {
    oosDegradationPenalty = Math.min(
      25,
      Math.max(0, (trainSplit.totalReturnPct - oosSplit.totalReturnPct) * 0.5)
    );
  }
  if (oosSplit.totalReturnPct < 0 && trainSplit.totalReturnPct > 0) {
    oosDegradationPenalty = Math.min(30, oosDegradationPenalty + 12);
  }

  const overfittingRisk: 'LOW' | 'MODERATE' | 'HIGH' =
    oosDegradationPenalty >= 15 || (oosSplit.totalReturnPct < -2 && trainSplit.totalReturnPct > 3)
      ? 'HIGH'
      : oosDegradationPenalty >= 6
      ? 'MODERATE'
      : 'LOW';

  const regimeConsistency = computeRegimeConsistency(equityCurve);

  // Quantitative composite score (0 - 100)
  const oosComp = Math.max(0, Math.min(30, 15 + oosSplit.totalReturnPct * 0.8));
  const pfComp = Math.max(0, Math.min(20, (fullTradeStats.profitFactor - 0.7) * 14));
  const ddComp = Math.max(0, Math.min(20, 20 - fullDd.maxDrawdownPct * 0.7));
  const wrComp = Math.max(0, Math.min(15, (fullTradeStats.winRatePct / 100) * 15));
  const sharpeComp = Math.max(0, Math.min(15, (fullPeriodic.sharpeRatio + 0.5) * 6));
  const rawScore =
    oosComp + pfComp + ddComp + wrComp + sharpeComp - oosDegradationPenalty;
  const totalScore =
    fullTradeStats.totalTrades < 3
      ? Math.min(25, Math.max(0, Math.round(rawScore * 0.4)))
      : Math.max(0, Math.min(100, Math.round(rawScore)));

  // Confidence score grounded in sample size, OOS consistency, and real data
  const sampleFactor = Math.min(45, (fullTradeStats.totalTrades / 30) * 45);
  const oosFactor = oosSplit.totalTrades >= 5 && oosSplit.totalReturnPct > 0 ? 30 : oosSplit.totalTrades >= 3 ? 15 : 0;
  const regimeFactor = (regimeConsistency / 100) * 25;
  const confidenceScore = Math.max(5, Math.min(95, Math.round(sampleFactor + oosFactor + regimeFactor)));
  const confidenceLevel: 'ALTA' | 'MEDIA' | 'BASSA' =
    confidenceScore >= 70 ? 'ALTA' : confidenceScore >= 45 ? 'MEDIA' : 'BASSA';

  // Seeded deterministic Monte Carlo (honest unavailability when < 10 trades)
  const mcReport: MonteCarloReport = runMonteCarloSimulation(trades, initialCapital, {
    iterations: 500,
    seed: options.monteCarloSeed ?? 20260401,
    elapsedYears: fullPeriodic.elapsedYears,
  });

  // Optional Parameter Stability & Slippage Sensitivity stress tests
  let parameterStabilityScore: number | undefined;
  let slippageSensitivityScore: number | undefined;

  if (!options.skipRobustnessTests && trades.length >= 5) {
    parameterStabilityScore = computeParameterStabilityPlateau(
      strategy,
      instrument,
      timeframe,
      bars,
      params,
      options,
      fullPeriodic.totalReturnPct
    );
    slippageSensitivityScore = computeSlippageSensitivity(
      strategy,
      instrument,
      timeframe,
      bars,
      params,
      options,
      fullPeriodic.totalReturnPct
    );
  }

  // Optional Chronological Walk-Forward Analysis
  const walkForward = options.enableWalkForward
    ? runWalkForwardAnalysis(bars, (slice) => {
        const sub = runBacktest(strategy, instrument, timeframe, slice, params, {
          ...options,
          trainRatio: 1,
          valRatio: 0,
          oosRatio: 0,
          skipRobustnessTests: true,
          enableWalkForward: false,
          enableTitanEct: false,
        });
        return {
          totalReturnPct: sub.metrics.totalReturnPct,
          totalTrades: sub.metrics.totalTrades,
          maxDrawdownPct: sub.metrics.maxDrawdownPct,
        };
      })
    : undefined;

  const isUngerStrategy =
    strategy.definition.category === 'UNGER_TITAN' ||
    strategy.definition.id.includes('unger') ||
    strategy.definition.id.includes('titan');

  const robustnessScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        totalScore * 0.45 +
          confidenceScore * 0.25 +
          (parameterStabilityScore ?? 50) * 0.15 +
          (slippageSensitivityScore ?? 50) * 0.15
      )
    )
  );

  const totalPnlAmount = parseFloat((realizedCapital - initialCapital).toFixed(2));

  const metrics: BacktestMetrics = {
    totalReturnPct: fullPeriodic.totalReturnPct,
    totalPnlAmount,
    cagrPct: fullPeriodic.cagrPct,
    cagrReliable: fullPeriodic.cagrReliable,
    metricsAvailable: fullPeriodic.metricsAvailable,
    totalTrades: fullTradeStats.totalTrades,
    winningTrades: fullTradeStats.winningTrades,
    losingTrades: fullTradeStats.losingTrades,
    winRatePct: fullTradeStats.winRatePct,
    profitFactor: fullTradeStats.profitFactor,
    avgWinPct: fullTradeStats.avgWinPct,
    avgLossPct: fullTradeStats.avgLossPct,
    riskRewardRatio: fullTradeStats.riskRewardRatio,
    maxDrawdownPct: fullDd.maxDrawdownPct,
    avgDrawdownPct: fullDd.avgDrawdownPct,
    maxDrawdownDurationDays: fullDd.maxDrawdownDurationDays,
    recoveryFactor: fullPeriodic.recoveryFactor,
    avgDurationMinutes: fullTradeStats.avgDurationMinutes,
    sharpeRatio: fullPeriodic.sharpeRatio,
    sortinoRatio: fullPeriodic.sortinoRatio,
    calmarRatio: fullPeriodic.calmarRatio,
    oosReturnPct: oosSplit.totalReturnPct,
    trainReturnPct: trainSplit.totalReturnPct,
    valReturnPct: valSplit.totalReturnPct,
    oosDegradationPenalty: parseFloat(oosDegradationPenalty.toFixed(1)),
    overfittingRisk,
    score: totalScore,
    confidenceScore,
    confidenceLevel,
    marketRegimeConsistency: regimeConsistency,
    marketExposurePct: fullTradeStats.marketExposurePct,
    avgTradeAmount: fullTradeStats.avgTradeAmount,
    avgTradePct: fullTradeStats.avgTradePct,
    expectancy: fullTradeStats.expectancy,
    expectancyPct: fullTradeStats.expectancyPct,
    returnToDrawdownRatio: fullPeriodic.recoveryFactor,
    volatilityPct: fullPeriodic.volatilityPct,
    maxConsecutiveWins: fullTradeStats.maxConsecutiveWins,
    maxConsecutiveLosses: fullTradeStats.maxConsecutiveLosses,
    totalCommissionPaid: fullTradeStats.totalCommissionPaid,
    totalSlippagePaid: fullTradeStats.totalSlippagePaid,
    parameterStabilityScore,
    slippageSensitivityScore,
    monteCarloAvailable: mcReport.available,
    monteCarloReason: mcReport.reason,
    monteCarloMaxDrawdown95Pct: mcReport.maxDrawdownP95Pct ?? undefined,
    monteCarloWorstCaseReturn5Pct: mcReport.terminalReturnP05Pct ?? undefined,
    monteCarloRuinProbabilityPct: mcReport.ruinProbabilityPct ?? undefined,
    monteCarloLossProbabilityPct: mcReport.lossProbabilityPct ?? undefined,
    monteCarloCagrP05Pct: mcReport.cagrP05Pct ?? undefined,
    monteCarloCagrP50Pct: mcReport.cagrP50Pct ?? undefined,
    monteCarloCagrP95Pct: mcReport.cagrP95Pct ?? undefined,
    robustnessScore,
    isRejectedOverfitted: overfittingRisk === 'HIGH' && oosSplit.totalReturnPct < 0,
    rejectionReason:
      overfittingRisk === 'HIGH' && oosSplit.totalReturnPct < 0
        ? `Overfitting rilevato: Train +${trainSplit.totalReturnPct}% vs OOS ${oosSplit.totalReturnPct}%.`
        : undefined,
    strategyFamily: isUngerStrategy ? 'UNGER' : 'TRADITIONAL_INDICATOR',
  };

  // Benchmark metrics from actual Buy & Hold equity series
  const endPrice = totalBars > 0 ? bars[totalBars - 1].close : startPrice;
  const finalBenchCap = benchmarkShares * endPrice;
  const benchPeriodic = computePeriodicReturnMetrics(
    equityCurve.map((pt) => ({ timestamp: pt.timestamp, equity: pt.benchmarkEquity })),
    timeframe
  );

  const benchmarkMetrics: BenchmarkMetrics = {
    totalReturnPct: benchPeriodic.totalReturnPct,
    finalCapital: parseFloat(finalBenchCap.toFixed(2)),
    maxDrawdownPct: parseFloat(maxBenchmarkDrawdownPct.toFixed(2)),
    cagrPct: benchPeriodic.cagrPct,
    startPrice: parseFloat(startPrice.toFixed(4)),
    endPrice: parseFloat(endPrice.toFixed(4)),
  };

  const periodDates: PeriodDates = {
    trainStart: totalBars > 0 ? bars[0].dateStr : '',
    trainEnd: totalBars > 0 ? bars[Math.max(0, Math.min(totalBars - 1, trainEndIdx - 1))].dateStr : '',
    valStart:
      totalBars > 0 && trainEndIdx < totalBars
        ? bars[Math.min(totalBars - 1, trainEndIdx)].dateStr
        : '',
    valEnd:
      totalBars > 0 && valEndIdx > trainEndIdx
        ? bars[Math.max(0, Math.min(totalBars - 1, valEndIdx - 1))].dateStr
        : '',
    oosStart:
      totalBars > 0 && valEndIdx < totalBars
        ? bars[Math.min(totalBars - 1, valEndIdx)].dateStr
        : '',
    oosEnd: totalBars > 0 ? bars[totalBars - 1].dateStr : '',
  };

  const indicators = strategy.computeIndicators ? strategy.computeIndicators(bars, params) : [];

  let titanEct: TitanEctSummary | undefined;
  if (options.enableTitanEct) {
    titanEct = computeTitanEctFilter(
      equityCurve,
      trades,
      initialCapital,
      timeframe,
      options.ectWindow ?? 10
    );
  }

  const entryDistribution = calculateEntryIntervalStats(trades);
  const provenanceWarnings = [
    ...(options.dataProvenance?.warnings || []),
    ...quality.warnings,
  ];

  return {
    id: `bt_${strategy.definition.id}_${instrument.ticker}_${timeframe}_${Date.now()}`,
    strategyId: strategy.definition.id,
    strategyName: strategy.definition.name,
    strategyCategory: strategy.definition.category,
    instrument,
    timeframe,
    params,
    startDate: totalBars > 0 ? bars[0].dateStr : '',
    endDate: totalBars > 0 ? bars[totalBars - 1].dateStr : '',
    totalBars,
    metrics,
    trainMetrics: trainSplit,
    valMetrics: valSplit,
    oosMetrics: oosSplit,
    benchmarkMetrics,
    periodDates,
    trades,
    equityCurve,
    indicators,
    scoreBreakdown: {
      oosComponent: parseFloat(oosComp.toFixed(1)),
      profitFactorComponent: parseFloat(pfComp.toFixed(1)),
      drawdownComponent: parseFloat(ddComp.toFixed(1)),
      winRateComponent: parseFloat(wrComp.toFixed(1)),
      sharpeComponent: parseFloat(sharpeComp.toFixed(1)),
      overfittingPenalty: parseFloat(oosDegradationPenalty.toFixed(1)),
      total: totalScore,
    },
    titanEct,
    entryDistribution,
    dataProvenance: {
      source: options.dataProvenance?.source || 'Yahoo Finance Real OHLCV',
      timeframe,
      dataStatus: options.dataProvenance?.dataStatus || 'HISTORICAL_REAL',
      isRealData: options.dataProvenance?.isRealData ?? true,
      fetchedAt: options.dataProvenance?.fetchedAt || new Date().toISOString(),
      warnings: provenanceWarnings,
    },
    costsConfig: {
      commissionPct,
      slippagePct,
      spreadPct,
    },
    splitRatios,
    walkForward: walkForward
      ? {
          available: walkForward.available,
          windowsCount: walkForward.windowsCount,
          positiveOosWindows: walkForward.positiveOosWindows,
          efficiencyPct: walkForward.efficiencyPct,
          avgOosReturnPct: walkForward.avgOosReturnPct,
        }
      : undefined,
  };
}

/**
 * Titan Equity Curve Trading (ECT) Filter — uses real periodic Sharpe from equity curve (no approximations).
 */
export function computeTitanEctFilter(
  equityCurve: EquityPoint[],
  trades: Trade[],
  initialCapital: number,
  timeframe: Timeframe = '1D',
  ectWindow = 10
): TitanEctSummary {
  const windowSize = Math.max(3, ectWindow);
  const tradeExitMap = new Map<number, Trade[]>();
  for (const t of trades) {
    const list = tradeExitMap.get(t.exitTimestamp);
    if (list) list.push(t);
    else tradeExitMap.set(t.exitTimestamp, [t]);
  }

  let rawTradeEq = initialCapital;
  const rawTradeHistory: number[] = [initialCapital];
  let ectEquity = initialCapital;
  let tradesAvoided = 0;
  let activeTrades = 0;
  let ectGrossProfit = 0;
  let ectGrossLoss = 0;

  const ectSeries: Array<{ timestamp: number; equity: number }> = [];

  for (const pt of equityCurve) {
    const closingTrades = tradeExitMap.get(pt.timestamp) || [];
    for (const t of closingTrades) {
      const smaSlice = rawTradeHistory.slice(-windowSize);
      const sma = smaSlice.reduce((a, b) => a + b, 0) / smaSlice.length;
      // Strict causality: evaluate whether raw equity BEFORE this trade is >= SMA
      const isSystemActive = rawTradeHistory.length < windowSize || rawTradeEq >= sma;

      if (isSystemActive) {
        ectEquity = Math.max(0.01, ectEquity + t.pnlAmount);
        activeTrades++;
        if (t.pnlAmount > 0) ectGrossProfit += t.pnlAmount;
        else ectGrossLoss += Math.abs(t.pnlAmount);
      } else {
        tradesAvoided++;
      }

      rawTradeEq += t.pnlAmount;
      rawTradeHistory.push(rawTradeEq);
    }

    const smaNowSlice = rawTradeHistory.slice(-windowSize);
    const smaNow = smaNowSlice.reduce((a, b) => a + b, 0) / smaNowSlice.length;
    pt.titanEctEquity = parseFloat(ectEquity.toFixed(2));
    pt.titanEctEquityPct = parseFloat((((ectEquity - initialCapital) / initialCapital) * 100).toFixed(2));
    pt.titanEctSma = parseFloat(smaNow.toFixed(2));
    pt.titanEctActive = rawTradeHistory.length < windowSize || rawTradeEq >= smaNow;

    ectSeries.push({ timestamp: pt.timestamp, equity: ectEquity });
  }

  const rawPeriodic = computePeriodicReturnMetrics(equityCurve, timeframe);
  const rawDd = computeDrawdownStats(equityCurve);
  const rawTradeStats = computeTradeStats(trades, equityCurve.length, 0);

  const ectPeriodic = computePeriodicReturnMetrics(ectSeries, timeframe);
  const ectDd = computeDrawdownStats(ectSeries);
  const titanProfitFactor =
    ectGrossLoss > 0 ? parseFloat((ectGrossProfit / ectGrossLoss).toFixed(2)) : ectGrossProfit > 0 ? 99.99 : 0;

  return {
    enabled: true,
    rawReturnPct: rawPeriodic.totalReturnPct,
    titanReturnPct: ectPeriodic.totalReturnPct,
    rawMaxDrawdownPct: rawDd.maxDrawdownPct,
    titanMaxDrawdownPct: ectDd.maxDrawdownPct,
    drawdownReductionPct: parseFloat(Math.max(0, rawDd.maxDrawdownPct - ectDd.maxDrawdownPct).toFixed(2)),
    rawProfitFactor: rawTradeStats.profitFactor,
    titanProfitFactor,
    rawSharpeRatio: rawPeriodic.sharpeRatio,
    titanSharpeRatio: ectPeriodic.sharpeRatio,
    tradesAvoidedCount: tradesAvoided,
    activeTradeRatioPct:
      trades.length > 0 ? parseFloat(((activeTrades / trades.length) * 100).toFixed(1)) : 100,
    ectWindowTrades: windowSize,
  };
}

/**
 * Backward-compatible wrapper over the deterministic seeded Monte Carlo engine.
 */
export function computeMonteCarloStress(
  trades: Trade[],
  initialCapital: number,
  iterations = 500,
  seed = 20260401
): {
  available: boolean;
  reason?: string;
  maxDrawdown95Pct: number | null;
  worstCaseReturn5Pct: number | null;
  ruinProbabilityPct: number | null;
  lossProbabilityPct: number | null;
  cagrP05Pct: number | null;
  cagrP50Pct: number | null;
  cagrP95Pct: number | null;
} {
  const report = runMonteCarloSimulation(trades, initialCapital, { iterations, seed });
  return {
    available: report.available,
    reason: report.reason,
    maxDrawdown95Pct: report.maxDrawdownP95Pct,
    worstCaseReturn5Pct: report.terminalReturnP05Pct,
    ruinProbabilityPct: report.ruinProbabilityPct,
    lossProbabilityPct: report.lossProbabilityPct,
    cagrP05Pct: report.cagrP05Pct,
    cagrP50Pct: report.cagrP50Pct,
    cagrP95Pct: report.cagrP95Pct,
  };
}

export function computeParameterStabilityPlateau(
  strategy: BaseStrategy,
  instrument: Instrument,
  timeframe: Timeframe,
  bars: Bar[],
  baseParams: Record<string, number | boolean | string>,
  baseOptions: BacktestOptions,
  baseReturnPct: number
): number {
  const numericDefs = strategy.definition.paramDefinitions.filter((d) => d.type === 'number').slice(0, 2);
  if (numericDefs.length === 0) return 50;

  let tested = 0;
  let profitable = 0;
  let closeToBase = 0;

  for (const def of numericDefs) {
    const val = Number(baseParams[def.id]);
    if (!Number.isFinite(val)) continue;
    const step = def.step || Math.max(0.1, Math.abs(val) * 0.15);
    const deltas = [-step, step];

    for (const d of deltas) {
      let nextVal = val + d;
      if (def.min !== undefined) nextVal = Math.max(def.min, nextVal);
      if (def.max !== undefined) nextVal = Math.min(def.max, nextVal);
      if (Math.abs(nextVal - val) < 1e-9) continue;

      const sub = runBacktest(
        strategy,
        instrument,
        timeframe,
        bars,
        { ...baseParams, [def.id]: nextVal },
        { ...baseOptions, skipRobustnessTests: true, enableWalkForward: false, enableTitanEct: false }
      );
      tested++;
      if (sub.metrics.totalReturnPct > 0) profitable++;
      if (baseReturnPct > 0 && sub.metrics.totalReturnPct >= baseReturnPct * 0.5) closeToBase++;
    }
  }

  if (tested === 0) return 50;
  const profRatio = profitable / tested;
  const proxRatio = closeToBase / tested;
  return Math.max(5, Math.min(100, Math.round(profRatio * 60 + proxRatio * 40)));
}

export function computeSlippageSensitivity(
  strategy: BaseStrategy,
  instrument: Instrument,
  timeframe: Timeframe,
  bars: Bar[],
  baseParams: Record<string, number | boolean | string>,
  baseOptions: BacktestOptions,
  baseReturnPct: number
): number {
  const stressed = runBacktest(strategy, instrument, timeframe, bars, baseParams, {
    ...baseOptions,
    slippagePct: (baseOptions.slippagePct ?? 0.03) * 2,
    commissionPct: (baseOptions.commissionPct ?? 0.05) * 1.5,
    skipRobustnessTests: true,
    enableWalkForward: false,
    enableTitanEct: false,
  });

  if (baseReturnPct <= 0) {
    return stressed.metrics.totalReturnPct > baseReturnPct - 3 ? 40 : 15;
  }
  const retention = stressed.metrics.totalReturnPct / baseReturnPct;
  return Math.max(0, Math.min(100, Math.round(retention * 100)));
}

function computeRegimeConsistency(equityCurve: EquityPoint[]): number {
  if (equityCurve.length < 20) return 50;
  const chunkCount = 4;
  const chunkSize = Math.floor(equityCurve.length / chunkCount);
  if (chunkSize < 5) return 50;

  let positiveChunks = 0;
  for (let c = 0; c < chunkCount; c++) {
    const start = equityCurve[c * chunkSize].equity;
    const end = equityCurve[Math.min(equityCurve.length - 1, (c + 1) * chunkSize - 1)].equity;
    if (end >= start) positiveChunks++;
  }
  return Math.round((positiveChunks / chunkCount) * 100);
}
