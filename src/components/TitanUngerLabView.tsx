/**
 * QuantLab - Titan Unger Strategy Lab View
 * Complete visual builder and robustness suite for Andrea Unger's Titan methodology.
 */
import React, { useState, useEffect, useMemo } from 'react';
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
  Legend,
} from 'recharts';
import {
  ShieldCheck,
  Zap,
  Sliders,
  Filter,
  Clock,
  Calendar,
  Layers,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Flame,
  ArrowRight,
  TrendingUp,
  Sparkles,
  BarChart2,
  Info,
  Activity,
  Trophy,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Check,
  Target,
  RefreshCw,
  Database,
} from 'lucide-react';
import {
  Instrument,
  Timeframe,
  Bar,
  BacktestResult,
  UngerCoreTriggerType,
  UngerFilterConfig,
  UngerExitConfig,
  TitanRobustnessReport,
} from '../types';
import { ungerTitanStrategy } from '../services/strategies/ungerTitanStrategy';
import { runBacktest } from '../services/backtestEngine';
import { computeTitanRobustnessReport } from '../services/titanAnalysisService';
import { filterBarsByDateRange } from '../services/dataFeed';
import { fetchRealHistoricalBars } from '../services/marketDataService';
import { DateRangeFilter, HISTORICAL_PRESETS, isRangeOverTwoYears } from './DateRangeSelector';
import { determineOptimalTimeframe } from '../services/automatedTimeframeEngine';
import { StrategyTriggerInspectorModal } from './StrategyTriggerInspectorModal';
import { BacktestTradeBlotter } from './BacktestTradeBlotter';

interface TitanUngerLabViewProps {
  instrument: Instrument;
  timeframe: Timeframe;
  historicalBars: Bar[];
  initialDateRange?: DateRangeFilter;
  onLaunchPaper: (result: BacktestResult) => void;
  onNavigateToLeaderboard?: () => void;
  onApplyToLeaderboard?: (result: BacktestResult) => void;
  onSelectTimeframe?: (timeframe: Timeframe) => void;
}

