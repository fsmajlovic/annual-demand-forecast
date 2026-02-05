/**
 * Stage 4: 10-year forecast (deterministic)
 */

import { createLogger } from '../utils/log.js';
import type {
  TreatmentMap,
  Assumptions,
  PopulationAllocation,
  DemandNode,
  ForecastRecord,
} from '../domain/types.js';
import { allocatePopulation } from './population.js';
import { calculateDemand } from './exposure.js';

const logger = createLogger('forecast');

export function generateForecast(
  treatment_map: TreatmentMap,
  base_assumptions: Assumptions,
  _base_population: PopulationAllocation,
  _base_demand: DemandNode[]
): ForecastRecord[] {
  logger.info(
    {
      base_year: base_assumptions.base_year,
      horizon_years: base_assumptions.horizon_years,
    },
    'Generating forecast'
  );

  const forecast_records: ForecastRecord[] = [];
  const scenarios = base_assumptions.scenarios || {
    base: {
      incidence_cagr: 0.005,
      treated_rate_multiplier: 1.0,
      tot_multiplier: 1.0,
      adoption_multiplier: 1.0,
    },
  };

  // Generate forecast for each scenario
  for (const [scenario_name, scenario_params] of Object.entries(scenarios)) {
    logger.info({ scenario: scenario_name }, 'Forecasting scenario');

    // For each year in the horizon
    for (let year_offset = 0; year_offset <= base_assumptions.horizon_years; year_offset++) {
      const forecast_year = base_assumptions.base_year + year_offset;

      // Calculate scaling factors
      const epi_scale = Math.pow(1 + scenario_params.incidence_cagr, year_offset);
      const treated_rate_scale = scenario_params.treated_rate_multiplier;
      const tot_scale = scenario_params.tot_multiplier;

      // Create adjusted assumptions for this year
      const year_assumptions: Assumptions = {
        ...base_assumptions,
        incidence: base_assumptions.incidence
          ? base_assumptions.incidence * epi_scale
          : undefined,
        prevalence: base_assumptions.prevalence
          ? base_assumptions.prevalence * epi_scale
          : undefined,
        treated_rate: base_assumptions.treated_rate * treated_rate_scale,
        time_on_treatment_months: base_assumptions.time_on_treatment_months
          ? Object.fromEntries(
              Object.entries(base_assumptions.time_on_treatment_months).map(([key, val]) => [
                key,
                val * tot_scale,
              ])
            )
          : undefined,
      };

      // Calculate population and demand for this year
      const year_population = allocatePopulation(treatment_map, year_assumptions);
      const year_demand = calculateDemand(treatment_map, year_population, year_assumptions);

      // Create forecast records
      for (const demand_node of year_demand) {
        const pop_node = year_population.nodes.find((n) => n.node_id === demand_node.node_id);
        if (!pop_node) continue;

        forecast_records.push({
          year: forecast_year,
          node_id: demand_node.node_id,
          scenario: scenario_name,
          treated_patients: Math.round(demand_node.treated_patients),
          patient_years: Math.round(pop_node.patient_years * 100) / 100,
          administered_mg_per_patient_year:
            Math.round(demand_node.administered_mg_per_patient_year),
          total_administered_mg: Math.round(demand_node.total_administered_mg),
          total_dispensed_mg: Math.round(demand_node.total_dispensed_mg),
        });
      }
    }
  }

  // Log summary
  const total_by_year = forecast_records.reduce((acc, record) => {
    if (record.scenario === 'base') {
      if (!acc[record.year]) acc[record.year] = 0;
      acc[record.year] += record.total_dispensed_mg;
    }
    return acc;
  }, {} as Record<number, number>);

  logger.info(
    {
      scenarios: Object.keys(scenarios).length,
      total_records: forecast_records.length,
      base_scenario_summary: Object.entries(total_by_year)
        .slice(0, 3)
        .map(([year, mg]) => ({ year, kg: (mg / 1_000_000).toFixed(2) })),
    },
    'Forecast generation completed'
  );

  return forecast_records;
}
