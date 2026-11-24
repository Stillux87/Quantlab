/**
 * QuantLab - Rigorous Strategy Ranking, Qualification & Filtering Engine
 *
 * Strict Governance Rules:
 * 1. NEVER promote a strategy that fails minimum quantitative requirements.
 * 2. NEVER fall back to `results[0]` or force-recommend any specific strategy ID.
 * 3. Every evaluated strategy receives one of 4 explicit verdicts:
 *    - PROMOSSA: meets all statistical, return, risk, OOS, and real-data thresholds.
 *    - DA_OSSERVARE: positive edge on real data, but borderline on 1-2 secondary criteria.
 *    - RESPINTA: fails core profitability, risk, or OOS robustness gates.
 *    - DATI_INSUFFICIENTI: non-real data or sample size too small to evaluate reliably.
 */
import { Bar, BacktestResult, Instrument, Timeframe } from '../types';
import { ALL_STRATEGIES } from './strategies/registry';
import { runBacktest, BacktestOptions } from './backtestEngine';

export type StrategyVerdict =
  | 'PROMOSSA'
  | 'DA_OSSERVARE'
  | 'RESPINTA'
  | 'DATI_INSUFFICIENTI';

export interface RankingThresholds {
  minTradesForPromotion: number;      // default 20
  minTradesForObservation: number;    // default 10 (below -> DATI_INSUFFICIENTI)
  minOosTrades: number;               // default 4
  minCagrPct: number;                 // default 2.0%
  maxDrawdownPct: number;             // default 25.0%
  minProfitFactor: number;            // default 1.15
  minSharpeRatio: number;             // default 0.40
  minOosReturnPct: number;            // default 0.0%
  requireRealData: boolean;           // default true
}

export const DEFAULT_RANKING_THRESHOLDS: RankingThresholds = {
  minTradesForPromotion: 20,
  minTradesForObservation: 10,
  minOosTrades: 4,
  minCagrPct: 2.0,
  maxDrawdownPct: 25.0,
  minProfitFactor: 1.15,
  minSharpeRatio: 0.40,
  minOosReturnPct: 0.0,
  requireRealData: true,
};

export interface StrategyQualificationEvaluation {
  verdict: StrategyVerdict;
  isPromoted: boolean;
  passedChecks: string[];
  failedChecks: string[];
  verdictReasons: string[];
}

export interface RankedStrategyResult extends BacktestResult {
  qualification: StrategyQualificationEvaluation;
}

export interface BatchAnalysisResult {
  instrument: Instrument;
  timeframe: Timeframe;
  startDate: string;
  endDate: string;
  totalBars: number;
  results: RankedStrategyResult[];
  leaderboard: RankedStrategyResult[];
  recommendedStrategy: RankedStrategyResult | null;
  bestStrategy: RankedStrategyResult | null;
  hasQualifiedStrategy: boolean;
  hasPromotedStrategy: boolean;
  promotedCount: number;
  observableCount: number;
  rejectedCount: number;
  insufficientDataCount: number;
  thresholdsUsed: RankingThresholds;
  noRecommendationReason?: string;
}

/**
 * Evaluates a single BacktestResult against explicit quantitative qualification gates.
 */
