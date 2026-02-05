# Annual Demand Forecast Pipeline

Production-grade pharmaceutical demand forecasting pipeline for generating 10-year annual demand forecasts for therapeutic molecules.

## Features

- **LLM-Powered Treatment Landscape Mapping**: Automatically extracts treatment nodes (subtypes × stages × lines × regimens × dosing) using OpenAI's structured outputs
- **Evidence-Grounded**: Uses web search tools to ground clinical recommendations with citations
- **Deterministic Calculations**: Population allocation, exposure, and forecasting use reproducible math
- **Intelligent Caching**: SQLite-based caching prevents redundant API calls
- **Multi-Scenario Forecasting**: Base/low/high scenarios with configurable growth assumptions
- **Audit Trail**: Complete audit log with prompts, responses, citations, and confidence scores
- **Flexible Assumptions**: Override LLM-suggested assumptions with custom values

## Prerequisites

- Node.js 20+
- pnpm 8+
- OpenAI API key

## Installation

```bash
# Install dependencies
pnpm install

# Set up your OpenAI API key
export OPENAI_API_KEY=your-api-key-here

# Build the project (optional, can use tsx for development)
pnpm build
```

## Quick Start

### Run a Forecast

```bash
# Using tsx (development)
pnpm pipeline run --disease "breast cancer" --molecule "trastuzumab" --geo US --baseYear 2024 --horizon 10

# Or using compiled version
pnpm build
pnpm start run --disease "breast cancer" --molecule "trastuzumab"
```

This will:
1. Normalize the disease and molecule names
2. Build a comprehensive treatment landscape map
3. Suggest epidemiological assumptions (using LLM + web search)
4. Calculate 2024 population allocation across treatment nodes
5. Calculate demand (administered and dispensed mg)
6. Generate 10-year forecast (2024-2034) with multiple scenarios
7. Output all artifacts to `./runs/<runId>/`

### View a Report

```bash
pnpm pipeline report --runId <runId>
```

Prints a formatted summary showing:
- Treatment landscape overview
- 2024 demand by setting and line
- Forecast trajectory
- Scenario comparison

### Export Results

```bash
# Export as CSV
pnpm pipeline export --runId <runId> --format csv

# Export as JSON (includes all artifacts)
pnpm pipeline export --runId <runId> --format json --output my_results.json
```

Exports are saved to `./out/` directory.

## Project Structure

```
├── src/
│   ├── cli/              # CLI commands
│   ├── domain/           # Core types and data models
│   ├── llm/              # OpenAI client, schemas, prompts, caching
│   ├── pipeline/         # Pipeline stages
│   │   ├── normalize.ts
│   │   ├── buildTreatmentMap.ts
│   │   ├── resolveAssumptions.ts
│   │   ├── population.ts
│   │   ├── exposure.ts
│   │   ├── forecast.ts
│   │   ├── run.ts
│   │   └── export.ts
│   └── utils/            # Logging, hashing, I/O
├── runs/                 # Run outputs (auto-generated)
├── out/                  # Export outputs (auto-generated)
├── assumptions/          # User assumption overrides
└── llm_cache.db          # SQLite LLM cache
```

## Pipeline Stages

### Stage 0: Normalize Inputs
- Canonicalizes disease and molecule names
- Identifies biomarker requirements (e.g., HER2+)
- Lists candidate treatment dimensions (subtypes, settings, stages, lines)

### Stage 1: Build Treatment Landscape Map
- Generates comprehensive treatment nodes where molecule is used
- Extracts dosing schemas (loading, maintenance, interval, duration)
- Assigns confidence scores based on evidence
- Iterative refinement with missingness checks
- Produces citations with URLs

### Stage 2: Resolve Assumptions
- LLM suggests epidemiological parameters using web search
- Merges with user overrides from `./assumptions/overrides.json`
- Falls back to sensible defaults

### Stage 3: Allocate Population
- Distributes patients across treatment nodes using:
  - Incidence/prevalence
  - Subtype shares
  - Stage/setting distributions
  - Line distributions
  - Treated rates
- Calculates patient-years using time-on-treatment

### Stage 4: Calculate Demand
- **Administered dose**: mg/kg or fixed dose × administrations per year × RDI
- **Dispensed dose**: Vial rounding with wastage calculations
- Outputs per-patient-year and total demand per node

### Stage 5: Generate Forecast
- Projects 2024-2034 using:
  - Incidence/prevalence growth (CAGR)
  - Treated rate changes
  - Time-on-treatment changes
  - Regimen adoption curves
- Generates base/low/high scenarios

## Output Files

Each run produces a directory `./runs/<runId>/` with:

- **metadata.json**: Run metadata (inputs, status, hashes)
- **normalized_input.json**: Canonicalized disease/molecule
- **treatment_map.json**: Full treatment landscape with citations
- **assumptions.json**: Final resolved assumptions
- **population_2024.json**: Patient allocation per node
- **demand_2024_nodes.json/csv**: 2024 demand calculations
- **forecast_2024_2034.json/csv**: 10-year forecast
- **audit_log.json**: Complete audit trail (prompts, responses, citations, tokens)

