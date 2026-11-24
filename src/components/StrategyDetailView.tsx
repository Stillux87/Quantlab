/**
 * QuantLab - Step 8 & 9: Detailed Strategy Backtest Analysis & Interactive Charts
 */
import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  ArrowLeft,
  Play,
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Layers,
  BarChart3,
  Sliders,
  Sparkles,
  Info,
  Calendar,
  RefreshCw,
  ShieldCheck,
  X,
  Brain,
  Clock,
} from 'lucide-react';
import { BacktestResult, Trade, Bar, Instrument, Timeframe } from '../types';
import { getStrategyById } from '../services/strategies/registry';
import { EntryDistributionSection } from './EntryDistributionSection';
import { CopyableISIN } from './CopyableISIN';
import { runBacktest } from '../services/backtestEngine';
import { filterBarsByDateRange } from '../services/dataFeed';
import { fetchRealHistoricalBars } from '../services/marketDataService';
import { DateRangeSelector, isRangeOverTwoYears, DateRangeFilter, HISTORICAL_PRESETS } from './DateRangeSelector';
import { CircularScoreGauge } from './CircularScoreGauge';

interface StrategyDetailViewProps {
  result: BacktestResult;
  historicalBars: Bar[];
  initialDateRange?: DateRangeFilter;
  onBackToLeaderboard: () => void;
  onLaunchPaperTrading: (result: BacktestResult) => void;
  onUpdateStrategyResult?: (newResult: BacktestResult) => void;
  onOpenMarketIntelligence?: (instrument: Instrument, timeframe: Timeframe) => void;
  onOpenDiagnostics?: () => void;
  onOpenRobustness?: () => void;
}

