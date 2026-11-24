/**
 * QuantLab - Strategy Hypothesis Generator & Genetic Mutation Engine
 * Synthesizes structured, non-conventional hypotheses combining temporal anomalies,
 * price action, volatility filters, basket rankings, market regimes, and risk rules.
 */
import {
  DiscoveryHypothesis,
  StrategyDNA,
  DiscoveryFamily,
  TimeFactorDNA,
  PriceFactorDNA,
  VolatilityFactorDNA,
  VolumeFactorDNA,
  RankingFactorDNA,
  RegimeFactorDNA,
  RiskRuleDNA,
  DiscoveryFocusArea,
} from '../../types/discovery';
import { computeDnaHash, calculateComplexity } from './dnaEngine';

/**
 * Builds a StrategyDNA object with computed hash and complexity score
 */
export function buildStrategyDna(
  family: DiscoveryFamily,
  timeFactor: TimeFactorDNA,
  priceFactor: PriceFactorDNA,
  volatilityFactor: VolatilityFactorDNA,
  volumeFactor: VolumeFactorDNA,
  rankingFactor: RankingFactorDNA,
  regimeFactor: RegimeFactorDNA,
  riskRule: RiskRuleDNA
): StrategyDNA {
  const hash = computeDnaHash(
    family,
    timeFactor,
    priceFactor,
    volatilityFactor,
    volumeFactor,
    rankingFactor,
    regimeFactor,
    riskRule
  );
  const { activeConditionCount, complexityScore } = calculateComplexity(
    timeFactor,
    priceFactor,
    volatilityFactor,
    volumeFactor,
    rankingFactor,
    regimeFactor,
    riskRule
  );

  return {
    dnaHash: hash,
    family,
    timeFactor,
    priceFactor,
    volatilityFactor,
    volumeFactor,
    rankingFactor,
    regimeFactor,
    riskRule,
    activeConditionCount,
    complexityScore,
  };
}

/**
 * Creates a formatted plain Italian hypothesis statement from DNA
 */
