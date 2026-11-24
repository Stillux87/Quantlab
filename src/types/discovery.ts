/**
 * QuantLab - AI Strategy Discovery Lab Type Definitions
 * Complete architectural types for autonomous hypothesis generation,
 * Strategy DNA, novelty scoring, complexity penalization, walk-forward,
 * Monte Carlo, and cross-asset validation.
 */
import { Instrument, Timeframe, Bar } from './index';

export type DiscoveryFamily =
  | 'CALENDAR'
  | 'MOMENTUM'
  | 'MEAN_REVERSION'
  | 'RELATIVE_STRENGTH'
  | 'VOLATILITY'
  | 'VOLUME'
  | 'MARKET_REGIME'
  | 'CROSS_SECTIONAL'
  | 'HYBRID'
  | 'AI_NOVELTY';

export interface TimeFactorDNA {
  dayOfWeek?: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'ANY';
  dayOfMonth?: 'START_OF_MONTH' | 'END_OF_MONTH' | 'MID_MONTH' | 'ANY';
  weekOfMonth?: 1 | 2 | 3 | 4 | 'ANY';
  monthOfYear?: number; // 1-12 or undefined
  quarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'ANY';
  holdingPeriodBars: number; // 1 to 20 bars
}

export interface PriceFactorDNA {
  type:
    | 'PREV_RETURN_N_DAYS'
    | 'CONSECUTIVE_STREAK'
    | 'BREAKOUT_DONCHIAN'
    | 'DISTANCE_SMA'
    | 'PRICE_PERCENTILE'
    | 'GAP_DETECTION'
    | 'MOMENTUM_ACCELERATION'
    | 'NONE';
  lookbackDays: number;
  condition:
    | 'WORST_RETURN'
    | 'BEST_RETURN'
    | 'CONSECUTIVE_DOWN'
    | 'CONSECUTIVE_UP'
    | 'NEW_HIGH_BREAKOUT'
    | 'NEW_LOW_BREAKOUT'
    | 'ABOVE_SMA'
    | 'BELOW_SMA'
    | 'LOW_PERCENTILE'
    | 'HIGH_PERCENTILE'
    | 'GAP_DOWN_OPEN'
    | 'GAP_UP_OPEN';
  threshold: number; // e.g. -2 for -2%, or 0.85
  smaPeriod?: 20 | 50 | 200;
}

export interface VolatilityFactorDNA {
  type:
    | 'ATR_RELATIVE'
    | 'VOLATILITY_PERCENTILE'
    | 'VOLATILITY_CONTRACTION'
    | 'VOLATILITY_EXPANSION'
    | 'NONE';
  percentileThreshold?: number; // e.g. 40 (below 40th percentile)
  atrMultiplier?: number;
}

export interface VolumeFactorDNA {
  type: 'RELATIVE_VOLUME_SURGE' | 'VOLUME_ABOVE_SMA' | 'VOLUME_SPIKE' | 'NONE';
  thresholdRatio?: number; // e.g. 1.4x (40% surge above 20d average)
}

export interface RankingFactorDNA {
  type:
    | 'BASKET_WORST_PERFORMER'
    | 'BASKET_BEST_PERFORMER'
    | 'BOTTOM_QUINTILE_20PCT'
    | 'TOP_QUINTILE_20PCT'
    | 'NONE';
  lookbackDays: number;
}

export interface RegimeFactorDNA {
  type:
    | 'INDEX_ABOVE_SMA200'
    | 'INDEX_BELOW_SMA200'
    | 'INDEX_MOMENTUM_POSITIVE'
    | 'LOW_VOLATILITY_REGIME'
    | 'HIGH_VOLATILITY_REGIME'
    | 'NONE';
  benchmarkTicker: string;
}

export interface RiskRuleDNA {
  stopLossPct?: number; // e.g. 2.0, 3.0, 4.0
  takeProfitPct?: number; // e.g. 4.0, 6.0, 8.0
  trailingStopAtrMultiplier?: number;
  maxHoldingBars: number;
}

export interface StrategyDNA {
  dnaHash: string; // SHA-like deterministic representation
  family: DiscoveryFamily;
  timeFactor: TimeFactorDNA;
  priceFactor: PriceFactorDNA;
  volatilityFactor: VolatilityFactorDNA;
  volumeFactor: VolumeFactorDNA;
  rankingFactor: RankingFactorDNA;
  regimeFactor: RegimeFactorDNA;
  riskRule: RiskRuleDNA;
  activeConditionCount: number;
  complexityScore: number; // 0 to 100
}

