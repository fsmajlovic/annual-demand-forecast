# Pharmaceutical Demand Forecasting Pipeline 🚀

Production-grade AI-powered system with React UI for forecasting pharmaceutical demand.

## 🚀 Quick Start

```bash
# One command to start everything
./start-ui.sh
```

Then open **http://localhost:5173** in your browser!

## ✨ What This Does

Enter any disease + molecule (e.g., "breast cancer" + "trastuzumab") and get:

1. **Treatment Landscape**: All regimens where the molecule is used
2. **Patient Population**: Allocated by subtype, setting, and line
3. **Demand Forecast**: 10-year projections with dosing and wastage
4. **Evidence Trail**: Citations, confidence scores, audit logs

## 📊 Features

- 🤖 LLM-powered treatment extraction (OpenAI GPT-4o)
- 🔍 Web search for evidence grounding
- 👥 Epidemiological modeling
- 💊 Vial wastage calculations
- 📈 Multi-scenario forecasting
- 🎨 Beautiful React UI with real-time progress
- ⚡ SQLite caching for instant re-runs

## 🛠️ Manual Setup

If `start-ui.sh` doesn't work:

```bash
# Install
pnpm install
cd ui && npm install && cd ..

# Build backend
npx tsc

# Start (option 1: both together)
npm run dev:full

# Or (option 2: separate terminals)
npm run api  # Terminal 1
npm run ui   # Terminal 2
```

## 📖 Example

**Input**: breast cancer + trastuzumab

**Output**:
- 4 treatment nodes (adjuvant, neoadjuvant, metastatic 1L/2L)
- 608,000 HER2+ patients allocated
- 7.3 kg/patient/year dosing
- Complete dosing regimens with confidence scores

## 📁 Key Files

- `src/api/server.ts` - Express API with SSE
- `ui/src/` - React frontend
- `src/pipeline/` - 6-stage demand pipeline
- `runs/` - Generated outputs
- `.env` - API keys (already configured)

## 🎯 CLI Usage

```bash
# Run pipeline
npx tsx src/cli/index.ts run --disease "breast cancer" --molecule "trastuzumab"

# View tables
npx tsx src/cli/index.ts tables --runId <id>

# Export CSV
npx tsx src/cli/index.ts export --runId <id> --format csv
```

## 🐛 Troubleshooting

**"OPENAI_API_KEY not set"**: Check `.env` file exists
**Port in use**: Edit `src/api/server.ts` PORT value
**Slow first run**: Normal (30-60s), cached runs take ~2s

## 💡 Pro Tips

- Add `TAVILY_API_KEY` to `.env` for better evidence
- Override assumptions in `assumptions/overrides.json`
- Check `runs/<run-id>/audit_log.json` for debugging

## 📄 More Docs

- `UI_README.md` - Full UI documentation
- `RESULTS_SUMMARY.md` - Example walkthrough

---

**Made with ❤️ using OpenAI GPT-4o, React, and TypeScript**
