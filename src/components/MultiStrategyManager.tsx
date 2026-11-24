/**
 * QuantLab - Step 16: Multi-Strategy & Multi-Instrument Portfolio Manager
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Layers,
  Play,
  Pause,
  Trash2,
  TrendingUp,
  Activity,
  Plus,
  Shield,
  Clock,
  ArrowRight,
  AlertCircle,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  Target,
  ShieldCheck,
  GitMerge,
  Compass,
  Loader2,
} from 'lucide-react';
import { PaperTradingSession, Position, Trade } from '../types';
import { globalPaperTradingEngine } from '../services/paperTradingEngine';
import { StrategyTriggerInspectorModal } from './StrategyTriggerInspectorModal';

interface MultiStrategyManagerProps {
  sessions: PaperTradingSession[];
  onSelectSession: (id: string) => void;
  onAddNewStrategy: () => void;
  onNavigateToTerminal: () => void;
}

type MultiTab = 'strategies' | 'active-positions' | 'closed-positions';

export const MultiStrategyManager: React.FC<MultiStrategyManagerProps> = ({
  sessions,
  onSelectSession,
  onAddNewStrategy,
  onNavigateToTerminal,
}) => {
  const [activeTab, setActiveTab] = useState<MultiTab>('strategies');
  const [tickerFilter, setTickerFilter] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<PaperTradingSession | null>(null);
  const [positionToClose, setPositionToClose] = useState<{ session: PaperTradingSession; position: Position } | null>(null);
  const [sessionForTriggerModal, setSessionForTriggerModal] = useState<PaperTradingSession | null>(null);
  const [isConsolidating, setIsConsolidating] = useState<boolean>(false);
  const [consolidationFeedback, setConsolidationFeedback] = useState<string | null>(null);

  const positionsSectionRef = useRef<HTMLDivElement>(null);

  // Lock body scroll and handle Escape key for modals
  useEffect(() => {
    if (!sessionToDelete && !positionToClose && !sessionForTriggerModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSessionToDelete(null);
        setPositionToClose(null);
        setSessionForTriggerModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sessionToDelete, positionToClose, sessionForTriggerModal]);

  // Aggregate portfolio metrics
  const totalInitial = sessions.reduce((s, sess) => s + sess.initialCapital, 0);
  const totalCurrentCapital = sessions.reduce((s, sess) => {
    const unrealized = sess.openPositions.reduce((u, p) => u + p.unrealizedPnlAmount, 0);
    return s + sess.currentCapital + unrealized;
  }, 0);
  const totalNetPnl = totalCurrentCapital - totalInitial;
  const totalNetPnlPct = totalInitial > 0 ? (totalNetPnl / totalInitial) * 100 : 0;
  const totalOpenPositions = sessions.reduce((s, sess) => s + sess.openPositions.length, 0);
  // All open positions across all sessions, ordered strictly by Title (Ticker/Symbol)
  const sortedOpenPositions = useMemo(() => {
    const list: (Position & {
      session: PaperTradingSession;
      instrumentTicker: string;
      instrumentName: string;
      strategyName: string;
      timeframe: string;
      currencySymbol: string;
    })[] = [];

    sessions.forEach((sess) => {
      const posMap = new Map<string, Position>();
      (sess.openPositions || []).forEach((p) => { if (p && p.id) posMap.set(p.id, p); });
      if (sess.constituents) {
        sess.constituents.forEach((c) => {
          (c.openPositions || []).forEach((cp) => {
            if (cp && cp.id && !posMap.has(cp.id)) {
              posMap.set(cp.id, cp);
            }
          });
        });
      }

      const isPort = sess.isPortfolio || sess.strategyCategory === 'MULTI_STRATEGY' || sess.id.includes('portfolio');
      Array.from(posMap.values()).forEach((pos) => {
        const symbol = pos.symbol || sess.instrument?.ticker || 'ASSET';
        const ticker = isPort ? symbol : (sess.instrument?.ticker || symbol);
        list.push({
          ...pos,
          session: sess,
          instrumentTicker: ticker,
          instrumentName: isPort ? symbol : (sess.instrument?.name || ticker),
          strategyName: sess.strategyName,
          timeframe: sess.timeframe,
          currencySymbol: sess.instrument?.currencySymbol || '€',
        });
      });
    });

    // Ordinamento per Titolo (in ordine alfabetico per simbolo/nome titolo)
    return list.sort((a, b) => {
      const titleA = (a.instrumentTicker || a.symbol || '').toUpperCase();
      const titleB = (b.instrumentTicker || b.symbol || '').toUpperCase();
      const cmp = titleA.localeCompare(titleB);
      if (cmp !== 0) return cmp;
      return (b.entryTimestamp || 0) - (a.entryTimestamp || 0);
    });
  }, [sessions]);

  // All closed trades across all sessions, ordered strictly by Title (Ticker/Symbol)
  const sortedClosedTrades = useMemo(() => {
    const list: (Trade & {
      session: PaperTradingSession;
      instrumentTicker: string;
      instrumentName: string;
      strategyName: string;
      timeframe: string;
      currencySymbol: string;
    })[] = [];

    sessions.forEach((sess) => {
      const tradeMap = new Map<string, Trade>();
      const seen = new Set<string>();
      const addTrade = (trade: Trade) => {
        if (!trade || !trade.id) return;
        const key = `${trade.symbol}_${trade.entryTimestamp}_${trade.direction}_${trade.quantity}`;
        if (seen.has(key)) return;
        seen.add(key);
        tradeMap.set(trade.id, trade);
      };
      (sess.closedTrades || []).forEach(addTrade);
      if (sess.constituents) {
        sess.constituents.forEach((c) => {
          (c.closedTrades || []).forEach(addTrade);
        });
      }

      const isPort = sess.isPortfolio || sess.strategyCategory === 'MULTI_STRATEGY' || sess.id.includes('portfolio');
      Array.from(tradeMap.values()).forEach((trade) => {
        const symbol = trade.symbol || sess.instrument?.ticker || 'ASSET';
        const ticker = isPort ? symbol : (sess.instrument?.ticker || symbol);
        list.push({
          ...trade,
          session: sess,
          instrumentTicker: ticker,
          instrumentName: isPort ? symbol : (sess.instrument?.name || ticker),
          strategyName: sess.strategyName,
          timeframe: sess.timeframe,
          currencySymbol: sess.instrument?.currencySymbol || '€',
        });
      });
    });

    // Ordinamento per Titolo (in ordine alfabetico per simbolo/nome titolo)
    return list.sort((a, b) => {
      const titleA = (a.instrumentTicker || a.symbol || '').toUpperCase();
      const titleB = (b.instrumentTicker || b.symbol || '').toUpperCase();
      const cmp = titleA.localeCompare(titleB);
      if (cmp !== 0) return cmp;
      return (b.exitTimestamp || 0) - (a.exitTimestamp || 0);
    });
  }, [sessions]);

  const totalClosedTrades = sortedClosedTrades.length;

  // Filtered lists
  const displayedOpenPositions = useMemo(() => {
    if (!tickerFilter) return sortedOpenPositions;
    return sortedOpenPositions.filter((p) => p.instrumentTicker.toUpperCase() === tickerFilter.toUpperCase());
  }, [sortedOpenPositions, tickerFilter]);

  const displayedClosedTrades = useMemo(() => {
    if (!tickerFilter) return sortedClosedTrades;
    return sortedClosedTrades.filter((t) => t.instrumentTicker.toUpperCase() === tickerFilter.toUpperCase());
  }, [sortedClosedTrades, tickerFilter]);

  const uniqueOpenTickers = useMemo(() => {
    return Array.from(new Set(sortedOpenPositions.map((p) => p.instrumentTicker))).sort();
  }, [sortedOpenPositions]);

  const uniqueClosedTickers = useMemo(() => {
    return Array.from(new Set(sortedClosedTrades.map((t) => t.instrumentTicker))).sort();
  }, [sortedClosedTrades]);

  // Formatting helpers
  const formatTradeTime = (dateStr?: string, timestamp?: number) => {
    if (timestamp && !isNaN(timestamp) && timestamp > 0) {
      const d = new Date(timestamp);
      const dateFormatted = d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const timeFormatted = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return { date: dateFormatted, time: timeFormatted };
    }
    if (dateStr) {
      const parts = dateStr.split(' ');
      return { date: parts[0] || '', time: parts[1] || '' };
    }
    return { date: '-', time: '-' };
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    if (hours < 24) return `${hours}h ${remMinutes > 0 ? `${remMinutes}m` : ''}`.trim();
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return `${days}g ${remHours > 0 ? `${remHours}h` : ''}`.trim();
  };

  const formatExitReason = (reason?: string) => {
    switch (reason) {
      case 'TAKE_PROFIT':
        return { text: 'Take Profit', bg: 'bg-emerald-950 text-emerald-300 border-emerald-800' };
      case 'STOP_LOSS':
        return { text: 'Stop Loss', bg: 'bg-rose-950 text-rose-300 border-rose-800' };
      case 'TRAILING_STOP':
        return { text: 'Trailing Stop', bg: 'bg-cyan-950 text-cyan-300 border-cyan-800' };
      case 'SIGNAL_REVERSAL':
        return { text: 'Inversione Segnale', bg: 'bg-amber-950 text-amber-300 border-amber-800' };
      case 'TIME_LIMIT':
        return { text: 'Limite Tempo', bg: 'bg-purple-950 text-purple-300 border-purple-800' };
      case 'MANUAL':
        return { text: 'Chiusura Manuale', bg: 'bg-slate-800 text-slate-300 border-slate-700' };
      default:
        return { text: reason || 'Completato', bg: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  const handleToggle = (id: string) => {
    globalPaperTradingEngine.togglePauseSession(id);
  };

  const handleDeleteClick = (sess: PaperTradingSession) => {
    setSessionToDelete(sess);
  };

  const handleConfirmDelete = () => {
    if (sessionToDelete) {
      globalPaperTradingEngine.deleteSession(sessionToDelete.id);
      setSessionToDelete(null);
    }
  };

  const handleConfirmClosePosition = () => {
    if (positionToClose) {
      globalPaperTradingEngine.manualClosePosition(
        positionToClose.session.id,
        positionToClose.position.id,
        positionToClose.position.currentPrice
      );
      setPositionToClose(null);
    }
  };

  const handleOpenPositionsCardClick = () => {
    setActiveTab('active-positions');
    setTickerFilter(null);
    setTimeout(() => {
      if (positionsSectionRef.current) {
        positionsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  const handleClosedTradesCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveTab('closed-positions');
    setTickerFilter(null);
    setTimeout(() => {
      if (positionsSectionRef.current) {
        positionsSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  const handleConsolidateClick = async () => {
    setIsConsolidating(true);
    setConsolidationFeedback(null);
    try {
      const res = await globalPaperTradingEngine.consolidateSessions();
      setConsolidationFeedback(
        `Consolidamento completato con successo: ${res.consolidatedCount} sessioni singole archiviate e delegate al Portafoglio Unger con Filtro Regime SMA 200 + ATR 14 attivo.`
      );
    } catch (e: any) {
      setConsolidationFeedback(`Errore nel consolidamento: ${e?.message || e}`);
    } finally {
      setIsConsolidating(false);
    }
  };

  return (
    <div className="space-y-6 min-h-[75vh] pb-36">
      {/* Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 relative overflow-hidden shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 text-[11px] font-mono font-bold border border-cyan-800/60">
                PAPER TRADING MULTI-STRATEGIA
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Visione d'Insieme Portafoglio Strategie
              </h2>
            </div>
            <p className="text-slate-400 text-sm max-w-2xl">
              Monitora e gestisci l'esecuzione simultanea di tutte le tue strategie paper attive. Controlla il P&L aggregato, le posizioni aperte e lo stato operativo in tempo reale.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start md:self-auto">
            {sessions.length > 0 && (
              <button
                onClick={onNavigateToTerminal}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer"
              >
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Terminale Singolo</span>
              </button>
            )}

            <button
              onClick={onAddNewStrategy}
              className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nuova Strategia</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quantitative Audit & Systematic Restructuring Panel (Andrea Unger Methodology) */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-md relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-md bg-indigo-950 text-indigo-300 text-[10px] font-mono font-bold border border-indigo-800/80">
                AUDIT QUANTITATIVO & RISTRUTTURAZIONE
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-950 text-emerald-300 text-[10px] font-mono font-bold border border-emerald-800/80 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                METODO UNGER CLASSIC
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-cyan-950 text-cyan-300 text-[10px] font-mono font-bold border border-cyan-800/80">
                FILTRO REGIME SMA 200 + ATR
              </span>
            </div>
            
            <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
              Diagnosi dei 54 Giorni di Paper Trading & Piano di Riposizionamento
            </h3>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              L'audit storico (10 trade chiusi, P&L netto -€570,45) evidenzia una divergenza strutturale: 
              il <strong className="text-emerald-300 font-semibold">Portafoglio Multi-Asset Unger</strong> (6 mercati decorrelati) è resiliente (+€117 su ENI.MI e utile fluttuante su Petrolio e Oro), 
              mentre il 100% del drawdown è derivato da <strong className="text-rose-300 font-semibold">singoli titoli azionari isolati</strong> (Volkswagen -€465 per acquisti su minimi decrescenti e NVDA su 15m).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-slate-400 text-[10px] uppercase font-semibold">1. Portafoglio Multi-Asset</div>
                <div className="text-white font-medium text-[11px] mt-0.5">Consolida il capitale nei panieri diversificati evitando il rischio specifico su singolo titolo.</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-slate-400 text-[10px] uppercase font-semibold">2. Swing Daily vs 15m</div>
                <div className="text-white font-medium text-[11px] mt-0.5">Elimina i whipsaw e il rumore intraday operando esclusivamente su chiusure giornaliere.</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="text-slate-400 text-[10px] uppercase font-semibold">3. Filtro Regime SMA 200 + ATR</div>
                <div className="text-white font-medium text-[11px] mt-0.5">Blocca tassativamente ingressi LONG sotto la media a 200 giorni ed entrate su volatilità anomala.</div>
              </div>
            </div>

            {consolidationFeedback && (
              <div className="p-3 rounded-xl bg-cyan-950/90 border border-cyan-800 text-cyan-200 text-xs font-medium flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>{consolidationFeedback}</span>
              </div>
            )}
          </div>

          <div className="shrink-0 flex flex-col gap-2">
            <button
              onClick={handleConsolidateClick}
              disabled={isConsolidating}
              className="px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-75 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 transition-all cursor-pointer disabled:cursor-wait"
              title="Consolida le strategie singole nel Portafoglio Unger Multi-Asset e attiva il filtro di regime"
            >
              {isConsolidating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Consolidamento in corso...</span>
                </>
              ) : (
                <>
                  <GitMerge className="w-4 h-4" />
                  <span>Consolida in Portafoglio Unger</span>
                </>
              )}
            </button>
            <div className="text-[10px] text-slate-400 text-center font-mono">
              Archivia bot isolati &middot; Attiva SMA 200 Gate
            </div>
          </div>
        </div>
      </div>

      {/* Aggregate Portfolio Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Patrimonio Totale */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveTab('strategies')}
          className={`bg-slate-900/60 border rounded-2xl p-3 sm:p-4 transition-all cursor-pointer hover:bg-slate-850/80 ${
            activeTab === 'strategies' ? 'border-slate-700' : 'border-slate-800'
          }`}
          title="Visualizza strategie"
        >
          <div className="text-slate-400 text-[11px] sm:text-xs font-medium">Patrimonio Totale Portafoglio</div>
          <div className="text-lg sm:text-2xl font-black font-mono text-white mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
            €{totalCurrentCapital.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 whitespace-nowrap">
            Iniziale: €{totalInitial.toLocaleString()}
          </div>
        </div>

        {/* P&L Netto Globale */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3 sm:p-4">
          <div className="text-slate-400 text-[11px] sm:text-xs font-medium">P&L Netto Globale</div>
          <div className={`text-lg sm:text-2xl font-black font-mono mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis ${totalNetPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalNetPnl >= 0 ? '+' : ''}€{totalNetPnl.toFixed(2)}
          </div>
          <div className={`text-[10px] sm:text-[11px] font-mono font-bold whitespace-nowrap ${totalNetPnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {totalNetPnlPct >= 0 ? '+' : ''}{totalNetPnlPct.toFixed(2)}%
          </div>
        </div>

        {/* Strategie Attive / Totali */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveTab('strategies')}
          className={`bg-slate-900/60 border rounded-2xl p-3 sm:p-4 transition-all cursor-pointer hover:bg-slate-850/80 ${
            activeTab === 'strategies' ? 'border-cyan-500 ring-1 ring-cyan-500/50 bg-slate-850/90' : 'border-slate-800'
          }`}
          title="Clicca per visualizzare le strategie di portafoglio"
        >
          <div className="text-slate-400 text-[11px] sm:text-xs font-medium">Strategie Attive / Totali</div>
          <div className="text-lg sm:text-2xl font-black font-mono text-cyan-300 mt-0.5 whitespace-nowrap">
            {sessions.filter((s) => s.isActive && !s.isPaused).length} / {sessions.length}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-500 whitespace-nowrap">
            In esecuzione background
          </div>
        </div>

        {/* Posizioni Aperte Totali - CLICKABLE TO BRING USER TO ACTIVE POSITIONS */}
        <div
          id="card-total-open-positions"
          role="button"
          tabIndex={0}
          onClick={handleOpenPositionsCardClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              handleOpenPositionsCardClick();
            }
          }}
          className={`bg-slate-900/60 border rounded-2xl p-3 sm:p-4 cursor-pointer transition-all hover:bg-slate-850/90 group ${
            activeTab === 'active-positions'
              ? 'border-cyan-500 ring-1 ring-cyan-500/50 bg-slate-850/90 shadow-md shadow-cyan-950/20'
              : 'border-slate-800 hover:border-cyan-500/60'
          }`}
          title="Clicca per visualizzare l'elenco delle posizioni aperte in essere (ordinate per titolo)"
        >
          <div className="flex items-center justify-between text-slate-400 text-[11px] sm:text-xs font-medium">
            <span className="group-hover:text-cyan-300 transition-colors">Posizioni Aperte Totali</span>
            <span className="text-[10px] text-cyan-400 font-mono font-semibold flex items-center gap-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
              Vedi &rarr;
            </span>
          </div>
          <div className="text-lg sm:text-2xl font-black font-mono text-white mt-0.5 flex items-baseline gap-2 whitespace-nowrap">
            <span>{totalOpenPositions}</span>
            {totalOpenPositions > 0 ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                In Essere
              </span>
            ) : (
              <span className="text-[10px] text-slate-500 font-normal">
                0 aperte
              </span>
            )}
          </div>
          <div
            onClick={handleClosedTradesCardClick}
            className="text-[10px] sm:text-[11px] text-slate-400 hover:text-cyan-300 transition-colors font-mono mt-1 flex items-center justify-between cursor-pointer whitespace-nowrap"
            title="Clicca per visualizzare le posizioni chiuse"
          >
            <span>{totalClosedTrades} chiusi</span>
            <span className="text-cyan-400/80 text-[10px] underline hover:text-cyan-300">storico</span>
          </div>
        </div>
      </div>

      {/* Navigation Schede / Tabs */}
      <div ref={positionsSectionRef} className="space-y-4 pt-1 scroll-mt-28">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            {/* Scheda 1: Strategie */}
            <button
              id="tab-strategies-btn"
              onClick={() => {
                setActiveTab('strategies');
                setTickerFilter(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'strategies'
                  ? 'bg-cyan-500 text-slate-950 shadow-xs'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Strategie Portafoglio</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                activeTab === 'strategies' ? 'bg-cyan-950 text-cyan-200' : 'bg-slate-800 text-slate-400'
              }`}>
                {sessions.length}
              </span>
            </button>

            {/* Scheda 2: Posizioni Attive (In Essere) */}
            <button
              id="tab-active-positions-btn"
              onClick={() => {
                setActiveTab('active-positions');
                setTickerFilter(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'active-positions'
                  ? 'bg-cyan-500 text-slate-950 shadow-xs'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Posizioni Attive (In Essere)</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                activeTab === 'active-positions' ? 'bg-cyan-950 text-cyan-200' : 'bg-slate-800 text-slate-400'
              }`}>
                {totalOpenPositions}
              </span>
            </button>

            {/* Scheda 3: Posizioni Chiuse (Storico) */}
            <button
              id="tab-closed-positions-btn"
              onClick={() => {
                setActiveTab('closed-positions');
                setTickerFilter(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                activeTab === 'closed-positions'
                  ? 'bg-cyan-500 text-slate-950 shadow-xs'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Posizioni Chiuse (Storico)</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                activeTab === 'closed-positions' ? 'bg-cyan-950 text-cyan-200' : 'bg-slate-800 text-slate-400'
              }`}>
                {totalClosedTrades}
              </span>
            </button>
          </div>

          {(activeTab === 'active-positions' || activeTab === 'closed-positions') && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <span className="px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-cyan-300 flex items-center gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
                <span>Ordinamento:</span>
                <strong className="text-white font-bold">Titolo (A &rarr; Z)</strong>
              </span>
            </div>
          )}
        </div>

        {/* ======================================================== */}
        {/* SCHEDA 1: STRATEGIE PORTAFOGLIO                          */}
        {/* ======================================================== */}
        {activeTab === 'strategies' && (
          <div className="space-y-3">
            {sessions.map((sess) => {
              const unrealized = sess.openPositions.reduce((u, p) => u + p.unrealizedPnlAmount, 0);
              const sessPnl = sess.currentCapital - sess.initialCapital + unrealized;
              const sessPnlPct = (sessPnl / sess.initialCapital) * 100;
              const isRunning = sess.isActive && !sess.isPaused;

              return (
                <div
                  key={sess.id}
                  className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 sm:p-5 hover:border-slate-700 transition-all space-y-3.5 shadow-sm"
                >
                  {/* Top Header: Icon, Ticker, Name, Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                          isRunning
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        <Activity className="w-5 h-5" />
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-extrabold text-white text-base sm:text-lg tracking-tight">
                            {sess.instrument.name || sess.instrument.ticker}
                          </h3>
                          <span className="px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-300 text-xs font-mono font-bold border border-cyan-800/60">
                            {sess.instrument.ticker}
                          </span>
                          {sess.isPortfolio && (
                            <span className="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 text-[10px] font-mono font-bold border border-amber-800/80">
                              PORTAFOGLIO UNGER
                            </span>
                          )}
                          {sess.isConsolidated && (
                            <span className="px-2 py-0.5 rounded bg-indigo-950/80 text-indigo-300 text-[10px] font-mono font-bold border border-indigo-800/80">
                              CONSOLIDATA
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span className="text-slate-300 font-medium">{sess.strategyName}</span>
                          <span>&bull;</span>
                          <span className="font-mono text-cyan-300 font-semibold">{sess.timeframe}</span>
                          {sess.isConsolidated && (
                            <>
                              <span>&bull;</span>
                              <span className="text-indigo-300 font-sans italic">Ordini singoli archiviati nel Portafoglio Globale</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider flex items-center gap-1 ${
                          isRunning
                            ? 'bg-emerald-950/90 text-emerald-400 border border-emerald-800/80'
                            : 'bg-amber-950/90 text-amber-400 border border-amber-800/80'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                        <span>{isRunning ? 'Attiva' : 'In Pausa'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Macro Regime Filter Status Bar */}
                  <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] font-mono bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="text-slate-300 font-semibold">Filtro Regime Macro (Unger):</span>
                      <span className="px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 text-[10px] font-bold border border-cyan-800/60">
                        SMA 200 + ATR 14
                      </span>
                    </div>
                    {sess.regimeFilter?.lastSma200 ? (
                      <div className="flex items-center gap-2 flex-wrap text-slate-300">
                        <span>SMA 200: <strong className="text-white">€{sess.regimeFilter.lastSma200.toFixed(2)}</strong></span>
                        <span>&bull;</span>
                        <span className={sess.regimeFilter.currentRegime === 'BULLISH' ? 'text-emerald-400 font-bold' : sess.regimeFilter.currentRegime === 'BEARISH' ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                          {sess.regimeFilter.currentRegime === 'BULLISH' ? 'Rialzista (> SMA)' : sess.regimeFilter.currentRegime === 'BEARISH' ? 'Ribassista (< SMA)' : 'Neutro'}
                        </span>
                        {sess.regimeFilter.lastAtr14 && (
                          <>
                            <span>&bull;</span>
                            <span>ATR 14: <strong className="text-cyan-300">{sess.regimeFilter.lastAtr14.toFixed(2)}</strong></span>
                          </>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px]">
                        Attivo &middot; Operazioni contro-trend e volatilità anomala bloccate
                      </span>
                    )}
                  </div>

                  {/* Financial Metrics Strip: Dedicated, never-truncated P&L & Capital */}
                  <div className="p-3 sm:p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center justify-between sm:justify-start gap-4 sm:gap-6">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Capitale Allocato</div>
                        <div className="text-sm sm:text-base font-black font-mono text-white whitespace-nowrap mt-0.5">
                          €{(sess.currentCapital + unrealized).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                        </div>
                      </div>

                      <div className="border-l border-slate-800/80 pl-4 sm:pl-6">
                        <div className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Stato Operazioni</div>
                        <div className="text-xs sm:text-sm text-slate-300 font-medium flex items-center gap-2 mt-0.5 whitespace-nowrap">
                          <span
                            onClick={() => {
                              setActiveTab('active-positions');
                              setTickerFilter(sess.instrument.ticker);
                            }}
                            className="hover:text-cyan-300 cursor-pointer font-mono"
                          >
                            Pos: <strong className="text-cyan-400 underline">{sess.openPositions.length}</strong>
                          </span>
                          <span className="text-slate-600">&bull;</span>
                          <span
                            onClick={() => {
                              setActiveTab('closed-positions');
                              setTickerFilter(sess.instrument.ticker);
                            }}
                            className="hover:text-cyan-300 cursor-pointer font-mono"
                          >
                            Trade: <strong className="text-slate-200 underline">{sess.closedTrades.length}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Prominent High-Contrast PnL Badge - 100% visible on mobile, never truncated */}
                    <div
                      className={`flex sm:flex-col items-center sm:items-end justify-between sm:justify-center px-3.5 py-2 rounded-xl border font-mono font-bold whitespace-nowrap shadow-xs ${
                        sessPnl >= 0
                          ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80'
                          : 'bg-rose-950/80 text-rose-400 border-rose-800/80'
                      }`}
                    >
                      <span className="text-[10px] text-slate-400 font-sans sm:hidden uppercase font-semibold tracking-wider">
                        P&L Netto:
                      </span>
                      <div className="flex items-baseline gap-2 sm:block text-right">
                        <span className="text-sm sm:text-base font-black tracking-tight">
                          {sessPnl >= 0 ? '+' : ''}€{sessPnl.toFixed(2)}
                        </span>
                        <span className="text-xs sm:text-xs font-bold ml-1.5 sm:ml-0 sm:block opacity-90">
                          {sessPnlPct >= 0 ? '+' : ''}{sessPnlPct.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Responsive Action Buttons Toolbar */}
                  <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 pt-1 border-t border-slate-800/60">
                    <button
                      onClick={() => setSessionForTriggerModal(sess)}
                      className="px-3 py-2.5 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800/70 text-cyan-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[40px]"
                      title="Visualizza radar del livello di trigger e condizioni di attesa"
                    >
                      <Target className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>Radar Trigger</span>
                    </button>

                    <button
                      onClick={() => {
                        onSelectSession(sess.id);
                        onNavigateToTerminal();
                      }}
                      className="px-3 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold text-xs border border-cyan-500/30 flex items-center justify-center gap-1.5 transition-colors cursor-pointer min-h-[40px]"
                    >
                      <span>Terminale Live</span>
                      <ArrowRight className="w-4 h-4 shrink-0" />
                    </button>

                    <div className="col-span-2 sm:col-span-1 flex items-center gap-2 sm:ml-auto">
                      <button
                        onClick={() => handleToggle(sess.id)}
                        className="flex-1 sm:flex-initial px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                        title={isRunning ? 'Metti in pausa' : 'Riprendi'}
                      >
                        {isRunning ? <Pause className="w-4 h-4 text-amber-400 shrink-0" /> : <Play className="w-4 h-4 text-emerald-400 shrink-0" />}
                        <span className="sm:hidden">{isRunning ? 'Pausa' : 'Avvia'}</span>
                      </button>

                      <button
                        onClick={() => handleDeleteClick(sess)}
                        className="flex-1 sm:flex-initial px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-rose-950/80 border border-slate-700 hover:border-rose-800 text-slate-400 hover:text-rose-300 transition-colors flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer min-h-[40px]"
                        title="Rimuovi dal Paper Trading"
                      >
                        <Trash2 className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="sm:hidden">Rimuovi</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {sessions.length === 0 && (
              <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-12 text-center space-y-3">
                <Layers className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-base font-bold text-white">Nessuna strategia attiva in portafoglio</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Esegui un backtest su uno strumento per selezionare e avviare la tua prima strategia quantitativa.
                </p>
                <button
                  onClick={onAddNewStrategy}
                  className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs cursor-pointer"
                >
                  Avvia Prima Strategia
                </button>
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* SCHEDA 2: POSIZIONI ATTIVE (IN ESSERE) ORDINATE PER TITOLO */}
        {/* ======================================================== */}
        {activeTab === 'active-positions' && (
          <div className="space-y-4 min-h-[75vh] pb-36">
            {/* Filter by ticker chips if multiple instruments */}
            {uniqueOpenTickers.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                <span className="text-slate-400 font-medium flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Filtra Titolo:</span>
                </span>
                <button
                  onClick={() => setTickerFilter(null)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !tickerFilter
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  Tutti ({sortedOpenPositions.length})
                </button>
                {uniqueOpenTickers.map((ticker) => {
                  const count = sortedOpenPositions.filter((p) => p.instrumentTicker.toUpperCase() === ticker.toUpperCase()).length;
                  const isSel = tickerFilter?.toUpperCase() === ticker.toUpperCase();
                  return (
                    <button
                      key={ticker}
                      onClick={() => setTickerFilter(isSel ? null : ticker)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSel
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                      }`}
                    >
                      <span>{ticker}</span>
                      <span className={`px-1 rounded text-[10px] ${isSel ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {displayedOpenPositions.length === 0 ? (
              <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-12 text-center space-y-3">
                <Activity className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-base font-bold text-white">
                  {tickerFilter
                    ? `Nessuna posizione aperta in essere per ${tickerFilter}`
                    : 'Nessuna posizione aperta in essere'}
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  Le strategie attualmente in esecuzione monitorano il mercato in tempo reale. Non appena scatteranno i segnali tecnici di ingresso, le posizioni aperte appariranno qui automaticamente in ordine di titolo.
                </p>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setActiveTab('strategies')}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 cursor-pointer"
                  >
                    Vedi Strategie Attive
                  </button>
                  {totalClosedTrades > 0 && (
                    <button
                      onClick={() => setActiveTab('closed-positions')}
                      className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold text-xs border border-cyan-500/40 cursor-pointer"
                    >
                      Vedi Posizioni Chiuse ({totalClosedTrades})
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                {/* Mobile View: Dedicated cards with prominent, un-truncated PnL */}
                <div className="block md:hidden space-y-3">
                  {displayedOpenPositions.map((pos) => {
                    const isProfit = pos.unrealizedPnlAmount >= 0;
                    const currSym = pos.currencySymbol || '€';
                    const openInfo = formatTradeTime(pos.entryDateStr, pos.entryTimestamp);

                    return (
                      <div key={pos.id} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 shadow-sm">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-white text-xs px-2.5 py-1 rounded-md bg-cyan-950 border border-cyan-800">
                                {pos.instrumentTicker}
                              </span>
                              <span className="text-white font-bold text-sm">
                                {pos.instrumentName}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5 font-mono">
                              <span>{pos.strategyName}</span>
                              <span>&bull;</span>
                              <span className="text-cyan-300 font-semibold">{pos.timeframe}</span>
                            </div>
                          </div>

                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            pos.direction === 'LONG' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
                          }`}>
                            {pos.direction}
                          </span>
                        </div>

                        {/* PnL Banner Full Width */}
                        <div className={`p-3 rounded-xl border flex items-center justify-between font-mono font-bold ${
                          isProfit ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80' : 'bg-rose-950/80 text-rose-400 border-rose-800/80'
                        }`}>
                          <span className="text-[11px] uppercase text-slate-400 font-sans font-semibold tracking-wider">
                            P&L Non Realizzato:
                          </span>
                          <div className="text-right">
                            <span className="text-base font-black tracking-tight">{isProfit ? '+' : ''}{currSym}{pos.unrealizedPnlAmount.toFixed(2)}</span>
                            <span className="text-xs font-semibold ml-2">({isProfit ? '+' : ''}{pos.unrealizedPnlPercent.toFixed(2)}%)</span>
                          </div>
                        </div>

                        {/* Prices 2x2 grid */}
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/70">
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase block font-sans">Prezzo In:</span>
                            <span className="text-cyan-300 font-bold">{currSym}{pos.entryPrice.toFixed(2)}</span>
                            <span className="text-slate-400 text-[10px] ml-1">({pos.quantity}q)</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase block font-sans">Prezzo Live:</span>
                            <span className="text-white font-bold">{currSym}{pos.currentPrice.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase block font-sans">Stop Loss:</span>
                            <span className="text-rose-400 font-medium">{currSym}{pos.stopLoss.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-500 uppercase block font-sans">Take Profit:</span>
                            <span className="text-emerald-400 font-medium">{currSym}{pos.takeProfit.toFixed(2)}</span>
                          </div>
                        </div>

                        {/* Time and Actions */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono">
                            <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span>{openInfo.time} ({formatDuration(pos.durationMinutes)})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => { onSelectSession(pos.session.id); onNavigateToTerminal(); }}
                              className="px-2.5 py-1.5 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-800 text-xs font-semibold cursor-pointer"
                            >
                              Terminale &rarr;
                            </button>
                            <button
                              onClick={() => setPositionToClose({ session: pos.session, position: pos })}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-950 text-rose-300 border border-rose-800 text-xs font-bold hover:bg-rose-900 cursor-pointer"
                            >
                              Chiudi
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop View: Full detailed table with horizontal scroll */}
                <div className="hidden md:block border border-slate-800/90 rounded-2xl bg-slate-900/60 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto pb-4">
                    <table className="w-full min-w-[1080px] text-left text-xs border-collapse">
                      <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-3.5 px-3.5">Titolo / Strumento</th>
                          <th className="py-3.5 px-2.5">Tipo</th>
                          <th className="py-3.5 px-3">
                            <div className="flex items-center gap-1 text-cyan-400">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Apertura</span>
                            </div>
                          </th>
                          <th className="py-3.5 px-2.5 text-right">Quote</th>
                          <th className="py-3.5 px-2.5 text-right">Prezzo In</th>
                          <th className="py-3.5 px-2.5 text-right">Prezzo Live</th>
                          <th className="py-3.5 px-2.5 text-right">Stop Loss</th>
                          <th className="py-3.5 px-2.5 text-right">Take Profit</th>
                          <th className="py-3.5 px-3.5 text-right">P&L Non Realizzato</th>
                          <th className="py-3.5 px-2.5 text-center">Durata</th>
                          <th className="py-3.5 px-3.5 text-right">Azioni</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {displayedOpenPositions.map((pos) => {
                          const isProfit = pos.unrealizedPnlAmount >= 0;
                          const currSym = pos.currencySymbol || '€';
                          const openInfo = formatTradeTime(pos.entryDateStr, pos.entryTimestamp);

                          return (
                            <tr key={pos.id} className="hover:bg-slate-850/60 transition-colors">
                              {/* Titolo e Strategia */}
                              <td className="py-4 px-3.5 align-middle">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-white text-xs px-2.5 py-1 rounded-md bg-cyan-950/90 border border-cyan-800/80 shadow-xs">
                                    {pos.instrumentTicker}
                                  </span>
                                  <span className="text-slate-200 font-semibold truncate max-w-[200px]" title={pos.instrumentName}>
                                    {pos.instrumentName}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5 font-mono">
                                  <span className="text-slate-300 font-medium">{pos.strategyName}</span>
                                  <span>&bull;</span>
                                  <span className="text-cyan-300 font-bold">{pos.timeframe}</span>
                                </div>
                              </td>

                              {/* Tipo */}
                              <td className="py-4 px-2.5 align-middle font-bold">
                                <span
                                  className={`px-2.5 py-1 rounded text-[11px] font-bold inline-block ${
                                    pos.direction === 'LONG'
                                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                      : 'bg-rose-950 text-rose-300 border border-rose-800'
                                  }`}
                                >
                                  {pos.direction}
                                </span>
                              </td>

                              {/* Apertura */}
                              <td className="py-4 px-3 align-middle font-mono whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  <span className="font-bold text-cyan-300 text-xs bg-cyan-950/70 px-2 py-0.5 rounded border border-cyan-800/70">
                                    {openInfo.time}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-1 pl-5">{openInfo.date}</div>
                              </td>

                              {/* Quote */}
                              <td className="py-4 px-2.5 align-middle font-mono text-right text-slate-200 font-semibold">
                                {pos.quantity}
                              </td>

                              {/* Prezzo In */}
                              <td className="py-4 px-2.5 align-middle font-mono text-right text-cyan-300 font-medium">
                                {currSym}{pos.entryPrice.toFixed(2)}
                              </td>

                              {/* Prezzo Live */}
                              <td className="py-4 px-2.5 align-middle font-mono text-right text-white font-bold">
                                {currSym}{pos.currentPrice.toFixed(2)}
                              </td>

                              {/* Stop Loss */}
                              <td className="py-4 px-2.5 align-middle font-mono text-right text-rose-400 font-medium">
                                {currSym}{pos.stopLoss.toFixed(2)}
                              </td>

                              {/* Take Profit */}
                              <td className="py-4 px-2.5 align-middle font-mono text-right text-emerald-400 font-medium">
                                {currSym}{pos.takeProfit.toFixed(2)}
                              </td>

                              {/* P&L Non Realizzato */}
                              <td className="py-4 px-3.5 align-middle text-right font-mono font-bold whitespace-nowrap">
                                <span className={`text-xs ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {isProfit ? '+' : ''}{currSym}{pos.unrealizedPnlAmount.toFixed(2)}
                                </span>
                                <div className={`text-[11px] font-semibold mt-0.5 ${isProfit ? 'text-emerald-400/90' : 'text-rose-400/90'}`}>
                                  {isProfit ? '+' : ''}{pos.unrealizedPnlPercent.toFixed(2)}%
                                </div>
                              </td>

                              {/* Durata */}
                              <td className="py-4 px-2.5 align-middle text-center font-mono text-slate-300 text-[11px]">
                                {formatDuration(pos.durationMinutes)}
                              </td>

                              {/* Azioni */}
                              <td className="py-4 px-3.5 align-middle text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => {
                                      onSelectSession(pos.session.id);
                                      onNavigateToTerminal();
                                    }}
                                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                                    title="Apri terminale live dedicato di questo titolo"
                                  >
                                    <span>Terminale</span>
                                    <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                                  </button>

                                  <button
                                    onClick={() => setPositionToClose({ session: pos.session, position: pos })}
                                    className="px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-semibold text-xs transition-colors cursor-pointer shadow-xs"
                                    title="Chiudi manualmente questa posizione al prezzo live"
                                  >
                                    Chiudi
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
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* SCHEDA 3: POSIZIONI CHIUSE (STORICO) ORDINATE PER TITOLO */}
        {/* ======================================================== */}
        {activeTab === 'closed-positions' && (
          <div className="space-y-4 min-h-[75vh] pb-36">
            {/* Filter by ticker chips if multiple instruments */}
            {uniqueClosedTickers.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                <span className="text-slate-400 font-medium flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Filtra Titolo:</span>
                </span>
                <button
                  onClick={() => setTickerFilter(null)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !tickerFilter
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  Tutti ({sortedClosedTrades.length})
                </button>
                {uniqueClosedTickers.map((ticker) => {
                  const count = sortedClosedTrades.filter((t) => t.instrumentTicker.toUpperCase() === ticker.toUpperCase()).length;
                  const isSel = tickerFilter?.toUpperCase() === ticker.toUpperCase();
                  return (
                    <button
                      key={ticker}
                      onClick={() => setTickerFilter(isSel ? null : ticker)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                        isSel
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                      }`}
                    >
                      <span>{ticker}</span>
                      <span className={`px-1 rounded text-[10px] ${isSel ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {displayedClosedTrades.length === 0 ? (
              <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-12 text-center space-y-3">
                <Clock className="w-10 h-10 text-slate-600 mx-auto" />
                <h3 className="text-base font-bold text-white">
                  {tickerFilter
                    ? `Nessuna posizione chiusa per ${tickerFilter}`
                    : 'Nessuna operazione ancora chiusa nel portafoglio'}
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  I trade completati con relativi prezzi di ingresso/uscita, P&L netto realizzato e orari precisi al secondo verranno registrati qui e raggruppati in ordine di titolo.
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => setActiveTab('active-positions')}
                    className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs cursor-pointer"
                  >
                    Vedi Posizioni Attive ({totalOpenPositions})
                  </button>
                </div>
              </div>
            ) : (
              <div className="border border-slate-800/90 rounded-2xl bg-slate-900/60 shadow-sm overflow-hidden">
                <div className="overflow-x-auto pb-4">
                  <table className="w-full min-w-[1100px] text-left text-xs border-collapse">
                    <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-3.5 px-3.5">#</th>
                        <th className="py-3.5 px-3.5">Titolo / Strumento</th>
                        <th className="py-3.5 px-2.5">Tipo</th>
                        <th className="py-3.5 px-3">
                          <div className="flex items-center gap-1 text-cyan-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Ora Apertura</span>
                          </div>
                        </th>
                        <th className="py-3.5 px-3">
                          <div className="flex items-center gap-1 text-purple-400">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Ora Chiusura</span>
                          </div>
                        </th>
                        <th className="py-3.5 px-2.5 text-right">Prezzo In</th>
                        <th className="py-3.5 px-2.5 text-right">Prezzo Out</th>
                        <th className="py-3.5 px-2.5 text-right">Quote</th>
                        <th className="py-3.5 px-3.5 text-right">P&L Netto</th>
                        <th className="py-3.5 px-2.5 text-center">Durata</th>
                        <th className="py-3.5 px-3">Motivo Uscita</th>
                        <th className="py-3.5 px-3.5 text-right">Azioni</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {displayedClosedTrades.map((t) => {
                        const isWin = t.pnlAmount > 0;
                        const entryInfo = formatTradeTime(t.entryDateStr, t.entryTimestamp);
                        const exitInfo = formatTradeTime(t.exitDateStr, t.exitTimestamp);
                        const currSym = t.currencySymbol || '€';
                        const reasonBadge = formatExitReason(t.exitReason);

                        return (
                          <tr key={t.id} className="hover:bg-slate-850/60 transition-colors">
                            <td className="py-4 px-3.5 align-middle font-mono text-slate-500 font-bold">
                              #{t.tradeNumber}
                            </td>

                            {/* Titolo e Strategia */}
                            <td className="py-4 px-3.5 align-middle">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-white text-xs px-2.5 py-1 rounded-md bg-cyan-950/90 border border-cyan-800/80 shadow-xs">
                                  {t.instrumentTicker}
                                </span>
                                <span className="text-slate-200 font-semibold truncate max-w-[200px]" title={t.instrumentName}>
                                  {t.instrumentName}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5 font-mono">
                                <span className="text-slate-300 font-medium">{t.strategyName}</span>
                                <span>&bull;</span>
                                <span className="text-cyan-300 font-bold">{t.timeframe}</span>
                              </div>
                            </td>

                            {/* Tipo */}
                            <td className="py-4 px-2.5 align-middle font-bold">
                              <span
                                className={`px-2.5 py-1 rounded text-[11px] font-bold inline-block ${
                                  t.direction === 'LONG'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                                }`}
                              >
                                {t.direction}
                              </span>
                            </td>

                            {/* Apertura */}
                            <td className="py-4 px-3 align-middle font-mono whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                <span className="font-bold text-cyan-300 text-xs bg-cyan-950/70 px-2 py-0.5 rounded border border-cyan-800/70">
                                  {entryInfo.time}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1 pl-5">{entryInfo.date}</div>
                            </td>

                            {/* Chiusura */}
                            <td className="py-4 px-3 align-middle font-mono whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                                <span className="font-bold text-purple-300 text-xs bg-purple-950/70 px-2 py-0.5 rounded border border-purple-800/70">
                                  {exitInfo.time}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1 pl-5">{exitInfo.date}</div>
                            </td>

                            {/* Prezzo In */}
                            <td className="py-4 px-2.5 align-middle font-mono text-right text-cyan-300 font-medium">
                              {currSym}{t.entryPrice.toFixed(2)}
                            </td>

                            {/* Prezzo Out */}
                            <td className="py-4 px-2.5 align-middle font-mono text-right text-white font-bold">
                              {currSym}{t.exitPrice.toFixed(2)}
                            </td>

                            {/* Quote */}
                            <td className="py-4 px-2.5 align-middle font-mono text-right text-slate-200 font-semibold">
                              {t.quantity}
                            </td>

                            {/* P&L Netto */}
                            <td className="py-4 px-3.5 align-middle text-right font-mono font-bold whitespace-nowrap">
                              <span className={`text-xs ${isWin ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isWin ? '+' : ''}{currSym}{t.pnlAmount.toFixed(2)}
                              </span>
                              <div className={`text-[11px] font-semibold mt-0.5 ${isWin ? 'text-emerald-400/90' : 'text-rose-400/90'}`}>
                                {isWin ? '+' : ''}{t.pnlPercent.toFixed(2)}%
                              </div>
                            </td>

                            {/* Durata */}
                            <td className="py-4 px-2.5 align-middle text-center font-mono text-slate-300 text-[11px]">
                              {formatDuration(t.durationMinutes)}
                            </td>

                            {/* Motivo Uscita */}
                            <td className="py-4 px-3 align-middle whitespace-nowrap">
                              <span className={`px-2.5 py-1 rounded text-[10px] font-bold border inline-block ${reasonBadge.bg}`}>
                                {reasonBadge.text}
                              </span>
                            </td>

                            {/* Azioni */}
                            <td className="py-4 px-3.5 align-middle text-right whitespace-nowrap">
                              <button
                                onClick={() => {
                                  onSelectSession(t.session.id);
                                  onNavigateToTerminal();
                                }}
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-xs"
                                title="Apri terminale dedicato di questo titolo"
                              >
                                <span>Terminale</span>
                                <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual Position Close Confirmation Modal */}
      {positionToClose &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto animate-in fade-in-0 duration-150"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPositionToClose(null);
            }}
          >
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 max-w-md w-full my-auto max-h-[90vh] overflow-y-auto shadow-2xl space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Chiudere Posizione Manualmente?</h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Stai per chiudere la posizione <strong className="text-white">{positionToClose.position.direction}</strong> su <span className="text-cyan-400 font-mono font-bold">{positionToClose.session.instrument.ticker}</span> al prezzo di mercato corrente di <strong className="text-white font-mono">€{positionToClose.position.currentPrice.toFixed(2)}</strong>.
                  </p>
                </div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Prezzo di carico:</span>
                  <span className="text-slate-200">€{positionToClose.position.entryPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Quote in essere:</span>
                  <span className="text-slate-200">{positionToClose.position.quantity}</span>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-slate-800">
                  <span>P&L non realizzato stimato:</span>
                  <span className={positionToClose.position.unrealizedPnlAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {positionToClose.position.unrealizedPnlAmount >= 0 ? '+' : ''}€{positionToClose.position.unrealizedPnlAmount.toFixed(2)} ({positionToClose.position.unrealizedPnlPercent >= 0 ? '+' : ''}{positionToClose.position.unrealizedPnlPercent.toFixed(2)}%)
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPositionToClose(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClosePosition}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
                >
                  Conferma Chiusura
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Delete Confirmation Modal - Rendered via Portal directly on document.body */}
      {sessionToDelete &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto animate-in fade-in-0 duration-150"
            onClick={(e) => {
              if (e.target === e.currentTarget) setSessionToDelete(null);
            }}
          >
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 max-w-md w-full my-auto max-h-[90vh] overflow-y-auto shadow-2xl space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Rimuovere dal Paper Trading?</h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Stai per rimuovere la sessione di <strong className="text-white font-semibold">{sessionToDelete.instrument.name || sessionToDelete.instrument.ticker}</strong> (<span className="text-cyan-400 font-mono font-bold">{sessionToDelete.instrument.ticker}</span>) con algoritmo <span className="text-slate-300 font-mono">{sessionToDelete.strategyName}</span> [{sessionToDelete.timeframe}].
                  </p>
                </div>
              </div>

              {sessionToDelete.openPositions && sessionToDelete.openPositions.length > 0 && (
                <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Attenzione: ci sono <strong>{sessionToDelete.openPositions.length} posizione/i aperta/e</strong> che verranno chiuse immediatamente.
                  </span>
                </div>
              )}

              <p className="text-[11px] text-slate-400">
                Tutti i log di simulazione e lo storico ordini di questa sessione verranno eliminati dal portafoglio.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSessionToDelete(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Sì, Rimuovi Strategia</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Strategy Trigger & Waiting Condition Inspector Modal */}
      {sessionForTriggerModal && (
        <StrategyTriggerInspectorModal
          key={`trigger-inspector-${sessionForTriggerModal.id}`}
          isOpen={!!sessionForTriggerModal}
          onClose={() => setSessionForTriggerModal(null)}
          instrument={sessionForTriggerModal.instrument}
          strategyId={sessionForTriggerModal.strategyId}
          strategyName={sessionForTriggerModal.strategyName}
          strategyParams={sessionForTriggerModal.params}
          hasOpenPosition={sessionForTriggerModal.openPositions.length > 0}
          allocatedCapital={sessionForTriggerModal.currentCapital}
        />
      )}
    </div>
  );
};
