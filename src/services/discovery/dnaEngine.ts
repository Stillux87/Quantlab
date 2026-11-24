/**
 * QuantLab - Strategy DNA Engine
 * Provides deterministic DNA representation, cryptographic-style hashing,
 * structural complexity scoring, and distance-based Novelty Scoring (0-100).
 */
import {
  StrategyDNA,
  DiscoveryFamily,
  TimeFactorDNA,
  PriceFactorDNA,
  VolatilityFactorDNA,
  VolumeFactorDNA,
  RankingFactorDNA,
  RegimeFactorDNA,
  RiskRuleDNA,
} from '../../types/discovery';

/**
 * Standard reference strategies represented in Strategy DNA format.
 * Used as the baseline against which structural distance / novelty is computed.
 */
const CANONICAL_BASELINE_DNAS: Array<{ name: string; family: DiscoveryFamily; tokens: string[] }> = [
  {
    name: 'Standard Moving Average Crossover',
    family: 'MOMENTUM',
    tokens: ['PRICE:DISTANCE_SMA', 'SMA:50', 'SMA:200', 'REGIME:NONE', 'TIME:ANY'],
  },
  {
    name: 'Classic RSI 14 Mean Reversion',
    family: 'MEAN_REVERSION',
    tokens: ['PRICE:PRICE_PERCENTILE', 'LOOKBACK:14', 'TIME:ANY', 'VOL:NONE'],
  },
  {
    name: 'Donchian 20-day Turtle Breakout',
    family: 'MOMENTUM',
    tokens: ['PRICE:BREAKOUT_DONCHIAN', 'LOOKBACK:20', 'RISK:ATR_2', 'TIME:ANY'],
  },
  {
    name: 'Bollinger Band Squeeze Breakout',
    family: 'VOLATILITY',
    tokens: ['VOL:VOLATILITY_EXPANSION', 'LOOKBACK:20', 'TIME:ANY'],
  },
  {
    name: 'Standard Buy and Hold',
    family: 'HYBRID',
    tokens: ['TIME:ANY', 'PRICE:NONE', 'RISK:NONE'],
  },
];

/**
 * Generates a deterministic normalized string hash of a Strategy DNA
 */
export function computeDnaHash(
  family: DiscoveryFamily,
  timeFactor: TimeFactorDNA,
  priceFactor: PriceFactorDNA,
  volatilityFactor: VolatilityFactorDNA,
  volumeFactor: VolumeFactorDNA,
  rankingFactor: RankingFactorDNA,
  regimeFactor: RegimeFactorDNA,
  riskRule: RiskRuleDNA
): string {
  const parts = [
    `FAM:${family}`,
    `TIME:DOW=${timeFactor.dayOfWeek || 'ANY'},DOM=${timeFactor.dayOfMonth || 'ANY'},HOLD=${timeFactor.holdingPeriodBars}`,
    `PRICE:T=${priceFactor.type},LB=${priceFactor.lookbackDays},C=${priceFactor.condition},TH=${priceFactor.threshold}`,
    `VOL:${volatilityFactor.type},P=${volatilityFactor.percentileThreshold || 0}`,
    `VOLU:${volumeFactor.type},R=${volumeFactor.thresholdRatio || 0}`,
    `RANK:${rankingFactor.type},LB=${rankingFactor.lookbackDays || 0}`,
    `REG:${regimeFactor.type},BM=${regimeFactor.benchmarkTicker || 'NONE'}`,
    `RISK:SL=${riskRule.stopLossPct || 0},TP=${riskRule.takeProfitPct || 0},MAX=${riskRule.maxHoldingBars}`,
  ];
  return parts.join('|');
}

/**
 * Counts the number of active rules and computes the Structural Complexity Score (0 - 100).
 * Lower is simpler (parsimonious).
 * Principle: Simple rules (e.g. Thursday + Worst 5D + 3% SL) score 20-35.
 * Overly convoluted rules (7 indicators) score 80-95.
 */
