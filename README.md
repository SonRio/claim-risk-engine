# Fraud Detection Scoring Engine

A rule-based engine that scores **2000 synthetic health-insurance claims** for fraud risk
(0–100) and explains every flag with concrete, numeric evidence. It ships with a
deterministic dataset generator, 8 detection rules, an evaluation harness measured against
ground truth, and a self-contained interactive dashboard.

**Headline result** (decision threshold = 21):

| Precision | Recall | False Positive Rate | Target |
|---|---|---|---|
| **83.8%** | **91.4%** | **2.1%** | recall ≥ 70%, FPR ≤ 20% — ✅ PASS |

2000 claims are scored in **~10 ms**. No ML, no heavy dependencies — only TypeScript + a
seeded PRNG.

---

## Quick start

```bash
npm install
npm run all        # generate → score → metrics → dashboard
open dashboard.html # double-click also works (pure file://, no server)
npm test           # 27 Vitest tests
```

Individual stages:

```bash
npm run generate   # data/claims.csv (2000) + data/ground-truth.csv
npm run score      # data/scored-output.json (ranked), prints top-10
npm run metrics    # reports/metrics.md + PASS/FAIL summary
npm run dashboard  # dashboard.html (data inlined)
npm run typecheck  # tsc --noEmit
```

## Deliverables

| File | What |
|---|---|
| `data/claims.csv` | 2000 generated claims |
| `data/ground-truth.csv` | fraud labels (for evaluation only — rules never see them) |
| `data/scored-output.json` | every claim with risk score + flags, ranked |
| `reports/metrics.md` | precision/recall/FPR, threshold sweep, per-pattern recall |
| `dashboard.html` | offline interactive dashboard |

## Architecture

```
generate-dataset → claims.csv ─┐
                               ├─► buildContext (one-pass aggregates)
                               │        │
                               │        ▼
                               └─► ALL_RULES × each claim → flags
                                        │
                                        ▼
                                  engine: Σ severity → normalize 0–100 → rank
                                        │
                                        ▼
                                  metrics vs ground truth · dashboard
```

- **Pure-function rules** (`src/rules/*.ts`): `(claim, ctx) => Flag | null`. No I/O, trivially testable.
- **Context precompute** (`src/context.ts`): all population aggregates computed once, so each
  rule is O(1) and the whole run stays in milliseconds.
- **Seeded PRNG** (`src/prng.ts`, mulberry32, seed 42): the dataset is byte-for-byte reproducible.

## The 8 detection rules

| # | Rule | Fires when | Example evidence |
|---|------|-----------|------------------|
| 1 | `duplicate` | same member + provider + date + diagnosis as an earlier claim | *Duplicate of 1 other claim … (e.g. CLM-01234)* |
| 2 | `rapid_resubmission` | same member + diagnosis billed again within 7 days (later claim only) | *Same diagnosis E11.9 resubmitted 3 day(s) from claim CLM-…* |
| 3 | `upcoding` | single-proc amount > mean + 2σ for that procedure (n ≥ 5) | *Amount 9000 for P-3001 is 4.6 std above mean of 8000* |
| 4 | `unbundling` | one claim lists every component of a known bundle | *Procedures [P-2001, P-2002] should be billed as bundle B-100* |
| 5 | `phantom_billing` | a provider submits > 30 claims in one day | *Provider PRV-07 submitted 35 claims on 2024-… (threshold 30)* |
| 6 | `weekend_anomaly` | surgical proc on a weekend by a normally weekday-only provider (< 15% weekend volume) | *Surgical P-4001 on weekend …; provider weekend volume 2.0% (< 15%)* |
| 7 | `dx_proc_mismatch` | procedure not clinically valid for a known diagnosis | *Procedure P-4001 not clinically associated with diagnosis E11.9* |
| 8 | `amount_clustering` | amount parked in [47 500, 50 000) — just under auto-approval | *Amount 49 200 is 98.4% of the 50 000 auto-approval threshold* |

Unknown diagnoses are skipped by rule 7 (avoids broad false positives); upcoding only judges
single-procedure claims, since a bundled lump sum isn't attributable to one procedure.

## Scoring model

Each rule emits a `severity` equal to its **weight** (1–5). A claim's raw score is the sum of
fired severities, then saturated to 0–100:

```
raw  = Σ severity                                  (severity == rule weight)
risk = round( min(100, raw / NORMALIZE_CAP × 100) )   NORMALIZE_CAP = 14
```

`NORMALIZE_CAP = 14` is the combined weight of the three heaviest rules (5 + 5 + 4), so a claim
hit by the three worst patterns saturates near 100, while a single weak signal stays low.

### Weights & justification

| Weight | Rules | Rationale |
|---|---|---|
| **5** | `upcoding`, `phantom_billing` | direct, high-value financial loss; hard to do by accident |
| **4** | `duplicate`, `dx_proc_mismatch` | strong individual signal of intent or gross error |
| **3** | `rapid_resubmission`, `unbundling` | suspicious, but each has benign explanations |
| **2** | `weekend_anomaly`, `amount_clustering` | weak/circumstantial alone; mainly boost composite scores |

