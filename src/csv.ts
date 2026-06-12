/**
 * Minimal, dependency-free CSV reader/writer (RFC4180-ish: double-quote escaping).
 * `procedure_codes` is stored JSON-encoded inside a single quoted cell so the array
 * survives a write→read round-trip intact.
 */

import type { Claim, ClaimType, FraudLabel, RuleName } from './models.js';

const CLAIM_HEADER = [
  'claim_id',
  'member_id',
  'provider_id',
  'provider_name',
  'claim_date',
  'claim_type',
  'diagnosis_code',
  'procedure_codes',
  'submitted_amount',
  'is_weekend',
] as const;

const LABEL_HEADER = ['claim_id', 'is_fraud', 'pattern'] as const;

/** Quote a cell only when it contains a comma, quote, or newline; escape `"` as `""`. */
function escapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Parse one CSV line into fields, honoring quotes and `""` escapes. */
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

/** Split text into non-empty rows (tolerates trailing newline and CRLF). */
function splitRows(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
}

export function toCsv(rows: Claim[]): string {
  const lines = [CLAIM_HEADER.join(',')];
  for (const c of rows) {
    lines.push(
      [
        c.claim_id,
        c.member_id,
        c.provider_id,
        escapeCell(c.provider_name),
        c.claim_date,
        c.claim_type,
        c.diagnosis_code,
        escapeCell(JSON.stringify(c.procedure_codes)),
        String(c.submitted_amount),
        String(c.is_weekend),
      ].join(','),
    );
  }
  return lines.join('\n') + '\n';
}

export function fromCsv(text: string): Claim[] {
  const rows = splitRows(text);
  rows.shift(); // header
  return rows.map((line) => {
    const f = parseLine(line);
    return {
      claim_id: f[0],
      member_id: f[1],
      provider_id: f[2],
      provider_name: f[3],
      claim_date: f[4],
      claim_type: f[5] as ClaimType,
      diagnosis_code: f[6],
      procedure_codes: JSON.parse(f[7]) as string[],
      submitted_amount: Number(f[8]),
      is_weekend: f[9] === 'true',
    };
  });
}

export function labelsToCsv(rows: FraudLabel[]): string {
  const lines = [LABEL_HEADER.join(',')];
  for (const l of rows) {
    lines.push([l.claim_id, String(l.is_fraud), l.pattern ?? ''].join(','));
  }
  return lines.join('\n') + '\n';
}

export function labelsFromCsv(text: string): FraudLabel[] {
  const rows = splitRows(text);
  rows.shift();
  return rows.map((line) => {
    const f = parseLine(line);
    return {
      claim_id: f[0],
      is_fraud: f[1] === 'true',
      pattern: f[2] ? (f[2] as RuleName) : null,
    };
  });
}
