/**
 * QuantLab - Backend API Security, Token Verification, Rate Limiting, Input Validation & Atomic Persistence
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request, Response, NextFunction } from 'express';
import firebaseConfig from '../../firebase-applet-config.json';
import { Timeframe } from '../types';

export interface VerifiedAuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  isAdmin: boolean;
  authMethod: 'FIREBASE_ID_TOKEN' | 'API_KEY';
}

export interface AuthenticatedRequest extends Request {
  authUser?: VerifiedAuthUser;
}

const DEFAULT_ADMIN_EMAILS = ['stallaandrea@gmail.com'];

function getAdminEmails(): Set<string> {
  const envAdmins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_ADMIN_EMAILS, ...envAdmins]);
}

// ============================================================================
// 1. Firebase ID Token Verification (via Google Identity Toolkit accounts:lookup)
// ============================================================================
interface TokenCacheEntry {
  user: VerifiedAuthUser;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCacheEntry>();
const TOKEN_CACHE_TTL_MS = 4 * 60 * 1000; // 4 minutes

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function timingSafeStringEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function verifyFirebaseIdToken(
  idToken: string
): Promise<VerifiedAuthUser | null> {
  if (!idToken || typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 8192) {
    return null;
  }

  const key = hashToken(idToken);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  const apiKey = firebaseConfig?.apiKey;
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    clearTimeout(timer);

    if (!res.ok) return null;
    const json: any = await res.json();
    const acct = Array.isArray(json?.users) ? json.users[0] : null;
    if (!acct || typeof acct.localId !== 'string') return null;

    const email = typeof acct.email === 'string' ? acct.email.toLowerCase() : null;
    const emailVerified = acct.emailVerified === true;
    const isAdmin = emailVerified && email !== null && getAdminEmails().has(email);

    const verified: VerifiedAuthUser = {
      uid: acct.localId,
      email,
      emailVerified,
      isAdmin,
      authMethod: 'FIREBASE_ID_TOKEN',
    };

    tokenCache.set(key, {
      user: verified,
      expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
    });

    // Prevent unbounded cache growth
    if (tokenCache.size > 500) {
      const now = Date.now();
      for (const [k, entry] of tokenCache.entries()) {
        if (entry.expiresAt <= now) tokenCache.delete(k);
      }
    }

    return verified;
  } catch {
    return null;
  }
}

export async function resolveRequestAuth(req: Request): Promise<VerifiedAuthUser | null> {
  // Option A: Server-configured automation API key (optional, never hardcoded)
  const configuredApiKey = process.env.QUANTLAB_API_KEY;
  const headerApiKey = req.header('x-quantlab-api-key');
  if (
    configuredApiKey &&
    configuredApiKey.length >= 16 &&
    headerApiKey &&
    timingSafeStringEquals(headerApiKey, configuredApiKey)
  ) {
    return {
      uid: 'service_api_key',
      email: 'automation@quantlab.local',
      emailVerified: true,
      isAdmin: true,
      authMethod: 'API_KEY',
    };
  }

  // Option B: Firebase ID Token in Authorization: Bearer <token>
  const authHeader = req.header('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    return await verifyFirebaseIdToken(token);
  }

  return null;
}

export function requireAuth(options?: { adminOnly?: boolean }) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const user = await resolveRequestAuth(req);
    if (!user) {
      return res.status(401).json({
        error: 'Autenticazione richiesta. Effettua l’accesso con Google per eseguire operazioni operative.',
        code: 'AUTH_REQUIRED',
      });
    }
    if (!user.emailVerified && user.authMethod === 'FIREBASE_ID_TOKEN') {
      return res.status(403).json({
        error: 'Account email non verificato. Verifica il tuo indirizzo email per procedere.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }
    if (options?.adminOnly && !user.isAdmin) {
      return res.status(403).json({
        error: 'Permessi amministratore richiesti per questa operazione.',
        code: 'ADMIN_REQUIRED',
      });
    }
    req.authUser = user;
    next();
  };
}

// ============================================================================
// 2. Sliding-Window Rate Limiter
// ============================================================================
export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const buckets = new Map<string, number[]>();
  const prefix = options.keyPrefix || 'global';

  return (req: Request, res: Response, next: NextFunction) => {
    const ip =
      (typeof req.ip === 'string' && req.ip) ||
      req.socket?.remoteAddress ||
      'unknown';
    const key = `${prefix}:${ip}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;

    const existing = buckets.get(key) || [];
    const recent = existing.filter((ts) => ts > cutoff);

    if (recent.length >= options.maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((recent[0] + options.windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: `Troppe richieste. Riprova tra ${retryAfterSec} secondi.`,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSec,
      });
    }

    recent.push(now);
    buckets.set(key, recent);

    if (buckets.size > 2000) {
      for (const [k, list] of buckets.entries()) {
        if (list.length === 0 || list[list.length - 1] <= cutoff) {
          buckets.delete(k);
        }
      }
    }

    next();
  };
}

// ============================================================================
// 3. Strict Input Validation Helpers
// ============================================================================
const ALLOWED_TIMEFRAMES = new Set<Timeframe>(['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1D']);
const TICKER_REGEX = /^[A-Z0-9][A-Z0-9.\-^=]{0,19}$/;
const SAFE_ID_REGEX = /^[a-zA-Z0-9_\-]{1,128}$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export function validateTicker(
  raw: unknown
): { ok: true; value: string; error?: string } | { ok: false; value?: string; error: string } {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Parametro ticker mancante o non valido.' };
  }
  const clean = raw.trim().toUpperCase();
  if (!TICKER_REGEX.test(clean)) {
    return { ok: false, error: `Ticker non valido: "${clean.slice(0, 24)}".` };
  }
  return { ok: true, value: clean };
}

export function validateTimeframe(
  raw: unknown
): { ok: true; value: Timeframe; error?: string } | { ok: false; value?: Timeframe; error: string } {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Timeframe mancante.' };
  }
  const clean = raw.trim() as Timeframe;
  if (!ALLOWED_TIMEFRAMES.has(clean)) {
    return {
      ok: false,
      error: `Timeframe non supportato: "${clean}". Valori ammessi: ${Array.from(ALLOWED_TIMEFRAMES).join(', ')}.`,
    };
  }
  return { ok: true, value: clean };
}

export function validateSafeId(
  raw: unknown,
  fieldName = 'id'
): { ok: true; value: string; error?: string } | { ok: false; value?: string; error: string } {
  if (typeof raw !== 'string' || !SAFE_ID_REGEX.test(raw.trim())) {
    return { ok: false, error: `Identificativo ${fieldName} non valido.` };
  }
  return { ok: true, value: raw.trim() };
}

export function validateDateParam(
  raw: unknown
): { ok: true; value?: string; error?: string } | { ok: false; value?: string; error: string } {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, value: undefined };
  }
  if (typeof raw !== 'string' || !ISO_DATE_REGEX.test(raw.trim())) {
    return { ok: false, error: 'Formato data non valido. Usa YYYY-MM-DD.' };
  }
  const ts = Date.parse(`${raw.trim()}T00:00:00Z`);
  if (Number.isNaN(ts)) {
    return { ok: false, error: 'Data non valida.' };
  }
  return { ok: true, value: raw.trim() };
}

export function validateFiniteNumber(
  raw: unknown,
  fieldName: string,
  min: number,
  max: number
): { ok: true; value: number; error?: string } | { ok: false; value?: number; error: string } {
  const num = Number(raw);
  if (!Number.isFinite(num) || num < min || num > max) {
    return {
      ok: false,
      error: `Valore ${fieldName} fuori intervallo (${min}..${max}).`,
    };
  }
  return { ok: true, value: num };
}

// ============================================================================
// 4. Atomic File Persistence (Prevents Half-Written / Corrupted State Files)
// ============================================================================
export function atomicWriteJsonFile(targetFilePath: string, data: unknown): void {
  const dir = path.dirname(targetFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpFile = `${targetFilePath}.tmp.${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
  const serialized = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmpFile, serialized, 'utf-8');
  fs.renameSync(tmpFile, targetFilePath);
}

export function readValidatedJsonFile<T>(
  targetFilePath: string,
  validator: (parsed: unknown) => parsed is T
): T | null {
  try {
    if (!fs.existsSync(targetFilePath)) return null;
    const raw = fs.readFileSync(targetFilePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!validator(parsed)) {
      console.warn(`[AtomicStore] Schema non valido per ${path.basename(targetFilePath)}: file ignorato.`);
      return null;
    }
    return parsed;
  } catch (err: any) {
    console.warn(`[AtomicStore] Errore lettura ${path.basename(targetFilePath)}:`, err?.message || err);
    return null;
  }
}
