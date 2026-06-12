import { describe, expect, it } from 'vitest';
import { mulberry32, randInt, gaussian } from '../src/prng.js';
import { toCsv, fromCsv, labelsToCsv, labelsFromCsv } from '../src/csv.js';
import { buildContext } from '../src/context.js';
import { makeClaim, makeProcClaims } from './helpers.js';
import type { FraudLabel } from '../src/models.js';

describe('prng', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds diverge', () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toEqual(b);
  });

  it('randInt stays within bounds and gaussian centers near mean', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const v = randInt(rng, 3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
    const samples = Array.from({ length: 2000 }, () => gaussian(rng, 100, 5));
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    expect(Math.abs(mean - 100)).toBeLessThan(1);
  });
});

describe('csv round-trip', () => {
  it('preserves procedure_codes array and types', () => {
    const claims = [
      makeClaim({ claim_id: 'CLM-00001', procedure_codes: ['P-1001', 'P-2002'], submitted_amount: 1234, is_weekend: true }),
      makeClaim({ claim_id: 'CLM-00002', provider_name: 'Has, comma "and quote"' }),
    ];
    const back = fromCsv(toCsv(claims));
    expect(back).toEqual(claims);
  });

  it('round-trips ground-truth labels including null pattern', () => {
    const labels: FraudLabel[] = [
      { claim_id: 'CLM-00001', is_fraud: false, pattern: null },
      { claim_id: 'CLM-00002', is_fraud: true, pattern: 'upcoding' },
    ];
    expect(labelsFromCsv(labelsToCsv(labels))).toEqual(labels);
  });
});

describe('context aggregates', () => {
  it('computes procStats mean/std and ignores multi-procedure claims', () => {
    const claims = [
      ...makeProcClaims('P-1001', 1000, 4),
      ...makeProcClaims('P-1001', 1100, 4), // mean 1050, std 50 over 8 single-proc claims
      makeClaim({ procedure_codes: ['P-1001', 'P-2002'], submitted_amount: 99999 }), // multi-proc: excluded
    ];
    const ctx = buildContext(claims);
    const stat = ctx.procStats.get('P-1001')!;
    expect(stat.n).toBe(8);
    expect(stat.mean).toBeCloseTo(1050, 5);
    expect(stat.std).toBeCloseTo(50, 5);
  });

  it('computes provider weekend ratio', () => {
    const claims = [
      makeClaim({ provider_id: 'PRV-09', is_weekend: true }),
      makeClaim({ provider_id: 'PRV-09', is_weekend: false }),
      makeClaim({ provider_id: 'PRV-09', is_weekend: false }),
      makeClaim({ provider_id: 'PRV-09', is_weekend: false }),
    ];
    const ctx = buildContext(claims);
    expect(ctx.providerWeekendRatio.get('PRV-09')).toBeCloseTo(0.25, 5);
  });
});
