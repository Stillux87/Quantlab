/**
 * QuantLab - Andrea Unger Titan Strategy Engine
 * Implements the rigorous Unger Method™:
 * 1. Simple, un-overfitted core triggers (Donchian Breakout, Prior Day Breakout, Bollinger Reversal, etc.)
 * 2. Proprietary Unger Filter Matrix (Trend/Regime SMA200, Volatility ATR Expansion/Compression, Time & Session Windows, Day of Week)
 * 3. Exact Exit Management (Monetary/ATR Stop Loss, Take Profit, Trailing Stop, Bar/Time Exit, Intraday EOD Exit)
 */
import { IStrategy } from './types';
import { Bar, StrategySignal, UngerCoreTriggerType } from '../../types';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateATR,
  calculateBollingerBands,
  calculateDonchianChannels,
  calculateSuperTrend,
} from '../indicators';

export interface UngerTitanFullParams {
  triggerType: UngerCoreTriggerType;
  // Trigger specific parameters
  donchianPeriod?: number;
  rsiPeriod?: number;
  rsiOversold?: number;
  rsiOverbought?: number;
  bbPeriod?: number;
  bbStdDev?: number;
  emaFast?: number;
  emaSlow?: number;
  biasDay?: number; // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri

  // Filters Matrix
  trendFilterEnabled?: boolean;
  trendFilterPeriod?: number;
  trendFilterMode?: 'ABOVE_SMA' | 'BELOW_SMA' | 'SMA_SLOPE_UP';

  volatilityFilterEnabled?: boolean;
  volatilityFilterMode?: 'EXPANSION' | 'COMPRESSION';
  atrPeriod?: number;
  atrSmaPeriod?: number;

  timeWindowFilterEnabled?: boolean;
  sessionStartHour?: number;
  sessionStartMinute?: number;
  sessionEndHour?: number;
  sessionEndMinute?: number;

  dayOfWeekFilterEnabled?: boolean;
  allowedDays?: number[]; // e.g. [1, 2, 3, 4, 5]

  patternFilterEnabled?: boolean;
  consecutiveBarsCount?: number;
  consecutiveBarsDirection?: 'BEARISH' | 'BULLISH';

  // Exits
  stopLossType?: 'MONETARY_PCT' | 'ATR_MULTIPLE';
  stopLossValue?: number;
  takeProfitType?: 'MONETARY_PCT' | 'ATR_MULTIPLE';
  takeProfitValue?: number;
  trailingStopPct?: number;
  timeExitBars?: number;
  intradayExitEod?: boolean;
}

