/**
 * QuantLab - AI Strategy Discovery Lab Master Coordinator Engine
 * Coordinates autonomous hypothesis synthesis, real-time pruning, genetic mutation,
 * multi-dimensional robustness evaluation, and persistent research logging.
 */
import { Bar, Instrument } from '../../types';
import {
  DiscoveryLabConfig,
  DiscoveryProgressStatus,
  DiscoveryReport,
  ResearchLogEntry,
  DiscoveryHypothesis,
  StrategyDNA,
} from '../../types/discovery';
import { generateDiverseHypotheses, mutateHypothesis } from './hypothesisGenerator';
import {
  evaluateDiscoveryHypothesis,
  executeDnaBacktestOnBars,
} from './discoveryBacktestExecutor';

const STORAGE_KEY_RESEARCH_LOG = 'quantlab_discovery_research_log_v1';

export interface DiscoveryRunResult {
  config: DiscoveryLabConfig;
  instrument: Instrument;
  totalGenerated: number;
  totalTested: number;
  earlyPrunedCount: number;
  qualifiedCount: number;
  discoveries: DiscoveryReport[];
  disqualifiedReports: DiscoveryReport[];
  researchLog: ResearchLogEntry[];
  timeAnomalyMatrix: {
    dayOfWeekStats: { day: string; winRatePct: number; avgReturnPct: number; sampleCount: number }[];
    dayOfMonthStats: { period: string; winRatePct: number; avgReturnPct: number; sampleCount: number }[];
  };
}

/**
 * Loads persistent research log entries from localStorage
 */
export function getSavedResearchLog(): ResearchLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RESEARCH_LOG);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse saved discovery research log', e);
    return [];
  }
}

/**
 * Saves new research log entries into localStorage (caps at last 300)
 */
export function persistResearchLog(entries: ResearchLogEntry[]): void {
  try {
    const existing = getSavedResearchLog();
    const existingMap = new Map(existing.map((e) => [e.dnaHash, e]));
    entries.forEach((e) => existingMap.set(e.dnaHash, e));
    const combined = Array.from(existingMap.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 300);
    localStorage.setItem(STORAGE_KEY_RESEARCH_LOG, JSON.stringify(combined));
  } catch (e) {
    console.warn('LocalStorage save failed for research log', e);
  }
}

/**
 * Computes calendar day-of-week and turn-of-month empirical baseline anomalies
 */
export function computeTimeAnomalyBaselines(bars: Bar[]): {
  dayOfWeekStats: { day: string; winRatePct: number; avgReturnPct: number; sampleCount: number }[];
  dayOfMonthStats: { period: string; winRatePct: number; avgReturnPct: number; sampleCount: number }[];
} {
  const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì'];
  const dayReturns: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };

  const startOfMonthReturns: number[] = [];
  const midMonthReturns: number[] = [];
  const endOfMonthReturns: number[] = [];

  for (let i = 1; i < bars.length; i++) {
    const current = bars[i];
    const prev = bars[i - 1];
    const retPct = ((current.close - prev.close) / prev.close) * 100;
    const d = new Date(current.dateStr);
    const dow = d.getUTCDay();
    if (dow >= 1 && dow <= 5) {
      dayReturns[dow].push(retPct);
    }

    const dayOfMonth = d.getUTCDate();
    if (dayOfMonth <= 4) startOfMonthReturns.push(retPct);
    else if (dayOfMonth >= 26) endOfMonthReturns.push(retPct);
    else if (dayOfMonth >= 13 && dayOfMonth <= 17) midMonthReturns.push(retPct);
  }

  const dayOfWeekStats = [1, 2, 3, 4, 5].map((idx) => {
    const arr = dayReturns[idx] || [];
    const wins = arr.filter((r) => r > 0).length;
    const avg = arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
      day: days[idx - 1],
      winRatePct: arr.length > 0 ? parseFloat(((wins / arr.length) * 100).toFixed(1)) : 50,
      avgReturnPct: parseFloat(avg.toFixed(3)),
      sampleCount: arr.length,
    };
  });

  const domHelper = (label: string, arr: number[]) => {
    const wins = arr.filter((r) => r > 0).length;
    const avg = arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return {
      period: label,
      winRatePct: arr.length > 0 ? parseFloat(((wins / arr.length) * 100).toFixed(1)) : 50,
      avgReturnPct: parseFloat(avg.toFixed(3)),
      sampleCount: arr.length,
    };
  };

  const dayOfMonthStats = [
    domHelper('Inizio Mese (1-4)', startOfMonthReturns),
    domHelper('Metà Mese (13-17)', midMonthReturns),
    domHelper('Fine Mese (26+)', endOfMonthReturns),
  ];

  return { dayOfWeekStats, dayOfMonthStats };
}

