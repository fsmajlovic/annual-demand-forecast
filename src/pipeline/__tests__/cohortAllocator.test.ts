/**
 * Unit tests for the Cohort Allocation Engine
 *
 * Tests verify:
 * - No double counting
 * - Share validation
 * - Conservation checks
 * - Configuration behavior
 */

import { describe, it, expect } from 'vitest';
import {
  allocateCohorts,
  mapCohortsToNodes,
  CohortAllocationConfig,
  DEFAULT_ALLOCATION_CONFIG,
} from '../cohortAllocator.js';
import {
  validateRate,
  validateShares,
  validatePopulation,
  DEFAULT_VALIDATION_CONFIG,
} from '../validation.js';
import type { TreatmentMap, Assumptions, TreatmentNode } from '../../domain/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockTreatmentMap(nodes: Partial<TreatmentNode>[]): TreatmentMap {
  return {
    disease: 'test_disease',
    molecule: 'test_molecule',
    geo: 'US',
    map_version: 'test_v1',
    generated_at: new Date().toISOString(),
    nodes: nodes.map((n, i) => ({
      node_id: n.node_id || `node_${i}`,
      subtype_key: n.subtype_key || null,
      setting_key: n.setting_key || null,
      stage_key: n.stage_key || null,
      line_key: n.line_key || null,
      regimen_key: n.regimen_key || `regimen_${i}`,
      regimen_name_human: n.regimen_name_human || `Regimen ${i}`,
      molecule_role: n.molecule_role || 'backbone',
      route: n.route || 'IV',
      dose_schema: n.dose_schema || {
        type: 'fixed_mg',
        loading: null,
        maintenance: { value: 100, unit: 'mg' },
        interval_days: 21,
        notes: null,
      },
      duration_rule: n.duration_rule || 'fixed_months',
      duration_value: n.duration_value ?? 12,
      combination_partners: n.combination_partners || [],
      is_standard_of_care: n.is_standard_of_care ?? true,
      confidence: n.confidence ?? 0.9,
      citation_ids: n.citation_ids || [],
      notes: n.notes || null,
    })),
    evidence_index: [],
    exclusions: [],
  };
}

function createMockAssumptions(overrides: Partial<Assumptions> = {}): Assumptions {
  return {
    base_year: 2024,
    horizon_years: 10,
    avg_weight_kg: 70,
    vial_sizes: { IV: [{ size_mg: 100, is_single_dose: true }] },
    wastage_policy: { allow_multi_dose_sharing: false, discard_leftover: true },
    treated_rate: 0.85,
    prevalence: 1000000,
    incidence: 100000,
    ...overrides,
  };
}

// ============================================================================
// Validation Helper Tests
// ============================================================================

