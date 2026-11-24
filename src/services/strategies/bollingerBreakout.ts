/**
 * Strategy 4: Bollinger Bands Volatility Squeeze & Breakout
 */
import { IStrategy } from './types';
import { Bar, StrategySignal } from '../../types';
import { calculateBollingerBands, calculateSMA } from '../indicators';

export const bollingerBreakoutStrategy: IStrategy = {
  definition: {
    id: 'bollinger_breakout',
    name: 'Bollinger Volatility Breakout',
    category: 'VOLATILITY_BREAKOUT',
    description: 'Rileva contrazioni di volatilità (squeeze) seguite da un breakout deciso sopra la banda superiore con conferma volumetrica.',
    rationale: 'I periodi di compressione di volatilità precedono sistematicamente movimenti direzionali esplosivi.',
    defaultParams: {
      bbPeriod: 20,
      stdDevMultiplier: 2.0,
      volumeFilterMultiplier: 1.2,
      tradeDirection: 'BOTH',
      stopLossPct: 2.4,
      takeProfitPct: 6.2,
    },
    paramDefinitions: [
      { id: 'tradeDirection', name: 'Direzione Operativa', description: 'Permette operazioni Long, Short o Entrambe (Long & Short)', type: 'select', default: 'BOTH', options: [{ label: 'Long & Short (Entrambi)', value: 'BOTH' }, { label: 'Solo Long (Rialzista)', value: 'LONG' }, { label: 'Solo Short (Ribassista)', value: 'SHORT' }] },
      { id: 'bbPeriod', name: 'Periodo Bollinger', description: 'Periodo per la media centrale delle bande', type: 'number', default: 20, min: 10, max: 50, step: 1 },
      { id: 'stdDevMultiplier', name: 'Moltiplicatore Dev. Std.', description: 'Ampiezza delle bande in deviazioni standard', type: 'number', default: 2.0, min: 1.5, max: 3.0, step: 0.1 },
      { id: 'volumeFilterMultiplier', name: 'Moltiplicatore Volume', description: 'Rapporto minimo tra volume del breakout e media a 20 periodi', type: 'number', default: 1.2, min: 1.0, max: 2.5, step: 0.1 },
      { id: 'stopLossPct', name: 'Stop Loss (%)', description: 'Stop Loss per l\'operazione', type: 'number', default: 2.4, min: 0.5, max: 10, step: 0.1 },
      { id: 'takeProfitPct', name: 'Take Profit (%)', description: 'Take Profit per l\'operazione', type: 'number', default: 6.2, min: 1.0, max: 20, step: 0.2 },
    ],
    recommendedTimeframes: ['15m', '30m', '1h', '4h'],
    supportsShorting: true,
  },

  evaluate(bars: Bar[], barIndex: number, params: Record<string, number | boolean | string>, currentPosition: 'LONG' | 'SHORT' | 'NONE'): StrategySignal {
    if (barIndex < 25) {
      return { action: 'HOLD', price: bars[barIndex].close, timestamp: bars[barIndex].timestamp, reason: 'Dati iniziali insufficienti' };
    }

    const bbP = Number(params.bbPeriod) || 20;
    const stdDev = Number(params.stdDevMultiplier) || 2.0;
    const volMult = Number(params.volumeFilterMultiplier) || 1.2;
    const slPct = Number(params.stopLossPct) || 2.4;
    const tpPct = Number(params.takeProfitPct) || 6.2;
    const tradeDirection = (params.tradeDirection as string) || 'BOTH';
    const allowLong = tradeDirection !== 'SHORT';
    const allowShort = tradeDirection !== 'LONG';

    const startIdx = Math.max(0, barIndex - 150);
    const windowBars = bars.slice(startIdx, barIndex + 1);
    const closes = windowBars.map((b) => b.close);
    const volumes = windowBars.map((b) => b.volume);
    
    const bbRes = calculateBollingerBands(closes, bbP, stdDev);
    const volSMA = calculateSMA(volumes, 20);

    const currUpper = bbRes.upper[bbRes.upper.length - 1];
    const prevUpper = bbRes.upper[bbRes.upper.length - 2];
    const currLower = bbRes.lower[bbRes.lower.length - 1];
    const prevLower = bbRes.lower[bbRes.lower.length - 2];
    const currMiddle = bbRes.middle[bbRes.middle.length - 1];
    const currPrice = closes[closes.length - 1];
    const prevPrice = closes[closes.length - 2];
    const currVol = volumes[volumes.length - 1];
    const avgVol = volSMA[volSMA.length - 1] || 1;

    if (currUpper === undefined || prevUpper === undefined || currLower === undefined || prevLower === undefined || currMiddle === undefined) {
      return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'Calcolo Bande in corso' };
    }

    // 1. Exits
    if (currentPosition === 'LONG' && currPrice < currMiddle) {
      return {
        action: 'EXIT_LONG',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        reason: `Prezzo (${currPrice.toFixed(2)}) sceso sotto la linea mediana SMA 20 (${currMiddle.toFixed(2)})`,
        indicatorSnapshot: { middleBand: currMiddle.toFixed(2), price: currPrice.toFixed(2) },
      };
    }

    if (currentPosition === 'SHORT' && currPrice > currMiddle) {
      return {
        action: 'EXIT_SHORT',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        reason: `Prezzo (${currPrice.toFixed(2)}) risalito sopra la linea mediana SMA 20 (${currMiddle.toFixed(2)})`,
        indicatorSnapshot: { middleBand: currMiddle.toFixed(2), price: currPrice.toFixed(2) },
      };
    }

    // 2. Entries
    const isBullBreakout = prevPrice <= prevUpper && currPrice > currUpper;
    const isBearBreakout = prevPrice >= prevLower && currPrice < prevLower;
    const hasVolumeSpike = currVol >= avgVol * volMult;

    if (currentPosition === 'NONE' && isBullBreakout && hasVolumeSpike && allowLong) {
      const stopLoss = currPrice * (1 - slPct / 100);
      const takeProfit = currPrice * (1 + tpPct / 100);
      return {
        action: 'BUY',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `Breakout rialzista Banda Superiore (${currUpper.toFixed(2)}) con Volume ${((currVol / avgVol) * 100).toFixed(0)}% della media`,
        indicatorSnapshot: {
          upperBand: currUpper.toFixed(2),
          middleBand: currMiddle.toFixed(2),
          volumeRatio: (currVol / avgVol).toFixed(2),
        },
      };
    }

    if (currentPosition === 'NONE' && isBearBreakout && hasVolumeSpike && allowShort) {
      const stopLoss = currPrice * (1 + slPct / 100);
      const takeProfit = currPrice * (1 - tpPct / 100);
      return {
        action: 'SELL',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `Breakout ribassista Banda Inferiore (${currLower.toFixed(2)}) con Volume ${((currVol / avgVol) * 100).toFixed(0)}% della media`,
        indicatorSnapshot: {
          lowerBand: currLower.toFixed(2),
          middleBand: currMiddle.toFixed(2),
          volumeRatio: (currVol / avgVol).toFixed(2),
        },
      };
    }

    return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'Nessun breakout confermato' };
  },

  computeIndicators(bars: Bar[], params: Record<string, number | boolean | string>) {
    const closes = bars.map((b) => b.close);
    const bbP = Number(params.bbPeriod) || 20;
    const stdDev = Number(params.stdDevMultiplier) || 2.0;
    const bbRes = calculateBollingerBands(closes, bbP, stdDev);

    return [
      { name: 'BB Upper', data: bbRes.upper, color: '#f43f5e', overlayOnPrice: true },
      { name: 'BB Middle', data: bbRes.middle, color: '#e2e8f0', overlayOnPrice: true },
      { name: 'BB Lower', data: bbRes.lower, color: '#10b981', overlayOnPrice: true },
    ];
  },
};
