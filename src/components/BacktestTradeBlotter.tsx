import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Download,
  Search,
  CheckCircle2,
  XCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  Filter,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Trade, BacktestResult, Instrument } from '../types';
import { formatTradeTime } from './PaperTradingDashboard';

interface BacktestTradeBlotterProps {
  result: BacktestResult;
  instrument: Instrument;
  title?: string;
  defaultFilter?: 'ALL' | 'WIN' | 'LOSS' | 'OOS' | 'LONG' | 'SHORT';
}

export const BacktestTradeBlotter: React.FC<BacktestTradeBlotterProps> = ({
  result,
  instrument,
  title,
  defaultFilter = 'ALL',
}) => {
  const [tradeFilter, setTradeFilter] = useState<'ALL' | 'WIN' | 'LOSS' | 'OOS' | 'LONG' | 'SHORT'>(defaultFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'tradeNumber' | 'pnlAmount' | 'pnlPercent' | 'durationMinutes'>('tradeNumber');
  const [sortAsc, setSortAsc] = useState(true);
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const curr = instrument.currencySymbol || '€';
  const trades = result.trades || [];

  // Filtered and sorted trades
  const filteredTrades = useMemo(() => {
    let list = trades.filter((t) => {
      if (tradeFilter === 'WIN' && t.pnlAmount <= 0) return false;
      if (tradeFilter === 'LOSS' && t.pnlAmount > 0) return false;
      if (tradeFilter === 'OOS' && t.splitType !== 'OOS') return false;
      if (tradeFilter === 'LONG' && t.direction !== 'LONG') return false;
      if (tradeFilter === 'SHORT' && t.direction !== 'SHORT') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          t.entryDateStr.toLowerCase().includes(q) ||
          t.exitDateStr.toLowerCase().includes(q) ||
          t.entryReason.toLowerCase().includes(q) ||
          t.exitReason.toLowerCase().includes(q) ||
          String(t.tradeNumber).includes(q) ||
          t.direction.toLowerCase().includes(q)
        );
      }
      return true;
    });

    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }, [trades, tradeFilter, searchQuery, sortField, sortAsc]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / pageSize));
  const paginatedTrades = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTrades.slice(start, start + pageSize);
  }, [filteredTrades, currentPage, pageSize]);

  // Reset page when filter or search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [tradeFilter, searchQuery, pageSize]);

  // Statistical summary of the trades
  const stats = useMemo(() => {
    if (trades.length === 0) {
      return {
        total: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        payoffRatio: 0,
        bestTrade: 0,
        worstTrade: 0,
        avgDurationHours: 0,
      };
    }

    const wins = trades.filter((t) => t.pnlAmount > 0);
    const losses = trades.filter((t) => t.pnlAmount <= 0);

    const winSum = wins.reduce((acc, t) => acc + t.pnlAmount, 0);
    const lossSum = Math.abs(losses.reduce((acc, t) => acc + t.pnlAmount, 0));

    const avgWin = wins.length > 0 ? winSum / wins.length : 0;
    const avgLoss = losses.length > 0 ? lossSum / losses.length : 0;
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 99 : 0;

    const pnlList = trades.map((t) => t.pnlAmount);
    const bestTrade = Math.max(...pnlList);
    const worstTrade = Math.min(...pnlList);

    const totalMinutes = trades.reduce((acc, t) => acc + (t.durationMinutes || 0), 0);
    const avgDurationHours = totalMinutes / trades.length / 60;

    return {
      total: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: (wins.length / trades.length) * 100,
      avgWin,
      avgLoss,
      payoffRatio,
      bestTrade,
      worstTrade,
      avgDurationHours,
    };
  }, [trades]);

  // Export to CSV
  const handleExportCSV = () => {
    if (trades.length === 0) return;

    const headers = [
      'Trade #',
      'Simbolo',
      'Timeframe',
      'Direzione',
      'Data Ingresso',
      'Prezzo Ingresso',
      'Data Uscita',
      'Prezzo Uscita',
      'Quantità',
      'Stop Loss',
      'Take Profit',
      `P&L Netto (${curr})`,
      'P&L Netto (%)',
      'Durata (Minuti)',
      'Fase Campione',
      'Motivo Ingresso',
      'Motivo Uscita',
    ];

    const rows = trades.map((t) => [
      t.tradeNumber,
      t.symbol,
      t.timeframe,
      t.direction,
      t.entryDateStr,
      t.entryPrice.toFixed(2),
      t.exitDateStr,
      t.exitPrice.toFixed(2),
      t.quantity,
      t.stopLoss.toFixed(2),
      t.takeProfit.toFixed(2),
      t.pnlAmount.toFixed(2),
      t.pnlPercent.toFixed(2),
      t.durationMinutes,
      t.splitType,
      `"${t.entryReason.replace(/"/g, '""')}"`,
      `"${t.exitReason.replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `QuantLab_${result.strategyId}_${instrument.ticker}_posizioni.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false); // default descending for PnL
    }
  };

  return (
    <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-lg">
      {/* Header with Title & Export Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            {title || `Elenco Posizioni Aperte nel Backtest (${filteredTrades.length}/${trades.length})`}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Registro dettagliato delle posizioni simulate con prezzi eseguiti, Stop Loss, Take Profit e motivazioni di uscita.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          disabled={trades.length === 0}
          className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-all cursor-pointer shadow-sm disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Esporta CSV</span>
        </button>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
        <div className="bg-slate-900/90 border border-slate-800/80 p-2.5 rounded-xl">
          <div className="text-[10px] text-slate-400 font-semibold uppercase">Win Rate</div>
          <div className="text-sm font-mono font-bold text-cyan-300 mt-0.5">
            {stats.winRate.toFixed(1)}%
          </div>
          <div className="text-[10px] text-slate-500">
            {stats.wins}V / {stats.losses}P
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 p-2.5 rounded-xl">
          <div className="text-[10px] text-slate-400 font-semibold uppercase">Guadagno Medio (Vinte)</div>
          <div className="text-sm font-mono font-bold text-emerald-400 mt-0.5">
            +{curr}{stats.avgWin.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500">su trade profittevoli</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 p-2.5 rounded-xl">
          <div className="text-[10px] text-slate-400 font-semibold uppercase">Perdita Media (Perse)</div>
          <div className="text-sm font-mono font-bold text-rose-400 mt-0.5">
            -{curr}{stats.avgLoss.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500">su trade in stop</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 p-2.5 rounded-xl">
          <div className="text-[10px] text-slate-400 font-semibold uppercase">Rapporto Payoff</div>
          <div className="text-sm font-mono font-bold text-amber-300 mt-0.5">
            {stats.payoffRatio.toFixed(2)}:1
          </div>
          <div className="text-[10px] text-slate-500">Avg Win / Avg Loss</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 p-2.5 rounded-xl">
          <div className="text-[10px] text-slate-400 font-semibold uppercase">Miglior Trade</div>
          <div className="text-sm font-mono font-bold text-emerald-400 mt-0.5">
            +{curr}{stats.bestTrade.toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500">singolo picco</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 p-2.5 rounded-xl">
          <div className="text-[10px] text-slate-400 font-semibold uppercase">Peggior Trade</div>
          <div className="text-sm font-mono font-bold text-rose-400 mt-0.5">
            {stats.worstTrade < 0 ? '-' : ''}{curr}{Math.abs(stats.worstTrade).toFixed(2)}
          </div>
          <div className="text-[10px] text-slate-500">singola perdita</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cerca per data, motivo ingresso/uscita o #..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setTradeFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              tradeFilter === 'ALL' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Tutti ({trades.length})
          </button>
          <button
            type="button"
            onClick={() => setTradeFilter('WIN')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              tradeFilter === 'WIN'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                : 'text-emerald-400/80 hover:text-emerald-300'
            }`}
          >
            Vincenti ({stats.wins})
          </button>
          <button
            type="button"
            onClick={() => setTradeFilter('LOSS')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              tradeFilter === 'LOSS'
                ? 'bg-rose-950 text-rose-300 border border-rose-700'
                : 'text-rose-400/80 hover:text-rose-300'
            }`}
          >
            Perdenti ({stats.losses})
          </button>
          <button
            type="button"
            onClick={() => setTradeFilter('OOS')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
              tradeFilter === 'OOS'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                : 'text-cyan-400/80 hover:text-cyan-300'
            }`}
          >
            Solo OOS ({trades.filter((t) => t.splitType === 'OOS').length})
          </button>
        </div>
      </div>

      {/* Trades Table */}
      <div className="overflow-x-auto max-h-[440px] overflow-y-auto border border-slate-800/80 rounded-xl">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px] z-10">
            <tr>
              <th
                onClick={() => toggleSort('tradeNumber')}
                className="py-2.5 px-3 cursor-pointer hover:text-slate-200 whitespace-nowrap"
              >
                <div className="flex items-center gap-1">
                  <span>#</span>
                  {sortField === 'tradeNumber' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </div>
              </th>
              <th className="py-2.5 px-2">Tipo</th>
              <th className="py-2.5 px-3">
                <div className="flex items-center gap-1 text-cyan-400">
                  <Clock className="w-3 h-3" />
                  <span>Ora Apertura</span>
                </div>
              </th>
              <th className="py-2.5 px-2 text-right">Prezzo In</th>
              <th className="py-2.5 px-3">
                <div className="flex items-center gap-1 text-purple-400">
                  <Clock className="w-3 h-3" />
                  <span>Ora Chiusura</span>
                </div>
              </th>
              <th className="py-2.5 px-2 text-right">Prezzo Out</th>
              <th className="py-2.5 px-2 text-right">SL / TP</th>
              <th
                onClick={() => toggleSort('pnlAmount')}
                className="py-2.5 px-3 text-right cursor-pointer hover:text-slate-200 whitespace-nowrap"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>P&L Netto</span>
                  {sortField === 'pnlAmount' && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                </div>
              </th>
              <th className="py-2.5 px-2 text-center">Fase</th>
              <th className="py-2.5 px-3">Motivo Uscita & Trigger</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {paginatedTrades.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-8 text-slate-500">
                  Nessuna posizione trovata per i criteri selezionati.
                </td>
              </tr>
            ) : (
              paginatedTrades.map((t) => {
                const isWin = t.pnlAmount > 0;
                return (
                  <tr key={t.id || `${t.tradeNumber}-${t.entryTimestamp}`} className="hover:bg-slate-900/60 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-slate-400 font-semibold">#{t.tradeNumber}</td>
                    <td className="py-2.5 px-2">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          t.direction === 'LONG'
                            ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                            : 'bg-rose-950/60 text-rose-300 border border-rose-800/60'
                        }`}
                      >
                        {t.direction}
                      </span>
                    </td>
                    {/* Ora e data di apertura */}
                    <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                      {(() => {
                        const entryInfo = formatTradeTime(t.entryDateStr, t.entryTimestamp);
                        return (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-cyan-300 text-xs bg-cyan-950/70 px-1.5 py-0.5 rounded border border-cyan-800/70">
                                {entryInfo.time}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 pl-0.5">{entryInfo.date}</div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-2.5 px-2 font-mono text-right text-slate-200">
                      {curr}{t.entryPrice.toFixed(2)}
                    </td>
                    {/* Ora e data di chiusura */}
                    <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                      {(() => {
                        const exitInfo = formatTradeTime(t.exitDateStr, t.exitTimestamp);
                        return (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-purple-300 text-xs bg-purple-950/70 px-1.5 py-0.5 rounded border border-purple-800/70">
                                {exitInfo.time}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 pl-0.5">{exitInfo.date}</div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-2.5 px-2 font-mono text-right text-slate-200">
                      {curr}{t.exitPrice.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 font-mono text-right text-[11px] text-slate-400 whitespace-nowrap">
                      {t.stopLoss ? `${curr}${t.stopLoss.toFixed(1)}` : '-'} / {t.takeProfit ? `${curr}${t.takeProfit.toFixed(1)}` : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                      <span className={isWin ? 'text-emerald-400' : 'text-rose-400'}>
                        {isWin ? '+' : ''}{curr}{t.pnlAmount.toFixed(2)} ({isWin ? '+' : ''}{t.pnlPercent.toFixed(2)}%)
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          t.splitType === 'OOS'
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                            : t.splitType === 'VAL'
                            ? 'bg-slate-800 text-slate-300'
                            : 'bg-slate-900 text-slate-500'
                        }`}
                      >
                        {t.splitType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">
                      <div className="flex flex-col gap-0.5">
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-semibold text-slate-200 inline-block w-fit">
                          {t.exitReason}
                        </span>
                        {t.entryReason && (
                          <span className="text-slate-400 text-[11px] line-clamp-1" title={t.entryReason}>
                            {t.entryReason}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 text-xs text-slate-400">
          <div>
            Mostrati {(currentPage - 1) * pageSize + 1} -{' '}
            {Math.min(currentPage * pageSize, filteredTrades.length)} di {filteredTrades.length} posizioni
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              &larr; Prec
            </button>
            <span className="px-2 font-mono text-slate-300">
              Pag. {currentPage} di {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
            >
              Succ &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
