/** Weekend anomaly: a surgical procedure billed on a weekend by a provider whose
 *  historical weekend volume is negligible (< WEEKEND_HIST_MAX) — out-of-pattern
 *  activity for a normally weekday-only provider. */
import { RULE_WEIGHTS, SURGICAL_PROCS, WEEKEND_HIST_MAX } from '../config.js';
import type { RuleFn } from './rule-fn.js';

export const weekendAnomalyRule: RuleFn = (claim, ctx) => {
  if (!claim.is_weekend) return null;

  const surgical = claim.procedure_codes.find((p) => SURGICAL_PROCS.has(p));
  if (!surgical) return null;

  const ratio = ctx.providerWeekendRatio.get(claim.provider_id) ?? 0;
  if (ratio >= WEEKEND_HIST_MAX) return null;

  return {
    rule: 'weekend_anomaly',
    severity: RULE_WEIGHTS.weekend_anomaly,
    evidence: `Surgical ${surgical} on weekend ${claim.claim_date}; provider ${claim.provider_id} weekend volume ${(ratio * 100).toFixed(1)}% (< ${WEEKEND_HIST_MAX * 100}%)`,
  };
};