export function evaluateStrategyQualification(
  result: BacktestResult,
  customThresholds?: Partial<RankingThresholds>
): StrategyQualificationEvaluation {
  const th: RankingThresholds = { ...DEFAULT_RANKING_THRESHOLDS, ...customThresholds };
  const m = result.metrics;
  const oosTrades = result.oosMetrics?.totalTrades ?? 0;

  const passedChecks: string[] = [];
  const failedChecks: string[] = [];
  const verdictReasons: string[] = [];

  // Gate 0: Real Data & Minimum Sample Sufficiency
  const isRealData = result.dataProvenance ? result.dataProvenance.isRealData === true : true;
  if (th.requireRealData && !isRealData) {
    failedChecks.push('Dati non reali o sintetici');
    verdictReasons.push('Strategia non valutabile: i dati utilizzati non sono dati storici reali verificati.');
    return {
      verdict: 'DATI_INSUFFICIENTI',
      isPromoted: false,
      passedChecks,
      failedChecks,
      verdictReasons,
    };
  }

  if (result.totalBars < 30 || m.totalTrades < th.minTradesForObservation) {
    failedChecks.push(`Campione insufficiente (${m.totalTrades} trade < ${th.minTradesForObservation} minimi)`);
    verdictReasons.push(
      `Campione statistico troppo ridotto (${m.totalTrades} operazioni chiuse su ${result.totalBars} barre; minimo ${th.minTradesForObservation} per osservazione, ${th.minTradesForPromotion} per promozione).`
    );
    return {
      verdict: 'DATI_INSUFFICIENTI',
      isPromoted: false,
      passedChecks,
      failedChecks,
      verdictReasons,
    };
  }

  // Core Gates
  let coreFailures = 0;
  let secondaryFailures = 0;

  // 1. Net Profitability & CAGR
  if (m.totalReturnPct > 0 && m.totalPnlAmount > 0 && m.cagrPct >= th.minCagrPct) {
    passedChecks.push(`CAGR ${m.cagrPct.toFixed(1)}% (>= ${th.minCagrPct}%)`);
  } else {
    coreFailures++;
    failedChecks.push(`Rendimento/CAGR insufficiente (${m.totalReturnPct.toFixed(2)}% | CAGR ${m.cagrPct.toFixed(1)}%)`);
  }

  // 2. Profit Factor
  if (m.profitFactor >= th.minProfitFactor) {
    passedChecks.push(`Profit Factor ${m.profitFactor.toFixed(2)} (>= ${th.minProfitFactor})`);
  } else {
    coreFailures++;
    failedChecks.push(`Profit Factor insufficiente (${m.profitFactor.toFixed(2)} < ${th.minProfitFactor})`);
  }

  // 3. Max Drawdown
  if (m.maxDrawdownPct <= th.maxDrawdownPct) {
    passedChecks.push(`Max Drawdown -${m.maxDrawdownPct.toFixed(1)}% (<= ${th.maxDrawdownPct}%)`);
  } else {
    coreFailures++;
    failedChecks.push(`Drawdown eccessivo (-${m.maxDrawdownPct.toFixed(1)}% > ${th.maxDrawdownPct}%)`);
  }

  // 4. Sharpe Ratio
  if (m.sharpeRatio >= th.minSharpeRatio) {
    passedChecks.push(`Sharpe Ratio ${m.sharpeRatio.toFixed(2)} (>= ${th.minSharpeRatio})`);
  } else {
    secondaryFailures++;
    failedChecks.push(`Sharpe Ratio basso (${m.sharpeRatio.toFixed(2)} < ${th.minSharpeRatio})`);
  }

  // 5. Out-of-Sample Stability
  if (oosTrades >= th.minOosTrades && m.oosReturnPct >= th.minOosReturnPct && m.overfittingRisk !== 'HIGH') {
    passedChecks.push(`OOS positivo (+${m.oosReturnPct.toFixed(1)}% su ${oosTrades} trade)`);
  } else if (m.overfittingRisk === 'HIGH' || m.oosReturnPct < -3) {
    coreFailures++;
    failedChecks.push(`Degradazione Out-of-Sample (${m.oosReturnPct.toFixed(1)}% su ${oosTrades} trade, rischio ${m.overfittingRisk})`);
  } else {
    secondaryFailures++;
    failedChecks.push(`Campione/rendimento OOS borderline (${m.oosReturnPct.toFixed(1)}% su ${oosTrades} trade)`);
  }

  // 6. Full Promotion Trade Count
  if (m.totalTrades >= th.minTradesForPromotion) {
    passedChecks.push(`Campione solido (${m.totalTrades} trade >= ${th.minTradesForPromotion})`);
  } else {
    secondaryFailures++;
    failedChecks.push(`Campione moderato (${m.totalTrades} trade < ${th.minTradesForPromotion} per promozione piena)`);
  }

  if (coreFailures === 0 && secondaryFailures === 0) {
    verdictReasons.push(
      `Strategia PROMOSSA: supera tutti i criteri quantitativi su dati reali (CAGR ${m.cagrPct.toFixed(1)}%, PF ${m.profitFactor.toFixed(2)}, DD -${m.maxDrawdownPct.toFixed(1)}%, Sharpe ${m.sharpeRatio.toFixed(2)}, OOS ${m.oosReturnPct.toFixed(1)}%).`
    );
    return {
      verdict: 'PROMOSSA',
      isPromoted: true,
      passedChecks,
      failedChecks,
      verdictReasons,
    };
  }

  if (coreFailures === 0 && secondaryFailures <= 2 && m.totalReturnPct > 0 && m.profitFactor > 1.05) {
    verdictReasons.push(
      `Strategia DA OSSERVARE: mostra profittabilità netta e rischio controllato, ma presenta criteri secondari da consolidare (${failedChecks.join('; ')}).`
    );
    return {
      verdict: 'DA_OSSERVARE',
      isPromoted: false,
      passedChecks,
      failedChecks,
      verdictReasons,
    };
  }

  verdictReasons.push(
    `Strategia RESPINTA: non rispetta i requisiti minimi (${failedChecks.join('; ')}).`
  );
  return {
    verdict: 'RESPINTA',
    isPromoted: false,
    passedChecks,
    failedChecks,
    verdictReasons,
  };
}