export interface DiscoveryHypothesis {
  id: string; // e.g. "AI-DISC-0012"
  name: string;
  family: DiscoveryFamily;
  plainHypothesis: string;
  dna: StrategyDNA;
  generationStage: 'INITIAL' | 'MUTATION' | 'CROSSOVER';
  parentDnaId?: string;
  rationale: string;
}

export type DiscoveryCategory =
  | 'BEST_ROBUST'
  | 'MOST_NOVEL'
  | 'MOST_ROBUST'
  | 'BEST_RISK_REWARD'
  | 'BEST_SIMPLE'
  | 'MOST_INTERESTING'
  | 'DISQUALIFIED';

export interface DiscoveryReport {
  hypothesis: DiscoveryHypothesis;
  category: DiscoveryCategory;
  categoryBadges: string[];
  qualificationStatus: 'QUALIFIED' | 'DISQUALIFIED';
  qualificationVerdict: string;
  disqualificationReason?: string;
  metrics: {
    totalReturnPct: number;
    cagrPct: number;
    profitFactor: number;
    maxDrawdownPct: number;
    totalTrades: number;
    winRatePct: number;
    sharpeRatio: number;
    avgTradePct: number;
    avgTradeAmount: number;
    totalPnlAmount: number;
  };
  inSampleMetrics: {
    totalReturnPct: number;
    profitFactor: number;
    trades: number;
  };
  outOfSampleMetrics: {
    totalReturnPct: number;
    profitFactor: number;
    trades: number;
    oosRetentionRatio: number;
  };
  scores: {
    robustnessScore: number; // 0 - 100
    noveltyScore: number; // 0 - 100
    complexityScore: number; // 0 - 100 (lower is simpler)
    confidenceScore: number; // 0 - 100
  };
  walkForward: {
    efficiencyPct: number;
    windowsTested: number;
    positiveWindows: number;
    stability: 'HIGH' | 'MEDIUM' | 'FRAGILE';
  };
  monteCarlo: {
    maxDrawdown95Pct: number;
    ruinProbabilityPct: number;
    worstCaseReturn5Pct: number;
    distributionSummary: string;
  };
  parameterStability: {
    stabilityScore: number; // 0 - 100
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
  };
  crossAssetValidation: {
    testedAssetsCount: number;
    profitableAssetsCount: number;
    generalizationScore: number; // 0 - 100
    isCrossMarketProven: boolean;
    assets: {
      ticker: string;
      name: string;
      returnPct: number;
      profitFactor: number;
      trades: number;
      passed: boolean;
    }[];
  };
  explainability: {
    coreInsight: string;
    whyNovel: string;
    riskCaveat: string;
  };
  equityCurve: {
    dateStr: string;
    equity: number;
    isOos: boolean;
  }[];
  trades: DiscoveryTradeRecord[];
}

export interface DiscoveryTradeRecord {
  entryIndex: number;
  entryDate: string;
  entryPrice: number;
  exitIndex: number;
  exitDate: string;
  exitPrice: number;
  shares: number;
  pnlNetEur: number;
  pnlNetPct: number;
  exitReason: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TIME_EXIT' | string;
  isOos: boolean;
}

export interface ResearchLogEntry {
  id: string;
  timestamp: number;
  dateStr: string;
  dnaHash: string;
  name: string;
  family: DiscoveryFamily;
  dnaSummary: string;
  status: 'ROBUST_DISCOVERY' | 'INTERESTING' | 'EARLY_PRUNED' | 'DISQUALIFIED';
  returnPct: number;
  robustnessScore: number;
  noveltyScore: number;
  complexityScore: number;
  confidenceScore: number;
  rejectionReason?: string;
}

export type ExplorationMode = 'FAST' | 'DEEP' | 'EXTREME';
export type DiscoveryFocusArea =
  | 'ALL'
  | 'TIME_ANOMALY'
  | 'RELATIVE_STRENGTH'
  | 'REGIME_CONDITIONED'
  | 'UNCONVENTIONAL_AI';

export interface DiscoveryLabConfig {
  basketId: 'FTSE_MIB' | 'US_TECH' | 'DIVERSIFIED_EUROPE' | 'CURRENT_INSTRUMENT';
  explorationMode: ExplorationMode;
  focusArea: DiscoveryFocusArea;
  initialCapital: number;
  allowStopLoss: boolean;
  allowTakeProfit: boolean;
  startDate?: string;
  endDate?: string;
}

export interface DiscoveryProgressStatus {
  phase: 'IDLE' | 'GENERATING' | 'BACKTESTING' | 'VALIDATING' | 'COMPLETED';
  hypothesesGenerated: number;
  hypothesesTarget: number;
  earlyPrunedCount: number;
  testedCount: number;
  qualifiedCount: number;
  currentHypothesisName: string;
  currentFamily: DiscoveryFamily;
  progressPercent: number;
}
