/**
 * QuantLab - Automated Optimal Timeframe Selection Engine (Strictly Real Historical Data)
 *
 * Fixes applied:
 * - ZERO synthetic bar generation (`generateHistoricalBars` completely removed!).
 * - Evaluates ONLY real historical bars passed per timeframe (or cleanly aggregates real 1h bars
 *   into 2h / 4h using session-aware `aggregateHourlyBars`).
 * - Timeframes without real data are honestly reported as `DATI_INSUFFICIENTI` (`isRealData: false`).
 * - Uses true compound CAGR from `backtestEngine.ts` (never linear `totalReturn / years`).
 * - Uses true seeded Monte Carlo drawdown from `backtestEngine.ts` (never `maxDrawdownPct * 1.25`).
 */
import {
  Bar,
  Instrument,
  Timeframe,
  BacktestResult,
  BacktestMetrics,
} from '../types';
import { BaseStrategy } from './strategies/types';
import { ungerTitanStrategy } from './strategies/ungerTitanStrategy';
import { runBacktest, BacktestOptions } from './backtestEngine';
import { aggregateHourlyBars, validateAndCleanBars } from './marketDataIntegrity';

export type TimeframeQualificationStatus = 'QUALIFIED' | 'BORDERLINE' | 'DISQUALIFIED';

export const TIMEFRAME_CHRONO_ORDER: Timeframe[] = ['5m', '15m', '30m', '1h', '2h', '4h', '1D'];

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  '1m': '1 Minuto',
  '5m': '5 Minuti',
  '15m': '15 Minuti',
  '30m': '30 Minuti',
  '1h': '1 Ora',
  '2h': '2 Ore',
  '4h': '4 Ore',
  '1D': 'Giornaliero (1D)',
};

export interface SubPeriodEvaluation {
  periodIndex: number;
  label: string;
  startDate: string;
  endDate: string;
  returnPct: number;
  pnlAmount: number;
  maxDrawdownPct: number;
  profitFactor: number;
  tradesCount: number;
  isProfitable: boolean;
  isConsistent: boolean;
}

export interface EvaluatedTimeframeMetric {
  timeframe: Timeframe;
  label: string;
  timeframeCategory: 'INTRADAY_FAST' | 'INTRADAY_SWING' | 'DAILY_MACRO';
  isRealData: boolean;
  dataStatus: 'HISTORICAL_REAL' | 'UNAVAILABLE';
  totalBarsEvaluated: number;
  totalBars: number;
  yearsEvaluated: number;
  totalReturnPct: number;
  annualizedReturnPct: number;
  totalPnlAmount: number;
  profitFactor: number;
  maxDrawdownPct: number;
  returnToDrawdownRatio: number;
  winRatePct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  averageTradePct: number;
  avgTradePct: number;
  averageTradeAmount: number;
  avgTradeAmount: number;
  expectancy: number;
  inSampleReturnPct: number;
  inSampleDrawdownPct: number;
  inSampleProfitFactor: number;
  outOfSampleReturnPct: number;
  outOfSampleDrawdownPct: number;
  outOfSampleProfitFactor: number;
  oosReturnPct: number;
  oosRetentionRatio: number;
  oosEfficiencyPct: number;
  walkForwardEfficiencyPct: number;
  monteCarloMaxDrawdown95Pct: number | null;
  slippageSensitivityScore: number;
  parameterStabilityScore: number;
  frictionDragPct: number;
  sampleAdequacy: 'EXCELLENT' | 'SUFFICIENT' | 'BORDERLINE' | 'INSUFFICIENT';
  qualificationStatus: TimeframeQualificationStatus;
  isCandidateEligible: boolean;
  isOptimalChoice: boolean;
  isPlateauMember: boolean;
  isIsolatedSpike: boolean;
  clusterAvgProfitFactor: number;
  evaluatedStrategyName: string;
  eligibilityReason: string;
  rejectionReason?: string;
  compositeRobustnessScore: number;
  robustnessScore: number;
  subPeriods: SubPeriodEvaluation[];
  subPeriodsConsistentCount: number;
  subPeriodConsistencyScore: number;
  timeframeSuitabilityNote: string;
  backtestResult?: BacktestResult;
}

