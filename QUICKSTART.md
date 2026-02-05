# Quick Start Guide

## Installation

```bash
# Install dependencies
pnpm install

# Set your OpenAI API key
export OPENAI_API_KEY=your-api-key-here
```

## Run Your First Forecast

```bash
# Run the pipeline for breast cancer + trastuzumab
pnpm pipeline run \
  --disease "breast cancer" \
  --molecule "trastuzumab" \
  --geo US \
  --baseYear 2024 \
  --horizon 10
```

This will:
1. Normalize the inputs (disease/molecule canonicalization)
2. Build a treatment landscape map using LLM + web search
3. Suggest epidemiological assumptions
4. Calculate 2024 population and demand
5. Generate a 10-year forecast with scenarios
6. Save all outputs to `./runs/<runId>/`

## Expected Output

```
================================================================================
PIPELINE RUN SUMMARY
================================================================================
Run ID: a3f82b4c91d7
Disease: Breast Cancer
Molecule: Trastuzumab
Geography: US
Treatment nodes: 12
Citations: 18

2024 DEMAND:
  Total dispensed: 1,234.56 kg

TOP 10 NODES BY DEMAND:
  HER2pos_metastatic_1L_TCHPem: 456.78 kg (37.0%)
    Trastuzumab + Pertuzumab + Chemotherapy - IV
  ...

FORECAST (BASE SCENARIO):
  2024: 1,234.56 kg
  2029: 1,345.67 kg
  2034: 1,456.78 kg

Outputs saved to: ./runs/a3f82b4c91d7/
================================================================================
```

## View a Report

```bash
pnpm pipeline report --runId a3f82b4c91d7
```

## Export Results

```bash
# Export as CSV
pnpm pipeline export --runId a3f82b4c91d7 --format csv

# Export as JSON
pnpm pipeline export --runId a3f82b4c91d7 --format json
```

## Customize Assumptions

Create `./assumptions/overrides.json`:

```json
{
  "incidence_2024": 300000,
  "treated_rate": 0.90,
  "subtype_shares": {
    "HER2_positive": 0.20,
    "HER2_negative": 0.80
  }
}
```

Then re-run the pipeline. It will use your overrides instead of LLM suggestions.

## Cache Management

```bash
# View cache stats
pnpm pipeline cache-stats

# Clear cache (forces fresh LLM calls)
pnpm pipeline cache-clear
```

## Troubleshooting

### Missing API Key
```
Error: OPENAI_API_KEY environment variable not set.
```
**Solution**: `export OPENAI_API_KEY=your-key`

### Rate Limits
If you hit OpenAI rate limits:
- The pipeline uses caching by default
- Rerun the same inputs - cached responses will be used
- Request higher limits from OpenAI

### Check Logs
Set debug logging:
```bash
export LOG_LEVEL=debug
pnpm pipeline run --disease "breast cancer" --molecule "trastuzumab"
```

## Next Steps

1. **Review Output Files**
   - `treatment_map.json` - Full treatment landscape with citations
   - `demand_2024_nodes.csv` - Per-node demand calculations
   - `forecast_2024_2034.csv` - Year-by-year projections
   - `audit_log.json` - Complete audit trail

2. **Customize Assumptions**
   - Edit `assumptions/overrides.json`
   - Override incidence, prevalence, treated rates, ToT, etc.

3. **Try Other Molecules**
   ```bash
   pnpm pipeline run --disease "non-small cell lung cancer" --molecule "pembrolizumab"
   pnpm pipeline run --disease "colorectal cancer" --molecule "bevacizumab"
   ```

4. **Extend the Pipeline**
   - Add real web search (replace simulated search in `llm/client.ts`)
   - Integrate real epi databases (SEER, GBD, etc.)
   - Improve population flow modeling
   - Add sensitivity analysis

## File Structure

```
runs/<runId>/
├── metadata.json              # Run info
├── normalized_input.json      # Canonicalized inputs
├── treatment_map.json         # Treatment landscape
├── assumptions.json           # Final assumptions
├── population_2024.json       # Patient allocation
├── demand_2024_nodes.json     # Demand per node
├── demand_2024_nodes.csv      # (CSV format)
├── forecast_2024_2034.json    # 10-year forecast
├── forecast_2024_2034.csv     # (CSV format)
└── audit_log.json             # Audit trail
```

## Cost Estimation

Typical run (breast cancer + trastuzumab):
- **LLM calls**: 10-20 API requests
- **Tokens**: ~50K tokens
- **Cost**: ~$1-3 (varies by model)
- **Time**: 2-5 minutes (first run, before caching)

Subsequent runs with same inputs are much faster due to caching.

## Support

See the full [README.md](README.md) for detailed documentation.

For issues, check:
- TypeScript compilation: `npx tsc --noEmit`
- Logs: Set `LOG_LEVEL=debug`
- Cache: Try `pnpm pipeline cache-clear`
