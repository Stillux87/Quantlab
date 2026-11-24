/**
 * QuantLab - Step 15: Backtest vs Paper Trading Statistical Comparison
 */
import React from 'react';
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  BarChart2,
  Shield,
  Activity,
  ArrowRight,
} from 'lucide-react';
import { PaperTradingSession } from '../types';
import { compareBacktestVsPaper } from '../services/comparisonEngine';

interface BacktestVsPaperViewProps {
  session: PaperTradingSession | undefined;
  onSelectSession: (id: string) => void;
  allSessions: PaperTradingSession[];
}

export const BacktestVsPaperView: React.FC<BacktestVsPaperViewProps> = ({
  session,
  onSelectSession,
  allSessions,
}) => {
  if (!session) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
        <Activity className="w-10 h-10 text-slate-600 mx-auto" />
        <h3 className="text-lg font-bold text-white">Nessuna sessione di Paper Trading attiva</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Avvia prima una strategia in paper trading dalla schermata di backtest per confrontare le metriche storiche con i dati eseguiti in tempo reale.
        </p>
      </div>
    );
  }

  const comparison = compareBacktestVsPaper(session);

  if (!comparison) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-lg font-bold text-white">Riferimento Backtest non disponibile per questa sessione</h3>
      </div>
    );
  }

  const { backtest, paperTrading, deltas, replicationScore, verdict, verdictText } = comparison;

  return (
    <div className="space-y-6">
      {/* Header & Session Selector */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded bg-purple-950 text-purple-400 text-xs font-bold border border-purple-800">
                STEP 15: ANALISI DI REPLICAZIONE
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Confronto Backtest vs Paper Trading Live
              </h2>
            </div>
            <p className="text-slate-400 text-sm max-w-2xl">
              Verifica se la strategia sta replicando fedelmente le aspettative matematiche Out-Of-Sample del backtest o se si manifesta un decadimento delle performance (Alpha Decay).
            </p>

            {/* Active instrument details */}
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center gap-2.5 flex-wrap">
              <span className="text-sm font-extrabold text-white tracking-tight">
                {session.instrument.name || session.instrument.ticker}
              </span>
              <span className="px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 font-mono text-xs font-bold border border-cyan-800/60">
                {session.instrument.ticker}
              </span>
              <span className="text-xs text-slate-400">&bull;</span>
              <span className="text-xs text-slate-400">
                Strategia: <strong className="text-slate-200 font-medium">{session.strategyName}</strong>
              </span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono text-[11px]">
                {session.timeframe}
              </span>
            </div>
          </div>

          {/* Session Switcher if multiple */}
          {allSessions.length > 1 && (
            <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800 self-start md:self-auto">
              <span className="text-xs text-slate-400 px-2">Sessione:</span>
              <select
                value={session?.id || ''}
                onChange={(e) => onSelectSession(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white px-2.5 py-1.5 focus:outline-none max-w-[280px] truncate"
                title="Seleziona sessione da confrontare"
              >
                {allSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.instrument.name || s.instrument.ticker} ({s.instrument.ticker}) — {s.strategyName} [{s.timeframe}]
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Replication Score Hero */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-purple-950/40 border-2 border-purple-500/30 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5 mb-1">
              <Sparkles className="w-4 h-4" />
              REPLICATION FIDELITY SCORE (0 - 100)
            </span>
            <div className="text-3xl font-black font-mono text-white flex items-baseline gap-2">
              <span>{replicationScore}</span>
              <span className="text-sm font-normal text-slate-400">/100</span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold ml-2 ${
                  verdict === 'EXCELLENT_REPLICATION'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                    : verdict === 'ACCEPTABLE_DECAY'
                    ? 'bg-blue-950 text-blue-300 border border-blue-700'
                    : 'bg-amber-950 text-amber-300 border border-amber-700'
                }`}
              >
                {verdict.replace('_', ' ')}
              </span>
            </div>
          </div>

          <div className="text-right bg-slate-950/80 p-3 rounded-xl border border-slate-800 self-start sm:self-auto text-xs">
            <div className="text-slate-400">Trade Eseguiti Live:</div>
            <div className="font-mono font-bold text-base text-cyan-300">
              {comparison.liveTradesCount} / {comparison.minTradesForSignificance} minimi
            </div>
          </div>
        </div>

        {/* Diagnostic commentary */}
        <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed">
          <strong className="text-purple-300 mr-1">Diagnostica Quantitativa:</strong>
          {verdictText}
        </div>
      </div>

      {/* Side-by-Side Comparison Metrics Matrix (Step 15 requirements) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Return % */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Rendimento Totale (%)
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Backtest (OOS):</span>
              <span className="font-mono font-bold text-slate-200">+{backtest.totalReturnPct.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Paper Trading:</span>
              <span className={`font-mono font-bold ${paperTrading.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {paperTrading.totalReturnPct >= 0 ? '+' : ''}{paperTrading.totalReturnPct.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-800 font-semibold">
              <span className="text-slate-400">Scostamento (Delta):</span>
              <span className={`font-mono ${deltas.returnDelta >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {deltas.returnDelta >= 0 ? '+' : ''}{deltas.returnDelta.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Metric 2: Win Rate % */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Win Rate (%)
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Backtest Atteso:</span>
              <span className="font-mono font-bold text-slate-200">{backtest.winRatePct.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Paper Trading:</span>
              <span className="font-mono font-bold text-cyan-300">{paperTrading.winRatePct.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-800 font-semibold">
              <span className="text-slate-400">Scostamento (Delta):</span>
              <span className={`font-mono ${deltas.winRateDelta >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {deltas.winRateDelta >= 0 ? '+' : ''}{deltas.winRateDelta.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        {/* Metric 3: Profit Factor */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Profit Factor
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Backtest Atteso:</span>
              <span className="font-mono font-bold text-slate-200">{backtest.profitFactor.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Paper Trading:</span>
              <span className="font-mono font-bold text-emerald-400">{paperTrading.profitFactor.toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-800 font-semibold">
              <span className="text-slate-400">Scostamento (Delta):</span>
              <span className={`font-mono ${deltas.profitFactorDelta >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {deltas.profitFactorDelta >= 0 ? '+' : ''}{deltas.profitFactorDelta.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Metric 4: Max Drawdown */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Max Drawdown (%)
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Backtest Storico:</span>
              <span className="font-mono font-bold text-rose-400">-{backtest.maxDrawdownPct.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Paper Trading Live:</span>
              <span className="font-mono font-bold text-rose-400">-{paperTrading.maxDrawdownPct.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-slate-800 font-semibold">
              <span className="text-slate-400">Scostamento (Delta):</span>
              <span className={`font-mono ${deltas.drawdownDelta <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {deltas.drawdownDelta > 0 ? '+' : ''}{deltas.drawdownDelta.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