export const TitanUngerLabView: React.FC<TitanUngerLabViewProps> = ({
  instrument,
  timeframe,
  historicalBars,
  initialDateRange,
  onLaunchPaper,
  onNavigateToLeaderboard,
  onApplyToLeaderboard,
  onSelectTimeframe,
}) => {
  // Core Trigger selection
  const [triggerType, setTriggerType] = useState<UngerCoreTriggerType>('DONCHIAN_BREAKOUT');
  const [donchianPeriod, setDonchianPeriod] = useState<number>(20);
  const [bbPeriod, setBbPeriod] = useState<number>(20);
  const [rsiPeriod, setRsiPeriod] = useState<number>(14);
  const [biasDay, setBiasDay] = useState<number>(2); // Tuesday

  // Unger Filter Matrix State
  const [filters, setFilters] = useState<UngerFilterConfig>({
    trendFilterEnabled: true,
    trendFilterPeriod: 200,
    trendFilterMode: 'ABOVE_SMA',
    volatilityFilterEnabled: true,
    volatilityFilterMode: 'EXPANSION',
    atrPeriod: 14,
    atrSmaPeriod: 50,
    timeWindowFilterEnabled: false,
    sessionStartHour: 9,
    sessionStartMinute: 0,
    sessionEndHour: 17,
    sessionEndMinute: 30,
    dayOfWeekFilterEnabled: false,
    allowedDays: [1, 2, 3, 4, 5],
    patternFilterEnabled: false,
    consecutiveBarsCount: 2,
    consecutiveBarsDirection: 'BEARISH',
  });

  // Unger Exits State
  const [exits, setExits] = useState<UngerExitConfig>({
    stopLossType: 'ATR_MULTIPLE',
    stopLossValue: 2.0,
    takeProfitType: 'ATR_MULTIPLE',
    takeProfitValue: 3.5,
    trailingStopPct: 1.5,
    timeExitBars: 12,
    intradayExitEod: false,
  });

  // Chart view mode
  const [chartTab, setChartTab] = useState<'TITAN_ECT' | 'EQUITY' | 'DRAWDOWN'>('TITAN_ECT');
  const [showExplanation, setShowExplanation] = useState<boolean>(true);
  const [promotedSuccess, setPromotedSuccess] = useState<boolean>(false);

  // Execution & Results
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [showTriggerInspector, setShowTriggerInspector] = useState<boolean>(false);

  // Compute combined strategy parameters
  const currentParams = useMemo(() => {
    return {
      triggerType,
      donchianPeriod,
      bbPeriod,
      rsiPeriod,
      biasDay,
      trendFilterEnabled: filters.trendFilterEnabled,
      trendFilterPeriod: filters.trendFilterPeriod,
      trendFilterMode: filters.trendFilterMode,
      volatilityFilterEnabled: filters.volatilityFilterEnabled,
      volatilityFilterMode: filters.volatilityFilterMode,
      atrPeriod: filters.atrPeriod,
      atrSmaPeriod: filters.atrSmaPeriod,
      timeWindowFilterEnabled: filters.timeWindowFilterEnabled,
      sessionStartHour: filters.sessionStartHour,
      sessionStartMinute: filters.sessionStartMinute,
      sessionEndHour: filters.sessionEndHour,
      sessionEndMinute: filters.sessionEndMinute,
      dayOfWeekFilterEnabled: filters.dayOfWeekFilterEnabled,
      allowedDays: filters.allowedDays.join(','),
      patternFilterEnabled: filters.patternFilterEnabled,
      consecutiveBarsCount: filters.consecutiveBarsCount,
      consecutiveBarsDirection: filters.consecutiveBarsDirection,
      stopLossType: exits.stopLossType,
      stopLossValue: exits.stopLossValue,
      takeProfitType: exits.takeProfitType,
      takeProfitValue: exits.takeProfitValue,
      trailingStopPct: exits.trailingStopPct,
      timeExitBars: exits.timeExitBars,
      intradayExitEod: exits.intradayExitEod,
    };
  }, [triggerType, donchianPeriod, bbPeriod, rsiPeriod, biasDay, filters, exits]);

  // Selected Date Range & Timeframe for Titan Lab
  const [selectedDateRange, setSelectedDateRange] = useState<DateRangeFilter>(() => {
    if (initialDateRange) return initialDateRange;
    // Default to Ciclo Decennale (2016 - Oggi)
    return HISTORICAL_PRESETS[1] || HISTORICAL_PRESETS[0];
  });

  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>(() => {
    const isOverTwo = isRangeOverTwoYears(
      (initialDateRange || HISTORICAL_PRESETS[1])?.startDate,
      (initialDateRange || HISTORICAL_PRESETS[1])?.endDate,
      (initialDateRange || HISTORICAL_PRESETS[1])?.presetKey
    );
    if (isOverTwo) return '1D';
    return timeframe;
  });

  const [realBars, setRealBars] = useState<Bar[]>([]);
  const [isLoadingBars, setIsLoadingBars] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [autoTimeframeNotice, setAutoTimeframeNotice] = useState<string | null>(() => {
    const isOverTwo = isRangeOverTwoYears(
      (initialDateRange || HISTORICAL_PRESETS[1])?.startDate,
      (initialDateRange || HISTORICAL_PRESETS[1])?.endDate,
      (initialDateRange || HISTORICAL_PRESETS[1])?.presetKey
    );
    if (isOverTwo && timeframe !== '1D') {
      return `Periodo ultrabiennale selezionato: timeframe impostato automaticamente ad 1D (Daily). I dati storici reali intraday sono disponibili fino a 2 anni; per garantire il 100% di dati reali ed escludere categoricamente serie sintetiche, il backtest Titan è calcolato su base giornaliera.`;
    }
    return null;
  });

  // Handle Date Range Change with automatic 1D enforcement
  const handleDateRangeChange = (range: DateRangeFilter) => {
    setSelectedDateRange(range);
    const isOverTwo = isRangeOverTwoYears(range.startDate, range.endDate, range.presetKey);
    if (isOverTwo && activeTimeframe !== '1D') {
      setActiveTimeframe('1D');
      if (onSelectTimeframe) onSelectTimeframe('1D');
      setAutoTimeframeNotice(
        `Periodo oltre 2 anni selezionato (${range.label}): timeframe impostato automaticamente ad 1D (Daily). I feed di borsa reali coprono fino a 2 anni in intraday; per garantire il 100% di dati reali ed escludere categoricamente serie sintetiche, il backtest Titan è calcolato su base giornaliera.`
      );
    } else if (!isOverTwo && autoTimeframeNotice) {
      setAutoTimeframeNotice(null);
    }
  };

  // Handle Timeframe Change with 2-year boundary check
  const handleTimeframeChange = (tf: Timeframe) => {
    const isOverTwo = isRangeOverTwoYears(selectedDateRange.startDate, selectedDateRange.endDate, selectedDateRange.presetKey);
    if (tf !== '1D' && isOverTwo) {
      const recentPreset = HISTORICAL_PRESETS.find((p) => p.key === 'LAST_12M') || HISTORICAL_PRESETS[HISTORICAL_PRESETS.length - 2];
      setSelectedDateRange(recentPreset);
      setActiveTimeframe(tf);
      if (onSelectTimeframe) onSelectTimeframe(tf);
      setAutoTimeframeNotice(
        `Timeframe intraday (${tf}) selezionato: la finestra temporale è stata regolata su 12 mesi (${recentPreset.label}). I feed reali intraday coprono fino a 2 anni; il sistema esclude tassativamente qualsiasi dato sintetico.`
      );
      return;
    }
    setActiveTimeframe(tf);
    if (onSelectTimeframe) onSelectTimeframe(tf);
  };

  // Strictly fetch real market data from Yahoo Finance / server API
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setIsLoadingBars(true);
      setLoadError(null);
      try {
        const isOverTwo = isRangeOverTwoYears(selectedDateRange.startDate, selectedDateRange.endDate, selectedDateRange.presetKey);
        let targetTf = activeTimeframe;
        if (isOverTwo) {
          if (targetTf !== '1D') {
            targetTf = '1D';
            setActiveTimeframe('1D');
            if (onSelectTimeframe) onSelectTimeframe('1D');
            setAutoTimeframeNotice(
              `Periodo oltre 2 anni selezionato (${selectedDateRange.label}): timeframe impostato automaticamente a 1D (Daily). I feed reali di borsa coprono fino a 2 anni in intraday; per garantire il 100% di dati reali ed escludere categoricamente serie sintetiche, il backtest Titan è calcolato su base giornaliera.`
            );
          }
        } else {
          // Automatic timeframe determination for periods <= 2 years
          const autoResult = determineOptimalTimeframe(
            instrument,
            ungerTitanStrategy,
            selectedDateRange.startDate,
            selectedDateRange.endDate
          );
          if (autoResult.isStrategyEligible && autoResult.optimalTimeframe) {
            targetTf = autoResult.optimalTimeframe;
            setActiveTimeframe(targetTf);
            if (onSelectTimeframe) onSelectTimeframe(targetTf);
            setAutoTimeframeNotice(autoResult.selectionRationale);
          } else {
            setAutoTimeframeNotice(
              'Nessun timeframe testato presenta caratteristiche sufficientemente robuste per considerare questa strategia idonea al trading.'
            );
            targetTf = autoResult.candidates[0]?.timeframe || '1h';
          }
        }

        const isCustomPeriod = selectedDateRange.presetKey !== 'ALL';
        const { bars, autoAdjustedTimeframe, autoAdjustmentNote } = await fetchRealHistoricalBars(
          instrument,
          targetTf,
          isCustomPeriod ? selectedDateRange.startDate : undefined,
          isCustomPeriod ? selectedDateRange.endDate : undefined
        );

        if (!isMounted) return;

        if (autoAdjustmentNote) {
          setAutoTimeframeNotice(autoAdjustmentNote);
        }
        if (autoAdjustedTimeframe && autoAdjustedTimeframe !== targetTf) {
          setActiveTimeframe(autoAdjustedTimeframe);
          if (onSelectTimeframe) onSelectTimeframe(autoAdjustedTimeframe);
        }

        const effectiveTf = autoAdjustedTimeframe || targetTf;
        const filtered = filterBarsByDateRange(
          bars,
          isCustomPeriod ? selectedDateRange.startDate : undefined,
          isCustomPeriod ? selectedDateRange.endDate : undefined,
          instrument,
          effectiveTf
        );

        if (filtered && filtered.length > 0) {
          setRealBars(filtered);
        } else if (bars && bars.length > 0) {
          setRealBars(bars);
        } else {
          setRealBars([]);
          setLoadError(`Nessun dato storico reale disponibile per ${instrument.ticker} nel periodo selezionato.`);
        }
      } catch (err: any) {
        console.error('[TitanUngerLabView] Error loading real historical bars:', err);
        if (isMounted) {
          setLoadError(err.message || 'Errore nel caricamento dei dati storici reali di mercato.');
        }
      } finally {
        if (isMounted) {
          setIsLoadingBars(false);
        }
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [
    instrument.ticker,
    instrument.id,
    activeTimeframe,
    selectedDateRange.startDate,
    selectedDateRange.endDate,
    selectedDateRange.presetKey,
  ]);

  // Strict 100% real historical bars (never synthetic)
  const effectiveBars = realBars;

  // Execute Backtest on parameters change or bar data
  useEffect(() => {
    if (!effectiveBars || effectiveBars.length < 30) {
      setBacktestResult(null);
      return;
    }

    setIsRunning(true);
    const timer = setTimeout(() => {
      try {
        const res = runBacktest(ungerTitanStrategy, instrument, activeTimeframe, effectiveBars, currentParams, {
          trainRatio: 0.65,
          valRatio: 0.15,
          oosRatio: 0.20,
          initialCapital: 10000,
          commissionPct: 0.05,
          slippagePct: 0.03,
        });
        setBacktestResult(res);
      } catch (err) {
        console.error('Titan Backtest error:', err);
      } finally {
        setIsRunning(false);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [effectiveBars, instrument, activeTimeframe, currentParams]);

  // Compute Titan Diagnostic Report
  const titanReport: TitanRobustnessReport | null = useMemo(() => {
    if (!backtestResult) return null;
    return computeTitanRobustnessReport(backtestResult);
  }, [backtestResult]);

  const toggleDayOfWeek = (day: number) => {
    setFilters((prev) => {
      const exists = prev.allowedDays.includes(day);
      const updated = exists ? prev.allowedDays.filter((d) => d !== day) : [...prev.allowedDays, day];
      return { ...prev, allowedDays: updated.sort() };
    });
  };

  const dayLabels = [
    { num: 1, label: 'Lun' },
    { num: 2, label: 'Mar' },
    { num: 3, label: 'Mer' },
    { num: 4, label: 'Gio' },
    { num: 5, label: 'Ven' },
  ];

  const applyPreset = (preset: 'EQUITY_MEAN_REVERSION' | 'FUTURES_TREND' | 'BIAS_SEASONALITY') => {
    if (preset === 'EQUITY_MEAN_REVERSION') {
      setTriggerType('BOLLINGER_REVERSAL');
      setBbPeriod(20);
      setFilters({
        trendFilterEnabled: true,
        trendFilterPeriod: 200,
        trendFilterMode: 'ABOVE_SMA',
        volatilityFilterEnabled: false,
        volatilityFilterMode: 'EXPANSION',
        atrPeriod: 14,
        atrSmaPeriod: 50,
        timeWindowFilterEnabled: false,
        sessionStartHour: 9,
        sessionStartMinute: 0,
        sessionEndHour: 17,
        sessionEndMinute: 30,
        dayOfWeekFilterEnabled: false,
        allowedDays: [1, 2, 3, 4, 5],
        patternFilterEnabled: false,
        consecutiveBarsCount: 2,
        consecutiveBarsDirection: 'BEARISH',
      });
      setExits({
        stopLossType: 'ATR_MULTIPLE',
        stopLossValue: 2.0,
        takeProfitType: 'ATR_MULTIPLE',
        takeProfitValue: 3.2,
        trailingStopPct: 2.0,
        timeExitBars: 12,
        intradayExitEod: false,
      });
    } else if (preset === 'FUTURES_TREND') {
      setTriggerType('DONCHIAN_BREAKOUT');
      setDonchianPeriod(20);
      setFilters({
        trendFilterEnabled: true,
        trendFilterPeriod: 200,
        trendFilterMode: 'ABOVE_SMA',
        volatilityFilterEnabled: true,
        volatilityFilterMode: 'EXPANSION',
        atrPeriod: 14,
        atrSmaPeriod: 50,
        timeWindowFilterEnabled: false,
        sessionStartHour: 9,
        sessionStartMinute: 0,
        sessionEndHour: 17,
        sessionEndMinute: 30,
        dayOfWeekFilterEnabled: false,
        allowedDays: [1, 2, 3, 4, 5],
        patternFilterEnabled: false,
        consecutiveBarsCount: 2,
        consecutiveBarsDirection: 'BEARISH',
      });
      setExits({
        stopLossType: 'ATR_MULTIPLE',
        stopLossValue: 2.5,
        takeProfitType: 'ATR_MULTIPLE',
        takeProfitValue: 4.0,
        trailingStopPct: 1.5,
        timeExitBars: 16,
        intradayExitEod: false,
      });
    } else if (preset === 'BIAS_SEASONALITY') {
      setTriggerType('DAY_OF_WEEK_BIAS');
      setBiasDay(2); // Martedì
      setFilters({
        trendFilterEnabled: true,
        trendFilterPeriod: 200,
        trendFilterMode: 'ABOVE_SMA',
        volatilityFilterEnabled: false,
        volatilityFilterMode: 'EXPANSION',
        atrPeriod: 14,
        atrSmaPeriod: 50,
        timeWindowFilterEnabled: false,
        sessionStartHour: 9,
        sessionStartMinute: 0,
        sessionEndHour: 17,
        sessionEndMinute: 30,
        dayOfWeekFilterEnabled: false,
        allowedDays: [1, 2, 3, 4, 5],
        patternFilterEnabled: false,
        consecutiveBarsCount: 2,
        consecutiveBarsDirection: 'BEARISH',
      });
      setExits({
        stopLossType: 'ATR_MULTIPLE',
        stopLossValue: 1.8,
        takeProfitType: 'ATR_MULTIPLE',
        takeProfitValue: 3.0,
        trailingStopPct: 1.5,
        timeExitBars: 6,
        intradayExitEod: false,
      });
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner: Metodo Unger & Titan Philosophy */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950/80 border border-slate-700/80 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
              </div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">
                Titan Strategy Lab — Metodo Unger™
              </h2>
              <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                Anti-Overfitting
              </span>
            </div>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              Costruisci strategie sistematiche combinando <strong>trigger di base elementari</strong> (Donchian Breakout, Mean Reversion, Prior Day) 
              con la <strong>matrice di filtri di regime</strong> (Trend SMA200, Volatilità ATR, Finestre Orarie e Bias Settimanale). 
              Le strategie vengono validate rigorosamente con split Out-Of-Sample e Test Monte Carlo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start lg:self-center">
            {backtestResult && onApplyToLeaderboard && (
              <button
                id="titan-apply-leaderboard-btn"
                onClick={() => {
                  onApplyToLeaderboard(backtestResult);
                  setPromotedSuccess(true);
                  setTimeout(() => setPromotedSuccess(false), 3000);
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all active:scale-95 cursor-pointer"
                title="Sostituisce la strategia Titan nella classifica generale e ricalcola la strategia #1 consigliata"
              >
                {promotedSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-slate-950 font-black" />
                    <span>Promossa nella Leaderboard!</span>
                  </>
                ) : (
                  <>
                    <Trophy className="w-4 h-4 text-slate-950" />
                    <span>Promuovi nella Classifica Generale</span>
                  </>
                )}
              </button>
            )}

            {/* Real-time Trigger & Condition Inspector Button */}
            <button
              type="button"
              id="titan-inspect-trigger-btn"
              onClick={() => setShowTriggerInspector(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-cyan-800/40 text-cyan-300 font-bold text-xs shadow-md transition-all active:scale-95 cursor-pointer"
              title="Visualizza grafico del livello di trigger e le condizioni che la strategia sta attendendo"
            >
              <Target className="w-4 h-4 text-cyan-400" />
              <span>Stato Trigger & Condizioni</span>
            </button>

            {backtestResult && (
              <button
                id="titan-launch-paper-btn"
                onClick={() => onLaunchPaper(backtestResult)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/25 transition-all active:scale-95 cursor-pointer"
              >
                <Flame className="w-4 h-4 text-amber-300" />
                Lancia in Paper Trading Reale
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Auto-adjustment Notification Banner for > 2 Years / Real Data */}
      {autoTimeframeNotice && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 text-emerald-200 text-xs flex items-center justify-between gap-3 shadow-lg animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <div className="font-bold text-emerald-300 text-sm flex items-center gap-2">
                Garanzia Dati Reali al 100% — Regola Anti-Sintetici Attiva
              </div>
              <p className="text-emerald-300/90 mt-0.5">{autoTimeframeNotice}</p>
            </div>
          </div>
          <button
            onClick={() => setAutoTimeframeNotice(null)}
            className="px-3 py-1 rounded-lg bg-emerald-900/50 hover:bg-emerald-900 text-emerald-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            Ho capito
          </button>
        </div>
      )}

      {/* Real Market Data, Timeframe & Historical Date Range Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-md space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Active Asset Info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-black text-sm">
              {instrument.ticker}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white">{instrument.name}</h3>
                <span className="text-xs font-bold text-slate-400">({instrument.ticker})</span>
                <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-slate-200">
                  {instrument.currencySymbol || '$'}{instrument.currentPrice.toFixed(2)}
                </span>
                <span
                  className={`text-xs font-bold font-mono ${
                    instrument.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {instrument.change24h >= 0 ? '+' : ''}
                  {instrument.change24h.toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                <span>Feed Ufficiale: <strong className="text-slate-200">Yahoo Finance (Real-Time)</strong></span>
                <span>&bull;</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  100% Dati Reali (Zero Serie Sintetiche)
                </span>
              </div>
            </div>
          </div>

          {/* Timeframe Controls with 1D enforcement badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              Timeframe:
            </span>
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              {(['1m', '5m', '15m', '1h', '4h', '1D'] as Timeframe[]).map((tf) => {
                const isSelected = activeTimeframe === tf;
                return (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => handleTimeframeChange(tf)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    {tf}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Date Range Presets Toolbar */}
        <div className="pt-2.5 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-400 flex items-center gap-1 mr-1">
              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
              Periodo Storico:
            </span>
            {HISTORICAL_PRESETS.map((preset) => {
              const isSelected = selectedDateRange.presetKey === preset.presetKey;
              return (
                <button
                  key={preset.presetKey}
                  type="button"
                  onClick={() => handleDateRangeChange(preset)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                      : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                  title={preset.description}
                >
                  {preset.label.split('(')[0].trim()}
                  <span className="ml-1 text-[10px] opacity-70 font-mono">[{preset.badge}]</span>
                </button>
              );
            })}
          </div>

          {/* Audit Verification status */}
          <div className="text-xs font-mono text-slate-400 flex items-center gap-2 self-end md:self-center">
            {isLoadingBars ? (
              <span className="text-cyan-400 flex items-center gap-1.5 font-bold animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                Scaricamento candele reali...
              </span>
            ) : loadError ? (
              <span className="text-rose-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                {loadError}
              </span>
            ) : (
              <span className="text-slate-300 flex items-center gap-1.5">
                <span className="text-emerald-400 font-bold">{effectiveBars.length}</span> barre reali verificate ({selectedDateRange.label})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Explanatory Guide: Come Titan Lab influenza il Selettore della Migliore Strategia */}
      <div className="bg-slate-900/90 border border-cyan-800/40 rounded-2xl p-5 shadow-lg space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Come interagisce Titan Lab con il Selettore della Migliore Strategia?
              </h3>
              <p className="text-[11px] text-slate-400">
                La differenza concettuale tra analisi basata solo su indicatori e il Metodo Unger™ sistemico.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowExplanation(!showExplanation)}
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium px-2.5 py-1 rounded bg-slate-800 border border-slate-700 transition-colors"
          >
            {showExplanation ? 'Nascondi' : 'Mostra Spiegazione'}
            {showExplanation ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showExplanation && (
          <div className="pt-2 border-t border-slate-800 text-xs text-slate-300 space-y-3 leading-relaxed">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Col 1 */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                <div className="font-bold text-rose-300 text-xs flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  1. Il Limite dei Puri Indicatori
                </div>
                <p className="text-[11px] text-slate-400">
                  Nei selettori tradizionali (RSI, MACD, Bollinger), si cerca di ottimizzare soglie numeriche sul passato. 
                  Questo porta al <strong className="text-slate-200">curve-fitting (overfitting)</strong>: un oscillatore come l'RSI rimane in ipervenduto per settimane durante un forte trend ribassista, causando pesanti perdite.
                </p>
              </div>

              {/* Col 2 */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                <div className="font-bold text-cyan-300 text-xs flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  2. L'Approccio Titan Lab (Unger)
                </div>
                <p className="text-[11px] text-slate-400">
                  Titan adotta un'architettura a 3 livelli: un <strong className="text-slate-200">Trigger elementare</strong> (es. rottura Donchian o Sessione precedente), filtrato da <strong className="text-slate-200">Regimi oggettivi</strong> (Trend SMA 200, Volatilità ATR, Finestre Orarie) e protetto da uscite a tempo e stop in volatilità.
                </p>
              </div>

              {/* Col 3 */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                <div className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  3. Come influenza la Classifica
                </div>
                <p className="text-[11px] text-slate-400">
                  Cliccando su <strong className="text-amber-300">"Promuovi nella Classifica Generale"</strong>, la configurazione affinata in questo Lab sostituisce la strategia Titan nella Leaderboard. Il motore ricalcola la formula quantitativa e, se i filtri hanno aumentato la robustezza OOS, diventerà la <strong className="text-white">#1 Strategia Consigliata</strong>!
                </p>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-800/40 flex items-center justify-between gap-3 text-[11px] text-slate-300">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>
                  <strong>Punteggio Attuale Titan Lab:</strong> Score di Robustezza: <span className="text-cyan-300 font-bold font-mono">{backtestResult?.metrics.score || 0}/100</span> &bull; OOS Return: <span className="text-emerald-400 font-bold font-mono">+{backtestResult?.metrics.oosReturnPct || 0}%</span> &bull; Max DD: <span className="text-rose-400 font-bold font-mono">-{backtestResult?.metrics.maxDrawdownPct || 0}%</span>
                </span>
              </div>
              {onNavigateToLeaderboard && (
                <button
                  onClick={onNavigateToLeaderboard}
                  className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold transition-colors shrink-0 text-xs"
                >
                  Vedi Classifica Globale &rarr;
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Preset Archetipi di Mercato Unger */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <Sliders className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <div className="text-xs font-bold text-white flex items-center gap-1.5">
              <span>Archetipi di Mercato Unger (Setup Preconfigurati per {instrument.ticker})</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800 font-mono">
                1-Click Preset
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Le azioni singole rispondono meglio al Mean Reverting, mentre indici e materie prime premiano il Trend Breakout.
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => applyPreset('EQUITY_MEAN_REVERSION')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              triggerType === 'BOLLINGER_REVERSAL'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
            title="Ideale per titoli azionari (Enel, Intesa, ENI): compra eccessi ribassisti con Trend SMA200 rialzista"
          >
            ⚡ Azionario Mean Reverting
          </button>
          <button
            onClick={() => applyPreset('FUTURES_TREND')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              triggerType === 'DONCHIAN_BREAKOUT'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
            title="Ideale per indici e futures: breakout canali Donchian con Stop-on-Quote e filtro espansione ATR"
          >
            📈 Futures Trend Breakout
          </button>
          <button
            onClick={() => applyPreset('BIAS_SEASONALITY')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              triggerType === 'DAY_OF_WEEK_BIAS'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800'
            }`}
            title="Exploita bias statistici settimanali e stagionali non overfittati"
          >
            🗓️ Bias & Stagionalità
          </button>
        </div>
      </div>

      {/* Main Grid: 2 Columns (Config Left, Metrics & Chart Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: 3-Step Strategy Builder Config (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* STEP 1: Core Trigger Selection */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center border border-cyan-500/30">
                  1
                </span>
                <h3 className="text-sm font-bold text-white">Motore di Base (Core Trigger)</h3>
              </div>
              <span className="text-[11px] text-slate-400">Regola non overfittata</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => setTriggerType('DONCHIAN_BREAKOUT')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  triggerType === 'DONCHIAN_BREAKOUT'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                <div className="text-xs font-bold">Donchian Breakout</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Rottura Max/Min a N barre</div>
              </button>

              <button
                onClick={() => setTriggerType('PRIOR_DAY_BREAKOUT')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  triggerType === 'PRIOR_DAY_BREAKOUT'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                <div className="text-xs font-bold">Prior Day Breakout</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Breakout sessione precedente</div>
              </button>

              <button
                onClick={() => setTriggerType('BOLLINGER_REVERSAL')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  triggerType === 'BOLLINGER_REVERSAL'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                <div className="text-xs font-bold">Bollinger Reversal</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Mean Reverting da estremi</div>
              </button>

              <button
                onClick={() => setTriggerType('SUPER_TREND')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  triggerType === 'SUPER_TREND'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                <div className="text-xs font-bold">SuperTrend Follower</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Trend momentum ATR</div>
              </button>

              <button
                onClick={() => setTriggerType('EMA_CROSSOVER')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  triggerType === 'EMA_CROSSOVER'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                <div className="text-xs font-bold">EMA Crossover</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Incrocio medie veloci/lente</div>
              </button>

              <button
                onClick={() => setTriggerType('DAY_OF_WEEK_BIAS')}
                className={`p-2.5 rounded-lg border text-left transition-all ${
                  triggerType === 'DAY_OF_WEEK_BIAS'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/40'
                }`}
              >
                <div className="text-xs font-bold">Bias Settimanale</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Stagionalità su giorno fisso</div>
              </button>
            </div>

            {/* Core Trigger Params Slider */}
            {triggerType === 'DONCHIAN_BREAKOUT' && (
              <div className="pt-2 border-t border-slate-800/80">
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Periodo Canale Donchian:</span>
                  <span className="font-bold text-cyan-400">{donchianPeriod} barre</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={60}
                  step={1}
                  value={donchianPeriod}
                  onChange={(e) => setDonchianPeriod(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>
            )}

            {triggerType === 'BOLLINGER_REVERSAL' && (
              <div className="pt-2 border-t border-slate-800/80">
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Periodo Bande Bollinger:</span>
                  <span className="font-bold text-cyan-400">{bbPeriod} periodi</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={40}
                  step={2}
                  value={bbPeriod}
                  onChange={(e) => setBbPeriod(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                />
              </div>
            )}
          </div>

          {/* STEP 2: Unger Filter Matrix */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-bold flex items-center justify-center border border-indigo-500/30">
                  2
                </span>
                <h3 className="text-sm font-bold text-white">Matrice Filtri Unger (Regime Filters)</h3>
              </div>
              <span className="text-[11px] text-slate-400">Elimina i falsi segnali</span>
            </div>

            {/* Filter A: Trend / SMA 200 */}
            <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.trendFilterEnabled}
                    onChange={(e) => setFilters((p) => ({ ...p, trendFilterEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                  />
                  Filtro Trend di Fondo (SMA {filters.trendFilterPeriod})
                </label>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                  {filters.trendFilterEnabled ? 'ATTIVO' : 'OFF'}
                </span>
              </div>
              {filters.trendFilterEnabled && (
                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400">Periodo SMA:</span>
                    <input
                      type="number"
                      value={filters.trendFilterPeriod}
                      onChange={(e) => setFilters((p) => ({ ...p, trendFilterPeriod: Number(e.target.value) }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400">Condizione:</span>
                    <select
                      value={filters.trendFilterMode || 'ABOVE_SMA'}
                      onChange={(e) => setFilters((p) => ({ ...p, trendFilterMode: e.target.value as any }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                    >
                      <option value="ABOVE_SMA">Prezzo &gt; SMA</option>
                      <option value="SMA_SLOPE_UP">Pendenza SMA Crescente</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Filter B: Volatility Filter */}
            <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.volatilityFilterEnabled}
                    onChange={(e) => setFilters((p) => ({ ...p, volatilityFilterEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                  />
                  Filtro Volatilità di Regime (ATR {filters.atrPeriod})
                </label>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                  {filters.volatilityFilterEnabled ? 'ATTIVO' : 'OFF'}
                </span>
              </div>
              {filters.volatilityFilterEnabled && (
                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400">Regime Volatilità:</span>
                    <select
                      value={filters.volatilityFilterMode || 'EXPANSION'}
                      onChange={(e) => setFilters((p) => ({ ...p, volatilityFilterMode: e.target.value as any }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                    >
                      <option value="EXPANSION">Espansione (ATR &gt; Media)</option>
                      <option value="COMPRESSION">Compressione (ATR &lt; Media)</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400">Media ATR Periodi:</span>
                    <input
                      type="number"
                      value={filters.atrSmaPeriod}
                      onChange={(e) => setFilters((p) => ({ ...p, atrSmaPeriod: Number(e.target.value) }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Filter C: Time Window Filter */}
            <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.timeWindowFilterEnabled}
                    onChange={(e) => setFilters((p) => ({ ...p, timeWindowFilterEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                  />
                  Finestra Oraria Intraday
                </label>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                  {filters.timeWindowFilterEnabled ? 'ATTIVO' : 'OFF'}
                </span>
              </div>
              {filters.timeWindowFilterEnabled && (
                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400">Ora Inizio:</span>
                    <input
                      type="text"
                      defaultValue={`${filters.sessionStartHour}:00`}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                      disabled
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400">Ora Fine:</span>
                    <input
                      type="text"
                      defaultValue={`${filters.sessionEndHour}:30`}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                      disabled
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Filter D: Day of Week */}
            <div className="p-3 bg-slate-950/40 rounded-lg border border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.dayOfWeekFilterEnabled}
                    onChange={(e) => setFilters((p) => ({ ...p, dayOfWeekFilterEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-cyan-500 focus:ring-0"
                  />
                  Filtro Giorni della Settimana
                </label>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                  {filters.dayOfWeekFilterEnabled ? 'ATTIVO' : 'TUTTI'}
                </span>
              </div>
              {filters.dayOfWeekFilterEnabled && (
                <div className="flex items-center gap-1.5 pt-1">
                  {dayLabels.map((d) => (
                    <button
                      key={d.num}
                      onClick={() => toggleDayOfWeek(d.num)}
                      className={`flex-1 py-1 text-xs font-bold rounded border transition-colors ${
                        filters.allowedDays.includes(d.num)
                          ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                          : 'bg-slate-900 border-slate-800 text-slate-500'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* STEP 3: Unger Exits & Risk Management */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center justify-center border border-emerald-500/30">
                  3
                </span>
                <h3 className="text-sm font-bold text-white">Gestione Uscite & Money Management</h3>
              </div>
              <span className="text-[11px] text-slate-400">Protezione e presa profitto</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] text-slate-400">Stop Loss (ATR Mult):</span>
                <input
                  type="number"
                  step="0.2"
                  value={exits.stopLossValue}
                  onChange={(e) => setExits((p) => ({ ...p, stopLossValue: Number(e.target.value) }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white mt-1"
                />
              </div>

              <div>
                <span className="text-[10px] text-slate-400">Take Profit (ATR Mult):</span>
                <input
                  type="number"
                  step="0.5"
                  value={exits.takeProfitValue}
                  onChange={(e) => setExits((p) => ({ ...p, takeProfitValue: Number(e.target.value) }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white mt-1"
                />
              </div>

              <div>
                <span className="text-[10px] text-slate-400">Uscita a Tempo (Barre):</span>
                <input
                  type="number"
                  value={exits.timeExitBars}
                  onChange={(e) => setExits((p) => ({ ...p, timeExitBars: Number(e.target.value) }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white mt-1"
                />
              </div>

              <div>
                <span className="text-[10px] text-slate-400">Trailing Stop (%):</span>
                <input
                  type="number"
                  step="0.5"
                  value={exits.trailingStopPct}
                  onChange={(e) => setExits((p) => ({ ...p, trailingStopPct: Number(e.target.value) }))}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white mt-1"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Titan Diagnostics, Metrics & Equity Curve (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Titan Robustness & Overfitting Score Banner */}
          {titanReport && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                      Titan Robustness & Overfitting Diagnostic
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400">
                    {titanReport.verdictExplanation}
                  </p>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Titan Score</div>
                    <div
                      className={`text-2xl font-black ${
                        titanReport.titanScore >= 80
                          ? 'text-emerald-400'
                          : titanReport.titanScore >= 65
                          ? 'text-cyan-400'
                          : titanReport.titanScore >= 50
                          ? 'text-amber-400'
                          : 'text-red-400'
                      }`}
                    >
                      {titanReport.titanScore}/100
                    </div>
                  </div>
                </div>
              </div>

              {/* 4 Core Quantitative Titan Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 font-medium">Average Trade (€ / %)</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    +{titanReport.averageTradePct}%
                  </div>
                  <div className="text-[10px] text-emerald-400 font-medium mt-0.5">
                    €{titanReport.averageTradeAmount} / trade
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 font-medium">Efficienza OOS</div>
                  <div className="text-sm font-bold text-cyan-300 mt-0.5">
                    {titanReport.oosEfficiencyPct}%
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                    Vs periodo In-Sample
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 font-medium">Profit Factor</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    {titanReport.profitFactor}
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                    Recovery: {titanReport.recoveryFactor}x
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div className="text-[10px] text-slate-400 font-medium">Monte Carlo DD (95%)</div>
                  <div className="text-sm font-bold text-amber-400 mt-0.5">
                    -{titanReport.monteCarloMaxDrawdown95Pct}%
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                    Worst-case scenario
                  </div>
                </div>
              </div>

              {/* Unger Titan Verification Checklist */}
              <div className="space-y-2 pt-2 border-t border-slate-800/60">
                <div className="text-xs font-bold text-slate-300">
                  Checklist di Validazione Metodo Unger™:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {titanReport.checklist.map((item, idx) => (
                    <div
                      key={idx}
                      className={`p-2 rounded-lg border flex items-center justify-between ${
                        item.passed
                          ? 'bg-emerald-950/20 border-emerald-800/40 text-slate-200'
                          : 'bg-red-950/20 border-red-800/40 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {item.passed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        )}
                        <span className="text-[11px] font-medium line-clamp-1">{item.rule}</span>
                      </div>
                      <span className="text-[11px] font-bold text-slate-100 flex-shrink-0">
                        {item.valueStr}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Equity & Drawdown Chart Section */}
          {backtestResult && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setChartTab('TITAN_ECT')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                      chartTab === 'TITAN_ECT'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Titan ECT (Filtro Slump)</span>
                  </button>
                  <button
                    onClick={() => setChartTab('EQUITY')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      chartTab === 'EQUITY'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Curva Equity Grezza
                  </button>
                  <button
                    onClick={() => setChartTab('DRAWDOWN')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      chartTab === 'DRAWDOWN'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Underwater Drawdown
                  </button>
                </div>

                <div className="text-xs text-slate-400 font-mono">
                  Capitale Iniziale: €10.000 &bull; Net PnL: <span className="text-emerald-400 font-bold">€{(10000 + backtestResult.metrics.totalPnlAmount).toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {chartTab === 'TITAN_ECT' && (
                <div className="space-y-4">
                  {/* Titan ECT Comparison KPI Grid */}
                  {backtestResult.titanEct && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 rounded-xl bg-slate-950/80 border border-emerald-500/30">
                      <div>
                        <div className="text-[10px] text-slate-400 font-medium uppercase">Drawdown Grezzo &rarr; Titan ECT</div>
                        <div className="text-xs font-bold text-white mt-1 flex items-baseline gap-1.5">
                          <span className="text-rose-400 line-through">-{backtestResult.titanEct.rawMaxDrawdownPct.toFixed(1)}%</span>
                          <span className="text-emerald-400 text-sm font-black">-{backtestResult.titanEct.titanMaxDrawdownPct.toFixed(1)}%</span>
                        </div>
                        <div className="text-[10px] text-emerald-400 font-bold mt-0.5">
                          Taglio DD: {backtestResult.titanEct.drawdownReductionPct.toFixed(0)}%
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-slate-400 font-medium uppercase">Profit Factor Migliorato</div>
                        <div className="text-xs font-bold text-white mt-1 flex items-baseline gap-1.5">
                          <span className="text-slate-400">{backtestResult.titanEct.rawProfitFactor.toFixed(2)}</span>
                          <span className="text-cyan-300 text-sm font-black">&rarr; {backtestResult.titanEct.titanProfitFactor.toFixed(2)}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Filtro trade in perdita
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-slate-400 font-medium uppercase">Trade in Slump Evitati</div>
                        <div className="text-sm font-bold text-amber-400 mt-1">
                          {backtestResult.titanEct.tradesAvoidedCount} operazioni
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Filtro SMA Equity {backtestResult.titanEct.ectWindowTrades} trade
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-slate-400 font-medium uppercase">Operatività a Regime</div>
                        <div className="text-sm font-bold text-emerald-300 mt-1">
                          {backtestResult.titanEct.activeTradeRatioPct.toFixed(0)}% attiva
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Solo durante fasi sane
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="h-[340px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={backtestResult.equityCurve} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="dateStr" stroke="#64748b" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={['auto', 'auto']} tickFormatter={(v) => `€${v.toLocaleString()}`} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                          formatter={(value: any, name: any) => [`€${Number(value).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`, name]}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                        <Line
                          type="monotone"
                          dataKey="titanEctEquity"
                          name="Equity Titan ECT (Protetto)"
                          stroke="#10b981"
                          strokeWidth={2.8}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="equity"
                          name="Equity Grezza Strategia"
                          stroke="#06b6d4"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="titanEctSma"
                          name="Media Mobile Equity (Soglia Slump)"
                          stroke="#f59e0b"
                          strokeWidth={1.5}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="benchmarkEquity"
                          name={`Buy & Hold ${instrument.ticker}`}
                          stroke="#64748b"
                          strokeWidth={1}
                          strokeDasharray="2 2"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                    <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Principio Titan ECT:</strong> La linea verde rappresenta l'equity effettiva quando il sistema va in standby (zero posizioni a rischio) ogni volta che l'equity grezza rompe al ribasso la sua media mobile a 8 trade. Questo disattiva la strategia durante le fasi di mercato ostili, tagliando il drawdown peggiore!
                    </span>
                  </div>
                </div>
              )}

              {chartTab === 'EQUITY' && (
                <div className="h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={backtestResult.equityCurve} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="dateStr" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={['auto', 'auto']} tickFormatter={(v) => `€${v.toLocaleString()}`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                        formatter={(value: any) => [`€${Number(value).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`, '']}
                      />
                      <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                      <Line
                        type="monotone"
                        dataKey="equity"
                        name="Equity Titan Unger"
                        stroke="#06b6d4"
                        strokeWidth={2.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="benchmarkEquity"
                        name={`Buy & Hold ${instrument.ticker}`}
                        stroke="#64748b"
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {chartTab === 'DRAWDOWN' && (
                <div className="h-[340px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={backtestResult.equityCurve} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="dateStr" stroke="#64748b" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={['auto', 0]} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                        formatter={(value: any) => [`${Number(value).toFixed(2)}%`, 'Drawdown']}
                      />
                      <Area
                        type="monotone"
                        dataKey="drawdownPct"
                        name="Drawdown %"
                        stroke="#f43f5e"
                        fill="#f43f5e"
                        fillOpacity={0.25}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Detailed Trade Blotter with open/closed positions and execution logs */}
          {backtestResult && (
            <BacktestTradeBlotter
              result={backtestResult}
              instrument={instrument}
              title={`Elenco Completo Posizioni Aperte nel Backtest Titan (${backtestResult.trades.length} trade)`}
            />
          )}
        </div>
      </div>

      {/* Trigger & Condition Inspector Modal */}
      {showTriggerInspector && (
        <StrategyTriggerInspectorModal
          key={`${instrument.id}-${timeframe}`}
          isOpen={showTriggerInspector}
          onClose={() => setShowTriggerInspector(false)}
          instrument={instrument}
          strategyId="unger_titan"
          strategyName="Titan Strategy Lab"
          strategyParams={currentParams}
          historicalBars={effectiveBars}
        />
      )}
    </div>
  );
};
