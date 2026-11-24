/**
 * QuantLab - Strategy Engine Interfaces & Definitions
 */
import { Bar, StrategySignal, StrategyDefinition, Timeframe } from '../../types';

export interface IStrategy {
  definition: StrategyDefinition;
  
  /**
   * Evaluates historical or live bars up to barIndex (without look-ahead)
   * and produces a signal for the next bar open execution.
   */
  evaluate(
    bars: Bar[],
    barIndex: number,
    params: Record<string, number | boolean | string>,
    currentPosition: 'LONG' | 'SHORT' | 'NONE'
  ): StrategySignal;

  /**
   * Precomputes indicator series for efficient backtesting and chart display
   */
  computeIndicators(
    bars: Bar[],
    params: Record<string, number | boolean | string>
  ): {
    name: string;
    data: (number | undefined)[];
    color: string;
    overlayOnPrice: boolean;
  }[];
}

export type BaseStrategy = IStrategy;
