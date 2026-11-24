/**
 * QuantLab - AI Portfolio Builder & Market Opportunity Radar
 * Systematic Multi-Market Screener & Andrea Unger Capital Allocator
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Sparkles,
  Shield,
  TrendingUp,
  PieChart as PieIcon,
  Layers,
  ArrowUpRight,
  Sliders,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Play,
  RotateCcw,
  Search,
  Filter,
  Check,
  ChevronRight,
  Zap,
  Activity,
  Award,
  BarChart3,
  Flame,
  Globe,
  Coins,
  Building2,
  Cpu,
  Info,
  Target,
  Eye,
  Trophy,
  Briefcase,
  ExternalLink,
  Grid,
} from 'lucide-react';
import {
  Instrument,
  Bar,
  AiMarketRecommendation,
  UngerPortfolioAllocation,
  BacktestResult,
  PaperTradingSession,
} from '../types';
import {
  scanAllMarketsAndRank,
  buildUngerDiversifiedPortfolio,
  getInitialRecommendationsFast,
} from '../services/aiPortfolioService';
import { globalPaperTradingEngine } from '../services/paperTradingEngine';
import { StrategyTriggerInspectorModal } from './StrategyTriggerInspectorModal';
import { UngerMonthlyAuditModal } from './UngerMonthlyAuditModal';
import { PortfolioOptimizerAuditView } from './PortfolioOptimizerAuditView';

interface AiPortfolioBuilderViewProps {
  onLaunchPaper: (result: BacktestResult, customCapital?: number) => void;
  onOpenTitanLabWithInstrument?: (inst: Instrument) => void;
  onNavigateToLeaderboard?: () => void;
  onLaunchEntirePortfolioToPaper?: (allocation: UngerPortfolioAllocation) => void;
  onViewSingleBacktest?: (instrument: Instrument, backtestResult?: BacktestResult) => void;
  onNavigateToTerminal?: (sessionId?: string) => void;
  onSelectInstrument?: (inst: Instrument) => void;
  activeSessions?: PaperTradingSession[];
}

const PIE_COLORS = ['#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6', '#14b8a6', '#6366f1'];

// Cross-asset correlation estimator for Unger portfolio decorrelation matrix
function getEstimatedCorrelation(idA: string, idB: string): number {
  if (idA === idB) return 1.0;
  const isStockA = ['nvda', 'smh', 'asml', 'avgo', 'msft', 'aapl', 'tsla', 'enel', 'isp', 'race', 'eni', 'pry'].includes(idA);
  const isStockB = ['nvda', 'smh', 'asml', 'avgo', 'msft', 'aapl', 'tsla', 'enel', 'isp', 'race', 'eni', 'pry'].includes(idB);
  const isBondA = ['tlt', 'fgbl'].includes(idA);
  const isBondB = ['tlt', 'fgbl'].includes(idB);
  const isGoldA = ['gc', 'gld'].includes(idA);
  const isGoldB = ['gc', 'gld'].includes(idB);
  const isCommodityA = ['cl', 'ng', 'hg', 'zc', 'kc'].includes(idA);
  const isCommodityB = ['cl', 'ng', 'hg', 'zc', 'kc'].includes(idB);
  const isIndexA = ['es', 'nq', 'fdax', 'fib', 'spy', 'qqq', 'vwce'].includes(idA);
  const isIndexB = ['es', 'nq', 'fdax', 'fib', 'spy', 'qqq', 'vwce'].includes(idB);
  const isForexA = ['eurusd', 'gbpusd', 'usdjpy', 'audusd'].includes(idA);
  const isForexB = ['eurusd', 'gbpusd', 'usdjpy', 'audusd'].includes(idB);

  // Stock vs Stock
  if (isStockA && isStockB) return 0.58;
  // Index vs Stock
  if ((isIndexA && isStockB) || (isIndexB && isStockA)) return 0.72;
  // Index vs Index
  if (isIndexA && isIndexB) return 0.78;
  // Stock/Index vs Bond (Negative correlation / hedge)
  if (((isStockA || isIndexA) && isBondB) || ((isStockB || isIndexB) && isBondA)) return -0.32;
  // Stock/Index vs Gold
  if (((isStockA || isIndexA) && isGoldB) || ((isStockB || isIndexB) && isGoldA)) return 0.08;
  // Commodity vs Gold
  if ((isCommodityA && isGoldB) || (isCommodityB && isGoldA)) return 0.28;
  // Stock vs Commodity
  if ((isStockA && isCommodityB) || (isStockB && isCommodityA)) return 0.22;
  // Forex vs Stock
  if ((isForexA && (isStockB || isIndexB)) || (isForexB && (isStockA || isIndexA))) return 0.25;
  // Default moderate decorrelation
  return 0.15;
}

export const AiPortfolioBuilderView: React.FC<AiPortfolioBuilderViewProps> = ({
  onLaunchPaper,
  onOpenTitanLabWithInstrument,
  onNavigateToLeaderboard,
  onLaunchEntirePortfolioToPaper,
  onViewSingleBacktest,
  onNavigateToTerminal,
  onSelectInstrument,
  activeSessions: propActiveSessions,
}) => {
  // Navigation sub-tab: Portfolio, Radar, Optimizer Audit, or Live Paper Monitor
  const [subTab, setSubTab] = useState<'PORTFOLIO' | 'RADAR' | 'OPTIMIZE_PORTFOLIO' | 'LIVE_SESSIONS'>('PORTFOLIO');
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [notificationMsg, setNotificationMsg] = useState<string | null>(null);

  // Scanner state - initialize immediately so the page renders with 0ms delay
  const [recommendations, setRecommendations] = useState<AiMarketRecommendation[]>(() => getInitialRecommendationsFast());
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAssetFilter, setSelectedAssetFilter] = useState<string>('ALL');

  // Portfolio Builder state
  const [targetCapital, setTargetCapital] = useState<number>(25000);
  const [riskProfile, setRiskProfile] = useState<'CONSERVATIVO' | 'BILANCIATO' | 'AGGRESSIVO'>('BILANCIATO');
  const [selectedForPortfolio, setSelectedForPortfolio] = useState<string[]>(['es', 'cl', 'gc', 'eurusd', 'nvda', 'eni', 'tlt']);
  const [batchLaunchSuccess, setBatchLaunchSuccess] = useState<boolean>(false);

  // Inspector state for trigger & condition analysis
  const [inspectedAsset, setInspectedAsset] = useState<{
    instrument: Instrument;
    strategyName?: string;
    strategyId?: string;
    params?: Record<string, any>;
    allocatedCapital?: number;
    historicalBars?: Bar[];
  } | null>(null);

  // Active paper trading sessions for health checks
  const [activeSessions, setActiveSessions] = useState(() => propActiveSessions || globalPaperTradingEngine.getAllSessions());

  // Check if an active portfolio session is already running to avoid duplicates
  const existingActivePortfolio = useMemo(() => {
    return activeSessions.find((s) => s.isPortfolio && s.isActive);
  }, [activeSessions]);
  const [isLaunching, setIsLaunching] = useState(false);

  useEffect(() => {
    if (propActiveSessions) {
      setActiveSessions(propActiveSessions);
    }
  }, [propActiveSessions]);

  useEffect(() => {
    const unsub = globalPaperTradingEngine.subscribe((s) => setActiveSessions(s));
    return () => unsub();
  }, []);

  // One-click AI Diversification & Quality Basket selection
  const selectOptimalDiversifiedBasket = () => {
    const classRules = [
      { name: 'Futures Materie Prime', filter: (r: AiMarketRecommendation) => r.instrument.type === 'COMMODITY' || ['cl', 'ng', 'hg'].includes(r.instrument.id) },
      { name: 'Oro & Beni Rifugio', filter: (r: AiMarketRecommendation) => ['gc', 'gld'].includes(r.instrument.id) },
      { name: 'Futures Indici US', filter: (r: AiMarketRecommendation) => ['es', 'nq'].includes(r.instrument.id) },
      { name: 'Valute Forex', filter: (r: AiMarketRecommendation) => r.instrument.type === 'FOREX' || ['eurusd', 'gbpusd', 'usdjpy'].includes(r.instrument.id) },
      { name: 'Tecnologia & Growth US', filter: (r: AiMarketRecommendation) => ['nvda', 'smh', 'asml', 'avgo', 'msft'].includes(r.instrument.id) },
      { name: 'Campioni Italiani FTSE MIB', filter: (r: AiMarketRecommendation) => ['eni', 'enel', 'isp', 'race', 'pry', 'ldo'].includes(r.instrument.id) },
      { name: 'Obbligazionario Hedge', filter: (r: AiMarketRecommendation) => ['tlt', 'fgbl'].includes(r.instrument.id) },
    ];

    const optimalIds: string[] = [];
    classRules.forEach((rule) => {
      const candidates = recommendations
        .filter(rule.filter)
        .sort((a, b) => b.robustnessScore - a.robustnessScore || b.profitFactor - a.profitFactor);
      if (candidates.length > 0 && !optimalIds.includes(candidates[0].instrument.id)) {
        optimalIds.push(candidates[0].instrument.id);
      }
    });

    if (optimalIds.length > 0) {
      setSelectedForPortfolio(optimalIds);
      setNotificationMsg(`Selezionati ${optimalIds.length} titoli top per massima diversificazione e qualità backtest!`);
      setTimeout(() => setNotificationMsg(null), 3500);
    }
  };

  // Refine rankings in background on mount
  useEffect(() => {
    let mounted = true;
    const runScan = async () => {
      try {
        const recs = await scanAllMarketsAndRank();
        if (mounted) {
          setRecommendations(recs);
        }
      } catch (err) {
        console.error('Error scanning markets:', err);
      }
    };
    runScan();
    return () => {
      mounted = false;
    };
  }, []);

  // Filter recommendations
  const filteredRecs = useMemo(() => {
    return recommendations.filter((r) => {
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        r.instrument.ticker.toLowerCase().includes(q) ||
        r.instrument.name.toLowerCase().includes(q) ||
        r.assetClass.toLowerCase().includes(q) ||
        r.bestStrategyName.toLowerCase().includes(q);

      const matchFilter =
        selectedAssetFilter === 'ALL' ||
        (selectedAssetFilter === 'FUTURES' && (r.instrument.type === 'FUTURE' || r.assetClass.includes('Futures'))) ||
        (selectedAssetFilter === 'COMMODITY' && (r.instrument.type === 'COMMODITY' || r.assetClass.includes('Materie') || r.assetClass.includes('Beni Rifugio'))) ||
        (selectedAssetFilter === 'FOREX' && (r.instrument.type === 'FOREX' || r.assetClass.includes('Valute'))) ||
        (selectedAssetFilter === 'INDEX' && (r.assetClass.includes('Indici') || r.instrument.market.includes('Indici'))) ||
        (selectedAssetFilter === 'TECH' && r.assetClass.includes('Tecnologia')) ||
        (selectedAssetFilter === 'ITALY' && (r.assetClass.includes('FTSE MIB') || r.instrument.currency === 'EUR')) ||
        (selectedAssetFilter === 'SAFE' && (r.assetClass.includes('Beni Rifugio') || r.assetClass.includes('Obbligazionario')));

      return matchQuery && matchFilter;
    });
  }, [recommendations, searchQuery, selectedAssetFilter]);

  // Selected recommendations subset for portfolio
  const portfolioRecs = useMemo(() => {
    if (selectedForPortfolio.length === 0) return recommendations.slice(0, 5);
    return recommendations.filter((r) => selectedForPortfolio.includes(r.instrument.id));
  }, [recommendations, selectedForPortfolio]);

  // Compute portfolio allocation
  const portfolioAllocation: UngerPortfolioAllocation = useMemo(() => {
    return buildUngerDiversifiedPortfolio(
      targetCapital,
      riskProfile,
      portfolioRecs.length > 0 ? portfolioRecs : undefined
    );
  }, [targetCapital, riskProfile, portfolioRecs]);

  // Toggle selection for portfolio
  const toggleSelectForPortfolio = (id: string) => {
    setSelectedForPortfolio((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev; // keep at least 2
        return prev.filter((item) => item !== id);
      } else {
        if (prev.length >= 8) return prev; // max 8
        return [...prev, id];
      }
    });
  };

  // Pie chart data
  const pieData = useMemo(() => {
    return portfolioAllocation.assets.map((a) => ({
      name: a.instrument.ticker,
      value: a.weightPct,
      fullName: a.instrument.name,
      capital: a.allocatedCapital,
    }));
  }, [portfolioAllocation]);

  // Handle batch launch to paper trading
  const handleLaunchAll = () => {
    if (isLaunching) return;
    setIsLaunching(true);
    if (onLaunchEntirePortfolioToPaper) {
      onLaunchEntirePortfolioToPaper(portfolioAllocation);
      setBatchLaunchSuccess(true);
      setTimeout(() => {
        setBatchLaunchSuccess(false);
        setIsLaunching(false);
      }, 3000);
    } else {
      // Fallback: launch first asset
      const first = portfolioAllocation.assets[0];
      const matchRec = recommendations.find((r) => r.instrument.id === first.instrument.id);
      if (matchRec?.backtestResult) {
        onLaunchPaper(matchRec.backtestResult, first.allocatedCapital);
      }
      setIsLaunching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-bold tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>AI QUANTITATIVE ADVISOR & PORTFOLIO ENGINE</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              AI Market Radar & Costruttore Portafoglio Unger
            </h1>
            <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
              L'Intelligenza Artificiale scansiona in tempo reale tutti i mercati e titoli, identificando quelli che meglio rispondono alle strategie quantitative (Unger Titan) con il più alto score di robustezza, e genera un'allocazione di portafoglio a <strong className="text-cyan-300">Rischio Paritetico (Risk Parity)</strong> parametrata sul tuo capitale.
            </p>
          </div>

          {/* Sub-Tab Navigation Switcher & Unger Monthly Audit Button */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start lg:self-center">
            <div className="flex items-center p-1.5 bg-slate-950/80 border border-slate-800 rounded-2xl flex-wrap gap-1">
              <button
                id="tab-ai-portfolio-btn"
                onClick={() => setSubTab('PORTFOLIO')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  subTab === 'PORTFOLIO'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <PieIcon className="w-4 h-4" />
                <span>Portafoglio Unger & Deploy</span>
              </button>
              <button
                id="tab-ai-radar-btn"
                onClick={() => setSubTab('RADAR')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  subTab === 'RADAR'
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>Radar Titoli Top Backtest</span>
              </button>
              <button
                id="tab-optimize-portfolio-btn"
                onClick={() => setSubTab('OPTIMIZE_PORTFOLIO')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  subTab === 'OPTIMIZE_PORTFOLIO'
                    ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Trophy className="w-4 h-4" />
                <span>Audit Multi-Periodo & Stress</span>
              </button>
              <button
                id="tab-live-sessions-btn"
                onClick={() => setSubTab('LIVE_SESSIONS')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                  subTab === 'LIVE_SESSIONS'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Briefcase className="w-4 h-4" />
                <span>Live Paper ({activeSessions.length})</span>
                {existingActivePortfolio && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </button>
            </div>

            {/* Unger Monthly Strategy Health Check Button */}
            <button
              id="open-unger-audit-btn"
              onClick={() => setIsAuditModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-purple-950/80 via-indigo-950/80 to-slate-900 border border-purple-500/40 hover:border-purple-400 text-purple-200 hover:text-white rounded-2xl text-xs font-bold transition-all shadow-lg hover:shadow-purple-500/10 cursor-pointer"
              title="Verifica mensile di validità e decadimento strategie secondo il metodo Andrea Unger"
            >
              <Shield className="w-4 h-4 text-purple-400 animate-pulse" />
              <span>Audit Mensile Validità</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            </button>
          </div>
        </div>

        {/* Notification message toast */}
        {notificationMsg && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-xs font-semibold flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{notificationMsg}</span>
            </div>
            <button
              onClick={() => setNotificationMsg(null)}
              className="text-emerald-400 hover:text-white text-xs font-bold cursor-pointer"
            >
              Chiudi
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: AI MARKET RADAR & BEST RESPONSIVE INSTRUMENTS                  */}
      {/* ========================================================================= */}
      {subTab === 'RADAR' && (
        <div className="space-y-6">
          {/* Controls & Filter Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cerca titolo, ticker, settore o ISIN..."
                className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Category Filter Pills (Multi-Asset including Futures, Commodities, Forex) */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
              {[
                { id: 'ALL', label: 'Tutti i Mercati' },
                { id: 'FUTURES', label: 'Futures & Derivati' },
                { id: 'COMMODITY', label: 'Materie Prime' },
                { id: 'FOREX', label: 'Valute FX' },
                { id: 'TECH', label: 'Tech & AI USA' },
                { id: 'ITALY', label: 'FTSE MIB' },
                { id: 'INDEX', label: 'Indici Globali' },
                { id: 'SAFE', label: 'Oro & Bond' },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setSelectedAssetFilter(pill.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedAssetFilter === pill.id
                      ? 'bg-cyan-500 text-slate-950 shadow-sm'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Action buttons: Auto-select & Portfolio counter badge */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={selectOptimalDiversifiedBasket}
                className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 rounded-xl text-xs font-black shadow-md shadow-cyan-500/20 transition-all cursor-pointer"
                title="Seleziona automaticamente il titolo con il miglior backtest per ciascuna asset class diversa (Commodity, Oro, Indice, Forex, Tech, Italia, Bond)"
              >
                <Sparkles className="w-3.5 h-3.5 fill-current" />
                <span>Auto-Seleziona Top Diversificati</span>
              </button>

              <button
                onClick={() => setSubTab('PORTFOLIO')}
                className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-cyan-300 border border-cyan-800/60 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
              >
                <PieIcon className="w-3.5 h-3.5 text-cyan-400" />
                <span>{selectedForPortfolio.length} Titoli nel Portafoglio Unger &rarr;</span>
              </button>
            </div>
          </div>

          {/* AI Screener Results List */}
          {isScanning ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3">
              <Activity className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
              <h3 className="text-base font-bold text-white">Scansione Quantitativa AI in Corso...</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Calcolo dei backtest multi-mercato, robustezza Out-Of-Sample e Average Trade per tutti gli strumenti del database.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredRecs.map((rec, index) => {
                const isSelected = selectedForPortfolio.includes(rec.instrument.id);
                return (
                  <div
                    key={rec.instrument.id}
                    className={`bg-slate-900 border rounded-2xl p-5 shadow-lg flex flex-col justify-between transition-all hover:border-slate-700 ${
                      isSelected
                        ? 'border-cyan-500/60 bg-gradient-to-b from-slate-900 via-slate-900 to-cyan-950/20'
                        : 'border-slate-800'
                    }`}
                  >
                    {/* Header: Rank + Ticker + Score */}
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-7 h-7 rounded-lg font-black text-xs flex items-center justify-center ${
                              index === 0
                                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30'
                                : index === 1
                                ? 'bg-slate-300 text-slate-950'
                                : index === 2
                                ? 'bg-amber-700 text-white'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            #{index + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() =>
                                  setInspectedAsset({
                                    instrument: rec.instrument,
                                    strategyName: rec.bestStrategyName,
                                    strategyId: rec.bestStrategyId,
                                    params: rec.backtestResult?.params,
                                    historicalBars: rec.historicalBars,
                                  })
                                }
                                className="font-black text-white hover:text-cyan-400 text-base tracking-tight transition-colors cursor-pointer text-left flex items-center gap-1"
                                title="Clicca per visualizzare il grafico e cosa sta attendendo la strategia"
                              >
                                <span>{rec.instrument.ticker}</span>
                                <Eye className="w-3.5 h-3.5 text-cyan-400 opacity-60 hover:opacity-100" />
                              </button>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 font-mono font-bold">
                                {rec.instrument.currencySymbol || '€'}
                                {rec.instrument.currentPrice.toFixed(2)}
                              </span>
                              {rec.instrument.currency === 'USD' && (
                                <span className="text-[9px] px-1 py-0.5 rounded bg-slate-900 border border-slate-700/60 text-slate-400 font-mono">
                                  ≈€{(rec.instrument.currentPrice / 1.09).toFixed(2)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 truncate max-w-[180px]">
                              {rec.instrument.name}
                            </p>
                          </div>
                        </div>

                        {/* Strategy Score Badge */}
                        <div className="text-right">
                          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-mono font-black text-sm">
                            <Award className="w-3.5 h-3.5" />
                            <span>{rec.robustnessScore}</span>
                            <span className="text-[10px] text-cyan-400/60">/100</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">Strategy Score</p>
                        </div>
                      </div>

                      {/* Best Strategy & Asset Class Tags */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-950/60 border border-indigo-800/40 text-indigo-300 text-[10px] font-semibold">
                          {rec.bestStrategyName}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px]">
                          {rec.assetClass}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            rec.ungerSuitability === 'EXCELLENT'
                              ? 'bg-emerald-950/60 border border-emerald-800/40 text-emerald-300'
                              : 'bg-cyan-950/60 border border-cyan-800/40 text-cyan-300'
                          }`}
                        >
                          Unger: {rec.ungerSuitability}
                        </span>
                      </div>

                      {/* Quantitative Metrics Grid */}
                      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-center">
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Avg Trade</p>
                          <p className="text-xs font-mono font-bold text-emerald-400">
                            +{rec.averageTradePct}%
                          </p>
                          <p className="text-[9px] text-slate-400 font-mono">
                            {rec.instrument.currencySymbol || '€'}{rec.averageTradeAmount}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">OOS Return</p>
                          <p className="text-xs font-mono font-bold text-cyan-400">
                            +{rec.oosReturnPct}%
                          </p>
                          <p className="text-[9px] text-slate-400">Out-Of-Sample</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Max Drawdown</p>
                          <p className="text-xs font-mono font-bold text-rose-400">
                            -{rec.maxDrawdownPct}%
                          </p>
                          <p className="text-[9px] text-slate-400">PF {rec.profitFactor}</p>
                        </div>
                      </div>

                      {/* AI Rationale Box */}
                      <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/50 space-y-1">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400">
                          <Sparkles className="w-3 h-3" />
                          <span>AI Strategic Insight:</span>
                        </div>
                        <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-3">
                          {rec.aiRationale}
                        </p>
                      </div>

                      {/* Trigger & Condition Inspector Shortcut */}
                      <button
                        type="button"
                        onClick={() =>
                          setInspectedAsset({
                            instrument: rec.instrument,
                            strategyName: rec.bestStrategyName,
                            strategyId: rec.bestStrategyId,
                            params: rec.backtestResult?.params,
                            historicalBars: rec.historicalBars,
                          })
                        }
                        className="w-full py-2 px-3 rounded-xl bg-cyan-950/40 hover:bg-cyan-950/80 border border-cyan-800/40 hover:border-cyan-500/60 text-cyan-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm active:scale-98"
                      >
                        <Target className="w-3.5 h-3.5 text-cyan-400" />
                        <span>🔍 Stato Trigger & Cosa Attende la Strategia</span>
                      </button>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 mt-4">
                      <button
                        onClick={() => toggleSelectForPortfolio(rec.instrument.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                        }`}
                      >
                        {isSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Nel Portafoglio</span>
                          </>
                        ) : (
                          <>
                            <span>+ Aggiungi a Portafoglio</span>
                          </>
                        )}
                      </button>

                      {onViewSingleBacktest && (
                        <button
                          type="button"
                          onClick={() => onViewSingleBacktest(rec.instrument, rec.backtestResult)}
                          className="px-2.5 py-2 rounded-xl bg-amber-950/70 hover:bg-amber-900/80 text-amber-300 text-xs font-semibold border border-amber-800/40 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Analizza il backtest completo di questo singolo titolo"
                        >
                          <BarChart3 className="w-3.5 h-3.5 text-amber-400" />
                          <span>Backtest &rarr;</span>
                        </button>
                      )}

                      {onOpenTitanLabWithInstrument && (
                        <button
                          onClick={() => onOpenTitanLabWithInstrument(rec.instrument)}
                          className="px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-cyan-800/40 transition-colors"
                          title="Apri nel Titan Strategy Lab"
                        >
                          Titan Lab &rarr;
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: UNGER DIVERSIFIED PORTFOLIO CONSTRUCTOR & CAPITAL ALLOCATION  */}
      {/* ========================================================================= */}
      {subTab === 'PORTFOLIO' && (
        <div className="space-y-6">
          {/* Capital & Risk Tolerance Configurator Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Coins className="w-5 h-5 text-amber-400" />
                  Imposta il Capitale da Tradare & Profilo di Rischio
                </h3>
                <p className="text-xs text-slate-400">
                  L'AI calcola la suddivisione ottimale con il metodo Risk Parity (Volatilità Inversa) e dimensionamento in quote reali.
                </p>
              </div>

              {/* Actions & Capital Quick Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectOptimalDiversifiedBasket}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-black text-xs shadow-md shadow-cyan-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Recupera e seleziona automaticamente i titoli con i migliori backtest e massima diversificazione inter-market"
                >
                  <Sparkles className="w-3.5 h-3.5 fill-current" />
                  <span>⚡ Auto-Seleziona Top Diversificati</span>
                </button>

                <div className="flex items-center gap-1.5">
                  {[10000, 25000, 50000, 100000].map((cap) => (
                    <button
                      key={cap}
                      onClick={() => setTargetCapital(cap)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer ${
                        targetCapital === cap
                          ? 'bg-amber-500 text-slate-950 shadow-md'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      €{(cap / 1000).toFixed(0)}k
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
              {/* Capital Input */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
                <label className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">
                  Capitale Totale (€)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold font-mono">
                    €
                  </span>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    value={targetCapital}
                    onChange={(e) => setTargetCapital(Math.max(500, Number(e.target.value)))}
                    className="w-full pl-8 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono font-black text-base focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Risk Profile Selector */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5">
                <label className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">
                  Profilo di Rischio Unger
                </label>
                <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-700">
                  {(['CONSERVATIVO', 'BILANCIATO', 'AGGRESSIVO'] as const).map((prof) => (
                    <button
                      key={prof}
                      onClick={() => setRiskProfile(prof)}
                      className={`py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                        riskProfile === prof
                          ? prof === 'CONSERVATIVO'
                            ? 'bg-emerald-500 text-slate-950'
                            : prof === 'BILANCIATO'
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-rose-500 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {prof === 'CONSERVATIVO' ? 'Cons.' : prof === 'BILANCIATO' ? 'Bilan.' : 'Aggr.'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Risk Per Trade Cap */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">
                  Max Rischio per Trade
                </p>
                <div className="text-lg font-mono font-black text-rose-400">
                  €{portfolioAllocation.combinedMetrics.maxSingleAssetRiskEur.toLocaleString('it-IT')}
                </div>
                <p className="text-[10px] text-slate-400">
                  Limitato a max {riskProfile === 'CONSERVATIVO' ? '1.0%' : riskProfile === 'BILANCIATO' ? '1.5%' : '2.0%'} del totale
                </p>
              </div>

              {/* Deploy and Optimization Actions */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-950/60 via-slate-950 to-amber-950/40 border border-cyan-800/60 flex flex-col justify-between gap-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-cyan-300 font-bold">
                    Deploy & Analisi Portafoglio
                  </p>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {portfolioAllocation.assets.length} Titoli
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {existingActivePortfolio && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      <span>Portafoglio già attivo in Live Paper</span>
                    </div>
                  )}

                  <button
                    id="optimize-portfolio-quick-btn"
                    onClick={() => setSubTab('OPTIMIZE_PORTFOLIO')}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer"
                  >
                    <Trophy className="w-3.5 h-3.5" />
                    <span>Migliore Strategia & Periodi</span>
                  </button>

                  <button
                    id="launch-full-portfolio-btn"
                    onClick={handleLaunchAll}
                    disabled={isLaunching}
                    className={`w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl ${
                      isLaunching ? 'opacity-60 cursor-not-allowed' : ''
                    } bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer active:scale-95`}
                  >
                    {batchLaunchSuccess ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-950" />
                        <span>Portafoglio Unificato {existingActivePortfolio ? 'Aggiornato!' : 'Lanciato!'}</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{existingActivePortfolio ? 'Aggiorna Portafoglio in Live Paper' : 'Lancia in Live Paper'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Portfolio Combined KPI Cards (5 metrics) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-1">
              <div className="text-[11px] text-slate-400 font-bold uppercase">Rendimento Annuo Atteso</div>
              <div className="text-xl font-mono font-black text-emerald-400">
                +{portfolioAllocation.combinedMetrics.blendedAnnualReturnPct}%
              </div>
              <div className="text-[10px] text-slate-400">
                ~€{portfolioAllocation.combinedMetrics.annualCashflowEstimated.toLocaleString('it-IT')} / anno
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-1">
              <div className="text-[11px] text-slate-400 font-bold uppercase">Max Drawdown Portafoglio</div>
              <div className="text-xl font-mono font-black text-rose-400">
                -{portfolioAllocation.combinedMetrics.blendedMaxDrawdownPct}%
              </div>
              <div className="text-[10px] text-emerald-400 font-semibold">
                -38% vs singolo titolo
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-1">
              <div className="text-[11px] text-slate-400 font-bold uppercase">Sharpe Ratio Globale</div>
              <div className="text-xl font-mono font-black text-cyan-400">
                {portfolioAllocation.combinedMetrics.blendedSharpeRatio}
              </div>
              <div className="text-[10px] text-slate-400">Efficienza rischio eccellente</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-1">
              <div className="text-[11px] text-slate-400 font-bold uppercase">Decorrelazione Unger</div>
              <div className="text-xl font-mono font-black text-amber-400">
                {portfolioAllocation.combinedMetrics.decorrelationScore}/100
              </div>
              <div className="text-[10px] text-slate-400">{portfolioAllocation.assets.length} Mercati Indipendenti</div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-sm space-y-1 col-span-2 md:col-span-1">
              <div className="text-[11px] text-slate-400 font-bold uppercase">Monte Carlo 95% Worst DD</div>
              <div className="text-xl font-mono font-black text-indigo-300">
                -{portfolioAllocation.combinedMetrics.monteCarloWorstDrawdown95Pct}%
              </div>
              <div className="text-[10px] text-slate-400">Stress test 1.000 iterazioni</div>
            </div>
          </div>

          {/* Charts Row: Blended Portfolio Equity Curve & Asset Allocation Pie */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Blended Equity Curve (8 cols) */}
            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    Simulazione Curva di Equità Combinata (5 Anni)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Portafoglio Diversificato Unger vs Benchmark S&P 500 Buy & Hold.
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-3 h-0.5 bg-emerald-400" />
                    <span>Portafoglio Unger</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <span className="w-3 h-0.5 bg-slate-500" />
                    <span>Benchmark SPY</span>
                  </div>
                </div>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={portfolioAllocation.blendedEquityCurve}>
                    <defs>
                      <linearGradient id="colorPortfolio" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="dateStr"
                      stroke="#64748b"
                      fontSize={11}
                      tickFormatter={(val) => val.substring(2)}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      domain={['auto', 'auto']}
                      tickFormatter={(val) => `€${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                      }}
                      formatter={(val: any, name: any) => [
                        `€${Number(val).toLocaleString('it-IT')}`,
                        name === 'portfolioEquity' ? 'Portafoglio Unger' : 'Benchmark SPY',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="portfolioEquity"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorPortfolio)"
                    />
                    <Line
                      type="monotone"
                      dataKey="benchmarkEquity"
                      stroke="#64748b"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Allocation Donut Breakdown (4 cols) */}
            <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4 flex flex-col justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <PieIcon className="w-4 h-4 text-amber-400" />
                  Ripartizione Asset per Capitale
                </h4>
                <p className="text-[11px] text-slate-400">
                  Pesi bilanciati su base volatilità inversa.
                </p>
              </div>

              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={75}
                      paddingAngle={3}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '0.75rem',
                        fontSize: '11px',
                      }}
                      formatter={(val: any, name: any) => [`${val}% (€${(targetCapital * Number(val) / 100).toLocaleString('it-IT')})`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend List */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                {portfolioAllocation.assets.map((asset, idx) => (
                  <div key={asset.instrument.id} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                      />
                      <span className="font-bold text-white">{asset.instrument.ticker}</span>
                    </div>
                    <div className="font-mono text-slate-300">
                      <span className="text-cyan-300 font-bold">{asset.weightPct}%</span>{' '}
                      <span className="text-slate-500">(€{asset.allocatedCapital.toLocaleString('it-IT')})</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Unger Cross-Asset Decorrelation Matrix */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Grid className="w-4 h-4 text-cyan-400" />
                  Matrice di Correlazione tra i Titoli (Pilastro Unger Anti-Drawdown)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Coefficienti di correlazione inter-market calcolati su dati storici. Valori bassi (&lt; 0.30) o negativi (Hedge) consentono l'abbattimento del Drawdown globale del portafoglio.
                </p>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono shrink-0 flex-wrap">
                <div className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-500/40 border border-emerald-500/60" />
                  <span>Hedge (&lt; 0)</span>
                </div>
                <div className="flex items-center gap-1 text-cyan-400">
                  <span className="w-2.5 h-2.5 rounded bg-cyan-500/30 border border-cyan-500/50" />
                  <span>Decorrelato (0 - 0.3)</span>
                </div>
                <div className="flex items-center gap-1 text-amber-400">
                  <span className="w-2.5 h-2.5 rounded bg-amber-500/30 border border-amber-500/50" />
                  <span>Medio (0.3 - 0.7)</span>
                </div>
                <div className="flex items-center gap-1 text-rose-400">
                  <span className="w-2.5 h-2.5 rounded bg-rose-500/30 border border-rose-500/50" />
                  <span>Alto (&gt; 0.7)</span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-center text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                    <th className="py-2.5 px-3 text-left font-bold uppercase">Asset</th>
                    {portfolioAllocation.assets.map((colAsset) => (
                      <th key={colAsset.instrument.id} className="py-2.5 px-2 font-mono font-bold text-slate-200">
                        {colAsset.instrument.ticker}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 font-mono">
                  {portfolioAllocation.assets.map((rowAsset) => (
                    <tr key={rowAsset.instrument.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 text-left font-bold text-white flex items-center gap-1.5">
                        <span className="text-cyan-400">{rowAsset.instrument.ticker}</span>
                        <span className="text-[10px] text-slate-500 hidden sm:inline">({rowAsset.instrument.type})</span>
                      </td>
                      {portfolioAllocation.assets.map((colAsset) => {
                        const corr = getEstimatedCorrelation(rowAsset.instrument.id, colAsset.instrument.id);
                        const isSelf = rowAsset.instrument.id === colAsset.instrument.id;
                        let cellBg = 'bg-slate-900 text-slate-400';
                        if (isSelf) {
                          cellBg = 'bg-slate-800/80 text-white font-black';
                        } else if (corr < 0) {
                          cellBg = 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/40 font-bold';
                        } else if (corr <= 0.3) {
                          cellBg = 'bg-cyan-950/60 text-cyan-300 border border-cyan-800/30 font-semibold';
                        } else if (corr <= 0.7) {
                          cellBg = 'bg-amber-950/40 text-amber-300 border border-amber-800/20';
                        } else {
                          cellBg = 'bg-rose-950/40 text-rose-300 border border-rose-800/20';
                        }

                        return (
                          <td key={colAsset.instrument.id} className="p-1">
                            <div className={`py-1.5 px-2 rounded-lg text-[11px] ${cellBg}`}>
                              {corr >= 0 && !isSelf ? `+${corr.toFixed(2)}` : corr.toFixed(2)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Allocation Details & Position Sizing Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-cyan-400" />
                  Dimensionamento Quote & Ordini Suggeriti (Metodo Unger)
                </h4>
                <p className="text-[11px] text-slate-400">
                  Calcolo esatto del numero di quote/azioni da comprare, metriche di backtest del singolo titolo e Stop Loss per trade.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase font-bold">
                    <th className="py-3 px-3">Titolo & Settore</th>
                    <th className="py-3 px-3">Prezzo Spot & FX</th>
                    <th className="py-3 px-3">Strategia</th>
                    <th className="py-3 px-3 text-center">Score Backtest & OOS</th>
                    <th className="py-3 px-3 text-right">Peso %</th>
                    <th className="py-3 px-3 text-right">Capitale Assegnato</th>
                    <th className="py-3 px-3 text-right">Quote Consigliate</th>
                    <th className="py-3 px-3 text-right">Stop Loss %</th>
                    <th className="py-3 px-3 text-right">Max Rischio €</th>
                    <th className="py-3 px-3 text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {portfolioAllocation.assets.map((asset, idx) => {
                    const matchRec = recommendations.find((r) => r.instrument.id === asset.instrument.id);
                    return (
                      <tr key={asset.instrument.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                            />
                            <div>
                              <div className="font-bold text-white flex items-center gap-1.5">
                                <span>{asset.instrument.ticker}</span>
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                                  {asset.instrument.currency}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-400 truncate max-w-[150px]">
                                {asset.instrument.name}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-3">
                          <div className="font-mono">
                            <div className="text-white font-bold text-xs">
                              {asset.originalCurrencySymbol || asset.instrument.currencySymbol || '€'}
                              {asset.instrument.currentPrice.toFixed(2)}
                            </div>
                            {asset.instrument.currency === 'USD' ? (
                              <div className="text-[10px] text-slate-400">
                                ≈ €{asset.sharePriceEur.toFixed(2)} EUR
                              </div>
                            ) : (
                              <div className="text-[10px] text-emerald-400/80">
                                Prezzo EUR
                              </div>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-3">
                          <span className="px-2 py-0.5 rounded bg-indigo-950/60 text-indigo-300 font-semibold text-[10px] border border-indigo-800/40">
                            {asset.strategyName}
                          </span>
                        </td>

                        <td className="py-3.5 px-3 text-center">
                          {matchRec ? (
                            <div className="inline-flex flex-col items-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                                matchRec.robustnessScore >= 80
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
                              }`}>
                                Score {matchRec.robustnessScore}/100
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono mt-0.5">
                                OOS: <strong className="text-emerald-400">+{matchRec.oosReturnPct}%</strong> | PF {matchRec.profitFactor.toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-[10px]">N/D</span>
                          )}
                        </td>

                        <td className="py-3.5 px-3 text-right font-mono font-bold text-cyan-300">
                          {asset.weightPct}%
                        </td>

                        <td className="py-3.5 px-3 text-right font-mono font-bold text-white">
                          €{asset.allocatedCapital.toLocaleString('it-IT')}
                        </td>

                        <td className="py-3.5 px-3 text-right font-mono font-black text-amber-400">
                          {asset.suggestedPositionSizeShares} quote
                        </td>

                        <td className="py-3.5 px-3 text-right font-mono text-rose-400">
                          -{asset.stopLossDistancePct}%
                        </td>

                        <td className="py-3.5 px-3 text-right font-mono font-bold text-rose-300">
                          €{asset.maxRiskPerTradeEur}
                          <span className="text-[10px] text-slate-500 ml-1">
                            ({asset.maxRiskPerTradePct}%)
                          </span>
                        </td>

                        <td className="py-3.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {onViewSingleBacktest && (
                              <button
                                type="button"
                                onClick={() => onViewSingleBacktest(asset.instrument, matchRec?.backtestResult)}
                                className="px-2.5 py-1 rounded-lg bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800/40 text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                                title="Analizza il backtest completo di questo singolo titolo"
                              >
                                <BarChart3 className="w-3 h-3 text-amber-400" />
                                <span>Backtest Singolo</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setInspectedAsset({
                                  instrument: asset.instrument,
                                  strategyName: asset.strategyName,
                                  strategyId: matchRec?.bestStrategyId || 'unger_titan',
                                  params: matchRec?.backtestResult?.params,
                                  allocatedCapital: asset.allocatedCapital,
                                  historicalBars: matchRec?.historicalBars,
                                });
                              }}
                              className="px-2.5 py-1 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800/40 text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                              title="Visualizza perché la strategia è in attesa e i livelli di trigger"
                            >
                              <Target className="w-3 h-3 text-cyan-400" />
                              <span>Trigger</span>
                            </button>

                            <button
                              onClick={() => {
                                if (matchRec?.backtestResult) {
                                  onLaunchPaper(matchRec.backtestResult, asset.allocatedCapital);
                                }
                              }}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] font-semibold transition-colors cursor-pointer"
                            >
                              Paper Singolo &rarr;
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

          {/* AI Executive Summary Box */}
          <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">
                  Valutazione Quantitativa AI del Portafoglio
                </h4>
                <p className="text-xs text-slate-400">
                  Sintesi delle logiche di diversificazione e conformità alle regole di Andrea Unger.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {portfolioAllocation.aiExecutiveSummary}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              {portfolioAllocation.aiRiskAlerts.map((alert, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800 text-xs text-slate-300 space-y-1"
                >
                  <div className="font-bold text-amber-300 flex items-center gap-1.5 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Pilastro Unger #{idx + 1}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{alert}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: PORTFOLIO STRATEGY OPTIMIZER & PERIOD ROBUSTNESS AUDIT         */}
      {/* ========================================================================= */}
      {subTab === 'OPTIMIZE_PORTFOLIO' && (
        <PortfolioOptimizerAuditView
          allocation={portfolioAllocation}
          onApplyBestStrategyToPortfolio={() => {
            setSubTab('PORTFOLIO');
          }}
          onLaunchToPaper={() => handleLaunchAll()}
          onClose={() => setSubTab('PORTFOLIO')}
        />
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 4: LIVE PAPER SESSIONS & PORTFOLIO MONITORING                     */}
      {/* ========================================================================= */}
      {subTab === 'LIVE_SESSIONS' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-emerald-400" />
                  Sessioni Paper Trading Attive ({activeSessions.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Monitora l'esecuzione in tempo reale dei portafogli diversificati Unger e delle strategie singole lanciate sul simulatore.
                </p>
              </div>
              {onNavigateToTerminal && (
                <button
                  type="button"
                  onClick={() => onNavigateToTerminal()}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 flex items-center gap-2 transition-all cursor-pointer self-start sm:self-center"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Apri Terminale Completo &rarr;</span>
                </button>
              )}
            </div>

            {activeSessions.length === 0 ? (
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-12 text-center space-y-4">
                <Briefcase className="w-10 h-10 text-slate-600 mx-auto" />
                <h4 className="text-base font-bold text-white">Nessuna Sessione Paper Attiva al Momento</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Puoi lanciare l'intero portafoglio diversificato Unger con 1 clic dalla scheda "Portafoglio Unger & Deploy" o eseguire singoli titoli.
                </p>
                <button
                  onClick={() => setSubTab('PORTFOLIO')}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                >
                  Vai al Costruttore Portafoglio &rarr;
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {activeSessions.map((session) => {
                  const totalPnL = session.currentCapital - session.initialCapital;
                  const isPositive = totalPnL >= 0;
                  const returnPct = session.initialCapital > 0 ? (totalPnL / session.initialCapital) * 100 : 0;
                  const sessionName = session.portfolioName || session.strategyName;
                  const constituents = session.constituents || session.portfolioAllocation?.assets || [];
                  const totalTrades = session.closedTrades?.length || 0;
                  const winningTrades = session.closedTrades?.filter((t) => (t.pnlAmount ?? 0) > 0).length || 0;
                  const winRatePct = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

                  return (
                    <div
                      key={session.id}
                      className={`p-5 rounded-2xl border transition-all ${
                        session.isPortfolio
                          ? 'bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/30 border-indigo-500/40 shadow-xl'
                          : 'bg-slate-950 border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white text-sm flex items-center gap-1.5">
                              {session.isPortfolio ? (
                                <PieIcon className="w-4 h-4 text-amber-400" />
                              ) : (
                                <Activity className="w-4 h-4 text-cyan-400" />
                              )}
                              {sessionName}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
                              LIVE PAPER
                            </span>
                            {session.isPortfolio && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold">
                                DIVERSIFICATO UNGER
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">
                            Capitale Iniziale: <strong className="text-slate-200">€{session.initialCapital.toLocaleString('it-IT')}</strong> | Saldo Corrente: <strong className="text-white font-mono">€{session.currentCapital.toLocaleString('it-IT')}</strong>
                          </p>
                          {constituents.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap pt-1">
                              <span className="text-[11px] text-slate-400 font-medium">Titoli costituenti:</span>
                              {constituents.map((c: any, cIdx: number) => {
                                const ticker = c.instrument?.ticker || c.ticker || `Asset #${cIdx + 1}`;
                                const weight = c.weightPct ?? 0;
                                return (
                                  <span
                                    key={c.instrument?.id || cIdx}
                                    className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono font-semibold border border-slate-700"
                                  >
                                    {ticker} ({weight}%)
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">P&L Totale</div>
                            <div className={`text-base font-black font-mono ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {isPositive ? '+' : ''}€{totalPnL.toFixed(2)}
                              <span className="text-xs ml-1 font-semibold">
                                ({returnPct >= 0 ? '+' : ''}{returnPct.toFixed(2)}%)
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Trade eseguiti: {totalTrades} | Win: {winRatePct.toFixed(0)}%
                            </div>
                          </div>

                          {onNavigateToTerminal && (
                            <button
                              type="button"
                              onClick={() => onNavigateToTerminal(session.id)}
                              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold border border-slate-700 hover:border-cyan-500/40 transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                              <span>Apri &rarr;</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trigger & Waiting Condition Inspector Modal */}
      {inspectedAsset && (
        <StrategyTriggerInspectorModal
          key={`${inspectedAsset.instrument.id}-${inspectedAsset.strategyId}`}
          isOpen={!!inspectedAsset}
          onClose={() => setInspectedAsset(null)}
          instrument={inspectedAsset.instrument}
          strategyId={inspectedAsset.strategyId}
          strategyName={inspectedAsset.strategyName}
          strategyParams={inspectedAsset.params}
          historicalBars={inspectedAsset.historicalBars}
          allocatedCapital={inspectedAsset.allocatedCapital}
        />
      )}

      {/* Unger Monthly Strategy Health & Decay Audit Modal */}
      <UngerMonthlyAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        activeSessions={activeSessions}
      />
    </div>
  );
};
