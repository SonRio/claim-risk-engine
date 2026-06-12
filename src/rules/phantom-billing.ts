/** Phantom billing: a provider submitting an implausible number of claims in one
 *  calendar day (more than PHANTOM_DAILY). Every claim on that provider-day fires. */
import { PHANTOM_DAILY, RULE_WEIGHTS } from '../config.js';
import { providerDayKey } from '../context.js';
import type { RuleFn } from './rule-fn.js';

export const phantomBillingRule: RuleFn = (claim, ctx) => {
  const count = ctx.providerDayCounts.get(providerDayKey(claim)) ?? 0;
  if (count <= PHANTOM_DAILY) return null;

  return {
    rule: 'phantom_billing',
    severity: RULE_WEIGHTS.phantom_billing,
    evidence: `Provider ${claim.provider_id} submitted ${count} claims on ${claim.claim_date} (threshold ${PHANTOM_DAILY})`,
  };
};
