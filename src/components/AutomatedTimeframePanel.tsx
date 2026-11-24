/**
 * QuantLab - Step 2: Automated Timeframe Intelligence & Multi-Timeframe Robustness Engine
 *
 * Implements:
 * - Automatic timeframe determination for backtests <= 2 years.
 * - Multi-timeframe comparative ranking table (5m, 15m, 30m, 1h, 2h, 4h, 1D).
 * - Full metrics breakdown: Return, Net PnL, Max DD, PF, Sharpe, Sortino, Trades (W/L),
 *   Avg Trade, Expectancy, 3 Sub-periods (Iniziale, Intermedia, Recente), Robustness Score.
 * - Strict Qualification: If no timeframe is sufficiently robust, flags the strategy
 *   as "NON IDONEA" with the mandated message:
 *   «"Nessun timeframe testato presenta caratteristiche sufficientemente robuste per considerare questa strategia idonea al trading."»
 */
import React, { useState, useMemo } from 'react';
import {
  Clock,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Layers,
  BarChart3,
  Cpu,
  Play,
  Info,
  Sliders,
  Check,
  Zap,
  HelpCircle,
} from 'lucide-react';
import { Instrument, Timeframe, Bar } from '../types';
import {
  determineOptimalTimeframe,
  AutomatedTimeframeDeterminationResult,
  CandidateTimeframeEvaluation,
  TIMEFRAME_CHRONO_ORDER,
  TIMEFRAME_LABELS,
} from '../services/automatedTimeframeEngine';
import { DateRangeSelector, DateRangeFilter, isRangeOverTwoYears } from './DateRangeSelector';

interface AutomatedTimeframePanelProps {
  selectedInstrument: Instrument;
  selectedTimeframe: Timeframe;
  selectedDateRange: DateRangeFilter;
  historicalBars?: Bar[];
  onSelectTimeframe: (tf: Timeframe) => void;
  onSelectDateRange: (range: DateRangeFilter) => void;
  onRunBatchBacktest: () => void;
  onNavigateToOptimizer?: () => void;
  isAnalyzing: boolean;
}

