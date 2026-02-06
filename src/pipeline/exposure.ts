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
      treated_patients: Math.round(pop_node.treated_patients),
      administered_mg_per_patient_year: Math.round(administered_mg_ppy),
      dispensed_mg_per_patient_year: Math.round(dispensed_mg_ppy),
      total_administered_mg: Math.round(total_administered_mg),
      total_dispensed_mg: Math.round(total_dispensed_mg),
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
  let interval_days = dose_schema.interval_days;
  const rdi = assumptions.relative_dose_intensity || 1.0;

  // Check if notes contain a different maintenance interval than interval_days
  // Common LLM error: putting loading interval in interval_days instead of maintenance
  const corrected_interval = extractMaintenanceIntervalFromNotes(dose_schema.notes, interval_days);
  if (corrected_interval !== interval_days) {
    logger.warn(
      {
        node_id: treatment_node.node_id,
        declared_interval: interval_days,
        corrected_interval,
        notes: dose_schema.notes,
      },
      'Interval mismatch detected: notes suggest different maintenance interval. Auto-correcting.'
    );
    interval_days = corrected_interval;
  }

  // Get weight (simplified: use single value or mean)
  const weight_kg =
    typeof assumptions.avg_weight_kg === 'number'
      ? assumptions.avg_weight_kg
      : assumptions.avg_weight_kg.mean;

  // Detect and fix type/unit mismatches (common LLM error)
  let effective_type = dose_schema.type;
  const unit = dose_schema.maintenance?.unit?.toLowerCase() || '';

  if (effective_type === 'fixed_mg' && unit.includes('kg')) {
    logger.warn(
      { node_id: treatment_node.node_id, declared_type: effective_type, unit },
      'Type/unit mismatch detected: type is fixed_mg but unit contains kg. Auto-correcting to mg_per_kg.'
    );
    effective_type = 'mg_per_kg';
  } else if (effective_type === 'fixed_mg' && unit.includes('m2')) {
    logger.warn(
      { node_id: treatment_node.node_id, declared_type: effective_type, unit },
      'Type/unit mismatch detected: type is fixed_mg but unit contains m2. Auto-correcting to mg_per_m2.'
    );
    effective_type = 'mg_per_m2';
  } else if (effective_type === 'mg_per_kg' && !unit.includes('kg')) {
    // Reverse mismatch: declared as weight-based but unit is just "mg"
    logger.warn(
      { node_id: treatment_node.node_id, declared_type: effective_type, unit },
      'Type/unit mismatch detected: type is mg_per_kg but unit does not contain kg. Auto-correcting to fixed_mg.'
    );
    effective_type = 'fixed_mg';
  } else if (effective_type === 'mg_per_m2' && !unit.includes('m2')) {
    // Reverse mismatch: declared as BSA-based but unit is just "mg"
    logger.warn(
      { node_id: treatment_node.node_id, declared_type: effective_type, unit },
      'Type/unit mismatch detected: type is mg_per_m2 but unit does not contain m2. Auto-correcting to fixed_mg.'
    );
    effective_type = 'fixed_mg';
  }

  // Calculate dose per administration
  let dose_per_admin_mg = 0;

  switch (effective_type) {
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

  // Calculate maintenance administrations per year
  const maintenance_admins_per_year = 365 / interval_days;

  // Calculate loading dose contribution (averaged over first year)
  let loading_dose_mg = 0;
  if (dose_schema.loading && dose_schema.loading.repeats > 0) {
    let loading_per_admin = 0;
    const loading_unit = dose_schema.loading.unit?.toLowerCase() || '';

    // Determine if loading dose uses same type as maintenance
    if (loading_unit.includes('kg')) {
      loading_per_admin = dose_schema.loading.value * weight_kg;
    } else if (loading_unit.includes('m2')) {
      const bsa_m2 = Math.sqrt((170 * weight_kg) / 3600);
      loading_per_admin = dose_schema.loading.value * bsa_m2;
    } else {
      // Fixed mg loading dose
      loading_per_admin = dose_schema.loading.value;
    }

    // Loading doses are extra administrations in the first year
    // Subtract from maintenance count to avoid double-counting
    const loading_repeats = dose_schema.loading.repeats;
    loading_dose_mg = loading_per_admin * loading_repeats;

    logger.info(
      {
        node_id: treatment_node.node_id,
        loading_per_admin,
        loading_repeats,
        total_loading_mg: loading_dose_mg,
      },
      'Including loading dose in annual calculation'
    );
  }

  // Annual maintenance dose
  const maintenance_dose_mg = dose_per_admin_mg * maintenance_admins_per_year;

  // Total annual dose = loading (first year) + maintenance
  // Apply RDI to total
  const annual_dose_mg = (loading_dose_mg + maintenance_dose_mg) * rdi;

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

  const dose_schema = treatment_node.dose_schema;

  // Apply same interval correction as in calculateAdministeredDose
  let interval_days = dose_schema.interval_days;
  const corrected_interval = extractMaintenanceIntervalFromNotes(dose_schema.notes, interval_days);
  if (corrected_interval !== interval_days) {
    interval_days = corrected_interval;
  }

  // Calculate total administrations per year (maintenance + loading)
  const maintenance_admins = 365 / interval_days;
  const loading_admins = dose_schema.loading?.repeats || 0;
  const total_admins_per_year = maintenance_admins + loading_admins;

  // Average dose per administration (administered total / total admins)
  const dose_per_admin_mg = administered_mg_ppy / total_admins_per_year;

  // Round to vials for each administration
  const dispensed_per_admin_mg = roundToVials(dose_per_admin_mg, vial_sizes);

  // Annual dispensed dose
  const dispensed_mg_ppy = dispensed_per_admin_mg * total_admins_per_year;

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

/**
 * Extract maintenance interval from notes when LLM puts loading interval in interval_days
 * Common patterns: "every 6 months", "every 4 weeks", "q4w", "q6m", "maintenance every X"
 */
function extractMaintenanceIntervalFromNotes(
  notes: string | null | undefined,
  declared_interval: number
): number {
  if (!notes) return declared_interval;

  const notes_lower = notes.toLowerCase();

  // Pattern: "maintenance every X months/weeks"
  const maintenance_pattern = /maintenance\s+every\s+(\d+)\s*(month|week|day)/i;
  const maintenance_match = notes_lower.match(maintenance_pattern);
  if (maintenance_match) {
    const value = parseInt(maintenance_match[1], 10);
    const unit = maintenance_match[2];
    const interval = convertTodays(value, unit);
    if (interval && Math.abs(interval - declared_interval) > 7) {
      return interval;
    }
  }

  // Pattern: "every X months" (for maintenance, not loading)
  // Only use if notes also mention loading/initial doses separately
  const has_loading_mention =
    notes_lower.includes('loading') ||
    notes_lower.includes('initial') ||
    notes_lower.includes('first month') ||
    notes_lower.includes('induction');

  if (has_loading_mention) {
    // Look for "then every X" or "followed by every X" or just "every X months"
    const then_every_pattern = /(?:then|followed by|thereafter)\s+(?:every\s+)?(\d+)\s*(month|week|day)/i;
    const then_match = notes_lower.match(then_every_pattern);
    if (then_match) {
      const value = parseInt(then_match[1], 10);
      const unit = then_match[2];
      const interval = convertTodays(value, unit);
      if (interval && Math.abs(interval - declared_interval) > 7) {
        return interval;
      }
    }

    // Pattern: "every X months" when loading is mentioned elsewhere
    const every_pattern = /every\s+(\d+)\s*(month)/i;
    const every_match = notes_lower.match(every_pattern);
    if (every_match) {
      const value = parseInt(every_match[1], 10);
      const unit = every_match[2];
      const interval = convertTodays(value, unit);
      // Only correct if the declared interval seems like a loading interval (< 28 days)
      // and the notes mention a much longer maintenance interval
      if (interval && interval > 60 && declared_interval < 28) {
        return interval;
      }
    }
  }

  // Pattern: "q4w", "q6m", "q3m" etc. for maintenance
  const q_pattern = /q(\d+)([mwd])/i;
  const q_match = notes_lower.match(q_pattern);
  if (q_match && has_loading_mention) {
    const value = parseInt(q_match[1], 10);
    const unit_char = q_match[2].toLowerCase();
    const unit = unit_char === 'm' ? 'month' : unit_char === 'w' ? 'week' : 'day';
    const interval = convertTodays(value, unit);
    if (interval && Math.abs(interval - declared_interval) > 7) {
      return interval;
    }
  }

  // Pattern: "days X and Y of a Z-day cycle" - cycle-based dosing
  // e.g., "Administered on days 1 and 8 of a 21-day cycle"
  // Calculate effective interval as cycle_length / doses_per_cycle
  const cycle_pattern = /days?\s+(\d+)\s+and\s+(\d+)\s+of\s+(?:a\s+)?(\d+)[- ]day\s+cycle/i;
  const cycle_match = notes_lower.match(cycle_pattern);
  if (cycle_match) {
    const cycle_length = parseInt(cycle_match[3], 10);
    const doses_per_cycle = 2; // "days X and Y" = 2 doses
    const effective_interval = cycle_length / doses_per_cycle;
    // Always apply cycle-based correction when pattern is detected
    // The pattern explicitly tells us there are N doses per cycle
    if (Math.abs(effective_interval - declared_interval) > 1) {
      return effective_interval;
    }
  }

  // Pattern: "days 1, 8, and 15 of a 21-day cycle" - 3 doses per cycle
  const cycle_pattern_3 = /days?\s+(\d+),\s*(\d+),?\s+and\s+(\d+)\s+of\s+(?:a\s+)?(\d+)[- ]day\s+cycle/i;
  const cycle_match_3 = notes_lower.match(cycle_pattern_3);
  if (cycle_match_3) {
    const cycle_length = parseInt(cycle_match_3[4], 10);
    const doses_per_cycle = 3;
    const effective_interval = cycle_length / doses_per_cycle;
    // Always apply cycle-based correction when pattern is detected
    if (Math.abs(effective_interval - declared_interval) > 1) {
      return effective_interval;
    }
  }

  return declared_interval;
}

function convertTodays(value: number, unit: string): number | null {
  switch (unit.toLowerCase()) {
    case 'day':
    case 'days':
      return value;
    case 'week':
    case 'weeks':
      return value * 7;
    case 'month':
    case 'months':
      return value * 30; // Approximate
    default:
      return null;
  }
}
