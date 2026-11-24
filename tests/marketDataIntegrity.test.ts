import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateHourlyBars,
  convertToEurStrict,
  validateAndCleanBars,
} from '../src/services/marketDataIntegrity';
import type { Bar } from '../src/types';

function makeBar(iso: string, o: number, h: number, l: number, c: number, v = 1000): Bar {
  const ts = Date.parse(iso);
  return {
    timestamp: ts,
    dateStr: iso.replace('T', ' ').slice(0, 16),
    open: o,
    high: h,
    low: l,
    close: c,
    volume: v,
  };
}

test('validateAndCleanBars removes invalid OHLC, deduplicates timestamps, sorts chronologically, and excludes incomplete bar', () => {
  const nowMs = Date.parse('2025-05-01T15:20:00Z');
  const raw: Bar[] = [
    makeBar('2025-05-01T14:00:00Z', 102, 105, 101, 104, 500),
    makeBar('2025-05-01T13:00:00Z', 100, 103, 99, 102, 400), // out of order
    makeBar('2025-05-01T13:00:00Z', 100, 103, 99, 102.5, 450), // duplicate timestamp
    makeBar('2025-05-01T12:00:00Z', 100, 95, 105, 100, 100), // invalid high < low
    makeBar('2025-05-01T15:00:00Z', 104, 106, 103, 105, 300), // still forming at 15:20
  ];

  const { bars, quality } = validateAndCleanBars(raw, '1h', {
    excludeIncompleteLastBar: true,
    nowMs,
  });

  assert.equal(quality.invalidBarsRemoved, 1);
  assert.equal(quality.duplicatesRemoved, 1);
  assert.equal(quality.outOfOrderFixed, true);
  assert.equal(quality.incompleteBarExcluded, true);
  assert.equal(bars.length, 2);
  assert.ok(bars[0].timestamp < bars[1].timestamp);
  assert.equal(bars[0].close, 102.5); // latest duplicate retained
});

test('aggregateHourlyBars properly builds 2h and 4h bars without crossing session-day boundaries', () => {
  const hourly: Bar[] = [
    // Day 1: 5 hourly bars (09:00..13:00 UTC)
    makeBar('2025-05-05T09:00:00Z', 100, 104, 99, 102, 100),
    makeBar('2025-05-05T10:00:00Z', 102, 107, 101, 105, 200),
    makeBar('2025-05-05T11:00:00Z', 105, 108, 103, 106, 300),
    makeBar('2025-05-05T12:00:00Z', 106, 109, 104, 108, 400),
    makeBar('2025-05-05T13:00:00Z', 108, 110, 107, 109, 500),
    // Day 2: 2 hourly bars (09:00..10:00 UTC) — overnight boundary!
    makeBar('2025-05-06T09:00:00Z', 112, 115, 111, 114, 600),
    makeBar('2025-05-06T10:00:00Z', 114, 116, 113, 115, 700),
  ];

  const { bars: bars2h } = aggregateHourlyBars(hourly, '2h', { exchangeTimezone: 'UTC' });
  // Day 1: [09+10], [11+12], [13] => 3 bars; Day 2: [09+10] => 1 bar => total 4 bars (NOT 7!)
  assert.equal(bars2h.length, 4);
  assert.equal(bars2h[0].open, 100);
  assert.equal(bars2h[0].high, 107);
  assert.equal(bars2h[0].low, 99);
  assert.equal(bars2h[0].close, 105);
  assert.equal(bars2h[0].volume, 300);
  // Ensure Day 1 last bar (13:00) was NOT merged with Day 2 first bar (09:00)
  assert.equal(bars2h[2].open, 108);
  assert.equal(bars2h[2].close, 109);
  assert.equal(bars2h[3].open, 112);
  assert.equal(bars2h[3].close, 115);

  const { bars: bars4h } = aggregateHourlyBars(hourly, '4h', { exchangeTimezone: 'UTC' });
  // Day 1: [09,10,11,12], [13] => 2 bars; Day 2: [09,10] => 1 bar => total 3 bars
  assert.equal(bars4h.length, 3);
  assert.equal(bars4h[0].open, 100);
  assert.equal(bars4h[0].high, 109);
  assert.equal(bars4h[0].low, 99);
  assert.equal(bars4h[0].close, 108);
  assert.equal(bars4h[0].volume, 1000);
});

test('convertToEurStrict rejects USD conversion when live FX rate is unavailable (zero hardcoded fallback)', () => {
  const eurResult = convertToEurStrict(250, 'EUR', null);
  assert.equal(eurResult.ok, true);
  assert.equal(eurResult.amountEur, 250);

  const usdMissingFx = convertToEurStrict(250, 'USD', null);
  assert.equal(usdMissingFx.ok, false);
  assert.equal(usdMissingFx.amountEur, null);

  const usdValidFx = convertToEurStrict(110, 'USD', 1 / 1.1);
  assert.equal(usdValidFx.ok, true);
  assert.ok(Math.abs((usdValidFx.amountEur ?? 0) - 100) < 1e-4);
});
