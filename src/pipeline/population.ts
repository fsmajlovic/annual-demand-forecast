/**
 * Stage 2: Population allocation (deterministic)
 *
 * Uses the Cohort Allocation Engine to prevent double counting.
 * Each patient is allocated exactly once through the dimension hierarchy.
 */

import { createLogger } from '../utils/log.js';
import {
  allocateCohorts,
  mapCohortsToNodes,
  CohortAllocationConfig,
  DEFAULT_ALLOCATION_CONFIG,
  LeafCohort,
} from './cohortAllocator.js';
import type {
  TreatmentMap,
  Assumptions,
  PopulationAllocation,
  PopulationNode,
} from '../domain/types.js';

const logger = createLogger('population');

export interface PopulationAllocationOptions {
  /** Configuration for the cohort allocator */
  allocation_config?: Partial<CohortAllocationConfig>;
}

export interface PopulationAllocationWithTrace extends PopulationAllocation {
  /** Allocation metadata for explainability */
  allocation_trace: {
    base_pool: number;
    base_pool_source: 'prevalence' | 'incidence';
    treated_pool: number;
    conservation_ratio: number;
    warnings: string[];
  };
  /** Per-node allocation traces */
  node_traces: Map<string, LeafCohort['trace']>;
}

export function allocatePopulation(
  treatment_map: TreatmentMap,
  assumptions: Assumptions,
  options: PopulationAllocationOptions = {}
): PopulationAllocationWithTrace {
  logger.info({ base_year: assumptions.base_year }, 'Allocating population to treatment nodes');

  // Build allocation config
  const allocation_config: CohortAllocationConfig = {
    ...DEFAULT_ALLOCATION_CONFIG,
    ...options.allocation_config,
  };

  // Run cohort allocation (single-pass, no double counting)
  const allocation_result = allocateCohorts(treatment_map, assumptions, allocation_config);

  // Map cohorts to treatment nodes
  const node_to_cohort = mapCohortsToNodes(allocation_result.leaf_cohorts, treatment_map);

  // Build population nodes
  const nodes: PopulationNode[] = [];
  const node_traces = new Map<string, LeafCohort['trace']>();
  const rollup_by_subtype: Record<string, number> = {};
  const rollup_by_setting: Record<string, number> = {};
  const rollup_by_line: Record<string, number> = {};

  for (const treatment_node of treatment_map.nodes) {
    const cohort = node_to_cohort.get(treatment_node.node_id);

    if (cohort) {
      nodes.push({
        node_id: treatment_node.node_id,
        eligible_patients: Math.round(cohort.patients),
        treated_patients: Math.round(cohort.patients),
        patient_years: Math.round(cohort.patient_years * 100) / 100, // 2 decimal places for patient-years
      });

      // Store trace for explainability
      node_traces.set(treatment_node.node_id, cohort.trace);

      // Rollups
      if (treatment_node.subtype_key) {
        rollup_by_subtype[treatment_node.subtype_key] =
          (rollup_by_subtype[treatment_node.subtype_key] || 0) + cohort.patients;
      }
      if (treatment_node.setting_key) {
        rollup_by_setting[treatment_node.setting_key] =
          (rollup_by_setting[treatment_node.setting_key] || 0) + cohort.patients;
      }
      if (treatment_node.line_key) {
        rollup_by_line[treatment_node.line_key] =
          (rollup_by_line[treatment_node.line_key] || 0) + cohort.patients;
      }
    } else {
      // No matching cohort - node gets 0 patients
      logger.warn({ node_id: treatment_node.node_id },
        'No matching cohort found - node will have 0 patients');
      nodes.push({
        node_id: treatment_node.node_id,
        eligible_patients: 0,
        treated_patients: 0,
        patient_years: 0,
      });
    }
  }

  // Log warnings from allocation
  for (const warning of allocation_result.warnings) {
    logger.warn(warning);
  }

  // Conservation check
  const total_treated = nodes.reduce((sum, n) => sum + n.treated_patients, 0);
  const total_patient_years = nodes.reduce((sum, n) => sum + n.patient_years, 0);

  logger.info({
    total_nodes: nodes.length,
    total_treated_patients: Math.round(total_treated),
    total_patient_years: Math.round(total_patient_years),
    conservation_ratio: allocation_result.conservation_ratio.toFixed(4),
    base_pool: allocation_result.base_pool,
    base_pool_source: allocation_result.base_pool_source,
  }, 'Population allocation completed');

  return {
    base_year: assumptions.base_year,
    disease: treatment_map.disease,
    molecule: treatment_map.molecule,
    total_incidence: assumptions.incidence,
    total_prevalence: assumptions.prevalence,
    nodes,
    rollups: {
      by_subtype: rollup_by_subtype,
      by_setting: rollup_by_setting,
      by_line: rollup_by_line,
    },
    allocation_trace: {
      base_pool: allocation_result.base_pool,
      base_pool_source: allocation_result.base_pool_source,
      treated_pool: allocation_result.treated_pool,
      conservation_ratio: allocation_result.conservation_ratio,
      warnings: allocation_result.warnings,
    },
    node_traces,
  };
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use allocatePopulation with options instead
 */
export function allocatePopulationLegacy(
  treatment_map: TreatmentMap,
  assumptions: Assumptions
): PopulationAllocation {
  const result = allocatePopulation(treatment_map, assumptions);
  // Return without the extended fields
  return {
    base_year: result.base_year,
    disease: result.disease,
    molecule: result.molecule,
    total_incidence: result.total_incidence,
    total_prevalence: result.total_prevalence,
    nodes: result.nodes,
    rollups: result.rollups,
  };
}
