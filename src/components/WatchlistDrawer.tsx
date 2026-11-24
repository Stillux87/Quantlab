/**
 * QuantLab - Watchlist & Followed Instruments Drawer
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Star,
  Search,
  TrendingUp,
  TrendingDown,
  Trash2,
  Plus,
  ArrowRight,
  Sparkles,
  Globe2,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { Instrument } from '../types';
import { watchlistService } from '../services/watchlistService';
import { INSTRUMENTS_DATABASE } from '../data/instruments';
import { fetchLiveQuote, searchRealTickers } from '../services/marketDataService';
import { CopyableISIN } from './CopyableISIN';

interface WatchlistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedTicker?: string;
  onSelectInstrument: (instrument: Instrument) => void;
  onNavigateToAnalysis?: (instrument: Instrument) => void;
}

export const WatchlistDrawer: React.FC<WatchlistDrawerProps> = ({
  isOpen,
  onClose,
  selectedTicker,
  onSelectInstrument,
  onNavigateToAnalysis,
}) => {
  const [watchlist, setWatchlist] = useState<Instrument[]>([]);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
  const [addSearchQuery, setAddSearchQuery] = useState<string>('');
  const [liveSearchResults, setLiveSearchResults] = useState<any[]>([]);
  const [isSearchingLive, setIsSearchingLive] = useState<boolean>(false);

  // Subscribe to watchlist updates
  useEffect(() => {
    const unsubscribe = watchlistService.subscribe((items) => {
      setWatchlist(items);
    });
    return () => unsubscribe();
  }, []);

  // Live search when typing in add box
  useEffect(() => {
    const q = addSearchQuery.trim();
    if (!q || q.length < 2) {
      setLiveSearchResults([]);
      setIsSearchingLive(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingLive(true);
      try {
        const results = await searchRealTickers(q);
        setLiveSearchResults(results);
      } catch (_) {
        setLiveSearchResults([]);
      } finally {
        setIsSearchingLive(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [addSearchQuery]);

  // Filter watchlist items
  const filteredWatchlist = useMemo(() => {
    if (!filterQuery.trim()) return watchlist;
    const q = filterQuery.toLowerCase();
    return watchlist.filter(
      (item) =>
        item.ticker.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q) ||
        item.market.toLowerCase().includes(q) ||
        item.isin.toLowerCase().includes(q)
    );
  }, [watchlist, filterQuery]);

  if (!isOpen) return null;

  const handleSelect = (inst: Instrument) => {
    onSelectInstrument?.(inst);
    if (onNavigateToAnalysis) {
      onNavigateToAnalysis(inst);
    }
    onClose();
  };

  const handleRemove = (e: React.MouseEvent, ticker: string) => {
    e.stopPropagation();
    watchlistService.removeFromWatchlist(ticker);
  };

  const handleAddFromDB = (inst: Instrument) => {
    watchlistService.addToWatchlist(inst);
    setAddSearchQuery('');
    setIsAddingNew(false);
  };

  const handleAddFromLive = (res: any) => {
    const newInst: Instrument = {
      id: `live_${res.symbol.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      ticker: res.symbol,
      isin: `ISIN-${res.symbol}`,
      name: res.name || res.symbol,
      type: res.type || 'STOCK',
      market: res.exchange || 'Global Exchange',
      exchangeCode: res.exchange || 'MKT',
      currency:
        res.symbol.endsWith('.MI') || res.symbol.endsWith('.DE') || res.symbol.endsWith('.PA')
          ? 'EUR'
          : 'USD',
      currencySymbol:
        res.symbol.endsWith('.MI') || res.symbol.endsWith('.DE') || res.symbol.endsWith('.PA')
          ? '€'
          : '$',
      currentPrice: 100,
      change24h: 0.5,
      change24hAmount: 0.5,
      volume24h: 1000000,
      sector: res.sector || 'Equities',
      description: `Strumento reale quotato su ${res.exchange || 'Mercato regolamentato'}.`,
      dataRange: {
        startDate: '2019-01-02',
        endDate: '2026-08-28',
        totalBarsDaily: 1940,
      },
      dataQuality: {
        score: 100,
        missingBarsPct: 0.0,
        duplicateBarsCount: 0,
        volumeCompletenessPct: 100.0,
        priceAnomalyCount: 0,
        status: 'EXCELLENT',
      },
    };
    watchlistService.addToWatchlist(newInst);
    setAddSearchQuery('');
    setIsAddingNew(false);
  };

  const handleRestoreDefaults = () => {
    const defaults = [
      'ENEL.MI',
      'ISP.MI',
      'RACE.MI',
      'UCG.MI',
      'NVDA',
      'AAPL',
      'SPY',
      'VWCE.DE',
    ]
      .map((t) => INSTRUMENTS_DATABASE.find((i) => i.ticker === t))
      .filter((x): x is Instrument => x !== undefined);

    watchlistService.saveWatchlist(defaults);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/80 backdrop-blur-sm animate-in fade-in-0 duration-200">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-lg h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">Watchlist & Titoli Seguiti</h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/80 text-xs font-mono font-bold">
                  {watchlist.length}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Accedi rapidamente ai tuoi titoli preferiti per backtesting o paper trading
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Chiudi pannello"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Actions Bar */}
        <div className="p-4 border-b border-slate-800/80 space-y-3 bg-slate-950/20">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Filtra tra i tuoi titoli seguiti..."
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500"
              />
              {filterQuery && (
                <button
                  onClick={() => setFilterQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={() => setIsAddingNew(!isAddingNew)}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                isAddingNew
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'bg-slate-800 hover:bg-slate-750 text-amber-300 border border-slate-700'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Aggiungi</span>
            </button>
          </div>

          {/* Collapsible Add New Instrument Search Panel */}
          {isAddingNew && (
            <div className="p-3 bg-slate-950 border border-amber-500/40 rounded-xl space-y-2 animate-in fade-in-0 duration-150">
              <div className="text-xs font-bold text-amber-300 flex items-center justify-between">
                <span>Cerca e Aggiungi alla Watchlist</span>
                <span className="text-[10px] text-slate-400 font-normal">Database o Live Ticker</span>
              </div>
              <input
                type="text"
                value={addSearchQuery}
                onChange={(e) => setAddSearchQuery(e.target.value)}
                placeholder="Cerca ticker o nome (es. Ferrari, ENI, Tesla)..."
                autoFocus
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />

              {/* Local database matches for add */}
              {addSearchQuery.trim().length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1 pt-1">
                  {INSTRUMENTS_DATABASE.filter(
                    (i) =>
                      (i.ticker.toLowerCase().includes(addSearchQuery.toLowerCase()) ||
                        i.name.toLowerCase().includes(addSearchQuery.toLowerCase())) &&
                      !watchlistService.isInWatchlist(i.ticker)
                  )
                    .slice(0, 5)
                    .map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleAddFromDB(item)}
                        className="px-2.5 py-1.5 rounded-lg hover:bg-amber-950/40 border border-transparent hover:border-amber-500/30 cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white">{item.ticker}</span>
                          <span className="text-slate-300 text-[11px] truncate max-w-[180px]">
                            {item.name}
                          </span>
                        </div>
                        <span className="text-amber-400 font-bold text-[11px] flex items-center gap-1">
                          + Aggiungi
                        </span>
                      </div>
                    ))}

                  {/* Live matches */}
                  {liveSearchResults.map((res) => (
                    <div
                      key={res.symbol}
                      onClick={() => handleAddFromLive(res)}
                      className="px-2.5 py-1.5 rounded-lg hover:bg-emerald-950/40 border border-transparent hover:border-emerald-500/30 cursor-pointer flex items-center justify-between text-xs transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-emerald-300">{res.symbol}</span>
                        <span className="text-slate-300 text-[11px] truncate max-w-[180px]">
                          {res.name}
                        </span>
                      </div>
                      <span className="text-emerald-400 font-bold text-[11px] flex items-center gap-1">
                        + Aggiungi
                      </span>
                    </div>
                  ))}

                  {isSearchingLive && (
                    <div className="text-[11px] text-slate-400 text-center py-1 flex items-center justify-center gap-1.5">
                      <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />
                      Ricerca live in corso...
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Watchlist Cards List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar">
          {filteredWatchlist.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto">
                <Star className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-200">
                  {filterQuery
                    ? `Nessun titolo corrisponde a "${filterQuery}"`
                    : 'Nessun titolo nella Watchlist'}
                </p>
                <p className="text-xs text-slate-400 max-w-xs mx-auto">
                  Aggiungi i tuoi titoli preferiti cliccando sull'icona a stella ⭐ nella ricerca o nel dettaglio dello strumento.
                </p>
              </div>
              <button
                onClick={handleRestoreDefaults}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Carica Titoli Consigliati (FTSE MIB & Tech)</span>
              </button>
            </div>
          ) : (
            filteredWatchlist.map((inst) => {
              const isSelected = selectedTicker === inst.ticker;
              return (
                <div
                  key={inst.ticker}
                  onClick={() => handleSelect(inst)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
                    isSelected
                      ? 'bg-amber-950/20 border-amber-500/60 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30'
                      : 'bg-slate-950/60 hover:bg-slate-800/60 border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center font-mono font-bold text-xs text-amber-300 shrink-0 shadow-inner">
                      {inst.ticker.split('.')[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-white group-hover:text-amber-300 transition-colors">
                          {inst.ticker}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            inst.type === 'ETF'
                              ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                              : 'bg-blue-950 text-blue-300 border border-blue-800'
                          }`}
                        >
                          {inst.type}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                          {inst.market}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 truncate mt-0.5 max-w-[200px] sm:max-w-[240px]">
                        {inst.name}
                      </p>
                      {inst.isin && (
                        <div className="mt-0.5">
                          <CopyableISIN isin={inst.isin} size="xs" variant="subtle" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {/* Price & Change */}
                    <div className="text-right">
                      <div className="font-mono font-bold text-xs text-white">
                        {inst.currencySymbol}
                        {inst.currentPrice.toFixed(2)}
                      </div>
                      <div
                        className={`text-[11px] font-mono font-semibold flex items-center justify-end gap-0.5 ${
                          inst.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {inst.change24h >= 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {inst.change24h >= 0 ? '+' : ''}
                        {inst.change24h.toFixed(2)}%
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => handleRemove(e, inst.ticker)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Rimuovi dalla Watchlist"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <div className="p-1.5 rounded-lg bg-amber-500/10 group-hover:bg-amber-500 text-amber-300 group-hover:text-slate-950 transition-all">
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Quick Action */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span>{watchlist.length} strumenti seguiti</span>
          <button
            onClick={handleRestoreDefaults}
            className="text-amber-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer"
          >
            Ripristina predefiniti
          </button>
        </div>
      </div>
    </div>
  );
};