export function calculateComplexity(
  timeFactor: TimeFactorDNA,
  priceFactor: PriceFactorDNA,
  volatilityFactor: VolatilityFactorDNA,
  volumeFactor: VolumeFactorDNA,
  rankingFactor: RankingFactorDNA,
  regimeFactor: RegimeFactorDNA,
  riskRule: RiskRuleDNA
): { activeConditionCount: number; complexityScore: number } {
  let activeConditions = 0;
  let rawComplexityWeight = 0;

  // 1. Time factors
  if (timeFactor.dayOfWeek && timeFactor.dayOfWeek !== 'ANY') {
    activeConditions++;
    rawComplexityWeight += 8;
  }
  if (timeFactor.dayOfMonth && timeFactor.dayOfMonth !== 'ANY') {
    activeConditions++;
    rawComplexityWeight += 10;
  }
  if (timeFactor.monthOfYear) {
    activeConditions++;
    rawComplexityWeight += 12;
  }
  if (timeFactor.holdingPeriodBars !== 5) {
    // Non-standard holding period
    rawComplexityWeight += 4;
  }

  // 2. Price factors
  if (priceFactor.type !== 'NONE') {
    activeConditions++;
    rawComplexityWeight += 14;
    if (priceFactor.smaPeriod) {
      activeConditions++;
      rawComplexityWeight += 8;
    }
  }

  // 3. Volatility factor
  if (volatilityFactor.type !== 'NONE') {
    activeConditions++;
    rawComplexityWeight += 12;
  }

  // 4. Volume factor
  if (volumeFactor.type !== 'NONE') {
    activeConditions++;
    rawComplexityWeight += 10;
  }

  // 5. Ranking factor (cross-sectional)
  if (rankingFactor.type !== 'NONE') {
    activeConditions++;
    rawComplexityWeight += 15;
  }

  // 6. Regime factor (macro / benchmark index)
  if (regimeFactor.type !== 'NONE') {
    activeConditions++;
    rawComplexityWeight += 12;
  }

  // 7. Risk rules
  if (riskRule.stopLossPct) {
    rawComplexityWeight += 5;
  }
  if (riskRule.takeProfitPct) {
    rawComplexityWeight += 6;
  }

  // Scale raw complexity to 0 - 100 bounded
  // 1-2 conditions: ~20-35
  // 3-4 conditions: ~40-60
  // 5+ conditions: ~70-95
  const normalizedScore = Math.max(15, Math.min(95, Math.round(rawComplexityWeight)));

  return {
    activeConditionCount: activeConditions,
    complexityScore: normalizedScore,
  };
}

/**
 * Extracts discrete semantic tokens from a DNA for distance calculation
 */
function extractDnaTokens(dna: StrategyDNA): Set<string> {
  const tokens = new Set<string>();
  tokens.add(`FAM:${dna.family}`);
  if (dna.timeFactor.dayOfWeek && dna.timeFactor.dayOfWeek !== 'ANY') {
    tokens.add(`TIME:DOW_${dna.timeFactor.dayOfWeek}`);
  }
  if (dna.timeFactor.dayOfMonth && dna.timeFactor.dayOfMonth !== 'ANY') {
    tokens.add(`TIME:DOM_${dna.timeFactor.dayOfMonth}`);
  }
  if (dna.timeFactor.monthOfYear) {
    tokens.add(`TIME:MOY_${dna.timeFactor.monthOfYear}`);
  }
  tokens.add(`HOLD:${dna.timeFactor.holdingPeriodBars}`);

  if (dna.priceFactor.type !== 'NONE') {
    tokens.add(`PRICE:${dna.priceFactor.type}`);
    tokens.add(`PRICE_COND:${dna.priceFactor.condition}`);
    tokens.add(`PRICE_LB:${dna.priceFactor.lookbackDays}`);
  }
  if (dna.volatilityFactor.type !== 'NONE') {
    tokens.add(`VOL:${dna.volatilityFactor.type}`);
  }
  if (dna.volumeFactor.type !== 'NONE') {
    tokens.add(`VOLU:${dna.volumeFactor.type}`);
  }
  if (dna.rankingFactor.type !== 'NONE') {
    tokens.add(`RANK:${dna.rankingFactor.type}`);
  }
  if (dna.regimeFactor.type !== 'NONE') {
    tokens.add(`REG:${dna.regimeFactor.type}`);
  }
  if (dna.riskRule.stopLossPct) {
    tokens.add(`SL:${dna.riskRule.stopLossPct}%`);
  }
  return tokens;
}

