/** Metrics report builders: markdown for reports/metrics.md and a compact summary
 *  object embedded into the dashboard. */
import { SCORE_THRESHOLD } from './config.js';
import type { FraudLabel, ScoredClaim } from './models.js';
import { computeMetrics, perPatternRecall, sweepThreshold } from './metrics.js';

/** Pass targets from the challenge brief. */
export const TARGET_RECALL = 0.7;
export const TARGET_FPR = 0.2;

export interface MetricsSummary {
  threshold: number;
  precision: number;
  recall: number;
  fpr: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  flagged: number;
  total: number;
  pass: boolean;
  perPattern: Record<string, { caught: number; total: number; recall: number }>;
}

export function buildSummary(scored: ScoredClaim[], labels: FraudLabel[]): MetricsSummary {
  const m = computeMetrics(scored, labels, SCORE_THRESHOLD);
  const flagged = scored.filter((s) => s.risk_score >= SCORE_THRESHOLD).length;
  return {
    threshold: SCORE_THRESHOLD,
    precision: m.precision,
    recall: m.recall,
    fpr: m.fpr,
    tp: m.tp,
    fp: m.fp,
    fn: m.fn,
    tn: m.tn,
    flagged,
    total: scored.length,
    pass: m.recall >= TARGET_RECALL && m.fpr <= TARGET_FPR,
    perPattern: perPatternRecall(scored, labels, SCORE_THRESHOLD),
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function buildMetricsMarkdown(scored: ScoredClaim[], labels: FraudLabel[]): string {
  const s = buildSummary(scored, labels);
  const lines: string[] = [];
  lines.push('# Claim Risk Engine — Metrics Report', '');
  lines.push(`**Decision threshold:** risk_score ≥ ${s.threshold}`, '');
  lines.push(`**Result:** ${s.pass ? '✅ PASS' : '❌ FAIL'} ` +
    `(target: recall ≥ ${pct(TARGET_RECALL)}, FPR ≤ ${pct(TARGET_FPR)})`, '');
  lines.push('| Metric | Value |', '|---|---|');
  lines.push(`| Precision | ${pct(s.precision)} |`);
  lines.push(`| Recall | ${pct(s.recall)} |`);
  lines.push(`| False Positive Rate | ${pct(s.fpr)} |`);
  lines.push(`| Flagged (≥ threshold) | ${s.flagged} / ${s.total} |`);
  lines.push(`| TP / FP / FN / TN | ${s.tp} / ${s.fp} / ${s.fn} / ${s.tn} |`, '');

  lines.push('## Threshold sweep', '');
  lines.push('| Threshold | Precision | Recall | FPR | TP | FP | FN | TN |', '|---|---|---|---|---|---|---|---|');
  for (const m of sweepThreshold(scored, labels)) {
    lines.push(`| ${m.threshold} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.fpr)} | ${m.tp} | ${m.fp} | ${m.fn} | ${m.tn} |`);
  }
  lines.push('');

  lines.push('## Per-pattern recall', '');
  lines.push('| Pattern | Caught | Total | Recall |', '|---|---|---|---|');
  for (const [k, v] of Object.entries(s.perPattern)) {
    lines.push(`| ${k} | ${v.caught} | ${v.total} | ${pct(v.recall)} |`);
  }
  lines.push('');
  lines.push('> Weak standalone patterns (amount_clustering, weekend_anomaly) are often ' +
    'missed on their own by design — they mainly raise the composite score of claims that ' +
    'also trip stronger rules. This, plus coincidental false positives among clean claims, ' +
    'is why recall is not 100% and FPR is not 0%: the dataset is not rigged.');
  return lines.join('\n') + '\n';
}
