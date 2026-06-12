/**
 * Build a fully self-contained dashboard.html: join scored output with claim details,
 * compute the metrics summary, and inline everything into the template's __DATA__ slot.
 * No server, no CDN, no fetch — opens directly via file://.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fromCsv, labelsFromCsv } from '../src/csv.js';
import type { Claim, ScoredClaim } from '../src/models.js';
import { PATHS } from '../src/paths.js';
import { buildSummary } from '../src/report.js';

interface DashboardRow {
  id: string;
  score: number;
  member: string;
  provider: string;
  date: string;
  type: string;
  dx: string;
  amount: number;
  topRule: string | null;
  flags: { rule: string; severity: number; evidence: string }[];
}

/** Escape `<` so the embedded JSON can never break out of the <script> tag. */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function buildDashboard(): string {
  const scored = JSON.parse(readFileSync(PATHS.scoredOutput, 'utf8')) as ScoredClaim[];
  const claims = fromCsv(readFileSync(PATHS.claims, 'utf8'));
  const labels = labelsFromCsv(readFileSync(PATHS.groundTruth, 'utf8'));
  const summary = buildSummary(scored, labels);

  const claimById = new Map<string, Claim>(claims.map((c) => [c.claim_id, c]));
  const rows: DashboardRow[] = scored.map((s) => {
    const c = claimById.get(s.claim_id)!;
    return {
      id: s.claim_id,
      score: s.risk_score,
      member: c.member_id,
      provider: c.provider_id,
      date: c.claim_date,
      type: c.claim_type,
      dx: c.diagnosis_code,
      amount: c.submitted_amount,
      topRule: s.flags[0]?.rule ?? null,
      flags: s.flags,
    };
  });

  const data = { summary, rows };
  const template = readFileSync(PATHS.dashboardTemplate, 'utf8');
  const html = template.replace('__DATA__', safeJson(data));
  writeFileSync(PATHS.dashboardOut, html);
  return PATHS.dashboardOut;
}
