/**
 * QuantLab - Quantitative Technical Indicators Engine
 * Mathematical implementations without look-ahead bias
 */
import { Bar } from '../types';

/**
 * Simple Moving Average (SMA)
 */
export function calculateSMA(data: number[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length);
  let sum = 0;

  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (i >= period) {
      sum -= data[i - period];
    }
    if (i >= period - 1) {
      result[i] = sum / period;
    } else {
      result[i] = undefined;
    }
  }

  return result;
}

/**
 * Exponential Moving Average (EMA)
 */
export function calculateEMA(data: number[], period: number): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length);
  const k = 2 / (period + 1);
  let ema: number | undefined = undefined;

  // First seed with SMA
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      sum += data[i];
      result[i] = undefined;
    } else if (i === period - 1) {
      sum += data[i];
      ema = sum / period;
      result[i] = ema;
    } else {
      ema = data[i] * k + (ema as number) * (1 - k);
      result[i] = ema;
    }
  }

  return result;
}

/**
 * Relative Strength Index (RSI - Wilder's Smoothing)
 */
export function calculateRSI(data: number[], period: number = 14): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(data.length);
  if (data.length <= period) return result;

  let gains = 0;
  let losses = 0;

  // First period
  for (let i = 1; i <= period; i++) {
    const change = data[i] - data[i - 1];
    if (change >= 0) gains += change;
    else losses += Math.abs(change);
    result[i - 1] = undefined;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) {
    result[period] = 100;
  } else {
    const rs = avgGain / avgLoss;
    result[period] = 100 - (100 / (1 + rs));
  }

  for (let i = period + 1; i < data.length; i++) {
    const change = data[i] - data[i - 1];
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - (100 / (1 + rs));
    }
  }

  return result;
}

/**
 * Moving Average Convergence Divergence (MACD)
 */
export interface MACDResult {
  macd: (number | undefined)[];
  signal: (number | undefined)[];
  histogram: (number | undefined)[];
}

export function calculateMACD(
  data: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult {
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);

  const macdLine: (number | undefined)[] = new Array(data.length);
  const validMacdValues: number[] = [];
  const validMacdIndices: number[] = [];

  for (let i = 0; i < data.length; i++) {
    if (fastEMA[i] !== undefined && slowEMA[i] !== undefined) {
      const val = (fastEMA[i] as number) - (slowEMA[i] as number);
      macdLine[i] = val;
      validMacdValues.push(val);
      validMacdIndices.push(i);
    } else {
      macdLine[i] = undefined;
    }
  }

  const signalEMA = calculateEMA(validMacdValues, signalPeriod);
  const signalLine: (number | undefined)[] = new Array(data.length);
  const histogram: (number | undefined)[] = new Array(data.length);

  for (let k = 0; k < validMacdIndices.length; k++) {
    const originalIndex = validMacdIndices[k];
    const sigVal = signalEMA[k];
    signalLine[originalIndex] = sigVal;
    if (sigVal !== undefined && macdLine[originalIndex] !== undefined) {
      histogram[originalIndex] = (macdLine[originalIndex] as number) - sigVal;
    } else {
      histogram[originalIndex] = undefined;
    }
  }

  return {
    macd: macdLine,
    signal: signalLine,
    histogram,
  };
}

/**
 * Bollinger Bands
 */
export interface BollingerBandsResult {
  upper: (number | undefined)[];
  middle: (number | undefined)[];
  lower: (number | undefined)[];
  bandwidth: (number | undefined)[];
}

export function calculateBollingerBands(
  data: number[],
  period: number = 20,
  stdDevMultiplier: number = 2.0
): BollingerBandsResult {
  const middle = calculateSMA(data, period);
  const upper: (number | undefined)[] = new Array(data.length);
  const lower: (number | undefined)[] = new Array(data.length);
  const bandwidth: (number | undefined)[] = new Array(data.length);

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1 || middle[i] === undefined) {
      upper[i] = undefined;
      lower[i] = undefined;
      bandwidth[i] = undefined;
      continue;
    }

    const mid = middle[i] as number;
    let sumSquares = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = data[j] - mid;
      sumSquares += diff * diff;
    }
    const stdDev = Math.sqrt(sumSquares / period);
    upper[i] = mid + stdDevMultiplier * stdDev;
    lower[i] = mid - stdDevMultiplier * stdDev;
    bandwidth[i] = mid !== 0 ? ((upper[i] as number) - (lower[i] as number)) / mid : 0;
  }

  return { upper, middle, lower, bandwidth };
}

/**
 * Average True Range (ATR)
 */