export function generatePlainHypothesisDescription(
  name: string,
  dna: StrategyDNA
): { plainText: string; rationale: string } {
  const chunks: string[] = [];

  // Entry trigger
  if (dna.timeFactor.dayOfWeek && dna.timeFactor.dayOfWeek !== 'ANY') {
    const dMap: Record<string, string> = {
      MONDAY: 'ogni lunedì in apertura',
      TUESDAY: 'ogni martedì in apertura',
      WEDNESDAY: 'ogni mercoledì in apertura',
      THURSDAY: 'ogni giovedì in apertura',
      FRIDAY: 'ogni venerdì in apertura',
    };
    chunks.push(`Acquista ${dMap[dna.timeFactor.dayOfWeek] || 'alla seduta programmata'}`);
  } else if (dna.timeFactor.dayOfMonth && dna.timeFactor.dayOfMonth !== 'ANY') {
    if (dna.timeFactor.dayOfMonth === 'START_OF_MONTH') {
      chunks.push('Acquista all’avvio del nuovo mese solare (giorni 1-3)');
    } else if (dna.timeFactor.dayOfMonth === 'END_OF_MONTH') {
      chunks.push('Acquista nelle ultime 3 sedute del mese solare (turn-of-the-month effect)');
    } else {
      chunks.push('Acquista a metà mese');
    }
  } else {
    chunks.push('Acquista sistematicamente su setup attivo');
  }

  // Stock selection / price condition
  if (dna.rankingFactor.type === 'BASKET_WORST_PERFORMER') {
    chunks.push(`il titolo con la performance peggiore del paniere negli ultimi ${dna.rankingFactor.lookbackDays} giorni`);
  } else if (dna.rankingFactor.type === 'BASKET_BEST_PERFORMER') {
    chunks.push(`il titolo con la forza relativa più alta del paniere negli ultimi ${dna.rankingFactor.lookbackDays} giorni`);
  } else if (dna.priceFactor.type === 'CONSECUTIVE_STREAK') {
    chunks.push(`dopo una sequenza di ${dna.priceFactor.lookbackDays} chiusure consecutive al ribasso (overreaction pull-back)`);
  } else if (dna.priceFactor.type === 'BREAKOUT_DONCHIAN') {
    chunks.push(`in caso di breakout del massimo a ${dna.priceFactor.lookbackDays} sedute`);
  } else if (dna.priceFactor.type === 'PREV_RETURN_N_DAYS') {
    chunks.push(`se il rendimento cumulato negli ultimi ${dna.priceFactor.lookbackDays} giorni è inferiore a ${dna.priceFactor.threshold}%`);
  } else if (dna.priceFactor.type === 'GAP_DETECTION') {
    chunks.push('in presenza di un gap ribassista overnight con rapido riassorbimento intraday');
  }

  // Filter conditions
  if (dna.regimeFactor.type === 'INDEX_ABOVE_SMA200') {
    chunks.push('SOLO a condizione che l’indice benchmark generale quoti al di sopra della media mobile a 200 giorni (regime rialzista)');
  } else if (dna.regimeFactor.type === 'LOW_VOLATILITY_REGIME') {
    chunks.push('SOLO durante fasi di mercato a volatilità contenuta');
  }

  if (dna.volatilityFactor.type === 'VOLATILITY_PERCENTILE') {
    chunks.push(`se la volatilità storica a 20 giorni del titolo è collocata al di sotto del ${dna.volatilityFactor.percentileThreshold || 40}° percentile`);
  }
  if (dna.volumeFactor.type === 'RELATIVE_VOLUME_SURGE') {
    chunks.push(`confermato da un volume di negoziazione superiore di almeno il ${Math.round(((dna.volumeFactor.thresholdRatio || 1.4) - 1) * 100)}% alla media`);
  }

  // Exit & risk
  const exits: string[] = [];
  if (dna.riskRule.stopLossPct) {
    exits.push(`Stop Loss rigido al ${dna.riskRule.stopLossPct}%`);
  }
  if (dna.riskRule.takeProfitPct) {
    exits.push(`Take Profit al ${dna.riskRule.takeProfitPct}%`);
  }
  exits.push(`chiusura forzata a mercato dopo ${dna.timeFactor.holdingPeriodBars} sedute`);
  chunks.push(`Gestione del rischio: ${exits.join(', ')}.`);

  const plainText = chunks.join(', ');

  // Rationale
  let rationale = '';
  switch (dna.family) {
    case 'CALENDAR':
      rationale = 'Sfrutta anomalie temporali ricorrenti legate al ciclo settimanale o mensile di riallocazione dei flussi istituzionali.';
      break;
    case 'RELATIVE_STRENGTH':
    case 'CROSS_SECTIONAL':
      rationale = 'Estrae alpha dal riallineamento medio (mean reversion cross-sezionale) tra titoli appartenenti allo stesso paniere.';
      break;
    case 'MARKET_REGIME':
      rationale = 'Condiziona rigorosamente l’esposizione al rischio azionario alla salute macroeconomica dell’indice guida (filtro SMA200).';
      break;
    case 'VOLATILITY':
      rationale = 'Capitalizza sull’alternanza ciclica tra fasi di compressione di volatilità ed espansioni direzionali di prezzo.';
      break;
    case 'AI_NOVELTY':
    case 'HYBRID':
      rationale = 'Combina fattori asimmetrici (giornaliero + ranking + regime) tipicamente trascurati dall’analisi tecnica convenzionale.';
      break;
    default:
      rationale = 'Ipotesi quantitativa generata per esplorare inefficienze strutturali di microstruttura.';
  }

  return { plainText, rationale };
}

/**
 * Generates an initial diverse pool of hypotheses
 */
