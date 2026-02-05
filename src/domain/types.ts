/**
 * Core domain types for the demand forecasting pipeline
 */

export interface PipelineInputs {
  disease: string;
  molecule: string;
  geo: string;
  baseYear: number;
  horizonYears: number;
  disableCache?: boolean;
}

export interface NormalizedInput {
  canonical_disease_name: string;
  disease_ontology_tags: string[];
  canonical_molecule_name: string;
  molecule_brands: string[];
  molecule_biosimilars: string[];
  molecule_mechanism: string;
  biomarker_requirements: string[];
  contraindicated_subtypes: string[];
  candidate_subtypes: string[];
  candidate_settings: string[];
  candidate_stages: string[];
  candidate_lines: string[];
}

export interface DoseSchema {
  type: 'mg_per_kg' | 'fixed_mg' | 'mg_per_m2' | 'other';
  loading?: {
    value: number;
    unit: string;
    repeats?: number;
  } | null;
  maintenance: {
    value: number;
    unit: string;
  };
  interval_days: number;
  notes?: string | null;
}

export interface TreatmentNode {
  node_id: string;
  subtype_key: string | null;
  setting_key: string | null;
  stage_key: string | null;
  line_key: string | null;
  regimen_key: string;
  regimen_name_human: string;
  molecule_role: 'backbone' | 'combo_partner' | 'maintenance' | 'adc_component' | 'other';
  route: 'IV' | 'SC' | 'PO' | 'IM' | 'other';
  dose_schema: DoseSchema;
  duration_rule:
    | 'fixed_months'
    | 'fixed_cycles'
    | 'until_progression'
    | 'until_unacceptable_toxicity'
    | 'other';
  duration_value: number | null;
  combination_partners: string[];
  is_standard_of_care: boolean;
  confidence: number;
  citation_ids: string[];
  notes?: string | null;
}

export interface Citation {
  citation_id: string;
  url: string;
  title: string;
  snippet: string;
  accessed_at: string;
}

export interface Exclusion {
  subtype_key?: string | null;
  setting_key?: string | null;
  stage_key?: string | null;
  line_key?: string | null;
  rationale: string;
  citation_ids: string[];
}

export interface TreatmentMap {
  disease: string;
  molecule: string;
  geo: string;
  map_version: string;
  generated_at: string;
  nodes: TreatmentNode[];
  evidence_index: Citation[];
  exclusions: Exclusion[];
}

export interface VialSize {
  size_mg: number;
  is_single_dose: boolean;
}

export interface WastagePolicy {
  allow_multi_dose_sharing: boolean;
  discard_leftover: boolean;
}

export interface Assumptions {
  base_year: number;
  horizon_years: number;
  avg_weight_kg: number | { mean: number; sd: number };
  vial_sizes: {
    IV?: VialSize[];
    SC?: VialSize[];
  };
  wastage_policy: WastagePolicy;
  incidence?: number;
  prevalence?: number;
  subtype_shares?: Record<string, number>;
  stage_shares?: Record<string, number>;
  setting_shares?: Record<string, number>;
  treated_rate: number;
  line_shares?: Record<string, number>;
  time_on_treatment_months?: Record<string, number>;
  incidence_cagr?: number;
  prevalence_cagr?: number;
  treated_rate_changes?: Record<number, number>;
  regimen_adoption_curves?: Record<string, Record<number, number>>;
  relative_dose_intensity?: number;
  scenarios?: {
    base: ScenarioParameters;
    low: ScenarioParameters;
    high: ScenarioParameters;
  };
}

export interface ScenarioParameters {
  incidence_cagr: number;
  treated_rate_multiplier: number;
  tot_multiplier: number;
  adoption_multiplier: number;
}

export interface PopulationNode {
  node_id: string;
  eligible_patients: number;
  treated_patients: number;
  patient_years: number;
}

export interface PopulationAllocation {
  base_year: number;
  disease: string;
  molecule: string;
  total_incidence?: number;
  total_prevalence?: number;
  nodes: PopulationNode[];
  rollups: {
    by_subtype?: Record<string, number>;
    by_setting?: Record<string, number>;
    by_line?: Record<string, number>;
  };
}

export interface DemandNode {
  node_id: string;
  treated_patients: number;
  administered_mg_per_patient_year: number;
  dispensed_mg_per_patient_year: number;
  total_administered_mg: number;
  total_dispensed_mg: number;
}

export interface ForecastRecord {
  year: number;
  node_id: string;
  scenario: string;
  treated_patients: number;
  patient_years: number;
  administered_mg_per_patient_year: number;
  total_administered_mg: number;
  total_dispensed_mg: number;
}

export interface AuditLogEntry {
  timestamp: string;
  stage: string;
  model_name: string;
  prompt_hash: string;
  prompt_preview: string;
  response_hash: string;
  tool_queries?: string[];
  citations?: string[];
  confidence?: number;
  tokens_used?: number;
  cached: boolean;
}

export interface RunMetadata {
  run_id: string;
  created_at: string;
  inputs: PipelineInputs;
  assumptions_hash: string;
  treatment_map_hash: string;
  status: 'running' | 'completed' | 'failed';
  error?: string;
}
