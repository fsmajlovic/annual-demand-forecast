/**
 * Zod schemas for validating LLM outputs with structured outputs
 */

import { z } from 'zod';

// Normalization schema
export const NormalizationResultSchema = z.object({
  canonical_disease_name: z.string(),
  disease_ontology_tags: z.array(z.string()),
  canonical_molecule_name: z.string(),
  molecule_brands: z.array(z.string()),
  molecule_biosimilars: z.array(z.string()),
  molecule_mechanism: z.string(),
  biomarker_requirements: z.array(z.string()),
  contraindicated_subtypes: z.array(z.string()),
  candidate_subtypes: z.array(z.string()),
  candidate_settings: z.array(z.string()),
  candidate_stages: z.array(z.string()),
  candidate_lines: z.array(z.string()),
});

export type NormalizationResult = z.infer<typeof NormalizationResultSchema>;

// Dose schema
export const DoseSchemaSchema = z.object({
  type: z.enum(['mg_per_kg', 'fixed_mg', 'mg_per_m2', 'other']),
  loading: z
    .object({
      value: z.number(),
      unit: z.string(),
      repeats: z.number(),
    })
    .nullable(),
  maintenance: z.object({
    value: z.number(),
    unit: z.string(),
  }),
  interval_days: z.number(),
  notes: z.string().nullable(),
});

// Treatment node schema
export const TreatmentNodeSchema = z.object({
  node_id: z.string(),
  subtype_key: z.string().nullable(),
  setting_key: z.string().nullable(),
  stage_key: z.string().nullable(),
  line_key: z.string().nullable(),
  regimen_key: z.string(),
  regimen_name_human: z.string(),
  molecule_role: z.enum(['backbone', 'combo_partner', 'maintenance', 'adc_component', 'other']),
  route: z.enum(['IV', 'SC', 'PO', 'IM', 'other']),
  dose_schema: DoseSchemaSchema,
  duration_rule: z.enum([
    'fixed_months',
    'fixed_cycles',
    'until_progression',
    'until_unacceptable_toxicity',
    'other',
  ]),
  duration_value: z.number().nullable(),
  combination_partners: z.array(z.string()),
  is_standard_of_care: z.boolean(),
  confidence: z.number().min(0).max(1),
  citation_ids: z.array(z.string()),
  notes: z.string().nullable(),
});

export type TreatmentNodeOutput = z.infer<typeof TreatmentNodeSchema>;

// Citation schema
export const CitationSchema = z.object({
  citation_id: z.string(),
  url: z.string(),
  title: z.string(),
  snippet: z.string(),
  accessed_at: z.string(),
});

export type CitationOutput = z.infer<typeof CitationSchema>;

// Exclusion schema
export const ExclusionSchema = z.object({
  subtype_key: z.string().nullable(),
  setting_key: z.string().nullable(),
  stage_key: z.string().nullable(),
  line_key: z.string().nullable(),
  rationale: z.string(),
  citation_ids: z.array(z.string()),
});

export type ExclusionOutput = z.infer<typeof ExclusionSchema>;

// Treatment map draft schema
export const TreatmentMapDraftSchema = z.object({
  nodes: z.array(TreatmentNodeSchema),
  evidence_index: z.array(CitationSchema),
  exclusions: z.array(ExclusionSchema),
  needs_evidence_flags: z.array(z.string()),
});

export type TreatmentMapDraft = z.infer<typeof TreatmentMapDraftSchema>;

// Evidence pack schema
export const EvidencePackSchema = z.object({
  refined_nodes: z.array(TreatmentNodeSchema),
  new_citations: z.array(CitationSchema),
  nodes_confirmed: z.array(z.string()),
  nodes_removed: z.array(z.string()),
  nodes_added: z.array(TreatmentNodeSchema),
});

export type EvidencePack = z.infer<typeof EvidencePackSchema>;

// Missingness check schema
export const MissingnessCheckSchema = z.object({
  missing_subtypes: z.array(
    z.object({
      subtype_key: z.string(),
      rationale: z.string(),
      confidence: z.number(),
    })
  ),
  missing_lines: z.array(
    z.object({
      line_key: z.string(),
      setting_key: z.string(),
      rationale: z.string(),
      confidence: z.number(),
    })
  ),
  missing_regimens: z.array(
    z.object({
      regimen_name: z.string(),
      line_key: z.string(),
      setting_key: z.string(),
      rationale: z.string(),
      confidence: z.number(),
    })
  ),
  map_completeness_score: z.number().min(0).max(1),
  notes: z.string(),
});