export const ungerTitanStrategy: IStrategy = {
  definition: {
    id: 'unger_titan_strategy',
    name: 'Metodo Unger™ Titan Lab',
    category: 'UNGER_TITAN',
    description: 'Sistema completo basato sul Metodo Unger e software Titan: unisce trigger elementari non overfittati con la matrice di filtri di regime (Trend, Volatilità ATR, Finestre Orarie e Bias Settimanale) e gestione rigorosa delle uscite.',
    rationale: 'Filtra il rumore casuale di mercato isolando i veri vantaggi statistici e azzera il rischio di curve-fitting grazie alla validazione OOS e Monte Carlo.',
    defaultParams: {
      tradeDirection: 'BOTH',
      triggerType: 'DONCHIAN_BREAKOUT',
      donchianPeriod: 20,
      rsiPeriod: 14,
      rsiOversold: 30,
      rsiOverbought: 70,
      bbPeriod: 20,
      bbStdDev: 2.0,
      emaFast: 12,
      emaSlow: 26,
      biasDay: 2, // Tuesday

      trendFilterEnabled: true,
      trendFilterPeriod: 200,
      trendFilterMode: 'ABOVE_SMA',

      volatilityFilterEnabled: true,
      volatilityFilterMode: 'EXPANSION',
      atrPeriod: 14,
      atrSmaPeriod: 50,

      timeWindowFilterEnabled: false,
      sessionStartHour: 9,
      sessionStartMinute: 0,
      sessionEndHour: 17,
      sessionEndMinute: 30,

      dayOfWeekFilterEnabled: false,
      allowedDays: '1,2,3,4,5',

      patternFilterEnabled: false,
      consecutiveBarsCount: 2,
      consecutiveBarsDirection: 'BEARISH',

      stopLossType: 'ATR_MULTIPLE',
      stopLossValue: 2.0,
      takeProfitType: 'ATR_MULTIPLE',
      takeProfitValue: 3.5,
      trailingStopPct: 1.5,
      timeExitBars: 12,
      intradayExitEod: false,
    },
    paramDefinitions: [
      { id: 'tradeDirection', name: 'Direzione Operativa', description: 'Permette operazioni Long, Short o Entrambe (Long & Short)', type: 'select', default: 'BOTH', options: [{ label: 'Long & Short (Entrambi)', value: 'BOTH' }, { label: 'Solo Long (Rialzista)', value: 'LONG' }, { label: 'Solo Short (Ribassista)', value: 'SHORT' }] },
      {
        id: 'triggerType',
        name: 'Motore di Base (Core Trigger)',
        description: 'Regola elementare d\'ingresso non overfittata',
        type: 'select',
        default: 'DONCHIAN_BREAKOUT',
        options: [
          { label: 'Donchian Breakout (Max/Min N Barre)', value: 'DONCHIAN_BREAKOUT' },
          { label: 'Prior Day Breakout (Massimi/Minimi Sessione Precedente)', value: 'PRIOR_DAY_BREAKOUT' },
          { label: 'Bollinger Extreme Reversal (Mean Reversion)', value: 'BOLLINGER_REVERSAL' },
          { label: 'SuperTrend Momentum Trend', value: 'SUPER_TREND' },
          { label: 'EMA Trend Crossover', value: 'EMA_CROSSOVER' },
          { label: 'RSI Extreme Reversion', value: 'RSI_EXTREME' },
          { label: 'Day of Week Bias (Stagionalità)', value: 'DAY_OF_WEEK_BIAS' },
        ],
      },
      { id: 'donchianPeriod', name: 'Periodo Canale Donchian', description: 'Numero di barre per il breakout dei massimi', type: 'number', default: 20, min: 5, max: 100, step: 1 },
      { id: 'trendFilterEnabled', name: 'Attiva Filtro di Trend SMA', description: 'Autorizza ingressi solo in direzione del trend di lungo periodo', type: 'boolean', default: true },
      { id: 'trendFilterPeriod', name: 'Periodo Media Trend Filter', description: 'Periodo della SMA di lungo periodo (es. 200 barre)', type: 'number', default: 200, min: 20, max: 300, step: 10 },
      { id: 'volatilityFilterEnabled', name: 'Attiva Filtro Volatilità ATR', description: 'Filtra i trade in base al regime di espansione/compressione di volatilità', type: 'boolean', default: true },
      { id: 'volatilityFilterMode', name: 'Modalità Volatilità ATR', description: 'Espansione (ATR > Media ATR) o Compressione (ATR < Media ATR)', type: 'select', default: 'EXPANSION', options: [{ label: 'Espansione Volatilità', value: 'EXPANSION' }, { label: 'Compressione Volatilità', value: 'COMPRESSION' }] },
      { id: 'timeExitBars', name: 'Uscita a Tempo (Barre)', description: 'Chiude la posizione automaticamente dopo N barre se non ha raggiunto target (0 = disattivato)', type: 'number', default: 12, min: 0, max: 50, step: 1 },
      { id: 'stopLossValue', name: 'Stop Loss (Moltiplicatore ATR / %)', description: 'Distanza dello Stop Loss iniziale', type: 'number', default: 2.0, min: 0.5, max: 10.0, step: 0.1 },
      { id: 'takeProfitValue', name: 'Take Profit (Moltiplicatore ATR / %)', description: 'Distanza del Take Profit', type: 'number', default: 3.5, min: 1.0, max: 15.0, step: 0.2 },
    ],
    recommendedTimeframes: ['15m', '30m', '1h', '4h', '1D'],
    supportsShorting: true,
  },

  evaluate(
    bars: Bar[],
    barIndex: number,
    params: Record<string, number | boolean | string>,
    currentPosition: 'LONG' | 'SHORT' | 'NONE'
  ): StrategySignal {
    const minRequired = 60;
    if (barIndex < minRequired) {
      return {
        action: 'HOLD',
        price: bars[barIndex].close,
        timestamp: bars[barIndex].timestamp,
        reason: 'Warm-up barre per calcolo indicatori Unger',
      };
    }

    const currentBar = bars[barIndex];
    const prevBar = bars[barIndex - 1];
    const triggerType = (params.triggerType as UngerCoreTriggerType) || 'DONCHIAN_BREAKOUT';

    // Slice bars up to barIndex for safe no-lookahead calculation
    const startIdx = Math.max(0, barIndex - 300);
    const subBars = bars.slice(startIdx, barIndex + 1);
    const subCloses = subBars.map((b) => b.close);
    const subHighs = subBars.map((b) => b.high);
    const subLows = subBars.map((b) => b.low);
    const subLen = subBars.length;
    const subCurrentIdx = subLen - 1;

    // Pre-calculate ATR for dynamic stops
    const atrPeriod = Number(params.atrPeriod) || 14;
    const atrSeries = calculateATR(subBars, atrPeriod);
    const currentAtr = atrSeries[subCurrentIdx] || Math.max(0.01, currentBar.high - currentBar.low);

    // ==========================================
    // 1. UNGER FILTER MATRIX EVALUATION
    // ==========================================

    // A. Trend / Regime Filter (e.g. SMA 200)
    let passesTrendFilter = true;
    if (params.trendFilterEnabled) {
      const trendPeriod = Number(params.trendFilterPeriod) || 200;
      if (subLen >= trendPeriod) {
        const smaTrend = calculateSMA(subCloses, trendPeriod);
        const currentSma = smaTrend[subCurrentIdx];
        const prevSma = smaTrend[subCurrentIdx - 1];

        if (currentSma !== undefined) {
          const mode = params.trendFilterMode || 'ABOVE_SMA';
          if (mode === 'ABOVE_SMA' && currentBar.close < currentSma) {
            passesTrendFilter = false;
          } else if (mode === 'BELOW_SMA' && currentBar.close > currentSma) {
            passesTrendFilter = false;
          } else if (mode === 'SMA_SLOPE_UP' && prevSma !== undefined && currentSma <= prevSma) {
            passesTrendFilter = false;
          }
        }
      }
    }

    // B. Volatility Filter (ATR vs SMA of ATR)
    let passesVolatilityFilter = true;
    if (params.volatilityFilterEnabled) {
      const atrSmaPeriod = Number(params.atrSmaPeriod) || 50;
      const validAtrVals = atrSeries.filter((v): v is number => v !== undefined);
      if (validAtrVals.length >= atrSmaPeriod) {
        const atrSma = calculateSMA(validAtrVals, atrSmaPeriod);
        const currentAtrSma = atrSma[atrSma.length - 1];
        if (currentAtrSma !== undefined) {
          const mode = params.volatilityFilterMode || 'EXPANSION';
          if (mode === 'EXPANSION' && currentAtr < currentAtrSma) {
            passesVolatilityFilter = false;
          } else if (mode === 'COMPRESSION' && currentAtr > currentAtrSma) {
            passesVolatilityFilter = false;
          }
        }
      }
    }

    // C. Time & Session Window Filter
    let passesTimeWindowFilter = true;
    if (params.timeWindowFilterEnabled) {
      const d = new Date(currentBar.timestamp);
      const barHour = d.getHours();
      const barMinute = d.getMinutes();
      const barTotalMinutes = barHour * 60 + barMinute;

      const startTotal = (Number(params.sessionStartHour) || 9) * 60 + (Number(params.sessionStartMinute) || 0);
      const endTotal = (Number(params.sessionEndHour) || 17) * 60 + (Number(params.sessionEndMinute) || 30);

      if (barTotalMinutes < startTotal || barTotalMinutes > endTotal) {
        passesTimeWindowFilter = false;
      }
    }

    // D. Day of Week Filter
    let passesDayOfWeekFilter = true;
    if (params.dayOfWeekFilterEnabled) {
      const d = new Date(currentBar.timestamp);
      const day = d.getDay(); // 0=Sun, 1=Mon...
      const allowed = typeof params.allowedDays === 'string'
        ? params.allowedDays.split(',').map(Number)
        : Array.isArray(params.allowedDays)
        ? params.allowedDays
        : [1, 2, 3, 4, 5];
      if (!allowed.includes(day)) {
        passesDayOfWeekFilter = false;
      }
    }

    // E. Pre-Condition Candlestick Pattern Filter
    let passesPatternFilter = true;
    if (params.patternFilterEnabled) {
      const reqCount = Number(params.consecutiveBarsCount) || 2;
      const reqDir = params.consecutiveBarsDirection || 'BEARISH';

      if (subLen >= reqCount + 1) {
        for (let k = 1; k <= reqCount; k++) {
          const b = subBars[subLen - 1 - k];
          if (reqDir === 'BEARISH' && b.close >= b.open) {
            passesPatternFilter = false;
            break;
          } else if (reqDir === 'BULLISH' && b.close <= b.open) {
            passesPatternFilter = false;
            break;
          }
        }
      }
    }

    const allFiltersPassed =
      passesTrendFilter &&
      passesVolatilityFilter &&
      passesTimeWindowFilter &&
      passesDayOfWeekFilter &&
      passesPatternFilter;

    const tradeDirection = (params.tradeDirection as string) || 'BOTH';
    const allowLong = tradeDirection !== 'SHORT';
    const allowShort = tradeDirection !== 'LONG';

    // Calculate Stop Loss & Take Profit Price levels based on Unger Exit configuration
    const isAtrStop = params.stopLossType !== 'MONETARY_PCT';
    const slMult = Number(params.stopLossValue) || 2.0;
    const isAtrTp = params.takeProfitType !== 'MONETARY_PCT';
    const tpMult = Number(params.takeProfitValue) || 3.5;

    const stopDistance = isAtrStop ? currentAtr * slMult : currentBar.close * (slMult / 100);
    const tpDistance = isAtrTp ? currentAtr * tpMult : currentBar.close * (tpMult / 100);

    const calcLongSL = Math.max(0.01, currentBar.close - stopDistance);
    const calcLongTP = currentBar.close + tpDistance;
    const calcShortSL = currentBar.close + stopDistance;
    const calcShortTP = Math.max(0.01, currentBar.close - tpDistance);

    // ==========================================
    // 2. CORE TRIGGER EVALUATION
    // ==========================================

    switch (triggerType) {
      case 'DONCHIAN_BREAKOUT': {
        const period = Number(params.donchianPeriod) || 20;
        const donchian = calculateDonchianChannels(subBars, period);
        const upper = donchian.upper[subCurrentIdx];
        const lower = donchian.lower[subCurrentIdx];
        const prevUpper = donchian.upper[subCurrentIdx - 1];
        const prevLower = donchian.lower[subCurrentIdx - 1];

        if (upper === undefined || lower === undefined) {
          return { action: 'HOLD', price: currentBar.close, timestamp: currentBar.timestamp, reason: 'Canali in calcolo' };
        }

        // Trigger Long Breakout: High/Close crosses above the prior high channel with Stop-on-Quote
        if (currentPosition === 'NONE' && (currentBar.close >= (prevUpper || upper) || currentBar.high >= (prevUpper || upper)) && allFiltersPassed && allowLong) {
          const triggerLevel = prevUpper || upper;
          return {
            action: 'BUY',
            price: currentBar.close,
            timestamp: currentBar.timestamp,
            reason: `[Titan Unger] Breakout Donchian Long (${period} barre) confermato dai Filtri di Regime`,
            orderType: 'STOP',
            targetFillPrice: triggerLevel,
            stopLoss: calcLongSL,
            takeProfit: calcLongTP,
          };
        }

        // Trigger Short Breakout: Low/Close crosses below the prior low channel
        if (currentPosition === 'NONE' && (currentBar.close <= (prevLower || lower) || currentBar.low <= (prevLower || lower)) && allFiltersPassed && allowShort) {
          const triggerLevel = prevLower || lower;
          return {
            action: 'SELL',
            price: currentBar.close,
            timestamp: currentBar.timestamp,
            reason: `[Titan Unger] Breakout Donchian Short (${period} barre) confermato dai Filtri di Regime`,
            orderType: 'STOP',
            targetFillPrice: triggerLevel,
            stopLoss: calcShortSL,
            takeProfit: calcShortTP,
          };
        }

        // Exit if price breaks opposite channel
        if (currentPosition === 'LONG' && currentBar.close < lower) {
          return {
            action: 'EXIT_LONG',
            price: currentBar.close,
            timestamp: currentBar.timestamp,
            reason: `[Titan Unger] Uscita Long su rottura minimo canale Donchian (${period} barre)`,
          };
        }

        if (currentPosition === 'SHORT' && currentBar.close > upper) {
          return {
            action: 'EXIT_SHORT',
            price: currentBar.close,
            timestamp: currentBar.timestamp,
            reason: `[Titan Unger] Uscita Short su rottura massimo canale Donchian (${period} barre)`,
          };
        }
        break;
      }

      case 'PRIOR_DAY_BREAKOUT': {
        // Intraday breakout of previous day's high/low
        let prevDayHigh = currentBar.high;
        let prevDayLow = currentBar.low;
        const currentDayStr = currentBar.dateStr.substring(0, 10);

        for (let i = subLen - 2; i >= 0; i--) {
          const b = subBars[i];
          const bDayStr = b.dateStr.substring(0, 10);
          if (bDayStr !== currentDayStr) {
            prevDayHigh = b.high;
            prevDayLow = b.low;
            break;
          }
        }

        if (currentPosition === 'NONE' && (currentBar.close >= prevDayHigh || currentBar.high >= prevDayHigh) && allFiltersPassed && allowLong) {
          return {
            action: 'BUY',
            price: currentBar.close,
            timestamp: currentBar.timestamp,
            reason: `[Titan Unger] Breakout Massimo Sessione Precedente (€${prevDayHigh.toFixed(2)})`,
            orderType: 'STOP',
            targetFillPrice: prevDayHigh,
            stopLoss: calcLongSL,
            takeProfit: calcLongTP,
          };
        }

        if (currentPosition === 'NONE' && (currentBar.close <= prevDayLow || currentBar.low <= prevDayLow) && allFiltersPassed && allowShort) {
          return {
            action: 'SELL',
            price: currentBar.close,
            timestamp: currentBar.timestamp,
            reason: `[Titan Unger] Breakout Minimo Sessione Precedente (€${prevDayLow.toFixed(2)})`,
            orderType: 'STOP',
            targetFillPrice: prevDayLow,
            stopLoss: calcShortSL,
            takeProfit: calcShortTP,
          };
        }

        if (currentPosition === 'LONG' && currentBar.close < prevDayLow) {
          return {
            action: 'EXIT_LONG',
            price: currentBar.close,
            timestamp: currentBar.timestamp,
            reason: '[Titan Unger] Uscita Long su perdita del minimo della sessione precedente',
          };
        }

        if (currentPosition === 'SHORT' && currentBar.close > prevDayHigh) {
          return {
            action: 'EXIT_SHORT',
            price: currentBar.close,
            timestamp: currentBar.timestamp,
            reason: '[Titan Unger] Uscita Short su rottura del massimo della sessione precedente',
          };
        }
        break;
      }

      case 'BOLLINGER_REVERSAL': {
        const bbPeriod = Number(params.bbPeriod) || 20;
        const bbStdDev = Number(params.bbStdDev) || 2.0;
        const bb = calculateBollingerBands(subCloses, bbPeriod, bbStdDev);
        const lower = bb.lower[subCurrentIdx];
        const upper = bb.upper[subCurrentIdx];
        const middle = bb.middle[subCurrentIdx];

        if (lower !== undefined && middle !== undefined && upper !== undefined) {
          // Mean Reversion Entry Long: Price drops below lower band and closes back inside
          if (currentPosition === 'NONE' && prevBar.close <= (bb.lower[subCurrentIdx - 1] || lower) && currentBar.close > lower && allFiltersPassed && allowLong) {
            return {
              action: 'BUY',
              price: currentBar.close,
              timestamp: currentBar.timestamp,
              reason: `[Titan Unger] Reversal Mean Reverting Long su Banda Inferiore Bollinger (${bbPeriod} p)`,
              stopLoss: calcLongSL,
              takeProfit: middle, // Target on SMA middle band
            };
          }

          // Mean Reversion Entry Short: Price rises above upper band and closes back inside
          if (currentPosition === 'NONE' && prevBar.close >= (bb.upper[subCurrentIdx - 1] || upper) && currentBar.close < upper && allFiltersPassed && allowShort) {
            return {
              action: 'SELL',
              price: currentBar.close,
              timestamp: currentBar.timestamp,
              reason: `[Titan Unger] Reversal Mean Reverting Short su Banda Superiore Bollinger (${bbPeriod} p)`,
              stopLoss: calcShortSL,
              takeProfit: middle, // Target on SMA middle band
            };
          }

          if (currentPosition === 'LONG' && currentBar.close >= (upper || middle)) {
            return {
              action: 'EXIT_LONG',
              price: currentBar.close,
              timestamp: currentBar.timestamp,
              reason: '[Titan Unger] Target Mean Reversion Long raggiunto sulla banda superiore/mediana',
            };
          }

          if (currentPosition === 'SHORT' && currentBar.close <= (lower || middle)) {
            return {
              action: 'EXIT_SHORT',
              price: currentBar.close,
              timestamp: currentBar.timestamp,
              reason: '[Titan Unger] Target Mean Reversion Short raggiunto sulla banda inferiore/mediana',
            };
          }
        }
        break;
      }

      case 'SUPER_TREND': {
        const st = calculateSuperTrend(subBars, 10, 3.0);
        const currDir = st.direction[subCurrentIdx];
        const prevDir = st.direction[subCurrentIdx - 1];

        if (currentPosition === 'NONE' && currDir === 1 && prevDir === -1 && allFiltersPassed && allowLong) {
          return {
            action: 'BUY',
            price: currentBar.close,
            timestamp: currentBar.timestamp,
            reason: '[Titan Unger] Inversione Rialzista SuperTrend validata dai Filtri',
            stopLoss: calcLongSL,
            takeProfit: calcLongTP,
          };
        }

        if (currentPosition === 'NONE' && currDir === -1 && prevDir === 1 && allFiltersPassed && allowShort) {
          return {
            action: 'SELL',
            price: currentBar.close,
            timestamp: currentBar.timestamp,
            reason: '[Titan Unger] Inversione Ribassista SuperTrend validata dai Filtri',
            stopLoss: calcShortSL,
            takeProfit: calcShortTP,
          };
        }

        if (currentPosition === 'LONG' && currDir === -1) {
          return {
            action: 'EXIT_LONG',
            price: currentBar.close,
            timestamp: currentBar.timestamp,
            reason: '[Titan Unger] Inversione Ribassista SuperTrend (Exit Long)',
          };
        }

        if (currentPosition === 'SHORT' && currDir === 1) {
          return {
            action: 'EXIT_SHORT',
            price: currentBar.close,
            timestamp: currentBar.timestamp,
            reason: '[Titan Unger] Inversione Rialzista SuperTrend (Exit Short)',
          };
        }
        break;
      }

      case 'EMA_CROSSOVER': {
        const fastP = Number(params.emaFast) || 12;
        const slowP = Number(params.emaSlow) || 26;
        const emaF = calculateEMA(subCloses, fastP);
        const emaS = calculateEMA(subCloses, slowP);

        const currF = emaF[subCurrentIdx];
        const currS = emaS[subCurrentIdx];
        const prevF = emaF[subCurrentIdx - 1];
        const prevS = emaS[subCurrentIdx - 1];

        if (currF !== undefined && currS !== undefined && prevF !== undefined && prevS !== undefined) {
          if (currentPosition === 'NONE' && prevF <= prevS && currF > currS && allFiltersPassed && allowLong) {
            return {
              action: 'BUY',
              price: currentBar.close,
              timestamp: currentBar.timestamp,
              reason: `[Titan Unger] Incrocio Rialzista EMA ${fastP}/${slowP}`,
              stopLoss: calcLongSL,
              takeProfit: calcLongTP,
            };
          }

          if (currentPosition === 'NONE' && prevF >= prevS && currF < currS && allFiltersPassed && allowShort) {
            return {
              action: 'SELL',
              price: currentBar.close,
              timestamp: currentBar.timestamp,
              reason: `[Titan Unger] Incrocio Ribassista EMA ${fastP}/${slowP}`,
              stopLoss: calcShortSL,
              takeProfit: calcShortTP,
            };
          }

          if (currentPosition === 'LONG' && currF < currS) {
            return {
              action: 'EXIT_LONG',
              price: currentBar.close,
              timestamp: currentBar.timestamp,
              reason: '[Titan Unger] Incrocio Ribassista EMA (Uscita Long)',
            };
          }

          if (currentPosition === 'SHORT' && currF > currS) {
            return {
              action: 'EXIT_SHORT',
              price: currentBar.close,
              timestamp: currentBar.timestamp,
              reason: '[Titan Unger] Incrocio Rialzista EMA (Uscita Short)',
            };
          }
        }
        break;
      }

      case 'RSI_EXTREME': {
        const rsiP = Number(params.rsiPeriod) || 14;
        const os = Number(params.rsiOversold) || 30;
        const ob = Number(params.rsiOverbought) || 70;
        const rsi = calculateRSI(subCloses, rsiP);
        const currRsi = rsi[subCurrentIdx];
        const prevRsi = rsi[subCurrentIdx - 1];

        if (currRsi !== undefined && prevRsi !== undefined) {
          if (currentPosition === 'NONE' && prevRsi <= os && currRsi > os && allFiltersPassed && allowLong) {
            return {
              action: 'BUY',
              price: currentBar.close,
              timestamp: currentBar.timestamp,
              reason: `[Titan Unger] Reversal RSI Ipervenduto (${currRsi.toFixed(1)} > ${os})`,
              stopLoss: calcLongSL,
              takeProfit: calcLongTP,
            };
          }

          if (currentPosition === 'NONE' && prevRsi >= ob && currRsi < ob && allFiltersPassed && allowShort) {
            return {
              action: 'SELL',
              price: currentBar.close,
              timestamp: currentBar.timestamp,
              reason: `[Titan Unger] Reversal RSI Ipercomprato (${currRsi.toFixed(1)} < ${ob})`,
              stopLoss: calcShortSL,
              takeProfit: calcShortTP,
            };
          }

          if (currentPosition === 'LONG' && currRsi >= ob) {
            return {
              action: 'EXIT_LONG',
              price: currentBar.close,
              timestamp: currentBar.timestamp,
              reason: `[Titan Unger] Uscita Long su RSI Ipercomprato (${currRsi.toFixed(1)} >= ${ob})`,
            };
          }

          if (currentPosition === 'SHORT' && currRsi <= os) {
            return {
              action: 'EXIT_SHORT',
              price: currentBar.close,
              timestamp: currentBar.timestamp,
              reason: `[Titan Unger] Uscita Short su RSI Ipervenduto (${currRsi.toFixed(1)} <= ${os})`,
            };
          }
        }
        break;
      }

      case 'DAY_OF_WEEK_BIAS': {
        const d = new Date(currentBar.timestamp);
        const targetDay = Number(params.biasDay) || 2; // e.g. Tuesday
        if (currentPosition === 'NONE' && d.getDay() === targetDay && allFiltersPassed) {
          return {
            action: 'BUY',
            price: currentBar.close,
            timestamp: currentBar.timestamp,
            reason: `[Titan Unger] Ingresso Stagionale su Bias Giorno Settimana (${targetDay})`,
            stopLoss: calcLongSL,
            takeProfit: calcLongTP,
          };
        }
        if (currentPosition === 'LONG' && d.getDay() !== targetDay) {
          return {
            action: 'EXIT_LONG',
            price: currentBar.close,
            timestamp: currentBar.timestamp,
            reason: '[Titan Unger] Chiusura Sessione Bias Settimanale',
          };
        }
        break;
      }
    }

    return {
      action: 'HOLD',
      price: currentBar.close,
      timestamp: currentBar.timestamp,
      reason: allFiltersPassed ? 'In attesa di setup trigger' : 'Filtro di Regime Unger Attivo',
    };
  },

  computeIndicators(
    bars: Bar[],
    params: Record<string, number | boolean | string>
  ): {
    name: string;
    data: (number | undefined)[];
    color: string;
    overlayOnPrice: boolean;
  }[] {
    const closes = bars.map((b) => b.close);
    const triggerType = (params.triggerType as UngerCoreTriggerType) || 'DONCHIAN_BREAKOUT';
    const indicatorsList: { name: string; data: (number | undefined)[]; color: string; overlayOnPrice: boolean }[] = [];

    // 1. Trend Filter Overlay (SMA 200)
    if (params.trendFilterEnabled) {
      const p = Number(params.trendFilterPeriod) || 200;
      const sma = calculateSMA(closes, p);
      indicatorsList.push({
        name: `Filtro Trend Unger (SMA ${p})`,
        data: sma,
        color: '#f59e0b', // amber
        overlayOnPrice: true,
      });
    }

    // 2. Trigger Specific Indicators
    if (triggerType === 'DONCHIAN_BREAKOUT') {
      const p = Number(params.donchianPeriod) || 20;
      const donchian = calculateDonchianChannels(bars, p);
      indicatorsList.push(
        { name: `Donchian Upper (${p})`, data: donchian.upper, color: '#06b6d4', overlayOnPrice: true },
        { name: `Donchian Lower (${p})`, data: donchian.lower, color: '#ec4899', overlayOnPrice: true }
      );
    } else if (triggerType === 'BOLLINGER_REVERSAL') {
      const p = Number(params.bbPeriod) || 20;
      const bb = calculateBollingerBands(closes, p, 2.0);
      indicatorsList.push(
        { name: `BB Upper (${p})`, data: bb.upper, color: '#38bdf8', overlayOnPrice: true },
        { name: `BB Lower (${p})`, data: bb.lower, color: '#a855f7', overlayOnPrice: true }
      );
    } else if (triggerType === 'EMA_CROSSOVER') {
      const fast = Number(params.emaFast) || 12;
      const slow = Number(params.emaSlow) || 26;
      indicatorsList.push(
        { name: `EMA Fast (${fast})`, data: calculateEMA(closes, fast), color: '#10b981', overlayOnPrice: true },
        { name: `EMA Slow (${slow})`, data: calculateEMA(closes, slow), color: '#ef4444', overlayOnPrice: true }
      );
    }

    return indicatorsList;
  },
};
