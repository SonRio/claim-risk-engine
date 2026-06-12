import { describe, expect, it } from 'vitest';
import { buildContext } from '../src/context.js';
import { scoreClaim, scoreAll } from '../src/engine.js';
import { computeMetrics } from '../src/metrics.js';
import { makeClaim, makeProcClaims } from './helpers.js';
import type { FraudLabel, ScoredClaim } from '../src/models.js';

describe('engine scoring', () => {
  it('scores a clean claim 0', () => {
    const clean = makeClaim({ procedure_codes: ['P-1001'], submitted_amount: 900, diagnosis_code: 'E11.9' });
    const ctx = buildContext([clean, ...makeProcClaims('P-1001', 900, 30)]);
    expect(scoreClaim(clean, ctx).risk_score).toBe(0);
  });

  it('accumulates multiple patterns and clamps at 100', () => {
    // duplicate(4) + dx_mismatch(4) + upcoding(5) + clustering(2) = raw 15 → clamps to 100
    const twinA = makeClaim({ claim_id: 'CLM-90001', diagnosis_code: 'E11.9', procedure_codes: ['P-4001'], submitted_amount: 48000 });
    const twinB = makeClaim({ claim_id: 'CLM-90002', diagnosis_code: 'E11.9', procedure_codes: ['P-4001'], submitted_amount: 48000 });
    const ctx = buildContext([twinA, twinB, ...makeProcClaims('P-4001', 28000, 30)]);
    const scored = scoreClaim(twinB, ctx);
    expect(scored.risk_score).toBe(100);
    expect(scored.flags.map((f) => f.rule).sort()).toEqual(
      ['amount_clustering', 'duplicate', 'dx_proc_mismatch', 'upcoding'],
    );
  });

  it('ranks claims by descending risk', () => {
    const ctx = buildContext([makeClaim()]);
    const ranked = scoreAll(
      [makeClaim({ submitted_amount: 48000 }), makeClaim({ submitted_amount: 900 })],
      ctx,
    );
    expect(ranked[0].risk_score).toBeGreaterThanOrEqual(ranked[1].risk_score);
  });
});

describe('metrics', () => {
  it('computes TP/FP/FN/TN, precision, recall, fpr from a fixture', () => {
    const scored: ScoredClaim[] = [
      { claim_id: 'A', risk_score: 90, flags: [] },
      { claim_id: 'B', risk_score: 10, flags: [] },
      { claim_id: 'C', risk_score: 50, flags: [] },
      { claim_id: 'D', risk_score: 0, flags: [] },
    ];
    const labels: FraudLabel[] = [
      { claim_id: 'A', is_fraud: true, pattern: 'upcoding' },
      { claim_id: 'B', is_fraud: true, pattern: 'duplicate' },
      { claim_id: 'C', is_fraud: false, pattern: null },
      { claim_id: 'D', is_fraud: false, pattern: null },
    ];
    const m = computeMetrics(scored, labels, 25);
    expect([m.tp, m.fp, m.fn, m.tn]).toEqual([1, 1, 1, 1]);
    expect(m.precision).toBeCloseTo(0.5, 5);
    expect(m.recall).toBeCloseTo(0.5, 5);
    expect(m.fpr).toBeCloseTo(0.5, 5);
  });
});
