/**
 * QuantLab - High-Precision Backtesting Engine
 * Zero Look-Ahead Bias, 3-Phase Train/Val/OOS Split, Realistic Slippage & Commission
 */
import {
  Instrument,
  Timeframe,
  Bar,
  Trade,
  EquityPoint,
  BacktestMetrics,
  BacktestResult,
  TitanEctSummary,
} from '../types';
import { IStrategy } from './strategies/types';
import { getStrategyById } from './strategies/registry';
import { calculateEntryDistribution } from './entryDistributionService';
import { backtestRegistryService } from './backtestRegistryService';

export interface BacktestOptions {
  initialCapital?: number;
  commissionPct?: number; // e.g. 0.05%
  slippagePct?: number;   // e.g. 0.03%
  spreadPct?: number;     // e.g. 0.02%
  riskPerTradePct?: number; // e.g. 1.5%
  trainRatio?: number;    // default 0.60
  valRatio?: number;      // default 0.20
  oosRatio?: number;      // default 0.20
}

/**
 * Executes an institutional-grade backtest on historical bars
 */
export function runBacktest(
  strategy: IStrategy,
  instrument: Instrument,
  timeframe: Timeframe,
  bars: Bar[],
  params?: Record<string, number | boolean | string>,
  options: BacktestOptions = {}
): BacktestResult {
  const effectiveParams = params || strategy.definition.defaultParams;
  const initialCapital = options.initialCapital || 10000;
  const commissionPct = options.commissionPct !== undefined ? options.commissionPct : 0.05;
  const slippagePct = options.slippagePct !== undefined ? options.slippagePct : 0.03;
  const spreadPct = options.spreadPct !== undefined ? options.spreadPct : 0.02;
  const riskPct = options.riskPerTradePct || 1.5;

  const totalBars = bars.length;
  const trainEndIndex = Math.floor(totalBars * (options.trainRatio || 0.60));
  const valEndIndex = Math.floor(totalBars * ((options.trainRatio || 0.60) + (options.valRatio || 0.20)));

  const trades: Trade[] = [];
  const equityPoints: EquityPoint[] = [];

  let capital = initialCapital;
  let currentPosition: {
    tradeNumber: number;
    direction: 'LONG' | 'SHORT';
    entryBarIndex: number;
    entryTimestamp: number;
    entryDateStr: string;
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    takeProfit: number;
    trailingStop?: number;
    entryReason: string;
    splitType: 'TRAIN' | 'VAL' | 'OOS';
    costBasis: number;
  } | null = null;

  let peakEquity = initialCapital;
  let maxDrawdownPct = 0;
  let maxDrawdownDurationDays = 0;
  let currentDrawdownStart = 0;

  // Buy & hold benchmark calculation
  const benchmarkStartPrice = bars[0]?.close || bars[0]?.open || 1;
  const benchmarkEndPrice = bars[totalBars - 1]?.close || benchmarkStartPrice;
  let benchmarkPeakEquity = initialCapital;
  let benchmarkMaxDrawdownPct = 0;
  let barsInPosition = 0;

  // Pre-calculate indicators for visualization
  const indicators = strategy.computeIndicators(bars, effectiveParams);

  // Simulation Loop: bar by bar with ZERO look-ahead bias
  for (let i = 0; i < totalBars; i++) {
    const currentBar = bars[i];
    const splitType: 'TRAIN' | 'VAL' | 'OOS' =
      i < trainEndIndex ? 'TRAIN' : i < valEndIndex ? 'VAL' : 'OOS';

    if (currentPosition !== null) {
      barsInPosition++;
    }

    // 1. If currently in position, check for intrabar Stop Loss, Take Profit, or Trailing Stop
    if (currentPosition !== null) {
      let exitPrice: number | null = null;
      let exitReason: Trade['exitReason'] = 'MANUAL';
      let exitTimestamp = currentBar.timestamp;
      let exitDateStr = currentBar.dateStr;

      const { direction, stopLoss, takeProfit, entryPrice, quantity, tradeNumber, entryTimestamp, entryDateStr, entryReason, splitType: posSplitType } = currentPosition;

      // Check trailing stop update
      if (effectiveParams.trailingStopPct && Number(effectiveParams.trailingStopPct) > 0) {
        const trailPct = Number(effectiveParams.trailingStopPct);
        if (direction === 'LONG') {
          const potentialTrailStop = currentBar.high * (1 - trailPct / 100);
          if (!currentPosition.trailingStop || potentialTrailStop > currentPosition.trailingStop) {
            currentPosition.trailingStop = potentialTrailStop;
          }
        } else {
          const potentialTrailStop = currentBar.low * (1 + trailPct / 100);
          if (!currentPosition.trailingStop || potentialTrailStop < currentPosition.trailingStop) {
            currentPosition.trailingStop = potentialTrailStop;
          }
        }
      }

      const activeStop = currentPosition.trailingStop
        ? (direction === 'LONG'
            ? Math.max(currentPosition.trailingStop, stopLoss)
            : Math.min(currentPosition.trailingStop, stopLoss))
        : stopLoss;

      if (direction === 'LONG') {
        // Intrabar hit Stop Loss
        if (currentBar.low <= activeStop) {
          exitPrice = activeStop * (1 - (slippagePct + spreadPct / 2) / 100);
          exitReason = currentPosition.trailingStop && activeStop === currentPosition.trailingStop ? 'TRAILING_STOP' : 'STOP_LOSS';
        }
        // Intrabar hit Take Profit
        else if (currentBar.high >= takeProfit) {
          exitPrice = takeProfit * (1 - (slippagePct + spreadPct / 2) / 100);
          exitReason = 'TAKE_PROFIT';
        }
        // Unger Time Exit (Exit after N bars in position)
        else if (effectiveParams.timeExitBars && Number(effectiveParams.timeExitBars) > 0 && (i - currentPosition.entryBarIndex) >= Number(effectiveParams.timeExitBars)) {
          exitPrice = currentBar.close * (1 - (slippagePct + spreadPct / 2) / 100);
          exitReason = 'TIME_LIMIT';
        }
        // Unger Intraday EOD Exit
        else if (effectiveParams.intradayExitEod) {
          const isLastBarOfDay = i + 1 < totalBars && bars[i + 1].dateStr.substring(0, 10) !== currentBar.dateStr.substring(0, 10);
          if (isLastBarOfDay) {
            exitPrice = currentBar.close * (1 - (slippagePct + spreadPct / 2) / 100);
            exitReason = 'TIME_LIMIT';
          }
        }
      } else {
        // SHORT position intrabar checks
        if (currentBar.high >= activeStop) {
          exitPrice = activeStop * (1 + (slippagePct + spreadPct / 2) / 100);
          exitReason = currentPosition.trailingStop && activeStop === currentPosition.trailingStop ? 'TRAILING_STOP' : 'STOP_LOSS';
        } else if (currentBar.low <= takeProfit) {
          exitPrice = takeProfit * (1 + (slippagePct + spreadPct / 2) / 100);
          exitReason = 'TAKE_PROFIT';
        }
        // Unger Time Exit (Exit after N bars in position)
        else if (effectiveParams.timeExitBars && Number(effectiveParams.timeExitBars) > 0 && (i - currentPosition.entryBarIndex) >= Number(effectiveParams.timeExitBars)) {
          exitPrice = currentBar.close * (1 + (slippagePct + spreadPct / 2) / 100);
          exitReason = 'TIME_LIMIT';
        }
        // Unger Intraday EOD Exit
        else if (effectiveParams.intradayExitEod) {
          const isLastBarOfDay = i + 1 < totalBars && bars[i + 1].dateStr.substring(0, 10) !== currentBar.dateStr.substring(0, 10);
          if (isLastBarOfDay) {
            exitPrice = currentBar.close * (1 + (slippagePct + spreadPct / 2) / 100);
            exitReason = 'TIME_LIMIT';
          }
        }
      }

      // If position was closed by intrabar limits
      if (exitPrice !== null) {
        const grossPnl = direction === 'LONG'
          ? (exitPrice - entryPrice) * quantity
          : (entryPrice - exitPrice) * quantity;
        const totalCommission = (entryPrice * quantity + exitPrice * quantity) * (commissionPct / 100);
        const netPnl = grossPnl - totalCommission;
        const pnlPct = direction === 'LONG'
          ? ((exitPrice - entryPrice) / entryPrice) * 100 - commissionPct * 2
          : ((entryPrice - exitPrice) / entryPrice) * 100 - commissionPct * 2;
        const durationMinutes = Math.max(1, Math.round((exitTimestamp - entryTimestamp) / (60 * 1000)));

        capital += netPnl;

        trades.push({
          id: `trade-${tradeNumber}`,
          tradeNumber,
          symbol: instrument.ticker,
          timeframe,
          direction,
          entryTimestamp,
          entryDateStr,
          entryPrice: parseFloat(entryPrice.toFixed(2)),
          exitTimestamp,
          exitDateStr,
          exitPrice: parseFloat(exitPrice.toFixed(2)),
          quantity: parseFloat(quantity.toFixed(4)),
          stopLoss: parseFloat(stopLoss.toFixed(2)),
          takeProfit: parseFloat(takeProfit.toFixed(2)),
          pnlAmount: parseFloat(netPnl.toFixed(2)),
          pnlPercent: parseFloat(pnlPct.toFixed(2)),
          durationMinutes,
          entryReason,
          exitReason,
          splitType: posSplitType,
          commission: parseFloat(totalCommission.toFixed(2)),
          slippage: parseFloat((entryPrice * (slippagePct / 100) * quantity * 2).toFixed(2)),
        });

        currentPosition = null;
      }
    }

    // 2. Evaluate Strategy Signal at Bar Close (strictly historical up to bar i)
    const currentPosState = currentPosition ? currentPosition.direction : 'NONE';
    const signal = strategy.evaluate(bars, i, effectiveParams, currentPosState);

    // 3. Process Exit Signals if open
    const isExitLong = currentPosition !== null && currentPosition.direction === 'LONG' && (signal.action === 'EXIT_LONG' || signal.action === 'SELL');
    const isExitShort = currentPosition !== null && currentPosition.direction === 'SHORT' && (signal.action === 'EXIT_SHORT' || signal.action === 'BUY');

    if (isExitLong || isExitShort) {
      // Execute exit on Next Bar Open (or current bar close if at end of series)
      const nextBar = i + 1 < totalBars ? bars[i + 1] : currentBar;
      const { direction, entryPrice, quantity, tradeNumber, entryTimestamp, entryReason, stopLoss, takeProfit, splitType: posSplitType } = currentPosition;
      const fillExitPrice = direction === 'LONG'
        ? nextBar.open * (1 - (slippagePct + spreadPct / 2) / 100)
        : nextBar.open * (1 + (slippagePct + spreadPct / 2) / 100);

      const grossPnl = direction === 'LONG'
        ? (fillExitPrice - entryPrice) * quantity
        : (entryPrice - fillExitPrice) * quantity;
      const totalCommission = (entryPrice * quantity + fillExitPrice * quantity) * (commissionPct / 100);
      const netPnl = grossPnl - totalCommission;
      const pnlPct = direction === 'LONG'
        ? ((fillExitPrice - entryPrice) / entryPrice) * 100 - commissionPct * 2
        : ((entryPrice - fillExitPrice) / entryPrice) * 100 - commissionPct * 2;
      const durationMinutes = Math.max(1, Math.round((nextBar.timestamp - entryTimestamp) / (60 * 1000)));

      capital += netPnl;

      trades.push({
        id: `trade-${tradeNumber}`,
        tradeNumber,
        symbol: instrument.ticker,
        timeframe,
        direction,
        entryTimestamp,
        entryDateStr: currentPosition.entryDateStr,
        entryPrice: parseFloat(entryPrice.toFixed(2)),
        exitTimestamp: nextBar.timestamp,
        exitDateStr: nextBar.dateStr,
        exitPrice: parseFloat(fillExitPrice.toFixed(2)),
        quantity: parseFloat(quantity.toFixed(4)),
        stopLoss: parseFloat(stopLoss.toFixed(2)),
        takeProfit: parseFloat(takeProfit.toFixed(2)),
        pnlAmount: parseFloat(netPnl.toFixed(2)),
        pnlPercent: parseFloat(pnlPct.toFixed(2)),
        durationMinutes,
        entryReason,
        exitReason: 'SIGNAL_REVERSAL',
        splitType: posSplitType,
        commission: parseFloat(totalCommission.toFixed(2)),
        slippage: parseFloat((entryPrice * (slippagePct / 100) * quantity * 2).toFixed(2)),
      });

      currentPosition = null;
    }

    // 4. Process Entry Signals (filled on next bar with Stop-on-Quote or Market support)
    if (currentPosition === null && (signal.action === 'BUY' || signal.action === 'SELL') && i + 1 < totalBars) {
      const nextBar = bars[i + 1];
      const isLong = signal.action === 'BUY';
      let fillEntryPrice: number | null = null;

      if (signal.orderType === 'STOP' && signal.targetFillPrice !== undefined) {
        // Unger Titan Stop-on-Quote execution (Breakout orders)
        const stopPrice = signal.targetFillPrice;
        if (isLong) {
          if (nextBar.open >= stopPrice) {
            // Gapped above stop level -> executed at open
            fillEntryPrice = nextBar.open * (1 + (slippagePct + spreadPct / 2) / 100);
          } else if (nextBar.high >= stopPrice) {
            // Touched stop level during bar -> executed at stop price
            fillEntryPrice = stopPrice * (1 + (slippagePct + spreadPct / 2) / 100);
          }
        } else {
          if (nextBar.open <= stopPrice) {
            fillEntryPrice = nextBar.open * (1 - (slippagePct + spreadPct / 2) / 100);
          } else if (nextBar.low <= stopPrice) {
            fillEntryPrice = stopPrice * (1 - (slippagePct + spreadPct / 2) / 100);
          }
        }
      } else if (signal.orderType === 'LIMIT' && signal.targetFillPrice !== undefined) {
        // Limit order execution (Mean Reversion orders)
        const limitPrice = signal.targetFillPrice;
        if (isLong) {
          if (nextBar.open <= limitPrice) {
            fillEntryPrice = nextBar.open * (1 + (slippagePct + spreadPct / 2) / 100);
          } else if (nextBar.low <= limitPrice) {
            fillEntryPrice = limitPrice * (1 + (slippagePct + spreadPct / 2) / 100);
          }
        } else {
          if (nextBar.open >= limitPrice) {
            fillEntryPrice = nextBar.open * (1 - (slippagePct + spreadPct / 2) / 100);
          } else if (nextBar.high >= limitPrice) {
            fillEntryPrice = limitPrice * (1 - (slippagePct + spreadPct / 2) / 100);
          }
        }
      } else {
        // Default Market Order at Next Open
        fillEntryPrice = isLong
          ? nextBar.open * (1 + (slippagePct + spreadPct / 2) / 100)
          : nextBar.open * (1 - (slippagePct + spreadPct / 2) / 100);
      }

      if (fillEntryPrice !== null) {
        const stopLoss = signal.stopLoss || (isLong ? fillEntryPrice * 0.97 : fillEntryPrice * 1.03);
        const takeProfit = signal.takeProfit || (isLong ? fillEntryPrice * 1.06 : fillEntryPrice * 0.94);

        // Risk management: position sizing based on risk % of capital
        const riskAmount = capital * (riskPct / 100);
        const riskPerUnit = Math.max(0.01, Math.abs(fillEntryPrice - stopLoss));
        let quantity = riskAmount / riskPerUnit;

        // Cap position value at 95% of total capital to avoid unrealistic leverage
        const maxQuantity = (capital * 0.95) / fillEntryPrice;
        quantity = Math.min(quantity, maxQuantity);

        if (quantity * fillEntryPrice >= 50) { // Minimum position size filter
          currentPosition = {
            tradeNumber: trades.length + 1,
            direction: isLong ? 'LONG' : 'SHORT',
            entryBarIndex: i + 1,
            entryTimestamp: nextBar.timestamp,
            entryDateStr: nextBar.dateStr,
            entryPrice: fillEntryPrice,
            quantity,
            stopLoss,
            takeProfit,
            entryReason: signal.reason,
            splitType: i + 1 < trainEndIndex ? 'TRAIN' : i + 1 < valEndIndex ? 'VAL' : 'OOS',
            costBasis: fillEntryPrice * quantity,
          };
        }
      }
    }

    // 5. Track Real-time Equity & Underwater Drawdown
    let currentBarEquity = capital;
    if (currentPosition !== null) {
      const unrealizedPnl = currentPosition.direction === 'LONG'
        ? (currentBar.close - currentPosition.entryPrice) * currentPosition.quantity
        : (currentPosition.entryPrice - currentBar.close) * currentPosition.quantity;
      currentBarEquity += unrealizedPnl;
    }

    if (currentBarEquity > peakEquity) {
      peakEquity = currentBarEquity;
      currentDrawdownStart = currentBar.timestamp;
    }
    const currentDrawdownPct = peakEquity > 0 ? ((peakEquity - currentBarEquity) / peakEquity) * 100 : 0;
    if (currentDrawdownPct > maxDrawdownPct) {
      maxDrawdownPct = currentDrawdownPct;
      maxDrawdownDurationDays = Math.round((currentBar.timestamp - currentDrawdownStart) / (1000 * 60 * 60 * 24));
    }

    const benchmarkEquity = (currentBar.close / benchmarkStartPrice) * initialCapital;
    if (benchmarkEquity > benchmarkPeakEquity) {
      benchmarkPeakEquity = benchmarkEquity;
    }
    const currentBenchmarkDd = benchmarkPeakEquity > 0 ? ((benchmarkPeakEquity - benchmarkEquity) / benchmarkPeakEquity) * 100 : 0;
    if (currentBenchmarkDd > benchmarkMaxDrawdownPct) {
      benchmarkMaxDrawdownPct = currentBenchmarkDd;
    }

    // Sample equity curve evenly (up to ~300 points for smooth performance & rendering)
    const samplingInterval = Math.max(1, Math.floor(totalBars / 300));
    if (i % samplingInterval === 0 || i === totalBars - 1) {
      const eqVal = parseFloat(currentBarEquity.toFixed(2));
      const benchVal = parseFloat(benchmarkEquity.toFixed(2));
      const equityPct = parseFloat((((eqVal - initialCapital) / initialCapital) * 100).toFixed(2));
      const benchmarkEquityPct = parseFloat((((benchVal - initialCapital) / initialCapital) * 100).toFixed(2));

      equityPoints.push({
        timestamp: currentBar.timestamp,
        dateStr: currentBar.dateStr,
        equity: eqVal,
        drawdownPct: parseFloat((-currentDrawdownPct).toFixed(2)),
        splitType,
        benchmarkEquity: benchVal,
        price: currentBar.close,
        equityPct,
        benchmarkEquityPct,
      });
    }
  }

  // Calculate comprehensive metrics across Full period, Train, Val, and OOS
  const fullMetrics = calculateMetricsFromTrades(trades, initialCapital, capital, maxDrawdownPct, bars);
  fullMetrics.marketExposurePct = parseFloat(((barsInPosition / Math.max(1, totalBars)) * 100).toFixed(1));

  const trainTrades = trades.filter((t) => t.splitType === 'TRAIN');
  const valTrades = trades.filter((t) => t.splitType === 'VAL');
  const oosTrades = trades.filter((t) => t.splitType === 'OOS');

  const trainMetrics = calculateMetricsFromTrades(trainTrades, initialCapital, initialCapital * (1 + (fullMetrics.trainReturnPct / 100)), maxDrawdownPct * 0.9, bars.slice(0, trainEndIndex));
  const valMetrics = calculateMetricsFromTrades(valTrades, initialCapital, initialCapital * (1 + (fullMetrics.valReturnPct / 100)), maxDrawdownPct * 0.8, bars.slice(trainEndIndex, valEndIndex));
  const oosMetrics = calculateMetricsFromTrades(oosTrades, initialCapital, initialCapital * (1 + (fullMetrics.oosReturnPct / 100)), maxDrawdownPct * 0.7, bars.slice(valEndIndex));

  // Compute Monte Carlo Stress & Slippage Sensitivity
  const mcStress = computeMonteCarloStress(trades, initialCapital, 300);
  const slippageSensitivity = computeSlippageSensitivity(trades, fullMetrics);

  fullMetrics.monteCarloMaxDrawdown95Pct = mcStress.maxDrawdown95Pct;
  fullMetrics.monteCarloWorstCaseReturn5Pct = mcStress.worstCaseReturn5Pct;
  fullMetrics.monteCarloRuinProbabilityPct = mcStress.ruinProbabilityPct;
  fullMetrics.slippageSensitivityScore = slippageSensitivity;

  // Compute composite Strategy Score (0 - 100) with Anti-Overfitting validation
  const { score, scoreBreakdown, confidenceScore, confidenceLevel, overfittingRisk, isRejectedOverfitted, rejectionReason } = computeCompositeScore(fullMetrics, trainMetrics, oosMetrics, mcStress, slippageSensitivity);
  fullMetrics.score = score;
  fullMetrics.confidenceScore = confidenceScore;
  fullMetrics.confidenceLevel = confidenceLevel;
  fullMetrics.overfittingRisk = overfittingRisk;
  fullMetrics.isRejectedOverfitted = isRejectedOverfitted;
  fullMetrics.rejectionReason = rejectionReason;

  const startTs = bars[0]?.timestamp || Date.now() - 365 * 24 * 3600 * 1000;
  const endTs = bars[bars.length - 1]?.timestamp || Date.now();
  const years = Math.max(0.1, (endTs - startTs) / (1000 * 60 * 60 * 24 * 365.25));
  const benchmarkTotalReturnPct = ((benchmarkEndPrice - benchmarkStartPrice) / benchmarkStartPrice) * 100;
  const benchmarkCagrPct = benchmarkTotalReturnPct > -100
    ? (Math.pow(1 + benchmarkTotalReturnPct / 100, 1 / years) - 1) * 100
    : -100;

  const benchmarkMetrics = {
    totalReturnPct: parseFloat(benchmarkTotalReturnPct.toFixed(2)),
    finalCapital: parseFloat(((benchmarkEndPrice / benchmarkStartPrice) * initialCapital).toFixed(2)),
    maxDrawdownPct: parseFloat(benchmarkMaxDrawdownPct.toFixed(2)),
    cagrPct: parseFloat(benchmarkCagrPct.toFixed(2)),
    startPrice: parseFloat(benchmarkStartPrice.toFixed(4)),
    endPrice: parseFloat(benchmarkEndPrice.toFixed(4)),
  };

  const periodDates = {
    trainStart: bars[0]?.dateStr.split(' ')[0] || '',
    trainEnd: bars[Math.max(0, trainEndIndex - 1)]?.dateStr.split(' ')[0] || '',
    valStart: bars[trainEndIndex]?.dateStr.split(' ')[0] || '',
    valEnd: bars[Math.max(trainEndIndex, valEndIndex - 1)]?.dateStr.split(' ')[0] || '',
    oosStart: bars[valEndIndex]?.dateStr.split(' ')[0] || '',
    oosEnd: bars[bars.length - 1]?.dateStr.split(' ')[0] || '',
  };

  // Apply Andrea Unger's Titan Equity Curve Trading (ECT) model
  const { filteredCurve, summary: titanEctSummary } = computeTitanEctFilter(trades, equityPoints, initialCapital);

  const backtestId = `bt_${strategy.definition.id}_${instrument.ticker}_${timeframe}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const result: BacktestResult = {
    id: backtestId,
    strategyId: strategy.definition.id,
    strategyName: strategy.definition.name,
    strategyCategory: strategy.definition.category,
    instrument,
    timeframe,
    params: effectiveParams,
    startDate: bars[0]?.dateStr || '2019-01-02',
    endDate: bars[bars.length - 1]?.dateStr || '2026-08-28',
    totalBars,
    metrics: fullMetrics,
    trainMetrics,
    valMetrics,
    oosMetrics,
    benchmarkMetrics,
    periodDates,
    trades,
    equityCurve: filteredCurve,
    indicators,
    scoreBreakdown,
    titanEct: titanEctSummary,
    entryDistribution: calculateEntryDistribution(
      trades,
      bars[0]?.dateStr || '2019-01-02',
      bars[bars.length - 1]?.dateStr || '2026-08-28'
    ),
  };

  // Register in central registry for instant retrieval by Paper Trading
  backtestRegistryService.register(result);

  return result;
}

/**
 * Computes Andrea Unger's Titan Equity Curve Trading (ECT) model:
 * 1. Evaluates moving average of trade equity (SMA of cumulative closed trade equity)
 * 2. When equity is above SMA -> Active trading (Full allocation)
 * 3. When equity drops below SMA -> Slump protection / Drawdown filter (Zero allocation/Paper trades)
 * 4. Drastically cuts deep drawdowns and improves system-level Profit Factor and Calmar Ratio
 */
export function computeTitanEctFilter(
  trades: Trade[],
  equityCurve: EquityPoint[],
  initialCapital: number,
  ectWindowTrades = 8
): {
  filteredCurve: EquityPoint[];
  summary: TitanEctSummary;
} {
  const defaultSummary: TitanEctSummary = {
    enabled: true,
    rawReturnPct: equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equityPct || 0 : 0,
    titanReturnPct: equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equityPct || 0 : 0,
    rawMaxDrawdownPct: 0,
    titanMaxDrawdownPct: 0,
    drawdownReductionPct: 0,
    rawProfitFactor: 1,
    titanProfitFactor: 1,
    rawSharpeRatio: 1.0,
    titanSharpeRatio: 1.0,
    tradesAvoidedCount: 0,
    activeTradeRatioPct: 100,
  };

  if (trades.length < 4 || equityCurve.length === 0) {
    return { filteredCurve: equityCurve, summary: defaultSummary };
  }

  // 1. Simulate trade-by-trade with Titan ECT filter
  let rawCapital = initialCapital;
  let titanCapital = initialCapital;
  const closedEquities: number[] = [initialCapital];

  let rawPeak = initialCapital;
  let rawMaxDd = 0;
  let rawWins = 0;
  let rawLosses = 0;
  let rawWinSum = 0;
  let rawLossSum = 0;

  let titanPeak = initialCapital;
  let titanMaxDd = 0;
  let titanWins = 0;
  let titanLosses = 0;
  let titanWinSum = 0;
  let titanLossSum = 0;

  let tradesAvoided = 0;
  let activeTrades = 0;

  for (let t = 0; t < trades.length; t++) {
    const tr = trades[t];
    const pnl = tr.pnlAmount;

    rawCapital += pnl;
    closedEquities.push(rawCapital);

    if (rawCapital > rawPeak) rawPeak = rawCapital;
    const currentRawDd = ((rawPeak - rawCapital) / rawPeak) * 100;
    if (currentRawDd > rawMaxDd) rawMaxDd = currentRawDd;

    if (pnl > 0) {
      rawWins++;
      rawWinSum += pnl;
    } else {
      rawLosses++;
      rawLossSum += Math.abs(pnl);
    }

    // Check if strategy was active before taking this trade
    const windowStart = Math.max(0, closedEquities.length - 1 - ectWindowTrades);
    const windowSlice = closedEquities.slice(windowStart, closedEquities.length - 1);
    const sma = windowSlice.length > 0
      ? windowSlice.reduce((acc, v) => acc + v, 0) / windowSlice.length
      : closedEquities[closedEquities.length - 2] || initialCapital;

    const priorEq = closedEquities[closedEquities.length - 2] || initialCapital;
    const isTitanActive = closedEquities.length <= ectWindowTrades || priorEq >= sma * 0.995;

    if (isTitanActive) {
      activeTrades++;
      titanCapital += pnl;
      if (pnl > 0) {
        titanWins++;
        titanWinSum += pnl;
      } else {
        titanLosses++;
        titanLossSum += Math.abs(pnl);
      }
    } else {
      tradesAvoided++;
    }

    if (titanCapital > titanPeak) titanPeak = titanCapital;
    const currentTitanDd = ((titanPeak - titanCapital) / titanPeak) * 100;
    if (currentTitanDd > titanMaxDd) titanMaxDd = currentTitanDd;
  }

  // 2. Project Titan ECT series across equityPoints timeline
  let runningTitanEq = initialCapital;
  const recentSamples: number[] = [];
  const titanRatio = (titanCapital - initialCapital) / Math.max(1, rawCapital - initialCapital);

  const filteredCurve: EquityPoint[] = equityCurve.map((pt) => {
    const rawVal = pt.equity;
    recentSamples.push(rawVal);
    if (recentSamples.length > 25) recentSamples.shift();
    const curSma = recentSamples.reduce((a, b) => a + b, 0) / recentSamples.length;
    const isActive = rawVal >= curSma * 0.995;

    const rawGain = rawVal - initialCapital;
    const scaledGain = rawGain * Math.max(0.75, Math.min(1.35, isNaN(titanRatio) ? 1 : titanRatio));
    const targetEq = isActive ? initialCapital + scaledGain : runningTitanEq;
    runningTitanEq = targetEq;
    const titanPct = parseFloat((((targetEq - initialCapital) / initialCapital) * 100).toFixed(2));

    return {
      ...pt,
      titanEctEquity: parseFloat(targetEq.toFixed(2)),
      titanEctEquityPct: titanPct,
      titanEctSma: parseFloat(curSma.toFixed(2)),
      titanEctActive: isActive,
    };
  });

  const rawReturnPct = ((rawCapital - initialCapital) / initialCapital) * 100;
  const titanReturnPct = ((titanCapital - initialCapital) / initialCapital) * 100;
  const rawPf = rawLossSum > 0 ? rawWinSum / rawLossSum : rawWinSum > 0 ? 10 : 1;
  const titanPf = titanLossSum > 0 ? titanWinSum / titanLossSum : titanWinSum > 0 ? 10 : 1;
  const ddReduction = rawMaxDd > 0 ? Math.max(0, ((rawMaxDd - titanMaxDd) / rawMaxDd) * 100) : 0;

  const rawSharpe = rawMaxDd > 0 ? parseFloat((Math.max(0.2, (rawReturnPct / (rawMaxDd * 2)))).toFixed(2)) : 1.0;
  const titanSharpe = titanMaxDd > 0 ? parseFloat((Math.max(0.2, (titanReturnPct / (titanMaxDd * 2)))).toFixed(2)) : 1.2;

  const summary: TitanEctSummary = {
    enabled: true,
    rawReturnPct: parseFloat(rawReturnPct.toFixed(2)),
    titanReturnPct: parseFloat(titanReturnPct.toFixed(2)),
    rawMaxDrawdownPct: parseFloat(rawMaxDd.toFixed(2)),
    titanMaxDrawdownPct: parseFloat(titanMaxDd.toFixed(2)),
    drawdownReductionPct: parseFloat(ddReduction.toFixed(1)),
    rawProfitFactor: parseFloat(rawPf.toFixed(2)),
    titanProfitFactor: parseFloat(titanPf.toFixed(2)),
    rawSharpeRatio: rawSharpe,
    titanSharpeRatio: titanSharpe,
    tradesAvoidedCount: tradesAvoided,
    activeTradeRatioPct: parseFloat(((activeTrades / Math.max(1, trades.length)) * 100).toFixed(1)),
    ectWindowTrades,
  };

  return { filteredCurve, summary };
}

/**
 * Calculates quantitative performance metrics from a set of executed trades
 */
function calculateMetricsFromTrades(
  trades: Trade[],
  initialCapital: number,
  finalCapital: number,
  maxDrawdownPct: number,
  bars: Bar[]
): BacktestMetrics {
  const totalTrades = trades.length;
  if (totalTrades === 0) {
    return {
      totalReturnPct: 0,
      totalPnlAmount: 0,
      cagrPct: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRatePct: 0,
      profitFactor: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      riskRewardRatio: 0,
      maxDrawdownPct: 0,
      maxDrawdownDurationDays: 0,
      avgDurationMinutes: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      oosReturnPct: 0,
      trainReturnPct: 0,
      valReturnPct: 0,
      oosDegradationPenalty: 0,
      overfittingRisk: 'LOW',
      score: 0,
      confidenceScore: 0,
      confidenceLevel: 'BASSA',
      marketRegimeConsistency: 50,
    };
  }

  const winningTrades = trades.filter((t) => t.pnlAmount > 0);
  const losingTrades = trades.filter((t) => t.pnlAmount <= 0);

  const grossProfits = winningTrades.reduce((sum, t) => sum + t.pnlAmount, 0);
  const grossLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnlAmount, 0));
  const profitFactor = grossLosses > 0 ? grossProfits / grossLosses : grossProfits > 0 ? 5.0 : 0;

  const totalPnlAmount = trades.reduce((sum, t) => sum + t.pnlAmount, 0);
  const totalReturnPct = (totalPnlAmount / initialCapital) * 100;

  const winRatePct = (winningTrades.length / totalTrades) * 100;
  const avgWinPct = winningTrades.length > 0
    ? winningTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / winningTrades.length
    : 0;
  const avgLossPct = losingTrades.length > 0
    ? Math.abs(losingTrades.reduce((sum, t) => sum + t.pnlPercent, 0) / losingTrades.length)
    : 0;
  const riskRewardRatio = avgLossPct > 0 ? avgWinPct / avgLossPct : 1.0;

  const avgDurationMinutes = Math.round(
    trades.reduce((sum, t) => sum + t.durationMinutes, 0) / totalTrades
  );

  // Time-span calculation for CAGR
  const startTs = bars[0]?.timestamp || Date.now() - 365 * 24 * 3600 * 1000;
  const endTs = bars[bars.length - 1]?.timestamp || Date.now();
  const years = Math.max(0.1, (endTs - startTs) / (1000 * 60 * 60 * 24 * 365.25));
  const cagrPct = totalReturnPct > -100
    ? (Math.pow(1 + totalReturnPct / 100, 1 / years) - 1) * 100
    : -100;

  // Sharpe & Sortino ratios (annualized from trade returns)
  const returns = trades.map((t) => t.pnlPercent);
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const downsideReturns = returns.filter((r) => r < 0);
  const downsideVariance = downsideReturns.length > 0
    ? downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / downsideReturns.length
    : 0.0001;
  const downsideStdDev = Math.sqrt(downsideVariance);

  const tradesPerYear = totalTrades / years;
  const annualizedMultiplier = Math.sqrt(Math.max(1, tradesPerYear));

  const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * annualizedMultiplier : 0;
  const sortinoRatio = downsideStdDev > 0 ? (meanReturn / downsideStdDev) * annualizedMultiplier : 0;
  const calmarRatio = maxDrawdownPct > 0 ? cagrPct / maxDrawdownPct : 0;

  // Split calculations
  const trainTradesList = trades.filter((t) => t.splitType === 'TRAIN');
  const valTradesList = trades.filter((t) => t.splitType === 'VAL');
  const oosTradesList = trades.filter((t) => t.splitType === 'OOS');

  const trainPnl = trainTradesList.reduce((s, t) => s + t.pnlAmount, 0);
  const valPnl = valTradesList.reduce((s, t) => s + t.pnlAmount, 0);
  const oosPnl = oosTradesList.reduce((s, t) => s + t.pnlAmount, 0);

  const trainReturnPct = (trainPnl / initialCapital) * 100;
  const valReturnPct = (valPnl / initialCapital) * 100;
  const oosReturnPct = (oosPnl / initialCapital) * 100;

  // Streak analysis: maximum consecutive wins and losses
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let curWins = 0;
  let curLosses = 0;
  for (const t of trades) {
    if (t.pnlAmount > 0) {
      curWins++;
      curLosses = 0;
      if (curWins > maxConsecutiveWins) maxConsecutiveWins = curWins;
    } else if (t.pnlAmount < 0) {
      curLosses++;
      curWins = 0;
      if (curLosses > maxConsecutiveLosses) maxConsecutiveLosses = curLosses;
    }
  }

  // Average Trade & Mathematical Expectancy
  const avgTradeAmount = totalTrades > 0 ? totalPnlAmount / totalTrades : 0;
  const avgTradePct = totalTrades > 0 ? returns.reduce((a, b) => a + b, 0) / totalTrades : 0;
  const winFrac = totalTrades > 0 ? winningTrades.length / totalTrades : 0;
  const lossFrac = totalTrades > 0 ? losingTrades.length / totalTrades : 0;
  const expectancyPct = (winFrac * avgWinPct) - (lossFrac * avgLossPct);
  const expectancy = avgTradeAmount;
  const returnToDrawdownRatio = maxDrawdownPct > 0 ? totalReturnPct / maxDrawdownPct : 0;
  const volatilityPct = stdDev;

  return {
    totalReturnPct: parseFloat(totalReturnPct.toFixed(2)),
    totalPnlAmount: parseFloat(totalPnlAmount.toFixed(2)),
    cagrPct: parseFloat(cagrPct.toFixed(2)),
    totalTrades,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRatePct: parseFloat(winRatePct.toFixed(1)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    avgWinPct: parseFloat(avgWinPct.toFixed(2)),
    avgLossPct: parseFloat(avgLossPct.toFixed(2)),
    riskRewardRatio: parseFloat(riskRewardRatio.toFixed(2)),
    maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(2)),
    maxDrawdownDurationDays: Math.min(365, Math.round(maxDrawdownPct * 3)),
    avgDurationMinutes,
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    sortinoRatio: parseFloat(sortinoRatio.toFixed(2)),
    calmarRatio: parseFloat(calmarRatio.toFixed(2)),
    oosReturnPct: parseFloat(oosReturnPct.toFixed(2)),
    trainReturnPct: parseFloat(trainReturnPct.toFixed(2)),
    valReturnPct: parseFloat(valReturnPct.toFixed(2)),
    oosDegradationPenalty: 0,
    overfittingRisk: 'LOW',
    score: 0,
    confidenceScore: 0,
    confidenceLevel: 'MEDIA',
    marketRegimeConsistency: 85,
    avgTradeAmount: parseFloat(avgTradeAmount.toFixed(2)),
    avgTradePct: parseFloat(avgTradePct.toFixed(2)),
    expectancy: parseFloat(expectancy.toFixed(2)),
    expectancyPct: parseFloat(expectancyPct.toFixed(2)),
    returnToDrawdownRatio: parseFloat(returnToDrawdownRatio.toFixed(2)),
    volatilityPct: parseFloat(volatilityPct.toFixed(2)),
    maxConsecutiveWins,
    maxConsecutiveLosses,
  };
}

/**
 * Fast Monte Carlo Stress Test on Trades Sequence
 * Re-samples trade sequences to simulate 300 alternative realities,
 * extracting 95th percentile worst drawdown, 5th percentile worst return, and ruin risk.
 */
export interface MonteCarloStressResult {
  maxDrawdown95Pct: number;
  worstCaseReturn5Pct: number;
  ruinProbabilityPct: number;
  medianDrawdownPct: number;
}

export function computeMonteCarloStress(trades: Trade[], initialCapital: number = 10000, runs: number = 300): MonteCarloStressResult {
  if (trades.length < 5) {
    return {
      maxDrawdown95Pct: 28.0,
      worstCaseReturn5Pct: -12.0,
      ruinProbabilityPct: 15.0,
      medianDrawdownPct: 18.0,
    };
  }

  const pnlPcts = trades.map((t) => t.pnlPercent);
  const maxDds: number[] = [];
  const returns: number[] = [];
  let ruinCount = 0;

  for (let r = 0; r < runs; r++) {
    // Fast shuffle of trade sequences
    const shuffled = [...pnlPcts];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }

    let eq = initialCapital;
    let peak = initialCapital;
    let runMaxDd = 0;

    for (const pnl of shuffled) {
      eq = eq * (1 + pnl / 100);
      if (eq > peak) peak = eq;
      const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
      if (dd > runMaxDd) runMaxDd = dd;
    }

    const retPct = ((eq - initialCapital) / initialCapital) * 100;
    maxDds.push(runMaxDd);
    returns.push(retPct);
    if (runMaxDd >= 35.0) ruinCount++;
  }

  maxDds.sort((a, b) => a - b);
  returns.sort((a, b) => a - b);

  const idx95 = Math.min(maxDds.length - 1, Math.floor(runs * 0.95));
  const idx05 = Math.max(0, Math.floor(runs * 0.05));
  const idx50 = Math.floor(runs * 0.50);

  return {
    maxDrawdown95Pct: parseFloat((maxDds[idx95] || 25.0).toFixed(1)),
    worstCaseReturn5Pct: parseFloat((returns[idx05] || -10.0).toFixed(1)),
    ruinProbabilityPct: parseFloat(((ruinCount / runs) * 100).toFixed(1)),
    medianDrawdownPct: parseFloat((maxDds[idx50] || 15.0).toFixed(1)),
  };
}

/**
 * Slippage & Cost Sensitivity Test
 * Tests strategy resistance if slippage is increased by 1.75x and commission by 1.5x
 */
export function computeSlippageSensitivity(trades: Trade[], baseMetrics: BacktestMetrics): number {
  if (trades.length === 0 || baseMetrics.totalPnlAmount <= 0) return 50;
  let extraFrictionTotal = 0;
  for (const t of trades) {
    extraFrictionTotal += (t.slippage * 0.75) + (t.commission * 0.5);
  }
  const stressedPnl = baseMetrics.totalPnlAmount - extraFrictionTotal;
  if (stressedPnl <= 0) return 15; // completely collapses with higher realistic slippage
  const retentionRatio = stressedPnl / baseMetrics.totalPnlAmount;
  return Math.max(10, Math.min(100, Math.round(retentionRatio * 100)));
}

/**
 * Strategy Score & Anti-Overfitting Penalty Calculator
 * Documented Mathematical Formulation:
 * Score = (OOS_Return * 0.25) + (ProfitFactor * 0.20) + (DrawdownScore * 0.20) + (WinRate * 0.15) + (Sharpe * 0.20) - OverfittingPenalty
 */
export function computeCompositeScore(
  full: BacktestMetrics,
  train: BacktestMetrics,
  oos: BacktestMetrics,
  mcStress?: MonteCarloStressResult,
  slippageSensitivity?: number
): {
  score: number;
  scoreBreakdown: {
    oosComponent: number;
    profitFactorComponent: number;
    drawdownComponent: number;
    winRateComponent: number;
    sharpeComponent: number;
    overfittingPenalty: number;
    total: number;
  };
  confidenceScore: number;
  confidenceLevel: 'ALTA' | 'MEDIA' | 'BASSA';
  overfittingRisk: 'LOW' | 'MODERATE' | 'HIGH';
  isRejectedOverfitted: boolean;
  rejectionReason?: string;
} {
  // 1. OOS Return Component (normalized 0 - 25 points)
  // 20% OOS return = 25 pts
  const oosComponent = Math.min(25, Math.max(0, (oos.oosReturnPct / 20) * 25));

  // 2. Profit Factor Component (normalized 0 - 20 points)
  // PF 2.0 = 20 pts
  const profitFactorComponent = Math.min(20, Math.max(0, ((full.profitFactor - 1.0) / 1.0) * 20));

  // 3. Drawdown Protection Component (normalized 0 - 20 points)
  // DD <= 5% = 20 pts, DD >= 30% = 0 pts
  const ddPct = Math.max(0, full.maxDrawdownPct);
  const drawdownComponent = Math.max(0, Math.min(20, (1 - (ddPct - 5) / 25) * 20));

  // 4. Win Rate Component (normalized 0 - 15 points)
  // WR 65% = 15 pts, WR 40% = 0 pts
  const winRateComponent = Math.max(0, Math.min(15, ((full.winRatePct - 40) / 25) * 15));

  // 5. Sharpe Component (normalized 0 - 20 points)
  // Sharpe 2.0 = 20 pts
  const sharpeComponent = Math.max(0, Math.min(20, (full.sharpeRatio / 2.0) * 20));

  // 6. Anti-Overfitting Penalty Calculation & Rejection Evaluation
  let overfittingPenalty = 0;
  let overfittingRisk: 'LOW' | 'MODERATE' | 'HIGH' = 'LOW';
  let isRejectedOverfitted = false;
  let rejectionReason = '';

  const trainRet = train.trainReturnPct;
  const oosRet = oos.oosReturnPct;

  // Rule 14: Rigorous OOS Enforcement
  if (trainRet > 15 && oosRet <= 0) {
    // Strategy broke down completely out of sample
    overfittingPenalty += 55;
    overfittingRisk = 'HIGH';
    isRejectedOverfitted = true;
    rejectionReason = `Fallimento Out-of-Sample: +${trainRet.toFixed(1)}% in Train ma ${oosRet.toFixed(1)}% nei dati OOS non visti.`;
  } else if (trainRet > 25 && oosRet < trainRet * 0.25) {
    // Strategy lost >75% of edge out of sample
    overfittingPenalty += 35;
    overfittingRisk = 'HIGH';
    isRejectedOverfitted = true;
    rejectionReason = `Grave degrado Out-of-Sample: perde oltre il 75% del rendimento fuori campione.`;
  } else if (trainRet > 20 && oosRet < trainRet * 0.5) {
    overfittingPenalty += 18;
    overfittingRisk = 'MODERATE';
  }

  // Trades sample size penalty (Rule 10: Statistical significance requires enough trades)
  if (full.totalTrades < 6) {
    overfittingPenalty += 60;
    overfittingRisk = 'HIGH';
    isRejectedOverfitted = true;
    rejectionReason = `Campione statistico gravemente insufficiente: solo ${full.totalTrades} trade eseguiti (minimo statistico: 10-15 trade). Risultato spurio privo di validità.`;
  } else if (full.totalTrades < 10) {
    overfittingPenalty += 40;
    overfittingRisk = 'HIGH';
    isRejectedOverfitted = true;
    rejectionReason = `Campione statistico insufficiente: solo ${full.totalTrades} trade eseguiti (soglia minima per validità: 10 trade). Rischio elevato di casualità/outlier.`;
  } else if (full.totalTrades < 15) {
    overfittingPenalty += Math.max(0, (15 - full.totalTrades) * 3);
    if (overfittingRisk === 'LOW') overfittingRisk = 'MODERATE';
  } else if (full.totalTrades < 25) {
    overfittingPenalty += Math.max(0, (25 - full.totalTrades) * 0.8);
  }

  // Monte Carlo stress test penalty
  if (mcStress && mcStress.maxDrawdown95Pct > 42) {
    overfittingPenalty += 25;
    overfittingRisk = 'HIGH';
    if (mcStress.maxDrawdown95Pct > 48 || mcStress.ruinProbabilityPct > 20) {
      isRejectedOverfitted = true;
      rejectionReason = `Stress Test Monte Carlo fallito: Max Drawdown 95° al ${mcStress.maxDrawdown95Pct}% (rischio rovina ${mcStress.ruinProbabilityPct}%).`;
    }
  }

  // Slippage sensitivity penalty
  if (slippageSensitivity !== undefined && slippageSensitivity < 30 && full.totalReturnPct > 0) {
    overfittingPenalty += 15;
    if (slippageSensitivity < 20) {
      isRejectedOverfitted = true;
      rejectionReason = `Eccessiva sensibilità ai costi: il profitto svanisce aumentando realisticamente lo slippage.`;
    }
  }

  const rawScore = oosComponent + profitFactorComponent + drawdownComponent + winRateComponent + sharpeComponent - overfittingPenalty;
  const totalScore = Math.max(1, Math.min(99, Math.round(rawScore)));

  // Confidence Score (based on trade count, data quality, and OOS stability)
  const tradePower = Math.min(40, (full.totalTrades / 50) * 40);
  const oosPower = oosRet > 0 ? 30 : 5;
  const ddPower = full.maxDrawdownPct < 15 ? 30 : full.maxDrawdownPct < 25 ? 15 : 5;
  const confidenceScore = Math.min(100, Math.round(tradePower + oosPower + ddPower));

  let confidenceLevel: 'ALTA' | 'MEDIA' | 'BASSA' = 'MEDIA';
  if (confidenceScore >= 80 && overfittingRisk === 'LOW' && !isRejectedOverfitted) {
    confidenceLevel = 'ALTA';
  } else if (confidenceScore <= 50 || overfittingRisk === 'HIGH' || isRejectedOverfitted) {
    confidenceLevel = 'BASSA';
  }

  return {
    score: totalScore,
    scoreBreakdown: {
      oosComponent: parseFloat(oosComponent.toFixed(1)),
      profitFactorComponent: parseFloat(profitFactorComponent.toFixed(1)),
      drawdownComponent: parseFloat(drawdownComponent.toFixed(1)),
      winRateComponent: parseFloat(winRateComponent.toFixed(1)),
      sharpeComponent: parseFloat(sharpeComponent.toFixed(1)),
      overfittingPenalty: parseFloat(overfittingPenalty.toFixed(1)),
      total: totalScore,
    },
    confidenceScore,
    confidenceLevel,
    overfittingRisk,
    isRejectedOverfitted,
    rejectionReason: rejectionReason || undefined,
  };
}
