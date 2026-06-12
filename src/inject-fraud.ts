/**
 * The 8 fraud-pattern injectors. Each appends tagged claims to the working set, sized to
 * the per-pattern counts in the README. Weak patterns (weekend, clustering) deliberately
 * include both pure (honestly missed) and composite (caught via stacking) instances.
 */

import { BUNDLE_MAP, CLUSTER_LOW, SURGICAL_PROCS, VALID_DX_PROC } from './config.js';
import {
  BUNDLE_DX,
  CLAIM_TYPES,
  DX_CODES,
  PROC_CATALOG,
  PROVIDER_NAMES,
  SURGICAL_DX,
  cleanDrafts,
  isoDate,
  makeNormal,
  makeNormalFor,
  nextWeekend,
  randomMember,
  roundAmt,
  type Draft,
  type Provider,
  type Tagged,
} from './dataset-primitives.js';
import { gaussian, pick, randInt, type Rng } from './prng.js';

const gauss = (rng: Rng, proc: string) =>
  roundAmt(gaussian(rng, PROC_CATALOG[proc].mean, PROC_CATALOG[proc].std));

/** duplicate (30 pairs): a fresh "original" + an identical-key "duplicate". Both share a
 *  token; after id assignment the later-id claim in each pair is labeled the duplicate
 *  (matching the rule, which flags the non-earliest claim). */
export function injectDuplicates(rng: Rng, providers: Provider[], tagged: Tagged[]): void {
  for (let i = 0; i < 30; i++) {
    const original = makeNormal(rng, providers);
    const copy: Draft = {
      ...original,
      procedure_codes: [...original.procedure_codes],
      submitted_amount: roundAmt(original.submitted_amount * (1 + (rng() - 0.5) * 0.02)),
    };
    tagged.push({ draft: original, pattern: null, dupToken: i });
    tagged.push({ draft: copy, pattern: null, dupToken: i });
  }
}

