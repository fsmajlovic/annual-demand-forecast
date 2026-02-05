/**
 * Express API server for the React UI
 */

import express from 'express';
import cors from 'cors';
import { runPipeline } from '../pipeline/run.js';
import { readJson, getRunDir } from '../utils/io.js';
import { createLogger } from '../utils/log.js';
import type { PipelineInputs, TreatmentMap, Assumptions, DemandNode } from '../domain/types.js';
import { join } from 'path';
import { existsSync } from 'fs';
import { config } from 'dotenv';

// Load .env file
config();

const logger = createLogger('api-server');
const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Run pipeline with Server-Sent Events for progress
app.get('/api/run', async (req, res) => {
  const { disease, molecule, geo = 'US', base_year = '2024', horizon_years = '10', disable_cache = 'false' } = req.query;

  if (!disease || !molecule) {
    res.status(400).json({ error: 'Missing required parameters: disease, molecule' });
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY not set in environment variables' });
    return;
  }

  // Set up Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendProgress = (message: string) => {
    res.write(`event: progress\ndata: ${message}\n\n`);
  };

  try {
    const inputs: PipelineInputs = {
      disease: disease as string,
      molecule: molecule as string,
      geo: geo as string,
      baseYear: parseInt(base_year as string, 10),
      horizonYears: parseInt(horizon_years as string, 10),
      disableCache: disable_cache === 'true',
    };

    logger.info({ disease, molecule, geo }, 'Starting pipeline run via API');
    sendProgress('Starting pipeline...');

    sendProgress('Stage 1: Normalizing inputs...');

    sendProgress('Stage 2: Building treatment landscape map...');

    sendProgress('Stage 3: Resolving assumptions...');

    const result = await runPipeline(inputs);

    if (!result.success) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: result.error })}\n\n`);
      res.end();
      return;
    }

    sendProgress('Stage 4: Allocating patient population...');

    sendProgress('Stage 5: Calculating exposure and demand...');

    sendProgress('Stage 6: Generating forecast...');

    // Load results for response
    const treatment_map = await readJson<TreatmentMap>(join(result.run_dir, 'treatment_map.json'));
    const assumptions = await readJson<Assumptions>(join(result.run_dir, 'assumptions.json'));
    const demand_nodes = await readJson<DemandNode[]>(
      join(result.run_dir, `demand_${assumptions.base_year}_nodes.json`)
    );
    const forecast_records = await readJson<any[]>(
      join(result.run_dir, `forecast_${assumptions.base_year}_${assumptions.base_year + assumptions.horizon_years}.json`)
    );
    const audit_log = await readJson<any[]>(join(result.run_dir, 'audit_log.json'));
    const metadata = await readJson<any>(join(result.run_dir, 'metadata.json'));

    // Process forecast data for base scenario
    const base_forecast = forecast_records.filter((r) => r.scenario === 'base');
    const forecast_summary = base_forecast.reduce((acc, record) => {
      if (!acc[record.year]) {
        acc[record.year] = {
          year: record.year,
          total_patients: 0,
          total_administered_mg: 0,
          total_dispensed_mg: 0,
        };
      }
      acc[record.year].total_patients += record.treated_patients;
      acc[record.year].total_administered_mg += record.total_administered_mg;
      acc[record.year].total_dispensed_mg += record.total_dispensed_mg;
      return acc;
    }, {} as Record<number, { year: number; total_patients: number; total_administered_mg: number; total_dispensed_mg: number }>);

    const response = {
      run_id: result.run_id,
      success: true,
      summary: {
        disease: treatment_map.disease,
        molecule: treatment_map.molecule,
        geo: treatment_map.geo,
        total_nodes: treatment_map.nodes.length,
        incidence: assumptions.incidence,
        prevalence: assumptions.prevalence,
        base_year: assumptions.base_year,
        horizon_years: assumptions.horizon_years,
        generated_at: metadata.created_at,
        map_version: treatment_map.map_version,
        total_tokens: audit_log.reduce((sum: number, entry: any) => sum + (entry.tokens_used || 0), 0),
        total_llm_calls: audit_log.length,
        cached_calls: audit_log.filter((e: any) => e.cached).length,
      },
      treatment_nodes: treatment_map.nodes.map((node) => {
        const demand = demand_nodes.find((d) => d.node_id === node.node_id);
        return {
          node_id: node.node_id,
          regimen: node.regimen_name_human,
          setting: node.setting_key || 'N/A',
          line: node.line_key || 'N/A',
          route: node.route,
          dosing: `${node.dose_schema.loading ? `${node.dose_schema.loading.value} ${node.dose_schema.loading.unit} loading → ` : ''}${node.dose_schema.maintenance.value} ${node.dose_schema.maintenance.unit} Q${node.dose_schema.interval_days}D`,
          duration:
            node.duration_rule === 'fixed_months' ? `${node.duration_value} months` : node.duration_rule,
          confidence: node.confidence,
          administered_mg_per_patient_year: demand?.administered_mg_per_patient_year || 0,
          dispensed_mg_per_patient_year: demand?.dispensed_mg_per_patient_year || 0,
          treated_patients: demand?.treated_patients || 0,
        };
      }),
      demand_summary: {
        total_treated_patients: demand_nodes.reduce((sum, n) => sum + n.treated_patients, 0),
        total_administered_mg: demand_nodes.reduce((sum, n) => sum + n.total_administered_mg, 0),
        total_dispensed_mg: demand_nodes.reduce((sum, n) => sum + n.total_dispensed_mg, 0),
        by_setting: demand_nodes.reduce(
          (acc, node) => {
            const setting = node.node_id.split('_')[1] || 'unknown';
            if (!acc[setting]) acc[setting] = { patients: 0, administered_mg: 0 };
            acc[setting].patients += node.treated_patients;
            acc[setting].administered_mg += node.total_administered_mg;
            return acc;
          },
          {} as Record<string, { patients: number; administered_mg: number }>
        ),
      },
      forecast: (Object.values(forecast_summary) as Array<{ year: number; total_patients: number; total_administered_mg: number; total_dispensed_mg: number }>).sort((a, b) => a.year - b.year),
      audit_trail: audit_log.map((entry: any) => ({
        timestamp: entry.timestamp,
        stage: entry.stage,
        model: entry.model_name,
        prompt_preview: entry.prompt_preview,
        tool_queries: entry.tool_queries || [],
        tokens_used: entry.tokens_used || 0,
        cached: entry.cached,
        confidence: entry.confidence,
      })),
      metadata: {
        run_id: result.run_id,
        created_at: metadata.created_at,
        status: metadata.status,
        assumptions_hash: metadata.assumptions_hash,
        treatment_map_hash: metadata.treatment_map_hash,
      },
    };

    sendProgress('Pipeline completed successfully!');
    res.write(`event: result\ndata: ${JSON.stringify(response)}\n\n`);
    res.end();

    logger.info({ run_id: result.run_id }, 'Pipeline run completed via API');
  } catch (error) {
    logger.error({ error }, 'Pipeline run failed via API');
    res.write(`event: error\ndata: ${JSON.stringify({ error: String(error) })}\n\n`);
    res.end();
  }
});

// Export results
app.get('/api/export/:runId/:format', async (req, res) => {
  const { runId, format } = req.params;

  if (format !== 'json' && format !== 'csv') {
    res.status(400).json({ error: 'Invalid format. Use json or csv.' });
    return;
  }

  const runDir = getRunDir(runId);

  // Load metadata to get the base_year
  const metadataPath = join(runDir, 'metadata.json');
  if (!existsSync(metadataPath)) {
    res.status(404).json({ error: 'Run not found' });
    return;
  }

  const metadata = await readJson<any>(metadataPath);
  const base_year = metadata.inputs?.baseYear || 2024;

  if (format === 'json') {
    const demandPath = join(runDir, `demand_${base_year}_nodes.json`);
    if (!existsSync(demandPath)) {
      res.status(404).json({ error: 'Demand data not found' });
      return;
    }
    res.download(demandPath, `demand_${runId}.json`);
  } else {
    const csvPath = join(runDir, `demand_${base_year}_nodes.csv`);
    if (!existsSync(csvPath)) {
      res.status(404).json({ error: 'Demand CSV not found' });
      return;
    }
    res.download(csvPath, `demand_${runId}.csv`);
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 API Server running at http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Not set'}\n`);
}).on('error', (error) => {
  logger.error({ error }, 'Server startup error');
  console.error('Failed to start server:', error);
  process.exit(1);
});
