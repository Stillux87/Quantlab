import fs from 'fs';
import path from 'path';
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { SavedStrategyPreset } from '../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE_PATH = path.join(DATA_DIR, 'saved_strategies.json');
const COLLECTION_NAME = 'saved_strategies';

class ServerSavedStrategyService {
  private presets: Map<string, SavedStrategyPreset> = new Map();
  private isInitialized = false;

  constructor() {}

  public async init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (e) {
      console.warn('[ServerSavedStrategyService] Dir creation warning:', e);
    }

    // 1. Load from local disk
    try {
      if (fs.existsSync(FILE_PATH)) {
        const raw = fs.readFileSync(FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((p: SavedStrategyPreset) => {
            if (p && p.id) {
              this.presets.set(p.id, p);
            }
          });
          console.log(`[ServerSavedStrategyService] Caricate ${this.presets.size} strategie salvate da disco.`);
        }
      }
    } catch (e) {
      console.warn('[ServerSavedStrategyService] Errore lettura disco:', e);
    }

    // 2. Fetch and merge from Firestore
    try {
      const fetchPromise = getDocs(collection(db, COLLECTION_NAME));
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Firestore init timeout (4000ms)')), 4000)
      );

      const snapshot: any = await Promise.race([fetchPromise, timeoutPromise]);
      if (snapshot && typeof snapshot.forEach === 'function') {
        let count = 0;
        snapshot.forEach((d: any) => {
          const data = d.data() as SavedStrategyPreset;
          if (data && data.id) {
            if (!this.presets.has(data.id)) {
              this.presets.set(data.id, data);
              count++;
            }
          }
        });
        if (count > 0) {
          console.log(`[ServerSavedStrategyService] Caricate ${count} nuove strategie salvate da Firestore. Totale: ${this.presets.size}`);
          this.saveToDisk();
        }
      }
    } catch (err: any) {
      console.warn('[ServerSavedStrategyService] Firestore sync notice:', err?.message || err);
    }
  }

  public getAll(): SavedStrategyPreset[] {
    return Array.from(this.presets.values());
  }

  public async save(preset: SavedStrategyPreset): Promise<SavedStrategyPreset> {
    this.presets.set(preset.id, preset);
    this.saveToDisk();

    try {
      await setDoc(doc(db, COLLECTION_NAME, preset.id), JSON.parse(JSON.stringify(preset)));
    } catch (e: any) {
      console.warn(`[ServerSavedStrategyService] Firestore save error for ${preset.id}:`, e?.message || e);
    }

    return preset;
  }

  public async delete(id: string): Promise<boolean> {
    this.presets.delete(id);
    this.saveToDisk();

    try {
      await deleteDoc(doc(db, COLLECTION_NAME, id));
    } catch (e: any) {
      console.warn(`[ServerSavedStrategyService] Firestore delete error for ${id}:`, e?.message || e);
    }

    return true;
  }

  private saveToDisk() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const list = Array.from(this.presets.values());
      fs.writeFileSync(FILE_PATH, JSON.stringify(list, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[ServerSavedStrategyService] Errore salvataggio disco:', e);
    }
  }
}

export const serverSavedStrategyService = new ServerSavedStrategyService();
