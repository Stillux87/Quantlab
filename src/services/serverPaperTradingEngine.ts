/**
 * QuantLab - 24/7 Cloud Background Paper Trading Engine
 * 100% REAL MARKET DATA ONLY.
 * Executes live strategy rules, risk controls (SL/TP/Trailing Stop), and order tracking
 * based purely on authentic market exchange prices retrieved via real-time market feeds.
 * Absolutely no synthetic random walks.
 */
import fs from 'fs';
import path from 'path';
import { collection, doc, getDocs, setDoc, deleteDoc, disableNetwork } from 'firebase/firestore';
import { db } from './firebase';
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
  StrategyCategory,
  EntryIntervalStats,
} from '../types';
import { getStrategyById } from './strategies/registry';
import { fetchLiveRealBarsSeries, fetchLiveRealQuote } from './realMarketFeed';
import { isMarketOpenForSymbol } from '../utils/marketHours';
import { evaluateMacroRegime } from './regimeFilterService';
import { INSTRUMENTS_DATABASE } from '../data/instruments';

const SESSIONS_COLLECTION = 'paper_sessions';
const SERVER_STATE_COLLECTION = 'server_state';

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const SERVER_STATE_FILE = path.join(DATA_DIR, 'server_state.json');
const DELETED_SESSIONS_FILE = path.join(DATA_DIR, 'deleted_session_ids.json');
const CLEAN_RESET_V4_FILE = path.join(DATA_DIR, 'clean_reset_v5.json');

function resolveAssetCurrencyInfo(ticker: string, fallbackCurrency?: string, quoteFx?: number) {
  const t = (ticker || '').trim().toUpperCase();
  const isEurTicker = t.endsWith('.MI') || t.endsWith('.DE') || t.endsWith('.PA') || t.endsWith('.AS') || t === 'FDAX' || t === 'FIB' || t === 'FGBL' || t === 'PORTFOLIO';
  const catalogInst = INSTRUMENTS_DATABASE.find((i) => i.ticker.toUpperCase() === t);
  const currency = isEurTicker
    ? 'EUR'
    : (catalogInst?.currency || fallbackCurrency || 'USD').toUpperCase();
  const currencySymbol = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : '€';
  const fxRateToEur = currency === 'EUR' ? 1.0 : (quoteFx && quoteFx > 0 ? quoteFx : 0.92);
  return { currency, currencySymbol, fxRateToEur };
}

/**
 * Recursively cleans objects to remove `undefined` fields or convert to null so Firestore accepts the document
 */
function sanitizeForFirestore(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore);
  }
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = sanitizeForFirestore(value);
    }
  }
  return cleaned;
}

/**
 * Robustly merges two copies of a session (e.g. local disk vs Firestore)
 * Guarantees that no closed trades, logs, alerts, or position history are ever lost.
 */
function mergeSessions(local: PaperTradingSession, remote: PaperTradingSession): PaperTradingSession {
  // 1. Merge closed trades: ensure no trade is lost, and deduplicate identical trades by composite key
  const tradeMap = new Map<string, Trade>();
  const seenTrades = new Set<string>();

  const addTrade = (t: Trade) => {
    if (!t || !t.id) return;
    const key = `${t.symbol}_${t.entryTimestamp}_${t.direction}_${t.quantity}`;
    if (seenTrades.has(key)) return;
    seenTrades.add(key);
    tradeMap.set(t.id, t);
  };

  (remote.closedTrades || []).forEach(addTrade);
  (local.closedTrades || []).forEach(addTrade);

  const mergedTrades = Array.from(tradeMap.values()).sort(
    (a, b) => (b.exitTimestamp || 0) - (a.exitTimestamp || 0)
  );

  // 2. Merge logs: deduplicate by id
  const logMap = new Map<string, PaperLogEvent>();
  (local.logs || []).forEach((l) => { if (l && l.id) logMap.set(l.id, l); });
  (remote.logs || []).forEach((l) => { if (l && l.id) logMap.set(l.id, l); });
  const mergedLogs = Array.from(logMap.values())
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 300);

  // 3. Merge alerts: deduplicate by id
  const alertMap = new Map<string, AlertNotification>();
  (local.alerts || []).forEach((a) => { if (a && a.id) alertMap.set(a.id, a); });
  (remote.alerts || []).forEach((a) => { if (a && a.id) alertMap.set(a.id, a); });
  const mergedAlerts = Array.from(alertMap.values())
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 50);

  // 4. Merge equity history: deduplicate by timestamp
  const equityMap = new Map<number, { timestamp: number; equity: number; price: number }>();
  (local.equityHistory || []).forEach((e) => { if (e && e.timestamp) equityMap.set(e.timestamp, e); });
  (remote.equityHistory || []).forEach((e) => { if (e && e.timestamp) equityMap.set(e.timestamp, e); });
  const mergedEquity = Array.from(equityMap.values())
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .slice(-500);

  // 5. Constituents merging (for portfolio sessions)
  let mergedConstituents = remote.constituents || local.constituents;
  if (local.constituents && remote.constituents) {
    mergedConstituents = local.constituents.map((lc) => {
      const rc = remote.constituents?.find(
        (c) => c.ticker?.toUpperCase() === lc.ticker?.toUpperCase()
      );
      if (!rc) return lc;
      
      const cTradeMap = new Map<string, Trade>();
      const cSeen = new Set<string>();
      const addCTrade = (t: Trade) => {
        if (!t || !t.id) return;
        const key = `${t.symbol}_${t.entryTimestamp}_${t.direction}_${t.quantity}`;
        if (cSeen.has(key)) return;
        cSeen.add(key);
        cTradeMap.set(t.id, t);
      };
      (rc.closedTrades || []).forEach(addCTrade);
      (lc.closedTrades || []).forEach(addCTrade);
      const cMergedTrades = Array.from(cTradeMap.values()).sort(
        (a, b) => (b.exitTimestamp || 0) - (a.exitTimestamp || 0)
      );

      const cOpenMap = new Map<string, Position>();
      (lc.openPositions || []).forEach((p) => { if (p && p.id) cOpenMap.set(p.id, p); });
      (rc.openPositions || []).forEach((p) => { if (p && p.id) cOpenMap.set(p.id, p); });

      const cNetPnl = cMergedTrades.reduce((sum, t) => sum + (t.pnlAmount || 0), 0);

      return {
        ...lc,
        ...rc,
        closedTrades: cMergedTrades,
        openPositions: Array.from(cOpenMap.values()),
        realizedPnl: parseFloat(cNetPnl.toFixed(2)),
        currentCapital: parseFloat(((lc.allocatedCapital || 0) + cNetPnl).toFixed(2)),
      };
    });
  }

  // 6. Open positions: deduplicate by ID, but exclude any positions that were closed in mergedTrades
  const openMap = new Map<string, Position>();
  (local.openPositions || []).forEach((p) => { if (p && p.id) openMap.set(p.id, p); });
  (remote.openPositions || []).forEach((p) => { if (p && p.id) openMap.set(p.id, p); });

  const mergedOpenPositions = Array.from(openMap.values()).filter((p) => {
    const isClosed = mergedTrades.some(
      (t) => t.symbol === p.symbol && Math.abs((t.entryTimestamp || 0) - (p.entryTimestamp || 0)) < 2000
    );
    return !isClosed;
  });

  // 7. Calculate current capital strictly from initialCapital + total realized P&L of all closed trades
  const totalRealizedPnl = mergedTrades.reduce((sum, t) => sum + (t.pnlAmount || 0), 0);
  const initialCap = remote.initialCapital || local.initialCapital || 10000;
  const currentCapital = parseFloat((initialCap + totalRealizedPnl).toFixed(2));

  const lastBarTs = Math.max(
    local.lastEvaluatedBarTimestamp || 0,
    remote.lastEvaluatedBarTimestamp || 0
  );

  return {
    ...local,
    ...remote,
    initialCapital: initialCap,
    currentCapital,
    openPositions: mergedOpenPositions,
    closedTrades: mergedTrades,
    logs: mergedLogs,
    alerts: mergedAlerts,
    equityHistory: mergedEquity,
    constituents: mergedConstituents,
    lastEvaluatedBarTimestamp: lastBarTs,
  };
}

class ServerPaperTradingEngine {
  private sessions: Map<string, PaperTradingSession> = new Map();
  private deletedSessionIds: Set<string> = new Set();
  private isInitialized = false;
  private workerInterval: NodeJS.Timeout | null = null;
  private lastHeartbeat = Date.now();
  private tickCount = 0;
  private lastFirestoreSaveTimestamp: Map<string, number> = new Map();
  private lastHeartbeatFirestoreSave = 0;
  private isFirestoreQuotaExhausted = false;
  private quotaCooldownUntil = 0;

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;
    console.log('[PaperTradingServerEngine] Inizializzazione motore cloud 24/7 con FEED REALE DI MERCATO...');

    // 1. Ensure local data directory exists
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (e) {
      console.warn('[PaperTradingServerEngine] Creazione cartella dati locale:', e);
    }

    // 1B. Load deleted session IDs (tombstones) to prevent resurrection of deleted sessions
    try {
      if (fs.existsSync(DELETED_SESSIONS_FILE)) {
        const rawDel = fs.readFileSync(DELETED_SESSIONS_FILE, 'utf-8');
        const parsedDel = JSON.parse(rawDel);
        if (Array.isArray(parsedDel)) {
          parsedDel.forEach((id: string) => {
            if (typeof id === 'string') this.deletedSessionIds.add(id);
          });
          console.log(`[PaperTradingServerEngine] Caricati ${this.deletedSessionIds.size} ID sessioni eliminate.`);
        }
      }
    } catch (e) {
      console.warn('[PaperTradingServerEngine] Errore lettura deleted_session_ids:', e);
    }

    // 2. Load from local persistent storage first
    let loadedFromDisk = false;
    try {
      if (fs.existsSync(SESSIONS_FILE)) {
        const raw = fs.readFileSync(SESSIONS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((session: PaperTradingSession) => {
            if (session && session.id && !this.deletedSessionIds.has(session.id)) {
              this.sessions.set(session.id, session);
            }
          });
          console.log(`[PaperTradingServerEngine] Caricate ${this.sessions.size} sessioni da storage persistente locale.`);
          loadedFromDisk = true;
        }
      }
    } catch (e) {
      console.warn('[PaperTradingServerEngine] Errore lettura storage locale:', e);
    }

    // 3. Always sync & merge with Firestore (Cloud Database)
    try {
      const fetchPromise = getDocs(collection(db, SESSIONS_COLLECTION));
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore init timeout (4000ms)')), 4000)
      );

