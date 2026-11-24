/**
 * QuantLab - Date Range & Market Regime Selector for Backtesting
 * Allows testing trading strategies on specific historical periods or custom dates.
 */
import React, { useState } from 'react';
import { Calendar, Filter, Sparkles, Clock, RefreshCw, CheckCircle2 } from 'lucide-react';

export interface DateRangeFilter {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  presetKey: 'MAX' | 'ALL' | 'COVID' | 'BEAR_2022' | 'AI_BULL' | 'LAST_12M' | 'CUSTOM';
  label: string;
}

export interface HistoricalPresetItem extends DateRangeFilter {
  key: DateRangeFilter['presetKey'];
  description: string;
  badge: string;
}

/**
 * Determines whether a date range exceeds 2 years (730 days) or begins prior to 2 years ago.
 * Intraday data from real market feeds is limited to 730 days; any backtest beyond this span
 * MUST use Daily (1D) timeframe to ensure 100% real historical quotes with ZERO synthetic data.
 */
export function isRangeOverTwoYears(
  startDateStr?: string,
  endDateStr?: string,
  presetKey?: string
): boolean {
  if (presetKey === 'LAST_12M') {
    return false;
  }
  if (presetKey === 'MAX' || presetKey === 'ALL' || presetKey === 'COVID' || presetKey === 'BEAR_2022') {
    return true;
  }
  if (!startDateStr) return false;

  const startMs = new Date(`${startDateStr}T00:00:00Z`).getTime();
  if (isNaN(startMs)) return false;

  const endMs = endDateStr ? new Date(`${endDateStr}T23:59:59Z`).getTime() : Date.now();
  const twoYearsMs = 735 * 24 * 60 * 60 * 1000;

  if (endMs - startMs > twoYearsMs) return true;

  return false;
}

const TODAY_ISO = new Date().toISOString().slice(0, 10);

export const HISTORICAL_PRESETS: HistoricalPresetItem[] = [
  {
    key: 'LAST_12M',
    presetKey: 'LAST_12M',
    label: 'Ultimi 12 Mesi (Swing 1h-4h Reattivo)',
    startDate: '2025-11-01',
    endDate: TODAY_ISO,
    description: 'Finestra ottimale per trading reattivo intraday/multiday (1h-4h) sulle condizioni attuali di mercato.',
    badge: 'Consigliato 1h-4h',
  },
  {
    key: 'ALL',
    presetKey: 'ALL',
    label: 'Ciclo Decennale (2016 - Oggi)',
    startDate: '2016-01-01',
    endDate: TODAY_ISO,
    description: 'Campione completo multi-regime di 10 anni (~2.540 barre giornaliere) per validazione di lungo periodo.',
    badge: '10 Anni (1D)',
  },
  {
    key: 'MAX',
    presetKey: 'MAX',
    label: 'Massimo Storico (2008 - Oggi)',
    startDate: '2008-01-01',
    endDate: TODAY_ISO,
    description: 'Campione completo ultradecennale (18+ anni) comprendente Crisi 2008, Debito Sovrano 2011, Covid e Inflazione.',
    badge: '18+ Anni',
  },
  {
    key: 'AI_BULL',
    presetKey: 'AI_BULL',
    label: 'AI & Tech Rally (2023 - 2024)',
    startDate: '2023-01-01',
    endDate: '2024-12-31',
    description: 'Forte espansione di trend direzionale e momentum sui leader globali.',
    badge: 'Trend Following',
  },
  {
    key: 'BEAR_2022',
    presetKey: 'BEAR_2022',
    label: 'Bear Market Inflazione (2022)',
    startDate: '2022-01-01',
    endDate: '2022-12-31',
    description: 'Test su rialzo tassi, trend ribassisti azionari e boom delle materie prime.',
    badge: 'Drawdown Test',
  },
  {
    key: 'COVID',
    presetKey: 'COVID',
    label: 'Covid Shock & Rebound (2020 - 2021)',
    startDate: '2020-02-01',
    endDate: '2021-12-31',
    description: 'Stress test su volatilità estrema, crash di mercato e violento rimbalzo a V.',
    badge: 'Stress Test',
  },
  {
    key: 'CUSTOM',
    presetKey: 'CUSTOM',
    label: 'Date Personalizzate',
    startDate: '2025-01-01',
    endDate: TODAY_ISO,
    description: 'Seleziona liberamente la data di inizio e fine per il test mirato.',
    badge: 'Flessibile',
  },
];

interface DateRangeSelectorProps {
  currentRange: DateRangeFilter;
  onChangeRange: (newRange: DateRangeFilter) => void;
  compact?: boolean;
}

