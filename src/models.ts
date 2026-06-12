/**
 * Core domain types for the fraud scoring engine.
 * A `Claim` is the raw input row; `ScoredClaim` is the engine output;
 * `FraudLabel` is the ground-truth row used only for metrics (never seen by rules).
 */

export type ClaimType = 'OUTPATIENT' | 'INPATIENT' | 'DENTAL';

export interface Claim {
  claim_id: string; // CLM-00001
  member_id: string; // MBR-001 (~500 members)
  provider_id: string; // PRV-01 (~50 providers)
  provider_name: string;
  claim_date: string; // ISO YYYY-MM-DD
  claim_type: ClaimType;
  diagnosis_code: string; // ICD-10
  procedure_codes: string[]; // P-xxxx
  submitted_amount: number;
  is_weekend: boolean;
}

export type RuleName =
  | 'duplicate'
  | 'rapid_resubmission'
  | 'upcoding'
  | 'unbundling'
  | 'phantom_billing'
  | 'weekend_anomaly'
  | 'dx_proc_mismatch'
  | 'amount_clustering';

/** A single rule hit on a claim. `severity` is the rule weight (1–5); `evidence` carries real numbers. */
export interface Flag {
  rule: RuleName;
  severity: number;
  evidence: string;
}

export interface ScoredClaim {
  claim_id: string;
  risk_score: number; // 0–100
  flags: Flag[];
}

/** Ground-truth label for one claim. `pattern` is the primary injected fraud pattern (or null = clean). */
export interface FraudLabel {
  claim_id: string;
  is_fraud: boolean;
  pattern: RuleName | null;
}
