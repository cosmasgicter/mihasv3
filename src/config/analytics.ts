export interface AnalyticsConfig {
  /** Base URL for the analytics share API (e.g., https://analytics.example.com) */
  baseUrl: string
  /** Umami site identifier used for the share endpoints */
  siteId: string
  /** Share token required by Umami when accessing the public API */
  shareToken: string
  /** Convenience flag to check whether all required values are present */
  isConfigured: boolean
}

const normalizeBaseUrl = (url: string | undefined) => {
  if (!url) {
    return ''
  }

  return url.endsWith('/') ? url.slice(0, -1) : url
}

const baseUrl = normalizeBaseUrl(import.meta.env.VITE_ANALYTICS_BASE_URL)
const siteId = import.meta.env.VITE_ANALYTICS_SITE_ID?.trim() ?? ''
const shareToken = import.meta.env.VITE_ANALYTICS_SHARE_TOKEN?.trim() ?? ''

export const analyticsConfig: AnalyticsConfig = {
  baseUrl,
  siteId,
  shareToken,
  isConfigured: Boolean(baseUrl && siteId && shareToken)
}
