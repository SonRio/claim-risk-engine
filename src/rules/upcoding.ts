/** Upcoding: submitted amount far above the population mean for the procedure.
 *  Flags the single procedure with the largest positive z-score above UPCODE_SIGMA.
 *  Procedures with too few samples (n < UPCODE_MIN_N) or zero variance are skipped. */
import { RULE_WEIGHTS, UPCODE_MIN_N, UPCODE_SIGMA } from '../config.js';
import type { RuleFn } from './rule-fn.js';

export const upcodingRule: RuleFn = (claim, ctx) => {
  // Only single-procedure claims are judged: a multi-procedure (bundled) claim's lump
  // amount is not attributable to one procedure, so comparing it to a single-proc mean
  // would be meaningless. This matches how procStats is built (single-proc claims only).
  if (claim.procedure_codes.length !== 1) return null;

  const proc = claim.procedure_codes[0];
  const stat = ctx.procStats.get(proc);
  if (!stat || stat.n < UPCODE_MIN_N || stat.std <= 0) return null;

  const z = (claim.submitted_amount - stat.mean) / stat.std;
  if (z <= UPCODE_SIGMA) return null;

  return {
    rule: 'upcoding',
    severity: RULE_WEIGHTS.upcoding,
    evidence: `Submitted amount ${claim.submitted_amount} for ${proc} is ${z.toFixed(1)} std above mean of ${Math.round(stat.mean)}`,
  };
};
