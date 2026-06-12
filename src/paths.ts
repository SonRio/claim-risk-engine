/** Centralized file locations, resolved relative to the repo root (parent of src/). */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // .../src
export const ROOT = resolve(here, '..');

export const PATHS = {
  claims: resolve(ROOT, 'data/claims.csv'),
  groundTruth: resolve(ROOT, 'data/ground-truth.csv'),
  scoredOutput: resolve(ROOT, 'data/scored-output.json'),
  metricsReport: resolve(ROOT, 'reports/metrics.md'),
  dashboardTemplate: resolve(ROOT, 'public/dashboard.template.html'),
  dashboardOut: resolve(ROOT, 'dashboard.html'),
};
