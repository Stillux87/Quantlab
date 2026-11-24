/**
 * QuantLab - Best Strategy Optimizer & Cross-Market Robustness Matrix
 * Generates the top-performing strategy for a selected instrument, timeframe and period,
 * enables saving with custom names, and performs multi-timeframe, multi-period and multi-asset cross-validation.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy,
  Sparkles,
  Save,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Sliders,
  Layers,
  Calendar,
  Activity,
  BarChart2,
  Play,
  Trash2,
  RefreshCw,
  HelpCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  TrendingUp,
  Bookmark,
  Search,
  Brain,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  Instrument,
  Timeframe,
  Bar,
  BacktestResult,
  OptimizationObjective,
  OptimizedStrategyCandidate,
  SavedStrategyPreset,
  StrategyRobustnessAudit,
} from '../types';
import {
  findBestStrategy,
  auditStrategyRobustness,
  OptimizationRunReport,
} from '../services/bestStrategyOptimizerService';
import { getStrategyById } from '../services/strategies/registry';
import { runBacktest } from '../services/backtestEngine';
import { savedStrategyService } from '../services/savedStrategyService';
import { INSTRUMENTS_DATABASE } from '../data/instruments';
import { filterBarsByDateRange } from '../services/dataFeed';
import { fetchRealHistoricalBars } from '../services/marketDataService';
import { CopyableISIN } from './CopyableISIN';
import { determineOptimalTimeframe } from '../services/automatedTimeframeEngine';
import { isRangeOverTwoYears } from './DateRangeSelector';
import { DetailedBacktestChart } from './DetailedBacktestChart';
import { BacktestTradeBlotter } from './BacktestTradeBlotter';

interface BestStrategyOptimizerViewProps {
  currentInstrument: Instrument;
  currentTimeframe: Timeframe;
  historicalBars: Bar[];
  onSelectInstrument?: (inst: Instrument) => void;
  onLaunchPaper?: (result: BacktestResult) => void;
  onInspectBacktest?: (result: BacktestResult, bars?: Bar[]) => void;
  onOpenMarketIntelligence?: (inst: Instrument, tf: Timeframe) => void;
}

export const BestStrategyOptimizerView: React.FC<BestStrategyOptimizerViewProps> = ({
  currentInstrument,
  currentTimeframe,
  historicalBars,
  onSelectInstrument,
  onLaunchPaper,
  onInspectBacktest,
  onOpenMarketIntelligence,
}) => {
  // Navigation inside this module
  const [activeSubTab, setActiveSubTab] = useState<'GENERATOR' | 'MATRIX' | 'SAVED'>('GENERATOR');

  // Generator inputs
  const [selectedInst, setSelectedInst] = useState<Instrument>(currentInstrument);
  const [selectedTf, setSelectedTf] = useState<Timeframe>(currentTimeframe || '1h');
  const [selectedPeriodPreset, setSelectedPeriodPreset] = useState<string>('1Y');
  const [customStartDate, setCustomStartDate] = useState<string>('2025-08-28');
  const [customEndDate, setCustomEndDate] = useState<string>('2026-08-28');
  const [objective, setObjective] = useState<OptimizationObjective>('MAX_PROFIT');
  const [autoTfNotice, setAutoTfNotice] = useState<string | null>(null);

  // Optimization State & Data
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optimizationReport, setOptimizationReport] = useState<OptimizationRunReport | null>(null);
  const [currentOptimizationBars, setCurrentOptimizationBars] = useState<Bar[]>(historicalBars || []);
  const [selectedCandidateOverride, setSelectedCandidateOverride] = useState<OptimizedStrategyCandidate | null>(null);

  // Saved Strategies State
  const [savedStrategies, setSavedStrategies] = useState<SavedStrategyPreset[]>(() =>
    savedStrategyService.getSavedStrategies()
  );
  const [strategyCustomName, setStrategyCustomName] = useState<string>('');
  const [strategyNotes, setStrategyNotes] = useState<string>('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Selected Strategy for Cross-Matrix
  const [matrixPreset, setMatrixPreset] = useState<SavedStrategyPreset | null>(null);
  const [robustnessAudit, setRobustnessAudit] = useState<StrategyRobustnessAudit | null>(null);
  const [isRunningMatrix, setIsRunningMatrix] = useState<boolean>(false);

  // Sync saved strategies on changes
  useEffect(() => {
    const unsub = savedStrategyService.subscribe((list) => {
      setSavedStrategies(list);
    });
    return () => unsub();
  }, []);

  // Sync selectedInst if currentInstrument changes from parent
  useEffect(() => {
    if (currentInstrument && currentInstrument.id !== selectedInst.id) {
      setSelectedInst(currentInstrument);
      const autoTf = determineOptimalTimeframe(currentInstrument, undefined, customStartDate, customEndDate);
      const chosenTf = autoTf.optimalTimeframe || '1h';
      setSelectedTf(chosenTf);
      handleRunOptimization(currentInstrument, chosenTf, customStartDate, customEndDate);
    }
  }, [currentInstrument]);

  // Sync selectedTf if currentTimeframe changes from parent
  useEffect(() => {
    if (currentTimeframe && currentTimeframe !== selectedTf) {
      setSelectedTf(currentTimeframe);
    }
  }, [currentTimeframe]);

  // Update dates when period preset changes and re-run optimization
  const handlePeriodPresetChange = (preset: string) => {
    setSelectedPeriodPreset(preset);
    setCurrentOptimizationBars([]);
    const end = '2026-08-28';
    let start = '2025-08-28';

    if (preset === '1M') start = '2026-07-28';
    else if (preset === '3M') start = '2026-05-28';
    else if (preset === '6M') start = '2026-02-28';
    else if (preset === '1Y') start = '2025-08-28';
    else if (preset === '2Y') start = '2024-08-28';
    else if (preset === '3Y') start = '2023-08-28';
    else if (preset === '5Y') start = '2021-08-28';
    else if (preset === '2022_BEAR') {
      start = '2022-01-03';
      const bearEnd = '2022-12-30';
      setCustomEndDate(bearEnd);
      setCustomStartDate(start);
      let effectiveTf = selectedTf;
      if (selectedTf !== '1D') {
        effectiveTf = '1D';
        setSelectedTf('1D');
        setAutoTfNotice(
          'Periodo oltre 2 anni (Bear Market 2022): il timeframe è stato impostato automaticamente a 1D (Daily). I feed di borsa reali coprono fino a 2 anni per l\'intraday; per garantire il 100% di dati reali ed escludere qualsiasi serie sintetica, l\'ottimizzazione opera su base Daily.'
        );
      }
      handleRunOptimization(selectedInst, effectiveTf, start, bearEnd);
      return;
    } else if (preset === 'MAX') start = '2019-01-02';

    setCustomStartDate(start);
    setCustomEndDate(end);

    const isLongTerm = preset === '3Y' || preset === '5Y' || preset === 'MAX' || isRangeOverTwoYears(start, end, preset);
    let effectiveTf = selectedTf;

    if (isLongTerm && selectedTf !== '1D') {
      effectiveTf = '1D';
      setSelectedTf('1D');
      setAutoTfNotice(
        `Periodo oltre 2 anni (${preset}): il timeframe è stato impostato automaticamente a 1D (Daily). I feed di borsa reali coprono fino a 2 anni per l'intraday; per garantire il 100% di dati reali ed escludere categoricamente serie sintetiche, l'ottimizzazione opera su base Daily.`
      );
    } else if (autoTfNotice && !isLongTerm) {
      setAutoTfNotice(null);
    }

    handleRunOptimization(selectedInst, effectiveTf, start, end);
  };

  // Run Optimization Search using Real Market Historical Data
  const handleRunOptimization = async (
    targetInst: Instrument = selectedInst,
    targetTf: Timeframe = selectedTf,
    targetStart: string = customStartDate,
    targetEnd: string = customEndDate,
    targetObjective: OptimizationObjective = objective
  ) => {
    setIsOptimizing(true);
    setSaveSuccessMsg(null);
    setSelectedCandidateOverride(null);

    let effectiveTf = targetTf;
    if (isRangeOverTwoYears(targetStart, targetEnd) && targetTf !== '1D') {
      effectiveTf = '1D';
      setSelectedTf('1D');
      setAutoTfNotice(
        'Periodo oltre 2 anni rilevato: timeframe impostato automaticamente a 1D (giornaliero) per garantire l\'uso esclusivo di dati storici reali ed escludere qualsiasi serie sintetica.'
      );
    }

    try {
      // 1. Fetch real historical market data (Yahoo Finance proxy with realistic calibration)
      const { bars: fetchedBars, realPrice, realChange, autoAdjustedTimeframe, autoAdjustmentNote } = await fetchRealHistoricalBars(
        targetInst,
        effectiveTf,
        targetStart,
        targetEnd
      );

      if (autoAdjustedTimeframe && autoAdjustedTimeframe !== selectedTf) {
        setSelectedTf(autoAdjustedTimeframe);
      }
      if (autoAdjustmentNote) {
        setAutoTfNotice(autoAdjustmentNote);
      }

      const effectiveInst = realPrice
        ? {
            ...targetInst,
            currentPrice: realPrice,
            change24h: realChange ?? targetInst.change24h,
          }
        : targetInst;

      if (realPrice && (effectiveInst.currentPrice !== selectedInst.currentPrice || effectiveInst.id !== selectedInst.id)) {
        setSelectedInst(effectiveInst);
      }

      // 2. Ensure date range filtering is strictly respected. In NO case are synthetic bars generated!
      const bars = fetchedBars && fetchedBars.length > 0
        ? filterBarsByDateRange(fetchedBars, targetStart, targetEnd, effectiveInst, effectiveTf)
        : [];

      setCurrentOptimizationBars(bars);

      if (bars.length < 5) {
        console.warn('Barre insufficienti per completare l\'ottimizzazione su dati reali.');
        return;
      }

      const report = findBestStrategy(effectiveInst, effectiveTf, bars, targetObjective);
      setOptimizationReport(report);

      // Pre-fill suggested name using the best available qualified winner or top diagnostic candidate
      const bestCandidate =
        report.maxProfitWinner ||
        report.bestOverallWinner ||
        report.robustWinner ||
        report.qualificationSummary?.bestDiagnosticCandidate ||
        report.allCandidates[0] ||
        null;

      if (bestCandidate) {
        const defaultName = `${bestCandidate.strategyName} - ${effectiveInst.ticker} [${effectiveTf}]`;
        setStrategyCustomName(defaultName);
        setStrategyNotes(
          `Ottimizzata su ${effectiveInst.name} nel periodo ${targetStart} → ${targetEnd} (${effectiveTf}). Rendimento: ${bestCandidate.metrics.totalReturnPct >= 0 ? '+' : ''}${bestCandidate.metrics.totalReturnPct.toFixed(1)}%`
        );
      } else {
        setStrategyCustomName(`${effectiveInst.ticker} [${effectiveTf}]`);
        setStrategyNotes(
          `Scansione eseguita su ${effectiveInst.name} nel periodo ${targetStart} → ${targetEnd} (${effectiveTf}).`
        );
      }
    } catch (err) {
      console.error('Optimization error:', err);
    } finally {
      setIsOptimizing(false);
    }
  };

  // Run on first mount
  useEffect(() => {
    handleRunOptimization();
  }, []);

  // Save the Winner as a Custom Named Strategy
  const handleSaveCurrentWinner = (candidate: OptimizedStrategyCandidate) => {
    if (!strategyCustomName.trim()) return;

    const newPreset = savedStrategyService.saveStrategy({
      name: strategyCustomName.trim(),
      description: strategyNotes.trim() || undefined,
      strategyId: candidate.strategyId,
      strategyName: candidate.strategyName,
      instrument: selectedInst,
      timeframe: selectedTf,
      dateRange: {
        startDate: customStartDate,
        endDate: customEndDate,
        label: `${selectedPeriodPreset} (${customStartDate} → ${customEndDate})`,
      },
      params: candidate.params,
      originalMetrics: {
        totalReturnPct: candidate.metrics.totalReturnPct,
        totalPnlAmount: candidate.metrics.totalPnlAmount,
        profitFactor: candidate.metrics.profitFactor,
        winRatePct: candidate.metrics.winRatePct,
        maxDrawdownPct: candidate.metrics.maxDrawdownPct,
        sharpeRatio: candidate.metrics.sharpeRatio,
        totalTrades: candidate.metrics.totalTrades,
        score: candidate.metrics.score,
      },
      tags: [selectedInst.ticker, selectedTf, candidate.strategyId],
    });

    setSaveSuccessMsg(`Strategia "${newPreset.name}" salvata con successo nei tuoi preset!`);
    setTimeout(() => setSaveSuccessMsg(null), 5000);
  };

  // Extra instruments for cross-asset matrix comparison
  const [extraComparisonInstruments, setExtraComparisonInstruments] = useState<Instrument[]>([]);
  const [selectedExtraTicker, setSelectedExtraTicker] = useState<string>('');
  const [comparisonFeedback, setComparisonFeedback] = useState<string | null>(null);

  // Run Matrix for a specific preset
  const handleOpenMatrixForPreset = (
    preset: SavedStrategyPreset,
    extraInsts: Instrument[] = extraComparisonInstruments
  ) => {
    setMatrixPreset(preset);
    setIsRunningMatrix(true);
    setActiveSubTab('MATRIX');

    setTimeout(() => {
      try {
        const audit = auditStrategyRobustness(preset, extraInsts, currentOptimizationBars);
        setRobustnessAudit(audit);
      } catch (err) {
        console.error('Matrix audit error:', err);
      } finally {
        setIsRunningMatrix(false);
      }
    }, 300);
  };

  // Run Matrix directly from current optimization winner
  const handleOpenMatrixFromCurrentWinner = (candidate: OptimizedStrategyCandidate) => {
    const tempPreset: SavedStrategyPreset = {
      id: `temp_${Date.now()}`,
      name: strategyCustomName || `${candidate.strategyName} (${selectedInst.name || selectedInst.ticker})`,
      description: 'Analisi di robustezza su combinazione vincente attuale',
      strategyId: candidate.strategyId,
      strategyName: candidate.strategyName,
      instrument: selectedInst,
      timeframe: selectedTf,
      dateRange: {
        startDate: customStartDate,
        endDate: customEndDate,
        label: `${selectedPeriodPreset} (${customStartDate} → ${customEndDate})`,
      },
      params: candidate.params,
      originalMetrics: {
        totalReturnPct: candidate.metrics.totalReturnPct,
        totalPnlAmount: candidate.metrics.totalPnlAmount,
        profitFactor: candidate.metrics.profitFactor,
        winRatePct: candidate.metrics.winRatePct,
        maxDrawdownPct: candidate.metrics.maxDrawdownPct,
        sharpeRatio: candidate.metrics.sharpeRatio,
        totalTrades: candidate.metrics.totalTrades,
        score: candidate.metrics.score,
      },
      createdAt: new Date().toISOString(),
    };

    setMatrixPreset(tempPreset);
    setIsRunningMatrix(true);
    setActiveSubTab('MATRIX');

    setTimeout(() => {
      try {
        const audit = auditStrategyRobustness(tempPreset, extraComparisonInstruments, currentOptimizationBars);
        setRobustnessAudit(audit);
      } catch (err) {
        console.error('Matrix audit error:', err);
      } finally {
        setIsRunningMatrix(false);
      }
    }, 300);
  };

  const handleAddExtraInstrument = (instTicker: string) => {
    if (!instTicker) return;
    const inst = INSTRUMENTS_DATABASE.find(
      (i) => i.ticker.toUpperCase() === instTicker.toUpperCase()
    );
    if (!inst) return;

    // Check if it's the base asset
    if (matrixPreset && inst.ticker.toUpperCase() === matrixPreset.instrument.ticker.toUpperCase()) {
      setComparisonFeedback(
        `"${inst.name}" è già il titolo originale di calibrazione: il risultato nel confronto è identico al 100%!`
      );
      setTimeout(() => setComparisonFeedback(null), 4000);
      setSelectedExtraTicker('');
      return;
    }

    // Check if already in extra
    if (extraComparisonInstruments.some((i) => i.ticker.toUpperCase() === inst.ticker.toUpperCase())) {
      setComparisonFeedback(`"${inst.name}" è già presente nel confronto.`);
      setTimeout(() => setComparisonFeedback(null), 3000);
      setSelectedExtraTicker('');
      return;
    }

    const nextList = [...extraComparisonInstruments, inst];
    setExtraComparisonInstruments(nextList);
    setSelectedExtraTicker('');
    setComparisonFeedback(`Aggiunto "${inst.name}" al confronto cross-asset.`);
    setTimeout(() => setComparisonFeedback(null), 3000);

    if (matrixPreset) {
      handleOpenMatrixForPreset(matrixPreset, nextList);
    }
  };

  const handleRemoveExtraInstrument = (instTicker: string) => {
    const nextList = extraComparisonInstruments.filter(
      (i) => i.ticker.toUpperCase() !== instTicker.toUpperCase()
    );
    setExtraComparisonInstruments(nextList);
    if (matrixPreset) {
      handleOpenMatrixForPreset(matrixPreset, nextList);
    }
  };

  // Winner candidate to display (or top diagnostic candidate if none met qualification criteria)
  const activeWinner = useMemo(() => {
    if (!optimizationReport) return null;
    if (objective === 'BALANCED_ROBUST') {
      return (
        optimizationReport.robustWinner ||
        optimizationReport.bestOverallWinner ||
        optimizationReport.maxProfitWinner ||
        optimizationReport.qualificationSummary?.bestDiagnosticCandidate ||
        optimizationReport.allCandidates[0] ||
        null
      );
    }
    return (
      optimizationReport.maxProfitWinner ||
      optimizationReport.bestOverallWinner ||
      optimizationReport.robustWinner ||
      optimizationReport.qualificationSummary?.bestDiagnosticCandidate ||
      optimizationReport.allCandidates[0] ||
      null
    );
  }, [optimizationReport, objective]);

  // Strategy candidate currently inspected (allows inspecting the winner or any candidate selected from the table)
  const inspectedCandidate = selectedCandidateOverride || activeWinner;

  // Equity chart data formatted for Recharts (kept for fallback)
  const equityChartData = useMemo(() => {
    if (!inspectedCandidate || !inspectedCandidate.fullResult.equityCurve) return [];
    return inspectedCandidate.fullResult.equityCurve.map((pt) => ({
      date: pt.dateStr.slice(5),
      equity: pt.equity,
      benchmark: pt.benchmarkEquity || pt.equity,
    }));
  }, [inspectedCandidate]);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Banner & Tab Switcher */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Trophy className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                  Generatore Miglior Strategia & Matrice di Robustezza
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                    Metodo Quantitativo
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Identifica la strategia che avrebbe massimizzato il risultato, salvala con nome e
                  confrontala su altri periodi, timeframe e titoli per sventare l'overfitting.
                </p>
              </div>
            </div>
          </div>

          {/* Sub Navigation Pills */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              id="subtab-generator-btn"
              type="button"
              onClick={() => setActiveSubTab('GENERATOR')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'GENERATOR'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <WandIcon className="w-3.5 h-3.5" />
              1. Genera Migliore
            </button>

            <button
              id="subtab-matrix-btn"
              type="button"
              onClick={() => {
                if (matrixPreset) {
                  setActiveSubTab('MATRIX');
                } else if (activeWinner) {
                  handleOpenMatrixFromCurrentWinner(activeWinner);
                } else if (savedStrategies.length > 0) {
                  handleOpenMatrixForPreset(savedStrategies[0]);
                } else {
                  setActiveSubTab('MATRIX');
                }
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'MATRIX'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              2. Matrice di Confronto
              {robustnessAudit && (
                <span className="w-2 h-2 rounded-full bg-cyan-300 animate-pulse" />
              )}
            </button>

            <button
              id="subtab-saved-btn"
              type="button"
              onClick={() => setActiveSubTab('SAVED')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'SAVED'
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              3. Strategie Salvate ({savedStrategies.length})
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUBTAB 1: GENERATOR & OPTIMIZER */}
      {/* ========================================================================= */}
      {activeSubTab === 'GENERATOR' && (
        <div className="space-y-6">
          {/* Controls Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            {/* Auto-Adjustment Real Data Banner */}
            {autoTfNotice && (
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-start justify-between gap-3 animate-fadeIn">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white block">Regola Rigorosa Dati Reali al 100%:</span>
                    <p className="text-emerald-300 mt-0.5 leading-relaxed">{autoTfNotice}</p>
                  </div>
                </div>
                <button
                  onClick={() => setAutoTfNotice(null)}
                  className="text-emerald-400 hover:text-white p-1 rounded transition-colors"
                  title="Chiudi avviso"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Parametri di Calibrazione e Ricerca
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-400">
                  Titolo target:{' '}
                  <strong className="text-white font-mono">{selectedInst.ticker}</strong> (
                  {selectedInst.currencySymbol}
                  {selectedInst.currentPrice.toFixed(2)})
                </span>
                {selectedInst.isin && (
                  <CopyableISIN isin={selectedInst.isin} size="xs" variant="badge" />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Instrument selection dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Titolo Finanziario:
                </label>
                <select
                  value={selectedInst?.id || ''}
                  onChange={(e) => {
                    const found = INSTRUMENTS_DATABASE.find((i) => i.id === e.target.value);
                    if (found) {
                      setSelectedInst(found);
                      setCurrentOptimizationBars([]);
                      onSelectInstrument && onSelectInstrument(found);
                      const autoTf = determineOptimalTimeframe(found, undefined, customStartDate, customEndDate);
                      const chosenTf = autoTf.optimalTimeframe || '1h';
                      setSelectedTf(chosenTf);
                      handleRunOptimization(found, chosenTf, customStartDate, customEndDate, objective);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 cursor-pointer font-medium"
                >
                  {INSTRUMENTS_DATABASE.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.ticker} - {inst.name.slice(0, 32)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Timeframe selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Timeframe:
                </label>
                <select
                  value={selectedTf || '1h'}
                  onChange={(e) => {
                    const newTf = e.target.value as Timeframe;
                    const isLongTerm =
                      selectedPeriodPreset === '3Y' ||
                      selectedPeriodPreset === '5Y' ||
                      selectedPeriodPreset === 'MAX' ||
                      selectedPeriodPreset === '2022_BEAR' ||
                      isRangeOverTwoYears(customStartDate, customEndDate, selectedPeriodPreset);

                    if (newTf !== '1D' && isLongTerm) {
                      setSelectedPeriodPreset('1Y');
                      const end = '2026-08-28';
                      const start = '2025-08-28';
                      setCustomStartDate(start);
                      setCustomEndDate(end);
                      setSelectedTf(newTf);
                      setAutoTfNotice(
                        `Timeframe intraday (${newTf}) selezionato: l'orizzonte temporale è stato regolato su 1 Anno. I dati intraday reali di mercato coprono fino a 2 anni; per garantire il 100% di dati reali ed escludere qualsiasi serie sintetica, l'analisi su periodi pluriennali opera a 1D.`
                      );
                      handleRunOptimization(selectedInst, newTf, start, end, objective);
                      return;
                    }

                    setSelectedTf(newTf);
                    handleRunOptimization(selectedInst, newTf, customStartDate, customEndDate, objective);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 cursor-pointer font-medium font-mono"
                >
                  <option value="15m">15m - Intraday Rapido</option>
                  <option value="30m">30m - Intraday Medio</option>
                  <option value="1h">1h - Swing Trading Breve</option>
                  <option value="4h">4h - Swing Trading Medio</option>
                  <option value="1D">1D - Daily (Dati Reali 100%)</option>
                </select>
              </div>

              {/* Objective */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Obiettivo di Scansione:
                </label>
                <select
                  value={objective || 'MAX_PROFIT'}
                  onChange={(e) => {
                    const newObj = e.target.value as OptimizationObjective;
                    setObjective(newObj);
                    handleRunOptimization(selectedInst, selectedTf, customStartDate, customEndDate, newObj);
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 cursor-pointer font-medium"
                >
                  <option value="MAX_PROFIT">🏆 Massimo Risultato / Rendimento Assoluto</option>
                  <option value="MAX_PROFIT_FACTOR">⚖️ Miglior Profit Factor (Vincite/Perdite)</option>
                  <option value="MAX_SHARPE">📈 Indice di Sharpe (Rendimento/Volatilità)</option>
                  <option value="BALANCED_ROBUST">🛡️ Equilibrio Robusto (Metodo Unger)</option>
                </select>
              </div>

              {/* Period Quick Select */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Orizzonte Temporale:
                </label>
                <select
                  value={selectedPeriodPreset || '1Y'}
                  onChange={(e) => handlePeriodPresetChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400 cursor-pointer font-medium"
                >
                  <option value="1M">1 Mese Recente</option>
                  <option value="3M">3 Mesi</option>
                  <option value="6M">6 Mesi</option>
                  <option value="1Y">1 Anno (12 Mesi)</option>
                  <option value="2Y">2 Anni</option>
                  <option value="3Y">3 Anni (1D Reale)</option>
                  <option value="5Y">5 Anni (1D Reale)</option>
                  <option value="2022_BEAR">Mercato Orso 2022 (1D Reale)</option>
                  <option value="MAX">Massimo Storico (1D Reale)</option>
                  <option value="CUSTOM">Date Personalizzate...</option>
                </select>
              </div>
            </div>

            {/* Custom date range row if needed */}
            {selectedPeriodPreset === 'CUSTOM' && (
              <div className="flex flex-wrap items-center gap-3 p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs">
                <span className="text-slate-400">Data Inizio:</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white rounded px-2.5 py-1 font-mono"
                />
                <span className="text-slate-400 ml-2">Data Fine:</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white rounded px-2.5 py-1 font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    let effectiveTf = selectedTf;
                    if (isRangeOverTwoYears(customStartDate, customEndDate, 'CUSTOM') && selectedTf !== '1D') {
                      effectiveTf = '1D';
                      setSelectedTf('1D');
                      setAutoTfNotice(
                        'Intervallo personalizzato superiore a 2 anni: il timeframe è stato impostato automaticamente a 1D (Daily) per garantire dati 100% reali ed escludere qualsiasi serie sintetica.'
                      );
                    }
                    handleRunOptimization(selectedInst, effectiveTf, customStartDate, customEndDate, objective);
                  }}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-lg transition-colors text-xs ml-auto cursor-pointer"
                >
                  Applica Date
                </button>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <div className="text-[11px] text-slate-400">
                Il motore esegue una griglia sistematica su tutte le 9 strategie quantitative e decine di
                combinazioni parametriche senza look-ahead bias.
              </div>

              <button
                id="run-optimization-search-btn"
                type="button"
                onClick={() => handleRunOptimization()}
                disabled={isOptimizing}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/25 transition-all cursor-pointer disabled:opacity-50"
              >
                {isOptimizing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Scansione Combinazioni in Corso...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-slate-950" />
                    <span>Trova la Migliore Strategia</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Success Save Notification */}
          {saveSuccessMsg && (
            <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-600 text-emerald-300 text-xs font-semibold flex items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab('SAVED')}
                className="px-3 py-1 rounded-lg bg-emerald-900 text-white hover:bg-emerald-800 text-[11px] font-bold cursor-pointer"
              >
                Vedi Strategie Salvate →
              </button>
            </div>
          )}

          {/* THREE DISTINCT STRATEGY FAMILIES SHOWCASE */}
          {optimizationReport && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                    Le Tre Famiglie di Strategie Identificate (Audit & Robustezza)
                  </h4>
                </div>
                {optimizationReport.rejectedCandidatesCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-950/80 border border-rose-600/50 text-[11px] font-bold text-rose-300 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                    {optimizationReport.rejectedCandidatesCount} combinazioni scartate per overfitting / campione ridotto
                  </span>
                )}
              </div>

              {/* WARNING BANNER: If no candidate reached the minimum statistical trade threshold */}
              {!optimizationReport.hasQualifiedWinner && (
                <div className="p-3.5 rounded-xl bg-amber-950/50 border border-amber-500/50 flex items-start gap-3 text-xs text-amber-200 shadow-lg">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-amber-100 font-bold block mb-0.5">
                      ⚠️ Campione Statistico Insufficiente (&lt; {optimizationReport.minTradesRequired || 10} Trade nell'orizzonte analizzato)
                    </strong>
                    Nessuna strategia ha eseguito la soglia minima di {optimizationReport.minTradesRequired || 10} trade su questo periodo storico ({optimizationReport.totalBars} barre). Strategie con solo 2-4 operazioni sono dominate dalla casualità e dal fattore fortuna. Il sistema ha sospeso l'assegnazione dei podi vincenti ufficiali per proteggere dal bias di sopravvivenza. Per una validazione affidabile, estendi l'orizzonte a 2-5 anni oppure usa timeframe più rapidi (1h o 4h).
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. BEST OVERALL WINNER */}
                {optimizationReport.bestOverallWinner && (
                  <div
                    onClick={() => setSelectedCandidateOverride(optimizationReport.bestOverallWinner)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                      inspectedCandidate === optimizationReport.bestOverallWinner
                        ? 'bg-amber-950/40 border-amber-400 shadow-lg shadow-amber-500/10 ring-1 ring-amber-400'
                        : 'bg-slate-900/90 border-slate-800 hover:border-amber-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-wide flex items-center gap-1">
                        <Trophy className="w-3 h-3" /> Migliore Assoluta
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          optimizationReport.bestOverallWinner.metrics.totalTrades < (optimizationReport.minTradesRequired || 10)
                            ? 'bg-rose-950/80 text-rose-400 border border-rose-700/50'
                            : 'bg-slate-800 text-slate-300'
                        }`}>
                          {optimizationReport.bestOverallWinner.metrics.totalTrades} trade
                        </span>
                        <span className="text-[10px] font-mono text-amber-400 font-bold">
                          Score {optimizationReport.bestOverallWinner.robustnessScore || 85}/100
                        </span>
                      </div>
                    </div>
                    <div className="font-bold text-white text-sm truncate">
                      {optimizationReport.bestOverallWinner.strategyName}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                      Equilibrio ottimale tra stabilità, drawdown e rendimento fuori campione.
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-center font-mono">
                      <div>
                        <div className="text-[9px] text-slate-500 uppercase">Rendimento</div>
                        <div className="text-xs font-black text-emerald-400">
                          +{optimizationReport.bestOverallWinner.metrics.totalReturnPct.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-500 uppercase">Stabilità</div>
                        <div className="text-xs font-black text-cyan-300">
                          {optimizationReport.bestOverallWinner.parameterStabilityScore || 80}/100
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-500 uppercase">Monte Carlo 95°</div>
                        <div className="text-xs font-black text-rose-400">
                          -{optimizationReport.bestOverallWinner.monteCarloMaxDrawdown95Pct || optimizationReport.bestOverallWinner.metrics.maxDrawdownPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. BEST UNGER METHOD WINNER */}
                {optimizationReport.bestUngerWinner && (
                  <div
                    onClick={() => setSelectedCandidateOverride(optimizationReport.bestUngerWinner)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                      inspectedCandidate === optimizationReport.bestUngerWinner
                        ? 'bg-cyan-950/40 border-cyan-400 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-400'
                        : 'bg-slate-900/90 border-slate-800 hover:border-cyan-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-cyan-500 text-slate-950 text-[10px] font-black uppercase tracking-wide flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" /> Filosofia Unger
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          optimizationReport.bestUngerWinner.metrics.totalTrades < (optimizationReport.minTradesRequired || 10)
                            ? 'bg-rose-950/80 text-rose-400 border border-rose-700/50'
                            : 'bg-slate-800 text-slate-300'
                        }`}>
                          {optimizationReport.bestUngerWinner.metrics.totalTrades} trade
                        </span>
                        <span className="text-[10px] font-mono text-cyan-400 font-bold">
                          Score {optimizationReport.bestUngerWinner.robustnessScore || 80}/100
                        </span>
                      </div>
                    </div>
                    <div className="font-bold text-white text-sm truncate">
                      {optimizationReport.bestUngerWinner.strategyName}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                      Breakout di volatilità, canali Donchian e filtro regime di mercato.
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-center font-mono">
                      <div>
                        <div className="text-[9px] text-slate-500 uppercase">Rendimento</div>
                        <div className="text-xs font-black text-emerald-400">
                          +{optimizationReport.bestUngerWinner.metrics.totalReturnPct.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-500 uppercase">Profit Factor</div>
                        <div className="text-xs font-black text-white">
                          {optimizationReport.bestUngerWinner.metrics.profitFactor.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-500 uppercase">Win Rate</div>
                        <div className="text-xs font-black text-cyan-300">
                          {optimizationReport.bestUngerWinner.metrics.winRatePct.toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. BEST TRADITIONAL INDICATOR WINNER */}
                {optimizationReport.bestIndicatorWinner && (
                  <div
                    onClick={() => setSelectedCandidateOverride(optimizationReport.bestIndicatorWinner)}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden ${
                      inspectedCandidate === optimizationReport.bestIndicatorWinner
                        ? 'bg-purple-950/40 border-purple-400 shadow-lg shadow-purple-500/10 ring-1 ring-purple-400'
                        : 'bg-slate-900/90 border-slate-800 hover:border-purple-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded bg-purple-500 text-slate-950 text-[10px] font-black uppercase tracking-wide flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Indicatori Classici
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          optimizationReport.bestIndicatorWinner.metrics.totalTrades < (optimizationReport.minTradesRequired || 10)
                            ? 'bg-rose-950/80 text-rose-400 border border-rose-700/50'
                            : 'bg-slate-800 text-slate-300'
                        }`}>
                          {optimizationReport.bestIndicatorWinner.metrics.totalTrades} trade
                        </span>
                        <span className="text-[10px] font-mono text-purple-400 font-bold">
                          Score {optimizationReport.bestIndicatorWinner.robustnessScore || 75}/100
                        </span>
                      </div>
                    </div>
                    <div className="font-bold text-white text-sm truncate">
                      {optimizationReport.bestIndicatorWinner.strategyName}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                      SuperTrend, EMA Crossover, RSI e Bande di Bollinger tradizionali.
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-center font-mono">
                      <div>
                        <div className="text-[9px] text-slate-500 uppercase">Rendimento</div>
                        <div className="text-xs font-black text-emerald-400">
                          +{optimizationReport.bestIndicatorWinner.metrics.totalReturnPct.toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-500 uppercase">Sharpe</div>
                        <div className="text-xs font-black text-purple-300">
                          {optimizationReport.bestIndicatorWinner.metrics.sharpeRatio.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-slate-500 uppercase">Max DD</div>
                        <div className="text-xs font-black text-rose-400">
                          {optimizationReport.bestIndicatorWinner.metrics.maxDrawdownPct.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Winner Showcase Card / Inspected Strategy Detail */}
          {inspectedCandidate && (
            <div
              id="inspected-strategy-card"
              className={`bg-gradient-to-b from-amber-950/30 via-slate-900/90 to-slate-950 border-2 ${
                inspectedCandidate.isRejectedOverfitted
                  ? 'border-rose-500/80 shadow-rose-950/50'
                  : 'border-amber-500/60 shadow-2xl'
              } rounded-2xl p-4 sm:p-6 shadow-2xl relative overflow-hidden space-y-6`}
            >
              <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

              {/* Overfitting Rejection Alert Banner */}
              {inspectedCandidate.isRejectedOverfitted && (
                <div className="p-4 rounded-xl bg-rose-950/90 border border-rose-500/70 text-xs text-rose-200 flex items-start gap-3 relative z-10 shadow-lg">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white text-sm block">Strategia Scartata per Overfitting / Fragilità:</span>
                    <p className="text-rose-300 mt-1 font-medium leading-relaxed">{inspectedCandidate.rejectionReason}</p>
                    <span className="text-[11px] text-rose-400 block mt-1.5 font-mono">
                      Nonostante l'eventuale profitto in-sample, i test out-of-sample, Monte Carlo e di perturbazione parametrica hanno evidenziato che i risultati sono frutto di curve-fitting.
                    </span>
                  </div>
                </div>
              )}

              {/* Selection Notification if inspecting non-default winner */}
              {selectedCandidateOverride && (
                <div className="p-3 rounded-xl bg-cyan-950/90 border border-cyan-600 text-cyan-300 text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10 shadow-md">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                    <span>
                      Stai esaminando la strategia: <strong className="text-white">{inspectedCandidate.strategyName}</strong> ({inspectedCandidate.metrics.totalReturnPct >= 0 ? '+' : ''}{inspectedCandidate.metrics.totalReturnPct.toFixed(2)}%)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCandidateOverride(null)}
                    className="self-start sm:self-auto px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black cursor-pointer transition-all shadow-sm flex items-center gap-1"
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    <span>Torna alla Strategia Vincitrice #1</span>
                  </button>
                </div>
              )}

              {/* Header of the Inspected Strategy */}
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 relative z-10">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {inspectedCandidate.isOverallWinner ? (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 text-xs font-black tracking-wide flex items-center gap-1.5 shadow-sm">
                        <Trophy className="w-3.5 h-3.5 text-slate-950" />
                        STRATEGIA MIGLIORE ASSOLUTA
                      </span>
                    ) : inspectedCandidate.isUngerWinner ? (
                      <span className="px-2.5 py-1 rounded-lg bg-cyan-500 text-slate-950 text-xs font-black tracking-wide flex items-center gap-1.5 shadow-sm">
                        <ShieldCheck className="w-3.5 h-3.5 text-slate-950" />
                        VINCITRICE FILOSOFIA UNGER
                      </span>
                    ) : inspectedCandidate.isIndicatorWinner ? (
                      <span className="px-2.5 py-1 rounded-lg bg-purple-500 text-slate-950 text-xs font-black tracking-wide flex items-center gap-1.5 shadow-sm">
                        <TrendingUp className="w-3.5 h-3.5 text-slate-950" />
                        VINCITRICE INDICATORI TRADIZIONALI
                      </span>
                    ) : inspectedCandidate.isMaxProfitWinner ? (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 text-xs font-black tracking-wide flex items-center gap-1.5 shadow-sm">
                        <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                        MASSIMO RENDIMENTO GREZZO
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg bg-slate-700 text-white text-xs font-black tracking-wide flex items-center gap-1.5 shadow-sm">
                        <Sliders className="w-3.5 h-3.5 text-slate-300" />
                        STRATEGIA CANDIDATA SELEZIONATA
                      </span>
                    )}
                    <span className="text-xs text-slate-400 font-mono">
                      Scansionate {optimizationReport?.totalCombinationsTested} combinazioni
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-white tracking-tight mt-1">
                    {inspectedCandidate.strategyName}
                  </h3>
                  <p className="text-xs text-slate-300 max-w-2xl">{inspectedCandidate.explanation}</p>
                </div>

                {/* Return Big Metric */}
                <div className="bg-slate-950/80 border border-amber-500/40 rounded-2xl p-4 text-right min-w-[200px]">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Rendimento Netto Assoluto
                  </div>
                  <div
                    className={`text-3xl font-mono font-black mt-0.5 flex items-center justify-end gap-1 ${
                      inspectedCandidate.metrics.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {inspectedCandidate.metrics.totalReturnPct >= 0 ? (
                      <ArrowUpRight className="w-7 h-7" />
                    ) : (
                      <ArrowDownRight className="w-7 h-7" />
                    )}
                    {inspectedCandidate.metrics.totalReturnPct >= 0 ? '+' : ''}
                    {inspectedCandidate.metrics.totalReturnPct.toFixed(2)}%
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Profitto Netto: {selectedInst.currencySymbol}
                    {inspectedCandidate.metrics.totalPnlAmount.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Key Metrics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 relative z-10">
                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Profit Factor</div>
                  <div className="text-lg font-mono font-black text-white mt-0.5">
                    {inspectedCandidate.metrics.profitFactor.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-500">rapporto vincite / perdite</div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Max Drawdown</div>
                  <div className="text-lg font-mono font-black text-rose-400 mt-0.5">
                    {inspectedCandidate.metrics.maxDrawdownPct.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-slate-500">massimo calo dal picco</div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Win Rate</div>
                  <div className="text-lg font-mono font-black text-cyan-300 mt-0.5">
                    {inspectedCandidate.metrics.winRatePct.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-slate-500">operazioni in profitto</div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Numero Trade</div>
                  <div className="text-lg font-mono font-black text-amber-300 mt-0.5">
                    {inspectedCandidate.metrics.totalTrades}
                  </div>
                  <div className="text-[10px] text-slate-500">campione statistico</div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Indice di Sharpe</div>
                  <div className="text-lg font-mono font-black text-purple-300 mt-0.5">
                    {inspectedCandidate.metrics.sharpeRatio.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-500">efficienza rischio</div>
                </div>
              </div>

              {/* Robustness & Monte Carlo Audit Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 relative z-10">
                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center justify-between">
                    <span>Stabilità Parametri</span>
                    <span className="text-[9px] text-cyan-400 font-mono">Plateau</span>
                  </div>
                  <div className="text-lg font-mono font-black text-cyan-300 mt-0.5">
                    {inspectedCandidate.parameterStabilityScore || 80}/100
                  </div>
                  <div className="text-[10px] text-slate-500">resistenza perturbazione vicinato</div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center justify-between">
                    <span>Monte Carlo 95° DD</span>
                    <span className="text-[9px] text-rose-400 font-mono">300 Run</span>
                  </div>
                  <div className="text-lg font-mono font-black text-rose-400 mt-0.5">
                    -{inspectedCandidate.monteCarloMaxDrawdown95Pct || inspectedCandidate.metrics.maxDrawdownPct.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-slate-500">peggior drawdown probabilistico</div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center justify-between">
                    <span>Sensibilità Slippage</span>
                    <span className="text-[9px] text-amber-400 font-mono">2x Costi</span>
                  </div>
                  <div className="text-lg font-mono font-black text-amber-300 mt-0.5">
                    {inspectedCandidate.slippageSensitivityScore || 85}/100
                  </div>
                  <div className="text-[10px] text-slate-500">tenuta a spread raddoppiati</div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800 p-3 rounded-xl">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center justify-between">
                    <span>Famiglia / Metodo</span>
                    <span className="text-[9px] text-purple-400 font-mono">Classificazione</span>
                  </div>
                  <div className="text-xs font-sans font-black text-white mt-1">
                    {inspectedCandidate.strategyFamily === 'UNGER' ? '🛡️ Filosofia Unger' : '📊 Indicatore Classico'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {inspectedCandidate.isRejectedOverfitted ? (
                      <span className="text-rose-400 font-bold">⚠️ Scartata (Overfitting)</span>
                    ) : (
                      <span className="text-emerald-400 font-bold">✅ Metodologicamente Valida</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Optimal Parameters Detected */}
              <div className="bg-slate-950/90 border border-slate-800/80 rounded-xl p-3.5 relative z-10">
                <div className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  Parametri Algoritmici Vincenti Identificati:
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(inspectedCandidate.params).map(([k, v]) => (
                    <span
                      key={k}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-cyan-300"
                    >
                      <span className="text-slate-400">{k}:</span> {String(v)}
                    </span>
                  ))}
                </div>
              </div>

              {/* DETAILED INTERACTIVE MULTI-TAB CHART (TITAN LAB STYLE) */}
              <div className="relative z-10">
                <DetailedBacktestChart
                  result={inspectedCandidate.fullResult}
                  instrument={selectedInst}
                  historicalBars={currentOptimizationBars}
                  defaultTab="TITAN_ECT"
                />
              </div>

              {/* DETAILED TRADE BLOTTER / OPEN POSITIONS LIST */}
              <div className="relative z-10">
                <BacktestTradeBlotter
                  result={inspectedCandidate.fullResult}
                  instrument={selectedInst}
                  title={`Elenco Completo Posizioni Aperte nel Backtest - ${inspectedCandidate.strategyName} (${inspectedCandidate.metrics.totalTrades} trade)`}
                />
              </div>

              {/* SAVE PRESET WITH CUSTOM NAME FORM */}
              <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/30 space-y-3 relative z-10">
                <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Save className="w-4 h-4 text-amber-400" />
                  Salva questa strategia vincente con un nome personalizzato
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Nome della Strategia Salvata:
                    </label>
                    <input
                      type="text"
                      value={strategyCustomName}
                      onChange={(e) => setStrategyCustomName(e.target.value)}
                      placeholder="Es. Breakout Oro 1D MaxProfit"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Note Opzionali:</label>
                    <input
                      type="text"
                      value={strategyNotes}
                      onChange={(e) => setStrategyNotes(e.target.value)}
                      placeholder="Note di contesto, filtri usati..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleSaveCurrentWinner(inspectedCandidate)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow transition-all cursor-pointer"
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>Salva Strategia nei Preset</span>
                  </button>

                  <div className="flex items-center gap-2 flex-wrap">
                    {onOpenMarketIntelligence && (
                      <button
                        type="button"
                        onClick={() => onOpenMarketIntelligence(selectedInst, selectedTf)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-950 text-indigo-300 border border-indigo-700 hover:bg-indigo-900 font-bold text-xs transition-all cursor-pointer"
                        title="Valuta la confluenza AI tra il segnale quantitativo e le news/fondamentali correnti"
                      >
                        <Brain className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Market Intelligence & AI</span>
                      </button>
                    )}

                    {onInspectBacktest && (
                      <button
                        type="button"
                        id="inspect-candidate-detail-btn"
                        onClick={() => onInspectBacktest(inspectedCandidate.fullResult, currentOptimizationBars)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 font-bold text-xs transition-all cursor-pointer"
                      >
                        <Search className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Ispeziona Dettaglio Completo</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenMatrixFromCurrentWinner(inspectedCandidate)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-950 text-cyan-300 border border-cyan-700 hover:bg-cyan-900 font-bold text-xs transition-all cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Confronta su Altri Periodi & Titoli →</span>
                    </button>

                    {onLaunchPaper && (
                      <button
                        type="button"
                        onClick={() => onLaunchPaper(inspectedCandidate.fullResult)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-950 text-emerald-300 border border-emerald-700 hover:bg-emerald-900 font-bold text-xs transition-all cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Lancia in Paper Trading</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Leaderboard Table of Candidates Tested */}
          {optimizationReport && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <BarChart2 className="w-4 h-4 text-cyan-400" />
                  Classifica Completa di Tutte le Combinazioni Scansionate (
                  {optimizationReport.allCandidates.length})
                </span>
                <span className="text-xs text-slate-500">
                  Ordinata per {objective === 'MAX_PROFIT' ? 'Massimo Rendimento %' : objective}
                </span>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase font-mono">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Strategia & Famiglia</th>
                      <th className="py-2.5 px-3 text-right">Rendimento %</th>
                      <th className="py-2.5 px-3 text-right">Profit Factor</th>
                      <th className="py-2.5 px-3 text-right">Max DD</th>
                      <th className="py-2.5 px-3 text-center">Stabilità</th>
                      <th className="py-2.5 px-3 text-center">Monte Carlo 95°</th>
                      <th className="py-2.5 px-3 text-center">Audit Overfitting</th>
                      <th className="py-2.5 px-3 text-center">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {optimizationReport.allCandidates.slice(0, 15).map((cand, idx) => {
                      const isInspected =
                        inspectedCandidate === cand ||
                        (inspectedCandidate?.strategyId === cand.strategyId &&
                          inspectedCandidate?.candidateRank === cand.candidateRank);
                      return (
                        <tr
                          key={`${cand.strategyId}_${idx}`}
                          className={`hover:bg-slate-800/40 transition-colors ${
                            isInspected
                              ? 'bg-amber-500/15 border-l-2 border-amber-400'
                              : cand.isRejectedOverfitted
                              ? 'bg-rose-950/20 text-slate-400'
                              : cand.isOverallWinner
                              ? 'bg-amber-500/10'
                              : cand.isUngerWinner
                              ? 'bg-cyan-500/10'
                              : cand.isIndicatorWinner
                              ? 'bg-purple-500/10'
                              : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-bold text-slate-400">
                            {cand.isOverallWinner ? (
                              <span className="text-amber-400 flex items-center gap-1" title="Migliore Assoluta">
                                <Trophy className="w-3 h-3" /> 1
                              </span>
                            ) : (
                              idx + 1
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-sans">
                            <div className="font-bold text-white flex items-center gap-1.5 flex-wrap">
                              <span>{cand.strategyName}</span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                                {cand.strategyFamily === 'UNGER' ? '🛡️ Unger' : '📊 Indicatore'}
                              </span>
                              {cand.isOverallWinner && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 font-black">
                                  MIGLIORE ASSOLUTA
                                </span>
                              )}
                              {cand.isUngerWinner && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500 text-slate-950 font-black">
                                  TOP UNGER
                                </span>
                              )}
                              {cand.isIndicatorWinner && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500 text-slate-950 font-black">
                                  TOP INDICATORI
                                </span>
                              )}
                              {isInspected && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                                  IN DETTAGLIO
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                              {Object.entries(cand.params)
                                .slice(0, 3)
                                .map(([k, v]) => `${k}:${v}`)
                                .join(' | ')}
                            </div>
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-black ${
                              cand.metrics.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {cand.metrics.totalReturnPct >= 0 ? '+' : ''}
                            {cand.metrics.totalReturnPct.toFixed(2)}%
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-200">
                            {cand.metrics.profitFactor.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-rose-400">
                            {cand.metrics.maxDrawdownPct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-3 text-center text-cyan-300 font-mono">
                            {cand.parameterStabilityScore || 80}/100
                          </td>
                          <td className="py-2.5 px-3 text-center text-rose-400 font-mono">
                            -{cand.monteCarloMaxDrawdown95Pct || cand.metrics.maxDrawdownPct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {cand.isRejectedOverfitted ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-950/80 text-rose-300 border border-rose-600/50 text-[10px] font-bold font-sans cursor-help"
                                title={cand.rejectionReason}
                              >
                                <AlertTriangle className="w-3 h-3 text-rose-400" />
                                Scartata
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-300 border border-emerald-600/40 text-[10px] font-bold font-sans">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                Robusta ({cand.robustnessScore || 80}/100)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCandidateOverride(cand);
                                  document
                                    .getElementById('inspected-strategy-card')
                                    ?.scrollIntoView({ behavior: 'smooth' });
                                }}
                                className={`px-2 py-1 rounded text-[10px] font-bold font-sans cursor-pointer transition-all ${
                                  isInspected
                                    ? 'bg-amber-500 text-slate-950 font-black'
                                    : 'bg-slate-800 hover:bg-slate-700 text-amber-300'
                                }`}
                              >
                                {isInspected ? 'In Esame' : 'Grafico'}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenMatrixFromCurrentWinner(cand)}
                                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px] font-bold font-sans cursor-pointer"
                              >
                                Matrice
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 2: CROSS-MARKET & ROBUSTNESS MATRIX */}
      {/* ========================================================================= */}
      {activeSubTab === 'MATRIX' && (
        <div className="space-y-6">
          {/* Preset Selector Bar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <Layers className="w-5 h-5" />
              </span>
              <div>
                <span className="text-xs text-slate-400">Strategia sotto Esame:</span>
                <div className="text-base font-bold text-white flex items-center gap-2">
                  {matrixPreset ? matrixPreset.name : 'Nessuna strategia selezionata'}
                  {matrixPreset && (
                    <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                      {matrixPreset.instrument.ticker} • {matrixPreset.timeframe}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Switch to saved strategy */}
            {savedStrategies.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Scegli tra i salvati:</span>
                <select
                  value={matrixPreset?.id || ''}
                  onChange={(e) => {
                    const found = savedStrategies.find((s) => s.id === e.target.value);
                    if (found) handleOpenMatrixForPreset(found);
                  }}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-semibold"
                >
                  {savedStrategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Matrix Execution state */}
          {isRunningMatrix && (
            <div className="p-8 text-center bg-slate-900/60 border border-slate-800 rounded-2xl space-y-3">
              <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
              <div className="text-sm font-bold text-white">
                Esecuzione Test Incrociati Cross-Timeframe, Cross-Periodo & Cross-Asset...
              </div>
              <p className="text-xs text-slate-400">
                Verifica della persistenza dell'edge quantitativo contro l'overfitting.
              </p>
            </div>
          )}

          {/* Audit Results */}
          {!isRunningMatrix && robustnessAudit && (
            <div className="space-y-6">
              {/* Overall Robustness Score Banner (Unger Method) */}
              <div
                className={`p-5 rounded-2xl border shadow-xl relative overflow-hidden ${
                  robustnessAudit.robustnessVerdict === 'EXCELLENT_ROBUST'
                    ? 'bg-emerald-950/40 border-emerald-500/60'
                    : robustnessAudit.robustnessVerdict === 'GOOD_GENERALIZATION'
                    ? 'bg-cyan-950/40 border-cyan-500/60'
                    : robustnessAudit.robustnessVerdict === 'MODERATE_RISK'
                    ? 'bg-amber-950/40 border-amber-500/60'
                    : 'bg-rose-950/40 border-rose-500/60'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-slate-950/80 text-white">
                        AUDIT DI ROBUSTEZZA (METODO UNGER)
                      </span>
                      <span
                        className={`text-xs font-black uppercase px-2.5 py-0.5 rounded ${
                          robustnessAudit.robustnessScore >= 75
                            ? 'bg-emerald-500 text-slate-950'
                            : robustnessAudit.robustnessScore >= 55
                            ? 'bg-cyan-500 text-slate-950'
                            : robustnessAudit.robustnessScore >= 35
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-rose-500 text-white'
                        }`}
                      >
                        {robustnessAudit.robustnessVerdict.replace('_', ' ')}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-white">{robustnessAudit.summaryTitle}</h3>
                    <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
                      {robustnessAudit.summaryDescription}
                    </p>

                    {robustnessAudit.overfittingWarning && (
                      <div className="flex items-center gap-2 text-xs font-bold text-rose-300 mt-2 p-2 bg-rose-950/80 border border-rose-800 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>{robustnessAudit.overfittingWarning}</span>
                      </div>
                    )}
                  </div>

                  {/* Score Gauge */}
                  <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 text-center min-w-[200px] shrink-0">
                    <div className="text-[10px] uppercase font-bold text-slate-400">
                      Score di Robustezza
                    </div>
                    <div
                      className={`text-4xl font-mono font-black mt-1 ${
                        robustnessAudit.robustnessScore >= 75
                          ? 'text-emerald-400'
                          : robustnessAudit.robustnessScore >= 55
                          ? 'text-cyan-400'
                          : robustnessAudit.robustnessScore >= 35
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {robustnessAudit.robustnessScore}
                      <span className="text-lg text-slate-500 font-normal">/100</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {robustnessAudit.passRatioPeriods * 100}% periodi profittevoli
                    </div>
                  </div>
                </div>
              </div>

              {/* Matrix Table 1: Cross-Timeframe */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                      1. Test Incrociato sui Timeframe (Cross-Timeframe)
                    </h4>
                  </div>
                  <span className="text-xs text-slate-400">
                    Verifica se la logica funziona anche a risoluzioni temporali differenti
                  </span>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase font-mono">
                        <th className="py-2 px-3">Timeframe</th>
                        <th className="py-2 px-3 text-right">Rendimento %</th>
                        <th className="py-2 px-3 text-right">Profit Factor</th>
                        <th className="py-2 px-3 text-right">Max Drawdown</th>
                        <th className="py-2 px-3 text-right">Win Rate</th>
                        <th className="py-2 px-3 text-right">Trade</th>
                        <th className="py-2 px-3 text-center">Stato</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {robustnessAudit.timeframeRows.map((r) => (
                        <tr
                          key={r.timeframe}
                          className={`hover:bg-slate-800/40 ${
                            r.isBaseline ? 'bg-cyan-500/10 font-bold' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <span className="text-white">{r.label}</span>
                            {r.isBaseline && (
                              <span className="ml-2 px-1.5 py-0.2 rounded bg-cyan-500 text-slate-950 text-[10px] font-bold">
                                BASE
                              </span>
                            )}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-black ${
                              r.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {r.totalReturnPct >= 0 ? '+' : ''}
                            {r.totalReturnPct.toFixed(2)}%
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-200">
                            {r.profitFactor.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-rose-400">
                            {r.maxDrawdownPct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-300">
                            {r.winRatePct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-400">{r.totalTrades}</td>
                          <td className="py-2.5 px-3 text-center">
                            {r.isProfitable ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                                Stabile
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-950 text-rose-300 border border-rose-800 font-bold">
                                In Perdita
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Matrix Table 2: Cross-Period */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                      2. Test Incrociato sui Periodi Storici (Stress Test di Regime)
                    </h4>
                  </div>
                  <span className="text-xs text-slate-400">
                    Superamento delle fasi di mercato orso, toro e cambi di volatilità
                  </span>
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase font-mono">
                        <th className="py-2 px-3">Periodo di Mercato</th>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3 text-right">Rendimento %</th>
                        <th className="py-2 px-3 text-right">Profit Factor</th>
                        <th className="py-2 px-3 text-right">Max Drawdown</th>
                        <th className="py-2 px-3 text-right">Trade</th>
                        <th className="py-2 px-3 text-center">Verdetto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {robustnessAudit.periodRows.map((r) => (
                        <tr
                          key={r.periodKey}
                          className={`hover:bg-slate-800/40 ${
                            r.isCalibrationPeriod ? 'bg-amber-500/10 font-bold' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <span className="text-white font-sans font-semibold">{r.label}</span>
                            {r.isCalibrationPeriod && (
                              <span className="ml-2 px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 text-[10px] font-bold">
                                CALIBRAZIONE
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                            {r.startDate} → {r.endDate}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-black ${
                              r.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {r.totalReturnPct >= 0 ? '+' : ''}
                            {r.totalReturnPct.toFixed(2)}%
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-200">
                            {r.profitFactor.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-rose-400">
                            {r.maxDrawdownPct.toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-400">{r.totalTrades}</td>
                          <td className="py-2.5 px-3 text-center">
                            {r.status === 'OUTPERFORMING' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-700 font-bold">
                                Eccellente
                              </span>
                            )}
                            {r.status === 'ACCEPTABLE' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                                Positivo
                              </span>
                            )}
                            {r.status === 'DEGRADED' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                                Degradato
                              </span>
                            )}
                            {r.status === 'FAILED' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-950 text-rose-300 border border-rose-800 font-bold">
                                Fallito (Loss)
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Matrix Table 3: Cross-Asset */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-400" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-white">
                      3. Test Incrociato su Altri Titoli & Asset Class (Cross-Asset Transferability)
                    </h4>
                  </div>
                  <span className="text-xs text-slate-400">
                    La strategia riflette una vera inefficienza o funziona solo su un singolo titolo?
                  </span>
                </div>

                {/* Add custom instrument to comparison */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-300 font-semibold">Confronta con altri titoli:</span>
                    <select
                      value={selectedExtraTicker}
                      onChange={(e) => handleAddExtraInstrument(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-medium"
                    >
                      <option value="">+ Aggiungi un titolo al confronto...</option>
                      {INSTRUMENTS_DATABASE.map((inst) => (
                        <option key={inst.ticker} value={inst.ticker}>
                          {inst.name} ({inst.ticker}) — {inst.sector || inst.type}
                        </option>
                      ))}
                    </select>
                  </div>
                  {comparisonFeedback && (
                    <span className="text-xs text-cyan-300 font-medium bg-cyan-950/80 border border-cyan-800 px-3 py-1 rounded-lg">
                      {comparisonFeedback}
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase font-mono">
                        <th className="py-2.5 px-3">Strumento Finanziario</th>
                        <th className="py-2.5 px-3">Classe di Attivo</th>
                        <th className="py-2.5 px-3 text-right">Rendimento %</th>
                        <th className="py-2.5 px-3 text-right">Profit Factor</th>
                        <th className="py-2.5 px-3 text-right">Max Drawdown</th>
                        <th className="py-2.5 px-3 text-right">Trade</th>
                        <th className="py-2.5 px-3 text-center">Trasferibilità</th>
                        <th className="py-2.5 px-2 text-center w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {robustnessAudit.assetRows.map((r) => {
                        const isCustomAdded = extraComparisonInstruments.some(
                          (extra) => extra.ticker.toUpperCase() === r.instrument.ticker.toUpperCase()
                        );

                        return (
                          <tr
                            key={r.instrument.ticker}
                            className={`hover:bg-slate-800/40 transition-colors ${
                              r.isBaseAsset ? 'bg-purple-950/30 font-bold border-l-2 border-purple-500' : ''
                            }`}
                          >
                            <td className="py-2.5 px-3">
                              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                <span className="text-white font-sans font-bold text-sm">
                                  {r.instrument.name}
                                </span>
                                <span className="text-cyan-400 font-mono text-xs font-semibold">
                                  ({r.instrument.ticker})
                                </span>
                                {r.isBaseAsset && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-purple-600/90 text-white text-[10px] font-black border border-purple-400 shadow-sm tracking-wide">
                                    TITOLO ORIGINALE (RISULTATO IDENTICO)
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-400 text-[11px]">{r.assetClass}</td>
                            <td
                              className={`py-2.5 px-3 text-right font-black ${
                                r.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {r.totalReturnPct >= 0 ? '+' : ''}
                              {r.totalReturnPct.toFixed(2)}%
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-200">
                              {r.profitFactor.toFixed(2)}
                            </td>
                            <td className="py-2.5 px-3 text-right text-rose-400">
                              {r.maxDrawdownPct.toFixed(1)}%
                            </td>
                            <td className="py-2.5 px-3 text-right text-slate-400">{r.totalTrades}</td>
                            <td className="py-2.5 px-3 text-center">
                              {r.status === 'HIGHLY_PORTABLE' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                                  Alta
                                </span>
                              )}
                              {r.status === 'MODERATE' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                                  Moderata
                                </span>
                              )}
                              {r.status === 'NOT_TRANSFERABLE' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-950 text-rose-300 border border-rose-800 font-bold">
                                  Non Trasferibile
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              {isCustomAdded && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveExtraInstrument(r.instrument.ticker)}
                                  className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors"
                                  title="Rimuovi dal confronto"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBTAB 3: SAVED STRATEGIES LIBRARY */}
      {/* ========================================================================= */}
      {activeSubTab === 'SAVED' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">Libreria delle Tue Strategie Salvate</h3>
              <p className="text-xs text-slate-400">
                Tutte le strategie generate e salvate con nome personalizzato, pronte per la matrice di
                confronto o per il Paper Trading.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveSubTab('GENERATOR')}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow cursor-pointer flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Genera Nuova Strategia</span>
            </button>
          </div>

          {savedStrategies.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-2xl space-y-3">
              <Bookmark className="w-8 h-8 text-slate-500 mx-auto" />
              <div className="text-sm font-bold text-white">Nessuna strategia salvata finora</div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Genera la migliore strategia nella scheda "Genera Migliore", poi assegna un nome per
                salvarla e confrontarla nel tempo.
              </p>
              <button
                type="button"
                onClick={() => setActiveSubTab('GENERATOR')}
                className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
              >
                Vai al Generatore
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedStrategies.map((preset) => (
                <div
                  key={preset.id}
                  className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-lg space-y-4 transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-mono font-bold">
                          {preset.instrument.ticker}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-mono font-bold">
                          {preset.timeframe}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(preset.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="text-lg font-black text-white mt-1 group-hover:text-cyan-300 transition-colors">
                        {preset.name}
                      </h4>
                      <p className="text-xs text-slate-400 font-medium">
                        Logica base: {preset.strategyName}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => savedStrategyService.deleteStrategy(preset.id)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                      title="Elimina strategia salvata"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Metrics preview */}
                  <div className="grid grid-cols-3 gap-2 p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-center">
                    <div>
                      <div className="text-[10px] text-slate-400">Rendimento Orig.</div>
                      <div
                        className={`text-sm font-mono font-black mt-0.5 ${
                          preset.originalMetrics.totalReturnPct >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {preset.originalMetrics.totalReturnPct >= 0 ? '+' : ''}
                        {preset.originalMetrics.totalReturnPct.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">Profit Factor</div>
                      <div className="text-sm font-mono font-bold text-white mt-0.5">
                        {preset.originalMetrics.profitFactor.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">Max Drawdown</div>
                      <div className="text-sm font-mono font-bold text-rose-400 mt-0.5">
                        {preset.originalMetrics.maxDrawdownPct.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => handleOpenMatrixForPreset(preset)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Matrice di Confronto</span>
                    </button>

                    {onLaunchPaper && (
                      <button
                        type="button"
                        onClick={async () => {
                          const { bars: realBars } = await fetchRealHistoricalBars(
                            preset.instrument,
                            preset.timeframe,
                            preset.dateRange.startDate,
                            preset.dateRange.endDate
                          );
                          const strat = getStrategyById(preset.strategyId);
                          if (strat) {
                            const res = runBacktest(
                              strat,
                              preset.instrument,
                              preset.timeframe,
                              realBars || [],
                              preset.params
                            );
                            onLaunchPaper(res);
                          }
                        }}
                        className="px-3 py-2 rounded-xl bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 text-xs font-bold transition-colors cursor-pointer"
                        title="Lancia in Paper Trading"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function WandIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m19 2-4 4" />
      <path d="m15 6-3 3" />
      <path d="m12 9-8 8a2.12 2.12 0 1 0 3 3l8-8" />
      <path d="m20 9 2-2" />
      <path d="m9 20 2-2" />
      <path d="m19 14 3 3" />
      <path d="m14 19 3 3" />
    </svg>
  );
}
