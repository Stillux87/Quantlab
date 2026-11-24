/**
 * QuantLab - Market Data Integrity, Validation, Session-Aware Timeframe Aggregation & FX Discipline
 *
 * Strict Rules:
 * 1. Never substitute synthetic bars for real historical data.
 * 2. Every series carries explicit provenance: source, timeframe, dataStatus, timestamp, quality audit.
 * 3. 2h and 4h bars are properly aggregated from verified 1h bars respecting trading session days
 *    (never merging across overnight or weekend boundaries, and never labeling raw 1h bars as 2h).
 * 4. Never silently substitute hardcoded FX rates (like 1.085 or 0.92) when live FX is unavailable.
 */
import { Bar, Timeframe } from '../types';

export type DataStatus =
  | 'HISTORICAL_REAL'
  | 'REALTIME'
  | 'DELAYED'
  | 'LAST_AVAILABLE'
  | 'SYNTHETIC_TEST_ONLY'
  | 'UNAVAILABLE';

export interface BarQualityReport {
  rawCount: number;
  validCount: number;
  duplicatesRemoved: number;
  invalidBarsRemoved: number;
  outOfOrderFixed: boolean;
  gapsDetected: number;
  incompleteBarExcluded: boolean;
  warnings: string[];
}

export interface DataProvenance {
  source: string;
  timeframe: Timeframe;
  dataStatus: DataStatus;
  isRealData: boolean;
  isLiveVerified: boolean;
  fetchedAt: string;
  currency?: string;
  exchangeTimezone?: string;
  quality?: BarQualityReport;
  warnings: string[];
}

export interface FxRateResult {
  pair: string;
  rate: number | null; // e.g. EUR/USD = 1.08 => 1 EUR = 1.08 USD
  usdToEur: number | null; // 1 / rate
  isVerified: boolean;
  source: string;
  fetchedAt: string | null;
  status: 'LIVE_VERIFIED' | 'CACHED_RECENT' | 'UNAVAILABLE';
  warning?: string;
}

export function getTimeframeMs(timeframe: Timeframe): number {
  const map: Record<Timeframe, number> = {
    '1m': 60_000,
    '5m': 5 * 60_000,
    '15m': 15 * 60_000,
    '30m': 30 * 60_000,
    '1h': 60 * 60_000,
    '2h': 2 * 60 * 60_000,
    '4h': 4 * 60 * 60_000,
    '1D': 24 * 60 * 60_000,
  };
  return map[timeframe] ?? 60 * 60_000;
}

export function isValidBar(bar: Bar | null | undefined): bar is Bar {
  if (!bar || typeof bar !== 'object') return false;
  const { timestamp, open, high, low, close, volume } = bar;
  if (!Number.isFinite(timestamp) || timestamp <= 0) return false;
  if (
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close)
  ) {
    return false;
  }
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0) return false;
  if (high < low) return false;
  if (high < Math.max(open, close) * 0.999999) return false;
  if (low > Math.min(open, close) * 1.000001) return false;
  if (volume !== undefined && (!Number.isFinite(volume) || volume < 0)) return false;
  return true;
}

/**
 * Validates, repairs ordering, deduplicates timestamps, detects gaps, and optionally excludes
 * the currently forming (incomplete) bar to prevent live/backtest signal leakage.
 */
