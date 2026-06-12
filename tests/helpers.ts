/** Shared test factories. */
import type { Claim } from '../src/models.js';

let counter = 0;
export function makeClaim(overrides: Partial<Claim> = {}): Claim {
  counter++;
  return {
    claim_id: `CLM-${String(counter).padStart(5, '0')}`,
    member_id: 'MBR-001',
    provider_id: 'PRV-01',
    provider_name: 'Test Clinic',
    claim_date: '2024-03-04',
    claim_type: 'OUTPATIENT',
    diagnosis_code: 'E11.9',
    procedure_codes: ['P-1001'],
    submitted_amount: 900,
    is_weekend: false,
    ...overrides,
  };
}

/** Many single-procedure claims at a fixed amount, used purely to build procStats.
 *  Each filler gets a distinct member/provider/date so it never shares a duplicate,
 *  rapid, or phantom key with the claim under test. */
export function makeProcClaims(proc: string, amount: number, n: number): Claim[] {
  return Array.from({ length: n }, (_, i) =>
    makeClaim({
      procedure_codes: [proc],
      submitted_amount: amount,
      member_id: `MBR-9${String(i).padStart(3, '0')}`,
      provider_id: `PRV-9${i % 9}`,
      claim_date: `2024-${String((i % 12) + 1).padStart(2, '0')}-15`,
    }),
  );
}
