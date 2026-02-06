import { useState } from 'react'
import type { PipelineResult } from '../App'

interface Props {
  token: string
  onResult: (result: PipelineResult) => void
  onLoadingChange: (loading: boolean) => void
  onProgressChange: (progress: string) => void
  onAuthError: () => void
}

export default function ForecastForm({ token, onResult, onLoadingChange, onProgressChange, onAuthError }: Props) {
  const [disease, setDisease] = useState('')
  const [molecule, setMolecule] = useState('')
  const [geo, setGeo] = useState('US')
  const [baseYear, setBaseYear] = useState(2024)
  const [horizonYears, setHorizonYears] = useState(10)
  const [disableCache, setDisableCache] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    onLoadingChange(true)
    onProgressChange('Initializing pipeline...')

    try {
      // Connect to SSE endpoint for progress updates
      const eventSource = new EventSource(
        `/api/run?disease=${encodeURIComponent(disease)}&molecule=${encodeURIComponent(molecule)}&geo=${geo}&base_year=${baseYear}&horizon_years=${horizonYears}&disable_cache=${disableCache}&token=${encodeURIComponent(token)}`
      )

      eventSource.addEventListener('progress', (event) => {
        onProgressChange(event.data)
      })

      eventSource.addEventListener('result', (event) => {
        const result = JSON.parse(event.data)
        onResult(result)
        onLoadingChange(false)
        eventSource.close()
      })

      eventSource.addEventListener('error', (event: any) => {
        const errorData = event.data ? JSON.parse(event.data) : { error: 'Pipeline failed' }
        setError(errorData.error || 'An error occurred')
        onLoadingChange(false)
        eventSource.close()
      })

      eventSource.onerror = () => {
        // EventSource doesn't expose status codes, so try a fetch to check if it's a 401
        fetch('/api/auth/verify', {
          headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
          if (res.status === 401) {
            onAuthError()
          } else {
            setError('Connection to server lost')
          }
        }).catch(() => {
          setError('Connection to server lost')
        })
        onLoadingChange(false)
        eventSource.close()
      }
    } catch (err) {
      setError(String(err))
      onLoadingChange(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Disease
          </label>
          <input
            type="text"
            value={disease}
            onChange={(e) => setDisease(e.target.value)}
            placeholder="e.g., breast cancer"
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Molecule
          </label>
          <input
            type="text"
            value={molecule}
            onChange={(e) => setMolecule(e.target.value)}
            placeholder="e.g., trastuzumab"
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Geography
          </label>
          <select
            value={geo}
            onChange={(e) => setGeo(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="US">United States</option>
            <option value="EU">European Union</option>
            <option value="JP">Japan</option>
            <option value="CN">China</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Base Year
          </label>
          <input
            type="number"
            value={baseYear}
            onChange={(e) => setBaseYear(parseInt(e.target.value, 10))}
            min={2020}
            max={2030}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Horizon (years)
          </label>
          <input
            type="number"
            value={horizonYears}
            onChange={(e) => setHorizonYears(parseInt(e.target.value, 10))}
            min={1}
            max={20}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="disableCache"
          checked={disableCache}
          onChange={(e) => setDisableCache(e.target.checked)}
          className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
        />
        <label htmlFor="disableCache" className="text-sm text-gray-700">
          Disable cache (force fresh LLM calls)
        </label>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <strong className="font-bold">Error: </strong>
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition duration-200 shadow-lg hover:shadow-xl"
      >
        Run Forecast Pipeline
      </button>

      <p className="text-sm text-gray-500 text-center">
        API key loaded from environment variables. Pipeline takes 30-60 seconds to complete.
      </p>
    </form>
  )
}