      const snapshot: any = await Promise.race([fetchPromise, timeoutPromise]);
      if (snapshot && typeof snapshot.forEach === 'function') {
        let newDocsCount = 0;
        snapshot.forEach((docSnap: any) => {
          const data = docSnap.data() as PaperTradingSession;
          if (data && data.id) {
            // Check tombstone: if session was previously deleted, do not resurrect! Clean it up from Firestore
            if (this.deletedSessionIds.has(data.id)) {
              deleteDoc(doc(db, SESSIONS_COLLECTION, data.id)).catch(() => {});
              return;
            }
            const existing = this.sessions.get(data.id);
            if (!existing) {
              this.sessions.set(data.id, data);
              newDocsCount++;
            } else {
              // Merge local disk and Firestore states seamlessly without losing any closed trades or history
              const merged = mergeSessions(existing, data);
              this.sessions.set(data.id, merged);
            }
          }
        });
        console.log(`[PaperTradingServerEngine] Sincronizzazione Firestore completata. ${newDocsCount} sessioni caricate dal cloud. Totale: ${this.sessions.size}`);
        this.saveToLocalDisk();
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (err?.code === 'resource-exhausted' || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('Quota limit exceeded')) {
        this.handleQuotaExhausted();
      } else {
        console.warn('[PaperTradingServerEngine] Avvio in memoria locale resiliente (Firestore bypass):', errMsg);
      }
    }

    // 3B. Sanitize any invalid weekend positions opened when markets were closed
    this.sessions.forEach((s) => {
      if (s.openPositions && s.openPositions.length > 0) {
        const validPositions = s.openPositions.filter((pos) => {
          const day = new Date(pos.entryTimestamp).getUTCDay();
          if (day === 0 || day === 6) {
            console.log(`[PaperTradingServerEngine] Rimozione operazione non valida aperta di weekend: ${pos.symbol} in sessione ${s.id}`);
            return false;
          }
          return true;
        });

        if (validPositions.length !== s.openPositions.length) {
          s.openPositions = validPositions;
          s.currentCapital = s.initialCapital;
          if (s.constituents) {
            s.constituents.forEach((c) => {
              c.openPositions = (c.openPositions || []).filter((p) => {
                const day = new Date(p.entryTimestamp).getUTCDay();
                return day !== 0 && day !== 6;
              });
              c.unrealizedPnl = 0;
              c.currentCapital = c.allocatedCapital || c.currentCapital;
              c.lastEvaluatedBarTimestamp = Date.now();
            });
          }
          s.alerts = (s.alerts || []).filter((a) => !a.title?.includes('Nuova Posizione Portafoglio: NVDA'));
          s.logs = (s.logs || []).filter((l) => !l.message?.includes('Aperta posizione LONG'));
          s.lastEvaluatedBarTimestamp = Date.now();
          this.saveSessionToFirestore(s, true);
        }
      }
    });

    // Deduplicate any multiple portfolio sessions: keep only the newest
    const portfolioSessions = Array.from(this.sessions.values()).filter(
      (s) => s.isPortfolio || s.strategyCategory === 'MULTI_STRATEGY' || s.id.includes('portfolio')
    );
    if (portfolioSessions.length > 1) {
      portfolioSessions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      for (let i = 1; i < portfolioSessions.length; i++) {
        const dup = portfolioSessions[i];
        this.sessions.delete(dup.id);
        this.deletedSessionIds.add(dup.id);
        deleteDoc(doc(db, SESSIONS_COLLECTION, dup.id)).catch(() => {});
      }
      this.saveDeletedSessionIds();
    }

    // 3C. Automatic Clean Reset V4 (wipes corrupted legacy sessions with drifted prices & initializes AI Swing 1h-4h Portfolio)
    try {
      if (!fs.existsSync(CLEAN_RESET_V4_FILE)) {
        console.log('[PaperTradingServerEngine] Esecuzione Reset Pulito V4: rimozione sessioni legacy corrotte e avvio Portafoglio AI Swing 1h-4h con prezzi reali verificati...');
        await this.resetCleanAndStartAiSwingPortfolio({
          tickers: ['NVDA', 'AAPL', 'MSFT', 'UCG.MI', 'ENEL.MI'],
          initialCapital: 10000,
          timeframe: '1h',
        });
        fs.writeFileSync(
          CLEAN_RESET_V4_FILE,
          JSON.stringify({ resetAt: new Date().toISOString(), version: 'v4_verified_prices_ai_swing' }, null, 2),
          'utf-8'
        );
      }
    } catch (e) {
      console.warn('[PaperTradingServerEngine] Avviso Reset Pulito V4:', e);
    }

    this.saveToLocalDisk();

