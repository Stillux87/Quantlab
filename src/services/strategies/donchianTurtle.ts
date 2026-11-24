/**
 * Strategy 6: Donchian Channel / Turtle Breakout System
 */
import { IStrategy } from './types';
import { Bar, StrategySignal } from '../../types';
import { calculateDonchianChannels, calculateATR } from '../indicators';

export const donchianTurtleStrategy: IStrategy = {
  definition: {
    id: 'donchian_turtle',
    name: 'Donchian Channel Breakout (Turtle)',
    category: 'TREND_FOLLOWING',
    description: 'Classica strategia quantitativa Turtle Trading: acquisto al breakout dei massimi a N periodi con uscita sui minimi a M periodi e trailing stop basato sull\'ATR.',
    rationale: 'Costruita per non perdere mai i trend secolari più importanti, lasciando correre i profitti e tagliando rapidamente le perdite.',
    defaultParams: {
      entryChannelPeriod: 20,
      exitChannelPeriod: 10,
      atrPeriod: 14,
      atrStopMultiplier: 2.0,
      tradeDirection: 'BOTH',
    },
    paramDefinitions: [
      { id: 'tradeDirection', name: 'Direzione Operativa', description: 'Permette operazioni Long, Short o Entrambe (Long & Short)', type: 'select', default: 'BOTH', options: [{ label: 'Long & Short (Entrambi)', value: 'BOTH' }, { label: 'Solo Long (Rialzista)', value: 'LONG' }, { label: 'Solo Short (Ribassista)', value: 'SHORT' }] },
      { id: 'entryChannelPeriod', name: 'Periodo Canale Ingresso (Highs/Lows)', description: 'Numero di barre massime/minime per il breakout d\'ingresso', type: 'number', default: 20, min: 10, max: 55, step: 5 },
      { id: 'exitChannelPeriod', name: 'Periodo Canale Uscita (Lows/Highs)', description: 'Numero di barre per l\'uscita conservativa', type: 'number', default: 10, min: 5, max: 30, step: 1 },
      { id: 'atrPeriod', name: 'Periodo ATR Stop', description: 'Periodo di misura della volatilità per lo stop di protezione', type: 'number', default: 14, min: 7, max: 28, step: 1 },
      { id: 'atrStopMultiplier', name: 'Moltiplicatore ATR Stop', description: 'Distanza in multipli di ATR per lo stop loss dinamico', type: 'number', default: 2.0, min: 1.0, max: 4.0, step: 0.2 },
    ],
    recommendedTimeframes: ['1h', '4h', '1D'],
    supportsShorting: true,
  },

  evaluate(bars: Bar[], barIndex: number, params: Record<string, number | boolean | string>, currentPosition: 'LONG' | 'SHORT' | 'NONE'): StrategySignal {
    if (barIndex < 25) {
      return { action: 'HOLD', price: bars[barIndex].close, timestamp: bars[barIndex].timestamp, reason: 'Dati insufficienti' };
    }

    const entryP = Number(params.entryChannelPeriod || params.breakoutPeriod) || 20;
    const exitP = Number(params.exitChannelPeriod || params.exitPeriod) || 10;
    const atrP = Number(params.atrPeriod) || 14;
    const atrMult = Number(params.atrStopMultiplier || params.stopAtrMultiplier) || 2.0;
    const tradeDirection = (params.tradeDirection as string) || 'BOTH';
    const allowLong = tradeDirection !== 'SHORT';
    const allowShort = tradeDirection !== 'LONG';

    const startIdx = Math.max(0, barIndex - 150);
    const subBars = bars.slice(startIdx, barIndex + 1);
    const entryDonchian = calculateDonchianChannels(subBars, entryP);
    const exitDonchian = calculateDonchianChannels(subBars, exitP);
    const atrSeries = calculateATR(subBars, atrP);

    const currUpper = entryDonchian.upper[entryDonchian.upper.length - 1];
    const currLower = entryDonchian.lower[entryDonchian.lower.length - 1];
    const currExitLower = exitDonchian.lower[exitDonchian.lower.length - 1];
    const currExitUpper = exitDonchian.upper[exitDonchian.upper.length - 1];
    const currPrice = subBars[subBars.length - 1].close;
    const currATR = atrSeries[atrSeries.length - 1] || 1;

    if (currUpper === undefined || currLower === undefined || currExitLower === undefined || currExitUpper === undefined) {
      return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'Canali in calcolo' };
    }

    // 1. Exits
    if (currentPosition === 'LONG' && currPrice < currExitLower) {
      return {
        action: 'EXIT_LONG',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        reason: `Prezzo (${currPrice.toFixed(2)}) sceso sotto il minimo del canale Donchian a ${exitP} periodi (${currExitLower.toFixed(2)})`,
        indicatorSnapshot: { exitLower: currExitLower.toFixed(2) },
      };
    }

    if (currentPosition === 'SHORT' && currPrice > currExitUpper) {
      return {
        action: 'EXIT_SHORT',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        reason: `Prezzo (${currPrice.toFixed(2)}) salito sopra il massimo del canale Donchian a ${exitP} periodi (${currExitUpper.toFixed(2)})`,
        indicatorSnapshot: { exitUpper: currExitUpper.toFixed(2) },
      };
    }

    // 2. Entries
    if (currentPosition === 'NONE' && currPrice > currUpper && allowLong) {
      const stopLoss = Math.max(0.5, currPrice - atrMult * currATR);
      const takeProfit = currPrice + 4.0 * (currPrice - stopLoss); // 1:4 Risk/Reward
      return {
        action: 'BUY',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `Breakout dei massimi a ${entryP} barre (${currUpper.toFixed(2)}) con Stop Loss calibrato su ATR (${stopLoss.toFixed(2)})`,
        indicatorSnapshot: {
          entryUpper: currUpper.toFixed(2),
          atr: currATR.toFixed(2),
          stopLoss: stopLoss.toFixed(2),
        },
      };
    }

    if (currentPosition === 'NONE' && currPrice < currLower && allowShort) {
      const stopLoss = currPrice + atrMult * currATR;
      const takeProfit = Math.max(0.1, currPrice - 4.0 * (stopLoss - currPrice)); // 1:4 Risk/Reward
      return {
        action: 'SELL',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `Breakout dei minimi a ${entryP} barre (${currLower.toFixed(2)}) con Stop Loss Short su ATR (${stopLoss.toFixed(2)})`,
        indicatorSnapshot: {
          entryLower: currLower.toFixed(2),
          atr: currATR.toFixed(2),
          stopLoss: stopLoss.toFixed(2),
        },
      };
    }

    return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'Nessun segnale' };
  },

  computeIndicators(bars: Bar[], params: Record<string, number | boolean | string>) {
    const entryP = Number(params.entryChannelPeriod) || 20;
    const exitP = Number(params.exitChannelPeriod) || 10;
    const entryDonchian = calculateDonchianChannels(bars, entryP);
    const exitDonchian = calculateDonchianChannels(bars, exitP);

    return [
      { name: `Donchian Entry High (${entryP})`, data: entryDonchian.upper, color: '#38bdf8', overlayOnPrice: true },
      { name: `Donchian Exit Low (${exitP})`, data: exitDonchian.lower, color: '#f87171', overlayOnPrice: true },
    ];
  },
};
