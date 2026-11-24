/**
 * QuantLab - View 4: Aggiornamenti AI (High-Contrast Color-Differentiated Theme)
 * Displays live web-grounded market briefings with verified clickable sources
 * and the complete autonomous AI Decision Journal with Stop-Loss & chart rationales.
 */
import React, { useMemo, useState } from 'react';
import {
  ExternalLink,
  RefreshCw,
  LineChart as LineChartIcon,
  ShieldCheck,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  AiAutopilotState,
  AiDecisionAction,
  AiDecisionRecord,
  AiMarketBriefing,
} from '../types/aiAutopilot';

interface LightAiUpdatesViewProps {
  aiState: AiAutopilotState | null;
  isRefreshingBriefing: boolean;
  isRunningAiCycle: boolean;
  onRefreshBriefing: () => void;
  onRunAiCycle: () => void;
  onInspectTicker: (ticker: string) => void;
}

type DecisionFilter = 'ALL' | 'OPEN' | 'CLOSE' | 'STOP' | 'SKIP';

function getActionMeta(action: AiDecisionAction): {
  label: string;
  textClass: string;
  rowBgClass: string;
} {
  switch (action) {
    case 'OPEN_LONG':
      return {
        label: 'Acquisto LONG',
        textClass: 'text-emerald-700',
        rowBgClass: 'bg-emerald-50/40 hover:bg-emerald-50/80',
      };
    case 'CLOSE_PROFIT':
      return {
        label: 'Presa Profitto',
        textClass: 'text-blue-700',
        rowBgClass: 'bg-blue-50/40 hover:bg-blue-50/80',
      };
    case 'CLOSE_RISK':
      return {
        label: 'Taglio Rischio',
        textClass: 'text-rose-700',
        rowBgClass: 'bg-rose-50/45 hover:bg-rose-50/85',
      };
    case 'TIGHTEN_STOP':
      return {
        label: 'Alza Stop Loss',
        textClass: 'text-amber-700',
        rowBgClass: 'bg-amber-50/50 hover:bg-amber-50/90',
      };
    case 'HOLD':
      return {
        label: 'Mantieni',
        textClass: 'text-indigo-700',
        rowBgClass: 'bg-white hover:bg-slate-50',
      };
    default:
      return {
        label: 'Scartato',
        textClass: 'text-slate-600',
        rowBgClass: 'bg-slate-50/60 hover:bg-slate-100/80',
      };
  }
}

function getMoodLabel(mood: AiMarketBriefing['marketMood']): { label: string; colorClass: string } {
  switch (mood) {
    case 'FAVOREVOLE':
      return { label: 'Mercato Favorevole', colorClass: 'text-emerald-700' };
    case 'CAUTO':
      return { label: 'Mercato Cauto', colorClass: 'text-rose-700' };
    default:
      return { label: 'Mercato Selettivo', colorClass: 'text-amber-700' };
  }
}

function formatDateTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export const LightAiUpdatesView: React.FC<LightAiUpdatesViewProps> = ({
  aiState,
  isRefreshingBriefing,
  isRunningAiCycle,
  onRefreshBriefing,
  onRunAiCycle,
  onInspectTicker,
}) => {
  const [filter, setFilter] = useState<DecisionFilter>('ALL');
  const [showArchive, setShowArchive] = useState(false);

  const briefings = aiState?.briefings || [];
  const latestBriefing = briefings[0] || null;
  const archiveBriefings = briefings.slice(1, 6);
  const decisions = aiState?.decisions || [];

  const filteredDecisions = useMemo(() => {
    return decisions.filter((d: AiDecisionRecord) => {
      if (filter === 'ALL') return true;
      if (filter === 'OPEN') return d.action === 'OPEN_LONG';
      if (filter === 'CLOSE') return d.action === 'CLOSE_PROFIT' || d.action === 'CLOSE_RISK';
      if (filter === 'STOP') return d.action === 'TIGHTEN_STOP';
      if (filter === 'SKIP') return d.action === 'SKIP' || d.action === 'HOLD';
      return true;
    });
  }, [decisions, filter]);

  const executedCount = decisions.filter((d) => d.executed).length;

  return (
    <div className="space-y-7 animate-fadeIn">
      {/* Page Header Card */}
      <section className="bg-white border border-slate-300/80 rounded-xl p-6 shadow-xs flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-indigo-700">
            Notizie dal Web &amp; Diario Operativo
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight mt-0.5">
            Aggiornamenti AI e Mercati
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Sintesi macro raccolta dal web con fonti verificabili e registro motivato di ogni scelta AI su Stop Loss e ingressi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onRefreshBriefing}
            disabled={isRefreshingBriefing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold bg-indigo-50 border border-indigo-200 text-indigo-900 hover:bg-indigo-100 disabled:opacity-60 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshingBriefing ? 'animate-spin' : ''}`} />
            {isRefreshingBriefing ? 'Ricerca sul web...' : 'Aggiorna Notizie Web'}
          </button>

          <button
            type="button"
            onClick={onRunAiCycle}
            disabled={isRunningAiCycle}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-700 hover:bg-blue-800 text-white shadow-xs disabled:opacity-60 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isRunningAiCycle ? 'animate-spin' : ''}`} />
            {isRunningAiCycle ? 'Ciclo AI in corso...' : 'Nuova Valutazione AI'}
          </button>
        </div>
      </section>

      {/* Latest Web-Grounded Market Briefing */}
      <section className="bg-white border border-slate-300/80 rounded-xl overflow-hidden shadow-xs">
        <div className="px-6 py-5 bg-indigo-50/85 border-b border-indigo-200/80">
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
            <span className="font-bold text-indigo-900">Bollettino Mercati Live</span>
            {latestBriefing && (
              <>
                <span className="text-slate-400">·</span>
                <span className={`font-bold ${getMoodLabel(latestBriefing.marketMood).colorClass}`}>
                  {getMoodLabel(latestBriefing.marketMood).label}
                </span>
                <span className="text-slate-400">·</span>
                <span className="tabular-nums font-mono text-slate-700">
                  {formatDateTime(latestBriefing.timestamp)}
                </span>
                {latestBriefing.poweredByWebSearch && (
                  <>
                    <span className="text-slate-400">·</span>
                    <span className="text-blue-800 font-semibold">Ricerca Web Verificata</span>
                  </>
                )}
              </>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-950 mt-1.5">
            {latestBriefing?.headline || 'In attesa del primo bollettino mercati dal web'}
          </h2>
        </div>

        <div className="p-6 space-y-6">
          {latestBriefing ? (
            <>
              <p className="text-sm sm:text-base text-slate-800 leading-relaxed max-w-4xl">
                {latestBriefing.summaryIt}
              </p>

              {/* Macro Drivers */}
              {latestBriefing.macroDrivers.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-100/90 border border-slate-200">
                  <h3 className="text-xs font-bold text-slate-700 mb-2.5">
                    Driver Macro e Temi Principali
                  </h3>
                  <ul className="space-y-2">
                    {latestBriefing.macroDrivers.map((driver, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2.5 text-sm text-slate-800 leading-relaxed"
                      >
                        <span className="text-indigo-700 font-bold mt-0.5">—</span>
                        <span>{driver}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Ticker Highlights */}
              {latestBriefing.tickerHighlights.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-slate-700 mb-3">
                    Titoli Sotto Osservazione (Notizie + Grafici)
                  </h3>
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                    {latestBriefing.tickerHighlights.map((item, idx) => {
                      const stanceColor =
                        item.bias === 'RIALZISTA'
                          ? 'text-emerald-700'
                          : item.bias === 'CAUTELA'
                            ? 'text-rose-700'
                            : 'text-amber-700';
                      const rowBg =
                        item.bias === 'RIALZISTA'
                          ? 'bg-emerald-50/40 hover:bg-emerald-50/80'
                          : item.bias === 'CAUTELA'
                            ? 'bg-rose-50/40 hover:bg-rose-50/80'
                            : 'bg-white hover:bg-slate-50';
                      const stanceText =
                        item.bias === 'RIALZISTA'
                          ? 'Rialzista'
                          : item.bias === 'CAUTELA'
                            ? 'Cautela'
                            : 'Neutrale';

                      return (
                        <div
                          key={`${item.ticker}-${idx}`}
                          className={`px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-colors ${rowBg}`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm">
                              <button
                                type="button"
                                onClick={() => onInspectTicker(item.ticker)}
                                className="font-mono font-bold text-slate-950 hover:text-blue-700 transition-colors cursor-pointer"
                              >
                                {item.ticker}
                              </button>
                              <span className="text-slate-400">·</span>
                              <span className={`text-xs font-bold ${stanceColor}`}>
                                {stanceText}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 mt-0.5 leading-relaxed">
                              {item.headline}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => onInspectTicker(item.ticker)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-blue-50 border border-slate-300 text-xs font-semibold text-blue-800 shrink-0 cursor-pointer"
                          >
                            <LineChartIcon className="w-3.5 h-3.5" />
                            Apri Grafico
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Verified Web Sources */}
              {latestBriefing.sources.length > 0 && (
                <div className="p-4 rounded-xl bg-blue-50/75 border border-blue-200/80">
                  <h3 className="text-xs font-bold text-blue-950 mb-2.5">
                    Fonti Web Consultate dall&apos;AI ({latestBriefing.sources.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
                    {latestBriefing.sources.map((src, idx) => (
                      <a
                        key={`${src.uri}-${idx}`}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-800 hover:text-blue-950 hover:underline truncate py-0.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0 text-blue-600" />
                        <span className="truncate">{src.title || src.uri}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-slate-700">
                Nessun bollettino ancora salvato. Premi &quot;Aggiorna Notizie Web&quot; per raccogliere le notizie più recenti dai mercati.
              </p>
              <button
                type="button"
                onClick={onRefreshBriefing}
                disabled={isRefreshingBriefing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-700 hover:bg-blue-800 text-white cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshingBriefing ? 'animate-spin' : ''}`} />
                Carica Bollettino Live
              </button>
            </div>
          )}

          {/* Previous Briefings Archive */}
          {archiveBriefings.length > 0 && (
            <div className="pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowArchive((v) => !v)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-800 hover:text-indigo-950 cursor-pointer"
              >
                {showArchive ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showArchive
                  ? 'Nascondi bollettini precedenti'
                  : `Mostra bollettini precedenti (${archiveBriefings.length})`}
              </button>

              {showArchive && (
                <div className="mt-4 divide-y divide-slate-200 border-t border-slate-200">
                  {archiveBriefings.map((b) => (
                    <div key={b.id} className="py-3.5 space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className="tabular-nums font-mono">{formatDateTime(b.timestamp)}</span>
                        <span>·</span>
                        <span className={`font-bold ${getMoodLabel(b.marketMood).colorClass}`}>
                          {getMoodLabel(b.marketMood).label}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-950">{b.headline}</p>
                      <p className="text-xs text-slate-700 leading-relaxed">{b.summaryIt}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Complete AI Decision Journal */}
      <section className="bg-white border border-slate-300/80 rounded-xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 bg-slate-100 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Diario Completo delle Decisioni AI
            </h2>
            <p className="text-xs text-slate-600 mt-0.5 tabular-nums font-medium">
              {decisions.length} valutazioni registrate · {executedCount} ordini eseguiti su prezzi reali verificati
            </p>
          </div>

          {/* High-Contrast Segmented Filter */}
          <div className="inline-flex rounded-lg bg-slate-200/90 p-1 self-start sm:self-auto">
            {(
              [
                { id: 'ALL', label: 'Tutte' },
                { id: 'OPEN', label: 'Acquisti' },
                { id: 'CLOSE', label: 'Chiusure' },
                { id: 'STOP', label: 'Stop Loss' },
                { id: 'SKIP', label: 'Scartati' },
              ] as Array<{ id: DecisionFilter; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  filter === tab.id
                    ? 'bg-blue-700 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-950'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredDecisions.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-sm text-slate-700">
              Nessuna decisione AI presente per questo filtro.
            </p>
            <p className="text-xs text-slate-500">
              Avvia un ciclo AI dal pulsante in alto per analizzare grafici reali e notizie web e generare nuove decisioni operative.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200/80">
            {filteredDecisions.map((d) => {
              const meta = getActionMeta(d.action);
              const cur = d.currencySymbol || (d.currency === 'EUR' ? '€' : '$');
              const riskReward =
                d.stopLossPct && d.takeProfitPct && d.stopLossPct > 0
                  ? (d.takeProfitPct / d.stopLossPct).toFixed(2)
                  : null;

              return (
                <article
                  key={d.id}
                  className={`px-6 py-4 space-y-2.5 transition-colors ${meta.rowBgClass}`}
                >
                  {/* Header Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className={`font-bold ${meta.textClass}`}>{meta.label}</span>
                      <span className="text-slate-400">·</span>
                      <button
                        type="button"
                        onClick={() => onInspectTicker(d.ticker)}
                        className="font-mono font-bold text-slate-950 hover:text-blue-700 transition-colors cursor-pointer"
                      >
                        {d.ticker}
                      </button>
                      <span className="text-slate-600 text-xs">{d.name}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                        {cur}
                        {d.verifiedPrice.toFixed(2)}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-xs font-medium text-slate-600">
                        Confidenza {d.confidence}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-600 tabular-nums shrink-0">
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {formatDateTime(d.timestamp)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onInspectTicker(d.ticker)}
                        className="text-blue-700 hover:text-blue-900 font-semibold cursor-pointer"
                      >
                        Grafico
                      </button>
                    </div>
                  </div>

                  {/* Motivation */}
                  <p className="text-sm text-slate-800 leading-relaxed">{d.motivationIt}</p>

                  {/* Risk Guardrails */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
                    {d.stopLoss != null && (
                      <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Stop Loss {cur}
                        {d.stopLoss.toFixed(2)}
                        {d.stopLossPct != null ? ` (-${d.stopLossPct.toFixed(2)}%)` : ''}
                      </span>
                    )}
                    {d.takeProfit != null && (
                      <span className="font-bold text-emerald-700">
                        Target {cur}
                        {d.takeProfit.toFixed(2)}
                        {d.takeProfitPct != null ? ` (+${d.takeProfitPct.toFixed(2)}%)` : ''}
                      </span>
                    )}
                    {riskReward && (
                      <span className="font-semibold text-indigo-800">R:R {riskReward}x</span>
                    )}
                  </div>

                  {(d.chartSignals || d.webCatalyst || d.executionNote) && (
                    <div className="text-xs text-slate-600 space-y-0.5 pt-0.5">
                      {d.chartSignals && (
                        <p>
                          <span className="font-bold text-slate-700">Grafico:</span>{' '}
                          {d.chartSignals}
                        </p>
                      )}
                      {d.webCatalyst && (
                        <p>
                          <span className="font-bold text-slate-700">Contesto Web:</span>{' '}
                          {d.webCatalyst}
                        </p>
                      )}
                      {d.executionNote && (
                        <p className={d.executed ? 'text-emerald-800 font-semibold' : 'text-slate-600'}>
                          <span className="font-bold">Esito:</span> {d.executionNote}
                        </p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
