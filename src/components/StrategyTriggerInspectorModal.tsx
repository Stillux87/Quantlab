/**
 * QuantLab - Strategy Trigger & Entry Condition Inspector Modal
 * Displays an interactive price & trigger chart with real-time condition checklist
 * and pedagogical explanations for what algorithmic strategies are waiting for.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts';
import {
  X,
  Clock,
  ShieldCheck,
  AlertCircle,
  TrendingUp,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Activity,
  Sparkles,
  Info,
  ArrowRight,
  BarChart3,
  Target,
  Flame,
  HelpCircle,
} from 'lucide-react';
import { Instrument, Bar } from '../types';
import {
  analyzeStrategyWaitingConditions,
  StrategyTriggerAnalysis,
} from '../services/strategyConditionAnalyzer';
import { fetchRealHistoricalBars } from '../services/marketDataService';

interface StrategyTriggerInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  instrument: Instrument;
  strategyId?: string;
  strategyName?: string;
  strategyParams?: Record<string, any>;
  historicalBars?: Bar[];
  hasOpenPosition?: boolean;
  allocatedCapital?: number;
}

export const StrategyTriggerInspectorModal: React.FC<StrategyTriggerInspectorModalProps> = ({
  isOpen,
  onClose,
  instrument,
  strategyId = 'unger_titan_strategy',
  strategyName = 'Metodo Unger™ Titan Lab',
  strategyParams = {},
  historicalBars: passedBars,
  hasOpenPosition = false,
  allocatedCapital = 10000,
}) => {
  // Helper to verify if bars actually belong to this instrument
  const isBarsMatchingInstrument = (bList?: Bar[]) => {
    if (!bList || bList.length < 5) return false;
    const lastBar = bList[bList.length - 1];
    if (!lastBar || !instrument.currentPrice) return false;
    const diff = Math.abs(lastBar.close - instrument.currentPrice) / instrument.currentPrice;
    return diff < 0.25;
  };

  const validPassedBars = isBarsMatchingInstrument(passedBars) ? passedBars : undefined;

  // Initialize with passed bars or empty while loading real market data
  const [loadedBars, setLoadedBars] = useState<Bar[]>(() =>
    validPassedBars && validPassedBars.length > 5 ? validPassedBars : (passedBars || [])
  );
  const [isLoadingRealBars, setIsLoadingRealBars] = useState<boolean>(false);
  const [simulatedPriceOffsetPct, setSimulatedPriceOffsetPct] = useState<number>(0);
  const [chartViewMode, setChartViewMode] = useState<'ALL_LEVELS' | 'PRICE_ONLY' | 'TRIGGER_ONLY'>('ALL_LEVELS');

  // Sync real bars whenever instrument or modal opens
  useEffect(() => {
    if (validPassedBars && validPassedBars.length > 5) {
      setLoadedBars(validPassedBars);
      return;
    }

    let mounted = true;
    const load = async () => {
      setIsLoadingRealBars(true);
      try {
        const res = await fetchRealHistoricalBars(instrument, '1D');
        if (mounted && res.bars && res.bars.length > 5) {
          setLoadedBars(res.bars);
        }
      } catch (err) {
        console.warn('[StrategyTriggerInspector] Failed to load real bars:', err);
      } finally {
        if (mounted) {
          setIsLoadingRealBars(false);
        }
      }
    };

    if (isOpen) {
      load();
    }
    return () => {
      mounted = false;
    };
  }, [isOpen, instrument.id, instrument.ticker, instrument.currentPrice, validPassedBars]);

  // Compute live analysis
  const effectiveBars = validPassedBars && validPassedBars.length > 5 ? validPassedBars : loadedBars;
  const analysis: StrategyTriggerAnalysis = useMemo(() => {
    return analyzeStrategyWaitingConditions(
      instrument,
      strategyId,
      strategyName,
      strategyParams,
      effectiveBars,
      hasOpenPosition
    );
  }, [instrument, strategyId, strategyName, strategyParams, effectiveBars, hasOpenPosition]);

  // Lock body scroll and handle Escape key
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

  const curr = analysis.currencySymbol || instrument.currencySymbol || (instrument.currency === 'USD' ? '$' : instrument.currency === 'GBP' ? '£' : '€');
  const currentPrice = analysis.currentPrice;
  const triggerLevel = analysis.triggerLevelLong ?? currentPrice;
  const calcDistEur = Math.abs(triggerLevel - currentPrice);
  const calcDistPct = currentPrice > 0 ? (calcDistEur / currentPrice) * 100 : 0;
  const distPct = analysis.distanceToLongTriggerPct !== undefined ? analysis.distanceToLongTriggerPct : parseFloat(calcDistPct.toFixed(2));
  const distEur = analysis.distanceToLongTriggerEur !== undefined ? analysis.distanceToLongTriggerEur : parseFloat(calcDistEur.toFixed(2));

  // Simulated test price calculation
  const simPrice = currentPrice * (1 + simulatedPriceOffsetPct / 100);
  const isSimTriggered = simPrice >= triggerLevel;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md overflow-y-auto animate-in fade-in-0 duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto border-cyan-500/30">
        {/* Modal Top Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 bg-slate-950/80 flex items-start justify-between gap-4 sticky top-0 z-20">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono font-bold text-xs">
                {instrument.ticker} &bull; {instrument.name}
              </span>
              <span className="px-2.5 py-0.5 rounded-lg bg-indigo-950 text-indigo-300 text-xs font-semibold border border-indigo-800/40">
                {analysis.strategyName}
              </span>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-xs">
                Prezzo Attuale: <strong className="text-white">{curr}{currentPrice.toFixed(2)}</strong>
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
              <Target className="w-6 h-6 text-cyan-400" />
              <span>Radar Condizioni d'Ingresso & Stato Attesa</span>
            </h2>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            title="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto">
          {/* Status Alert Banner */}
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
              analysis.overallStatus === 'READY_TO_ENTER'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : analysis.overallStatus === 'BLOCKED_BY_FILTER'
                ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
                : analysis.overallStatus === 'IN_POSITION'
                ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-950/70 border-cyan-500/40 text-slate-200'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                  analysis.overallStatus === 'READY_TO_ENTER'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : analysis.overallStatus === 'BLOCKED_BY_FILTER'
                    ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-cyan-500/20 text-cyan-400'
                }`}
              >
                {analysis.overallStatus === 'READY_TO_ENTER' ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : analysis.overallStatus === 'BLOCKED_BY_FILTER' ? (
                  <AlertTriangle className="w-5 h-5" />
                ) : (
                  <Clock className="w-5 h-5" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="text-sm font-bold flex items-center gap-2">
                  <span>{analysis.overallStatusTitle}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 font-mono font-bold">
                    {distPct > 0 ? `Distanza: +${distPct.toFixed(2)}%` : 'Pronto'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {analysis.overallStatusDescription}
                </p>
              </div>
            </div>

            <div className="bg-slate-900/90 px-3.5 py-2 rounded-xl border border-slate-800 text-right shrink-0 w-full sm:w-auto">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Livello Trigger Long</div>
              <div className="text-base font-mono font-black text-cyan-300">
                {curr}{triggerLevel.toFixed(2)}
              </div>
              <div className="text-[10px] text-slate-400 font-mono">
                {distPct > 0 ? `+${curr}${distEur.toFixed(2)} (+${distPct.toFixed(1)}%)` : 'Raggiunto'}
              </div>
            </div>
          </div>

          {/* Section 1: Pedagogical Explanation: Why No Trade Was Opened Today */}
          <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40 p-5 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>Perché nessuna posizione è stata aperta durante la giornata?</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              {analysis.humanExplanation}
            </p>
            <div className="flex items-start gap-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <p>
                <strong className="text-slate-200">Disciplina Metodo Unger:</strong> Un trader quantitativo non forza mai gli ingressi e resta in liquidità per oltre il 65% del tempo. Questo comportamento protegge il tuo capitale dai falsi rimbalzi e dalle giornate piatte, intervenendo solo quando la probabilità a favore è statisticamente elevata.
              </p>
            </div>
          </div>

          {/* Section 2: Interactive Price & Trigger Overlay Chart */}
          <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-cyan-400" />
                  Grafico Prezzo con Livello Trigger & Stop Loss
                </h3>
                <p className="text-[11px] text-slate-400">
                  Visualizzazione delle ultime candele storiche con le soglie matematiche monitorate dall'algoritmo.
                </p>
              </div>

              {/* Chart Mode Selector */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setChartViewMode('ALL_LEVELS')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    chartViewMode === 'ALL_LEVELS'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Tutti i Livelli
                </button>
                <button
                  onClick={() => setChartViewMode('TRIGGER_ONLY')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    chartViewMode === 'TRIGGER_ONLY'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Solo Trigger
                </button>
              </div>
            </div>

            {/* Recharts Line with Thresholds */}
            <div className="h-64 sm:h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analysis.chartBars} margin={{ top: 10, right: 15, left: 15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="dateStr" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fontSize: 10 }}
                    domain={['auto', 'auto']}
                    tickFormatter={(v) => `${curr}${v.toFixed(2)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#020617',
                      borderColor: '#334155',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                    formatter={(value: any, name: any) => [`${curr}${Number(value).toFixed(2)}`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />

                  {/* Price Close Line */}
                  <Line
                    type="monotone"
                    dataKey="close"
                    name={`Prezzo ${instrument.ticker}`}
                    stroke="#38bdf8"
                    strokeWidth={2.5}
                    dot={{ r: 2, fill: '#38bdf8' }}
                  />

                  {/* Trigger Level Line */}
                  {(chartViewMode === 'ALL_LEVELS' || chartViewMode === 'TRIGGER_ONLY') && (
                    <Line
                      type="monotone"
                      dataKey="triggerLevel"
                      name={`Trigger Long (${curr}${triggerLevel.toFixed(2)})`}
                      stroke="#06b6d4"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  )}

                  {/* Trend Filter SMA */}
                  {chartViewMode === 'ALL_LEVELS' && analysis.trendFilterLevel && (
                    <Line
                      type="monotone"
                      dataKey="trendFilterLevel"
                      name={`Filtro SMA 200 (${curr}${analysis.trendFilterLevel.toFixed(2)})`}
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      strokeDasharray="2 2"
                      dot={false}
                    />
                  )}

                  {/* Planned Stop Loss */}
                  {chartViewMode === 'ALL_LEVELS' && analysis.plannedStopLoss && (
                    <Line
                      type="monotone"
                      dataKey="stopLossLevel"
                      name={`Stop Loss Pianificato (${curr}${analysis.plannedStopLoss.toFixed(2)})`}
                      stroke="#f43f5e"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                      dot={false}
                    />
                  )}

                  {/* Planned Take Profit */}
                  {chartViewMode === 'ALL_LEVELS' && analysis.plannedTakeProfit && (
                    <Line
                      type="monotone"
                      dataKey="takeProfitLevel"
                      name={`Take Profit Target (${curr}${analysis.plannedTakeProfit.toFixed(2)})`}
                      stroke="#10b981"
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Quick Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Prezzo Attuale</div>
                <div className="text-sm sm:text-base font-mono font-black text-white mt-0.5">
                  {curr}{currentPrice.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500">Chiusura ultima barra</div>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Soglia di Breakout</div>
                <div className="text-sm sm:text-base font-mono font-black text-cyan-300 mt-0.5">
                  {curr}{triggerLevel.toFixed(2)}
                </div>
                <div className="text-[10px] text-cyan-400/80 font-mono">
                  {distPct > 0 ? `+${distPct.toFixed(2)}% mancante` : 'Attivo'}
                </div>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Stop Loss Protettivo</div>
                <div className="text-sm sm:text-base font-mono font-black text-rose-400 mt-0.5">
                  {curr}{analysis.plannedStopLoss?.toFixed(2) || (currentPrice * 0.98).toFixed(2)}
                </div>
                <div className="text-[10px] text-rose-400/80 font-mono">
                  -{(currentPrice > 0 ? (((currentPrice - (analysis.plannedStopLoss || currentPrice * 0.98)) / currentPrice) * 100).toFixed(1) : '2.0')}%
                </div>
              </div>

              <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-bold">Take Profit Target</div>
                <div className="text-sm sm:text-base font-mono font-black text-emerald-400 mt-0.5">
                  {curr}{analysis.plannedTakeProfit?.toFixed(2) || (currentPrice * 1.05).toFixed(2)}
                </div>
                <div className="text-[10px] text-emerald-400/80 font-mono">
                  +{(currentPrice > 0 ? ((((analysis.plannedTakeProfit || currentPrice * 1.05) - currentPrice) / currentPrice) * 100).toFixed(1) : '5.0')}%
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Live Condition Checklist & Semaforo Matrix */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Matrice delle Condizioni & Semaforo di Ingresso
              </h3>
              <span className="text-xs text-slate-400 font-mono">
                {analysis.conditions.filter((c) => c.status === 'SATISFIED').length}/{analysis.conditions.length} Verificate
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {analysis.conditions.map((cond) => (
                <div
                  key={cond.id}
                  className={`p-4 rounded-2xl border transition-all space-y-2 ${
                    cond.status === 'SATISFIED'
                      ? 'bg-emerald-950/20 border-emerald-800/40'
                      : cond.status === 'BLOCKED'
                      ? 'bg-rose-950/20 border-rose-800/40'
                      : 'bg-slate-950/70 border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs shrink-0 ${
                          cond.status === 'SATISFIED'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : cond.status === 'BLOCKED'
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {cond.status === 'SATISFIED' ? '✓' : cond.status === 'BLOCKED' ? '✕' : '⏳'}
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-white">{cond.name}</h4>
                        <p className="text-[10px] text-slate-400">{cond.category}</p>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        cond.status === 'SATISFIED'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                          : cond.status === 'BLOCKED'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
                          : 'bg-amber-950 text-amber-300 border border-amber-800/60'
                      }`}
                    >
                      {cond.status === 'SATISFIED'
                        ? 'Soddisfatta'
                        : cond.status === 'BLOCKED'
                        ? 'Filtro Bloccante'
                        : 'In Attesa'}
                    </span>
                  </div>

                  <div className="bg-slate-900/80 p-2.5 rounded-xl text-xs space-y-1 font-mono">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Valore Attuale:</span>
                      <span className="text-slate-200 font-bold">{cond.currentValueText}</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Soglia Richiesta:</span>
                      <span className="text-cyan-300 font-bold">{cond.requiredValueText}</span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-snug">
                    {cond.explanation}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Interactive Breakout Simulator ("E se il prezzo sale a X?") */}
          <div className="bg-slate-950 p-5 rounded-2xl border border-cyan-800/40 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-cyan-300 flex items-center gap-1.5 uppercase tracking-wider">
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Simulatore Interattivo: "Cosa Succede al Raggiungimento del Trigger?"</span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Muovi lo slider per simulare una variazione di prezzo intraday e vedere come risponde l'algoritmo.
                </p>
              </div>

              <span className="text-xs font-mono font-bold text-white bg-slate-900 px-3 py-1 rounded-lg border border-slate-800">
                Prezzo Simulato: {curr}{simPrice.toFixed(2)} ({simulatedPriceOffsetPct >= 0 ? '+' : ''}{simulatedPriceOffsetPct.toFixed(1)}%)
              </span>
            </div>

            <div className="space-y-2">
              <input
                type="range"
                min="-5"
                max="8"
                step="0.2"
                value={simulatedPriceOffsetPct}
                onChange={(e) => setSimulatedPriceOffsetPct(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>-5.0% (Discesa)</span>
                <span className="text-slate-400 font-bold">0.0% (Prezzo Reale {curr}{currentPrice.toFixed(2)})</span>
                <span className="text-cyan-400 font-bold">+{(distPct || 2).toFixed(1)}% (Soglia Breakout {curr}{triggerLevel.toFixed(2)})</span>
                <span>+8.0% (Rally)</span>
              </div>
            </div>

            {/* Simulation Result Box */}
            <div
              className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                isSimTriggered
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-3 h-3 rounded-full shrink-0 ${
                    isSimTriggered ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'
                  }`}
                />
                <div>
                  <strong className="text-white block">
                    {isSimTriggered ? '🚀 SEGNALE D\'ACQUISTO GENERATO!' : '⏳ STRATEGIA ANCORA IN ATTESA'}
                  </strong>
                  <span className="text-[11px] text-slate-300">
                    {isSimTriggered
                      ? `Al prezzo simulato di ${curr}${simPrice.toFixed(2)}, la rottura di ${curr}${triggerLevel.toFixed(2)} è confermata! L'engine acquisterebbe ~${Math.floor(allocatedCapital / Math.max(0.01, simPrice))} quote con Stop Loss a ${curr}${(simPrice * 0.98).toFixed(2)}.`
                      : `A ${curr}${simPrice.toFixed(2)}, il prezzo è ancora sotto la soglia di ${curr}${triggerLevel.toFixed(2)}. Nessun ordine inviato.`}
                  </span>
                </div>
              </div>

              {simulatedPriceOffsetPct !== 0 && (
                <button
                  onClick={() => setSimulatedPriceOffsetPct(0)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono cursor-pointer shrink-0"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            Monitoraggio attivo su dati reali &bull; Aggiornamento automatico ad ogni nuova barra
          </div>
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
          >
            Ho Capito, Chiudi
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
