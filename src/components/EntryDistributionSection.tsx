/**
 * QuantLab - Entry Distribution & Historical Inactivity Analysis Section
 *
 * Implements rigorous statistical analysis of entry distribution:
 * - Quantile analysis (median, p75, p90, p95, max pause)
 * - Visual distribution gauge with current pause pointer
 * - Frequency breakdown (trades/year, trades/month, days per trade)
 * - Yearly temporal stability breakdown (2021 -> 2026 YTD)
 * - 4-tier non-prescriptive diagnostic classification (Normale, Attesa Elevata, Inusuale, Anomalo)
 * - Quantitative educational callout on low-frequency vs strategy quality
 */
import React, { useState, useMemo } from 'react';
import {
  Clock,
  Calendar,
  Activity,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  BarChart3,
  Sliders,
  TrendingUp,
  ShieldCheck,
  Info,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { Trade, EntryIntervalStats, InactivityStatus } from '../types';
import {
  calculateEntryDistribution,
  analyzeInactivity,
  getDaysSinceLastEntry,
} from '../services/entryDistributionService';

interface EntryDistributionSectionProps {
  trades: Trade[];
  startDateStr?: string;
  endDateStr?: string;
  entryDistribution?: EntryIntervalStats;
  currentInactivityDays?: number;
  lastEntryDateStr?: string;
  strategyName?: string;
  symbol?: string;
  compact?: boolean;
}

export const EntryDistributionSection: React.FC<EntryDistributionSectionProps> = ({
  trades,
  startDateStr,
  endDateStr,
  entryDistribution: initialDistribution,
  currentInactivityDays: propInactivityDays,
  lastEntryDateStr: propLastEntryDateStr,
  strategyName,
  symbol,
  compact = false,
}) => {
  // Compute distribution if not already provided
  const stats = useMemo(() => {
    if (initialDistribution && initialDistribution.totalTrades > 0) {
      return initialDistribution;
    }
    return calculateEntryDistribution(trades, startDateStr, endDateStr);
  }, [initialDistribution, trades, startDateStr, endDateStr]);

  // Derive current real inactivity from trades if not explicitly passed
  const derivedInactivity = useMemo(() => {
    if (propInactivityDays !== undefined && propLastEntryDateStr !== undefined) {
      return { days: propInactivityDays, lastDateStr: propLastEntryDateStr };
    }
    return getDaysSinceLastEntry(trades);
  }, [propInactivityDays, propLastEntryDateStr, trades]);

  // State for interactive simulation slider
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedDays, setSimulatedDays] = useState<number>(Math.round(derivedInactivity.days || 8));

  // Determine active days to evaluate (real or simulated)
  const activeDays = isSimulating ? simulatedDays : derivedInactivity.days;

  // Run statistical inactivity analysis
  const analysis = useMemo(() => {
    return analyzeInactivity(stats, activeDays, derivedInactivity.lastDateStr);
  }, [stats, activeDays, derivedInactivity.lastDateStr]);

  // Color mapping based on InactivityStatus
  const statusTheme = useMemo(() => {
    switch (analysis.status) {
      case 'NORMAL':
        return {
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          text: 'text-emerald-400',
          badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          gaugePointer: 'bg-emerald-400 border-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.6)]',
          barColor: 'bg-emerald-500',
          icon: CheckCircle2,
        };
      case 'ELEVATED_WAIT':
        return {
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          text: 'text-amber-400',
          badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          gaugePointer: 'bg-amber-400 border-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.6)]',
          barColor: 'bg-amber-500',
          icon: Clock,
        };
      case 'UNUSUAL':
        return {
          bg: 'bg-orange-500/10',
          border: 'border-orange-500/30',
          text: 'text-orange-400',
          badgeBg: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
          gaugePointer: 'bg-orange-400 border-orange-200 shadow-[0_0_12px_rgba(249,115,22,0.6)]',
          barColor: 'bg-orange-500',
          icon: AlertTriangle,
        };
      case 'ANOMALOUS':
        return {
          bg: 'bg-rose-500/10',
          border: 'border-rose-500/30',
          text: 'text-rose-400',
          badgeBg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          gaugePointer: 'bg-rose-500 border-white shadow-[0_0_15px_rgba(244,63,94,0.8)]',
          barColor: 'bg-rose-500',
          icon: AlertCircle,
        };
    }
  }, [analysis.status]);

  const StatusIcon = statusTheme.icon;

  // Maximum scale for the gauge (at least 1.25x maxHistoricPause or simulated days)
  const maxScale = Math.max(stats.maxHistoricPause * 1.25, activeDays * 1.15, 30);

  // Calculate percentage positions along the gauge [0% to 100%]
  const p90Pct = Math.min(100, Math.max(0, (stats.percentile90 / maxScale) * 100));
  const p95Pct = Math.min(100, Math.max(0, (stats.percentile95 / maxScale) * 100));
  const maxHistoricPct = Math.min(100, Math.max(0, (stats.maxHistoricPause / maxScale) * 100));
  const currentPointerPct = Math.min(99, Math.max(1, (activeDays / maxScale) * 100));
  const medianPct = Math.min(100, Math.max(0, (stats.medianDaysBetweenEntries / maxScale) * 100));

  if (stats.totalTrades === 0) {
    return (
      <div className="p-6 bg-slate-900/60 border border-slate-800 rounded-xl text-center text-slate-400">
        <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="font-semibold text-sm">Nessuna operazione registrata per questa strategia</p>
        <p className="text-xs text-slate-500 mt-1">Esegui un backtest o carica dati storici per visualizzare la distribuzione degli ingressi.</p>
      </div>
    );
  }

  return (
    <div id="entry-distribution-section" className="space-y-6">
      {/* 1. Header Card with Synthetic Diagnostic Phrase & Status */}
      <div className={`p-5 rounded-xl border ${statusTheme.bg} ${statusTheme.border} transition-all duration-300`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-lg border ${statusTheme.badgeBg} flex-shrink-0 mt-0.5`}>
              <StatusIcon className={`w-5 h-5 ${statusTheme.text}`} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Diagnostica Inattività Operativa
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wide border ${statusTheme.badgeBg}`}>
                  {analysis.statusIcon} {analysis.statusLabel}
                </span>
                {isSimulating && (
                  <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-mono font-bold">
                    MODALITÀ SIMULATORE
                  </span>
                )}
              </div>
              <h3 className="text-lg font-bold text-white mt-1">
                {analysis.syntheticDiagnosticPhrase}
              </h3>
              <p className="text-sm text-slate-300 mt-1 max-w-3xl leading-relaxed">
                {analysis.detailedDiagnosticMessage}
              </p>
            </div>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex-shrink-0 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 text-right sm:min-w-[170px]">
            <div className="text-[11px] text-slate-400 font-mono">Pausa Valutata</div>
            <div className="text-2xl font-black font-mono text-white">
              {activeDays.toFixed(1)} <span className="text-xs font-normal text-slate-400">giorni</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
              Ultimo: <span className="text-slate-200">{derivedInactivity.lastDateStr || 'N/D'}</span>
            </div>
          </div>
        </div>

        {/* 2. Visual Distribution Gauge Bar (Requirement 4) */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
            <span className="flex items-center gap-1.5 font-bold text-slate-300">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              Scala della Distribuzione Pause Storiche
            </span>
            <span className="text-[11px] text-slate-400">
              {analysis.summaryPhrasePause90}
            </span>
          </div>

          {/* Visual Track Bar */}
          <div className="relative h-7 w-full rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex shadow-inner">
            {/* Zone 1: 0 to P90 (Normale) */}
            <div
              style={{ width: `${p90Pct}%` }}
              className="h-full bg-emerald-500/20 border-r border-emerald-500/40 relative flex items-center justify-start pl-2"
              title={`Zona Normale: 0 - ${stats.percentile90} giorni (90% dei casi storici)`}
            >
              <span className="text-[10px] font-bold font-mono text-emerald-400 tracking-wider truncate">
                NORMALE (≤ {stats.percentile90} gg)
              </span>
            </div>

            {/* Zone 2: P90 to P95 (Attesa Elevata) */}
            <div
              style={{ width: `${Math.max(3, p95Pct - p90Pct)}%` }}
              className="h-full bg-amber-500/25 border-r border-amber-500/40 relative flex items-center justify-center"
              title={`Attesa Elevata: da ${stats.percentile90} a ${stats.percentile95} giorni (5% dei casi)`}
            >
              <span className="text-[9px] font-bold font-mono text-amber-300 truncate px-1">
                ELEVATA
              </span>
            </div>

            {/* Zone 3: P95 to Max Historic (Inusuale) */}
            <div
              style={{ width: `${Math.max(3, maxHistoricPct - p95Pct)}%` }}
              className="h-full bg-orange-500/25 border-r border-orange-500/40 relative flex items-center justify-center"
              title={`Inusuale: da ${stats.percentile95} a ${stats.maxHistoricPause} giorni (<5% storico)`}
            >
              <span className="text-[9px] font-bold font-mono text-orange-300 truncate px-1">
                INUSUALE
              </span>
            </div>

            {/* Zone 4: > Max Historic (Anomalo) */}
            <div
              style={{ width: `${Math.max(4, 100 - maxHistoricPct)}%` }}
              className="h-full bg-rose-500/30 relative flex items-center justify-center"
              title={`Anomalo: oltre ${stats.maxHistoricPause} giorni (supera il massimo storico)`}
            >
              <span className="text-[9px] font-bold font-mono text-rose-400 truncate px-1">
                ANOMALO
              </span>
            </div>

            {/* Current Pause Pointer Marker (●) */}
            <div
              style={{ left: `${currentPointerPct}%` }}
              className="absolute top-0 bottom-0 -ml-2.5 z-20 flex flex-col items-center justify-center pointer-events-none transition-all duration-300"
            >
              <div className={`w-5 h-5 rounded-full border-2 ${statusTheme.gaugePointer} flex items-center justify-center`}>
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
            </div>
          </div>

          {/* Scale Labels & Percentile Legend */}
          <div className="relative w-full h-8 mt-1 text-[11px] font-mono text-slate-400">
            <span className="absolute left-0 top-1">0 gg</span>
            <span
              style={{ left: `${medianPct}%` }}
              className="absolute top-1 -translate-x-1/2 text-cyan-400 font-semibold hidden sm:inline"
              title={`Mediana storica: ${stats.medianDaysBetweenEntries} giorni`}
            >
              Mediana ({stats.medianDaysBetweenEntries} gg)
            </span>
            <span
              style={{ left: `${p90Pct}%` }}
              className="absolute top-1 -translate-x-1/2 text-emerald-400 font-bold"
            >
              P90: {stats.percentile90} gg
            </span>
            <span
              style={{ left: `${p95Pct}%` }}
              className="absolute top-1 -translate-x-1/2 text-amber-400 font-bold hidden md:inline"
            >
              P95: {stats.percentile95} gg
            </span>
            <span
              style={{ left: `${maxHistoricPct}%` }}
              className="absolute top-1 -translate-x-1/2 text-rose-400 font-bold"
            >
              Max: {stats.maxHistoricPause} gg
            </span>
          </div>

          {/* Interactive Simulation Slider */}
          <div className="mt-3 p-3 rounded-lg bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold text-slate-300">Simulatore Interattivo Pausa:</span>
              <span className="text-xs font-mono text-slate-400">
                {isSimulating ? (
                  <>Testando inattività di <strong className="text-purple-300 font-bold">{simulatedDays} giorni</strong></>
                ) : (
                  <>Valore attuale da dati reali ({derivedInactivity.days.toFixed(1)} gg)</>
                )}
              </span>
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <input
                type="range"
                min="0"
                max={Math.round(Math.max(stats.maxHistoricPause * 1.5, 60))}
                value={simulatedDays}
                onChange={(e) => {
                  setSimulatedDays(parseInt(e.target.value, 10));
                  setIsSimulating(true);
                }}
                className="w-full sm:w-48 accent-purple-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              {isSimulating ? (
                <button
                  onClick={() => {
                    setIsSimulating(false);
                    setSimulatedDays(Math.round(derivedInactivity.days || 8));
                  }}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono font-semibold whitespace-nowrap transition-colors"
                >
                  Ripristina Reale
                </button>
              ) : (
                <button
                  onClick={() => setIsSimulating(true)}
                  className="px-2 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 text-[11px] font-mono font-semibold whitespace-nowrap transition-colors"
                >
                  Testa Scenari
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Core Numerical Metrics Grid (Requirements 1, 4, 5, 7) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80">
          <div className="text-[11px] font-mono text-slate-400">Trade Annuali</div>
          <div className="text-xl font-black font-mono text-white mt-1">
            {stats.tradesPerYear}
            <span className="text-xs font-normal text-slate-500 ml-1">/anno</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Totale: <span className="text-slate-300 font-semibold">{stats.totalTrades} trade</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80">
          <div className="text-[11px] font-mono text-slate-400">Frequenza Media</div>
          <div className="text-xl font-black font-mono text-cyan-400 mt-1">
            ~{stats.tradesPerMonth}
            <span className="text-xs font-normal text-slate-500 ml-1">/mese</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            ~1 ogni <span className="text-cyan-300 font-semibold">{stats.avgDaysPerTrade} gg</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80">
          <div className="text-[11px] font-mono text-slate-400">Intervallo Medio</div>
          <div className="text-xl font-black font-mono text-white mt-1">
            {stats.avgDaysBetweenEntries}
            <span className="text-xs font-normal text-slate-500 ml-1">gg</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Dev. Std: <span className="text-slate-300 font-semibold">±{stats.stdDevDaysBetweenEntries} gg</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80">
          <div className="text-[11px] font-mono text-slate-400">Intervallo Mediano</div>
          <div className="text-xl font-black font-mono text-emerald-400 mt-1">
            {stats.medianDaysBetweenEntries}
            <span className="text-xs font-normal text-slate-500 ml-1">gg</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            75° perc: <span className="text-emerald-300 font-semibold">{stats.percentile75} gg</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80">
          <div className="text-[11px] font-mono text-slate-400">90° Percentile</div>
          <div className="text-xl font-black font-mono text-amber-400 mt-1">
            {stats.percentile90}
            <span className="text-xs font-normal text-slate-500 ml-1">gg</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            95° perc: <span className="text-amber-300 font-semibold">{stats.percentile95} gg</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800/80">
          <div className="text-[11px] font-mono text-slate-400">Max Pausa Storica</div>
          <div className="text-xl font-black font-mono text-rose-400 mt-1">
            {stats.maxHistoricPause}
            <span className="text-xs font-normal text-slate-500 ml-1">gg</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Min pausa: <span className="text-slate-300 font-semibold">{stats.minDaysBetweenEntries} gg</span>
          </div>
        </div>
      </div>

      {/* 4. Temporal Breakdown by Period (Requirement 6) */}
      {stats.yearlyDistribution && stats.yearlyDistribution.length > 0 && (
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Distribuzione Ingressi per Periodo Storico
              </h4>
            </div>
            <span className="text-xs font-mono text-slate-400">
              Verifica stabilità del flusso operativo nei diversi regimi
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {stats.yearlyDistribution.map((item) => {
              const maxCount = Math.max(...stats.yearlyDistribution.map((d) => d.count), 1);
              const barHeightPct = Math.round((item.count / maxCount) * 100);

              return (
                <div
                  key={String(item.year)}
                  className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="font-bold text-slate-300">{item.label}</span>
                    <span className="text-cyan-400 font-bold">{item.count} trade</span>
                  </div>
                  <div className="w-full bg-slate-800/60 h-1.5 rounded-full overflow-hidden mt-3">
                    <div
                      style={{ width: `${barHeightPct}%` }}
                      className="bg-cyan-500 h-full rounded-full transition-all"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. Quantitative Educational Callout on Frequency vs Strategy Quality (Requirements 8 & 10) */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/40 to-slate-900/60 border border-blue-900/40 flex items-start gap-3.5">
        <div className="p-2 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 flex-shrink-0 mt-0.5">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div className="text-xs text-slate-300 space-y-1.5 leading-relaxed">
          <div className="font-bold text-blue-200 uppercase tracking-wider text-[11px] flex items-center gap-2">
            <span>Principio Guida Quantitativo: Frequenza Operativa vs Qualità del Vantaggio Statistico</span>
          </div>
          <p>
            Una strategia con <strong>15 trade all&apos;anno non è intrinsecamente peggiore</strong> di una con 100 trade.
            Filtri di regime rigorosi e selettività analitica riducono il rumore di mercato e i costi di commissione/slippage.
            Rimanere liquidi durante fasi di mercato non ottimali è una precisa componente di risk management, non un malfunzionamento.
          </p>
          <p className="text-[11px] text-slate-400 font-mono italic">
            Nota Metodologica: La distribuzione storica sintetizza la variabilità empirica del backtest. Non costituisce una previsione temporale sul momento del prossimo ingresso.
          </p>
        </div>
      </div>
    </div>
  );
};
