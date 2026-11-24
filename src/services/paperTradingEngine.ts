/**
 * QuantLab - Client-Side Paper Trading Engine Service
 * Synchronizes seamlessly with the 24/7 Cloud Background Engine.
 * All operations and evaluations are grounded on Real Market Data.
 */
import {
  PaperTradingSession,
  Position,
  Trade,
  PaperLogEvent,
  AlertNotification,
  Bar,
  Instrument,
  Timeframe,
  BacktestMetrics,
  UngerPortfolioAllocation,
  PortfolioConstituent,
  EntryIntervalStats,
} from '../types';
import { getStrategyById } from './strategies/registry';
import { fetchLiveRealQuote } from './realMarketFeed';

const STORAGE_KEY = 'quantlab_paper_trading_sessions_v5_clean';

export class PaperTradingEngine {
  private static readonly DELETED_KEY = 'quantlab_deleted_sessions_v5_clean';
  private sessions: Map<string, PaperTradingSession> = new Map();
  private deletedSessionIds: Set<string> = new Set();
  private listeners: Array<(sessions: PaperTradingSession[]) => void> = [];
  private isServerConnected = true;
  private syncTimer: any = null;

  constructor() {
    this.loadDeletedFromStorage();
    this.loadFromStorage();
    this.initServerSync();
  }

  private async initServerSync() {
    if (typeof window === 'undefined') return;

    // Initial fetch from server
    await this.fetchFromServer();

    // Periodic sync with server worker (every 3 seconds)
    this.syncTimer = setInterval(() => {
      this.fetchFromServer();
    }, 3000);
  }

