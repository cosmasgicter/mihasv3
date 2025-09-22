import { getApiBaseUrl } from './apiConfig'

export type TelemetryEventType = 'api_call' | 'custom_metric' | 'error' | 'alert'
export type TelemetryLevel = 'info' | 'warning' | 'error'

export interface TelemetryEvent {
  type: TelemetryEventType
  service: string
  endpoint?: string
  success?: boolean
  duration_ms?: number
  status_code?: number
  metric_name?: string
  metric_value?: number
  level?: TelemetryLevel
  message?: string
  metadata?: Record<string, any>
  occurred_at?: string
}

export interface TelemetryQuery {
  service?: string
  endpoint?: string
  type?: TelemetryEventType
  level?: TelemetryLevel
  since?: string
  windowMinutes?: number
  limit?: number
}

export interface TelemetrySummary {
  service: string
  endpoint?: string
  totalCalls: number
  errorCount: number
  errorRate: number
  avgDuration: number
  p95Duration: number
  firstSeen?: string
  lastSeen?: string
}

export interface TelemetryQueryResult {
  events: TelemetryEvent[]
  summary: TelemetrySummary[]
}

export interface TelemetrySink {
  persist(events: TelemetryEvent[]): Promise<void>
  query(query?: TelemetryQuery): Promise<TelemetryQueryResult>
}

export interface ApiCallMetadata {
  method?: string
  statusCode?: number
  requestId?: string
  metadata?: Record<string, any>
}

export interface MonitoringServiceOptions {
  sink?: TelemetrySink
  flushIntervalMs?: number
  maxBatchSize?: number
  storageKey?: string
  getAccessToken?: () => Promise<string | null>
}

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

type AggregatedApiMetric = {
  service: string
  endpoint: string
  calls: number
  errors: number
  totalDuration: number
  durationSamples: number[]
  statusCodes: Set<number>
  lastErrorAt?: string
  lastSuccessAt?: string
}

type AggregatedCustomMetric = {
  metric: string
  service: string
  count: number
  sum: number
  min?: number
  max?: number
  lastValue?: number
  lastUpdated?: string
  metadata?: Record<string, any>
}

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy'

export interface HealthCheckResult {
  service: string
  endpoint?: string
  status: HealthStatus
  errorRate?: number
  avgDuration?: number
  lastObservedAt?: string
  issues?: string[]
}

class MemoryStorage implements StorageLike {
  private store = new Map<string, string>()

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }
}

function resolveStorage(): StorageLike | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }

  const globalKey = '__mihasTelemetryStorage'
  const globalScope = globalThis as Record<string, any>
  if (!globalScope[globalKey]) {
    globalScope[globalKey] = new MemoryStorage()
  }

  return globalScope[globalKey] as StorageLike
}

function safeNow(): string {
  return new Date().toISOString()
}

function calculatePercentile(values: number[], percentile: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 1) {
    return sorted[0]
  }
  const rank = percentile / 100 * (sorted.length - 1)
  const lower = Math.floor(rank)
  const upper = Math.ceil(rank)
  if (lower === upper) {
    return sorted[lower]
  }
  const weight = rank - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

async function defaultGetAccessToken(): Promise<string | null> {
  try {
    const module = await import('./supabase')
    const getClient = (module as any).getSupabaseClient ?? (module as any).createSupabaseClient
    if (!getClient) {
      return null
    }
    const client = getClient()
    const { data } = await client.auth.getSession()
    return data?.session?.access_token ?? null
  } catch (error) {
    console.warn('Telemetry access token unavailable:', error instanceof Error ? error.message : error)
    return null
  }
}

class HttpTelemetrySink implements TelemetrySink {
  private baseUrl: string
  private getAccessToken?: () => Promise<string | null>

