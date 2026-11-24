/**
 * Strategy 2: Dynamic RSI Mean Reversion
 */
import { IStrategy } from './types';
import { Bar, StrategySignal } from '../../types';
import { calculateRSI, calculateSMA } from '../indicators';

export const rsiMeanReversionStrategy: IStrategy = {
  definition: {
    id: 'rsi_mean_reversion',
    name: 'RSI Mean Reversion',
    category: 'MEAN_REVERSION',
    description: 'Identifica eccessi di vendita statistica su timeframe intermedi per ingressi a favore di ritracciamento medio, con uscita su ipercomprato o ritorno a media.',
    rationale: 'Sfrutta l\'oscillazione ciclica dei prezzi su asset ad alta liquidità ed ETF che tendono a riallinearsi verso il fair value medio.',
    defaultParams: {
      rsiPeriod: 14,
      oversoldThreshold: 30,
      overboughtThreshold: 70,
      exitOnRsi50: true,
      tradeDirection: 'BOTH',
      stopLossPct: 2.2,
      takeProfitPct: 4.8,
    },
    paramDefinitions: [
      { id: 'tradeDirection', name: 'Direzione Operativa', description: 'Permette operazioni Long, Short o Entrambe (Long & Short)', type: 'select', default: 'BOTH', options: [{ label: 'Long & Short (Entrambi)', value: 'BOTH' }, { label: 'Solo Long (Rialzista)', value: 'LONG' }, { label: 'Solo Short (Ribassista)', value: 'SHORT' }] },
      { id: 'rsiPeriod', name: 'Periodo RSI', description: 'Numero di barre per il calcolo dell\'oscillatore RSI', type: 'number', default: 14, min: 5, max: 30, step: 1 },
      { id: 'oversoldThreshold', name: 'Soglia Ipervenduto (Ingresso Long / Uscita Short)', description: 'Livello sotto il quale il mercato è considerato statisticamente depresso', type: 'number', default: 30, min: 15, max: 45, step: 1 },
      { id: 'overboughtThreshold', name: 'Soglia Ipercomprato (Target Long / Ingresso Short)', description: 'Livello sopra il quale entrare Short o prendere profitto Long', type: 'number', default: 70, min: 55, max: 85, step: 1 },
      { id: 'exitOnRsi50', name: 'Uscita su RSI 50 (Neutro)', description: 'Chiude la posizione appena l\'RSI attraversa la mediana 50', type: 'boolean', default: true },
      { id: 'stopLossPct', name: 'Stop Loss (%)', description: 'Percentuale massima di perdita ammessa', type: 'number', default: 2.2, min: 0.5, max: 8, step: 0.1 },
      { id: 'takeProfitPct', name: 'Take Profit (%)', description: 'Target primario di profitto', type: 'number', default: 4.8, min: 1.0, max: 15, step: 0.2 },
    ],
    recommendedTimeframes: ['15m', '30m', '1h', '4h'],
    supportsShorting: true,
  },

  evaluate(bars: Bar[], barIndex: number, params: Record<string, number | boolean | string>, currentPosition: 'LONG' | 'SHORT' | 'NONE'): StrategySignal {
    if (barIndex < 2) {
      return { action: 'HOLD', price: bars[barIndex].close, timestamp: bars[barIndex].timestamp, reason: 'Dati iniziali insufficienti' };
    }

    const rsiPeriod = Number(params.rsiPeriod) || 14;
    const oversold = Number(params.oversoldThreshold || params.oversold) || 30;
    const overbought = Number(params.overboughtThreshold || params.overbought) || 70;
    const exitAt50 = params.exitOnRsi50 !== false;
    const slPct = Number(params.stopLossPct) || 2.2;
    const tpPct = Number(params.takeProfitPct) || 4.8;
    const tradeDirection = (params.tradeDirection as string) || 'BOTH';
    const allowLong = tradeDirection !== 'SHORT';
    const allowShort = tradeDirection !== 'LONG';

    const startIdx = Math.max(0, barIndex - 200);
    const closes = bars.slice(startIdx, barIndex + 1).map((b) => b.close);
    const rsiSeries = calculateRSI(closes, rsiPeriod);

    const currRsi = rsiSeries[rsiSeries.length - 1];
    const prevRsi = rsiSeries[rsiSeries.length - 2];
    const currPrice = closes[closes.length - 1];

    if (currRsi === undefined || prevRsi === undefined) {
      return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'RSI in calcolo' };
    }

    // 1. Exits
    if (currentPosition === 'LONG') {
      if (currRsi >= overbought) {
        return {
          action: 'EXIT_LONG',
          price: currPrice,
          timestamp: bars[barIndex].timestamp,
          reason: `RSI (${currRsi.toFixed(1)}) ha raggiunto la soglia di ipercomprato (${overbought})`,
          indicatorSnapshot: { rsi: currRsi.toFixed(1) },
        };
      }
      if (exitAt50 && prevRsi < 50 && currRsi >= 50) {
        return {
          action: 'EXIT_LONG',
          price: currPrice,
          timestamp: bars[barIndex].timestamp,
          reason: `RSI (${currRsi.toFixed(1)}) ha superato la linea di equilibrio 50 (Mean Reversion completata)`,
          indicatorSnapshot: { rsi: currRsi.toFixed(1) },
        };
      }
    }

    if (currentPosition === 'SHORT') {
      if (currRsi <= oversold) {
        return {
          action: 'EXIT_SHORT',
          price: currPrice,
          timestamp: bars[barIndex].timestamp,
          reason: `RSI (${currRsi.toFixed(1)}) ha raggiunto la soglia di ipervenduto (${oversold})`,
          indicatorSnapshot: { rsi: currRsi.toFixed(1) },
        };
      }
      if (exitAt50 && prevRsi > 50 && currRsi <= 50) {
        return {
          action: 'EXIT_SHORT',
          price: currPrice,
          timestamp: bars[barIndex].timestamp,
          reason: `RSI (${currRsi.toFixed(1)}) è sceso sotto la linea di equilibrio 50 (Mean Reversion completata)`,
          indicatorSnapshot: { rsi: currRsi.toFixed(1) },
        };
      }
    }

    // 2. Entries
    if (currentPosition === 'NONE' && prevRsi <= oversold && currRsi > oversold && allowLong) {
      const stopLoss = currPrice * (1 - slPct / 100);
      const takeProfit = currPrice * (1 + tpPct / 100);
      return {
        action: 'BUY',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `RSI (${currRsi.toFixed(1)}) è rimbalzato sopra la soglia di ipervenduto (${oversold})`,
        indicatorSnapshot: { rsi: currRsi.toFixed(1), prevRsi: prevRsi.toFixed(1) },
      };
    }

    if (currentPosition === 'NONE' && prevRsi >= overbought && currRsi < overbought && allowShort) {
      const stopLoss = currPrice * (1 + slPct / 100);
      const takeProfit = currPrice * (1 - tpPct / 100);
      return {
        action: 'SELL',
        price: currPrice,
        timestamp: bars[barIndex].timestamp,
        stopLoss,
        takeProfit,
        reason: `RSI (${currRsi.toFixed(1)}) è rientrato sotto la soglia di ipercomprato (${overbought})`,
        indicatorSnapshot: { rsi: currRsi.toFixed(1), prevRsi: prevRsi.toFixed(1) },
      };
    }

    return { action: 'HOLD', price: currPrice, timestamp: bars[barIndex].timestamp, reason: 'Nessun segnale' };
  },

  computeIndicators(bars: Bar[], params: Record<string, number | boolean | string>) {
    const closes = bars.map((b) => b.close);
    const rsiPeriod = Number(params.rsiPeriod) || 14;
    return [
      { name: `RSI (${rsiPeriod})`, data: calculateRSI(closes, rsiPeriod), color: '#ec4899', overlayOnPrice: false },
    ];
  },
};