export type CandidateTimeframeEvaluation = EvaluatedTimeframeMetric;

export interface TimeframeSuitabilityProfile {
  bestTimeframe: Timeframe | null;
  optimalTimeframe: Timeframe | null;
  bestTimeframeLabel: string;
  bestTimeframeCategory: 'INTRADAY_FAST' | 'INTRADAY_SWING' | 'DAILY_MACRO' | 'NONE';
  hasQualifiedTimeframe: boolean;
  isStrategyEligible: boolean;
  verdictStatus: 'ELIGIBLE' | 'NOT_ELIGIBLE';
  evaluatedCount: number;
  qualifiedCount: number;
  evaluatedTimeframes: EvaluatedTimeframeMetric[];
  candidates: EvaluatedTimeframeMetric[];
  bestEvaluation: EvaluatedTimeframeMetric | null;
  optimalCandidate: EvaluatedTimeframeMetric | null;
  maxProfitCandidate: EvaluatedTimeframeMetric | null;
  overfittingAssessment: {
    risk: 'LOW' | 'MODERATE' | 'HIGH';
    title: string;
  };
  executiveReasoning: string;
  selectionRationale: string;
  whyOtherTimeframesWereDiscarded: string[];
  recommendedActionMessage: string;
}

export type AutomatedTimeframeDeterminationResult = TimeframeSuitabilityProfile;

const ALL_CANDIDATE_TIMEFRAMES: Array<{
  timeframe: Timeframe;
  label: string;
  category: 'INTRADAY_FAST' | 'INTRADAY_SWING' | 'DAILY_MACRO';
  minTradesRequired: number;
}> = [
  { timeframe: '5m', label: '5 Minuti', category: 'INTRADAY_FAST', minTradesRequired: 30 },
  { timeframe: '15m', label: '15 Minuti', category: 'INTRADAY_FAST', minTradesRequired: 25 },
  { timeframe: '30m', label: '30 Minuti', category: 'INTRADAY_FAST', minTradesRequired: 20 },
  { timeframe: '1h', label: '1 Ora', category: 'INTRADAY_SWING', minTradesRequired: 15 },
  { timeframe: '2h', label: '2 Ore', category: 'INTRADAY_SWING', minTradesRequired: 12 },
  { timeframe: '4h', label: '4 Ore', category: 'INTRADAY_SWING', minTradesRequired: 10 },
  { timeframe: '1D', label: 'Giornaliero (1D)', category: 'DAILY_MACRO', minTradesRequired: 10 },
];

export function selectCandidateTimeframes(
  instrument: Instrument,
  strategy?: BaseStrategy
): Array<{
  timeframe: Timeframe;
  label: string;
  category: 'INTRADAY_FAST' | 'INTRADAY_SWING' | 'DAILY_MACRO';
  minTradesRequired: number;
}> {
  if (strategy?.definition.recommendedTimeframes?.length) {
    const rec = new Set(strategy.definition.recommendedTimeframes);
    const filtered = ALL_CANDIDATE_TIMEFRAMES.filter((c) => rec.has(c.timeframe));
    if (filtered.length >= 2) return filtered;
  }
  if (instrument.type === 'ETF') {
    return ALL_CANDIDATE_TIMEFRAMES.filter((c) => ['1h', '2h', '4h', '1D'].includes(c.timeframe));
  }
  return ALL_CANDIDATE_TIMEFRAMES;
}

function getFrictionForTimeframe(timeframe: Timeframe, baseOptions: BacktestOptions): BacktestOptions {
  const spreadMap: Record<Timeframe, number> = {
    '1m': 0.04,
    '5m': 0.03,
    '15m': 0.025,
    '30m': 0.02,
    '1h': 0.02,
    '2h': 0.02,
    '4h': 0.02,
    '1D': 0.02,
  };
  return {
    ...baseOptions,
    commissionPct: baseOptions.commissionPct ?? 0.05,
    slippagePct: baseOptions.slippagePct ?? 0.03,
    spreadPct: baseOptions.spreadPct ?? spreadMap[timeframe],
    skipRobustnessTests: true,
    enableWalkForward: true,
  };
}

