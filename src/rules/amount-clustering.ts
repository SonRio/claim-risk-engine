/** Amount clustering: a submitted amount parked just below the auto-approval ceiling
 *  (CLUSTER_LOW ≤ amount < AUTO_APPROVAL) — a common tactic to dodge manual review. */
import { AUTO_APPROVAL, CLUSTER_LOW, RULE_WEIGHTS } from '../config.js';
import type { RuleFn } from './rule-fn.js';

export const amountClusteringRule: RuleFn = (claim) => {
  const amt = claim.submitted_amount;
  if (amt < CLUSTER_LOW || amt >= AUTO_APPROVAL) return null;

  const pct = ((amt / AUTO_APPROVAL) * 100).toFixed(1);
  return {
    rule: 'amount_clustering',
    severity: RULE_WEIGHTS.amount_clustering,
    evidence: `Amount ${amt} is ${pct}% of the ${AUTO_APPROVAL} auto-approval threshold (just below)`,
  };
};
