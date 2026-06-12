/**
 * Scoring engine: run every rule against a claim, combine the hits into a single
 * 0–100 risk score, and rank claims.
 *
 * Scoring model (KISS, justified in README):
 *   raw   = Σ severity over fired flags        (severity == rule weight, 1–5)
 *   risk  = round( min(100, raw / NORMALIZE_CAP * 100) )
 * NORMALIZE_CAP = 14 = combined weight of the three heaviest rules, so a claim hit
 * by the three worst patterns saturates near 100, while a single weak rule stays low.
 */

import { NORMALIZE_CAP } from './config.js';
import type { Claim, Flag, ScoredClaim } from './models.js';
import type { RuleContext } from './context.js';
import { ALL_RULES } from './rules/index.js';

export function scoreClaim(claim: Claim, ctx: RuleContext): ScoredClaim {
  const flags: Flag[] = [];
  for (const rule of ALL_RULES) {
    const flag = rule(claim, ctx);
    if (flag) flags.push(flag);
  }
  const raw = flags.reduce((sum, f) => sum + f.severity, 0);
  const risk_score = Math.min(100, Math.round((raw / NORMALIZE_CAP) * 100));
  return { claim_id: claim.claim_id, risk_score, flags };
}

/** Score every claim and return them ranked by descending risk (ties by claim_id). */
export function scoreAll(claims: Claim[], ctx: RuleContext): ScoredClaim[] {
  const scored = claims.map((c) => scoreClaim(c, ctx));
  scored.sort((a, b) =>
    b.risk_score !== a.risk_score
      ? b.risk_score - a.risk_score
      : a.claim_id < b.claim_id
        ? -1
        : 1,
  );
  return scored;
}
