/**
 * Strategy 8: Dual Momentum Relative Trend
 */
import { IStrategy } from './types';
import { Bar, StrategySignal } from '../../types';
import { calculateSMA, calculateEMA } from '../indicators';

export const dualMomentumStrategy: IStrategy = {
  definition: {
    id: 'dual_momentum',
    name: 'Dual Momentum (ROC + Trend)',
    category: 'MOMENTUM',
    description: 'Combina il Rate of Change (ROC) su 21 periodi con un filtro di trend esponenziale (EMA 50/100).',
    rationale: 'Seleziona le fasi di massima accelerazione positiva prevenendo l\'esposizione quando il momentum si esaurisce.',
    defaultParams: {
      rocPeriod: 21,
      rocThreshold: 1.5,
      emaTrendPeriod: 50,
      tradeDirection: 'BOTH',
      stopLossPct: 2.5,
      takeProfitPct: 6.5,
    },
    paramDefinitions: [
      { id: 'tradeDirection', name: 'Direzione Operativa', description: 'Permette operazioni Long, Short o Entrambe (Long & Short)', type: 'select', default: 'BOTH', options: [{ label: 'Long & Short (Entrambi)', value: 'BOTH' }, { label: 'Solo Long (Rialzista)', value: 'LONG' }, { label: 'Solo Short (Ribassista)', value: 'SHORT' }] },
      { id: 'rocPeriod', name: 'Periodo ROC Momentum', description: 'Periodo di calcolo del Rate of Change (%)', type: 'number', default: 21, min: 10, max: 60, step: 1 },
      { id: 'rocThreshold', name: 'Soglia Minima ROC (%)', description: 'Accelerazione percentuale minima richiesta per entrare', type: 'number', default: 1.5, min: 0.5, max: 5.0, step: 0.1 },
      { id: 'emaTrendPeriod', name: 'Periodo EMA Trend', description: 'Media mobile di filtro direzionale', type: 'number', default: 50, min: 20, max: 100, step: 5 },
      { id: 'stopLossPct', name: 'Stop Loss (%)', description: 'Stop loss per operazione', type: 'number', default: 2.5, min: 0.5, max: 10, step: 0.1 },
      { id: 'takeProfitPct', name: 'Take Profit (%)', description: 'Take profit per operazione', type: 'number', default: 6.5, min: 1.0, max: 20, step: 0.5 },
    ],
    recommendedTimeframes: ['1h', '4h', '1D'],
    supportsShorting: true,
  },

  evaluate(bars: Bar[], barIndex: number, params: Record<string, number | boolean | string>, currentPosition: 'LONG' | 'SHORT' | 'NONE'): StrategySignal {
    const rocP = Number(params.rocPeriod) || 21;
    const rocThresh = Number(params.rocThreshold) || 1.5;
    const emaP = Number(params.emaTrendPeriod) || 50;
    const slPct = Number(params.stopLossPct) || 2.5;
    const tpPct = Number(params.takeProfitPct) || 6.5;
    const tradeDirection = (params.tradeDirection as string) || 'BOTH';
    const allowLong = tradeDirection !== 'SHORT';
    const allowShort = tradeDirection !== 'LONG';

    if (barIndex < Math.max(rocP, emaP) + 2) {
      return { action: 'HOLD', price: bars[barIndex].close, timestamp: bars[barIndex].timestamp, reason: 'Dati insufficienti' };
    }

    const startIdx = Math.max(0, barIndex - 150);
    const subBars = bars.slice(startIdx, barIndex + 1);
    const closes = subBars.map((b) => b.close);
    const emaTrend = calculateEMA(closes, emaP);

    const currPrice = closes[closes.length - 1];
    const pastPrice = closes[closes.length - 1 - rocP];
    const rocPct = pastPrice > 0 ? ((currPrice - pastPrice) / pastPrice) * 100 : 0;
    const currEma = emaTrend[emaTrend.length - 1];

    if (currEma === undefined) {
      return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'EMA in calcolo' };
    }

    // 1. Exits
    if (currentPosition === 'LONG' && (rocPct < 0 || currPrice < currEma)) {
      return {
        action: 'EXIT_LONG',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        reason: `Esaurimento momentum rialzista (ROC: ${rocPct.toFixed(2)}% | Prezzo < EMA ${emaP})`,
        indicatorSnapshot: { roc: `${rocPct.toFixed(2)}%`, ema: currEma.toFixed(2) },
      };
    }

    if (currentPosition === 'SHORT' && (rocPct > 0 || currPrice > currEma)) {
      return {
        action: 'EXIT_SHORT',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        reason: `Esaurimento momentum ribassista (ROC: ${rocPct.toFixed(2)}% | Prezzo > EMA ${emaP})`,
        indicatorSnapshot: { roc: `${rocPct.toFixed(2)}%`, ema: currEma.toFixed(2) },
      };
    }

    // 2. Entries
    if (currentPosition === 'NONE' && rocPct >= rocThresh && currPrice > currEma && allowLong) {
      const stopLoss = currPrice * (1 - slPct / 100);
      const takeProfit = currPrice * (1 + tpPct / 100);
      return {
        action: 'BUY',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `Accelerazione Dual Momentum Long: ROC a ${rocP} periodi a +${rocPct.toFixed(2)}% > ${rocThresh}% sopra EMA ${emaP}`,
        indicatorSnapshot: {
          roc: `+${rocPct.toFixed(2)}%`,
          ema: currEma.toFixed(2),
        },
      };
    }

    if (currentPosition === 'NONE' && rocPct <= -rocThresh && currPrice < currEma && allowShort) {
      const stopLoss = currPrice * (1 + slPct / 100);
      const takeProfit = currPrice * (1 - tpPct / 100);
      return {
        action: 'SELL',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `Accelerazione Dual Momentum Short: ROC a ${rocP} periodi a ${rocPct.toFixed(2)}% < -${rocThresh}% sotto EMA ${emaP}`,
        indicatorSnapshot: {
          roc: `${rocPct.toFixed(2)}%`,
          ema: currEma.toFixed(2),
        },
      };
    }

    return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'Nessun segnale' };
  },

  computeIndicators(bars: Bar[], params: Record<string, number | boolean | string>) {
    const closes = bars.map((b) => b.close);
    const emaP = Number(params.emaTrendPeriod) || 50;
    return [
      { name: `EMA Trend (${emaP})`, data: calculateEMA(closes, emaP), color: '#a855f7', overlayOnPrice: true },
    ];
  },
};