export type MissingnessCheck = z.infer<typeof MissingnessCheckSchema>;

// Default assumptions suggestion schema
export const AssumptionsSuggestionSchema = z.object({
  incidence: z.object({
    value: z.number().nullable(),
    source: z.string(),
    confidence: z.number(),
  }),
  prevalence: z.object({
    value: z.number().nullable(),
    source: z.string(),
    confidence: z.number(),
  }),
  subtype_shares: z.record(
    z.object({
      share: z.number(),
      source: z.string(),
      confidence: z.number(),
    })
  ),
  stage_shares: z.record(
    z.object({
      share: z.number(),
      source: z.string(),
      confidence: z.number(),
    })
  ),
  treated_rate: z.object({
    value: z.number(),
    source: z.string(),
    confidence: z.number(),
  }),
  time_on_treatment_months: z.record(
    z.object({
      months: z.number(),
      source: z.string(),
      confidence: z.number(),
    })
  ),
  incidence_cagr: z.object({
    value: z.number(),
    source: z.string(),
    confidence: z.number(),
  }),
  notes: z.string(),
});

export type AssumptionsSuggestion = z.infer<typeof AssumptionsSuggestionSchema>;

// Convert Zod schema to JSON Schema for OpenAI structured outputs
export function zodToJsonSchema(_zodSchema: z.ZodType): Record<string, unknown> {
  // This is a simplified conversion - for production use a library like zod-to-json-schema
  // For now, we'll use manual JSON schema definitions
  return {};
}

// Manual JSON schemas for OpenAI (these must match the Zod schemas above)
export const NORMALIZATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    canonical_disease_name: { type: 'string' },
    disease_ontology_tags: { type: 'array', items: { type: 'string' } },
    canonical_molecule_name: { type: 'string' },
    molecule_brands: { type: 'array', items: { type: 'string' } },
    molecule_biosimilars: { type: 'array', items: { type: 'string' } },
    molecule_mechanism: { type: 'string' },
    biomarker_requirements: { type: 'array', items: { type: 'string' } },
    contraindicated_subtypes: { type: 'array', items: { type: 'string' } },
    candidate_subtypes: { type: 'array', items: { type: 'string' } },
    candidate_settings: { type: 'array', items: { type: 'string' } },
    candidate_stages: { type: 'array', items: { type: 'string' } },
    candidate_lines: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'canonical_disease_name',
    'disease_ontology_tags',
    'canonical_molecule_name',
    'molecule_brands',
    'molecule_biosimilars',
    'molecule_mechanism',
    'biomarker_requirements',
    'contraindicated_subtypes',
    'candidate_subtypes',
    'candidate_settings',
    'candidate_stages',
    'candidate_lines',
  ],
  additionalProperties: false,
};

export const DOSE_SCHEMA_JSON = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['mg_per_kg', 'fixed_mg', 'mg_per_m2', 'other'] },
    loading: {
      anyOf: [
        {
          type: 'object',
          properties: {
            value: { type: 'number' },
            unit: { type: 'string' },
            repeats: { type: 'number' },
          },
          required: ['value', 'unit', 'repeats'],
          additionalProperties: false,
        },
        { type: 'null' },
      ],
    },
    maintenance: {
      type: 'object',
      properties: {
        value: { type: 'number' },
        unit: { type: 'string' },
      },
      required: ['value', 'unit'],
      additionalProperties: false,
    },
    interval_days: { type: 'number' },
    notes: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
  },
  required: ['type', 'loading', 'maintenance', 'interval_days', 'notes'],
  additionalProperties: false,
};

