/** Registry of all detection rules in a stable order. The engine runs each rule
 *  against every claim and collects the non-null flags. */
import { amountClusteringRule } from './amount-clustering.js';
import { dxProcMismatchRule } from './dx-proc-mismatch.js';
import { duplicateRule } from './duplicate.js';
import { phantomBillingRule } from './phantom-billing.js';
import { rapidResubmissionRule } from './rapid-resubmission.js';
import { unbundlingRule } from './unbundling.js';
import { upcodingRule } from './upcoding.js';
import { weekendAnomalyRule } from './weekend-anomaly.js';
import type { RuleFn } from './rule-fn.js';

export const ALL_RULES: RuleFn[] = [
  duplicateRule,
  rapidResubmissionRule,
  upcodingRule,
  unbundlingRule,
  phantomBillingRule,
  weekendAnomalyRule,
  dxProcMismatchRule,
  amountClusteringRule,
];

export type { RuleFn } from './rule-fn.js';
