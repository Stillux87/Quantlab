/**
 * QuantLab - Type Definitions
 * Complete Quantitative Trading, Backtesting, and Paper Trading Data Structures
 */

export type InstrumentType = 'ETF' | 'STOCK' | 'FUTURE' | 'COMMODITY' | 'FOREX';

export interface Instrument {
  id: string;
  ticker: string;
  isin: string;
  name: string;
  type: InstrumentType;
  market: string;
  exchangeCode: string;
  currency: string;
  currencySymbol: string;
  currentPrice: number;
  change24h: number;
  change24hAmount: number;
  volume24h: number;
  previousClose?: number;
  sector: string;
  description: string;
  // Derivatives, Commodities & Futures specific contract specifications (Unger Method)
  multiplier?: number;
  contractUnit?: string;
  tickSize?: number;
  tickValue?: number;
  marginRequiredEur?: number;
  dataRange: {
    startDate: string;
    endDate: string;
    totalBarsDaily: number;
  };
  dataQuality: {
    score: number; // 0 - 100
    missingBarsPct: number;
    duplicateBarsCount: number;
    volumeCompletenessPct: number;
    priceAnomalyCount: number;
    status: 'EXCELLENT' | 'GOOD' | 'INSUFFICIENT';
  };
}

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '2h' | '4h' | '1D';

export interface TimeframeInfo {
  timeframe: Timeframe;
  label: string;
  minutes: number;
  supported: boolean;
  barCountApprox: number;
  noiseLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  stabilityScore: number; // 0 - 100
  recommended: boolean;
  recommendationReason?: string;
}

export interface Bar {
  timestamp: number;
  dateStr: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorValues {
  emaFast?: number;
  emaSlow?: number;
  smaFast?: number;
  smaSlow?: number;
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  bbWidth?: number;
  atr?: number;
  superTrend?: number;
  superTrendDirection?: 1 | -1;
  vwap?: number;
  stochK?: number;
  stochD?: number;
  volumeSma?: number;
}

export type TradeDirection = 'LONG' | 'SHORT';
export type SignalAction = 'BUY' | 'SELL' | 'EXIT_LONG' | 'EXIT_SHORT' | 'HOLD';

export interface StrategySignal {
  action: SignalAction;
  price: number;
  timestamp: number;
  reason: string;
  stopLoss?: number;
  takeProfit?: number;
  indicatorSnapshot?: Record<string, number | string>;
  orderType?: 'MARKET' | 'STOP' | 'LIMIT';
  targetFillPrice?: number;
}

export type StrategyCategory =
  | 'TREND_FOLLOWING'
  | 'MEAN_REVERSION'
  | 'MOMENTUM'
  | 'VOLATILITY_BREAKOUT'
  | 'MULTI_INDICATOR'
  | 'VOLUME_FLOW'
  | 'UNGER_TITAN'
  | 'MULTI_STRATEGY';

export type UngerCoreTriggerType =
  | 'DONCHIAN_BREAKOUT'
  | 'BOLLINGER_REVERSAL'
  | 'PRIOR_DAY_BREAKOUT'
  | 'SUPER_TREND'
  | 'EMA_CROSSOVER'
  | 'DAY_OF_WEEK_BIAS'
  | 'RSI_EXTREME';

export interface UngerFilterConfig {
  // Trend / Regime Filter
  trendFilterEnabled: boolean;
  trendFilterPeriod: number; // e.g. 200 SMA
  trendFilterMode: 'ABOVE_SMA' | 'BELOW_SMA' | 'SMA_SLOPE_UP' | 'ADX_ABOVE_25';

  // Volatility Regime Filter
  volatilityFilterEnabled: boolean;
  volatilityFilterMode: 'EXPANSION' | 'COMPRESSION'; // ATR > SMA(ATR) or ATR < SMA(ATR)
  atrPeriod: number;
  atrSmaPeriod: number;

