import { apiClient, buildQueryString } from './client'

type QueryValue = string | number | boolean | Array<string | number> | undefined
type TelemetryQueryParams = Record<string, QueryValue>

const getMetrics = () => apiClient.request('/analytics/metrics')
const getTelemetrySummary = (params: TelemetryQueryParams = {}) => {
  const query = buildQueryString(params)
  return apiClient.request(`/analytics/telemetry${query}`)
}

export const analyticsService = {
  getMetrics,
  getTelemetrySummary
}
