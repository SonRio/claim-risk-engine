/** Duplicate billing: same member + provider + date + diagnosis as another claim.
 *  Only the non-earliest claim(s) in a group are flagged (the first is legitimate). */
import { RULE_WEIGHTS } from '../config.js';
import { dupKey } from '../context.js';
import type { RuleFn } from './rule-fn.js';

export const duplicateRule: RuleFn = (claim, ctx) => {
  const group = ctx.duplicateKeys.get(dupKey(claim));
  if (!group || group.length < 2) return null;

  const sorted = [...group].sort();
  if (sorted[0] === claim.claim_id) return null; // earliest = original, not a duplicate

  const others = sorted.filter((id) => id !== claim.claim_id);
  return {
    rule: 'duplicate',
    severity: RULE_WEIGHTS.duplicate,
    evidence: `Duplicate of ${others.length} other claim(s) with same member ${claim.member_id}, provider ${claim.provider_id}, date ${claim.claim_date}, diagnosis ${claim.diagnosis_code} (e.g. ${others[0]})`,
  };
};
