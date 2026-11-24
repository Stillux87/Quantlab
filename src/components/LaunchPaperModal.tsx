/**
 * QuantLab - Step 10: Launch Paper Trading Configuration Modal
 */
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Play,
  Shield,
  Coins,
  Percent,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  TrendingDown,
  Info,
} from 'lucide-react';
import { BacktestResult, Instrument, Timeframe, EntryIntervalStats } from '../types';
import { calculateEntryDistribution } from '../services/entryDistributionService';
import { backtestRegistryService } from '../services/backtestRegistryService';

interface LaunchPaperModalProps {
  result: BacktestResult;
  isOpen: boolean;
  onClose: () => void;
  onConfirmLaunch: (config: {
    strategyId: string;
    strategyName: string;
    instrument: Instrument;
    timeframe: Timeframe;
    params: Record<string, number | boolean | string>;
    initialCapital: number;
    riskPerTradePct: number;
    commissionPct: number;
    slippagePct: number;
    backtestId?: string;
    entryDistribution?: EntryIntervalStats;
    backtestReference: {
      backtestId?: string;
      metrics: BacktestResult['metrics'];
      score: number;
      entryDistribution?: EntryIntervalStats;
      startDate?: string;
      endDate?: string;
    };
  }) => void;
}

export const LaunchPaperModal: React.FC<LaunchPaperModalProps> = ({
  result,
  isOpen,
  onClose,
  onConfirmLaunch,
}) => {
  const [capital, setCapital] = useState<number>(10000);
  const [riskPct, setRiskPct] = useState<number>(1.5);
  const [customParams, setCustomParams] = useState<Record<string, number | boolean | string>>({
    ...result.params,
  });

  // Lock body scroll while modal is open and support ESC key to close
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

  const maxMonetaryRisk = ((capital * riskPct) / 100).toFixed(0);

  const handleLaunch = () => {
    // Ensure backtest is registered in central registry with guaranteed id
    const registeredBacktest = backtestRegistryService.register(result);
    const effectiveBacktestId = registeredBacktest.id;

    const distribution =
      result.entryDistribution ||
      calculateEntryDistribution(result.trades || [], result.startDate, result.endDate);

    onConfirmLaunch({
      strategyId: result.strategyId,
      strategyName: result.strategyName,
      instrument: result.instrument,
      timeframe: result.timeframe,
      params: customParams,
      initialCapital: capital,
      riskPerTradePct: riskPct,
      commissionPct: 0.05,
      slippagePct: 0.03,
      backtestId: effectiveBacktestId,
      entryDistribution: distribution,
      backtestReference: {
        backtestId: effectiveBacktestId,
        metrics: result.metrics,
        score: result.metrics.score,
        entryDistribution: distribution,
        startDate: result.startDate,
        endDate: result.endDate,
      },
    });
    onClose();
  };

  const currencySym = result.instrument.currencySymbol || '€';

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/85 backdrop-blur-sm overflow-y-auto animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl sm:rounded-3xl max-w-xl w-full my-auto max-h-[90vh] flex flex-col shadow-2xl relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Sticky Header */}
        <div className="flex items-start justify-between p-5 sm:p-6 pb-4 border-b border-slate-800 shrink-0 bg-slate-900 z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 text-[10px] font-bold border border-emerald-800 uppercase tracking-wider">
                Attivazione Automatica
              </span>
              <span className="text-xs text-slate-400 font-mono">Zero Rischio Reale</span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
              Avvia Strategia in Paper Trading
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi finestra"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="overflow-y-auto flex-1 min-h-0 p-5 sm:p-6 space-y-5 custom-scrollbar overscroll-contain">
          {/* Summary Card */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-sm sm:text-base">{result.strategyName}</span>
              <span className="font-mono font-bold text-cyan-400 text-xs px-2.5 py-0.5 rounded-lg bg-cyan-950/80 border border-cyan-800">
                {result.instrument.ticker} [{result.timeframe}]
              </span>
            </div>

            {/* Validation Period Clarity */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] bg-slate-900/90 px-3 py-2 rounded-lg border border-slate-800 text-slate-300">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                Periodo Backtest Testato:
              </span>
              <span className="font-mono font-bold text-cyan-300">
                {result.startDate.split(' ')[0]} → {result.endDate.split(' ')[0]}
                <span className="text-slate-500 font-normal ml-1">({result.totalBars} barre)</span>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs pt-1">
              <div className="text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-800/60">
                <div className="text-[10px] uppercase text-slate-500 font-semibold">Score</div>
                <div className="text-amber-400 font-mono font-bold mt-0.5">{result.metrics.score}/100</div>
              </div>
              <div className="text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-800/60">
                <div className="text-[10px] uppercase text-slate-500 font-semibold">Profit Factor</div>
                <div className="text-emerald-400 font-mono font-bold mt-0.5">{result.metrics.profitFactor.toFixed(2)}</div>
              </div>
              <div className="text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-800/60">
                <div className="text-[10px] uppercase text-slate-500 font-semibold">Ritorno OOS</div>
                <div className="text-cyan-300 font-mono font-bold mt-0.5">+{result.metrics.oosReturnPct.toFixed(1)}%</div>
              </div>
            </div>
          </div>

          {/* Configuration Parameters */}
          <div className="space-y-5 text-xs">
            {/* Virtual Capital */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs sm:text-sm">
                  <Coins className="w-4 h-4 text-emerald-400" />
                  Capitale Virtuale Iniziale ({currencySym})
                </label>
                <div className="font-mono font-black text-emerald-400 text-sm sm:text-base">
                  {currencySym}{capital.toLocaleString()}
                </div>
              </div>

              {/* Quick Select Buttons */}
              <div className="grid grid-cols-4 gap-2">
                {[2000, 5000, 10000, 25000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setCapital(amt)}
                    className={`py-2 rounded-xl font-mono font-bold border transition-all cursor-pointer text-xs ${
                      capital === amt
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {currencySym}{amt.toLocaleString()}
                  </button>
                ))}
              </div>

              {/* Custom Input */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-slate-400">Importo personalizzato:</span>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono font-bold text-xs">
                    {currencySym}
                  </span>
                  <input
                    type="number"
                    min="500"
                    max="1000000"
                    step="500"
                    value={capital}
                    onChange={(e) => setCapital(Math.max(100, Number(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-1.5 pl-7 pr-3 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Risk per trade & Stop Loss */}
            <div className="space-y-2 pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-200 flex items-center gap-1.5 text-xs sm:text-sm">
                  <Percent className="w-4 h-4 text-cyan-400" />
                  Rischio Max per Operazione (Stop Loss Sizing)
                </label>
                <div className="text-right">
                  <span className="font-mono font-black text-cyan-300 text-sm sm:text-base">{riskPct}%</span>
                  <span className="text-[11px] text-slate-400 font-mono ml-1.5">
                    (max {currencySym}{maxMonetaryRisk})
                  </span>
                </div>
              </div>

              {/* Quick Select Buttons */}
              <div className="grid grid-cols-4 gap-2">
                {[0.5, 1.0, 1.5, 2.5].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setRiskPct(pct)}
                    className={`py-2 rounded-xl font-mono font-bold border transition-all cursor-pointer text-xs ${
                      riskPct === pct
                        ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              {/* Slider / Numeric adjust */}
              <div className="flex items-center gap-3 pt-1">
                <input
                  type="range"
                  min="0.2"
                  max="5.0"
                  step="0.1"
                  value={riskPct}
                  onChange={(e) => setRiskPct(parseFloat(e.target.value))}
                  className="flex-1 accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
                />
                <span className="font-mono font-bold text-cyan-300 text-xs px-2 py-1 rounded bg-slate-950 border border-slate-800 min-w-[50px] text-center">
                  {riskPct.toFixed(1)}%
                </span>
              </div>

              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-1.5">
                <div className="flex items-center gap-1.5 text-cyan-300 font-semibold text-[11px]">
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  Calibrazione Automatica dello Stop Loss:
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Il motore calcola la dimensione delle quote (<span className="text-white font-mono">Position Size</span>) affinché, in caso di esecuzione dello Stop Loss della strategia, la perdita non superi mai{' '}
                  <strong className="text-white font-mono">{currencySym}{maxMonetaryRisk}</strong> ({riskPct}% del capitale corrente).
                </p>
              </div>
            </div>

            {/* Risk rules confirmation */}
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1 text-slate-400">
              <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                Regole di Esecuzione & Frizione:
              </div>
              <div className="text-[11px]">
                &bull; Frizione simulata: commissione 0.05% + slippage 0.03% ad ogni fill.
              </div>
              <div className="text-[11px]">
                &bull; Timeframe operativo bloccato su{' '}
                <strong className="text-slate-200 font-mono">{result.timeframe}</strong> (piena coerenza con il backtest).
              </div>
              <div className="text-[11px] text-blue-300/90 pt-1.5 border-t border-slate-800 flex items-start gap-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Forward Execution:</strong> Il backtest è stato validato sul periodo storico{' '}
                  <strong className="text-white">
                    {result.startDate.split(' ')[0]} → {result.endDate.split(' ')[0]}
                  </strong>
                  . Il Paper Trading opera in avanti in tempo reale dai prezzi odierni confrontandosi continuamente con tale storico (Replication Score nello Step 15).
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer with Action Buttons */}
        <div className="p-4 sm:p-5 bg-slate-900/95 border-t border-slate-800/80 flex items-center justify-end gap-3 shrink-0 rounded-b-2xl sm:rounded-b-3xl z-10 shadow-lg">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer transition-colors"
          >
            Annulla
          </button>

          <button
            id="confirm-launch-paper-btn"
            type="button"
            onClick={handleLaunch}
            className="px-5 sm:px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all hover:scale-[1.02] cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" />
            CONFERMA E AVVIA IN PAPER TRADING
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
};
