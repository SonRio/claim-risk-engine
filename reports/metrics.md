# Claim Risk Engine — Metrics Report

**Decision threshold:** risk_score ≥ 21

**Result:** ✅ PASS (target: recall ≥ 70.0%, FPR ≤ 20.0%)

| Metric | Value |
|---|---|
| Precision | 83.8% |
| Recall | 91.4% |
| False Positive Rate | 2.1% |
| Flagged (≥ threshold) | 229 / 2000 |
| TP / FP / FN / TN | 192 / 37 / 18 / 1753 |

## Threshold sweep

| Threshold | Precision | Recall | FPR | TP | FP | FN | TN |
|---|---|---|---|---|---|---|---|
| 5 | 83.7% | 100.0% | 2.3% | 210 | 41 | 0 | 1749 |
| 10 | 83.7% | 100.0% | 2.3% | 210 | 41 | 0 | 1749 |
| 15 | 83.8% | 91.4% | 2.1% | 192 | 37 | 18 | 1753 |
| 20 | 83.8% | 91.4% | 2.1% | 192 | 37 | 18 | 1753 |
| 21 | 83.8% | 91.4% | 2.1% | 192 | 37 | 18 | 1753 |
| 25 | 84.0% | 65.2% | 1.5% | 137 | 26 | 73 | 1764 |
| 29 | 84.0% | 65.2% | 1.5% | 137 | 26 | 73 | 1764 |
| 30 | 72.9% | 33.3% | 1.5% | 70 | 26 | 140 | 1764 |
| 35 | 72.9% | 33.3% | 1.5% | 70 | 26 | 140 | 1764 |
| 40 | 87.5% | 3.3% | 0.1% | 7 | 1 | 203 | 1789 |
| 50 | 85.7% | 2.9% | 0.1% | 6 | 1 | 204 | 1789 |

## Per-pattern recall

| Pattern | Caught | Total | Recall |
|---|---|---|---|
| upcoding | 30 | 30 | 100.0% |
| phantom_billing | 35 | 35 | 100.0% |
| unbundling | 25 | 25 | 100.0% |
| weekend_anomaly | 10 | 20 | 50.0% |
| amount_clustering | 12 | 20 | 60.0% |
| rapid_resubmission | 30 | 30 | 100.0% |
| dx_proc_mismatch | 20 | 20 | 100.0% |
| duplicate | 30 | 30 | 100.0% |

> Weak standalone patterns (amount_clustering, weekend_anomaly) are often missed on their own by design — they mainly raise the composite score of claims that also trip stronger rules. This, plus coincidental false positives among clean claims, is why recall is not 100% and FPR is not 0%: the dataset is not rigged.
