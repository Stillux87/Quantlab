import { Timeframe } from './index';

export type SourceCredibilityTier = 
  | 'TIER_1_OFFICIAL'        // SEC filings, company press releases, central banks
  | 'TIER_2_MAJOR_FINANCIAL'  // Bloomberg, Reuters, WSJ, Financial Times
  | 'TIER_3_PRESS'            // CNBC, MarketWatch, Forbes, Baron's
  | 'TIER_4_GENERAL';         // General media, aggregated outlets

export interface NewsSource {
  name: string;
  url?: string;
  credibilityTier: SourceCredibilityTier;
  publishedAt: string;
}

export type EventDirection = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
export type EventImportance = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type EventTimeHorizon = 'INTRADAY' | 'DAYS' | 'WEEKS' | 'MONTHS';
export type EventNovelty = 'KNOWN' | 'PARTIALLY_NEW' | 'NEW_INFORMATION';
export type EventPotentialImpact = 'LOW' | 'MEDIUM' | 'HIGH';
export type EventCategory = 
  | 'EARNINGS' 
  | 'GUIDANCE' 
  | 'LEGAL_REGULATORY' 
  | 'MACRO_RATES' 
  | 'SECTOR_PEERS' 
  | 'ANALYSTS' 
  | 'PRODUCT_OPERATIONS' 
  | 'MANAGEMENT';

export interface DeduplicatedEvent {
  id: string;
  headline: string;
  category: EventCategory;
  // Strict separation of FACT vs INTERPRETATION
  fact: string;                     // What actually occurred (verifiable)
  interpretation: string;           // Potential financial/price transmission mechanism
  confidence: number;               // Reliability of interpretation (0-100)
  
  sources: NewsSource[];            // Multiple verified sources confirming the single event
  sourceCount: number;
  primaryTier: SourceCredibilityTier;

  direction: EventDirection;
  importance: EventImportance;
  timeHorizon: EventTimeHorizon;
  novelty: EventNovelty;
  potentialImpact: EventPotentialImpact;
  
  alreadyPricedInEstimatePct: number; // Estimated % already absorbed by market (0-100)
  weight: number;                   // Final normalized weight in intelligence score
  timestamp: string;
}

export interface CorporateFinancials {
  revenueGrowthYoY: number;         // e.g. +8.4%
  epsGrowthYoY: number;             // e.g. +14.2%
  operatingMarginPct: number;       // e.g. 21.5%
  freeCashFlowYieldPct: number;     // e.g. 4.8%
  debtToEquityRatio: number;        // e.g. 0.85
  guidanceDirection: 'RAISED' | 'CONFIRMED' | 'LOWERED' | 'WITHDRAWN';
  guidanceSummary: string;
  estimateRevisionsPast30d: {
    upward: number;
    downward: number;
  };
}

export interface AnalystConsensus {
  rating: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  targetPriceMean: number;
  targetPriceCurrent: number;
  targetPriceHigh: number;
  targetPriceLow: number;
  upsidePotentialPct: number;
  totalAnalysts: number;
  recentUpgradesCount30d: number;
  recentDowngradesCount30d: number;
  consensusTrend: 'IMPROVING' | 'STABLE' | 'DETERIORATING';
}

export interface CompetitorTrend {
  ticker: string;
  name: string;
  change24h: number;
  quarterlyHealth: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  keyNote: string;
}

export interface MacroFactor {
  name: string;
  value: string;
  impact: 'FAVORABLE' | 'NEUTRAL' | 'HEADWIND';
  note: string;
}

export interface SectorMacroContext {
  sectorName: string;
  industry: string;
  sectorHealth: 'STRONG' | 'NEUTRAL' | 'WEAK';
  sectorMomentumScore: number;      // 0-100
  sectorTrendDescription: string;
  keyCompetitors: CompetitorTrend[];
  macroFactors: MacroFactor[];
}

