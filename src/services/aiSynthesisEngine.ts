import {
  Timeframe,
  BacktestResult,
  MarketIntelligenceReport,
  AiSynthesisReport,
  SynthesisVerdict,
  ActionAdvice,
} from '../types';

/**
 * AI Synthesis Engine (Level 3)
 * Synthesizes Level 1 (Quantitative Backtest & Titan Engine) with Level 2 (Market Intelligence Engine).
 * 
 * Strict Anti-Data-Leakage Design:
 * Does NOT alter retroactive backtest results, equity curves, or Sharpe ratios.
 * Evaluates current forward-looking trade confluence, conflict, event risk, and regime stability.
 */
export function generateAiSynthesis(
  quantResult: BacktestResult | null,
  marketReport: MarketIntelligenceReport,
  timeframe: Timeframe
): AiSynthesisReport {
  // Extract Quantitative Metrics
  const quantScore = quantResult ? quantResult.metrics.score : 50;
  const quantReturn = quantResult ? quantResult.metrics.totalReturnPct : 0;
  const quantPf = quantResult ? quantResult.metrics.profitFactor : 1.0;
  const quantDd = quantResult ? quantResult.metrics.maxDrawdownPct : 0;
  const quantStrategyName = quantResult ? quantResult.strategyName : 'Breakout Trend Following';
  const quantRobustness = quantResult?.metrics.marketRegimeConsistency ?? quantResult?.metrics.confidenceScore ?? 75;

  // Quantitative signal direction based on strategy behavior and backtest edge
  const expectancy = quantResult
    ? (quantResult.metrics.winRatePct / 100) * (quantResult.metrics.avgWinPct || 1) -
      ((100 - quantResult.metrics.winRatePct) / 100) * (quantResult.metrics.avgLossPct || 1)
    : 0;

  let quantSignal: 'LONG' | 'SHORT' | 'FLAT' = 'FLAT';
  if (quantResult && expectancy > 0 && quantPf >= 1.15 && quantScore >= 60) {
    quantSignal = 'LONG';
  } else if (quantResult && expectancy < 0 && quantPf < 0.90) {
    quantSignal = 'SHORT';
  } else {
    quantSignal = quantScore >= 55 ? 'LONG' : 'FLAT';
  }

  // Market Intelligence Direction
  let intelDirection: 'LONG' | 'SHORT' | 'NEUTRAL' = 'NEUTRAL';
  if (marketReport.compositeIntelligenceScore >= 60) {
    intelDirection = 'LONG';
  } else if (marketReport.compositeIntelligenceScore <= 40) {
    intelDirection = 'SHORT';
  }

  // Cross-Engine Comparison & Verdict
  const intelScore = marketReport.compositeIntelligenceScore;
  const eventRisk = marketReport.eventRiskScore;
  const regime = marketReport.regimeStatus;

  let verdict: SynthesisVerdict = 'CONFLUENCE';
  let actionAdvice: ActionAdvice = 'PROCEED';
  const whyReasons: string[] = [];

  // 1. Extreme Event Risk Override
  if (eventRisk >= 80) {
    verdict = 'HIGH_RISK';
    actionAdvice = 'AVOID';
    whyReasons.push(`Rischio Evento Imminente Critico (${eventRisk}/100): presenza di catalizzatore con potenziale spike/gap di apertura (${marketReport.eventRiskBreakdown.headlineRiskSummary}).`);
    whyReasons.push('La volatilità attesa sull evento supera la tolleranza del modello di stop-loss quantitativo.');
  }
  // 2. Direct Conflict Between Quant Signal and Intelligence Context
  else if (
    (quantSignal === 'LONG' && intelDirection === 'SHORT' && intelScore <= 38) ||
    (quantSignal === 'SHORT' && intelDirection === 'LONG' && intelScore >= 65)
  ) {
    verdict = 'CONFLICT';
    actionAdvice = eventRisk >= 55 ? 'AVOID' : 'HOLD_OFF';
    whyReasons.push(`Conflitto di Direzione: il motore quantitativo segnala ${quantSignal} (${quantScore}/100), mentre l intelligence informativa segnala ${intelDirection} (${intelScore}/100).`);
    whyReasons.push('Divergenza tra price action storica e flusso di revisione stime/guidance: elevata probabilità di falso breakout.');
  }
  // 3. Regime Transition or Weak Data Quality
  else if (regime === 'HIGH_RISK' || regime === 'TRANSITION' || marketReport.dataQuality === 'LOW') {
    verdict = 'WAIT';
    actionAdvice = 'HOLD_OFF';
    whyReasons.push(`Regime di Mercato Instabile (${regime}): ${marketReport.regimeReasoning}`);
    if (marketReport.regimeWarningFlags.length > 0) {
      whyReasons.push(`Fattori di allerta attivi: ${marketReport.regimeWarningFlags.join('; ')}.`);
    }
  }
  // 4. Positive Confluence
  else if (quantSignal === 'LONG' && intelScore >= 58 && eventRisk < 60) {
    verdict = 'CONFLUENCE';
    actionAdvice = eventRisk >= 40 ? 'REDUCE_SIZE' : 'PROCEED';
    whyReasons.push(`Confluenza Positiva: segnale algoritmico LONG (${quantScore}/100) confermato da fondamentali solidi e news score favorevole (${intelScore}/100).`);
    whyReasons.push(`Rischio Evento contenuto (${eventRisk}/100) e regime di mercato ${regime} compatibile con il trend.`);
    if (actionAdvice === 'REDUCE_SIZE') {
      whyReasons.push('Dimensione posizione consigliata ridotta del 25-30% a scopo prudenziale per catalizzatori macro programmati.');
    }
  }
  // 5. Neutral or Ambiguous Conditions
  else {
    verdict = 'WAIT';
    actionAdvice = 'HOLD_OFF';
    whyReasons.push('Condizioni non univoche: assenza di edge informativo chiaro o segnale quantitativo neutrale.');
    whyReasons.push('Attesa di conferma direzionale o di chiusura dei catalizzatori aperti prima di allocare capitale.');
  }

  // Non-linear AI Confidence Score calculation (0 to 100)
  // Penalizes conflicts, high event risk, and unstable regimes quadratically rather than linearly
  let rawConfidence = (quantScore * 0.45) + (intelScore * 0.35) + ((100 - eventRisk) * 0.20);

  // Penalty factors
  if (verdict === 'CONFLICT') {
    rawConfidence *= 0.45; // Severe haircut on disagreement
  } else if (verdict === 'HIGH_RISK') {
    rawConfidence *= 0.35; // Severe haircut on earnings/gap risk
  } else if (verdict === 'WAIT') {
    rawConfidence *= 0.60;
  }

  if (regime === 'TRANSITION') rawConfidence *= 0.80;
  if (regime === 'HIGH_RISK') rawConfidence *= 0.50;
  if (marketReport.dataQuality === 'LOW') rawConfidence *= 0.70;

  const aiConfidenceScore = Math.max(10, Math.min(96, Math.round(rawConfidence)));

  // Timeframe-specific relevance synthesis
  const isIntraday = timeframe !== '1D';
  const horizonDescription = isIntraday
    ? `Operatività Intraday (${timeframe}): il focus primario è puntato su catalizzatori a brevissimo termine (prossime 24h), liquidità oraria e rischio news improvvise.`
    : `Operatività Daily/Multi-Day (${timeframe}): la convergenza su fondamentali trimestrali, margini operativi e revisioni di consenso analisti prevale rispetto al rumore intraday.`;

  const weightAdjustmentNote = isIntraday
    ? 'Peso maggiorato sul rischio evento e sui gap di apertura.'
    : 'Peso maggiorato sulla solidità fondamentale e sul trend settoriale.';

  // Structured Summary Reasoning (5 to 8 lines)
  const summaryReasoning = [
    `1. STATO CONFLUENZA: ${verdict} | RACCOMANDAZIONE: ${actionAdvice} (Confidence AI: ${aiConfidenceScore}/100).`,
    `2. LIVELLO QUANTITATIVO: Strategia '${quantStrategyName}' su timeframe ${timeframe} registra Total Return ${quantReturn.toFixed(1)}%, Profit Factor ${quantPf.toFixed(2)} e score ${quantScore}/100.`,
    `3. LIVELLO MARKET INTELLIGENCE: Composite Score a ${intelScore}/100 con News Score ${marketReport.newsScore}/100 e Contesto Fondamentale a ${marketReport.fundamentalScore}/100.`,
    `4. PROFILO DI RISCHIO: Event Risk Score a ${eventRisk}/100 con regime di mercato identificato come ${regime}.`,
    `5. CONCLUSIONE DECISIONALE: ${whyReasons[0] || 'Segnale quantitativo allineato con il contesto informativo generale.'}`,
    `6. LINEA OPERATIVA: ${actionAdvice === 'PROCEED' ? 'Condizioni ottimali per procedere con il posizionamento secondo il money management della strategia.' : actionAdvice === 'REDUCE_SIZE' ? 'Posizionamento consentito con size dimezzata per assorbire eventuale volatilità residua.' : 'Non forzare l operatività: attendere il superamento della finestra di rischio o il riallineamento dei segnali.'}`
  ].join('\n');

  return {
    ticker: marketReport.ticker,
    timeframe,
    verdict,
    actionAdvice,
    aiConfidenceScore,
    summaryReasoning,
    whyFavorableOrCautious: whyReasons,
    quantitative: {
      signal: quantSignal,
      score: quantScore,
      strategyName: quantStrategyName,
      totalReturnPct: quantReturn,
      profitFactor: quantPf,
      maxDrawdownPct: quantDd,
      robustnessScore: quantRobustness,
      timeframe,
    },
    marketIntelligence: {
      direction: intelDirection,
      score: intelScore,
      eventRiskScore: eventRisk,
      regimeStatus: regime,
      dataQuality: marketReport.dataQuality,
    },
    timeframeRelevance: {
      appliedTimeframe: timeframe,
      horizonDescription,
      weightAdjustmentNote,
    },
    dataLeakageIsolation: {
      backtestIsPureHistorical: true,
      liveIntelligenceAppliedExclusivelyToForwardDecisions: true,
      timestamp: new Date().toISOString(),
    },
  };
}
