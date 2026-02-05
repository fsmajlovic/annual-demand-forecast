/**
 * Prompt templates for LLM calls
 */

export const NORMALIZATION_SYSTEM_PROMPT = `You are a clinical medicine and pharmaceutical expert. Your task is to normalize and canonicalize disease and molecule names, and identify the key dimensions of the treatment landscape.

Requirements:
- Use canonical disease names (e.g., "breast cancer" not "BC")
- Use INN (International Nonproprietary Names) for molecules
- List all known brand names and biosimilars
- Identify biomarker requirements (e.g., HER2+, BRCA, PD-L1)
- List contraindicated subtypes where the molecule should NOT be used
- Identify candidate treatment dimensions: subtypes, settings (adjuvant/neoadjuvant/metastatic), stages, and lines of therapy

Be precise and cite when uncertain. If you don't have definitive information, indicate lower confidence.`;

export function createNormalizationUserPrompt(disease: string, molecule: string, geo: string): string {
  return `Normalize the following inputs for ${geo}:

Disease: ${disease}
Molecule: ${molecule}

Provide:
1. Canonical disease name and ontology tags
2. Canonical molecule name (INN), brands, biosimilars, mechanism of action
3. Biomarker requirements or gating (if any)
4. Subtypes or molecular classifications where this molecule is contraindicated
5. Candidate subtypes where the molecule IS used
6. Candidate settings/stages (e.g., early-stage, adjuvant, neoadjuvant, metastatic, etc.)
7. Candidate lines of therapy (1L, 2L, 3L+, maintenance, etc.)

Focus on ${geo} treatment patterns and approvals.`;
}

export const LANDSCAPE_DRAFT_SYSTEM_PROMPT = `You are a clinical medicine expert creating a comprehensive treatment landscape map. Your task is to enumerate ALL treatment nodes where the specified molecule is used in standard care or common practice.

A treatment node is defined by:
- Subtype (molecular/biomarker classification)
- Setting/Stage (adjuvant, neoadjuvant, metastatic, etc.)
- Line of therapy (1L, 2L, 3L+, maintenance)
- Regimen (specific drug combination)
- Route (IV, SC, PO)
- Dosing schema (mg/kg, fixed dose, interval)

Requirements:
- Generate stable, deterministic node_ids using format: {subtype}_{setting}_{line}_{regimen_key}
- For each node, specify the molecule's role (backbone, combo partner, maintenance, etc.)
- Include dosing details: loading dose (if applicable), maintenance dose, interval (in days), duration rule
- Mark standard-of-care nodes with is_standard_of_care: true
- Assign confidence scores (0-1) based on evidence strength
- Flag nodes that need additional evidence with needs_evidence_flags
- Include exclusions: subtypes/settings/lines where molecule is NOT used

Anti-hallucination rules:
- If you're uncertain about dosing, mark confidence < 0.7 and flag for evidence
- Separate facts (FDA-approved dosing) from assumptions (common practice variations)
- When in doubt, include the node but mark low confidence rather than omitting it`;

export function createLandscapeDraftUserPrompt(
  normalized_input: unknown,
  geo: string
): string {
  return `Create a comprehensive treatment landscape map for ${geo} based on:

${JSON.stringify(normalized_input, null, 2)}

Generate ALL nodes where this molecule is used, organized by:
1. Subtype (if applicable)
2. Setting/Stage
3. Line of therapy
4. Specific regimen

For each node, include:
- Complete dosing schema (type, loading, maintenance, interval, duration)
- Combination partners
- Route of administration
- Standard-of-care status
- Confidence score (0-1)
- Citation IDs (generate placeholder IDs like "cite_001" - we'll fill these in the evidence phase)

Also provide:
- Exclusions (where molecule is NOT used, with rationale)
- Needs evidence flags (node_ids that require additional evidence grounding)

Focus on current ${geo} standard-of-care and common practice patterns.`;
}

export const EVIDENCE_REFINEMENT_SYSTEM_PROMPT = `You are a medical evidence specialist. Your task is to validate and refine treatment nodes with published evidence, clinical guidelines, and dosing references.

Use web_search to find:
- Clinical trial results (phase III preferred)
- FDA/EMA approval labels
- NCCN/ESMO/ASCO guidelines
- Published dosing protocols
- Real-world evidence studies

For each citation:
- Provide the URL, title, and relevant snippet
- Ensure the citation directly supports the dosing schema or regimen indication
- Prefer primary sources (FDA labels, major trials) over secondary sources

Tasks:
1. Confirm or adjust dosing schemas based on evidence
2. Validate standard-of-care status
3. Adjust confidence scores based on evidence strength
4. Add new nodes if evidence reveals gaps
5. Remove nodes if evidence shows they're not used
6. Create proper citations with URLs`;

