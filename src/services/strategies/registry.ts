/**
 * QuantLab - Strategy Registry
 * Central repository of all modular algorithmic strategies
 */
import { IStrategy } from './types';
import { aiDynamicSwingStrategy } from './aiDynamicSwingStrategy';
import { ungerTitanStrategy } from './ungerTitanStrategy';
import { emaTrendStrategy } from './emaCrossover';
import { rsiMeanReversionStrategy } from './rsiMeanReversion';
import { macdMomentumStrategy } from './macdMomentum';
import { bollingerBreakoutStrategy } from './bollingerBreakout';
import { superTrendStrategy } from './superTrendTrend';
import { donchianTurtleStrategy } from './donchianTurtle';
import { volumeVwapStrategy } from './volumeVwapReversal';
import { dualMomentumStrategy } from './dualMomentum';

export const ALL_STRATEGIES: IStrategy[] = [
  aiDynamicSwingStrategy,
  ungerTitanStrategy,
  emaTrendStrategy,
  rsiMeanReversionStrategy,
  macdMomentumStrategy,
  bollingerBreakoutStrategy,
  superTrendStrategy,
  donchianTurtleStrategy,
  volumeVwapStrategy,
  dualMomentumStrategy,
];

const DYNAMIC_STRATEGIES: Map<string, IStrategy> = new Map();

export function registerDynamicStrategy(strategy: IStrategy): void {
  DYNAMIC_STRATEGIES.set(strategy.definition.id, strategy);
}

export function getStrategyById(id: string): IStrategy | undefined {
  if (DYNAMIC_STRATEGIES.has(id)) {
    return DYNAMIC_STRATEGIES.get(id);
  }
  return ALL_STRATEGIES.find((s) => s.definition.id === id);
}

export function getDefaultStrategyParams(id: string): Record<string, number | boolean | string> {
  const strategy = getStrategyById(id);
  return strategy ? { ...strategy.definition.defaultParams } : {};
}