export function calculateATR(bars: Bar[], period: number = 14): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(bars.length);
  if (bars.length === 0) return result;

  const trueRanges: number[] = new Array(bars.length);
  trueRanges[0] = bars[0].high - bars[0].low;

  for (let i = 1; i < bars.length; i++) {
    const currentHigh = bars[i].high;
    const currentLow = bars[i].low;
    const prevClose = bars[i - 1].close;

    const tr1 = currentHigh - currentLow;
    const tr2 = Math.abs(currentHigh - prevClose);
    const tr3 = Math.abs(currentLow - prevClose);
    trueRanges[i] = Math.max(tr1, tr2, tr3);
  }

  // Smooth ATR (Wilder's method)
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i < period - 1) {
      sum += trueRanges[i];
      result[i] = undefined;
    } else if (i === period - 1) {
      sum += trueRanges[i];
      result[i] = sum / period;
    } else {
      result[i] = ((result[i - 1] as number) * (period - 1) + trueRanges[i]) / period;
    }
  }

  return result;
}

/**
 * SuperTrend Indicator
 */
export interface SuperTrendResult {
  superTrend: (number | undefined)[];
  direction: (1 | -1 | undefined)[]; // 1 for UP/BULL, -1 for DOWN/BEAR
}

export function calculateSuperTrend(
  bars: Bar[],
  period: number = 10,
  multiplier: number = 3.0
): SuperTrendResult {
  const atr = calculateATR(bars, period);
  const superTrend: (number | undefined)[] = new Array(bars.length);
  const direction: (1 | -1 | undefined)[] = new Array(bars.length);

  let prevUpperBand = 0;
  let prevLowerBand = 0;
  let prevSuperTrend = 0;
  let prevDirection: 1 | -1 = 1;

  for (let i = 0; i < bars.length; i++) {
    const currentAtr = atr[i];
    if (currentAtr === undefined) {
      superTrend[i] = undefined;
      direction[i] = undefined;
      continue;
    }

    const hl2 = (bars[i].high + bars[i].low) / 2;
    let basicUpperBand = hl2 + multiplier * currentAtr;
    let basicLowerBand = hl2 - multiplier * currentAtr;

    let finalUpperBand = basicUpperBand;
    let finalLowerBand = basicLowerBand;

    if (i > 0 && atr[i - 1] !== undefined) {
      const prevClose = bars[i - 1].close;
      if (basicUpperBand < prevUpperBand || prevClose > prevUpperBand) {
        finalUpperBand = basicUpperBand;
      } else {
        finalUpperBand = prevUpperBand;
      }

      if (basicLowerBand > prevLowerBand || prevClose < prevLowerBand) {
        finalLowerBand = basicLowerBand;
      } else {
        finalLowerBand = prevLowerBand;
      }
    }

    let currentDir: 1 | -1 = 1;
    let currentST = finalLowerBand;

    if (i === 0 || atr[i - 1] === undefined) {
      currentDir = 1;
      currentST = finalLowerBand;
    } else {
      if (prevSuperTrend === prevUpperBand) {
        currentDir = bars[i].close > finalUpperBand ? 1 : -1;
      } else {
        currentDir = bars[i].close < finalLowerBand ? -1 : 1;
      }
      currentST = currentDir === 1 ? finalLowerBand : finalUpperBand;
    }

    superTrend[i] = currentST;
    direction[i] = currentDir;

    prevUpperBand = finalUpperBand;
    prevLowerBand = finalLowerBand;
    prevSuperTrend = currentST;
    prevDirection = currentDir;
  }

  return { superTrend, direction };
}

/**
 * Volume-Weighted Average Price (VWAP)
 */
export function calculateVWAP(bars: Bar[]): (number | undefined)[] {
  const result: (number | undefined)[] = new Array(bars.length);
  let cumulativeTypicalVol = 0;
  let cumulativeVolume = 0;
  let lastDay = '';

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const dayStr = bar.dateStr.split(' ')[0] || bar.dateStr;

    // Reset daily on intraday data
    if (dayStr !== lastDay) {
      cumulativeTypicalVol = 0;
      cumulativeVolume = 0;
      lastDay = dayStr;
    }

    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    cumulativeTypicalVol += typicalPrice * bar.volume;
    cumulativeVolume += bar.volume;

    result[i] = cumulativeVolume > 0 ? cumulativeTypicalVol / cumulativeVolume : typicalPrice;
  }

  return result;
}

/**
 * Donchian Channels
 */
export interface DonchianResult {
  upper: (number | undefined)[];
  middle: (number | undefined)[];
  lower: (number | undefined)[];
}

export function calculateDonchianChannels(bars: Bar[], period: number = 20): DonchianResult {
  const upper: (number | undefined)[] = new Array(bars.length);
  const lower: (number | undefined)[] = new Array(bars.length);
  const middle: (number | undefined)[] = new Array(bars.length);

  for (let i = 0; i < bars.length; i++) {
    if (i < period) {
      upper[i] = undefined;
      lower[i] = undefined;
      middle[i] = undefined;
      continue;
    }

    let maxHigh = -Infinity;
    let minLow = Infinity;
    // Donchian uses previous N bars (excluding current bar to avoid look-ahead)
    for (let j = i - period; j < i; j++) {
      if (bars[j].high > maxHigh) maxHigh = bars[j].high;
      if (bars[j].low < minLow) minLow = bars[j].low;
    }

    upper[i] = maxHigh;
    lower[i] = minLow;
    middle[i] = (maxHigh + minLow) / 2;
  }

  return { upper, middle, lower };
}
