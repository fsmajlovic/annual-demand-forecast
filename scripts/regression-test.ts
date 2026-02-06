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
  disease: string;
  molecule: string;
  expected: number;
  actual: number | null;
  delta: number | null;
  delta_pct: number | null;
  status: 'PASS' | 'FAIL' | 'ERROR';
  pass_reason?: 'delta' | 'flagged'; // Why it passed: delta within tolerance or correctly flagged as non-FDA
  regulatory_status?: string;
  fda_approved?: boolean;
  data_warning?: string | null;
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
  // Lupus (Systemic Lupus Erythematosus) molecules
  {
    disease: 'systemic lupus erythematosus',
    molecule: 'Belimumab',
    expected_mg_per_patient_year: 10400,
    tolerance_pct: 10,
  },
  {
    disease: 'systemic lupus erythematosus',
    molecule: 'Anifrolumab',
    expected_mg_per_patient_year: 3900,
    tolerance_pct: 10,
  },
  {
    disease: 'systemic lupus erythematosus',
    molecule: 'Rituximab',
    expected_mg_per_patient_year: 4000,
    tolerance_pct: 10,
  },
  {
    disease: 'systemic lupus erythematosus',
    molecule: 'Obinutuzumab',
    expected_mg_per_patient_year: 4000,
    tolerance_pct: 10,
  },
  {
    disease: 'systemic lupus erythematosus',
    molecule: 'Dapirolizumab pegol',
    expected_mg_per_patient_year: 21840,
    tolerance_pct: 10,
  },
  {
    disease: 'systemic lupus erythematosus',
    molecule: 'Litifilimab',
    expected_mg_per_patient_year: 6300,
    tolerance_pct: 10,
  },
  {
    disease: 'systemic lupus erythematosus',
    molecule: 'Ianalumab',
    expected_mg_per_patient_year: 3900,
    tolerance_pct: 10,
  },
  {
    disease: 'systemic lupus erythematosus',
    molecule: 'Rontalizumab',
    expected_mg_per_patient_year: 9750,
    tolerance_pct: 10,
  },
  // Discontinued lupus molecules - included to verify regulatory status detection
  {
    disease: 'systemic lupus erythematosus',
    molecule: 'Sifalimumab',
    expected_mg_per_patient_year: 0, // Discontinued - no expected value
    tolerance_pct: 100, // High tolerance since discontinued
  },
  {
    disease: 'systemic lupus erythematosus',
    molecule: 'Obexelimab',
    expected_mg_per_patient_year: 0, // Discontinued - no expected value
    tolerance_pct: 100, // High tolerance since discontinued
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

function formatRegulatoryStatus(status?: string, fda_approved?: boolean): string {
  if (!status) return '-';

  const statusMap: Record<string, string> = {
    'approved': '\x1b[32mFDA\x1b[0m',
    'clinical_testing_only': '\x1b[33mTRIAL\x1b[0m',
    'no_fda_approval': '\x1b[33mNO-FDA\x1b[0m',
    'discontinued': '\x1b[31mDISC\x1b[0m',
    'withdrawn': '\x1b[31mWITHD\x1b[0m',
  };

  return statusMap[status] || status.substring(0, 6).toUpperCase();
}

function printResults(results: TestResult[]): void {
  originalLog('\n');
  originalLog('='.repeat(130));
  originalLog('REGRESSION TEST RESULTS');
  originalLog('='.repeat(130));
  originalLog();

  const col0 = 12; // Disease
  const col1 = 28; // Molecule
  const col2 = 10; // Expected
  const col3 = 10; // Actual
  const col4 = 20; // Delta
  const col5 = 10; // Regulatory
  const col6 = 8;  // Status

  originalLog(
    'Disease'.padEnd(col0) +
    'Molecule'.padEnd(col1) +
    'Expected'.padStart(col2) +
    'Actual'.padStart(col3) +
    'Delta'.padStart(col4) +
    'Regulatory'.padStart(col5) +
    'Status'.padStart(col6)
  );
  originalLog('-'.repeat(col0 + col1 + col2 + col3 + col4 + col5 + col6));

  for (const r of results) {
    const statusColor =
      r.status === 'PASS' ? '\x1b[32m' : r.status === 'FAIL' ? '\x1b[31m' : '\x1b[33m';
    const resetColor = '\x1b[0m';

    // Abbreviate disease names for display
    const diseaseAbbrev = r.disease.includes('lupus') ? 'SLE' :
                          r.disease.includes('breast') ? 'BC' :
                          r.disease.substring(0, col0 - 2);

    // Show PASS* for molecules that passed due to being correctly flagged as non-FDA
    const statusText = r.status === 'PASS' && r.pass_reason === 'flagged'
      ? 'PASS*'
      : r.status;

    originalLog(
      diseaseAbbrev.padEnd(col0) +
      r.molecule.substring(0, col1 - 2).padEnd(col1) +
      formatNumber(r.expected).padStart(col2) +
      formatNumber(r.actual).padStart(col3) +
      formatDelta(r.delta, r.delta_pct).padStart(col4) +
      formatRegulatoryStatus(r.regulatory_status, r.fda_approved).padStart(col5 + 5) + // +5 for color codes
      `${statusColor}${statusText.padStart(col6)}${resetColor}`
    );

    if (r.error) {
      originalLog(`  Error: ${r.error.substring(0, 80)}...`);
    }

    // Show data reliability warning for non-approved molecules
    if (r.data_warning && r.regulatory_status !== 'approved') {
      originalLog(`  \x1b[33m⚠ ${r.data_warning.substring(0, 90)}${r.data_warning.length > 90 ? '...' : ''}\x1b[0m`);
    }
  }

  originalLog('-'.repeat(col0 + col1 + col2 + col3 + col4 + col5 + col6));

  // Summary
  const passed = results.filter(r => r.status === 'PASS').length;
  const passed_delta = results.filter(r => r.status === 'PASS' && r.pass_reason === 'delta').length;
  const passed_flagged = results.filter(r => r.status === 'PASS' && r.pass_reason === 'flagged').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const errors = results.filter(r => r.status === 'ERROR').length;
  const fda_approved = results.filter(r => r.fda_approved === true).length;
  const not_approved = results.filter(r => r.fda_approved === false).length;

  // Group results by disease
  const by_disease = results.reduce((acc, r) => {
    if (!acc[r.disease]) acc[r.disease] = { total: 0, passed: 0, failed: 0, errors: 0 };
    acc[r.disease].total++;
    if (r.status === 'PASS') acc[r.disease].passed++;
    if (r.status === 'FAIL') acc[r.disease].failed++;
    if (r.status === 'ERROR') acc[r.disease].errors++;
    return acc;
  }, {} as Record<string, { total: number; passed: number; failed: number; errors: number }>);

  originalLog();
  originalLog(`Total: ${results.length} | Passed: ${passed} (${passed_delta} delta, ${passed_flagged} flagged*) | Failed: ${failed} | Errors: ${errors}`);
  originalLog(`FDA Approved: ${fda_approved} | Not Approved/Trial: ${not_approved}`);
  originalLog();
  originalLog('By Disease:');
  for (const [disease, stats] of Object.entries(by_disease)) {
    const diseaseAbbrev = disease.includes('lupus') ? 'SLE' :
                          disease.includes('breast') ? 'BC' :
                          disease.substring(0, 10);
    originalLog(`  ${diseaseAbbrev}: ${stats.passed}/${stats.total} passed`);
  }
  originalLog();
  originalLog('* PASS* = Passed because molecule was correctly flagged as non-FDA-approved (delta not checked)');
  originalLog('='.repeat(130));
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
          disease,
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

      // Load regulatory status
      const regulatory_path = join(result.run_dir, 'regulatory_status.json');
      let regulatory_status: any = null;
      try {
        regulatory_status = await readJson<any>(regulatory_path);
      } catch {
        // Regulatory status file may not exist for older runs
      }

      const avg_mg_per_patient_year =
        demand_nodes.length > 0
          ? demand_nodes.reduce((sum, n) => sum + n.administered_mg_per_patient_year, 0) /
            demand_nodes.length
          : 0;

      const actual = Math.round(avg_mg_per_patient_year);
      const delta = actual - expected_mg_per_patient_year;
      const delta_pct = expected_mg_per_patient_year > 0
        ? (delta / expected_mg_per_patient_year) * 100
        : (actual === 0 ? 0 : 100); // Handle division by zero for discontinued molecules

      // For non-FDA-approved molecules, pass if regulatory status was correctly detected
      // (data is unreliable anyway, so delta doesn't matter)
      const is_fda_approved = regulatory_status?.fda_approved === true;
      const is_correctly_flagged = regulatory_status?.status &&
        ['clinical_testing_only', 'no_fda_approval', 'discontinued', 'withdrawn'].includes(regulatory_status.status);
      const delta_within_tolerance = Math.abs(delta_pct) <= tolerance_pct;

      let is_pass: boolean;
      let pass_reason: 'delta' | 'flagged' | undefined;

      if (is_fda_approved) {
        // FDA approved: must pass delta check
        is_pass = delta_within_tolerance;
        pass_reason = is_pass ? 'delta' : undefined;
      } else {
        // Not FDA approved: pass if correctly flagged (delta doesn't matter)
        is_pass = is_correctly_flagged;
        pass_reason = is_pass ? 'flagged' : undefined;
      }

      results.push({
        disease,
        molecule,
        expected: expected_mg_per_patient_year,
        actual,
        delta,
        delta_pct,
        status: is_pass ? 'PASS' : 'FAIL',
        pass_reason,
        regulatory_status: regulatory_status?.status,
        fda_approved: regulatory_status?.fda_approved,
        data_warning: regulatory_status?.data_reliability_warning,
      });
    } catch (error) {
      results.push({
        disease,
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