## Customizing Assumptions

Create `./assumptions/overrides.json` to override LLM suggestions:

```json
{
  "incidence_2024": 300000,
  "prevalence_2024": 3800000,
  "treated_rate": 0.90,
  "subtype_shares": {
    "HER2_positive": 0.20,
    "HER2_negative": 0.80
  },
  "stage_shares": {
    "early": 0.65,
    "metastatic": 0.35
  },
  "time_on_treatment_months": {
    "1L": 18,
    "2L": 12,
    "3L": 8
  },
  "incidence_cagr": 0.008,
  "vial_sizes": {
    "IV": [
      { "size_mg": 150, "is_single_dose": true },
      { "size_mg": 420, "is_single_dose": true }
    ],
    "SC": [
      { "size_mg": 600, "is_single_dose": true }
    ]
  },
  "scenarios": {
    "base": {
      "incidence_cagr": 0.005,
      "treated_rate_multiplier": 1.0,
      "tot_multiplier": 1.0,
      "adoption_multiplier": 1.0
    },
    "low": {
      "incidence_cagr": 0.0,
      "treated_rate_multiplier": 0.85,
      "tot_multiplier": 0.9,
      "adoption_multiplier": 0.8
    },
    "high": {
      "incidence_cagr": 0.01,
      "treated_rate_multiplier": 1.15,
      "tot_multiplier": 1.1,
      "adoption_multiplier": 1.2
    }
  }
}
```

Any field not specified will use LLM suggestions or defaults.

## Cache Management

The pipeline caches all LLM calls in `llm_cache.db` to avoid redundant API requests.

```bash
# View cache statistics
pnpm pipeline cache-stats

# Clear cache (forces fresh LLM calls)
pnpm pipeline cache-clear
```

Cache keys include:
- Model name
- Prompt payload
- Schema name
- Tool settings

Cached responses are automatically reused for identical inputs.

## Environment Variables

- `OPENAI_API_KEY`: **Required**. Your OpenAI API key
- `LOG_LEVEL`: Logging level (default: `info`, options: `debug`, `info`, `warn`, `error`)
- `NODE_ENV`: Set to `production` to disable pretty logging

## Example Run

```bash
export OPENAI_API_KEY=sk-...

pnpm pipeline run \
  --disease "breast cancer" \
  --molecule "trastuzumab" \
  --geo US \
  --baseYear 2024 \
  --horizon 10

# Output:
# ================================================================================
# PIPELINE RUN SUMMARY
# ================================================================================
# Run ID: a3f82b4c91d7
# Disease: Breast Cancer
# Molecule: Trastuzumab
# Geography: US
# Treatment nodes: 12
# Citations: 18
#
# 2024 DEMAND:
#   Total dispensed: 1,234.56 kg
#
# TOP 10 NODES BY DEMAND:
#   HER2pos_metastatic_1L_TCHPem: 456.78 kg (37.0%)
#     Trastuzumab + Pertuzumab + Chemotherapy - IV
#   ...
#
# FORECAST (BASE SCENARIO):
#   2024: 1,234.56 kg
#   2029: 1,345.67 kg
#   2034: 1,456.78 kg
#
# Outputs saved to: ./runs/a3f82b4c91d7/
```

Then view the report:

```bash
pnpm pipeline report --runId a3f82b4c91d7
```

## Extending the Pipeline

### Adding Better Epi Sources

Replace the LLM-suggested assumptions in `resolveAssumptions.ts` with API calls to:
- SEER database
- Global Burden of Disease (GBD)
- IMS/IQVIA data feeds
- Proprietary epidemiology databases

### Improving Population Flow

Implement the "flow approach" in `population.ts`:
- Model patient transitions between lines
- Use real-world time-on-treatment distributions
- Account for dropout, death, and discontinuation

### Advanced Dosing

Enhance `exposure.ts` with:
- Weight distributions (not just mean)
- BSA distributions for mg/m² dosing
- Dose reductions based on adverse events
- Real-world dose intensity (RDI) curves

### Real Web Search

Replace the simulated web search in `llm/client.ts` with actual search APIs:
- Tavily Search API
- Serper.dev
- Bing Web Search API
- PubMed E-utilities

## Troubleshooting

### API Rate Limits

If you hit OpenAI rate limits, the pipeline will fail. Solutions:
- Use caching (already enabled by default)
- Reduce `max_tokens` in LLM calls
- Add retry logic with exponential backoff
- Request higher rate limits from OpenAI

### Memory Issues

For very large treatment landscapes:
- Reduce `max_iterations` in `buildTreatmentMap`
- Process nodes in batches
- Use streaming for large CSV exports

### Incorrect Dosing

If LLM extracts incorrect doses:
- Check `treatment_map.json` confidence scores
- Add overrides in a custom post-processing step
- Manually edit the treatment map and re-run stages 3-5

## License

MIT

## Support

For issues and feature requests, please open an issue on GitHub.

---

**Note**: This pipeline makes many LLM API calls with web search enabled. Monitor your OpenAI usage and costs. Typical run for breast cancer + trastuzumab: ~10-20 API calls, ~50K tokens, ~$1-3 depending on model.
