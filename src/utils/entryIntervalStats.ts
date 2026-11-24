import { EntryIntervalStats, Trade } from '../types';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return parseFloat(sorted[idx].toFixed(2));
}

export function calculateEntryIntervalStats(trades: Trade[]): EntryIntervalStats {
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

  const ordered = [...trades].sort((a, b) => a.entryTimestamp - b.entryTimestamp);
  const firstTs = ordered[0].entryTimestamp;
  const lastTs = ordered[ordered.length - 1].exitTimestamp || ordered[ordered.length - 1].entryTimestamp;
  const spanDays = Math.max(1, (lastTs - firstTs) / (24 * 60 * 60 * 1000));
  const spanYears = Math.max(1 / 365.25, spanDays / 365.25);

  const intervals: number[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const diffDays = Math.max(0, (ordered[i].entryTimestamp - ordered[i - 1].entryTimestamp) / (24 * 60 * 60 * 1000));
    intervals.push(parseFloat(diffDays.toFixed(2)));
  }

  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const avg =
    intervals.length > 0 ? intervals.reduce((s, v) => s + v, 0) / intervals.length : 0;
  const variance =
    intervals.length > 1
      ? intervals.reduce((s, v) => s + (v - avg) ** 2, 0) / (intervals.length - 1)
      : 0;
  const stdDev = Math.sqrt(variance);
  const median =
    sortedIntervals.length > 0
      ? sortedIntervals[Math.floor(sortedIntervals.length / 2)]
      : 0;

  const byYear = new Map<number, number>();
  for (const t of ordered) {
    const y = new Date(t.entryTimestamp).getUTCFullYear();
    byYear.set(y, (byYear.get(y) || 0) + 1);
  }
  const yearlyDistribution = Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, count]) => ({ year, count, label: String(year) }));

  const tradesPerYear = parseFloat((ordered.length / spanYears).toFixed(2));
  const maxPause = sortedIntervals.length > 0 ? sortedIntervals[sortedIntervals.length - 1] : 0;

  return {
    totalTrades: ordered.length,
    tradesPerYear,
    tradesPerMonth: parseFloat((tradesPerYear / 12).toFixed(2)),
    avgDaysPerTrade: parseFloat((spanDays / ordered.length).toFixed(2)),
    avgDaysBetweenEntries: parseFloat(avg.toFixed(2)),
    medianDaysBetweenEntries: parseFloat(median.toFixed(2)),
    stdDevDaysBetweenEntries: parseFloat(stdDev.toFixed(2)),
    minDaysBetweenEntries: sortedIntervals.length > 0 ? sortedIntervals[0] : 0,
    maxDaysBetweenEntries: maxPause,
    percentile75: percentile(sortedIntervals, 75),
    percentile90: percentile(sortedIntervals, 90),
    percentile95: percentile(sortedIntervals, 95),
    maxHistoricPause: maxPause,
    yearlyDistribution,
    rawIntervalsDays: intervals,
  };
}
