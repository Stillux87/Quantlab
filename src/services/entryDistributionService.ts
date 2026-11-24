/**
 * QuantLab - Entry Distribution & Inactivity Diagnostic Service
 *
 * Implements rigorous statistical analysis of trade entry intervals,
 * inter-trade pauses, frequency distribution over time, and non-prescriptive
 * historical anomaly detection for live monitoring and backtesting.
 */
import { Trade, EntryIntervalStats, InactivityAnalysis, InactivityStatus } from '../types';

/**
 * Calculates a given percentile (0 - 100) from a sorted array of numbers
 * using linear interpolation between closest ranks.
 */
export function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (!sortedValues || sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  if (percentile <= 0) return sortedValues[0];
  if (percentile >= 100) return sortedValues[sortedValues.length - 1];

  const p = percentile / 100;
  const index = p * (sortedValues.length - 1);
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  const weight = index - lowerIndex;

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight;
}

/**
 * Computes comprehensive statistical distribution of trade entries and inter-trade pauses.
 */
export function calculateEntryDistribution(
  trades: Trade[],
  startDateStr?: string,
  endDateStr?: string
): EntryIntervalStats {
  if (!trades || trades.length === 0) {
    return {
      totalTrades: 0,
      tradesPerYear: 0,
      tradesPerMonth: 0,
      avgDaysPerTrade: 0,
      avgDaysBetweenEntries: 0,
      medianDaysBetweenEntries: 0,
      stdDevDaysBetweenEntries: 0,
      minDaysBetweenEntries: 0,
      maxDaysBetweenEntries: 0,
      percentile75: 0,
      percentile90: 0,
      percentile95: 0,
      maxHistoricPause: 0,
      yearlyDistribution: [],
      rawIntervalsDays: [],
    };
  }

  // Sort trades chronologically by entry timestamp
  const sortedTrades = [...trades].sort((a, b) => {
    const timeA = a.entryTimestamp || new Date(a.entryDateStr).getTime() || 0;
    const timeB = b.entryTimestamp || new Date(b.entryDateStr).getTime() || 0;
    return timeA - timeB;
  });

  const totalTrades = sortedTrades.length;

  // Determine backtest date boundaries
  const firstTradeTime = sortedTrades[0].entryTimestamp || new Date(sortedTrades[0].entryDateStr).getTime();
  const lastTradeTime =
    sortedTrades[sortedTrades.length - 1].entryTimestamp ||
    new Date(sortedTrades[sortedTrades.length - 1].entryDateStr).getTime();

  let backtestStartTs = startDateStr ? new Date(startDateStr).getTime() : firstTradeTime;
  let backtestEndTs = endDateStr ? new Date(endDateStr).getTime() : lastTradeTime;

  if (isNaN(backtestStartTs) || backtestStartTs > firstTradeTime) {
    backtestStartTs = firstTradeTime;
  }
  if (isNaN(backtestEndTs) || backtestEndTs < lastTradeTime) {
    backtestEndTs = lastTradeTime;
  }

  const totalSpanMs = Math.max(86400000, backtestEndTs - backtestStartTs);
  const totalYears = Math.max(0.08, totalSpanMs / (1000 * 60 * 60 * 24 * 365.25));

  // 1. Calculate intervals between consecutive trade entries (in days)
  const intervalsDays: number[] = [];
  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  for (let i = 0; i < sortedTrades.length - 1; i++) {
    const tCurrent = sortedTrades[i].entryTimestamp || new Date(sortedTrades[i].entryDateStr).getTime();
    const tNext = sortedTrades[i + 1].entryTimestamp || new Date(sortedTrades[i + 1].entryDateStr).getTime();
    const diffDays = Math.max(0, (tNext - tCurrent) / MS_PER_DAY);
    intervalsDays.push(diffDays);
  }

  // Also calculate boundary idle spans
  const initialIdleDays = Math.max(0, (firstTradeTime - backtestStartTs) / MS_PER_DAY);
  const finalIdleDays = Math.max(0, (backtestEndTs - lastTradeTime) / MS_PER_DAY);

  // If only 1 trade exists, intervals is 0, pause is the maximum boundary
  const effectiveIntervals = intervalsDays.length > 0 ? [...intervalsDays] : [0];
  const sortedIntervals = [...effectiveIntervals].sort((a, b) => a - b);

  // Summary statistics
  const sumIntervals = effectiveIntervals.reduce((acc, v) => acc + v, 0);
  const avgDaysBetweenEntries = effectiveIntervals.length > 0 ? sumIntervals / effectiveIntervals.length : 0;
  const medianDaysBetweenEntries = calculatePercentile(sortedIntervals, 50);

  // Variance & Standard deviation
  const variance =
    effectiveIntervals.length > 1
      ? effectiveIntervals.reduce((acc, v) => acc + Math.pow(v - avgDaysBetweenEntries, 2), 0) /
        (effectiveIntervals.length - 1)
      : 0;
  const stdDevDaysBetweenEntries = Math.sqrt(variance);

  const minDaysBetweenEntries = sortedIntervals[0] || 0;
  const maxDaysBetweenEntries = sortedIntervals[sortedIntervals.length - 1] || 0;

  const percentile75 = calculatePercentile(sortedIntervals, 75);
  const percentile90 = calculatePercentile(sortedIntervals, 90);
  const percentile95 = calculatePercentile(sortedIntervals, 95);

  // The maximum historic pause is the greatest period without entries:
  // comparing all inter-trade gaps as well as the startup wait and shutdown period.
  const maxHistoricPause = Math.max(maxDaysBetweenEntries, initialIdleDays, finalIdleDays);

  // Frequencies
  const tradesPerYear = parseFloat((totalTrades / totalYears).toFixed(1));
  const tradesPerMonth = parseFloat((tradesPerYear / 12).toFixed(1));
  const avgDaysPerTrade = tradesPerYear > 0 ? parseFloat((365.25 / tradesPerYear).toFixed(1)) : 0;

  // 2. Yearly breakdown of trade entries
  const currentYear = new Date().getFullYear();
  const yearlyCountMap = new Map<number, number>();

  for (const t of sortedTrades) {
    let year = 2024;
    if (t.entryDateStr) {
      const match = t.entryDateStr.match(/^(\d{4})/);
      if (match) year = parseInt(match[1], 10);
      else if (t.entryTimestamp) year = new Date(t.entryTimestamp).getFullYear();
    } else if (t.entryTimestamp) {
      year = new Date(t.entryTimestamp).getFullYear();
    }
    yearlyCountMap.set(year, (yearlyCountMap.get(year) || 0) + 1);
  }

  const sortedYears = Array.from(yearlyCountMap.keys()).sort((a, b) => a - b);
  const yearlyDistribution = sortedYears.map((year) => ({
    year,
    count: yearlyCountMap.get(year) || 0,
    label: year === currentYear ? `${year} YTD` : `${year}`,
  }));

  return {
    totalTrades,
    tradesPerYear,
    tradesPerMonth,
    avgDaysPerTrade,
    avgDaysBetweenEntries: parseFloat(avgDaysBetweenEntries.toFixed(1)),
    medianDaysBetweenEntries: parseFloat(medianDaysBetweenEntries.toFixed(1)),
    stdDevDaysBetweenEntries: parseFloat(stdDevDaysBetweenEntries.toFixed(1)),
    minDaysBetweenEntries: parseFloat(minDaysBetweenEntries.toFixed(1)),
    maxDaysBetweenEntries: parseFloat(maxDaysBetweenEntries.toFixed(1)),
    percentile75: parseFloat(percentile75.toFixed(1)),
    percentile90: parseFloat(percentile90.toFixed(1)),
    percentile95: parseFloat(percentile95.toFixed(1)),
    maxHistoricPause: parseFloat(maxHistoricPause.toFixed(1)),
    yearlyDistribution,
    rawIntervalsDays: effectiveIntervals,
  };
}

