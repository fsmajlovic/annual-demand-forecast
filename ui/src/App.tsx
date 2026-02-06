import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ForecastForm from './components/ForecastForm'
import Results from './components/Results'
import './index.css'

const queryClient = new QueryClient()
const TOKEN_KEY = 'app_token'

export interface RegulatoryStatus {
  status: 'approved' | 'clinical_testing_only' | 'no_fda_approval' | 'discontinued' | 'withdrawn'
  fda_approved: boolean
  fda_approval_date: string | null
  fda_approved_indications: string[]
  ema_approved: boolean
  current_phase: string | null
  is_commercially_available: boolean
  data_reliability_warning: string | null
  confidence: number
}

export interface PipelineResult {
  run_id: string
  success: boolean
  regulatory_status?: RegulatoryStatus
  summary: {
    disease: string
    molecule: string
    geo: string
    total_nodes: number
    incidence?: number
    prevalence?: number
    base_year: number
    horizon_years: number
    generated_at: string
    map_version: string
    total_tokens: number
    total_llm_calls: number
    cached_calls: number
  }
  treatment_nodes: Array<{
    node_id: string
    regimen: string
    setting: string
    line: string
    route: string
    dosing: string
    duration: string
    confidence: number
    administered_mg_per_patient_year: number
    dispensed_mg_per_patient_year: number
    treated_patients: number
  }>
  demand_summary: {
    total_treated_patients: number
    total_administered_mg: number
    total_dispensed_mg: number
    by_setting: Record<string, { patients: number; administered_mg: number }>
  }
  forecast: Array<{
    year: number
    total_patients: number
    total_administered_mg: number
    total_dispensed_mg: number
  }>
  audit_trail: Array<{
    timestamp: string
    stage: string
    model: string
    prompt_preview: string
    tool_queries: string[]
    tokens_used: number
    cached: boolean
    confidence?: number
  }>
  metadata: {
    run_id: string
    created_at: string
    status: string
    assumptions_hash: string
    treatment_map_hash: string
  }
}

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setChecking(true)

    try {
      const res = await fetch(`/api/auth/verify`, {
        headers: { Authorization: `Bearer ${password}` },
      })
      if (res.ok) {
        sessionStorage.setItem(TOKEN_KEY, password)
        onLogin(password)
      } else {
        setError('Invalid password')
      }
    } catch {
      setError('Cannot reach server')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 text-center">
          Demand Forecasting
        </h1>
        <p className="text-gray-500 text-sm text-center mb-6">
          Enter password to continue
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            autoFocus
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}
          <button
            type="submit"
            disabled={checking}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-lg transition duration-200"
          >
            {checking ? 'Checking...' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  )
}

function App() {
  const [token, setToken] = useState<string | null>(
    () => sessionStorage.getItem(TOKEN_KEY)
  )
  const [result, setResult] = useState<PipelineResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<string>('')

  // If the server returns 401, clear the token so the login screen shows
  const handleAuthError = () => {
    sessionStorage.removeItem(TOKEN_KEY)
    setToken(null)
  }

  if (!token) {
    return <LoginScreen onLogin={setToken} />
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <div className="flex justify-end mb-2">
              <button
                onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setToken(null); setResult(null) }}
                className="text-white/60 hover:text-white text-sm transition"
              >
                Log out
              </button>
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Pharmaceutical Demand Forecasting
            </h1>
            <p className="text-white/80 text-lg">
              AI-powered treatment landscape mapping and demand modeling
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-8 mb-8">
            <ForecastForm
              token={token}
              onResult={setResult}
              onLoadingChange={setIsLoading}
              onProgressChange={setProgress}
              onAuthError={handleAuthError}
            />
          </div>

          {isLoading && (
            <div className="bg-white rounded-2xl shadow-2xl p-8 mb-8">
              <div className="flex items-center justify-center space-x-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <div className="text-gray-700">
                  {progress || 'Running pipeline...'}
                </div>
              </div>
            </div>
          )}

          {result && !isLoading && <Results result={result} />}

          {/* How It Works */}
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 mt-8 border border-white/20">
            <h2 className="text-2xl font-bold text-white mb-2">How It Works</h2>
            <p className="text-white/70 text-sm mb-6">
              This system generates 10-year annual demand projections for therapeutic molecules
              by combining LLM intelligence (GPT-4o) with deterministic math to produce auditable forecasts.
            </p>

            <div className="grid grid-cols-1 gap-3">
              {[
                { stage: '0', name: 'Normalize', desc: 'Canonicalize disease/molecule names, identify biomarkers' },
                { stage: '0.5', name: 'Regulatory Check', desc: 'Verify FDA approval status, flag non-commercial molecules' },
                { stage: '1', name: 'Treatment Landscape', desc: 'LLM + web search maps all treatment nodes (subtype \u00d7 setting \u00d7 line \u00d7 regimen \u00d7 dosing)' },
                { stage: '2', name: 'Resolve Assumptions', desc: 'Merge LLM suggestions, user overrides, and defaults for epidemiology params' },
                { stage: '3', name: 'Population Allocation', desc: 'Deterministic hierarchical allocation of patients to treatment nodes' },
                { stage: '4', name: 'Demand Calculation', desc: 'Compute administered & dispensed mg (with vial rounding/wastage)' },
                { stage: '5', name: 'Forecast', desc: 'Project 2024\u20132034 across base/low/high scenarios using CAGR & multipliers' },
              ].map((item) => (
                <div key={item.stage} className="flex items-start gap-4 bg-white/5 rounded-lg px-4 py-3">
                  <span className="flex-shrink-0 w-10 h-10 rounded-lg bg-indigo-500/30 text-indigo-200 font-bold text-sm flex items-center justify-center">
                    {item.stage}
                  </span>
                  <div>
                    <span className="text-white font-semibold">{item.name}</span>
                    <p className="text-white/60 text-sm mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap gap-4 text-xs text-white/40">
              <span>LLM for intelligence, math for calculations</span>
              <span>|</span>
              <span>SQLite caching (~$0 for repeat runs)</span>
              <span>|</span>
              <span>Full audit trail on every run</span>
            </div>
          </div>
        </div>
      </div>
    </QueryClientProvider>
  )
}

export default App
