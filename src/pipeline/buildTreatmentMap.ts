/**
 * Stage 1: Build treatment landscape map with iterative evidence refinement
 */

import { getClient } from '../llm/client.js';
import {
  TreatmentMapDraftSchema,
  MissingnessCheckSchema,
  TREATMENT_MAP_DRAFT_JSON_SCHEMA,
  MISSINGNESS_CHECK_JSON_SCHEMA,
} from '../llm/schemas.js';
import {
  LANDSCAPE_DRAFT_SYSTEM_PROMPT,
  MISSINGNESS_CHECK_SYSTEM_PROMPT,
  createLandscapeDraftUserPrompt,
  createMissingnessCheckUserPrompt,
} from '../llm/prompts.js';
import { createLogger } from '../utils/log.js';
import type { NormalizedInput, TreatmentMap, AuditLogEntry } from '../domain/types.js';

const logger = createLogger('treatment-map');

export interface BuildTreatmentMapOptions {
  max_iterations?: number;
  completeness_threshold?: number;
}

export async function buildTreatmentMap(
  normalized_input: NormalizedInput,
  geo: string,
  options: BuildTreatmentMapOptions = {},
  use_cache: boolean = true
): Promise<{ map: TreatmentMap; audit: AuditLogEntry[] }> {
  const max_iterations = options.max_iterations || 3;
  const completeness_threshold = options.completeness_threshold || 0.85;

  logger.info({ geo, max_iterations }, 'Building treatment landscape map');

  const client = getClient();
  const audit_log: AuditLogEntry[] = [];

  // Step 1: Generate initial draft
  logger.info('Generating initial treatment map draft');

  const draft_prompt = createLandscapeDraftUserPrompt(normalized_input, geo);
  const draft_result = await client.callWithSchema(
    'TreatmentMapDraft',
    TREATMENT_MAP_DRAFT_JSON_SCHEMA,
    TreatmentMapDraftSchema,
    LANDSCAPE_DRAFT_SYSTEM_PROMPT,
    draft_prompt,
    { use_tools: true, use_cache, max_tokens: 8000 }
  );

  audit_log.push({
    timestamp: new Date().toISOString(),
    stage: 'landscape_draft',
    model_name: 'gpt-4o-2024-08-06',
    prompt_hash: draft_result.prompt_hash,
    prompt_preview: draft_prompt,
    response_hash: draft_result.response_hash,
    tool_queries: draft_result.tool_outputs?.map((t: any) => t.query),
    cached: draft_result.cached,
    tokens_used: draft_result.tokens_used,
  });

  let current_draft = draft_result.data;

  logger.info(
    {
      nodes_count: current_draft.nodes.length,
      citations_count: current_draft.evidence_index.length,
      needs_evidence_count: current_draft.needs_evidence_flags.length,
    },
    'Initial draft generated'
  );

  // Step 2: Iterative evidence refinement and missingness checks
  let iteration = 0;
  let completeness_score = 0;

  while (iteration < max_iterations) {
    iteration++;
    logger.info({ iteration }, 'Running missingness check');

    // Run missingness check
    const missingness_prompt = createMissingnessCheckUserPrompt(current_draft, geo);
    const missingness_result = await client.callWithSchema(
      'MissingnessCheck',
      MISSINGNESS_CHECK_JSON_SCHEMA,
      MissingnessCheckSchema,
      MISSINGNESS_CHECK_SYSTEM_PROMPT,
      missingness_prompt,
      { use_tools: false, use_cache, max_tokens: 4000 }
    );

    audit_log.push({
      timestamp: new Date().toISOString(),
      stage: `missingness_check_iter${iteration}`,
      model_name: 'gpt-4o-2024-08-06',
      prompt_hash: missingness_result.prompt_hash,
      prompt_preview: missingness_prompt,
      response_hash: missingness_result.response_hash,
      cached: missingness_result.cached,
      tokens_used: missingness_result.tokens_used,
      confidence: missingness_result.data.map_completeness_score,
    });

    completeness_score = missingness_result.data.map_completeness_score;

    logger.info(
      {
        completeness_score,
        missing_subtypes: missingness_result.data.missing_subtypes.length,
        missing_lines: missingness_result.data.missing_lines.length,
        missing_regimens: missingness_result.data.missing_regimens.length,
      },
      'Missingness check completed'
    );

    // Check if we've reached sufficient completeness
    if (completeness_score >= completeness_threshold) {
      logger.info(
        { completeness_score, threshold: completeness_threshold },
        'Map completeness threshold reached'
      );
      break;
    }

    // If there are significant gaps and we haven't hit max iterations,
    // we would trigger another evidence refinement pass here
    // For MVP, we'll use the draft as-is after the missingness check
    logger.info('Map refinement could continue but stopping at current iteration for MVP');
    break;
  }

  // Step 3: Finalize treatment map
  const treatment_map: TreatmentMap = {
    disease: normalized_input.canonical_disease_name,
    molecule: normalized_input.canonical_molecule_name,
    geo,
    map_version: `v1_${new Date().toISOString().split('T')[0]}`,
    generated_at: new Date().toISOString(),
    nodes: current_draft.nodes.map((node) => ({
      node_id: node.node_id,
      subtype_key: node.subtype_key,
      setting_key: node.setting_key,
      stage_key: node.stage_key,
      line_key: node.line_key,
      regimen_key: node.regimen_key,
      regimen_name_human: node.regimen_name_human,
      molecule_role: node.molecule_role,
      route: node.route,
      dose_schema: node.dose_schema,
      duration_rule: node.duration_rule,
      duration_value: node.duration_value,
      combination_partners: node.combination_partners,
      is_standard_of_care: node.is_standard_of_care,
      confidence: node.confidence,
      citation_ids: node.citation_ids,
      notes: node.notes,
    })),
    evidence_index: current_draft.evidence_index.map((cite) => ({
      citation_id: cite.citation_id,
      url: cite.url,
      title: cite.title,
      snippet: cite.snippet,
      accessed_at: cite.accessed_at,
    })),
    exclusions: current_draft.exclusions.map((excl) => ({
      subtype_key: excl.subtype_key,
      setting_key: excl.setting_key,
      stage_key: excl.stage_key,
      line_key: excl.line_key,
      rationale: excl.rationale,
      citation_ids: excl.citation_ids,
    })),
  };

  // Validate map (basic sanity checks)
  validateTreatmentMap(treatment_map);

  logger.info(
    {
      total_nodes: treatment_map.nodes.length,
      total_citations: treatment_map.evidence_index.length,
      completeness_score,
    },
    'Treatment map build completed'
  );

  return { map: treatment_map, audit: audit_log };
}

