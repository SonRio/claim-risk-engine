/** Unbundling: a single claim itemizes every component of a known bundle, which
 *  should have been billed under the single bundle code (typically cheaper). */
import { RULE_WEIGHTS } from '../config.js';
import type { RuleFn } from './rule-fn.js';

export const unbundlingRule: RuleFn = (claim, ctx) => {
  const procs = new Set(claim.procedure_codes);
  for (const bundle of ctx.bundleLookup) {
    let hasAll = true;
    for (const comp of bundle.components) {
      if (!procs.has(comp)) {
        hasAll = false;
        break;
      }
    }
    if (hasAll) {
      return {
        rule: 'unbundling',
        severity: RULE_WEIGHTS.unbundling,
        evidence: `Procedures [${[...bundle.components].join(', ')}] should be billed as bundle ${bundle.bundleCode}`,
      };
    }
  }
  return null;
};
