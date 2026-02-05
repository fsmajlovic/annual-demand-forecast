/**
 * Cohort Allocation Engine
 *
 * Implements single-pass hierarchical allocation to prevent double counting.
 * A patient can only be allocated ONCE per dimension path.
 *
 * Allocation tree:
 *   treated_pool
 *     -> subtype allocation
 *       -> setting allocation
 *         -> line allocation
 *           -> regimen allocation (leaf nodes)
 */

import { createLogger } from '../utils/log.js';
import {
  ValidationConfig,
  DEFAULT_VALIDATION_CONFIG,
  validateRate,
  validateShares,
  validatePopulation,
  throwIfInvalid,
  ShareValidationTrace,
} from './validation.js';
import type { TreatmentMap, Assumptions } from '../domain/types.js';

const logger = createLogger('cohort-allocator');

// ============================================================================
// Types
// ============================================================================

export interface CohortAllocationConfig extends ValidationConfig {
  /** How to select base population */
  population_model: 'prevalence_based' | 'incidence_based' | 'auto';
  /** Regimen shares by regimen_key (optional) */
  regimen_shares?: Record<string, number>;
}

export const DEFAULT_ALLOCATION_CONFIG: CohortAllocationConfig = {
  ...DEFAULT_VALIDATION_CONFIG,
  population_model: 'auto',
};

export interface AllocationTrace {
  step: string;
  input_population: number;
  share_applied?: number;
  share_key?: string;
  output_population: number;
  normalized?: boolean;
  note?: string;
}

export interface LeafCohort {
  /** Unique path identifier */
  cohort_id: string;
  /** Dimension path that defines this cohort */
  path: {
    subtype_key: string | null;
    setting_key: string | null;
    line_key: string | null;
    regimen_key: string;
  };
  /** Number of patients in this cohort */
  patients: number;
  /** Patient-years (patients * time_on_treatment) */
  patient_years: number;
  /** Full trace of how this allocation was computed */
  trace: AllocationTrace[];
}

export interface CohortAllocationResult {
  /** Total base population used */
  base_pool: number;
  /** Source of base population */
  base_pool_source: 'prevalence' | 'incidence';
  /** Treated population after applying treated_rate */
  treated_pool: number;
  /** All leaf cohorts (no double counting guaranteed) */
  leaf_cohorts: LeafCohort[];
  /** Sum of all leaf cohort patients (should equal treated_pool within tolerance) */
  total_allocated: number;
  /** Validation traces for shares */
  share_traces: {
    subtype_shares?: ShareValidationTrace;
    setting_shares?: ShareValidationTrace;
    line_shares?: ShareValidationTrace;
    regimen_shares?: ShareValidationTrace;
  };
  /** Conservation check: total_allocated / treated_pool */
  conservation_ratio: number;
  /** Warnings generated during allocation */
  warnings: string[];
}

// ============================================================================
// Main Allocation Function
// ============================================================================