  // Time & Session Window Filter
  timeWindowFilterEnabled: boolean;
  sessionStartHour: number; // e.g. 9
  sessionStartMinute: number; // e.g. 0
  sessionEndHour: number; // e.g. 17
  sessionEndMinute: number; // e.g. 30

  // Day of Week Filter
  dayOfWeekFilterEnabled: boolean;
  allowedDays: number[]; // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri

  // Pre-Condition Candlestick Pattern Filter
  patternFilterEnabled: boolean;
  consecutiveBarsCount: number; // e.g. 2
  consecutiveBarsDirection: 'BEARISH' | 'BULLISH';
}

export interface UngerExitConfig {
  stopLossType: 'MONETARY_PCT' | 'ATR_MULTIPLE';
  stopLossValue: number; // e.g. 2.0% or 2.0x ATR
  takeProfitType: 'MONETARY_PCT' | 'ATR_MULTIPLE';
  takeProfitValue: number; // e.g. 4.5% or 3.5x ATR
  trailingStopPct: number; // 0 = disabled, or e.g. 1.5%
  timeExitBars: number; // 0 = disabled, or e.g. 8 bars
  intradayExitEod: boolean; // close before session end
}

export interface TitanStrategyConfig {
  triggerType: UngerCoreTriggerType;
  triggerParams: Record<string, number | boolean | string>;
  filters: UngerFilterConfig;
  exits: UngerExitConfig;
}

export interface TitanRobustnessReport {
  titanScore: number; // 0 - 100
  oosEfficiencyPct: number;
  averageTradeAmount: number;
  averageTradePct: number;
  profitFactor: number;
  recoveryFactor: number; // Net Profit / Max Drawdown
  walkForwardEfficiencyPct: number;
  monteCarloMaxDrawdown95Pct: number;
  overfittingVerdict: 'ROBUST_EXCELLENT' | 'ROBUST_ACCEPTABLE' | 'MODERATE_OVERFIT' | 'SEVERE_OVERFIT';
  verdictExplanation: string;
  checklist: {
    rule: string;
    passed: boolean;
    valueStr: string;
    thresholdStr: string;
    importance: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  }[];
}

export interface StrategyParamDef {
  id: string;
  name: string;
  description: string;
  type: 'number' | 'boolean' | 'select';
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string | number }[];
}

export interface StrategyDefinition {
  id: string;
  name: string;
  category: StrategyCategory;
  description: string;
  rationale: string;
  defaultParams: Record<string, number | boolean | string>;
  paramDefinitions: StrategyParamDef[];
  recommendedTimeframes: Timeframe[];
  supportsShorting: boolean;
}

export interface Trade {
  id: string;
  tradeNumber: number;
  symbol: string;
  timeframe: Timeframe;
  direction: TradeDirection;
  entryTimestamp: number;
  entryDateStr: string;
  entryPrice: number;
  exitTimestamp: number;
  exitDateStr: string;
  exitPrice: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  pnlAmount: number;
  pnlPercent: number;
  durationMinutes: number;
  entryReason: string;
  exitReason: 'TAKE_PROFIT' | 'STOP_LOSS' | 'SIGNAL_REVERSAL' | 'TRAILING_STOP' | 'TIME_LIMIT' | 'MANUAL';
  splitType: 'TRAIN' | 'VAL' | 'OOS';
  commission: number;
  slippage: number;
}

export interface EquityPoint {
  timestamp: number;
  dateStr: string;
  equity: number;
  drawdownPct: number;
  splitType: 'TRAIN' | 'VAL' | 'OOS';
  benchmarkEquity: number;
  price: number;
  equityPct?: number;
  benchmarkEquityPct?: number;
  // Titan Equity Curve Trading metrics
  titanEctEquity?: number;
  titanEctEquityPct?: number;
  titanEctSma?: number;
  titanEctActive?: boolean;
}

