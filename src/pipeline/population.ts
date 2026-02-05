/**
 * Stage 2: Population allocation (deterministic)
 */

import { createLogger } from '../utils/log.js';
import type {
  TreatmentMap,
  Assumptions,
  PopulationAllocation,
  PopulationNode,
} from '../domain/types.js';

const logger = createLogger('population');

export function allocatePopulation(
  treatment_map: TreatmentMap,
  assumptions: Assumptions
): PopulationAllocation {
  logger.info({ base_year: assumptions.base_year }, 'Allocating population to treatment nodes');

  // Use prevalence if available, otherwise incidence
  const base_pool = assumptions.prevalence || assumptions.incidence || 0;

  if (base_pool === 0) {
    logger.warn('No base population (incidence or prevalence) provided - using placeholder');
  }

  const nodes: PopulationNode[] = [];
  const rollup_by_subtype: Record<string, number> = {};
  const rollup_by_setting: Record<string, number> = {};
  const rollup_by_line: Record<string, number> = {};

  for (const node of treatment_map.nodes) {
    // Start with base pool
    let node_population = base_pool;

    // Apply treated rate
    node_population *= assumptions.treated_rate;

    // Apply subtype share
    if (node.subtype_key && assumptions.subtype_shares) {
      const subtype_share = assumptions.subtype_shares[node.subtype_key] || 0;
      node_population *= subtype_share;
    }

    // Apply setting/stage share (try setting_shares first, then stage_shares as fallback)
    if (node.setting_key) {
      const shares = assumptions.setting_shares || assumptions.stage_shares || {};
      const share = shares[node.setting_key] || 0;
      node_population *= share;
    } else if (node.stage_key && assumptions.stage_shares) {
      const stage_share = assumptions.stage_shares[node.stage_key] || 0;
      node_population *= stage_share;
    }

    // Apply line share (simplified: equal distribution if not specified)
    if (node.line_key && assumptions.line_shares) {
      const line_share = assumptions.line_shares[node.line_key] || 0;
      node_population *= line_share;
    } else if (node.line_key) {
      // Default: assume equal distribution across lines if not specified
      const line_count = countLinesInSetting(
        treatment_map,
        node.setting_key || '',
        node.subtype_key || ''
      );
      if (line_count > 0) {
        node_population *= 1 / line_count;
      }
    }

    // Apply regimen share (simplified: equal distribution within line)
    const regimen_count = countRegimensInLine(
      treatment_map,
      node.line_key || '',
      node.setting_key || '',
      node.subtype_key || ''
    );
    if (regimen_count > 1) {
      node_population *= 1 / regimen_count;
    }

    // Calculate patient-years using time on treatment
    let patient_years = node_population;
    if (node.line_key && assumptions.time_on_treatment_months) {
      const tot_months = assumptions.time_on_treatment_months[node.line_key];
      if (tot_months) {
        patient_years = node_population * (tot_months / 12);
      }
    } else if (node.duration_value && node.duration_rule === 'fixed_months') {
      patient_years = node_population * (node.duration_value / 12);
    }

    nodes.push({
      node_id: node.node_id,
      eligible_patients: node_population,
      treated_patients: node_population,
      patient_years: patient_years,
    });

    // Rollups
    if (node.subtype_key) {
      rollup_by_subtype[node.subtype_key] =
        (rollup_by_subtype[node.subtype_key] || 0) + node_population;
    }
    if (node.setting_key) {
      rollup_by_setting[node.setting_key] =
        (rollup_by_setting[node.setting_key] || 0) + node_population;
    }
    if (node.line_key) {
      rollup_by_line[node.line_key] = (rollup_by_line[node.line_key] || 0) + node_population;
    }
  }

  const allocation: PopulationAllocation = {
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
  };

  logger.info(
    {
      total_nodes: nodes.length,
      total_treated_patients: nodes.reduce((sum, n) => sum + n.treated_patients, 0),
      total_patient_years: nodes.reduce((sum, n) => sum + n.patient_years, 0),
    },
    'Population allocation completed'
  );

  return allocation;
}

function countLinesInSetting(
  map: TreatmentMap,
  setting_key: string,
  subtype_key: string
): number {
  const unique_lines = new Set(
    map.nodes
      .filter(
        (n) =>
          (n.setting_key === setting_key || !setting_key) &&
          (n.subtype_key === subtype_key || !subtype_key) &&
          n.line_key
      )
      .map((n) => n.line_key)
  );
  return unique_lines.size;
}

function countRegimensInLine(
  map: TreatmentMap,
  line_key: string,
  setting_key: string,
  subtype_key: string
): number {
  return map.nodes.filter(
    (n) =>
      (n.line_key === line_key || !line_key) &&
      (n.setting_key === setting_key || !setting_key) &&
      (n.subtype_key === subtype_key || !subtype_key)
  ).length;
}