/**
 * Evaluates the current period of inactivity against the strategy's historical entry distribution.
 *
 * Implements the 4-tier classification:
 *  🟢 NORMALE (<= p90)
 *  🟡 ATTESA ELEVATA (p90 < days <= p95)
 *  🟠 INUSUALE (p95 < days <= maxHistoricPause)
 *  🔴 ANOMALO (> maxHistoricPause)
 *
 * Adheres strictly to the statistical disclaimer:
 * Does NOT generate false expectations or predict when the next trade arrives.
 */
export function analyzeInactivity(
  stats: EntryIntervalStats,
  daysSinceLastEntry: number,
  lastEntryDateStr: string = 'N/D'
): InactivityAnalysis {
  const safeDays = Math.max(0, daysSinceLastEntry);
  const roundedDays = Math.round(safeDays);

  const p90 = stats.percentile90 || 14;
  const p95 = stats.percentile95 || 21;
  const maxHistoric = stats.maxHistoricPause || Math.max(p95 * 1.5, 30);
  const median = stats.medianDaysBetweenEntries || 5;

  let status: InactivityStatus = 'NORMAL';
  let statusLabel = 'Inattività Normale';
  let statusBadgeColor = 'emerald';
  let statusIcon = '🟢';
  let syntheticDiagnosticPhrase = '';
  let detailedDiagnosticMessage = '';

  if (safeDays <= p90) {
    status = 'NORMAL';
    statusLabel = 'Inattività Normale';
    statusBadgeColor = 'emerald';
    statusIcon = '🟢';
    syntheticDiagnosticPhrase = `Nessun ingresso da ${roundedDays} giorni — comportamento normale per questa strategia.`;
    detailedDiagnosticMessage = `${roundedDays} giorni senza ingressi. Storicamente la strategia presenta periodi di inattività fino a ${p90.toFixed(
      0
    )} giorni con frequenza normale.`;
  } else if (safeDays <= p95) {
    status = 'ELEVATED_WAIT';
    statusLabel = 'Attesa Elevata';
    statusBadgeColor = 'amber';
    statusIcon = '🟡';
    syntheticDiagnosticPhrase = `Nessun ingresso da ${roundedDays} giorni — pausa superiore alla norma storica.`;
    detailedDiagnosticMessage = `Periodo di inattività (${roundedDays} giorni) superiore alla norma storica (> 90° percentile di ${p90.toFixed(
      0
    )} gg). Non è ancora un'anomalia significativa.`;
  } else if (safeDays <= maxHistoric) {
    status = 'UNUSUAL';
    statusLabel = 'Inusuale';
    statusBadgeColor = 'orange';
    statusIcon = '🟠';
    syntheticDiagnosticPhrase = `Nessun ingresso da ${roundedDays} giorni — pausa statisticamente insolita.`;
    detailedDiagnosticMessage = `Periodo senza ingressi (${roundedDays} giorni) statisticamente insolito rispetto allo storico (> 95° percentile di ${p95.toFixed(
      0
    )} gg). Monitorare la strategia.`;
  } else {
    status = 'ANOMALOUS';
    statusLabel = 'Anomalo';
    statusBadgeColor = 'rose';
    statusIcon = '🔴';
    syntheticDiagnosticPhrase = `Nessun ingresso da ${roundedDays} giorni — pausa superiore al massimo storico. Verificare.`;
    detailedDiagnosticMessage = `Periodo di inattività eccezionalmente lungo (${roundedDays} giorni) rispetto al comportamento storico (massimo storico: ${maxHistoric.toFixed(
      0
    )} gg). Verificare strategia, dati e condizioni di mercato.`;
  }

  // Calculate approximate percentile reached in the historical intervals
  let percentileAchieved = 0;
  if (stats.rawIntervalsDays && stats.rawIntervalsDays.length > 0) {
    const smallerOrEqual = stats.rawIntervalsDays.filter((v) => v <= safeDays).length;
    percentileAchieved = Math.min(100, Math.round((smallerOrEqual / stats.rawIntervalsDays.length) * 100));
  } else {
    percentileAchieved = safeDays <= p90 ? 50 : safeDays <= p95 ? 92 : 98;
  }

  const pauseRatioToMedian = median > 0 ? parseFloat((safeDays / median).toFixed(1)) : 1.0;
  const isAboveHistoricMax = safeDays > maxHistoric;

  const summaryPhrasePause90 = `Il 90% delle pause storiche è stato inferiore a ${p90.toFixed(0)} giorni.`;

  return {
    status,
    statusLabel,
    statusBadgeColor,
    statusIcon,
    daysSinceLastEntry: safeDays,
    lastEntryDateStr,
    syntheticDiagnosticPhrase,
    detailedDiagnosticMessage,
    percentileAchieved,
    isAboveHistoricMax,
    pauseRatioToMedian,
    summaryPhrasePause90,
  };
}

/**
 * Derives the days elapsed since the latest entry among trades or session context.
 */
export function getDaysSinceLastEntry(
  trades: Trade[],
  referenceTimestamp: number = Date.now()
): { days: number; lastDateStr: string } {
  if (!trades || trades.length === 0) {
    return { days: 0, lastDateStr: 'Nessun ingresso' };
  }

  let latestEntryTs = 0;
  let latestDateStr = '';

  for (const t of trades) {
    const ts = t.entryTimestamp || new Date(t.entryDateStr).getTime() || 0;
    if (ts > latestEntryTs) {
      latestEntryTs = ts;
      latestDateStr = t.entryDateStr;
    }
  }

  if (latestEntryTs <= 0) {
    return { days: 0, lastDateStr: 'N/D' };
  }

  const diffMs = Math.max(0, referenceTimestamp - latestEntryTs);
  const days = parseFloat((diffMs / (1000 * 60 * 60 * 24)).toFixed(1));

  return { days, lastDateStr: latestDateStr };
}