export interface TitanEctSummary {
  enabled: boolean;
  rawReturnPct: number;
  titanReturnPct: number;
  rawMaxDrawdownPct: number;
  titanMaxDrawdownPct: number;
  drawdownReductionPct: number;
  rawProfitFactor: number;
  titanProfitFactor: number;
  rawSharpeRatio: number;
  titanSharpeRatio: number;
  tradesAvoidedCount: number;
  activeTradeRatioPct: number;
  ectWindowTrades?: number;
}

export interface BacktestMetrics {
  totalReturnPct: number;
  totalPnlAmount: number;
  cagrPct: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number;
  profitFactor: number;
  avgWinPct: number;
  avgLossPct: number;
  riskRewardRatio: number;
  maxDrawdownPct: number;
  maxDrawdownDurationDays: number;
  avgDurationMinutes: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  oosReturnPct: number;
  trainReturnPct: number;
  valReturnPct: number;
  oosDegradationPenalty: number;
  overfittingRisk: 'LOW' | 'MODERATE' | 'HIGH';
  score: number; // 0 - 100
  confidenceScore: number; // 0 - 100
  confidenceLevel: 'ALTA' | 'MEDIA' | 'BASSA';
  marketRegimeConsistency: number; // 0 - 100
  marketExposurePct?: number; // % of time invested in market
  // Extended performance & statistical metrics
  avgTradeAmount?: number;
  avgTradePct?: number;
  expectancy?: number;
  expectancyPct?: number;
  returnToDrawdownRatio?: number;
  volatilityPct?: number;
  maxConsecutiveWins?: number;
  maxConsecutiveLosses?: number;
  // Robustness & Stress-Testing Enhancements (100% backward compatible)
  parameterStabilityScore?: number;        // 0 - 100 (plateau vs fragile isolated spike)
  monteCarloMaxDrawdown95Pct?: number;     // 95th percentile worst drawdown
  monteCarloWorstCaseReturn5Pct?: number;  // 5th percentile worst return
  monteCarloRuinProbabilityPct?: number;   // % runs with drawdown > 35%
  slippageSensitivityScore?: number;       // 0 - 100 (resilience under 2x friction)
  dataSnoopingPenalty?: number;            // penalty for multiple trials
  robustnessScore?: number;                // Multi-factor Robustness Score (0 - 100)
  isRejectedOverfitted?: boolean;          // true if flagged as overfitted
  rejectionReason?: string;                // why it was discarded
  strategyFamily?: 'UNGER' | 'TRADITIONAL_INDICATOR';
}

export interface BenchmarkMetrics {
  totalReturnPct: number;
  finalCapital: number;
  maxDrawdownPct: number;
  cagrPct: number;
  startPrice: number;
  endPrice: number;
}

export interface PeriodDates {
  trainStart: string;
  trainEnd: string;
  valStart: string;
  valEnd: string;
  oosStart: string;
  oosEnd: string;
}

export interface BacktestResult {
  id?: string; // Stable unique identifier for this backtest run (e.g. bt_strategy_symbol_timeframe_timestamp)
  strategyId: string;
  strategyName: string;
  strategyCategory: StrategyCategory;
  instrument: Instrument;
  timeframe: Timeframe;
  params: Record<string, number | boolean | string>;
  startDate: string;
  endDate: string;
  totalBars: number;
  metrics: BacktestMetrics;
  trainMetrics: Partial<BacktestMetrics>;
  valMetrics: Partial<BacktestMetrics>;
  oosMetrics: Partial<BacktestMetrics>;
  benchmarkMetrics?: BenchmarkMetrics;
  periodDates?: PeriodDates;
  trades: Trade[];
  equityCurve: EquityPoint[];
  indicators: {
    name: string;
    data: (number | undefined)[];
    color: string;
    overlayOnPrice: boolean;
  }[];
  scoreBreakdown: {
    oosComponent: number;
    profitFactorComponent: number;
    drawdownComponent: number;
    winRateComponent: number;
    sharpeComponent: number;
    overfittingPenalty: number;
    total: number;
  };
  titanEct?: TitanEctSummary;
  entryDistribution?: EntryIntervalStats;
}

