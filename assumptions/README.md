# Disease-Specific Assumption Overrides

This directory contains **OPTIONAL** disease-specific override files for the demand forecasting pipeline.

## ⚠️ IMPORTANT: These Files Are OPTIONAL

**The system is fully dynamic by default!** The LLM automatically generates all assumptions for ANY disease without needing these files.

Override files are ONLY needed when you want to:
- Lock in specific epidemiological data (e.g., from a trusted source)
- Override LLM suggestions with your own data
- Ensure reproducibility across runs

**For a new disease/molecule**: Just run the pipeline - no override file needed!

## How It Works (3-Tier Fallback)

The pipeline resolves assumptions in this priority order:

1. **User overrides (OPTIONAL)**:
   - Disease-specific file: `assumptions/<disease_name>.json`
   - Disease name is sanitized: lowercase, spaces → underscores
   - Example: "rheumatoid arthritis" → `rheumatoid_arthritis.json`

2. **LLM suggestions (ALWAYS RUNS)**:
   - Uses GPT-4o with web search to dynamically generate:
     - Incidence & prevalence
     - Subtype/stage distributions
     - Treatment rates
     - Time on treatment
   - Works for ANY disease automatically!

3. **Defaults**: Generic fallbacks for vial sizes, wastage policy, etc.

## File Structure

Each override file should contain the parameters you want to override:

```json
{
  "incidence_2024": 300000,
  "prevalence_2024": 3800000,
  "subtype_shares": {
    "HER2+": 0.20
  },
  "stage_shares": {
    "adjuvant": 0.40,
    "neoadjuvant": 0.25,
    "metastatic": 0.35
  },
  "line_shares": {
    "1L": 1.0,
    "2L": 0.40
  },
  "time_on_treatment_months": {
    "1L": 15,
    "2L": 10
  },
  "treated_rate": 0.85
}
```

## Available Parameters

- `incidence_2024`: Annual new cases
- `prevalence_2024`: Total living patients
- `subtype_shares`: Distribution across molecular subtypes (object, must sum to ~1.0)
- `stage_shares`: Distribution across disease stages (object, must sum to ~1.0)
- `setting_shares`: Alternative to stage_shares for setting-based allocation
- `line_shares`: Distribution across treatment lines (object)
- `time_on_treatment_months`: Duration on treatment per line (object)
- `treated_rate`: Proportion of eligible patients receiving treatment (0.0-1.0)
- `incidence_cagr`: Annual growth rate for incidence (e.g., 0.01 = 1%)
- `avg_weight_kg`: Average patient weight for mg/kg dosing
- `relative_dose_intensity`: Dose intensity adjustment (0.0-1.0)

## Examples

### Breast Cancer (`breast_cancer.json`)
```json
{
  "incidence_2024": 300000,
  "prevalence_2024": 3800000,
  "subtype_shares": {
    "HER2+": 0.20,
    "HR+/HER2-": 0.65,
    "TNBC": 0.15
  },
  "stage_shares": {
    "adjuvant": 0.40,
    "neoadjuvant": 0.25,
    "metastatic": 0.35
  }
}
```

### Lupus (`lupus.json`)
```json
{
  "incidence_2024": 16000,
  "prevalence_2024": 204000,
  "subtype_shares": {
    "systemic_lupus_erythematosus": 1.0
  },
  "stage_shares": {
    "chronic_treatment": 1.0
  },
  "treated_rate": 0.60
}
```

### Lung Cancer (`lung_cancer.json`)
```json
{
  "incidence_2024": 235000,
  "prevalence_2024": 580000,
  "subtype_shares": {
    "NSCLC": 0.85,
    "SCLC": 0.15
  },
  "stage_shares": {
    "early_stage": 0.25,
    "locally_advanced": 0.30,
    "metastatic": 0.45
  }
}
```

## Tips

- Only override the parameters you need - others will use LLM suggestions
- Make sure shares sum to approximately 1.0
- Use realistic epidemiological data from SEER, cancer registries, or published literature
- Test with different overrides to understand sensitivity

## Priority Order

If you have both `breast_cancer.json` and `overrides.json`:
- Pipeline will use `breast_cancer.json` for breast cancer runs
- `overrides.json` is used for diseases without specific files
