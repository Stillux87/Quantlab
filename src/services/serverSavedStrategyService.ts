import path from 'path';
import { SavedStrategyPreset } from '../types';
import { atomicWriteJsonFile, readValidatedJsonFile } from './apiSecurity';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE_PATH = path.join(DATA_DIR, 'saved_strategies.json');

class ServerSavedStrategyService {
  private presets: Map<string, SavedStrategyPreset> = new Map();
  private isInitialized = false;

  public async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const loaded = readValidatedJsonFile<SavedStrategyPreset[]>(
      FILE_PATH,
      (v): v is SavedStrategyPreset[] => Array.isArray(v)
    );
    if (loaded) {
      for (const p of loaded) {
        if (p && typeof p.id === 'string' && p.id.length > 0) {
          this.presets.set(p.id, p);
        }
      }
      console.log(`[ServerSavedStrategyService] Caricate ${this.presets.size} strategie salvate da disco atomico.`);
    }
  }

  public getAll(ownerUid?: string, isAdmin = false): SavedStrategyPreset[] {
    const all = Array.from(this.presets.values());
    if (isAdmin || !ownerUid) return all;
    return all.filter((p) => !p.ownerUid || p.ownerUid === ownerUid);
  }

  public getById(id: string): SavedStrategyPreset | undefined {
    return this.presets.get(id);
  }

  public async save(preset: SavedStrategyPreset, ownerUid?: string): Promise<SavedStrategyPreset> {
    const record: SavedStrategyPreset = {
      ...preset,
      ownerUid: ownerUid || preset.ownerUid,
    };
    this.presets.set(record.id, record);
    this.saveToDisk();
    return record;
  }

  public async delete(
    id: string,
    requesterUid?: string,
    isAdmin = false
  ): Promise<{ ok: boolean; error?: string }> {
    const existing = this.presets.get(id);
    if (!existing) {
      return { ok: false, error: 'Strategia salvata non trovata.' };
    }
    if (!isAdmin && existing.ownerUid && requesterUid && existing.ownerUid !== requesterUid) {
      return { ok: false, error: 'Permessi insufficienti per eliminare questa strategia.' };
    }
    this.presets.delete(id);
    this.saveToDisk();
    return { ok: true };
  }

  private saveToDisk() {
    try {
      const list = Array.from(this.presets.values());
      atomicWriteJsonFile(FILE_PATH, list);
    } catch (e: any) {
      console.warn('[ServerSavedStrategyService] Errore salvataggio atomico disco:', e?.message || e);
    }
  }
}

export const serverSavedStrategyService = new ServerSavedStrategyService();
