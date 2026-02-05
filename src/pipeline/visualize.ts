/**
 * Stage: Visualization (CLI only - not used by web UI)
 */

import { createLogger } from '../utils/log.js';

const logger = createLogger('visualize');

export async function visualizeResults(run_id: string): Promise<void> {
  logger.info({ run_id }, 'Visualization function placeholder');
  console.log('\nVisualization output temporarily unavailable during refactoring.');
  console.log('Use the web UI for full results visualization.\n');
}

export async function generateTables(run_id: string): Promise<void> {
  logger.info({ run_id }, 'Table generation placeholder');
  console.log('\nTable generation temporarily unavailable during refactoring.');
  console.log('Use the web UI for full results display.\n');
}
