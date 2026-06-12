/** Diagnosis/procedure mismatch: a procedure not clinically associated with the
 *  claim's diagnosis. Only evaluated for diagnoses present in the reference map
 *  (unknown diagnoses are skipped to avoid broad false positives). */
import { RULE_WEIGHTS } from '../config.js';
import type { RuleFn } from './rule-fn.js';

export const dxProcMismatchRule: RuleFn = (claim, ctx) => {
  const allowed = ctx.validDxProc.get(claim.diagnosis_code);
  if (!allowed) return null; // diagnosis not in reference set → cannot judge

  const offending = claim.procedure_codes.find((p) => !allowed.has(p));
  if (!offending) return null;

  return {
    rule: 'dx_proc_mismatch',
    severity: RULE_WEIGHTS.dx_proc_mismatch,
    evidence: `Procedure ${offending} not clinically associated with diagnosis ${claim.diagnosis_code}`,
  };
};
