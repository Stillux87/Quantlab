/**
 * QuantLab - Step 4: Strategy Leaderboard, Composite Scoring & Recommended Strategy
 */
import React, { useState } from 'react';
import {
  Trophy,
  TrendingUp,
  Percent,
  Activity,
  AlertTriangle,
  ArrowRight,
  Shield,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  CheckCircle,
  Play,
  Sliders,
  Sparkles,
  Info,
} from 'lucide-react';
import { BacktestResult, Instrument, Timeframe } from '../types';
import { BatchAnalysisResult } from '../services/rankingEngine';

interface BacktestLeaderboardProps {
  batchResult: BatchAnalysisResult;
  onSelectStrategyDetail: (result: BacktestResult) => void;
  onLaunchPaperTrading: (result: BacktestResult) => void;
  onOpenTitanLab?: () => void;
}

export const BacktestLeaderboard: React.FC<BacktestLeaderboardProps> = ({
  batchResult,
  onSelectStrategyDetail,
  onLaunchPaperTrading,
  onOpenTitanLab,
}) => {
  const [showFormulaDetails, setShowFormulaDetails] = useState(false);
  const [sortField, setSortField] = useState<keyof BacktestResult['metrics']>('score');
  const [sortAsc, setSortAsc] = useState(false);

  const { leaderboard, recommendedStrategy, instrument, timeframe } = batchResult;

  // Sorting
  const sortedLeaderboard = [...leaderboard].sort((a, b) => {
    const valA = a.metrics[sortField] as number;
    const valB = b.metrics[sortField] as number;
    return sortAsc ? valA - valB : valB - valA;
  });

  const handleSort = (field: keyof BacktestResult['metrics']) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 🏆 RECOMMENDED STRATEGY HERO BOX OR 🔴 NESSUNA STRATEGIA QUALIFICATA */}
      {recommendedStrategy && batchResult.hasQualifiedStrategy ? (
        <div className="bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 border-2 border-amber-500/40 rounded-2xl p-6 relative overflow-hidden shadow-xl shadow-amber-500/5">
          <div className="absolute -right-10 -top-10 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-amber-500/20">
                  <Trophy className="w-3.5 h-3.5 fill-current" />
                  🏆 STRATEGIA CONSIGLIATA DAL SISTEMA
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono font-semibold">
                  {instrument.ticker} [{timeframe}]
                </span>
              </div>

              <div>
                <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  {recommendedStrategy.strategyName}
                </h2>
                <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed">
                  Questa strategia ha ottenuto il punteggio quantitativo più alto bilanciando rendimento complessivo, tenuta del drawdown e robustezza nei dati Out-Of-Sample (anti-overfitting).
                </p>
              </div>

              {/* Key Metric Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[11px] font-medium">Strategy Score</div>
                  <div className="text-xl font-black font-mono text-amber-400 mt-0.5">
                    {recommendedStrategy.metrics.score}
                    <span className="text-xs text-slate-500 font-normal">/100</span>
                  </div>
                </div>

                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[11px] font-medium">Profit Factor</div>
                  <div className="text-xl font-black font-mono text-emerald-400 mt-0.5">
                    {recommendedStrategy.metrics.profitFactor.toFixed(2)}
                  </div>
                </div>

                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[11px] font-medium">Max Drawdown</div>
                  <div className="text-xl font-black font-mono text-rose-400 mt-0.5">
                    -{recommendedStrategy.metrics.maxDrawdownPct.toFixed(1)}%
                  </div>
                </div>

                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[11px] font-medium">Out-Of-Sample (OOS)</div>
                  <div className="text-xl font-black font-mono text-cyan-400 mt-0.5">
                    +{recommendedStrategy.metrics.oosReturnPct.toFixed(1)}%
                  </div>
                </div>

                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[11px] font-medium">Affidabilità Statistica</div>
                  <div className="text-sm font-bold text-emerald-300 mt-1 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    {recommendedStrategy.metrics.confidenceLevel} ({recommendedStrategy.metrics.confidenceScore}%)
                  </div>
                </div>
              </div>
            </div>

            {/* Action CTAs */}
            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
              <button
                id="launch-recommended-paper-btn"
                onClick={() => onLaunchPaperTrading(recommendedStrategy)}
                className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Play className="w-4 h-4 fill-current" />
                AVVIA PAPER TRADING
              </button>

              <button
                id="inspect-recommended-detail-btn"
                onClick={() => onSelectStrategyDetail(recommendedStrategy)}
                className="px-6 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm flex items-center justify-center gap-2 border border-slate-700 transition-colors"
              >
                DETTAGLI STRATEGIA
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-900/95 border-2 border-rose-500/40 rounded-2xl p-6 relative overflow-hidden shadow-xl shadow-rose-500/5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                  🔴 NESSUNA STRATEGIA QUALIFICATA
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-xs font-mono font-semibold">
                  {instrument.ticker} [{timeframe}]
                </span>
              </div>

              <div>
                <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  {instrument.name} ({instrument.ticker}) — Nessuna strategia idonea
                </h2>
                <p className="text-sm text-slate-300 max-w-3xl mt-1 leading-relaxed">
                  Nessuna delle {leaderboard.length} strategie analizzate ha soddisfatto i requisiti minimi di qualificazione (profitto netto positivo, Profit Factor &gt; 1.00, significatività statistica del campione e tolleranza al drawdown).
                </p>
              </div>

              {/* Diagnostic Key Metric Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[11px] font-medium">Strategie Analizzate</div>
                  <div className="text-lg font-black font-mono text-white mt-0.5">
                    {leaderboard.length} <span className="text-xs text-slate-400 font-normal">sistemi</span>
                  </div>
                </div>

                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[11px] font-medium">Strategie Qualificate</div>
                  <div className="text-lg font-black font-mono text-rose-400 mt-0.5">
                    0 <span className="text-xs text-slate-400 font-normal">idonee</span>
                  </div>
                </div>

                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[11px] font-medium">Miglior Risultato Ottenuto</div>
                  <div className={`text-lg font-black font-mono mt-0.5 ${(leaderboard.length > 0 ? Math.max(...leaderboard.map(r => r.metrics.totalReturnPct)) : 0) >= 0 ? 'text-slate-200' : 'text-rose-400'}`}>
                    {(leaderboard.length > 0 ? Math.max(...leaderboard.map(r => r.metrics.totalReturnPct)) : 0).toFixed(1)}%
                  </div>
                </div>

                <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[11px] font-medium">Miglior Profit Factor</div>
                  <div className="text-lg font-black font-mono text-amber-400 mt-0.5">
                    {(leaderboard.length > 0 ? Math.max(...leaderboard.map(r => r.metrics.profitFactor)) : 0).toFixed(2)}
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-400 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <strong className="text-slate-200">Conclusione Tecnica:</strong> Nessuna delle strategie attualmente testate ha dimostrato un edge sufficiente su questo titolo nel periodo analizzato. QuantLab non propone strategie con rendimento negativo o prive di vantaggio statistico. I risultati sottostanti sono disponibili per analisi diagnostica.
              </div>
            </div>
          </div>
        </div>
      )}

        {/* Mandatory Regulatory & Risk Disclaimer (Requirement Step 7) */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-1.5 leading-relaxed">
          <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
          <span>
            <strong className="text-slate-300">Avvertenza di Rischio:</strong> Una buona performance storica ottenuta nel backtest non costituisce alcuna garanzia di rendimenti futuri. Il paper trading automatico permette di verificare la tenuta della strategia sui dati successivi in tempo reale a rischio zero (senza denaro reale).
          </span>
        </div>

      {/* Leaderboard Table Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              Classifica Comparativa delle Strategie ({sortedLeaderboard.length})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Periodo Backtest: <span className="font-mono text-slate-300">{batchResult.startDate} &rarr; {batchResult.endDate}</span> &bull; Dati: <span className="font-mono text-slate-300">{timeframe}</span> (~{batchResult.totalBars.toLocaleString()} barre)
            </p>
          </div>

          {/* Formula Details Toggle Button */}
          <button
            onClick={() => setShowFormulaDetails(!showFormulaDetails)}
            className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-800/50 self-start sm:self-auto transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Come viene calcolato lo Strategy Score?</span>
            {showFormulaDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Strategy Score Formula Box (Requirement Step 6) */}
        {showFormulaDetails && (
          <div className="p-4 rounded-xl bg-slate-950 border border-cyan-800/40 space-y-3 text-xs text-slate-300 animate-fadeIn">
            <div className="font-bold text-cyan-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              Formula Documentata dello Strategy Score (0 - 100):
            </div>
            <div className="font-mono p-3 bg-slate-900 rounded-lg border border-slate-800 text-slate-200 overflow-x-auto text-[11px] leading-relaxed">
              Score = (OOS_Return_Weight &times; 25) + (ProfitFactor_Weight &times; 20) + (Drawdown_Protection &times; 20) + (WinRate_Weight &times; 15) + (Sharpe_Ratio &times; 20) - Overfitting_Penalty
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-400">
              <div>
                &bull; <strong className="text-slate-300">Filtro Anti-Overfitting:</strong> se una strategia genera alti profitti nel periodo di Training ma perde o degrada pesantemente nel periodo Out-Of-Sample (OOS), subisce una penalità automatica fino a -35 punti.
              </div>
              <div>
                &bull; <strong className="text-slate-300">Ipotesi di Frizione Reale:</strong> commissioni (0.05%), spread medio (0.02%) e slippage (0.03%) applicati ad ogni singolo trade.
              </div>
            </div>
          </div>
        )}

        {/* Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3"># & Strategia</th>
                <th className="py-3 px-2">Categoria</th>
                <th
                  className="py-3 px-3 cursor-pointer hover:text-cyan-400 text-right"
                  onClick={() => handleSort('score')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Score</span>
                    {sortField === 'score' && (sortAsc ? '▲' : '▼')}
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:text-cyan-400 text-right"
                  onClick={() => handleSort('totalReturnPct')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Profitto Tot.</span>
                    {sortField === 'totalReturnPct' && (sortAsc ? '▲' : '▼')}
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:text-cyan-400 text-right"
                  onClick={() => handleSort('profitFactor')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Profit Factor</span>
                    {sortField === 'profitFactor' && (sortAsc ? '▲' : '▼')}
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:text-cyan-400 text-right"
                  onClick={() => handleSort('winRatePct')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Win Rate</span>
                    {sortField === 'winRatePct' && (sortAsc ? '▲' : '▼')}
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:text-cyan-400 text-right"
                  onClick={() => handleSort('maxDrawdownPct')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Max DD</span>
                    {sortField === 'maxDrawdownPct' && (sortAsc ? '▲' : '▼')}
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:text-cyan-400 text-right"
                  onClick={() => handleSort('oosReturnPct')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>OOS %</span>
                    {sortField === 'oosReturnPct' && (sortAsc ? '▲' : '▼')}
                  </div>
                </th>
                <th
                  className="py-3 px-3 cursor-pointer hover:text-cyan-400 text-right"
                  onClick={() => handleSort('sharpeRatio')}
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Sharpe</span>
                    {sortField === 'sharpeRatio' && (sortAsc ? '▲' : '▼')}
                  </div>
                </th>
                <th className="py-3 px-3 text-center">Operazioni</th>
                <th className="py-3 px-3 text-right">Azioni</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800/60">
              {sortedLeaderboard.map((item, index) => {
                const isRecommended = Boolean(recommendedStrategy && item.strategyId === recommendedStrategy.strategyId);
                const m = item.metrics;

                return (
                  <tr
                    key={item.strategyId}
                    id={`leaderboard-row-${item.strategyId}`}
                    className={`hover:bg-slate-850/60 transition-colors ${
                      isRecommended ? 'bg-amber-950/20' : ''
                    }`}
                  >
                    {/* Strategy Name & Rank */}
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                            index === 0
                              ? 'bg-amber-500 text-slate-950 font-black'
                              : index === 1
                              ? 'bg-slate-300 text-slate-950'
                              : index === 2
                              ? 'bg-amber-700 text-white'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {index + 1}
                        </span>
                        <div>
                          <div className="font-bold text-white text-xs flex items-center gap-1.5">
                            {item.strategyName}
                            {isRecommended && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold uppercase border border-amber-500/40">
                                Consigliata
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3.5 px-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300">
                        {item.strategyCategory.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Score Bar */}
                    <td className="py-3.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-12 bg-slate-800 h-1.5 rounded-full overflow-hidden hidden sm:block">
                          <div
                            className={`h-full rounded-full ${
                              m.score >= 80 ? 'bg-amber-400' : m.score >= 65 ? 'bg-cyan-400' : 'bg-slate-500'
                            }`}
                            style={{ width: `${m.score}%` }}
                          />
                        </div>
                        <span className="font-mono font-extrabold text-sm text-amber-400">
                          {m.score}
                        </span>
                      </div>
                    </td>

                    {/* Total Profit */}
                    <td className="py-3.5 px-3 text-right font-mono font-bold">
                      <span className={m.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {m.totalReturnPct >= 0 ? '+' : ''}
                        {m.totalReturnPct.toFixed(1)}%
                      </span>
                    </td>

                    {/* Profit Factor */}
                    <td className="py-3.5 px-3 text-right font-mono font-semibold text-slate-200">
                      {m.profitFactor.toFixed(2)}
                    </td>

                    {/* Win Rate */}
                    <td className="py-3.5 px-3 text-right font-mono font-semibold text-slate-200">
                      {m.winRatePct.toFixed(1)}%
                    </td>

                    {/* Max Drawdown */}
                    <td className="py-3.5 px-3 text-right font-mono font-semibold text-rose-400">
                      -{m.maxDrawdownPct.toFixed(1)}%
                    </td>

                    {/* Out of Sample (OOS) */}
                    <td className="py-3.5 px-3 text-right font-mono font-bold">
                      <span className={m.oosReturnPct >= 0 ? 'text-cyan-300' : 'text-rose-400'}>
                        {m.oosReturnPct >= 0 ? '+' : ''}
                        {m.oosReturnPct.toFixed(1)}%
                      </span>
                    </td>

                    {/* Sharpe */}
                    <td className="py-3.5 px-3 text-right font-mono text-slate-300">
                      {m.sharpeRatio.toFixed(2)}
                    </td>

                    {/* Trade Count */}
                    <td className="py-3.5 px-3 text-center font-mono text-slate-400">
                      {m.totalTrades}
                    </td>

                    {/* Action Buttons */}
                    <td className="py-3.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {item.strategyId === 'unger_titan_strategy' && onOpenTitanLab && (
                          <button
                            onClick={onOpenTitanLab}
                            className="px-2 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 font-semibold text-[10px] transition-colors"
                            title="Apri e personalizza nel Titan Strategy Lab"
                          >
                            Titan Lab &rarr;
                          </button>
                        )}
                        <button
                          onClick={() => onSelectStrategyDetail(item)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-[11px] transition-colors"
                          title="Dettaglio, Grafico e Trade Blotter"
                        >
                          Dettaglio
                        </button>
                        <button
                          onClick={() => onLaunchPaperTrading(item)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[11px] transition-colors shadow-sm"
                          title="Avvia Paper Trading"
                        >
                          Avvia
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Educational Banner: Titan Lab vs Single Indicator Analysis */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/50 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                Indicatori Tradizionali vs Metodo Unger™ (Titan Lab)
              </h4>
              <p className="text-xs text-slate-400">
                Come vengono selezionate le strategie e perché la Titan Lab offre una marcia in più.
              </p>
            </div>
          </div>

          {onOpenTitanLab && (
            <button
              onClick={onOpenTitanLab}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md transition-all self-start sm:self-auto cursor-pointer"
            >
              <span>Personalizza nel Titan Lab</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-xs text-slate-300">
          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              Strategie Tradizionali a Indicatori (RSI, MACD, Bollinger)
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Queste strategie testano regole statiche basate su formule matematiche di prezzo. Il selettore calcola lo Strategy Score oggettivo premiando chi mantiene drawdown ridotti e profitti Out-Of-Sample, penalizzando l'overfitting.
            </p>
          </div>

          <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-1">
            <div className="font-semibold text-cyan-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              Strategia Titan (Metodo Unger™)
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Invece di ottimizzare un indicatore isolato, usa un trigger elementare combinato con <strong>filtri di regime di mercato</strong> (Trend SMA 200, Volatilità ATR, Finestre Orarie). Qualsiasi ottimizzazione fatta nel Titan Lab può essere promossa direttamente in questa classifica con un click.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
