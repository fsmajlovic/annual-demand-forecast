# React UI for Demand Forecasting Pipeline

## Quick Start

### 1. Set up Environment Variables

Copy the `.env.example` file to `.env` and add your OpenAI API key:

```bash
cp .env.example .env
```

Edit `.env` and set:
```
OPENAI_API_KEY=sk-your-key-here
```

### 2. Build the Backend

```bash
pnpm build
```

### 3. Start Both Servers

Run the API server and React UI simultaneously:

```bash
pnpm run dev:full
```

This will start:
- **API Server**: http://localhost:3001
- **React UI**: http://localhost:5173

### Or Run Separately

**Terminal 1 - API Server:**
```bash
pnpm run api
```

**Terminal 2 - React UI:**
```bash
pnpm run ui
```

## Usage

1. Open http://localhost:5173 in your browser
2. Enter a disease (e.g., "breast cancer")
3. Enter a molecule (e.g., "trastuzumab")
4. Select geography (default: US)
5. Click "Run Forecast Pipeline"
6. Watch real-time progress updates
7. View detailed results with:
   - Treatment landscape map
   - Patient population estimates
   - Demand calculations
   - Dosing regimens
8. Export results as JSON or CSV

## Features

- **Real-Time Progress**: Server-Sent Events show pipeline stages as they complete
- **Beautiful UI**: Modern React + Tailwind CSS design
- **Detailed Results**:
  - Treatment nodes with dosing, setting, line, route
  - Demand summary by setting (adjuvant, neoadjuvant, metastatic)
  - Patient counts and administered/dispensed quantities
  - Confidence scores for each regimen
- **Export Options**: Download results as JSON or CSV
- **Environment-Based Config**: API key stored securely in .env file

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Data Fetching**: TanStack Query (React Query)
- **Backend**: Express.js with SSE (Server-Sent Events)
- **Pipeline**: Existing TypeScript demand forecasting pipeline

## API Endpoints

### GET /api/run
Runs the pipeline and streams progress via Server-Sent Events.

**Query Parameters:**
- `disease` (required): Disease name
- `molecule` (required): Molecule name
- `geo` (optional): Geography (default: "US")
- `base_year` (optional): Base year (default: 2024)
- `horizon_years` (optional): Forecast horizon (default: 10)

**Response:** SSE stream with:
- `progress` events: Status updates
- `result` event: Final pipeline results
- `error` event: Error messages if pipeline fails

### GET /api/export/:runId/:format
Downloads results in JSON or CSV format.

**Parameters:**
- `runId`: Pipeline run ID
- `format`: "json" or "csv"

## Troubleshooting

### "OPENAI_API_KEY not set"
Make sure you created a `.env` file with your API key (see step 1 above).

### Port Already in Use
If port 3001 or 5173 is already in use:
- API: Edit `src/api/server.ts` and change `PORT = 3001`
- UI: The Vite dev server will automatically try the next available port

### Build Errors
Make sure all dependencies are installed:
```bash
pnpm install
npm install --prefix ui
```

### Population Showing as 0
This was a known issue and has been fixed. The LLM-generated `stage_shares` now correctly maps to `setting_shares`. Re-run the pipeline to see proper patient counts.