  constructor(baseUrl: string, getAccessToken?: () => Promise<string | null>) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.getAccessToken = getAccessToken
  }

  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json'
    }

    if (this.getAccessToken) {
      try {
        const token = await this.getAccessToken()
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }
      } catch (error) {
        console.warn('Unable to resolve telemetry auth token:', error)
      }
    }

    return headers
  }

  async persist(events: TelemetryEvent[]): Promise<void> {
    if (!events.length) {
      return
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/analytics/telemetry`, {
        method: 'POST',
        headers: await this.buildHeaders(),
        body: JSON.stringify({ events }),
        keepalive: typeof navigator !== 'undefined' && 'sendBeacon' in navigator ? true : undefined
      })

      if (!response.ok) {
        // In development, API might not be available
        if (process.env.NODE_ENV === 'development' || response.status === 404) {
          // Silently ignore telemetry failures in development
          return
        }
        const message = await response.text().catch(() => `${response.status}`)
        throw new Error(`Failed to persist telemetry: ${message}`)
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Telemetry persist failed in development:', error)
        return
      }
      throw error
    }
  }

  async query(query: TelemetryQuery = {}): Promise<TelemetryQueryResult> {
    const params = new URLSearchParams()
    if (query.service) params.set('service', query.service)
    if (query.endpoint) params.set('endpoint', query.endpoint)
    if (query.type) params.set('type', query.type)
    if (query.level) params.set('level', query.level)
    if (query.limit) params.set('limit', String(query.limit))
    if (query.since) params.set('since', query.since)
    if (query.windowMinutes) params.set('windowMinutes', String(query.windowMinutes))

    const queryString = params.toString()
    const url = `${this.baseUrl}/api/analytics/telemetry${queryString ? `?${queryString}` : ''}`
    const response = await fetch(url, {
      method: 'GET',
      headers: await this.buildHeaders()
    })

    if (!response.ok) {
      const message = await response.text().catch(() => `${response.status}`)
      throw new Error(`Failed to load telemetry: ${message}`)
    }

    const payload = await response.json().catch(() => ({ events: [], summary: [] }))
    return {
      events: Array.isArray(payload.events) ? payload.events : [],
      summary: Array.isArray(payload.summary) ? payload.summary : []
    }
  }
}

export class InMemoryTelemetrySink implements TelemetrySink {
  private store: TelemetryEvent[] = []

  async persist(events: TelemetryEvent[]): Promise<void> {
    if (!events.length) return
    const normalised = events.map(event => ({
      ...event,
      occurred_at: event.occurred_at ?? safeNow()
    }))
    this.store.push(...normalised)
  }

  async query(query: TelemetryQuery = {}): Promise<TelemetryQueryResult> {
    const sinceMs = query.since ? Date.parse(query.since) : null
    const windowMs = query.windowMinutes ? Date.now() - query.windowMinutes * 60_000 : null

    let filtered = this.store.filter(event => {
      if (query.type && event.type !== query.type) return false
      if (query.level && event.level !== query.level) return false
      if (query.service && event.service !== query.service) return false
      if (query.endpoint && event.endpoint !== query.endpoint) return false
      if (sinceMs && Date.parse(event.occurred_at ?? '') < sinceMs) return false
      if (windowMs && Date.parse(event.occurred_at ?? '') < windowMs) return false
      return true
    })

    filtered = filtered
      .slice()
      .sort((a, b) => Date.parse(b.occurred_at ?? '') - Date.parse(a.occurred_at ?? ''))

    if (query.limit) {
      filtered = filtered.slice(0, query.limit)
    }

    const summaryMap = new Map<string, TelemetrySummary & { samples: number[] }>()

    filtered
      .filter(event => event.type === 'api_call')
      .forEach(event => {
        const endpoint = event.endpoint ?? 'unknown'
        const key = `${event.service}:${endpoint}`
        if (!summaryMap.has(key)) {
          summaryMap.set(key, {
            service: event.service,
            endpoint,
            totalCalls: 0,
            errorCount: 0,
            errorRate: 0,
            avgDuration: 0,
            p95Duration: 0,
            firstSeen: event.occurred_at,
            lastSeen: event.occurred_at,
            samples: []
          })
        }

        const entry = summaryMap.get(key)!
        entry.totalCalls += 1
        if (!event.success) {
          entry.errorCount += 1
        }
        if (typeof event.duration_ms === 'number') {
          entry.samples.push(event.duration_ms)
        }
        const occurred = Date.parse(event.occurred_at ?? safeNow())
        if (!entry.firstSeen || occurred < Date.parse(entry.firstSeen)) {
          entry.firstSeen = event.occurred_at
        }
        if (!entry.lastSeen || occurred > Date.parse(entry.lastSeen)) {
          entry.lastSeen = event.occurred_at
        }
      })

    const summary = Array.from(summaryMap.values()).map(entry => {
      const avgDuration = entry.samples.length
        ? entry.samples.reduce((sum, value) => sum + value, 0) / entry.samples.length
        : 0
      return {
        service: entry.service,
        endpoint: entry.endpoint,
        totalCalls: entry.totalCalls,
        errorCount: entry.errorCount,
        errorRate: entry.totalCalls > 0 ? entry.errorCount / entry.totalCalls : 0,
        avgDuration,
        p95Duration: calculatePercentile(entry.samples, 95),
        firstSeen: entry.firstSeen,
        lastSeen: entry.lastSeen
      }
    })

    return {
      events: filtered,
      summary
    }
  }
}

export class MonitoringService {
  private apiMetrics: Map<string, AggregatedApiMetric> = new Map()
  private customMetrics: Map<string, AggregatedCustomMetric> = new Map()
  private queue: TelemetryEvent[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private pendingFlush: Promise<void> | null = null
  private failedFlushes = 0
  private readonly sink: TelemetrySink
  private readonly flushIntervalMs: number
  private readonly maxBatchSize: number
  private readonly storage: StorageLike | null
  private readonly storageKey: string
  private readonly getAccessToken?: () => Promise<string | null>
  private readonly maxSamples = 50

  constructor(options: MonitoringServiceOptions = {}) {
    this.flushIntervalMs = options.flushIntervalMs ?? 5_000
    this.maxBatchSize = options.maxBatchSize ?? 25
    this.storageKey = options.storageKey ?? 'mihas.telemetry.buffer'
    this.storage = resolveStorage()
    this.getAccessToken = options.getAccessToken ?? defaultGetAccessToken

    this.sink = options.sink ?? new HttpTelemetrySink(getApiBaseUrl(), this.getAccessToken)

    this.restoreQueueFromStorage()

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.persistQueue()
      })

      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            this.persistQueue()
          }
        })
      }
    }
  }

  trackApiCall(
    service: string,
    endpoint: string,
    duration: number,
    success: boolean,
    metadata: ApiCallMetadata = {}
  ): void {
    const occurred_at = safeNow()
    const event: TelemetryEvent = {
      type: 'api_call',
      service,
      endpoint,
      duration_ms: Math.round(duration),
      success,
      status_code: metadata.statusCode,
      metadata: {
        method: metadata.method,
        requestId: metadata.requestId,
        ...metadata.metadata
      },
      occurred_at
    }

    this.updateApiMetric(event)
    this.enqueue(event)
  }

  trackMetric(metric: string, value: number, metadata: Record<string, any> = {}): void {
    const service = typeof metadata.service === 'string' ? metadata.service : 'system'
    const occurred_at = safeNow()
    const event: TelemetryEvent = {
      type: 'custom_metric',
      service,
      metric_name: metric,
      metric_value: value,
      metadata,
      occurred_at
    }

    this.updateCustomMetric(event)
    this.enqueue(event)
  }

  logError(
    source: string | Error,
    error?: string | Error | Record<string, any>,
    context?: Record<string, any>
  ): void {
    let service = 'system'
    let message = 'Unknown error'
    let metadata: Record<string, any> = {}

    if (typeof source === 'string') {
      service = source
    } else if (source instanceof Error) {
      message = source.message
      metadata.stack = source.stack
      service = 'system'
    }

    if (typeof error === 'string') {
      message = error
    } else if (error instanceof Error) {
      message = error.message
      metadata.stack = error.stack ?? metadata.stack
    } else if (error && typeof error === 'object') {
      metadata = { ...metadata, ...error }
    }

    if (context) {
      metadata = { ...metadata, ...context }
    }

    console.error(`[${service}] ${message}`, metadata)

    const event: TelemetryEvent = {
      type: 'error',
      service,
      level: 'error',
      message,
      metadata,
      occurred_at: safeNow()
    }

    this.enqueue(event)
  }

  createAlert(level: TelemetryLevel, message: string, metadata: Record<string, any> = {}): void {
    const event: TelemetryEvent = {
      type: 'alert',
      service: metadata.service ?? 'system',
      level,
      message,
      metadata,
      occurred_at: safeNow()
    }

    this.enqueue(event)
  }

  getMetrics(): Record<string, any> {
    const entries = Array.from(this.apiMetrics.entries()).map(([key, metric]) => {
      const avgDuration = metric.calls > 0 ? metric.totalDuration / metric.calls : 0
      return [
        key,
        {
          service: metric.service,
          endpoint: metric.endpoint,
          calls: metric.calls,
          errors: metric.errors,
          errorRate: metric.calls > 0 ? metric.errors / metric.calls : 0,
          avgDuration,
          p95Duration: calculatePercentile(metric.durationSamples, 95),
          lastErrorAt: metric.lastErrorAt,
          lastSuccessAt: metric.lastSuccessAt,
          statusCodes: Array.from(metric.statusCodes)
        }
      ]
    })

    return Object.fromEntries(entries)
  }

  getCustomMetrics(): Record<string, AggregatedCustomMetric> {
    return Object.fromEntries(this.customMetrics.entries())
  }

  queueFlush(immediate = false): void {
    this.scheduleFlush(immediate ? 0 : this.flushIntervalMs)
  }

  async flush(): Promise<void> {
    await this.flushInternal(true)
  }

  async getTelemetrySummary(query: TelemetryQuery = {}): Promise<TelemetryQueryResult> {
    return this.sink.query(query)
  }

  async performHealthCheck(windowMinutes = 15): Promise<HealthCheckResult[]> {
    const results = new Map<string, HealthCheckResult>()

    this.apiMetrics.forEach((metric, key) => {
      const avgDuration = metric.calls > 0 ? metric.totalDuration / metric.calls : 0
      const errorRate = metric.calls > 0 ? metric.errors / metric.calls : 0
      const issues: string[] = []
      let status: HealthStatus = 'healthy'

      if (avgDuration > 1_500) {
        status = 'degraded'
        issues.push('High latency')
      }

      if (errorRate >= 0.3) {
        status = 'unhealthy'
        issues.push('Elevated error rate')
      }

      results.set(key, {
        service: metric.service,
        endpoint: metric.endpoint,
        status,
        errorRate,
        avgDuration,
        lastObservedAt: metric.lastSuccessAt ?? metric.lastErrorAt,
        issues
      })
    })

    try {
      const persisted = await this.getTelemetrySummary({ type: 'api_call', windowMinutes })
      persisted.summary.forEach(summary => {
        const key = `${summary.service}:${summary.endpoint ?? 'unknown'}`
        const issues: string[] = []
        let status: HealthStatus = 'healthy'
        if (summary.avgDuration > 1_500) {
          status = 'degraded'
          issues.push('High latency (persisted)')
        }
        if (summary.errorRate >= 0.3) {
          status = 'unhealthy'
          issues.push('Error rate threshold breached (persisted)')
        }

        const existing = results.get(key)
        if (!existing || compareStatus(status, existing.status) > 0) {
          results.set(key, {
            service: summary.service,
            endpoint: summary.endpoint,
            status: existing ? mergeStatus(existing.status, status) : status,
            errorRate: summary.errorRate,
            avgDuration: summary.avgDuration,
            lastObservedAt: summary.lastSeen,
            issues: existing ? Array.from(new Set([...(existing.issues ?? []), ...issues])) : issues
          })
        } else if (existing) {
          existing.issues = Array.from(new Set([...(existing.issues ?? []), ...issues]))
          existing.lastObservedAt = existing.lastObservedAt ?? summary.lastSeen
        }
      })
    } catch (error) {
      console.warn('Failed to evaluate persisted telemetry during health check:', error)
    }

    return Array.from(results.values())
  }

  shutdown(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.persistQueue()
  }

  private updateApiMetric(event: TelemetryEvent): void {
    const endpoint = event.endpoint ?? 'unknown'
    const key = `${event.service}:${endpoint}`
    const existing: AggregatedApiMetric = this.apiMetrics.get(key) ?? {
      service: event.service,
      endpoint,
      calls: 0,
      errors: 0,
      totalDuration: 0,
      durationSamples: [],
      statusCodes: new Set<number>()
    }

    existing.calls += 1
    if (!event.success) {
      existing.errors += 1
      existing.lastErrorAt = event.occurred_at
    } else {
      existing.lastSuccessAt = event.occurred_at
    }

    if (typeof event.duration_ms === 'number') {
      existing.totalDuration += event.duration_ms
      existing.durationSamples.push(event.duration_ms)
      if (existing.durationSamples.length > this.maxSamples) {
        existing.durationSamples.shift()
      }
    }

    if (typeof event.status_code === 'number') {
      existing.statusCodes.add(event.status_code)
    }

    this.apiMetrics.set(key, existing)
  }

  private updateCustomMetric(event: TelemetryEvent): void {
    if (!event.metric_name) return
    const key = `${event.service}:${event.metric_name}`
    const existing: AggregatedCustomMetric = this.customMetrics.get(key) ?? {
      metric: event.metric_name,
      service: event.service,
      count: 0,
      sum: 0
    }

    const value = event.metric_value ?? 0
    existing.count += 1
    existing.sum += value
    existing.min = existing.min !== undefined ? Math.min(existing.min, value) : value
    existing.max = existing.max !== undefined ? Math.max(existing.max, value) : value
    existing.lastValue = value
    existing.lastUpdated = event.occurred_at
    existing.metadata = { ...existing.metadata, ...event.metadata }

    this.customMetrics.set(key, existing)
  }

  private enqueue(event: TelemetryEvent): void {
    const item: TelemetryEvent = {
      ...event,
      occurred_at: event.occurred_at ?? safeNow()
    }
    this.queue.push(item)
    this.persistQueue()

    const immediate = this.queue.length >= this.maxBatchSize
    this.scheduleFlush(immediate ? 0 : this.flushIntervalMs)
  }

  private scheduleFlush(delay: number): void {
    if (this.flushTimer || this.queue.length === 0) {
      return
    }

    const timeout = Math.max(0, delay)
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flushInternal()
    }, timeout)
  }

  private async flushInternal(force = false): Promise<void> {
    if (this.pendingFlush) {
      return force ? this.pendingFlush : this.pendingFlush.catch(() => {})
    }

    if (!force && this.queue.length === 0) {
      return
    }

    const batch = this.queue.splice(0, this.maxBatchSize)
    if (!batch.length) {
      return
    }

    const flushPromise = (async () => {
      try {
        await this.sink.persist(batch)
        this.failedFlushes = 0
      } catch (error) {
        this.failedFlushes += 1
        this.queue = batch.concat(this.queue)
        const backoff = Math.min(this.flushIntervalMs * Math.pow(2, this.failedFlushes), 60_000)
        this.scheduleFlush(backoff)
        if (force) {
          throw error
        } else {
          console.warn('Telemetry flush failed:', error)
        }
      } finally {
        this.persistQueue()
        this.pendingFlush = null
        if (this.queue.length > 0 && !this.flushTimer) {
          this.scheduleFlush(this.flushIntervalMs)
        }
      }
    })()

    this.pendingFlush = flushPromise

    if (force) {
      await flushPromise
    } else {
      flushPromise.catch(() => {})
    }
  }

  private persistQueue(): void {
    if (!this.storage) return

    try {
      if (this.queue.length === 0) {
        this.storage.removeItem(this.storageKey)
        return
      }

      this.storage.setItem(this.storageKey, JSON.stringify(this.queue))
    } catch (error) {
      console.warn('Failed to persist telemetry buffer:', error)
    }
  }

  private restoreQueueFromStorage(): void {
    if (!this.storage) return

    try {
      const raw = this.storage.getItem(this.storageKey)
      if (!raw) return

      const events = JSON.parse(raw)
      if (Array.isArray(events)) {
        this.queue.push(...events)
        if (this.queue.length > 0) {
          this.scheduleFlush(0)
        }
      }
      this.storage.removeItem(this.storageKey)
    } catch (error) {
      console.warn('Failed to restore telemetry buffer:', error)
      this.storage.removeItem(this.storageKey)
    }
  }
}

function compareStatus(current: HealthStatus, other: HealthStatus): number {
  const order: Record<HealthStatus, number> = {
    healthy: 0,
    degraded: 1,
    unhealthy: 2
  }
  return order[current] - order[other]
}

function mergeStatus(primary: HealthStatus, secondary: HealthStatus): HealthStatus {
  if (primary === 'unhealthy' || secondary === 'unhealthy') return 'unhealthy'
  if (primary === 'degraded' || secondary === 'degraded') return 'degraded'
  return 'healthy'
}

const defaultMonitoringService = new MonitoringService()

export const monitoring = defaultMonitoringService