export type InactivityStatus = 'NORMAL' | 'ELEVATED_WAIT' | 'UNUSUAL' | 'ANOMALOUS';

export interface EntryIntervalStats {
  totalTrades: number;
  tradesPerYear: number;
  tradesPerMonth: number;
  avgDaysPerTrade: number;
  avgDaysBetweenEntries: number;
  medianDaysBetweenEntries: number;
  stdDevDaysBetweenEntries: number;
  minDaysBetweenEntries: number;
  maxDaysBetweenEntries: number;
  percentile75: number;
  percentile90: number;
  percentile95: number;
  maxHistoricPause: number;
  yearlyDistribution: { year: number | string; count: number; label: string }[];
  rawIntervalsDays: number[];
}

export interface InactivityAnalysis {
  status: InactivityStatus;
  statusLabel: string;
  statusBadgeColor: string;
  statusIcon: string;
  daysSinceLastEntry: number;
  lastEntryDateStr: string;
  syntheticDiagnosticPhrase: string;
  detailedDiagnosticMessage: string;
  percentileAchieved: number;
  isAboveHistoricMax: boolean;
  pauseRatioToMedian: number;
  summaryPhrasePause90: string;
}

export interface Position {
  id: string;
  strategyId: string;
  symbol: string;
  direction: TradeDirection;
  entryTimestamp: number;
  entryDateStr: string;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  stopLoss: number;
  takeProfit: number;
  trailingStop?: number;
  unrealizedPnlAmount: number;
  unrealizedPnlPercent: number;
  durationMinutes: number;
  entryReason: string;
  highestPriceSinceEntry: number;
  lowestPriceSinceEntry: number;
}

export interface PaperLogEvent {
  id: string;
  timestamp: number;
  timeStr: string;
  strategyId: string;
  level: 'INFO' | 'SIGNAL' | 'ORDER' | 'ALERT' | 'ERROR';
  category: 'DATA' | 'ENGINE' | 'RISK' | 'EXECUTION';
  message: string;
  details?: Record<string, any>;
}

export interface AlertNotification {
  id: string;
  timestamp: number;
  timeStr: string;
  type: 'ORDER_OPENED' | 'ORDER_CLOSED' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'DATA_GAP' | 'SYSTEM';
  title: string;
  message: string;
  read: boolean;
  symbol: string;
  strategyName: string;
}

export interface PortfolioConstituent {
  instrument: Instrument;
  ticker?: string;
  name?: string;
  strategyId: string;
  strategyName: string;
  timeframe: Timeframe;
  params: Record<string, number | boolean | string>;
  allocatedCapital: number;
  currentCapital: number;
  weightPct: number;
  openPositions: Position[];
  closedTrades: Trade[];
  unrealizedPnl: number;
  realizedPnl: number;
  expectedOosReturnPct?: number;
  expectedMaxDrawdownPct?: number;
  profitFactor?: number;
  lastPrice?: number;
  lastEvaluatedBarTimestamp?: number;
  startedAt?: number;
  regimeFilter?: {
    enabled: boolean;
    smaPeriod: number;
    atrPeriod: number;
    lastSma200?: number;
    lastAtr14?: number;
    currentRegime?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    statusText?: string;
  };
}

