/**
 * Export functionality for report and export commands
 */

import { join } from 'path';
import { readJson, getRunDir, getOutputDir, writeCsv, writeJson, ensureDir } from '../utils/io.js';
import { createLogger } from '../utils/log.js';
import type { RunMetadata, DemandNode, ForecastRecord, TreatmentMap } from '../domain/types.js';

const logger = createLogger('export');

export async function printReport(run_id: string): Promise<void> {
  const run_dir = getRunDir(run_id);

  logger.info({ run_id, run_dir }, 'Generating report');

  // Load artifacts
  const metadata = await readJson<RunMetadata>(join(run_dir, 'metadata.json'));
  const treatment_map = await readJson<TreatmentMap>(join(run_dir, 'treatment_map.json'));

  const base_year = metadata.inputs.baseYear;
  const end_year = base_year + metadata.inputs.horizonYears;

  const demand_nodes = await readJson<DemandNode[]>(join(run_dir, `demand_${base_year}_nodes.json`));
  const forecast_records = await readJson<ForecastRecord[]>(
    join(run_dir, `forecast_${base_year}_${end_year}.json`)
  );

  // Print report
  console.log('\n' + '='.repeat(80));
  console.log('DEMAND FORECAST REPORT');
  console.log('='.repeat(80));
  console.log(`Run ID: ${run_id}`);
  console.log(`Created: ${metadata.created_at}`);
  console.log(`Status: ${metadata.status}`);
  console.log();
  console.log(`Disease: ${treatment_map.disease}`);
  console.log(`Molecule: ${treatment_map.molecule}`);
  console.log(`Geography: ${treatment_map.geo}`);
  console.log(`Base Year: ${metadata.inputs.baseYear}`);
  console.log(`Horizon: ${metadata.inputs.horizonYears} years`);
  console.log();

  // Treatment landscape summary
  console.log('TREATMENT LANDSCAPE:');
  console.log(`  Total nodes: ${treatment_map.nodes.length}`);
  console.log(`  Citations: ${treatment_map.evidence_index.length}`);
  console.log(`  Standard-of-care nodes: ${treatment_map.nodes.filter((n) => n.is_standard_of_care).length}`);
  console.log();

  // Demand summary by setting
  const demand_by_setting: Record<string, number> = {};
  for (const demand_node of demand_nodes) {
    const node = treatment_map.nodes.find((n) => n.node_id === demand_node.node_id);
    if (node?.setting_key) {
      demand_by_setting[node.setting_key] =
        (demand_by_setting[node.setting_key] || 0) + demand_node.total_dispensed_mg;
    }
  }

  console.log('2024 DEMAND BY SETTING:');
  for (const [setting, mg] of Object.entries(demand_by_setting).sort((a, b) => b[1] - a[1])) {
    const kg = (mg / 1_000_000).toFixed(2);
    console.log(`  ${setting}: ${kg} kg`);
  }
  console.log();

  // Demand summary by line
  const demand_by_line: Record<string, number> = {};
  for (const demand_node of demand_nodes) {
    const node = treatment_map.nodes.find((n) => n.node_id === demand_node.node_id);
    if (node?.line_key) {
      demand_by_line[node.line_key] =
        (demand_by_line[node.line_key] || 0) + demand_node.total_dispensed_mg;
    }
  }

  console.log('2024 DEMAND BY LINE:');
  for (const [line, mg] of Object.entries(demand_by_line).sort((a, b) => b[1] - a[1])) {
    const kg = (mg / 1_000_000).toFixed(2);
    console.log(`  ${line}: ${kg} kg`);
  }
  console.log();

  // Forecast trajectory (base scenario)
  const base_forecast = forecast_records.filter((r) => r.scenario === 'base');
  const forecast_by_year = base_forecast.reduce((acc, r) => {
    if (!acc[r.year]) acc[r.year] = 0;
    acc[r.year] += r.total_dispensed_mg;
    return acc;
  }, {} as Record<number, number>);

  console.log('FORECAST TRAJECTORY (BASE SCENARIO):');
  const years = Object.keys(forecast_by_year)
    .map(Number)
    .sort();
  for (const year of years) {
    const kg = (forecast_by_year[year] / 1_000_000).toFixed(2);
    console.log(`  ${year}: ${kg} kg`);
  }
  console.log();

  // Scenario comparison (final year)
  const final_year = Math.max(...forecast_records.map((r) => r.year));
  const scenarios = [...new Set(forecast_records.map((r) => r.scenario))];

  console.log(`SCENARIO COMPARISON (${final_year}):`);
  for (const scenario of scenarios) {
    const scenario_final = forecast_records
      .filter((r) => r.scenario === scenario && r.year === final_year)
      .reduce((sum, r) => sum + r.total_dispensed_mg, 0);
    const kg = (scenario_final / 1_000_000).toFixed(2);
    console.log(`  ${scenario}: ${kg} kg`);
  }
  console.log();

  console.log('='.repeat(80) + '\n');
}

export async function exportRun(
  run_id: string,
  format: 'csv' | 'json',
  output_file?: string
): Promise<void> {
  const run_dir = getRunDir(run_id);
  const output_dir = getOutputDir();

  await ensureDir(output_dir);

  logger.info({ run_id, format, output_file }, 'Exporting run');

  // Load metadata to get base_year
  const metadata = await readJson<RunMetadata>(join(run_dir, 'metadata.json'));
  const base_year = metadata.inputs.baseYear;
  const end_year = base_year + metadata.inputs.horizonYears;

  if (format === 'csv') {
    // Export demand and forecast as CSV
    const demand_nodes = await readJson<DemandNode[]>(join(run_dir, `demand_${base_year}_nodes.json`));
    const forecast_records = await readJson<ForecastRecord[]>(
      join(run_dir, `forecast_${base_year}_${end_year}.json`)
    );

    const demand_output = output_file
      ? join(output_dir, output_file)
      : join(output_dir, `demand_${run_id}.csv`);
    const forecast_output = output_file
      ? join(output_dir, output_file.replace('.csv', '_forecast.csv'))
      : join(output_dir, `forecast_${run_id}.csv`);

    await writeCsv(demand_output, demand_nodes);
    await writeCsv(forecast_output, forecast_records);

    console.log(`\nExported to:`);
    console.log(`  ${demand_output}`);
    console.log(`  ${forecast_output}\n`);
  } else {
    // Export all artifacts as JSON
    const treatment_map = await readJson<TreatmentMap>(join(run_dir, 'treatment_map.json'));
    const demand_nodes = await readJson<DemandNode[]>(join(run_dir, `demand_${base_year}_nodes.json`));
    const forecast_records = await readJson<ForecastRecord[]>(
      join(run_dir, `forecast_${base_year}_${end_year}.json`)
    );

    const export_package = {
      metadata,
      treatment_map,
      demand_2024: demand_nodes,
      forecast: forecast_records,
    };

    const json_output = output_file
      ? join(output_dir, output_file)
      : join(output_dir, `export_${run_id}.json`);

    await writeJson(json_output, export_package);

    console.log(`\nExported to: ${json_output}\n`);
  }
}
