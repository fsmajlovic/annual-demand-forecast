/**
 * Stage 0: Normalize inputs
 */

import { getClient } from '../llm/client.js';
import {
  NormalizationResultSchema,
  NORMALIZATION_JSON_SCHEMA,
  type NormalizationResult,
} from '../llm/schemas.js';
import {
  NORMALIZATION_SYSTEM_PROMPT,
  createNormalizationUserPrompt,
} from '../llm/prompts.js';
import { createLogger } from '../utils/log.js';
import type { PipelineInputs } from '../domain/types.js';
import type { AuditLogEntry } from '../domain/types.js';

const logger = createLogger('normalize');

export async function normalizeInputs(
  inputs: PipelineInputs
): Promise<{ result: NormalizationResult; audit: AuditLogEntry }> {
  logger.info({ inputs }, 'Normalizing inputs');

  const client = getClient();
  const user_prompt = createNormalizationUserPrompt(inputs.disease, inputs.molecule, inputs.geo);

  const llm_result = await client.callWithSchema(
    'NormalizationResult',
    NORMALIZATION_JSON_SCHEMA,
    NormalizationResultSchema,
    NORMALIZATION_SYSTEM_PROMPT,
    user_prompt,
    { use_tools: true, use_cache: !inputs.disableCache }
  );

  const audit_entry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    stage: 'normalize',
    model_name: 'gpt-4o-2024-08-06',
    prompt_hash: llm_result.prompt_hash,
    prompt_preview: user_prompt.substring(0, 200),
    response_hash: llm_result.response_hash,
    tool_queries: llm_result.tool_outputs?.map((t: any) => t.query),
    cached: llm_result.cached,
    tokens_used: llm_result.tokens_used,
  };

  logger.info(
    {
      canonical_disease: llm_result.data.canonical_disease_name,
      canonical_molecule: llm_result.data.canonical_molecule_name,
      cached: llm_result.cached,
    },
    'Normalization completed'
  );

  return {
    result: llm_result.data,
    audit: audit_entry,
  };
}
