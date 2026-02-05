#!/usr/bin/env tsx
/**
 * Regression Test Suite for Demand Calculations
 *
 * Runs the pipeline for a set of molecules and compares results against
 * manually validated expected values. This helps catch regressions when
 * making fixes to the calculation logic.
 *
 * Usage:
 *   pnpm test:regression              # Uses cache (fast, no API costs)
 *   pnpm test:regression -- --no-cache  # Fresh API calls (slow, costs $)
 */

import { join } from 'path';

// Parse command line arguments
const args = process.argv.slice(2);
const noCache = args.includes('--no-cache') || args.includes('-nc');

// Set environment BEFORE any other imports
import dotenv from 'dotenv';
dotenv.config();
process.env.LOG_LEVEL = 'silent';

// Suppress console.log during pipeline runs
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
let suppressLogs = true; // Start suppressed

console.log = (...args: any[]) => {
  if (!suppressLogs) originalLog(...args);
};
console.warn = (...args: any[]) => {
  if (!suppressLogs) originalWarn(...args);
};
console.error = (...args: any[]) => {
  if (!suppressLogs) originalError(...args);
};

interface TestCase {
  disease: string;
  molecule: string;
  expected_mg_per_patient_year: number;
  tolerance_pct: number;
}

interface TestResult {
  molecule: string;
  expected: number;
  actual: number | null;
  delta: number | null;
  delta_pct: number | null;
  status: 'PASS' | 'FAIL' | 'ERROR';
  error?: string;
}

// Test cases with manually validated expected values
const TEST_CASES: TestCase[] = [
  {
    disease: 'breast cancer',
    molecule: 'Trastuzumab',
    expected_mg_per_patient_year: 7420,
    tolerance_pct: 10,
  },
  {
    disease: 'breast cancer',
    molecule: 'Pertuzumab',
    expected_mg_per_patient_year: 7560,
    tolerance_pct: 10,
  },
  {
    disease: 'breast cancer',
    molecule: 'Ado-trastuzumab emtansine',
    expected_mg_per_patient_year: 4284,
    tolerance_pct: 10,
  },
  {
    disease: 'breast cancer',
    molecule: 'Trastuzumab deruxtecan',
    expected_mg_per_patient_year: 6426,
    tolerance_pct: 10,
  },
  {
    disease: 'breast cancer',
    molecule: 'Margetuximab',
    expected_mg_per_patient_year: 17850,
    tolerance_pct: 10,
  },
  {
    disease: 'breast cancer',
    molecule: 'Pembrolizumab',
    expected_mg_per_patient_year: 3400,
    tolerance_pct: 10,
  },
  {
    disease: 'breast cancer',
    molecule: 'Sacituzumab govitecan',
    expected_mg_per_patient_year: 23800,
    tolerance_pct: 10,
  },
  {
    disease: 'breast cancer',
    molecule: 'Nivolumab',
    expected_mg_per_patient_year: 5460,
    tolerance_pct: 10,
  },
  {
    disease: 'breast cancer',
    molecule: 'Camrelizumab',
    expected_mg_per_patient_year: 5200,
    tolerance_pct: 10,
  },
  {
    disease: 'breast cancer',
    molecule: 'Adecatumumab',
    expected_mg_per_patient_year: 10920,
    tolerance_pct: 10,
  },
];

function formatNumber(n: number | null): string {
  if (n === null) return '-';
  return n.toLocaleString();
}

function formatDelta(delta: number | null, delta_pct: number | null): string {
  if (delta === null || delta_pct === null) return '-';
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${formatNumber(delta)} (${sign}${delta_pct.toFixed(1)}%)`;
}

function printResults(results: TestResult[]): void {
  originalLog('\n');
  originalLog('='.repeat(100));
  originalLog('REGRESSION TEST RESULTS');
  originalLog('='.repeat(100));
  originalLog();

  const col1 = 30;
  const col2 = 12;
  const col3 = 12;
  const col4 = 22;
  const col5 = 8;

  originalLog(
    'Molecule'.padEnd(col1) +
    'Expected'.padStart(col2) +
    'Actual'.padStart(col3) +
    'Delta'.padStart(col4) +
    'Status'.padStart(col5)
  );
  originalLog('-'.repeat(col1 + col2 + col3 + col4 + col5));

  for (const r of results) {
    const statusColor =
      r.status === 'PASS' ? '\x1b[32m' : r.status === 'FAIL' ? '\x1b[31m' : '\x1b[33m';
    const resetColor = '\x1b[0m';

    originalLog(
      r.molecule.padEnd(col1) +
      formatNumber(r.expected).padStart(col2) +
      formatNumber(r.actual).padStart(col3) +
      formatDelta(r.delta, r.delta_pct).padStart(col4) +
      `${statusColor}${r.status.padStart(col5)}${resetColor}`
    );

    if (r.error) {
      originalLog(`  Error: ${r.error.substring(0, 80)}...`);
    }
  }

  originalLog('-'.repeat(col1 + col2 + col3 + col4 + col5));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const errors = results.filter(r => r.status === 'ERROR').length;

  originalLog();
  originalLog(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed} | Errors: ${errors}`);
  originalLog('='.repeat(100));
  originalLog();
}

async function main(): Promise<void> {
  originalLog('='.repeat(100));
  originalLog('DEMAND CALCULATION REGRESSION TEST SUITE');
  originalLog('='.repeat(100));
  originalLog(`Running ${TEST_CASES.length} test cases...`);
  if (noCache) {
    originalLog('Cache DISABLED - making fresh API calls');
  }
  originalLog();

  // Dynamic import AFTER setting LOG_LEVEL
  const { runPipeline } = await import('../src/pipeline/run.js');
  const { readJson } = await import('../src/utils/io.js');

  const results: TestResult[] = [];

  for (const testCase of TEST_CASES) {
    const { disease, molecule, expected_mg_per_patient_year, tolerance_pct } = testCase;

    originalLog(`  Running: ${molecule}...`);

    try {
      const result = await runPipeline({
        disease,
        molecule,
        geo: 'US',
        baseYear: 2024,
        horizonYears: 10,
        disableCache: noCache,
      });

      if (!result.success) {
        results.push({
          molecule,
          expected: expected_mg_per_patient_year,
          actual: null,
          delta: null,
          delta_pct: null,
          status: 'ERROR',
          error: result.error,
        });
        continue;
      }

      const demand_path = join(result.run_dir, 'demand_2024_nodes.json');
      const demand_nodes = await readJson<any[]>(demand_path);

      const avg_mg_per_patient_year =
        demand_nodes.length > 0
          ? demand_nodes.reduce((sum, n) => sum + n.administered_mg_per_patient_year, 0) /
            demand_nodes.length
          : 0;

      const actual = Math.round(avg_mg_per_patient_year);
      const delta = actual - expected_mg_per_patient_year;
      const delta_pct = (delta / expected_mg_per_patient_year) * 100;
      const is_pass = Math.abs(delta_pct) <= tolerance_pct;

      results.push({
        molecule,
        expected: expected_mg_per_patient_year,
        actual,
        delta,
        delta_pct,
        status: is_pass ? 'PASS' : 'FAIL',
      });
    } catch (error) {
      results.push({
        molecule,
        expected: expected_mg_per_patient_year,
        actual: null,
        delta: null,
        delta_pct: null,
        status: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Re-enable logs for results
  suppressLogs = false;
  printResults(results);

  const has_failures = results.some(r => r.status !== 'PASS');
  process.exit(has_failures ? 1 : 0);
}

main().catch((error) => {
  originalError('Regression test suite failed:', error);
  process.exit(1);
});