export function allocateCohorts(
  treatment_map: TreatmentMap,
  assumptions: Assumptions,
  config: CohortAllocationConfig = DEFAULT_ALLOCATION_CONFIG
): CohortAllocationResult {
  logger.info({ disease: treatment_map.disease, molecule: treatment_map.molecule },
    'Starting cohort allocation');

  const warnings: string[] = [];
  const share_traces: CohortAllocationResult['share_traces'] = {};

  // -------------------------------------------------------------------------
  // Step 1: Determine base population
  // -------------------------------------------------------------------------
  let base_pool: number;
  let base_pool_source: 'prevalence' | 'incidence';

  if (config.population_model === 'prevalence_based') {
    base_pool = assumptions.prevalence || 0;
    base_pool_source = 'prevalence';
    if (!assumptions.prevalence) {
      warnings.push('prevalence_based model selected but no prevalence provided');
    }
  } else if (config.population_model === 'incidence_based') {
    base_pool = assumptions.incidence || 0;
    base_pool_source = 'incidence';
    if (!assumptions.incidence) {
      warnings.push('incidence_based model selected but no incidence provided');
    }
  } else {
    // Auto: prefer prevalence for chronic conditions, incidence for acute
    // For now, use prevalence if available, else incidence
    if (assumptions.prevalence && assumptions.prevalence > 0) {
      base_pool = assumptions.prevalence;
      base_pool_source = 'prevalence';
    } else if (assumptions.incidence && assumptions.incidence > 0) {
      base_pool = assumptions.incidence;
      base_pool_source = 'incidence';
    } else {
      base_pool = 0;
      base_pool_source = 'prevalence';
      warnings.push('No prevalence or incidence provided - base_pool is 0');
    }
  }

  // Validate base population
  const pop_validation = validatePopulation(base_pool, 'base_pool', config);
  throwIfInvalid(pop_validation, 'base_pool');
  warnings.push(...pop_validation.warnings);

  logger.info({ base_pool, base_pool_source }, 'Base population determined');

  // -------------------------------------------------------------------------
  // Step 2: Apply treated rate
  // -------------------------------------------------------------------------
  const treated_rate = assumptions.treated_rate ?? 1.0;
  const rate_validation = validateRate(treated_rate, 'treated_rate');
  throwIfInvalid(rate_validation, 'treated_rate');

  const treated_pool = base_pool * treated_rate;
  logger.info({ treated_rate, treated_pool }, 'Treated pool calculated');

  // -------------------------------------------------------------------------
  // Step 3: Extract unique dimension values from treatment map
  // -------------------------------------------------------------------------
  const unique_subtypes = new Set<string>();
  const unique_settings = new Set<string>();
  const unique_lines = new Set<string>();
  const regimens_by_path = new Map<string, string[]>();

  for (const node of treatment_map.nodes) {
    if (node.subtype_key) unique_subtypes.add(node.subtype_key);
    if (node.setting_key) unique_settings.add(node.setting_key);
    if (node.line_key) unique_lines.add(node.line_key);

    // Track regimens for each path
    const pathKey = `${node.subtype_key || '_'}|${node.setting_key || '_'}|${node.line_key || '_'}`;
    if (!regimens_by_path.has(pathKey)) {
      regimens_by_path.set(pathKey, []);
    }
    regimens_by_path.get(pathKey)!.push(node.regimen_key);
  }

  // -------------------------------------------------------------------------
  // Step 4: Validate and normalize shares
  // -------------------------------------------------------------------------

  // Subtype shares
  let normalized_subtype_shares: Record<string, number> = {};
  if (unique_subtypes.size > 0 && assumptions.subtype_shares) {
    const { result, trace } = validateShares(
      filterSharesForDimension(assumptions.subtype_shares, unique_subtypes),
      'subtype_shares',
      config
    );
    throwIfInvalid(result, 'subtype_shares');
    warnings.push(...result.warnings);
    share_traces.subtype_shares = trace;
    normalized_subtype_shares = (result.normalized_value as Record<string, number>) || {};
  } else if (unique_subtypes.size > 0) {
    // No subtype shares provided but treatment map has subtypes
    // Create equal shares with warning
    const equal_share = 1.0 / unique_subtypes.size;
    for (const subtype of unique_subtypes) {
      normalized_subtype_shares[subtype] = equal_share;
    }
    warnings.push(`No subtype_shares provided. Using equal distribution: ${equal_share.toFixed(4)} each.`);
  }

  // Setting/stage shares
  let normalized_setting_shares: Record<string, number> = {};
  const raw_setting_shares = assumptions.setting_shares || assumptions.stage_shares;
  if (unique_settings.size > 0 && raw_setting_shares) {
    const { result, trace } = validateShares(
      filterSharesForDimension(raw_setting_shares, unique_settings),
      'setting_shares',
      config
    );
    throwIfInvalid(result, 'setting_shares');
    warnings.push(...result.warnings);
    share_traces.setting_shares = trace;
    normalized_setting_shares = (result.normalized_value as Record<string, number>) || {};
  } else if (unique_settings.size > 0) {
    const equal_share = 1.0 / unique_settings.size;
    for (const setting of unique_settings) {
      normalized_setting_shares[setting] = equal_share;
    }
    warnings.push(`No setting_shares provided. Using equal distribution: ${equal_share.toFixed(4)} each.`);
  }

  // Line shares
  let normalized_line_shares: Record<string, number> = {};
  if (unique_lines.size > 0 && assumptions.line_shares) {
    const { result, trace } = validateShares(
      filterSharesForDimension(assumptions.line_shares, unique_lines),
      'line_shares',
      config
    );
    throwIfInvalid(result, 'line_shares');
    warnings.push(...result.warnings);
    share_traces.line_shares = trace;
    normalized_line_shares = (result.normalized_value as Record<string, number>) || {};
  } else if (unique_lines.size > 0) {
    const equal_share = 1.0 / unique_lines.size;
    for (const line of unique_lines) {
      normalized_line_shares[line] = equal_share;
    }
    warnings.push(`No line_shares provided. Using equal distribution: ${equal_share.toFixed(4)} each.`);
  }

  // -------------------------------------------------------------------------
  // Step 5: Hierarchical allocation (single pass, no double counting)
  // -------------------------------------------------------------------------
  const leaf_cohorts: LeafCohort[] = [];

  // Build paths from treatment nodes
  const unique_paths = new Map<string, {
    subtype_key: string | null;
    setting_key: string | null;
    line_key: string | null;
    regimen_keys: string[];
  }>();

  for (const node of treatment_map.nodes) {
    const pathKey = buildPathKey(node.subtype_key, node.setting_key, node.line_key);
    if (!unique_paths.has(pathKey)) {
      unique_paths.set(pathKey, {
        subtype_key: node.subtype_key,
        setting_key: node.setting_key,
        line_key: node.line_key,
        regimen_keys: [],
      });
    }
    const path = unique_paths.get(pathKey)!;
    if (!path.regimen_keys.includes(node.regimen_key)) {
      path.regimen_keys.push(node.regimen_key);
    }
  }

  // Allocate through each unique path
  for (const [pathKey, pathInfo] of unique_paths) {
    const trace: AllocationTrace[] = [];
    let current_population = treated_pool;

    trace.push({
      step: 'start',
      input_population: base_pool,
      share_applied: treated_rate,
      share_key: 'treated_rate',
      output_population: treated_pool,
    });

    // Apply subtype share
    if (pathInfo.subtype_key && normalized_subtype_shares[pathInfo.subtype_key] !== undefined) {
      const share = normalized_subtype_shares[pathInfo.subtype_key];
      const new_population = current_population * share;
      trace.push({
        step: 'subtype_allocation',
        input_population: current_population,
        share_applied: share,
        share_key: pathInfo.subtype_key,
        output_population: new_population,
        normalized: share_traces.subtype_shares?.normalized,
      });
      current_population = new_population;
    } else if (unique_subtypes.size > 0) {
      // Node doesn't have subtype but others do - this is a configuration issue
      logger.warn({ pathKey, subtype_key: pathInfo.subtype_key },
        'Path missing subtype_key but treatment map has subtypes');
    }

    // Apply setting share
    if (pathInfo.setting_key && normalized_setting_shares[pathInfo.setting_key] !== undefined) {
      const share = normalized_setting_shares[pathInfo.setting_key];
      const new_population = current_population * share;
      trace.push({
        step: 'setting_allocation',
        input_population: current_population,
        share_applied: share,
        share_key: pathInfo.setting_key,
        output_population: new_population,
        normalized: share_traces.setting_shares?.normalized,
      });
      current_population = new_population;
    }

    // Apply line share
    if (pathInfo.line_key && normalized_line_shares[pathInfo.line_key] !== undefined) {
      const share = normalized_line_shares[pathInfo.line_key];
      const new_population = current_population * share;
      trace.push({
        step: 'line_allocation',
        input_population: current_population,
        share_applied: share,
        share_key: pathInfo.line_key,
        output_population: new_population,
        normalized: share_traces.line_shares?.normalized,
      });
      current_population = new_population;
    }

    // Allocate across regimens at this path
    const regimens = pathInfo.regimen_keys;
    const regimen_shares = config.regimen_shares || {};

    // Check if we have regimen shares for this path
    const has_regimen_shares = regimens.some(r => regimen_shares[r] !== undefined);

    if (!has_regimen_shares && !config.allow_equal_regimen_split) {
      throw new Error(
        `No regimen_shares provided for path [${pathKey}] and allow_equal_regimen_split=false. ` +
        `Please provide regimen market shares or set allow_equal_regimen_split=true.`
      );
    }

    // Build regimen shares for this path
    let path_regimen_shares: Record<string, number> = {};
    if (has_regimen_shares) {
      // Use provided shares for regimens that exist at this path
      for (const regimen of regimens) {
        path_regimen_shares[regimen] = regimen_shares[regimen] || 0;
      }

      // Renormalize path-specific shares to sum to 1.0
      // (e.g., if path only has r1 but global shares say r1:0.6, r2:0.4 -> r1 gets 100% at this path)
      const path_sum = Object.values(path_regimen_shares).reduce((a, b) => a + b, 0);
      if (path_sum > 0 && Math.abs(path_sum - 1.0) > 0.001) {
        for (const regimen of regimens) {
          path_regimen_shares[regimen] = (path_regimen_shares[regimen] || 0) / path_sum;
        }
        trace.push({
          step: 'regimen_renormalization',
          input_population: current_population,
          output_population: current_population,
          note: `Renormalized regimen shares from sum=${path_sum.toFixed(4)} to 1.0 for path [${pathKey}]`,
        });
      }
    } else {
      // Equal split (already verified config allows this)
      const equal_share = 1.0 / regimens.length;
      for (const regimen of regimens) {
        path_regimen_shares[regimen] = equal_share;
      }
      trace.push({
        step: 'regimen_equal_split',
        input_population: current_population,
        output_population: current_population,
        note: `Equal split across ${regimens.length} regimens (${equal_share.toFixed(4)} each)`,
      });
    }

    // Create leaf cohorts for each regimen
    for (const regimen of regimens) {
      const regimen_share = path_regimen_shares[regimen] || 0;
      const regimen_population = current_population * regimen_share;

      const regimen_trace = [...trace];
      regimen_trace.push({
        step: 'regimen_allocation',
        input_population: current_population,
        share_applied: regimen_share,
        share_key: regimen,
        output_population: regimen_population,
      });

      // Calculate patient-years
      let patient_years = regimen_population;
      if (pathInfo.line_key && assumptions.time_on_treatment_months?.[pathInfo.line_key]) {
        const tot_months = assumptions.time_on_treatment_months[pathInfo.line_key];
        patient_years = regimen_population * (tot_months / 12);
        regimen_trace.push({
          step: 'patient_years_calculation',
          input_population: regimen_population,
          share_applied: tot_months / 12,
          share_key: `ToT_${pathInfo.line_key}`,
          output_population: patient_years,
          note: `${tot_months} months on treatment`,
        });
      }

      leaf_cohorts.push({
        cohort_id: buildCohortId(pathInfo.subtype_key, pathInfo.setting_key, pathInfo.line_key, regimen),
        path: {
          subtype_key: pathInfo.subtype_key,
          setting_key: pathInfo.setting_key,
          line_key: pathInfo.line_key,
          regimen_key: regimen,
        },
        patients: regimen_population,
        patient_years,
        trace: regimen_trace,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: Verify conservation (no double counting)
  // -------------------------------------------------------------------------
  const total_allocated = leaf_cohorts.reduce((sum, c) => sum + c.patients, 0);
  const conservation_ratio = treated_pool > 0 ? total_allocated / treated_pool : 1.0;

  // Conservation check
  if (Math.abs(conservation_ratio - 1.0) > config.share_sum_tolerance) {
    warnings.push(
      `Conservation check: total allocated (${total_allocated.toFixed(0)}) differs from ` +
      `treated pool (${treated_pool.toFixed(0)}) by ${((conservation_ratio - 1) * 100).toFixed(2)}%`
    );
  }

  logger.info({
    base_pool,
    treated_pool,
    total_allocated,
    conservation_ratio,
    leaf_cohort_count: leaf_cohorts.length,
  }, 'Cohort allocation completed');

  return {
    base_pool,
    base_pool_source,
    treated_pool,
    leaf_cohorts,
    total_allocated,
    share_traces,
    conservation_ratio,
    warnings,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildPathKey(
  subtype_key: string | null,
  setting_key: string | null,
  line_key: string | null
): string {
  return `${subtype_key || '_'}|${setting_key || '_'}|${line_key || '_'}`;
}

function buildCohortId(
  subtype_key: string | null,
  setting_key: string | null,
  line_key: string | null,
  regimen_key: string
): string {
  const parts = [];
  if (subtype_key) parts.push(subtype_key);
  if (setting_key) parts.push(setting_key);
  if (line_key) parts.push(line_key);
  parts.push(regimen_key);
  return parts.join('_');
}

/**
 * Filter shares to only include keys present in the dimension
 * This handles cases where assumptions have more shares than treatment nodes use
 */
function filterSharesForDimension(
  shares: Record<string, number>,
  dimension_keys: Set<string>
): Record<string, number> {
  const filtered: Record<string, number> = {};
  for (const key of dimension_keys) {
    if (shares[key] !== undefined) {
      filtered[key] = shares[key];
    }
  }
  return filtered;
}

/**
 * Map leaf cohorts to treatment nodes
 */
export function mapCohortsToNodes(
  leaf_cohorts: LeafCohort[],
  treatment_map: TreatmentMap
): Map<string, LeafCohort> {
  const node_to_cohort = new Map<string, LeafCohort>();

  for (const node of treatment_map.nodes) {
    // Find matching cohort by path
    const matching_cohort = leaf_cohorts.find(
      (cohort) =>
        cohort.path.subtype_key === node.subtype_key &&
        cohort.path.setting_key === node.setting_key &&
        cohort.path.line_key === node.line_key &&
        cohort.path.regimen_key === node.regimen_key
    );

    if (matching_cohort) {
      node_to_cohort.set(node.node_id, matching_cohort);
    } else {
      logger.warn({ node_id: node.node_id }, 'No matching cohort found for treatment node');
    }
  }

  return node_to_cohort;
}
