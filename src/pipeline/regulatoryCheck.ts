/**
 * Stage 0.5: Regulatory status check
 * Determines if molecule has FDA approval, is in clinical trials, or discontinued
 */

import { getClient } from '../llm/client.js';
import {
  RegulatoryStatusSchema,
  REGULATORY_STATUS_JSON_SCHEMA,
  type RegulatoryStatus,
} from '../llm/schemas.js';
import {
  REGULATORY_STATUS_SYSTEM_PROMPT,
  createRegulatoryStatusUserPrompt,
} from '../llm/prompts.js';
import { createLogger } from '../utils/log.js';
import type { AuditLogEntry } from '../domain/types.js';

const logger = createLogger('regulatory-check');

export interface RegulatoryCheckResult {
  status: RegulatoryStatus;
  audit: AuditLogEntry;
}

export async function checkRegulatoryStatus(
  disease: string,
  molecule: string,
  geo: string,
  use_cache: boolean = true
): Promise<RegulatoryCheckResult> {
  logger.info({ disease, molecule, geo }, 'Checking regulatory status');

  const client = getClient();
  const user_prompt = createRegulatoryStatusUserPrompt(disease, molecule, geo);

  const llm_result = await client.callWithSchema(
    'RegulatoryStatus',
    REGULATORY_STATUS_JSON_SCHEMA,
    RegulatoryStatusSchema,
    REGULATORY_STATUS_SYSTEM_PROMPT,
    user_prompt,
    { use_tools: true, use_cache }
  );

  const status = llm_result.data;

  // Log warning if status indicates unreliable data
  if (status.status !== 'approved') {
    logger.warn(
      {
        molecule,
        disease,
        status: status.status,
        warning: status.data_reliability_warning,
      },
      'Molecule has limited regulatory status - data may be unreliable'
    );
  }

  const audit_entry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    stage: 'regulatory_check',
    model_name: 'gpt-4o-2024-08-06',
    prompt_hash: llm_result.prompt_hash,
    prompt_preview: user_prompt,
    response_hash: llm_result.response_hash,
    tool_queries: llm_result.tool_outputs?.map((t: any) => t.query),
    cached: llm_result.cached,
    tokens_used: llm_result.tokens_used,
  };

  logger.info(
    {
      status: status.status,
      fda_approved: status.fda_approved,
      is_commercially_available: status.is_commercially_available,
      cached: llm_result.cached,
    },
    'Regulatory status check completed'
  );

  return {
    status,
    audit: audit_entry,
  };
}

/**
 * Check if regulatory status indicates data reliability issues
 */
export function hasDataReliabilityWarning(status: RegulatoryStatus): boolean {
  return (
    status.status !== 'approved' ||
    !status.is_commercially_available ||
    status.data_reliability_warning !== null
  );
}

/**
 * Get a human-readable summary of regulatory status
 */
export function getRegulatoryStatusSummary(status: RegulatoryStatus): string {
  switch (status.status) {
    case 'approved':
      return status.is_commercially_available
        ? `FDA-approved (${status.fda_approval_date || 'date unknown'})`
        : 'FDA-approved but not commercially available';
    case 'clinical_testing_only':
      return `Clinical testing only (${status.current_phase || 'phase unknown'})`;
    case 'no_fda_approval':
      return status.ema_approved
        ? 'No FDA approval (EMA-approved)'
        : 'No FDA or EMA approval';
    case 'discontinued':
      return `Discontinued (${status.discontinuation_date || 'date unknown'})`;
    case 'withdrawn':
      return `Withdrawn from market (${status.discontinuation_reason || 'reason unknown'})`;
    default:
      return 'Unknown status';
  }
}