/**
 * Calculates Jaccard distance between two sets of tokens (0 = identical, 1 = completely disjoint)
 */
function jaccardDistance(setA: Set<string>, setB: Set<string>): number {
  const intersectionSize = Array.from(setA).filter((t) => setB.has(t)).length;
  const unionSize = new Set([...Array.from(setA), ...Array.from(setB)]).size;
  if (unionSize === 0) return 0;
  return 1 - intersectionSize / unionSize;
}

/**
 * Computes the Novelty Score (0 - 100)
 * Evaluates how unconventional the DNA is compared to:
 * 1. Traditional baseline technical strategies (Moving Average, RSI, Donchian, etc.)
 * 2. The corpus of already explored strategies in this session
 *
 * A strategy with calendar anomalies + cross-sectional ranking + regime filter
 * receives a high novelty score (e.g. 75 - 95).
 * A strategy that just does "Buy if price > SMA20" receives a low novelty score (e.g. 15 - 25).
 */
export function calculateNoveltyScore(
  candidateDna: StrategyDNA,
  testedCorpus: StrategyDNA[] = []
): number {
  const candidateTokens = extractDnaTokens(candidateDna);

  // 1. Distance from canonical traditional baselines
  let minCanonicalDistance = 1.0;
  for (const base of CANONICAL_BASELINE_DNAS) {
    const baseTokens = new Set(base.tokens);
    const dist = jaccardDistance(candidateTokens, baseTokens);
    if (dist < minCanonicalDistance) {
      minCanonicalDistance = dist;
    }
  }

  // 2. Distance from already tested strategies (k-nearest neighbors average)
  let corpusDistance = 1.0;
  if (testedCorpus.length > 0) {
    const sampleSize = Math.min(15, testedCorpus.length);
    let totalDist = 0;
    // sample recent & random to keep performance fast
    const sampled = testedCorpus.slice(-sampleSize);
    for (const tested of sampled) {
      const testedTokens = extractDnaTokens(tested);
      totalDist += jaccardDistance(candidateTokens, testedTokens);
    }
    corpusDistance = totalDist / sampled.length;
  }

  // 3. Intrinsic family non-conventionality bonus
  let familyUnconventionalityBonus = 0;
  switch (candidateDna.family) {
    case 'CALENDAR':
      familyUnconventionalityBonus = 22; // High novelty: calendar day anomalies are rare in retail
      break;
    case 'CROSS_SECTIONAL':
    case 'RELATIVE_STRENGTH':
      familyUnconventionalityBonus = 20; // High novelty: multi-asset ranking
      break;
    case 'AI_NOVELTY':
    case 'HYBRID':
      familyUnconventionalityBonus = 24;
      break;
    case 'MARKET_REGIME':
      familyUnconventionalityBonus = 15;
      break;
    case 'VOLUME':
      familyUnconventionalityBonus = 12;
      break;
    case 'VOLATILITY':
      familyUnconventionalityBonus = 10;
      break;
    case 'MEAN_REVERSION':
      familyUnconventionalityBonus = 5;
      break;
    case 'MOMENTUM':
    default:
      familyUnconventionalityBonus = 0;
      break;
  }

  // Combine components into 0 - 100 score
  const rawScore =
    minCanonicalDistance * 50 +
    corpusDistance * 30 +
    familyUnconventionalityBonus;

  return Math.max(10, Math.min(99, Math.round(rawScore)));
}

/**
 * Creates human-readable summary of a Strategy DNA
 */