export function generateDiverseHypotheses(
  targetCount: number,
  focusArea: DiscoveryFocusArea = 'ALL',
  benchmarkTicker: string = 'SPY'
): DiscoveryHypothesis[] {
  const hypotheses: DiscoveryHypothesis[] = [];
  const seenHashes = new Set<string>();

  let idCounter = 1;

  function tryAdd(h: DiscoveryHypothesis): boolean {
    if (seenHashes.has(h.dna.dnaHash)) return false;
    seenHashes.add(h.dna.dnaHash);
    hypotheses.push(h);
    return true;
  }

  // =========================================================================
  // 1. CANONICAL CALENDAR / TIME ANOMALY HYPOTHESES
  // =========================================================================
  if (focusArea === 'ALL' || focusArea === 'TIME_ANOMALY') {
    const days: Array<'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY'> = [
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
    ];
    const holdingDays = [1, 2, 3, 5];

    for (const d of days) {
      for (const hold of holdingDays) {
        const timeFactor: TimeFactorDNA = { dayOfWeek: d, holdingPeriodBars: hold };
        const priceFactor: PriceFactorDNA = {
          type: 'PREV_RETURN_N_DAYS',
          lookbackDays: 3,
          condition: 'WORST_RETURN',
          threshold: -1.5,
        };
        const volFactor: VolatilityFactorDNA = { type: 'NONE' };
        const volumeFactor: VolumeFactorDNA = { type: 'NONE' };
        const rankFactor: RankingFactorDNA = { type: 'NONE', lookbackDays: 0 };
        const regimeFactor: RegimeFactorDNA = { type: 'NONE', benchmarkTicker };
        const riskRule: RiskRuleDNA = { stopLossPct: 3.0, maxHoldingBars: hold };

        const dna = buildStrategyDna(
          'CALENDAR',
          timeFactor,
          priceFactor,
          volFactor,
          volumeFactor,
          rankFactor,
          regimeFactor,
          riskRule
        );

        const name = `${d === 'THURSDAY' ? 'Giovedì' : d === 'MONDAY' ? 'Lunedì' : d} Anomaly Reversal (${hold}d)`;
        const { plainText, rationale } = generatePlainHypothesisDescription(name, dna);

        tryAdd({
          id: `AI-DISC-${String(idCounter++).padStart(4, '0')}`,
          name,
          family: 'CALENDAR',
          plainHypothesis: plainText,
          dna,
          generationStage: 'INITIAL',
          rationale,
        });
      }
    }

    // Turn of the month anomaly
    for (const hold of [2, 3, 5]) {
      const timeFactor: TimeFactorDNA = { dayOfMonth: 'END_OF_MONTH', holdingPeriodBars: hold };
      const priceFactor: PriceFactorDNA = {
        type: 'PRICE_PERCENTILE',
        lookbackDays: 20,
        condition: 'LOW_PERCENTILE',
        threshold: 0.35,
      };
      const dna = buildStrategyDna(
        'CALENDAR',
        timeFactor,
        priceFactor,
        { type: 'NONE' },
        { type: 'NONE' },
        { type: 'NONE', lookbackDays: 0 },
        { type: 'NONE', benchmarkTicker },
        { stopLossPct: 3.5, maxHoldingBars: hold }
      );
      const name = `Turn-of-the-Month Inflow Reversal (${hold}d)`;
      const { plainText, rationale } = generatePlainHypothesisDescription(name, dna);
      tryAdd({
        id: `AI-DISC-${String(idCounter++).padStart(4, '0')}`,
        name,
        family: 'CALENDAR',
        plainHypothesis: plainText,
        dna,
        generationStage: 'INITIAL',
        rationale,
      });
    }
  }

  // =========================================================================
  // 2. RELATIVE STRENGTH & CROSS-SECTIONAL BASKET RANKING HYPOTHESES
  // =========================================================================
  if (focusArea === 'ALL' || focusArea === 'RELATIVE_STRENGTH') {
    const lookbacks = [3, 5, 7, 10];
    const holdingPeriods = [2, 3, 5, 7];

    for (const lb of lookbacks) {
      for (const hold of holdingPeriods) {
        // Worst in basket mean-reversion
        const dnaWorst = buildStrategyDna(
          'RELATIVE_STRENGTH',
          { dayOfWeek: 'ANY', holdingPeriodBars: hold },
          { type: 'NONE', lookbackDays: lb, condition: 'WORST_RETURN', threshold: 0 },
          { type: 'NONE' },
          { type: 'NONE' },
          { type: 'BASKET_WORST_PERFORMER', lookbackDays: lb },
          { type: 'NONE', benchmarkTicker },
          { stopLossPct: 3.5, maxHoldingBars: hold }
        );
        const nameWorst = `Peggior Titolo Paniere (${lb}d -> ${hold}d Hold)`;
        const descWorst = generatePlainHypothesisDescription(nameWorst, dnaWorst);
        tryAdd({
          id: `AI-DISC-${String(idCounter++).padStart(4, '0')}`,
          name: nameWorst,
          family: 'RELATIVE_STRENGTH',
          plainHypothesis: descWorst.plainText,
          dna: dnaWorst,
          generationStage: 'INITIAL',
          rationale: descWorst.rationale,
        });

        // Best in basket momentum follow
        const dnaBest = buildStrategyDna(
          'RELATIVE_STRENGTH',
          { dayOfWeek: 'ANY', holdingPeriodBars: hold },
          { type: 'NONE', lookbackDays: lb, condition: 'BEST_RETURN', threshold: 0 },
          { type: 'NONE' },
          { type: 'NONE' },
          { type: 'BASKET_BEST_PERFORMER', lookbackDays: lb },
          { type: 'NONE', benchmarkTicker },
          { stopLossPct: 2.5, takeProfitPct: 6.0, maxHoldingBars: hold }
        );
        const nameBest = `Top Leader Momentum Paniere (${lb}d -> ${hold}d Hold)`;
        const descBest = generatePlainHypothesisDescription(nameBest, dnaBest);
        tryAdd({
          id: `AI-DISC-${String(idCounter++).padStart(4, '0')}`,
          name: nameBest,
          family: 'RELATIVE_STRENGTH',
          plainHypothesis: descBest.plainText,
          dna: dnaBest,
          generationStage: 'INITIAL',
          rationale: descBest.rationale,
        });
      }
    }
  }

  // =========================================================================
  // 3. REGIME-CONDITIONED STRATEGIES (Macro Benchmark Trend Filtering)
  // =========================================================================
  if (focusArea === 'ALL' || focusArea === 'REGIME_CONDITIONED') {
    const days: Array<'MONDAY' | 'THURSDAY' | 'ANY'> = ['THURSDAY', 'MONDAY', 'ANY'];
    for (const d of days) {
      for (const lb of [3, 5]) {
        for (const sl of [2.5, 3.5]) {
          const dnaRegime = buildStrategyDna(
            'MARKET_REGIME',
            { dayOfWeek: d, holdingPeriodBars: 5 },
            {
              type: 'PREV_RETURN_N_DAYS',
              lookbackDays: lb,
              condition: 'WORST_RETURN',
              threshold: -2.0,
            },
            { type: 'NONE' },
            { type: 'NONE' },
            { type: 'BASKET_WORST_PERFORMER', lookbackDays: lb },
            { type: 'INDEX_ABOVE_SMA200', benchmarkTicker },
            { stopLossPct: sl, maxHoldingBars: 5 }
          );
          const name = `Regime Benchmark + Reversal (${d} lb${lb}d SL${sl}%)`;
          const desc = generatePlainHypothesisDescription(name, dnaRegime);
          tryAdd({
            id: `AI-DISC-${String(idCounter++).padStart(4, '0')}`,
            name,
            family: 'MARKET_REGIME',
            plainHypothesis: desc.plainText,
            dna: dnaRegime,
            generationStage: 'INITIAL',
            rationale: desc.rationale,
          });
        }
      }
    }
  }

  // =========================================================================
  // 4. UNCONVENTIONAL AI & HYBRID NOVELTY STRATEGIES
  // =========================================================================
  if (focusArea === 'ALL' || focusArea === 'UNCONVENTIONAL_AI') {
    // Volatility compression + Volume surge + Thursday
    const volOptions: Array<25 | 40> = [25, 40];
    const holdOptions = [3, 5, 8];
    for (const p of volOptions) {
      for (const hold of holdOptions) {
        const dnaNovel = buildStrategyDna(
          'AI_NOVELTY',
          { dayOfWeek: 'THURSDAY', holdingPeriodBars: hold },
          {
            type: 'CONSECUTIVE_STREAK',
            lookbackDays: 3,
            condition: 'CONSECUTIVE_DOWN',
            threshold: 0,
          },
          { type: 'VOLATILITY_PERCENTILE', percentileThreshold: p },
          { type: 'RELATIVE_VOLUME_SURGE', thresholdRatio: 1.35 },
          { type: 'NONE', lookbackDays: 0 },
          { type: 'INDEX_ABOVE_SMA200', benchmarkTicker },
          { stopLossPct: 2.8, takeProfitPct: 5.5, maxHoldingBars: hold }
        );
        const name = `AI Triple-Filter (Vol ${p}% + VolSurge + 3-Down Streak)`;
        const desc = generatePlainHypothesisDescription(name, dnaNovel);
        tryAdd({
          id: `AI-DISC-${String(idCounter++).padStart(4, '0')}`,
          name,
          family: 'AI_NOVELTY',
          plainHypothesis: desc.plainText,
          dna: dnaNovel,
          generationStage: 'INITIAL',
          rationale: desc.rationale,
        });
      }
    }

    // Gap down overreaction in bull market
    for (const sl of [2.0, 3.0]) {
      const dnaGap = buildStrategyDna(
        'HYBRID',
        { dayOfWeek: 'ANY', holdingPeriodBars: 2 },
        {
          type: 'GAP_DETECTION',
          lookbackDays: 1,
          condition: 'GAP_DOWN_OPEN',
          threshold: -1.2,
        },
        { type: 'NONE' },
        { type: 'RELATIVE_VOLUME_SURGE', thresholdRatio: 1.5 },
        { type: 'NONE', lookbackDays: 0 },
        { type: 'INDEX_ABOVE_SMA200', benchmarkTicker },
        { stopLossPct: sl, maxHoldingBars: 2 }
      );
      const name = `Overnight Gap-Down Bull Rebound (SL ${sl}%)`;
      const desc = generatePlainHypothesisDescription(name, dnaGap);
      tryAdd({
        id: `AI-DISC-${String(idCounter++).padStart(4, '0')}`,
        name,
        family: 'HYBRID',
        plainHypothesis: desc.plainText,
        dna: dnaGap,
        generationStage: 'INITIAL',
        rationale: desc.rationale,
      });
    }
  }

  // =========================================================================
  // 5. FILL POOL UP TO TARGET COUNT (combinatorial combinations)
  // =========================================================================
  const weekdays: Array<'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'ANY'> = [
    'THURSDAY',
    'TUESDAY',
    'WEDNESDAY',
    'MONDAY',
    'FRIDAY',
    'ANY',
  ];
  const lookbacks = [2, 3, 5, 7, 10];
  const slList = [2.0, 3.0, 4.0, 5.0];
  const holdList = [2, 3, 5, 7, 10];

  let loopSafety = 0;
  while (hypotheses.length < targetCount && loopSafety < 3000) {
    loopSafety++;
    const dow = weekdays[Math.floor(Math.random() * weekdays.length)];
    const lb = lookbacks[Math.floor(Math.random() * lookbacks.length)];
    const sl = slList[Math.floor(Math.random() * slList.length)];
    const hold = holdList[Math.floor(Math.random() * holdList.length)];
    const useRegime = Math.random() > 0.45;
    const useVol = Math.random() > 0.6;
    const useRank = Math.random() > 0.5;

    const fam: DiscoveryFamily =
      dow !== 'ANY' ? 'CALENDAR' : useRank ? 'RELATIVE_STRENGTH' : useRegime ? 'MARKET_REGIME' : 'HYBRID';

    const dna = buildStrategyDna(
      fam,
      { dayOfWeek: dow, holdingPeriodBars: hold },
      {
        type: 'PREV_RETURN_N_DAYS',
        lookbackDays: lb,
        condition: Math.random() > 0.3 ? 'WORST_RETURN' : 'BEST_RETURN',
        threshold: -1.5,
      },
      useVol ? { type: 'VOLATILITY_PERCENTILE', percentileThreshold: 40 } : { type: 'NONE' },
      { type: 'NONE' },
      useRank ? { type: 'BASKET_WORST_PERFORMER', lookbackDays: lb } : { type: 'NONE', lookbackDays: 0 },
      useRegime ? { type: 'INDEX_ABOVE_SMA200', benchmarkTicker } : { type: 'NONE', benchmarkTicker },
      { stopLossPct: sl, maxHoldingBars: hold }
    );

    const name = `${fam} Discovery Hypothesis #${String(idCounter).padStart(3, '0')}`;
    const desc = generatePlainHypothesisDescription(name, dna);
    tryAdd({
      id: `AI-DISC-${String(idCounter++).padStart(4, '0')}`,
      name,
      family: fam,
      plainHypothesis: desc.plainText,
      dna,
      generationStage: 'INITIAL',
      rationale: desc.rationale,
    });
  }

  return hypotheses;
}

