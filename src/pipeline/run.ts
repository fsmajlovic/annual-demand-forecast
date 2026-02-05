/**
 * Main pipeline orchestrator
 */

import { join } from 'path';
import { createLogger } from '../utils/log.js';
import { writeJson, writeCsv, getRunDir, ensureDir } from '../utils/io.js';
import { generateRunId, hashObject } from '../utils/hash.js';
import type { PipelineInputs, RunMetadata, AuditLogEntry } from '../domain/types.js';
import { normalizeInputs } from './normalize.js';
import { checkRegulatoryStatus, hasDataReliabilityWarning, getRegulatoryStatusSummary } from './regulatoryCheck.js';
import { buildTreatmentMap } from './buildTreatmentMap.js';
import { resolveAssumptions } from './resolveAssumptions.js';
import { allocatePopulation } from './population.js';
import { calculateDemand } from './exposure.js';
import { generateForecast } from './forecast.js';
import type { RegulatoryStatus } from '../llm/schemas.js';

const logger = createLogger('pipeline');

export interface PipelineRunResult {
  run_id: string;
  run_dir: string;
  success: boolean;
  error?: string;
}

export async function runPipeline(inputs: PipelineInputs): Promise<PipelineRunResult> {
  const start_time = Date.now();
  const use_cache = !inputs.disableCache;
  logger.info({ inputs, use_cache }, 'Starting pipeline run');

  const audit_log: AuditLogEntry[] = [];

  try {
    // Stage 0: Normalize inputs
    logger.info('Stage 0: Normalizing inputs');
    const { result: normalized_input, audit: normalize_audit } = await normalizeInputs(inputs);
    audit_log.push(normalize_audit);

    // Stage 0.5: Check regulatory status
    logger.info('Stage 0.5: Checking regulatory status');
    const { status: regulatory_status, audit: regulatory_audit } = await checkRegulatoryStatus(
      normalized_input.canonical_disease_name,
      normalized_input.canonical_molecule_name,
      inputs.geo,
      use_cache
    );
    audit_log.push(regulatory_audit);

    // Log warning if data reliability is questionable
    if (hasDataReliabilityWarning(regulatory_status)) {
      logger.warn(
        {
          status: regulatory_status.status,
          warning: regulatory_status.data_reliability_warning,
        },
        'DATA RELIABILITY WARNING: Molecule has limited regulatory approval'
      );
    }

    // Stage 1: Build treatment map
    logger.info('Stage 1: Building treatment landscape map');
    const { map: treatment_map, audit: map_audit } = await buildTreatmentMap(
      normalized_input,
      inputs.geo,
      {},
      use_cache
    );
    audit_log.push(...map_audit);

    // Stage 2: Resolve assumptions
    logger.info('Stage 2: Resolving assumptions');
    const { assumptions, audit: assumptions_audit } = await resolveAssumptions(
      normalized_input.canonical_disease_name,
      normalized_input.canonical_molecule_name,
      treatment_map,
      inputs.geo,
      inputs.baseYear,
      inputs.horizonYears,
      use_cache
    );
    audit_log.push(assumptions_audit);

    // Generate run ID
    const assumptions_hash = hashObject(assumptions);
    const map_hash = hashObject(treatment_map);
    const run_id = generateRunId(inputs, assumptions_hash, map_hash);
    const run_dir = getRunDir(run_id);

    logger.info({ run_id, run_dir }, 'Run ID generated');
    await ensureDir(run_dir);

    // Save intermediate artifacts
    await writeJson(join(run_dir, 'normalized_input.json'), normalized_input);
    await writeJson(join(run_dir, 'regulatory_status.json'), regulatory_status);
    await writeJson(join(run_dir, 'treatment_map.json'), treatment_map);
    await writeJson(join(run_dir, 'assumptions.json'), assumptions);

    // Stage 3: Allocate population
    logger.info('Stage 3: Allocating population');
    const population_allocation = allocatePopulation(treatment_map, assumptions);
    await writeJson(join(run_dir, `population_${assumptions.base_year}.json`), population_allocation);

    // Stage 4: Calculate demand
    logger.info('Stage 4: Calculating demand');
    const demand_nodes = calculateDemand(treatment_map, population_allocation, assumptions);
    await writeJson(join(run_dir, `demand_${assumptions.base_year}_nodes.json`), demand_nodes);
    await writeCsv(join(run_dir, `demand_${assumptions.base_year}_nodes.csv`), demand_nodes);

    // Stage 5: Generate forecast
    logger.info('Stage 5: Generating forecast');
    const forecast_records = generateForecast(
      treatment_map,
      assumptions,
      population_allocation,
      demand_nodes
    );
    const end_year = assumptions.base_year + assumptions.horizon_years;
    await writeJson(join(run_dir, `forecast_${assumptions.base_year}_${end_year}.json`), forecast_records);
    await writeCsv(join(run_dir, `forecast_${assumptions.base_year}_${end_year}.csv`), forecast_records);

    // Save audit log
    await writeJson(join(run_dir, 'audit_log.json'), audit_log);

    // Save run metadata
    const metadata: RunMetadata = {
      run_id,
      created_at: new Date().toISOString(),
      inputs,
      assumptions_hash,
      treatment_map_hash: map_hash,
      status: 'completed',
    };
    await writeJson(join(run_dir, 'metadata.json'), metadata);

    const duration_sec = ((Date.now() - start_time) / 1000).toFixed(1);
    logger.info({ run_id, duration_sec }, 'Pipeline run completed successfully');

    // Print summary
    printSummary(run_id, treatment_map, regulatory_status, demand_nodes, forecast_records);

    return {
      run_id,
      run_dir,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({ error: errorMessage, stack: errorStack }, 'Pipeline run failed');

    return {
      run_id: 'failed',
      run_dir: '',
      success: false,
      error: errorMessage,
    };
  }
}

function printSummary(
  run_id: string,
  treatment_map: any,
  regulatory_status: RegulatoryStatus,
  demand_nodes: any[],
  forecast_records: any[]
): void {
  console.log('\n' + '='.repeat(80));
  console.log('PIPELINE RUN SUMMARY');
  console.log('='.repeat(80));
  console.log(`Run ID: ${run_id}`);
  console.log(`Disease: ${treatment_map.disease}`);
  console.log(`Molecule: ${treatment_map.molecule}`);
  console.log(`Geography: ${treatment_map.geo}`);
  console.log(`Regulatory Status: ${getRegulatoryStatusSummary(regulatory_status)}`);
  console.log(`Treatment nodes: ${treatment_map.nodes.length}`);
  console.log(`Citations: ${treatment_map.evidence_index.length}`);

  // Show warning banner if data reliability is questionable
  if (hasDataReliabilityWarning(regulatory_status)) {
    console.log();
    console.log('⚠️  ' + '='.repeat(74) + '  ⚠️');
    console.log('⚠️  DATA RELIABILITY WARNING');
    console.log('⚠️  ' + '-'.repeat(74) + '  ⚠️');
    console.log(`⚠️  ${regulatory_status.data_reliability_warning || 'This molecule may have limited commercial relevance.'}`);
    console.log('⚠️  ' + '='.repeat(74) + '  ⚠️');
  }
  console.log();

  // 2024 demand summary
  const total_dispensed_mg = demand_nodes.reduce(
    (sum, n) => sum + n.total_dispensed_mg,
    0
  );
  const total_dispensed_kg_2024 = total_dispensed_mg / 1_000_000;

  console.log('2024 DEMAND:');
  console.log(`  Total dispensed: ${total_dispensed_kg_2024.toFixed(2)} kg`);
  console.log();

  // Top 10 nodes by demand
  const top_nodes = [...demand_nodes]
    .sort((a, b) => b.total_dispensed_mg - a.total_dispensed_mg)
    .slice(0, 10);

  console.log('TOP 10 NODES BY DEMAND:');
  for (const node of top_nodes) {
    const node_info = treatment_map.nodes.find((n: any) => n.node_id === node.node_id);
    const kg = (node.total_dispensed_mg / 1_000_000).toFixed(2);
    const pct = ((node.total_dispensed_mg / total_dispensed_mg) * 100).toFixed(1);
    console.log(`  ${node.node_id}: ${kg} kg (${pct}%)`);
    if (node_info) {
      console.log(`    ${node_info.regimen_name_human} - ${node_info.route}`);
    }
  }
  console.log();

  // Forecast summary (base scenario)
  const base_forecast = forecast_records.filter((r) => r.scenario === 'base');
  const years_to_show = [2024, 2029, 2034];
  const forecast_by_year = base_forecast.reduce((acc, r) => {
    if (!acc[r.year]) acc[r.year] = 0;
    acc[r.year] += r.total_dispensed_mg;
    return acc;
  }, {} as Record<number, number>);

  console.log('FORECAST (BASE SCENARIO):');
  for (const year of years_to_show) {
    const kg = ((forecast_by_year[year] || 0) / 1_000_000).toFixed(2);
    console.log(`  ${year}: ${kg} kg`);
  }
  console.log();

  console.log(`Outputs saved to: ./runs/${run_id}/`);
  console.log('='.repeat(80) + '\n');
}