function buildUnavailableRow(
  cfg: {
    timeframe: Timeframe;
    label: string;
    category: 'INTRADAY_FAST' | 'INTRADAY_SWING' | 'DAILY_MACRO';
  },
  strategyName: string,
  reason: string
): EvaluatedTimeframeMetric {
  return {
    timeframe: cfg.timeframe,
    label: cfg.label,
    timeframeCategory: cfg.category,
    isRealData: false,
    dataStatus: 'UNAVAILABLE',
    totalBarsEvaluated: 0,
    totalBars: 0,
    yearsEvaluated: 0,
    totalReturnPct: 0,
    annualizedReturnPct: 0,
    totalPnlAmount: 0,
    profitFactor: 0,
    maxDrawdownPct: 0,
    returnToDrawdownRatio: 0,
    winRatePct: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    averageTradePct: 0,
    avgTradePct: 0,
    averageTradeAmount: 0,
    avgTradeAmount: 0,
    expectancy: 0,
    inSampleReturnPct: 0,
    inSampleDrawdownPct: 0,
    inSampleProfitFactor: 0,
    outOfSampleReturnPct: 0,
    outOfSampleDrawdownPct: 0,
    outOfSampleProfitFactor: 0,
    oosReturnPct: 0,
    oosRetentionRatio: 0,
    oosEfficiencyPct: 0,
    walkForwardEfficiencyPct: 0,
    monteCarloMaxDrawdown95Pct: null,
    slippageSensitivityScore: 0,
    parameterStabilityScore: 0,
    frictionDragPct: 0,
    sampleAdequacy: 'INSUFFICIENT',
    qualificationStatus: 'DISQUALIFIED',
    isCandidateEligible: false,
    isOptimalChoice: false,
    isPlateauMember: false,
    isIsolatedSpike: false,
    clusterAvgProfitFactor: 0,
    evaluatedStrategyName: strategyName,
    eligibilityReason: reason,
    rejectionReason: reason,
    compositeRobustnessScore: 0,
    robustnessScore: 0,
    subPeriods: [],
    subPeriodsConsistentCount: 0,
    subPeriodConsistencyScore: 0,
    timeframeSuitabilityNote: reason,
  };
}

function buildSubPeriodsFromBacktest(bt: BacktestResult): SubPeriodEvaluation[] {
  const curve = bt.equityCurve;
  if (curve.length < 15) return [];
  const labels = ['Iniziale (Training)', 'Intermedia (Validation)', 'Recente (Out-of-Sample)'];
  const cuts = [0, Math.floor(curve.length * 0.7), Math.floor(curve.length * 0.85), curve.length];
  const out: SubPeriodEvaluation[] = [];

  for (let i = 0; i < 3; i++) {
    const startIdx = cuts[i];
    const endIdx = cuts[i + 1];
    if (endIdx - startIdx < 3) continue;
    const slice = curve.slice(startIdx, endIdx);
    const startEq = slice[0].equity || 1;
    const endEq = slice[slice.length - 1].equity || startEq;
    const retPct = parseFloat((((endEq - startEq) / startEq) * 100).toFixed(2));
    const pnlAmt = parseFloat((endEq - startEq).toFixed(2));
    let peak = startEq;
    let maxDd = 0;
    for (const pt of slice) {
      if (pt.equity > peak) peak = pt.equity;
      const dd = peak > 0 ? ((peak - pt.equity) / peak) * 100 : 0;
      if (dd > maxDd) maxDd = dd;
    }
    const splitTag = i === 0 ? 'TRAIN' : i === 1 ? 'VAL' : 'OOS';
    const subTrades = bt.trades.filter((t) => t.splitType === splitTag);
    const wins = subTrades.filter((t) => t.pnlAmount > 0).reduce((s, t) => s + t.pnlAmount, 0);
    const losses = subTrades.filter((t) => t.pnlAmount < 0).reduce((s, t) => s + Math.abs(t.pnlAmount), 0);
    const pf = losses > 0 ? parseFloat((wins / losses).toFixed(2)) : wins > 0 ? 9.99 : 0;

    out.push({
      periodIndex: i + 1,
      label: labels[i],
      startDate: slice[0].dateStr,
      endDate: slice[slice.length - 1].dateStr,
      returnPct: retPct,
      pnlAmount: pnlAmt,
      maxDrawdownPct: parseFloat(maxDd.toFixed(2)),
      profitFactor: pf,
      tradesCount: subTrades.length,
      isProfitable: retPct > 0,
      isConsistent: retPct >= -2 && maxDd <= 25,
    });
  }
  return out;
}