function validateTreatmentMap(map: TreatmentMap): void {
  const logger = createLogger('map-validator');

  // Check for duplicate node IDs
  const node_ids = map.nodes.map((n) => n.node_id);
  const unique_ids = new Set(node_ids);

  if (unique_ids.size !== node_ids.length) {
    const duplicates = node_ids.filter((id, index) => node_ids.indexOf(id) !== index);
    logger.warn({ duplicates }, 'Duplicate node IDs found');
  }

  // Check for missing citations
  const citation_ids = new Set(map.evidence_index.map((c) => c.citation_id));
  for (const node of map.nodes) {
    for (const cite_id of node.citation_ids) {
      if (!citation_ids.has(cite_id)) {
        logger.warn({ node_id: node.node_id, missing_citation: cite_id }, 'Missing citation');
      }
    }
  }

  // Check confidence scores
  const low_confidence_nodes = map.nodes.filter((n) => n.confidence < 0.5);
  if (low_confidence_nodes.length > 0) {
    logger.warn(
      { count: low_confidence_nodes.length },
      'Some nodes have low confidence scores (<0.5)'
    );
  }

  // Check for reasonable dosing values
  for (const node of map.nodes) {
    const maintenance_value = node.dose_schema.maintenance.value;
    if (maintenance_value <= 0 || maintenance_value > 10000) {
      logger.warn(
        { node_id: node.node_id, value: maintenance_value },
        'Suspicious dose value'
      );
    }

    if (node.dose_schema.interval_days <= 0 || node.dose_schema.interval_days > 365) {
      logger.warn(
        { node_id: node.node_id, interval: node.dose_schema.interval_days },
        'Suspicious interval'
      );
    }
  }

  logger.info('Treatment map validation completed');
}
