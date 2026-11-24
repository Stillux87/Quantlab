/**
 * QuantLab - Step 2: Timeframe Selection & System Recommendation
 */
import React from 'react';
import {
  Clock,
  Sparkles,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Sliders,
  Play,
  Layers,
  BarChart2,
  Trophy,
} from 'lucide-react';
import { Instrument, Timeframe } from '../types';
import {
  analyzeTimeframeSupport,
  getRecommendedTimeframe,
  ALL_TIMEFRAMES,
} from '../services/timeframeRecommender';
import { DateRangeSelector, DateRangeFilter, isRangeOverTwoYears } from './DateRangeSelector';

interface TimeframeSelectorProps {
  selectedInstrument: Instrument;
  selectedTimeframe: Timeframe;
  selectedDateRange: DateRangeFilter;
  onSelectTimeframe: (tf: Timeframe) => void;
  onSelectDateRange: (range: DateRangeFilter) => void;
  onRunBatchBacktest: () => void;
  onNavigateToOptimizer?: () => void;
  isAnalyzing: boolean;
}

export const TimeframeSelector: React.FC<TimeframeSelectorProps> = ({
  selectedInstrument,
  selectedTimeframe,
  selectedDateRange,
  onSelectTimeframe,
  onSelectDateRange,
  onRunBatchBacktest,
  onNavigateToOptimizer,
  isAnalyzing,
}) => {
  const isOverTwoYears = isRangeOverTwoYears(
    selectedDateRange.startDate,
    selectedDateRange.endDate,
    selectedDateRange.presetKey
  );
  const effectiveTf: Timeframe = isOverTwoYears ? '1D' : selectedTimeframe;
  const timeframeInfos = analyzeTimeframeSupport(selectedInstrument, isOverTwoYears);
  const recommendation = getRecommendedTimeframe(selectedInstrument, isOverTwoYears);

  // Auto-sync selected timeframe to 1D if range > 2 years
  React.useEffect(() => {
    if (isOverTwoYears && selectedTimeframe !== '1D') {
      onSelectTimeframe('1D');
    }
  }, [isOverTwoYears, selectedTimeframe, onSelectTimeframe]);

  const selectedInfo =
    timeframeInfos.find((i) => i.timeframe === effectiveTf) ||
    timeframeInfos.find((i) => i.timeframe === '1D') ||
    timeframeInfos[0];
  const isRecommendedSelected = effectiveTf === recommendation.timeframe;

  return (
    <div className="space-y-6">
      {/* Step Header */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 text-xs font-bold border border-cyan-800">
                STEP 2 DI 3
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Scelta del Timeframe & Analisi Rumore di Mercato
              </h2>
            </div>
            <p className="text-slate-400 text-sm max-w-2xl">
              Seleziona il timeframe per il backtest e la successiva esecuzione in paper trading. Il motore quantitativo analizza la volatilità e la liquidità di <span className="font-semibold text-slate-200">{selectedInstrument.ticker}</span> per consigliare la compressione temporale ottimale.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800 self-start md:self-auto">
            <Clock className="w-4 h-4 text-cyan-400" />
            <div className="text-xs">
              <span className="text-slate-400">Strumento:</span>{' '}
              <span className="font-bold text-white font-mono">{selectedInstrument.ticker}</span>
              <span className="text-slate-500 ml-1">({selectedInstrument.type})</span>
            </div>
          </div>
        </div>

        {/* Timeframe Buttons Grid */}
        <div className="mt-6">
          {isOverTwoYears && (
            <div className="mb-4 p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-start gap-2.5 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold text-white">Periodo &gt; 2 Anni Attivo ({selectedDateRange.label}):</span>
                <span className="text-emerald-300 ml-1">
                  Il timeframe è stato impostato automaticamente a <strong>1D (Daily)</strong>. I dati storici intraday reali di borsa sono disponibili fino a 2 anni; per garantire l'uso esclusivo di <strong>dati reali al 100%</strong> ed escludere qualsiasi serie sintetica, l'elaborazione viene eseguita su scala giornaliera.
                </span>
              </div>
            </div>
          )}

          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
            <span>Seleziona Timeframe per il Backtest:</span>
            <span className="text-slate-500 lowercase">utilizzato sia nel backtest sia nel paper trading</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {timeframeInfos.map((info) => {
              const isSelected = selectedTimeframe === info.timeframe;
              const isRec = info.timeframe === recommendation.timeframe;
              const isIntradayLocked = isOverTwoYears && info.timeframe !== '1D';

              return (
                <button
                  key={info.timeframe}
                  id={`tf-btn-${info.timeframe}`}
                  disabled={!info.supported}
                  onClick={() => onSelectTimeframe(info.timeframe)}
                  className={`p-3.5 rounded-xl border flex flex-col items-center justify-center transition-all relative group ${
                    isSelected
                      ? 'bg-gradient-to-b from-cyan-950 to-slate-900 border-cyan-400 shadow-md ring-2 ring-cyan-500/30'
                      : info.supported
                      ? 'bg-slate-950/60 border-slate-800 hover:bg-slate-850 hover:border-slate-700'
                      : 'bg-slate-950/30 border-slate-900 opacity-40 cursor-not-allowed'
                  }`}
                >
                  {isRec && !isOverTwoYears && (
                    <span className="absolute -top-2.5 px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold shadow uppercase tracking-wider">
                      ⭐ Consigliato
                    </span>
                  )}
                  {isOverTwoYears && info.timeframe === '1D' && (
                    <span className="absolute -top-2.5 px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[9px] font-extrabold shadow uppercase tracking-wider">
                      ✓ Dati 100% Reali
                    </span>
                  )}

                  <span className={`text-base font-extrabold font-mono ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                    {info.timeframe}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5">
                    {info.label.split(' ')[0]}
                  </span>

                  {isIntradayLocked ? (
                    <span className="mt-1 text-[9px] text-amber-400/80 font-mono">
                      (Max 2 anni)
                    </span>
                  ) : (
                    <div className="mt-2 text-[10px] flex items-center gap-1 font-mono text-slate-500">
                      <span>~{(info.barCountApprox / 1000).toFixed(0)}k barre</span>
                    </div>
                  )}

                  {/* Noise level pill */}
                  <span
                    className={`mt-1 text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                      info.noiseLevel === 'LOW'
                        ? 'bg-emerald-950 text-emerald-400'
                        : info.noiseLevel === 'MEDIUM'
                        ? 'bg-blue-950 text-blue-400'
                        : 'bg-amber-950 text-amber-400'
                    }`}
                  >
                    Rumore: {info.noiseLevel}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Date Range Selection & Historical Regimes (New Requirement) */}
      <DateRangeSelector
        currentRange={selectedDateRange}
        onChangeRange={onSelectDateRange}
      />

      {/* System Recommendation & Comparison Box (Exact requirement step 2) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recommendation Details Card */}
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                Analisi del Timeframe Consigliato dal Sistema
              </h3>
              <p className="text-xs text-slate-400">
                Valutazione quantitativa per {selectedInstrument.name} ({selectedInstrument.market})
              </p>
            </div>
          </div>

          {/* Comparison statement as requested in prompt */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-2">
              <div className="text-slate-300">
                <span className="text-slate-500 font-medium">Timeframe selezionato: </span>
                <span className="font-mono font-bold text-cyan-400 text-base">{effectiveTf}</span>
              </div>
              <div className="text-slate-300">
                <span className="text-slate-500 font-medium">Timeframe consigliato dal sistema: </span>
                <span className="font-mono font-bold text-amber-400 text-base">{recommendation.timeframe}</span>
              </div>
            </div>

            <div className="text-xs text-slate-300 border-t border-slate-800/80 pt-2 leading-relaxed">
              <span className="font-bold text-amber-400 mr-1">Motivo:</span>
              {recommendation.reason}
            </div>
          </div>

          {/* Timeframe Diagnostics Details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="text-slate-500">Stabilità del Segnale</div>
              <div className="font-mono font-bold text-sm text-slate-200 mt-1">
                {selectedInfo.stabilityScore}/100
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Resistenza a falsi breakout
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="text-slate-500">Incidenza Spread/Slippage</div>
              <div className="font-mono font-bold text-sm text-emerald-400 mt-1">
                {effectiveTf === '1m' ? 'Elevata (~0.12%)' : effectiveTf === '5m' ? 'Moderata (~0.06%)' : 'Minima (<0.02%)'}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Costi stimati per trade
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="text-slate-500">Campione Operazioni</div>
              <div className="font-mono font-bold text-sm text-cyan-400 mt-1">
                ~{effectiveTf === '1m' ? '1.800+' : effectiveTf === '5m' ? '1.200+' : effectiveTf === '15m' ? '650+' : effectiveTf === '1D' ? '140+' : '250+'} trade
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Significatività statistica
              </div>
            </div>
          </div>
        </div>

        {/* Action Panel: Launch Backtesting Engine */}
        <div className="lg:col-span-1 bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5 mb-2">
              <BarChart2 className="w-4 h-4" />
              STEP 3: MOTORE QUANTITATIVO
            </span>
            <h3 className="text-base font-bold text-white">
              Esegui Analisi Multi-Strategia
            </h3>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Il motore testerà simultaneamente <span className="text-slate-200 font-semibold">8 strategie algoritmiche</span> (Trend Following, RSI Mean Reversion, MACD Momentum, Bollinger Breakout, SuperTrend, Turtle, VWAP, Dual Momentum) con split anti-overfitting Train/Val/OOS.
            </p>
          </div>

          <div className="pt-6 space-y-3">
            <button
              id="run-analysis-btn"
              disabled={isAnalyzing}
              onClick={onRunBatchBacktest}
              className={`w-full py-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all shadow-xl ${
                isAnalyzing
                  ? 'bg-slate-800 text-slate-400 cursor-wait'
                  : 'bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-black shadow-cyan-500/20 hover:scale-[1.02] active:scale-[0.98]'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                  <span>Elaborazione Backtest Multi-Anno...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>ANALIZZA STRATEGIE ➔</span>
                </>
              )}
            </button>

            {onNavigateToOptimizer && (
              <button
                type="button"
                id="quick-open-optimizer-btn"
                onClick={onNavigateToOptimizer}
                className="w-full py-2.5 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>Genera la Migliore Strategia per questo Titolo ➔</span>
              </button>
            )}

            <p className="text-[11px] text-center text-slate-500">
              Nessun look-ahead bias &bull; Split 60% Train / 20% Val / 20% OOS
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
