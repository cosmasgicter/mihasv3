import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  InMemoryTelemetrySink,
  MonitoringService,
  type TelemetryEvent,
  type TelemetryQueryResult
} from '../monitoring'

describe('MonitoringService telemetry pipeline', () => {
  class RecordingSink extends InMemoryTelemetrySink {
    persistCalls = 0
    lastBatch: TelemetryEvent[] = []

    async persist(events: TelemetryEvent[]): Promise<void> {
      this.persistCalls += 1
      this.lastBatch = events.map(event => ({ ...event }))
      await super.persist(events)
    }
  }

  let sinks: RecordingSink[]
  let services: MonitoringService[]

  beforeEach(() => {
    sinks = []
    services = []
  })

  afterEach(() => {
    services.forEach(service => service.shutdown())
    sinks.length = 0
    services.length = 0
    vi.useRealTimers()
  })

  function createService(options: { flushIntervalMs?: number; maxBatchSize?: number } = {}) {
    const sink = new RecordingSink()
    sinks.push(sink)
    const service = new MonitoringService({
      sink,
      flushIntervalMs: options.flushIntervalMs ?? 10,
      maxBatchSize: options.maxBatchSize ?? 25,
      getAccessToken: async () => null
    })
    services.push(service)
    return { service, sink }
  }

  it('batches API telemetry and flushes through the sink', async () => {
    const { service, sink } = createService({ flushIntervalMs: 5, maxBatchSize: 10 })

    service.trackApiCall('applications', '/api/applications', 120, true, { statusCode: 200 })
    service.trackApiCall('applications', '/api/applications', 80, false, { statusCode: 500 })

    expect(sink.persistCalls).toBe(0)

    await service.flush()

    expect(sink.persistCalls).toBe(1)
    expect(sink.lastBatch).toHaveLength(2)

    const metrics = service.getMetrics()
    const key = 'applications:/api/applications'
    expect(metrics[key].calls).toBe(2)
    expect(metrics[key].errors).toBe(1)
    expect(metrics[key].statusCodes).toContain(500)
  })

  it('queues flushes without blocking response handling', async () => {
    vi.useFakeTimers()
    const { service, sink } = createService({ flushIntervalMs: 100 })

    const persistSpy = vi.spyOn(sink, 'persist')

    service.trackApiCall('catalog', '/api/catalog', 95, true)
    service.queueFlush()

    expect(persistSpy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(120)
    await Promise.resolve()

    expect(persistSpy).toHaveBeenCalledTimes(1)

    persistSpy.mockRestore()
  })

  it('persists telemetry across monitoring service restarts', async () => {
    const sink = new RecordingSink()
    const first = new MonitoringService({ sink, flushIntervalMs: 5, getAccessToken: async () => null })
    services.push(first)
    sinks.push(sink)

    first.trackApiCall('admin', '/api/admin', 200, true)
    first.trackApiCall('admin', '/api/admin', 220, false)
    await first.flush()

    const second = new MonitoringService({ sink, flushIntervalMs: 5, getAccessToken: async () => null })
    services.push(second)

    const result: TelemetryQueryResult = await second.getTelemetrySummary({ service: 'admin' })

    expect(result.summary).not.toHaveLength(0)
    const summary = result.summary.find(item => item.endpoint === '/api/admin')
    expect(summary?.totalCalls).toBe(2)
    expect(summary?.errorRate).toBeCloseTo(0.5)
    expect(summary?.avgDuration).toBeGreaterThan(0)
  })
})
