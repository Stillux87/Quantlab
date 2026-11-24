/**
 * QuantLab - View 2: Scanner AI & Rotazione Dinamica (Swing 1h-4h)
 * Scans liquid US & European stocks/ETFs on 1h and 4h timeframes to generate
 * steady, modest monthly profits (+1.8% to +2.8% per trade) with tight risk control
 * and automatic Break-Even Profit Lock at +0.8%.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  RefreshCw,
  Play,
  ShieldCheck,
  TrendingUp,
  BarChart3,
  RotateCcw,
  CheckCircle2,
  Clock,
  Target,
  Sliders,
  Zap,
  ArrowUpRight,
  Lock,
} from 'lucide-react';
import { Instrument, Timeframe } from '../types';
import { globalPaperTradingEngine } from '../services/paperTradingEngine';
import { authenticatedFetch } from '../services/authClient';

export interface AiScannerOpportunity {
  ticker: string;
  name: string;
  sector: string;
  market: string;
  type: 'STOCK' | 'ETF' | 'FUTURE' | 'COMMODITY' | 'FOREX';
  timeframe: Timeframe;
  price: number;
  change24h: number;
  currency: string;
  currencySymbol: string;
  fxRateToEur: number;
  isLiveVerified: boolean;
  rsi14: number;
  ema20: number;
  ema50: number;
  atrPct: number;
  momentum6BarsPct: number;
  score: number;
  signalStatus: 'BUY_READY' | 'PULLBACK_WATCH' | 'HOLD_WAIT';
  setupLabel: string;
  stopLossPct: number;
  takeProfitPct: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  breakEvenTriggerPct: number;
  expectedHoldHours: string;
  rationale: string;
  instrument: Instrument;
}

interface AiDynamicScannerViewProps {
  activeSessions?: any[];
  onSelectInstrumentForBacktest?: (instrument: Instrument, timeframe: Timeframe) => void;
  onSelectInstrument?: (instrument: Instrument, timeframe: Timeframe) => void;
  onNavigateToLiveTerminal?: (sessionId?: string) => void;
  onNavigateToTerminal?: (sessionId?: string) => void;
}

export const AiDynamicScannerView: React.FC<AiDynamicScannerViewProps> = ({
  onSelectInstrumentForBacktest,
  onSelectInstrument,
  onNavigateToLiveTerminal,
  onNavigateToTerminal,
}) => {
  const handleBacktestNav = onSelectInstrumentForBacktest || onSelectInstrument || (() => {});
  const handleTerminalNav = onNavigateToLiveTerminal || onNavigateToTerminal || (() => {});

  const [timeframe, setTimeframe] = useState<'1h' | '4h'>('1h');
  const [filterMode, setFilterMode] = useState<'ALL' | 'BUY_READY' | 'US' | 'EU'>('ALL');
  const [opportunities, setOpportunities] = useState<AiScannerOpportunity[]>([]);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [eurUsdRate, setEurUsdRate] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRunningAi, setIsRunningAi] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const fetchScannerData = useCallback(
    async (tf: '1h' | '4h', withGeminiAi = false) => {
      if (withGeminiAi) {
        setIsRunningAi(true);
      } else {
        setIsLoading(true);
      }
      try {
        const res = withGeminiAi
          ? await authenticatedFetch('/api/ai/scanner', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ timeframe: tf, useAi: true }),
            })
          : await fetch(`/api/ai/scanner?timeframe=${encodeURIComponent(tf)}&ai=false`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && Array.isArray(data.opportunities)) {
          setOpportunities(data.opportunities);
          setAiSummary(data.aiMarketSummary || '');
          setEurUsdRate(typeof data.eurUsdRate === 'number' ? data.eurUsdRate : null);
          setUpdatedAt(
            new Date(data.updatedAt || Date.now()).toLocaleTimeString('it-IT', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          );
        }
      } catch (err) {
        console.warn('[AiDynamicScannerView] Errore caricamento scanner:', err);
      } finally {
        setIsLoading(false);
        setIsRunningAi(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchScannerData(timeframe, false);
  }, [timeframe, fetchScannerData]);

  const handleLaunchSingleSwingBot = (opp: AiScannerOpportunity) => {
    const newSession = globalPaperTradingEngine.createSession({
      strategyId: 'ai_dynamic_swing_1h',
      strategyName: `AI Swing ${opp.timeframe} Profit Lock (${opp.ticker})`,
      instrument: opp.instrument,
      timeframe: opp.timeframe,
      params: {
        emaFast: 20,
        emaSlow: 50,
        rsiPeriod: 14,
        stopLossPct: opp.stopLossPct,
        takeProfitPct: opp.takeProfitPct,
        trailingStopPct: 0.6,
      },
      initialCapital: 5000,
      riskPerTradePct: 1.2,
    });
    handleTerminalNav(newSession.id);
  };

  const handleLaunchTop5MonthlyPortfolio = async () => {
    setIsResetting(true);
    try {
      const top5Tickers = opportunities.slice(0, 5).map((o) => o.ticker);
      const { newSession } = await globalPaperTradingEngine.resetCleanAndStartAiSwing({
        tickers: top5Tickers.length >= 3 ? top5Tickers : ['NVDA', 'AAPL', 'MSFT', 'UCG.MI', 'ENEL.MI'],
        initialCapital: 10000,
        timeframe,
      });
      setStatusBanner(
        `Portafoglio AI Rotazione Dinamica (${timeframe}) avviato con prezzi reali verificati su: ${(top5Tickers.length >= 3 ? top5Tickers : ['NVDA', 'AAPL', 'MSFT', 'UCG.MI', 'ENEL.MI']).join(', ')}`
      );
      handleTerminalNav(newSession?.id);
    } finally {
      setIsResetting(false);
    }
  };

  const handleCleanResetOnly = async () => {
    setIsResetting(true);
    try {
      const { deletedCount, newSession } = await globalPaperTradingEngine.resetCleanAndStartAiSwing({
        tickers: ['NVDA', 'AAPL', 'MSFT', 'UCG.MI', 'ENEL.MI'],
        initialCapital: 10000,
        timeframe,
      });
      setStatusBanner(
        `Reset pulito completato (${deletedCount} vecchie sessioni rimosse). Riavviato Portafoglio AI con quotazioni reali verificate.`
      );
      if (newSession) {
        handleTerminalNav(newSession.id);
      }
    } finally {
      setIsResetting(false);
    }
  };

  const filteredOpportunities = opportunities.filter((opp) => {
    if (filterMode === 'BUY_READY') return opp.signalStatus === 'BUY_READY';
    if (filterMode === 'US') return opp.currency === 'USD';
    if (filterMode === 'EU') return opp.currency === 'EUR';
    return true;
  });

  const buyReadyCount = opportunities.filter((o) => o.signalStatus === 'BUY_READY').length;

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header & Action Controls */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 sm:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[11px] font-mono font-bold uppercase tracking-wider">
                ROTAZIONE DINAMICA AI &bull; SWING {timeframe.toUpperCase()}
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Prezzi Reali Verificati ($ USD / € EUR)
              </span>
              <span className="text-xs font-mono text-slate-400">
                Cambio Live EUR/USD: <strong className="text-slate-200 tabular-nums">{eurUsdRate !== null ? eurUsdRate.toFixed(4) : 'N/D'}</strong>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Scanner AI Opportunità Mensili ad Alta Reattività
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 max-w-3xl leading-relaxed">
              Seleziona i titoli più reattivi su timeframe <strong className="text-slate-200">1h e 4h</strong> con obiettivo di utile modesto ma costante (<strong className="text-emerald-400">+1.8% / +2.6% per trade</strong>), Stop Loss stretto (<strong className="text-rose-400">-1.1%</strong>) e <strong className="text-cyan-300">Break-Even automatico a +0.8%</strong>.
            </p>
          </div>

          {/* Right Controls: Timeframe Switcher + AI Synthesis + Launch Portfolio */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="flex items-center bg-[#0B0F17] p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setTimeframe('1h')}
                className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-all cursor-pointer ${
                  timeframe === '1h'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                1h (Veloce)
              </button>
              <button
                type="button"
                onClick={() => setTimeframe('4h')}
                className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-all cursor-pointer ${
                  timeframe === '4h'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                4h (Multiday)
              </button>
            </div>

            <button
              type="button"
              onClick={() => fetchScannerData(timeframe, true)}
              disabled={isRunningAi || isLoading}
              className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isRunningAi ? 'animate-spin' : ''}`} />
              <span>{isRunningAi ? 'Analisi AI in corso...' : 'Aggiorna Analisi AI'}</span>
            </button>

            <button
              type="button"
              onClick={handleLaunchTop5MonthlyPortfolio}
              disabled={isResetting || opportunities.length === 0}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Avvia Portafoglio AI (Top 5)</span>
            </button>
          </div>
        </div>

        {/* AI Tactical Summary Box */}
        <div className="mt-4 pt-4 border-t border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-slate-300">
            <Zap className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white mr-1.5">Sintesi Operativa AI:</span>
              <span className="text-slate-300 leading-relaxed">{aiSummary}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {updatedAt && (
              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-500" />
                Aggiornato: {updatedAt}
              </span>
            )}
            <button
              type="button"
              onClick={handleCleanResetOnly}
              disabled={isResetting}
              className="px-2.5 py-1 rounded-md bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/40 text-rose-200 text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Cancella tutte le vecchie sessioni bloccate e riavvia da zero con prezzi reali verificati"
            >
              <RotateCcw className={`w-3 h-3 ${isResetting ? 'animate-spin' : ''}`} />
              <span>Reset Pulito Sessioni</span>
            </button>
          </div>
        </div>
      </div>

      {/* Status Confirmation Banner */}
      {statusBanner && (
        <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-xs text-emerald-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{statusBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-emerald-400 hover:text-white text-xs font-bold"
          >
            Chiudi
          </button>
        </div>
      )}

      {/* Filter Tabs & KPI Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-[#111827] p-1 rounded-lg border border-slate-800 w-fit">
          <button
            type="button"
            onClick={() => setFilterMode('ALL')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              filterMode === 'ALL' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Tutti ({opportunities.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('BUY_READY')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
              filterMode === 'BUY_READY'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Pronti Ingresso ({buyReadyCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('US')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              filterMode === 'US' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Wall Street ($ USD)
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('EU')}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              filterMode === 'EU' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Borsa Italiana (€ EUR)
          </button>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-cyan-400" />
            Profit Lock: <strong className="text-slate-200">Break-Even a +0.8%</strong>
          </span>
          <span className="flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-emerald-400" />
            Target Swing: <strong className="text-emerald-400">+1.8% / +2.6%</strong>
          </span>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="bg-[#111827] border border-slate-800 rounded-xl p-5 h-48 animate-pulse flex flex-col justify-between"
            >
              <div className="flex justify-between">
                <div className="h-5 w-32 bg-slate-800 rounded" />
                <div className="h-5 w-20 bg-slate-800 rounded" />
              </div>
              <div className="h-12 bg-slate-800/60 rounded" />
              <div className="flex justify-between">
                <div className="h-8 w-28 bg-slate-800 rounded" />
                <div className="h-8 w-28 bg-slate-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Opportunities Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredOpportunities.map((opp) => {
            const isReady = opp.signalStatus === 'BUY_READY';
            const isPositive = opp.change24h >= 0;

            return (
              <div
                key={opp.ticker}
                className={`bg-[#111827] rounded-xl p-5 border transition-colors flex flex-col justify-between gap-4 ${
                  isReady
                    ? 'border-emerald-500/40 hover:border-emerald-500/70'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Top Row: Ticker, Verified Native Price, Readiness Score */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-extrabold text-base text-white">
                        {opp.ticker}
                      </span>
                      <span className="text-xs text-slate-400 font-medium truncate max-w-[190px]">
                        {opp.name}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                        {opp.currency} ({opp.currencySymbol})
                      </span>
                    </div>

                    <div className="flex items-baseline gap-2.5 mt-1.5">
                      <span className="text-xl font-extrabold font-mono tabular-nums text-white">
                        {opp.currencySymbol}
                        {opp.price.toFixed(2)}
                      </span>
                      <span
                        className={`text-xs font-mono font-bold tabular-nums ${
                          isPositive ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isPositive ? '+' : ''}
                        {opp.change24h.toFixed(2)}%
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        &bull; {opp.setupLabel}
                      </span>
                    </div>
                  </div>

                  {/* Right: Score & Status */}
                  <div className="flex flex-col items-end shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Score AI</span>
                      <span
                        className={`px-2 py-0.5 rounded font-mono font-extrabold text-xs tabular-nums ${
                          opp.score >= 80
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : opp.score >= 68
                            ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {opp.score}/100
                      </span>
                    </div>
                    <span
                      className={`mt-1 text-[10px] font-mono font-bold uppercase tracking-wider ${
                        isReady
                          ? 'text-emerald-400'
                          : opp.signalStatus === 'PULLBACK_WATCH'
                          ? 'text-cyan-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {isReady
                        ? '● PRONTO INGRESSO'
                        : opp.signalStatus === 'PULLBACK_WATCH'
                        ? '◐ MONITORAGGIO PULLBACK'
                        : '○ IN ATTESA'}
                    </span>
                  </div>
                </div>

                {/* Middle Row: 4 Quantitative Metrics (Tabular Nums) */}
                <div className="grid grid-cols-4 gap-2 bg-[#0B0F17] p-3 rounded-lg border border-slate-800/80 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">RSI (14) {opp.timeframe}</span>
                    <span className="font-mono font-bold text-slate-200 tabular-nums mt-0.5 block">
                      {opp.rsi14.toFixed(1)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Supporto EMA20</span>
                    <span className="font-mono font-bold text-slate-200 tabular-nums mt-0.5 block">
                      {opp.currencySymbol}
                      {opp.ema20.toFixed(2)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Stop Loss Stretto</span>
                    <span className="font-mono font-bold text-rose-400 tabular-nums mt-0.5 block">
                      -{opp.stopLossPct}% ({opp.currencySymbol}
                      {opp.stopLossPrice})
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Target Swing</span>
                    <span className="font-mono font-bold text-emerald-400 tabular-nums mt-0.5 block">
                      +{opp.takeProfitPct}% ({opp.currencySymbol}
                      {opp.takeProfitPrice})
                    </span>
                  </div>
                </div>

                {/* AI Tactical Rationale */}
                <p className="text-xs text-slate-300 leading-relaxed">{opp.rationale}</p>

                {/* Bottom Action Row */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] font-mono text-slate-400">
                    Durata stimata: <strong className="text-slate-200">{opp.expectedHoldHours}</strong>
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleBacktestNav(opp.instrument, opp.timeframe)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Backtest</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleLaunchSingleSwingBot(opp)}
                      className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Avvia Swing ({opp.timeframe})</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