/** rapid_resubmission (30): same member+dx, 1–6 days after a real clean claim. */
export function injectRapid(rng: Rng, tagged: Tagged[]): void {
  const pool = cleanDrafts(tagged);
  for (let i = 0; i < 30; i++) {
    const src = pick(rng, pool);
    const base = new Date(`${src.claim_date}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + randInt(rng, 1, 6));
    const proc = pick(rng, VALID_DX_PROC[src.diagnosis_code]);
    tagged.push({
      draft: {
        ...src,
        claim_date: base.toISOString().slice(0, 10),
        procedure_codes: [proc],
        submitted_amount: gauss(rng, proc),
        is_weekend: base.getUTCDay() === 0 || base.getUTCDay() === 6,
      },
      pattern: 'rapid_resubmission',
    });
  }
}

/** upcoding (30): amount = mean + (2.6–4.0)σ. P-4003 excluded — its baseline is
 *  contaminated by injected clustering claims, so it is an unreliable upcoding target.
 *  The σ floor sits clear of the 2σ line; a few low-σ cases still miss (honest FNs). */
export function injectUpcoding(rng: Rng, tagged: Tagged[]): void {
  const procs = Object.keys(PROC_CATALOG).filter((p) => p !== 'P-4003');
  for (let i = 0; i < 30; i++) {
    const base = makeNormalFor(rng, pick(rng, procs));
    const stat = PROC_CATALOG[base.procedure_codes[0]];
    base.submitted_amount = roundAmt(stat.mean + (2.6 + rng() * 1.4) * stat.std);
    tagged.push({ draft: base, pattern: 'upcoding' });
  }
}

/** unbundling (25): a claim listing every component of a bundle, under a diagnosis that
 *  validly allows them all (so unbundling is the sole signal, no dx-mismatch leakage). */
export function injectUnbundling(rng: Rng, providers: Provider[], tagged: Tagged[]): void {
  for (let i = 0; i < 25; i++) {
    const bundle = pick(rng, BUNDLE_MAP);
    const draft = makeNormal(rng, providers);
    draft.diagnosis_code = BUNDLE_DX[bundle.bundleCode];
    draft.procedure_codes = [...bundle.components];
    const total = bundle.components.reduce((s, p) => s + PROC_CATALOG[p].mean, 0);
    draft.submitted_amount = roundAmt(total * (1.05 + rng() * 0.1));
    tagged.push({ draft, pattern: 'unbundling' });
  }
}

/** phantom_billing (35): one provider floods a single day with >30 claims. */
export function injectPhantom(rng: Rng, providers: Provider[], tagged: Tagged[]): void {
  const provider = pick(rng, providers);
  const { date, weekend } = isoDate(randInt(rng, 0, 365));
  for (let i = 0; i < 35; i++) {
    const dx = pick(rng, DX_CODES);
    const proc = pick(rng, VALID_DX_PROC[dx]);
    tagged.push({
      draft: {
        member_id: randomMember(rng),
        provider_id: provider.id,
        provider_name: provider.name,
        claim_date: date,
        claim_type: pick(rng, CLAIM_TYPES),
        diagnosis_code: dx,
        procedure_codes: [proc],
        submitted_amount: gauss(rng, proc),
        is_weekend: weekend,
      },
      pattern: 'phantom_billing',
    });
  }
}

/** weekend_anomaly (20): weekday-only provider, surgical proc, on a weekend, with a dx
 *  that validly allows the procedure (weekend is the only base signal, score 14). Half
 *  also park the amount in the clustering band so weekend(2)+clustering(2) crosses the
 *  threshold (composite-caught); the other half stay pure and are honestly missed. */
export function injectWeekend(rng: Rng, providers: Provider[], tagged: Tagged[]): void {
  const weekdayProviders = providers.filter((p) => !p.operatesWeekend);
  const surgical = [...SURGICAL_PROCS];
  for (let i = 0; i < 20; i++) {
    const provider = pick(rng, weekdayProviders);
    const alsoClustering = i < 10;
    // Composite half uses high-baseline P-4003 so the in-band amount stays under the
    // upcoding 2σ line — caught by weekend(2)+clustering(2), nothing else.
    const proc = alsoClustering ? 'P-4003' : pick(rng, surgical);
    tagged.push({
      draft: {
        member_id: randomMember(rng),
        provider_id: provider.id,
        provider_name: provider.name,
        claim_date: nextWeekend(rng).date,
        claim_type: 'INPATIENT',
        diagnosis_code: SURGICAL_DX[proc],
        procedure_codes: [proc],
        submitted_amount: alsoClustering ? randInt(rng, CLUSTER_LOW, 49_999) : gauss(rng, proc),
        is_weekend: true,
      },
      pattern: 'weekend_anomaly',
    });
  }
}

/** dx_proc_mismatch (20): a known diagnosis paired with a procedure not valid for it. */
export function injectDxMismatch(rng: Rng, tagged: Tagged[]): void {
  const allProcs = Object.keys(PROC_CATALOG);
  for (let i = 0; i < 20; i++) {
    const dx = pick(rng, DX_CODES);
    const allowed = new Set(VALID_DX_PROC[dx]);
    let proc = pick(rng, allProcs);
    while (allowed.has(proc)) proc = pick(rng, allProcs);
    const { date, weekend } = isoDate(randInt(rng, 0, 365));
    tagged.push({
      draft: {
        member_id: randomMember(rng),
        provider_id: `PRV-${String(randInt(rng, 1, 50)).padStart(2, '0')}`,
        provider_name: pick(rng, PROVIDER_NAMES),
        claim_date: date,
        claim_type: pick(rng, CLAIM_TYPES),
        diagnosis_code: dx,
        procedure_codes: [proc],
        submitted_amount: gauss(rng, proc),
        is_weekend: weekend,
      },
      pattern: 'dx_proc_mismatch',
    });
  }
}

/** amount_clustering (20): amount parked just below the 50k auto-approval ceiling on
 *  high-baseline P-4003 + a diagnosis that allows it (clustering is the only base signal,
 *  score 14). Half are pure (missed); half are also weekend submissions by a weekday-only
 *  provider, so clustering(2)+weekend(2) crosses the threshold (composite-caught). */
export function injectClustering(rng: Rng, providers: Provider[], tagged: Tagged[]): void {
  const weekdayProviders = providers.filter((p) => !p.operatesWeekend);
  for (let i = 0; i < 20; i++) {
    const alsoWeekend = i < 10;
    const provider = alsoWeekend ? pick(rng, weekdayProviders) : pick(rng, providers);
    const info = alsoWeekend ? nextWeekend(rng) : isoDate(randInt(rng, 0, 365));
    tagged.push({
      draft: {
        member_id: randomMember(rng),
        provider_id: provider.id,
        provider_name: provider.name,
        claim_date: info.date,
        claim_type: alsoWeekend ? 'INPATIENT' : pick(rng, CLAIM_TYPES),
        diagnosis_code: 'K35.80',
        procedure_codes: ['P-4003'],
        submitted_amount: randInt(rng, CLUSTER_LOW, 49_999),
        is_weekend: info.weekend,
      },
      pattern: 'amount_clustering',
    });
  }
}
