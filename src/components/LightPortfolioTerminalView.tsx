/**
 * QuantLab - View 2: Portafoglio AI (High-Contrast Color-Differentiated Live Portfolio Terminal)
 * Displays active multi-title AI positions with vivid Stop-Loss / Take-Profit range gauges,
 * real-time verified prices, Autopilot & Risk parameters, equity chart, and closed trade ledger.
 */
import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
  LineChart as LineChartIcon,
} from 'lucide-react';
import { PaperTradingSession, Position } from '../types';
import { AiAutopilotConfig, AiAutopilotState } from '../types/aiAutopilot';
import { globalPaperTradingEngine } from '../services/paperTradingEngine';

interface LightPortfolioTerminalViewProps {
  session: PaperTradingSession | null;
  aiState: AiAutopilotState | null;
  isRunningAiCycle: boolean;
  isResetting: boolean;
  onRunAiCycle: () => void;
  onUpdateConfig: (partial: Partial<AiAutopilotConfig>) => void;
  onCleanReset: () => void;
  onInspectTicker: (ticker: string) => void;
}

export const LightPortfolioTerminalView: React.FC<LightPortfolioTerminalViewProps> = ({
  session,
  aiState,
  isRunningAiCycle,
  isResetting,
  onRunAiCycle,
  onUpdateConfig,
  onCleanReset,
  onInspectTicker,
}) => {
  const [ledgerTab, setLedgerTab] = useState<'CLOSED' | 'LOGS'>('CLOSED');
  const [closingId, setClosingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const openPositions = session?.openPositions || [];
  const closedTrades = session?.closedTrades || [];
  const logs = (session?.logs || []).slice(0, 40);
  const config = aiState?.config;

  const initialCap = session?.initialCapital || 10000;
  const realizedPnl = closedTrades.reduce((s, t) => s + (t.pnlAmount || 0), 0);
  const unrealizedPnl = openPositions.reduce((s, p) => s + (p.unrealizedPnlAmount || 0), 0);
  const totalEquity = (session?.currentCapital ?? initialCap) + unrealizedPnl;
  const totalReturnPct = initialCap > 0 ? ((totalEquity - initialCap) / initialCap) * 100 : 0;

  const winsCount = closedTrades.filter((t) => t.pnlAmount > 0).length;
  const winRatePct = closedTrades.length > 0 ? (winsCount / closedTrades.length) * 100 : 0;

  const equityData = (session?.equityHistory || []).map((pt) => ({
    time: new Date(pt.timestamp).toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    equity: pt.equity,
  }));

  const handleClosePosition = async (pos: Position) => {
    if (!session) return;
    setClosingId(pos.id);
    setStatusMsg(null);
    try {
      const res = await globalPaperTradingEngine.manualClosePosition(session.id, pos.id);
      if (res.ok) {
        setStatusMsg(`Posizione su ${pos.symbol} chiusa lato server al prezzo reale verificato.`);
      } else {
        setStatusMsg(res.error || `Impossibile chiudere ${pos.symbol}.`);
      }
    } finally {
      setClosingId(null);
    }
  };

  return (
    <div className="space-y-7 animate-fadeIn">
      {/* Header Row */}
      <section className="bg-white border border-slate-300/80 rounded-xl p-6 shadow-xs flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-blue-700">
            Paper Trading Live · Prezzi reali di borsa · Conversione P&amp;L in EUR
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Portafoglio AI Multi-Titolo
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onCleanReset}
            disabled={isResetting}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
            <span>{isResetting ? 'Azzeramento...' : 'Reset €10.000'}</span>
          </button>

          <button
            type="button"
            onClick={onRunAiCycle}
            disabled={isRunningAiCycle}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white text-sm font-semibold shadow-xs transition-colors whitespace-nowrap cursor-pointer"
          >
            {isRunningAiCycle && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            <span>{isRunningAiCycle ? 'Ciclo AI in corso...' : 'Esegui Ciclo AI Ora'}</span>
          </button>
        </div>
      </section>

      {statusMsg && (
        <div className="px-4 py-3 rounded-xl bg-emerald-100 border border-emerald-300 text-sm font-medium text-emerald-950">
          {statusMsg}
        </div>
      )}

      {/* 4 Color-Differentiated Portfolio KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-blue-200 border-t-[3px] border-t-blue-600 rounded-xl p-5 shadow-xs">
          <div className="text-xs font-semibold text-blue-800">Equity Totale</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-950">
            €{totalEquity.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div
            className={`mt-1 text-xs font-mono tabular-nums font-semibold ${
              totalReturnPct >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {totalReturnPct >= 0 ? '+' : ''}
            {totalReturnPct.toFixed(2)}% dal capitale iniziale
          </div>
        </div>

        <div
          className={`rounded-xl p-5 border border-t-[3px] shadow-xs ${
            unrealizedPnl >= 0
              ? 'bg-emerald-50/90 border-emerald-200 border-t-emerald-600'
              : 'bg-rose-50/90 border-rose-200 border-t-rose-600'
          }`}
        >
          <div
            className={`text-xs font-semibold ${
              unrealizedPnl >= 0 ? 'text-emerald-800' : 'text-rose-800'
            }`}
          >
            P&amp;L Aperto (Non Realizzato)
          </div>
          <div
            className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${
              unrealizedPnl >= 0 ? 'text-emerald-800' : 'text-rose-800'
            }`}
          >
            {unrealizedPnl >= 0 ? '+' : ''}€{unrealizedPnl.toFixed(2)}
          </div>
          <div className="mt-1 text-xs font-medium text-slate-700">
            Su {openPositions.length} posizioni attive
          </div>
        </div>

        <div
          className={`rounded-xl p-5 border border-t-[3px] shadow-xs ${
            realizedPnl >= 0
              ? 'bg-indigo-50/80 border-indigo-200 border-t-indigo-600'
              : 'bg-rose-50/80 border-rose-200 border-t-rose-600'
          }`}
        >
          <div className="text-xs font-semibold text-indigo-900">P&amp;L Realizzato (Chiusi)</div>
          <div
            className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${
              realizedPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {realizedPnl >= 0 ? '+' : ''}€{realizedPnl.toFixed(2)}
          </div>
          <div className="mt-1 text-xs text-slate-700 font-mono tabular-nums">
            {closedTrades.length} operazioni · Win Rate {winRatePct.toFixed(0)}%
          </div>
        </div>

        <div className="bg-amber-50/85 border border-amber-200 border-t-[3px] border-t-amber-500 rounded-xl p-5 shadow-xs">
          <div className="text-xs font-semibold text-amber-900">Regola Stop Loss</div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-amber-950">
            -{config?.maxStopLossPct?.toFixed(1) ?? '1.4'}%
          </div>
          <div className="mt-1 text-xs font-medium text-amber-800">
            Break-Even automatico a +{config?.breakEvenTriggerPct ?? 0.7}%
          </div>
        </div>
      </section>

      {/* Autopilot & Risk Controls Bar (Distinct Indigo-Tinted Control Band) */}
      {config && (
        <section className="bg-indigo-50/80 border border-indigo-200 rounded-xl p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-0.5">
            <h2 className="text-sm font-bold text-indigo-950">
              Controlli Autopilota AI &amp; Gestione Rischio
            </h2>
            <p className="text-xs text-indigo-900/80">
              Regola la reattività dell&apos;AI: numero massimo di titoli simultanei e tetto rigido di Stop Loss.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center gap-2 text-slate-900 font-semibold cursor-pointer bg-white px-3 py-1.5 rounded-lg border border-indigo-200">
              <input
                type="checkbox"
                checked={config.autoEnabled}
                onChange={(e) => onUpdateConfig({ autoEnabled: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600 cursor-pointer"
              />
              <span>Autopilota ogni {config.intervalMinutes} min</span>
            </label>

            <div className="flex items-center gap-2">
              <span className="text-indigo-950 font-semibold">Max titoli:</span>
              <div className="flex items-center gap-1 p-1 bg-slate-200/90 rounded-lg">
                {[4, 6, 8].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => onUpdateConfig({ maxOpenPositions: n })}
                    className={`px-2.5 py-1 rounded-md font-mono font-bold transition-colors cursor-pointer ${
                      config.maxOpenPositions === n
                        ? 'bg-blue-700 text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-950'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-indigo-950 font-semibold">Stop Loss max:</span>
              <div className="flex items-center gap-1 p-1 bg-slate-200/90 rounded-lg">
                {[1.0, 1.4, 1.8].map((sl) => (
                  <button
                    key={sl}
                    type="button"
                    onClick={() => onUpdateConfig({ maxStopLossPct: sl })}
                    className={`px-2.5 py-1 rounded-md font-mono font-bold transition-colors cursor-pointer ${
                      Math.abs(config.maxStopLossPct - sl) < 0.05
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-950'
                    }`}
                  >
                    -{sl.toFixed(1)}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Open Multi-Title Positions with Vivid Stop-Loss / Target Gauge */}
      <section className="bg-white border border-slate-300/80 rounded-xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 bg-emerald-50/85 border-b border-emerald-200/80 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700" />
            <h2 className="text-base font-bold text-emerald-950">
              Posizioni Aperte ({openPositions.length})
            </h2>
          </div>
          <span className="text-xs font-medium text-emerald-900/80">
            Aggiornamento automatico su prezzi reali verificati
          </span>
        </div>

        {openPositions.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm text-slate-700">
              Nessuna posizione aperta nel portafoglio in questo momento.
            </p>
            <button
              type="button"
              onClick={onRunAiCycle}
              disabled={isRunningAiCycle}
              className="px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              {isRunningAiCycle ? 'Analisi mercati...' : 'Analizza mercati e apri posizioni AI'}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {openPositions.map((pos) => {
              const isEur = pos.symbol.endsWith('.MI') || pos.symbol.endsWith('.DE');
              const sym = isEur ? '€' : '$';
              const isWin = (pos.unrealizedPnlAmount || 0) >= 0;
              const activeStop = pos.trailingStop ? Math.max(pos.stopLoss, pos.trailingStop) : pos.stopLoss;
              const isBreakEven = activeStop >= pos.entryPrice * 0.999;

              const span = Math.max(0.01, pos.takeProfit - activeStop);
              const markerPct = Math.max(
                2,
                Math.min(98, ((pos.currentPrice - activeStop) / span) * 100)
              );

              return (
                <div
                  key={pos.id}
                  className={`p-6 space-y-4 transition-colors ${
                    isWin ? 'bg-emerald-50/25 hover:bg-emerald-50/50' : 'bg-rose-50/20 hover:bg-rose-50/45'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono text-base font-extrabold text-slate-950">
                          {pos.symbol}
                        </span>
                        <span className="text-xs font-medium text-slate-600">
                          {pos.direction} · {pos.quantity} quote · Aperto {pos.entryDateStr}
                        </span>
                        {isBreakEven && (
                          <span className="text-xs font-bold text-amber-700">
                            · Break-Even protetto
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed max-w-3xl">
                        {pos.entryReason}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div
                          className={`text-lg font-bold font-mono tabular-nums ${
                            isWin ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {isWin ? '+' : ''}€{(pos.unrealizedPnlAmount || 0).toFixed(2)}
                        </div>
                        <div
                          className={`text-xs font-mono tabular-nums font-bold ${
                            isWin ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {(pos.unrealizedPnlPercent || 0) >= 0 ? '+' : ''}
                          {(pos.unrealizedPnlPercent || 0).toFixed(2)}%
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onInspectTicker(pos.symbol)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-xs font-semibold text-blue-800 whitespace-nowrap cursor-pointer"
                        >
                          <LineChartIcon className="w-3.5 h-3.5" />
                          <span>Grafico</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleClosePosition(pos)}
                          disabled={closingId === pos.id}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-xs font-semibold text-rose-800 whitespace-nowrap cursor-pointer disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>{closingId === pos.id ? 'Chiusura...' : 'Chiudi'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* High-Contrast Stop Loss -> Current Price -> Take Profit Gauge */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className="text-rose-700 font-bold">
                        Stop Loss: {sym}
                        {activeStop.toFixed(2)}
                      </span>
                      <span className="text-slate-700">
                        Ingresso {sym}
                        {pos.entryPrice.toFixed(2)} · Attuale{' '}
                        <strong className="text-slate-950">
                          {sym}
                          {pos.currentPrice.toFixed(2)}
                        </strong>
                      </span>
                      <span className="text-emerald-700 font-bold">
                        Take Profit: {sym}
                        {pos.takeProfit.toFixed(2)}
                      </span>
                    </div>
                    <div className="relative h-2.5 bg-slate-200 rounded-full overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-400 via-amber-200 to-emerald-400 w-full" />
                      <div
                        className="absolute top-0 bottom-0 w-2.5 bg-slate-950 ring-2 ring-white rounded-full -ml-1.5 transition-all"
                        style={{ left: `${markerPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Equity Curve Chart */}
      {equityData.length > 1 && (
        <section className="bg-white border border-slate-300/80 rounded-xl overflow-hidden shadow-xs">
          <div className="px-6 py-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Andamento Capitale Portafoglio</h2>
              <p className="text-xs text-slate-600">Curva equity in tempo reale in EUR</p>
            </div>
            <span className="text-xs font-mono font-semibold tabular-nums text-blue-800">
              {equityData.length} rilevazioni
            </span>
          </div>
          <div className="p-6">
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lightEquityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    domain={['auto', 'auto']}
                    tickFormatter={(v) => `€${Number(v).toLocaleString('it-IT')}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      borderRadius: '0.5rem',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                    formatter={(val: any) => [
                      `€${Number(val).toLocaleString('it-IT', { minimumFractionDigits: 2 })}`,
                      'Equity',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    stroke="#1d4ed8"
                    strokeWidth={2.5}
                    fill="url(#lightEquityGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      {/* Closed Trades & Execution Log */}
      <section className="bg-white border border-slate-300/80 rounded-xl overflow-hidden shadow-xs">
        <div className="px-6 py-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-200/90 rounded-lg">
            <button
              type="button"
              onClick={() => setLedgerTab('CLOSED')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                ledgerTab === 'CLOSED'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              Operazioni chiuse ({closedTrades.length})
            </button>
            <button
              type="button"
              onClick={() => setLedgerTab('LOGS')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                ledgerTab === 'LOGS'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'text-slate-700 hover:text-slate-950'
              }`}
            >
              Registro eventi ({logs.length})
            </button>
          </div>
        </div>

        {ledgerTab === 'CLOSED' ? (
          closedTrades.length === 0 ? (
            <div className="px-6 py-8 text-sm text-slate-600">
              Nessuna operazione chiusa finora. Quando una posizione raggiungerà il Take Profit, lo Stop Loss o verrà chiusa dall&apos;AI, apparirà qui con il risultato netto in euro.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 text-xs font-bold text-slate-700 bg-slate-200/75">
                    <th className="py-3 px-6">Titolo</th>
                    <th className="py-3 px-4">Ingresso / Uscita</th>
                    <th className="py-3 px-4 text-right">Prezzo In</th>
                    <th className="py-3 px-4 text-right">Prezzo Out</th>
                    <th className="py-3 px-4">Motivo uscita</th>
                    <th className="py-3 px-6 text-right">P&amp;L Netto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 text-sm">
                  {closedTrades.map((t) => {
                    const isEur = t.symbol.endsWith('.MI') || t.symbol.endsWith('.DE');
                    const sym = isEur ? '€' : '$';
                    const isWin = t.pnlAmount >= 0;
                    return (
                      <tr key={t.id} className="odd:bg-white even:bg-slate-50/80 hover:bg-blue-50/60">
                        <td className="py-3 px-6 font-mono font-bold text-slate-950">{t.symbol}</td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-600">
                          {t.entryDateStr} → {t.exitDateStr}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700">
                          {sym}
                          {t.entryPrice.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-950">
                          {sym}
                          {t.exitPrice.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold text-slate-700">
                          {t.exitReason}
                        </td>
                        <td
                          className={`py-3 px-6 text-right font-mono tabular-nums font-bold ${
                            isWin ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {isWin ? '+' : ''}€{t.pnlAmount.toFixed(2)} ({isWin ? '+' : ''}
                          {t.pnlPercent.toFixed(2)}%)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="divide-y divide-slate-200/80 max-h-[380px] overflow-y-auto">
            {logs.length === 0 ? (
              <div className="px-6 py-8 text-sm text-slate-600">Nessun evento registrato.</div>
            ) : (
              logs.map((l) => (
                <div
                  key={l.id}
                  className="px-6 py-3 odd:bg-white even:bg-slate-50/80 flex items-start justify-between gap-4 text-xs"
                >
                  <p className="text-slate-800 leading-relaxed">{l.message}</p>
                  <span className="font-mono text-slate-500 whitespace-nowrap shrink-0 tabular-nums">
                    {l.timeStr}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </section>
    </div>
  );
};