function isStrategyObject(value: unknown): value is BaseStrategy {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'definition' in value &&
      typeof (value as BaseStrategy).evaluate === 'function'
  );
}

/**
 * Evaluates a strategy across candidate timeframes using STRICTLY REAL historical bars.
 * Supports both canonical `(strategy, instrument, ...)` and legacy `(instrument, strategy?, startDate?, endDate?, ..., historicalBars?)` signatures.
 * Never generates synthetic bars! Missing timeframes are transparently marked `UNAVAILABLE`.
 */
export function determineOptimalTimeframe(
  strategyOrInstrument: BaseStrategy | Instrument,
  instrumentOrStrategy?: Instrument | BaseStrategy,
  paramsOrStartDate?: Record<string, number | boolean | string> | string,
  baseOptionsOrEndDate?: BacktestOptions | string,
  realDailyBars?: Bar[],
  realBarsByTimeframe?: Partial<Record<Timeframe, Bar[]>>,
  exchangeTimezoneOrLegacyBars?: string | Bar[]
): TimeframeSuitabilityProfile {
  let strategy: BaseStrategy;
  let instrument: Instrument;
  let params: Record<string, number | boolean | string> | undefined;
  let baseOptions: BacktestOptions = {};
  let dailyBars: Bar[] | undefined = realDailyBars;
  let barsByTf: Partial<Record<Timeframe, Bar[]>> | undefined = realBarsByTimeframe;
  let exchangeTimezone: string | undefined;

  if (isStrategyObject(strategyOrInstrument)) {
    strategy = strategyOrInstrument;
    instrument = instrumentOrStrategy as Instrument;
    params = typeof paramsOrStartDate === 'object' ? paramsOrStartDate : undefined;
    baseOptions = typeof baseOptionsOrEndDate === 'object' && baseOptionsOrEndDate ? baseOptionsOrEndDate : {};
    exchangeTimezone = typeof exchangeTimezoneOrLegacyBars === 'string' ? exchangeTimezoneOrLegacyBars : undefined;
  } else {
    // Legacy signature: (instrument, strategy?, startDate?, endDate?, ..., historicalBars?)
    instrument = strategyOrInstrument;
    strategy = isStrategyObject(instrumentOrStrategy) ? instrumentOrStrategy : ungerTitanStrategy;
    if (Array.isArray(exchangeTimezoneOrLegacyBars) && exchangeTimezoneOrLegacyBars.length > 0 && !dailyBars) {
      dailyBars = exchangeTimezoneOrLegacyBars;
    }
  }

  const candidates = selectCandidateTimeframes(instrument, strategy);
  const barsMap: Partial<Record<Timeframe, Bar[]>> = { ...(barsByTf || {}) };

  if (dailyBars && dailyBars.length > 0 && !barsMap['1D']) {
    barsMap['1D'] = dailyBars;
  }

  // Derive 2h and 4h strictly from real 1h bars if provided (never fake 2h = 1h!)
  if (barsMap['1h'] && barsMap['1h'].length >= 40) {
    if (!barsMap['2h']) {
      barsMap['2h'] = aggregateHourlyBars(barsMap['1h'], '2h', { exchangeTimezone }).bars;
    }
    if (!barsMap['4h']) {
      barsMap['4h'] = aggregateHourlyBars(barsMap['1h'], '4h', { exchangeTimezone }).bars;
    }
  }

  const evaluated: EvaluatedTimeframeMetric[] = [];

  for (const cfg of candidates) {
    const rawBars = barsMap[cfg.timeframe];
    if (!rawBars || rawBars.length < 35) {
      evaluated.push(
        buildUnavailableRow(
          cfg,
          strategy.definition.name,
          `Dati storici reali non disponibili o insufficienti per ${cfg.label} (${rawBars?.length ?? 0} barre reali). Nessuna serie sintetica generata.`
        )
      );
      continue;
    }

    const { bars: cleanBars } = validateAndCleanBars(rawBars, cfg.timeframe);
    if (cleanBars.length < 35) {
      evaluated.push(
        buildUnavailableRow(
          cfg,
          strategy.definition.name,
          `Barre valide insufficienti dopo pulizia qualità dati (${cleanBars.length} < 35).`
        )
      );
      continue;
    }

    const tfOptions = getFrictionForTimeframe(cfg.timeframe, baseOptions);
    const bt = runBacktest(strategy, instrument, cfg.timeframe, cleanBars, params, {
      ...tfOptions,
      dataProvenance: {
        source: 'Real Exchange OHLCV',
        dataStatus: 'HISTORICAL_REAL',
        isRealData: true,
      },
    });

    const m: BacktestMetrics = bt.metrics;
    const elapsedMs = Math.max(0, cleanBars[cleanBars.length - 1].timestamp - cleanBars[0].timestamp);
    const yearsEvaluated = parseFloat((elapsedMs / (365.25 * 86_400_000)).toFixed(2));
    const totalFrictionPaid = (m.totalCommissionPaid ?? 0) + (m.totalSlippagePaid ?? 0);
    const initCap = tfOptions.initialCapital ?? 10000;
    const frictionDragPct = parseFloat(((totalFrictionPaid / Math.max(1, initCap)) * 100).toFixed(2));

    const sampleAdequacy: EvaluatedTimeframeMetric['sampleAdequacy'] =
      m.totalTrades >= cfg.minTradesRequired * 1.5
        ? 'EXCELLENT'
        : m.totalTrades >= cfg.minTradesRequired
        ? 'SUFFICIENT'
        : m.totalTrades >= Math.max(6, Math.floor(cfg.minTradesRequired * 0.5))
        ? 'BORDERLINE'
        : 'INSUFFICIENT';

    const rejectionReasons: string[] = [];
    if (m.totalTrades < cfg.minTradesRequired) {
      rejectionReasons.push(`Campione ridotto (${m.totalTrades} < ${cfg.minTradesRequired} trade)`);
    }
    if (m.totalReturnPct <= 0) {
      rejectionReasons.push(`Rendimento netto negativo (${m.totalReturnPct}%)`);
    }
    if (m.profitFactor < 1.1) {
      rejectionReasons.push(`Profit Factor insufficiente (${m.profitFactor})`);
    }
    if (m.maxDrawdownPct > 28) {
      rejectionReasons.push(`Drawdown elevato (-${m.maxDrawdownPct}%)`);
    }
    if (m.overfittingRisk === 'HIGH' || m.oosReturnPct < -3) {
      rejectionReasons.push(`Degradazione OOS (${m.oosReturnPct}%)`);
    }

    let qualificationStatus: TimeframeQualificationStatus = 'DISQUALIFIED';
    if (rejectionReasons.length === 0) {
      qualificationStatus = 'QUALIFIED';
    } else if (
      m.totalReturnPct > 0 &&
      m.profitFactor >= 1.05 &&
      m.maxDrawdownPct <= 30 &&
      sampleAdequacy !== 'INSUFFICIENT' &&
      rejectionReasons.length <= 1
    ) {
      qualificationStatus = 'BORDERLINE';
    }

    const wfEff = bt.walkForward?.available ? bt.walkForward.efficiencyPct : 0;
    const oosRetentionRatio =
      m.trainReturnPct > 0
        ? parseFloat((m.oosReturnPct / m.trainReturnPct).toFixed(2))
        : m.oosReturnPct > 0
        ? 1
        : 0;
    const oosEfficiencyPct = Math.max(0, Math.min(100, Math.round(oosRetentionRatio * 100)));

    const compositeScore =
      qualificationStatus === 'DISQUALIFIED'
        ? Math.min(45, m.score)
        : Math.max(
            0,
            Math.min(
              100,
              Math.round(m.score * 0.65 + wfEff * 0.2 + m.confidenceScore * 0.15)
            )
          );

    const subPeriods = buildSubPeriodsFromBacktest(bt);
    const subPeriodsConsistentCount = subPeriods.filter((sp) => sp.isConsistent).length;
    const subPeriodConsistencyScore =
      subPeriods.length > 0 ? Math.round((subPeriodsConsistentCount / subPeriods.length) * 100) : 0;
    const returnToDrawdownRatio =
      m.maxDrawdownPct > 0 ? parseFloat((m.totalReturnPct / m.maxDrawdownPct).toFixed(2)) : 0;
    const eligibilityReason =
      qualificationStatus === 'QUALIFIED'
        ? `Idoneo su dati reali (${cleanBars.length} barre): CAGR ${m.cagrPct}%, PF ${m.profitFactor}, Sharpe ${m.sharpeRatio}, DD -${m.maxDrawdownPct}%.`
        : rejectionReasons.join(' · ');

    evaluated.push({
      timeframe: cfg.timeframe,
      label: cfg.label,
      timeframeCategory: cfg.category,
      isRealData: true,
      dataStatus: 'HISTORICAL_REAL',
      totalBarsEvaluated: cleanBars.length,
      totalBars: cleanBars.length,
      yearsEvaluated,
      totalReturnPct: m.totalReturnPct,
      annualizedReturnPct: m.cagrPct,
      totalPnlAmount: m.totalPnlAmount,
      profitFactor: m.profitFactor,
      maxDrawdownPct: m.maxDrawdownPct,
      returnToDrawdownRatio,
      winRatePct: m.winRatePct,
      sharpeRatio: m.sharpeRatio,
      sortinoRatio: m.sortinoRatio,
      totalTrades: m.totalTrades,
      winningTrades: m.winningTrades,
      losingTrades: m.losingTrades,
      averageTradePct: m.avgTradePct ?? 0,
      avgTradePct: m.avgTradePct ?? 0,
      averageTradeAmount: m.avgTradeAmount ?? 0,
      avgTradeAmount: m.avgTradeAmount ?? 0,
      expectancy: m.expectancy,
      inSampleReturnPct: m.trainReturnPct,
      inSampleDrawdownPct: bt.trainMetrics?.maxDrawdownPct ?? m.maxDrawdownPct,
      inSampleProfitFactor: bt.trainMetrics?.profitFactor ?? m.profitFactor,
      outOfSampleReturnPct: m.oosReturnPct,
      outOfSampleDrawdownPct: bt.oosMetrics?.maxDrawdownPct ?? m.maxDrawdownPct,
      outOfSampleProfitFactor: bt.oosMetrics?.profitFactor ?? m.profitFactor,
      oosReturnPct: m.oosReturnPct,
      oosRetentionRatio,
      oosEfficiencyPct,
      walkForwardEfficiencyPct: wfEff,
      monteCarloMaxDrawdown95Pct: m.monteCarloAvailable ? (m.monteCarloMaxDrawdown95Pct ?? null) : null,
      slippageSensitivityScore: m.slippageSensitivityScore ?? 0,
      parameterStabilityScore: m.parameterStabilityScore ?? 0,
      frictionDragPct,
      sampleAdequacy,
      qualificationStatus,
      isCandidateEligible: qualificationStatus === 'QUALIFIED',
      isOptimalChoice: false,
      isPlateauMember: qualificationStatus === 'QUALIFIED' && subPeriodsConsistentCount >= 2,
      isIsolatedSpike: qualificationStatus === 'DISQUALIFIED' && m.totalReturnPct > 15,
      clusterAvgProfitFactor: m.profitFactor,
      evaluatedStrategyName: strategy.definition.name,
      eligibilityReason,
      rejectionReason: rejectionReasons.length > 0 ? rejectionReasons.join(' | ') : undefined,
      compositeRobustnessScore: compositeScore,
      robustnessScore: compositeScore,
      subPeriods,
      subPeriodsConsistentCount,
      subPeriodConsistencyScore,
      timeframeSuitabilityNote: eligibilityReason,
      backtestResult: bt,
    });
  }

  evaluated.sort((a, b) => {
    const order: Record<TimeframeQualificationStatus, number> = {
      QUALIFIED: 0,
      BORDERLINE: 1,
      DISQUALIFIED: 2,
    };
    const d = order[a.qualificationStatus] - order[b.qualificationStatus];
    if (d !== 0) return d;
    return b.compositeRobustnessScore - a.compositeRobustnessScore;
  });

  const qualified = evaluated.filter((e) => e.qualificationStatus === 'QUALIFIED');
  const best = qualified.length > 0 ? qualified[0] : null;
  if (best) best.isOptimalChoice = true;

  const realEvaluated = evaluated.filter((e) => e.isRealData);
  const maxProfitCandidate =
    realEvaluated.length > 0
      ? [...realEvaluated].sort((a, b) => b.totalReturnPct - a.totalReturnPct)[0]
      : null;

  const discardedReasons = evaluated
    .filter((e) => e.timeframe !== best?.timeframe)
    .map((e) => `${e.label}: ${e.rejectionReason || `Score inferiore (${e.compositeRobustnessScore}/100)`}`);

  const reasoning = best
    ? `Il timeframe ${best.label} ha superato tutti i requisiti su ${best.totalBarsEvaluated} barre reali (CAGR ${best.annualizedReturnPct}%, PF ${best.profitFactor}, Sharpe ${best.sharpeRatio}, DD -${best.maxDrawdownPct}%).`
    : `Nessun timeframe dispone di dati reali con edge statistico qualificato per ${strategy.definition.name} su ${instrument.ticker}.`;

  const overfittingRisk: 'LOW' | 'MODERATE' | 'HIGH' = best
    ? best.backtestResult?.metrics.overfittingRisk || 'LOW'
    : 'HIGH';

  return {
    bestTimeframe: best ? best.timeframe : null,
    optimalTimeframe: best ? best.timeframe : null,
    bestTimeframeLabel: best ? best.label : 'Nessun timeframe qualificato',
    bestTimeframeCategory: best ? best.timeframeCategory : 'NONE',
    hasQualifiedTimeframe: best !== null,
    isStrategyEligible: best !== null,
    verdictStatus: best !== null ? 'ELIGIBLE' : 'NOT_ELIGIBLE',
    evaluatedCount: evaluated.length,
    qualifiedCount: qualified.length,
    evaluatedTimeframes: evaluated,
    candidates: evaluated,
    bestEvaluation: best,
    optimalCandidate: best,
    maxProfitCandidate,
    overfittingAssessment: {
      risk: overfittingRisk,
      title:
        overfittingRisk === 'LOW'
          ? 'Rischio Overfitting Basso (Validato OOS)'
          : overfittingRisk === 'MODERATE'
          ? 'Rischio Overfitting Moderato'
          : 'Dati Insufficienti o Overfitting Elevato',
    },
    executiveReasoning: reasoning,
    selectionRationale: reasoning,
    whyOtherTimeframesWereDiscarded: discardedReasons,
    recommendedActionMessage: best
      ? `Usare ${best.label} validato su dati storici reali.`
      : 'Raccogliere serie storiche reali complete o rivedere la strategia prima di operare.',
  };
}
