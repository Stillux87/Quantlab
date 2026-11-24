import React, { useState, useEffect } from 'react';
import {
  Instrument,
  Timeframe,
  BacktestResult,
  MarketIntelligenceReport,
  AiSynthesisReport,
  DeduplicatedEvent,
  SourceCredibilityTier,
  PaperTradingSession,
} from '../types';
import { INSTRUMENTS_DATABASE } from '../data/instruments';
import { fetchMarketIntelligence } from '../services/marketIntelligenceEngine';
import { generateAiSynthesis } from '../services/aiSynthesisEngine';
import { CopyableISIN } from './CopyableISIN';
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  ShieldAlert,
  Activity,
  Layers,
  Newspaper,
  Building2,
  Globe2,
  Calendar,
  Compass,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  ExternalLink,
  Zap,
  Play,
  Check,
  ChevronDown,
  Search,
} from 'lucide-react';

interface MarketIntelligenceDashboardProps {
  instrument: Instrument;
  timeframe: Timeframe;
  quantResult: BacktestResult | null;
  activeSessions?: PaperTradingSession[];
  onSelectInstrument?: (inst: Instrument) => void;
  onSelectSession?: (sessionId: string) => void;
  onLaunchPaper?: (result: BacktestResult) => void;
  onNavigateToQuant?: () => void;
  onNavigateToPaper?: () => void;
}

