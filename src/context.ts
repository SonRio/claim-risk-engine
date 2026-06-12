/**
 * One-pass precompute of every population-level aggregate the rules need, so each
 * rule evaluates in O(1) and scoring 2000 claims stays well under the time budget.
 *
 * Built once from the full Claim[]; rules read it but never mutate it.
 */

import { BUNDLE_MAP, VALID_DX_PROC } from './config.js';
import type { Claim } from './models.js';

export interface ProcStats {
  mean: number;
  std: number; // population std
  n: number;
}

export interface RuleContext {
  procStats: Map<string, ProcStats>; // procedure_code → amount mean/std/n
  providerDayCounts: Map<string, number>; // `${provider}|${date}` → #claims
  providerWeekendRatio: Map<string, number>; // provider → weekendClaims / totalClaims
  duplicateKeys: Map<string, string[]>; // `${member}|${provider}|${date}|${dx}` → claim_ids
  memberDxTimeline: Map<string, { date: string; claim_id: string }[]>; // `${member}|${dx}` → sorted by date
  bundleLookup: { bundleCode: string; components: Set<string> }[];
  validDxProc: Map<string, Set<string>>; // dx → allowed procs
}

export function dupKey(c: Pick<Claim, 'member_id' | 'provider_id' | 'claim_date' | 'diagnosis_code'>): string {
  return `${c.member_id}|${c.provider_id}|${c.claim_date}|${c.diagnosis_code}`;
}

export function memberDxKey(c: Pick<Claim, 'member_id' | 'diagnosis_code'>): string {
  return `${c.member_id}|${c.diagnosis_code}`;
}

export function providerDayKey(c: Pick<Claim, 'provider_id' | 'claim_date'>): string {
  return `${c.provider_id}|${c.claim_date}`;
}

/** Build all aggregates in a single pass over the claims. */
export function buildContext(claims: Claim[]): RuleContext {
  // procStats: gather amounts per procedure code (each proc in a claim gets the claim amount).
  const amountsByProc = new Map<string, number[]>();
  const providerDayCounts = new Map<string, number>();
  const providerTotals = new Map<string, number>();
  const providerWeekend = new Map<string, number>();
  const duplicateKeys = new Map<string, string[]>();
  const memberDxTimeline = new Map<string, { date: string; claim_id: string }[]>();

  for (const c of claims) {
    // Per-procedure amount baseline is built from SINGLE-procedure claims only.
    // Multi-procedure claims carry one lump amount for several procedures, which
    // would otherwise contaminate each component procedure's mean/std.
    if (c.procedure_codes.length === 1) {
      const proc = c.procedure_codes[0];
      const arr = amountsByProc.get(proc) ?? [];
      arr.push(c.submitted_amount);
      amountsByProc.set(proc, arr);
    }

    const pdKey = providerDayKey(c);
    providerDayCounts.set(pdKey, (providerDayCounts.get(pdKey) ?? 0) + 1);

    providerTotals.set(c.provider_id, (providerTotals.get(c.provider_id) ?? 0) + 1);
    if (c.is_weekend) {
      providerWeekend.set(c.provider_id, (providerWeekend.get(c.provider_id) ?? 0) + 1);
    }

    const dk = dupKey(c);
    const ids = duplicateKeys.get(dk) ?? [];
    ids.push(c.claim_id);
    duplicateKeys.set(dk, ids);

    const mk = memberDxKey(c);
    const tl = memberDxTimeline.get(mk) ?? [];
    tl.push({ date: c.claim_date, claim_id: c.claim_id });
    memberDxTimeline.set(mk, tl);
  }

  // finalize procStats (population mean/std)
  const procStats = new Map<string, ProcStats>();
  for (const [proc, arr] of amountsByProc) {
    const n = arr.length;
    const mean = arr.reduce((s, v) => s + v, 0) / n;
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    procStats.set(proc, { mean, std: Math.sqrt(variance), n });
  }

  // provider weekend ratio
  const providerWeekendRatio = new Map<string, number>();
  for (const [provider, total] of providerTotals) {
    const wk = providerWeekend.get(provider) ?? 0;
    providerWeekendRatio.set(provider, total > 0 ? wk / total : 0);
  }

  // sort each member-dx timeline ascending by date
  for (const tl of memberDxTimeline.values()) {
    tl.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.claim_id < b.claim_id ? -1 : 1));
  }

  const bundleLookup = BUNDLE_MAP.map((b) => ({
    bundleCode: b.bundleCode,
    components: new Set(b.components),
  }));

  const validDxProc = new Map<string, Set<string>>();
  for (const [dx, procs] of Object.entries(VALID_DX_PROC)) {
    validDxProc.set(dx, new Set(procs));
  }

  return {
    procStats,
    providerDayCounts,
    providerWeekendRatio,
    duplicateKeys,
    memberDxTimeline,
    bundleLookup,
    validDxProc,
  };
}
