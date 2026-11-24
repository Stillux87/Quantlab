/**
 * QuantLab - Best Strategy Optimizer & Robustness Engine
 * Finds the absolute top-performing strategy and parameters on target instrument/timeframe/period,
 * and executes cross-timeframe, cross-period, and cross-asset robustness validation matrices.
 */
import {
  Instrument,
  Timeframe,
  Bar,
  BacktestResult,
  OptimizationObjective,
  OptimizedStrategyCandidate,
  StrategyQualificationSummary,
  SavedStrategyPreset,
  TimeframeComparisonRow,
  PeriodComparisonRow,
  AssetComparisonRow,
  StrategyRobustnessAudit,
} from '../types';
import { ALL_STRATEGIES, getStrategyById } from './strategies/registry';
import { IStrategy } from './strategies/types';
import { runBacktest, BacktestOptions } from './backtestEngine';
import { generateHistoricalBars } from './dataFeed';
import { INSTRUMENTS_DATABASE } from '../data/instruments';

/**
 * Classifies strategy into one of the core families:
 * - 'UNGER': Andrea Unger systematic philosophy (ATR breakout, Donchian channels, Dual Momentum, regime filtering)
 * - 'TRADITIONAL_INDICATOR': Classic technical indicators (SuperTrend, EMA, RSI, MACD, Bollinger, VWAP)
 */
export function getStrategyFamily(strategyId: string): 'UNGER' | 'TRADITIONAL_INDICATOR' {
  if (
    strategyId === 'unger_titan_strategy' ||
    strategyId === 'donchian_turtle' ||
    strategyId === 'dual_momentum'
  ) {
    return 'UNGER';
  }
  return 'TRADITIONAL_INDICATOR';
}

interface ParameterGridItem {
  strategyId: string;
  paramName: string;
  variations: Record<string, number | boolean | string>[];
}

/**
 * Grid of curated parameter variations for each modular strategy
 */
