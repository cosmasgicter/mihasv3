import { analyticsConfig } from '@/config/analytics'

type ShareHeaders = Record<string, string>

export interface UmamiActiveUsersResponse {
  x?: number
  value?: number
  active?: number
}

export interface UmamiTimeseriesPoint {
  x: number
  y: number
}

export interface UmamiPageviewsResponse {
  pageviews?: UmamiTimeseriesPoint[]
  sessions?: UmamiTimeseriesPoint[]
}

export interface GetPageviewsParams {
  startAt: number
  endAt: number
  unit?: 'hour' | 'day' | 'month'
  timezone?: string
}

const ensureConfigured = () => {
  if (!analyticsConfig.isConfigured) {
    throw new Error('Analytics share endpoint is not configured')
  }
}

const getHeaders = (): ShareHeaders => {
  const headers: ShareHeaders = {
    Accept: 'application/json'
  }

  if (analyticsConfig.shareToken) {
    headers['x-umami-share-token'] = analyticsConfig.shareToken
  }

  return headers
}

const buildUrl = (path: string, searchParams?: Record<string, string | number | undefined>) => {
  ensureConfigured()

  const url = new URL(`${analyticsConfig.baseUrl}${path}`)

  if (searchParams) {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    })
  }

  return url.toString()
}

async function fetchFromShareApi<T>(path: string, searchParams?: Record<string, string | number | undefined>): Promise<T> {
  const response = await fetch(buildUrl(path, searchParams), {
    headers: getHeaders()
  })

  if (!response.ok) {
    throw new Error(`Analytics request failed with status ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const umamiAnalyticsService = {
  getActiveUsers: async (): Promise<UmamiActiveUsersResponse> => {
    return fetchFromShareApi<UmamiActiveUsersResponse>(`/api/share/${analyticsConfig.siteId}/active`)
  },

  getPageviews: async (params: GetPageviewsParams): Promise<UmamiPageviewsResponse> => {
    const { startAt, endAt, unit = 'day', timezone } = params

    return fetchFromShareApi<UmamiPageviewsResponse>(`/api/share/${analyticsConfig.siteId}/pageviews`, {
      startAt,
      endAt,
      unit,
      timezone
    })
  }
}
