import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ForecastForm from './components/ForecastForm'
import Results from './components/Results'
import './index.css'

const queryClient = new QueryClient()

export interface PipelineResult {
  run_id: string
  success: boolean
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

function App() {
  const [result, setResult] = useState<PipelineResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<string>('')

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">
              Pharmaceutical Demand Forecasting
            </h1>
            <p className="text-white/80 text-lg">
              AI-powered treatment landscape mapping and demand modeling
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-2xl p-8 mb-8">
            <ForecastForm
              onResult={setResult}
              onLoadingChange={setIsLoading}
              onProgressChange={setProgress}
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
        </div>
      </div>
    </QueryClientProvider>
  )
}

export default App