export function validateAndCleanBars(
  rawBars: Bar[],
  timeframe: Timeframe,
  options?: {
    excludeIncompleteLastBar?: boolean;
    nowMs?: number;
  }
): { bars: Bar[]; quality: BarQualityReport } {
  const warnings: string[] = [];
  const rawCount = Array.isArray(rawBars) ? rawBars.length : 0;

  if (!Array.isArray(rawBars) || rawBars.length === 0) {
    return {
      bars: [],
      quality: {
        rawCount: 0,
        validCount: 0,
        duplicatesRemoved: 0,
        invalidBarsRemoved: 0,
        outOfOrderFixed: false,
        gapsDetected: 0,
        incompleteBarExcluded: false,
        warnings: ['Nessuna candela ricevuta dalla fonte dati.'],
      },
    };
  }

  let invalidBarsRemoved = 0;
  let outOfOrderFixed = false;
  let prevRawTs = -Infinity;

  const validList: Bar[] = [];
  for (const b of rawBars) {
    if (!isValidBar(b)) {
      invalidBarsRemoved++;
      continue;
    }
    if (b.timestamp < prevRawTs) {
      outOfOrderFixed = true;
    }
    prevRawTs = b.timestamp;
    validList.push({
      timestamp: b.timestamp,
      dateStr: b.dateStr || formatBarDate(b.timestamp, timeframe === '1D'),
      open: b.open,
      high: Math.max(b.high, b.open, b.close),
      low: Math.min(b.low, b.open, b.close),
      close: b.close,
      volume: Number.isFinite(b.volume) && b.volume >= 0 ? b.volume : 0,
    });
  }

  // Chronological ascending sort
  validList.sort((a, b) => a.timestamp - b.timestamp);

  // Deduplicate identical timestamps (keep the latest valid observation)
  const deduped: Bar[] = [];
  let duplicatesRemoved = 0;
  for (const bar of validList) {
    if (deduped.length > 0 && deduped[deduped.length - 1].timestamp === bar.timestamp) {
      deduped[deduped.length - 1] = bar;
      duplicatesRemoved++;
    } else {
      deduped.push(bar);
    }
  }

  // Optionally exclude the still-forming current intraday bar
  let incompleteBarExcluded = false;
  const tfMs = getTimeframeMs(timeframe);
  if (options?.excludeIncompleteLastBar && timeframe !== '1D' && deduped.length > 0) {
    const nowMs = options.nowMs ?? Date.now();
    const lastBar = deduped[deduped.length - 1];
    // If bar opened less than one full timeframe interval ago, it is still forming
    if (nowMs - lastBar.timestamp >= 0 && nowMs - lastBar.timestamp < tfMs) {
      deduped.pop();
      incompleteBarExcluded = true;
      warnings.push('Ultima candela intraday in formazione esclusa per evitare segnali su barra incompleta.');
    }
  }

  // Detect anomalous gaps (ignoring regular weekends/overnights for daily/intraday)
  let gapsDetected = 0;
  const gapThresholdMs = timeframe === '1D' ? 6 * 86_400_000 : 4 * 86_400_000;
  for (let i = 1; i < deduped.length; i++) {
    const delta = deduped[i].timestamp - deduped[i - 1].timestamp;
    if (delta > gapThresholdMs) {
      gapsDetected++;
    }
  }

  if (invalidBarsRemoved > 0) {
    warnings.push(`Rimosse ${invalidBarsRemoved} candele con valori OHLCV non validi o anomali.`);
  }
  if (duplicatesRemoved > 0) {
    warnings.push(`Rimosse ${duplicatesRemoved} candele duplicate sullo stesso timestamp.`);
  }
  if (outOfOrderFixed) {
    warnings.push('Ordinamento cronologico corretto automaticamente.');
  }
  if (gapsDetected > 0) {
    warnings.push(`Rilevati ${gapsDetected} gap temporali significativi nella serie storica.`);
  }

  return {
    bars: deduped,
    quality: {
      rawCount,
      validCount: deduped.length,
      duplicatesRemoved,
      invalidBarsRemoved,
      outOfOrderFixed,
      gapsDetected,
      incompleteBarExcluded,
      warnings,
    },
  };
}

export function formatBarDate(timestamp: number, isDaily: boolean): string {
  const iso = new Date(timestamp).toISOString();
  return isDaily ? iso.slice(0, 10) : iso.replace('T', ' ').slice(0, 16);
}

function getLocalSessionDayKey(timestamp: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
}

/**
 * Properly aggregates verified 1h bars into 2h or 4h bars respecting trading session days
 * and exchange timezones so bars NEVER span overnight or weekend boundaries.
 *
 * - For 2h: groups every 2 consecutive 1h bars within the same trading session day.
 * - For 4h: groups every 4 consecutive 1h bars within the same trading session day.
 * - Partial final session bucket (e.g., 7h US regular session -> 4h + 3h, or 2h+2h+2h+1h)
 *   is retained for completed historical sessions, while currently forming buckets are flagged/dropped
 *   when `dropIncompleteCurrentBucket` is true.
 */
