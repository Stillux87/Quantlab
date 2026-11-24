/**
 * QuantLab - Modal & Interactive Chart for Instrument Returns & Customizable Periods
 * Shows historical price & cumulative return (%) curves with user-adjustable date periods,
 * statistical metrics (Total Return, High, Low, Max Drawdown, Volatility), and backtest integration.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  TrendingUp,
  TrendingDown,
  Calendar,
  Clock,
  Maximize2,
  Minimize2,
  RefreshCw,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Play,
  Sliders,
  Check,
  Info,
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
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { Instrument, Bar, Timeframe } from '../types';
import { fetchRealHistoricalBars } from '../services/marketDataService';
import { CopyableISIN } from './CopyableISIN';

export interface InstrumentReturnsChartModalProps {
  isOpen: boolean;
  onClose: () => void;
  instrument: Instrument;
  initialPeriod?: string;
  onApplyDateRangeToBacktest?: (startDate: string, endDate: string) => void;
}

export type PeriodKey = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '2Y' | '3Y' | '5Y' | 'MAX' | 'CUSTOM';

interface PeriodPreset {
  key: PeriodKey;
  label: string;
  sublabel: string;
}

const PERIOD_PRESETS: PeriodPreset[] = [
  { key: '1W', label: '1 Settimana', sublabel: '7 Giorni' },
  { key: '1M', label: '1 Mese', sublabel: '30 Giorni' },
  { key: '3M', label: '3 Mesi', sublabel: 'Trimestre' },
  { key: '6M', label: '6 Mesi', sublabel: 'Semestre' },
  { key: 'YTD', label: 'YTD', sublabel: 'Da Inizio Anno' },
  { key: '1Y', label: '1 Anno', sublabel: '12 Mesi' },
  { key: '3Y', label: '3 Anni', sublabel: 'Medio Termine' },
  { key: '5Y', label: '5 Anni', sublabel: 'Ciclo Completo' },
  { key: 'MAX', label: 'MAX', sublabel: 'Tutto lo Storico' },
  { key: 'CUSTOM', label: 'Personalizzato', sublabel: 'Date Libere' },
];

export const InstrumentReturnsChartModal: React.FC<InstrumentReturnsChartModalProps> = ({
  isOpen,
  onClose,
  instrument,
  initialPeriod = '1Y',
  onApplyDateRangeToBacktest,
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>(initialPeriod as PeriodKey);
  const [chartMode, setChartMode] = useState<'RETURN_PCT' | 'PRICE'>('RETURN_PCT');
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('1D');
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Custom date range state
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [showCustomDateInputs, setShowCustomDateInputs] = useState(false);

  // Loaded data state
  const [bars, setBars] = useState<Bar[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRealData, setIsRealData] = useState(true);
  const [appliedNotification, setAppliedNotification] = useState(false);

  // Format today as YYYY-MM-DD
  const todayStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  // Compute startDate based on period
  const computedDates = useMemo(() => {
    const today = new Date();
    const endStr = today.toISOString().split('T')[0];
    let start = new Date(today);

    switch (selectedPeriod) {
      case '1W':
        start.setDate(today.getDate() - 7);
        break;
      case '1M':
        start.setMonth(today.getMonth() - 1);
        break;
      case '3M':
        start.setMonth(today.getMonth() - 3);
        break;
      case '6M':
        start.setMonth(today.getMonth() - 6);
        break;
      case 'YTD':
        start = new Date(today.getFullYear(), 0, 1);
        break;
      case '1Y':
        start.setFullYear(today.getFullYear() - 1);
        break;
      case '2Y':
        start.setFullYear(today.getFullYear() - 2);
        break;
      case '3Y':
        start.setFullYear(today.getFullYear() - 3);
        break;
      case '5Y':
        start.setFullYear(today.getFullYear() - 5);
        break;
      case 'MAX':
        start = new Date(2000, 0, 1);
        break;
      case 'CUSTOM':
        return {
          startDate: customStartDate || '2025-01-01',
          endDate: customEndDate || endStr,
        };
    }

    return {
      startDate: start.toISOString().split('T')[0],
      endDate: endStr,
    };
  }, [selectedPeriod, customStartDate, customEndDate]);

  // Load bars whenever instrument, timeframe, or dates change
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);

    const { startDate, endDate } = computedDates;
    const startParam = selectedPeriod === 'MAX' ? undefined : startDate;
    const endParam = selectedPeriod === 'MAX' ? undefined : endDate;

    fetchRealHistoricalBars(instrument, selectedTimeframe, startParam, endParam)
      .then((res) => {
        if (!isMounted) return;
        setBars(res.bars || []);
        setIsRealData(res.isRealData);
      })
      .catch((err) => {
        console.error('Error fetching bars for returns chart:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, instrument.ticker, selectedTimeframe, computedDates, selectedPeriod]);

  // Initialize custom dates if empty
  useEffect(() => {
    if (!customStartDate || !customEndDate) {
      const today = new Date();
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(today.getFullYear() - 1);
      setCustomStartDate(oneYearAgo.toISOString().split('T')[0]);
      setCustomEndDate(today.toISOString().split('T')[0]);
    }
  }, [customStartDate, customEndDate]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Process data for Chart & Metrics calculation
  const chartData = useMemo(() => {
    if (!bars || bars.length === 0) return [];

    const basePrice = bars[0].close || 1;
    let runningMax = bars[0].close;

    return bars.map((bar, idx) => {
      const currentPrice = bar.close;
      if (currentPrice > runningMax) {
        runningMax = currentPrice;
      }
      const drawdownPct = runningMax > 0 ? ((currentPrice - runningMax) / runningMax) * 100 : 0;
      const returnPct = ((currentPrice - basePrice) / basePrice) * 100;
      const prevClose = idx > 0 ? bars[idx - 1].close : bar.open;
      const dayChangePct = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

      // Short label for X axis
      const datePart = bar.dateStr.split(' ')[0];
      const parts = datePart.split('-');
      const shortDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : datePart;

      return {
        dateStr: bar.dateStr,
        shortDate,
        fullDate: datePart,
        timestamp: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: currentPrice,
        volume: bar.volume,
        returnPct: parseFloat(returnPct.toFixed(2)),
        drawdownPct: parseFloat(drawdownPct.toFixed(2)),
        dayChangePct: parseFloat(dayChangePct.toFixed(2)),
      };
    });
  }, [bars]);

  // Metrics summary for the period
  const metrics = useMemo(() => {
    if (!bars || bars.length < 2) {
      return {
        totalReturnPct: 0,
        totalReturnAmount: 0,
        startPrice: instrument.currentPrice,
        endPrice: instrument.currentPrice,
        startDate: '',
        endDate: '',
        highPrice: instrument.currentPrice,
        highDate: '',
        lowPrice: instrument.currentPrice,
        lowDate: '',
        maxDrawdownPct: 0,
        annualizedVolatilityPct: 0,
        barsCount: bars.length,
      };
    }

    const firstBar = bars[0];
    const lastBar = bars[bars.length - 1];
    const startPrice = firstBar.close;
    const endPrice = lastBar.close;
    const totalReturnAmount = endPrice - startPrice;
    const totalReturnPct = startPrice > 0 ? (totalReturnAmount / startPrice) * 100 : 0;

    let highPrice = -Infinity;
    let highDate = '';
    let lowPrice = Infinity;
    let lowDate = '';
    let runningMax = -Infinity;
    let maxDrawdownPct = 0;

    const dailyReturns: number[] = [];

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      if (b.high > highPrice) {
        highPrice = b.high;
        highDate = b.dateStr.split(' ')[0];
      }
      if (b.low < lowPrice) {
        lowPrice = b.low;
        lowDate = b.dateStr.split(' ')[0];
      }

      // Drawdown
      if (b.close > runningMax) {
        runningMax = b.close;
      }
      const dd = runningMax > 0 ? ((b.close - runningMax) / runningMax) * 100 : 0;
      if (dd < maxDrawdownPct) {
        maxDrawdownPct = dd;
      }

      // Volatility daily returns
      if (i > 0 && bars[i - 1].close > 0) {
        dailyReturns.push((b.close - bars[i - 1].close) / bars[i - 1].close);
      }
    }

    // Volatility calculation (std dev * sqrt(252))
    let annualizedVolatilityPct = 0;
    if (dailyReturns.length > 1) {
      const mean = dailyReturns.reduce((acc, v) => acc + v, 0) / dailyReturns.length;
      const variance =
        dailyReturns.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (dailyReturns.length - 1);
      const stdDev = Math.sqrt(variance);
      annualizedVolatilityPct = stdDev * Math.sqrt(252) * 100;
    }

    return {
      totalReturnPct: parseFloat(totalReturnPct.toFixed(2)),
      totalReturnAmount: parseFloat(totalReturnAmount.toFixed(2)),
      startPrice,
      endPrice,
      startDate: firstBar.dateStr.split(' ')[0],
      endDate: lastBar.dateStr.split(' ')[0],
      highPrice,
      highDate,
      lowPrice,
      lowDate,
      maxDrawdownPct: parseFloat(maxDrawdownPct.toFixed(2)),
      annualizedVolatilityPct: parseFloat(annualizedVolatilityPct.toFixed(1)),
      barsCount: bars.length,
    };
  }, [bars, instrument.currentPrice]);

  const isPositive = metrics.totalReturnPct >= 0;

  const handleApplyToBacktest = () => {
    if (onApplyDateRangeToBacktest && metrics.startDate && metrics.endDate) {
      onApplyDateRangeToBacktest(metrics.startDate, metrics.endDate);
      setAppliedNotification(true);
      setTimeout(() => {
        setAppliedNotification(false);
        onClose();
      }, 1200);
    }
  };

  // Lock body scroll and listen for Escape key when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto backdrop-blur-md bg-slate-950/85 animate-in fade-in-0 duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col w-full my-auto transition-all duration-200 overflow-hidden ${
          isFullScreen
            ? 'fixed inset-2 sm:inset-4 z-[10000] max-w-none h-[calc(100vh-1rem)] sm:h-[calc(100vh-2rem)]'
            : 'max-w-5xl max-h-[92vh]'
        }`}
      >
        {/* Modal Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80 gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-cyan-950/80 border border-cyan-700/60 flex items-center justify-center font-mono font-black text-sm sm:text-base text-cyan-300 shadow-inner shrink-0">
              {instrument.ticker.split('.')[0]}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-black text-lg sm:text-2xl text-white tracking-tight">
                  {instrument.ticker}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                  {instrument.type}
                </span>
                <span className="text-xs text-slate-400 font-medium px-2 py-0.5 bg-slate-800 rounded">
                  {instrument.market}
                </span>
                {isRealData && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    DATI REALI ATTIVI
                  </span>
                )}
                {instrument.isin && (
                  <CopyableISIN isin={instrument.isin} size="xs" variant="badge" />
                )}
              </div>
              <h2 className="text-xs sm:text-sm font-semibold text-slate-300 mt-0.5 line-clamp-1">
                {instrument.name}
              </h2>
            </div>
          </div>

          {/* Quick Price & Action buttons */}
          <div className="flex items-center gap-3 self-end sm:self-auto">
            <div className="text-right">
              <div className="font-mono font-black text-lg sm:text-xl text-white">
                {instrument.currencySymbol}
                {metrics.endPrice.toFixed(2)}
              </div>
              <div
                className={`text-xs font-mono font-bold flex items-center justify-end gap-1 ${
                  isPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                <span>
                  {isPositive ? '+' : ''}
                  {metrics.totalReturnPct.toFixed(2)}%
                </span>
                <span className="text-[11px] opacity-75 font-normal">
                  ({instrument.currencySymbol}
                  {metrics.totalReturnAmount >= 0 ? '+' : ''}
                  {metrics.totalReturnAmount.toFixed(2)})
                </span>
              </div>
            </div>

            {/* Window control buttons */}
            <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title={isFullScreen ? 'Riduci dimensione' : 'Schermo intero'}
              >
                {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                title="Chiudi finestra (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable Modal Body: Contains Toolbar, KPIs and the full Chart */}
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar flex flex-col">
          {/* Customizable Periods Toolbar */}
          <div className="p-3 sm:p-4 border-b border-slate-800 bg-slate-900/90 flex flex-col gap-3 shrink-0">
            {/* Preset Buttons Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full custom-scrollbar">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 mr-1 shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Periodo:</span>
                </span>
                {PERIOD_PRESETS.map((preset) => {
                  const isActive = selectedPeriod === preset.key;
                  return (
                    <button
                      key={preset.key}
                      onClick={() => {
                        setSelectedPeriod(preset.key);
                        if (preset.key === 'CUSTOM') {
                          setShowCustomDateInputs(true);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
                        isActive
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                          : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700'
                      }`}
                      title={preset.sublabel}
                    >
                      <span>{preset.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Scale & Timeframe Controls */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Chart Scale Switcher */}
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setChartMode('RETURN_PCT')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                      chartMode === 'RETURN_PCT'
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Rendimento %
                  </button>
                  <button
                    onClick={() => setChartMode('PRICE')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                      chartMode === 'PRICE'
                        ? 'bg-cyan-500/20 text-cyan-300'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Prezzo ({instrument.currencySymbol})
                  </button>
                </div>

                {/* Timeframe compression */}
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  <span className="text-[11px] text-slate-500 px-1.5 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    Barra:
                  </span>
                  {(['1D', '4h', '1h'] as Timeframe[]).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setSelectedTimeframe(tf)}
                      className={`px-2 py-0.8 rounded-lg font-mono font-bold text-xs transition-all ${
                        selectedTimeframe === tf
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Custom Date Inputs Drawer (when CUSTOM is active or toggled) */}
            {(selectedPeriod === 'CUSTOM' || showCustomDateInputs) && (
              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-3 text-xs bg-slate-950/50 p-2.5 rounded-xl">
                <span className="text-slate-400 font-medium flex items-center gap-1">
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  Intervallo Personalizzato:
                </span>
                <div className="flex items-center gap-2">
                  <label className="text-slate-400">Da:</label>
                  <input
                    type="date"
                    value={customStartDate}
                    max={customEndDate || todayStr}
                    onChange={(e) => {
                      setCustomStartDate(e.target.value);
                      setSelectedPeriod('CUSTOM');
                    }}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs focus:ring-1 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-slate-400">A:</label>
                  <input
                    type="date"
                    value={customEndDate}
                    min={customStartDate}
                    max={todayStr}
                    onChange={(e) => {
                      setCustomEndDate(e.target.value);
                      setSelectedPeriod('CUSTOM');
                    }}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 font-mono text-xs focus:ring-1 focus:ring-cyan-400 focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => setSelectedPeriod('CUSTOM')}
                  className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition-colors"
                >
                  Applica Date
                </button>
              </div>
            )}
          </div>

          {/* Period Returns Summary KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-2.5 p-3 sm:p-4 border-b border-slate-800 bg-slate-950/50 text-xs shrink-0">
            {/* 1. Rendimento Periodo */}
            <div className="bg-slate-900/80 p-2.5 sm:p-3 rounded-xl border border-slate-800/80">
              <div className="text-[11px] text-slate-400 font-medium">Rendimento Periodo</div>
              <div
                className={`text-sm sm:text-base font-black font-mono mt-0.5 flex items-center gap-1 ${
                  isPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {isPositive ? '+' : ''}
                {metrics.totalReturnPct.toFixed(2)}%
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
                {metrics.startDate} &rarr; {metrics.endDate}
              </div>
            </div>

            {/* 2. Prezzo Iniziale & Finale */}
            <div className="bg-slate-900/80 p-2.5 sm:p-3 rounded-xl border border-slate-800/80">
              <div className="text-[11px] text-slate-400 font-medium">Inizio &rarr; Fine</div>
              <div className="font-mono font-bold text-slate-200 text-xs mt-0.5 flex items-center gap-1">
                <span>
                  {instrument.currencySymbol}
                  {metrics.startPrice.toFixed(2)}
                </span>
                <span className="text-slate-500">&rarr;</span>
                <span className="text-white font-black">
                  {instrument.currencySymbol}
                  {metrics.endPrice.toFixed(2)}
                </span>
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                Delta: {instrument.currencySymbol}
                {metrics.totalReturnAmount >= 0 ? '+' : ''}
                {metrics.totalReturnAmount.toFixed(2)}
              </div>
            </div>

            {/* 3. Massimo Periodo */}
            <div className="bg-slate-900/80 p-2.5 sm:p-3 rounded-xl border border-slate-800/80">
              <div className="text-[11px] text-slate-400 font-medium">Massimo del Periodo</div>
              <div className="text-emerald-400 font-mono font-bold text-xs mt-0.5">
                {instrument.currencySymbol}
                {metrics.highPrice.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">{metrics.highDate}</div>
            </div>

            {/* 4. Minimo Periodo */}
            <div className="bg-slate-900/80 p-2.5 sm:p-3 rounded-xl border border-slate-800/80">
              <div className="text-[11px] text-slate-400 font-medium">Minimo del Periodo</div>
              <div className="text-rose-400 font-mono font-bold text-xs mt-0.5">
                {instrument.currencySymbol}
                {metrics.lowPrice.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">{metrics.lowDate}</div>
            </div>

            {/* 5. Max Drawdown */}
            <div className="bg-slate-900/80 p-2.5 sm:p-3 rounded-xl border border-slate-800/80">
              <div className="text-[11px] text-slate-400 font-medium">Max Drawdown</div>
              <div className="text-amber-400 font-mono font-bold text-xs mt-0.5">
                {metrics.maxDrawdownPct.toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Picco-Valle nel periodo</div>
            </div>

            {/* 6. Volatilità Annualizzata */}
            <div className="bg-slate-900/80 p-2.5 sm:p-3 rounded-xl border border-slate-800/80">
              <div className="text-[11px] text-slate-400 font-medium">Volatilità / Barre</div>
              <div className="text-cyan-300 font-mono font-bold text-xs mt-0.5">
                {metrics.annualizedVolatilityPct.toFixed(1)}%
              </div>
              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                {metrics.barsCount} barre analizzate
              </div>
            </div>
          </div>

          {/* Main Chart Stage */}
          <div className="flex-1 p-3 sm:p-5 relative min-h-[340px] flex flex-col justify-center">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-72 gap-3 text-slate-400">
                <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                <span className="text-sm font-medium">Caricamento serie storica e rendimenti...</span>
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-72 gap-2 text-slate-500">
                <Info className="w-8 h-8 text-slate-600" />
                <p className="text-sm font-medium">Nessun dato disponibile per il periodo selezionato.</p>
                <p className="text-xs">Prova a selezionare un intervallo temporale più ampio (es. 1 Anno o MAX).</p>
              </div>
            ) : (
              <div className="h-[320px] sm:h-[380px] md:h-[420px] w-full min-h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 15, right: 20, left: 10, bottom: 25 }}>
                    <defs>
                      <linearGradient id="returnGradientGreen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="returnGradientRed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="shortDate"
                      stroke="#64748b"
                      fontSize={11}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: '#334155' }}
                      minTickGap={28}
                      dy={6}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: '#334155' }}
                      domain={['auto', 'auto']}
                      width={chartMode === 'RETURN_PCT' ? 55 : 65}
                      dx={-2}
                      tickFormatter={(val) => {
                        if (chartMode === 'RETURN_PCT') {
                          return `${val >= 0 ? '+' : ''}${val.toFixed(0)}%`;
                        }
                        return `${instrument.currencySymbol}${val.toFixed(0)}`;
                      }}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload;
                          return (
                            <div className="bg-slate-900/95 border border-slate-700/80 p-3 rounded-xl shadow-2xl text-xs font-mono z-30">
                              <div className="pb-1.5 mb-1.5 border-b border-slate-800 flex items-center justify-between gap-3">
                                <span className="font-bold text-white">{d.fullDate}</span>
                                <span className="text-slate-400 text-[11px]">
                                  Var. giorno:{' '}
                                  <span
                                    className={`font-semibold ${
                                      d.dayChangePct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                    }`}
                                  >
                                    {d.dayChangePct >= 0 ? '+' : ''}
                                    {d.dayChangePct}%
                                  </span>
                                </span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-slate-400">Prezzo di Chiusura:</span>
                                  <span className="font-bold text-cyan-300">
                                    {instrument.currencySymbol}
                                    {Number(d.close).toFixed(2)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <span className="text-slate-400">Rendimento Cumulato:</span>
                                  <span
                                    className={`font-bold ${
                                      d.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                    }`}
                                  >
                                    {d.returnPct >= 0 ? '+' : ''}
                                    {Number(d.returnPct).toFixed(2)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />

                    {chartMode === 'RETURN_PCT' && (
                      <>
                        <ReferenceLine y={0} stroke="#64748b" strokeDasharray="3 3" />
                        <Area
                          type="monotone"
                          dataKey="returnPct"
                          name="Rendimento %"
                          stroke={isPositive ? '#10b981' : '#f43f5e'}
                          strokeWidth={2.5}
                          fill={isPositive ? 'url(#returnGradientGreen)' : 'url(#returnGradientRed)'}
                          dot={false}
                          activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2 }}
                        />
                      </>
                    )}

                    {chartMode === 'PRICE' && (
                      <Area
                        type="monotone"
                        dataKey="close"
                        name="Prezzo"
                        stroke="#06b6d4"
                        strokeWidth={2.5}
                        fill="url(#priceGradient)"
                        dot={false}
                        activeDot={{ r: 5, stroke: '#ffffff', strokeWidth: 2 }}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 sm:p-4 border-t border-slate-800 bg-slate-950/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shrink-0">
          <div className="text-slate-400 flex items-center gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              I rendimenti sono calcolati dal prezzo di chiusura iniziale ({metrics.startDate}:{' '}
              <strong className="text-slate-200">
                {instrument.currencySymbol}
                {metrics.startPrice.toFixed(2)}
              </strong>
              ) fino al prezzo finale ({metrics.endDate}:{' '}
              <strong className="text-slate-200">
                {instrument.currencySymbol}
                {metrics.endPrice.toFixed(2)}
              </strong>
              ).
            </span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {onApplyDateRangeToBacktest && (
              <button
                onClick={handleApplyToBacktest}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {appliedNotification ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Periodo Applicato al Backtest!</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>Applica questo Periodo al Backtest</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors cursor-pointer"
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
