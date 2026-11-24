/**
 * Strategy 5: SuperTrend Multi-Period Trend Following
 */
import { IStrategy } from './types';
import { Bar, StrategySignal } from '../../types';
import { calculateSuperTrend, calculateRSI } from '../indicators';

export const superTrendStrategy: IStrategy = {
  definition: {
    id: 'supertrend_trend',
    name: 'SuperTrend + Multi-Indicator',
    category: 'MULTI_INDICATOR',
    description: 'Combina l\'algoritmo SuperTrend basato su ATR per l\'intercettazione del trend primario con il filtro di momentum RSI per evitare falsi segnali in congestione.',
    rationale: 'Filtra i falsi breakout richiedendo che il cambio di trend sia sostenuto da un momento relativo sano (RSI compreso tra 52 e 70).',
    defaultParams: {
      atrPeriod: 10,
      atrMultiplier: 3.0,
      rsiPeriod: 14,
      rsiMinThreshold: 52,
      tradeDirection: 'BOTH',
      stopLossPct: 2.8,
      takeProfitPct: 7.0,
    },
    paramDefinitions: [
      { id: 'tradeDirection', name: 'Direzione Operativa', description: 'Permette operazioni Long, Short o Entrambe (Long & Short)', type: 'select', default: 'BOTH', options: [{ label: 'Long & Short (Entrambi)', value: 'BOTH' }, { label: 'Solo Long (Rialzista)', value: 'LONG' }, { label: 'Solo Short (Ribassista)', value: 'SHORT' }] },
      { id: 'atrPeriod', name: 'Periodo ATR', description: 'Periodo di calcolo della volatilità ATR', type: 'number', default: 10, min: 5, max: 30, step: 1 },
      { id: 'atrMultiplier', name: 'Moltiplicatore ATR', description: 'Distanza del canale SuperTrend in unità di ATR', type: 'number', default: 3.0, min: 1.5, max: 5.0, step: 0.2 },
      { id: 'rsiPeriod', name: 'Periodo RSI Filtro', description: 'Periodo per la conferma di momentum', type: 'number', default: 14, min: 7, max: 28, step: 1 },
      { id: 'rsiMinThreshold', name: 'RSI Minimo Ingresso', description: 'Soglia minima di RSI richiesta per confermare la spinta rialzista', type: 'number', default: 52, min: 45, max: 60, step: 1 },
      { id: 'stopLossPct', name: 'Stop Loss (%)', description: 'Stop Loss di emergenza', type: 'number', default: 2.8, min: 0.5, max: 10, step: 0.1 },
      { id: 'takeProfitPct', name: 'Take Profit (%)', description: 'Take Profit primario', type: 'number', default: 7.0, min: 1.0, max: 20, step: 0.5 },
    ],
    recommendedTimeframes: ['15m', '30m', '1h', '4h', '1D'],
    supportsShorting: true,
  },

  evaluate(bars: Bar[], barIndex: number, params: Record<string, number | boolean | string>, currentPosition: 'LONG' | 'SHORT' | 'NONE'): StrategySignal {
    if (barIndex < 15) {
      return { action: 'HOLD', price: bars[barIndex].close, timestamp: bars[barIndex].timestamp, reason: 'Dati iniziali insufficienti' };
    }

    const atrP = Number(params.atrPeriod) || 10;
    const atrMult = Number(params.atrMultiplier || params.multiplier) || 3.0;
    const rsiP = Number(params.rsiPeriod) || 14;
    const rsiMin = Number(params.rsiMinThreshold) || 50;
    const slPct = Number(params.stopLossPct) || 2.8;
    const tpPct = Number(params.takeProfitPct) || 7.0;
    const tradeDirection = (params.tradeDirection as string) || 'BOTH';
    const allowLong = tradeDirection !== 'SHORT';
    const allowShort = tradeDirection !== 'LONG';

    const startIdx = Math.max(0, barIndex - 150);
    const subBars = bars.slice(startIdx, barIndex + 1);
    const closes = subBars.map((b) => b.close);
    const stRes = calculateSuperTrend(subBars, atrP, atrMult);
    const rsiSeries = calculateRSI(closes, rsiP);

    const currDir = stRes.direction[stRes.direction.length - 1];
    const prevDir = stRes.direction[stRes.direction.length - 2];
    const currST = stRes.superTrend[stRes.superTrend.length - 1];
    const currRsi = rsiSeries[rsiSeries.length - 1] || 50;
    const currPrice = closes[closes.length - 1];

    if (currDir === undefined || prevDir === undefined) {
      return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'Calcolo SuperTrend' };
    }

    // 1. Exits
    if (currentPosition === 'LONG' && currDir === -1) {
      return {
        action: 'EXIT_LONG',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        reason: `SuperTrend invertito al ribasso a quota ${currST ? currST.toFixed(2) : 'N/A'}`,
        indicatorSnapshot: { superTrend: currST ? currST.toFixed(2) : 'N/A', direction: 'BEARISH' },
      };
    }

    if (currentPosition === 'SHORT' && currDir === 1) {
      return {
        action: 'EXIT_SHORT',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        reason: `SuperTrend invertito al rialzo a quota ${currST ? currST.toFixed(2) : 'N/A'}`,
        indicatorSnapshot: { superTrend: currST ? currST.toFixed(2) : 'N/A', direction: 'BULLISH' },
      };
    }

    // 2. Entries
    const isBullishFlip = prevDir === -1 && currDir === 1;
    const isRsiConfirmed = currRsi >= rsiMin && currRsi < 75;

    if (currentPosition === 'NONE' && isBullishFlip && isRsiConfirmed && allowLong) {
      const stopLoss = currPrice * (1 - slPct / 100);
      const takeProfit = currPrice * (1 + tpPct / 100);
      return {
        action: 'BUY',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `Inversione rialzista SuperTrend (${currST ? currST.toFixed(2) : 'N/A'}) confermata da RSI (${currRsi.toFixed(1)})`,
        indicatorSnapshot: {
          superTrend: currST ? currST.toFixed(2) : 'N/A',
          rsi: currRsi.toFixed(1),
        },
      };
    }

    const isBearishFlip = prevDir === 1 && currDir === -1;
    const isRsiBearConfirmed = currRsi <= (100 - rsiMin + 6) && currRsi > 25;

    if (currentPosition === 'NONE' && isBearishFlip && isRsiBearConfirmed && allowShort) {
      const stopLoss = currPrice * (1 + slPct / 100);
      const takeProfit = currPrice * (1 - tpPct / 100);
      return {
        action: 'SELL',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `Inversione ribassista SuperTrend (${currST ? currST.toFixed(2) : 'N/A'}) confermata da RSI (${currRsi.toFixed(1)})`,
        indicatorSnapshot: {
          superTrend: currST ? currST.toFixed(2) : 'N/A',
          rsi: currRsi.toFixed(1),
        },
      };
    }

    return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'Nessun segnale' };
  },

  computeIndicators(bars: Bar[], params: Record<string, number | boolean | string>) {
    const atrP = Number(params.atrPeriod) || 10;
    const atrMult = Number(params.atrMultiplier) || 3.0;
    const stRes = calculateSuperTrend(bars, atrP, atrMult);

    return [
      { name: 'SuperTrend', data: stRes.superTrend, color: '#10b981', overlayOnPrice: true },
    ];
  },
};