export interface PaperTradingSession {
  id: string;
  strategyId: string;
  strategyName: string;
  strategyCategory: StrategyCategory;
  instrument: Instrument;
  timeframe: Timeframe;
  params: Record<string, number | boolean | string>;
  createdAt: number;
  startedAt: number;
  isActive: boolean;
  isPaused: boolean;
  initialCapital: number;
  currentCapital: number;
  riskPerTradePct: number;
  commissionPct: number;
  slippagePct: number;
  openPositions: Position[];
  closedTrades: Trade[];
  logs: PaperLogEvent[];
  alerts: AlertNotification[];
  equityHistory: { timestamp: number; equity: number; price: number }[];
  lastBarProcessed?: Bar;
  lastEvaluatedBarTimestamp?: number;
  marketStatusNotice?: string;
  backtestId?: string; // Stable direct relation to original BacktestResult (Requirement 3)
  backtestReference?: {
    backtestId?: string;
    metrics: BacktestMetrics;
    score: number;
    entryDistribution?: EntryIntervalStats;
    startDate?: string;
    endDate?: string;
  };
  entryDistribution?: EntryIntervalStats;
  isPortfolio?: boolean;
  portfolioName?: string;
  portfolioAllocation?: UngerPortfolioAllocation;
  constituents?: PortfolioConstituent[];
  isConsolidated?: boolean;
  consolidatedIntoSessionId?: string;
  regimeFilter?: {
    enabled: boolean;
    smaPeriod: number;
    atrPeriod: number;
    lastSma200?: number;
    lastAtr14?: number;
    currentRegime?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    statusText?: string;
  };
}

export interface BacktestVsPaperComparison {
  sessionId: string;
  strategyName: string;
  symbol: string;
  timeframe: Timeframe;
  liveTradesCount: number;
  minTradesForSignificance: number;
  isStatisticallySignificant: boolean;
  backtest: {
    totalReturnPct: number;
    winRatePct: number;
    profitFactor: number;
    maxDrawdownPct: number;
    avgTradeReturnPct: number;
  };
  paperTrading: {
    totalReturnPct: number;
    winRatePct: number;
    profitFactor: number;
    maxDrawdownPct: number;
    avgTradeReturnPct: number;
  };
  deltas: {
    returnDelta: number;
    winRateDelta: number;
    profitFactorDelta: number;
    drawdownDelta: number;
  };
  replicationScore: number; // 0 - 100
  verdict: 'EXCELLENT_REPLICATION' | 'ACCEPTABLE_DECAY' | 'SIGNIFICANT_DRIFT' | 'REGIME_FAILURE';
  verdictText: string;
}

export interface AiMarketRecommendation {
  instrument: Instrument;
  bestStrategyId: string;
  bestStrategyName: string;
  robustnessScore: number; // 0 - 100
  averageTradePct: number;
  averageTradeAmount: number;
  totalReturnPct: number;
  oosReturnPct: number;
  winRatePct: number;
  maxDrawdownPct: number;
  profitFactor: number;
  sharpeRatio: number;
  assetClass: string;
  ungerSuitability: 'EXCELLENT' | 'VERY_HIGH' | 'GOOD' | 'MODERATE';
  volatilityRegime: 'ESPANSIONE_ALTA' | 'STABILE_TRENDING' | 'DIFENSIVO_RIFUGIO' | 'LATERALE';
  aiRationale: string;
  recommendedTimeframe: Timeframe;
  backtestResult?: BacktestResult;
  historicalBars?: Bar[];
}

export interface UngerPortfolioAssetAllocation {
  instrument: Instrument;
  strategyId: string;
  strategyName: string;
  allocatedCapital: number;
  weightPct: number;
  riskContributionPct: number;
  atrVolatilityPct: number;
  suggestedPositionSizeShares: number;
  sharePriceEur: number;
  originalPrice?: number;
  originalCurrency?: string;
  originalCurrencySymbol?: string;
  fxRateUsed?: number;
  maxRiskPerTradeEur: number;
  maxRiskPerTradePct: number;
  stopLossDistancePct: number;
  expectedOosReturnPct: number;
  expectedMaxDrawdownPct: number;
  profitFactor: number;
  timeframe: Timeframe;
}

