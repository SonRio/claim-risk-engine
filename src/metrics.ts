/**
 * Evaluation metrics: compare scored claims against ground-truth labels.
 * A claim is "predicted fraud" when risk_score >= threshold.
 */

import type { FraudLabel, RuleName, ScoredClaim } from './models.js';

export interface Metrics {
  threshold: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  fpr: number; // false positive rate = FP / (FP + TN)
}

function ratio(num: number, den: number): number {
  return den === 0 ? 0 : num / den;
}

export function computeMetrics(
  scored: ScoredClaim[],
  labels: FraudLabel[],
  threshold: number,
): Metrics {
  const labelById = new Map(labels.map((l) => [l.claim_id, l]));
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  for (const s of scored) {
    const isFraud = labelById.get(s.claim_id)?.is_fraud ?? false;
    const predicted = s.risk_score >= threshold;
    if (predicted && isFraud) tp++;
    else if (predicted && !isFraud) fp++;
    else if (!predicted && isFraud) fn++;
    else tn++;
  }

  return {
    threshold,
    tp,
    fp,
    fn,
    tn,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    fpr: ratio(fp, fp + tn),
  };
}

/** Sweep a list of thresholds for tuning / reporting. */
export function sweepThreshold(
  scored: ScoredClaim[],
  labels: FraudLabel[],
  thresholds: number[] = [5, 10, 15, 20, 21, 25, 29, 30, 35, 40, 50],
): Metrics[] {
  return thresholds.map((t) => computeMetrics(scored, labels, t));
}

/** Per-pattern recall: of the frauds labeled with each pattern, how many are
 *  predicted fraud at the given threshold (caught via any rule). */
export function perPatternRecall(
  scored: ScoredClaim[],
  labels: FraudLabel[],
  threshold: number,
): Record<string, { caught: number; total: number; recall: number }> {
  const scoreById = new Map(scored.map((s) => [s.claim_id, s.risk_score]));
  const out: Record<string, { caught: number; total: number; recall: number }> = {};

  for (const l of labels) {
    if (!l.is_fraud || !l.pattern) continue;
    const key: RuleName = l.pattern;
    const entry = out[key] ?? { caught: 0, total: 0, recall: 0 };
    entry.total++;
    if ((scoreById.get(l.claim_id) ?? 0) >= threshold) entry.caught++;
    out[key] = entry;
  }
  for (const k of Object.keys(out)) {
    out[k].recall = ratio(out[k].caught, out[k].total);
  }
  return out;
}
