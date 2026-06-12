import { describe, expect, it } from 'vitest';
import { buildContext } from '../src/context.js';
import { makeClaim, makeProcClaims } from './helpers.js';
import { duplicateRule } from '../src/rules/duplicate.js';
import { rapidResubmissionRule } from '../src/rules/rapid-resubmission.js';
import { upcodingRule } from '../src/rules/upcoding.js';
import { unbundlingRule } from '../src/rules/unbundling.js';
import { phantomBillingRule } from '../src/rules/phantom-billing.js';
import { weekendAnomalyRule } from '../src/rules/weekend-anomaly.js';
import { dxProcMismatchRule } from '../src/rules/dx-proc-mismatch.js';
import { amountClusteringRule } from '../src/rules/amount-clustering.js';

describe('duplicate rule', () => {
  it('flags the later duplicate, not the original', () => {
    const a = makeClaim({ claim_id: 'CLM-00001' });
    const b = makeClaim({ claim_id: 'CLM-00002' }); // same member/provider/date/dx
    const ctx = buildContext([a, b]);
    expect(duplicateRule(a, ctx)).toBeNull();
    expect(duplicateRule(b, ctx)?.rule).toBe('duplicate');
  });

  it('does not flag a unique claim', () => {
    const a = makeClaim({ claim_id: 'CLM-00010', member_id: 'MBR-777' });
    const ctx = buildContext([a, makeClaim({ member_id: 'MBR-888' })]);
    expect(duplicateRule(a, ctx)).toBeNull();
  });
});

describe('rapid_resubmission rule', () => {
  it('fires within 7 days on the later claim only', () => {
    const first = makeClaim({ claim_id: 'CLM-00001', claim_date: '2024-03-01' });
    const second = makeClaim({ claim_id: 'CLM-00002', claim_date: '2024-03-04', provider_id: 'PRV-02' });
    const ctx = buildContext([first, second]);
    expect(rapidResubmissionRule(first, ctx)).toBeNull();
    expect(rapidResubmissionRule(second, ctx)?.rule).toBe('rapid_resubmission');
  });

  it('does not fire when 8 days apart', () => {
    const first = makeClaim({ claim_id: 'CLM-00001', claim_date: '2024-03-01' });
    const second = makeClaim({ claim_id: 'CLM-00002', claim_date: '2024-03-09', provider_id: 'PRV-02' });
    const ctx = buildContext([first, second]);
    expect(rapidResubmissionRule(second, ctx)).toBeNull();
  });
});

describe('upcoding rule', () => {
  const base = [...makeProcClaims('P-3001', 7800, 15), ...makeProcClaims('P-3001', 8200, 15)]; // mean 8000

  it('fires above 2 sigma and not within 2 sigma', () => {
    const high = makeClaim({ procedure_codes: ['P-3001'], submitted_amount: 9000 });
    const normal = makeClaim({ procedure_codes: ['P-3001'], submitted_amount: 8100 });
    const ctx = buildContext([...base, high, normal]);
    expect(upcodingRule(high, ctx)?.rule).toBe('upcoding');
    expect(upcodingRule(normal, ctx)).toBeNull();
  });

  it('skips procedures with too few samples (n < 5)', () => {
    const rare = makeClaim({ procedure_codes: ['P-2005'], submitted_amount: 50000 });
    const ctx = buildContext([...makeProcClaims('P-2005', 2400, 3), rare]); // n = 4
    expect(upcodingRule(rare, ctx)).toBeNull();
  });
});

describe('unbundling rule', () => {
  it('fires when all bundle components present, not when one is missing', () => {
    const full = makeClaim({ procedure_codes: ['P-2001', 'P-2002'] }); // B-100
    const partial = makeClaim({ procedure_codes: ['P-2001'] });
    const ctx = buildContext([full, partial]);
    expect(unbundlingRule(full, ctx)?.rule).toBe('unbundling');
    expect(unbundlingRule(partial, ctx)).toBeNull();
  });
});

describe('phantom_billing rule', () => {
  it('fires above 30 claims/provider-day, not at exactly 30', () => {
    const over = Array.from({ length: 31 }, () => makeClaim({ provider_id: 'PRV-30', claim_date: '2024-05-05' }));
    const ctxOver = buildContext(over);
    expect(phantomBillingRule(over[0], ctxOver)?.rule).toBe('phantom_billing');

    const exactly = Array.from({ length: 30 }, () => makeClaim({ provider_id: 'PRV-31', claim_date: '2024-05-06' }));
    const ctxExact = buildContext(exactly);
    expect(phantomBillingRule(exactly[0], ctxExact)).toBeNull();
  });
});

describe('weekend_anomaly rule', () => {
  const weekdayLoad = Array.from({ length: 50 }, () => makeClaim({ provider_id: 'PRV-40', is_weekend: false }));

  it('fires for surgical proc on weekend by a weekday-only provider', () => {
    const claim = makeClaim({ provider_id: 'PRV-40', is_weekend: true, procedure_codes: ['P-4001'] });
    const ctx = buildContext([...weekdayLoad, claim]); // ratio ≈ 1/51
    expect(weekendAnomalyRule(claim, ctx)?.rule).toBe('weekend_anomaly');
  });

  it('does not fire for a provider that regularly works weekends', () => {
    const busy = Array.from({ length: 10 }, () => makeClaim({ provider_id: 'PRV-41', is_weekend: true }));
    const claim = makeClaim({ provider_id: 'PRV-41', is_weekend: true, procedure_codes: ['P-4001'] });
    const ctx = buildContext([...busy, claim]); // ratio high
    expect(weekendAnomalyRule(claim, ctx)).toBeNull();
  });
});

describe('dx_proc_mismatch rule', () => {
  it('fires on an invalid pairing, not a valid one, and skips unknown diagnoses', () => {
    const ctx = buildContext([makeClaim()]);
    const bad = makeClaim({ diagnosis_code: 'E11.9', procedure_codes: ['P-4001'] });
    const good = makeClaim({ diagnosis_code: 'E11.9', procedure_codes: ['P-1001'] });
    const unknown = makeClaim({ diagnosis_code: 'Z99.9', procedure_codes: ['P-4001'] });
    expect(dxProcMismatchRule(bad, ctx)?.rule).toBe('dx_proc_mismatch');
    expect(dxProcMismatchRule(good, ctx)).toBeNull();
    expect(dxProcMismatchRule(unknown, ctx)).toBeNull();
  });
});

describe('amount_clustering rule', () => {
  const ctx = buildContext([makeClaim()]);
  it('fires inside the band and respects boundaries', () => {
    expect(amountClusteringRule(makeClaim({ submitted_amount: 48000 }), ctx)?.rule).toBe('amount_clustering');
    expect(amountClusteringRule(makeClaim({ submitted_amount: 47500 }), ctx)?.rule).toBe('amount_clustering');
    expect(amountClusteringRule(makeClaim({ submitted_amount: 49999 }), ctx)?.rule).toBe('amount_clustering');
    expect(amountClusteringRule(makeClaim({ submitted_amount: 47499 }), ctx)).toBeNull();
    expect(amountClusteringRule(makeClaim({ submitted_amount: 50000 }), ctx)).toBeNull();
  });
});