/**
 * Strategy Mutation Engine
 * Evolves an interesting parent hypothesis by perturbing exactly ONE factor
 * (e.g. adjust holding period, nudge stop loss, add/remove regime filter).
 */
export function mutateHypothesis(
  parent: DiscoveryHypothesis,
  mutationId: string
): DiscoveryHypothesis {
  const pDna = parent.dna;
  const timeFactor: TimeFactorDNA = { ...pDna.timeFactor };
  const priceFactor: PriceFactorDNA = { ...pDna.priceFactor };
  const volFactor: VolatilityFactorDNA = { ...pDna.volatilityFactor };
  const volumeFactor: VolumeFactorDNA = { ...pDna.volumeFactor };
  const rankFactor: RankingFactorDNA = { ...pDna.rankingFactor };
  const regimeFactor: RegimeFactorDNA = { ...pDna.regimeFactor };
  const riskRule: RiskRuleDNA = { ...pDna.riskRule };

  // Pick random mutation type
  const roll = Math.random();

  if (roll < 0.25) {
    // 1. Mutate holding period
    const deltas = [-2, -1, 1, 2];
    const d = deltas[Math.floor(Math.random() * deltas.length)];
    const newHold = Math.max(1, Math.min(15, timeFactor.holdingPeriodBars + d));
    timeFactor.holdingPeriodBars = newHold;
    riskRule.maxHoldingBars = newHold;
  } else if (roll < 0.5) {
    // 2. Mutate Stop Loss
    const currentSl = riskRule.stopLossPct || 3.0;
    const newSl = parseFloat(Math.max(1.5, Math.min(6.0, currentSl + (Math.random() > 0.5 ? 0.5 : -0.5))).toFixed(1));
    riskRule.stopLossPct = newSl;
  } else if (roll < 0.75) {
    // 3. Toggle / alter regime filter
    if (regimeFactor.type === 'NONE') {
      regimeFactor.type = 'INDEX_ABOVE_SMA200';
    } else {
      regimeFactor.type = 'NONE';
    }
  } else {
    // 4. Mutate lookback days
    const currentLb = priceFactor.lookbackDays || 3;
    const newLb = Math.max(2, Math.min(10, currentLb + (Math.random() > 0.5 ? 1 : -1)));
    priceFactor.lookbackDays = newLb;
    if (rankFactor.lookbackDays) {
      rankFactor.lookbackDays = newLb;
    }
  }

  const mutatedDna = buildStrategyDna(
    pDna.family,
    timeFactor,
    priceFactor,
    volFactor,
    volumeFactor,
    rankFactor,
    regimeFactor,
    riskRule
  );

  const name = `${parent.name} (Mutazione α)`;
  const desc = generatePlainHypothesisDescription(name, mutatedDna);

  return {
    id: mutationId,
    name,
    family: pDna.family,
    plainHypothesis: desc.plainText,
    dna: mutatedDna,
    generationStage: 'MUTATION',
    parentDnaId: parent.id,
    rationale: `Derivata per mutazione genetica mirata da ${parent.id} per testare la stabilità strutturale della regola.`,
  };
}