export interface UpcomingCatalyst {
  id: string;
  title: string;
  dateStr: string;
  hoursUntilEvent: number;          // e.g. 18 hours until earnings
  category: 'EARNINGS' | 'FOMC_CENTRAL_BANK' | 'DIVIDEND' | 'MACRO_CPI' | 'REGULATORY' | 'PRODUCT_EVENT';
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  expectedVolatilityImpact: 'HIGH_GAP_RISK' | 'MODERATE_SWING' | 'LOW_IMPACT';
  description: string;
}

export type MarketRegimeStatus = 'STABLE' | 'WATCH' | 'TRANSITION' | 'HIGH_RISK';
export type DataQualityTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface MarketIntelligenceReport {
  ticker: string;
  instrumentId: string;
  instrumentName: string;
  currentPrice: number;
  timeframe: Timeframe;
  lastUpdated: string;
  dataQuality: DataQualityTier;
  dataQualityNote: string;

  // Granular Sub-Scores (0 - 100)
  newsScore: number;                // Corporate news weighted by novelty, impact, sources
  fundamentalScore: number;         // Financials, margins, guidance revisions
  sectorScore: number;              // Sector strength, competitor trajectory, rotation
  macroScore: number;               // Interest rates, liquidity, inflation
  
  // Composite Market Intelligence Score (0 - 100)
  compositeIntelligenceScore: number;
  
  // Event Risk Score (0 - 100, independent of direction)
  eventRiskScore: number;
  eventRiskBreakdown: {
    hoursToNextCatalyst: number | null;
    imminentEarnings: boolean;
    imminentCentralBank: boolean;
    macroAnnouncementClose: boolean;
    headlineRiskSummary: string;
  };

  // Regime Change Detection
  regimeStatus: MarketRegimeStatus;
  regimeReasoning: string;
  regimeWarningFlags: string[];

  // Detailed Structured Data
  deduplicatedEvents: DeduplicatedEvent[];
  financials: CorporateFinancials;
  analystConsensus: AnalystConsensus;
  sectorContext: SectorMacroContext;
  upcomingCatalysts: UpcomingCatalyst[];
}

// LEVEL 3: AI SYNTHESIS TYPES
export type SynthesisVerdict = 'CONFLUENCE' | 'CONFLICT' | 'WAIT' | 'HIGH_RISK';
export type ActionAdvice = 'PROCEED' | 'REDUCE_SIZE' | 'HOLD_OFF' | 'AVOID';

export interface AiSynthesisReport {
  ticker: string;
  timeframe: Timeframe;
  verdict: SynthesisVerdict;
  actionAdvice: ActionAdvice;
  aiConfidenceScore: number;        // 0 - 100 non-linear score
  summaryReasoning: string;         // 5 to 8 structured lines
  whyFavorableOrCautious: string[]; // Bulleted factual reasons
  
  // Cross-Engine Comparison
  quantitative: {
    signal: 'LONG' | 'SHORT' | 'FLAT';
    score: number;                  // 0 - 100
    strategyName: string;
    totalReturnPct: number;
    profitFactor: number;
    maxDrawdownPct: number;
    robustnessScore: number;
    timeframe: Timeframe;
  };

  marketIntelligence: {
    direction: 'LONG' | 'SHORT' | 'NEUTRAL';
    score: number;                  // 0 - 100
    eventRiskScore: number;         // 0 - 100
    regimeStatus: MarketRegimeStatus;
    dataQuality: DataQualityTier;
  };

  timeframeRelevance: {
    appliedTimeframe: Timeframe;
    horizonDescription: string;
    weightAdjustmentNote: string;
  };

  // Strict Anti-Data-Leakage Isolation Confirmation
  dataLeakageIsolation: {
    backtestIsPureHistorical: true;
    liveIntelligenceAppliedExclusivelyToForwardDecisions: true;
    timestamp: string;
  };
}