export const AutomatedTimeframePanel: React.FC<AutomatedTimeframePanelProps> = ({
  selectedInstrument,
  selectedTimeframe,
  selectedDateRange,
  historicalBars,
  onSelectTimeframe,
  onSelectDateRange,
  onRunBatchBacktest,
  onNavigateToOptimizer,
  isAnalyzing,
}) => {
  const [showSubPeriodDetails, setShowSubPeriodDetails] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'ranking' | 'oos' | 'subperiods'>('ranking');

  // Check if historical period exceeds 2 years (requires Daily 1D data)
  const isOverTwoYears = isRangeOverTwoYears(
    selectedDateRange.startDate,
    selectedDateRange.endDate,
    selectedDateRange.presetKey
  );

  // Automatically determine the optimal timeframe for this instrument & date range
  const autoAnalysis: AutomatedTimeframeDeterminationResult = useMemo(() => {
    return determineOptimalTimeframe(
      selectedInstrument,
      undefined,
      selectedDateRange.startDate,
      selectedDateRange.endDate,
      undefined,
      undefined,
      historicalBars
    );
  }, [selectedInstrument, selectedDateRange.startDate, selectedDateRange.endDate, historicalBars]);

  const {
    optimalCandidate,
    maxProfitCandidate,
    candidates,
    overfittingAssessment,
    isStrategyEligible,
    verdictStatus,
    selectionRationale,
  } = autoAnalysis;

  // Set initial timeframe when none is selected or when instrument changes
  const prevInstrumentRef = React.useRef(selectedInstrument.ticker);
  React.useEffect(() => {
    const instrumentChanged = prevInstrumentRef.current !== selectedInstrument.ticker;
    prevInstrumentRef.current = selectedInstrument.ticker;

    if (isOverTwoYears) {
      if (selectedTimeframe !== '1D') {
        onSelectTimeframe('1D');
      }
    } else if (instrumentChanged || !selectedTimeframe) {
      if (autoAnalysis && autoAnalysis.optimalTimeframe) {
        onSelectTimeframe(autoAnalysis.optimalTimeframe);
      }
    }
  }, [selectedInstrument.ticker, autoAnalysis.optimalTimeframe, selectedTimeframe, isOverTwoYears, onSelectTimeframe]);

  const activeCandidate = optimalCandidate || candidates[0];

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 1. Date Range & Historical Regimes Selection (Restores full period choices) */}
      <DateRangeSelector
        currentRange={selectedDateRange}
        onChangeRange={onSelectDateRange}
      />

      {/* 2. Interactive Timeframe Quick Selector (Allows manual and optimal timeframe choice) */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Timeframe Operativo:
            </span>
            <span className="font-mono text-sm font-extrabold text-cyan-400 bg-cyan-950/80 px-2.5 py-0.5 rounded border border-cyan-800/80">
              {selectedTimeframe} ({TIMEFRAME_LABELS[selectedTimeframe] || selectedTimeframe})
            </span>
          </div>
          {isOverTwoYears ? (
            <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 bg-emerald-950/50 px-2.5 py-1 rounded-lg border border-emerald-800/60">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              Periodo &gt; 2 Anni: Vincolato a 1D (Dati 100% reali di borsa)
            </span>
          ) : (
            <span className="text-xs text-slate-400">
              Fai clic su un timeframe per selezionarlo e testarlo
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {TIMEFRAME_CHRONO_ORDER.map((tf) => {
            const isSelected = selectedTimeframe === tf;
            const isOptimal = autoAnalysis.optimalTimeframe === tf;
            const candidate = candidates.find((c) => c.timeframe === tf);
            const isLocked = isOverTwoYears && tf !== '1D';

            return (
              <button
                key={tf}
                disabled={isLocked}
                onClick={() => onSelectTimeframe(tf)}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all relative cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-b from-cyan-950 via-slate-900 to-slate-950 border-cyan-400 shadow-md ring-2 ring-cyan-500/30 text-white'
                    : isLocked
                    ? 'bg-slate-950/30 border-slate-900 opacity-40 cursor-not-allowed text-slate-600'
                    : 'bg-slate-950/60 border-slate-800 hover:bg-slate-850 hover:border-slate-700 text-slate-300'
                }`}
              >
                {isOptimal && !isOverTwoYears && (
                  <span className="absolute -top-2.5 px-2 py-0.5 rounded-full bg-cyan-500 text-slate-950 text-[9px] font-extrabold shadow uppercase tracking-wider">
                    ⭐ Ottimale
                  </span>
                )}
                {isOverTwoYears && tf === '1D' && (
                  <span className="absolute -top-2.5 px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[9px] font-extrabold shadow uppercase tracking-wider">
                    ✓ Reale 100%
                  </span>
                )}
                <span className="text-base font-extrabold font-mono">{tf}</span>
                <span className="text-[10px] text-slate-400 mt-0.5 text-center">
                  {TIMEFRAME_LABELS[tf]?.split(' ')[0] || tf}
                </span>
                {candidate && (
                  <div className="mt-1.5 flex flex-col items-center">
                    <span
                      className={`text-[11px] font-mono font-bold ${
                        candidate.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {candidate.totalReturnPct >= 0 ? '+' : ''}{candidate.totalReturnPct}%
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">
                      PF: {candidate.profitFactor}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step Header */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 relative overflow-hidden backdrop-blur-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 text-xs font-bold border border-cyan-800 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                {isOverTwoYears ? 'ANALISI STORICA PLURIENNALE (> 2 ANNI)' : 'SELEZIONE AUTOMATICA TIMEFRAME (≤ 2 ANNI)'}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                  isStrategyEligible
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    : 'bg-rose-950 text-rose-300 border-rose-800'
                }`}
              >
                {isStrategyEligible ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    STRATEGIA IDONEA
                  </>
                ) : (
                  <>
                    <XCircle className="w-3 h-3 text-rose-400" />
                    STRATEGIA NON IDONEA
                  </>
                )}
              </span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              {isOverTwoYears
                ? 'Analisi Storica Pluriennale a Dati Reali (1D Daily)'
                : 'Analisi Multi-Timeframe Automatica & Robustezza Operativa'}
            </h2>
            <p className="text-slate-400 text-sm max-w-3xl mt-1 leading-relaxed">
              {isOverTwoYears
                ? `Per orizzonti temporali superiori a 2 anni (${selectedDateRange.label}), il sistema applica esclusivamente il timeframe 1D (Daily) per garantire l'uso di dati storici reali al 100% da feed ufficiali di borsa (Yahoo Finance) ed escludere categoricamente qualsiasi serie sintetica.`
                : 'Per backtest fino a 2 anni, il sistema testa automaticamente tutti i timeframe compatibili (5m, 15m, 30m, 1h, 2h, 4h, 1D) sullo stesso periodo storico. Il vincitore non viene scelto semplicemente per il profitto massimo, ma per il miglior compromesso tra rendimento, drawdown, stabilità nei 3 sotto-periodi, tenuta Out-of-Sample e assenza di overfitting.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 self-start md:self-auto">
            <div className="bg-slate-950/90 px-4 py-2.5 rounded-xl border border-slate-800 flex items-center gap-3">
              <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
              <div className="text-xs">
                <div className="text-slate-400">Strumento & Asset Class:</div>
                <div className="font-bold text-white font-mono text-sm">
                  {selectedInstrument.ticker}{' '}
                  <span className="text-xs font-normal text-cyan-400">({selectedInstrument.type})</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Highlight Verdict Banner */}
        {isStrategyEligible && optimalCandidate ? (
          <div className="mt-6 bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-950 border-2 border-cyan-500/40 rounded-xl p-5 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-cyan-500/20 text-cyan-300 text-xs font-extrabold uppercase tracking-wider border border-cyan-500/40 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                    {isOverTwoYears ? 'Timeframe Vincolato su Storico Pluriennale' : 'Timeframe Ottimale Selezionato'}
                  </span>
                  {optimalCandidate.isPlateauMember && (
                    <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 text-xs font-semibold border border-amber-800 flex items-center gap-1">
                      <Layers className="w-3 h-3 text-amber-400" />
                      Altopiano Stabile (Plateau Unger)
                    </span>
                  )}
                  {maxProfitCandidate && maxProfitCandidate.timeframe !== optimalCandidate.timeframe && (
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700">
                      Rendimento Max: {maxProfitCandidate.timeframe} (+{maxProfitCandidate.totalReturnPct}%)
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-3">
                  <span className="text-3xl sm:text-4xl font-black font-mono text-white tracking-tight">
                    {optimalCandidate.timeframe}
                  </span>
                  <span className="text-slate-300 text-base font-medium">
                    {optimalCandidate.label}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    (~{optimalCandidate.totalBars.toLocaleString()} barre analizzate)
                  </span>
                </div>

                <p className="text-slate-300 text-xs sm:text-sm leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  {selectionRationale}
                </p>
              </div>

              {/* Quick Stat Pill Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2.5 shrink-0 font-mono">
                <div className="bg-slate-950/80 px-3.5 py-2.5 rounded-lg border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-sans">Score Robustezza</div>
                  <div className="text-lg font-bold text-cyan-300">
                    {optimalCandidate.robustnessScore}
                    <span className="text-xs text-slate-500 font-normal">/100</span>
                  </div>
                </div>

                <div className="bg-slate-950/80 px-3.5 py-2.5 rounded-lg border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-sans">Profit Factor</div>
                  <div className="text-lg font-bold text-emerald-400">
                    {optimalCandidate.profitFactor.toFixed(2)}
                  </div>
                </div>

                <div className="bg-slate-950/80 px-3.5 py-2.5 rounded-lg border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-sans">Max Drawdown</div>
                  <div className="text-lg font-bold text-amber-400">
                    {optimalCandidate.maxDrawdownPct.toFixed(1)}%
                  </div>
                </div>

                <div className="bg-slate-950/80 px-3.5 py-2.5 rounded-lg border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-sans">Operazioni (V/P)</div>
                  <div className="text-lg font-bold text-white">
                    {optimalCandidate.totalTrades}{' '}
                    <span className="text-xs text-slate-400 font-normal font-sans">
                      ({optimalCandidate.winningTrades}/{optimalCandidate.losingTrades})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* MANDATED CLAUSE (Section 11): When no timeframe is sufficiently robust */
          <div className="mt-6 bg-gradient-to-br from-rose-950/50 via-slate-900 to-slate-950 border-2 border-rose-600/60 rounded-xl p-5 shadow-lg relative overflow-hidden">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 text-xs font-extrabold uppercase tracking-wider border border-rose-500/40 flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-rose-400" />
                    STRATEGIA NON IDONEA
                  </span>
                  <span className="text-xs text-rose-300 font-medium">
                    Requisiti minimi di robustezza non raggiunti
                  </span>
                </div>

                <p className="text-rose-200 text-base font-semibold leading-relaxed">
                  «Nessun timeframe testato presenta caratteristiche sufficientemente robuste per considerare questa strategia idonea al trading.»
                </p>

                <p className="text-slate-300 text-xs max-w-3xl leading-relaxed">
                  Il motore ha testato tutti i timeframe candidati sullo stesso periodo storico. Nessuno di essi ha superato i criteri minimi congiunti
                  (Profit Factor ≥ 1.10, Drawdown contenuto ≤ 35%, numero minimo di trade, tenuta nei 3 sotto-periodi e assenza di crollo Out-of-Sample).
                  In ossequio alle regole di Money Management quantitativo, il sistema non forza arbitrariamente un vincitore.
                </p>
              </div>

              <div className="bg-slate-950/90 p-4 rounded-xl border border-rose-900/60 shrink-0 text-center">
                <div className="text-xs text-slate-400 mb-1 font-sans">Classificazione</div>
                <div className="text-rose-400 font-bold text-sm tracking-wider font-mono uppercase">
                  NON OPERATIVA
                </div>
                <div className="text-[11px] text-slate-500 mt-1 max-w-[180px]">
                  Consigliato modificare parametri o scegliere un'altra strategia.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('ranking')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'ranking'
              ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          Tabella Comparativa Timeframe (Sezione 9)
        </button>

        <button
          onClick={() => setActiveTab('subperiods')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'subperiods'
              ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <Clock className="w-4 h-4" />
          Stabilità nei 3 Sotto-Periodi (Sezione 7)
        </button>

        <button
          onClick={() => setActiveTab('oos')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'oos'
              ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Verifica In-Sample vs Out-of-Sample (Sezione 8)
        </button>
      </div>

      {/* TAB 1: Comparative Ranking Table (Section 9) */}
      {activeTab === 'ranking' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                Matrice di Valutazione e Classifica Multi-Timeframe
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Tutti i timeframe candidati eseguiti con identico capitale, commissioni, regole di ingresso/uscita, SL/TP e parametri.
              </p>
            </div>
            <div className="text-xs text-slate-400 font-mono">
              Totale candidati testati: <span className="text-cyan-400 font-bold">{candidates.length}</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px] font-sans">
                  <th className="py-2.5 px-3 font-semibold">Timeframe</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Rendimento (Totale / PnL)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Max Drawdown</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Profit Factor</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Sharpe / Sortino</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Operazioni (V/P)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Avg Trade / Expectancy</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Sotto-Periodi (1/2/3)</th>
                  <th className="py-2.5 px-3 font-semibold">Cluster / Plateau</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Score Robustezza</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Esito</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {candidates.map((c) => {
                  const isOptimal = c.isOptimalChoice;
                  const isSelected = isOptimal || (!isStrategyEligible && c.timeframe === selectedTimeframe);

                  return (
                    <tr
                      key={c.timeframe}
                      onClick={() => onSelectTimeframe(c.timeframe)}
                      className={`transition-colors cursor-pointer ${
                        c.timeframe === selectedTimeframe
                          ? 'bg-cyan-950/60 border-l-4 border-l-cyan-400 font-medium'
                          : isOptimal
                          ? 'bg-cyan-950/30 border-l-2 border-l-cyan-500/40'
                          : !c.isCandidateEligible
                          ? 'bg-rose-950/10 hover:bg-slate-800/40 opacity-80'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Timeframe */}
                      <td className="py-3 px-3 font-sans">
                        <div className="flex items-center gap-2">
                          {(isOptimal || c.timeframe === selectedTimeframe) && (
                            <CheckCircle2
                              className={`w-4 h-4 shrink-0 ${
                                c.timeframe === selectedTimeframe ? 'text-cyan-400' : 'text-slate-500'
                              }`}
                            />
                          )}
                          <div>
                            <div className="font-mono font-bold text-white text-sm flex items-center gap-1.5">
                              {c.timeframe}
                              {isOptimal && (
                                <span className="px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 text-[10px] font-sans font-extrabold uppercase">
                                  OTTIMALE
                                </span>
                              )}
                              {c.timeframe === selectedTimeframe && !isOptimal && (
                                <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 text-[10px] font-sans font-bold uppercase">
                                  ATTIVO
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 font-sans">{c.label}</div>
                            {c.evaluatedStrategyName && (
                              <div className="text-[9px] text-cyan-400/80 font-sans font-medium">
                                {c.evaluatedStrategyName}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Rendimento Totale / PnL */}
                      <td className="py-3 px-3 text-right">
                        <div
                          className={`font-bold text-sm ${
                            c.totalReturnPct > 0
                              ? 'text-emerald-400'
                              : c.totalReturnPct === 0
                              ? 'text-slate-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {c.totalReturnPct > 0 ? '+' : ''}
                          {c.totalReturnPct.toFixed(2)}%
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {c.totalPnlAmount >= 0 ? '+' : ''}€{c.totalPnlAmount.toLocaleString()}
                        </div>
                      </td>

                      {/* Max Drawdown */}
                      <td className="py-3 px-3 text-right">
                        <div
                          className={`font-semibold ${
                            c.maxDrawdownPct <= 12
                              ? 'text-emerald-400'
                              : c.maxDrawdownPct <= 22
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {c.maxDrawdownPct.toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-slate-500">
                          R/DD: {c.returnToDrawdownRatio.toFixed(2)}
                        </div>
                      </td>

                      {/* Profit Factor */}
                      <td className="py-3 px-3 text-right">
                        <div
                          className={`font-bold ${
                            c.profitFactor >= 1.5
                              ? 'text-emerald-400'
                              : c.profitFactor >= 1.2
                              ? 'text-cyan-400'
                              : c.profitFactor >= 1.0
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {c.profitFactor.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Win: {c.winRatePct.toFixed(0)}%
                        </div>
                      </td>

                      {/* Sharpe / Sortino */}
                      <td className="py-3 px-3 text-right">
                        <div className="text-slate-200">
                          S: <span className="font-bold text-cyan-300">{c.sharpeRatio.toFixed(2)}</span>
                        </div>
                        <div className="text-[10px] text-slate-400">
                          So: {c.sortinoRatio.toFixed(2)}
                        </div>
                      </td>

                      {/* Trades (V/P) */}
                      <td className="py-3 px-3 text-right">
                        <div className="text-white font-bold">{c.totalTrades}</div>
                        <div className="text-[10px] text-slate-400">
                          <span className="text-emerald-400 font-medium">{c.winningTrades}V</span> /{' '}
                          <span className="text-rose-400 font-medium">{c.losingTrades}P</span>
                        </div>
                      </td>

                      {/* Avg Trade / Expectancy */}
                      <td className="py-3 px-3 text-right">
                        <div className="text-slate-200">
                          €{c.avgTradeAmount.toFixed(0)}{' '}
                          <span className="text-[10px] text-slate-400">({c.avgTradePct > 0 ? '+' : ''}{c.avgTradePct}%)</span>
                        </div>
                        <div className="text-[10px] text-cyan-400">
                          Exp: €{c.expectancy.toFixed(0)}
                        </div>
                      </td>

                      {/* Sub-periods */}
                      <td className="py-3 px-3 text-center font-sans">
                        <div className="flex items-center justify-center gap-1">
                          {c.subPeriods.map((sp, idx) => (
                            <span
                              key={idx}
                              title={`${sp.label}: ${sp.returnPct > 0 ? '+' : ''}${sp.returnPct}% (PF: ${sp.profitFactor})`}
                              className={`w-4 h-4 rounded-full text-[9px] font-mono flex items-center justify-center font-bold ${
                                sp.isConsistent
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : sp.isProfitable
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800'
                              }`}
                            >
                              {idx + 1}
                            </span>
                          ))}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 font-mono">
                          {c.subPeriodsConsistentCount}/3 stabili
                        </div>
                      </td>

                      {/* Cluster / Plateau */}
                      <td className="py-3 px-3 font-sans">
                        {c.isPlateauMember ? (
                          <span className="inline-flex items-center gap-1 text-amber-300 font-medium text-[11px]">
                            <Layers className="w-3.5 h-3.5 text-amber-400" />
                            Altopiano
                          </span>
                        ) : c.isIsolatedSpike ? (
                          <span className="inline-flex items-center gap-1 text-rose-400 font-medium text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                            Picco Isolato
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[11px]">Neutro</span>
                        )}
                        <div className="text-[10px] text-slate-500 font-mono">
                          Vicini PF: {c.clusterAvgProfitFactor}
                        </div>
                      </td>

                      {/* Score Robustezza */}
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <div className="w-10 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                c.robustnessScore >= 75
                                  ? 'bg-cyan-400'
                                  : c.robustnessScore >= 55
                                  ? 'bg-amber-400'
                                  : 'bg-rose-400'
                              }`}
                              style={{ width: `${c.robustnessScore}%` }}
                            />
                          </div>
                          <span
                            className={`font-bold ${
                              c.robustnessScore >= 75
                                ? 'text-cyan-300'
                                : c.robustnessScore >= 55
                                ? 'text-amber-300'
                                : 'text-slate-400'
                            }`}
                          >
                            {c.robustnessScore}
                          </span>
                        </div>
                      </td>

                      {/* Esito */}
                      <td className="py-3 px-3 text-center font-sans">
                        {c.isCandidateEligible ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 text-[10px] font-bold uppercase border border-emerald-800">
                            IDONEO
                          </span>
                        ) : (
                          <span
                            title={c.eligibilityReason}
                            className="px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 text-[10px] font-bold uppercase border border-rose-800 inline-flex items-center gap-1"
                          >
                            NON IDONEO
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Sub-Periods Temporal Stability Analysis (Section 7) */}
      {activeTab === 'subperiods' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                Verifica della Stabilità Temporale su 3 Sotto-Periodi ({activeCandidate.timeframe})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Il periodo di backtest è suddiviso in 3 intervalli cronologici: 1) Parte Iniziale, 2) Parte Centrale, 3) Parte Finale.
                Permette di accertare che i rendimenti siano distribuiti uniformemente e non concentrati in una singola fase fortunata.
              </p>
            </div>
            <div className="text-xs font-mono text-cyan-300 bg-cyan-950/80 px-3 py-1.5 rounded-lg border border-cyan-800">
              Consistenza Temporale: <span className="font-bold">{activeCandidate.subPeriodConsistencyScore}%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {activeCandidate.subPeriods.map((sp) => (
              <div
                key={sp.periodIndex}
                className={`p-4 rounded-xl border ${
                  sp.isConsistent
                    ? 'bg-slate-950/80 border-emerald-800/60'
                    : sp.isProfitable
                    ? 'bg-slate-950/80 border-amber-800/60'
                    : 'bg-slate-950/80 border-rose-800/60'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-white text-sm">{sp.label.split('(')[0]}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      sp.isConsistent
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : sp.isProfitable
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {sp.isConsistent ? 'STABILE' : sp.isProfitable ? 'MODERATO' : 'NEGATIVO'}
                  </span>
                </div>

                <div className="text-[11px] text-slate-400 font-mono mb-3">
                  {sp.startDate.slice(0, 10)} → {sp.endDate.slice(0, 10)}
                </div>

                <div className="space-y-2 font-mono text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-slate-850">
                    <span className="text-slate-400 font-sans">Rendimento Fase:</span>
                    <span className={`font-bold ${sp.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {sp.returnPct >= 0 ? '+' : ''}{sp.returnPct}% (€{sp.pnlAmount.toLocaleString()})
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-850">
                    <span className="text-slate-400 font-sans">Profit Factor:</span>
                    <span className="text-white font-bold">{sp.profitFactor}</span>
                  </div>

                  <div className="flex justify-between items-center py-1 border-b border-slate-850">
                    <span className="text-slate-400 font-sans">Max Drawdown:</span>
                    <span className="text-amber-400">{sp.maxDrawdownPct}%</span>
                  </div>

                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-400 font-sans">Operazioni eseguite:</span>
                    <span className="text-slate-300">{sp.tradesCount} trade</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Out-of-Sample Verification (Section 8) */}
      {activeTab === 'oos' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  Verifica Out-of-Sample & Diagnostica Overfitting ({activeCandidate.timeframe})
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                Confronto tra periodo di calibrazione (In-Sample 70%) e periodo di validazione cieca (Out-of-Sample 30%).
              </p>
            </div>

            <span
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border ${
                overfittingAssessment.risk === 'LOW'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                  : overfittingAssessment.risk === 'MODERATE'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                  : 'bg-rose-950/80 text-rose-300 border-rose-800'
              }`}
            >
              {overfittingAssessment.risk === 'LOW' ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              )}
              {overfittingAssessment.title}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
            <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800">
              <div className="text-xs text-slate-400 font-sans mb-1">Rendimento OOS vs In-Sample</div>
              <div className="flex items-baseline gap-2 font-mono">
                <span className={`text-lg font-bold ${activeCandidate.outOfSampleReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {activeCandidate.outOfSampleReturnPct >= 0 ? '+' : ''}{activeCandidate.outOfSampleReturnPct}%
                </span>
                <span className="text-xs text-slate-500">vs +{activeCandidate.inSampleReturnPct}% IS</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-2">
                Efficienza OOS: <span className="text-cyan-300 font-mono font-bold">{activeCandidate.oosEfficiencyPct}%</span>
              </div>
            </div>

            <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800">
              <div className="text-xs text-slate-400 font-sans mb-1">Profit Factor OOS vs IS</div>
              <div className="flex items-baseline gap-2 font-mono">
                <span className="text-lg font-bold text-white">{activeCandidate.outOfSampleProfitFactor}</span>
                <span className="text-xs text-slate-500">vs {activeCandidate.inSampleProfitFactor} IS</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-2">
                Degradazione: {activeCandidate.outOfSampleProfitFactor >= activeCandidate.inSampleProfitFactor * 0.8 ? 'Minima (Eccellente)' : 'Moderata'}
              </div>
            </div>

            <div className="bg-slate-950/80 p-4 rounded-xl border border-slate-800">
              <div className="text-xs text-slate-400 font-sans mb-1">Max Drawdown OOS vs IS</div>
              <div className="flex items-baseline gap-2 font-mono">
                <span className="text-lg font-bold text-amber-400">{activeCandidate.outOfSampleDrawdownPct}%</span>
                <span className="text-xs text-slate-500">vs {activeCandidate.inSampleDrawdownPct}% IS</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-2">
                Tenuta Rischio: {activeCandidate.outOfSampleDrawdownPct <= activeCandidate.inSampleDrawdownPct * 1.3 ? 'Sotto Controllo' : 'Espansione DD'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg">
        <div className="text-xs text-slate-400">
          <div className="font-semibold text-slate-200 flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-cyan-400" />
            Timeframe Operativo: <span className="font-mono text-cyan-300 font-bold">{selectedTimeframe}</span>{' '}
            ({TIMEFRAME_LABELS[selectedTimeframe] || selectedTimeframe})
          </div>
          <p className="mt-0.5">
            {isStrategyEligible && optimalCandidate
              ? `Timeframe ottimale raccomandato: ${optimalCandidate.timeframe} (${optimalCandidate.label}). Puoi selezionare qualsiasi altro timeframe dai selettori rapidi o dalla tabella.`
              : 'Seleziona il timeframe desiderato per avviare il backtest multi-strategia o esplora la Matrice Ottimizzatore.'}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {onNavigateToOptimizer && (
            <button
              id="optimizer-nav-btn"
              onClick={onNavigateToOptimizer}
              className="px-4 py-3 rounded-xl border border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-all w-full sm:w-auto cursor-pointer"
            >
              <Sliders className="w-4 h-4 text-slate-400" />
              Matrice Ottimizzatore
            </button>
          )}

          <button
            id="run-analysis-btn"
            disabled={isAnalyzing}
            onClick={onRunBatchBacktest}
            className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg w-full sm:w-auto cursor-pointer ${
              isAnalyzing
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-cyan-500/20 active:scale-95'
            }`}
          >
            {isAnalyzing ? (
              <>
                <span className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                Calcolo Strategie in corso...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                Avvia Analisi con {selectedTimeframe}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
