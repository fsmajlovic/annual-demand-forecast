/**
 * Stage 3: Exposure and demand calculation (deterministic)
 */

import { createLogger } from '../utils/log.js';
import type {
  TreatmentMap,
  Assumptions,
  PopulationAllocation,
  DemandNode,
  VialSize,
} from '../domain/types.js';

const logger = createLogger('exposure');

export function calculateDemand(
  treatment_map: TreatmentMap,
  population: PopulationAllocation,
  assumptions: Assumptions
): DemandNode[] {
  logger.info('Calculating demand per node');

  const demand_nodes: DemandNode[] = [];

  for (const pop_node of population.nodes) {
    const treatment_node = treatment_map.nodes.find((n) => n.node_id === pop_node.node_id);
    if (!treatment_node) {
      logger.warn({ node_id: pop_node.node_id }, 'Treatment node not found for population node');
      continue;
    }

    // Calculate administered mg per patient-year
    const administered_mg_ppy = calculateAdministeredDose(treatment_node, assumptions);

    // Calculate dispensed mg per patient-year (with vial rounding)
    const dispensed_mg_ppy = calculateDispensedDose(
      treatment_node,
      assumptions,
      administered_mg_ppy
    );

    // Total demand
    const total_administered_mg = administered_mg_ppy * pop_node.patient_years;
    const total_dispensed_mg = dispensed_mg_ppy * pop_node.patient_years;

    demand_nodes.push({
      node_id: pop_node.node_id,
      treated_patients: pop_node.treated_patients,
      administered_mg_per_patient_year: administered_mg_ppy,
      dispensed_mg_per_patient_year: dispensed_mg_ppy,
      total_administered_mg: total_administered_mg,
      total_dispensed_mg: total_dispensed_mg,
    });
  }

  const total_administered = demand_nodes.reduce((sum, n) => sum + n.total_administered_mg, 0);
  const total_dispensed = demand_nodes.reduce((sum, n) => sum + n.total_dispensed_mg, 0);

  logger.info(
    {
      total_administered_mg: total_administered,
      total_dispensed_mg: total_dispensed,
      total_administered_kg: (total_administered / 1_000_000).toFixed(2),
      total_dispensed_kg: (total_dispensed / 1_000_000).toFixed(2),
      wastage_pct: (((total_dispensed - total_administered) / total_dispensed) * 100).toFixed(1),
    },
    'Demand calculation completed'
  );

  return demand_nodes;
}

function calculateAdministeredDose(treatment_node: any, assumptions: Assumptions): number {
  const dose_schema = treatment_node.dose_schema;
  const interval_days = dose_schema.interval_days;
  const rdi = assumptions.relative_dose_intensity || 1.0;

  // Get weight (simplified: use single value or mean)
  const weight_kg =
    typeof assumptions.avg_weight_kg === 'number'
      ? assumptions.avg_weight_kg
      : assumptions.avg_weight_kg.mean;

  // Calculate dose per administration
  let dose_per_admin_mg = 0;

  switch (dose_schema.type) {
    case 'mg_per_kg':
      dose_per_admin_mg = dose_schema.maintenance.value * weight_kg;
      break;
    case 'fixed_mg':
      dose_per_admin_mg = dose_schema.maintenance.value;
      break;
    case 'mg_per_m2':
      // Simplified BSA calculation: Mosteller formula approximation
      // BSA (m²) ≈ sqrt(height_cm * weight_kg / 3600)
      // Assume average height 170cm for simplicity
      const bsa_m2 = Math.sqrt((170 * weight_kg) / 3600);
      dose_per_admin_mg = dose_schema.maintenance.value * bsa_m2;
      break;
    default:
      logger.warn({ type: dose_schema.type }, 'Unknown dose schema type, using maintenance value');
      dose_per_admin_mg = dose_schema.maintenance.value;
  }

  // Calculate administrations per year
  const administrations_per_year = 365 / interval_days;

  // Apply RDI
  const annual_dose_mg = dose_per_admin_mg * administrations_per_year * rdi;

  return annual_dose_mg;
}

function calculateDispensedDose(
  treatment_node: any,
  assumptions: Assumptions,
  administered_mg_ppy: number
): number {
  const route = treatment_node.route;
  const vial_sizes = assumptions.vial_sizes[route as keyof typeof assumptions.vial_sizes];

  if (!vial_sizes || vial_sizes.length === 0) {
    logger.warn({ route }, 'No vial sizes defined for route, using administered dose');
    return administered_mg_ppy;
  }

  // Calculate dose per administration
  const interval_days = treatment_node.dose_schema.interval_days;
  const administrations_per_year = 365 / interval_days;
  const dose_per_admin_mg = administered_mg_ppy / administrations_per_year;

  // Round to vials for each administration
  const dispensed_per_admin_mg = roundToVials(dose_per_admin_mg, vial_sizes);

  // Annual dispensed dose
  const dispensed_mg_ppy = dispensed_per_admin_mg * administrations_per_year;

  return dispensed_mg_ppy;
}

function roundToVials(required_dose_mg: number, vial_sizes: VialSize[]): number {
  // Sort vial sizes descending
  const sorted_vials = [...vial_sizes].sort((a, b) => b.size_mg - a.size_mg);

  // Greedy algorithm: use largest vials first
  let remaining_dose = required_dose_mg;
  let total_dispensed = 0;

  for (const vial of sorted_vials) {
    while (remaining_dose > 0) {
      total_dispensed += vial.size_mg;
      remaining_dose -= vial.size_mg;

      if (remaining_dose <= 0) {
        break;
      }
    }

    if (remaining_dose <= 0) {
      break;
    }
  }

  // If we still have remaining dose (shouldn't happen with proper vial sizes)
  if (remaining_dose > 0) {
    const smallest_vial = sorted_vials[sorted_vials.length - 1];
    total_dispensed += smallest_vial.size_mg;
  }

  return total_dispensed;
}