  public async fetchFromServer(): Promise<void> {
    try {
      const res = await fetch('/api/paper/sessions');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data) {
        this.isServerConnected = true;
        let hasChanges = false;

        // 1. Sync deleted tombstones from server
        if (Array.isArray(data.deletedSessionIds)) {
          for (const delId of data.deletedSessionIds) {
            if (typeof delId === 'string' && !this.deletedSessionIds.has(delId)) {
              this.deletedSessionIds.add(delId);
              hasChanges = true;
            }
          }
          if (hasChanges) {
            this.saveDeletedToStorage();
          }
        }

        // 2. Remove any locally stored sessions that are flagged as deleted
        for (const localId of Array.from(this.sessions.keys())) {
          if (this.deletedSessionIds.has(localId)) {
            this.sessions.delete(localId);
            hasChanges = true;
          }
        }

        // 3. Merge server sessions into local state
        if (Array.isArray(data.sessions)) {
          for (const s of data.sessions) {
            if (s && s.id) {
              // NEVER resurrect a locally deleted session
              if (this.deletedSessionIds.has(s.id)) {
                // Ensure server is kept in sync by sending DELETE request
                fetch(`/api/paper/sessions/${s.id}`, { method: 'DELETE' }).catch(() => {});
                continue;
              }
              const current = this.sessions.get(s.id);
              // Preserve client backtestId, entryDistribution, and backtestReference if server didn't provide them
              if (current) {
                if (!s.backtestId && current.backtestId) s.backtestId = current.backtestId;
                if (!s.entryDistribution && current.entryDistribution) s.entryDistribution = current.entryDistribution;
                if (current.backtestReference && (!s.backtestReference || !s.backtestReference.entryDistribution)) {
                  s.backtestReference = { ...s.backtestReference, ...current.backtestReference };
                }

                // MERGE CLOSED TRADES: never drop a trade, and deduplicate identical trades by composite key
                const tradeMap = new Map<string, Trade>();
                const seenTrades = new Set<string>();
                const addTrade = (t: Trade) => {
                  if (!t || !t.id) return;
                  const key = `${t.symbol}_${t.entryTimestamp}_${t.direction}_${t.quantity}`;
                  if (seenTrades.has(key)) return;
                  seenTrades.add(key);
                  tradeMap.set(t.id, t);
                };
                (s.closedTrades || []).forEach(addTrade);
                (current.closedTrades || []).forEach(addTrade);
                s.closedTrades = Array.from(tradeMap.values()).sort(
                  (a, b) => (b.exitTimestamp || 0) - (a.exitTimestamp || 0)
                );

                // Recalculate current capital if closed trades were merged
                const totalRealizedPnl = s.closedTrades.reduce((sum, t) => sum + (t.pnlAmount || 0), 0);
                s.currentCapital = parseFloat((s.initialCapital + totalRealizedPnl).toFixed(2));

                if (s.constituents && current.constituents) {
                  s.constituents = s.constituents.map((sc) => {
                    const cc = current.constituents?.find(
                      (c) => c.ticker?.toUpperCase() === sc.ticker?.toUpperCase()
                    );
                    if (!cc) return sc;
                    const cTradeMap = new Map<string, Trade>();
                    const cSeen = new Set<string>();
                    const addCTrade = (t: Trade) => {
                      if (!t || !t.id) return;
                      const key = `${t.symbol}_${t.entryTimestamp}_${t.direction}_${t.quantity}`;
                      if (cSeen.has(key)) return;
                      cSeen.add(key);
                      cTradeMap.set(t.id, t);
                    };
                    (sc.closedTrades || []).forEach(addCTrade);
                    (cc.closedTrades || []).forEach(addCTrade);
                    return {
                      ...sc,
                      closedTrades: Array.from(cTradeMap.values()).sort(
                        (a, b) => (b.exitTimestamp || 0) - (a.exitTimestamp || 0)
                      ),
                    };
                  });
                }
              }
              const isDifferent = !current || JSON.stringify(current) !== JSON.stringify(s);
              if (isDifferent) {
                this.sessions.set(s.id, s);
                hasChanges = true;
              }
            }
          }

          // 4. If local has sessions deleted from server, remove them (protect newly created sessions)
          const serverIds = new Set(data.sessions.map((s: any) => s.id));
          const now = Date.now();
          for (const localId of Array.from(this.sessions.keys())) {
            const localSession = this.sessions.get(localId);
            const isFresh = localSession && (now - (localSession.createdAt || 0) < 15000);
            if (!serverIds.has(localId) && data.sessions.length > 0 && !isFresh) {
              this.sessions.delete(localId);
              hasChanges = true;
            }
          }
        }

        // 5. Deduplicate portfolio sessions in local state: keep only the newest
        const portfolioSessions = Array.from(this.sessions.values()).filter(
          (s) => (s.isPortfolio || s.strategyCategory === 'MULTI_STRATEGY' || s.id.includes('portfolio')) && !this.deletedSessionIds.has(s.id)
        );
        if (portfolioSessions.length > 1) {
          portfolioSessions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          for (let i = 1; i < portfolioSessions.length; i++) {
            const dup = portfolioSessions[i];
            this.sessions.delete(dup.id);
            this.deletedSessionIds.add(dup.id);
            fetch(`/api/paper/sessions/${dup.id}`, { method: 'DELETE' }).catch(() => {});
            hasChanges = true;
          }
          this.saveDeletedToStorage();
        }

        if (hasChanges) {
          this.saveToStorage();
          this.notify(false);
        }
      }
    } catch (e) {
      // Server unreachable, fallback to local storage
      this.isServerConnected = false;
    }
  }

  public subscribe(listener: (sessions: PaperTradingSession[]) => void): () => void {
    this.listeners.push(listener);
    listener(this.getAllSessions());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(syncToServer = true) {
    const list = this.getAllSessions();
    this.saveToStorage();
    for (const listener of this.listeners) {
      listener(list);
    }
  }

  public getAllSessions(): PaperTradingSession[] {
    const list = Array.from(this.sessions.values()).filter((s) => !this.deletedSessionIds.has(s.id));

    // Guarantee that no duplicate portfolio sessions are returned
    const portfolios = list.filter((s) => s.isPortfolio || s.strategyCategory === 'MULTI_STRATEGY' || s.id.includes('portfolio'));
    if (portfolios.length > 1) {
      portfolios.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const keepId = portfolios[0].id;
      return list
        .filter((s) => (!s.isPortfolio && s.strategyCategory !== 'MULTI_STRATEGY' && !s.id.includes('portfolio')) || s.id === keepId)
        .map((s) => JSON.parse(JSON.stringify(s)));
    }

    return list.map((s) => JSON.parse(JSON.stringify(s)));
  }

  public getSession(id: string): PaperTradingSession | undefined {
    if (this.deletedSessionIds.has(id)) return undefined;
    const s = this.sessions.get(id);
    return s ? JSON.parse(JSON.stringify(s)) : undefined;
  }

  public isCloudH24Active(): boolean {
    return this.isServerConnected;
  }

  /**
   * Starts a new paper trading session (Synced with 24/7 Cloud Background Engine)
   */
  public createSession(config: {
    strategyId: string;
    strategyName: string;
    instrument: Instrument;
    timeframe: Timeframe;
    params: Record<string, number | boolean | string>;
    initialCapital: number;
    riskPerTradePct: number;
    commissionPct?: number;
    slippagePct?: number;
    backtestId?: string;
    entryDistribution?: EntryIntervalStats;
    backtestReference?: {
      backtestId?: string;
      metrics: BacktestMetrics;
      score: number;
      entryDistribution?: EntryIntervalStats;
      startDate?: string;
      endDate?: string;
    };
  }): PaperTradingSession {
    const strategy = getStrategyById(config.strategyId);
    const id = `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    const effectiveBacktestId = config.backtestId || config.backtestReference?.backtestId;
    const effectiveDistribution = config.entryDistribution || config.backtestReference?.entryDistribution;

    const session: PaperTradingSession = {
      id,
      strategyId: config.strategyId,
      strategyName: config.strategyName,
      strategyCategory: strategy ? strategy.definition.category : 'TREND_FOLLOWING',
      instrument: { ...config.instrument },
      timeframe: config.timeframe,
      params: { ...config.params },
      createdAt: now,
      startedAt: now,
      isActive: true,
      isPaused: false,
      initialCapital: config.initialCapital,
      currentCapital: config.initialCapital,
      riskPerTradePct: config.riskPerTradePct,
      commissionPct: config.commissionPct || 0.05,
      slippagePct: config.slippagePct || 0.03,
      openPositions: [],
      closedTrades: [],
      logs: [],
      alerts: [],
      lastEvaluatedBarTimestamp: now,
      equityHistory: [
        {
          timestamp: now,
          equity: config.initialCapital,
          price: config.instrument.currentPrice,
        },
      ],
      backtestId: effectiveBacktestId,
      backtestReference: config.backtestReference ? JSON.parse(JSON.stringify(config.backtestReference)) : undefined,
      entryDistribution: effectiveDistribution,
    };

    this.addLog(session, 'INFO', 'ENGINE', `Inizializzazione Paper Trading su Mercato Reale per ${config.instrument.ticker} (${config.instrument.name}). Capitale: €${config.initialCapital.toLocaleString()}`);
    this.addAlert(session, 'SYSTEM', 'Strategia Attiva su Mercato Reale', `Paper trading attivo per ${config.strategyName} su ${config.instrument.ticker}`);

    this.sessions.set(id, session);
    this.notify();

    // Sync to backend server
    fetch('/api/paper/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...config, id }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.session) {
          this.sessions.set(data.session.id, data.session);
          this.notify(false);
        }
      })
      .catch((err) => console.warn('Sync session to server warning:', err));

    return JSON.parse(JSON.stringify(session));
  }

  /**
   * Starts a unified global paper trading session for an entire portfolio
   * The portfolio runs as a single entity on live market data, keeping constituents synchronized
   */
  public createPortfolioSession(config: {
    portfolioName: string;
    allocation: UngerPortfolioAllocation;
    strategyId?: string;
    strategyName?: string;
    params?: Record<string, number | boolean | string>;
  }): PaperTradingSession {
    const now = Date.now();
    const allocation = config.allocation;
    const portfolioName = config.portfolioName || `Portafoglio Unger Diversificato (${allocation.assets.length} Titoli)`;

    // Check if an existing portfolio session is already running
    const existingPortfolio = Array.from(this.sessions.values()).find(
      (s) => s.isPortfolio && s.isActive && !this.deletedSessionIds.has(s.id)
    );

    // Build constituents
    const constituents: PortfolioConstituent[] = allocation.assets.map((asset) => {
      return {
        instrument: { ...asset.instrument },
        ticker: asset.instrument.ticker,
        name: asset.instrument.name,
        strategyId: config.strategyId || asset.strategyId || 'unger_titan_strategy',
        strategyName: config.strategyName || asset.strategyName || 'Titan Unger Strategy Lab',
        timeframe: '1D',
        params: config.params || { riskPerTradePct: 1.5 },
        allocatedCapital: asset.allocatedCapital,
        currentCapital: asset.allocatedCapital,
        weightPct: asset.weightPct,
        openPositions: [],
        closedTrades: [],
        unrealizedPnl: 0,
        realizedPnl: 0,
        expectedOosReturnPct: asset.expectedOosReturnPct,
        expectedMaxDrawdownPct: asset.expectedMaxDrawdownPct,
        profitFactor: 2.15,
        lastPrice: asset.instrument.currentPrice,
        lastEvaluatedBarTimestamp: now,
      };
    });

    if (existingPortfolio) {
      // Cleanly update active portfolio session rather than creating an unmanaged duplicate
      existingPortfolio.portfolioAllocation = allocation;
      existingPortfolio.portfolioName = portfolioName;
      existingPortfolio.strategyName = portfolioName;
      existingPortfolio.initialCapital = allocation.targetCapital;
      existingPortfolio.currentCapital = allocation.targetCapital;
      existingPortfolio.constituents = constituents;
      existingPortfolio.timeframe = '1D';
      existingPortfolio.params = config.params || { riskPerTradePct: 1.5 };
      this.addLog(
        existingPortfolio,
        'INFO',
        'ENGINE',
        `[Portafoglio Globale] Allocazione e pesi aggiornati per "${portfolioName}" (${allocation.assets.length} titoli). Capitale Complessivo: €${allocation.targetCapital.toLocaleString()}`
      );
      this.addAlert(
        existingPortfolio,
        'SYSTEM',
        'Portafoglio Aggiornato',
        `Nuova allocazione applicata a ${portfolioName}`
      );
      this.saveToStorage();
      this.notify();

      fetch('/api/paper/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(existingPortfolio),
      }).catch((err) => console.warn('Sync portfolio session update warning:', err));

      return JSON.parse(JSON.stringify(existingPortfolio));
    }

    const id = `session_portfolio_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    if (this.deletedSessionIds.has(id)) {
      this.deletedSessionIds.delete(id);
      this.saveDeletedToStorage();
    }

    // Composite Instrument representing the Portfolio as a single entity
    const compositeInstrument: Instrument = {
      id: `portfolio_${id}`,
      ticker: 'PORTFOLIO',
      isin: `PORT_${id.toUpperCase()}`,
      name: portfolioName,
      type: 'STOCK',
      market: 'Global Basket',
      exchangeCode: 'PORTFOLIO',
      currency: 'EUR',
      currencySymbol: '€',
      currentPrice: 100.0,
      previousClose: 100.0,
      change24h: 0.85,
      change24hAmount: 0.85,
      volume24h: allocation.assets.length,
      sector: 'Multi-Asset Portfolio',
      description: `Portafoglio Globale Multi-Asset Diversificato composto da ${allocation.assets.length} titoli (${allocation.assets.map((a) => a.instrument.ticker).join(', ')})`,
      dataRange: {
        startDate: '2019-01-01',
        endDate: '2026-12-31',
        totalBarsDaily: 1800,
      },
      dataQuality: {
        score: 99,
        missingBarsPct: 0,
        duplicateBarsCount: 0,
        volumeCompletenessPct: 100,
        priceAnomalyCount: 0,
        status: 'EXCELLENT',
      },
    };

    const openPositions: Position[] = [];
    const closedTrades: Trade[] = [];

    const session: PaperTradingSession = {
      id,
      strategyId: config.strategyId || 'portfolio_strategy_bundle',
      strategyName: portfolioName,
      strategyCategory: 'UNGER_TITAN',
      instrument: compositeInstrument,
      timeframe: '1D',
      params: config.params || { riskPerTradePct: 1.5 },
      createdAt: now,
      startedAt: now,
      isActive: true,
      isPaused: false,
      initialCapital: allocation.targetCapital,
      currentCapital: allocation.targetCapital,
      riskPerTradePct: 1.5,
      commissionPct: 0.05,
      slippagePct: 0.03,
      openPositions,
      closedTrades,
      logs: [],
      alerts: [],
      lastEvaluatedBarTimestamp: now,
      equityHistory: [
        {
          timestamp: now,
          equity: allocation.targetCapital,
          price: 100,
        },
      ],
      isPortfolio: true,
      portfolioName,
      portfolioAllocation: allocation,
      constituents,
    };

    this.addLog(
      session,
      'INFO',
      'ENGINE',
      `Inizializzazione Portafoglio Globale "${portfolioName}" (${allocation.assets.length} titoli) su Mercato Reale H24. Capitale Complessivo: €${allocation.targetCapital.toLocaleString()}`
    );
    this.addAlert(
      session,
      'SYSTEM',
      'Portafoglio Globale Attivo in Live Paper',
      `Esecuzione unificata attiva per ${portfolioName} (${allocation.assets.length} asset decorrelati)`
    );

    this.sessions.set(id, session);
    this.notify();

    // Sync to backend server
    fetch('/api/paper/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.session) {
          this.sessions.set(data.session.id, data.session);
          this.notify(false);
        }
      })
      .catch((err) => console.warn('Sync portfolio session to server warning:', err));

    return JSON.parse(JSON.stringify(session));
  }

  /**
   * Process a single live bar on the client (if needed) with FULL historical series
   */
  public processBar(sessionId: string, currentBar: Bar, historicalBars: Bar[]): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive || session.isPaused) return;

    session.lastBarProcessed = currentBar;
    session.instrument.currentPrice = currentBar.close;
    const strategy = getStrategyById(session.strategyId);
    if (!strategy) return;

    // 1. Update and check existing open positions against REAL market prices
    const remainingPositions: Position[] = [];

    for (const pos of session.openPositions || []) {
      pos.currentPrice = currentBar.close;
      pos.durationMinutes = Math.max(1, Math.round((currentBar.timestamp - pos.entryTimestamp) / (60 * 1000)));

      if (currentBar.high > pos.highestPriceSinceEntry) pos.highestPriceSinceEntry = currentBar.high;
      if (currentBar.low < pos.lowestPriceSinceEntry) pos.lowestPriceSinceEntry = currentBar.low;

      if (session.params.trailingStopPct && Number(session.params.trailingStopPct) > 0) {
        const trailPct = Number(session.params.trailingStopPct);
        if (pos.direction === 'LONG') {
          const trailPrice = pos.highestPriceSinceEntry * (1 - trailPct / 100);
          if (!pos.trailingStop || trailPrice > pos.trailingStop) {
            pos.trailingStop = trailPrice;
          }
        } else {
          const trailPrice = pos.lowestPriceSinceEntry * (1 + trailPct / 100);
          if (!pos.trailingStop || trailPrice < pos.trailingStop) {
            pos.trailingStop = trailPrice;
          }
        }
      }

      const activeStop = pos.trailingStop
        ? (pos.direction === 'LONG'
            ? (pos.trailingStop > pos.stopLoss ? pos.trailingStop : pos.stopLoss)
            : (pos.trailingStop < pos.stopLoss ? pos.trailingStop : pos.stopLoss))
        : pos.stopLoss;
      let exitPrice: number | null = null;
      let exitReason: Trade['exitReason'] = 'MANUAL';

      if (pos.direction === 'LONG') {
        if (currentBar.low <= activeStop) {
          exitPrice = activeStop * (1 - session.slippagePct / 100);
          exitReason = activeStop === pos.trailingStop ? 'TRAILING_STOP' : 'STOP_LOSS';
        } else if (currentBar.high >= pos.takeProfit) {
          exitPrice = pos.takeProfit * (1 - session.slippagePct / 100);
          exitReason = 'TAKE_PROFIT';
        }
      } else if (pos.direction === 'SHORT') {
        if (currentBar.high >= activeStop) {
          exitPrice = activeStop * (1 + session.slippagePct / 100);
          exitReason = activeStop === pos.trailingStop ? 'TRAILING_STOP' : 'STOP_LOSS';
        } else if (currentBar.low <= pos.takeProfit) {
          exitPrice = pos.takeProfit * (1 + session.slippagePct / 100);
          exitReason = 'TAKE_PROFIT';
        }
      }

      if (exitPrice !== null) {
        this.closePositionInternal(session, pos, exitPrice, currentBar.timestamp, currentBar.dateStr, exitReason);
      } else {
        const grossPnl = pos.direction === 'LONG'
          ? (pos.currentPrice - pos.entryPrice) * pos.quantity
          : (pos.entryPrice - pos.currentPrice) * pos.quantity;
        pos.unrealizedPnlAmount = parseFloat(grossPnl.toFixed(2));
        pos.unrealizedPnlPercent = parseFloat((((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.direction === 'LONG' ? 1 : -1)).toFixed(2));
        remainingPositions.push(pos);
      }
    }

    session.openPositions = remainingPositions;

    // 2. Evaluate Strategy Rule with full series
    const fullSeries = [...(historicalBars || []), currentBar];
    if (fullSeries.length >= 2) {
      const barIndex = fullSeries.length - 1;
      const currentPosDirection = session.openPositions.length > 0 ? session.openPositions[0].direction : 'NONE';
      const signal = strategy.evaluate(fullSeries, barIndex, session.params, currentPosDirection);

      // 3. Process Exit Signals
      const hasOpenPos = session.openPositions.length > 0;
      const openDir = hasOpenPos ? session.openPositions[0].direction : null;
      const isExitLong = openDir === 'LONG' && (signal.action === 'EXIT_LONG' || signal.action === 'SELL');
      const isExitShort = openDir === 'SHORT' && (signal.action === 'EXIT_SHORT' || signal.action === 'BUY');

      if (hasOpenPos && (isExitLong || isExitShort)) {
        const posToClose = session.openPositions[0];
        const isLong = posToClose.direction === 'LONG';
        const fillExitPrice = isLong
          ? currentBar.close * (1 - session.slippagePct / 100)
          : currentBar.close * (1 + session.slippagePct / 100);
        this.closePositionInternal(session, posToClose, fillExitPrice, currentBar.timestamp, currentBar.dateStr, 'SIGNAL_REVERSAL', signal.reason);
        session.openPositions = [];
      }

      // 4. Process Entry Signals
      if (session.openPositions.length === 0 && (signal.action === 'BUY' || signal.action === 'SELL')) {
        const isLong = signal.action === 'BUY';
        const fillEntryPrice = isLong
          ? currentBar.close * (1 + session.slippagePct / 100)
          : currentBar.close * (1 - session.slippagePct / 100);
        const stopLoss = signal.stopLoss || (isLong ? fillEntryPrice * 0.975 : fillEntryPrice * 1.025);
        const takeProfit = signal.takeProfit || (isLong ? fillEntryPrice * 1.055 : fillEntryPrice * 0.945);

        const riskAmount = session.currentCapital * (session.riskPerTradePct / 100);
        const riskPerUnit = Math.max(0.01, Math.abs(fillEntryPrice - stopLoss));
        let quantity = riskAmount / riskPerUnit;

        const maxQuantity = (session.currentCapital * 0.95) / fillEntryPrice;
        quantity = Math.min(quantity, maxQuantity);

        if (quantity * fillEntryPrice >= 30) {
          const now = currentBar.timestamp || Date.now();
          const d = new Date(now);
          const entryDateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

          const newPos: Position = {
            id: `pos_${Date.now()}`,
            strategyId: session.strategyId,
            symbol: session.instrument.ticker,
            direction: isLong ? 'LONG' : 'SHORT',
            entryTimestamp: now,
            entryDateStr,
            entryPrice: parseFloat(fillEntryPrice.toFixed(2)),
            currentPrice: parseFloat(currentBar.close.toFixed(2)),
            quantity: parseFloat(quantity.toFixed(4)),
            stopLoss: parseFloat(stopLoss.toFixed(2)),
            takeProfit: parseFloat(takeProfit.toFixed(2)),
            trailingStop: session.params.trailingStopPct
              ? (isLong
                  ? fillEntryPrice * (1 - Number(session.params.trailingStopPct) / 100)
                  : fillEntryPrice * (1 + Number(session.params.trailingStopPct) / 100))
              : undefined,
            unrealizedPnlAmount: 0,
            unrealizedPnlPercent: 0,
            durationMinutes: 0,
            entryReason: signal.reason,
            highestPriceSinceEntry: currentBar.high,
            lowestPriceSinceEntry: currentBar.low,
          };

          session.openPositions = [newPos];

          const logMsg = `Aperta posizione ${newPos.direction} ${newPos.quantity} quote @ €${newPos.entryPrice} | SL: €${newPos.stopLoss} | TP: €${newPos.takeProfit}`;
          this.addLog(session, 'ORDER', 'EXECUTION', logMsg);
          this.addAlert(session, 'ORDER_OPENED', `Nuova Posizione ${newPos.direction}`, `${session.instrument.ticker} - Quantità ${newPos.quantity} @ €${newPos.entryPrice}`);
        }
      }
    }

    // 5. Update Equity History
    let totalEquity = session.currentCapital;
    for (const pos of (session.openPositions || [])) {
      totalEquity += pos.unrealizedPnlAmount;
    }

    const nextPoint = {
      timestamp: currentBar.timestamp,
      equity: parseFloat(totalEquity.toFixed(2)),
      price: currentBar.close,
    };

    const currentHistory = Array.isArray(session.equityHistory) ? session.equityHistory : [];
    session.equityHistory = [...currentHistory, nextPoint].slice(-500);

    this.notify();
  }

  private closePositionInternal(
    session: PaperTradingSession,
    pos: Position,
    exitPrice: number,
    exitTimestamp: number,
    exitDateStr: string,
    reason: Trade['exitReason'],
    detailReason?: string
  ) {
    const grossPnl = pos.direction === 'LONG'
      ? (exitPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - exitPrice) * pos.quantity;

    const commission = (pos.entryPrice * pos.quantity + exitPrice * pos.quantity) * (session.commissionPct / 100);
    const netPnl = grossPnl - commission;
    const pnlPct = ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.direction === 'LONG' ? 1 : -1) - session.commissionPct * 2;
    const durationMinutes = Math.max(1, Math.round((exitTimestamp - pos.entryTimestamp) / (60 * 1000)));

    session.currentCapital += netPnl;

    const closedTrade: Trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      tradeNumber: (session.closedTrades || []).length + 1,
      symbol: pos.symbol,
      timeframe: session.timeframe,
      direction: pos.direction,
      entryTimestamp: pos.entryTimestamp,
      entryDateStr: pos.entryDateStr,
      entryPrice: pos.entryPrice,
      exitTimestamp,
      exitDateStr,
      exitPrice: parseFloat(exitPrice.toFixed(2)),
      quantity: pos.quantity,
      stopLoss: pos.stopLoss,
      takeProfit: pos.takeProfit,
      pnlAmount: parseFloat(netPnl.toFixed(2)),
      pnlPercent: parseFloat(pnlPct.toFixed(2)),
      durationMinutes,
      entryReason: pos.entryReason,
      exitReason: reason,
      splitType: 'OOS',
      commission: parseFloat(commission.toFixed(2)),
      slippage: parseFloat((pos.entryPrice * (session.slippagePct / 100) * pos.quantity * 2).toFixed(2)),
    };

    session.closedTrades = [closedTrade, ...(session.closedTrades || [])];

    const alertType = reason === 'TAKE_PROFIT' ? 'TAKE_PROFIT' : reason === 'STOP_LOSS' ? 'STOP_LOSS' : 'ORDER_CLOSED';
    const sign = netPnl >= 0 ? '+' : '';
    const logMsg = `Chiusa posizione ${pos.direction} @ €${exitPrice.toFixed(2)} [${reason}] | P&L: ${sign}€${netPnl.toFixed(2)} (${sign}${pnlPct.toFixed(2)}%)`;

    this.addLog(session, 'ORDER', 'EXECUTION', logMsg, { trade: closedTrade });
    this.addAlert(session, alertType, `Posizione Chiusa (${reason})`, `${pos.symbol} - Risultato: ${sign}€${netPnl.toFixed(2)} (${sign}${pnlPct.toFixed(2)}%)`);
  }

  public manualOpenPosition(sessionId: string, direction: 'LONG' | 'SHORT' = 'LONG', customPrice?: number): Position | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const currentPrice = customPrice || session.lastBarProcessed?.close || session.instrument.currentPrice;
    const fillEntryPrice = currentPrice * (direction === 'LONG' ? (1 + session.slippagePct / 100) : (1 - session.slippagePct / 100));
    const stopLoss = direction === 'LONG' ? fillEntryPrice * 0.98 : fillEntryPrice * 1.02;
    const takeProfit = direction === 'LONG' ? fillEntryPrice * 1.045 : fillEntryPrice * 0.955;

    const riskAmount = session.currentCapital * (session.riskPerTradePct / 100);
    const riskPerUnit = Math.max(0.01, Math.abs(fillEntryPrice - stopLoss));
    let quantity = riskAmount / riskPerUnit;

    const maxQuantity = (session.currentCapital * 0.95) / fillEntryPrice;
    quantity = Math.max(1, Math.min(quantity, maxQuantity));

    const now = Date.now();
    const d = new Date(now);
    const entryDateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

    const newPos: Position = {
      id: `pos_${now}`,
      strategyId: session.strategyId,
      symbol: session.instrument.ticker,
      direction,
      entryTimestamp: now,
      entryDateStr,
      entryPrice: parseFloat(fillEntryPrice.toFixed(2)),
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      quantity: parseFloat(quantity.toFixed(4)),
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      takeProfit: parseFloat(takeProfit.toFixed(2)),
      trailingStop: session.params.trailingStopPct
        ? direction === 'LONG'
          ? fillEntryPrice * (1 - Number(session.params.trailingStopPct) / 100)
          : fillEntryPrice * (1 + Number(session.params.trailingStopPct) / 100)
        : undefined,
      unrealizedPnlAmount: 0,
      unrealizedPnlPercent: 0,
      durationMinutes: 0,
      entryReason: 'Apertura Simulazione Manuale / Live Test',
      highestPriceSinceEntry: currentPrice,
      lowestPriceSinceEntry: currentPrice,
    };

    session.openPositions = [newPos];
    const sym = session.instrument.currencySymbol || '€';
    const logMsg = `Aperta posizione ${newPos.direction} ${newPos.quantity} quote @ ${sym}${newPos.entryPrice} | SL: ${sym}${newPos.stopLoss} | TP: ${sym}${newPos.takeProfit} (${entryDateStr})`;
    this.addLog(session, 'ORDER', 'EXECUTION', logMsg);
    this.addAlert(session, 'ORDER_OPENED', `Nuova Posizione ${newPos.direction}`, `${session.instrument.ticker} - Quantità ${newPos.quantity} @ ${sym}${newPos.entryPrice} alle ${entryDateStr}`);
    this.notify();
    return newPos;
  }

  public manualClosePosition(sessionId: string, positionId: string, currentPrice: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const pos = (session.openPositions || []).find((p) => p.id === positionId);
    if (!pos) return;

    const now = Date.now();
    const dateStr = new Date(now).toISOString().replace('T', ' ').substring(0, 16);

    this.closePositionInternal(session, pos, currentPrice, now, dateStr, 'MANUAL');
    session.openPositions = (session.openPositions || []).filter((p) => p.id !== positionId);
    this.notify();

    fetch(`/api/paper/sessions/${sessionId}/close-position`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionId, currentPrice }),
    }).catch((e) => console.warn('Manual close sync error:', e));
  }

  public togglePauseSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.isPaused = !session.isPaused;
    this.addLog(session, 'INFO', 'ENGINE', `Paper trading ${session.isPaused ? 'in PAUSA' : 'RIPRESO'}`);
    this.notify();

    fetch(`/api/paper/sessions/${sessionId}/pause`, { method: 'POST' }).catch((e) =>
      console.warn('Pause sync error:', e)
    );
  }

  public stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.isActive = false;
    this.addLog(session, 'INFO', 'ENGINE', 'Paper trading ARRESTATO');
    this.addAlert(session, 'SYSTEM', 'Strategia Interrotta', `${session.strategyName} su ${session.instrument.ticker} è stata fermata.`);
    this.notify();

    fetch(`/api/paper/sessions/${sessionId}/stop`, { method: 'POST' }).catch((e) =>
      console.warn('Stop sync error:', e)
    );
  }

  public deleteSession(sessionId: string): void {
    const target = this.sessions.get(sessionId);
    const isPortfolio = target?.isPortfolio || target?.strategyCategory === 'MULTI_STRATEGY' || sessionId.includes('portfolio');

    this.deletedSessionIds.add(sessionId);
    this.sessions.delete(sessionId);

    if (isPortfolio) {
      for (const [id, s] of this.sessions.entries()) {
        if (s.isPortfolio || s.strategyCategory === 'MULTI_STRATEGY' || id.includes('portfolio')) {
          this.deletedSessionIds.add(id);
          this.sessions.delete(id);
          fetch(`/api/paper/sessions/${id}`, { method: 'DELETE' }).catch(() => {});
        }
      }
    }

    this.saveDeletedToStorage();
    this.saveToStorage();
    this.notify();

    fetch(`/api/paper/sessions/${sessionId}`, { method: 'DELETE' }).catch((e) =>
      console.warn('Delete sync error:', e)
    );
  }

  public async consolidateSessions(): Promise<{ consolidatedCount: number; portfolioSessionId: string }> {
    try {
      const res = await fetch('/api/paper/consolidate', { method: 'POST' });
      const data = await res.json();
      if (data && Array.isArray(data.sessions)) {
        this.sessions.clear();
        for (const s of data.sessions) {
          if (s && s.id && !this.deletedSessionIds.has(s.id)) {
            this.sessions.set(s.id, s);
          }
        }
        this.saveToStorage();
        this.notify();
      }
      return {
        consolidatedCount: data?.consolidatedCount || 0,
        portfolioSessionId: data?.portfolioSessionId || '',
      };
    } catch (e) {
      console.warn('Failed to consolidate paper sessions:', e);
      return { consolidatedCount: 0, portfolioSessionId: '' };
    }
  }

  public async resetCleanAndStartAiSwing(options?: {
    tickers?: string[];
    initialCapital?: number;
    timeframe?: Timeframe;
    wipeOnly?: boolean;
  }): Promise<{ deletedCount: number; newSession: PaperTradingSession | null }> {
    try {
      for (const id of Array.from(this.sessions.keys())) {
        this.deletedSessionIds.add(id);
      }
      this.sessions.clear();
      this.saveDeletedToStorage();
      this.saveToStorage();

      const res = await fetch('/api/paper/reset-clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      });
      const data = await res.json();
      if (data && Array.isArray(data.sessions)) {
        for (const s of data.sessions) {
          if (s && s.id) {
            this.deletedSessionIds.delete(s.id);
            this.sessions.set(s.id, s);
          }
        }
        this.saveDeletedToStorage();
        this.saveToStorage();
        this.notify(false);
      }
      return {
        deletedCount: data?.deletedCount || 0,
        newSession: data?.newSession || null,
      };
    } catch (e) {
      console.warn('Failed to reset clean sessions:', e);
      return { deletedCount: 0, newSession: null };
    }
  }

  public markAlertAsRead(sessionId: string, alertId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const alert = session.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.read = true;
      this.notify(false);
    }
  }

  private addLog(
    session: PaperTradingSession,
    level: PaperLogEvent['level'],
    category: PaperLogEvent['category'],
    message: string,
    details?: Record<string, any>
  ) {
    const now = Date.now();
    const d = new Date(now);
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;

    const log: PaperLogEvent = {
      id: `log_${now}_${Math.random().toString(36).substring(2, 5)}`,
      timestamp: now,
      timeStr,
      strategyId: session.strategyId,
      level,
      category,
      message,
      details,
    };

    const currentLogs = Array.isArray(session.logs) ? session.logs : [];
    session.logs = [log, ...currentLogs].slice(0, 300);
  }

  private addAlert(session: PaperTradingSession, type: AlertNotification['type'], title: string, message: string) {
    const now = Date.now();
    const d = new Date(now);
    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    const alert: AlertNotification = {
      id: `alert_${now}_${Math.random().toString(36).substring(2, 5)}`,
      timestamp: now,
      timeStr,
      type,
      title,
      message,
      read: false,
      symbol: session.instrument.ticker,
      strategyName: session.strategyName,
    };

    const currentAlerts = Array.isArray(session.alerts) ? session.alerts : [];
    session.alerts = [alert, ...currentAlerts].slice(0, 50);
  }

  private loadDeletedFromStorage() {
    try {
      if (typeof window === 'undefined') return;
      const raw = localStorage.getItem(PaperTradingEngine.DELETED_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach((id: string) => {
          if (typeof id === 'string') this.deletedSessionIds.add(id);
        });
      }
    } catch (e) {
      console.warn('Failed to load deleted sessions from storage:', e);
    }
  }

  private saveDeletedToStorage() {
    try {
      if (typeof window === 'undefined') return;
      localStorage.setItem(
        PaperTradingEngine.DELETED_KEY,
        JSON.stringify(Array.from(this.deletedSessionIds))
      );
    } catch (e) {
      console.warn('Failed to save deleted sessions to storage:', e);
    }
  }

  private loadFromStorage() {
    try {
      if (typeof window === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const s of parsed) {
          if (s && s.id && !this.deletedSessionIds.has(s.id)) {
            this.sessions.set(s.id, s);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load paper trading sessions from local storage:', e);
    }
  }

  private saveToStorage() {
    try {
      if (typeof window === 'undefined') return;
      const list = this.getAllSessions();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to save paper trading sessions to local storage:', e);
    }
  }
}

export const globalPaperTradingEngine = new PaperTradingEngine();
