/**
 * Strategy 3: MACD Momentum & Signal Acceleration
 */
import { IStrategy } from './types';
import { Bar, StrategySignal } from '../../types';
import { calculateMACD, calculateEMA } from '../indicators';

export const macdMomentumStrategy: IStrategy = {
  definition: {
    id: 'macd_momentum',
    name: 'MACD Momentum Divergence',
    category: 'MOMENTUM',
    description: 'Sfrutta l\'accelerazione dell\'istogramma MACD e l\'incrocio della linea MACD sopra la Signal Line con filtro di pendenza positiva.',
    rationale: 'Rileva tempestivamente la transizione di fase da accumulazione a espansione di volatilità direzionale.',
    defaultParams: {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      requireZeroCross: false,
      tradeDirection: 'BOTH',
      stopLossPct: 2.0,
      takeProfitPct: 5.5,
    },
    paramDefinitions: [
      { id: 'tradeDirection', name: 'Direzione Operativa', description: 'Permette operazioni Long, Short o Entrambe (Long & Short)', type: 'select', default: 'BOTH', options: [{ label: 'Long & Short (Entrambi)', value: 'BOTH' }, { label: 'Solo Long (Rialzista)', value: 'LONG' }, { label: 'Solo Short (Ribassista)', value: 'SHORT' }] },
      { id: 'fastPeriod', name: 'Periodo Fast', description: 'Periodo EMA veloce MACD', type: 'number', default: 12, min: 5, max: 30, step: 1 },
      { id: 'slowPeriod', name: 'Periodo Slow', description: 'Periodo EMA lenta MACD', type: 'number', default: 26, min: 20, max: 60, step: 1 },
      { id: 'signalPeriod', name: 'Periodo Signal', description: 'Periodo di smoothing per la Signal Line', type: 'number', default: 9, min: 3, max: 20, step: 1 },
      { id: 'requireZeroCross', name: 'Filtro Solo Sopra/Sotto Zero', description: 'Richiede che la linea MACD sia concorde con la linea dello zero', type: 'boolean', default: false },
      { id: 'stopLossPct', name: 'Stop Loss (%)', description: 'Stop Loss in percentuale', type: 'number', default: 2.0, min: 0.5, max: 10, step: 0.1 },
      { id: 'takeProfitPct', name: 'Take Profit (%)', description: 'Take Profit in percentuale', type: 'number', default: 5.5, min: 1.0, max: 20, step: 0.2 },
    ],
    recommendedTimeframes: ['15m', '30m', '1h', '4h', '1D'],
    supportsShorting: true,
  },

  evaluate(bars: Bar[], barIndex: number, params: Record<string, number | boolean | string>, currentPosition: 'LONG' | 'SHORT' | 'NONE'): StrategySignal {
    if (barIndex < 2) {
      return { action: 'HOLD', price: bars[barIndex].close, timestamp: bars[barIndex].timestamp, reason: 'Dati iniziali insufficienti' };
    }

    const fastP = Number(params.fastPeriod) || 12;
    const slowP = Number(params.slowPeriod) || 26;
    const sigP = Number(params.signalPeriod) || 9;
    const reqZero = params.requireZeroCross === true;
    const slPct = Number(params.stopLossPct) || 2.0;
    const tpPct = Number(params.takeProfitPct) || 5.5;
    const tradeDirection = (params.tradeDirection as string) || 'BOTH';
    const allowLong = tradeDirection !== 'SHORT';
    const allowShort = tradeDirection !== 'LONG';

    const startIdx = Math.max(0, barIndex - 200);
    const closes = bars.slice(startIdx, barIndex + 1).map((b) => b.close);
    const macdRes = calculateMACD(closes, fastP, slowP, sigP);

    const currMacd = macdRes.macd[macdRes.macd.length - 1];
    const prevMacd = macdRes.macd[macdRes.macd.length - 2];
    const currSig = macdRes.signal[macdRes.signal.length - 1];
    const prevSig = macdRes.signal[macdRes.signal.length - 2];
    const currHist = macdRes.histogram[macdRes.histogram.length - 1];
    const currPrice = closes[closes.length - 1];

    if (currMacd === undefined || prevMacd === undefined || currSig === undefined || prevSig === undefined) {
      return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'Calcolo MACD in corso' };
    }

    const isCrossUp = prevMacd <= prevSig && currMacd > currSig;
    const isCrossDown = prevMacd >= prevSig && currMacd < currSig;
    const passesLongZeroFilter = !reqZero || currMacd > 0;
    const passesShortZeroFilter = !reqZero || currMacd < 0;

    // 1. Exits
    if (currentPosition === 'LONG' && isCrossDown) {
      return {
        action: 'EXIT_LONG',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        reason: `Incrocio ribassista MACD sotto Signal Line (${currMacd.toFixed(2)} < ${currSig.toFixed(2)})`,
        indicatorSnapshot: { macd: currMacd.toFixed(2), signal: currSig.toFixed(2) },
      };
    }

    if (currentPosition === 'SHORT' && isCrossUp) {
      return {
        action: 'EXIT_SHORT',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        reason: `Incrocio rialzista MACD sopra Signal Line (${currMacd.toFixed(2)} > ${currSig.toFixed(2)})`,
        indicatorSnapshot: { macd: currMacd.toFixed(2), signal: currSig.toFixed(2) },
      };
    }

    // 2. Entries
    if (currentPosition === 'NONE' && isCrossUp && passesLongZeroFilter && allowLong) {
      const stopLoss = currPrice * (1 - slPct / 100);
      const takeProfit = currPrice * (1 + tpPct / 100);
      return {
        action: 'BUY',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `Incrocio rialzista MACD (${currMacd.toFixed(2)}) > Signal (${currSig.toFixed(2)}) con Istogramma positivo`,
        indicatorSnapshot: { macd: currMacd.toFixed(2), signal: currSig.toFixed(2), histogram: currHist ? currHist.toFixed(2) : '0' },
      };
    }

    if (currentPosition === 'NONE' && isCrossDown && passesShortZeroFilter && allowShort) {
      const stopLoss = currPrice * (1 + slPct / 100);
      const takeProfit = currPrice * (1 - tpPct / 100);
      return {
        action: 'SELL',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `Incrocio ribassista MACD (${currMacd.toFixed(2)}) < Signal (${currSig.toFixed(2)}) con Istogramma negativo`,
        indicatorSnapshot: { macd: currMacd.toFixed(2), signal: currSig.toFixed(2), histogram: currHist ? currHist.toFixed(2) : '0' },
      };
    }

    return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'Nessun segnale' };
  },

  computeIndicators(bars: Bar[], params: Record<string, number | boolean | string>) {
    const closes = bars.map((b) => b.close);
    const fastP = Number(params.fastPeriod) || 12;
    const slowP = Number(params.slowPeriod) || 26;
    const sigP = Number(params.signalPeriod) || 9;
    const macdRes = calculateMACD(closes, fastP, slowP, sigP);

    return [
      { name: 'MACD Line', data: macdRes.macd, color: '#06b6d4', overlayOnPrice: false },
      { name: 'Signal Line', data: macdRes.signal, color: '#f97316', overlayOnPrice: false },
      { name: 'Histogram', data: macdRes.histogram, color: '#10b981', overlayOnPrice: false },
    ];
  },
};
