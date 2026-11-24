import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  atomicWriteJsonFile,
  createRateLimiter,
  readValidatedJsonFile,
  requireAuth,
  validateDateParam,
  validateFiniteNumber,
  validateSafeId,
  validateTicker,
  validateTimeframe,
} from '../src/services/apiSecurity';

function createMockRes() {
  let statusCode = 200;
  let body: any = null;
  const headers: Record<string, string> = {};
  const res: any = {
    setHeader(k: string, v: string) {
      headers[k] = v;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: any) {
      body = payload;
      return res;
    },
    getState: () => ({ statusCode, body, headers }),
  };
  return res;
}

test('requireAuth rejects unauthenticated requests and malformed Bearer tokens with HTTP 401', async () => {
  const middleware = requireAuth();

  // 1. Missing Authorization header
  const reqNoAuth: any = { header: () => undefined };
  const resNoAuth = createMockRes();
  let nextCalled = false;
  await middleware(reqNoAuth, resNoAuth, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(resNoAuth.getState().statusCode, 401);
  assert.equal(resNoAuth.getState().body?.code, 'AUTH_REQUIRED');

  // 2. Short/invalid Bearer token
  const reqBadToken: any = {
    header: (name: string) => (name.toLowerCase() === 'authorization' ? 'Bearer short' : undefined),
  };
  const resBadToken = createMockRes();
  await middleware(reqBadToken, resBadToken, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(resBadToken.getState().statusCode, 401);
});

test('createRateLimiter enforces sliding-window limits and emits HTTP 429 with Retry-After', () => {
  const limiter = createRateLimiter({ windowMs: 10_000, maxRequests: 2, keyPrefix: 'test' });
  const req: any = { ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } };

  let passed = 0;
  for (let i = 0; i < 2; i++) {
    const res = createMockRes();
    limiter(req, res, () => {
      passed++;
    });
    assert.equal(res.getState().statusCode, 200);
  }
  assert.equal(passed, 2);

  // 3rd request must be blocked with 429
  const resBlocked = createMockRes();
  let thirdPassed = false;
  limiter(req, resBlocked, () => {
    thirdPassed = true;
  });
  assert.equal(thirdPassed, false);
  assert.equal(resBlocked.getState().statusCode, 429);
  assert.equal(resBlocked.getState().body?.code, 'RATE_LIMIT_EXCEEDED');
  assert.ok(Number(resBlocked.getState().headers['Retry-After']) >= 1);
});

test('Input validators reject path traversal, injection strings, invalid timeframes, and out-of-range numbers', () => {
  assert.equal(validateTicker('NVDA').ok, true);
  assert.equal(validateTicker('UCG.MI').ok, true);
  assert.equal(validateTicker('../etc/passwd').ok, false);
  assert.equal(validateTicker('NVDA; DROP TABLE').ok, false);

  assert.equal(validateTimeframe('2h').ok, true);
  assert.equal(validateTimeframe('4h').ok, true);
  assert.equal(validateTimeframe('99h').ok, false);

  assert.equal(validateSafeId('session_12345_abc').ok, true);
  assert.equal(validateSafeId('../../secrets').ok, false);

  assert.equal(validateDateParam('2025-01-15').ok, true);
  assert.equal(validateDateParam('2025/01/15').ok, false);

  assert.equal(validateFiniteNumber(10000, 'capital', 100, 1000000).ok, true);
  assert.equal(validateFiniteNumber(-50, 'capital', 100, 1000000).ok, false);
  assert.equal(validateFiniteNumber(Number.NaN, 'capital', 100, 1000000).ok, false);
});

test('Atomic JSON persistence writes cleanly and validates schema on read', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quantlab-atomic-'));
  const target = path.join(tmpDir, 'state.json');

  atomicWriteJsonFile(target, { version: 1, items: ['NVDA', 'UCG.MI'] });
  const loaded = readValidatedJsonFile<{ version: number; items: string[] }>(
    target,
    (v): v is { version: number; items: string[] } =>
      typeof v === 'object' && v !== null && Array.isArray((v as any).items)
  );
  assert.deepEqual(loaded, { version: 1, items: ['NVDA', 'UCG.MI'] });

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('firestore.rules enforces zero public read/write wildcards, verified auth, ownership, and default deny', () => {
  const rulesPath = path.join(process.cwd(), 'firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf-8');

  // Must NEVER contain open public rules
  assert.equal(/allow\s+read,\s*write:\s*if\s+true/i.test(rules), false);
  assert.equal(/allow\s+write:\s*if\s+true/i.test(rules), false);
  assert.equal(/allow\s+read:\s*if\s+true/i.test(rules), false);

  // Must require verified authentication and bootstrap admin check
  assert.ok(rules.includes('email_verified == true'));
  assert.ok(rules.includes('stallaandrea@gmail.com'));
  assert.ok(rules.includes('allow read, write: if false;'));
  assert.ok(rules.includes('ownerUid'));
});
