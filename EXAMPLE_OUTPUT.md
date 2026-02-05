# Example Pipeline Output - Table Visualization

This shows what the pipeline generates when you run the `tables` command.

## Command

```bash
npx tsx src/cli/index.ts tables --runId <runId>
```

## Example Output

```
════════════════════════════════════════════════════════════════════════════════════════════════════
DEMAND FORECAST RESULTS - DETAILED TABLES
════════════════════════════════════════════════════════════════════════════════════════════════════
Run ID: a3f82b4c91d7

TABLE 1: TREATMENT LANDSCAPE MAP
────────────────────────────────────────────────────────────────────────────────────────────────────
Metric                      │ Value
────────────────────────────┼──────
Total Treatment Nodes       │ 12
Standard-of-Care Nodes      │ 10
Citations                   │ 18
Exclusions Documented       │ 2
Avg Confidence Score        │ 0.87


TABLE 2: TREATMENT NODES (Top 15 by Demand)
────────────────────────────────────────────────────────────────────────────────────────────────────
Node ID                              │ Regimen                           │ Setting    │ Line │ Route │ Patients │ Demand (kg) │ SOC │ Conf
─────────────────────────────────────┼───────────────────────────────────┼────────────┼──────┼───────┼──────────┼─────────────┼─────┼─────
HER2pos_metastatic_1L_TCHPem...      │ Tras + Pert + Chemo               │ metastatic │ 1L   │ IV    │ 12,450   │ 456.78      │ Yes │ 0.95
HER2pos_adjuvant_ACT...              │ AC-TH (Adjuvant)                  │ adjuvant   │ adj  │ IV    │ 35,200   │ 389.23      │ Yes │ 0.92
HER2pos_neoadjuvant_TCHPem...        │ Tras + Pert + Chemo (Neoadj)      │ neoadjuvant│ neoa │ IV    │ 18,900   │ 287.45      │ Yes │ 0.91
HER2pos_metastatic_2L_TDM1...        │ T-DM1                             │ metastatic │ 2L   │ IV    │ 8,340    │ 198.67      │ Yes │ 0.89
HER2pos_adjuvant_TH_SC...            │ Trastuzumab SC (Adjuvant)         │ adjuvant   │ adj  │ SC    │ 22,100   │ 156.34      │ Yes │ 0.86
HER2pos_metastatic_1L_TDXd...        │ T-DXd                             │ metastatic │ 1L   │ IV    │ 4,230    │ 145.89      │ Yes │ 0.94
HER2pos_metastatic_maintenance_T...  │ Trastuzumab Maintenance           │ metastatic │ maint│ IV    │ 15,670   │ 134.56      │ Yes │ 0.83
HER2pos_metastatic_2L_tucatinib...   │ Tucatinib + Tras + Cape           │ metastatic │ 2L   │ PO/IV │ 3,450    │ 89.23       │ Yes │ 0.88
HER2pos_metastatic_3L_TDM1...        │ T-DM1                             │ metastatic │ 3L   │ IV    │ 2,890    │ 67.45       │ Yes │ 0.82
HER2pos_neoadjuvant_TCH...           │ TCH (Neoadjuvant)                 │ neoadjuvant│ neoa │ IV    │ 8,560    │ 56.78       │ Yes │ 0.85
HER2pos_adjuvant_APT...              │ APT (Paclitaxel + Tras)           │ adjuvant   │ adj  │ IV    │ 6,780    │ 45.67       │ No  │ 0.79
HER2pos_metastatic_3L_other...       │ Other 3L+ Combinations            │ metastatic │ 3L+  │ IV    │ 1,980    │ 34.23       │ No  │ 0.71


TABLE 3: 2024 DEMAND BY SETTING
────────────────────────────────────────────────────────────────────────────────────────────────────
Setting      │ Patients │ Demand (kg) │ % of Total
─────────────┼──────────┼─────────────┼───────────
adjuvant     │ 64,080   │ 591.24      │ 47.8%
metastatic   │ 49,010   │ 525.81      │ 42.5%
neoadjuvant  │ 27,460   │ 120.23      │ 9.7%


TABLE 4: 2024 DEMAND BY LINE OF THERAPY
────────────────────────────────────────────────────────────────────────────────────────────────────
Line  │ Patients │ Demand (kg) │ % of Total
──────┼──────────┼─────────────┼───────────
adj   │ 64,080   │ 591.24      │ 47.8%
1L    │ 16,680   │ 602.67      │ 48.7%
neoa  │ 27,460   │ 120.23      │ 9.7%
2L    │ 11,790   │ 287.90      │ 23.3%
maint │ 15,670   │ 134.56      │ 10.9%
3L+   │ 4,870    │ 101.68      │ 8.2%


TABLE 5: 10-YEAR FORECAST TRAJECTORY (BASE SCENARIO)
────────────────────────────────────────────────────────────────────────────────────────────────────
Year │ Patients  │ Demand (kg) │ YoY Growth │ CAGR from Base
─────┼───────────┼─────────────┼────────────┼───────────────
2024 │ 140,550   │ 1,237.28    │ Baseline   │ Baseline
2025 │ 141,253   │ 1,243.46    │ 0.5%       │ 0.005%
2026 │ 141,959   │ 1,249.67    │ 1.0%       │ 0.005%
2027 │ 142,668   │ 1,255.92    │ 1.5%       │ 0.005%
2028 │ 143,380   │ 1,262.21    │ 2.0%       │ 0.005%
2029 │ 144,095   │ 1,268.53    │ 2.5%       │ 0.005%
2030 │ 144,813   │ 1,274.90    │ 3.0%       │ 0.005%
2031 │ 145,534   │ 1,281.30    │ 3.6%       │ 0.005%
2032 │ 146,258   │ 1,287.74    │ 4.1%       │ 0.005%
2033 │ 146,985   │ 1,294.22    │ 4.6%       │ 0.005%
2034 │ 147,715   │ 1,300.74    │ 5.1%       │ 0.005%


TABLE 6: SCENARIO COMPARISON (FINAL YEAR)
────────────────────────────────────────────────────────────────────────────────────────────────────
Scenario │ Year │ Patients  │ Demand (kg) │ vs Base
─────────┼──────┼───────────┼─────────────┼────────
BASE     │ 2034 │ 147,715   │ 1,300.74    │ Baseline
LOW      │ 2034 │ 126,558   │ 994.57      │ -23.5%
HIGH     │ 2034 │ 170,472   │ 1,638.93    │ +26.0%


TABLE 7: DOSING PATTERNS SUMMARY
────────────────────────────────────────────────────────────────────────────────────────────────────
Route & Dosing Type │ Node Count │ Avg Maintenance Dose │ Avg Interval (days)
────────────────────┼────────────┼──────────────────────┼────────────────────
IV - mg_per_kg      │ 6          │ 6.0 mg/kg            │ 21.0
IV - fixed_mg       │ 3          │ 3.6 mg/kg            │ 21.0
SC - fixed_mg       │ 2          │ 600.0 mg             │ 21.0
PO - fixed_mg       │ 1          │ 300.0 mg             │ 1.0


════════════════════════════════════════════════════════════════════════════════════════════════════
SUMMARY STATISTICS
════════════════════════════════════════════════════════════════════════════════════════════════════
Metric                       │ Value
─────────────────────────────┼──────────────
Total Dispensed (2024)       │ 1,237.28 kg
Total Administered (2024)    │ 1,168.45 kg
Wastage Rate                 │ 5.6%
Total Patients Treated       │ 140,550
Avg Dose per Patient-Year    │ 8.3 g

════════════════════════════════════════════════════════════════════════════════════════════════════
```

