/**
 * Resolve assumptions: LLM suggestions + user overrides + defaults
 */

import { getClient } from '../llm/client.js';
import {
  AssumptionsSuggestionSchema,
  ASSUMPTIONS_SUGGESTION_JSON_SCHEMA,
} from '../llm/schemas.js';
import {
  ASSUMPTIONS_SUGGESTION_SYSTEM_PROMPT,
  createAssumptionsSuggestionUserPrompt,
} from '../llm/prompts.js';
import { createLogger } from '../utils/log.js';
import { readJson, fileExists } from '../utils/io.js';
import type { Assumptions, TreatmentMap, AuditLogEntry } from '../domain/types.js';
import { join } from 'path';

const logger = createLogger('assumptions');

const DEFAULT_ASSUMPTIONS: Partial<Assumptions> = {
  avg_weight_kg: 70,
  vial_sizes: {
    IV: [
      { size_mg: 150, is_single_dose: true },
      { size_mg: 420, is_single_dose: true },
    ],
    SC: [{ size_mg: 600, is_single_dose: true }],
  },
  wastage_policy: {
    allow_multi_dose_sharing: false,
    discard_leftover: true,
  },
  treated_rate: 0.85,
  relative_dose_intensity: 1.0,
  scenarios: {
    base: {
      incidence_cagr: 0.005,
      treated_rate_multiplier: 1.0,
      tot_multiplier: 1.0,
      adoption_multiplier: 1.0,
    },
    low: {
      incidence_cagr: 0.0,
      treated_rate_multiplier: 0.9,
      tot_multiplier: 0.9,
      adoption_multiplier: 0.85,
    },
    high: {
      incidence_cagr: 0.01,
      treated_rate_multiplier: 1.1,
      tot_multiplier: 1.1,
      adoption_multiplier: 1.15,
    },
  },
};

export async function resolveAssumptions(
  disease: string,
  molecule: string,
  treatment_map: TreatmentMap,
  geo: string,
  base_year: number,
  horizon_years: number,
  use_cache: boolean = true
): Promise<{ assumptions: Assumptions; audit: AuditLogEntry }> {
  logger.info({ disease, molecule, geo, base_year }, 'Resolving assumptions');

  // Step 1: Get LLM suggestions
  const client = getClient();
  const suggestion_prompt = createAssumptionsSuggestionUserPrompt(
    disease,
    molecule,
    treatment_map,
    geo,
    base_year
  );

  const suggestion_result = await client.callWithSchema(
    'AssumptionsSuggestion',
    ASSUMPTIONS_SUGGESTION_JSON_SCHEMA,
    AssumptionsSuggestionSchema,
    ASSUMPTIONS_SUGGESTION_SYSTEM_PROMPT,
    suggestion_prompt,
    { use_tools: true, use_cache, max_tokens: 6000 }
  );

  const suggestions = suggestion_result.data;

  logger.info(
    {
      incidence: suggestions.incidence.value,
      prevalence: suggestions.prevalence.value,
      cached: suggestion_result.cached,
    },
    'LLM assumptions received'
  );

  // Step 2: Load user overrides if they exist
  // Try disease-specific override file first, then fall back to generic overrides.json
  const disease_filename = disease.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const disease_overrides_path = join(process.cwd(), 'assumptions', `${disease_filename}.json`);
  const generic_overrides_path = join(process.cwd(), 'assumptions', 'overrides.json');

  let user_overrides: Partial<Assumptions> = {};
  let overrides_source: string | null = null;

  if (await fileExists(disease_overrides_path)) {
    logger.info({ path: disease_overrides_path }, 'Loading disease-specific assumption overrides');
    user_overrides = await readJson<Partial<Assumptions>>(disease_overrides_path);
    overrides_source = disease_overrides_path;
  } else if (await fileExists(generic_overrides_path)) {
    logger.info({ path: generic_overrides_path }, 'Loading generic assumption overrides');
    user_overrides = await readJson<Partial<Assumptions>>(generic_overrides_path);
    overrides_source = generic_overrides_path;
  } else {
    logger.info('No assumption overrides found - using LLM suggestions only');
  }

  // Step 3: Merge (priority: user overrides > LLM suggestions > defaults)
  const assumptions: Assumptions = {
    base_year,
    horizon_years,
    avg_weight_kg: user_overrides.avg_weight_kg ?? DEFAULT_ASSUMPTIONS.avg_weight_kg!,
    vial_sizes: user_overrides.vial_sizes ?? DEFAULT_ASSUMPTIONS.vial_sizes!,
    wastage_policy: user_overrides.wastage_policy ?? DEFAULT_ASSUMPTIONS.wastage_policy!,
    incidence: user_overrides.incidence ?? suggestions.incidence.value ?? undefined,
    prevalence:
      user_overrides.prevalence ?? suggestions.prevalence.value ?? undefined,
    subtype_shares:
      user_overrides.subtype_shares ??
      Object.fromEntries(
        Object.entries(suggestions.subtype_shares).map(([key, val]) => [key, val.share])
      ),
    stage_shares:
      user_overrides.stage_shares ??
      Object.fromEntries(
        Object.entries(suggestions.stage_shares).map(([key, val]) => [key, val.share])
      ),
    treated_rate: user_overrides.treated_rate ?? suggestions.treated_rate.value,
    time_on_treatment_months:
      user_overrides.time_on_treatment_months ??
      Object.fromEntries(
        Object.entries(suggestions.time_on_treatment_months).map(([key, val]) => [
          key,
          val.months,
        ])
      ),
    incidence_cagr: user_overrides.incidence_cagr ?? suggestions.incidence_cagr.value,
    relative_dose_intensity:
      user_overrides.relative_dose_intensity ?? DEFAULT_ASSUMPTIONS.relative_dose_intensity!,
    scenarios: user_overrides.scenarios ?? DEFAULT_ASSUMPTIONS.scenarios!,
  };

  const audit_entry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    stage: 'assumptions_suggestion',
    model_name: 'gpt-4o-2024-08-06',
    prompt_hash: suggestion_result.prompt_hash,
    prompt_preview: suggestion_prompt.substring(0, 200),
    response_hash: suggestion_result.response_hash,
    tool_queries: suggestion_result.tool_outputs?.map((t: any) => t.query),
    cached: suggestion_result.cached,
    tokens_used: suggestion_result.tokens_used,
  };

  logger.info(
    {
      incidence: assumptions.incidence,
      treated_rate: assumptions.treated_rate,
      has_overrides: Object.keys(user_overrides).length > 0,
      overrides_source,
    },
    'Assumptions resolved'
  );

  return { assumptions, audit: audit_entry };
}