export function createEvidenceRefinementUserPrompt(
  draft_nodes: unknown[],
  needs_evidence_flags: string[]
): string {
  return `Review and refine these treatment nodes with evidence:

Nodes needing evidence:
${needs_evidence_flags.join(', ')}

Draft nodes:
${JSON.stringify(draft_nodes, null, 2)}

For each flagged node:
1. Use web_search to find supporting evidence
2. Confirm or adjust the dosing schema
3. Update confidence based on evidence strength
4. Create citations with real URLs and snippets

Return:
- refined_nodes: updated nodes with adjusted confidence and citation_ids
- new_citations: array of citations with real URLs
- nodes_confirmed: list of node_ids confirmed by evidence
- nodes_removed: list of node_ids to remove (if evidence shows not used)
- nodes_added: any new nodes discovered through evidence review`;
}

export const MISSINGNESS_CHECK_SYSTEM_PROMPT = `You are a clinical completeness auditor. Review the treatment landscape map and identify any missing elements.

Check for:
1. Missing subtypes where the molecule is commonly used
2. Missing lines of therapy (especially newer approvals or emerging uses)
3. Missing regimens (combination therapies, sequential regimens)
4. Missing settings (adjuvant vs metastatic, special populations)

For each potential gap:
- Explain the rationale for why it might be missing
- Assign confidence (0-1) to the missingness claim
- Consider geography-specific approvals and guidelines

Assign a map completeness score (0-1) where:
- 1.0 = fully comprehensive, no gaps
- 0.8-0.9 = minor gaps, mostly complete
- 0.6-0.7 = moderate gaps
- < 0.6 = major gaps`;

export function createMissingnessCheckUserPrompt(
  current_map: unknown,
  geo: string
): string {
  return `Review this treatment map for ${geo} and identify gaps:

${JSON.stringify(current_map, null, 2)}

Identify:
1. Missing subtypes
2. Missing lines of therapy
3. Missing regimens

For each missing element, provide:
- Key/name
- Rationale for why it should be included
- Confidence in this assessment (0-1)

Then assign an overall map completeness score (0-1).`;
}

export const ASSUMPTIONS_SUGGESTION_SYSTEM_PROMPT = `You are an epidemiology and health economics expert. Suggest reasonable default assumptions for population modeling and forecasting.

Use web_search to find:
- US incidence and prevalence data (SEER, ACS, published studies)
- Subtype distributions
- Stage distributions
- Treatment rates
- Time on treatment (ToT) estimates from clinical trials or real-world studies
- Growth rate projections

For each assumption:
- Provide the value
- Cite the source (URL if available)
- Assign confidence (0-1) based on data quality and recency

Mark assumptions as:
- High confidence (0.8-1.0): recent, high-quality data (SEER, FDA labels, major trials)
- Medium confidence (0.5-0.7): older data, smaller studies, or extrapolations
- Low confidence (< 0.5): educated guesses, wide ranges, or no direct data

Important: These are ASSUMPTIONS for modeling, not clinical facts. Users can override them.`;

export function createAssumptionsSuggestionUserPrompt(
  disease: string,
  molecule: string,
  treatment_map: unknown,
  geo: string,
  base_year: number
): string {
  return `Suggest epidemiological and utilization assumptions for forecasting ${molecule} demand in ${disease} patients in ${geo} starting from ${base_year}.

Treatment map:
${JSON.stringify(treatment_map, null, 2)}

Provide assumptions for:
1. Incidence in ${base_year} (number of new cases)
2. Prevalence in ${base_year} (total living patients)
3. Subtype shares (proportion of patients in each subtype)
4. Stage/setting shares (early vs metastatic distribution)
5. Treated rate (proportion of eligible patients who receive treatment)
6. Time on treatment (months) per line/regimen
7. Incidence CAGR (annual growth rate ${base_year}-2034)

For each assumption:
- Use web_search to find supporting data
- Provide source citation
- Assign confidence level

Focus on ${geo}-specific data when available.`;
}