export const TREATMENT_NODE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    node_id: { type: 'string' },
    subtype_key: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    setting_key: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    stage_key: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    line_key: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    regimen_key: { type: 'string' },
    regimen_name_human: { type: 'string' },
    molecule_role: {
      type: 'string',
      enum: ['backbone', 'combo_partner', 'maintenance', 'adc_component', 'other'],
    },
    route: { type: 'string', enum: ['IV', 'SC', 'PO', 'IM', 'other'] },
    dose_schema: DOSE_SCHEMA_JSON,
    duration_rule: {
      type: 'string',
      enum: [
        'fixed_months',
        'fixed_cycles',
        'until_progression',
        'until_unacceptable_toxicity',
        'other',
      ],
    },
    duration_value: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    combination_partners: { type: 'array', items: { type: 'string' } },
    is_standard_of_care: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    citation_ids: { type: 'array', items: { type: 'string' } },
    notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: [
    'node_id',
    'subtype_key',
    'setting_key',
    'stage_key',
    'line_key',
    'regimen_key',
    'regimen_name_human',
    'molecule_role',
    'route',
    'dose_schema',
    'duration_rule',
    'duration_value',
    'combination_partners',
    'is_standard_of_care',
    'confidence',
    'citation_ids',
    'notes',
  ],
  additionalProperties: false,
};

export const CITATION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    citation_id: { type: 'string' },
    url: { type: 'string' },
    title: { type: 'string' },
    snippet: { type: 'string' },
    accessed_at: { type: 'string' },
  },
  required: ['citation_id', 'url', 'title', 'snippet', 'accessed_at'],
  additionalProperties: false,
};

export const TREATMENT_MAP_DRAFT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    nodes: { type: 'array', items: TREATMENT_NODE_JSON_SCHEMA },
    evidence_index: { type: 'array', items: CITATION_JSON_SCHEMA },
    exclusions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          subtype_key: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          setting_key: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          stage_key: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          line_key: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          rationale: { type: 'string' },
          citation_ids: { type: 'array', items: { type: 'string' } },
        },
        required: ['subtype_key', 'setting_key', 'stage_key', 'line_key', 'rationale', 'citation_ids'],
        additionalProperties: false,
      },
    },
    needs_evidence_flags: { type: 'array', items: { type: 'string' } },
  },
  required: ['nodes', 'evidence_index', 'exclusions', 'needs_evidence_flags'],
  additionalProperties: false,
};

export const MISSINGNESS_CHECK_JSON_SCHEMA = {
  type: 'object',
  properties: {
    missing_subtypes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          subtype_key: { type: 'string' },
          rationale: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['subtype_key', 'rationale', 'confidence'],
        additionalProperties: false,
      },
    },
    missing_lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          line_key: { type: 'string' },
          setting_key: { type: 'string' },
          rationale: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['line_key', 'setting_key', 'rationale', 'confidence'],
        additionalProperties: false,
      },
    },
    missing_regimens: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          regimen_name: { type: 'string' },
          line_key: { type: 'string' },
          setting_key: { type: 'string' },
          rationale: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['regimen_name', 'line_key', 'setting_key', 'rationale', 'confidence'],
        additionalProperties: false,
      },
    },
    map_completeness_score: { type: 'number', minimum: 0, maximum: 1 },
    notes: { type: 'string' },
  },
  required: [
    'missing_subtypes',
    'missing_lines',
    'missing_regimens',
    'map_completeness_score',
    'notes',
  ],
  additionalProperties: false,
};

export const ASSUMPTIONS_SUGGESTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    incidence: {
      type: 'object',
      properties: {
        value: { type: ['number', 'null'] },
        source: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['value', 'source', 'confidence'],
      additionalProperties: false,
    },
    prevalence: {
      type: 'object',
      properties: {
        value: { type: ['number', 'null'] },
        source: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['value', 'source', 'confidence'],
      additionalProperties: false,
    },
    subtype_shares: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          share: { type: 'number' },
          source: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['share', 'source', 'confidence'],
        additionalProperties: false,
      },
    },
    stage_shares: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          share: { type: 'number' },
          source: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['share', 'source', 'confidence'],
        additionalProperties: false,
      },
    },
    treated_rate: {
      type: 'object',
      properties: {
        value: { type: 'number' },
        source: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['value', 'source', 'confidence'],
      additionalProperties: false,
    },
    time_on_treatment_months: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          months: { type: 'number' },
          source: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['months', 'source', 'confidence'],
        additionalProperties: false,
      },
    },
    incidence_cagr: {
      type: 'object',
      properties: {
        value: { type: 'number' },
        source: { type: 'string' },
        confidence: { type: 'number' },
      },
      required: ['value', 'source', 'confidence'],
      additionalProperties: false,
    },
    notes: { type: 'string' },
  },
  required: [
    'incidence',
    'prevalence',
    'treated_rate',
    'incidence_cagr',
    'notes',
  ],
  additionalProperties: false,
};
