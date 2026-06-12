/** Rapid resubmission: the same member + diagnosis billed again within RAPID_DAYS.
 *  Flags the later claim, referencing the closest prior/adjacent claim (Δ ≥ 1 day,
 *  so exact same-day duplicates are left to the duplicate rule). */
import { RAPID_DAYS, RULE_WEIGHTS } from '../config.js';
import { memberDxKey } from '../context.js';
import { dayDiff, type RuleFn } from './rule-fn.js';

export const rapidResubmissionRule: RuleFn = (claim, ctx) => {
  const timeline = ctx.memberDxTimeline.get(memberDxKey(claim));
  if (!timeline || timeline.length < 2) return null;

  // Only the LATER claim is the "resubmission": require an earlier claim (positive
  // day delta) within the window. The original (earliest) claim is not flagged.
  let best: { otherId: string; delta: number } | null = null;
  for (const entry of timeline) {
    if (entry.claim_id === claim.claim_id) continue;
    const delta = dayDiff(entry.date, claim.claim_date); // >0 ⇒ entry is earlier
    if (delta >= 1 && delta <= RAPID_DAYS) {
      if (!best || delta < best.delta) best = { otherId: entry.claim_id, delta };
    }
  }
  if (!best) return null;

  return {
    rule: 'rapid_resubmission',
    severity: RULE_WEIGHTS.rapid_resubmission,
    evidence: `Same diagnosis ${claim.diagnosis_code} resubmitted ${best.delta} day(s) from claim ${best.otherId} (member ${claim.member_id})`,
  };
};
