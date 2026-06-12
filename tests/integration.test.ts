import { describe, expect, it } from 'vitest';
import { generateDataset, summarize } from '../src/generate-dataset.js';
import { buildContext } from '../src/context.js';
import { scoreAll } from '../src/engine.js';
import { computeMetrics } from '../src/metrics.js';
import { SCORE_THRESHOLD } from '../src/config.js';
import { TARGET_FPR, TARGET_RECALL } from '../src/report.js';

describe('full pipeline', () => {
  it('generates exactly 2000 deterministic claims', () => {
    const a = generateDataset();
    const b = generateDataset();
    expect(a.claims.length).toBe(2000);
    expect(JSON.stringify(a.claims)).toEqual(JSON.stringify(b.claims));
    expect(JSON.stringify(a.labels)).toEqual(JSON.stringify(b.labels));
  });

  it('embeds fraud across all 8 patterns', () => {
    const { labels } = generateDataset();
    const counts = summarize(labels);
    for (const pattern of [
      'duplicate', 'rapid_resubmission', 'upcoding', 'unbundling',
      'phantom_billing', 'weekend_anomaly', 'dx_proc_mismatch', 'amount_clustering',
    ]) {
      expect(counts[pattern]).toBeGreaterThan(0);
    }
  });

  it('meets the recall/FPR target against ground truth (regression lock)', () => {
    const { claims, labels } = generateDataset();
    const ctx = buildContext(claims);
    const scored = scoreAll(claims, ctx);
    const m = computeMetrics(scored, labels, SCORE_THRESHOLD);
    expect(m.recall).toBeGreaterThanOrEqual(TARGET_RECALL);
    expect(m.fpr).toBeLessThanOrEqual(TARGET_FPR);
  });

  it('scores 2000 claims well under the 30s budget', () => {
    const { claims } = generateDataset();
    const start = Date.now();
    scoreAll(claims, buildContext(claims));
    expect(Date.now() - start).toBeLessThan(30000);
  });
});