/**
 * Ranks an already-executed list of BacktestResults without ever forcing a promotion
 * when no strategy meets PROMOSSA thresholds.
 */
export function rankStrategyResults(
  backtestResults: BacktestResult[],
  instrument: Instrument,
  timeframe: Timeframe,
  customThresholds?: Partial<RankingThresholds>
): BatchAnalysisResult {
  const thresholdsUsed: RankingThresholds = {
    ...DEFAULT_RANKING_THRESHOLDS,
    ...customThresholds,
  };

  const results: RankedStrategyResult[] = backtestResults.map((bt) => ({
    ...bt,
    qualification: evaluateStrategyQualification(bt, thresholdsUsed),
  }));

  const verdictOrder: Record<StrategyVerdict, number> = {
    PROMOSSA: 0,
    DA_OSSERVARE: 1,
    RESPINTA: 2,
    DATI_INSUFFICIENTI: 3,
  };

  results.sort((a, b) => {
    const vDiff = verdictOrder[a.qualification.verdict] - verdictOrder[b.qualification.verdict];
    if (vDiff !== 0) return vDiff;
    if (b.metrics.score !== a.metrics.score) return b.metrics.score - a.metrics.score;
    return b.metrics.sharpeRatio - a.metrics.sharpeRatio;
  });

  const promoted = results.filter((r) => r.qualification.verdict === 'PROMOSSA');
  const observable = results.filter((r) => r.qualification.verdict === 'DA_OSSERVARE');
  const rejected = results.filter((r) => r.qualification.verdict === 'RESPINTA');
  const insufficient = results.filter((r) => r.qualification.verdict === 'DATI_INSUFFICIENTI');

  // STRICT RULE: recommendedStrategy is ONLY non-null if at least one strategy is genuinely PROMOSSA
  const recommendedStrategy = promoted.length > 0 ? promoted[0] : null;
  const hasQualifiedStrategy = recommendedStrategy !== null;

  let noRecommendationReason: string | undefined;
  if (!hasQualifiedStrategy) {
    if (insufficient.length === results.length) {
      noRecommendationReason = `Nessuna strategia promossa su ${instrument.ticker} (${timeframe}): dati o numero di operazioni insufficienti per validazione statistica.`;
    } else if (observable.length > 0) {
      noRecommendationReason = `Nessuna strategia promossa su ${instrument.ticker} (${timeframe}): ${observable.length} strategia/e sono DA OSSERVARE ma non raggiungono tutte le soglie di promozione (min ${thresholdsUsed.minTradesForPromotion} trade, PF >= ${thresholdsUsed.minProfitFactor}, Sharpe >= ${thresholdsUsed.minSharpeRatio}, DD <= ${thresholdsUsed.maxDrawdownPct}%).`;
    } else {
      noRecommendationReason = `Nessuna delle ${results.length} strategie testate ha superato i criteri di qualità su ${instrument.ticker} (${timeframe}). Evitare operatività forzata su questo asset/timeframe.`;
    }
  }

  const ref = results[0];

  return {
    instrument,
    timeframe,
    startDate: ref?.startDate || '',
    endDate: ref?.endDate || '',
    totalBars: ref?.totalBars || 0,
    results,
    leaderboard: results,
    recommendedStrategy,
    bestStrategy: recommendedStrategy,
    hasQualifiedStrategy,
    hasPromotedStrategy: hasQualifiedStrategy,
    promotedCount: promoted.length,
    observableCount: observable.length,
    rejectedCount: rejected.length,
    insufficientDataCount: insufficient.length,
    thresholdsUsed,
    noRecommendationReason,
  };
}

/**
 * Runs all registered strategies on identical real historical bars and ranks them rigorously.
 * NEVER promotes or recommends a strategy that does not achieve verdict === 'PROMOSSA'.
 */
export function runBatchStrategyAnalysis(
  instrument: Instrument,
  timeframe: Timeframe,
  bars: Bar[],
  options: BacktestOptions = {},
  customThresholds?: Partial<RankingThresholds>
): BatchAnalysisResult {
  const executed: BacktestResult[] = ALL_STRATEGIES.map((strategy) =>
    runBacktest(strategy, instrument, timeframe, bars, strategy.definition.defaultParams, options)
  );
  return rankStrategyResults(executed, instrument, timeframe, customThresholds);
}