export interface UngerPortfolioAllocation {
  targetCapital: number;
  riskProfile: 'CONSERVATIVO' | 'BILANCIATO' | 'AGGRESSIVO';
  assets: UngerPortfolioAssetAllocation[];
  combinedMetrics: {
    totalCapital: number;
    blendedAnnualReturnPct: number;
    blendedSharpeRatio: number;
    blendedMaxDrawdownPct: number;
    decorrelationScore: number; // 0 - 100
    monteCarloWorstDrawdown95Pct: number;
    annualCashflowEstimated: number;
    maxSingleAssetRiskEur: number;
    totalActiveStrategiesCount: number;
    assetClassSpread: Record<string, number>;
  };
  blendedEquityCurve: {
    dateStr: string;
    timestamp: number;
    portfolioEquity: number;
    drawdownPct: number;
    benchmarkEquity: number;
  }[];
  aiExecutiveSummary: string;
  aiRiskAlerts: string[];
}

/**
 * Unger Method: Periodic / Monthly Strategy Health & Decay Audit Types
 */
export type StrategyHealthStatus = 'HEALTHY' | 'WARNING' | 'DEGRADED';
export type UngerRecommendedAction = 'MAINTAIN_100' | 'REDUCE_SIZE_50' | 'STOP_SYSTEM';

export interface StrategyMonthlyHealthAudit {
  strategyId: string;
  strategyName: string;
  instrumentTicker: string;
  instrumentName: string;
  instrument?: Instrument;
  timeframe?: Timeframe;
  auditDate: string;
  auditDateStr?: string;
  overallStatus: StrategyHealthStatus;
  recommendedAction: UngerRecommendedAction;
  recentAvgTradePct: number;
  historicalAvgTradePct: number;
  avgTradeDeltaPct: number;
  avgTradeStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  avgTradeMessage: string;
  currentDrawdownPct: number;
  historicalMaxDrawdownPct: number;
  maxHistoricalDrawdownPct?: number;
  drawdownStatus: 'HEALTHY' | 'WARNING' | 'BREACHED_HISTORICAL';
  drawdownMessage: string;
  recentProfitFactor: number;
  historicalProfitFactor: number;
  winRatePct: number;
  tradesEvaluated: number;
  regimeAlignment: 'ALIGNED' | 'MISALIGNED';
  regimeMessage: string;
  ungerPrescription: string;
  suggestedAlternative?: {
    strategyId: string;
    strategyName: string;
    reason: string;
    instrumentTicker?: string;
    instrumentName?: string;
    robustnessScore?: number;
  };
}

export interface UngerMonthlyAuditSummary {
  auditDate: string;
  auditDateStr?: string;
  totalStrategiesAudited: number;
  totalActiveStrategies?: number;
  healthyCount: number;
  warningCount: number;
  degradedCount: number;
  audits: StrategyMonthlyHealthAudit[];
  nextScheduledAuditDate: string;
  nextScheduledAuditDateStr?: string;
  portfolioRiskAction: string;
  globalActionSummary?: string;
  portfolioHealthIndex?: number;
}

// ---------------------------------------------------------------------------
// Best Strategy Optimizer & Robustness Comparison Matrix Types
// ---------------------------------------------------------------------------

export type OptimizationObjective =
  | 'MAX_PROFIT'          // Massimo risultato / rendimento netto assoluto
  | 'MAX_PROFIT_FACTOR'   // Miglior rapporto vincite/perdite
  | 'MAX_SHARPE'          // Miglior rendimento corretto per la volatilità
  | 'BALANCED_ROBUST';    // Equilibrio rendimento/drawdown con trade significativi

export interface StrategyQualificationSummary {
  totalTested: number;
  totalQualified: number;
  bestReturnPct: number;
  bestProfitFactor: number;
  bestTrades: number;
  primaryDisqualificationReason: string;
  diagnosticConclusion: string;
  bestDiagnosticCandidate?: OptimizedStrategyCandidate | null;
}