export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
  currentRange,
  onChangeRange,
  compact = false,
}) => {
  const [customStart, setCustomStart] = useState<string>(currentRange.startDate);
  const [customEnd, setCustomEnd] = useState<string>(currentRange.endDate);
  const [dateError, setDateError] = useState<string | null>(null);

  const handleSelectPreset = (presetKey: DateRangeFilter['presetKey']) => {
    setDateError(null);
    const p = HISTORICAL_PRESETS.find((x) => x.key === presetKey);
    if (!p) return;
    if (presetKey === 'CUSTOM') {
      onChangeRange({
        startDate: customStart,
        endDate: customEnd,
        presetKey: 'CUSTOM',
        label: `Personalizzato (${customStart} - ${customEnd})`,
      });
    } else {
      onChangeRange({
        startDate: p.startDate,
        endDate: p.endDate,
        presetKey: p.key,
        label: p.label,
      });
      setCustomStart(p.startDate);
      setCustomEnd(p.endDate);
    }
  };

  const handleApplyCustomDates = () => {
    if (new Date(customStart) >= new Date(customEnd)) {
      setDateError('La data di inizio deve essere precedente alla data di fine.');
      return;
    }
    setDateError(null);
    onChangeRange({
      startDate: customStart,
      endDate: customEnd,
      presetKey: 'CUSTOM',
      label: `Personalizzato (${customStart} - ${customEnd})`,
    });
  };

  if (compact) {
    return (
      <div className="flex flex-col gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 flex items-center gap-1 font-medium">
            <Calendar className="w-3.5 h-3.5 text-cyan-400" />
            Periodo Backtest:
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {HISTORICAL_PRESETS.map((p) => {
              const isSelected = currentRange.presetKey === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => handleSelectPreset(p.key)}
                  className={`px-2.5 py-1 rounded-lg font-mono text-[11px] transition-all border ${
                    isSelected
                      ? 'bg-cyan-950 text-cyan-300 border-cyan-500 font-bold shadow-sm'
                      : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  {p.label.split(' (')[0]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Inline custom date inputs in compact mode */}
        {currentRange.presetKey === 'CUSTOM' && (
          <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl bg-slate-950/90 border border-cyan-800/40 animate-fadeIn">
            <span className="text-slate-400 text-[11px] font-mono">Da:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 font-mono text-[11px] focus:border-cyan-500 outline-none"
            />
            <span className="text-slate-400 text-[11px] font-mono">A:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-white rounded px-2 py-1 font-mono text-[11px] focus:border-cyan-500 outline-none"
            />
            <button
              onClick={handleApplyCustomDates}
              className="px-2.5 py-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] transition-colors flex items-center gap-1 shadow-sm"
            >
              <CheckCircle2 className="w-3 h-3" />
              Applica
            </button>
            {dateError && (
              <span className="text-rose-400 text-[11px] font-medium">{dateError}</span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Finestra Temporale del Backtest & Regimi di Mercato
            </h3>
            <p className="text-xs text-slate-400">
              Testa le strategie su specifici periodi storici o imposta un intervallo personalizzato a tua scelta.
            </p>
          </div>
        </div>

        <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-400">
          Periodo attivo: <strong className="text-white">{currentRange.startDate}</strong> ➔ <strong className="text-white">{currentRange.endDate}</strong>
        </div>
      </div>

      {/* Presets Grid */}
      {isRangeOverTwoYears(currentRange.startDate, currentRange.endDate, currentRange.presetKey) && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300 flex items-start gap-2.5 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="text-white">Modalità Dati Storici Reali al 100%:</strong> Il periodo selezionato supera i 2 anni. Il sistema imposta automaticamente il timeframe a <strong>1D (Daily)</strong> per garantire l'uso esclusivo di quotazioni ufficiali di borsa (Yahoo Finance) ed escludere categoricamente qualsiasi dato sintetico.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
        {HISTORICAL_PRESETS.map((preset) => {
          const isSelected = currentRange.presetKey === preset.key;
          const isLongTerm = isRangeOverTwoYears(preset.startDate, preset.endDate, preset.key);
          return (
            <button
              key={preset.key}
              onClick={() => handleSelectPreset(preset.key)}
              className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                isSelected
                  ? 'bg-gradient-to-b from-cyan-950 to-slate-900 border-cyan-400 shadow-md ring-2 ring-cyan-500/30'
                  : 'bg-slate-950/60 border-slate-800 hover:bg-slate-900 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold ${isSelected ? 'text-cyan-300' : 'text-slate-200'}`}>
                    {preset.label}
                  </span>
                  <div className="flex items-center gap-1">
                    {isLongTerm && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded font-bold uppercase bg-emerald-950/80 text-emerald-400 border border-emerald-500/40">
                        1D Reale
                      </span>
                    )}
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                        isSelected
                          ? 'bg-cyan-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {preset.badge}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-snug mt-1">
                  {preset.description}
                </p>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] font-mono text-slate-500 flex justify-between">
                <span>{preset.startDate}</span>
                <span>➔</span>
                <span>{preset.endDate}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom Date Input Row (When Custom or always accessible) */}
      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Clock className="w-4 h-4 text-cyan-400" />
          <span>Personalizza Date Esatte:</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500">Da:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-slate-900 border border-slate-750 text-white rounded-lg px-2.5 py-1.5 font-mono text-xs focus:border-cyan-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500">A:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-slate-900 border border-slate-750 text-white rounded-lg px-2.5 py-1.5 font-mono text-xs focus:border-cyan-500 outline-none"
            />
          </div>

          <button
            onClick={handleApplyCustomDates}
            className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors flex items-center gap-1.5 shadow-md"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Applica Date
          </button>
        </div>
      </div>
      {dateError && (
        <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-500/30 rounded-xl px-3 py-2">
          {dateError}
        </div>
      )}
    </div>
  );
};
