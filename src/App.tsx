/**
 * QuantLab - Light Theme Autonomous AI Trading & Real Market Platform
 * 5 intuitive views: Panoramica, Portafoglio AI, Mercati e Grafici, Aggiornamenti AI, Backtest.
 * Strictly grounded on verified Yahoo Finance live quotes & real OHLCV history.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header, ActiveTab } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { QuantLabHomeView } from './components/QuantLabHomeView';
import { LightPortfolioTerminalView } from './components/LightPortfolioTerminalView';
import { LightMarketsChartsView } from './components/LightMarketsChartsView';
import { LightAiUpdatesView } from './components/LightAiUpdatesView';
import { LightBacktestView } from './components/LightBacktestView';
import { PaperTradingSession, Timeframe } from './types';
import { AiAutopilotConfig, AiAutopilotState } from './types/aiAutopilot';
import { globalPaperTradingEngine } from './services/paperTradingEngine';
import {
  fetchAiAutopilotState,
  runAiAutopilotCycle,
  updateAiAutopilotConfig,
  refreshAiWebBriefing,
} from './services/aiAutopilotClient';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [selectedTicker, setSelectedTicker] = useState<string>('NVDA');
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('1h');

  const [aiState, setAiState] = useState<AiAutopilotState | null>(null);
  const [paperSessions, setPaperSessions] = useState<PaperTradingSession[]>([]);

  const [isRunningAiCycle, setIsRunningAiCycle] = useState<boolean>(false);
  const [isRefreshingBriefing, setIsRefreshingBriefing] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Subscribe to real-time paper trading sessions synchronized with the server
  useEffect(() => {
    const unsubscribe = globalPaperTradingEngine.subscribe((sessions) => {
      setPaperSessions(sessions);
    });
    return () => unsubscribe();
  }, []);

  // Load AI Autopilot state (verified market snapshot + briefings + decisions) and refresh periodically
  const loadAiState = useCallback(async (refreshSnapshot = false) => {
    try {
      const state = await fetchAiAutopilotState(refreshSnapshot);
      setAiState(state);
    } catch (e) {
      console.warn('Errore aggiornamento stato AI:', e);
    }
  }, []);

  useEffect(() => {
    loadAiState(true);
    const timer = setInterval(() => {
      loadAiState(false);
    }, 20000);
    return () => clearInterval(timer);
  }, [loadAiState]);

  // Identify primary active AI portfolio session
  const activeSession = useMemo<PaperTradingSession | null>(() => {
    if (!paperSessions.length) return null;
    const portfolios = paperSessions.filter(
      (s) => s.isPortfolio || s.strategyCategory === 'MULTI_STRATEGY' || s.id.includes('portfolio')
    );
    const candidates = portfolios.length > 0 ? portfolios : paperSessions;
    const running = candidates.find((s) => s.isActive && !s.isPaused);
    return running || candidates[0] || null;
  }, [paperSessions]);

  const handleRunAiCycle = useCallback(async () => {
    if (isRunningAiCycle) return;
    setIsRunningAiCycle(true);
    setActionNotice(null);
    try {
      const result = await runAiAutopilotCycle(true);
      if (result.state) {
        setAiState(result.state);
      }
      await globalPaperTradingEngine.fetchFromServer();
      const executed = (result.decisions || []).filter((d) => d.executed);
      if (executed.length > 0) {
        const tickersList = executed.map((d) => d.ticker).join(', ');
        setActionNotice(
          `Ciclo AI completato: ${executed.length} operazioni eseguite su prezzi reali (${tickersList}).`
        );
      } else {
        setActionNotice(
          `Ciclo AI completato: mercati e posizioni analizzati con Stop Loss sotto controllo.`
        );
      }
    } catch (e: any) {
      setActionNotice(
        e?.message || 'Errore durante il ciclo decisionale AI. Riprova tra qualche secondo.'
      );
    } finally {
      setIsRunningAiCycle(false);
    }
  }, [isRunningAiCycle]);

  const handleRefreshBriefing = useCallback(async () => {
    if (isRefreshingBriefing) return;
    setIsRefreshingBriefing(true);
    setActionNotice(null);
    try {
      const res = await refreshAiWebBriefing();
      if (res.state) {
        setAiState(res.state);
      }
      setActionNotice('Bollettino mercati aggiornato con le ultime notizie dal web.');
    } catch (e: any) {
      setActionNotice(e?.message || 'Impossibile aggiornare il bollettino web al momento.');
    } finally {
      setIsRefreshingBriefing(false);
    }
  }, [isRefreshingBriefing]);

  const handleUpdateConfig = useCallback(async (partial: Partial<AiAutopilotConfig>) => {
    try {
      const updatedConfig = await updateAiAutopilotConfig(partial);
      setAiState((prev) => (prev ? { ...prev, config: updatedConfig } : prev));
    } catch (e) {
      console.warn('Errore aggiornamento configurazione AI:', e);
    }
  }, []);

  const handleToggleAutopilot = useCallback(
    (enabled: boolean) => {
      handleUpdateConfig({ autoEnabled: enabled });
    },
    [handleUpdateConfig]
  );

  const handleCleanReset = useCallback(async () => {
    if (isResetting) return;
    setIsResetting(true);
    setActionNotice(null);
    try {
      await globalPaperTradingEngine.resetCleanAndStartAiSwing({
        initialCapital: 10000,
        timeframe: '1h',
        tickers: ['NVDA', 'AAPL', 'MSFT', 'UCG.MI', 'ENEL.MI', 'META'],
      });
      await globalPaperTradingEngine.fetchFromServer();
      await loadAiState(true);
      setActionNotice(
        'Portafoglio paper azzerato a €10.000 puliti. Pronto per un nuovo test con prezzi reali verificati.'
      );
    } catch (e: any) {
      setActionNotice(e?.message || 'Errore durante il reset del portafoglio.');
    } finally {
      setIsResetting(false);
    }
  }, [isResetting, loadAiState]);

  const handleInspectTicker = useCallback((ticker: string) => {
    setSelectedTicker(ticker);
    setActiveTab('markets');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOpenBacktestForTicker = useCallback((ticker: string, tf: Timeframe) => {
    setSelectedTicker(ticker);
    setSelectedTimeframe(tf);
    setActiveTab('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleOrderExecuted = useCallback(async () => {
    await globalPaperTradingEngine.fetchFromServer();
    await loadAiState(false);
  }, [loadAiState]);

  const renderView = () => {
    switch (activeTab) {
      case 'paper':
        return (
          <LightPortfolioTerminalView
            session={activeSession}
            aiState={aiState}
            isRunningAiCycle={isRunningAiCycle}
            isResetting={isResetting}
            onRunAiCycle={handleRunAiCycle}
            onUpdateConfig={handleUpdateConfig}
            onCleanReset={handleCleanReset}
            onInspectTicker={handleInspectTicker}
          />
        );
      case 'markets':
        return (
          <LightMarketsChartsView
            aiState={aiState}
            selectedTicker={selectedTicker}
            onSelectTicker={setSelectedTicker}
            onOpenBacktestForTicker={handleOpenBacktestForTicker}
            onRefreshState={() => loadAiState(true)}
            onOrderExecuted={handleOrderExecuted}
          />
        );
      case 'updates':
        return (
          <LightAiUpdatesView
            aiState={aiState}
            isRefreshingBriefing={isRefreshingBriefing}
            isRunningAiCycle={isRunningAiCycle}
            onRefreshBriefing={handleRefreshBriefing}
            onRunAiCycle={handleRunAiCycle}
            onInspectTicker={handleInspectTicker}
          />
        );
      case 'detail':
        return (
          <LightBacktestView
            initialTicker={selectedTicker}
            initialTimeframe={selectedTimeframe}
            onSelectTicker={setSelectedTicker}
          />
        );
      case 'home':
      default:
        return (
          <QuantLabHomeView
            aiState={aiState}
            activeSession={activeSession}
            isRunningAiCycle={isRunningAiCycle}
            isRefreshingBriefing={isRefreshingBriefing}
            isResetting={isResetting}
            actionNotice={actionNotice}
            onRunAiCycle={handleRunAiCycle}
            onRefreshBriefing={handleRefreshBriefing}
            onToggleAutopilot={handleToggleAutopilot}
            onCleanReset={handleCleanReset}
            onNavigateToTab={(tab) => {
              setActiveTab(tab);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onInspectTicker={handleInspectTicker}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#E8EEF5] text-slate-900 flex flex-col font-sans antialiased">
      <Header
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        isRunningAiCycle={isRunningAiCycle}
        onRunAiCycle={handleRunAiCycle}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 md:pb-12">
        {renderView()}
      </main>

      <footer className="hidden md:block border-t border-slate-300 bg-slate-900 text-slate-300">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span>
            QuantLab · Quotazioni reali verificate da Yahoo Finance · Gestione Paper Trading con Stop Loss automatico
          </span>
          <span className="tabular-nums font-mono text-sky-300">
            Cambio EUR/USD live:{' '}
            {aiState?.eurUsdRate ? aiState.eurUsdRate.toFixed(4) : '—'}
          </span>
        </div>
      </footer>

      <BottomNav
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
}

export default App;
