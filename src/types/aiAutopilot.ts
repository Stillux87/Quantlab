/**
 * QuantLab - Autonomous AI Portfolio Manager & Real-Time Market Intelligence Types
 */

export interface AiWebSource {
  title: string;
  uri: string;
}

export interface AiTickerHighlight {
  ticker: string;
  bias: 'RIALZISTA' | 'NEUTRALE' | 'CAUTELA';
  headline: string;
}

export interface AiMarketBriefing {
  id: string;
  timestamp: number;
  dateStr: string;
  marketMood: 'FAVOREVOLE' | 'SELETTIVO' | 'CAUTO';
  headline: string;
  summaryIt: string;
  macroDrivers: string[];
  tickerHighlights: AiTickerHighlight[];
  sources: AiWebSource[];
  eurUsdRate: number;
  verifiedTickersCount: number;
  poweredByWebSearch: boolean;
}

export type AiDecisionAction =
  | 'OPEN_LONG'
  | 'CLOSE_PROFIT'
  | 'CLOSE_RISK'
  | 'TIGHTEN_STOP'
  | 'HOLD'
  | 'SKIP';

export interface AiDecisionRecord {
  id: string;
  cycleId: string;
  timestamp: number;
  dateStr: string;
  ticker: string;
  name: string;
  action: AiDecisionAction;
  executed: boolean;
  verifiedPrice: number;
  currency: string;
  currencySymbol: string;
  stopLoss?: number;
  takeProfit?: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  confidence: 'ALTA' | 'MEDIA' | 'BASSA';
  chartSignals: string;
  webCatalyst: string;
  motivationIt: string;
  executionNote?: string;
}

export interface AiLiveTickerSnapshot {
  ticker: string;
  name: string;
  market: string;
  sector: string;
  type: 'STOCK' | 'ETF';
  price: number;
  previousClose: number;
  change24h: number;
  currency: string;
  currencySymbol: string;
  fxRateToEur: number;
  exchange: string;
  marketState: string;
  isLiveVerified: boolean;
  rsi14: number;
  ema9: number;
  ema20: number;
  ema50: number;
  atrPct: number;
  momentum6hPct: number;
  trendBias: 'RIALZISTA' | 'LATERALE' | 'DEBOLE';
  suggestedStopLossPct: number;
  suggestedTakeProfitPct: number;
  suggestedStopLossPrice: number;
  suggestedTakeProfitPrice: number;
  lastUpdated: string;
}

export interface AiAutopilotConfig {
  autoEnabled: boolean;
  intervalMinutes: number;
  maxOpenPositions: number;
  maxStopLossPct: number;
  defaultTakeProfitPct: number;
  riskPerTradePct: number;
  breakEvenTriggerPct: number;
}

export interface AiAutopilotState {
  config: AiAutopilotConfig;
  isRunning: boolean;
  lastRunAt: number | null;
  lastBriefingAt: number | null;
  eurUsdRate: number;
  briefings: AiMarketBriefing[];
  decisions: AiDecisionRecord[];
  marketSnapshot: AiLiveTickerSnapshot[];
}
