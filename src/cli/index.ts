#!/usr/bin/env node

/**
 * CLI entry point for the demand forecasting pipeline
 */

import { Command } from 'commander';
import { runPipeline } from '../pipeline/run.js';
import { printReport, exportRun } from '../pipeline/export.js';
import { generateTables } from '../pipeline/visualize.js';
import { getCache, closeCache } from '../llm/cache.js';
import { createLogger } from '../utils/log.js';
import type { PipelineInputs } from '../domain/types.js';

const logger = createLogger('cli');
const program = new Command();

program
  .name('pipeline')
  .description('Production-grade pharmaceutical demand forecasting pipeline')
  .version('1.0.0');

// Run command
program
  .command('run')
  .description('Run the demand forecasting pipeline')
  .requiredOption('--disease <disease>', 'Disease name (e.g., "breast cancer")')
  .requiredOption('--molecule <molecule>', 'Molecule name (e.g., "trastuzumab")')
  .option('--geo <geo>', 'Geography (default: US)', 'US')
  .option('--baseYear <year>', 'Base year for analysis', '2024')
  .option('--horizon <years>', 'Forecast horizon in years', '10')
  .action(async (options) => {
    try {
      logger.info('Starting pipeline run command');

      // Validate OpenAI API key
      if (!process.env.OPENAI_API_KEY) {
        console.error('\nError: OPENAI_API_KEY environment variable not set.');
        console.error('Please set your OpenAI API key:');
        console.error('  export OPENAI_API_KEY=your-api-key-here\n');
        process.exit(1);
      }

      const inputs: PipelineInputs = {
        disease: options.disease,
        molecule: options.molecule,
        geo: options.geo,
        baseYear: parseInt(options.baseYear, 10),
        horizonYears: parseInt(options.horizon, 10),
      };

      const result = await runPipeline(inputs);

      if (result.success) {
        console.log(`\n✓ Pipeline completed successfully!`);
        console.log(`  Run ID: ${result.run_id}`);
        console.log(`  Output: ${result.run_dir}\n`);
        process.exit(0);
      } else {
        console.error(`\n✗ Pipeline failed: ${result.error}\n`);
        process.exit(1);
      }
    } catch (error) {
      logger.error({ error }, 'Pipeline run command failed');
      console.error(`\n✗ Unexpected error: ${error}\n`);
      process.exit(1);
    } finally {
      closeCache();
    }
  });

// Report command
program
  .command('report')
  .description('Print a summary report for a run')
  .requiredOption('--runId <runId>', 'Run ID to generate report for')
  .action(async (options) => {
    try {
      await printReport(options.runId);
    } catch (error) {
      logger.error({ error }, 'Report command failed');
      console.error(`\n✗ Failed to generate report: ${error}\n`);
      process.exit(1);
    }
  });

// Export command
program
  .command('export')
  .description('Export run results to output directory')
  .requiredOption('--runId <runId>', 'Run ID to export')
  .option('--format <format>', 'Output format: csv or json', 'csv')
  .option('--output <file>', 'Output file name (optional)')
  .action(async (options) => {
    try {
      const format = options.format as 'csv' | 'json';
      if (format !== 'csv' && format !== 'json') {
        console.error('\n✗ Invalid format. Use "csv" or "json"\n');
        process.exit(1);
      }

      await exportRun(options.runId, format, options.output);
    } catch (error) {
      logger.error({ error }, 'Export command failed');
      console.error(`\n✗ Failed to export: ${error}\n`);
      process.exit(1);
    }
  });

// Tables command - enhanced visualization
program
  .command('tables')
  .description('Display detailed tables for a run')
  .requiredOption('--runId <runId>', 'Run ID to visualize')
  .action(async (options) => {
    try {
      await generateTables(options.runId);
    } catch (error) {
      logger.error({ error }, 'Tables command failed');
      console.error(`\n✗ Failed to generate tables: ${error}\n`);
      process.exit(1);
    }
  });

// Cache stats command
program
  .command('cache-stats')
  .description('Show LLM cache statistics')
  .action(() => {
    try {
      const cache = getCache();
      const stats = cache.stats();

      console.log('\nLLM Cache Statistics:');
      console.log(`  Total entries: ${stats.total_entries}`);
      console.log('\nBy schema:');
      for (const [schema, count] of Object.entries(stats.by_schema)) {
        console.log(`  ${schema}: ${count}`);
      }
      console.log();
    } catch (error) {
      logger.error({ error }, 'Cache stats command failed');
      console.error(`\n✗ Failed to retrieve cache stats: ${error}\n`);
      process.exit(1);
    } finally {
      closeCache();
    }
  });

// Cache clear command
program
  .command('cache-clear')
  .description('Clear the LLM cache')
  .action(() => {
    try {
      const cache = getCache();
      cache.clear();
      console.log('\n✓ Cache cleared successfully\n');
    } catch (error) {
      logger.error({ error }, 'Cache clear command failed');
      console.error(`\n✗ Failed to clear cache: ${error}\n`);
      process.exit(1);
    } finally {
      closeCache();
    }
  });

// Parse command line arguments
program.parse();