export function aggregateHourlyBars(
  hourlyBars: Bar[],
  targetTimeframe: '2h' | '4h',
  options?: {
    exchangeTimezone?: string;
    dropIncompleteCurrentBucket?: boolean;
    nowMs?: number;
  }
): { bars: Bar[]; warnings: string[] } {
  const bucketSize = targetTimeframe === '2h' ? 2 : 4;
  const tz = options?.exchangeTimezone || 'UTC';
  const nowMs = options?.nowMs ?? Date.now();
  const targetMs = getTimeframeMs(targetTimeframe);
  const warnings: string[] = [];

  const { bars: clean1h, quality } = validateAndCleanBars(hourlyBars, '1h');
  if (quality.warnings.length > 0) {
    warnings.push(...quality.warnings);
  }
  if (clean1h.length === 0) {
    return { bars: [], warnings };
  }

  // Group strictly by exchange local trading date so overnight/weekend gaps are never blended
  const sessionDays = new Map<string, Bar[]>();
  for (const bar of clean1h) {
    const dayKey = getLocalSessionDayKey(bar.timestamp, tz);
    const list = sessionDays.get(dayKey);
    if (list) list.push(bar);
    else sessionDays.set(dayKey, [bar]);
  }

  const aggregated: Bar[] = [];
  const sortedDayKeys = Array.from(sessionDays.keys()).sort();

  for (const dayKey of sortedDayKeys) {
    const dayBars = sessionDays.get(dayKey)!;
    for (let i = 0; i < dayBars.length; i += bucketSize) {
      const slice = dayBars.slice(i, i + bucketSize);
      if (slice.length === 0) continue;

      // Check if there is an intra-day gap > 2 hours inside the slice (e.g. lunch break / halt)
      // If a gap > 2.5h occurs mid-slice, split cleanly so disjoint sessions never merge
      const subChunks: Bar[][] = [[]];
      for (const b of slice) {
        const cur = subChunks[subChunks.length - 1];
        if (cur.length > 0 && b.timestamp - cur[cur.length - 1].timestamp > 2.5 * 3600_000) {
          subChunks.push([b]);
        } else {
          cur.push(b);
        }
      }

      for (const chunk of subChunks) {
        if (chunk.length === 0) continue;
        const first = chunk[0];
        const last = chunk[chunk.length - 1];

        // If this is the most recent bar and still within an unfinished timeframe window
        if (
          options?.dropIncompleteCurrentBucket &&
          chunk.length < bucketSize &&
          nowMs - first.timestamp >= 0 &&
          nowMs - first.timestamp < targetMs
        ) {
          warnings.push(`Ultima barra ${targetTimeframe} incompleta (${chunk.length}/${bucketSize}h) esclusa.`);
          continue;
        }

        let high = -Infinity;
        let low = Infinity;
        let volume = 0;
        for (const b of chunk) {
          if (b.high > high) high = b.high;
          if (b.low < low) low = b.low;
          volume += b.volume || 0;
        }

        aggregated.push({
          timestamp: first.timestamp,
          dateStr: formatBarDate(first.timestamp, false),
          open: first.open,
          high,
          low,
          close: last.close,
          volume,
        });
      }
    }
  }

  return { bars: aggregated, warnings };
}

/**
 * Strictly converts an amount to EUR without EVER falling back to hardcoded FX rates.
 * Returns ok: false when conversion is required but verified FX is missing.
 */
export function convertToEurStrict(
  amount: number,
  currency: string,
  fxRateToEur: number | null | undefined
):
  | { ok: true; amountEur: number; fxUsed: number; error?: string }
  | { ok: false; amountEur: null; fxUsed?: number; error: string } {
  if (!Number.isFinite(amount)) {
    return { ok: false, amountEur: null, error: 'Importo non numerico.' };
  }
  const cur = (currency || '').trim().toUpperCase();
  if (cur === 'EUR') {
    return { ok: true, amountEur: amount, fxUsed: 1.0 };
  }
  if (typeof fxRateToEur !== 'number' || !Number.isFinite(fxRateToEur) || fxRateToEur <= 0) {
    return {
      ok: false,
      amountEur: null,
      error: `Tasso di cambio reale ${cur}/EUR non disponibile: impossibile aggregare importi in EUR senza cambio verificato.`,
    };
  }
  return {
    ok: true,
    amountEur: amount * fxRateToEur,
    fxUsed: fxRateToEur,
  };
}