export interface OptimizedStrategyCandidate {
  strategyId: string;
  strategyName: string;
  strategyFamily?: 'UNGER' | 'TRADITIONAL_INDICATOR';
  params: Record<string, number | boolean | string>;
  metrics: BacktestMetrics;
  fullResult: BacktestResult;
  candidateRank: number;
  isQualified: boolean;
  disqualificationReasons?: string[];
  primaryDisqualificationReason?: string;
  isMaxProfitWinner: boolean;
  isRobustWinner: boolean;
  isOverallWinner?: boolean;
  isUngerWinner?: boolean;
  isIndicatorWinner?: boolean;
  isRejectedOverfitted?: boolean;
  rejectionReason?: string;
  explanation: string;
  robustnessScore?: number;
  parameterStabilityScore?: number;
  monteCarloMaxDrawdown95Pct?: number;
  monteCarloRuinProbabilityPct?: number;
  slippageSensitivityScore?: number;
  sampleSizeStatus?: 'SUFFICIENT' | 'BORDERLINE' | 'INSUFFICIENT';
  isDisqualifiedForLowTrades?: boolean;
}

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
  qualificationSummary?: StrategyQualificationSummary;
  // Le Tre Famiglie Distinte di Strategie (Migliore Assoluta, Unger, Indicatori Tradizionali)
  bestOverallWinner: OptimizedStrategyCandidate | null;      // A. Strategia "Migliore" Assoluta (null se nessuna qualificata)
  bestUngerWinner: OptimizedStrategyCandidate | null;        // B. Migliore Filosofia Unger (null se nessuna qualificata)
  bestIndicatorWinner: OptimizedStrategyCandidate | null;    // C. Migliore Indicatori Tradizionali (null se nessuna qualificata)
  // Mantenute per retrocompatibilità:
  maxProfitWinner: OptimizedStrategyCandidate | null;        // Più redditizia tra le qualificate (null se nessuna qualificata)
  robustWinner: OptimizedStrategyCandidate | null;           // Più robusta tra le qualificate (null se nessuna qualificata)
  allCandidates: OptimizedStrategyCandidate[];
  rejectedCandidatesCount?: number;
  insights: string[];
}

export interface SavedStrategyPreset {
  id: string;
  name: string;
  description?: string;
  strategyId: string;
  strategyName: string;
  instrument: Instrument;
  timeframe: Timeframe;
  dateRange: {
    startDate: string;
    endDate: string;
    label?: string;
  };
  params: Record<string, number | boolean | string>;
  originalMetrics: {
    totalReturnPct: number;
    totalPnlAmount: number;
    profitFactor: number;
    winRatePct: number;
    maxDrawdownPct: number;
    sharpeRatio: number;
    totalTrades: number;
    score: number;
  };
  createdAt: string;
  tags?: string[];
  isPortfolio?: boolean;
  portfolioAllocation?: UngerPortfolioAllocation;
  portfolioConstituents?: PortfolioConstituent[];
}

export interface TimeframeComparisonRow {
  timeframe: Timeframe;
  label: string;
  totalReturnPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  winRatePct: number;
  totalTrades: number;
  isBaseline: boolean;
  isProfitable: boolean;
  status: 'STABLE' | 'DEGRADED' | 'FAILED';
}

export interface PeriodComparisonRow {
  periodKey: string;
  label: string;
  startDate: string;
  endDate: string;
  regimeType: 'BULL' | 'BEAR' | 'SIDEWAYS' | 'RECENT' | 'FULL_CYCLE';
  totalReturnPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  winRatePct: number;
  totalTrades: number;
  isCalibrationPeriod: boolean;
  isProfitable: boolean;
  status: 'OUTPERFORMING' | 'ACCEPTABLE' | 'DEGRADED' | 'FAILED';
}

