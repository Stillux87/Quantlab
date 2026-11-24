/**
 * QuantLab - View 1: Panoramica (High-Contrast Color-Differentiated Daylight Theme)
 * Clear visual hierarchy with distinct semantic colors for equity, P&L, Stop-Loss guardrails,
 * live market tickers, AI decisions, and web-grounded market updates.
 */
import React from 'react';
import {
  ArrowRight,
  ExternalLink,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { PaperTradingSession } from '../types';
import {
  AiAutopilotState,
  AiDecisionAction,
  AiLiveTickerSnapshot,
} from '../types/aiAutopilot';
import { ActiveTab } from './Header';

interface QuantLabHomeViewProps {
  aiState: AiAutopilotState | null;
  activeSession: PaperTradingSession | null;
  isRunningAiCycle: boolean;
  isRefreshingBriefing: boolean;
  isResetting: boolean;
  actionNotice: string | null;
  onRunAiCycle: () => void;
  onRefreshBriefing: () => void;
  onToggleAutopilot: (enabled: boolean) => void;
  onCleanReset: () => void;
  onNavigateToTab: (tab: ActiveTab) => void;
  onInspectTicker: (ticker: string) => void;
}

function getActionLabel(action: AiDecisionAction): {
  label: string;
  colorClass: string;
  rowBgClass: string;
} {
  switch (action) {
    case 'OPEN_LONG':
      return {
        label: 'Acquisto LONG',
        colorClass: 'text-emerald-700',
        rowBgClass: 'bg-emerald-50/40 hover:bg-emerald-50/80',
      };
    case 'CLOSE_PROFIT':
      return {
        label: 'Presa Profitto',
        colorClass: 'text-blue-700',
        rowBgClass: 'bg-blue-50/40 hover:bg-blue-50/80',
      };
    case 'CLOSE_RISK':
      return {
        label: 'Taglio Rischio',
        colorClass: 'text-rose-700',
        rowBgClass: 'bg-rose-50/45 hover:bg-rose-50/85',
      };
    case 'TIGHTEN_STOP':
      return {
        label: 'Stop Protetto',
        colorClass: 'text-amber-700',
        rowBgClass: 'bg-amber-50/50 hover:bg-amber-50/90',
      };
    case 'HOLD':
      return {
        label: 'Mantenimento',
        colorClass: 'text-indigo-700',
        rowBgClass: 'bg-white hover:bg-slate-50',
      };
    case 'SKIP':
    default:
      return {
        label: 'Scartato',
        colorClass: 'text-slate-600',
        rowBgClass: 'bg-slate-50/60 hover:bg-slate-100/70',
      };
  }
}

export const QuantLabHomeView: React.FC<QuantLabHomeViewProps> = ({
  aiState,
  activeSession,
  isRunningAiCycle,
  isRefreshingBriefing,
  isResetting,
  actionNotice,
  onRunAiCycle,
  onRefreshBriefing,
  onToggleAutopilot,
  onCleanReset,
  onNavigateToTab,
  onInspectTicker,
}) => {
  const openPositions = activeSession?.openPositions || [];
  const closedTrades = activeSession?.closedTrades || [];
  const initialCap = activeSession?.initialCapital || 10000;
  const unrealizedEur = openPositions.reduce((s, p) => s + (p.unrealizedPnlAmount || 0), 0);
  const currentEquity = (activeSession?.currentCapital ?? initialCap) + unrealizedEur;
  const netPnlEur = currentEquity - initialCap;
  const netPnlPct = initialCap > 0 ? (netPnlEur / initialCap) * 100 : 0;

  const latestBriefing = aiState?.briefings?.[0] || null;
  const recentDecisions = (aiState?.decisions || []).slice(0, 5);
  const marketSnapshot: AiLiveTickerSnapshot[] = aiState?.marketSnapshot || [];
  const config = aiState?.config;

  const protectedCount = openPositions.filter((p) => p.stopLoss >= p.entryPrice * 0.999).length;

  return (
    <div className="space-y-7 animate-fadeIn">
      {/* Top Hero Header with Subtle Tinted Slate-Blue Surface */}
      <section className="bg-white border border-slate-300/80 rounded-xl p-6 shadow-xs flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-semibold text-blue-700">
            Portafoglio AI autonomo · Dati reali verificati in borsa · Cambio EUR/USD{' '}
            <span className="font-mono tabular-nums text-slate-900">
              {(aiState?.eurUsdRate || 1.085).toFixed(4)}
            </span>
          </p>
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900"
            style={{ textWrap: 'balance' }}
          >
            Gestione attiva multi-titolo con analisi web, grafici reali e Stop Loss controllato
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            L&apos;intelligenza artificiale analizza quotazioni reali USA ed Europa, legge le notizie
            più aggiornate dal web e gestisce più operazioni contemporaneamente motivando ogni scelta.
          </p>
        </div>

        {/* Distinct Color-Coded Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {config && (
            <button
              type="button"
              onClick={() => onToggleAutopilot(!config.autoEnabled)}
              className={`px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-xs ${
                config.autoEnabled
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
              }`}
            >
              Autopilota: {config.autoEnabled ? `Attivo (${config.intervalMinutes}m)` : 'In pausa'}
            </button>
          )}

          <button
            type="button"
            onClick={onCleanReset}
            disabled={isResetting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-slate-700 ${isResetting ? 'animate-spin' : ''}`} />
            <span>{isResetting ? 'Azzeramento...' : 'Nuovo test €10.000'}</span>
          </button>

          <button
            type="button"
            onClick={onRunAiCycle}
            disabled={isRunningAiCycle}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white text-sm font-semibold shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isRunningAiCycle && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span>{isRunningAiCycle ? 'Analisi in corso...' : 'Fai decidere all’AI ora'}</span>
          </button>
        </div>
      </section>

      {actionNotice && (
        <div className="px-4 py-3 rounded-xl bg-blue-100/90 border border-blue-300 text-sm font-medium text-blue-950 shadow-xs">
          {actionNotice}
        </div>
      )}

      {/* 4 Color-Differentiated KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Equity - Cobalt Accent */}
        <div className="bg-white border border-blue-200 border-t-[3px] border-t-blue-600 rounded-xl p-5 shadow-xs">
          <div className="text-xs font-semibold text-blue-800">Capitale &amp; Equity Reale</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-950">
            €{currentEquity.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-xs text-slate-600 font-mono tabular-nums">
            Base iniziale €{initialCap.toLocaleString('it-IT')}
          </div>
        </div>

        {/* Net P&L - Dynamic Emerald / Rose Surface */}
        <div
          className={`rounded-xl p-5 border border-t-[3px] shadow-xs ${
            netPnlEur >= 0
              ? 'bg-emerald-50/90 border-emerald-200 border-t-emerald-600'
              : 'bg-rose-50/90 border-rose-200 border-t-rose-600'
          }`}
        >
          <div
            className={`text-xs font-semibold ${
              netPnlEur >= 0 ? 'text-emerald-800' : 'text-rose-800'
            }`}
          >
            Risultato Netto
          </div>
          <div
            className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${
              netPnlEur >= 0 ? 'text-emerald-800' : 'text-rose-800'
            }`}
          >
            {netPnlEur >= 0 ? '+' : ''}€{netPnlEur.toFixed(2)}
          </div>
          <div
            className={`mt-1 text-xs font-mono tabular-nums font-medium ${
              netPnlEur >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {netPnlPct >= 0 ? '+' : ''}
            {netPnlPct.toFixed(2)}% · {closedTrades.length} trade chiusi
          </div>
        </div>

        {/* Open Positions - Indigo Accent */}
        <div className="bg-indigo-50/80 border border-indigo-200 border-t-[3px] border-t-indigo-600 rounded-xl p-5 shadow-xs">
          <div className="text-xs font-semibold text-indigo-800">Posizioni Aperte</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-indigo-950">
            {openPositions.length} / {config?.maxOpenPositions ?? 6}
          </div>
          <div className="mt-1 text-xs font-medium text-indigo-800/80 truncate">
            {openPositions.length > 0
              ? openPositions.map((p) => p.symbol).slice(0, 4).join(', ') +
                (openPositions.length > 4 ? ` +${openPositions.length - 4}` : '')
              : 'Pronto per nuovi ingressi AI'}
          </div>
        </div>

        {/* Stop Loss Guardrail - Amber Accent */}
        <div className="bg-amber-50/85 border border-amber-200 border-t-[3px] border-t-amber-500 rounded-xl p-5 shadow-xs">
          <div className="text-xs font-semibold text-amber-900">Protezione Stop Loss</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-amber-950">
            Max -{config?.maxStopLossPct?.toFixed(1) ?? '1.4'}%
          </div>
          <div className="mt-1 text-xs font-medium text-amber-800">
            Break-Even a +{config?.breakEvenTriggerPct ?? 0.7}% · {protectedCount} protette
          </div>
        </div>
      </section>

      {/* Verified Real-Time Market Strip with Emerald / Rose Price Cards */}
      <section className="bg-white border border-slate-300/80 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="text-xs font-bold text-slate-800">
            Quotazioni reali verificate in borsa ({marketSnapshot.length} titoli attivi)
          </div>
          <button
            type="button"
            onClick={() => onNavigateToTab('markets')}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <span>Tutti i mercati e grafici</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-4">
          {marketSnapshot.length === 0 ? (
            <div className="text-xs text-slate-600 py-2">
              Connessione ai feed ufficiali di borsa in corso... Nessun prezzo inventato viene mostrato prima della verifica reale.
            </div>
          ) : (
            <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar pb-1">
              {marketSnapshot.slice(0, 12).map((item) => {
                const isPos = item.change24h >= 0;
                return (
                  <button
                    key={item.ticker}
                    type="button"
                    onClick={() => onInspectTicker(item.ticker)}
                    className={`flex items-center gap-2.5 px-3.5 py-2 rounded-lg border transition-colors shrink-0 cursor-pointer text-left ${
                      isPos
                        ? 'bg-emerald-50/90 hover:bg-emerald-100 border-emerald-200'
                        : 'bg-rose-50/90 hover:bg-rose-100 border-rose-200'
                    }`}
                  >
                    <span className="font-mono font-bold text-xs text-slate-950">{item.ticker}</span>
                    <span className="font-mono text-xs font-semibold text-slate-800 tabular-nums">
                      {item.currencySymbol}
                      {item.price.toFixed(2)}
                    </span>
                    <span
                      className={`font-mono text-xs font-bold tabular-nums ${
                        isPos ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {isPos ? '+' : ''}
                      {item.change24h.toFixed(2)}%
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Main 2-Column Workspace: Left = AI Decisions | Right = Live Web Market Updates */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 7 Cols: Recent Autonomous AI Decisions */}
        <div className="lg:col-span-7 bg-white border border-slate-300/80 rounded-xl overflow-hidden shadow-xs flex flex-col justify-between">
          <div>
            <div className="px-6 py-4 bg-blue-50/80 border-b border-blue-200/80 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Ultime decisioni prese dall&apos;AI</h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Ogni operazione è motivata su grafici reali e notizie web, con Stop Loss obbligatorio.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateToTab('updates')}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Diario completo
              </button>
            </div>

            {recentDecisions.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <p className="text-sm text-slate-700">
                  L&apos;AI non ha ancora eseguito il primo ciclo decisionale in questa sessione.
                </p>
                <button
                  type="button"
                  onClick={onRunAiCycle}
                  disabled={isRunningAiCycle}
                  className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  {isRunningAiCycle ? 'Analisi in corso...' : 'Avvia il primo ciclo decisionale AI'}
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-200/80">
                {recentDecisions.map((dec) => {
                  const meta = getActionLabel(dec.action);
                  return (
                    <div key={dec.id} className={`px-6 py-4 space-y-1.5 transition-colors ${meta.rowBgClass}`}>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`font-bold ${meta.colorClass}`}>{meta.label}</span>
                          <span aria-hidden="true" className="text-slate-400">·</span>
                          <button
                            type="button"
                            onClick={() => onInspectTicker(dec.ticker)}
                            className="font-mono font-bold text-slate-950 hover:text-blue-700 cursor-pointer"
                          >
                            {dec.ticker}
                          </button>
                          <span aria-hidden="true" className="text-slate-400">·</span>
                          <span className="font-mono font-semibold tabular-nums text-slate-800">
                            {dec.currencySymbol}
                            {dec.verifiedPrice.toFixed(2)}
                          </span>
                          {dec.stopLoss && (
                            <>
                              <span aria-hidden="true" className="text-slate-400">·</span>
                              <span className="font-mono font-semibold tabular-nums text-rose-700">
                                SL {dec.currencySymbol}
                                {dec.stopLoss.toFixed(2)}
                              </span>
                            </>
                          )}
                          {dec.takeProfit && (
                            <>
                              <span aria-hidden="true" className="text-slate-400">·</span>
                              <span className="font-mono font-semibold tabular-nums text-emerald-700">
                                TP {dec.currencySymbol}
                                {dec.takeProfit.toFixed(2)}
                              </span>
                            </>
                          )}
                        </div>
                        <span className="text-xs font-mono text-slate-500 tabular-nums">
                          {dec.dateStr}
                        </span>
                      </div>

                      <p className="text-sm text-slate-800 leading-relaxed">{dec.motivationIt}</p>
                      <p className="text-xs text-slate-600 font-mono">{dec.chartSignals}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right 5 Cols: Live Market Update from Internet */}
        <div className="lg:col-span-5 bg-white border border-slate-300/80 rounded-xl overflow-hidden shadow-xs flex flex-col justify-between">
          <div>
            <div className="px-6 py-4 bg-indigo-50/85 border-b border-indigo-200/80 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-indigo-950">Aggiornamento mercati dal web</h2>
                <p className="text-xs text-indigo-800/80 mt-0.5 font-medium">
                  {latestBriefing
                    ? `${latestBriefing.dateStr} · Clima ${latestBriefing.marketMood.toLowerCase()}`
                    : 'Ricerca notizie finanziarie in tempo reale'}
                </p>
              </div>
              <button
                type="button"
                onClick={onRefreshBriefing}
                disabled={isRefreshingBriefing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-indigo-100 border border-indigo-200 text-xs font-semibold text-indigo-900 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshingBriefing ? 'animate-spin' : ''}`} />
                <span>Aggiorna</span>
              </button>
            </div>

            <div className="p-6">
              {latestBriefing ? (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-950 leading-snug">
                    {latestBriefing.headline}
                  </h3>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {latestBriefing.summaryIt}
                  </p>

                  {latestBriefing.macroDrivers.length > 0 && (
                    <ul className="space-y-2 text-xs text-slate-800 border-t border-slate-200 pt-3">
                      {latestBriefing.macroDrivers.map((driver, i) => (
                        <li key={i} className="leading-relaxed">
                          <span className="font-bold text-indigo-700 mr-1">{i + 1}.</span>
                          {driver}
                        </li>
                      ))}
                    </ul>
                  )}

                  {latestBriefing.sources.length > 0 && (
                    <div className="border-t border-slate-200 pt-3 space-y-1.5">
                      <div className="text-xs font-bold text-slate-700">Fonti web consultate</div>
                      <div className="flex flex-col gap-1.5">
                        {latestBriefing.sources.slice(0, 4).map((src, idx) => (
                          <a
                            key={idx}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline inline-flex items-center gap-1.5 truncate"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0 text-blue-600" />
                            <span className="truncate">{src.title}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 text-sm text-slate-600">
                  Caricamento del bollettino mercati in corso...
                </div>
              )}
            </div>
          </div>

          <div className="px-6 pb-5 pt-2">
            <button
              type="button"
              onClick={() => onNavigateToTab('updates')}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs font-semibold text-white inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Leggi report mercati completo e fonti</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* Active Open Positions Preview with High-Contrast Header & Zebra Striping */}
      <section className="bg-white border border-slate-300/80 rounded-xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 bg-emerald-50/80 border-b border-emerald-200/80 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <h2 className="text-base font-bold text-emerald-950">
              Posizioni aperte monitorate ({openPositions.length})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToTab('paper')}
            className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
          >
            <span>Gestisci nel Portafoglio AI</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {openPositions.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-600">
            Nessuna posizione aperta al momento. Clicca &ldquo;Fai decidere all&apos;AI ora&rdquo; per analizzare i 16 titoli reali e aprire le migliori opportunità con Stop Loss protetto.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-300 text-xs font-bold text-slate-700 bg-slate-200/75">
                  <th className="py-3 px-6">Titolo</th>
                  <th className="py-3 px-4 text-right">Ingresso</th>
                  <th className="py-3 px-4 text-right">Prezzo Reale</th>
                  <th className="py-3 px-4 text-right">Stop Loss</th>
                  <th className="py-3 px-4 text-right">Target</th>
                  <th className="py-3 px-6 text-right">P&amp;L Netto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/80 text-sm">
                {openPositions.map((pos) => {
                  const isEur = pos.symbol.endsWith('.MI') || pos.symbol.endsWith('.DE');
                  const sym = isEur ? '€' : '$';
                  const isWin = (pos.unrealizedPnlAmount || 0) >= 0;
                  return (
                    <tr
                      key={pos.id}
                      onClick={() => onInspectTicker(pos.symbol)}
                      className="odd:bg-white even:bg-slate-50/80 hover:bg-blue-50/70 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-6">
                        <div className="font-mono font-bold text-slate-950">{pos.symbol}</div>
                        <div className="text-xs text-slate-600 line-clamp-1 max-w-xs">
                          {pos.entryReason}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-700">
                        {sym}
                        {pos.entryPrice.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold text-slate-950">
                        {sym}
                        {pos.currentPrice.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-rose-700">
                        {sym}
                        {pos.stopLoss.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                        {sym}
                        {pos.takeProfit.toFixed(2)}
                      </td>
                      <td
                        className={`py-3.5 px-6 text-right font-mono tabular-nums font-bold ${
                          isWin ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {isWin ? '+' : ''}€{(pos.unrealizedPnlAmount || 0).toFixed(2)} (
                        {(pos.unrealizedPnlPercent || 0) >= 0 ? '+' : ''}
                        {(pos.unrealizedPnlPercent || 0).toFixed(2)}%)
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
