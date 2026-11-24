/**
 * QuantLab - Step 11 to 14 & 22: Automated Paper Trading Live Terminal & Execution Dashboard
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Activity,
  Play,
  Pause,
  FastForward,
  RotateCcw,
  Shield,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Sliders,
  DollarSign,
  Layers,
  Terminal,
  Zap,
  Radio,
  FileText,
  Trash2,
  XCircle,
  RefreshCw,
  Target,
  Sparkles,
  PieChart as PieIcon,
  ChevronRight,
  Filter,
  Brain,
  Loader2,
  ArrowUpDown,
} from 'lucide-react';
import { PaperTradingSession, Bar, Position, Trade, PaperLogEvent, Instrument } from '../types';
import { CopyableISIN } from './CopyableISIN';
import { globalPaperTradingEngine } from '../services/paperTradingEngine';
import { fetchLiveQuote } from '../services/marketDataService';
import { fetchLiveRealBar } from '../services/realMarketFeed';
import { StrategyTriggerInspectorModal } from './StrategyTriggerInspectorModal';
import { InstrumentReturnsChartModal } from './InstrumentReturnsChartModal';
import { PositionChartWithLevels } from './PositionChartWithLevels';
import { isMarketOpenForSymbol } from '../utils/marketHours';
import { INSTRUMENTS_DATABASE } from '../data/instruments';
import { resolveInstrumentISIN } from '../utils/isinHelper';
import { EntryDistributionSection } from './EntryDistributionSection';
import { calculateEntryDistribution, analyzeInactivity } from '../services/entryDistributionService';
import { backtestRegistryService } from '../services/backtestRegistryService';

const getTickerCurrencySymbol = (ticker: string): string => {
  const clean = (ticker || '').trim().toUpperCase();
  const found = INSTRUMENTS_DATABASE.find(
    (inst) => inst.ticker.toUpperCase() === clean || inst.id.toUpperCase() === clean
  );
  if (found && found.currencySymbol) return found.currencySymbol;
  if (clean.endsWith('.MI') || clean.endsWith('.DE') || clean.endsWith('.PA') || clean.endsWith('.AS') || clean.endsWith('.MC')) {
    return '€';
  }
  return '$';
};

const getInstrumentForTicker = (ticker: string, fallbackName?: string): Instrument => {
  const found = INSTRUMENTS_DATABASE.find(
    (inst) => inst.ticker.toUpperCase() === ticker.toUpperCase() || inst.id.toUpperCase() === ticker.toUpperCase()
  );
  if (found) return found;
  const clean = ticker.toUpperCase();
  const isEur = clean.endsWith('.MI') || clean.endsWith('.DE') || clean.endsWith('.PA') || clean.endsWith('.AS');
  return {
    id: ticker.toLowerCase(),
    ticker: clean,
    isin: resolveInstrumentISIN(ticker),
    name: fallbackName || ticker,
    type: 'STOCK',
    market: isEur ? 'Europe' : 'US',
    exchangeCode: isEur ? 'MTA' : 'NASDAQ',
    currency: isEur ? 'EUR' : 'USD',
    currencySymbol: isEur ? '€' : '$',
    currentPrice: 100,
    change24h: 0,
    change24hAmount: 0,
    volume24h: 100000,
    sector: 'Equity',
    description: fallbackName || ticker,
    dataRange: {
      startDate: '2020-01-01',
      endDate: '2026-09-01',
      totalBarsDaily: 1500,
    },
    dataQuality: {
      score: 95,
      missingBarsPct: 0.1,
      duplicateBarsCount: 0,
      volumeCompletenessPct: 99,
      priceAnomalyCount: 0,
      status: 'EXCELLENT',
    },
  };
};

export const formatTradeTime = (dateStr?: string, timestamp?: number) => {
  if (timestamp && typeof timestamp === 'number' && !isNaN(timestamp) && timestamp > 0) {
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return {
        time: `${hours}:${minutes}:${seconds}`,
        shortTime: `${hours}:${minutes}`,
        date: `${day}/${month}/${year}`,
        full: `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`,
      };
    }
  }

  if (dateStr) {
    if (dateStr.includes(' ')) {
      const parts = dateStr.split(' ');
      const datePart = parts[0];
      const timePart = parts[1];
      return {
        time: timePart,
        shortTime: timePart.substring(0, 5),
        date: datePart,
        full: dateStr,
      };
    }
    if (dateStr.includes('T')) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return {
          time: `${hours}:${minutes}:${seconds}`,
          shortTime: `${hours}:${minutes}`,
          date: `${day}/${month}/${year}`,
          full: `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`,
        };
      }
    }
    return {
      time: '--:--',
      shortTime: '--:--',
      date: dateStr,
      full: dateStr,
    };
  }

  return {
    time: '--:--',
    shortTime: '--:--',
    date: '--/--/----',
    full: '-',
  };
};

interface PaperTradingDashboardProps {
  session: PaperTradingSession;
  allSessions?: PaperTradingSession[];
  historicalBars: Bar[];
  onSelectSession: (id: string) => void;
  onNavigateToComparison: () => void;
  onNavigateToNewSearch: () => void;
  onNavigateToIntelligence?: (instrument: Instrument) => void;
  onOpenBacktest?: (session: PaperTradingSession) => void | Promise<void>;
  onNavigateToMulti?: () => void;
}

export const PaperTradingDashboard: React.FC<PaperTradingDashboardProps> = ({
  session,
  allSessions = [],
  historicalBars,
  onSelectSession,
  onNavigateToComparison,
  onNavigateToNewSearch,
  onNavigateToIntelligence,
  onOpenBacktest,
  onNavigateToMulti,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(session.isActive && !session.isPaused);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(10); // 1x, 5x, 10x, 60x, 200x
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'CONSTITUENTS' | 'POSITIONS' | 'LOGS' | 'HISTORY' | 'ENTRY_DISTRIBUTION'>('OVERVIEW');
  const [positionSubTab, setPositionSubTab] = useState<'ACTIVE' | 'CLOSED'>('ACTIVE');
  const [selectedConstituentTicker, setSelectedConstituentTicker] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<'ALL' | 'ORDER' | 'SIGNAL' | 'RISK'>('ALL');
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [showTriggerInspector, setShowTriggerInspector] = useState<boolean>(false);
  const [chartModalInstrument, setChartModalInstrument] = useState<Instrument | null>(null);
  const [isOpeningBacktest, setIsOpeningBacktest] = useState<boolean>(false);
  const terminalTabsRef = useRef<HTMLDivElement>(null);

  const handleOpenBacktestClick = async () => {
    if (!onOpenBacktest || isOpeningBacktest) return;
    setIsOpeningBacktest(true);
    try {
      await onOpenBacktest(session);
    } catch (err) {
      console.error('[PaperTradingDashboard] Errore apertura backtest:', err);
    } finally {
      setIsOpeningBacktest(false);
    }
  };

  // Lock body scroll and listen for Escape key when delete modal is open
  useEffect(() => {
    if (!showDeleteModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDeleteModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showDeleteModal]);

  // In-memory feed state for stepping forward
  const feedIndexRef = useRef<number>(0);
  const timerRef = useRef<any>(null);

  // Sync isPlaying state
  useEffect(() => {
    setIsPlaying(session.isActive && !session.isPaused);
  }, [session.isActive, session.isPaused]);

  // Reset constituent filter if session changes
  useEffect(() => {
    setSelectedConstituentTicker(null);
    if (!session.isPortfolio && activeTab === 'CONSTITUENTS') {
      setActiveTab('OVERVIEW');
    }
  }, [session.id, session.isPortfolio]);

  // Real-Market Live Polling Loop (Syncs with Cloud Server State)
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const pollRealMarket = async () => {
      try {
        // Sync latest state from 24/7 Cloud Background Engine
        await globalPaperTradingEngine.fetchFromServer();
      } catch (err) {
        console.warn('[PaperTradingDashboard] Errore polling sync server:', err);
      }
    };

    // Run immediately once
    pollRealMarket();

    // Poll cloud engine every 3.5 seconds
    timerRef.current = setInterval(pollRealMarket, 3500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, session.id]);

  const handleTogglePlay = async () => {
    const wasPaused = session.isPaused || !session.isActive;
    globalPaperTradingEngine.togglePauseSession(session.id);
    if (wasPaused) {
      try {
        await fetch(`/api/paper/sessions/${session.id}/step`, { method: 'POST' });
        await globalPaperTradingEngine.fetchFromServer();
      } catch (_) {}
    }
  };

  const handleStepOnce = async () => {
    try {
      await fetch(`/api/paper/sessions/${session.id}/step`, { method: 'POST' });
      await globalPaperTradingEngine.fetchFromServer();
    } catch (e) {
      console.warn('[PaperTradingDashboard] Step once error:', e);
    }
  };

  const handleManualClose = (positionId: string, currentPrice: number) => {
    globalPaperTradingEngine.manualClosePosition(session.id, positionId, currentPrice);
  };

  const handleDeleteSession = () => {
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = () => {
    globalPaperTradingEngine.deleteSession(session.id);
    setShowDeleteModal(false);
  };

  // Aggregate Calculations
  const allOpenPos = useMemo(() => {
    const map = new Map<string, Position>();
    (session.openPositions || []).forEach((p) => { if (p && p.id) map.set(p.id, p); });
    if (session.constituents) {
      session.constituents.forEach((c) => {
        (c.openPositions || []).forEach((cp) => {
          if (cp && cp.id && !map.has(cp.id)) map.set(cp.id, cp);
        });
      });
    }
    return Array.from(map.values());
  }, [session.openPositions, session.constituents]);

  const allClosed = useMemo(() => {
    const map = new Map<string, Trade>();
    const seen = new Set<string>();
    const addTrade = (t: Trade) => {
      if (!t || !t.id) return;
      const key = `${t.symbol}_${t.entryTimestamp}_${t.direction}_${t.quantity}`;
      if (seen.has(key)) return;
      seen.add(key);
      map.set(t.id, t);
    };
    (session.closedTrades || []).forEach(addTrade);
    if (session.constituents) {
      session.constituents.forEach((c) => {
        (c.closedTrades || []).forEach(addTrade);
      });
    }
    return Array.from(map.values()).sort((a, b) => (b.exitTimestamp || 0) - (a.exitTimestamp || 0));
  }, [session.closedTrades, session.constituents]);

  // Filtered positions and trades when inspecting a single constituent
  const openPos = useMemo(() => {
    if (!session.isPortfolio || !selectedConstituentTicker) return allOpenPos;
    return allOpenPos.filter((p) => p.symbol.toUpperCase() === selectedConstituentTicker.toUpperCase());
  }, [session.isPortfolio, selectedConstituentTicker, allOpenPos]);

  const closed = useMemo(() => {
    if (!session.isPortfolio || !selectedConstituentTicker) return allClosed;
    return allClosed.filter((t) => t.symbol.toUpperCase() === selectedConstituentTicker.toUpperCase());
  }, [session.isPortfolio, selectedConstituentTicker, allClosed]);

  // Sorted positions and trades alphabetically by symbol / ticker
  const sortedOpenPositions = useMemo(() => {
    return [...openPos].sort((a, b) => (a.symbol || '').localeCompare(b.symbol || ''));
  }, [openPos]);

  const sortedClosedTrades = useMemo(() => {
    return [...closed].sort((a, b) => {
      const cmp = (a.symbol || '').localeCompare(b.symbol || '');
      if (cmp !== 0) return cmp;
      return (b.exitTimestamp || 0) - (a.exitTimestamp || 0);
    });
  }, [closed]);

  const totalUnrealized = allOpenPos.reduce((sum, p) => sum + p.unrealizedPnlAmount, 0);
  const netPnl = session.currentCapital - session.initialCapital + totalUnrealized;
  const netPnlPct = (netPnl / session.initialCapital) * 100;
  const totalEquity = session.currentCapital + totalUnrealized;

  const wins = allClosed.filter((t) => t.pnlAmount > 0).length;
  const winRate = allClosed.length > 0 ? (wins / allClosed.length) * 100 : 0;
  const grossWin = allClosed.filter((t) => t.pnlAmount > 0).reduce((s, t) => s + t.pnlAmount, 0);
  const grossLoss = Math.abs(allClosed.filter((t) => t.pnlAmount <= 0).reduce((s, t) => s + t.pnlAmount, 0));
  const liveProfitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 5.0 : 0;

  // Filtered decision logs
  const filteredLogs = session.logs.filter((l) => {
    if (logFilter === 'ALL') return true;
    if (logFilter === 'ORDER') return l.category === 'EXECUTION' || l.level === 'ORDER';
    if (logFilter === 'SIGNAL') return l.level === 'SIGNAL';
    if (logFilter === 'RISK') return l.category === 'RISK';
    return true;
  });

  const marketStatus = useMemo(() => {
    return isMarketOpenForSymbol(session.instrument.ticker);
  }, [session.instrument.ticker]);

  // Historical Entry Distribution & Inactivity Analysis for this strategy (Requirement 1, 2, 6)
  const entryDistributionStats = useMemo(() => {
    // 1. Direct session distribution
    if (session.entryDistribution && session.entryDistribution.totalTrades > 0) {
      return session.entryDistribution;
    }
    // 2. Attached backtestReference distribution
    if (session.backtestReference?.entryDistribution && session.backtestReference.entryDistribution.totalTrades > 0) {
      return session.backtestReference.entryDistribution;
    }
    // 3. Stable Lookup by backtestId from Backtest Registry
    if (session.backtestId) {
      const bt = backtestRegistryService.getBacktest(session.backtestId);
      if (bt) {
        if (bt.entryDistribution && bt.entryDistribution.totalTrades > 0) {
          return bt.entryDistribution;
        }
        if (bt.trades && bt.trades.length > 0) {
          return calculateEntryDistribution(bt.trades, bt.startDate, bt.endDate);
        }
      }
    }
    // 4. Fallback lookup by strategyId, ticker, timeframe in registry
    const fallbackBt = backtestRegistryService.findBacktestForSession(session);
    if (fallbackBt) {
      if (fallbackBt.entryDistribution && fallbackBt.entryDistribution.totalTrades > 0) {
        return fallbackBt.entryDistribution;
      }
      if (fallbackBt.trades && fallbackBt.trades.length > 0) {
        return calculateEntryDistribution(fallbackBt.trades, fallbackBt.startDate, fallbackBt.endDate);
      }
    }
    // 5. Fallback: calculate from closedTrades if enough real trades exist in paper session
    if (session.closedTrades && session.closedTrades.length >= 2) {
      return calculateEntryDistribution(session.closedTrades);
    }
    // Explicitly return undefined when no genuine backtest/trade data exists. NEVER return hardcoded 35.0!
    return undefined;
  }, [
    session.entryDistribution,
    session.backtestReference,
    session.backtestId,
    session.closedTrades,
    session.strategyId,
    session.instrument?.ticker,
    session.timeframe,
  ]);

  // Live days since last entry
  const inactivityAnalysis = useMemo(() => {
    let latestEntryTs = 0;
    let latestEntryDate = '';
    for (const p of session.openPositions) {
      if (p.entryTimestamp > latestEntryTs) {
        latestEntryTs = p.entryTimestamp;
        latestEntryDate = p.entryDateStr;
      }
    }
    for (const t of session.closedTrades) {
      if (t.entryTimestamp > latestEntryTs) {
        latestEntryTs = t.entryTimestamp;
        latestEntryDate = t.entryDateStr;
      }
    }
    const now = Date.now();
    let days = 0;
    if (latestEntryTs > 0) {
      days = Math.max(0, (now - latestEntryTs) / (1000 * 60 * 60 * 24));
    } else {
      const sessionAgeDays = Math.max(0.1, (now - session.startedAt) / (1000 * 60 * 60 * 24));
      days = Math.min(sessionAgeDays, 30);
      latestEntryDate = 'Inizio Sessione';
    }

    if (!entryDistributionStats) {
      return {
        daysSinceLastEntry: Math.round(days),
        lastEntryDateStr: latestEntryDate || 'N/D',
        status: 'NORMAL' as const,
        statusLabel: 'Dati N/D',
        statusBadgeColor: 'slate',
        statusIcon: '⚪',
        syntheticDiagnosticPhrase: `Nessun ingresso da ${Math.round(days)} giorni (Distribuzione backtest N/D).`,
        detailedDiagnosticMessage: 'Distribuzione storica ingressi non ancora calcolata o collegata a questa sessione. Collega o esegui il backtest per analizzare i tempi normali di inattività.',
        percentileAchieved: 0,
        historicalP90Days: 0,
        historicalP95Days: 0,
        historicalMaxPauseDays: 0,
        disclaimer: 'Dati statistici di distribuzione ingressi non disponibili (N/D).',
      };
    }

    return analyzeInactivity(entryDistributionStats, days, latestEntryDate);
  }, [entryDistributionStats, session.openPositions, session.closedTrades, session.startedAt]);

  return (
    <div className="space-y-6">
      {/* Real-time Streaming & Simulation Control Bar (Step 11 & 18) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Active Session Info & Dropdown Switcher */}
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center ${
              session.isPortfolio
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}>
              {session.isPortfolio ? <PieIcon className="w-6 h-6" /> : <Activity className="w-6 h-6" />}
            </div>
            {isPlaying && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 animate-ping" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                onClick={() => setChartModalInstrument(session.instrument)}
                className="text-lg sm:text-xl font-extrabold text-white tracking-tight cursor-pointer hover:text-cyan-300 transition-colors"
                title="Clicca per visualizzare il grafico e i dati storici"
              >
                {session.isPortfolio
                  ? (session.portfolioName || 'Portafoglio Unger Diversificato')
                  : (session.instrument.name || session.instrument.ticker)}
              </h2>
              <span className={`px-2.5 py-0.5 rounded-lg font-mono font-bold text-xs border ${
                session.isPortfolio
                  ? 'bg-amber-950/90 text-amber-300 border-amber-800/80'
                  : 'bg-cyan-950/90 text-cyan-300 border-cyan-800/80'
              }`}>
                {session.isPortfolio
                  ? `PORTAFOGLIO GLOBALE (${session.constituents?.length || 0} ASSET)`
                  : session.instrument.ticker}
              </span>

              {!session.isPortfolio && session.instrument?.isin && (
                <CopyableISIN isin={session.instrument.isin} size="xs" variant="badge" />
              )}

              {/* View Chart & Historical Returns Modal Button */}
              <button
                type="button"
                onClick={() => setChartModalInstrument(session.instrument)}
                className="px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-cyan-950/60 border border-slate-700 hover:border-cyan-500/60 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer shrink-0"
                title="Visualizza grafico rendimenti, candele e statistiche di questo titolo"
              >
                <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Grafico & Dati</span>
              </button>

              {/* View Market Intelligence & AI Analysis Button */}
              {onNavigateToIntelligence && !session.isPortfolio && (
                <button
                  type="button"
                  onClick={() => onNavigateToIntelligence(session.instrument)}
                  className="px-2.5 py-1 rounded-lg bg-indigo-950/80 hover:bg-indigo-900/80 border border-indigo-700/60 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer shrink-0"
                  title="Consulta Market Intelligence e sintesi AI per questo titolo"
                >
                  <Brain className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Market Intelligence</span>
                </button>
              )}

              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  isPlaying ? 'bg-emerald-500 text-slate-950 animate-pulse font-extrabold' : 'bg-amber-950 text-amber-300 border border-amber-800/70'
                }`}
              >
                {isPlaying ? '● LIVE PAPER' : '⏸ IN PAUSA'}
              </span>

              {allSessions.length > 1 && (
                <div className="ml-1">
                  <select
                    value={session?.id || ''}
                    onChange={(e) => onSelectSession(e.target.value)}
                    className="bg-slate-950 border border-slate-700/80 rounded-lg text-xs font-mono text-cyan-300 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer max-w-[320px] truncate"
                    title="Seleziona titolo o portafoglio attivo"
                  >
                    {allSessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.isPortfolio
                          ? `📁 [Portafoglio Globale] ${s.portfolioName || 'Portafoglio Unger'} (${s.constituents?.length || 0} Titoli)`
                          : `${s.instrument.name || s.instrument.ticker} (${s.instrument.ticker}) — ${s.strategyName} [${s.timeframe}]`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {onNavigateToMulti && (
                <button
                  id="paper-open-multi-overview-btn"
                  onClick={onNavigateToMulti}
                  className="ml-1 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/80 text-xs font-semibold transition-all cursor-pointer shadow-xs"
                  title="Apri visione d'insieme e statistiche aggregate di tutte le strategie attive"
                >
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">Visione d'Insieme</span>
                  <span className="sm:hidden">Multi</span>
                  {allSessions.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-md bg-cyan-900/90 text-cyan-200 text-[10px] font-mono">
                      {allSessions.length}
                    </span>
                  )}
                </button>
              )}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
              <span>
                Strategia: <strong className="text-slate-200 font-medium">{session.strategyName}</strong>
              </span>
              <span>&bull;</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono text-[11px] font-semibold">
                {session.isPortfolio ? `${session.constituents?.length || 0} Titoli Integrati` : session.timeframe}
              </span>
              <span>&bull;</span>
              <span className="flex items-center gap-1.5" title="Frequenza operativa annualizzata calcolata sul backtest reale">
                <span>Trade/anno (Backtest):</span>
                <strong
                  id="paper-trades-per-year-stat"
                  className={`font-mono font-bold ${
                    entryDistributionStats?.tradesPerYear !== undefined ? 'text-cyan-300' : 'text-slate-500'
                  }`}
                >
                  {entryDistributionStats?.tradesPerYear !== undefined
                    ? `${entryDistributionStats.tradesPerYear.toFixed(1)}/anno`
                    : 'N/D'}
                </strong>
              </span>
              <span>&bull;</span>
              <span>
                {session.isPortfolio ? (
                  <>Capitale Portafoglio: <strong className="text-emerald-400 font-mono font-bold">€{totalEquity.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</strong></>
                ) : (
                  <>Prezzo Live: <strong className="text-emerald-400 font-mono font-bold">{session.instrument.currencySymbol}{session.lastBarProcessed?.close.toFixed(2) || session.instrument.currentPrice.toFixed(2)}</strong></>
                )}
              </span>
              <span>&bull;</span>
              <span>
                Rischio: <strong className="text-cyan-400 font-mono">{session.riskPerTradePct}%</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Right: Simulation Player Controls & Removal Button */}
        <div className="flex items-center gap-2.5 flex-wrap self-start lg:self-auto">
          {/* Direct Link to Original Backtest (Requirement 3 & 4) */}
          {onOpenBacktest && (
            <button
              id="paper-open-backtest-btn"
              disabled={isOpeningBacktest}
              onClick={handleOpenBacktestClick}
              className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-75 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md hover:shadow-blue-500/20 cursor-pointer disabled:cursor-wait"
              title="Apri direttamente il backtest originale associato a questa strategia (verifica ID univoco)"
            >
              {isOpeningBacktest ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Apertura Backtest...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 text-white" />
                  <span>Apri Backtest</span>
                </>
              )}
            </button>
          )}

          {/* Play / Pause */}
          <button
            id="paper-play-pause-btn"
            onClick={handleTogglePlay}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md cursor-pointer ${
              isPlaying
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
            }`}
            title={isPlaying ? 'Metti in pausa il feed live' : 'Avvia esecuzione live'}
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-current" />
                <span>Pausa Feed</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Avvia Live</span>
              </>
            )}
          </button>

          {/* Refresh Real Market Quote */}
          <button
            id="paper-refresh-quote-btn"
            onClick={handleStepOnce}
            className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
            title="Aggiorna quotazione reale istantanea di borsa"
          >
            <RefreshCw className="w-4 h-4 text-cyan-400" />
            <span>Aggiorna Prezzo Borsa</span>
          </button>

          {/* Clean Reset & AI Dynamic Swing Restart */}
          <button
            id="paper-clean-reset-ai-btn"
            onClick={async () => {
              const { newSession } = await globalPaperTradingEngine.resetCleanAndStartAiSwing({
                timeframe: '1h',
                initialCapital: 10000,
              });
              if (newSession && onSelectSession) {
                onSelectSession(newSession.id);
              }
            }}
            className="px-3 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-bold flex items-center gap-1.5 border border-emerald-500/40 transition-colors cursor-pointer"
            title="Azzera tutte le sessioni passate e riavvia da zero il Portafoglio AI Rotazione Dinamica (Swing 1h) con prezzi reali verificati"
          >
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span>Reset Pulito & Riavvia AI (1h)</span>
          </button>

          {/* Real Feed Frequency & Engine Status Badge */}
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 rounded-xl border border-cyan-900/50 cursor-help"
            title="Frequenza aggiornamento: Il motore di simulazione cloud processa i tick ogni 15s con dati di borsa reali. L'interfaccia UI esegue il polling ogni 3.5s (oppure istantaneo premendo 'Aggiorna Prezzo Borsa')."
          >
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-[11px] font-mono text-cyan-300 font-bold">Live (Tick 15s • Polling 3.5s)</span>
          </div>

          {/* Market Open/Closed Status Badge */}
          <div
            id="paper-market-status-badge"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-mono font-bold ${
              marketStatus.isOpen
                ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-400'
                : 'bg-amber-950/70 border-amber-800/80 text-amber-300'
            }`}
            title={`${marketStatus.reason}${marketStatus.nextOpenNotice ? ` • ${marketStatus.nextOpenNotice}` : ''}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                marketStatus.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>{marketStatus.isOpen ? 'Borsa Aperta' : 'Borsa Chiusa (Weekend/Off)'}</span>
          </div>

          {/* Trigger Condition Inspector Button */}
          <button
            id="paper-trigger-inspector-btn"
            onClick={() => setShowTriggerInspector(true)}
            className="px-3 py-2.5 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            title="Visualizza grafico del livello di trigger e le condizioni che la strategia sta attendendo"
          >
            <Target className="w-4 h-4 text-cyan-400" />
            <span>Radar Trigger & Attesa</span>
          </button>

          {/* Comparison shortcut */}
          <button
            onClick={onNavigateToComparison}
            className="px-3 py-2.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-800 text-purple-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Zap className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Confronto vs Backtest</span>
          </button>

          {/* Remove from Paper Trading Button */}
          <button
            id="paper-remove-strategy-btn"
            onClick={handleDeleteSession}
            className="px-3 py-2.5 rounded-xl bg-rose-950/70 hover:bg-rose-900 border border-rose-800/80 text-rose-300 hover:text-rose-100 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            title="Rimuovi ed elimina questa strategia dal Paper Trading"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>Rimuovi dal Paper Trading</span>
          </button>
        </div>
      </div>

      {/* 24/7 Cloud Background Execution Info Bar */}
      <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900/80 to-cyan-950/60 border border-emerald-500/30 rounded-2xl p-3.5 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-emerald-300 uppercase tracking-wider">
                Motore Cloud H24 Attivo (Node.js + Firebase Firestore)
              </span>
              <span className="px-1.5 py-0.5 rounded bg-emerald-900/60 text-[10px] font-mono text-emerald-200 border border-emerald-700/50">
                Esecuzione Continuativa h24
              </span>
            </div>
            <p className="text-[11px] text-slate-300">
              Le tue strategie girano sul server in background: puoi <strong>chiudere il browser o spegnere il PC</strong>, la simulazione e gli ordini continueranno a essere eseguiti e salvati.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <button
            onClick={() => globalPaperTradingEngine.fetchFromServer()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
            title="Sincronizza ora con il server cloud"
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Sincronizzato</span>
          </button>
        </div>
      </div>

      {/* Session Consolidated into Portfolio Banner */}
      {session.isConsolidated && (
        <div className="bg-indigo-950/70 border border-indigo-700/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black text-indigo-300 uppercase tracking-wider">
                  Sessione Consolidata nel Portafoglio Unger
                </span>
                <span className="px-2 py-0.5 rounded bg-indigo-900/60 text-[10px] font-mono text-indigo-200 border border-indigo-700/60">
                  Nuove operazioni delegate
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Questa sessione singola è stata consolidata nel Portafoglio Globale Multi-Asset Diversificato per eliminare il rischio specifico di drawdown e i whipsaw contro-trend. Lo storico dei trade e il capitale rimangono tracciati integralmente.
              </p>
            </div>
          </div>
          {allSessions.find((s) => s.isPortfolio || s.strategyCategory === 'MULTI_STRATEGY' || s.id.includes('portfolio')) && (
            <button
              onClick={() => {
                const port = allSessions.find((s) => s.isPortfolio || s.strategyCategory === 'MULTI_STRATEGY' || s.id.includes('portfolio'));
                if (port) onSelectSession(port.id);
              }}
              className="px-3.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-slate-950 text-xs font-bold shrink-0 transition-all cursor-pointer shadow-sm"
            >
              Apri Portafoglio Globale &rarr;
            </button>
          )}
        </div>
      )}

      {/* Macro Regime Filter & Unger Gating Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-cyan-950 border border-cyan-800/80 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-white">Filtro di Regime Macro (Metodo Unger)</span>
              <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 text-[10px] font-mono font-bold border border-cyan-800/60">
                SMA 200 &middot; ATR 14 Gating
              </span>
              <span className="text-[11px] font-mono text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Protezione Contro-Trend Attiva
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {session.isPortfolio
                ? `Il portafoglio applica il filtro di trend macro a tutti i ${session.constituents?.length || 6} mercati costituenti su timeframe Daily Swing.`
                : (session.regimeFilter?.statusText || `Prezzo monitorato rispetto alla SMA 200: ingressi LONG ammessi solo se Prezzo > SMA 200, ingressi SHORT ammessi solo se Prezzo < SMA 200.`)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto shrink-0 font-mono text-xs">
          {session.regimeFilter?.lastSma200 ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
              <span>SMA 200: <strong className="text-white">€{session.regimeFilter.lastSma200.toFixed(2)}</strong></span>
              <span>&bull;</span>
              <span className={session.regimeFilter.currentRegime === 'BULLISH' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {session.regimeFilter.currentRegime === 'BULLISH' ? 'Trend Rialzista' : 'Trend Ribassista'}
              </span>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-cyan-300 text-[11px]">
              Gating di Regime Conforme
            </div>
          )}
        </div>
      </div>

      {/* Live Financial Metrics Banner (Step 12 & 13) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Equity */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-slate-400 text-xs font-medium">Capitale Attuale (Equity)</div>
          <div className="text-xl font-black font-mono text-white">
            €{totalEquity.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500">
            Iniziale: €{session.initialCapital.toLocaleString()}
          </div>
        </div>

        {/* Total Net PnL */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-slate-400 text-xs font-medium">P&L Netto Realizzato+Open</div>
          <div className={`text-xl font-black font-mono ${netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {netPnl >= 0 ? '+' : ''}€{netPnl.toFixed(2)}
          </div>
          <div className={`text-[11px] font-mono font-bold ${netPnlPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {netPnlPct >= 0 ? '+' : ''}{netPnlPct.toFixed(2)}%
          </div>
        </div>

        {/* Open Positions - Clickable to bring user to active positions */}
        <div
          id="paper-card-total-open-positions"
          role="button"
          tabIndex={0}
          onClick={() => {
            setActiveTab('POSITIONS');
            setPositionSubTab('ACTIVE');
            setTimeout(() => {
              if (terminalTabsRef.current) {
                terminalTabsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }, 50);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setActiveTab('POSITIONS');
              setPositionSubTab('ACTIVE');
              setTimeout(() => {
                if (terminalTabsRef.current) {
                  terminalTabsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }, 50);
            }
          }}
          className={`bg-slate-900/60 border rounded-2xl p-3 sm:p-4 space-y-1 cursor-pointer transition-all hover:bg-slate-850/90 group shadow-sm ${
            activeTab === 'POSITIONS' && positionSubTab === 'ACTIVE'
              ? 'border-cyan-500 ring-1 ring-cyan-500/50 bg-slate-850/90'
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
          <div className="text-lg sm:text-2xl font-black font-mono text-cyan-300 mt-0.5 flex items-baseline gap-2 whitespace-nowrap">
            <span>{openPos.length}</span>
            {openPos.length > 0 ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/80">
                In Essere
              </span>
            ) : (
              <span className="text-[10px] text-slate-500 font-normal">
                0 aperte
              </span>
            )}
          </div>
          <div className="text-[10px] sm:text-[11px] text-slate-400 font-mono mt-1 flex items-center justify-between whitespace-nowrap">
            <span>Unrealized: {totalUnrealized >= 0 ? '+' : ''}€{totalUnrealized.toFixed(2)}</span>
            <span className="text-cyan-400/80 text-[10px] underline group-hover:text-cyan-300">dettagli</span>
          </div>
        </div>

        {/* Win Rate */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-slate-400 text-xs font-medium">Win Rate Live</div>
          <div className="text-xl font-black font-mono text-slate-100">
            {winRate.toFixed(1)}%
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {wins}V / {closed.length - wins}P ({closed.length} trade)
          </div>
        </div>

        {/* Profit Factor */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-slate-400 text-xs font-medium">Profit Factor Live</div>
          <div className="text-xl font-black font-mono text-emerald-400">
            {liveProfitFactor.toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            Atteso BT: {session.backtestReference?.metrics.profitFactor.toFixed(2) || 'N/A'}
          </div>
        </div>

        {/* Frictions Applied */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-1">
          <div className="text-slate-400 text-xs font-medium">Frizione & Spese</div>
          <div className="text-sm font-bold font-mono text-slate-200 mt-1">
            Comm: {session.commissionPct}%
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            Slippage: {session.slippagePct}%
          </div>
        </div>
      </div>

      {/* Live Inactivity Diagnostic Banner (Requirement 9 & 10) */}
      <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
        inactivityAnalysis.status === 'NORMAL'
          ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
          : inactivityAnalysis.status === 'ELEVATED_WAIT'
          ? 'bg-amber-950/30 border-amber-500/30 text-amber-200'
          : inactivityAnalysis.status === 'UNUSUAL'
          ? 'bg-orange-950/30 border-orange-500/30 text-orange-200'
          : 'bg-rose-950/30 border-rose-500/40 text-rose-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-base shrink-0 border ${
            inactivityAnalysis.status === 'NORMAL'
              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
              : inactivityAnalysis.status === 'ELEVATED_WAIT'
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
              : inactivityAnalysis.status === 'UNUSUAL'
              ? 'bg-orange-500/20 border-orange-500/40 text-orange-400'
              : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
          }`}>
            {inactivityAnalysis.statusIcon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                Diagnostica Live Inattività & Pause
              </span>
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${
                inactivityAnalysis.status === 'NORMAL'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : inactivityAnalysis.status === 'ELEVATED_WAIT'
                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                  : inactivityAnalysis.status === 'UNUSUAL'
                  ? 'bg-orange-950 text-orange-300 border border-orange-800'
                  : 'bg-rose-950 text-rose-300 border border-rose-800'
              }`}>
                {inactivityAnalysis.statusLabel}
              </span>
            </div>
            <div className="text-sm font-bold text-white mt-0.5">
              {inactivityAnalysis.syntheticDiagnosticPhrase}
            </div>
          </div>
        </div>

        <button
          onClick={() => setActiveTab('ENTRY_DISTRIBUTION')}
          className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-cyan-300 hover:text-white flex items-center gap-1.5 transition-colors self-start sm:self-auto shrink-0 shadow-sm cursor-pointer"
        >
          <Clock className="w-3.5 h-3.5 text-cyan-400" />
          <span>Vedi Distribuzione Ingressi</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Terminal Tabs */}
      <div ref={terminalTabsRef} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-4 scroll-mt-24">
        {/* Navigation Sub-Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('OVERVIEW')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'OVERVIEW'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Grafico Equity Live ({session.equityHistory.length})
            </button>
            <button
              onClick={() => setActiveTab('POSITIONS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'POSITIONS'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Posizioni Aperte</span>
              {openPos.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              )}
              <span className="font-mono text-[11px]">({openPos.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('LOGS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'LOGS'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Decision Log ({session.logs.length})</span>
            </button>
            {session.isPortfolio && (
              <button
                id="tab-constituents-btn"
                onClick={() => setActiveTab('CONSTITUENTS')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === 'CONSTITUENTS'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <PieIcon className="w-3.5 h-3.5" />
                <span>Dettaglio Titoli ({session.constituents?.length || 0})</span>
                {selectedConstituentTicker && (
                  <span className="px-1.5 py-0.2 rounded bg-amber-500 text-slate-950 text-[9px] font-black uppercase">
                    {selectedConstituentTicker}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => setActiveTab('HISTORY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'HISTORY'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Storico Trade ({closed.length})
            </button>
            <button
              onClick={() => setActiveTab('ENTRY_DISTRIBUTION')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'ENTRY_DISTRIBUTION'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Distribuzione Ingressi</span>
              <span className={`w-2 h-2 rounded-full ${
                inactivityAnalysis.status === 'NORMAL'
                  ? 'bg-emerald-400'
                  : inactivityAnalysis.status === 'ELEVATED_WAIT'
                  ? 'bg-amber-400'
                  : inactivityAnalysis.status === 'UNUSUAL'
                  ? 'bg-orange-400'
                  : 'bg-rose-500'
              }`} />
            </button>
          </div>

          <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Feed attivo &bull; Ordini simulati istantanei</span>
          </div>
        </div>

        {/* Tab 1: Live Real-Time Equity Curve */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-4">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={session.equityHistory} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="timestamp"
                    stroke="#64748b"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(ts) => {
                      const d = new Date(ts);
                      return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
                    }}
                  />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} domain={['auto', 'auto']} tickFormatter={(v) => `€${v.toLocaleString()}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                    labelFormatter={(ts) => new Date(Number(ts)).toLocaleTimeString()}
                    formatter={(v: any) => [`€${Number(v).toFixed(2)}`, 'Equity']}
                  />
                  <Line
                    type="monotone"
                    dataKey="equity"
                    name="Equity Live"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Quick Open Position summary card */}
            {openPos.length > 0 && (
              <div className="p-4 rounded-xl bg-slate-950 border border-emerald-500/30 space-y-2.5 animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                    <span className="font-bold text-sm text-white">
                      Posizione Attiva: {openPos[0].direction} {openPos[0].quantity} quote @ {session.instrument.currencySymbol || '€'}{openPos[0].entryPrice}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 font-mono text-[11px] border border-cyan-800 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-cyan-400" />
                      <span>
                        Aperta alle: <strong className="text-white font-bold">{formatTradeTime(openPos[0].entryDateStr, openPos[0].entryTimestamp).time}</strong> ({formatTradeTime(openPos[0].entryDateStr, openPos[0].entryTimestamp).date})
                      </span>
                    </span>
                  </div>
                  <div className="font-mono font-bold text-sm">
                    <span className={openPos[0].unrealizedPnlAmount >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {openPos[0].unrealizedPnlAmount >= 0 ? '+' : ''}{session.instrument.currencySymbol || '€'}{openPos[0].unrealizedPnlAmount.toFixed(2)} ({openPos[0].unrealizedPnlPercent >= 0 ? '+' : ''}{openPos[0].unrealizedPnlPercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
                <div className="text-xs text-slate-400 flex flex-wrap gap-4 pt-2 border-t border-slate-800/80">
                  <span>Stop Loss: <strong className="text-rose-400 font-mono">{session.instrument.currencySymbol || '€'}{openPos[0].stopLoss.toFixed(2)}</strong></span>
                  <span>Take Profit: <strong className="text-emerald-400 font-mono">{session.instrument.currencySymbol || '€'}{openPos[0].takeProfit.toFixed(2)}</strong></span>
                  <span>Prezzo Spot: <strong className="text-white font-mono">{session.instrument.currencySymbol || '€'}{openPos[0].currentPrice.toFixed(2)}</strong></span>
                  <span>Durata: <strong className="text-slate-300 font-mono">{openPos[0].durationMinutes}m</strong></span>
                  <button
                    onClick={() => setActiveTab('POSITIONS')}
                    className="text-cyan-400 hover:text-cyan-300 font-bold underline ml-auto cursor-pointer"
                  >
                    Visualizza Grafico con Livelli SL/TP &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Portfolio Constituents Drill-Down */}
        {activeTab === 'CONSTITUENTS' && session.isPortfolio && (
          <div className="space-y-6">
            {/* Header & Quick stats */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-950 border border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <PieIcon className="w-4 h-4 text-amber-400" />
                  <span>Analisi e Dettaglio Singoli Titoli del Portafoglio</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Visualizzazione globale dei {session.constituents?.length || 0} titoli. Clicca su un titolo per analizzare le relative operazioni aperte e chiuse.
                </p>
              </div>

              {selectedConstituentTicker && (
                <button
                  onClick={() => setSelectedConstituentTicker(null)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-bold text-cyan-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Mostra Tutti i Titoli</span>
                </button>
              )}
            </div>

            {/* Mobile View: Dedicated cards for each constituent ticker with prominent, un-truncated PnL */}
            <div className="block md:hidden space-y-3">
              {session.constituents?.map((c) => {
                const isSelected = selectedConstituentTicker?.toUpperCase() === c.ticker.toUpperCase();
                const cOpenCount = allOpenPos.filter((p) => p.symbol.toUpperCase() === c.ticker.toUpperCase()).length;
                const cClosedCount = allClosed.filter((t) => t.symbol.toUpperCase() === c.ticker.toUpperCase()).length;
                const isRealizedPos = c.realizedPnl >= 0;
                const isUnrealizedPos = c.unrealizedPnl >= 0;
                const cMarket = isMarketOpenForSymbol(c.ticker);
                const inst = getInstrumentForTicker(c.ticker, c.name);

                return (
                  <div
                    key={c.ticker}
                    onClick={() => setSelectedConstituentTicker(isSelected ? null : c.ticker)}
                    className={`p-4 rounded-2xl border transition-all space-y-3 shadow-sm cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/80 ring-1 ring-amber-500/50'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-white text-xs px-2.5 py-1 rounded-md bg-cyan-950 border border-cyan-800">
                            {c.ticker}
                          </span>
                          <span className="text-white font-bold text-sm">
                            {c.name}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                              cMarket.isOpen
                                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {cMarket.isOpen ? 'APERTO' : 'CHIUSO'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5 font-mono">
                          <span className="text-slate-300 font-medium">{c.strategyName}</span>
                          <span>&bull;</span>
                          <span className="text-cyan-300 font-semibold">Peso: {c.weightPct}%</span>
                        </div>
                      </div>

                      {inst?.isin && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <CopyableISIN isin={inst.isin} size="xs" variant="subtle" />
                        </div>
                      )}
                    </div>

                    {/* Prominent High-Contrast PnL Cards Strip (Never truncated!) */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className={`p-2.5 rounded-xl border flex flex-col justify-between font-mono ${
                        isRealizedPos ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-400' : 'bg-rose-950/70 border-rose-800/80 text-rose-400'
                      }`}>
                        <span className="text-[10px] text-slate-400 uppercase font-sans font-semibold tracking-wider">
                          P&L Realizzato:
                        </span>
                        <div className="text-base font-black tracking-tight mt-0.5">
                          {isRealizedPos ? '+' : ''}€{c.realizedPnl.toFixed(2)}
                        </div>
                      </div>

                      <div className={`p-2.5 rounded-xl border flex flex-col justify-between font-mono ${
                        isUnrealizedPos ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-400' : 'bg-rose-950/70 border-rose-800/80 text-rose-400'
                      }`}>
                        <span className="text-[10px] text-slate-400 uppercase font-sans font-semibold tracking-wider">
                          P&L Fluttuante:
                        </span>
                        <div className="text-base font-black tracking-tight mt-0.5">
                          {isUnrealizedPos ? '+' : ''}€{c.unrealizedPnl.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Capital & Positions Grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/70">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">Capitale Iniziale:</span>
                        <span className="text-slate-300 font-bold">€{c.allocatedCapital.toLocaleString('it-IT')}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">Capitale Attuale:</span>
                        <span className="text-white font-bold">€{c.currentCapital.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">Posizioni Aperte:</span>
                        <span className="text-cyan-300 font-bold">{cOpenCount}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">Trade Eseguiti:</span>
                        <span className="text-slate-300 font-medium">{cClosedCount}</span>
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setChartModalInstrument(getInstrumentForTicker(c.ticker, c.name));
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Grafico Rendimenti</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedConstituentTicker(isSelected ? null : c.ticker);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 shadow-sm'
                            : 'bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        {isSelected ? 'Focalizzato ✓' : 'Filtra Operazioni'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto border border-slate-800 rounded-2xl bg-slate-950">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-3">Titolo</th>
                    <th className="py-3 px-3">Strategia Adottata</th>
                    <th className="py-3 px-2 text-right">Peso %</th>
                    <th className="py-3 px-3 text-right">Capitale Iniziale</th>
                    <th className="py-3 px-3 text-right">Capitale Attuale</th>
                    <th className="py-3 px-3 text-right">P&L Realizzato</th>
                    <th className="py-3 px-3 text-right">P&L Fluttuante</th>
                    <th className="py-3 px-2 text-center">Open Pos</th>
                    <th className="py-3 px-2 text-center">Eseguiti</th>
                    <th className="py-3 px-3 text-right">Azione</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {session.constituents?.map((c) => {
                    const isSelected = selectedConstituentTicker?.toUpperCase() === c.ticker.toUpperCase();
                    const cOpenCount = allOpenPos.filter((p) => p.symbol.toUpperCase() === c.ticker.toUpperCase()).length;
                    const cClosedCount = allClosed.filter((t) => t.symbol.toUpperCase() === c.ticker.toUpperCase()).length;
                    const isRealizedPos = c.realizedPnl >= 0;
                    const isUnrealizedPos = c.unrealizedPnl >= 0;

                    const cMarket = isMarketOpenForSymbol(c.ticker);

                    return (
                      <tr
                        key={c.ticker}
                        onClick={() => setSelectedConstituentTicker(isSelected ? null : c.ticker)}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/10 border-l-4 border-l-amber-400'
                            : 'hover:bg-slate-900/50'
                        }`}
                      >
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setChartModalInstrument(getInstrumentForTicker(c.ticker, c.name));
                              }}
                              className="font-bold text-white font-mono hover:text-cyan-300 transition-colors flex items-center gap-1 cursor-pointer"
                              title="Clicca per aprire il grafico e i rendimenti storici"
                            >
                              <span>{c.ticker}</span>
                              <BarChart3 className="w-3 h-3 text-cyan-400 opacity-60 hover:opacity-100" />
                            </button>
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                                cMarket.isOpen
                                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                              title={cMarket.reason}
                            >
                              {cMarket.isOpen ? 'APERTO' : 'CHIUSO'}
                            </span>
                            <span className="text-[10px] text-slate-400 truncate max-w-[110px]">{c.name}</span>
                            {(() => {
                              const inst = getInstrumentForTicker(c.ticker, c.name);
                              return inst?.isin ? (
                                <CopyableISIN isin={inst.isin} size="xs" variant="subtle" />
                              ) : null;
                            })()}
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-cyan-300 text-[10px] font-semibold">
                            {c.strategyName}
                          </span>
                        </td>

                        <td className="py-3 px-2 text-right font-mono font-bold text-cyan-400">
                          {c.weightPct}%
                        </td>

                        <td className="py-3 px-3 text-right font-mono text-slate-300">
                          €{c.allocatedCapital.toLocaleString('it-IT')}
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold text-white">
                          €{c.currentCapital.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold">
                          <span className={isRealizedPos ? 'text-emerald-400' : 'text-rose-400'}>
                            {isRealizedPos ? '+' : ''}€{c.realizedPnl.toFixed(2)}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right font-mono font-bold">
                          <span className={isUnrealizedPos ? 'text-emerald-400' : 'text-rose-400'}>
                            {isUnrealizedPos ? '+' : ''}€{c.unrealizedPnl.toFixed(2)}
                          </span>
                        </td>

                        <td className="py-3 px-2 text-center font-mono">
                          {cOpenCount > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px] animate-pulse">
                              {cOpenCount}
                            </span>
                          ) : (
                            <span className="text-slate-500">0</span>
                          )}
                        </td>

                        <td className="py-3 px-2 text-center font-mono text-slate-400">
                          {cClosedCount}
                        </td>

                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setChartModalInstrument(getInstrumentForTicker(c.ticker, c.name));
                              }}
                              className="px-2 py-1 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0"
                              title="Visualizza grafico e statistiche di questo titolo"
                            >
                              <BarChart3 className="w-3 h-3 text-cyan-400" />
                              <span>Grafico</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedConstituentTicker(isSelected ? null : c.ticker);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
                                isSelected
                                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                                  : 'bg-slate-800 text-slate-300 hover:text-white'
                              }`}
                            >
                              {isSelected ? 'Focalizzato ✓' : 'Operazioni'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Drill-down Focused Operations Panel */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span>
                    {selectedConstituentTicker
                      ? `Operazioni Focalizzate su ${selectedConstituentTicker}`
                      : 'Tutte le Operazioni dei Titoli in Portafoglio'}
                  </span>
                </h4>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400">Posizioni Aperte: <strong className="text-white font-mono">{openPos.length}</strong></span>
                  <span className="text-slate-600">&bull;</span>
                  <span className="text-slate-400">Trade Conclusi: <strong className="text-white font-mono">{closed.length}</strong></span>
                </div>
              </div>

              {/* Open Positions List for this constituent / all */}
              {openPos.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      Posizioni Attive ({openPos.length})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {openPos.map((pos) => {
                      const isProfit = pos.unrealizedPnlAmount >= 0;
                      const openInfo = formatTradeTime(pos.entryDateStr, pos.entryTimestamp);
                      return (
                        <div
                          key={pos.id}
                          className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white font-mono">{pos.symbol}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                pos.direction === 'LONG'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800'
                              }`}>
                                {pos.direction}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {pos.quantity} quote @ {getTickerCurrencySymbol(pos.symbol)}{pos.entryPrice.toFixed(2)}
                              </span>
                            </div>

                            <span className={`font-mono font-bold text-xs ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isProfit ? '+' : ''}€{pos.unrealizedPnlAmount.toFixed(2)} ({isProfit ? '+' : ''}{pos.unrealizedPnlPercent.toFixed(2)}%)
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-400 font-mono pt-1">
                            <div>Spot: <strong className="text-white">{getTickerCurrencySymbol(pos.symbol)}{pos.currentPrice.toFixed(2)}</strong></div>
                            <div>SL: <strong className="text-rose-400">{getTickerCurrencySymbol(pos.symbol)}{pos.stopLoss.toFixed(2)}</strong></div>
                            <div>TP: <strong className="text-emerald-400">{getTickerCurrencySymbol(pos.symbol)}{pos.takeProfit.toFixed(2)}</strong></div>
                          </div>

                          <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-[10px]">
                            <div className="flex items-center gap-1 text-slate-400">
                              <Clock className="w-3 h-3 text-cyan-400" />
                              <span>Aperta alle: <strong className="text-cyan-300 font-mono">{openInfo.time}</strong> ({openInfo.date})</span>
                            </div>

                            <button
                              onClick={() => handleManualClose(pos.id, pos.currentPrice)}
                              className="px-2 py-0.5 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 font-bold border border-rose-800 transition-colors cursor-pointer"
                            >
                              Chiudi
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Closed Trades for this constituent / all */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  Storico Trade Conclusi {selectedConstituentTicker ? `per ${selectedConstituentTicker}` : ''} ({closed.length})
                </span>

                {closed.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-2">
                    Nessun trade concluso ancora registrato {selectedConstituentTicker ? `per ${selectedConstituentTicker}` : 'nel portafoglio'}.
                  </p>
                ) : (
                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto border border-slate-800/80 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px] z-10">
                        <tr>
                          <th className="py-2.5 px-3">Titolo</th>
                          <th className="py-2.5 px-2">Tipo</th>
                          <th className="py-2.5 px-3 text-cyan-400">Ora Apertura</th>
                          <th className="py-2.5 px-3 text-purple-400">Ora Chiusura</th>
                          <th className="py-2.5 px-2 text-right">In / Out</th>
                          <th className="py-2.5 px-3 text-right">P&L Netto</th>
                          <th className="py-2.5 px-2 text-center">Durata</th>
                          <th className="py-2.5 px-3">Motivo Uscita</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {closed.map((t) => {
                          const isWin = t.pnlAmount > 0;
                          const entryInfo = formatTradeTime(t.entryDateStr, t.entryTimestamp);
                          const exitInfo = formatTradeTime(t.exitDateStr, t.exitTimestamp);
                          return (
                            <tr key={t.id} className="hover:bg-slate-900/60 transition-colors">
                              <td className="py-2.5 px-3 font-mono font-bold text-white">{t.symbol}</td>
                              <td className="py-2.5 px-2 font-bold">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                  t.direction === 'LONG'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                                }`}>
                                  {t.direction}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-cyan-300 whitespace-nowrap">
                                <div>{entryInfo.time}</div>
                                <div className="text-[10px] text-slate-400">{entryInfo.date}</div>
                              </td>
                              <td className="py-2.5 px-3 font-mono text-purple-300 whitespace-nowrap">
                                <div>{exitInfo.time}</div>
                                <div className="text-[10px] text-slate-400">{exitInfo.date}</div>
                              </td>
                              <td className="py-2.5 px-2 font-mono text-right text-slate-300">
                                {getTickerCurrencySymbol(t.symbol)}{t.entryPrice.toFixed(2)} &rarr; {getTickerCurrencySymbol(t.symbol)}{t.exitPrice.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                                <span className={isWin ? 'text-emerald-400' : 'text-rose-400'}>
                                  {isWin ? '+' : ''}€{t.pnlAmount.toFixed(2)} ({isWin ? '+' : ''}{t.pnlPercent.toFixed(2)}%)
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-center font-mono text-slate-400">{t.durationMinutes}m</td>
                              <td className="py-2.5 px-3 text-slate-400 text-[11px]">{t.exitReason}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Open & Closed Positions with Live Chart, SL/TP Levels & Dedicated Sub-Tabs */}
        {activeTab === 'POSITIONS' && (
          <div className="space-y-6 min-h-[70vh] pb-36">
            {/* Sub-Tabs: Posizioni Attive (In Essere) vs Posizioni Chiuse (Storico) ordinate per titolo */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  id="paper-subtab-active-positions-btn"
                  onClick={() => setPositionSubTab('ACTIVE')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                    positionSubTab === 'ACTIVE'
                      ? 'bg-cyan-500 text-slate-950 shadow-xs'
                      : 'bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <Activity className="w-4 h-4" />
                  <span>Posizioni Attive (In Essere)</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                    positionSubTab === 'ACTIVE' ? 'bg-cyan-950 text-cyan-200' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {sortedOpenPositions.length}
                  </span>
                </button>

                <button
                  type="button"
                  id="paper-subtab-closed-positions-btn"
                  onClick={() => setPositionSubTab('CLOSED')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                    positionSubTab === 'CLOSED'
                      ? 'bg-cyan-500 text-slate-950 shadow-xs'
                      : 'bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <Clock className="w-4 h-4" />
                  <span>Posizioni Chiuse (Storico)</span>
                  <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono ${
                    positionSubTab === 'CLOSED' ? 'bg-cyan-950 text-cyan-200' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {sortedClosedTrades.length}
                  </span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                <span className="px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-cyan-300 flex items-center gap-1.5">
                  <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Ordinamento:</span>
                  <strong className="text-white font-bold">Titolo (A &rarr; Z)</strong>
                </span>
              </div>
            </div>

            {/* Portfolio constituent filter chips */}
            {session.isPortfolio && session.constituents && session.constituents.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Filtra Titolo:</span>
                </span>
                <button
                  onClick={() => setSelectedConstituentTicker(null)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    !selectedConstituentTicker
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  Tutti ({positionSubTab === 'ACTIVE' ? allOpenPos.length : allClosed.length})
                </button>
                {session.constituents.map((c) => {
                  const count = positionSubTab === 'ACTIVE'
                    ? allOpenPos.filter((p) => p.symbol.toUpperCase() === c.ticker.toUpperCase()).length
                    : allClosed.filter((t) => t.symbol.toUpperCase() === c.ticker.toUpperCase()).length;
                  const isSel = selectedConstituentTicker?.toUpperCase() === c.ticker.toUpperCase();
                  return (
                    <button
                      key={c.ticker}
                      onClick={() => setSelectedConstituentTicker(isSel ? null : c.ticker)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1.5 ${
                        isSel
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                      }`}
                    >
                      <span>{c.ticker}</span>
                      <span className={`px-1 rounded text-[10px] ${isSel ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* SUB-SCHEDA 1: POSIZIONI ATTIVE (IN ESSERE) */}
            {positionSubTab === 'ACTIVE' && (
              <>
                {sortedOpenPositions.length === 0 ? (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <div className="w-11 h-11 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                          <Target className="w-6 h-6" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-white">
                              Nessuna posizione aperta attualmente in essere
                              {selectedConstituentTicker ? ` su ${selectedConstituentTicker}` : ` su ${session.instrument.ticker}`}
                            </h4>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-mono text-[10px] border border-emerald-800">
                              Liquidità al 100%
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                            Nel trading quantitativo sistematico (Metodo Unger), le strategie non forzano ingressi quotidiani: attendono che il prezzo rompa livelli chiave e che tutti i filtri di regime siano soddisfatti.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 flex-wrap shrink-0">
                        <button
                          onClick={() => setShowTriggerInspector(true)}
                          className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 cursor-pointer transition-all active:scale-95"
                        >
                          <Target className="w-4 h-4" />
                          <span>Cosa Sta Attendendo la Strategia? &rarr;</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <Sparkles className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span>Vuoi testare subito la visualizzazione del grafico con i livelli di Stop Loss e Take Profit?</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => globalPaperTradingEngine.manualOpenPosition(session.id, 'LONG')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-700/70 text-emerald-300 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <span>+ Simula Posizione LONG</span>
                        </button>
                        <button
                          onClick={() => globalPaperTradingEngine.manualOpenPosition(session.id, 'SHORT')}
                          className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-700/70 text-rose-300 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <span>- Simula Posizione SHORT</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* 1. Interactive Position Charts with SL & TP Levels for each active position */}
                    {sortedOpenPositions.map((pos) => (
                      <PositionChartWithLevels
                        key={pos.id}
                        position={pos}
                        instrument={getInstrumentForTicker(pos.symbol, session.instrument.name)}
                        historicalBars={historicalBars}
                        timeframe={session.timeframe}
                        onClosePosition={(posId, currPrice) => handleManualClose(posId, currPrice)}
                      />
                    ))}

                    {/* 2. Detailed Tabular Overview with Opening Time Column & Mobile Cards */}
                    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <Layers className="w-4 h-4 text-cyan-400" />
                          <span>Riepilogo Posizioni Aperte in Essere ({sortedOpenPositions.length})</span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Feed real-time in streaming continuo
                        </div>
                      </div>

                      {/* Dedicated Mobile Cards (Never truncated!) */}
                      <div className="block md:hidden space-y-3 pt-1">
                        {sortedOpenPositions.map((pos) => {
                          const isProfit = pos.unrealizedPnlAmount >= 0;
                          const currSym = session.instrument.currencySymbol || '€';
                          const openInfo = formatTradeTime(pos.entryDateStr, pos.entryTimestamp);

                          return (
                            <div key={pos.id} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 shadow-sm">
                              {/* Header */}
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-white text-xs px-2.5 py-1 rounded-md bg-cyan-950 border border-cyan-800">
                                      {pos.symbol}
                                    </span>
                                    <span className="text-white font-bold text-sm">
                                      {pos.direction} {pos.quantity}q
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5 font-mono">
                                    <span>{session.strategyName}</span>
                                    <span>&bull;</span>
                                    <span className="text-cyan-300 font-semibold">{session.timeframe}</span>
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
                                  P&L Flottante:
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
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-500 uppercase block font-sans">Prezzo Spot:</span>
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

                              {/* Time & Close Action */}
                              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono">
                                  <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  <span>{openInfo.time} ({pos.durationMinutes}m)</span>
                                </div>

                                <button
                                  onClick={() => handleManualClose(pos.id, pos.currentPrice)}
                                  className="px-3 py-1.5 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 font-semibold text-xs transition-colors cursor-pointer"
                                >
                                  Chiudi Ora
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop Table View */}
                      <div className="hidden md:block overflow-x-auto pb-4">
                        <table className="w-full min-w-[980px] text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                              <th className="py-3.5 px-3">Titolo</th>
                              <th className="py-3.5 px-2">Tipo</th>
                              <th className="py-3.5 px-2">Orario Apertura</th>
                              <th className="py-3.5 px-2 text-right">Quantità</th>
                              <th className="py-3.5 px-2 text-right">Prezzo Ingresso</th>
                              <th className="py-3.5 px-2 text-right">Prezzo Spot</th>
                              <th className="py-3.5 px-2 text-right">Stop Loss</th>
                              <th className="py-3.5 px-2 text-right">Take Profit</th>
                              <th className="py-3.5 px-3 text-right">P&L Flottante</th>
                              <th className="py-3.5 px-2 text-center">Durata</th>
                              <th className="py-3.5 px-3 text-right">Azione</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/50">
                            {sortedOpenPositions.map((pos) => {
                              const isProfit = pos.unrealizedPnlAmount >= 0;
                              const currSym = session.instrument.currencySymbol || '€';
                              return (
                                <tr key={pos.id} className="hover:bg-slate-900/50 transition-colors">
                                  <td className="py-3.5 px-3 font-mono font-bold text-white align-middle">{pos.symbol}</td>
                                  <td className="py-3.5 px-2 font-bold align-middle">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[11px] ${
                                        pos.direction === 'LONG'
                                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                          : 'bg-rose-950 text-rose-300 border border-rose-800'
                                      }`}
                                    >
                                      {pos.direction}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-2 font-mono whitespace-nowrap align-middle">
                                    {(() => {
                                      const openInfo = formatTradeTime(pos.entryDateStr, pos.entryTimestamp);
                                      return (
                                        <div>
                                          <div className="flex items-center gap-1.5">
                                            <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                                            <span className="font-bold text-cyan-300 text-xs bg-cyan-950/70 px-1.5 py-0.5 rounded border border-cyan-800/70">
                                              {openInfo.time}
                                            </span>
                                          </div>
                                          <div className="text-[10px] text-slate-400 mt-0.5 pl-4">{openInfo.date}</div>
                                        </div>
                                      );
                                    })()}
                                  </td>
                                  <td className="py-3.5 px-2 font-mono text-right text-slate-200 align-middle">{pos.quantity}</td>
                                  <td className="py-3.5 px-2 font-mono text-right text-cyan-300 align-middle">{currSym}{pos.entryPrice.toFixed(2)}</td>
                                  <td className="py-3.5 px-2 font-mono text-right text-white font-bold align-middle">{currSym}{pos.currentPrice.toFixed(2)}</td>
                                  <td className="py-3.5 px-2 font-mono text-right text-rose-400 align-middle">{currSym}{pos.stopLoss.toFixed(2)}</td>
                                  <td className="py-3.5 px-2 font-mono text-right text-emerald-400 align-middle">{currSym}{pos.takeProfit.toFixed(2)}</td>
                                  <td className="py-3.5 px-3 text-right font-mono font-bold align-middle">
                                    <span className={isProfit ? 'text-emerald-400' : 'text-rose-400'}>
                                      {isProfit ? '+' : ''}{currSym}{pos.unrealizedPnlAmount.toFixed(2)} ({isProfit ? '+' : ''}{pos.unrealizedPnlPercent.toFixed(2)}%)
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-2 text-center font-mono text-slate-400 align-middle">{pos.durationMinutes}m</td>
                                  <td className="py-3.5 px-3 text-right align-middle">
                                    <button
                                      onClick={() => handleManualClose(pos.id, pos.currentPrice)}
                                      className="px-2.5 py-1 rounded-lg bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 hover:text-rose-100 font-semibold text-[10px] transition-colors cursor-pointer"
                                    >
                                      Chiudi Ora
                                    </button>
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
              </>
            )}

            {/* SUB-SCHEDA 2: POSIZIONI CHIUSE (STORICO) ORDINATE PER TITOLO */}
            {positionSubTab === 'CLOSED' && (
              <div className="space-y-4">
                {sortedClosedTrades.length === 0 ? (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
                    <Clock className="w-10 h-10 text-slate-600 mx-auto" />
                    <h4 className="text-sm font-bold text-white">Nessuna operazione chiusa registrata</h4>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Non appena le posizioni aperte raggiungeranno il Take Profit, lo Stop Loss o un segnale d'uscita, lo storico apparirà qui in ordine di titolo.
                    </p>
                  </div>
                ) : (
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <Clock className="w-4 h-4 text-cyan-400" />
                        <span>Storico Operazioni Chiuse ({sortedClosedTrades.length})</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Ordinato per Titolo (A &rarr; Z)
                      </div>
                    </div>

                    {/* Dedicated Mobile Cards for Closed Trades */}
                    <div className="block md:hidden space-y-3 pt-1">
                      {sortedClosedTrades.map((t) => {
                        const isWin = t.pnlAmount >= 0;
                        const currSym = session.instrument.currencySymbol || '€';
                        const exitInfo = formatTradeTime(t.exitDateStr, t.exitTimestamp);

                        return (
                          <div key={t.id} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 shadow-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-white text-xs px-2.5 py-1 rounded-md bg-cyan-950 border border-cyan-800">
                                    {t.symbol}
                                  </span>
                                  <span className="text-white font-bold text-sm">
                                    {t.direction} {t.quantity}q
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 mt-1 font-mono">
                                  Uscita: {exitInfo.date} ore {exitInfo.time}
                                </div>
                              </div>

                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                isWin ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
                              }`}>
                                {isWin ? 'PROFITTO' : 'PERDITA'}
                              </span>
                            </div>

                            {/* PnL Banner */}
                            <div className={`p-3 rounded-xl border flex items-center justify-between font-mono font-bold ${
                              isWin ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80' : 'bg-rose-950/80 text-rose-400 border-rose-800/80'
                            }`}>
                              <span className="text-[11px] uppercase text-slate-400 font-sans font-semibold tracking-wider">
                                P&L Netto Chiuso:
                              </span>
                              <div className="text-right">
                                <span className="text-base font-black tracking-tight">{isWin ? '+' : ''}{currSym}{t.pnlAmount.toFixed(2)}</span>
                                <span className="text-xs font-semibold ml-2">({isWin ? '+' : ''}{t.pnlPercent.toFixed(2)}%)</span>
                              </div>
                            </div>

                            {/* Prices 2x2 grid */}
                            <div className="grid grid-cols-2 gap-2 text-xs font-mono p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/70">
                              <div>
                                <span className="text-[10px] text-slate-500 uppercase block font-sans">Prezzo In:</span>
                                <span className="text-cyan-300 font-bold">{currSym}{t.entryPrice.toFixed(2)}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-500 uppercase block font-sans">Prezzo Out:</span>
                                <span className="text-white font-bold">{currSym}{t.exitPrice.toFixed(2)}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-500 uppercase block font-sans">Motivo Uscita:</span>
                                <span className="text-slate-300 font-semibold">{t.exitReason}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-500 uppercase block font-sans">Durata:</span>
                                <span className="text-slate-300 font-medium">{t.durationMinutes}m</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop Table View for Closed Trades */}
                    <div className="hidden md:block overflow-x-auto pb-4">
                      <table className="w-full min-w-[980px] text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-3">Titolo</th>
                            <th className="py-3 px-2">Tipo</th>
                            <th className="py-3 px-2">Data Ingresso</th>
                            <th className="py-3 px-2">Data Uscita</th>
                            <th className="py-3 px-2 text-right">Quantità</th>
                            <th className="py-3 px-2 text-right">Prezzo In</th>
                            <th className="py-3 px-2 text-right">Prezzo Out</th>
                            <th className="py-3 px-3 text-right">P&L Netto</th>
                            <th className="py-3 px-2 text-center">Motivo</th>
                            <th className="py-3 px-2 text-center">Durata</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {sortedClosedTrades.map((t) => {
                            const isWin = t.pnlAmount >= 0;
                            const currSym = session.instrument.currencySymbol || '€';
                            const inInfo = formatTradeTime(t.entryDateStr, t.entryTimestamp);
                            const outInfo = formatTradeTime(t.exitDateStr, t.exitTimestamp);

                            return (
                              <tr key={t.id} className="hover:bg-slate-900/50 transition-colors">
                                <td className="py-3 px-3 font-mono font-bold text-white align-middle">{t.symbol}</td>
                                <td className="py-3 px-2 font-bold align-middle">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[11px] ${
                                      t.direction === 'LONG'
                                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                                    }`}
                                  >
                                    {t.direction}
                                  </span>
                                </td>
                                <td className="py-3 px-2 font-mono whitespace-nowrap text-slate-300 text-[11px]">
                                  {inInfo.date} {inInfo.time}
                                </td>
                                <td className="py-3 px-2 font-mono whitespace-nowrap text-slate-300 text-[11px]">
                                  {outInfo.date} {outInfo.time}
                                </td>
                                <td className="py-3 px-2 font-mono text-right text-slate-300">{t.quantity}</td>
                                <td className="py-3 px-2 font-mono text-right text-cyan-300">{currSym}{t.entryPrice.toFixed(2)}</td>
                                <td className="py-3 px-2 font-mono text-right text-white font-bold">{currSym}{t.exitPrice.toFixed(2)}</td>
                                <td className="py-3 px-3 text-right font-mono font-bold">
                                  <span className={isWin ? 'text-emerald-400' : 'text-rose-400'}>
                                    {isWin ? '+' : ''}{currSym}{t.pnlAmount.toFixed(2)} ({isWin ? '+' : ''}{t.pnlPercent.toFixed(2)}%)
                                  </span>
                                </td>
                                <td className="py-3 px-2 text-center">
                                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                                    {t.exitReason}
                                  </span>
                                </td>
                                <td className="py-3 px-2 text-center font-mono text-slate-400">{t.durationMinutes}m</td>
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
        )}

        {/* Tab 3: Live Granular Strategy Decision Log (Requirement Step 22) */}
        {activeTab === 'LOGS' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="text-xs text-slate-400 font-medium">
                Audit Trail Algoritmico: snapshot dei valori degli indicatori e condizioni per ogni candela
              </div>
              <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px]">
                <button
                  onClick={() => setLogFilter('ALL')}
                  className={`px-2 py-1 rounded ${logFilter === 'ALL' ? 'bg-slate-800 text-white font-bold' : 'text-slate-400'}`}
                >
                  Tutti
                </button>
                <button
                  onClick={() => setLogFilter('ORDER')}
                  className={`px-2 py-1 rounded ${logFilter === 'ORDER' ? 'bg-cyan-950 text-cyan-300 font-bold' : 'text-slate-400'}`}
                >
                  Ordini
                </button>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 font-mono text-xs max-h-[360px] overflow-y-auto space-y-2 custom-scrollbar">
              {filteredLogs.map((log) => {
                const isOrder = log.level === 'ORDER';
                const isAlertOrError = log.level === 'ALERT' || log.level === 'ERROR';
                return (
                  <div
                    key={log.id}
                    className={`p-2 rounded-lg text-[11px] leading-relaxed border ${
                      isOrder
                        ? 'bg-cyan-950/40 border-cyan-800/60 text-cyan-200'
                        : isAlertOrError
                        ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                        : 'bg-slate-900/50 border-slate-800/50 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                      <span className="text-slate-400">[{log.timeStr}]</span>
                      <span className="font-bold text-slate-400">{log.category}</span>
                    </div>
                    <div>{log.message}</div>
                    {log.details?.indicators && (
                      <div className="mt-1 text-[10px] text-slate-400 bg-slate-950/80 p-1.5 rounded border border-slate-800">
                        {JSON.stringify(log.details.indicators)}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredLogs.length === 0 && (
                <div className="text-center py-8 text-slate-500 text-xs">
                  In attesa dei primi eventi di valutazione...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Closed Paper Trades History (Step 14) */}
        {activeTab === 'HISTORY' && (
          <div className="space-y-4">
            {/* Portfolio constituent filter chips */}
            {session.isPortfolio && session.constituents && session.constituents.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Filtra Titolo:</span>
                </span>
                <button
                  onClick={() => setSelectedConstituentTicker(null)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    !selectedConstituentTicker
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  Tutti ({allClosed.length})
                </button>
                {session.constituents.map((c) => {
                  const count = allClosed.filter((t) => t.symbol.toUpperCase() === c.ticker.toUpperCase()).length;
                  const isSel = selectedConstituentTicker?.toUpperCase() === c.ticker.toUpperCase();
                  return (
                    <button
                      key={c.ticker}
                      onClick={() => setSelectedConstituentTicker(isSel ? null : c.ticker)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1.5 ${
                        isSel
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                      }`}
                    >
                      <span>{c.ticker}</span>
                      <span className={`px-1 rounded text-[10px] ${isSel ? 'bg-slate-950 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {closed.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-sm">
                Nessuna operazione ancora chiusa in questa sessione {selectedConstituentTicker ? `per ${selectedConstituentTicker}` : ''}.
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">Esecuzioni Concluse</span>
                    <span>&bull;</span>
                    <span>{closed.length} trade registrati {selectedConstituentTicker ? `(Filtro: ${selectedConstituentTicker})` : ''}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-cyan-400/90 font-mono">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Ora apertura e ora chiusura mostrate con precisione al secondo</span>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar border border-slate-800/80 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-slate-950 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[10px] z-10">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        {session.isPortfolio && <th className="py-2.5 px-3">Titolo</th>}
                        <th className="py-2.5 px-2">Tipo</th>
                        <th className="py-2.5 px-3">
                          <div className="flex items-center gap-1 text-cyan-400">
                            <Clock className="w-3 h-3" />
                            <span>Ora Apertura</span>
                          </div>
                        </th>
                        <th className="py-2.5 px-3">
                          <div className="flex items-center gap-1 text-purple-400">
                            <Clock className="w-3 h-3" />
                            <span>Ora Chiusura</span>
                          </div>
                        </th>
                        <th className="py-2.5 px-2 text-right">Prezzo In</th>
                        <th className="py-2.5 px-2 text-right">Prezzo Out</th>
                        <th className="py-2.5 px-2 text-right">Quote</th>
                        <th className="py-2.5 px-3 text-right">P&L Netto</th>
                        <th className="py-2.5 px-2 text-center">Durata</th>
                        <th className="py-2.5 px-3">Motivo Uscita</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {closed.map((t) => {
                        const isWin = t.pnlAmount > 0;
                        const entryInfo = formatTradeTime(t.entryDateStr, t.entryTimestamp);
                        const exitInfo = formatTradeTime(t.exitDateStr, t.exitTimestamp);
                        const currSym = session.instrument.currencySymbol || '€';
                        return (
                          <tr key={t.id} className="hover:bg-slate-850/50 transition-colors">
                            <td className="py-2.5 px-3 font-mono text-slate-500">#{t.tradeNumber}</td>
                            {session.isPortfolio && (
                              <td className="py-2.5 px-3 font-mono font-bold text-white">
                                {t.symbol}
                              </td>
                            )}
                            <td className="py-2.5 px-2 font-bold">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  t.direction === 'LONG'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                                }`}
                              >
                                {t.direction}
                              </span>
                            </td>

                            {/* Ora di apertura */}
                            <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-cyan-300 text-xs bg-cyan-950/70 px-1.5 py-0.5 rounded border border-cyan-800/70">
                                  {entryInfo.time}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5 pl-0.5">{entryInfo.date}</div>
                            </td>

                            {/* Ora di chiusura */}
                            <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-purple-300 text-xs bg-purple-950/70 px-1.5 py-0.5 rounded border border-purple-800/70">
                                  {exitInfo.time}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 mt-0.5 pl-0.5">{exitInfo.date}</div>
                            </td>

                            <td className="py-2.5 px-2 font-mono text-right text-slate-200">{currSym}{t.entryPrice.toFixed(2)}</td>
                            <td className="py-2.5 px-2 font-mono text-right text-slate-200">{currSym}{t.exitPrice.toFixed(2)}</td>
                            <td className="py-2.5 px-2 font-mono text-right text-slate-400">{t.quantity}</td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                              <span className={isWin ? 'text-emerald-400' : 'text-rose-400'}>
                                {isWin ? '+' : ''}{currSym}{t.pnlAmount.toFixed(2)} ({isWin ? '+' : ''}{t.pnlPercent.toFixed(2)}%)
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-center font-mono text-slate-400">{t.durationMinutes}m</td>
                            <td className="py-2.5 px-3 text-slate-300">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-medium mr-1 text-slate-200 border border-slate-750">
                                {t.exitReason}
                              </span>
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

        {/* Tab 6: Historical Entry Distribution & Inactivity Analysis */}
        {activeTab === 'ENTRY_DISTRIBUTION' && (
          <div className="space-y-4 animate-fadeIn">
            <EntryDistributionSection
              trades={session.closedTrades}
              entryDistribution={entryDistributionStats}
              currentInactivityDays={inactivityAnalysis.daysSinceLastEntry}
              lastEntryDateStr={inactivityAnalysis.lastEntryDateStr}
              strategyName={session.strategyName}
              symbol={session.instrument.ticker}
            />
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal - Rendered via Portal directly on document.body */}
      {showDeleteModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto animate-in fade-in-0 duration-150"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowDeleteModal(false);
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
                    Stai per rimuovere la sessione di <strong className="text-white font-semibold">{session.instrument.name || session.instrument.ticker}</strong> (<span className="text-cyan-400 font-mono font-bold">{session.instrument.ticker}</span>) con algoritmo <span className="text-slate-300 font-mono">{session.strategyName}</span> [{session.timeframe}].
                  </p>
                </div>
              </div>

              {session.openPositions && session.openPositions.length > 0 && (
                <div className="p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl text-xs text-amber-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Attenzione: ci sono <strong>{session.openPositions.length} posizione/i aperta/e</strong> che verranno chiuse immediatamente.
                  </span>
                </div>
              )}

              <p className="text-[11px] text-slate-400">
                Tutti i log di simulazione e lo storico ordini di questa sessione verranno eliminati. Questa operazione non può essere annullata.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  id="confirm-delete-session-btn"
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

      {/* Dynamic Instrument Returns & Candlestick Chart Modal */}
      {chartModalInstrument && (
        <InstrumentReturnsChartModal
          isOpen={!!chartModalInstrument}
          onClose={() => setChartModalInstrument(null)}
          instrument={chartModalInstrument}
        />
      )}

      {/* Strategy Trigger & Waiting Condition Inspector Modal */}
      {showTriggerInspector && (
        <StrategyTriggerInspectorModal
          key={`${session.id}-${session.instrument.id}`}
          isOpen={showTriggerInspector}
          onClose={() => setShowTriggerInspector(false)}
          instrument={session.instrument}
          strategyId={session.strategyId}
          strategyName={session.strategyName}
          strategyParams={session.params}
          hasOpenPosition={session.openPositions.length > 0}
          allocatedCapital={session.currentCapital}
        />
      )}
    </div>
  );
};
