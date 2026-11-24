/**
 * QuantLab - Execution Interface Architecture (Step 25)
 * Standardized order routing and execution abstraction.
 * Ready to be implemented by PaperTradingEngine or FutureBrokerEngine.
 */
import { TradeDirection, Position, Trade, StrategySignal } from '../types';

export interface OrderRequest {
  sessionId: string;
  symbol: string;
  direction: TradeDirection;
  orderType: 'MARKET' | 'LIMIT' | 'STOP';
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  trailingStopPct?: number;
  reason: string;
  timestamp: number;
}

export interface OrderExecutionReport {
  orderId: string;
  status: 'FILLED' | 'REJECTED' | 'CANCELLED';
  symbol: string;
  filledPrice: number;
  filledQuantity: number;
  commission: number;
  slippage: number;
  timestamp: number;
  message?: string;
}

export interface IExecutionService {
  executeOrder(request: OrderRequest): Promise<OrderExecutionReport>;
  closePosition(positionId: string, currentPrice: number, reason: Trade['exitReason']): Promise<Trade>;
  getOpenPositions(sessionId?: string): Promise<Position[]>;
  getAccountBalance(): Promise<{ cash: number; equity: number; marginUsed: number }>;
}