describe('Validation Helpers', () => {
  describe('validateRate', () => {
    it('accepts valid rates between 0 and 1', () => {
      expect(validateRate(0, 'test').valid).toBe(true);
      expect(validateRate(0.5, 'test').valid).toBe(true);
      expect(validateRate(1, 'test').valid).toBe(true);
    });

    it('rejects negative rates', () => {
      const result = validateRate(-0.1, 'test');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('test cannot be negative: -0.1');
    });

    it('rejects rates greater than 1', () => {
      const result = validateRate(1.5, 'test');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('test cannot exceed 1.0: 1.5');
    });

    it('rejects NaN', () => {
      const result = validateRate(NaN, 'test');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateShares', () => {
    const config = DEFAULT_VALIDATION_CONFIG;

    it('accepts shares that sum to 1.0', () => {
      const shares = { a: 0.4, b: 0.35, c: 0.25 };
      const { result } = validateShares(shares, 'test', config);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('renormalizes shares when sum != 1 and renormalization allowed', () => {
      // Sum = 1.1 (within max_renormalization_deviation of 0.15)
      const shares = { a: 0.55, b: 0.55 };
      const configWithRenorm = {
        ...config,
        allow_share_renormalization: true,
        max_renormalization_deviation: 0.15,
      };
      const { result, trace } = validateShares(shares, 'test', configWithRenorm);

      expect(result.valid).toBe(true);
      expect(trace.normalized).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);

      // Check normalized values
      const normalized = result.normalized_value as Record<string, number>;
      expect(normalized.a).toBeCloseTo(0.5, 2);
      expect(normalized.b).toBeCloseTo(0.5, 2);
    });

    it('rejects shares when sum != 1 and renormalization not allowed', () => {
      const shares = { a: 0.5, b: 0.5, c: 0.5 };
      const configNoRenorm = { ...config, allow_share_renormalization: false };
      const { result } = validateShares(shares, 'test', configNoRenorm);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('must sum to'))).toBe(true);
    });

    it('rejects shares with negative values', () => {
      const shares = { a: 0.5, b: -0.1 };
      const { result } = validateShares(shares, 'test', config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot be negative'))).toBe(true);
    });

    it('rejects shares with values > 1', () => {
      const shares = { a: 1.5, b: 0.5 };
      const { result } = validateShares(shares, 'test', config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot exceed'))).toBe(true);
    });

    it('rejects empty shares', () => {
      const { result } = validateShares({}, 'test', config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot be empty'))).toBe(true);
    });
  });

  describe('validatePopulation', () => {
    const config = { ...DEFAULT_VALIDATION_CONFIG, max_population: 350_000_000 };

    it('accepts valid populations', () => {
      expect(validatePopulation(1000000, 'test', config).valid).toBe(true);
    });

    it('rejects negative populations', () => {
      const result = validatePopulation(-1000, 'test', config);
      expect(result.valid).toBe(false);
    });

    it('rejects populations exceeding max', () => {
      const result = validatePopulation(500_000_000, 'test', config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds maximum'))).toBe(true);
    });

    it('warns for very large populations', () => {
      const result = validatePopulation(150_000_000, 'test', config);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Cohort Allocator Tests
// ============================================================================

describe('Cohort Allocator', () => {
  describe('No Double Counting', () => {
    it('allocates each patient exactly once across settings', () => {
      const treatment_map = createMockTreatmentMap([
        { node_id: 'n1', subtype_key: 'HER2+', setting_key: 'adjuvant', line_key: '1L', regimen_key: 'reg1' },
        { node_id: 'n2', subtype_key: 'HER2+', setting_key: 'neoadjuvant', line_key: '1L', regimen_key: 'reg1' },
        { node_id: 'n3', subtype_key: 'HER2+', setting_key: 'metastatic', line_key: '1L', regimen_key: 'reg1' },
      ]);

      const assumptions = createMockAssumptions({
        prevalence: 1000000,
        treated_rate: 1.0, // 100% for easy math
        subtype_shares: { 'HER2+': 1.0 },
        setting_shares: { adjuvant: 0.4, neoadjuvant: 0.25, metastatic: 0.35 },
        line_shares: { '1L': 1.0 },
      });

      const result = allocateCohorts(treatment_map, assumptions);

      // Total allocated should equal base_pool * treated_rate
      expect(result.total_allocated).toBeCloseTo(1000000, -2);
      expect(result.conservation_ratio).toBeCloseTo(1.0, 2);

      // Individual allocations should match shares
      const adjuvant_cohort = result.leaf_cohorts.find(c => c.path.setting_key === 'adjuvant');
      const neoadjuvant_cohort = result.leaf_cohorts.find(c => c.path.setting_key === 'neoadjuvant');
      const metastatic_cohort = result.leaf_cohorts.find(c => c.path.setting_key === 'metastatic');

      expect(adjuvant_cohort?.patients).toBeCloseTo(400000, -2);
      expect(neoadjuvant_cohort?.patients).toBeCloseTo(250000, -2);
      expect(metastatic_cohort?.patients).toBeCloseTo(350000, -2);
    });

    it('total allocation equals treated_pool when all shares sum to 1', () => {
      // Treatment map must cover ALL dimension combinations for conservation_ratio = 1.0
      const treatment_map = createMockTreatmentMap([
        { node_id: 'n1', subtype_key: 'A', setting_key: 's1', line_key: 'L1', regimen_key: 'r1' },
        { node_id: 'n2', subtype_key: 'A', setting_key: 's1', line_key: 'L1', regimen_key: 'r2' },
        { node_id: 'n3', subtype_key: 'A', setting_key: 's2', line_key: 'L1', regimen_key: 'r1' },
        { node_id: 'n4', subtype_key: 'B', setting_key: 's1', line_key: 'L1', regimen_key: 'r1' },
        { node_id: 'n5', subtype_key: 'B', setting_key: 's2', line_key: 'L1', regimen_key: 'r1' }, // Added to cover B|s2
      ]);

      const assumptions = createMockAssumptions({
        prevalence: 500000,
        treated_rate: 0.8,
        subtype_shares: { A: 0.6, B: 0.4 },
        setting_shares: { s1: 0.7, s2: 0.3 },
        line_shares: { L1: 1.0 },
      });

      const config: CohortAllocationConfig = {
        ...DEFAULT_ALLOCATION_CONFIG,
        regimen_shares: { r1: 0.6, r2: 0.4 },
      };

      const result = allocateCohorts(treatment_map, assumptions, config);

      const expected_treated_pool = 500000 * 0.8; // 400,000
      expect(result.treated_pool).toBe(expected_treated_pool);
      expect(result.conservation_ratio).toBeCloseTo(1.0, 2);
    });
  });

  describe('Share Validation', () => {
    it('throws when shares are invalid and renormalization disabled', () => {
      const treatment_map = createMockTreatmentMap([
        { node_id: 'n1', setting_key: 's1', regimen_key: 'r1' },
        { node_id: 'n2', setting_key: 's2', regimen_key: 'r1' },
      ]);

      const assumptions = createMockAssumptions({
        setting_shares: { s1: 0.8, s2: 0.8 }, // Sum = 1.6
      });

      const config: CohortAllocationConfig = {
        ...DEFAULT_ALLOCATION_CONFIG,
        allow_share_renormalization: false,
      };

      expect(() => allocateCohorts(treatment_map, assumptions, config)).toThrow(/must sum to/);
    });

    it('renormalizes shares when enabled and warns', () => {
      const treatment_map = createMockTreatmentMap([
        { node_id: 'n1', setting_key: 's1', regimen_key: 'r1' },
        { node_id: 'n2', setting_key: 's2', regimen_key: 'r1' },
      ]);

      const assumptions = createMockAssumptions({
        prevalence: 1000000,
        treated_rate: 1.0,
        // Shares sum to 1.1 (within renormalization threshold) - should be renormalized
        setting_shares: { s1: 0.55, s2: 0.55 },
      });

      const config: CohortAllocationConfig = {
        ...DEFAULT_ALLOCATION_CONFIG,
        allow_share_renormalization: true,
        max_renormalization_deviation: 0.15, // Allow renormalization within 15%
      };

      const result = allocateCohorts(treatment_map, assumptions, config);

      // Should conserve total after renormalization
      expect(result.conservation_ratio).toBeCloseTo(1.0, 2);
      expect(result.warnings.some(w => w.includes('renormalized'))).toBe(true);
    });
  });

  describe('Regimen Allocation', () => {
    it('throws when no regimen shares and equal split disabled', () => {
      const treatment_map = createMockTreatmentMap([
        { node_id: 'n1', setting_key: 's1', regimen_key: 'r1' },
        { node_id: 'n2', setting_key: 's1', regimen_key: 'r2' },
      ]);

      const assumptions = createMockAssumptions({
        setting_shares: { s1: 1.0 },
      });

      const config: CohortAllocationConfig = {
        ...DEFAULT_ALLOCATION_CONFIG,
        allow_equal_regimen_split: false,
        // No regimen_shares provided
      };

      expect(() => allocateCohorts(treatment_map, assumptions, config)).toThrow(/regimen_shares/);
    });

    it('uses equal split when allowed and no regimen shares provided', () => {
      const treatment_map = createMockTreatmentMap([
        { node_id: 'n1', setting_key: 's1', regimen_key: 'r1' },
        { node_id: 'n2', setting_key: 's1', regimen_key: 'r2' },
        { node_id: 'n3', setting_key: 's1', regimen_key: 'r3' },
      ]);

      const assumptions = createMockAssumptions({
        prevalence: 900000,
        treated_rate: 1.0,
        setting_shares: { s1: 1.0 },
      });

      const config: CohortAllocationConfig = {
        ...DEFAULT_ALLOCATION_CONFIG,
        allow_equal_regimen_split: true,
      };

      const result = allocateCohorts(treatment_map, assumptions, config);

      // Each regimen should get 1/3
      for (const cohort of result.leaf_cohorts) {
        expect(cohort.patients).toBeCloseTo(300000, -2);
      }
    });

    it('uses provided regimen shares when available', () => {
      const treatment_map = createMockTreatmentMap([
        { node_id: 'n1', setting_key: 's1', regimen_key: 'r1' },
        { node_id: 'n2', setting_key: 's1', regimen_key: 'r2' },
      ]);

      const assumptions = createMockAssumptions({
        prevalence: 1000000,
        treated_rate: 1.0,
        setting_shares: { s1: 1.0 },
      });

      const config: CohortAllocationConfig = {
        ...DEFAULT_ALLOCATION_CONFIG,
        regimen_shares: { r1: 0.7, r2: 0.3 },
      };

      const result = allocateCohorts(treatment_map, assumptions, config);

      const r1_cohort = result.leaf_cohorts.find(c => c.path.regimen_key === 'r1');
      const r2_cohort = result.leaf_cohorts.find(c => c.path.regimen_key === 'r2');

      expect(r1_cohort?.patients).toBeCloseTo(700000, -2);
      expect(r2_cohort?.patients).toBeCloseTo(300000, -2);
    });
  });

  describe('Explainability Trace', () => {
    it('includes trace for each allocation step', () => {
      const treatment_map = createMockTreatmentMap([
        { node_id: 'n1', subtype_key: 'A', setting_key: 's1', line_key: 'L1', regimen_key: 'r1' },
      ]);

      const assumptions = createMockAssumptions({
        prevalence: 1000000,
        treated_rate: 0.8,
        subtype_shares: { A: 0.5 },
        setting_shares: { s1: 0.4 },
        line_shares: { L1: 1.0 },
      });

      const result = allocateCohorts(treatment_map, assumptions);

      expect(result.leaf_cohorts).toHaveLength(1);
      const cohort = result.leaf_cohorts[0];

      // Trace should have steps for each dimension
      expect(cohort.trace.some(t => t.step === 'start')).toBe(true);
      expect(cohort.trace.some(t => t.step === 'subtype_allocation')).toBe(true);
      expect(cohort.trace.some(t => t.step === 'setting_allocation')).toBe(true);
      expect(cohort.trace.some(t => t.step === 'line_allocation')).toBe(true);
      expect(cohort.trace.some(t => t.step === 'regimen_allocation')).toBe(true);

      // Final population should be: 1M * 0.8 * 0.5 * 0.4 * 1.0 * 1.0 = 160,000
      expect(cohort.patients).toBeCloseTo(160000, -2);
    });

    it('records share traces for validation', () => {
      const treatment_map = createMockTreatmentMap([
        { node_id: 'n1', subtype_key: 'A', regimen_key: 'r1' },
      ]);

      const assumptions = createMockAssumptions({
        subtype_shares: { A: 1.0 },
      });

      const result = allocateCohorts(treatment_map, assumptions);

      expect(result.share_traces.subtype_shares).toBeDefined();
      expect(result.share_traces.subtype_shares?.original_shares).toEqual({ A: 1.0 });
    });
  });

  describe('Population Model Selection', () => {
    it('uses prevalence when population_model is prevalence_based', () => {
      const treatment_map = createMockTreatmentMap([
        { node_id: 'n1', regimen_key: 'r1' },
      ]);

      const assumptions = createMockAssumptions({
        prevalence: 500000,
        incidence: 50000,
      });

      const config: CohortAllocationConfig = {
        ...DEFAULT_ALLOCATION_CONFIG,
        population_model: 'prevalence_based',
      };

      const result = allocateCohorts(treatment_map, assumptions, config);

      expect(result.base_pool_source).toBe('prevalence');
      expect(result.base_pool).toBe(500000);
    });

    it('uses incidence when population_model is incidence_based', () => {
      const treatment_map = createMockTreatmentMap([
        { node_id: 'n1', regimen_key: 'r1' },
      ]);

      const assumptions = createMockAssumptions({
        prevalence: 500000,
        incidence: 50000,
      });

      const config: CohortAllocationConfig = {
        ...DEFAULT_ALLOCATION_CONFIG,
        population_model: 'incidence_based',
      };

      const result = allocateCohorts(treatment_map, assumptions, config);

      expect(result.base_pool_source).toBe('incidence');
      expect(result.base_pool).toBe(50000);
    });

    it('auto-selects prevalence when both available', () => {
      const treatment_map = createMockTreatmentMap([
        { node_id: 'n1', regimen_key: 'r1' },
      ]);

      const assumptions = createMockAssumptions({
        prevalence: 500000,
        incidence: 50000,
      });

      const config: CohortAllocationConfig = {
        ...DEFAULT_ALLOCATION_CONFIG,
        population_model: 'auto',
      };

      const result = allocateCohorts(treatment_map, assumptions, config);

      expect(result.base_pool_source).toBe('prevalence');
    });
  });
});

// ============================================================================
// Node Mapping Tests
// ============================================================================

describe('mapCohortsToNodes', () => {
  it('correctly maps cohorts to treatment nodes', () => {
    const treatment_map = createMockTreatmentMap([
      { node_id: 'node_A', subtype_key: 'A', setting_key: 's1', line_key: 'L1', regimen_key: 'r1' },
      { node_id: 'node_B', subtype_key: 'A', setting_key: 's1', line_key: 'L1', regimen_key: 'r2' },
    ]);

    const assumptions = createMockAssumptions({
      subtype_shares: { A: 1.0 },
      setting_shares: { s1: 1.0 },
      line_shares: { L1: 1.0 },
    });

    const result = allocateCohorts(treatment_map, assumptions);
    const mapping = mapCohortsToNodes(result.leaf_cohorts, treatment_map);

    expect(mapping.has('node_A')).toBe(true);
    expect(mapping.has('node_B')).toBe(true);
    expect(mapping.get('node_A')?.path.regimen_key).toBe('r1');
    expect(mapping.get('node_B')?.path.regimen_key).toBe('r2');
  });
});
