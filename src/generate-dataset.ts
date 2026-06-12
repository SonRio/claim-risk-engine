/**
 * Deterministic synthetic claim generator (orchestrator).
 *
 * Produces 2000 claims: ~1790 clean (valid dx→proc pairings, gaussian amounts) and 210
 * fraud across 8 patterns (some multi-pattern). A parallel ground-truth label list marks
 * the injected frauds.
 *
 * Design intent — HONEST metrics:
 *  - Clean claims occasionally trip a rule by coincidence (key collisions, naturally high
 *    amounts) → real false positives.
 *  - Weak-pattern frauds (weekend, clustering) are weight-2 signals that score below the
 *    decision threshold on their own; pure instances are real false negatives, while
 *    composite instances (two weak signals stacked) are caught.
 * This is why recall is not 100% and FPR is not 0% — the dataset is not rigged.
 *
 * Building blocks live in dataset-primitives.ts; the 8 injectors in inject-fraud.ts.
 */

import type { Claim, FraudLabel, RuleName } from './models.js';
import { mulberry32, SEED, shuffle, type Rng } from './prng.js';
import { buildProviders, makeNormal, type Provider, type Tagged } from './dataset-primitives.js';
import {
  injectClustering,
  injectDuplicates,
  injectDxMismatch,
  injectPhantom,
  injectRapid,
  injectUnbundling,
  injectUpcoding,
  injectWeekend,
} from './inject-fraud.js';

/** Build the full tagged dataset (clean + fraud), pre-shuffle. */
function buildTagged(rng: Rng, providers: Provider[]): Tagged[] {
  const tagged: Tagged[] = [];

  // Base clean population (sized so total lands at exactly 2000 after injection).
  // procStats baselines are computed later from this UNLABELED population — the engine
  // never sees a clean/fraud split. We seed no artificial noise: coincidental false
  // positives arise naturally from the random population.
  for (let i = 0; i < 1760; i++) {
    tagged.push({ draft: makeNormal(rng, providers), pattern: null });
  }

  injectDuplicates(rng, providers, tagged);
  injectRapid(rng, tagged);
  injectUpcoding(rng, tagged);
  injectUnbundling(rng, providers, tagged);
  injectPhantom(rng, providers, tagged);
  injectWeekend(rng, providers, tagged);
  injectDxMismatch(rng, tagged);
  injectClustering(rng, providers, tagged);

  return tagged;
}

export interface Dataset {
  claims: Claim[];
  labels: FraudLabel[];
}

/** Generate the full deterministic dataset and ground-truth labels. */
export function generateDataset(seed: number = SEED): Dataset {
  const rng = mulberry32(seed);
  const providers = buildProviders(rng);
  const tagged = buildTagged(rng, providers);

  shuffle(rng, tagged);

  // Assign final ids in shuffled order.
  const ids = tagged.map((_, i) => `CLM-${String(i + 1).padStart(5, '0')}`);
  const claims: Claim[] = tagged.map((t, i) => ({ claim_id: ids[i], ...t.draft }));
  const pattern: (RuleName | null)[] = tagged.map((t) => t.pattern);

  // Repair duplicate-pair labels: within each injected pair the earliest-id claim is the
  // legitimate original (clean); the later-id claim is the duplicate (fraud) — matching
  // exactly what the duplicate rule flags.
  const pairs = new Map<number, number[]>(); // dupToken → tagged indices
  tagged.forEach((t, i) => {
    if (t.dupToken === undefined) return;
    const list = pairs.get(t.dupToken) ?? [];
    list.push(i);
    pairs.set(t.dupToken, list);
  });
  for (const indices of pairs.values()) {
    indices.sort((a, b) => (ids[a] < ids[b] ? -1 : 1));
    indices.forEach((idx, rank) => {
      pattern[idx] = rank === 0 ? null : 'duplicate';
    });
  }

  const labels: FraudLabel[] = claims.map((c, i) => ({
    claim_id: c.claim_id,
    is_fraud: pattern[i] !== null,
    pattern: pattern[i],
  }));

  return { claims, labels };
}

/** Count claims per ground-truth pattern (and clean) for reporting. */
export function summarize(labels: FraudLabel[]): Record<string, number> {
  const counts: Record<string, number> = { total: labels.length, fraud: 0, clean: 0 };
  for (const l of labels) {
    if (l.is_fraud) {
      counts.fraud++;
      counts[l.pattern ?? 'unknown'] = (counts[l.pattern ?? 'unknown'] ?? 0) + 1;
    } else {
      counts.clean++;
    }
  }
  return counts;
}