const STRATEGY_PARAM_VARIATIONS: Record<string, Record<string, number | boolean | string>[]> = {
  supertrend_trend: [
    { atrPeriod: 10, multiplier: 2.0 },
    { atrPeriod: 10, multiplier: 3.0 },
    { atrPeriod: 14, multiplier: 3.0 },
    { atrPeriod: 14, multiplier: 4.0 },
    { atrPeriod: 7, multiplier: 2.5 },
  ],
  ema_crossover: [
    { fastPeriod: 9, slowPeriod: 21, trendFilterEma: 200 },
    { fastPeriod: 12, slowPeriod: 26, trendFilterEma: 200 },
    { fastPeriod: 20, slowPeriod: 50, trendFilterEma: 200 },
    { fastPeriod: 50, slowPeriod: 200, trendFilterEma: 200 },
    { fastPeriod: 5, slowPeriod: 15, trendFilterEma: 100 },
  ],
  rsi_mean_reversion: [
    { rsiPeriod: 14, oversold: 30, overbought: 70 },
    { rsiPeriod: 14, oversold: 25, overbought: 75 },
    { rsiPeriod: 7, oversold: 20, overbought: 80 },
    { rsiPeriod: 21, oversold: 35, overbought: 65 },
    { rsiPeriod: 10, oversold: 30, overbought: 70 },
  ],
  donchian_turtle: [
    { breakoutPeriod: 20, exitPeriod: 10, stopAtrMultiplier: 2.0 },
    { breakoutPeriod: 55, exitPeriod: 20, stopAtrMultiplier: 2.5 },
    { breakoutPeriod: 10, exitPeriod: 5, stopAtrMultiplier: 1.5 },
    { breakoutPeriod: 30, exitPeriod: 15, stopAtrMultiplier: 2.0 },
  ],
  bollinger_breakout: [
    { bbPeriod: 20, bbDev: 2.0, kcPeriod: 20, kcMult: 1.5 },
    { bbPeriod: 20, bbDev: 2.5, kcPeriod: 20, kcMult: 1.8 },
    { bbPeriod: 14, bbDev: 1.8, kcPeriod: 14, kcMult: 1.3 },
    { bbPeriod: 30, bbDev: 2.2, kcPeriod: 30, kcMult: 1.6 },
  ],
  macd_momentum: [
    { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    { fastPeriod: 8, slowPeriod: 17, signalPeriod: 9 },
    { fastPeriod: 5, slowPeriod: 35, signalPeriod: 5 },
    { fastPeriod: 16, slowPeriod: 34, signalPeriod: 10 },
  ],
  unger_titan_strategy: [
    { atrPeriod: 14, atrMultiplier: 2.0, useRegimeFilter: true, riskPerTradePct: 1.5 },
    { atrPeriod: 10, atrMultiplier: 1.5, useRegimeFilter: true, riskPerTradePct: 2.0 },
    { atrPeriod: 14, atrMultiplier: 2.5, useRegimeFilter: false, riskPerTradePct: 1.5 },
    { atrPeriod: 20, atrMultiplier: 3.0, useRegimeFilter: true, riskPerTradePct: 1.0 },
  ],
  volume_vwap_reversal: [
    { vwapBandStdDev: 2.0, rsiPeriod: 14, rsiOversold: 30, rsiOverbought: 70 },
    { vwapBandStdDev: 2.5, rsiPeriod: 14, rsiOversold: 25, rsiOverbought: 75 },
    { vwapBandStdDev: 1.8, rsiPeriod: 7, rsiOversold: 30, rsiOverbought: 70 },
  ],
  dual_momentum: [
    { shortLookback: 10, longLookback: 60, trendThresholdPct: 1.0 },
    { shortLookback: 20, longLookback: 120, trendThresholdPct: 2.0 },
    { shortLookback: 5, longLookback: 30, trendThresholdPct: 0.5 },
  ],
};

export interface OptimizationRunReport {
  instrument: Instrument;
  timeframe: Timeframe;
  totalBars: number;
  startDate: string;
  endDate: string;
  objective: OptimizationObjective;
  totalCombinationsTested: number;
  minTradesRequired: number;
  hasQualifiedWinner: boolean;
  qualifiedCount: number;
  qualificationSummary: StrategyQualificationSummary;
  // Le Tre Famiglie Distinte di Strategie
  bestOverallWinner: OptimizedStrategyCandidate | null;      // A. Strategia "Migliore" Assoluta (null se nessuna qualificata)
  bestUngerWinner: OptimizedStrategyCandidate | null;        // B. Migliore Filosofia Unger (null se nessuna qualificata)
  bestIndicatorWinner: OptimizedStrategyCandidate | null;    // C. Migliore Indicatori Tradizionali (null se nessuna qualificata)
  // Retrocompatibilità:
  maxProfitWinner: OptimizedStrategyCandidate | null;        // Più redditizia tra le qualificate (null se nessuna qualificata)
  robustWinner: OptimizedStrategyCandidate | null;           // Più robusta tra le qualificate (null se nessuna qualificata)
  allCandidates: OptimizedStrategyCandidate[];
  rejectedCandidatesCount: number;
  insights: string[];
}

/**
 * Parameter Stability / Neighborhood Plateau Test
 * Perturbs numeric parameters by +/- 15-20% to verify if the candidate lies
 * on a robust plateau or a fragile isolated spike (curve-fitting).
 */
export function evaluateParameterStability(
  strategy: IStrategy,
  instrument: Instrument,
  timeframe: Timeframe,
  bars: Bar[],
  baseParams: Record<string, number | boolean | string>,
  baseReturnPct: number,
  options: BacktestOptions = {}
): {
  stabilityScore: number; // 0 - 100
  neighborsTested: number;
  neighborsProfitable: number;
  avgNeighborReturnPct: number;
  isPlateau: boolean;
} {
  const numericKeys = Object.keys(baseParams).filter(
    (k) => typeof baseParams[k] === 'number' && k !== 'maxHoldingBars'
  );

  if (numericKeys.length === 0) {
    return {
      stabilityScore: 80,
      neighborsTested: 1,
      neighborsProfitable: 1,
      avgNeighborReturnPct: baseReturnPct,
      isPlateau: true,
    };
  }

  const perturbations: Record<string, number | boolean | string>[] = [];
  for (const key of numericKeys.slice(0, 3)) {
    const val = baseParams[key] as number;
    if (val === 0) continue;
    const delta = Math.max(1, Math.round(Math.abs(val) * 0.18));
    const isFloat = !Number.isInteger(val);

    const downVal = isFloat ? parseFloat((val * 0.82).toFixed(2)) : Math.max(1, val - delta);
    const upVal = isFloat ? parseFloat((val * 1.18).toFixed(2)) : val + delta;

    perturbations.push({ ...baseParams, [key]: downVal });
    perturbations.push({ ...baseParams, [key]: upVal });
  }

  if (perturbations.length === 0) {
    return {
      stabilityScore: 75,
      neighborsTested: 0,
      neighborsProfitable: 0,
      avgNeighborReturnPct: baseReturnPct,
      isPlateau: true,
    };
  }

  let profitableNeighbors = 0;
  let totalNeighborReturn = 0;

  for (const pParams of perturbations) {
    const res = runBacktest(strategy, instrument, timeframe, bars, pParams, options);
    totalNeighborReturn += res.metrics.totalReturnPct;
    if (res.metrics.totalReturnPct > 0) {
      profitableNeighbors++;
    }
  }

  const avgNeighborReturn = totalNeighborReturn / perturbations.length;
  const passRatio = profitableNeighbors / perturbations.length;

  const returnRetention = baseReturnPct > 0
    ? Math.max(0, Math.min(1.5, avgNeighborReturn / baseReturnPct))
    : avgNeighborReturn > 0 ? 1 : 0.2;

  const rawScore = passRatio * 60 + returnRetention * 40;
  const stabilityScore = Math.max(5, Math.min(100, Math.round(rawScore)));
  const isPlateau = stabilityScore >= 60;

  return {
    stabilityScore,
    neighborsTested: perturbations.length,
    neighborsProfitable: profitableNeighbors,
    avgNeighborReturnPct: parseFloat(avgNeighborReturn.toFixed(2)),
    isPlateau,
  };
}

/**
 * Searches across all strategies and parameter variations to discover the best performer
 */
export function findBestStrategy(
  instrument: Instrument,
  timeframe: Timeframe,
  bars: Bar[],
  objective: OptimizationObjective = 'MAX_PROFIT',
  options: BacktestOptions = {}
): OptimizationRunReport {
  const candidates: OptimizedStrategyCandidate[] = [];

  // Adaptive statistical sample threshold:
  // For ~1 year daily (>= 200 bars) or intraday: minimum 10 trades strictly required
  // For short intervals (< 200 bars): proportional minimum of at least 6 trades
  const minTradesRequired = bars.length >= 200 ? 10 : Math.max(6, Math.floor(bars.length / 20));

  function buildCandidate(
    strategy: IStrategy,
    params: Record<string, number | boolean | string>,
    res: BacktestResult
  ): OptimizedStrategyCandidate {
    const stratId = strategy.definition.id;
    const family = getStrategyFamily(stratId);
    const paramStability = evaluateParameterStability(strategy, instrument, timeframe, bars, params, res.metrics.totalReturnPct, options);

    const m = res.metrics;
    const mcMaxDd = m.monteCarloMaxDrawdown95Pct || 25;
    const mcRuin = m.monteCarloRuinProbabilityPct || 10;
    const slipScore = m.slippageSensitivityScore !== undefined ? m.slippageSensitivityScore : 60;

    const oosRatio = m.trainReturnPct > 0
      ? Math.max(0, m.oosReturnPct / m.trainReturnPct)
      : m.oosReturnPct > 0 ? 1 : 0;
    const oosScore = Math.min(100, Math.max(0, oosRatio * 100));

    // Sample size classification
    let sampleSizeStatus: 'SUFFICIENT' | 'BORDERLINE' | 'INSUFFICIENT' = 'SUFFICIENT';
    let isDisqualifiedForLowTrades = false;

    if (m.totalTrades < minTradesRequired) {
      sampleSizeStatus = 'INSUFFICIENT';
      isDisqualifiedForLowTrades = true;
    } else if (m.totalTrades < 20) {
      sampleSizeStatus = 'BORDERLINE';
    }

    // Trade sample penalty on raw robustness score
    const tradeSamplePenalty = m.totalTrades < minTradesRequired
      ? 55 // severe penalty: cannot achieve high robustness with insufficient trades
      : m.totalTrades < 18
      ? (18 - m.totalTrades) * 2
      : 0;

    // Data snooping / multiple trial penalty (White's Reality Check proxy)
    const dataSnoopingPenalty = 5;

    const rawRobustScore = (
      oosScore * 0.30 +
      paramStability.stabilityScore * 0.20 +
      Math.max(0, 100 - mcMaxDd * 2) * 0.20 +
      slipScore * 0.15 +
      Math.min(100, (m.totalTrades / 25) * 100) * 0.15
    ) - dataSnoopingPenalty - tradeSamplePenalty;

    const robustnessScore = Math.max(1, Math.min(99, Math.round(rawRobustScore)));

    // ==========================================
    // FASE 1 — QUALIFICAZIONE METODOLOGICA
    // ==========================================
    // Ogni strategia viene valutata singolarmente per stabilire se possiede i requisiti
    // minimi per essere considerata una strategia valida e operabile:
    // 1. Rendimento/profitto netto positivo
    // 2. Profit Factor > 1.0
    // 3. Numero di operazioni sufficiente per significatività statistica
    // 4. Drawdown compatibile con i limiti di rischio (max DD <= 35%, MC DD <= 45%, Rovina <= 20%)
    // 5. Rapporto rendimento / drawdown non sfavorevole
    // 6. Stabilità parametrica (plateau vicinato >= 30/100)
    // 7. Criteri anti-overfitting e out-of-sample già integrati
    const disqualificationReasons: string[] = [];

    // 1. Rendimento / profitto netto positivo
    if (m.totalReturnPct <= 0 || m.totalPnlAmount <= 0) {
      disqualificationReasons.push(
        `Rendimento Netto Negativo o Nullo (${m.totalReturnPct >= 0 ? '+' : ''}${m.totalReturnPct.toFixed(2)}%): Una strategia deve produrre un profitto netto per essere considerata valida.`
      );
    }

    // 2. Profit Factor > 1.0
    if (m.profitFactor <= 1.0) {
      disqualificationReasons.push(
        `Profit Factor Insufficiente (${m.profitFactor.toFixed(2)} ≤ 1.00): Le perdite lorde superano o eguagliano i profitti lordi, indicando assenza di edge statistico.`
      );
    }

    // 3. Numero di operazioni sufficiente per significatività statistica
    if (m.totalTrades < minTradesRequired) {
      disqualificationReasons.push(
        `Campione Statistico Insufficiente (${m.totalTrades} trade < ${minTradesRequired} minimi su ${bars.length} barre): Rischio elevato di casualità / outlier.`
      );
    }

    // 4. Drawdown compatibile con la gestione del rischio
    if (m.maxDrawdownPct > 35) {
      disqualificationReasons.push(
        `Drawdown Eccessivo (${m.maxDrawdownPct.toFixed(1)}% > 35.0%): Il calo massimo di capitale supera la tolleranza di rischio del sistema.`
      );
    }
    if (mcMaxDd > 45 || mcRuin > 20) {
      disqualificationReasons.push(
        `Stress Test Monte Carlo Sfavorevole: Max Drawdown 95° al ${mcMaxDd}% (> 45%) o Rischio Rovina al ${mcRuin}% (> 20%).`
      );
    }

    // 5. Rapporto Rendimento / Drawdown
    if (m.totalReturnPct > 0) {
      const returnToDdRatio = m.totalReturnPct / Math.max(0.5, m.maxDrawdownPct);
      if (returnToDdRatio < 0.25) {
        disqualificationReasons.push(
          `Rapporto Rendimento/Drawdown Sfavorevole (${returnToDdRatio.toFixed(2)} < 0.25): Il rendimento generato non compensa il rischio di drawdown subito.`
        );
      }
    }

    // 6. Stabilità parametrica (Plateau nel vicinato)
    if (paramStability.stabilityScore < 30) {
      disqualificationReasons.push(
        `Fragilità Parametrica: Picco isolato non confermato dall'intorno (Stabilità: ${paramStability.stabilityScore}/100 < 30).`
      );
    }

    // 7. Criteri anti-overfitting o out-of-sample già presenti
    let isRejectedOverfitted = m.isRejectedOverfitted || false;
    let rejectionReason = m.rejectionReason || '';
    if (isRejectedOverfitted && rejectionReason) {
      disqualificationReasons.push(`Filtro Anti-Overfitting QuantLab: ${rejectionReason}`);
    }

    const isQualified = disqualificationReasons.length === 0;
    const primaryDisqualificationReason = disqualificationReasons[0] || undefined;
    if (!isQualified) {
      isRejectedOverfitted = true;
      rejectionReason = primaryDisqualificationReason || 'Requisiti minimi di qualificazione non soddisfatti';
    }

    return {
      strategyId: stratId,
      strategyName: strategy.definition.name,
      strategyFamily: family,
      params,
      metrics: m,
      fullResult: res,
      candidateRank: 0,
      isQualified,
      disqualificationReasons,
      primaryDisqualificationReason,
      isMaxProfitWinner: false,
      isRobustWinner: false,
      isOverallWinner: false,
      isUngerWinner: false,
      isIndicatorWinner: false,
      isRejectedOverfitted,
      rejectionReason: rejectionReason || undefined,
      sampleSizeStatus,
      isDisqualifiedForLowTrades,
      explanation: generateStrategyExplanation(
        strategy.definition.name,
        res,
        isQualified,
        isRejectedOverfitted,
        rejectionReason,
        isDisqualifiedForLowTrades
      ),
      robustnessScore,
      parameterStabilityScore: paramStability.stabilityScore,
      monteCarloMaxDrawdown95Pct: mcMaxDd,
      monteCarloRuinProbabilityPct: mcRuin,
      slippageSensitivityScore: slipScore,
    };
  }

  for (const strategy of ALL_STRATEGIES) {
    const stratId = strategy.definition.id;

    // 1. Test default params
    const defaultParams = { ...strategy.definition.defaultParams };
    const defaultRes = runBacktest(strategy, instrument, timeframe, bars, defaultParams, options);
    candidates.push(buildCandidate(strategy, defaultParams, defaultRes));

    // 2. Test parameter variations if defined
    const variations = STRATEGY_PARAM_VARIATIONS[stratId] || [];
    for (const vParams of variations) {
      const mergedParams = { ...defaultParams, ...vParams };
      const vRes = runBacktest(strategy, instrument, timeframe, bars, mergedParams, options);
      candidates.push(buildCandidate(strategy, mergedParams, vRes));
    }
  }

  // ==========================================
  // FASE 2 — SELEZIONE DELLA MIGLIOR STRATEGIA
  // ==========================================
  // Solo dopo aver eliminato tutte le strategie NON QUALIFICATE, confrontare
  // tra loro le strategie rimaste.
  // La "Miglior Strategia" deve quindi essere sempre scelta esclusivamente tra
  // le strategie che hanno superato i requisiti minimi di validità e robustezza.
  // Non deve mai essere scelta la strategia semplicemente perché ha ottenuto
  // il risultato meno negativo.
  const qualifiedCandidates = candidates.filter((c) => c.isQualified);
  const hasQualifiedWinner = qualifiedCandidates.length > 0;

  let bestOverallWinner: OptimizedStrategyCandidate | null = null;
  let bestUngerWinner: OptimizedStrategyCandidate | null = null;
  let bestIndicatorWinner: OptimizedStrategyCandidate | null = null;
  let maxProfitWinner: OptimizedStrategyCandidate | null = null;
  let robustWinner: OptimizedStrategyCandidate | null = null;

  if (hasQualifiedWinner) {
    // A. STRATEGIA "MIGLIORE" ASSOLUTA (Overall Winner)
    // Valutazione bilanciata tra robustezza composita e score quantitativo tra le sole qualificate
    const rankedOverall = [...qualifiedCandidates].sort((a, b) => {
      const scoreA = (a.robustnessScore || 50) * 0.55 + a.metrics.score * 0.45;
      const scoreB = (b.robustnessScore || 50) * 0.55 + b.metrics.score * 0.45;
      return scoreB - scoreA;
    });
    bestOverallWinner = rankedOverall[0];
    bestOverallWinner.isOverallWinner = true;
    bestOverallWinner.isRobustWinner = true;
    robustWinner = bestOverallWinner;

    // B. STRATEGIA FILOSOFIA UNGER (Unger Method Winner)
    const ungerQualified = qualifiedCandidates.filter((c) => c.strategyFamily === 'UNGER');
    if (ungerQualified.length > 0) {
      const rankedUnger = [...ungerQualified].sort((a, b) => {
        const scoreA = (a.robustnessScore || 50) * 0.55 + a.metrics.score * 0.45;
        const scoreB = (b.robustnessScore || 50) * 0.55 + b.metrics.score * 0.45;
        return scoreB - scoreA;
      });
      bestUngerWinner = rankedUnger[0];
      bestUngerWinner.isUngerWinner = true;
    }

    // C. STRATEGIA INDICATORI TRADIZIONALI (Traditional Technical Indicators Winner)
    const indicatorQualified = qualifiedCandidates.filter((c) => c.strategyFamily === 'TRADITIONAL_INDICATOR');
    if (indicatorQualified.length > 0) {
      const rankedIndicators = [...indicatorQualified].sort((a, b) => {
        const scoreA = (a.robustnessScore || 50) * 0.55 + a.metrics.score * 0.45;
        const scoreB = (b.robustnessScore || 50) * 0.55 + b.metrics.score * 0.45;
        return scoreB - scoreA;
      });
      bestIndicatorWinner = rankedIndicators[0];
      bestIndicatorWinner.isIndicatorWinner = true;
    }

    // D. MASSIMO RENDIMENTO TRA LE QUALIFICATE
    const qualifiedByReturn = [...qualifiedCandidates].sort((a, b) => b.metrics.totalReturnPct - a.metrics.totalReturnPct);
    maxProfitWinner = qualifiedByReturn[0];
    maxProfitWinner.isMaxProfitWinner = true;
  }

  // Diagnostics & Statistics across all tested candidates (anche se non qualificate)
  const bestReturnPct = candidates.length > 0
    ? Math.max(...candidates.map((c) => c.metrics.totalReturnPct))
    : 0;
  const bestProfitFactor = candidates.length > 0
    ? Math.max(...candidates.map((c) => c.metrics.profitFactor))
    : 0;
  const bestTrades = candidates.length > 0
    ? Math.max(...candidates.map((c) => c.metrics.totalTrades))
    : 0;

  // Best candidate purely for diagnostic inspection (MAI come raccomandazione)
  const sortedForDiagnostics = [...candidates].sort((a, b) => {
    if (a.isQualified && !b.isQualified) return -1;
    if (!a.isQualified && b.isQualified) return 1;
    return b.metrics.totalReturnPct - a.metrics.totalReturnPct;
  });
  const bestDiagnosticCandidate = sortedForDiagnostics[0] || null;

  // Determina sinteticamente il motivo principale di mancata qualificazione
  let primaryDisqualificationReason = 'Nessuna delle strategie testate ha superato i requisiti minimi di validità.';
  if (bestReturnPct <= 0) {
    primaryDisqualificationReason = `Tutte le strategie testate hanno registrato un rendimento netto negativo (miglior risultato: ${bestReturnPct.toFixed(1)}%). Nessun edge statistico riscontrato.`;
  } else if (bestProfitFactor <= 1.0) {
    primaryDisqualificationReason = `Nessuna strategia ha raggiunto un Profit Factor > 1.00 (miglior PF ottenuto: ${bestProfitFactor.toFixed(2)}). Le perdite eguagliano o superano i profitti.`;
  } else if (bestTrades < minTradesRequired) {
    primaryDisqualificationReason = `Nessuna strategia ha raggiunto la soglia minima di ${minTradesRequired} trade sul periodo analizzato (massimo trade registrato: ${bestTrades}). Campione statistico insufficiente.`;
  } else if (!hasQualifiedWinner) {
    const firstReason = candidates.find((c) => c.primaryDisqualificationReason)?.primaryDisqualificationReason;
    if (firstReason) primaryDisqualificationReason = firstReason;
  }

  const diagnosticConclusion = hasQualifiedWinner
    ? `Identificate ${qualifiedCandidates.length} combinazioni operative valide con edge statistico confermato.`
    : `Nessuna delle strategie attualmente testate ha dimostrato un edge sufficiente su questo titolo nel periodo analizzato.`;

  const qualificationSummary: StrategyQualificationSummary = {
    totalTested: candidates.length,
    totalQualified: qualifiedCandidates.length,
    bestReturnPct,
    bestProfitFactor,
    bestTrades,
    primaryDisqualificationReason,
    diagnosticConclusion,
    bestDiagnosticCandidate,
  };

  // Ordina tutte le combinazioni per la tabella di audit e diagnostica:
  // 1. Le strategie qualificate precedono rigorosamente quelle non qualificate
  // 2. Tra le qualificate, ordina per l'obiettivo selezionato dall'utente
  // 3. Tra le non qualificate, mantieni ordinamento per rendimento decrescente a fini diagnostici
  candidates.sort((a, b) => {
    if (a.isQualified && !b.isQualified) return -1;
    if (!a.isQualified && b.isQualified) return 1;

    if (a.isQualified && b.isQualified) {
      if (objective === 'MAX_PROFIT') {
        return b.metrics.totalReturnPct - a.metrics.totalReturnPct;
      }
      if (objective === 'MAX_PROFIT_FACTOR') {
        return b.metrics.profitFactor - a.metrics.profitFactor;
      }
      if (objective === 'MAX_SHARPE') {
        return b.metrics.sharpeRatio - a.metrics.sharpeRatio;
      }
      // BALANCED_ROBUST
      const scoreA = (a.robustnessScore || 50) * 0.55 + a.metrics.score * 0.45;
      const scoreB = (b.robustnessScore || 50) * 0.55 + b.metrics.score * 0.45;
      return scoreB - scoreA;
    }

    // Tra le non qualificate: ordine per rendimento per diagnosticare le meno peggiori
    return b.metrics.totalReturnPct - a.metrics.totalReturnPct;
  });

  candidates.forEach((c, idx) => {
    c.candidateRank = idx + 1;
  });

  const rejectedCandidatesCount = candidates.filter((c) => !c.isQualified || c.isRejectedOverfitted).length;

  // Insights generation
  const insights: string[] = [];

  if (!hasQualifiedWinner) {
    insights.push(
      `🔴 NESSUNA STRATEGIA QUALIFICATA: Su ${candidates.length} combinazioni analizzate, nessuna ha dimostrato un vantaggio statistico sufficiente per essere considerata operativamente valida sul titolo nel periodo analizzato (${bars.length} barre). Miglior rendimento: ${bestReturnPct >= 0 ? '+' : ''}${bestReturnPct.toFixed(1)}%, Miglior Profit Factor: ${bestProfitFactor.toFixed(2)}.`
    );
    insights.push(
      `ℹ️ CONCLUSIONE: ${diagnosticConclusion} Nota: Questo non significa che il titolo sia da scartare definitivamente, ma che i modelli quantitativi attuali non mostrano un edge statistico sufficiente sulle condizioni di mercato testate.`
    );
  } else {
    insights.push(
      `✅ QUALIFICAZIONE COMPLETATA: ${qualifiedCandidates.length} combinazioni su ${candidates.length} hanno superato tutti i requisiti minimi di redditività positiva, Profit Factor > 1.0, significatività statistica (≥ ${minTradesRequired} trade) e tenuta del drawdown.`
    );
    if (bestOverallWinner) {
      insights.push(
        `🏆 Strategia "Migliore" Assoluta: "${bestOverallWinner.strategyName}" (Rendimento: +${bestOverallWinner.metrics.totalReturnPct.toFixed(1)}%, Score Robustezza: ${bestOverallWinner.robustnessScore}/100, Stabilità Parametri: ${bestOverallWinner.parameterStabilityScore}/100, Trade: ${bestOverallWinner.metrics.totalTrades}, Monte Carlo DD: -${bestOverallWinner.monteCarloMaxDrawdown95Pct}%).`
      );
    }
    if (bestUngerWinner) {
      insights.push(
        `🛡️ Migliore Filosofia Unger: "${bestUngerWinner.strategyName}" (Rendimento: +${bestUngerWinner.metrics.totalReturnPct.toFixed(1)}%, Win Rate: ${bestUngerWinner.metrics.winRatePct.toFixed(0)}%, Trade: ${bestUngerWinner.metrics.totalTrades}, Score: ${bestUngerWinner.robustnessScore}/100).`
      );
    }
    if (bestIndicatorWinner) {
      insights.push(
        `📊 Migliore Indicatori Tradizionali: "${bestIndicatorWinner.strategyName}" (Rendimento: +${bestIndicatorWinner.metrics.totalReturnPct.toFixed(1)}%, Profit Factor: ${bestIndicatorWinner.metrics.profitFactor.toFixed(2)}, Trade: ${bestIndicatorWinner.metrics.totalTrades}, Score: ${bestIndicatorWinner.robustnessScore}/100).`
      );
    }
  }

  if (rejectedCandidatesCount > 0) {
    insights.push(
      `🔍 Audit di Qualificazione: ${rejectedCandidatesCount} combinazioni su ${candidates.length} sono state classificate NON QUALIFICATE per mancata redditività, Profit Factor ≤ 1, campione insufficiente o fragilità parametrica.`
    );
  }

  return {
    instrument,
    timeframe,
    totalBars: bars.length,
    startDate: bars[0]?.dateStr || 'N/A',
    endDate: bars[bars.length - 1]?.dateStr || 'N/A',
    objective,
    totalCombinationsTested: candidates.length,
    minTradesRequired,
    hasQualifiedWinner,
    qualifiedCount: qualifiedCandidates.length,
    qualificationSummary,
    bestOverallWinner,
    bestUngerWinner,
    bestIndicatorWinner,
    maxProfitWinner,
    robustWinner,
    allCandidates: candidates,
    rejectedCandidatesCount,
    insights,
  };
}

function calculateCandidateRobustScore(candidate: OptimizedStrategyCandidate): number {
  const m = candidate.metrics;
  const returnScore = Math.min(Math.max(m.totalReturnPct, -50), 150);
  const pfScore = Math.min(m.profitFactor, 4) * 20;
  const ddPenalty = Math.min(m.maxDrawdownPct, 50) * 1.5;
  const tradePenaltyOrBonus = m.totalTrades < 10
    ? (m.totalTrades - 10) * 8
    : Math.min(m.totalTrades, 30) * 1.5;
  const winRateBonus = (m.winRatePct - 50) * 0.5;

  return returnScore + pfScore - ddPenalty + tradePenaltyOrBonus + winRateBonus;
}

function generateStrategyExplanation(
  strategyName: string,
  res: BacktestResult,
  isQualified: boolean,
  isRejectedOverfitted?: boolean,
  rejectionReason?: string,
  isDisqualifiedForLowTrades?: boolean
): string {
  if (!isQualified) {
    return `🔴 Non qualificata: ${rejectionReason || 'Requisiti minimi di validità non soddisfatti'}. Rendimento: ${res.metrics.totalReturnPct >= 0 ? '+' : ''}${res.metrics.totalReturnPct.toFixed(1)}%, PF: ${res.metrics.profitFactor.toFixed(2)}, Trade: ${res.metrics.totalTrades}.`;
  }
  if (isDisqualifiedForLowTrades || (res.metrics.totalTrades < 10 && isRejectedOverfitted)) {
    return `⚠️ Squalificata per campione statistico insufficiente: ha eseguito solo ${res.metrics.totalTrades} trade. I parametri non hanno significatività quantitativa affidabile.`;
  }
  if (isRejectedOverfitted) {
    return `⚠️ Scartata per overfitting/fragilità: ${rejectionReason || 'I risultati sul passato non mostrano sufficiente stabilità o persistenza Out-of-Sample.'}`;
  }
  const m = res.metrics;
  if (m.totalReturnPct > 20 && m.profitFactor > 1.5) {
    return `${strategyName} ha catturato con successo i movimenti direzionali con un ottimo Profit Factor (${m.profitFactor.toFixed(2)}) e Drawdown contenuto al ${m.maxDrawdownPct.toFixed(1)}% in ${m.totalTrades} trade validi.`;
  }
  if (m.totalReturnPct > 0) {
    return `${strategyName} ha generato un risultato positivo (+${m.totalReturnPct.toFixed(1)}%) in ${m.totalTrades} trade con Win Rate del ${m.winRatePct.toFixed(0)}%.`;
  }
  return `${strategyName} ha sofferto le fasi di congestione di questo titolo/periodo, registrando ${m.totalTrades} trade con Drawdown del ${m.maxDrawdownPct.toFixed(1)}%.`;
}

// ---------------------------------------------------------------------------
// Cross-Market & Robustness Matrix Generators
// ---------------------------------------------------------------------------

/**
 * 1. Cross-Timeframe Analysis
 * Executes the saved strategy across multiple timeframes for the same instrument
 */
export function runCrossTimeframeMatrix(
  preset: SavedStrategyPreset,
  instrument: Instrument
): TimeframeComparisonRow[] {
  const strategy = getStrategyById(preset.strategyId);
  if (!strategy) return [];

  const timeframes: Timeframe[] = ['15m', '30m', '1h', '4h', '1D'];
  const rows: TimeframeComparisonRow[] = [];

  for (const tf of timeframes) {
    const isBaseline = tf === preset.timeframe;

    // When evaluating the baseline timeframe on which the strategy was calibrated,
    // strictly use the original metrics so results are 100% identical!
    if (isBaseline && preset.originalMetrics) {
      const om = preset.originalMetrics;
      const isProfitable = om.totalReturnPct > 0;
      let status: 'STABLE' | 'DEGRADED' | 'FAILED' = 'STABLE';
      if (!isProfitable) {
        status = 'FAILED';
      } else if (om.profitFactor < 1.2 || om.maxDrawdownPct > 35) {
        status = 'DEGRADED';
      }

      const labelMap: Record<Timeframe, string> = {
        '1m': '1 Minuto',
        '5m': '5 Minuti',
        '15m': '15 Minuti (Intraday Veloce)',
        '30m': '30 Minuti (Intraday Medio)',
        '1h': '1 Ora (Swing Breve)',
        '2h': '2 Ore (Swing Medio-Breve)',
        '4h': '4 Ore (Swing Medio)',
        '1D': '1 Giorno (Daily Swing)',
      };

      rows.push({
        timeframe: tf,
        label: labelMap[tf] || tf,
        totalReturnPct: parseFloat(om.totalReturnPct.toFixed(2)),
        profitFactor: parseFloat(om.profitFactor.toFixed(2)),
        maxDrawdownPct: parseFloat(om.maxDrawdownPct.toFixed(1)),
        winRatePct: parseFloat(om.winRatePct.toFixed(1)),
        totalTrades: om.totalTrades,
        isBaseline: true,
        isProfitable,
        status,
      });
      continue;
    }

    // Generate or fetch bars for other timeframes
    const bars = generateHistoricalBars(
      instrument,
      tf,
      preset.dateRange.startDate,
      preset.dateRange.endDate
    );

    const res = runBacktest(strategy, instrument, tf, bars, preset.params);
    const m = res.metrics;
    const isProfitable = m.totalReturnPct > 0;

    let status: 'STABLE' | 'DEGRADED' | 'FAILED' = 'STABLE';
    if (!isProfitable) {
      status = 'FAILED';
    } else if (m.profitFactor < 1.2 || m.maxDrawdownPct > 35) {
      status = 'DEGRADED';
    }

    const labelMap: Record<Timeframe, string> = {
      '1m': '1 Minuto',
      '5m': '5 Minuti',
      '15m': '15 Minuti (Intraday Veloce)',
      '30m': '30 Minuti (Intraday Medio)',
      '1h': '1 Ora (Swing Breve)',
      '2h': '2 Ore (Swing Medio-Breve)',
      '4h': '4 Ore (Swing Medio)',
      '1D': '1 Giorno (Daily Swing)',
    };

    rows.push({
      timeframe: tf,
      label: labelMap[tf] || tf,
      totalReturnPct: parseFloat(m.totalReturnPct.toFixed(2)),
      profitFactor: parseFloat(m.profitFactor.toFixed(2)),
      maxDrawdownPct: parseFloat(m.maxDrawdownPct.toFixed(1)),
      winRatePct: parseFloat(m.winRatePct.toFixed(1)),
      totalTrades: m.totalTrades,
      isBaseline: false,
      isProfitable,
      status,
    });
  }

  return rows;
}

/**
 * 2. Cross-Period Analysis (Walk-Forward / Regime Stress Test)
 * Tests the saved strategy on different market regimes: Bull, Bear 2022, 1M, 6M, 1Y, Full
 */
export function runCrossPeriodMatrix(
  preset: SavedStrategyPreset,
  instrument: Instrument
): PeriodComparisonRow[] {
  const strategy = getStrategyById(preset.strategyId);
  if (!strategy) return [];

  const periodConfigs: {
    key: string;
    label: string;
    startDate: string;
    endDate: string;
    regimeType: 'BULL' | 'BEAR' | 'SIDEWAYS' | 'RECENT' | 'FULL_CYCLE';
  }[] = [
    {
      key: '1M',
      label: 'Ultimo Mese (Recente)',
      startDate: '2026-07-28',
      endDate: '2026-08-28',
      regimeType: 'RECENT',
    },
    {
      key: '3M',
      label: 'Ultimi 3 Mesi',
      startDate: '2026-05-28',
      endDate: '2026-08-28',
      regimeType: 'RECENT',
    },
    {
      key: '6M',
      label: 'Ultimi 6 Mesi',
      startDate: '2026-02-28',
      endDate: '2026-08-28',
      regimeType: 'RECENT',
    },
    {
      key: '1Y',
      label: 'Ultimo Anno (12 Mesi)',
      startDate: '2025-08-28',
      endDate: '2026-08-28',
      regimeType: 'RECENT',
    },
    {
      key: '2022_BEAR',
      label: 'Mercato Orso 2022 (Stress Test Inflazione)',
      startDate: '2022-01-03',
      endDate: '2022-12-30',
      regimeType: 'BEAR',
    },
    {
      key: '2023_2024_BULL',
      label: 'Mercato Toro 2023-2024 (Rally AI & Tech)',
      startDate: '2023-01-03',
      endDate: '2024-12-31',
      regimeType: 'BULL',
    },
    {
      key: 'FULL_CYCLE',
      label: 'Ciclo Completo Multi-Anno (2019 - 2026)',
      startDate: '2019-01-02',
      endDate: '2026-08-28',
      regimeType: 'FULL_CYCLE',
    },
  ];

  const rows: PeriodComparisonRow[] = [];

  for (const p of periodConfigs) {
    const isCalibrationPeriod =
      (preset.dateRange.startDate === p.startDate && preset.dateRange.endDate === p.endDate) ||
      (preset.dateRange.label ? preset.dateRange.label.includes(p.key) : false);

    // When evaluating the exact calibration period on which the strategy was optimized,
    // strictly use the original metrics so results are 100% identical!
    if (isCalibrationPeriod && preset.originalMetrics) {
      const om = preset.originalMetrics;
      const isProfitable = om.totalReturnPct > 0;
      let status: 'OUTPERFORMING' | 'ACCEPTABLE' | 'DEGRADED' | 'FAILED' = 'ACCEPTABLE';
      if (!isProfitable) {
        status = 'FAILED';
      } else if (om.totalReturnPct > 20 && om.profitFactor > 1.6) {
        status = 'OUTPERFORMING';
      } else if (om.profitFactor < 1.15 || om.maxDrawdownPct > 30) {
        status = 'DEGRADED';
      }

      rows.push({
        periodKey: p.key,
        label: p.label,
        startDate: p.startDate,
        endDate: p.endDate,
        regimeType: p.regimeType,
        totalReturnPct: parseFloat(om.totalReturnPct.toFixed(2)),
        profitFactor: parseFloat(om.profitFactor.toFixed(2)),
        maxDrawdownPct: parseFloat(om.maxDrawdownPct.toFixed(1)),
        winRatePct: parseFloat(om.winRatePct.toFixed(1)),
        totalTrades: om.totalTrades,
        isCalibrationPeriod: true,
        isProfitable,
        status,
      });
      continue;
    }

    const bars = generateHistoricalBars(instrument, preset.timeframe, p.startDate, p.endDate);
    const res = runBacktest(strategy, instrument, preset.timeframe, bars, preset.params);
    const m = res.metrics;
    const isProfitable = m.totalReturnPct > 0;

    let status: 'OUTPERFORMING' | 'ACCEPTABLE' | 'DEGRADED' | 'FAILED' = 'ACCEPTABLE';
    if (!isProfitable) {
      status = 'FAILED';
    } else if (m.totalReturnPct > 20 && m.profitFactor > 1.6) {
      status = 'OUTPERFORMING';
    } else if (m.profitFactor < 1.15 || m.maxDrawdownPct > 30) {
      status = 'DEGRADED';
    }

    rows.push({
      periodKey: p.key,
      label: p.label,
      startDate: p.startDate,
      endDate: p.endDate,
      regimeType: p.regimeType,
      totalReturnPct: parseFloat(m.totalReturnPct.toFixed(2)),
      profitFactor: parseFloat(m.profitFactor.toFixed(2)),
      maxDrawdownPct: parseFloat(m.maxDrawdownPct.toFixed(1)),
      winRatePct: parseFloat(m.winRatePct.toFixed(1)),
      totalTrades: m.totalTrades,
      isCalibrationPeriod: false,
      isProfitable,
      status,
    });
  }

  return rows;
}

/**
 * 3. Cross-Asset Analysis
 * Tests the saved strategy against diverse market instruments to verify universal robustness
 */
export function runCrossAssetMatrix(
  preset: SavedStrategyPreset,
  extraInstruments?: Instrument[],
  baseAssetBars?: Bar[]
): AssetComparisonRow[] {
  const strategy = getStrategyById(preset.strategyId);
  if (!strategy) return [];

  // Default benchmarks if not provided
  const targetList: Instrument[] = [];

  // Always include the baseline instrument first
  targetList.push(preset.instrument);

  // Pick representative assets from the database
  const benchmarkTickers = ['SPY', 'QQQ', 'VWCE.DE', 'GLD', 'BTP.MI', 'ENEL.MI', 'AAPL'];
  for (const ticker of benchmarkTickers) {
    if (ticker.toUpperCase() !== preset.instrument.ticker.toUpperCase()) {
      const found = INSTRUMENTS_DATABASE.find(
        (inst) => inst.ticker.toUpperCase() === ticker.toUpperCase()
      );
      if (found && !targetList.some((t) => t.ticker.toUpperCase() === found.ticker.toUpperCase())) {
        targetList.push(found);
      }
    }
  }

  // Append any user-provided extra instruments
  if (extraInstruments && extraInstruments.length > 0) {
    for (const inst of extraInstruments) {
      if (!targetList.some((t) => t.ticker.toUpperCase() === inst.ticker.toUpperCase())) {
        targetList.push(inst);
      }
    }
  }

  const rows: AssetComparisonRow[] = [];

  for (const inst of targetList.slice(0, 16)) {
    const isBaseAsset =
      inst.ticker.toUpperCase() === preset.instrument.ticker.toUpperCase() ||
      (Boolean(inst.id) && Boolean(preset.instrument.id) && inst.id === preset.instrument.id);

    // CRITICAL: When evaluating the base asset on which this strategy was optimized,
    // the backtest metrics must be strictly IDENTICAL to the original optimization run results!
    if (isBaseAsset && preset.originalMetrics) {
      const om = preset.originalMetrics;
      const isProfitable = om.totalReturnPct > 0;
      let status: 'HIGHLY_PORTABLE' | 'MODERATE' | 'NOT_TRANSFERABLE' = 'MODERATE';
      if (!isProfitable) {
        status = 'NOT_TRANSFERABLE';
      } else if (om.profitFactor >= 1.4 && om.maxDrawdownPct <= 25) {
        status = 'HIGHLY_PORTABLE';
      }

      rows.push({
        instrument: preset.instrument, // retains full original instrument name and metadata
        assetClass: preset.instrument.sector || preset.instrument.type || 'Azionario',
        totalReturnPct: parseFloat(om.totalReturnPct.toFixed(2)),
        profitFactor: parseFloat(om.profitFactor.toFixed(2)),
        maxDrawdownPct: parseFloat(om.maxDrawdownPct.toFixed(1)),
        winRatePct: parseFloat(om.winRatePct.toFixed(1)),
        totalTrades: om.totalTrades,
        isBaseAsset: true,
        isProfitable,
        status,
      });
      continue;
    }

    // For other assets, generate historical bars (or use baseAssetBars if isBaseAsset)
    const bars = (isBaseAsset && baseAssetBars && baseAssetBars.length >= 10)
      ? baseAssetBars
      : generateHistoricalBars(
          inst,
          preset.timeframe,
          preset.dateRange.startDate,
          preset.dateRange.endDate
        );

    const res = runBacktest(strategy, inst, preset.timeframe, bars, preset.params);
    const m = res.metrics;
    const isProfitable = m.totalReturnPct > 0;

    let status: 'HIGHLY_PORTABLE' | 'MODERATE' | 'NOT_TRANSFERABLE' = 'MODERATE';
    if (!isProfitable) {
      status = 'NOT_TRANSFERABLE';
    } else if (m.profitFactor >= 1.4 && m.maxDrawdownPct <= 25) {
      status = 'HIGHLY_PORTABLE';
    }

    rows.push({
      instrument: inst,
      assetClass: inst.sector || inst.type || 'Azionario',
      totalReturnPct: parseFloat(m.totalReturnPct.toFixed(2)),
      profitFactor: parseFloat(m.profitFactor.toFixed(2)),
      maxDrawdownPct: parseFloat(m.maxDrawdownPct.toFixed(1)),
      winRatePct: parseFloat(m.winRatePct.toFixed(1)),
      totalTrades: m.totalTrades,
      isBaseAsset,
      isProfitable,
      status,
    });
  }

  return rows;
}

/**
 * 4. Computes the Complete Quantitative Robustness Audit (Unger Method)
 */
export function auditStrategyRobustness(
  preset: SavedStrategyPreset,
  extraInstruments?: Instrument[],
  baseAssetBars?: Bar[]
): StrategyRobustnessAudit {
  const timeframeRows = runCrossTimeframeMatrix(preset, preset.instrument);
  const periodRows = runCrossPeriodMatrix(preset, preset.instrument);
  const assetRows = runCrossAssetMatrix(preset, extraInstruments, baseAssetBars);

  // Compute pass ratios (excluding baseline/calibration rows from denominator or accounting for them)
  const nonBaseTfs = timeframeRows.filter((r) => !r.isBaseline);
  const passTfs = nonBaseTfs.filter((r) => r.isProfitable).length;
  const passRatioTimeframes = nonBaseTfs.length > 0 ? passTfs / nonBaseTfs.length : 1;

  const nonCalibPeriods = periodRows.filter((r) => !r.isCalibrationPeriod);
  const passPeriods = nonCalibPeriods.filter((r) => r.isProfitable).length;
  const passRatioPeriods = nonCalibPeriods.length > 0 ? passPeriods / nonCalibPeriods.length : 1;

  const nonBaseAssets = assetRows.filter((r) => !r.isBaseAsset);
  const passAssets = nonBaseAssets.filter((r) => r.isProfitable).length;
  const passRatioAssets = nonBaseAssets.length > 0 ? passAssets / nonBaseAssets.length : 1;

  // Composite Robustness Score (0-100)
  const weightedScore = Math.round(
    passRatioPeriods * 45 + passRatioTimeframes * 30 + passRatioAssets * 25
  );

  let robustnessVerdict: 'EXCELLENT_ROBUST' | 'GOOD_GENERALIZATION' | 'MODERATE_RISK' | 'HIGH_OVERFITTING_RISK';
  let summaryTitle = '';
  let summaryDescription = '';
  let actionRecommendation: 'READY_FOR_PAPER' | 'MONITOR_CLOSELY' | 'REJECT_OVERFITTED';
  let overfittingWarning: string | undefined;

  if (weightedScore >= 75) {
    robustnessVerdict = 'EXCELLENT_ROBUST';
    summaryTitle = 'Alta Robustezza Quantitativa (Metodo Unger Valido)';
    summaryDescription =
      'La strategia dimostra un vero vantaggio statistico (edge): rimane profittevole nella maggioranza dei timeframe, supera i periodi di stress (incluso il 2022) e si adatta ad altri mercati.';
    actionRecommendation = 'READY_FOR_PAPER';
  } else if (weightedScore >= 55) {
    robustnessVerdict = 'GOOD_GENERALIZATION';
    summaryTitle = 'Buona Generalizzazione con Dipendenza Moderata';
    summaryDescription =
      'La logica è solida sul trend principale, ma mostra qualche cedimento nei cambi di volatilità o su asset non affini. Consigliato il monitoraggio in Paper Trading.';
    actionRecommendation = 'READY_FOR_PAPER';
  } else if (weightedScore >= 35) {
    robustnessVerdict = 'MODERATE_RISK';
    summaryTitle = 'Rischio Moderato di Curve-Fitting';
    summaryDescription =
      'La strategia performa bene nel periodo originale ma perde consistenza se applicata ad altri orizzonti temporali. Rischio di adattamento eccessivo ai dati storici passati.';
    actionRecommendation = 'MONITOR_CLOSELY';
    overfittingWarning =
      'Attenzione: la strategia perde in oltre la metà dei test incrociati. I parametri potrebbero essere troppo ottimizzati per il periodo di calibrazione.';
  } else {
    robustnessVerdict = 'HIGH_OVERFITTING_RISK';
    summaryTitle = 'Forte Rischio di Overfitting (Curve-Fitting Rilevato)';
    summaryDescription =
      'La strategia ha realizzato il massimo profitto solo memorizzando il rumore storico del periodo di test. Fallisce drasticamente negli altri periodi e su altri titoli.';
    actionRecommendation = 'REJECT_OVERFITTED';
    overfittingWarning =
      'ALLARME OVERFITTING: Non impiegare questa combinazione in denaro reale. Il massimo rendimento osservato è un artefatto statistico non ripetibile.';
  }

  return {
    strategyPreset: preset,
    timeframeRows,
    periodRows,
    assetRows,
    robustnessScore: weightedScore,
    robustnessVerdict,
    summaryTitle,
    summaryDescription,
    passRatioTimeframes,
    passRatioPeriods,
    passRatioAssets,
    overfittingWarning,
    actionRecommendation,
  };
}