### Decision threshold = 21

A claim is classified fraud when `risk_score ≥ 21 = round(3/14 × 100)`. Policy meaning: **a single
weak weight-2 signal (score 14) is not enough**, but any weight-≥3 rule, or a combination of weak
rules, crosses. The full threshold sweep is in `reports/metrics.md`.

## Results & honest metrics

Per-pattern recall at threshold 21 — each pattern is caught by **its own rule** (or an honest
composite), not by another rule leaking in:

| Pattern | Recall | | Pattern | Recall |
|---|---|---|---|---|
| duplicate | 100% (30/30) | | upcoding | 100% (30/30) |
| rapid_resubmission | 100% (30/30) | | weekend_anomaly | 50% (10/20) |
| phantom_billing | 100% (35/35) | | amount_clustering | 60% (12/20) |
| unbundling | 100% (25/25) | | dx_proc_mismatch | 100% (20/20) |

**Why recall isn't 100% and FPR isn't 0% — by design.** The generator deliberately avoids a
rigged dataset, and the per-pattern numbers above are *truthful* (no cross-rule leakage — e.g.
unbundling frauds use a diagnosis that validly covers their components, so they are caught by the
unbundling rule itself, not by dx-mismatch):

- **Weak signals stay weak.** `weekend_anomaly` and `amount_clustering` are weight-2 rules: alone
  they score 14, below the threshold of 21. So a *pure* weekend or clustering fraud is genuinely
  missed — that's correct, a single weak signal shouldn't trigger an investigation. Half of each
  pattern's frauds are constructed to *also* trip a second weak signal (weekend **+** clustering →
  score 29), and those are caught. That is the layered-scoring claim demonstrated with data, not
  just asserted: weak rules earn their keep by lifting the composite score, not by flagging alone.
- **Real false negatives.** The pure weekend/clustering frauds (10 + 8) are honest misses.
- **Real false positives.** Clean claims occasionally collide by coincidence (two legitimate
  same-diagnosis visits within a week → rapid; a naturally expensive claim past 2σ → upcoding;
  a clean claim landing on the phantom provider's flooded day). 37 of 1790 clean claims are
  flagged (2.1% FPR).

`integration.test.ts` locks recall ≥ 70% and FPR ≤ 20% so tuning can't silently break the target.

### Known limitation — baseline contamination

`procStats` (the per-procedure mean/std used by upcoding) is computed from the **full unlabeled
population**, because a real engine has no clean/fraud split at scoring time. Injected high-amount
frauds therefore nudge their procedure's baseline upward — realistic (undetected fraud always
contaminates baselines), but it means upcoding detection degrades gracefully rather than being
exact. The clustering-dedicated procedure `P-4003` is the most affected and is excluded as an
upcoding target for this reason. A production system would use a robust estimator (median/MAD) or
a provider-adjusted baseline.

## Dataset

2000 claims = ~1790 clean + 210 fraud across all 8 patterns (some multi-pattern), over 500
members / 50 providers / 2024 calendar. Clinical reference data (bundles, valid diagnosis→
procedure pairs, surgical set) lives in `src/config.ts` and is shared by **both** the generator
and the rules — the rules get no privileged knowledge the data lacks.

## Testing

27 Vitest tests (`npm test`): per-rule fire/no-fire + boundary cases (7-day vs 8-day, 30 vs 31
claims/day, 47 499 vs 47 500 vs 50 000, n < 5 skip), PRNG determinism, CSV round-trip, context
aggregates, scoring accumulation/clamp, metrics math, and the end-to-end regression lock.

## Project layout

```
src/
  config.ts            weights, thresholds, bundles, valid dx→proc, surgical set
  models.ts            domain types
  prng.ts  csv.ts      seeded RNG + dependency-free CSV
  dataset-primitives.ts  base population, catalog, clinical maps, claim builders
  inject-fraud.ts      the 8 fraud-pattern injectors
  generate-dataset.ts  orchestrates generation + ground-truth labels
  context.ts           one-pass population aggregates
  rules/*.ts           8 pure detection rules + registry
  engine.ts            scoring + ranking
  metrics.ts report.ts evaluation + report builders
  cli.ts paths.ts      pipeline CLI
scripts/build-dashboard.ts   inlines data into the dashboard template
public/dashboard.template.html
tests/                 27 Vitest tests
```

## Limitations & extensions

- Rules are deterministic thresholds, not learned — by design (explainable, auditable). A natural
  extension is to calibrate per-rule severities or the threshold from labeled history.
- `upcoding` uses a population mean per procedure; a provider- or region-adjusted baseline would
  reduce the coincidental-expensive-claim false positives.
- The dataset is synthetic; on real data the clinical reference tables (bundles, dx→proc) would
  come from coding standards (e.g. NCCI edits, ICD-10/CPT crosswalks).
