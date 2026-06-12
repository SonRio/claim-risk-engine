/** Shared signature for every detection rule: pure, no I/O, no mutation. */
import type { Claim, Flag } from '../models.js';
import type { RuleContext } from '../context.js';

export type RuleFn = (claim: Claim, ctx: RuleContext) => Flag | null;

/** Whole-day difference between two ISO dates (b - a), positive if b is later. */
export function dayDiff(aIso: string, bIso: string): number {
  const a = Date.UTC(+aIso.slice(0, 4), +aIso.slice(5, 7) - 1, +aIso.slice(8, 10));
  const b = Date.UTC(+bIso.slice(0, 4), +bIso.slice(5, 7) - 1, +bIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}
