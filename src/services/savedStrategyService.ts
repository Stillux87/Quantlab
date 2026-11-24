/**
 * QuantLab - Saved Custom Strategies Service
 * Manages user-named strategy presets, persistence in localStorage, and event subscriptions
 */
import { SavedStrategyPreset } from '../types';

const STORAGE_KEY = 'quantlab_saved_strategy_presets_v1';

class SavedStrategyService {
  private listeners: Array<(presets: SavedStrategyPreset[]) => void> = [];
  private presetsCache: SavedStrategyPreset[] = [];
  private isLoaded = false;

  constructor() {
    this.init();
  }

  private async init() {
    // 1. Initial read from localStorage for instant synchronous access
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.presetsCache = parsed;
        }
      }
    } catch (_) {}

    // 2. Fetch from Cloud Server API
    try {
      const res = await fetch('/api/saved-strategies');
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.presets)) {
          // Merge server presets with local presets
          const localMap = new Map(this.presetsCache.map((p) => [p.id, p]));
          let hasNew = false;
          for (const serverPreset of data.presets) {
            if (serverPreset && serverPreset.id) {
              if (!localMap.has(serverPreset.id)) {
                localMap.set(serverPreset.id, serverPreset);
                hasNew = true;
              }
            }
          }
          this.presetsCache = Array.from(localMap.values());
          this.persist(this.presetsCache);
          if (hasNew) {
            this.notify(this.presetsCache);
          }
        }
      }
    } catch (e) {
      console.warn('[SavedStrategyService] Sync from server notice:', e);
    }
    this.isLoaded = true;
  }

  /**
   * Retrieve all saved strategies
   */
  public getSavedStrategies(): SavedStrategyPreset[] {
    if (this.presetsCache.length > 0) {
      return [...this.presetsCache];
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        this.presetsCache = list;
        return [...list];
      }
      return [];
    } catch (e) {
      console.warn('[SavedStrategyService] Could not read from localStorage:', e);
      return [];
    }
  }

  /**
   * Save a new strategy with custom name and metrics
   */
  public saveStrategy(
    data: Omit<SavedStrategyPreset, 'id' | 'createdAt'>
  ): SavedStrategyPreset {
    const list = this.getSavedStrategies();
    const newPreset: SavedStrategyPreset = {
      ...data,
      id: `saved_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };

    const updated = [newPreset, ...list.filter((s) => s.name !== newPreset.name || s.instrument.ticker !== newPreset.instrument.ticker)];
    this.presetsCache = updated;
    this.persist(updated);
    this.notify(updated);

    // Sync to backend / Cloud Firestore
    fetch('/api/saved-strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPreset),
    }).catch((err) => console.warn('[SavedStrategyService] Server sync error:', err));

    return newPreset;
  }

  /**
   * Update an existing saved strategy
   */
  public updateStrategy(id: string, updates: Partial<SavedStrategyPreset>): boolean {
    const list = this.getSavedStrategies();
    const idx = list.findIndex((s) => s.id === id);
    if (idx === -1) return false;

    const updatedItem = { ...list[idx], ...updates };
    list[idx] = updatedItem;
    this.presetsCache = list;
    this.persist(list);
    this.notify(list);

    fetch('/api/saved-strategies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedItem),
    }).catch((err) => console.warn('[SavedStrategyService] Server sync update error:', err));

    return true;
  }

  /**
   * Delete a saved strategy
   */
  public deleteStrategy(id: string): boolean {
    const list = this.getSavedStrategies();
    const filtered = list.filter((s) => s.id !== id);
    if (filtered.length === list.length) return false;

    this.presetsCache = filtered;
    this.persist(filtered);
    this.notify(filtered);

    fetch(`/api/saved-strategies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }).catch((err) => console.warn('[SavedStrategyService] Server delete error:', err));

    return true;
  }

  /**
   * Subscribe to changes
   */
  public subscribe(listener: (presets: SavedStrategyPreset[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private persist(presets: SavedStrategyPreset[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    } catch (e) {
      console.warn('[SavedStrategyService] Could not write to localStorage:', e);
    }
  }

  private notify(presets: SavedStrategyPreset[]) {
    for (const l of this.listeners) {
      try {
        l(presets);
      } catch (e) {
        console.error('[SavedStrategyService] Listener error:', e);
      }
    }
  }
}

export const savedStrategyService = new SavedStrategyService();