export interface AssetComparisonRow {
  instrument: Instrument;
  assetClass: string;
  totalReturnPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  winRatePct: number;
  totalTrades: number;
  isBaseAsset: boolean;
  isProfitable: boolean;
  status: 'HIGHLY_PORTABLE' | 'MODERATE' | 'NOT_TRANSFERABLE';
}

export interface StrategyRobustnessAudit {
  strategyPreset: SavedStrategyPreset;
  timeframeRows: TimeframeComparisonRow[];
  periodRows: PeriodComparisonRow[];
  assetRows: AssetComparisonRow[];
  robustnessScore: number; // 0 - 100
  robustnessVerdict: 'EXCELLENT_ROBUST' | 'GOOD_GENERALIZATION' | 'MODERATE_RISK' | 'HIGH_OVERFITTING_RISK';
  summaryTitle: string;
  summaryDescription: string;
  passRatioTimeframes: number; // e.g. 0.8 (4 out of 5 profitable)
  passRatioPeriods: number;    // e.g. 0.85
  passRatioAssets: number;     // e.g. 0.6
  overfittingWarning?: string;
  actionRecommendation: 'READY_FOR_PAPER' | 'MONITOR_CLOSELY' | 'REJECT_OVERFITTED';
}

export interface PortfolioStrategyCandidate {
  strategyId: string;
  strategyName: string;
  category: 'INDICATORS' | 'TITAN_UNGER' | 'HYBRID_OPTIMAL';
  description: string;
  portfolioTotalReturnPct: number;
  portfolioAnnualReturnPct: number;
  portfolioProfitFactor: number;
  portfolioMaxDrawdownPct: number;
  portfolioSharpeRatio: number;
  portfolioWinRatePct: number;
  portfolioTotalTrades: number;
  decorrelationScore: number;
  isWinner: boolean;
  isRobustWinner: boolean;
  equityCurve: { dateStr: string; timestamp: number; portfolioEquity: number; benchmarkEquity: number; drawdownPct: number }[];
  constituentMetrics: {
    ticker: string;
    name: string;
    strategyName: string;
    allocatedCapital: number;
    weightPct: number;
    returnPct: number;
    profitFactor: number;
    tradesCount: number;
    winRatePct: number;
  }[];
}

export interface PortfolioPeriodEvaluation {
  periodKey: string;
  periodName: string;
  periodDates: string;
  marketRegime: string;
  regimeType: 'BULL' | 'BEAR' | 'SIDEWAYS' | 'RECENT' | 'VOLATILITY_SHOCK' | 'FULL_CYCLE';
  portfolioReturnPct: number;
  portfolioMaxDrawdownPct: number;
  portfolioProfitFactor: number;
  indicatorsReturnPct: number;
  indicatorsMaxDrawdownPct: number;
  indicatorsProfitFactor: number;
  ungerReturnPct: number;
  ungerMaxDrawdownPct: number;
  ungerProfitFactor: number;
  bestPerformer: 'UNGER' | 'INDICATORS' | 'TIE';
  alphaAdvantagePct: number;
  robustnessVerdict: 'EXCELLENT' | 'ROBUST' | 'DEFENSIVE' | 'SENSITIVE';
  verdictNote: string;
}

export interface PortfolioOptimizationReport {
  portfolioName: string;
  targetCapital: number;
  riskProfile: 'CONSERVATIVO' | 'BILANCIATO' | 'AGGRESSIVO';
  totalAssetsCount: number;
  assets: UngerPortfolioAssetAllocation[];
  bestStrategyCandidate: PortfolioStrategyCandidate;
  bestUngerCandidate: PortfolioStrategyCandidate;
  bestIndicatorCandidate: PortfolioStrategyCandidate;
  allCandidates: PortfolioStrategyCandidate[];
  periodEvaluations: PortfolioPeriodEvaluation[];
  aiExecutiveVerdict: string;
  comparativeInsights: string[];
}

export * from './marketIntelligence';
export * from './discovery';



