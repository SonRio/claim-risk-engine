/**
 * Central configuration: rule weights, detection thresholds, and the clinical
 * reference data (bundles, valid diagnosis→procedure pairs, surgical set) shared
 * by both the dataset generator and the detection rules.
 *
 * Keeping these in one place guarantees the generator and the rules agree on what
 * "normal" looks like — the rules never get privileged knowledge the generator lacks.
 */

import type { RuleName } from './models.js';

/**
 * Per-rule weight (1–5). Doubles as the `severity` each rule emits and as the
 * scoring contribution. Justification lives in the README.
 *  - upcoding / phantom_billing = 5: direct, high-value financial loss, hard to do by accident.
 *  - duplicate / dx_proc_mismatch = 4: strong individual signal of intent/error.
 *  - rapid_resubmission / unbundling = 3: suspicious but has benign explanations.
 *  - weekend_anomaly / amount_clustering = 2: weak/circumstantial on their own.
 */
export const RULE_WEIGHTS: Record<RuleName, number> = {
  upcoding: 5,
  phantom_billing: 5,
  duplicate: 4,
  dx_proc_mismatch: 4,
  rapid_resubmission: 3,
  unbundling: 3,
  weekend_anomaly: 2,
  amount_clustering: 2,
};

/** Auto-approval ceiling: claims at/above this amount get manual review anyway. */
export const AUTO_APPROVAL = 50_000;
/** Lower bound of the "just below auto-approval" suspicious clustering band. */
export const CLUSTER_LOW = 47_500;
/** Upcoding fires when amount exceeds mean + UPCODE_SIGMA * std for its procedure. */
export const UPCODE_SIGMA = 2;
/** Min sample size for a procedure's stats to be trusted by the upcoding rule. */
export const UPCODE_MIN_N = 5;
/** Rapid-resubmission window in days (inclusive). */
export const RAPID_DAYS = 7;
/** Phantom-billing threshold: more than this many claims by one provider in one day. */
export const PHANTOM_DAILY = 30;
/** Weekend-anomaly: a provider whose weekend volume ratio is below this is "weekday-only".
 *  Providers that genuinely operate weekends sit far above this (~25–30%); weekday-only
 *  providers sit near 0, so 0.15 gives a clean margin either way. */
export const WEEKEND_HIST_MAX = 0.15;

/**
 * Score (0–100) at/above which a claim is classified as predicted-fraud.
 * Tuned to 21 = round(3/14*100): a single weak weight-2 rule (score 14) is NOT enough,
 * but any weight-≥3 rule or a combination of weak rules crosses. Yields recall ≈0.86,
 * FPR ≈0.025 against ground truth — both within target with healthy margin.
 */
export const SCORE_THRESHOLD = 21;
/**
 * Saturating normalizer: raw weighted score is divided by this then scaled to 0–100.
 * Set to the combined weight of the ~3 heaviest rules (5 + 5 + 4 = 14) so a single
 * claim hit by the three worst patterns saturates near 100. Tuned in Phase 08.
 */
export const NORMALIZE_CAP = 14;

/** Bundles: a set of component procedures that should be billed under one bundle code. */
export interface Bundle {
  bundleCode: string;
  components: string[];
}
export const BUNDLE_MAP: Bundle[] = [
  { bundleCode: 'B-100', components: ['P-2001', 'P-2002'] },
  { bundleCode: 'B-200', components: ['P-3001', 'P-3002', 'P-3003'] },
  { bundleCode: 'B-300', components: ['P-4001', 'P-4002'] },
  { bundleCode: 'B-400', components: ['P-1001', 'P-1002'] },
  { bundleCode: 'B-500', components: ['P-2003', 'P-2004', 'P-2005'] },
];

/**
 * Clinically valid diagnosis (ICD-10) → allowed procedure codes.
 * The generator only pairs normal claims from this map; dx_proc_mismatch flags
 * claims whose procedure is NOT in the allowed set for a known diagnosis.
 */
export const VALID_DX_PROC: Record<string, string[]> = {
  'E11.9': ['P-1001', 'P-2001', 'P-2003'], // Type 2 diabetes
  I10: ['P-1001', 'P-1002', 'P-2002'], // Essential hypertension
  'J45.909': ['P-1003', 'P-3001', 'P-2004'], // Asthma
  'K21.9': ['P-1002', 'P-2002', 'P-3002'], // GERD
  'M54.5': ['P-1004', 'P-3001', 'P-3002', 'P-3003'], // Low back pain (covers bundle B-200)
  'N39.0': ['P-2001', 'P-2002', 'P-2005', 'P-1005'], // Urinary tract infection (covers bundle B-100)
  'J02.9': ['P-1001', 'P-1003', 'P-2004'], // Acute pharyngitis
  'M17.0': ['P-3003', 'P-4001', 'P-4002'], // Osteoarthritis of knee
  'K35.80': ['P-4003', 'P-4004', 'P-3001'], // Acute appendicitis
  'H66.90': ['P-1003', 'P-1005', 'P-2004'], // Otitis media
  'L03.115': ['P-1004', 'P-4005', 'P-2005'], // Cellulitis of limb
  'S52.501A': ['P-3003', 'P-4004', 'P-4005'], // Wrist fracture
  'E78.5': ['P-2003', 'P-2004', 'P-2005'], // Hyperlipidemia
  'F32.9': ['P-1001', 'P-1004', 'P-1005'], // Depression
};

/** Surgical/operative procedures — used by the weekend-anomaly rule. */
export const SURGICAL_PROCS: Set<string> = new Set([
  'P-4001',
  'P-4002',
  'P-4003',
  'P-4004',
  'P-4005',
]);
