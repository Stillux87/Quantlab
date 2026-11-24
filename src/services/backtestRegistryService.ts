import { BacktestResult, PaperTradingSession } from '../types';

const STORAGE_KEY = 'quantlab_backtest_registry_v1';
const MAX_PERSISTED_BACKTESTS = 30;

class BacktestRegistryService {
  private cache: Map<string, BacktestResult> = new Map();
  private isLoadedFromStorage = false;

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: BacktestResult[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            if (item && item.id) {
              this.cache.set(item.id, item);
            }
          });
        }
      }
      this.isLoadedFromStorage = true;
    } catch (e) {
      console.warn('[BacktestRegistry] Errore caricamento backtest da localStorage:', e);
    }
  }

  private saveToStorage() {
    if (typeof window === 'undefined') return;
    try {
      // Keep only most recent backtests to avoid exceeding localStorage quota
      const all = Array.from(this.cache.values());
      const toPersist = all.slice(-MAX_PERSISTED_BACKTESTS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
    } catch (e) {
      console.warn('[BacktestRegistry] Errore salvataggio backtest su localStorage:', e);
    }
  }

  /**
   * Registers a backtest result in the registry.
   * Ensures an immutable, unique backtestId is assigned.
   */
  public register(result: BacktestResult): BacktestResult {
    if (!result) return result;

    if (!result.id) {
      const sanitizedTicker = result.instrument?.ticker ? result.instrument.ticker.replace(/[^a-zA-Z0-9]/g, '') : 'TICKER';
      const sanitizedStrat = (result.strategyId || 'strat').replace(/[^a-zA-Z0-9_-]/g, '');
      const tf = result.timeframe || '1h';
      const timestamp = Date.now();
      const rand = Math.random().toString(36).substring(2, 6);
      result.id = `bt_${sanitizedStrat}_${sanitizedTicker}_${tf}_${timestamp}_${rand}`;
    }

    this.cache.set(result.id, JSON.parse(JSON.stringify(result)));
    this.saveToStorage();
    return result;
  }

  /**
   * Registers multiple backtests (e.g. from batch analysis)
   */
  public registerAll(results: BacktestResult[]): BacktestResult[] {
    if (!Array.isArray(results)) return [];
    results.forEach((r) => this.register(r));
    return results;
  }

  /**
   * Retrieves a backtest by its exact unique ID
   */
  public getBacktest(id?: string): BacktestResult | undefined {
    if (!id) return undefined;
    if (!this.isLoadedFromStorage) this.loadFromStorage();
    const found = this.cache.get(id);
    return found ? JSON.parse(JSON.stringify(found)) : undefined;
  }

  /**
   * Fallback lookup: Finds the best matching backtest for a paper session if backtestId was missing
   */
  public findBacktestForSession(session: {
    strategyId: string;
    instrument: { ticker: string };
    timeframe: string;
    params?: Record<string, any>;
  }): BacktestResult | undefined {
    if (!session) return undefined;
    if (!this.isLoadedFromStorage) this.loadFromStorage();

    const all = Array.from(this.cache.values());

    // 1. Exact match on strategyId, ticker, and timeframe
    const matches = all.filter(
      (b) =>
        b.strategyId === session.strategyId &&
        b.instrument?.ticker === session.instrument?.ticker &&
        b.timeframe === session.timeframe
    );

    if (matches.length > 0) {
      // Pick the most recent
      return JSON.parse(JSON.stringify(matches[matches.length - 1]));
    }

    // 2. Secondary match on strategyId and ticker
    const partialMatches = all.filter(
      (b) => b.strategyId === session.strategyId && b.instrument?.ticker === session.instrument?.ticker
    );

    if (partialMatches.length > 0) {
      return JSON.parse(JSON.stringify(partialMatches[partialMatches.length - 1]));
    }

    return undefined;
  }

  /**
   * Performs an automated strict coherence check between a paper trading session and its backtest (Requirement 4)
   */
  public verifyCoherence(
    session: {
      strategyId: string;
      strategyName?: string;
      instrument: { ticker: string; name?: string };
      timeframe: string;
      params?: Record<string, any>;
    },
    backtest: BacktestResult
  ): { isCoherent: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!session || !backtest) {
      errors.push('Sessione o Backtest non definiti per il controllo di coerenza.');
      return { isCoherent: false, errors };
    }

    // Check 1: Strategy ID
    if (session.strategyId !== backtest.strategyId) {
      errors.push(
        `Incoerenza Strategy ID: la sessione Paper Trading appartiene a "${session.strategyId}" (${session.strategyName || 'Sconosciuto'}), mentre il Backtest appartiene a "${backtest.strategyId}" (${backtest.strategyName || 'Sconosciuto'}).`
      );
    }

    // Check 2: Instrument ticker
    if (session.instrument?.ticker !== backtest.instrument?.ticker) {
      errors.push(
        `Incoerenza Strumento: la sessione Paper Trading è attiva su "${session.instrument?.ticker}", mentre il Backtest originale è su "${backtest.instrument?.ticker}".`
      );
    }

    // Check 3: Timeframe
    if (session.timeframe !== backtest.timeframe) {
      errors.push(
        `Incoerenza Timeframe: la sessione Paper Trading gira su timeframe "${session.timeframe}", mentre il Backtest originale è configurato su "${backtest.timeframe}".`
      );
    }

    return {
      isCoherent: errors.length === 0,
      errors,
    };
  }

  /**
   * Returns all cached backtests
   */
  public getAll(): BacktestResult[] {
    return Array.from(this.cache.values());
  }
}

export const backtestRegistryService = new BacktestRegistryService();