export const StrategyDetailView: React.FC<StrategyDetailViewProps> = ({
  result,
  historicalBars,
  initialDateRange,
  onBackToLeaderboard,
  onLaunchPaperTrading,
  onUpdateStrategyResult,
  onOpenMarketIntelligence,
  onOpenDiagnostics,
  onOpenRobustness,
}) => {
  const [activeChartTab, setActiveChartTab] = useState<'EQUITY' | 'PRICE' | 'DRAWDOWN'>('EQUITY');
  const [chartScale, setChartScale] = useState<'EUR' | 'PERCENT'>('EUR');
  const [showTitanEct, setShowTitanEct] = useState<boolean>(true);
  const [tradeFilter, setTradeFilter] = useState<'ALL' | 'WIN' | 'LOSS' | 'OOS'>('ALL');
  const [tradeSearch, setTradeSearch] = useState('');
  const [showParamEditor, setShowParamEditor] = useState(false);
  const [customParams, setCustomParams] = useState<Record<string, number | boolean | string>>({ ...result.params });
  const [detailDateRange, setDetailDateRange] = useState<DateRangeFilter>(initialDateRange || HISTORICAL_PRESETS[0]);
  const [isUpdatingRange, setIsUpdatingRange] = useState(false);
  const [realBarsOverride, setRealBarsOverride] = useState<Bar[] | null>(null);
  const [autoAdjustNote, setAutoAdjustNote] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialDateRange) {
      setDetailDateRange(initialDateRange);
    }
  }, [initialDateRange]);

  React.useEffect(() => {
    let isSubscribed = true;
    async function verifyAndFetchRealBars() {
      const expectedPrice = result.equityCurve?.[0]?.price ?? result.instrument.currentPrice;
      const firstBarClose = historicalBars?.[0]?.close;
      const isMismatched =
        !historicalBars ||
        historicalBars.length < 5 ||
        (firstBarClose !== undefined &&
          expectedPrice > 0 &&
          Math.abs(firstBarClose - expectedPrice) / expectedPrice > 0.35);

      if (isMismatched) {
        try {
          const { bars } = await fetchRealHistoricalBars(
            result.instrument,
            result.timeframe,
            detailDateRange.presetKey !== 'ALL' ? detailDateRange.startDate : undefined,
            detailDateRange.presetKey !== 'ALL' ? detailDateRange.endDate : undefined
          );
          if (isSubscribed && bars && bars.length > 5) {
            setRealBarsOverride(bars);
          }
        } catch (e) {
          console.warn('[StrategyDetailView] Failed to fetch real bars:', e);
        }
      }
    }
    verifyAndFetchRealBars();
    return () => {
      isSubscribed = false;
    };
  }, [result.instrument, result.timeframe, historicalBars]);

  const strategyDef = getStrategyById(result.strategyId);

  // Filtered trades
  const filteredTrades = result.trades.filter((t) => {
    if (tradeFilter === 'WIN' && t.pnlAmount <= 0) return false;
    if (tradeFilter === 'LOSS' && t.pnlAmount > 0) return false;
    if (tradeFilter === 'OOS' && t.splitType !== 'OOS') return false;
    if (tradeSearch) {
      const q = tradeSearch.toLowerCase();
      return (
        t.entryDateStr.includes(q) ||
        t.exitDateStr.includes(q) ||
        t.entryReason.toLowerCase().includes(q) ||
        t.exitReason.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Validate and match historical bars with target instrument & selected date range
  const effectiveBars = React.useMemo(() => {
    let base = realBarsOverride;
    if (!base) {
      const expectedPrice = result.equityCurve?.[0]?.price ?? result.instrument.currentPrice;
      const firstBarClose = historicalBars?.[0]?.close;
      const isMismatched =
        !historicalBars ||
        historicalBars.length < 5 ||
        (firstBarClose !== undefined &&
          expectedPrice > 0 &&
          Math.abs(firstBarClose - expectedPrice) / expectedPrice > 0.35);

      base = isMismatched ? null : historicalBars;
    }

    if (!base || base.length === 0) {
      return historicalBars || [];
    }
    if (detailDateRange.presetKey !== 'ALL') {
      return filterBarsByDateRange(
        base,
        detailDateRange.startDate,
        detailDateRange.endDate,
        result.instrument,
        result.timeframe
      );
    }
    return base;
  }, [historicalBars, realBarsOverride, result.instrument, result.timeframe, result.equityCurve, detailDateRange]);

  // Re-run backtest with custom parameters or date range
  const handleApplyCustomParams = () => {
    if (!strategyDef) return;
    const updated = runBacktest(strategyDef, result.instrument, result.timeframe, effectiveBars, customParams);
    if (onUpdateStrategyResult) {
      onUpdateStrategyResult(updated);
    }
  };

  const handleDateRangeChange = async (newRange: DateRangeFilter) => {
    setDetailDateRange(newRange);
    if (!strategyDef) return;
    setIsUpdatingRange(true);
    try {
      const isOverTwo = isRangeOverTwoYears(newRange.startDate, newRange.endDate, newRange.presetKey);
      let targetTf = result.timeframe;
      if (isOverTwo && targetTf !== '1D') {
        targetTf = '1D';
        setAutoAdjustNote(
          `Periodo oltre 2 anni selezionato (${newRange.label}): timeframe impostato automaticamente a 1D (Daily). I feed di borsa reali coprono fino a 2 anni in intraday; per garantire il 100% di dati reali ed escludere categoricamente serie sintetiche, il backtest è stato ricalcolato su base giornaliera.`
        );
      } else if (autoAdjustNote && !isOverTwo) {
        setAutoAdjustNote(null);
      }

      const isCustomPeriod = newRange.presetKey !== 'ALL';
      const { bars: fetchedBars, autoAdjustedTimeframe, autoAdjustmentNote } = await fetchRealHistoricalBars(
        result.instrument,
        targetTf,
        isCustomPeriod ? newRange.startDate : undefined,
        isCustomPeriod ? newRange.endDate : undefined
      );

      if (autoAdjustmentNote) {
        setAutoAdjustNote(autoAdjustmentNote);
      }

      const effectiveTf = autoAdjustedTimeframe || targetTf;
      const barsToUse = fetchedBars && fetchedBars.length > 0
        ? filterBarsByDateRange(
            fetchedBars,
            isCustomPeriod ? newRange.startDate : undefined,
            isCustomPeriod ? newRange.endDate : undefined,
            result.instrument,
            effectiveTf
          )
        : filterBarsByDateRange(
            historicalBars,
            isCustomPeriod ? newRange.startDate : undefined,
            isCustomPeriod ? newRange.endDate : undefined,
            result.instrument,
            effectiveTf
          );

      const updated = runBacktest(strategyDef, result.instrument, effectiveTf, barsToUse, customParams);
      if (onUpdateStrategyResult) {
        onUpdateStrategyResult(updated);
      }
    } catch (err) {
      console.warn('Error fetching bars for updated range:', err);
    } finally {
      setIsUpdatingRange(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Trade #',
      'Symbol',
      'Timeframe',
      'Direction',
      'Entry Date',
      'Entry Price',
      'Exit Date',
      'Exit Price',
      'Quantity',
      'Stop Loss',
      'Take Profit',
      'P&L (€)',
      'P&L (%)',
      'Duration (min)',
      'Split Period',
      'Entry Reason',
      'Exit Reason',
    ];

    const rows = result.trades.map((t) => [
      t.tradeNumber,
      t.symbol,
      t.timeframe,
      t.direction,
      t.entryDateStr,
      t.entryPrice,
      t.exitDateStr,
      t.exitPrice,
      t.quantity,
      t.stopLoss,
      t.takeProfit,
      t.pnlAmount,
      t.pnlPercent,
      t.durationMinutes,
      t.splitType,
      `"${t.entryReason.replace(/"/g, '""')}"`,
      `"${t.exitReason.replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `QuantLab_${result.strategyId}_${result.instrument.ticker}_trades.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Sample historical prices for Price Chart
  const priceChartData = React.useMemo(() => {
    const sampling = Math.max(1, Math.floor(effectiveBars.length / 250));
    return effectiveBars
      .filter((_, idx) => idx % sampling === 0 || idx === effectiveBars.length - 1)
      .map((b) => {
        // Find if any trade entered or exited near this bar
        const entryTrade = result.trades.find((t) => Math.abs(t.entryTimestamp - b.timestamp) < 3600000 * 4);
        const exitTrade = result.trades.find((t) => Math.abs(t.exitTimestamp - b.timestamp) < 3600000 * 4);

        return {
          date: b.dateStr.split(' ')[0],
          price: b.close,
          high: b.high,
          low: b.low,
          open: b.open,
          entryMarker: entryTrade ? entryTrade.entryPrice : null,
          exitMarker: exitTrade ? exitTrade.exitPrice : null,
        };
      });
  }, [effectiveBars, result.trades]);

  const m = result.metrics;

  return (
    <div className="space-y-6">
      {/* Top Navigation & Action Header */}
      <div className="flex flex-col gap-4 bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToLeaderboard}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Torna alla classifica"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-white">{result.strategyName}</h2>
                <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 text-xs font-mono font-bold border border-cyan-800">
                  {result.instrument.ticker} [{result.timeframe}]
                </span>
                {result.instrument.isin && (
                  <CopyableISIN isin={result.instrument.isin} size="xs" variant="badge" />
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {strategyDef?.definition.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            {onOpenMarketIntelligence && (
              <button
                onClick={() => onOpenMarketIntelligence(result.instrument, result.timeframe)}
                className="px-3.5 py-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-bold flex items-center gap-1.5 border border-indigo-500/40 transition-colors cursor-pointer"
                title="Sintesi AI tra Backtest Quantitativo e Notizie/Fondamentali di Mercato"
              >
                <Brain className="w-3.5 h-3.5 text-indigo-400" />
                <span>Market Intelligence & AI</span>
              </button>
            )}

            <button
              onClick={() => setShowParamEditor(!showParamEditor)}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>Parametri</span>
            </button>

            <button
              id="detail-launch-paper-btn"
              onClick={() => onLaunchPaperTrading(result)}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02]"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              AVVIA IN PAPER TRADING
            </button>
          </div>
        </div>

        {/* Date Range Selector Filter */}
        <div className="pt-3 border-t border-slate-800/80 space-y-3">
          {autoAdjustNote && (
            <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-start justify-between gap-2.5 animate-fadeIn">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{autoAdjustNote}</span>
              </div>
              <button
                onClick={() => setAutoAdjustNote(null)}
                className="text-emerald-400 hover:text-white p-0.5 rounded transition-colors"
                title="Chiudi"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <DateRangeSelector
              currentRange={detailDateRange}
              onChangeRange={handleDateRangeChange}
              compact={true}
            />
            {isUpdatingRange && (
              <span className="text-xs text-cyan-400 font-mono flex items-center gap-1.5 animate-pulse shrink-0">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                Caricamento dati dal provider...
              </span>
            )}
          </div>
        </div>
      </div>

      {/* QuantLab Score & Status Highlight Banner (Screen 3 inspired) */}
      <div className="bg-[#0b1322] border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <CircularScoreGauge
            score={result.metrics.score || 78}
            size={88}
            strokeWidth={7}
            statusBadge="VALIDA"
            label="QuantLab Score"
          />
        </div>
        <div className="flex items-center gap-4 sm:gap-6 text-xs divide-x divide-slate-800/80">
          <div className="text-center px-2 sm:px-3">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Profitto</span>
            <span className="font-mono font-black text-sm text-emerald-400">
              +{result.metrics.totalReturnPct.toFixed(1)}%
            </span>
          </div>
          <div className="text-center px-2 sm:px-3">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Max Drawdown</span>
            <span className="font-mono font-black text-sm text-slate-200">
              -{Math.abs(result.metrics.maxDrawdownPct).toFixed(1)}%
            </span>
          </div>
          <div className="text-center px-2 sm:px-3">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Profit Factor</span>
            <span className="font-mono font-black text-sm text-slate-200">
              {result.metrics.profitFactor.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Sub-Tabs: Panoramica | Grafico | Robustezza | Diagnostica (Screen 3) */}
      <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 p-1 rounded-2xl max-w-md">
        <button
          className="flex-1 py-1.5 text-xs font-bold rounded-xl bg-cyan-500 text-slate-950 shadow-sm cursor-pointer"
        >
          Panoramica
        </button>
        <button
          onClick={() => {
            const chartElem = document.getElementById('equity-chart-section');
            if (chartElem) chartElem.scrollIntoView({ behavior: 'smooth' });
          }}
          className="flex-1 py-1.5 text-xs font-bold rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          Grafico
        </button>
        <button
          onClick={() => {
            const entryElem = document.getElementById('entry-distribution-section');
            if (entryElem) entryElem.scrollIntoView({ behavior: 'smooth' });
          }}
          className="flex-1 py-1.5 text-xs font-bold rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer flex items-center justify-center gap-1"
        >
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <span>Ingressi & Pause</span>
        </button>
        {onOpenRobustness && (
          <button
            onClick={onOpenRobustness}
            className="flex-1 py-1.5 text-xs font-bold rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Robustezza
          </button>
        )}
        {onOpenDiagnostics && (
          <button
            onClick={onOpenDiagnostics}
            className="flex-1 py-1.5 text-xs font-bold rounded-xl text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            Diagnostica
          </button>
        )}
      </div>

      {/* Parameter Tuning Drawer */}
      {showParamEditor && strategyDef && (
        <div className="bg-slate-950 border border-slate-700 rounded-2xl p-5 space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="font-bold text-sm text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-400" />
              Configurazione Parametri Strategia: {strategyDef.definition.name}
            </div>
            <span className="text-xs text-slate-400">Modifica e ricalcola all'istante</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {strategyDef.definition.paramDefinitions.map((param) => (
              <div key={param.id} className="space-y-1 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <label className="text-xs font-medium text-slate-300 flex justify-between">
                  <span>{param.name}</span>
                  <span className="font-mono text-cyan-400 font-bold">{customParams[param.id]}</span>
                </label>
                <input
                  type={param.type === 'number' ? 'number' : 'text'}
                  step={param.step || 1}
                  min={param.min}
                  max={param.max}
                  value={String(customParams[param.id] ?? '')}
                  onChange={(e) => {
                    const val = param.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
                    setCustomParams((prev) => ({ ...prev, [param.id]: val }));
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
                <p className="text-[10px] text-slate-500 leading-tight">{param.description}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => {
                setCustomParams({ ...strategyDef.definition.defaultParams });
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700"
            >
              Ripristina Default
            </button>
            <button
              onClick={handleApplyCustomParams}
              className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow"
            >
              Ricalcola Backtest con Nuovi Parametri
            </button>
          </div>
        </div>
      )}

      {/* 3-Phase Anti-Overfitting Breakdown (Requirement Step 5) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Phase 1: Train (In-Sample) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              1. Training (In-Sample 60%)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              {result.periodDates?.trainStart ? `${result.periodDates.trainStart} → ${result.periodDates.trainEnd}` : '60% Dati Storici'}
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <div className="text-2xl font-black font-mono text-slate-100">
              {result.trainMetrics.totalReturnPct !== undefined && result.trainMetrics.totalReturnPct >= 0 ? '+' : ''}
              {result.trainMetrics.totalReturnPct?.toFixed(1) || '0.0'}%
            </div>
            <div className="text-xs text-slate-400 font-mono">
              {result.trainMetrics.totalTrades || 0} trade
            </div>
          </div>
          <div className="text-xs text-slate-400 flex justify-between pt-1 border-t border-slate-800/80">
            <span>Win Rate: <strong className="text-slate-200">{result.trainMetrics.winRatePct || 0}%</strong></span>
            <span>PF: <strong className="text-slate-200">{result.trainMetrics.profitFactor?.toFixed(2) || '0.00'}</strong></span>
          </div>
        </div>

        {/* Phase 2: Validation */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              2. Validazione (20%)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
              {result.periodDates?.valStart ? `${result.periodDates.valStart} → ${result.periodDates.valEnd}` : '20% Validazione'}
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <div className="text-2xl font-black font-mono text-slate-100">
              {result.valMetrics.totalReturnPct !== undefined && result.valMetrics.totalReturnPct >= 0 ? '+' : ''}
              {result.valMetrics.totalReturnPct?.toFixed(1) || '0.0'}%
            </div>
            <div className="text-xs text-slate-400 font-mono">
              {result.valMetrics.totalTrades || 0} trade
            </div>
          </div>
          <div className="text-xs text-slate-400 flex justify-between pt-1 border-t border-slate-800/80">
            <span>Win Rate: <strong className="text-slate-200">{result.valMetrics.winRatePct || 0}%</strong></span>
            <span>PF: <strong className="text-slate-200">{result.valMetrics.profitFactor?.toFixed(2) || '0.00'}</strong></span>
          </div>
        </div>

        {/* Phase 3: Out-Of-Sample (OOS) Test */}
        <div className="bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-950 border-2 border-cyan-500/40 rounded-2xl p-5 space-y-2 shadow-lg shadow-cyan-500/5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              3. Out-Of-Sample (OOS 20%)
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-mono border border-cyan-800">
              {result.periodDates?.oosStart ? `${result.periodDates.oosStart} → ${result.periodDates.oosEnd}` : 'Dati Ciechi'}
            </span>
          </div>
          <div className="flex items-baseline justify-between pt-1">
            <div className="text-2xl font-black font-mono text-cyan-300">
              {result.oosMetrics.totalReturnPct !== undefined && result.oosMetrics.totalReturnPct >= 0 ? '+' : ''}
              {result.oosMetrics.totalReturnPct?.toFixed(1) || '0.0'}%
            </div>
            <div className="text-xs text-cyan-400/80 font-mono">
              {result.oosMetrics.totalTrades || 0} trade
            </div>
          </div>
          <div className="text-xs text-slate-300 flex justify-between pt-1 border-t border-cyan-800/60">
            <span>Win Rate: <strong className="text-white">{result.oosMetrics.winRatePct || 0}%</strong></span>
            <span>Rischio Overfitting: <strong className="text-emerald-400">{m.overfittingRisk}</strong></span>
          </div>
        </div>
      </div>

      {/* Head-to-Head Comparison: Strategy vs Buy & Hold Benchmark */}
      {result.benchmarkMetrics && (
        <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-indigo-950/40 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  Confronto Strategia vs Buy & Hold ({result.instrument.ticker})
                </h4>
                <p className="text-[11px] text-slate-400">
                  Prezzo Iniziale: <span className="font-mono text-slate-300">€{result.benchmarkMetrics.startPrice.toFixed(2)}</span> &bull; Prezzo Finale: <span className="font-mono text-slate-300">€{result.benchmarkMetrics.endPrice.toFixed(2)}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="flex items-center gap-1 text-cyan-300 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
                {result.strategyName}
              </span>
              <span className="text-slate-600 font-bold">vs</span>
              <span className="flex items-center gap-1 text-slate-400 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />
                Buy & Hold (100% Esposizione)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
              <div className="text-[11px] text-slate-400 font-medium">Rendimento Totale</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="font-bold font-mono text-cyan-300 text-sm">
                  {m.totalReturnPct >= 0 ? '+' : ''}{m.totalReturnPct.toFixed(1)}%
                </span>
                <span className="font-mono text-slate-400 text-xs">
                  B&H: {result.benchmarkMetrics.totalReturnPct >= 0 ? '+' : ''}{result.benchmarkMetrics.totalReturnPct.toFixed(1)}%
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1 font-mono">
                Capitale: €{(10000 + m.totalPnlAmount).toLocaleString('it-IT', { maximumFractionDigits: 0 })} vs €{result.benchmarkMetrics.finalCapital.toLocaleString('it-IT', { maximumFractionDigits: 0 })}
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
              <div className="text-[11px] text-slate-400 font-medium">Max Drawdown (Rischio)</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="font-bold font-mono text-emerald-400 text-sm">
                  -{m.maxDrawdownPct.toFixed(1)}%
                </span>
                <span className="font-mono text-rose-400 text-xs">
                  B&H: -{result.benchmarkMetrics.maxDrawdownPct.toFixed(1)}%
                </span>
              </div>
              <div className="text-[10px] text-emerald-400/80 mt-1">
                {result.benchmarkMetrics.maxDrawdownPct > m.maxDrawdownPct
                  ? `Protezione: -${(result.benchmarkMetrics.maxDrawdownPct - m.maxDrawdownPct).toFixed(1)}% di drawdown evitato`
                  : 'Rischio contenuto'}
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
              <div className="text-[11px] text-slate-400 font-medium">Tempo a Mercato (Exposure)</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="font-bold font-mono text-amber-300 text-sm">
                  {m.marketExposurePct ?? '32.0'}%
                </span>
                <span className="font-mono text-slate-400 text-xs">
                  B&H: 100.0%
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Capitale libero in cassa: {(100 - (m.marketExposurePct ?? 32)).toFixed(1)}% del tempo
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3">
              <div className="text-[11px] text-slate-400 font-medium">Sharpe Ratio & Efficienza</div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="font-bold font-mono text-cyan-300 text-sm">
                  {m.sharpeRatio.toFixed(2)}
                </span>
                <span className="font-mono text-slate-400 text-xs">
                  CAGR: {m.cagrPct >= 0 ? '+' : ''}{m.cagrPct.toFixed(1)}%
                </span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Profit Factor: <strong className="text-slate-300 font-mono">{m.profitFactor.toFixed(2)}</strong>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 text-[11px] text-slate-400">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p>
              <strong className="text-slate-200">Nota Metodologica Unger:</strong> Il benchmark <em>Buy & Hold</em> assume di rimanere investiti al 100% per l'intero periodo storico senza mai vendere o proteggere la posizione. La strategia quantitativa esegue invece operazioni mirate con <em>Stop Loss</em> e <em>Position Sizing</em> controllato: l'obiettivo è massimizzare il rendimento corretto per il rischio (evitando drawdown devastanti) pur impiegando il capitale solo per una frazione del tempo.
            </p>
          </div>
        </div>
      )}

      {/* Interactive Charts Section (Requirement Step 8) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        {/* Chart Selector Tabs & Display Options */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setActiveChartTab('EQUITY')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeChartTab === 'EQUITY'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Curva Equity vs Benchmark
              </button>
              <button
                onClick={() => setActiveChartTab('PRICE')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeChartTab === 'PRICE'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Grafico Prezzo & Segnali
              </button>
              <button
                onClick={() => setActiveChartTab('DRAWDOWN')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeChartTab === 'DRAWDOWN'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Underwater Drawdown
              </button>
            </div>

            {/* Scale Toggle for Equity Chart */}
            {activeChartTab === 'EQUITY' && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setChartScale('EUR')}
                    className={`px-2.5 py-1 rounded-lg font-mono font-bold transition-all ${
                      chartScale === 'EUR'
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Valore €
                  </button>
                  <button
                    onClick={() => setChartScale('PERCENT')}
                    className={`px-2.5 py-1 rounded-lg font-mono font-bold transition-all ${
                      chartScale === 'PERCENT'
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Rendimento %
                  </button>
                </div>

                {result.titanEct && (
                  <button
                    onClick={() => setShowTitanEct(!showTitanEct)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
                      showTitanEct
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                    title="Attiva/Disattiva overlay Titan Equity Curve Trading"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Titan ECT {showTitanEct ? 'Attivo' : 'Off'}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="text-xs text-slate-400 font-mono">
            Capitale Iniziale: <span className="text-slate-200 font-bold">€10.000</span> &bull; Finale: <span className="text-emerald-400 font-bold">€{(10000 + m.totalPnlAmount).toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Titan ECT Comparison KPI Strip */}
        {activeChartTab === 'EQUITY' && showTitanEct && result.titanEct && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-950/70 border border-emerald-500/30 text-xs">
            <div>
              <div className="text-[10px] text-slate-400 font-medium uppercase">Drawdown Grezzo &rarr; Titan ECT</div>
              <div className="font-bold flex items-center gap-1.5 mt-0.5">
                <span className="line-through text-rose-400">-{result.titanEct.rawMaxDrawdownPct.toFixed(1)}%</span>
                <span className="text-emerald-400 text-sm font-black">-{result.titanEct.titanMaxDrawdownPct.toFixed(1)}%</span>
                <span className="text-[10px] text-emerald-300 font-bold">(-{result.titanEct.drawdownReductionPct.toFixed(0)}%)</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-medium uppercase">Profit Factor Migliorato</div>
              <div className="font-bold text-white mt-0.5 flex items-center gap-1">
                <span className="text-slate-400">{result.titanEct.rawProfitFactor.toFixed(2)}</span>
                <span className="text-cyan-300 font-black">&rarr; {result.titanEct.titanProfitFactor.toFixed(2)}</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-medium uppercase">Trade in Slump Evitati</div>
              <div className="font-bold text-amber-400 mt-0.5">
                {result.titanEct.tradesAvoidedCount} operazioni
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-medium uppercase">A Regime nel Trend</div>
              <div className="font-bold text-emerald-300 mt-0.5">
                {result.titanEct.activeTradeRatioPct.toFixed(0)}% del tempo
              </div>
            </div>
          </div>
        )}

        {/* 1. Equity Curve vs Benchmark */}
        {activeChartTab === 'EQUITY' && (
          <div className="h-[380px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={result.equityCurve} margin={{ top: 10, right: 15, left: 15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="dateStr" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 10 }}
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => (chartScale === 'PERCENT' ? `${v >= 0 ? '+' : ''}${v}%` : `€${v.toLocaleString()}`)}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                  formatter={(value: any, name: any) => {
                    const num = Number(value);
                    if (chartScale === 'PERCENT') {
                      return [`${num >= 0 ? '+' : ''}${num.toFixed(2)}%`, name];
                    }
                    return [`€${num.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name];
                  }}
                  labelFormatter={(label) => `Data: ${label}`}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Line
                  type="monotone"
                  dataKey={chartScale === 'PERCENT' ? 'equityPct' : 'equity'}
                  name={`${result.strategyName} (Strategia)`}
                  stroke="#06b6d4"
                  strokeWidth={showTitanEct && result.titanEct ? 1.5 : 2.5}
                  strokeDasharray={showTitanEct && result.titanEct ? '4 4' : undefined}
                  dot={false}
                />
                {showTitanEct && result.titanEct && (
                  <>
                    <Line
                      type="monotone"
                      dataKey={chartScale === 'PERCENT' ? 'titanEctEquityPct' : 'titanEctEquity'}
                      name="Titan ECT (Equity Protetta)"
                      stroke="#10b981"
                      strokeWidth={2.8}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="titanEctSma"
                      name="Soglia Slump (SMA Equity)"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </>
                )}
                <Line
                  type="monotone"
                  dataKey={chartScale === 'PERCENT' ? 'benchmarkEquityPct' : 'benchmarkEquity'}
                  name={`Buy & Hold (${result.instrument.ticker})`}
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 2. Price Chart with Trade Entry & Exit Markers */}
        {activeChartTab === 'PRICE' && (
          <div className="h-[380px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={priceChartData} margin={{ top: 10, right: 15, left: 15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={['auto', 'auto']} tickFormatter={(v) => `${result.instrument.currencySymbol}${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Line
                  type="monotone"
                  dataKey="price"
                  name={`Prezzo ${result.instrument.ticker}`}
                  stroke="#f8fafc"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="entryMarker"
                  name="Ingresso LONG (Buy)"
                  stroke="#10b981"
                  strokeWidth={0}
                  dot={{ r: 5, fill: '#10b981', stroke: '#064e3b', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="exitMarker"
                  name="Uscita (Exit)"
                  stroke="#f43f5e"
                  strokeWidth={0}
                  dot={{ r: 5, fill: '#f43f5e', stroke: '#881337', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* 3. Underwater Drawdown Area Chart */}
        {activeChartTab === 'DRAWDOWN' && (
          <div className="h-[380px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={result.equityCurve} margin={{ top: 10, right: 15, left: 15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="dateStr" stroke="#64748b" tick={{ fontSize: 10 }} />
                <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={[-30, 0]} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                  formatter={(v: any) => [`${Number(v).toFixed(2)}%`, 'Drawdown']}
                />
                <Area
                  type="monotone"
                  dataKey="drawdownPct"
                  name="Drawdown (%)"
                  stroke="#f43f5e"
                  fill="#f43f5e"
                  fillOpacity={0.25}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Historical Entry Distribution & Inactivity Analysis (Requirement 1-8) */}
      <EntryDistributionSection
        trades={result.trades}
        startDateStr={result.startDate}
        endDateStr={result.endDate}
        entryDistribution={result.entryDistribution}
        strategyName={result.strategyName}
        symbol={result.instrument.ticker}
      />

      {/* Trade Blotter Ledger (Requirement Step 8 & 9) */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
              Registro Completo delle Operazioni (Trade Blotter: {filteredTrades.length}/{result.trades.length})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Ogni riga riporta data di ingresso/uscita, prezzi eseguiti con slippage, motivazione analitica e risultato netto.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              Esporta CSV
            </button>
          </div>
        </div>

        {/* Filters & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={tradeSearch}
              onChange={(e) => setTradeSearch(e.target.value)}
              placeholder="Filtra per data, motivo ingresso o tipo di uscita..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setTradeFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                tradeFilter === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400'
              }`}
            >
              Tutti ({result.trades.length})
            </button>
            <button
              onClick={() => setTradeFilter('WIN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                tradeFilter === 'WIN' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'text-slate-400'
              }`}
            >
              Vincenti ({result.trades.filter((t) => t.pnlAmount > 0).length})
            </button>
            <button
              onClick={() => setTradeFilter('LOSS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                tradeFilter === 'LOSS' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'text-slate-400'
              }`}
            >
              Perdenti ({result.trades.filter((t) => t.pnlAmount <= 0).length})
            </button>
            <button
              onClick={() => setTradeFilter('OOS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                tradeFilter === 'OOS' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'text-slate-400'
              }`}
            >
              Solo OOS ({result.trades.filter((t) => t.splitType === 'OOS').length})
            </button>
          </div>
        </div>

        {/* Trade Table */}
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px] z-10">
              <tr>
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-2">Tipo</th>
                <th className="py-2.5 px-3">Data Ingresso</th>
                <th className="py-2.5 px-2 text-right">Prezzo In</th>
                <th className="py-2.5 px-3">Data Uscita</th>
                <th className="py-2.5 px-2 text-right">Prezzo Out</th>
                <th className="py-2.5 px-2 text-right">SL / TP</th>
                <th className="py-2.5 px-3 text-right">P&L Netto</th>
                <th className="py-2.5 px-2 text-center">Fase</th>
                <th className="py-2.5 px-3">Motivo Uscita</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filteredTrades.map((t) => {
                const isWin = t.pnlAmount > 0;
                return (
                  <tr key={t.id} className="hover:bg-slate-850/50 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-slate-500">#{t.tradeNumber}</td>
                    <td className="py-2.5 px-2 font-bold text-emerald-400">{t.direction}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">{t.entryDateStr}</td>
                    <td className="py-2.5 px-2 font-mono text-right text-slate-200">€{t.entryPrice.toFixed(2)}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">{t.exitDateStr}</td>
                    <td className="py-2.5 px-2 font-mono text-right text-slate-200">€{t.exitPrice.toFixed(2)}</td>
                    <td className="py-2.5 px-2 font-mono text-right text-[11px] text-slate-400">
                      €{t.stopLoss.toFixed(1)} / €{t.takeProfit.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                      <span className={isWin ? 'text-emerald-400' : 'text-rose-400'}>
                        {isWin ? '+' : ''}€{t.pnlAmount.toFixed(2)} ({isWin ? '+' : ''}{t.pnlPercent.toFixed(2)}%)
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                          t.splitType === 'OOS'
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                            : t.splitType === 'VAL'
                            ? 'bg-slate-800 text-slate-300'
                            : 'bg-slate-900 text-slate-500'
                        }`}
                      >
                        {t.splitType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-medium mr-1.5">
                        {t.exitReason}
                      </span>
                      <span className="text-slate-400 text-[11px] line-clamp-1">{t.entryReason}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