export function formatDnaSummary(dna: StrategyDNA): string {
  const parts: string[] = [];

  // Time
  if (dna.timeFactor.dayOfWeek && dna.timeFactor.dayOfWeek !== 'ANY') {
    const dayNames: Record<string, string> = {
      MONDAY: 'Lunedì',
      TUESDAY: 'Martedì',
      WEDNESDAY: 'Mercoledì',
      THURSDAY: 'Giovedì',
      FRIDAY: 'Venerdì',
    };
    parts.push(`📅 ${dayNames[dna.timeFactor.dayOfWeek] || dna.timeFactor.dayOfWeek}`);
  }
  if (dna.timeFactor.dayOfMonth && dna.timeFactor.dayOfMonth !== 'ANY') {
    const domNames: Record<string, string> = {
      START_OF_MONTH: 'Inizio Mese (1-5)',
      END_OF_MONTH: 'Fine Mese (ultime 3)',
      MID_MONTH: 'Metà Mese',
    };
    parts.push(`🗓️ ${domNames[dna.timeFactor.dayOfMonth] || dna.timeFactor.dayOfMonth}`);
  }

  // Price
  if (dna.priceFactor.type !== 'NONE') {
    const condLabels: Record<string, string> = {
      WORST_RETURN: `Peggior rendimento ${dna.priceFactor.lookbackDays}d`,
      BEST_RETURN: `Miglior rendimento ${dna.priceFactor.lookbackDays}d`,
      CONSECUTIVE_DOWN: `${dna.priceFactor.lookbackDays} sedute consecutive al ribasso`,
      CONSECUTIVE_UP: `${dna.priceFactor.lookbackDays} sedute consecutive al rialzo`,
      NEW_HIGH_BREAKOUT: `Breakout Max a ${dna.priceFactor.lookbackDays}d`,
      NEW_LOW_BREAKOUT: `Breakout Min a ${dna.priceFactor.lookbackDays}d`,
      ABOVE_SMA: `Prezzo sopra SMA${dna.priceFactor.smaPeriod || 200}`,
      BELOW_SMA: `Prezzo sotto SMA${dna.priceFactor.smaPeriod || 200}`,
      LOW_PERCENTILE: `Prezzo al percentile basso (${dna.priceFactor.threshold})`,
      HIGH_PERCENTILE: `Prezzo al percentile alto`,
      GAP_DOWN_OPEN: 'Gap Down in apertura',
      GAP_UP_OPEN: 'Gap Up in apertura',
    };
    parts.push(`📊 ${condLabels[dna.priceFactor.condition] || dna.priceFactor.condition}`);
  }

  // Ranking
  if (dna.rankingFactor.type !== 'NONE') {
    const rankLabels: Record<string, string> = {
      BASKET_WORST_PERFORMER: `Peggior titolo paniere a ${dna.rankingFactor.lookbackDays}d`,
      BASKET_BEST_PERFORMER: `Miglior titolo paniere a ${dna.rankingFactor.lookbackDays}d`,
      BOTTOM_QUINTILE_20PCT: 'Bottom 20% del paniere',
      TOP_QUINTILE_20PCT: 'Top 20% del paniere',
    };
    parts.push(`🏆 ${rankLabels[dna.rankingFactor.type] || dna.rankingFactor.type}`);
  }

  // Regime
  if (dna.regimeFactor.type !== 'NONE') {
    const regLabels: Record<string, string> = {
      INDEX_ABOVE_SMA200: 'Indice Benchmark > SMA200',
      INDEX_BELOW_SMA200: 'Indice Benchmark < SMA200',
      INDEX_MOMENTUM_POSITIVE: 'Indice Momentum Positivo',
      LOW_VOLATILITY_REGIME: 'Regime Bassa Volatilità',
      HIGH_VOLATILITY_REGIME: 'Regime Alta Volatilità',
    };
    parts.push(`🏛️ ${regLabels[dna.regimeFactor.type] || dna.regimeFactor.type}`);
  }

  // Volatility & Volume
  if (dna.volatilityFactor.type !== 'NONE') {
    parts.push(`⚡ Volatilità < ${dna.volatilityFactor.percentileThreshold || 40}° perc`);
  }
  if (dna.volumeFactor.type !== 'NONE') {
    parts.push(`📈 Volume Surge ${dna.volumeFactor.thresholdRatio || 1.4}x`);
  }

  // Exit & Risk
  const riskParts: string[] = [];
  if (dna.riskRule.stopLossPct) riskParts.push(`SL ${dna.riskRule.stopLossPct}%`);
  if (dna.riskRule.takeProfitPct) riskParts.push(`TP ${dna.riskRule.takeProfitPct}%`);
  riskParts.push(`Hold max ${dna.timeFactor.holdingPeriodBars}d`);
  parts.push(`🛡️ ${riskParts.join(' • ')}`);

  return parts.join(' | ');
}
