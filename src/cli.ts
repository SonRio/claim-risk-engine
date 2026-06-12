/**
 * Pipeline CLI: `generate` → `score` → `metrics` → `dashboard`.
 * Run individually or chained via `npm run all`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildContext } from './context.js';
import { fromCsv, labelsFromCsv, labelsToCsv, toCsv } from './csv.js';
import { scoreAll } from './engine.js';
import { generateDataset, summarize } from './generate-dataset.js';
import type { ScoredClaim } from './models.js';
import { PATHS } from './paths.js';
import { buildMetricsMarkdown, buildSummary } from './report.js';
import { buildDashboard } from '../scripts/build-dashboard.js';

function cmdGenerate(): void {
  const { claims, labels } = generateDataset();
  writeFileSync(PATHS.claims, toCsv(claims));
  writeFileSync(PATHS.groundTruth, labelsToCsv(labels));
  const counts = summarize(labels);
  console.log(`Generated ${counts.total} claims → ${PATHS.claims}`);
  console.log(`Ground truth → ${PATHS.groundTruth}`);
  console.log('Pattern counts:', JSON.stringify(counts));
}

function cmdScore(): void {
  const claims = fromCsv(readFileSync(PATHS.claims, 'utf8'));
  const t0 = Date.now();
  const ctx = buildContext(claims);
  const scored = scoreAll(claims, ctx);
  const ms = Date.now() - t0;
  writeFileSync(PATHS.scoredOutput, JSON.stringify(scored, null, 2));
  console.log(`Scored ${claims.length} claims in ${ms}ms → ${PATHS.scoredOutput}`);
  console.log('\nTop 10 by risk:');
  for (const s of scored.slice(0, 10)) {
    const rules = s.flags.map((f) => f.rule).join(', ') || '—';
    console.log(`  ${s.claim_id}  risk=${String(s.risk_score).padStart(3)}  [${rules}]`);
  }
}

function cmdMetrics(): void {
  const scored = JSON.parse(readFileSync(PATHS.scoredOutput, 'utf8')) as ScoredClaim[];
  const labels = labelsFromCsv(readFileSync(PATHS.groundTruth, 'utf8'));
  writeFileSync(PATHS.metricsReport, buildMetricsMarkdown(scored, labels));
  const s = buildSummary(scored, labels);
  console.log(`Metrics report → ${PATHS.metricsReport}`);
  console.log(`Threshold ${s.threshold}: precision=${(s.precision * 100).toFixed(1)}% ` +
    `recall=${(s.recall * 100).toFixed(1)}% FPR=${(s.fpr * 100).toFixed(1)}% ` +
    `(flagged ${s.flagged}/${s.total})`);
  console.log(s.pass ? '✅ PASS target (recall ≥ 70%, FPR ≤ 20%)' : '❌ FAIL target');
}

function cmdDashboard(): void {
  const out = buildDashboard();
  console.log(`Dashboard → ${out}`);
}

function main(): void {
  const cmd = process.argv[2];
  switch (cmd) {
    case 'generate':
      return cmdGenerate();
    case 'score':
      return cmdScore();
    case 'metrics':
      return cmdMetrics();
    case 'dashboard':
      return cmdDashboard();
    default:
      console.log('Usage: tsx src/cli.ts <generate|score|metrics|dashboard>');
      process.exit(cmd ? 1 : 0);
  }
}

main();