## How to Generate Tables

After running the pipeline:

```bash
# 1. Run the pipeline
npx tsx src/cli/index.ts run --disease "breast cancer" --molecule "trastuzumab"

# 2. Get the run ID from output (e.g., a3f82b4c91d7)

# 3. Generate detailed tables
npx tsx src/cli/index.ts tables --runId a3f82b4c91d7
```

## Available Commands

```bash
# Simple text report
npx tsx src/cli/index.ts report --runId <runId>

# Detailed tables (7 tables total)
npx tsx src/cli/index.ts tables --runId <runId>

# Export to CSV
npx tsx src/cli/index.ts export --runId <runId> --format csv

# Export to JSON
npx tsx src/cli/index.ts export --runId <runId> --format json
```

## What Each Table Shows

1. **Treatment Landscape Map** - Overview of nodes, citations, confidence
2. **Treatment Nodes** - Top nodes by demand with regimen details
3. **Demand by Setting** - Adjuvant vs neoadjuvant vs metastatic breakdown
4. **Demand by Line** - 1L, 2L, 3L+ therapy distribution
5. **10-Year Forecast** - Year-by-year projections with growth rates
6. **Scenario Comparison** - Base vs low vs high scenarios
7. **Dosing Patterns** - Summary of routes and dosing types

## CSV Export Example

When you export to CSV, you get separate files:

```bash
out/demand_<runId>.csv          # 2024 demand per node
out/forecast_<runId>.csv        # Full 10-year forecast
```

CSV files can be opened in Excel, imported to Python/R, or loaded into BI tools like Tableau/PowerBI.
