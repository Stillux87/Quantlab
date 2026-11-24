/**
 * Strategy 7: Volume-Weighted VWAP Deviation & Surge
 */
import { IStrategy } from './types';
import { Bar, StrategySignal } from '../../types';
import { calculateVWAP, calculateSMA } from '../indicators';

export const volumeVwapStrategy: IStrategy = {
  definition: {
    id: 'volume_vwap',
    name: 'VWAP Flow & Volume Surge',
    category: 'VOLUME_FLOW',
    description: 'Opera sui ritracciamenti verso il Volume-Weighted Average Price (VWAP) con conferma di spike volumetrico istituzionale.',
    rationale: 'Il VWAP rappresenta il prezzo medio di carico ponderato per i volumi istituzionali. Rimbalzi sopra il VWAP indicano forte difesa degli ordini.',
    defaultParams: {
      volumeThresholdMultiplier: 1.3,
      vwapBandPct: 0.8,
      tradeDirection: 'BOTH',
      stopLossPct: 1.8,
      takeProfitPct: 4.2,
    },
    paramDefinitions: [
      { id: 'tradeDirection', name: 'Direzione Operativa', description: 'Permette operazioni Long, Short o Entrambe (Long & Short)', type: 'select', default: 'BOTH', options: [{ label: 'Long & Short (Entrambi)', value: 'BOTH' }, { label: 'Solo Long (Rialzista)', value: 'LONG' }, { label: 'Solo Short (Ribassista)', value: 'SHORT' }] },
      { id: 'volumeThresholdMultiplier', name: 'Moltiplicatore Volume Istituzionale', description: 'Volume minimo rispetto alla media a 20 periodi', type: 'number', default: 1.3, min: 1.1, max: 2.5, step: 0.1 },
      { id: 'vwapBandPct', name: 'Tolleranza VWAP (%)', description: 'Distanza percentuale massima dal VWAP per autorizzare l\'ingresso', type: 'number', default: 0.8, min: 0.2, max: 2.0, step: 0.1 },
      { id: 'stopLossPct', name: 'Stop Loss (%)', description: 'Stop loss per operazione', type: 'number', default: 1.8, min: 0.5, max: 8, step: 0.1 },
      { id: 'takeProfitPct', name: 'Take Profit (%)', description: 'Take profit per operazione', type: 'number', default: 4.2, min: 1.0, max: 12, step: 0.2 },
    ],
    recommendedTimeframes: ['5m', '15m', '30m', '1h'],
    supportsShorting: true,
  },

  evaluate(bars: Bar[], barIndex: number, params: Record<string, number | boolean | string>, currentPosition: 'LONG' | 'SHORT' | 'NONE'): StrategySignal {
    if (barIndex < 20) {
      return { action: 'HOLD', price: bars[barIndex].close, timestamp: bars[barIndex].timestamp, reason: 'Dati insufficienti' };
    }

    const volMult = Number(params.volumeThresholdMultiplier) || 1.3;
    const bandPct = Number(params.vwapBandPct) || 0.8;
    const slPct = Number(params.stopLossPct) || 1.8;
    const tpPct = Number(params.takeProfitPct) || 4.2;
    const tradeDirection = (params.tradeDirection as string) || 'BOTH';
    const allowLong = tradeDirection !== 'SHORT';
    const allowShort = tradeDirection !== 'LONG';

    const startIdx = Math.max(0, barIndex - 150);
    const subBars = bars.slice(startIdx, barIndex + 1);
    const vwapSeries = calculateVWAP(subBars);
    const volumes = subBars.map((b) => b.volume);
    const volSMA = calculateSMA(volumes, 20);

    const currPrice = subBars[subBars.length - 1].close;
    const prevPrice = subBars[subBars.length - 2].close;
    const currVwap = vwapSeries[vwapSeries.length - 1];
    const currVol = volumes[volumes.length - 1];
    const avgVol = volSMA[volSMA.length - 1] || 1;

    if (currVwap === undefined) {
      return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'VWAP in calcolo' };
    }

    // 1. Exits
    if (currentPosition === 'LONG' && currPrice < currVwap * 0.988) {
      return {
        action: 'EXIT_LONG',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        reason: `Prezzo (${currPrice.toFixed(2)}) sceso significativamente sotto il VWAP (${currVwap.toFixed(2)})`,
        indicatorSnapshot: { vwap: currVwap.toFixed(2), price: currPrice.toFixed(2) },
      };
    }

    if (currentPosition === 'SHORT' && currPrice > currVwap * 1.012) {
      return {
        action: 'EXIT_SHORT',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        reason: `Prezzo (${currPrice.toFixed(2)}) salito significativamente sopra il VWAP (${currVwap.toFixed(2)})`,
        indicatorSnapshot: { vwap: currVwap.toFixed(2), price: currPrice.toFixed(2) },
      };
    }

    // 2. Entries
    const vwapDistancePct = Math.abs((currPrice - currVwap) / currVwap) * 100;
    const isAboveVwap = currPrice >= currVwap && prevPrice <= currVwap * (1 + bandPct / 100);
    const isBelowVwap = currPrice <= currVwap && prevPrice >= currVwap * (1 - bandPct / 100);
    const hasVolume = currVol >= avgVol * volMult;

    if (currentPosition === 'NONE' && isAboveVwap && vwapDistancePct <= bandPct && hasVolume && allowLong) {
      const stopLoss = currPrice * (1 - slPct / 100);
      const takeProfit = currPrice * (1 + tpPct / 100);
      return {
        action: 'BUY',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `Rimbalzo rialzista sul VWAP (${currVwap.toFixed(2)}) con volume del ${((currVol / avgVol) * 100).toFixed(0)}% rispetto alla media`,
        indicatorSnapshot: {
          vwap: currVwap.toFixed(2),
          volumeRatio: (currVol / avgVol).toFixed(2),
        },
      };
    }

    if (currentPosition === 'NONE' && isBelowVwap && vwapDistancePct <= bandPct && hasVolume && allowShort) {
      const stopLoss = currPrice * (1 + slPct / 100);
      const takeProfit = currPrice * (1 - tpPct / 100);
      return {
        action: 'SELL',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `Respinto al ribasso dal VWAP (${currVwap.toFixed(2)}) con volume del ${((currVol / avgVol) * 100).toFixed(0)}% rispetto alla media`,
        indicatorSnapshot: {
          vwap: currVwap.toFixed(2),
          volumeRatio: (currVol / avgVol).toFixed(2),
        },
      };
    }

    return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'Nessun segnale' };
  },

  computeIndicators(bars: Bar[], params: Record<string, number | boolean | string>) {
    const vwapData = calculateVWAP(bars);
    return [
      { name: 'VWAP Istituzionale', data: vwapData, color: '#f59e0b', overlayOnPrice: true },
    ];
  },
};