export const MarketIntelligenceDashboard: React.FC<MarketIntelligenceDashboardProps> = ({
  instrument,
  timeframe,
  quantResult,
  activeSessions = [],
  onSelectInstrument,
  onSelectSession,
  onLaunchPaper,
  onNavigateToQuant,
  onNavigateToPaper,
}) => {
  const [report, setReport] = useState<MarketIntelligenceReport | null>(null);
  const [synthesis, setSynthesis] = useState<AiSynthesisReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'events' | 'financials' | 'sector' | 'catalysts' | 'regime'>('events');
  const [showInstrumentDropdown, setShowInstrumentDropdown] = useState<boolean>(false);
  const [instrumentSearch, setInstrumentSearch] = useState<string>('');

  // Quick Switch Tickers for one-click navigation
  const POPULAR_TICKERS = ['PYPL', 'NVDA', 'AAPL', 'ENI.MI', 'ISP.MI', 'TSLA', 'SPY', 'QQQ', 'VWCE.DE', 'BTC-USD'];

  // Sessions already active on THIS specific instrument
  const currentInstrumentSessions = (activeSessions || []).filter(
    (s) => s.instrument.ticker.toUpperCase() === instrument.ticker.toUpperCase() && s.isActive
  );

  // Sessions already active on OTHER instruments
  const otherActiveSessions = (activeSessions || []).filter(
    (s) => s.instrument.ticker.toUpperCase() !== instrument.ticker.toUpperCase() && s.isActive
  );

  // Load Market Intelligence & Compute Level 3 AI Synthesis
  const loadIntelligence = async (forceRefresh = false) => {
    if (forceRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const intelReport = await fetchMarketIntelligence(instrument, timeframe, forceRefresh);
      setReport(intelReport);

      const aiReport = generateAiSynthesis(quantResult, intelReport, timeframe);
      setSynthesis(aiReport);
    } catch (err) {
      console.error('[MarketIntelligenceDashboard] Errore caricamento:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadIntelligence(false);
  }, [instrument.ticker, instrument.id, timeframe, quantResult]);

  const handleSwitchInstrument = (newInst: Instrument) => {
    if (newInst.ticker === instrument.ticker) return;
    setShowInstrumentDropdown(false);
    setReport(null);
    setIsLoading(true);
    if (onSelectInstrument) {
      onSelectInstrument(newInst);
    }
  };

  // Source Tier badge styling
  const renderSourceTierBadge = (tier: SourceCredibilityTier) => {
    switch (tier) {
      case 'TIER_1_OFFICIAL':
        return (
          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold">
            Tier 1: Ufficiale / SEC
          </span>
        );
      case 'TIER_2_MAJOR_FINANCIAL':
        return (
          <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 text-[10px] font-bold">
            Tier 2: Bloomberg / Reuters / WSJ
          </span>
        );
      case 'TIER_3_PRESS':
        return (
          <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold">
            Tier 3: CNBC / Financial Press
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-400 text-[10px] font-bold">
            Tier 4: General News
          </span>
        );
    }
  };

  // Verdict style mapping
  const getVerdictBadge = (verdict: string) => {
    switch (verdict) {
      case 'CONFLUENCE':
        return {
          bg: 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300',
          dot: 'bg-emerald-400',
          label: 'CONFLUENZA POSITIVA',
          desc: 'Il segnale quantitativo è allineato e rafforzato dal contesto informativo.',
        };
      case 'CONFLICT':
        return {
          bg: 'bg-rose-950/80 border-rose-500/50 text-rose-300',
          dot: 'bg-rose-400',
          label: 'CONFLITTO — ALTA CAUTELA',
          desc: 'Forte divergenza tra price action e flusso informativo. Rischio trappola/falso breakout.',
        };
      case 'HIGH_RISK':
        return {
          bg: 'bg-red-950/90 border-red-500/70 text-red-200',
          dot: 'bg-red-500 animate-ping',
          label: 'HIGH EVENT RISK — ELEVATA VOLATILITÀ',
          desc: 'Catalizzatore imminente (es. trimestrale o decisione tassi) con rischio spike/gap estremo.',
        };
      case 'WAIT':
      default:
        return {
          bg: 'bg-amber-950/80 border-amber-500/50 text-amber-300',
          dot: 'bg-amber-400',
          label: 'NO TRADE / WAIT',
          desc: 'Condizioni informative insufficienti, contrastanti o in fase di transizione.',
        };
    }
  };

  // Action advice pill
  const getActionBadge = (action: string) => {
    switch (action) {
      case 'PROCEED':
        return <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-black">PROCEDI (Size Piena)</span>;
      case 'REDUCE_SIZE':
        return <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black">SIZE RIDOTTA (-30%)</span>;
      case 'HOLD_OFF':
        return <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs font-black">ATTENDI CONFERMA</span>;
      case 'AVOID':
      default:
        return <span className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs font-black">EVITA TRADE (No Rischio)</span>;
    }
  };

  if (isLoading && !report) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center space-y-4 bg-slate-900/60 rounded-3xl border border-slate-800 p-8">
        <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center animate-spin">
          <RefreshCw className="w-6 h-6 text-cyan-400" />
        </div>
        <div className="text-center">
          <h3 className="text-base font-bold text-white">Caricamento Market Intelligence & AI Synthesis...</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md">
            Raccolta news societarie reali, verifica fonti, analisi trimestrali, consenso analisti e rilevamento rischio eventi per {instrument.ticker}.
          </p>
        </div>
      </div>
    );
  }

  if (!report || !synthesis) {
    return (
      <div className="p-8 text-center text-slate-400 bg-slate-900/50 rounded-2xl border border-slate-800">
        Nessun dato di Market Intelligence disponibile.
      </div>
    );
  }

  const verdictStyle = getVerdictBadge(synthesis.verdict);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Top Header & Ticker Context Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
        {/* Main Title and Current Info */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-black text-base shadow-sm">
              {instrument.ticker}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black text-white">{instrument.name}</h2>
                <span className="text-xs font-bold text-slate-400">({instrument.ticker})</span>
                {instrument.isin && (
                  <CopyableISIN isin={instrument.isin} size="xs" variant="badge" />
                )}
                <span className="px-2.5 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-slate-200">
                  {instrument.currencySymbol || '$'}{instrument.currentPrice.toFixed(2)}
                </span>
                <span
                  className={`text-xs font-bold font-mono ${
                    instrument.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {instrument.change24h >= 0 ? '+' : ''}
                  {instrument.change24h.toFixed(2)}%
                </span>
                <span className="px-2 py-0.5 rounded-md bg-cyan-950/60 border border-cyan-700/40 text-cyan-300 text-xs font-bold font-mono">
                  TF: {timeframe}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <Globe2 className="w-3.5 h-3.5 text-cyan-400" />
                  Settore: <strong className="text-slate-200">{report.sectorContext.sectorName}</strong>
                </span>
                <span>&bull;</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Ultimo update: <span className="text-slate-300 font-mono">{report.lastUpdated}</span>
                </span>
                <span>&bull;</span>
                <span
                  className={`flex items-center gap-1 font-bold ${
                    report.dataQuality === 'HIGH'
                      ? 'text-emerald-400'
                      : report.dataQuality === 'MEDIUM'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Qualità Dati: {report.dataQuality}
                </span>
              </div>
            </div>
          </div>

          {/* Action Controls & Manual Refresh Button */}
          <div className="flex items-center gap-2.5 self-end lg:self-center">
            <button
              type="button"
              onClick={() => loadIntelligence(true)}
              disabled={isRefreshing}
              className="px-4 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : 'text-cyan-400'}`} />
              <span>{isRefreshing ? 'Aggiornamento Notizie...' : '🔄 AGGIORNA NOTIZIE & INTELLIGENCE'}</span>
            </button>
          </div>
        </div>

        {/* Quick Ticker Switcher Bar */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400 font-medium mr-1 flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              Cambio Rapido Titolo:
            </span>
            {POPULAR_TICKERS.map((t) => {
              const isCurrent = instrument.ticker.toUpperCase() === t.toUpperCase();
              const matchInst = INSTRUMENTS_DATABASE.find(
                (item) => item.ticker.toUpperCase() === t.toUpperCase()
              );
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => matchInst && handleSwitchInstrument(matchInst)}
                  disabled={isCurrent}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                      : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {/* Full Catalog Search Dropdown Toggle */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowInstrumentDropdown(!showInstrumentDropdown)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all"
            >
              <Search className="w-3.5 h-3.5 text-cyan-400" />
              <span>Catalogo Strumenti ({INSTRUMENTS_DATABASE.length})</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showInstrumentDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showInstrumentDropdown && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 z-50 animate-fadeIn">
                <input
                  type="text"
                  placeholder="Cerca ticker o nome..."
                  value={instrumentSearch}
                  onChange={(e) => setInstrumentSearch(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 mb-2"
                  autoFocus
                />
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {INSTRUMENTS_DATABASE.filter(
                    (inst) =>
                      inst.ticker.toLowerCase().includes(instrumentSearch.toLowerCase()) ||
                      inst.name.toLowerCase().includes(instrumentSearch.toLowerCase())
                  ).map((inst) => (
                    <button
                      key={inst.id}
                      type="button"
                      onClick={() => handleSwitchInstrument(inst)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                        inst.ticker === instrument.ticker
                          ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                          : 'hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <div>
                        <div className="font-mono font-bold text-white">{inst.ticker}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[180px]">{inst.name}</div>
                      </div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                        {inst.market}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Anti-Data-Leakage Guarantee Notice Banner */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 px-4 flex items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong className="text-slate-200">Garanzia Anti-Data-Leakage Certificata:</strong> Il motore di Market Intelligence opera esclusivamente in avanti (Live Forward Analysis). Il backtest quantitativo storico rimane 100% oggettivo e non viene in alcun modo alterato da notizie o dati qualitativi odierni.
          </span>
        </div>
        <span className="hidden sm:inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 shrink-0">
          Strict Isolation: ACTIVE
        </span>
      </div>

      {/* ===================================================================== */}
      {/* 3 DISTINCT LEVELS ARCHITECTURE OVERVIEW                                */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* LIVELLO 1: QUANTITATIVE ENGINE */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">LIVELLO 1</h3>
                  <div className="text-sm font-black text-white">Quantitative Engine</div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[11px] font-mono font-bold text-slate-300">
                TF: {timeframe}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <div>
                  <div className="text-[11px] text-slate-400 font-medium">Segnale Algoritmico</div>
                  <div className="text-lg font-black text-cyan-300 mt-0.5 flex items-center gap-1.5">
                    {synthesis.quantitative.signal === 'LONG' ? (
                      <ArrowUpRight className="w-5 h-5 text-emerald-400" />
                    ) : synthesis.quantitative.signal === 'SHORT' ? (
                      <ArrowDownRight className="w-5 h-5 text-rose-400" />
                    ) : (
                      <Minus className="w-4 h-4 text-slate-400" />
                    )}
                    {synthesis.quantitative.signal}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-400 font-medium">Quant Score</div>
                  <div className="text-lg font-black text-white font-mono mt-0.5">
                    {synthesis.quantitative.score}
                    <span className="text-xs font-normal text-slate-400">/100</span>
                  </div>
                </div>
              </div>

              {/* Strategy Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Total Return Backtest</div>
                  <div
                    className={`font-black font-mono text-sm mt-0.5 ${
                      synthesis.quantitative.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {synthesis.quantitative.totalReturnPct >= 0 ? '+' : ''}
                    {synthesis.quantitative.totalReturnPct.toFixed(1)}%
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Profit Factor</div>
                  <div className="font-black font-mono text-sm text-cyan-300 mt-0.5">
                    {synthesis.quantitative.profitFactor.toFixed(2)}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Max Drawdown</div>
                  <div className="font-black font-mono text-sm text-rose-400 mt-0.5">
                    -{synthesis.quantitative.maxDrawdownPct.toFixed(1)}%
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Robustezza Titan</div>
                  <div className="font-black font-mono text-sm text-emerald-400 mt-0.5">
                    {synthesis.quantitative.robustnessScore}/100
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 italic pt-1">
                Strategia attiva: <strong className="text-slate-300">{synthesis.quantitative.strategyName}</strong>
              </div>
            </div>
          </div>

          {onNavigateToQuant && (
            <button
              type="button"
              onClick={onNavigateToQuant}
              className="mt-4 w-full py-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-300 text-xs font-bold transition-all border border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>Visualizza Backtest Dettagliato</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* LIVELLO 2: MARKET INTELLIGENCE ENGINE */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Globe2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">LIVELLO 2</h3>
                  <div className="text-sm font-black text-white">Market Intelligence</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                    report.regimeStatus === 'STABLE'
                      ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                      : report.regimeStatus === 'WATCH'
                      ? 'bg-cyan-950/80 border-cyan-500/40 text-cyan-300'
                      : report.regimeStatus === 'TRANSITION'
                      ? 'bg-amber-950/80 border-amber-500/40 text-amber-300'
                      : 'bg-rose-950/80 border-rose-500/40 text-rose-300'
                  }`}
                >
                  REGIME: {report.regimeStatus}
                </span>
              </div>
            </div>

            {/* Sub-Scores Matrix */}
            <div className="mt-4 space-y-2.5">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <div>
                  <div className="text-[11px] text-slate-400 font-medium">Composite Intelligence Score</div>
                  <div className="text-lg font-black text-indigo-300 font-mono mt-0.5">
                    {report.compositeIntelligenceScore}
                    <span className="text-xs font-normal text-slate-400">/100</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-400 font-medium">Event Risk Score</div>
                  <div
                    className={`text-lg font-black font-mono mt-0.5 ${
                      report.eventRiskScore >= 75
                        ? 'text-rose-400'
                        : report.eventRiskScore >= 50
                        ? 'text-amber-400'
                        : 'text-emerald-400'
                    }`}
                  >
                    {report.eventRiskScore}
                    <span className="text-xs font-normal text-slate-400">/100</span>
                  </div>
                </div>
              </div>

              {/* Progress bars for key 4 pillars */}
              <div className="space-y-2 text-xs pt-1">
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1 font-medium">
                    <span>News Sentiment Ponderato</span>
                    <span className="font-bold text-slate-200">{report.newsScore}/100</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${report.newsScore}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1 font-medium">
                    <span>Contesto Fondamentale (Utili/EPS)</span>
                    <span className="font-bold text-slate-200">{report.fundamentalScore}/100</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-cyan-500 rounded-full transition-all"
                      style={{ width: `${report.fundamentalScore}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1 font-medium">
                    <span>Salute Settoriale & Peer</span>
                    <span className="font-bold text-slate-200">{report.sectorScore}/100</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${report.sectorScore}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1 font-medium">
                    <span>Quadro Macro (Tassi/Inflazione)</span>
                    <span className="font-bold text-slate-200">{report.macroScore}/100</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${report.macroScore}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
            <span>Eventi Deduplicati: <strong className="text-slate-200">{report.deduplicatedEvents.length}</strong></span>
            <span>Catalizzatori: <strong className="text-slate-200">{report.upcomingCatalysts.length}</strong></span>
          </div>
        </div>

        {/* LIVELLO 3: AI SYNTHESIS (VERDETTO & CONFIDENZA) */}
        <div className={`border rounded-2xl p-5 shadow-lg flex flex-col justify-between ${verdictStyle.bg}`}>
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                  <Brain className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-300">LIVELLO 3</h3>
                  <div className="text-sm font-black text-white">AI Synthesis Engine</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getActionBadge(synthesis.actionAdvice)}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {/* Verdict Announcement */}
              <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${verdictStyle.dot}`} />
                    <span className="text-xs font-black tracking-wide">{verdictStyle.label}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 font-medium">AI Confidence</div>
                    <div className="text-base font-black text-white font-mono">
                      {synthesis.aiConfidenceScore}
                      <span className="text-xs font-normal text-slate-400">/100</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  {verdictStyle.desc}
                </p>
              </div>

              {/* Rationale Bullet Points */}
              <div className="space-y-1.5 text-xs text-slate-300">
                {synthesis.whyFavorableOrCautious.map((reason, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                    <span className="leading-snug">{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Forward Action Execution Button */}
          {quantResult && onLaunchPaper && (
            <button
              type="button"
              onClick={() => onLaunchPaper(quantResult)}
              disabled={synthesis.actionAdvice === 'AVOID'}
              className={`mt-4 w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                synthesis.actionAdvice === 'AVOID'
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : synthesis.actionAdvice === 'REDUCE_SIZE'
                  ? 'bg-amber-600 hover:bg-amber-500 text-slate-950'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>
                {synthesis.actionAdvice === 'AVOID'
                  ? 'Trade Bloccato da AI Synthesis (High Risk)'
                  : synthesis.actionAdvice === 'REDUCE_SIZE'
                  ? 'Lancia in Paper Trading (Size Prudenziale -30%)'
                  : 'Lancia in Paper Trading Live (Confluenza OK)'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* 5 to 8 Lines Synthesis Explanation Box */}
      <div className="bg-slate-900/90 border border-cyan-800/40 rounded-2xl p-5 shadow-lg space-y-2.5">
        <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>Sintesi Decisionale AI (Trasparenza Logica Multi-Livello)</span>
        </div>
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-300 space-y-1.5 leading-relaxed whitespace-pre-line">
          {synthesis.summaryReasoning}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* INTEGRATION WITH ALREADY RUNNING STRATEGIES (LIVE PAPER TRADING)      */}
      {/* ===================================================================== */}
      <div className="bg-gradient-to-br from-slate-900/95 to-slate-950/95 border border-cyan-500/30 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <span>Integrazione con le Strategie Già Avviate (Live Paper Trading)</span>
                {currentInstrumentSessions.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-bold">
                    {currentInstrumentSessions.length} Attiva{currentInstrumentSessions.length > 1 ? 'e' : ''} su {instrument.ticker}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Valutazione in tempo reale dell'impatto del Market Intelligence Engine sulle sessioni di trading in esecuzione.
              </p>
            </div>
          </div>

          {onNavigateToPaper && (
            <button
              type="button"
              onClick={onNavigateToPaper}
              className="self-start sm:self-center px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <span>Tutte le Sessioni Live ({activeSessions.length})</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-cyan-400" />
            </button>
          )}
        </div>

        {/* CASE A: There are active sessions for THIS instrument */}
        {currentInstrumentSessions.length > 0 ? (
          <div className="space-y-3">
            {currentInstrumentSessions.map((session) => {
              const hasPosition = session.openPositions && session.openPositions.length > 0;
              const pos = hasPosition ? session.openPositions[0] : null;
              const unrealizedPnL = pos ? pos.unrealizedPnlAmount : 0;
              const unrealizedPnLPct = pos ? pos.unrealizedPnlPercent : 0;

              return (
                <div
                  key={session.id}
                  className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/70 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="font-bold text-white text-xs">{session.strategyName}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        TF: {session.timeframe}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/50">
                        ID: {session.id.slice(0, 8)}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      {hasPosition ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded font-black text-[10px] ${
                              pos?.direction === 'LONG'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            }`}
                          >
                            POSIZIONE {pos?.direction}: {pos?.quantity} pz @ {instrument.currencySymbol || '$'}{pos?.entryPrice.toFixed(2)}
                          </span>
                          <span
                            className={`font-mono font-bold ${
                              unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            P&L: {unrealizedPnL >= 0 ? '+' : ''}{unrealizedPnL.toFixed(2)}€ ({unrealizedPnLPct >= 0 ? '+' : ''}{unrealizedPnLPct.toFixed(2)}%)
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">
                          Stato: FLAT (nessuna posizione al momento, in attesa del trigger quantitativo)
                        </span>
                      )}
                    </div>

                    {/* Confluence Alignment Diagnosis */}
                    <div className="mt-2 text-xs">
                      {synthesis.verdict === 'CONFLUENCE' ? (
                        <div className="flex items-start gap-2 text-emerald-300 bg-emerald-950/40 border border-emerald-800/40 p-2.5 rounded-lg">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                          <span>
                            <strong>Piena Confluenza Operativa:</strong> La strategia prosegue normalmente. Il contesto di mercato e le news confermano la direzione quantitativa senza rischi ostili imminenti.
                          </span>
                        </div>
                      ) : synthesis.verdict === 'CONFLICT' ? (
                        <div className="flex items-start gap-2 text-rose-300 bg-rose-950/40 border border-rose-800/40 p-2.5 rounded-lg">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <span>
                            <strong>Divergenza / Conflitto Attivo:</strong> L'intelligence segnala attriti fondamentali o deterioramento del sentiment per {instrument.ticker}. Se la strategia ha una posizione aperta, valuta di stringere il trailing stop o incassare profitti parziali.
                          </span>
                        </div>
                      ) : synthesis.verdict === 'HIGH_RISK' ? (
                        <div className="flex items-start gap-2 text-amber-300 bg-amber-950/40 border border-amber-800/40 p-2.5 rounded-lg">
                          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <span>
                            <strong>Allerta Catalizzatore ad Alta Volatilità:</strong> Rilevato evento imminente con rischio gap. Considera di mettere temporaneamente in pausa la strategia prima dell'evento.
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 text-slate-300 bg-slate-800/50 border border-slate-700 p-2.5 rounded-lg">
                          <Activity className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                          <span>
                            <strong>Stato Neutrale:</strong> Monitoraggio costante attivo. Nessuna modifica richiesta ai parametri quantitativi.
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Direct action button to session */}
                  <div className="flex md:flex-col items-center justify-end gap-2 shrink-0">
                    {onSelectSession && (
                      <button
                        type="button"
                        onClick={() => onSelectSession(session.id)}
                        className="w-full px-3 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                      >
                        <span>Gestisci nel Terminale Live</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* CASE B: No active session for this instrument */
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-slate-300 text-xs font-bold">
                <Shield className="w-4 h-4 text-cyan-400" />
                <span>Nessuna strategia attualmente avviata su {instrument.name} ({instrument.ticker})</span>
              </div>
              <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                Le strategie già avviate nel modulo Paper Trading continuano a funzionare indipendentemente in background 24/7. Puoi lanciare una nuova sessione su {instrument.ticker} integrando il controllo di confluenza dell'AI Synthesis.
              </p>
            </div>

            {quantResult && onLaunchPaper && (
              <button
                type="button"
                onClick={() => onLaunchPaper(quantResult)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/50 shrink-0 self-start sm:self-center"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Avvia Strategia su {instrument.ticker}</span>
              </button>
            )}
          </div>
        )}

        {/* Other active sessions on other instruments */}
        {otherActiveSessions.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 font-medium">Strategie attive su altri titoli in portafoglio:</span>
            {otherActiveSessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSwitchInstrument(s.instrument)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/60 text-xs font-mono flex items-center gap-1.5 cursor-pointer transition-all"
                title={`Passa all'analisi di Market Intelligence per ${s.instrument.ticker}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="font-bold">{s.instrument.ticker}</span>
                <span className="text-[10px] text-slate-400">({s.strategyName.slice(0, 14)}...)</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* DETAILED DRILL-DOWN SUB-TABS                                          */}
      {/* ===================================================================== */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-md space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveSubTab('events')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeSubTab === 'events'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Newspaper className="w-3.5 h-3.5" />
              <span>News & Fatti Verificati ({report.deduplicatedEvents.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('financials')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeSubTab === 'financials'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Fondamentali & Analisti</span>
            </button>

            <button
              onClick={() => setActiveSubTab('sector')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeSubTab === 'sector'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Settore & Peer</span>
            </button>

            <button
              onClick={() => setActiveSubTab('catalysts')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeSubTab === 'catalysts'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Catalizzatori & Event Risk ({report.upcomingCatalysts.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('regime')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                activeSubTab === 'regime'
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-black'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Regime Change Radar</span>
            </button>
          </div>
        </div>

        {/* SUB-TAB 1: DEDUPLICATED EVENTS (FATTO VS INTERPRETAZIONE) */}
        {activeSubTab === 'events' && (
          <div className="space-y-4">
            <div className="text-xs text-slate-400 flex items-center justify-between">
              <span>
                Eventi reali deduplicati raggruppando molteplici fonti indipendenti (evita il bias 10 articoli = 10 segnali).
              </span>
              <span className="font-mono text-cyan-400">{report.deduplicatedEvents.length} eventi distinti</span>
            </div>

            <div className="space-y-3">
              {report.deduplicatedEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 space-y-3 hover:border-slate-700 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/60">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                          evt.direction === 'POSITIVE'
                            ? 'bg-emerald-950 border border-emerald-500/40 text-emerald-300'
                            : evt.direction === 'NEGATIVE'
                            ? 'bg-rose-950 border border-rose-500/40 text-rose-300'
                            : 'bg-slate-900 border border-slate-700 text-slate-300'
                        }`}
                      >
                        {evt.direction}
                      </span>
                      <span className="text-xs font-bold text-white line-clamp-1">{evt.headline}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {renderSourceTierBadge(evt.primaryTier)}
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-slate-400">
                        {evt.sourceCount} {evt.sourceCount === 1 ? 'fonte' : 'fonti concordanti'}
                      </span>
                    </div>
                  </div>

                  {/* FACT VS INTERPRETATION STRICT SEPARATION */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                        FATTO (Accadimento Verificato)
                      </div>
                      <p className="text-slate-200 leading-relaxed">{evt.fact}</p>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                        <Compass className="w-3 h-3 text-amber-400" />
                        INTERPRETAZIONE (Impatto su Prezzo)
                      </div>
                      <p className="text-slate-300 leading-relaxed">{evt.interpretation}</p>
                    </div>
                  </div>

                  {/* Metadata pills */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-400">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        Importanza: <strong className="text-slate-300">{evt.importance}</strong>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        Orizzonte: <strong className="text-slate-300">{evt.timeHorizon}</strong>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        Novità: <strong className="text-slate-300">{evt.novelty}</strong>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        Già nel Prezzo: <strong className="text-slate-300">~{evt.alreadyPricedInEstimatePct}%</strong>
                      </span>
                    </div>

                    <div className="text-right font-mono">
                      Confidenza: <strong className="text-emerald-400">{evt.confidence}%</strong>
                    </div>
                  </div>

                  {/* Sources List */}
                  <div className="pt-2 border-t border-slate-900 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    <span>Fonti verificate:</span>
                    {evt.sources.map((s, sIdx) => (
                      <span key={sIdx} className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400">
                        {s.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUB-TAB 2: CORPORATE FINANCIALS & ANALYSTS */}
        {activeSubTab === 'financials' && (
          <div className="space-y-5">
            {/* Financial Metrics Cards */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Metriche Finanziarie Societarie
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Crescita Ricavi YoY</div>
                  <div className="text-base font-bold text-emerald-400 mt-0.5 font-mono">
                    +{report.financials.revenueGrowthYoY}%
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Crescita EPS YoY</div>
                  <div className="text-base font-bold text-emerald-400 mt-0.5 font-mono">
                    +{report.financials.epsGrowthYoY}%
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Margine Operativo</div>
                  <div className="text-base font-bold text-cyan-300 mt-0.5 font-mono">
                    {report.financials.operatingMarginPct}%
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Free Cash Flow Yield</div>
                  <div className="text-base font-bold text-slate-200 mt-0.5 font-mono">
                    {report.financials.freeCashFlowYieldPct}%
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Rapporto Debito/Equity</div>
                  <div className="text-base font-bold text-slate-200 mt-0.5 font-mono">
                    {report.financials.debtToEquityRatio}x
                  </div>
                </div>
              </div>
            </div>

            {/* Guidance Summary */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <span>Guidance Direzionale:</span>
                  <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 text-[11px] font-black">
                    {report.financials.guidanceDirection}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">{report.financials.guidanceSummary}</p>
              </div>
              <div className="text-right shrink-0 text-xs">
                <div className="text-[10px] text-slate-400">Revisioni Stime (30gg)</div>
                <div className="text-emerald-400 font-bold font-mono">
                  +{report.financials.estimateRevisionsPast30d.upward} rialzi
                </div>
                <div className="text-rose-400 font-bold font-mono">
                  -{report.financials.estimateRevisionsPast30d.downward} ribassi
                </div>
              </div>
            </div>

            {/* Analyst Consensus Section */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Consenso Analisti & Target Price ({report.analystConsensus.totalAnalysts} Coperture)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-400">Rating di Consenso</div>
                    <div className="text-lg font-black text-emerald-400 mt-0.5">
                      {report.analystConsensus.rating}
                    </div>
                  </div>
                  <span className="px-2 py-1 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 text-xs font-bold">
                    Trend: {report.analystConsensus.consensusTrend}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Target Price Medio</div>
                  <div className="text-lg font-black text-white font-mono mt-0.5">
                    ${report.analystConsensus.targetPriceMean.toFixed(2)}
                    <span className="ml-2 text-xs font-bold text-emerald-400">
                      (+{report.analystConsensus.upsidePotentialPct.toFixed(1)}% upside)
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Range: ${report.analystConsensus.targetPriceLow} - ${report.analystConsensus.targetPriceHigh}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Variazioni Recenti (30 Giorni)</div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs font-bold font-mono">
                    <span className="text-emerald-400">+{report.analystConsensus.recentUpgradesCount30d} Upgrades</span>
                    <span>&bull;</span>
                    <span className="text-rose-400">-{report.analystConsensus.recentDowngradesCount30d} Downgrades</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 3: SECTOR & COMPETITORS */}
        {activeSubTab === 'sector' && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white">{report.sectorContext.sectorName}</h4>
                  <div className="text-xs text-slate-400">{report.sectorContext.industry}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400">Salute Settoriale</div>
                  <span className="px-2.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-xs font-bold text-emerald-400">
                    {report.sectorContext.sectorHealth} ({report.sectorContext.sectorMomentumScore}/100)
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed pt-1">
                {report.sectorContext.sectorTrendDescription}
              </p>
            </div>

            {/* Competitor Peers Grid */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Concorrenti Principali (Peer Analysis)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {report.sectorContext.keyCompetitors.map((peer) => (
                  <div key={peer.ticker} className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{peer.ticker} ({peer.name})</span>
                      <span
                        className={`text-xs font-bold font-mono ${
                          peer.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {peer.change24h >= 0 ? '+' : ''}{peer.change24h}%
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400">{peer.keyNote}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Macro Factors Table */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                Driver Macroeconomici Rilevanti
              </h4>
              <div className="space-y-2">
                {report.sectorContext.macroFactors.map((macro, mIdx) => (
                  <div key={mIdx} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
                    <div className="space-y-0.5">
                      <div className="font-bold text-white">{macro.name}: <span className="text-slate-300 font-normal">{macro.value}</span></div>
                      <div className="text-[11px] text-slate-400">{macro.note}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black shrink-0 ${
                        macro.impact === 'FAVORABLE'
                          ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                          : macro.impact === 'HEADWIND'
                          ? 'bg-rose-950 border border-rose-800 text-rose-300'
                          : 'bg-slate-900 border border-slate-700 text-slate-300'
                      }`}
                    >
                      {macro.impact}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 4: CATALYSTS & EVENT RISK */}
        {activeSubTab === 'catalysts' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs text-slate-400">Event Risk Score Corrente</div>
                <div
                  className={`text-2xl font-black font-mono mt-0.5 ${
                    report.eventRiskScore >= 75
                      ? 'text-rose-400'
                      : report.eventRiskScore >= 50
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {report.eventRiskScore}
                  <span className="text-xs font-normal text-slate-400">/100</span>
                </div>
              </div>
              <p className="text-xs text-slate-300 max-w-xl">
                {report.eventRiskBreakdown.headlineRiskSummary}
              </p>
            </div>

            <div className="space-y-3">
              {report.upcomingCatalysts.map((cat) => (
                <div
                  key={cat.id}
                  className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          cat.riskLevel === 'CRITICAL' || cat.riskLevel === 'HIGH'
                            ? 'bg-rose-950 border border-rose-500/40 text-rose-300'
                            : 'bg-cyan-950 border border-cyan-500/40 text-cyan-300'
                        }`}
                      >
                        {cat.category}
                      </span>
                      <span className="text-xs font-bold text-white">{cat.title}</span>
                    </div>
                    <p className="text-xs text-slate-400">{cat.description}</p>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-slate-200">{cat.dateStr}</div>
                    <div className="text-[11px] font-mono text-cyan-400 mt-0.5">
                      Tra ~{cat.hoursUntilEvent} ore ({Math.round(cat.hoursUntilEvent / 24)} giorni)
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SUB-TAB 5: REGIME CHANGE RADAR */}
        {activeSubTab === 'regime' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Stato Regime Rilevato:</span>
                <span
                  className={`px-3 py-1 rounded-lg text-xs font-black border ${
                    report.regimeStatus === 'STABLE'
                      ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                      : report.regimeStatus === 'WATCH'
                      ? 'bg-cyan-950/80 border-cyan-500/40 text-cyan-300'
                      : report.regimeStatus === 'TRANSITION'
                      ? 'bg-amber-950/80 border-amber-500/40 text-amber-300'
                      : 'bg-rose-950/80 border-rose-500/40 text-rose-300'
                  }`}
                >
                  {report.regimeStatus}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed pt-1">
                {report.regimeReasoning}
              </p>
            </div>

            {/* Warning Flags */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Indicatori di Allerta Attivi ({report.regimeWarningFlags.length})
              </h4>
              {report.regimeWarningFlags.length === 0 ? (
                <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-800/30 text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Nessuna anomalia di volatilità o deterioramento strutturale rilevato. Regime ottimale per modelli quantitativi.
                </div>
              ) : (
                <div className="space-y-2">
                  {report.regimeWarningFlags.map((flag, fIdx) => (
                    <div key={fIdx} className="p-3 rounded-xl bg-rose-950/20 border border-rose-800/30 text-xs text-rose-300 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{flag}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
