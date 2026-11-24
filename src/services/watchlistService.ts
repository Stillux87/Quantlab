/**
 * QuantLab - Watchlist & Favorite Instruments Management Service
 * Supports real-time persistence in localStorage and live event subscription
 */
import { Instrument } from '../types';
import { INSTRUMENTS_DATABASE } from '../data/instruments';

const WATCHLIST_STORAGE_KEY = 'quantlab_watchlist';
const LAST_SELECTED_TICKER_KEY = 'quantlab_last_selected_ticker';
const LAST_SELECTED_INSTRUMENT_KEY = 'quantlab_last_selected_instrument';

// Default initial watchlist if user hasn't customized yet
const DEFAULT_WATCHLIST_TICKERS = [
  'ENEL.MI',
  'ISP.MI',
  'RACE.MI',
  'UCG.MI',
  'NVDA',
  'AAPL',
  'SPY',
  'VWCE.DE',
];

type WatchlistListener = (items: Instrument[]) => void;
const listeners: Set<WatchlistListener> = new Set();

function notifyListeners(items: Instrument[]) {
  listeners.forEach((listener) => {
    try {
      listener(items);
    } catch (e) {
      console.error('Error in watchlist listener:', e);
    }
  });
}

export const watchlistService = {
  /**
   * Get all instruments in the watchlist
   */
  getWatchlist(): Instrument[] {
    try {
      const stored = localStorage.getItem(WATCHLIST_STORAGE_KEY);
      if (stored) {
        const parsed: any[] = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Rehydrate with latest static database data if available
          return parsed.map((item) => {
            const dbMatch = INSTRUMENTS_DATABASE.find(
              (i) => i.ticker.toUpperCase() === item.ticker?.toUpperCase()
            );
            return dbMatch ? { ...dbMatch, ...item } : item;
          });
        }
      }
    } catch (e) {
      console.warn('Could not read watchlist from localStorage:', e);
    }

    // Default watchlist on initial fresh boot
    const defaults = DEFAULT_WATCHLIST_TICKERS.map(
      (t) => INSTRUMENTS_DATABASE.find((i) => i.ticker === t)
    ).filter((x): x is Instrument => x !== undefined);

    this.saveWatchlist(defaults);
    return defaults;
  },

  /**
   * Save full watchlist to localStorage
   */
  saveWatchlist(items: Instrument[]): void {
    try {
      localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.warn('Could not save watchlist to localStorage:', e);
    }
    notifyListeners(items);
  },

  /**
   * Check if a ticker is in the watchlist
   */
  isInWatchlist(ticker: string): boolean {
    const list = this.getWatchlist();
    return list.some((i) => i.ticker.toUpperCase() === ticker.toUpperCase());
  },

  /**
   * Add an instrument to the watchlist
   */
  addToWatchlist(instrument: Instrument): Instrument[] {
    const list = this.getWatchlist();
    if (!list.some((i) => i.ticker.toUpperCase() === instrument.ticker.toUpperCase())) {
      const updated = [instrument, ...list];
      this.saveWatchlist(updated);
      return updated;
    }
    return list;
  },

  /**
   * Remove an instrument by ticker
   */
  removeFromWatchlist(ticker: string): Instrument[] {
    const list = this.getWatchlist();
    const updated = list.filter((i) => i.ticker.toUpperCase() !== ticker.toUpperCase());
    this.saveWatchlist(updated);
    return updated;
  },

  /**
   * Toggle an instrument in/out of watchlist
   */
  toggleWatchlist(instrument: Instrument): { isInList: boolean; items: Instrument[] } {
    const isPresent = this.isInWatchlist(instrument.ticker);
    if (isPresent) {
      const updated = this.removeFromWatchlist(instrument.ticker);
      return { isInList: false, items: updated };
    } else {
      const updated = this.addToWatchlist(instrument);
      return { isInList: true, items: updated };
    }
  },

  /**
   * Subscribe to live changes
   */
  subscribe(listener: WatchlistListener): () => void {
    listeners.add(listener);
    // Send current state immediately
    listener(this.getWatchlist());
    return () => {
      listeners.delete(listener);
    };
  },

  /**
   * Persistence of last selected instrument
   */
  getLastSelectedInstrument(): Instrument | null {
    try {
      const savedTicker = localStorage.getItem(LAST_SELECTED_TICKER_KEY);
      if (savedTicker) {
        const found = INSTRUMENTS_DATABASE.find(
          (i) => i.ticker.toUpperCase() === savedTicker.toUpperCase()
        );
        if (found) return found;

        const savedInstStr = localStorage.getItem(LAST_SELECTED_INSTRUMENT_KEY);
        if (savedInstStr) {
          const parsed = JSON.parse(savedInstStr);
          if (parsed && parsed.ticker) return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not load last selected instrument:', e);
    }
    return null;
  },

  getInitialInstrument(): Instrument {
    const last = this.getLastSelectedInstrument();
    if (last) return last;

    const watchlist = this.getWatchlist();
    if (watchlist.length > 0) return watchlist[0];

    return INSTRUMENTS_DATABASE.find((i) => i.ticker === 'ENEL.MI') || INSTRUMENTS_DATABASE[0];
  },

  setLastSelectedInstrument(instrument: Instrument): void {
    if (!instrument || !instrument.ticker) return;
    try {
      localStorage.setItem(LAST_SELECTED_TICKER_KEY, instrument.ticker);
      localStorage.setItem(LAST_SELECTED_INSTRUMENT_KEY, JSON.stringify(instrument));
    } catch (e) {
      console.warn('Could not persist last selected instrument:', e);
    }
  },
};
