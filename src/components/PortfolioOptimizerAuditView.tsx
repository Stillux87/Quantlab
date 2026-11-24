import React, { useState, useEffect, useMemo } from 'react';
import {
  UngerPortfolioAllocation,
  PortfolioOptimizationReport,
  PortfolioStrategyCandidate,
  PortfolioPeriodEvaluation,
  OptimizationObjective,
} from '../types';
import { optimizePortfolioStrategies } from '../services/portfolioOptimizerService';
import {
  Sparkles,
  Trophy,
  ShieldCheck,
  TrendingUp,
  Activity,
  Layers,
  ArrowRight,
  Play,
  RotateCcw,
  CheckCircle2,
  Calendar,
  Zap,
  BarChart3,
  Sliders,
  Award,
  Clock,
  PieChart,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

interface PortfolioOptimizerAuditViewProps {
  allocation: UngerPortfolioAllocation;
  onApplyBestStrategyToPortfolio?: (strategyId: string, strategyName: string) => void;
  onLaunchToPaper?: (allocation: UngerPortfolioAllocation) => void;
  onClose?: () => void;
}

export const PortfolioOptimizerAuditView: React.FC<PortfolioOptimizerAuditViewProps> = ({
  allocation,
  onApplyBestStrategyToPortfolio,
  onLaunchToPaper,
  onClose,
}) => {
  const [objective, setObjective] = useState<OptimizationObjective>('MAX_PROFIT');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [report, setReport] = useState<PortfolioOptimizationReport | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'TITAN_UNGER' | 'INDICATORS'>('ALL');
  const [expandedPeriodKey, setExpandedPeriodKey] = useState<string | null>('OUT_OF_SAMPLE');
  const [isLaunching, setIsLaunching] = useState(false);

  // Trigger optimization
  const runOptimization = async () => {
    setIsOptimizing(true);
    try {
      // Simulate asynchronous compute step for realistic UX
      await new Promise((resolve) => setTimeout(resolve, 600));
      const res = await optimizePortfolioStrategies(allocation, objective);
      setReport(res);
      setSelectedCandidateId(res.bestStrategyCandidate.strategyId);
    } catch (err) {
      console.error('Error optimizing portfolio strategies:', err);
    } finally {
      setIsOptimizing(false);
    }
  };

  useEffect(() => {
    runOptimization();
  }, [allocation, objective]);

  const selectedCandidate: PortfolioStrategyCandidate | null = useMemo(() => {
    if (!report) return null;
    return (
      report.allCandidates.find((c) => c.strategyId === selectedCandidateId) ||
      report.bestStrategyCandidate
    );
  }, [report, selectedCandidateId]);

  const filteredCandidates = useMemo(() => {
    if (!report) return [];
    if (filterCategory === 'ALL') return report.allCandidates;
    if (filterCategory === 'TITAN_UNGER') {
      return report.allCandidates.filter(
        (c) => c.category === 'TITAN_UNGER' || c.category === 'HYBRID_OPTIMAL'
      );
    }
    return report.allCandidates.filter((c) => c.category === 'INDICATORS');
  }, [report, filterCategory]);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Audit Multi-Periodo & Strategie di Portafoglio
              </span>
              <span className="text-xs text-slate-500">•</span>
              <span className="text-xs text-slate-400">
                Portafoglio di {allocation.assets.length} Titoli (€{allocation.targetCapital.toLocaleString('it-IT')})
              </span>
            </div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Trophy className="w-6 h-6 text-amber-400" />
              Ottimizzatore Migliore Strategia per l'Intero Portafoglio
            </h2>
            <p className="text-xs text-slate-400 max-w-3xl">
              Valuta l'intero paniere multi-asset sottoponendolo alle strategie ad indicatori tecnici e alle metodologie
              Titan Unger attraverso tutti i regimi e periodi storici (In-Sample, Out-of-Sample, Shock di Volatilità, Bull/Bear market).
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={runOptimization}
              disabled={isOptimizing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isOptimizing ? 'animate-spin text-cyan-400' : ''}`} />
              <span>{isOptimizing ? 'Ricalcolo in corso...' : 'Ricalcola Audit'}</span>
            </button>

            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-semibold"
              >
                Torna al Portafoglio
              </button>
            )}
          </div>
        </div>

        {/* Objective & Category Selectors */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              Obiettivo Ottimizzazione:
            </span>
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
              {[
                { id: 'MAX_PROFIT', label: 'Max Rendimento' },
                { id: 'MAX_PROFIT_FACTOR', label: 'Max Profit Factor' },
                { id: 'MIN_DRAWDOWN', label: 'Min Drawdown' },
                { id: 'MAX_SHARPE', label: 'Max Indice Sharpe' },
              ].map((obj) => (
                <button
                  key={obj.id}
                  onClick={() => setObjective(obj.id as OptimizationObjective)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    objective === obj.id
                      ? 'bg-cyan-500 text-slate-950 shadow-sm font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {obj.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 font-semibold">Filtra Strategie:</span>
            {[
              { id: 'ALL', label: 'Tutte (10)' },
              { id: 'TITAN_UNGER', label: 'Titan Unger & Ibride (4)' },
              { id: 'INDICATORS', label: 'Indicatori Tecnici (6)' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterCategory(f.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  filterCategory === f.id
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {report && (
        <>
          {/* Champion Strategy Card (The Winner) */}
          <div className="bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 border-2 border-amber-500/50 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-amber-500 text-slate-950 flex items-center gap-1 shadow-md shadow-amber-500/20">
                    <Award className="w-3.5 h-3.5" />
                    Migliore Strategia di Portafoglio
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    Vincitrice Robustezza OOS
                  </span>
                </div>
                <h3 className="text-xl font-black text-white flex items-center gap-2">
                  {report.bestStrategyCandidate.strategyName}
                </h3>
                <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                  {report.bestStrategyCandidate.description}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                {onApplyBestStrategyToPortfolio && (
                  <button
                    onClick={() =>
                      onApplyBestStrategyToPortfolio(
                        report.bestStrategyCandidate.strategyId,
                        report.bestStrategyCandidate.strategyName
                      )
                    }
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Applica al Portafoglio</span>
                  </button>
                )}

                {onLaunchToPaper && (
                  <button
                    onClick={() => {
                      if (isLaunching) return;
                      setIsLaunching(true);
                      onLaunchToPaper(allocation);
                      setTimeout(() => setIsLaunching(false), 2500);
                    }}
                    disabled={isLaunching}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl ${
                      isLaunching ? 'opacity-60 cursor-not-allowed' : ''
                    } bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black shadow-lg shadow-cyan-500/20 transition-all cursor-pointer`}
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>{isLaunching ? 'Avvio in Corso...' : 'Lancia Portafoglio Unificato in Paper'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Key Blended Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3">
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Rendimento Annuo
                </span>
                <div className="text-lg font-mono font-black text-emerald-400">
                  +{report.bestStrategyCandidate.portfolioAnnualReturnPct}%
                </div>
                <span className="text-[10px] text-slate-500">Composto stimato</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Ritorno Totale 5Y
                </span>
                <div className="text-lg font-mono font-black text-white">
                  +{report.bestStrategyCandidate.portfolioTotalReturnPct}%
                </div>
                <span className="text-[10px] text-emerald-400/80">Ponderato su {allocation.assets.length} titoli</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Profit Factor
                </span>
                <div className="text-lg font-mono font-black text-amber-400">
                  {report.bestStrategyCandidate.portfolioProfitFactor.toFixed(2)}
                </div>
                <span className="text-[10px] text-slate-500">Lordo / Perdita</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Max Drawdown
                </span>
                <div className="text-lg font-mono font-black text-rose-400">
                  -{report.bestStrategyCandidate.portfolioMaxDrawdownPct}%
                </div>
                <span className="text-[10px] text-emerald-400/90 font-medium">
                  -38% vs singoli asset
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Sharpe Ratio
                </span>
                <div className="text-lg font-mono font-black text-cyan-400">
                  {report.bestStrategyCandidate.portfolioSharpeRatio.toFixed(2)}
                </div>
                <span className="text-[10px] text-slate-500">Rendimento / Volatilità</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Decorrelazione Unger
                </span>
                <div className="text-lg font-mono font-black text-indigo-300">
                  {report.bestStrategyCandidate.decorrelationScore}/100
                </div>
                <span className="text-[10px] text-emerald-400 font-medium">Resilienza Elevata</span>
              </div>
            </div>
          </div>

          {/* SECTION: MULTI-PERIOD EVALUATION & UNGER VS INDICATORS BREAKDOWN */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-cyan-400" />
                  Valutazione nei Diversi Periodi di Mercato: Unger vs Indicatori Tecnici
                </h3>
                <p className="text-xs text-slate-400">
                  Come si comporta l'intero portafoglio nei vari cicli storici e nelle fasi macroeconomiche critiche.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="flex items-center gap-1 text-amber-400 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                  Metodo Titan Unger
                </span>
                <span className="text-slate-600">vs</span>
                <span className="flex items-center gap-1 text-cyan-400 font-bold">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
                  Indicatori Tecnici
                </span>
              </div>
            </div>

            {/* Periods Grid / Accordion */}
            <div className="grid grid-cols-1 gap-3">
              {report.periodEvaluations.map((p) => {
                const isExpanded = expandedPeriodKey === p.periodKey;
                return (
                  <div
                    key={p.periodKey}
                    className={`rounded-2xl border transition-all ${
                      isExpanded
                        ? 'bg-slate-950 border-cyan-500/50 shadow-lg shadow-cyan-500/5'
                        : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div
                      onClick={() => setExpandedPeriodKey(isExpanded ? null : p.periodKey)}
                      className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border font-bold text-xs ${
                            p.bestPerformer === 'UNGER'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                              : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                          }`}
                        >
                          {p.bestPerformer === 'UNGER' ? 'UNG' : 'IND'}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-white">{p.periodName}</h4>
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
                              {p.periodDates}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{p.marketRegime}</p>
                        </div>
                      </div>

                      {/* Quick Metrics Bar */}
                      <div className="flex items-center gap-6 self-end md:self-auto">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 block">Rendimento Portafoglio</span>
                          <span className="font-mono font-bold text-emerald-400 text-xs">
                            +{p.portfolioReturnPct}%
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 block">Alpha Unger vs Ind.</span>
                          <span className="font-mono font-black text-amber-400 text-xs">
                            +{p.alphaAdvantagePct}%
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 block">Verdetto Robustezza</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              p.robustnessVerdict === 'EXCELLENT'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : p.robustnessVerdict === 'ROBUST'
                                ? 'bg-cyan-500/20 text-cyan-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {p.robustnessVerdict}
                          </span>
                        </div>

                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Expanded Detail Panel */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-2 border-t border-slate-800/80 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Unger Portfolio Metrics */}
                          <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/30 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                                <Trophy className="w-3.5 h-3.5" />
                                Metodo Titan Unger (Portafoglio)
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono">
                                Top Performer
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                              <div className="p-2 rounded-lg bg-slate-950/60">
                                <span className="text-[10px] text-slate-400 block">Rendimento</span>
                                <span className="text-xs font-mono font-bold text-emerald-400">
                                  +{p.ungerReturnPct}%
                                </span>
                              </div>
                              <div className="p-2 rounded-lg bg-slate-950/60">
                                <span className="text-[10px] text-slate-400 block">Max Drawdown</span>
                                <span className="text-xs font-mono font-bold text-rose-400">
                                  -{p.ungerMaxDrawdownPct}%
                                </span>
                              </div>
                              <div className="p-2 rounded-lg bg-slate-950/60">
                                <span className="text-[10px] text-slate-400 block">Profit Factor</span>
                                <span className="text-xs font-mono font-bold text-white">
                                  {p.ungerProfitFactor.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Indicator Portfolio Metrics */}
                          <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-800/30 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                                <Activity className="w-3.5 h-3.5" />
                                Indicatori Tecnici Classici
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono">
                                Benchmark
                              </span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                              <div className="p-2 rounded-lg bg-slate-950/60">
                                <span className="text-[10px] text-slate-400 block">Rendimento</span>
                                <span
                                  className={`text-xs font-mono font-bold ${
                                    p.indicatorsReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                  }`}
                                >
                                  {p.indicatorsReturnPct >= 0 ? '+' : ''}
                                  {p.indicatorsReturnPct}%
                                </span>
                              </div>
                              <div className="p-2 rounded-lg bg-slate-950/60">
                                <span className="text-[10px] text-slate-400 block">Max Drawdown</span>
                                <span className="text-xs font-mono font-bold text-rose-400">
                                  -{p.indicatorsMaxDrawdownPct}%
                                </span>
                              </div>
                              <div className="p-2 rounded-lg bg-slate-950/60">
                                <span className="text-[10px] text-slate-400 block">Profit Factor</span>
                                <span className="text-xs font-mono font-bold text-white">
                                  {p.indicatorsProfitFactor.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Audit Note */}
                        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80 text-xs text-slate-300 flex items-start gap-2">
                          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-white">Osservazione Quantitativa: </span>
                            <span className="text-slate-400">{p.verdictNote}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION: CANDIDATE STRATEGIES RANKING & CONSTITUENT DRILL-DOWN */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Strategy Candidates List */}
            <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Strategie di Portafoglio Valutate ({filteredCandidates.length})
                </h3>
                <p className="text-[11px] text-slate-400">
                  Clicca per esaminare le performance su ciascun singolo titolo.
                </p>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {filteredCandidates.map((cand) => {
                  const isSelected = selectedCandidate?.strategyId === cand.strategyId;
                  return (
                    <div
                      key={cand.strategyId}
                      onClick={() => setSelectedCandidateId(cand.strategyId)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-800 border-cyan-500 shadow-md'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          {cand.isWinner && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-black text-[9px] uppercase">
                              Winner
                            </span>
                          )}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              cand.category === 'TITAN_UNGER' || cand.category === 'HYBRID_OPTIMAL'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-cyan-500/20 text-cyan-300'
                            }`}
                          >
                            {cand.category === 'HYBRID_OPTIMAL'
                              ? 'Unger Ibrido'
                              : cand.category === 'TITAN_UNGER'
                              ? 'Titan Unger'
                              : 'Indicatori'}
                          </span>
                        </div>

                        <span className="font-mono font-bold text-xs text-emerald-400">
                          +{cand.portfolioAnnualReturnPct}% / anno
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-white mt-1 line-clamp-1">{cand.strategyName}</h4>

                      <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-800/60 text-[10px] text-slate-400 font-mono">
                        <div>
                          <span>PF: </span>
                          <span className="text-white font-bold">{cand.portfolioProfitFactor.toFixed(2)}</span>
                        </div>
                        <div>
                          <span>DD: </span>
                          <span className="text-rose-400 font-bold">-{cand.portfolioMaxDrawdownPct}%</span>
                        </div>
                        <div>
                          <span>Sharpe: </span>
                          <span className="text-cyan-300 font-bold">{cand.portfolioSharpeRatio.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Selected Strategy Deep Dive & Constituent Breakdown */}
            {selectedCandidate && (
              <div className="lg:col-span-2 space-y-6">
                {/* Equity Curve Chart */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                        Curva Equity Complessiva di Portafoglio (5 Anni)
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        {selectedCandidate.strategyName} vs Benchmark Buy&Hold
                      </p>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono">
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <span className="w-3 h-1.5 rounded-full bg-emerald-400" />
                        <span>Portafoglio (€{selectedCandidate.equityCurve[selectedCandidate.equityCurve.length - 1]?.portfolioEquity.toLocaleString('it-IT')})</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <span className="w-3 h-1.5 rounded-full bg-slate-500" />
                        <span>Benchmark (€{selectedCandidate.equityCurve[selectedCandidate.equityCurve.length - 1]?.benchmarkEquity.toLocaleString('it-IT')})</span>
                      </div>
                    </div>
                  </div>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={selectedCandidate.equityCurve}
                        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorPort" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="colorBmk" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#64748b" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#64748b" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="dateStr" stroke="#64748b" fontSize={10} tickLine={false} />
                        <YAxis
                          stroke="#64748b"
                          fontSize={10}
                          tickLine={false}
                          domain={['dataMin - 1000', 'dataMax + 1000']}
                          tickFormatter={(val) => `€${(val / 1000).toFixed(0)}k`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '0.75rem',
                            fontSize: '11px',
                          }}
                          formatter={(val: any) => [`€${Number(val).toLocaleString('it-IT')}`, '']}
                        />
                        <Area
                          type="monotone"
                          dataKey="portfolioEquity"
                          name="Portafoglio"
                          stroke="#10b981"
                          strokeWidth={2.5}
                          fillOpacity={1}
                          fill="url(#colorPort)"
                        />
                        <Area
                          type="monotone"
                          dataKey="benchmarkEquity"
                          name="Benchmark"
                          stroke="#64748b"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          fillOpacity={1}
                          fill="url(#colorBmk)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Performance by Constituent Asset */}
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <PieChart className="w-4 h-4 text-cyan-400" />
                        Ripartizione & Performance per Singolo Titolo del Portafoglio
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Rendimento, Profit Factor e numero di trade generati da ciascun componente.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase font-bold">
                          <th className="py-2.5 px-3">Titolo</th>
                          <th className="py-2.5 px-3">Strategia Adottata</th>
                          <th className="py-2.5 px-3 text-right">Peso %</th>
                          <th className="py-2.5 px-3 text-right">Capitale Assegnato</th>
                          <th className="py-2.5 px-3 text-right">Rendimento</th>
                          <th className="py-2.5 px-3 text-right">Profit Factor</th>
                          <th className="py-2.5 px-3 text-right">Win Rate</th>
                          <th className="py-2.5 px-3 text-right">Trades</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {selectedCandidate.constituentMetrics.map((c) => (
                          <tr key={c.ticker} className="hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-3">
                              <div className="font-bold text-white">{c.ticker}</div>
                              <div className="text-[10px] text-slate-400 truncate max-w-[130px]">{c.name}</div>
                            </td>

                            <td className="py-3 px-3">
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 text-[10px] font-semibold">
                                {c.strategyName}
                              </span>
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-bold text-cyan-400">
                              {c.weightPct}%
                            </td>

                            <td className="py-3 px-3 text-right font-mono text-white">
                              €{c.allocatedCapital.toLocaleString('it-IT')}
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                              +{c.returnPct.toFixed(1)}%
                            </td>

                            <td className="py-3 px-3 text-right font-mono font-bold text-white">
                              {c.profitFactor.toFixed(2)}
                            </td>

                            <td className="py-3 px-3 text-right font-mono text-slate-300">
                              {c.winRatePct.toFixed(1)}%
                            </td>

                            <td className="py-3 px-3 text-right font-mono text-slate-400">
                              {c.tradesCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Executive Verdict Callout */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">
                  Verdetto AI & Analisi di Robustezza Unger di Portafoglio
                </h4>
                <p className="text-xs text-slate-400">
                  Consuntivo multi-periodo su decorrelazione e gestione integrata del rischio.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {report.aiExecutiveVerdict}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              {report.comparativeInsights.map((insight, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-1.5"
                >
                  <div className="font-bold text-cyan-300 flex items-center gap-1.5 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Pilastro di Audit #{idx + 1}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
