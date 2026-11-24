/**
 * QuantLab - AI Strategy Discovery Lab Component
 * Autonomous quantitative exploration laboratory discovering non-conventional,
 * robust, low-complexity trading hypotheses across calendar anomalies,
 * basket rankings, volatility contractions, and macro regimes.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  FlaskConical,
  Dna,
  ShieldCheck,
  Sparkles,
  Clock,
  TrendingUp,
  BarChart3,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Layers,
  Search,
  RefreshCw,
  Play,
  Square,
  Sliders,
  Filter,
  ArrowRight,
  ChevronRight,
  Info,
  Award,
  Trophy,
  Calendar,
  Zap,
  Flame,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { Instrument, Bar, BacktestResult } from '../types';
import {
  DiscoveryLabConfig,
  DiscoveryProgressStatus,
  DiscoveryReport,
  ResearchLogEntry,
  ExplorationMode,
  DiscoveryFocusArea,
  DiscoveryCategory,
} from '../types/discovery';
import {
  runDiscoveryExperiment,
  getSavedResearchLog,
  DiscoveryRunResult,
} from '../services/discovery/discoveryLabEngine';
import { formatDnaSummary } from '../services/discovery/dnaEngine';
import { INSTRUMENTS_DATABASE } from '../data/instruments';
import { DiscoveryStrategyInspectorModal } from './DiscoveryStrategyInspectorModal';
import { buildBacktestResultFromDiscovery } from '../services/discovery/discoveryStrategyAdapter';

interface AiStrategyDiscoveryLabViewProps {
  currentInstrument: Instrument;
  historicalBars: Bar[];
  onSelectInstrument?: (inst: Instrument) => void;
  onLaunchPaper?: (strategyName: string, instrument: Instrument, backtestResult?: BacktestResult) => void;
  onInspectStandardBacktest?: (backtestResult: BacktestResult, bars?: Bar[]) => void;
}

export const AiStrategyDiscoveryLabView: React.FC<AiStrategyDiscoveryLabViewProps> = ({
  currentInstrument,
  historicalBars,
  onSelectInstrument,
  onLaunchPaper,
  onInspectStandardBacktest,
}) => {
  // Configuration State
  const [config, setConfig] = useState<DiscoveryLabConfig>({
    basketId: 'CURRENT_INSTRUMENT',
    explorationMode: 'FAST',
    focusArea: 'ALL',
    initialCapital: 50000,
    allowStopLoss: true,
    allowTakeProfit: true,
  });

  // Execution & Progress State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<DiscoveryProgressStatus | null>(null);
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryRunResult | null>(null);
  const [researchLog, setResearchLog] = useState<ResearchLogEntry[]>([]);

  // Navigation Sub-tab
  const [labTab, setLabTab] = useState<'DISCOVERIES' | 'TIME_ANOMALIES' | 'RESEARCH_LOG' | 'DISQUALIFIED'>('DISCOVERIES');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Selected Detail Modal State
  const [selectedReport, setSelectedReport] = useState<DiscoveryReport | null>(null);

  // Load persistent log on mount
  useEffect(() => {
    setResearchLog(getSavedResearchLog());
  }, []);

  // Run discovery experiment
  const handleStartDiscovery = async () => {
    if (isRunning) return;
    setErrorMessage(null);
    if (!historicalBars || historicalBars.length < 50) {
      setErrorMessage('Dati storici insufficienti per condurre esperimenti di discovery. Scaricare almeno 50 barre storiche.');
      return;
    }

    setIsRunning(true);
    try {
      const result = await runDiscoveryExperiment(
        currentInstrument,
        historicalBars,
        config,
        (p) => setProgress(p)
      );
      setDiscoveryResult(result);
      setResearchLog(result.researchLog);
      setLabTab('DISCOVERIES');
      if (result.discoveries.length > 0) {
        setSelectedReport(result.discoveries[0]);
      }
    } catch (err) {
      console.error('Discovery Lab execution error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  // Filtered discoveries
  const filteredDiscoveries = useMemo(() => {
    if (!discoveryResult) return [];
    let list = discoveryResult.discoveries;

    if (categoryFilter !== 'ALL') {
      list = list.filter((r) => r.category === categoryFilter);
    }

    if (searchFilter.trim()) {
      const query = searchFilter.toLowerCase();
      list = list.filter(
        (r) =>
          r.hypothesis.name.toLowerCase().includes(query) ||
          r.hypothesis.plainHypothesis.toLowerCase().includes(query) ||
          r.hypothesis.family.toLowerCase().includes(query)
      );
    }

    return list;
  }, [discoveryResult, categoryFilter, searchFilter]);

  // Filtered research log
  const filteredLog = useMemo(() => {
    if (!researchLog) return [];
    if (!searchFilter.trim()) return researchLog;
    const q = searchFilter.toLowerCase();
    return researchLog.filter(
      (entry) =>
        entry.name.toLowerCase().includes(q) ||
        entry.dnaSummary.toLowerCase().includes(q) ||
        entry.family.toLowerCase().includes(q) ||
        entry.status.toLowerCase().includes(q)
    );
  }, [researchLog, searchFilter]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* 1. Module Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-72 h-72 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-indigo-500/20 border border-indigo-500/40 rounded-xl text-indigo-400">
                <FlaskConical className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                    AI STRATEGY DISCOVERY LAB
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 text-[10px] font-mono uppercase tracking-wider font-bold">
                    Experimental Lab
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-400">
                  Laboratorio di ricerca quantitativa per l'esplorazione sistematica di ipotesi non convenzionali, anomalie temporali e strutture a bassa complessità.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex items-center gap-3 bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-xs">
            <div className="border-r border-slate-800 pr-3">
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Titolo Target</span>
              <span className="font-bold text-white font-mono">{currentInstrument.ticker}</span>
            </div>
            <div className="border-r border-slate-800 pr-3">
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Barre Storiche</span>
              <span className="font-bold text-cyan-400 font-mono">{historicalBars.length} barre</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-bold">Audit Passati</span>
              <span className="font-bold text-amber-400 font-mono">{researchLog.length} registrati</span>
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 px-3.5 py-2.5 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-300">
            {errorMessage}
          </div>
        )}

        {/* 2. Exploration Control Bar */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* A. Universe Selection */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Universo / Paniere
            </label>
            <select
              value={config.basketId}
              onChange={(e) => setConfig({ ...config, basketId: e.target.value as any })}
              disabled={isRunning}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="CURRENT_INSTRUMENT">Singolo Titolo ({currentInstrument.ticker})</option>
              <option value="FTSE_MIB">Paniere FTSE MIB (Top 10)</option>
              <option value="US_TECH">Paniere US Tech &amp; Megacap</option>
              <option value="DIVERSIFIED_EUROPE">Multi-Asset Europa Diversificato</option>
            </select>
          </div>

          {/* B. Exploration Mode */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Profondità Esplorazione
            </label>
            <select
              value={config.explorationMode}
              onChange={(e) => setConfig({ ...config, explorationMode: e.target.value as ExplorationMode })}
              disabled={isRunning}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="FAST">FAST (60 - 80 Ipotesi, ~3 sec)</option>
              <option value="DEEP">DEEP (180 - 250 Ipotesi, ~8 sec)</option>
              <option value="EXTREME">EXTREME (400+ Ipotesi, ~15 sec)</option>
            </select>
          </div>

          {/* C. Focus Area */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Ambito di Ricerca
            </label>
            <select
              value={config.focusArea}
              onChange={(e) => setConfig({ ...config, focusArea: e.target.value as DiscoveryFocusArea })}
              disabled={isRunning}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">🌐 Spazio Completo (Multi-Fattore)</option>
              <option value="TIME_ANOMALY">📅 Time Anomaly (Calendario &amp; Turn-Month)</option>
              <option value="RELATIVE_STRENGTH">📊 Relative Strength &amp; Paniere</option>
              <option value="REGIME_CONDITIONED">🏛️ Regime-Conditioned (Benchmark SMA200)</option>
              <option value="UNCONVENTIONAL_AI">🧬 AI Novelty &amp; Ibrido Non Convenzionale</option>
            </select>
          </div>

          {/* D. Initial Capital */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Capitale Iniziale (€)
            </label>
            <input
              type="number"
              value={config.initialCapital}
              onChange={(e) => setConfig({ ...config, initialCapital: Math.max(5000, Number(e.target.value)) })}
              disabled={isRunning}
              step={5000}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs font-mono font-semibold text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* E. Action Button */}
          <div className="flex items-end">
            <button
              onClick={handleStartDiscovery}
              disabled={isRunning}
              className={`w-full py-2 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg ${
                isRunning
                  ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
                  : 'bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white shadow-indigo-500/25 active:scale-[0.98]'
              }`}
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Ricerca in corso...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white text-white" />
                  <span>AVVIA DISCOVERY LAB</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 3. Live Exploration Progress Monitor */}
        {isRunning && progress && (
          <div className="mt-5 p-4 bg-slate-950/80 border border-indigo-500/40 rounded-xl animate-fadeIn space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />
                <span className="font-bold text-white uppercase tracking-wider text-[11px]">
                  Fase: {progress.phase}
                </span>
                <span className="text-slate-400 truncate max-w-xs sm:max-w-md">
                  — {progress.currentHypothesisName}
                </span>
              </div>
              <span className="font-mono font-bold text-indigo-400">{progress.progressPercent}%</span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 h-full transition-all duration-150 rounded-full"
                style={{ width: `${progress.progressPercent}%` }}
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-400 font-mono">
              <div>
                Ipotesi Generate:{' '}
                <span className="text-white font-bold">{progress.hypothesesGenerated}</span>
              </div>
              <div>
                Early Pruned:{' '}
                <span className="text-amber-400 font-bold">{progress.earlyPrunedCount}</span>
              </div>
              <div>
                Deep Tested:{' '}
                <span className="text-cyan-400 font-bold">{progress.testedCount}</span>
              </div>
              <div>
                Scoperte Valide:{' '}
                <span className="text-emerald-400 font-bold">{progress.qualifiedCount}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setLabTab('DISCOVERIES')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              labTab === 'DISCOVERIES'
                ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Scoperte Validate ({discoveryResult?.discoveries.length || 0})</span>
          </button>

          <button
            onClick={() => setLabTab('TIME_ANOMALIES')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              labTab === 'TIME_ANOMALIES'
                ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Time Anomaly Heatmap</span>
          </button>

          <button
            onClick={() => setLabTab('RESEARCH_LOG')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              labTab === 'RESEARCH_LOG'
                ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>AI Research Log ({researchLog.length})</span>
          </button>

          <button
            onClick={() => setLabTab('DISQUALIFIED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              labTab === 'DISQUALIFIED'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Scartate / Senza Edge ({discoveryResult?.disqualifiedReports.length || 0})</span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cerca regole, fattori, DNA..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* 5. TAB CONTENT: DISCOVERIES */}
      {labTab === 'DISCOVERIES' && (
        <div className="space-y-6">
          {/* Category Filter Pills */}
          {discoveryResult && discoveryResult.discoveries.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              <span className="text-slate-500 text-[10px] uppercase font-bold mr-1">Filtra per:</span>
              {[
                { key: 'ALL', label: 'Tutte le Scoperte' },
                { key: 'BEST_ROBUST', label: '🏆 Best Robust' },
                { key: 'MOST_NOVEL', label: '🧬 Most Novel' },
                { key: 'MOST_ROBUST', label: '🛡️ Most Robust' },
                { key: 'BEST_RISK_REWARD', label: '⚖️ Best Risk/Reward' },
                { key: 'BEST_SIMPLE', label: '🧠 Best Simple' },
                { key: 'MOST_INTERESTING', label: '🔬 Most Interesting' },
              ].map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCategoryFilter(c.key)}
                  className={`px-3 py-1 rounded-lg font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    categoryFilter === c.key
                      ? 'bg-slate-700 text-white border border-slate-600'
                      : 'bg-slate-900/60 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {/* If no exploration run yet */}
          {!discoveryResult && !isRunning && (
            <div className="bg-slate-900/50 border border-slate-800 border-dashed rounded-2xl p-12 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <Sparkles className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-2">
                <h3 className="text-base font-bold text-white">Nessuna sessione di discovery attiva</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Clicca su <strong>"AVVIA DISCOVERY LAB"</strong> per consentire all'AI di esplorare sistematicamente combinazioni di fattori temporali, price action e regimi di mercato senza assunzioni umane.
                </p>
              </div>
              <button
                onClick={handleStartDiscovery}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 cursor-pointer transition-all"
              >
                Inizia Esplorazione Quantitativa
              </button>
            </div>
          )}

          {/* Discovery Cards Grid */}
          {discoveryResult && filteredDiscoveries.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredDiscoveries.map((report) => {
                const isSelected = selectedReport?.hypothesis.id === report.hypothesis.id;
                return (
                  <div
                    key={report.hypothesis.id}
                    onClick={() => setSelectedReport(report)}
                    className={`bg-slate-900/90 border rounded-2xl p-5 space-y-4 cursor-pointer transition-all hover:translate-y-[-2px] ${
                      isSelected
                        ? 'border-indigo-500 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Header with Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 font-mono text-[10px] font-bold">
                            {report.hypothesis.id}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold">
                            {report.hypothesis.family}
                          </span>
                          {report.categoryBadges.map((b) => (
                            <span
                              key={b}
                              className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-bold"
                            >
                              {b}
                            </span>
                          ))}
                        </div>
                        <h4 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                          {report.hypothesis.name}
                        </h4>
                      </div>
                    </div>

                    {/* Hypothesis description statement */}
                    <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs text-slate-300 leading-relaxed font-sans">
                      <p className="line-clamp-3 italic">"{report.hypothesis.plainHypothesis}"</p>
                    </div>

                    {/* 4 Score Badges (Robustness, Novelty, Complexity, Confidence) */}
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Robustezza</span>
                        <span className="text-xs font-black font-mono text-emerald-400">
                          {report.scores.robustnessScore}/100
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Novità</span>
                        <span className="text-xs font-black font-mono text-indigo-400">
                          {report.scores.noveltyScore}/100
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Complessità</span>
                        <span
                          className={`text-xs font-black font-mono ${
                            report.scores.complexityScore <= 40
                              ? 'text-emerald-400'
                              : report.scores.complexityScore <= 60
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {report.scores.complexityScore}/100
                        </span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">Fiducia</span>
                        <span className="text-xs font-black font-mono text-cyan-400">
                          {report.scores.confidenceScore}/100
                        </span>
                      </div>
                    </div>

                    {/* Key Financial Metrics */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/60 text-xs font-mono">
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase block">Rendimento Netto</span>
                        <span
                          className={`font-bold ${
                            report.metrics.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {report.metrics.totalReturnPct >= 0 ? '+' : ''}
                          {report.metrics.totalReturnPct.toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase block">Profit Factor</span>
                        <span className="font-bold text-white">{report.metrics.profitFactor.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 uppercase block">Max Drawdown</span>
                        <span className="font-bold text-rose-400">-{report.metrics.maxDrawdownPct.toFixed(1)}%</span>
                      </div>
                    </div>

                    {/* Validation Status & Direct Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>OOS Retention: {(report.outOfSampleMetrics.oosRetentionRatio * 100).toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedReport(report);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-purple-600/90 hover:bg-purple-600 text-white text-[11px] font-bold flex items-center gap-1 shadow transition-all cursor-pointer"
                        >
                          <TrendingUp className="w-3 h-3" />
                          <span>Equity & Operazioni</span>
                        </button>
                        {onInspectStandardBacktest && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const bRes = buildBacktestResultFromDiscovery(
                                report.hypothesis,
                                report,
                                currentInstrument,
                                '1D',
                                historicalBars
                              );
                              onInspectStandardBacktest(bRes, historicalBars);
                            }}
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                            title="Apri nella schermata di dettaglio globale come le altre strategie"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* If exploration run but zero qualified */}
          {discoveryResult && filteredDiscoveries.length === 0 && (
            <div className="p-8 bg-slate-900 border border-slate-800 rounded-2xl text-center space-y-3">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <h4 className="text-sm font-bold text-white">Nessuna ipotesi qualificata in questa categoria</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Tutte le ipotesi testate sono state scartate dai filtri rigorosi di overfitting o non producono profitto netto al netto di spread e commissioni. Consulta la scheda "Scartate / Senza Edge".
              </p>
            </div>
          )}
        </div>
      )}

      {/* 6. TAB CONTENT: TIME ANOMALIES (Calendar Heatmap) */}
      {labTab === 'TIME_ANOMALIES' && discoveryResult && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Analisi Empirica Anomalie di Calendario ({currentInstrument.ticker})
                </h3>
                <p className="text-xs text-slate-400">
                  Distribuzione reale dei rendimenti storici e win rate per giorno della settimana e fase del mese solare.
                </p>
              </div>
            </div>

            {/* Day of Week Breakdown */}
            <div className="pt-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                1. Giorno della Settimana (Day of Week Effect)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                {discoveryResult.timeAnomalyMatrix.dayOfWeekStats.map((d) => (
                  <div key={d.day} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white">{d.day}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{d.sampleCount} sedute</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block">Rendimento Medio</span>
                      <span
                        className={`text-sm font-mono font-bold ${
                          d.avgReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {d.avgReturnPct >= 0 ? '+' : ''}
                        {d.avgReturnPct.toFixed(3)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block">Win Rate Seduta</span>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-cyan-400 h-full rounded-full"
                            style={{ width: `${d.winRatePct}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-200">{d.winRatePct}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Turn of the Month Breakdown */}
            <div className="pt-4 border-t border-slate-800">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                2. Effetto Inizio/Fine Mese (Turn-of-the-Month Anomaly)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {discoveryResult.timeAnomalyMatrix.dayOfMonthStats.map((dom) => (
                  <div key={dom.period} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white">{dom.period}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{dom.sampleCount} barre</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block">Rendimento Medio</span>
                      <span
                        className={`text-sm font-mono font-bold ${
                          dom.avgReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {dom.avgReturnPct >= 0 ? '+' : ''}
                        {dom.avgReturnPct.toFixed(3)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase block">Win Rate</span>
                      <span className="text-xs font-mono font-bold text-cyan-400">{dom.winRatePct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. TAB CONTENT: RESEARCH LOG */}
      {labTab === 'RESEARCH_LOG' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Registro Cronologico Esperimenti AI (Audit Trail)
                </h3>
                <p className="text-xs text-slate-400">
                  Archivio immutabile di tutte le ipotesi generate e testate per prevenire data-mining bias e ripetizioni.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <th className="py-2.5 px-3">ID / Data</th>
                    <th className="py-2.5 px-3">Nome &amp; Ipotesi</th>
                    <th className="py-2.5 px-3">Famiglia</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Rendimento</th>
                    <th className="py-2.5 px-3">Robustness</th>
                    <th className="py-2.5 px-3">Novità</th>
                    <th className="py-2.5 px-3">Complessità</th>
                    <th className="py-2.5 px-3">Motivo Esito</th>
                    <th className="py-2.5 px-3 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredLog.map((entry) => (
                    <tr key={entry.id + entry.timestamp} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3">
                        <span className="font-bold text-indigo-300 block">{entry.id}</span>
                        <span className="text-[10px] text-slate-500">{entry.dateStr}</span>
                      </td>
                      <td className="py-3 px-3 font-sans max-w-xs">
                        <span className="font-bold text-white block truncate">{entry.name}</span>
                        <span className="text-[10px] text-slate-400 line-clamp-1 italic">{entry.dnaSummary}</span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-bold">
                          {entry.family}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        {entry.status === 'ROBUST_DISCOVERY' && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                            Robust
                          </span>
                        )}
                        {entry.status === 'INTERESTING' && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">
                            Interesting
                          </span>
                        )}
                        {entry.status === 'EARLY_PRUNED' && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px]">
                            Pruned
                          </span>
                        )}
                        {entry.status === 'DISQUALIFIED' && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px]">
                            Disqualified
                          </span>
                        )}
                      </td>
                      <td
                        className={`py-3 px-3 font-bold ${
                          entry.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {entry.returnPct >= 0 ? '+' : ''}
                        {entry.returnPct.toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-emerald-300 font-bold">{entry.robustnessScore}/100</td>
                      <td className="py-3 px-3 text-indigo-300 font-bold">{entry.noveltyScore}/100</td>
                      <td className="py-3 px-3 text-slate-300">{entry.complexityScore}/100</td>
                      <td className="py-3 px-3 font-sans text-[11px] text-slate-400 max-w-xs truncate">
                        {entry.rejectionReason || 'Superati i test di robustezza'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {(() => {
                          const matchingReport =
                            discoveryResult?.discoveries.find((r) => r.hypothesis.id === entry.id) ||
                            discoveryResult?.disqualifiedReports.find((r) => r.hypothesis.id === entry.id);
                          if (matchingReport) {
                            return (
                              <button
                                onClick={() => setSelectedReport(matchingReport)}
                                className="px-2 py-1 rounded bg-purple-600/80 hover:bg-purple-600 text-white text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                                title="Ispeziona Equity Line e Elenco Operazioni"
                              >
                                <TrendingUp className="w-2.5 h-2.5" />
                                <span>Dettaglio</span>
                              </button>
                            );
                          }
                          return <span className="text-[10px] text-slate-600">—</span>;
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 8. TAB CONTENT: DISQUALIFIED HYPOTHESES */}
      {labTab === 'DISQUALIFIED' && discoveryResult && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="mb-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Ipotesi Scartate &amp; Rifiutate per Assenza di Edge Statistico
              </h3>
              <p className="text-xs text-slate-400">
                La trasparenza scientifica impone di mostrare ciò che NON funziona. Queste ipotesi sono state eliminate per trade insufficienti, drawdown eccessivo o perdite nette al netto dei costi.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {discoveryResult.disqualifiedReports.map((disq) => (
                <div
                  key={disq.hypothesis.id}
                  className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2 opacity-80 hover:opacity-100 transition-opacity"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-300">{disq.hypothesis.name}</span>
                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                      Scartata
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2 italic">"{disq.hypothesis.plainHypothesis}"</p>
                  <div className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-900/40 text-[11px] text-rose-300">
                    <span className="font-bold">Motivo esclusione: </span>
                    {disq.disqualificationReason}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-slate-400 pt-1">
                    <div>Rendimento: {disq.metrics.totalReturnPct.toFixed(1)}%</div>
                    <div>Profit Factor: {disq.metrics.profitFactor.toFixed(2)}</div>
                    <div>Trade: {disq.metrics.totalTrades}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 9. DEEP DISCOVERY REPORT & MULTI-PERIOD / TIMEFRAME INSPECTOR MODAL */}
      {selectedReport && (
        <DiscoveryStrategyInspectorModal
          report={selectedReport}
          instrument={currentInstrument}
          initialTimeframe="1D"
          initialBars={historicalBars}
          onClose={() => setSelectedReport(null)}
          onOpenGlobalDetail={(bRes, bars) => {
            setSelectedReport(null);
            if (onInspectStandardBacktest) {
              onInspectStandardBacktest(bRes, bars || historicalBars);
            }
          }}
          onLaunchPaperTrading={(bRes) => {
            setSelectedReport(null);
            if (onLaunchPaper) {
              onLaunchPaper(selectedReport.hypothesis.name, currentInstrument, bRes);
            }
          }}
        />
      )}
    </div>
  );
};
