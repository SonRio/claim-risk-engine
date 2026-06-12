/**
 * Shared building blocks for the dataset generator: the base population (members,
 * providers, procedure catalog), clinical lookup maps, and claim-construction helpers.
 * Both the orchestrator (generate-dataset.ts) and the fraud injectors (inject-fraud.ts)
 * build on these.
 */

import { VALID_DX_PROC } from './config.js';
import type { Claim, ClaimType } from './models.js';
import { chance, gaussian, pick, randInt, type Rng } from './prng.js';

export const CLAIM_TYPES: ClaimType[] = ['OUTPATIENT', 'INPATIENT', 'DENTAL'];
export const DX_CODES = Object.keys(VALID_DX_PROC);

/** Diagnosis whose valid-procedure set contains every component of each bundle, so an
 *  unbundling fraud trips ONLY the unbundling rule (no dx-mismatch leakage). */
export const BUNDLE_DX: Record<string, string> = {
  'B-100': 'N39.0',
  'B-200': 'M54.5',
  'B-300': 'M17.0',
  'B-400': 'I10',
  'B-500': 'E78.5',
};

/** A diagnosis that validly allows each surgical procedure, so a weekend fraud trips
 *  ONLY the weekend rule (no dx-mismatch leakage). */
export const SURGICAL_DX: Record<string, string> = {
  'P-4001': 'M17.0',
  'P-4002': 'M17.0',
  'P-4003': 'K35.80',
  'P-4004': 'K35.80',
  'P-4005': 'L03.115',
};

/** Amount baseline (mean, std) per procedure code. P-4003's high mean lets the
 *  clustering band (47.5k–50k) sit under its upcoding 2σ line. */
export const PROC_CATALOG: Record<string, { mean: number; std: number }> = {
  'P-1001': { mean: 900, std: 180 },
  'P-1002': { mean: 1100, std: 200 },
  'P-1003': { mean: 1300, std: 250 },
  'P-1004': { mean: 800, std: 160 },
  'P-1005': { mean: 1000, std: 190 },
  'P-2001': { mean: 2200, std: 400 },
  'P-2002': { mean: 1800, std: 350 },
  'P-2003': { mean: 2600, std: 500 },
  'P-2004': { mean: 3000, std: 550 },
  'P-2005': { mean: 2400, std: 450 },
  'P-3001': { mean: 8000, std: 1500 },
  'P-3002': { mean: 11000, std: 2000 },
  'P-3003': { mean: 9500, std: 1700 },
  'P-4001': { mean: 28000, std: 4000 },
  'P-4002': { mean: 35000, std: 4500 },
  'P-4003': { mean: 40000, std: 5000 },
  'P-4004': { mean: 32000, std: 4200 },
  'P-4005': { mean: 38000, std: 4800 },
};

export const PROVIDER_NAMES = [
  'Saigon General',
  'Hanoi Medical Center',
  'Mekong Health',
  'Pacific Clinic',
  'Lotus Hospital',
  'Orchid Care',
  'Summit Medical',
  'Harbor Health',
  'Evergreen Clinic',
  'Unity Hospital',
];

export interface Provider {
  id: string;
  name: string;
  operatesWeekend: boolean;
}

/** A claim before its final id/order is assigned. */
export type Draft = Omit<Claim, 'claim_id'>;

export interface Tagged {
  draft: Draft;
  pattern: import('./models.js').RuleName | null; // null = clean
  /** Marks both members of an injected duplicate pair; labels are repaired post-shuffle. */
  dupToken?: number;
}

/** Convert a 0-based day offset within 2024 to an ISO date + weekend flag. */
export function isoDate(dayOffset: number): { date: string; weekend: boolean } {
  const d = new Date(Date.UTC(2024, 0, 1 + dayOffset));
  const day = d.getUTCDay();
  return { date: d.toISOString().slice(0, 10), weekend: day === 0 || day === 6 };
}

/** Find a weekend date by scanning forward from a random day-of-year offset. */
export function nextWeekend(rng: Rng): { date: string; weekend: boolean } {
  let off = randInt(rng, 0, 365);
  let info = isoDate(off);
  while (!info.weekend) {
    off = (off + 1) % 366;
    info = isoDate(off);
  }
  return info;
}

export function roundAmt(n: number): number {
  return Math.max(50, Math.round(n));
}

export function buildProviders(rng: Rng): Provider[] {
  const providers: Provider[] = [];
  for (let i = 1; i <= 50; i++) {
    providers.push({
      id: `PRV-${String(i).padStart(2, '0')}`,
      name: `${pick(rng, PROVIDER_NAMES)} #${i}`,
      operatesWeekend: chance(rng, 0.3), // ~30% genuinely operate on weekends
    });
  }
  return providers;
}

export function randomMember(rng: Rng): string {
  return `MBR-${String(randInt(rng, 1, 500)).padStart(3, '0')}`;
}

/** A claim date consistent with the provider: weekday-only providers never bill on
 *  weekends in normal operation — which is what makes the weekend-anomaly rule meaningful
 *  (a weekend claim from such a provider is genuinely out-of-pattern). */
export function providerDate(rng: Rng, provider: Provider): { date: string; weekend: boolean } {
  let info = isoDate(randInt(rng, 0, 365));
  if (!provider.operatesWeekend) {
    while (info.weekend) info = isoDate(randInt(rng, 0, 365));
  }
  return info;
}

/** One clean claim: valid dx→proc pairing, gaussian amount, provider-consistent date. */
export function makeNormal(rng: Rng, providers: Provider[]): Draft {
  const provider = pick(rng, providers);
  const dx = pick(rng, DX_CODES);
  const proc = pick(rng, VALID_DX_PROC[dx]);
  const stat = PROC_CATALOG[proc];
  const { date, weekend } = providerDate(rng, provider);
  return {
    member_id: randomMember(rng),
    provider_id: provider.id,
    provider_name: provider.name,
    claim_date: date,
    claim_type: pick(rng, CLAIM_TYPES),
    diagnosis_code: dx,
    procedure_codes: [proc],
    submitted_amount: roundAmt(gaussian(rng, stat.mean, stat.std)),
    is_weekend: weekend,
  };
}

/** A normal-shaped claim forced to use a specific procedure (random provider/date). */
export function makeNormalFor(rng: Rng, proc: string): Draft {
  const stat = PROC_CATALOG[proc];
  const { date, weekend } = isoDate(randInt(rng, 0, 365));
  const dx = DX_CODES.find((d) => VALID_DX_PROC[d].includes(proc)) ?? pick(rng, DX_CODES);
  return {
    member_id: randomMember(rng),
    provider_id: `PRV-${String(randInt(rng, 1, 50)).padStart(2, '0')}`,
    provider_name: pick(rng, PROVIDER_NAMES),
    claim_date: date,
    claim_type: pick(rng, CLAIM_TYPES),
    diagnosis_code: dx,
    procedure_codes: [proc],
    submitted_amount: roundAmt(gaussian(rng, stat.mean, stat.std)),
    is_weekend: weekend,
  };
}

export function cleanDrafts(tagged: Tagged[]): Draft[] {
  return tagged.filter((t) => t.pattern === null).map((t) => t.draft);
}
