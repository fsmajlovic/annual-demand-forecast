import { useState } from 'react'
import type { PipelineResult, RegulatoryStatus } from '../App'

interface Props {
  result: PipelineResult
}

function getStatusBadgeColor(status: RegulatoryStatus['status']): string {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'clinical_testing_only':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 'no_fda_approval':
      return 'bg-orange-100 text-orange-800 border-orange-200'
    case 'discontinued':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'withdrawn':
      return 'bg-red-100 text-red-800 border-red-200'
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

function getStatusLabel(status: RegulatoryStatus['status']): string {
  switch (status) {
    case 'approved':
      return 'FDA Approved'
    case 'clinical_testing_only':
      return 'Clinical Testing Only'
    case 'no_fda_approval':
      return 'No FDA Approval'
    case 'discontinued':
      return 'Discontinued'
    case 'withdrawn':
      return 'Withdrawn'
    default:
      return 'Unknown'
  }
}

export default function Results({ result }: Props) {
  const { summary, regulatory_status, treatment_nodes, demand_summary, forecast, audit_trail, metadata } = result
  const [showAudit, setShowAudit] = useState(false)

  const hasWarning = regulatory_status && (
    regulatory_status.status !== 'approved' ||
    !regulatory_status.is_commercially_available ||
    regulatory_status.data_reliability_warning
  )

  const formatStage = (stage: string) => {
    return stage
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }

  return (
    <div className="space-y-6">
      {/* Regulatory Status Warning Banner */}
      {hasWarning && regulatory_status && (
        <div className="bg-amber-50 border-2 border-amber-400 rounded-xl shadow-lg p-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-4 flex-1">
              <h3 className="text-lg font-bold text-amber-800">
                Data Reliability Warning
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${getStatusBadgeColor(regulatory_status.status)}`}>
                  {getStatusLabel(regulatory_status.status)}
                </span>
                {regulatory_status.current_phase && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 border border-blue-200">
                    {regulatory_status.current_phase}
                  </span>
                )}
                {!regulatory_status.is_commercially_available && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800 border border-gray-200">
                    Not Commercially Available
                  </span>
                )}
              </div>
              {regulatory_status.data_reliability_warning && (
                <p className="mt-3 text-amber-700">
                  {regulatory_status.data_reliability_warning}
                </p>
              )}
              <div className="mt-3 text-sm text-amber-600">
                <strong>Note:</strong> Demand forecasts for non-approved or discontinued molecules may not reflect commercial reality.
                Use these estimates with caution.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Regulatory Status Badge (for approved molecules) */}
      {regulatory_status && !hasWarning && (
        <div className="bg-green-50 border border-green-200 rounded-xl shadow-sm p-4">
          <div className="flex items-center">
            <svg className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-green-800 font-medium">
              FDA Approved {regulatory_status.fda_approval_date && `(${regulatory_status.fda_approval_date})`}
            </span>
            {regulatory_status.fda_approved_indications.length > 0 && (
              <span className="ml-2 text-green-600 text-sm">
                for {regulatory_status.fda_approved_indications.slice(0, 2).join(', ')}
                {regulatory_status.fda_approved_indications.length > 2 && ` +${regulatory_status.fda_approved_indications.length - 2} more`}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Run Metadata */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm opacity-90">Run ID</div>
            <div className="text-lg font-mono font-semibold">{metadata.run_id}</div>
            <div className="text-xs opacity-75 mt-1">{formatTimestamp(summary.generated_at)}</div>
          </div>
          <div className="text-right">
            <div className="text-sm opacity-90">Pipeline Performance</div>
            <div className="text-2xl font-bold">{summary.total_llm_calls} LLM calls</div>
            <div className="text-xs opacity-75 mt-1">
              {summary.total_tokens.toLocaleString()} tokens • {summary.cached_calls} cached
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Disease</div>
          <div className="text-2xl font-bold text-gray-900 capitalize">{summary.disease}</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Molecule</div>
          <div className="text-2xl font-bold text-gray-900 capitalize">{summary.molecule}</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Treatment Nodes</div>
          <div className="text-2xl font-bold text-indigo-600">{summary.total_nodes}</div>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="text-sm text-gray-500 mb-1">Total Patients</div>
          <div className="text-2xl font-bold text-green-600">
            {demand_summary.total_treated_patients.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Forecast Chart */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {summary.base_year}-{summary.base_year + summary.horizon_years} Demand Forecast
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="border-b-2 border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Year</th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                  Patients
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                  Administered (kg)
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                  Dispensed (kg)
                </th>
                <th className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                  Growth vs {summary.base_year}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {forecast.map((yearData, idx) => {
                const baseYear = forecast[0]
                const growth =
                  idx === 0
                    ? 0
                    : ((yearData.total_dispensed_mg - baseYear.total_dispensed_mg) /
                        baseYear.total_dispensed_mg) *
                      100
                return (
                  <tr key={yearData.year} className={idx === 0 ? 'bg-indigo-50' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">
                      {yearData.year}
                      {idx === 0 && (
                        <span className="ml-2 text-xs text-indigo-600">(Base Year)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {yearData.total_patients.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {(yearData.total_administered_mg / 1_000_000).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {(yearData.total_dispensed_mg / 1_000_000).toFixed(2)}
                    </td>
                    <td
                      className={`px-4 py-3 text-sm text-right font-semibold ${
                        growth > 0 ? 'text-green-600' : growth < 0 ? 'text-red-600' : 'text-gray-500'
                      }`}
                    >
                      {growth > 0 ? '+' : ''}
                      {growth.toFixed(1)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Demand Summary */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {summary.base_year} Demand Summary
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="border-l-4 border-indigo-500 pl-4">
            <div className="text-sm text-gray-500">Total Administered</div>
            <div className="text-xl font-bold text-gray-900">
              {(demand_summary.total_administered_mg / 1_000_000).toFixed(2)} kg
            </div>
          </div>
          <div className="border-l-4 border-purple-500 pl-4">
            <div className="text-sm text-gray-500">Total Dispensed (with wastage)</div>
            <div className="text-xl font-bold text-gray-900">
              {(demand_summary.total_dispensed_mg / 1_000_000).toFixed(2)} kg
            </div>
          </div>
          <div className="border-l-4 border-pink-500 pl-4">
            <div className="text-sm text-gray-500">Wastage</div>
            <div className="text-xl font-bold text-gray-900">
              {(
                ((demand_summary.total_dispensed_mg - demand_summary.total_administered_mg) /
                  demand_summary.total_dispensed_mg) *
                100
              ).toFixed(1)}
              %
            </div>
          </div>
        </div>
      </div>

      {/* By Setting */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Demand by Setting</h2>
        <div className="space-y-4">
          {Object.entries(demand_summary.by_setting).map(([setting, data]) => (
            <div key={setting} className="flex items-center justify-between border-b pb-3">
              <div>
                <div className="font-semibold text-gray-900 capitalize">{setting}</div>
                <div className="text-sm text-gray-500">
                  {data.patients.toLocaleString()} patients
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-bold text-indigo-600">
                  {(data.administered_mg / 1_000_000).toFixed(2)} kg
                </div>
                <div className="text-sm text-gray-500">administered</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Treatment Nodes Table */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Treatment Landscape</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Regimen
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Setting
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Line
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Route
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Patients
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Dosing
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Per Patient/Year
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Confidence
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {treatment_nodes.map((node) => (
                <tr key={node.node_id} className="hover:bg-gray-50">
                  <td className="px-4 py-4 text-sm font-medium text-gray-900">
                    {node.regimen}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500 capitalize">{node.setting}</td>
                  <td className="px-4 py-4 text-sm text-gray-500">{node.line}</td>
                  <td className="px-4 py-4 text-sm text-gray-500">{node.route}</td>
                  <td className="px-4 py-4 text-sm text-gray-700 font-semibold">
                    {node.treated_patients.toLocaleString()}
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500 font-mono">{node.dosing}</td>
                  <td className="px-4 py-4 text-sm text-gray-700">
                    <div className="font-semibold text-indigo-600">
                      {node.administered_mg_per_patient_year.toLocaleString()} mg
                    </div>
                    <div className="text-xs text-gray-500">
                      ({node.dispensed_mg_per_patient_year.toLocaleString()} mg with wastage)
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-500">{node.duration}</td>
                  <td className="px-4 py-4 text-sm">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        node.confidence >= 0.9
                          ? 'bg-green-100 text-green-800'
                          : node.confidence >= 0.7
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {(node.confidence * 100).toFixed(0)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit Trail */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Audit Trail</h2>
          <button
            onClick={() => setShowAudit(!showAudit)}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
          >
            {showAudit ? 'Hide' : 'Show'} Details
          </button>
        </div>

        {showAudit && (
          <div className="space-y-4">
            {audit_trail.map((entry, idx) => (
              <div
                key={idx}
                className="border border-gray-200 rounded-lg p-4 hover:border-indigo-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center space-x-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                        {formatStage(entry.stage)}
                      </span>
                      {entry.cached && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Cached
                        </span>
                      )}
                      {entry.confidence && (
                        <span className="text-xs text-gray-500">
                          Confidence: {(entry.confidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {formatTimestamp(entry.timestamp)} • {entry.model}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-gray-900">
                      {entry.tokens_used.toLocaleString()} tokens
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-xs font-medium text-gray-700 mb-1">Prompt Preview:</div>
                  <div className="text-xs text-gray-600 bg-gray-50 rounded p-2 font-mono">
                    {entry.prompt_preview}
                  </div>
                </div>

                {entry.tool_queries && entry.tool_queries.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-medium text-gray-700 mb-1">
                      Web Searches ({entry.tool_queries.length}):
                    </div>
                    <ul className="space-y-1">
                      {entry.tool_queries.map((query, qIdx) => (
                        <li key={qIdx} className="text-xs text-gray-600 flex items-start">
                          <span className="text-indigo-400 mr-2">→</span>
                          {query}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}

            <div className="border-t border-gray-200 pt-4 mt-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-indigo-600">{summary.total_llm_calls}</div>
                  <div className="text-xs text-gray-500">Total LLM Calls</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {summary.total_tokens.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Total Tokens</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600">{summary.cached_calls}</div>
                  <div className="text-xs text-gray-500">Cached Calls</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Download Results */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Export Results</h2>
        <div className="flex space-x-4">
          <a
            href={`http://localhost:3001/api/export/${result.run_id}/json`}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Download JSON
          </a>
          <a
            href={`http://localhost:3001/api/export/${result.run_id}/csv`}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700"
          >
            Download CSV
          </a>
        </div>
      </div>
    </div>
  )
}
