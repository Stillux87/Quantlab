/**
 * QuantLab - Discovery Strategy Inspector Modal
 * Enables in-depth inspection of any AI Discovery Lab strategy across periods (2008-2026, COVID, etc.)
 * and timeframes (1D, 4h, 1h, 15m), featuring an interactive Equity Line and full Trade Blotter.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  TrendingUp,
  Calendar,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Zap,
  Activity,
  Award,
  Layers,
  Search,
  Filter,
  ExternalLink,
  Play,
  RotateCw,
  Info,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';
import { DiscoveryReport, DiscoveryHypothesis } from '../types/discovery';
import { Instrument, Timeframe, Bar, BacktestResult, Trade } from '../types';
import { HISTORICAL_PRESETS, DateRangeFilter } from './DateRangeSelector';
import {
  recalculateDiscoveryForTimeframeAndPeriod,
  buildBacktestResultFromDiscovery,
  registerDiscoveryHypothesisInRegistry,
} from '../services/discovery/discoveryStrategyAdapter';

interface DiscoveryStrategyInspectorModalProps {
  report: DiscoveryReport;
  instrument: Instrument;
  initialTimeframe?: Timeframe;
  initialBars?: Bar[];
  onClose: () => void;
  onOpenGlobalDetail: (backtestResult: BacktestResult, bars?: Bar[]) => void;
  onLaunchPaperTrading?: (backtestResult: BacktestResult) => void;
}

export const DiscoveryStrategyInspectorModal: React.FC<DiscoveryStrategyInspectorModalProps> = ({
  report: initialReport,
  instrument,
  initialTimeframe = '1D',
  initialBars = [],
  onClose,
  onOpenGlobalDetail,
  onLaunchPaperTrading,
}) => {
  const hypothesis = initialReport.hypothesis;

  // State
  const [activeTab, setActiveTab] = useState<'equity' | 'trades' | 'dna'>('equity');
  const [currentTimeframe, setCurrentTimeframe] = useState<Timeframe>(initialTimeframe);
  const [currentDateRange, setCurrentDateRange] = useState<DateRangeFilter>(HISTORICAL_PRESETS[0]);
  const [currentReport, setCurrentReport] = useState<DiscoveryReport>(initialReport);
  const [currentBacktestResult, setCurrentBacktestResult] = useState<BacktestResult | null>(null);
  const [currentBars, setCurrentBars] = useState<Bar[]>(initialBars);
  const [isRecalculating, setIsRecalculating] = useState<boolean>(false);
  const [autoAdjustNote, setAutoAdjustNote] = useState<string | null>(null);

  // Trade blotter filtering state
  const [tradeFilter, setTradeFilter] = useState<'ALL' | 'WIN' | 'LOSS' | 'OOS'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Initial setup: ensure registered & build initial backtestResult
  useEffect(() => {
    registerDiscoveryHypothesisInRegistry(hypothesis);
    const initialResult = buildBacktestResultFromDiscovery(
      hypothesis,
      initialReport,
      instrument,
      initialTimeframe,
      initialBars.length > 0 ? initialBars : []
    );
    setCurrentBacktestResult(initialResult);
  }, [hypothesis, initialReport, instrument, initialTimeframe, initialBars]);

  // Handle re-calculation when timeframe or date range changes
  const handleRecalculate = async (targetTf: Timeframe, targetRange: DateRangeFilter) => {
    setIsRecalculating(true);
    setAutoAdjustNote(null);
    try {
      const res = await recalculateDiscoveryForTimeframeAndPeriod(
        hypothesis,
        instrument,
        targetTf,
        targetRange
      );
      setCurrentReport(res.report);
      setCurrentBacktestResult(res.backtestResult);
      setCurrentBars(res.bars);
      setCurrentTimeframe(res.effectiveTimeframe);
      if (res.autoAdjustNote) {
        setAutoAdjustNote(res.autoAdjustNote);
      }
    } catch (err) {
      console.error('Failed to recalculate discovery strategy:', err);
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleTimeframeChange = (newTf: Timeframe) => {
    setCurrentTimeframe(newTf);
    handleRecalculate(newTf, currentDateRange);
  };

  const handleDatePresetChange = (preset: (typeof HISTORICAL_PRESETS)[0]) => {
    setCurrentDateRange(preset);
    handleRecalculate(currentTimeframe, preset);
  };

  // Filtered trades
  const trades = currentReport.trades || [];
  const filteredTrades = useMemo(() => {
    return trades.filter((t) => {
      if (tradeFilter === 'WIN' && t.pnlNetEur <= 0) return false;
      if (tradeFilter === 'LOSS' && t.pnlNetEur > 0) return false;
      if (tradeFilter === 'OOS' && !t.isOos) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          t.entryDate.toLowerCase().includes(q) ||
          t.exitDate.toLowerCase().includes(q) ||
          t.exitReason.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [trades, tradeFilter, searchQuery]);

  // Trade stats
  const winTrades = trades.filter((t) => t.pnlNetEur > 0);
  const lossTrades = trades.filter((t) => t.pnlNetEur <= 0);
  const totalWinEur = winTrades.reduce((a, t) => a + t.pnlNetEur, 0);
  const totalLossEur = Math.abs(lossTrades.reduce((a, t) => a + t.pnlNetEur, 0));
  const avgWinEur = winTrades.length > 0 ? totalWinEur / winTrades.length : 0;
  const avgLossEur = lossTrades.length > 0 ? totalLossEur / lossTrades.length : 0;

  // Chart data preparation
  const chartData = useMemo(() => {
    const rawCurve = currentReport.equityCurve || [];
    if (rawCurve.length === 0) return [];

    const initialEquity = 50000;
    let peak = initialEquity;

    return rawCurve.map((pt, idx) => {
      if (pt.equity > peak) peak = pt.equity;
      const dd = ((peak - pt.equity) / peak) * 100;
      const equityPct = ((pt.equity - initialEquity) / initialEquity) * 100;

      return {
        date: pt.dateStr,
        equity: Math.round(pt.equity),
        equityPct: parseFloat(equityPct.toFixed(2)),
        drawdownPct: -parseFloat(dd.toFixed(2)),
        isOos: pt.isOos,
      };
    });
  }, [currentReport.equityCurve]);

  // Find OOS boundary date for reference line in chart
  const oosStartDate = useMemo(() => {
    const firstOos = chartData.find((d) => d.isOos);
    return firstOos ? firstOos.date : null;
  }, [chartData]);

  return (
    <div
      id="discovery-strategy-inspector-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto"
    >
      <div
        id="discovery-strategy-inspector-modal"
        className="relative w-full max-w-5xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-purple-400 bg-purple-950/60 border border-purple-800/60 px-2 py-0.5 rounded">
                  {hypothesis.id}
                </span>
                <span className="text-xs font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                  {hypothesis.family}
                </span>
                <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                  {currentReport.categoryBadges[0] || 'Discovery'}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">
                {hypothesis.name}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="discovery-open-global-detail-btn"
              onClick={() => {
                if (currentBacktestResult) {
                  onOpenGlobalDetail(currentBacktestResult, currentBars);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow transition-colors"
              title="Apri nella schermata di dettaglio globale come le altre strategie"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Apri Analisi Completa</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Chiudi finestra"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Dynamic Period & Timeframe Selector Bar */}
        <div className="p-3 sm:p-4 bg-slate-900/90 border-b border-slate-800 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            {/* Timeframe selector */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Timeframe:
              </span>
              {(['1D', '4h', '1h', '15m'] as Timeframe[]).map((tf) => (
                <button
                  key={tf}
                  onClick={() => handleTimeframeChange(tf)}
                  disabled={isRecalculating}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                    currentTimeframe === tf
                      ? 'bg-purple-600 text-white shadow-sm ring-1 ring-purple-400'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Instrument indicator */}
            <div className="flex items-center gap-2 text-slate-400">
              <span className="text-slate-300 font-bold bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                {instrument.ticker}
              </span>
              <span>{instrument.name}</span>
            </div>
          </div>

          {/* Period presets buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <span className="text-slate-400 font-medium text-xs flex items-center gap-1 whitespace-nowrap mr-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Periodo:
            </span>
            {HISTORICAL_PRESETS.slice(0, 6).map((preset) => {
              const isSelected = currentDateRange.presetKey === preset.presetKey;
              return (
                <button
                  key={preset.presetKey}
                  onClick={() => handleDatePresetChange(preset)}
                  disabled={isRecalculating}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-slate-100 text-slate-950 font-bold shadow'
                      : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/60'
                  }`}
                >
                  <span>{preset.label}</span>
                  <span
                    className={`text-[10px] px-1 py-0.2 rounded font-normal ${
                      isSelected ? 'bg-slate-300 text-slate-900' : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    {preset.badge}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Note or recalculation spinner */}
          {isRecalculating && (
            <div className="flex items-center gap-2 text-xs text-purple-300 bg-purple-950/40 border border-purple-800/50 px-3 py-1.5 rounded-lg animate-pulse">
              <RotateCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
              <span>Ricalcolo backtest su dati storici reali per {currentDateRange.label} ({currentTimeframe})...</span>
            </div>
          )}

          {autoAdjustNote && (
            <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-950/30 border border-amber-800/40 px-3 py-1.5 rounded-lg">
              <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <span>{autoAdjustNote}</span>
            </div>
          )}
        </div>

        {/* Top KPI Metrics Strip */}
        <div className="p-3 sm:p-4 bg-slate-950/40 border-b border-slate-800 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 sm:gap-3 text-center">
          <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block">Rendimento Netto</span>
            <span
              className={`text-base font-bold font-mono ${
                currentReport.metrics.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {currentReport.metrics.totalReturnPct > 0 ? '+' : ''}
              {currentReport.metrics.totalReturnPct.toFixed(1)}%
            </span>
            <span className="text-[10px] text-slate-500 block">
              {currentReport.metrics.totalPnlAmount > 0 ? '+' : ''}
              {Math.round(currentReport.metrics.totalPnlAmount).toLocaleString()} €
            </span>
          </div>

          <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block">CAGR Annuo</span>
            <span className="text-base font-bold font-mono text-cyan-400">
              {currentReport.metrics.cagrPct.toFixed(1)}%
            </span>
            <span className="text-[10px] text-slate-500 block">rendimento annuo</span>
          </div>

          <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block">Profit Factor</span>
            <span
              className={`text-base font-bold font-mono ${
                currentReport.metrics.profitFactor >= 1.5 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {currentReport.metrics.profitFactor.toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-500 block">Lordi/Perdite</span>
          </div>

          <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block">Max Drawdown</span>
            <span className="text-base font-bold font-mono text-rose-400">
              -{currentReport.metrics.maxDrawdownPct.toFixed(1)}%
            </span>
            <span className="text-[10px] text-slate-500 block">picco-valle</span>
          </div>

          <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block">Operazioni / Win%</span>
            <span className="text-base font-bold font-mono text-slate-200">
              {currentReport.metrics.totalTrades}{' '}
              <span className="text-xs text-emerald-400">({currentReport.metrics.winRatePct.toFixed(0)}%)</span>
            </span>
            <span className="text-[10px] text-slate-500 block">
              {winTrades.length} win / {lossTrades.length} loss
            </span>
          </div>

          <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[11px] font-medium text-slate-400 block">Robustezza OOS</span>
            <span className="text-base font-bold font-mono text-purple-400">
              {currentReport.scores.robustnessScore}/100
            </span>
            <span className="text-[10px] text-slate-500 block">
              OOS: {currentReport.outOfSampleMetrics.totalReturnPct}%
            </span>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="px-4 border-b border-slate-800 bg-slate-900/50 flex items-center gap-4">
          <button
            id="tab-equity-chart"
            onClick={() => setActiveTab('equity')}
            className={`py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'equity'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Equity Line ({chartData.length} barre)</span>
          </button>

          <button
            id="tab-trade-blotter"
            onClick={() => setActiveTab('trades')}
            className={`py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'trades'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Elenco Operazioni ({trades.length})</span>
          </button>

          <button
            id="tab-dna-rules"
            onClick={() => setActiveTab('dna')}
            className={`py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'dna'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Regole DNA & Logica Quant</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 p-4 sm:p-5 overflow-y-auto min-h-[380px]">
          {/* TAB 1: EQUITY LINE CHART */}
          {activeTab === 'equity' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-purple-500 inline-block" />
                    <strong className="text-white">Equity Strategia Discovery</strong>
                  </span>
                  {oosStartDate && (
                    <span className="flex items-center gap-1.5 text-amber-400">
                      <span className="w-2.5 h-0.5 bg-amber-400 inline-block" />
                      <span>Separatore Out-Of-Sample ({oosStartDate})</span>
                    </span>
                  )}
                </div>
                <span>Capitale Iniziale: 50.000 €</span>
              </div>

              {/* Main Equity Chart */}
              <div className="h-72 w-full bg-slate-950/60 rounded-xl border border-slate-800 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                    <XAxis
                      dataKey="date"
                      stroke="#64748b"
                      fontSize={10}
                      tickFormatter={(val) => val.substring(0, 7)}
                      minTickGap={35}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={10}
                      domain={['auto', 'auto']}
                      tickFormatter={(val) => `${(val / 1000).toFixed(0)}k €`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(val: any) => [`${Number(val).toLocaleString()} €`, 'Capitale']}
                      labelFormatter={(label) => `Data: ${label}`}
                    />
                    {oosStartDate && (
                      <ReferenceLine
                        x={oosStartDate}
                        stroke="#f59e0b"
                        strokeDasharray="4 4"
                        label={{ value: 'INIZIO OOS', fill: '#f59e0b', fontSize: 10, position: 'top' }}
                      />
                    )}
                    <Area
                      type="monotone"
                      dataKey="equity"
                      stroke="#c084fc"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#equityGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Underwater Drawdown Chart */}
              <div className="bg-slate-950/60 rounded-xl border border-slate-800 p-2.5">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1 px-2">
                  <span className="font-semibold text-slate-300">Curva di Drawdown Underwater (%)</span>
                  <span className="text-rose-400 font-mono">Max: -{currentReport.metrics.maxDrawdownPct}%</span>
                </div>
                <div className="h-24 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 2, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 2" stroke="#334155" opacity={0.3} />
                      <XAxis dataKey="date" hide />
                      <YAxis stroke="#64748b" fontSize={9} domain={[-currentReport.metrics.maxDrawdownPct * 1.2, 0]} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '6px', fontSize: '11px' }}
                        formatter={(val: any) => [`${val}%`, 'Drawdown']}
                      />
                      <Area type="monotone" dataKey="drawdownPct" stroke="#f43f5e" fill="#e11d48" fillOpacity={0.25} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Explainability banner */}
              <div className="p-3 bg-purple-950/20 border border-purple-800/40 rounded-xl text-xs space-y-1 text-slate-300">
                <strong className="text-purple-400 block font-semibold">Razionale Quantitativo:</strong>
                <p>{currentReport.explainability.coreInsight}</p>
                <p className="text-slate-400">{currentReport.explainability.whyNovel}</p>
              </div>
            </div>
          )}

          {/* TAB 2: TRADE BLOTTER */}
          {activeTab === 'trades' && (
            <div className="space-y-3">
              {/* Trades blotter filter bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-400 font-medium">Filtra:</span>
                  <button
                    onClick={() => setTradeFilter('ALL')}
                    className={`px-2.5 py-1 rounded-md font-semibold ${
                      tradeFilter === 'ALL' ? 'bg-purple-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Tutte ({trades.length})
                  </button>
                  <button
                    onClick={() => setTradeFilter('WIN')}
                    className={`px-2.5 py-1 rounded-md font-semibold ${
                      tradeFilter === 'WIN' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Vincenti ({winTrades.length})
                  </button>
                  <button
                    onClick={() => setTradeFilter('LOSS')}
                    className={`px-2.5 py-1 rounded-md font-semibold ${
                      tradeFilter === 'LOSS' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Perdenti ({lossTrades.length})
                  </button>
                  <button
                    onClick={() => setTradeFilter('OOS')}
                    className={`px-2.5 py-1 rounded-md font-semibold ${
                      tradeFilter === 'OOS' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Out-Of-Sample ({trades.filter((t) => t.isOos).length})
                  </button>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Cerca data o motivo..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Trades summary mini metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                <div>
                  <span className="text-slate-400 block">Win Medio:</span>
                  <span className="font-mono font-bold text-emerald-400">+{Math.round(avgWinEur)} €</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Loss Medio:</span>
                  <span className="font-mono font-bold text-rose-400">-{Math.round(avgLossEur)} €</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Rapporto Win/Loss:</span>
                  <span className="font-mono font-bold text-cyan-400">
                    {avgLossEur > 0 ? (avgWinEur / avgLossEur).toFixed(2) : 'N/D'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Frequenza Operativa:</span>
                  <span className="font-mono font-bold text-slate-300">
                    {trades.length > 0
                      ? `${(trades.length / Math.max(1, (currentBars.length || 252) / 252)).toFixed(1)} op/anno`
                      : '0'}
                  </span>
                </div>
              </div>

              {/* Trades Blotter Table */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/80">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-900/90 text-slate-400 font-semibold sticky top-0 z-10 border-b border-slate-800">
                      <tr>
                        <th className="p-2">#</th>
                        <th className="p-2">Entrata</th>
                        <th className="p-2">Prezzo In</th>
                        <th className="p-2">Uscita</th>
                        <th className="p-2">Prezzo Out</th>
                        <th className="p-2">Quote</th>
                        <th className="p-2">PnL Netto</th>
                        <th className="p-2">PnL %</th>
                        <th className="p-2">Motivo Uscita</th>
                        <th className="p-2">Campione</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {filteredTrades.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-4 text-center text-slate-500 font-sans">
                            Nessuna operazione trovata con i filtri correnti.
                          </td>
                        </tr>
                      ) : (
                        filteredTrades.map((t, idx) => {
                          const isPositive = t.pnlNetEur > 0;
                          return (
                            <tr key={idx} className="hover:bg-slate-900/50 transition-colors">
                              <td className="p-2 text-slate-500">{idx + 1}</td>
                              <td className="p-2 text-slate-300 font-sans">{t.entryDate.substring(0, 10)}</td>
                              <td className="p-2 text-slate-300">{t.entryPrice.toFixed(2)} €</td>
                              <td className="p-2 text-slate-300 font-sans">{t.exitDate.substring(0, 10)}</td>
                              <td className="p-2 text-slate-300">{t.exitPrice.toFixed(2)} €</td>
                              <td className="p-2 text-slate-400">{t.shares}</td>
                              <td className={`p-2 font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isPositive ? '+' : ''}
                                {t.pnlNetEur.toFixed(2)} €
                              </td>
                              <td className={`p-2 font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isPositive ? '+' : ''}
                                {t.pnlNetPct.toFixed(2)}%
                              </td>
                              <td className="p-2 font-sans">
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    t.exitReason === 'TAKE_PROFIT'
                                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                                      : t.exitReason === 'STOP_LOSS'
                                      ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                                      : 'bg-slate-800 text-slate-300'
                                  }`}
                                >
                                  {t.exitReason}
                                </span>
                              </td>
                              <td className="p-2 font-sans">
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                    t.isOos
                                      ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                                      : 'bg-blue-950/80 text-blue-300 border border-blue-800/60'
                                  }`}
                                >
                                  {t.isOos ? 'OOS' : 'In-Sample'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DNA RULES */}
          {activeTab === 'dna' && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Time & Price Factor */}
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-200">
                    <Clock className="w-4 h-4 text-purple-400" />
                    <span>Fattore Temporale & Orizzonte</span>
                  </div>
                  <div className="text-slate-400 space-y-1">
                    <p>
                      <strong className="text-slate-300">Giorno della Settimana:</strong>{' '}
                      {hypothesis.dna.timeFactor.dayOfWeek ?? 'Qualsiasi (ANY)'}
                    </p>
                    <p>
                      <strong className="text-slate-300">Fase del Mese:</strong>{' '}
                      {hypothesis.dna.timeFactor.dayOfMonth ?? 'Qualsiasi (ANY)'}
                    </p>
                    <p>
                      <strong className="text-slate-300">Permanenza Massima:</strong>{' '}
                      {hypothesis.dna.timeFactor.holdingPeriodBars} barre
                    </p>
                  </div>
                </div>

                {/* Price Factor */}
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-200">
                    <TrendingUp className="w-4 h-4 text-cyan-400" />
                    <span>Fattore Prezzo / Trigger</span>
                  </div>
                  <div className="text-slate-400 space-y-1">
                    <p>
                      <strong className="text-slate-300">Tipo:</strong> {hypothesis.dna.priceFactor.type}
                    </p>
                    <p>
                      <strong className="text-slate-300">Condizione:</strong>{' '}
                      {hypothesis.dna.priceFactor.condition}
                    </p>
                    <p>
                      <strong className="text-slate-300">Lookback Giorni:</strong>{' '}
                      {hypothesis.dna.priceFactor.lookbackDays}
                    </p>
                    <p>
                      <strong className="text-slate-300">Soglia Parametrica:</strong>{' '}
                      {hypothesis.dna.priceFactor.threshold}%
                    </p>
                  </div>
                </div>

                {/* Volatility & Regime */}
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-200">
                    <Activity className="w-4 h-4 text-amber-400" />
                    <span>Filtro Volatilità & Regime</span>
                  </div>
                  <div className="text-slate-400 space-y-1">
                    <p>
                      <strong className="text-slate-300">Volatilità:</strong>{' '}
                      {hypothesis.dna.volatilityFactor.type}
                    </p>
                    <p>
                      <strong className="text-slate-300">Regime di Mercato:</strong>{' '}
                      {hypothesis.dna.regimeFactor.type} ({hypothesis.dna.regimeFactor.benchmarkTicker})
                    </p>
                  </div>
                </div>

                {/* Risk Rules */}
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-slate-200">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Regole di Gestione Rischio</span>
                  </div>
                  <div className="text-slate-400 space-y-1">
                    <p>
                      <strong className="text-slate-300">Stop Loss:</strong>{' '}
                      {hypothesis.dna.riskRule.stopLossPct ? `${hypothesis.dna.riskRule.stopLossPct}%` : 'Disattivato'}
                    </p>
                    <p>
                      <strong className="text-slate-300">Take Profit:</strong>{' '}
                      {hypothesis.dna.riskRule.takeProfitPct
                        ? `${hypothesis.dna.riskRule.takeProfitPct}%`
                        : 'Disattivato'}
                    </p>
                    <p>
                      <strong className="text-slate-300">Punteggio Complessità:</strong>{' '}
                      {hypothesis.dna.complexityScore}/100 ({hypothesis.dna.activeConditionCount} condizioni attive)
                    </p>
                  </div>
                </div>
              </div>

              {/* Rationale and explainability */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 text-slate-300">
                <strong className="text-slate-200 block font-semibold">Razionale della Scoperta:</strong>
                <p>{hypothesis.rationale}</p>
                <div className="pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-500">
                  DNA Hash: {hypothesis.dna.dnaHash} | Generazione: {hypothesis.generationStage}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-3 sm:p-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            <span>Visualizzazione e ricalcolo su dati storici reali per {instrument.ticker}</span>
          </div>

          <div className="flex items-center gap-2">
            {onLaunchPaperTrading && currentBacktestResult && (
              <button
                id="discovery-launch-paper-modal-btn"
                onClick={() => onLaunchPaperTrading(currentBacktestResult)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5 text-emerald-400" />
                <span>Paper Trading</span>
              </button>
            )}

            <button
              id="discovery-open-detail-view-modal-btn"
              onClick={() => {
                if (currentBacktestResult) {
                  onOpenGlobalDetail(currentBacktestResult, currentBars);
                }
              }}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-900/30 transition-all flex items-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Apri Analisi Completa (Come Altri Casi)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