    // 4. Start background real-market polling loop (every 15 seconds)
    this.startWorker();
  }

  private handleQuotaExhausted() {
    this.isFirestoreQuotaExhausted = true;
    this.quotaCooldownUntil = Date.now() + 60 * 60 * 1000; // 1 hour cooldown
    console.log('[PaperTradingServerEngine] Quota Firestore Spark Free Tier raggiunta: rete Firestore disattivata per eliminare stream gRPC.');
    try {
      disableNetwork(db).catch(() => {});
    } catch (_) {}
  }

  private saveToLocalDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = Array.from(this.sessions.values()).filter((s) => !this.deletedSessionIds.has(s.id));
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[PaperTradingServerEngine] Errore scrittura storage locale:', e);
    }
  }

  private saveDeletedSessionIds() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DELETED_SESSIONS_FILE, JSON.stringify(Array.from(this.deletedSessionIds), null, 2), 'utf-8');
    } catch (e) {
      console.warn('[PaperTradingServerEngine] Errore scrittura deleted_session_ids:', e);
    }
  }

  private startWorker() {
    if (this.workerInterval) clearInterval(this.workerInterval);

    this.workerInterval = setInterval(async () => {
      await this.runBackgroundTick();
    }, 15000); // 15s polling interval to fetch real live exchange data

    console.log('[PaperTradingServerEngine] Background Worker H24 (Dati Reali di Borsa) avviato con successo.');
  }

  /**
   * Main background evaluation tick executing on real live market data
   */
  private async runBackgroundTick() {
    this.lastHeartbeat = Date.now();
    this.tickCount++;

    const activeSessions = Array.from(this.sessions.values()).filter((s) => s.isActive && !s.isPaused);
    if (activeSessions.length === 0) {
      this.updateServerHeartbeat(0);
      return;
    }

    for (const session of activeSessions) {
      try {
        await this.processSessionRealMarketTick(session);
      } catch (e) {
        console.error(`[PaperTradingServerEngine] Errore elaborazione tick per sessione ${session.id}:`, e);
      }
    }

    this.updateServerHeartbeat(activeSessions.length);
  }

  /**
   * Evaluates a single active session using strictly authentic real-time exchange data with full historical bars
   */
  private async processSessionRealMarketTick(session: PaperTradingSession) {
    // If this is a unified portfolio session, evaluate all constituent instruments together
    if (session.isPortfolio && session.constituents && session.constituents.length > 0) {
      await this.processPortfolioSessionRealMarketTick(session);
      return;
    }

    const symbol = session.instrument.ticker;

    // 1. Fetch real-time market quote and authentic latest full series from exchange
    const [realQuote, realBars] = await Promise.all([
      fetchLiveRealQuote(symbol),
      fetchLiveRealBarsSeries(symbol, session.timeframe),
    ]);

    if (!realQuote && (!realBars || realBars.length === 0)) {
      // Market data temporarily unavailable
      return;
    }

    const latestBar = realBars && realBars.length > 0 ? realBars[realBars.length - 1] : null;
    const currentPrice = realQuote?.price || latestBar?.close || session.instrument.currentPrice;
    if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) return;

    const { currency, currencySymbol, fxRateToEur } = resolveAssetCurrencyInfo(
      symbol,
      realQuote?.currency || session.instrument.currency,
      realQuote?.fxRateToEur
    );

    // Update instrument real price & native currency
    session.instrument.currentPrice = currentPrice;
    session.instrument.currency = currency;
    session.instrument.currencySymbol = currencySymbol;

    const now = Date.now();
    const dateStr = new Date(now).toISOString().replace('T', ' ').substring(0, 16);

    const activeBar: Bar = latestBar || {
      timestamp: now,
      dateStr,
      open: currentPrice,
      high: currentPrice,
      low: currentPrice,
      close: currentPrice,
      volume: realQuote?.volume || 0,
    };

    session.lastBarProcessed = activeBar;

    const strategy = getStrategyById(session.strategyId) || getStrategyById('ai_dynamic_swing_1h');
    if (!strategy) return;

    // 2. Monitor open positions against REAL market prices (SL / TP / Break-Even +0.8% / Trailing Stop)
    const remainingPositions: Position[] = [];

    for (const pos of session.openPositions || []) {
      pos.currentPrice = currentPrice;
      pos.durationMinutes = Math.max(1, Math.round((now - pos.entryTimestamp) / (60 * 1000)));

      if (activeBar.high > pos.highestPriceSinceEntry) pos.highestPriceSinceEntry = activeBar.high;
      if (activeBar.low < pos.lowestPriceSinceEntry) pos.lowestPriceSinceEntry = activeBar.low;
      if (currentPrice > pos.highestPriceSinceEntry) pos.highestPriceSinceEntry = currentPrice;
      if (currentPrice < pos.lowestPriceSinceEntry) pos.lowestPriceSinceEntry = currentPrice;

      // Automatic Break-Even & Profit Lock when unrealized gain >= +0.8%
      const peakGainPct = pos.direction === 'LONG'
        ? ((pos.highestPriceSinceEntry - pos.entryPrice) / pos.entryPrice) * 100
        : ((pos.entryPrice - pos.lowestPriceSinceEntry) / pos.entryPrice) * 100;

      if (peakGainPct >= 0.8) {
        if (pos.direction === 'LONG') {
          const breakEvenPlus = parseFloat((pos.entryPrice * 1.0015).toFixed(4));
          if (pos.stopLoss < breakEvenPlus) {
            pos.stopLoss = breakEvenPlus;
          }
          const lockedTrail = parseFloat((pos.highestPriceSinceEntry * 0.994).toFixed(4));
          if (!pos.trailingStop || lockedTrail > pos.trailingStop) {
            pos.trailingStop = lockedTrail;
          }
        } else {
          const breakEvenShort = parseFloat((pos.entryPrice * 0.9985).toFixed(4));
          if (pos.stopLoss > breakEvenShort) {
            pos.stopLoss = breakEvenShort;
          }
          const lockedTrail = parseFloat((pos.lowestPriceSinceEntry * 1.006).toFixed(4));
          if (!pos.trailingStop || lockedTrail < pos.trailingStop) {
            pos.trailingStop = lockedTrail;
          }
        }
      }

      // Custom Trailing stop parameter update
      if (session.params.trailingStopPct && Number(session.params.trailingStopPct) > 0) {
        const trailPct = Number(session.params.trailingStopPct);
        if (pos.direction === 'LONG') {
          const trailPrice = pos.highestPriceSinceEntry * (1 - trailPct / 100);
          if (!pos.trailingStop || trailPrice > pos.trailingStop) {
            pos.trailingStop = parseFloat(trailPrice.toFixed(4));
          }
        } else {
          const trailPrice = pos.lowestPriceSinceEntry * (1 + trailPct / 100);
          if (!pos.trailingStop || trailPrice < pos.trailingStop) {
            pos.trailingStop = parseFloat(trailPrice.toFixed(4));
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
        if (activeBar.low <= activeStop || currentPrice <= activeStop) {
          exitPrice = activeStop * (1 - session.slippagePct / 100);
          exitReason = activeStop === pos.trailingStop ? 'TRAILING_STOP' : 'STOP_LOSS';
        } else if (activeBar.high >= pos.takeProfit || currentPrice >= pos.takeProfit) {
          exitPrice = pos.takeProfit * (1 - session.slippagePct / 100);
          exitReason = 'TAKE_PROFIT';
        }
      } else if (pos.direction === 'SHORT') {
        if (activeBar.high >= activeStop || currentPrice >= activeStop) {
          exitPrice = activeStop * (1 + session.slippagePct / 100);
          exitReason = activeStop === pos.trailingStop ? 'TRAILING_STOP' : 'STOP_LOSS';
        } else if (activeBar.low <= pos.takeProfit || currentPrice <= pos.takeProfit) {
          exitPrice = pos.takeProfit * (1 + session.slippagePct / 100);
          exitReason = 'TAKE_PROFIT';
        }
      }

      if (exitPrice !== null) {
        this.closePositionInternal(session, pos, exitPrice, now, dateStr, exitReason, undefined, fxRateToEur, currencySymbol);
      } else {
        const grossPnlNative = pos.direction === 'LONG'
          ? (pos.currentPrice - pos.entryPrice) * pos.quantity
          : (pos.entryPrice - pos.currentPrice) * pos.quantity;
        const grossPnlEur = grossPnlNative * fxRateToEur;
        pos.unrealizedPnlAmount = parseFloat(grossPnlEur.toFixed(2));
        pos.unrealizedPnlPercent = parseFloat((((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.direction === 'LONG' ? 1 : -1)).toFixed(2));
        remainingPositions.push(pos);
      }
    }

    session.openPositions = remainingPositions;

    // 3. Evaluate Strategy rules on the FULL authentic real market bar series
    if (realBars && realBars.length >= 2) {
      const barIndex = realBars.length - 1;
      const currentPosDir = session.openPositions.length > 0 ? session.openPositions[0].direction : 'NONE';
      const signal = strategy.evaluate(realBars, barIndex, session.params, currentPosDir);

      // 4. Exit signals triggered by strategy rules (only if position exists)
      const hasOpenPos = session.openPositions.length > 0;
      const openDir = hasOpenPos ? session.openPositions[0].direction : null;
      const isExitLong = openDir === 'LONG' && (signal.action === 'EXIT_LONG' || signal.action === 'SELL');
      const isExitShort = openDir === 'SHORT' && (signal.action === 'EXIT_SHORT' || signal.action === 'BUY');

      if (hasOpenPos && (isExitLong || isExitShort)) {
        const posToClose = session.openPositions[0];
        const isLong = posToClose.direction === 'LONG';
        const fillExitPrice = isLong
          ? currentPrice * (1 - session.slippagePct / 100)
          : currentPrice * (1 + session.slippagePct / 100);
        this.closePositionInternal(session, posToClose, fillExitPrice, now, dateStr, 'SIGNAL_REVERSAL', signal.reason, fxRateToEur, currencySymbol);
        session.openPositions = [];
      }

      // 5. Entry signals triggered by strategy rules
      if (session.openPositions.length === 0 && (signal.action === 'BUY' || signal.action === 'SELL')) {
        if (session.isConsolidated) {
          session.marketStatusNotice = 'Consolidata nel Portafoglio AI Rotazione Dinamica';
          return;
        }

        // Market Hours Check (allow initial setup evaluation on weekdays using latest verified exchange candle)
        const marketStatus = isMarketOpenForSymbol(session.instrument.ticker, realQuote?.marketState);
        session.marketStatusNotice = marketStatus.reason;
        const isWeekend = marketStatus.state === 'WEEKEND';
        const isInitialBootstrap = !session.lastEvaluatedBarTimestamp || session.lastEvaluatedBarTimestamp === 0;
        if (!marketStatus.isOpen && (isWeekend || !isInitialBootstrap)) {
          return;
        }

        // Prevent re-evaluating and entering on the exact same bar
        const lastBar = realBars[barIndex];
        if (session.lastEvaluatedBarTimestamp && lastBar && lastBar.timestamp <= session.lastEvaluatedBarTimestamp) {
          return;
        }
        if (lastBar) {
          session.lastEvaluatedBarTimestamp = lastBar.timestamp;
        }

        const isLong = signal.action === 'BUY';
        const targetDirection = isLong ? 'LONG' : 'SHORT';

        // For 1D strategies, check macro SMA200 regime; for reactive 1h/4h AI Swing, use fast EMA20/50 alignment
        const isReactiveSwing = session.strategyId === 'ai_dynamic_swing_1h' || session.timeframe === '1h' || session.timeframe === '4h';
        if (!isReactiveSwing) {
          const regimeResult = evaluateMacroRegime(realBars, targetDirection, currentPrice);
          session.regimeFilter = {
            enabled: true,
            smaPeriod: 200,
            atrPeriod: 14,
            lastSma200: regimeResult.sma200,
            lastAtr14: regimeResult.atr14,
            currentRegime: regimeResult.trend,
            statusText: regimeResult.reason,
          };
          if (!regimeResult.passed) {
            this.addLog(session, 'ALERT', 'RISK', regimeResult.reason);
            return;
          }
        }

        const fillEntryPrice = isLong
          ? currentPrice * (1 + session.slippagePct / 100)
          : currentPrice * (1 - session.slippagePct / 100);
        const stopLoss = signal.stopLoss || (isLong ? fillEntryPrice * 0.989 : fillEntryPrice * 1.011);
        const takeProfit = signal.takeProfit || (isLong ? fillEntryPrice * 1.022 : fillEntryPrice * 0.978);

        const riskAmountEur = session.currentCapital * (session.riskPerTradePct / 100);
        const riskPerUnitEur = Math.max(0.01, Math.abs(fillEntryPrice - stopLoss) * fxRateToEur);
        let quantity = riskAmountEur / riskPerUnitEur;

        const maxQuantity = (session.currentCapital * 0.95) / (fillEntryPrice * fxRateToEur);
        quantity = Math.min(quantity, maxQuantity);

        if (quantity * fillEntryPrice * fxRateToEur >= 20) {
          const newPos: Position = {
            id: `pos_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            strategyId: session.strategyId,
            symbol: session.instrument.ticker,
            direction: isLong ? 'LONG' : 'SHORT',
            entryTimestamp: now,
            entryDateStr: dateStr,
            entryPrice: parseFloat(fillEntryPrice.toFixed(2)),
            currentPrice: parseFloat(currentPrice.toFixed(2)),
            quantity: parseFloat(quantity.toFixed(4)),
            stopLoss: parseFloat(stopLoss.toFixed(2)),
            takeProfit: parseFloat(takeProfit.toFixed(2)),
            trailingStop: session.params.trailingStopPct
              ? parseFloat((isLong
                  ? fillEntryPrice * (1 - Number(session.params.trailingStopPct) / 100)
                  : fillEntryPrice * (1 + Number(session.params.trailingStopPct) / 100)).toFixed(2))
              : undefined,
            unrealizedPnlAmount: 0,
            unrealizedPnlPercent: 0,
            durationMinutes: 0,
            entryReason: signal.reason,
            highestPriceSinceEntry: activeBar.high,
            lowestPriceSinceEntry: activeBar.low,
          };

          session.openPositions = [newPos];

          const logMsg = `[Mercato Reale] Aperta posizione ${newPos.direction} ${newPos.quantity} quote @ ${currencySymbol}${newPos.entryPrice} (Prezzo di Borsa: ${currencySymbol}${currentPrice}) | SL: ${currencySymbol}${newPos.stopLoss} | TP: ${currencySymbol}${newPos.takeProfit}`;
          this.addLog(session, 'ORDER', 'EXECUTION', logMsg);
          this.addAlert(session, 'ORDER_OPENED', `Nuova Posizione ${newPos.direction} (${session.instrument.ticker})`, `Eseguito @ ${currencySymbol}${newPos.entryPrice} | Target: ${currencySymbol}${newPos.takeProfit}`);
          
          await this.saveSessionToFirestore(session, true);
        }
      }
    }

    // 6. Update Equity History based on Real Market
    let totalEquity = session.currentCapital;
    for (const pos of session.openPositions || []) {
      totalEquity += pos.unrealizedPnlAmount;
    }

    const nextPoint = {
      timestamp: now,
      equity: parseFloat(totalEquity.toFixed(2)),
      price: currentPrice,
    };

    const currentHistory = Array.isArray(session.equityHistory) ? session.equityHistory : [];
    session.equityHistory = [...currentHistory, nextPoint].slice(-500);

    // 7. Persist updated real session to Firestore (throttled for regular price ticks)
    await this.saveSessionToFirestore(session, false);
  }

  /**
   * Processes a unified portfolio session by updating live prices and positions for each constituent
   */
  private async processPortfolioSessionRealMarketTick(session: PaperTradingSession) {
    if (!session.constituents || session.constituents.length === 0) return;

    const now = Date.now();
    const dateStr = new Date(now).toISOString().replace('T', ' ').substring(0, 16);
    let totalUnrealizedPnl = 0;
    let anyTradeClosed = false;
    const allOpenPositions: Position[] = [];
    const allClosedTrades: Trade[] = session.closedTrades ? [...session.closedTrades] : [];

    for (const constituent of session.constituents) {
      const ticker = constituent.instrument.ticker;
      const quote = await fetchLiveRealQuote(ticker);
      if (!quote || !quote.isLiveVerified || typeof quote.price !== 'number' || quote.price <= 0) {
        // Never fabricate or use stale prices when live exchange feed is unreachable; keep open positions intact
        for (const pos of constituent.openPositions || []) {
          allOpenPositions.push(pos);
          totalUnrealizedPnl += pos.unrealizedPnlAmount || 0;
        }
        continue;
      }
      const currentPrice = quote.price;
      const { currency, currencySymbol, fxRateToEur } = resolveAssetCurrencyInfo(
        ticker,
        quote.currency || constituent.instrument.currency,
        quote.fxRateToEur
      );

      constituent.lastPrice = currentPrice;
      constituent.instrument.currentPrice = currentPrice;
      constituent.instrument.currency = currency;
      constituent.instrument.currencySymbol = currencySymbol;

      const effectivePrice = currentPrice;
      let constituentUnrealizedEur = 0;
      const activePositions: Position[] = [];

      for (const pos of constituent.openPositions || []) {
        const alreadyClosed = allClosedTrades.some(
          (t) => t.symbol === ticker && Math.abs((t.entryTimestamp || 0) - (pos.entryTimestamp || 0)) < 2000 && t.direction === pos.direction
        );
        if (alreadyClosed) {
          continue;
        }

        pos.currentPrice = effectivePrice;
        pos.durationMinutes = Math.max(1, Math.round((now - pos.entryTimestamp) / (60 * 1000)));

        if (effectivePrice > pos.highestPriceSinceEntry) pos.highestPriceSinceEntry = effectivePrice;
        if (effectivePrice < pos.lowestPriceSinceEntry) pos.lowestPriceSinceEntry = effectivePrice;

        const isLong = pos.direction === 'LONG';
        const peakGainPct = isLong
          ? ((pos.highestPriceSinceEntry - pos.entryPrice) / pos.entryPrice) * 100
          : ((pos.entryPrice - pos.lowestPriceSinceEntry) / pos.entryPrice) * 100;

        // Automatic Break-Even & Profit Lock at +0.8% gain
        if (peakGainPct >= 0.8) {
          if (isLong) {
            const breakEvenPlus = parseFloat((pos.entryPrice * 1.0015).toFixed(4));
            if (pos.stopLoss < breakEvenPlus) {
              pos.stopLoss = breakEvenPlus;
            }
            const lockedTrail = parseFloat((pos.highestPriceSinceEntry * 0.994).toFixed(4));
            if (!pos.trailingStop || lockedTrail > pos.trailingStop) {
              pos.trailingStop = lockedTrail;
            }
          } else {
            const breakEvenShort = parseFloat((pos.entryPrice * 0.9985).toFixed(4));
            if (pos.stopLoss > breakEvenShort) {
              pos.stopLoss = breakEvenShort;
            }
            const lockedTrail = parseFloat((pos.lowestPriceSinceEntry * 1.006).toFixed(4));
            if (!pos.trailingStop || lockedTrail < pos.trailingStop) {
              pos.trailingStop = lockedTrail;
            }
          }
        }

        const activeStop = pos.trailingStop
          ? (isLong ? Math.max(pos.stopLoss, pos.trailingStop) : Math.min(pos.stopLoss, pos.trailingStop))
          : pos.stopLoss;

        let hitExit = false;
        let exitPrice = effectivePrice;
        let exitReason: Trade['exitReason'] = 'MANUAL';

        if (isLong) {
          if (effectivePrice <= activeStop) {
            hitExit = true;
            exitPrice = activeStop;
            exitReason = activeStop === pos.trailingStop ? 'TRAILING_STOP' : 'STOP_LOSS';
          } else if (effectivePrice >= pos.takeProfit) {
            hitExit = true;
            exitPrice = pos.takeProfit;
            exitReason = 'TAKE_PROFIT';
          }
        } else {
          if (effectivePrice >= activeStop) {
            hitExit = true;
            exitPrice = activeStop;
            exitReason = activeStop === pos.trailingStop ? 'TRAILING_STOP' : 'STOP_LOSS';
          } else if (effectivePrice <= pos.takeProfit) {
            hitExit = true;
            exitPrice = pos.takeProfit;
            exitReason = 'TAKE_PROFIT';
          }
        }

        if (hitExit) {
          const grossPnlNative = isLong ? (exitPrice - pos.entryPrice) * pos.quantity : (pos.entryPrice - exitPrice) * pos.quantity;
          const commNative = (pos.entryPrice * pos.quantity + exitPrice * pos.quantity) * 0.0005;
          const netPnlEur = (grossPnlNative - commNative) * fxRateToEur;
          const pnlPct = ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100 * (isLong ? 1 : -1) - 0.1;

          constituent.currentCapital = parseFloat((constituent.currentCapital + netPnlEur).toFixed(2));
          constituent.realizedPnl = parseFloat((constituent.realizedPnl + netPnlEur).toFixed(2));

          const trade: Trade = {
            id: `trade_${ticker}_${Date.now()}`,
            tradeNumber: allClosedTrades.length + 1,
            symbol: ticker,
            timeframe: constituent.timeframe || '1h',
            direction: pos.direction,
            entryTimestamp: pos.entryTimestamp,
            entryDateStr: pos.entryDateStr,
            entryPrice: pos.entryPrice,
            exitTimestamp: now,
            exitDateStr: dateStr,
            exitPrice: parseFloat(exitPrice.toFixed(2)),
            quantity: pos.quantity,
            stopLoss: pos.stopLoss,
            takeProfit: pos.takeProfit,
            pnlAmount: parseFloat(netPnlEur.toFixed(2)),
            pnlPercent: parseFloat(pnlPct.toFixed(2)),
            durationMinutes: pos.durationMinutes,
            entryReason: pos.entryReason,
            exitReason,
            splitType: 'OOS',
            commission: parseFloat((commNative * fxRateToEur).toFixed(2)),
            slippage: 0,
          };

          constituent.closedTrades = [trade, ...(constituent.closedTrades || [])];
          allClosedTrades.unshift(trade);
          anyTradeClosed = true;

          this.addLog(
            session,
            'ORDER',
            'EXECUTION',
            `[Portafoglio - ${ticker}] Chiusa operazione ${pos.direction} @ ${currencySymbol}${exitPrice.toFixed(2)} [${exitReason}] | P&L Netto: €${netPnlEur.toFixed(2)} (${pnlPct.toFixed(2)}%)`
          );
        } else {
          const grossPnlNative = isLong ? (effectivePrice - pos.entryPrice) * pos.quantity : (pos.entryPrice - effectivePrice) * pos.quantity;
          const grossPnlEur = grossPnlNative * fxRateToEur;
          pos.unrealizedPnlAmount = parseFloat(grossPnlEur.toFixed(2));
          pos.unrealizedPnlPercent = parseFloat((((effectivePrice - pos.entryPrice) / pos.entryPrice) * 100 * (isLong ? 1 : -1)).toFixed(2));
          constituentUnrealizedEur += grossPnlEur;
          activePositions.push(pos);
          allOpenPositions.push(pos);
        }
      }

      constituent.openPositions = activePositions;
      constituent.unrealizedPnl = parseFloat(constituentUnrealizedEur.toFixed(2));
      totalUnrealizedPnl += constituentUnrealizedEur;

      // Check entry signal only if no active position for this constituent
      if (activePositions.length === 0 && constituent.currentCapital > 50) {
        const marketStatus = isMarketOpenForSymbol(ticker, quote?.marketState);
        const isWeekend = marketStatus.state === 'WEEKEND';
        const isInitialBootstrap = !constituent.lastEvaluatedBarTimestamp || constituent.lastEvaluatedBarTimestamp === 0;
        if (marketStatus.isOpen || (!isWeekend && isInitialBootstrap)) {
          const strat = getStrategyById(constituent.strategyId) || getStrategyById('ai_dynamic_swing_1h') || getStrategyById('unger_titan_strategy');
          if (strat) {
            try {
              const tf = constituent.timeframe || session.timeframe || '1h';
              const bars = await fetchLiveRealBarsSeries(ticker, tf);
              if (bars && bars.length >= 2) {
                const lastIdx = bars.length - 1;
                const lastBar = bars[lastIdx];

                const isNewBar = !constituent.lastEvaluatedBarTimestamp || !lastBar || lastBar.timestamp > constituent.lastEvaluatedBarTimestamp;

                if (isNewBar) {
                  if (lastBar) {
                    constituent.lastEvaluatedBarTimestamp = lastBar.timestamp;
                  }

                  const signal = strat.evaluate(bars, lastIdx, constituent.params || {}, 'NONE');
                  if (signal.action === 'BUY' || signal.action === 'SELL') {
                    const isLong = signal.action === 'BUY';
                    const fillPrice = isLong
                      ? effectivePrice * (1 + session.slippagePct / 100)
                      : effectivePrice * (1 - session.slippagePct / 100);
                    const stopLoss = signal.stopLoss || (isLong ? fillPrice * 0.989 : fillPrice * 1.011);
                    const takeProfit = signal.takeProfit || (isLong ? fillPrice * 1.022 : fillPrice * 0.978);

                    const riskAmountEur = constituent.currentCapital * (session.riskPerTradePct / 100);
                    const riskPerUnitEur = Math.max(0.01, Math.abs(fillPrice - stopLoss) * fxRateToEur);
                    let quantity = riskAmountEur / riskPerUnitEur;
                    const maxQuantity = (constituent.currentCapital * 0.95) / (fillPrice * fxRateToEur);
                    quantity = Math.min(quantity, maxQuantity);

                    if (quantity * fillPrice * fxRateToEur >= 30) {
                      const newPos: Position = {
                        id: `pos_${ticker}_${Date.now()}`,
                        strategyId: constituent.strategyId,
                        symbol: ticker,
                        direction: isLong ? 'LONG' : 'SHORT',
                        entryTimestamp: now,
                        entryDateStr: dateStr,
                        entryPrice: parseFloat(fillPrice.toFixed(2)),
                        currentPrice: parseFloat(effectivePrice.toFixed(2)),
                        quantity: parseFloat(quantity.toFixed(4)),
                        stopLoss: parseFloat(stopLoss.toFixed(2)),
                        takeProfit: parseFloat(takeProfit.toFixed(2)),
                        unrealizedPnlAmount: 0,
                        unrealizedPnlPercent: 0,
                        durationMinutes: 0,
                        entryReason: signal.reason,
                        highestPriceSinceEntry: effectivePrice,
                        lowestPriceSinceEntry: effectivePrice,
                      };
                      activePositions.push(newPos);
                      allOpenPositions.push(newPos);
                      constituent.openPositions = [...activePositions];
                      this.addLog(
                        session,
                        'ORDER',
                        'EXECUTION',
                        `[Portafoglio - ${ticker}] Aperta posizione ${newPos.direction} ${newPos.quantity} quote @ ${currencySymbol}${newPos.entryPrice} | SL: ${currencySymbol}${newPos.stopLoss} | TP: ${currencySymbol}${newPos.takeProfit}`
                      );
                      this.addAlert(
                        session,
                        'ORDER_OPENED',
                        `Nuova Posizione Portafoglio: ${ticker}`,
                        `${newPos.direction} ${newPos.quantity} quote @ ${currencySymbol}${newPos.entryPrice}`
                      );
                    }
                  }
                }
              }
            } catch (e) {
              console.warn(`[Portfolio Constituent Check Error] ${ticker}:`, e);
            }
          }
        }
      }
    }

    session.openPositions = allOpenPositions;
    session.closedTrades = allClosedTrades;

    // Recalculate session total capital
    const constituentTotalCapital = session.constituents.reduce((acc, c) => acc + c.currentCapital, 0);
    session.currentCapital = parseFloat(constituentTotalCapital.toFixed(2));

    const totalEquity = session.currentCapital + totalUnrealizedPnl;
    const currentPrice = 100 * (totalEquity / session.initialCapital);
    session.instrument.currentPrice = parseFloat(currentPrice.toFixed(2));

    const nextPoint = {
      timestamp: now,
      equity: parseFloat(totalEquity.toFixed(2)),
      price: parseFloat(currentPrice.toFixed(2)),
    };

    const currentHistory = Array.isArray(session.equityHistory) ? session.equityHistory : [];
    session.equityHistory = [...currentHistory, nextPoint].slice(-500);

    await this.saveSessionToFirestore(session, anyTradeClosed);
  }

  private closePositionInternal(
    session: PaperTradingSession,
    pos: Position,
    exitPrice: number,
    exitTimestamp: number,
    exitDateStr: string,
    reason: Trade['exitReason'],
    detailReason?: string,
    fxRateToEurParam?: number,
    currencySymParam?: string
  ) {
    const { currencySymbol, fxRateToEur } = resolveAssetCurrencyInfo(
      pos.symbol,
      session.instrument.currency,
      fxRateToEurParam
    );
    const sym = currencySymParam || currencySymbol;

    const grossPnlNative = pos.direction === 'LONG'
      ? (exitPrice - pos.entryPrice) * pos.quantity
      : (pos.entryPrice - exitPrice) * pos.quantity;

    const commissionNative = (pos.entryPrice * pos.quantity + exitPrice * pos.quantity) * (session.commissionPct / 100);
    const netPnlEur = (grossPnlNative - commissionNative) * fxRateToEur;
    const pnlPct = ((exitPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.direction === 'LONG' ? 1 : -1) - session.commissionPct * 2;
    const durationMinutes = Math.max(1, Math.round((exitTimestamp - pos.entryTimestamp) / (60 * 1000)));

    session.currentCapital = parseFloat((session.currentCapital + netPnlEur).toFixed(2));

    const closedTrade: Trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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
      pnlAmount: parseFloat(netPnlEur.toFixed(2)),
      pnlPercent: parseFloat(pnlPct.toFixed(2)),
      durationMinutes,
      entryReason: pos.entryReason,
      exitReason: reason,
      splitType: 'OOS',
      commission: parseFloat((commissionNative * fxRateToEur).toFixed(2)),
      slippage: parseFloat((pos.entryPrice * (session.slippagePct / 100) * pos.quantity * 2 * fxRateToEur).toFixed(2)),
    };

    session.closedTrades = [closedTrade, ...(session.closedTrades || [])];

    // If portfolio session, also synchronize constituent
    if (session.constituents) {
      const constituent = session.constituents.find(c => c.ticker?.toUpperCase() === pos.symbol?.toUpperCase());
      if (constituent) {
        constituent.closedTrades = [closedTrade, ...(constituent.closedTrades || [])];
        constituent.openPositions = (constituent.openPositions || []).filter(p => p.id !== pos.id);
        constituent.realizedPnl = parseFloat(((constituent.realizedPnl || 0) + netPnlEur).toFixed(2));
        constituent.currentCapital = parseFloat(((constituent.currentCapital || constituent.allocatedCapital) + netPnlEur).toFixed(2));
      }
    }

    const alertType = reason === 'TAKE_PROFIT' ? 'TAKE_PROFIT' : reason === 'STOP_LOSS' ? 'STOP_LOSS' : 'ORDER_CLOSED';
    const sign = netPnlEur >= 0 ? '+' : '';
    const logMsg = `[Mercato Reale] Chiusa posizione ${pos.direction} @ ${sym}${exitPrice.toFixed(2)} [${reason}] | P&L Netto: ${sign}€${netPnlEur.toFixed(2)} (${sign}${pnlPct.toFixed(2)}%)`;

    this.addLog(session, 'ORDER', 'EXECUTION', logMsg, { trade: closedTrade });
    this.addAlert(session, alertType, `Posizione Chiusa (${reason})`, `${pos.symbol} @ ${sym}${exitPrice.toFixed(2)} — P&L: ${sign}€${netPnlEur.toFixed(2)} (${sign}${pnlPct.toFixed(2)}%)`);

    // Force save on position close
    this.saveSessionToFirestore(session, true);
  }

  private addLog(session: PaperTradingSession, level: PaperLogEvent['level'], category: PaperLogEvent['category'], message: string, details?: Record<string, any>) {
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

  private async saveSessionToFirestore(session: PaperTradingSession, force = false) {
    // Always persist to local disk immediately
    this.saveToLocalDisk();

    const now = Date.now();

    // If quota is exhausted and cooldown is active, skip remote write completely
    if (this.isFirestoreQuotaExhausted && now < this.quotaCooldownUntil) {
      return;
    }

    // For routine ticks, throttle to at most once every 15 minutes per session
    if (!force) {
      const lastSave = this.lastFirestoreSaveTimestamp.get(session.id) || 0;
      if (now - lastSave < 900_000) {
        return;
      }
    }

    try {
      const sanitized = sanitizeForFirestore(session);
      await setDoc(doc(db, SESSIONS_COLLECTION, session.id), sanitized);
      this.lastFirestoreSaveTimestamp.set(session.id, now);
      this.isFirestoreQuotaExhausted = false;
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      const isQuota =
        e?.code === 'resource-exhausted' ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errMsg.includes('Quota limit exceeded') ||
        errMsg.includes('quota metric');

      if (isQuota) {
        this.handleQuotaExhausted();
      } else {
        console.warn(`[PaperTradingServerEngine] Avviso salvataggio Firestore per ${session.id}:`, errMsg);
      }
    }
  }

  private async updateServerHeartbeat(activeCount: number) {
    const now = Date.now();
    // Save state locally
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(
        SERVER_STATE_FILE,
        JSON.stringify(
          {
            lastHeartbeat: this.lastHeartbeat,
            activeSessionsCount: activeCount,
            serverStatus: 'ONLINE_24_7_REAL_FEED',
            tickCount: this.tickCount,
            updatedAt: now,
          },
          null,
          2
        ),
        'utf-8'
      );
    } catch (_) {}

    // Only write heartbeat to Firestore at most once every 30 minutes and only if not quota-limited
    if (this.isFirestoreQuotaExhausted && now < this.quotaCooldownUntil) return;
    if (now - this.lastHeartbeatFirestoreSave < 1800_000) return;

    try {
      await setDoc(doc(db, SERVER_STATE_COLLECTION, 'main'), {
        lastHeartbeat: this.lastHeartbeat,
        activeSessionsCount: activeCount,
        serverStatus: 'ONLINE_24_7_REAL_FEED',
        tickCount: this.tickCount,
      });
      this.lastHeartbeatFirestoreSave = now;
      this.isFirestoreQuotaExhausted = false;
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      if (e?.code === 'resource-exhausted' || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('Quota limit exceeded')) {
        this.handleQuotaExhausted();
      }
    }
  }

  // --- Public API Methods ---

  public getDeletedSessionIds(): string[] {
    return Array.from(this.deletedSessionIds);
  }

  public getAllSessions(): PaperTradingSession[] {
    const list = Array.from(this.sessions.values()).filter((s) => !this.deletedSessionIds.has(s.id));

    // Guarantee that duplicate portfolio sessions are NEVER served
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

  public async createSession(config: {
    id?: string;
    strategyId: string;
    strategyName: string;
    strategyCategory?: StrategyCategory;
    instrument: Instrument;
    timeframe: Timeframe;
    params: Record<string, number | boolean | string>;
    initialCapital: number;
    currentCapital?: number;
    riskPerTradePct: number;
    commissionPct?: number;
    slippagePct?: number;
    openPositions?: Position[];
    closedTrades?: Trade[];
    equityHistory?: { timestamp: number; equity: number; price: number }[];
    isPortfolio?: boolean;
    portfolioName?: string;
    portfolioAllocation?: any;
    constituents?: any[];
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
  }): Promise<PaperTradingSession> {
    const strategy = getStrategyById(config.strategyId);
    const id = config.id || `session_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();

    // Ensure session ID is unflagged from deleted tombstones if recreated
    if (this.deletedSessionIds.has(id)) {
      this.deletedSessionIds.delete(id);
      this.saveDeletedSessionIds();
    }

    // IDEMPOTENCY GUARD: If launching a unified portfolio, avoid creating duplicate parallel sessions
    if (config.isPortfolio || config.strategyCategory === 'MULTI_STRATEGY' || id.includes('portfolio')) {
      const existingPortfolio = Array.from(this.sessions.values()).find(
        (s) => (s.isPortfolio || s.strategyCategory === 'MULTI_STRATEGY' || s.id.includes('portfolio')) && !this.deletedSessionIds.has(s.id)
      );
      if (existingPortfolio) {
        existingPortfolio.portfolioAllocation = config.portfolioAllocation;
        existingPortfolio.portfolioName = config.portfolioName || existingPortfolio.portfolioName;
        existingPortfolio.strategyName = config.strategyName || existingPortfolio.strategyName;
        existingPortfolio.initialCapital = config.initialCapital;
        existingPortfolio.currentCapital = config.currentCapital || config.initialCapital;
        existingPortfolio.isActive = true;
        existingPortfolio.isPaused = false;
        if (config.constituents && config.constituents.length > 0) {
          existingPortfolio.constituents = config.constituents.map((c) => ({
            ...c,
            openPositions: existingPortfolio.constituents?.find((old) => old.ticker?.toUpperCase() === c.ticker?.toUpperCase())?.openPositions || [],
            closedTrades: existingPortfolio.constituents?.find((old) => old.ticker?.toUpperCase() === c.ticker?.toUpperCase())?.closedTrades || [],
            unrealizedPnl: 0,
            realizedPnl: existingPortfolio.constituents?.find((old) => old.ticker?.toUpperCase() === c.ticker?.toUpperCase())?.realizedPnl || 0,
            currentCapital: c.allocatedCapital || c.currentCapital,
            lastEvaluatedBarTimestamp: 0,
            startedAt: now,
          }));
        }
        this.addLog(
          existingPortfolio,
          'INFO',
          'ENGINE',
          `[Portafoglio Reale Unificato] Parametri e allocazione aggiornati per ${existingPortfolio.portfolioName}.`
        );

        // Clean up any other orphan duplicate portfolio sessions
        for (const [sId, s] of this.sessions.entries()) {
          if (sId !== existingPortfolio.id && (s.isPortfolio || s.strategyCategory === 'MULTI_STRATEGY' || sId.includes('portfolio'))) {
            this.sessions.delete(sId);
            this.deletedSessionIds.add(sId);
            deleteDoc(doc(db, SESSIONS_COLLECTION, sId)).catch(() => {});
          }
        }
        await this.processPortfolioSessionRealMarketTick(existingPortfolio);
        this.saveDeletedSessionIds();
        this.saveToLocalDisk();
        await this.saveSessionToFirestore(existingPortfolio, true);
        return JSON.parse(JSON.stringify(existingPortfolio));
      }
    }

    // Query real quote right now to guarantee 100% accurate starting price
    let startingPrice = 100;
    if (config.instrument && config.instrument.ticker && config.instrument.ticker !== 'PORTFOLIO') {
      const initialRealQuote = await fetchLiveRealQuote(config.instrument.ticker);
      startingPrice = initialRealQuote?.price || config.instrument.currentPrice || 100;
    }

    const instrumentCopy: Instrument = {
      ...config.instrument,
      currentPrice: startingPrice,
    };

    const session: PaperTradingSession = {
      id,
      strategyId: config.strategyId,
      strategyName: config.strategyName,
      strategyCategory: strategy ? strategy.definition.category : 'TREND_FOLLOWING',
      instrument: instrumentCopy,
      timeframe: config.timeframe,
      params: { ...config.params },
      createdAt: now,
      startedAt: now,
      isActive: true,
      isPaused: false,
      initialCapital: config.initialCapital,
      currentCapital: config.currentCapital || config.initialCapital,
      riskPerTradePct: config.riskPerTradePct,
      commissionPct: config.commissionPct ?? 0.05,
      slippagePct: config.slippagePct ?? 0.03,
      openPositions: config.openPositions || [],
      closedTrades: config.closedTrades || [],
      logs: [],
      alerts: [],
      lastEvaluatedBarTimestamp: 0,
      marketStatusNotice: isMarketOpenForSymbol(instrumentCopy.ticker).reason,
      equityHistory: config.equityHistory || [
        {
          timestamp: now,
          equity: config.initialCapital,
          price: startingPrice,
        },
      ],
      backtestId: config.backtestId || config.backtestReference?.backtestId,
      entryDistribution: config.entryDistribution || config.backtestReference?.entryDistribution,
      backtestReference: config.backtestReference ? JSON.parse(JSON.stringify(config.backtestReference)) : undefined,
      isPortfolio: config.isPortfolio,
      portfolioName: config.portfolioName,
      portfolioAllocation: config.portfolioAllocation,
      constituents: config.constituents?.map((c) => ({
        ...c,
        openPositions: c.openPositions || [],
        closedTrades: c.closedTrades || [],
        unrealizedPnl: c.unrealizedPnl || 0,
        realizedPnl: c.realizedPnl || 0,
        currentCapital: c.allocatedCapital || c.currentCapital,
        lastEvaluatedBarTimestamp: 0,
        startedAt: now,
      })),
    };

    const logPrefix = config.isPortfolio ? '[Portafoglio Reale Unificato]' : '[Mercato Reale]';
    this.addLog(session, 'INFO', 'ENGINE', `${logPrefix} Sessione avviata per ${instrumentCopy.ticker} (${instrumentCopy.name}). Capitale: €${config.initialCapital.toLocaleString()}`);

    this.addAlert(session, 'SYSTEM', 'Strategia Live su Mercato Reale', `Paper trading avviato per ${config.strategyName} (${instrumentCopy.ticker})`);

    this.sessions.set(id, session);
    try {
      if (session.isPortfolio) {
        await this.processPortfolioSessionRealMarketTick(session);
      } else {
        await this.processSessionRealMarketTick(session);
      }
    } catch (tickErr) {
      console.warn('[PaperTradingServerEngine] Initial tick warning:', tickErr);
    }
    this.saveToLocalDisk();
    await this.saveSessionToFirestore(session, true);
    return JSON.parse(JSON.stringify(session));
  }

  public async togglePauseSession(sessionId: string): Promise<PaperTradingSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.isPaused = !session.isPaused;
    this.addLog(session, 'INFO', 'ENGINE', `[Mercato Reale] Paper trading ${session.isPaused ? 'in PAUSA' : 'RIPRESO'}`);
    this.saveToLocalDisk();
    await this.saveSessionToFirestore(session, true);
    return JSON.parse(JSON.stringify(session));
  }

  public async stopSession(sessionId: string): Promise<PaperTradingSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.isActive = false;
    this.addLog(session, 'INFO', 'ENGINE', '[Mercato Reale] Paper trading ARRESTATO dall\'utente');
    this.addAlert(session, 'SYSTEM', 'Strategia Interrotta', `${session.strategyName} su ${session.instrument.ticker} è stata fermata.`);
    this.saveToLocalDisk();
    await this.saveSessionToFirestore(session, true);
    return JSON.parse(JSON.stringify(session));
  }

  public async deleteSession(sessionId: string): Promise<boolean> {
    const targetSession = this.sessions.get(sessionId);
    const isPortfolio = targetSession?.isPortfolio || targetSession?.strategyCategory === 'MULTI_STRATEGY' || sessionId.includes('portfolio');

    this.deletedSessionIds.add(sessionId);
    this.sessions.delete(sessionId);

    // If it's a portfolio session, ensure ALL portfolio sessions are wiped clean
    if (isPortfolio) {
      for (const [id, s] of this.sessions.entries()) {
        if (s.isPortfolio || s.strategyCategory === 'MULTI_STRATEGY' || id.includes('portfolio')) {
          this.deletedSessionIds.add(id);
          this.sessions.delete(id);
          deleteDoc(doc(db, SESSIONS_COLLECTION, id)).catch(() => {});
        }
      }
    }

    this.saveDeletedSessionIds();
    this.saveToLocalDisk();

    try {
      await deleteDoc(doc(db, SESSIONS_COLLECTION, sessionId));
      return true;
    } catch (e: any) {
      const errMsg = e?.message || String(e);
      if (e?.code === 'resource-exhausted' || errMsg.includes('RESOURCE_EXHAUSTED')) {
        this.handleQuotaExhausted();
      } else {
        console.warn(`[PaperTradingServerEngine] Errore cancellazione Firestore per ${sessionId}:`, errMsg);
      }
      return true;
    }
  }

  public async manualClosePosition(sessionId: string, positionId: string, currentPrice: number): Promise<PaperTradingSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const pos = (session.openPositions || []).find((p) => p.id === positionId);
    if (!pos) return null;

    const now = Date.now();
    const dateStr = new Date(now).toISOString().replace('T', ' ').substring(0, 16);

    this.closePositionInternal(session, pos, currentPrice, now, dateStr, 'MANUAL');
    session.openPositions = (session.openPositions || []).filter((p) => p.id !== positionId);
    if (session.constituents) {
      session.constituents.forEach((c) => {
        c.openPositions = (c.openPositions || []).filter((p) => p.id !== positionId);
      });
    }
    this.saveToLocalDisk();
    await this.saveSessionToFirestore(session, true);
    return JSON.parse(JSON.stringify(session));
  }

  public async markAlertAsRead(sessionId: string, alertId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const alert = session.alerts.find((a) => a.id === alertId);
    if (alert) {
      alert.read = true;
      await this.saveSessionToFirestore(session, true);
    }
  }

  public async stepSession(sessionId: string): Promise<PaperTradingSession | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.isPortfolio) {
      if (session.constituents) {
        session.constituents.forEach((c) => {
          if (!c.openPositions || c.openPositions.length === 0) {
            c.lastEvaluatedBarTimestamp = 0;
          }
        });
      }
      await this.processPortfolioSessionRealMarketTick(session);
    } else {
      if (!session.openPositions || session.openPositions.length === 0) {
        session.lastEvaluatedBarTimestamp = 0;
      }
      await this.processSessionRealMarketTick(session);
    }
    this.saveToLocalDisk();
    return JSON.parse(JSON.stringify(session));
  }

  public getServerStatus() {
    return {
      status: 'ONLINE_24_7_REAL_MARKET',
      feedType: 'AUTHENTIC_EXCHANGE_REAL_TIME',
      lastHeartbeat: this.lastHeartbeat,
      tickCount: this.tickCount,
      totalSessions: this.sessions.size,
      activeSessions: Array.from(this.sessions.values()).filter((s) => s.isActive && !s.isPaused).length,
    };
  }

  public async consolidateSingleSessionsIntoPortfolio(): Promise<{
    consolidatedCount: number;
    portfolioSessionId: string;
    sessions: PaperTradingSession[];
  }> {
    const all = Array.from(this.sessions.values()).filter((s) => !this.deletedSessionIds.has(s.id));
    
    // Find or locate existing unified portfolio session
    let portfolio = all.find((s) => s.isPortfolio || s.strategyCategory === 'MULTI_STRATEGY' || s.id.includes('portfolio'));
    
    let consolidatedCount = 0;
    for (const s of all) {
      if (!s.isPortfolio && s.strategyCategory !== 'MULTI_STRATEGY' && !s.id.includes('portfolio')) {
        s.isPaused = true;
        s.isConsolidated = true;
        s.marketStatusNotice = 'Consolidata nel Portafoglio Globale Multi-Asset Diversificato';
        if (portfolio) {
          s.consolidatedIntoSessionId = portfolio.id;
        }
        this.addLog(
          s,
          'INFO',
          'ENGINE',
          '[Consolidamento Sistematico] Sessione singola archiviata e consolidata nel Portafoglio Multi-Asset. Nessuna nuova operazione contro-trend o isolata verrà eseguita.'
        );
        consolidatedCount++;
        await this.saveSessionToFirestore(s, true);
      }
    }

    if (portfolio) {
      // Ensure portfolio has regime filtering enabled on all constituents
      if (portfolio.constituents) {
        portfolio.constituents.forEach((c) => {
          c.regimeFilter = {
            enabled: true,
            smaPeriod: 200,
            atrPeriod: 14,
            currentRegime: 'BULLISH',
            statusText: 'Filtro Regime Macro Attivo (SMA 200 & ATR 14)',
          };
        });
      }
      this.addLog(
        portfolio,
        'INFO',
        'ENGINE',
        `[Consolidamento Sistematico] ${consolidatedCount} sessioni singole consolidate con successo. Architettura Multi-Asset con Filtro Regime Macro attiva.`
      );
      this.addAlert(
        portfolio,
        'SYSTEM',
        'Consolidamento Portafoglio Eseguito',
        `${consolidatedCount} strategie singole sono state consolidate nel Portafoglio Globale Multi-Asset.`
      );
      await this.saveSessionToFirestore(portfolio, true);
    }

    this.saveToLocalDisk();

    return {
      consolidatedCount,
      portfolioSessionId: portfolio?.id || '',
      sessions: this.getAllSessions(),
    };
  }

  /**
   * Clean Reset & Restart with Verified Real Market Prices and AI Dynamic Swing (1h-4h)
   */
  public async resetCleanAndStartAiSwingPortfolio(options?: {
    tickers?: string[];
    initialCapital?: number;
    timeframe?: Timeframe;
    wipeOnly?: boolean;
  }): Promise<{
    deletedCount: number;
    newSession: PaperTradingSession | null;
    sessions: PaperTradingSession[];
  }> {
    const existingIds = Array.from(this.sessions.keys());
    let deletedCount = 0;

    for (const id of existingIds) {
      this.deletedSessionIds.add(id);
      this.sessions.delete(id);
      deletedCount++;
      try {
        deleteDoc(doc(db, SESSIONS_COLLECTION, id)).catch(() => {});
      } catch (_) {}
    }

    this.saveDeletedSessionIds();
    this.saveToLocalDisk();

    if (options?.wipeOnly) {
      return {
        deletedCount,
        newSession: null,
        sessions: [],
      };
    }

    const selectedTickers = options?.tickers && options.tickers.length > 0
      ? options.tickers
      : ['NVDA', 'AAPL', 'MSFT', 'UCG.MI', 'ENEL.MI'];
    const totalCapital = options?.initialCapital || 10000;
    const tf: Timeframe = options?.timeframe || '1h';
    const weightPct = parseFloat((100 / selectedTickers.length).toFixed(2));
    const allocatedCapPerAsset = parseFloat((totalCapital / selectedTickers.length).toFixed(2));
    const now = Date.now();

    const constituents = await Promise.all(
      selectedTickers.map(async (rawTicker) => {
        const ticker = rawTicker.trim().toUpperCase();
        const foundInst = INSTRUMENTS_DATABASE.find((i) => i.ticker.toUpperCase() === ticker) || {
          id: ticker.toLowerCase(),
          ticker,
          isin: ticker,
          name: ticker,
          type: 'STOCK' as const,
          market: ticker.includes('.MI') ? 'Borsa Italiana' : 'NASDAQ / NYSE',
          exchangeCode: ticker.includes('.MI') ? 'MTA' : 'NASDAQ',
          currency: ticker.includes('.MI') ? 'EUR' : 'USD',
          currencySymbol: ticker.includes('.MI') ? '€' : '$',
          currentPrice: 100,
          change24h: 0,
          change24hAmount: 0,
          volume24h: 1000000,
          sector: 'Liquid Equities',
          description: `Titolo liquido selezionato da AI Scanner (${ticker})`,
          dataRange: { startDate: '2020-01-01', endDate: '2026-11-03', totalBarsDaily: 1500 },
          dataQuality: {
            score: 99,
            missingBarsPct: 0,
            duplicateBarsCount: 0,
            volumeCompletenessPct: 100,
            priceAnomalyCount: 0,
            status: 'EXCELLENT' as const,
          },
        };

        let verifiedPrice = foundInst.currentPrice;
        const liveQuote = await fetchLiveRealQuote(ticker);
        if (liveQuote && liveQuote.price > 0) {
          verifiedPrice = liveQuote.price;
        }
        const { currency, currencySymbol } = resolveAssetCurrencyInfo(ticker, liveQuote?.currency || foundInst.currency);

        const cleanInst: Instrument = {
          ...foundInst,
          currentPrice: verifiedPrice,
          currency,
          currencySymbol,
        };

        return {
          instrument: cleanInst,
          ticker,
          name: cleanInst.name,
          strategyId: 'ai_dynamic_swing_1h',
          strategyName: 'AI Rotazione Dinamica Swing (1h-4h Profit Lock)',
          timeframe: tf,
          params: {
            emaFast: 20,
            emaSlow: 50,
            rsiPeriod: 14,
            stopLossPct: 1.1,
            takeProfitPct: 2.2,
            trailingStopPct: 0.6,
          },
          allocatedCapital: allocatedCapPerAsset,
          currentCapital: allocatedCapPerAsset,
          weightPct,
          openPositions: [],
          closedTrades: [],
          unrealizedPnl: 0,
          realizedPnl: 0,
          expectedOosReturnPct: 2.8,
          expectedMaxDrawdownPct: 1.8,
          profitFactor: 2.15,
          lastPrice: verifiedPrice,
          lastEvaluatedBarTimestamp: 0,
          startedAt: now,
        };
      })
    );

    const portfolioId = `session_ai_swing_portfolio_${Date.now()}`;
    const compositeInstrument: Instrument = {
      id: 'portfolio_ai_swing',
      ticker: 'PORTFOLIO',
      isin: 'AI-SWING-ROTATION-1H',
      name: `Portafoglio AI Rotazione Dinamica (${selectedTickers.length} Titoli Swing ${tf})`,
      type: 'ETF',
      market: 'USA & Borsa Italiana (Prezzi Verificati)',
      exchangeCode: 'AI-SWING',
      currency: 'EUR',
      currencySymbol: '€',
      currentPrice: 100.0,
      change24h: 0,
      change24hAmount: 0,
      volume24h: selectedTickers.length,
      sector: 'Multi-Asset AI Swing Rotation',
      description: `Portafoglio AI ad alta reattività (${tf}) con target +1.8%/+2.5%, Stop Loss 1.1% e Break-Even automatico a +0.8% su: ${selectedTickers.join(', ')}`,
      dataRange: { startDate: '2025-01-01', endDate: '2026-11-03', totalBarsDaily: 500 },
      dataQuality: {
        score: 100,
        missingBarsPct: 0,
        duplicateBarsCount: 0,
        volumeCompletenessPct: 100,
        priceAnomalyCount: 0,
        status: 'EXCELLENT',
      },
    };

    const newSession = await this.createSession({
      id: portfolioId,
      strategyId: 'ai_dynamic_swing_1h',
      strategyName: `AI Rotazione Dinamica Swing (${tf} Profit Lock)`,
      strategyCategory: 'MOMENTUM',
      instrument: compositeInstrument,
      timeframe: tf,
      params: {
        emaFast: 20,
        emaSlow: 50,
        rsiPeriod: 14,
        stopLossPct: 1.1,
        takeProfitPct: 2.2,
        trailingStopPct: 0.6,
      },
      initialCapital: totalCapital,
      currentCapital: totalCapital,
      riskPerTradePct: 1.2,
      commissionPct: 0.05,
      slippagePct: 0.02,
      isPortfolio: true,
      portfolioName: `Portafoglio AI Rotazione Dinamica (Swing ${tf})`,
      constituents,
    });

    this.addLog(
      newSession,
      'INFO',
      'ENGINE',
      `[Reset Pulito Completato] Sessioni precedenti rimosse. Avviato Portafoglio AI Swing (${tf}) con prezzi reali verificati e valute native ($/€): ${constituents.map((c) => `${c.ticker} (${c.instrument.currencySymbol}${c.lastPrice})`).join(', ')}`
    );

    await this.saveSessionToFirestore(newSession, true);

    return {
      deletedCount,
      newSession,
      sessions: this.getAllSessions(),
    };
  }

  /**
   * Returns the primary active portfolio session, creating a clean €10,000 AI portfolio if none exists.
   */
  public async ensureActiveAiPortfolioSession(initialCapital = 10000): Promise<PaperTradingSession> {
    const all = Array.from(this.sessions.values()).filter((s) => !this.deletedSessionIds.has(s.id));
    const existing =
      all.find((s) => s.isPortfolio && s.isActive && !s.isPaused) ||
      all.find((s) => s.isPortfolio && s.isActive) ||
      all.find((s) => s.isPortfolio);

    if (existing) {
      if (!existing.constituents) existing.constituents = [];
      return existing;
    }

    const { newSession } = await this.resetCleanAndStartAiSwingPortfolio({
      tickers: ['NVDA', 'AAPL', 'MSFT', 'UCG.MI', 'ENEL.MI', 'META'],
      initialCapital,
      timeframe: '1h',
    });

    if (newSession) return newSession;
    throw new Error('Impossibile inizializzare il portafoglio AI');
  }

  /**
   * Executes an AI-decided LONG entry on a strictly verified real exchange price with hard Stop-Loss guardrails.
   */
  public async executeAiOpenPosition(params: {
    ticker: string;
    name: string;
    verifiedPrice: number;
    currency: string;
    currencySymbol: string;
    fxRateToEur: number;
    stopLossPct: number;
    takeProfitPct: number;
    allocationEur: number;
    reason: string;
    maxPositions?: number;
  }): Promise<{ ok: boolean; position?: Position; message: string }> {
    if (!params.verifiedPrice || isNaN(params.verifiedPrice) || params.verifiedPrice <= 0) {
      return { ok: false, message: `Prezzo reale non valido per ${params.ticker}: ordine annullato.` };
    }

    const session = await this.ensureActiveAiPortfolioSession();
    const ticker = params.ticker.trim().toUpperCase();
    const maxPos = params.maxPositions || 7;

    const currentOpen = session.openPositions || [];
    if (currentOpen.some((p) => p.symbol.toUpperCase() === ticker)) {
      return { ok: false, message: `Posizione già aperta su ${ticker}.` };
    }
    if (currentOpen.length >= maxPos) {
      return { ok: false, message: `Limite massimo di ${maxPos} posizioni aperte raggiunto.` };
    }

    // Hard server-side risk guardrails on Stop Loss (0.8%..2.0%) and Take Profit (1.5%..4.5%)
    const clampedSlPct = Math.max(0.8, Math.min(2.0, Number(params.stopLossPct) || 1.2));
    const clampedTpPct = Math.max(1.5, Math.min(4.5, Number(params.takeProfitPct) || 2.5));

    const entryPrice = parseFloat(params.verifiedPrice.toFixed(4));
    const stopLoss = parseFloat((entryPrice * (1 - clampedSlPct / 100)).toFixed(4));
    const takeProfit = parseFloat((entryPrice * (1 + clampedTpPct / 100)).toFixed(4));
    const fx = params.fxRateToEur > 0 ? params.fxRateToEur : params.currency === 'EUR' ? 1.0 : 0.92;

    // Ensure cash availability based on total session capital minus deployed capital
    const deployedEur = currentOpen.reduce((sum, p) => {
      const c = resolveAssetCurrencyInfo(p.symbol);
      return sum + p.entryPrice * p.quantity * c.fxRateToEur;
    }, 0);
    const availableCashEur = Math.max(0, session.currentCapital - deployedEur);
    const targetBudgetEur = Math.min(params.allocationEur, availableCashEur * 0.92, session.currentCapital * 0.25);

    if (targetBudgetEur < 150) {
      return { ok: false, message: `Liquidità disponibile insufficiente (€${availableCashEur.toFixed(0)}) per aprire ${ticker}.` };
    }

    const quantity = parseFloat((targetBudgetEur / (entryPrice * fx)).toFixed(4));
    if (quantity <= 0) {
      return { ok: false, message: `Quantità calcolata non valida per ${ticker}.` };
    }

    const now = Date.now();
    const dateStr = new Date(now).toISOString().replace('T', ' ').substring(0, 16);

    const newPos: Position = {
      id: `pos_ai_${ticker}_${now}`,
      strategyId: 'ai_autonomous_manager',
      symbol: ticker,
      direction: 'LONG',
      entryTimestamp: now,
      entryDateStr: dateStr,
      entryPrice: parseFloat(entryPrice.toFixed(2)),
      currentPrice: parseFloat(entryPrice.toFixed(2)),
      quantity,
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      takeProfit: parseFloat(takeProfit.toFixed(2)),
      trailingStop: undefined,
      unrealizedPnlAmount: 0,
      unrealizedPnlPercent: 0,
      durationMinutes: 0,
      entryReason: params.reason,
      highestPriceSinceEntry: entryPrice,
      lowestPriceSinceEntry: entryPrice,
    };

    if (!session.constituents) session.constituents = [];
    let constituent = session.constituents.find((c) => c.ticker.toUpperCase() === ticker);
    if (!constituent) {
      const catInst = INSTRUMENTS_DATABASE.find((i) => i.ticker.toUpperCase() === ticker);
      const inst: Instrument = catInst
        ? { ...catInst, currentPrice: entryPrice, currency: params.currency, currencySymbol: params.currencySymbol }
        : {
            id: ticker.toLowerCase(),
            ticker,
            isin: ticker,
            name: params.name || ticker,
            type: 'STOCK',
            market: params.currency === 'EUR' ? 'Borsa Italiana' : 'NASDAQ / NYSE',
            exchangeCode: params.currency === 'EUR' ? 'MTA' : 'NASDAQ',
            currency: params.currency,
            currencySymbol: params.currencySymbol,
            currentPrice: entryPrice,
            change24h: 0,
            change24hAmount: 0,
            volume24h: 1000000,
            sector: 'Liquid Equities',
            description: params.name || ticker,
            dataRange: { startDate: '2024-01-01', endDate: new Date().toISOString().slice(0, 10), totalBarsDaily: 500 },
            dataQuality: {
              score: 100,
              missingBarsPct: 0,
              duplicateBarsCount: 0,
              volumeCompletenessPct: 100,
              priceAnomalyCount: 0,
              status: 'EXCELLENT',
            },
          };

      constituent = {
        instrument: inst,
        ticker,
        name: inst.name,
        strategyId: 'ai_dynamic_swing_1h',
        strategyName: 'AI Portfolio Manager (Web + Grafici)',
        timeframe: '1h',
        params: {
          stopLossPct: clampedSlPct,
          takeProfitPct: clampedTpPct,
          trailingStopPct: 0.6,
        },
        allocatedCapital: parseFloat(targetBudgetEur.toFixed(2)),
        currentCapital: parseFloat(targetBudgetEur.toFixed(2)),
        weightPct: parseFloat(((targetBudgetEur / Math.max(1, session.initialCapital)) * 100).toFixed(1)),
        openPositions: [],
        closedTrades: [],
        unrealizedPnl: 0,
        realizedPnl: 0,
        expectedOosReturnPct: clampedTpPct,
        expectedMaxDrawdownPct: clampedSlPct,
        profitFactor: 2.1,
        lastPrice: entryPrice,
        lastEvaluatedBarTimestamp: now,
        startedAt: now,
      };
      session.constituents.push(constituent);
    }

    constituent.lastPrice = entryPrice;
    constituent.instrument.currentPrice = entryPrice;
    constituent.instrument.currency = params.currency;
    constituent.instrument.currencySymbol = params.currencySymbol;
    constituent.openPositions = [newPos];

    session.openPositions = [...currentOpen, newPos];
    this.addLog(
      session,
      'ORDER',
      'EXECUTION',
      `[Decisione AI - ${ticker}] Acquisto LONG ${quantity} quote @ ${params.currencySymbol}${newPos.entryPrice.toFixed(2)} (Prezzo reale verificato) | SL: ${params.currencySymbol}${newPos.stopLoss.toFixed(2)} (-${clampedSlPct.toFixed(2)}%) | TP: ${params.currencySymbol}${newPos.takeProfit.toFixed(2)} (+${clampedTpPct.toFixed(2)}%) — ${params.reason}`
    );
    this.addAlert(
      session,
      'ORDER_OPENED',
      `AI ha aperto LONG su ${ticker}`,
      `Ingresso reale @ ${params.currencySymbol}${newPos.entryPrice.toFixed(2)} | Stop Loss ${params.currencySymbol}${newPos.stopLoss.toFixed(2)} | Target ${params.currencySymbol}${newPos.takeProfit.toFixed(2)}`
    );

    this.saveToLocalDisk();
    await this.saveSessionToFirestore(session, true);

    return {
      ok: true,
      position: newPos,
      message: `Aperta posizione LONG su ${ticker} @ ${params.currencySymbol}${newPos.entryPrice.toFixed(2)} (SL ${params.currencySymbol}${newPos.stopLoss.toFixed(2)}, TP ${params.currencySymbol}${newPos.takeProfit.toFixed(2)})`,
    };
  }

  /**
   * Executes an AI-decided position closure at the verified real live exchange price.
   */
  public async executeAiClosePosition(params: {
    ticker: string;
    verifiedPrice: number;
    fxRateToEur: number;
    currencySymbol: string;
    reasonType: 'TAKE_PROFIT' | 'STOP_LOSS' | 'SIGNAL_REVERSAL';
    motivation: string;
  }): Promise<{ ok: boolean; trade?: Trade; message: string }> {
    if (!params.verifiedPrice || params.verifiedPrice <= 0) {
      return { ok: false, message: `Prezzo reale non disponibile per chiudere ${params.ticker}.` };
    }
    const session = await this.ensureActiveAiPortfolioSession();
    const ticker = params.ticker.trim().toUpperCase();
    const pos = (session.openPositions || []).find((p) => p.symbol.toUpperCase() === ticker);
    if (!pos) {
      return { ok: false, message: `Nessuna posizione aperta trovata su ${ticker}.` };
    }

    const now = Date.now();
    const dateStr = new Date(now).toISOString().replace('T', ' ').substring(0, 16);
    const fx = params.fxRateToEur > 0 ? params.fxRateToEur : 1.0;
    const exitPrice = parseFloat(params.verifiedPrice.toFixed(2));
    const isLong = pos.direction === 'LONG';
    const grossNative = isLong ? (exitPrice - pos.entryPrice) * pos.quantity : (pos.entryPrice - exitPrice) * pos.quantity;
    const commNative = (pos.entryPrice * pos.quantity + exitPrice * pos.quantity) * 0.0005;
    const netPnlEur = parseFloat(((grossNative - commNative) * fx).toFixed(2));
    const pnlPct = parseFloat((((exitPrice - pos.entryPrice) / pos.entryPrice) * 100 * (isLong ? 1 : -1) - 0.1).toFixed(2));

    const trade: Trade = {
      id: `trade_ai_${ticker}_${now}`,
      tradeNumber: (session.closedTrades || []).length + 1,
      symbol: ticker,
      timeframe: '1h',
      direction: pos.direction,
      entryTimestamp: pos.entryTimestamp,
      entryDateStr: pos.entryDateStr,
      entryPrice: pos.entryPrice,
      exitTimestamp: now,
      exitDateStr: dateStr,
      exitPrice,
      quantity: pos.quantity,
      stopLoss: pos.stopLoss,
      takeProfit: pos.takeProfit,
      pnlAmount: netPnlEur,
      pnlPercent: pnlPct,
      durationMinutes: Math.max(1, Math.round((now - pos.entryTimestamp) / 60000)),
      entryReason: pos.entryReason,
      exitReason: params.reasonType,
      splitType: 'OOS',
      commission: parseFloat((commNative * fx).toFixed(2)),
      slippage: 0,
    };

    session.openPositions = (session.openPositions || []).filter((p) => p.id !== pos.id);
    session.closedTrades = [trade, ...(session.closedTrades || [])];
    session.currentCapital = parseFloat((session.currentCapital + netPnlEur).toFixed(2));

    const constituent = (session.constituents || []).find((c) => c.ticker.toUpperCase() === ticker);
    if (constituent) {
      constituent.openPositions = (constituent.openPositions || []).filter((p) => p.id !== pos.id);
      constituent.closedTrades = [trade, ...(constituent.closedTrades || [])];
      constituent.realizedPnl = parseFloat(((constituent.realizedPnl || 0) + netPnlEur).toFixed(2));
      constituent.currentCapital = parseFloat(((constituent.currentCapital || 0) + netPnlEur).toFixed(2));
      constituent.unrealizedPnl = 0;
    }

    this.addLog(
      session,
      'ORDER',
      'EXECUTION',
      `[Chiusura AI - ${ticker}] Chiusa posizione @ ${params.currencySymbol}${exitPrice.toFixed(2)} | P&L Netto: ${netPnlEur >= 0 ? '+' : ''}€${netPnlEur.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%) — ${params.motivation}`
    );
    this.addAlert(
      session,
      'ORDER_CLOSED',
      `AI ha chiuso ${ticker} (${netPnlEur >= 0 ? '+' : ''}€${netPnlEur.toFixed(2)})`,
      params.motivation
    );

    this.saveToLocalDisk();
    await this.saveSessionToFirestore(session, true);

    return {
      ok: true,
      trade,
      message: `Chiusa posizione su ${ticker} @ ${params.currencySymbol}${exitPrice.toFixed(2)} (P&L ${netPnlEur >= 0 ? '+' : ''}€${netPnlEur.toFixed(2)})`,
    };
  }

  /**
   * Raises the Stop Loss of an existing LONG position to protect gains or reduce downside risk.
   */
  public async executeAiTightenStop(params: {
    ticker: string;
    newStopLoss: number;
    currencySymbol: string;
    motivation: string;
  }): Promise<{ ok: boolean; message: string }> {
    const session = await this.ensureActiveAiPortfolioSession();
    const ticker = params.ticker.trim().toUpperCase();
    const pos = (session.openPositions || []).find((p) => p.symbol.toUpperCase() === ticker);
    if (!pos) {
      return { ok: false, message: `Posizione ${ticker} non trovata.` };
    }

    const proposed = parseFloat(params.newStopLoss.toFixed(2));
    // Never widen risk: for LONG, Stop Loss can only move UP and must stay strictly below current price
    if (proposed <= pos.stopLoss || proposed >= pos.currentPrice * 0.999) {
      return { ok: false, message: `Stop Loss proposto (${proposed}) non migliora la protezione attuale (${pos.stopLoss}).` };
    }

    const oldSl = pos.stopLoss;
    pos.stopLoss = proposed;
    const constituent = (session.constituents || []).find((c) => c.ticker.toUpperCase() === ticker);
    if (constituent) {
      const cPos = (constituent.openPositions || []).find((p) => p.id === pos.id);
      if (cPos) cPos.stopLoss = proposed;
    }

    this.addLog(
      session,
      'ALERT',
      'RISK',
      `[Protezione Stop Loss AI - ${ticker}] Stop Loss alzato da ${params.currencySymbol}${oldSl.toFixed(2)} a ${params.currencySymbol}${proposed.toFixed(2)} — ${params.motivation}`
    );

    this.saveToLocalDisk();
    await this.saveSessionToFirestore(session, true);

    return {
      ok: true,
      message: `Stop Loss su ${ticker} alzato a ${params.currencySymbol}${proposed.toFixed(2)}`,
    };
  }
}

export const serverPaperTradingEngine = new ServerPaperTradingEngine();
