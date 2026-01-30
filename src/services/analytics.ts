/**
 * Analytics Service - STUBBED
 * 
 * Analytics features were removed during Vercel migration.
 * These functions return empty data to maintain API compatibility
 * without making network requests to non-existent endpoints.
 */

type QueryValue = string | number | boolean | Array<string | number> | undefined
type TelemetryQueryParams = Record<string, QueryValue>

// Return empty metrics - analytics removed
const getMetrics = async () => {
  return { success: true, data: {} }
}

// Return empty telemetry summary - analytics removed
const getTelemetrySummary = async (_params: TelemetryQueryParams = {}) => {
  return { success: true, data: { events: [], summary: [] } }
}

export const analyticsService = {
  getMetrics,
  getTelemetrySummary
}
