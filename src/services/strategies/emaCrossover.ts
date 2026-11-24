/**
 * Strategy 1: EMA Trend Following (Crossover + Trend Filter)
 */
import { IStrategy } from './types';
import { Bar, StrategySignal, StrategyDefinition } from '../../types';
import { calculateEMA, calculateSMA } from '../indicators';

export const emaTrendStrategy: IStrategy = {
  definition: {
    id: 'ema_trend',
    name: 'EMA Trend Following',
    category: 'TREND_FOLLOWING',
    description: 'Strategia trend following basata sull\'incrocio rialzista di una EMA veloce su una EMA lenta con filtro di trend di lungo periodo (SMA 200).',
    rationale: 'Cattura i grandi trend macroeconomici riducendo il rumore di breve termine e proteggendo il capitale con stop dinamici.',
    defaultParams: {
      fastEmaPeriod: 12,
      slowEmaPeriod: 26,
      trendFilterPeriod: 200,
      useTrendFilter: true,
      tradeDirection: 'BOTH',
      stopLossPct: 2.5,
      takeProfitPct: 6.0,
      trailingStopPct: 1.8,
    },
    paramDefinitions: [
      { id: 'tradeDirection', name: 'Direzione Operativa', description: 'Permette operazioni Long, Short o Entrambe (Long & Short)', type: 'select', default: 'BOTH', options: [{ label: 'Long & Short (Entrambi)', value: 'BOTH' }, { label: 'Solo Long (Rialzista)', value: 'LONG' }, { label: 'Solo Short (Ribassista)', value: 'SHORT' }] },
      { id: 'fastEmaPeriod', name: 'Periodo EMA Veloce', description: 'Periodo per la media mobile esponenziale reattiva', type: 'number', default: 12, min: 5, max: 50, step: 1 },
      { id: 'slowEmaPeriod', name: 'Periodo EMA Lenta', description: 'Periodo per la media mobile esponenziale lenta di base', type: 'number', default: 26, min: 20, max: 100, step: 1 },
      { id: 'trendFilterPeriod', name: 'Filtro Trend (SMA)', description: 'Periodo della SMA di lungo termine per autorizzare ingressi solo in trend primario', type: 'number', default: 200, min: 50, max: 250, step: 10 },
      { id: 'stopLossPct', name: 'Stop Loss (%)', description: 'Percentuale massima di perdita per operazione', type: 'number', default: 2.5, min: 0.5, max: 10, step: 0.1 },
      { id: 'takeProfitPct', name: 'Take Profit (%)', description: 'Obiettivo di profitto per operazione', type: 'number', default: 6.0, min: 1.0, max: 20, step: 0.5 },
      { id: 'trailingStopPct', name: 'Trailing Stop (%)', description: 'Stop dinamico che segue il prezzo al rialzo', type: 'number', default: 1.8, min: 0.5, max: 10, step: 0.1 },
    ],
    recommendedTimeframes: ['15m', '30m', '1h', '4h', '1D'],
    supportsShorting: true,
  },

  evaluate(bars: Bar[], barIndex: number, params: Record<string, number | boolean | string>, currentPosition: 'LONG' | 'SHORT' | 'NONE'): StrategySignal {
    if (barIndex < 2) {
      return { action: 'HOLD', price: bars[barIndex].close, timestamp: bars[barIndex].timestamp, reason: 'Dati iniziali insufficienti' };
    }

    const fastPeriod = Number(params.fastEmaPeriod || params.fastPeriod) || 12;
    const slowPeriod = Number(params.slowEmaPeriod || params.slowPeriod) || 26;
    const trendPeriod = Number(params.trendFilterPeriod || params.trendFilterEma) || 200;
    const useFilter = params.useTrendFilter !== false;
    const slPct = Number(params.stopLossPct) || 2.5;
    const tpPct = Number(params.takeProfitPct) || 6.0;
    const tradeDirection = (params.tradeDirection as string) || 'BOTH';
    const allowLong = tradeDirection !== 'SHORT';
    const allowShort = tradeDirection !== 'LONG';

    // Slice window up to barIndex for strictly zero look-ahead bias and O(1) performance
    const startIdx = Math.max(0, barIndex - 300);
    const closes = bars.slice(startIdx, barIndex + 1).map((b) => b.close);
    const fastEMA = calculateEMA(closes, fastPeriod);
    const slowEMA = calculateEMA(closes, slowPeriod);
    const trendSMA = calculateSMA(closes, trendPeriod);

    const currFast = fastEMA[fastEMA.length - 1];
    const prevFast = fastEMA[fastEMA.length - 2];
    const currSlow = slowEMA[slowEMA.length - 1];
    const prevSlow = slowEMA[slowEMA.length - 2];
    const currTrend = trendSMA[trendSMA.length - 1];
    const currPrice = closes[closes.length - 1];

    if (currFast === undefined || currSlow === undefined || prevFast === undefined || prevSlow === undefined) {
      return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'Indicatori in fase di calcolo' };
    }

    const isGoldenCross = prevFast <= prevSlow && currFast > currSlow;
    const isDeathCross = prevFast >= prevSlow && currFast < currSlow;
    const isAboveTrend = !useFilter || (currTrend !== undefined && currPrice > currTrend);
    const isBelowTrend = !useFilter || (currTrend !== undefined && currPrice < currTrend);

    // 1. Exits for open positions
    if (currentPosition === 'LONG' && isDeathCross) {
      return {
        action: 'EXIT_LONG',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        reason: `EMA ${fastPeriod} ha incrociato al ribasso EMA ${slowPeriod} (${currFast.toFixed(2)} < ${currSlow.toFixed(2)})`,
        indicatorSnapshot: {
          emaFast: currFast.toFixed(2),
          emaSlow: currSlow.toFixed(2),
        },
      };
    }

    if (currentPosition === 'SHORT' && isGoldenCross) {
      return {
        action: 'EXIT_SHORT',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        reason: `EMA ${fastPeriod} ha incrociato al rialzo EMA ${slowPeriod} (${currFast.toFixed(2)} > ${currSlow.toFixed(2)})`,
        indicatorSnapshot: {
          emaFast: currFast.toFixed(2),
          emaSlow: currSlow.toFixed(2),
        },
      };
    }

    // 2. Entries
    if (currentPosition === 'NONE' && isGoldenCross && isAboveTrend && allowLong) {
      const stopLoss = currPrice * (1 - slPct / 100);
      const takeProfit = currPrice * (1 + tpPct / 100);
      return {
        action: 'BUY',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `Incrocio rialzista EMA ${fastPeriod} (${currFast.toFixed(2)}) > EMA ${slowPeriod} (${currSlow.toFixed(2)}) con Prezzo > SMA ${trendPeriod}`,
        indicatorSnapshot: {
          emaFast: currFast.toFixed(2),
          emaSlow: currSlow.toFixed(2),
          trendSMA: currTrend ? currTrend.toFixed(2) : 'N/A',
        },
      };
    }

    if (currentPosition === 'NONE' && isDeathCross && isBelowTrend && allowShort) {
      const stopLoss = currPrice * (1 + slPct / 100);
      const takeProfit = currPrice * (1 - tpPct / 100);
      return {
        action: 'SELL',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `Incrocio ribassista EMA ${fastPeriod} (${currFast.toFixed(2)}) < EMA ${slowPeriod} (${currSlow.toFixed(2)}) con Prezzo < SMA ${trendPeriod}`,
        indicatorSnapshot: {
          emaFast: currFast.toFixed(2),
          emaSlow: currSlow.toFixed(2),
          trendSMA: currTrend ? currTrend.toFixed(2) : 'N/A',
        },
      };
    }

    return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'Nessun segnale attivo' };
  },

  computeIndicators(bars: Bar[], params: Record<string, number | boolean | string>) {
    const closes = bars.map((b) => b.close);
    const fastPeriod = Number(params.fastEmaPeriod) || 12;
    const slowPeriod = Number(params.slowEmaPeriod) || 26;
    const trendPeriod = Number(params.trendFilterPeriod) || 200;

    return [
      { name: `EMA ${fastPeriod}`, data: calculateEMA(closes, fastPeriod), color: '#38bdf8', overlayOnPrice: true },
      { name: `EMA ${slowPeriod}`, data: calculateEMA(closes, slowPeriod), color: '#f59e0b', overlayOnPrice: true },
      { name: `SMA ${trendPeriod}`, data: calculateSMA(closes, trendPeriod), color: '#a855f7', overlayOnPrice: true },
    ];
  },
};