/**
 * Runs the full AI Strategy Discovery Exploration pipeline asynchronously
 */
export async function runDiscoveryExperiment(
  instrument: Instrument,
  bars: Bar[],
  config: DiscoveryLabConfig,
  onProgress?: (status: DiscoveryProgressStatus) => void
): Promise<DiscoveryRunResult> {
  const targetCounts: Record<string, number> = {
    FAST: 60,
    DEEP: 180,
    EXTREME: 400,
  };
  const targetHypotheses = targetCounts[config.explorationMode] || 60;

  onProgress?.({
    phase: 'GENERATING',
    hypothesesGenerated: 0,
    hypothesesTarget: targetHypotheses,
    earlyPrunedCount: 0,
    testedCount: 0,
    qualifiedCount: 0,
    currentHypothesisName: 'Sintesi spazio multidimensionale dei fattori...',
    currentFamily: 'CALENDAR',
    progressPercent: 5,
  });

  // 1. Generate diverse initial hypotheses
  const initialPool = generateDiverseHypotheses(
    targetHypotheses,
    config.focusArea,
    instrument.ticker
  );

  const allTestedDnas: StrategyDNA[] = [];
  const reports: DiscoveryReport[] = [];
  const newLogEntries: ResearchLogEntry[] = [];

  let earlyPrunedCount = 0;
  let testedCount = 0;

  // Process in asynchronous micro-batches to allow UI smooth updates
  const batchSize = 4;
  for (let i = 0; i < initialPool.length; i += batchSize) {
    const batch = initialPool.slice(i, i + batchSize);

    for (const hyp of batch) {
      allTestedDnas.push(hyp.dna);

      // Fast screening / early pruning check
      const quickCheck = executeDnaBacktestOnBars(hyp.dna, bars, config.initialCapital);

      // Early prune if zero trades or disastrous return
      if (quickCheck.totalTrades < 4 || quickCheck.totalReturnPct <= -10) {
        earlyPrunedCount++;
        newLogEntries.push({
          id: hyp.id,
          timestamp: Date.now(),
          dateStr: new Date().toISOString().replace('T', ' ').substring(0, 19),
          dnaHash: hyp.dna.dnaHash,
          name: hyp.name,
          family: hyp.family,
          dnaSummary: hyp.plainHypothesis,
          status: 'EARLY_PRUNED',
          returnPct: quickCheck.totalReturnPct,
          robustnessScore: 10,
          noveltyScore: 30,
          complexityScore: hyp.dna.complexityScore,
          confidenceScore: 10,
          rejectionReason:
            quickCheck.totalTrades < 4
              ? `Campione insufficiente (${quickCheck.totalTrades} trade)`
              : `Drawdown o perdita prematura (${quickCheck.totalReturnPct}%)`,
        });
        continue;
      }

      // If passed fast screening, run full deep evaluation
      testedCount++;
      const report = evaluateDiscoveryHypothesis(
        hyp,
        bars,
        instrument,
        allTestedDnas,
        initialPool.length
      );
      reports.push(report);

      newLogEntries.push({
        id: hyp.id,
        timestamp: Date.now(),
        dateStr: new Date().toISOString().replace('T', ' ').substring(0, 19),
        dnaHash: hyp.dna.dnaHash,
        name: hyp.name,
        family: hyp.family,
        dnaSummary: hyp.plainHypothesis,
        status: report.qualificationStatus === 'QUALIFIED' ? 'ROBUST_DISCOVERY' : 'DISQUALIFIED',
        returnPct: report.metrics.totalReturnPct,
        robustnessScore: report.scores.robustnessScore,
        noveltyScore: report.scores.noveltyScore,
        complexityScore: report.scores.complexityScore,
        confidenceScore: report.scores.confidenceScore,
        rejectionReason: report.disqualificationReason,
      });

      onProgress?.({
        phase: 'BACKTESTING',
        hypothesesGenerated: initialPool.length,
        hypothesesTarget: targetHypotheses,
        earlyPrunedCount,
        testedCount,
        qualifiedCount: reports.filter((r) => r.qualificationStatus === 'QUALIFIED').length,
        currentHypothesisName: hyp.name,
        currentFamily: hyp.family,
        progressPercent: Math.min(
          90,
          Math.round(((i + 1) / initialPool.length) * 85 + 5)
        ),
      });
    }

    // Small yield to event loop
    await new Promise((resolve) => setTimeout(resolve, 8));
  }

  // 2. Genetic Mutation Phase on the top qualified discoveries
  const qualifiedReports = reports.filter((r) => r.qualificationStatus === 'QUALIFIED');
  if (qualifiedReports.length > 0) {
    onProgress?.({
      phase: 'VALIDATING',
      hypothesesGenerated: initialPool.length,
      hypothesesTarget: targetHypotheses,
      earlyPrunedCount,
      testedCount,
      qualifiedCount: qualifiedReports.length,
      currentHypothesisName: 'Mutazione genetica e test del plateau di vicinato...',
      currentFamily: qualifiedReports[0].hypothesis.family,
      progressPercent: 92,
    });

    const topParents = [...qualifiedReports]
      .sort((a, b) => b.scores.robustnessScore - a.scores.robustnessScore)
      .slice(0, 3);

    for (let m = 0; m < topParents.length; m++) {
      const mutated = mutateHypothesis(
        topParents[m].hypothesis,
        `AI-MUT-${String(m + 1).padStart(3, '0')}`
      );
      allTestedDnas.push(mutated.dna);
      const mReport = evaluateDiscoveryHypothesis(
        mutated,
        bars,
        instrument,
        allTestedDnas,
        initialPool.length + 10
      );
      reports.push(mReport);
    }
  }

  // Persist log entries
  persistResearchLog(newLogEntries);

  // Separate qualified discoveries from disqualified
  const qualified = reports.filter((r) => r.qualificationStatus === 'QUALIFIED');
  const disqualified = reports.filter((r) => r.qualificationStatus === 'DISQUALIFIED');

  // Sort qualified discoveries prioritizing balance of robustness score & risk/reward
  qualified.sort((a, b) => {
    const scoreA = a.scores.robustnessScore * 0.55 + a.scores.noveltyScore * 0.25 + a.metrics.sharpeRatio * 10;
    const scoreB = b.scores.robustnessScore * 0.55 + b.scores.noveltyScore * 0.25 + b.metrics.sharpeRatio * 10;
    return scoreB - scoreA;
  });

  // Calculate calendar empirical anomalies
  const timeAnomalyMatrix = computeTimeAnomalyBaselines(bars);

  onProgress?.({
    phase: 'COMPLETED',
    hypothesesGenerated: initialPool.length,
    hypothesesTarget: targetHypotheses,
    earlyPrunedCount,
    testedCount,
    qualifiedCount: qualified.length,
    currentHypothesisName: 'Esplorazione completata.',
    currentFamily: 'HYBRID',
    progressPercent: 100,
  });

  return {
    config,
    instrument,
    totalGenerated: initialPool.length,
    totalTested: testedCount,
    earlyPrunedCount,
    qualifiedCount: qualified.length,
    discoveries: qualified,
    disqualifiedReports: disqualified,
    researchLog: getSavedResearchLog(),
    timeAnomalyMatrix,
  };
}
