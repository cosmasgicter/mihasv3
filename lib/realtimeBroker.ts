type RealtimeEventType = 'application_update' | 'notification' | 'dashboard_refresh' | 'payment_update' | 'interview_scheduled'

export interface RealtimeEventEnvelope {
  event_id: string
  entity_id: string
  version: number
  created_at: string
  event_type: RealtimeEventType
  payload: Record<string, unknown>
}

interface RealtimeMetricsSnapshot {
  published: number
  duplicates: number
  avgDeliveryLatencyMs: number
}

const MAX_EVENTS_PER_USER = 200
const userEvents = new Map<string, RealtimeEventEnvelope[]>()
const seenEventIds = new Set<string>()

let publishedCount = 0
let duplicateCount = 0
let deliveryLatencyTotal = 0

export function publishRealtimeEvent(userId: string, event: RealtimeEventEnvelope): void {
  if (seenEventIds.has(event.event_id)) {
    duplicateCount += 1
    return
  }

  seenEventIds.add(event.event_id)
  publishedCount += 1

  const list = userEvents.get(userId) || []
  list.push(event)

  if (list.length > MAX_EVENTS_PER_USER) {
    list.shift()
  }

  userEvents.set(userId, list)
}

export function pollRealtimeEvents(userId: string, lastEventId?: string): RealtimeEventEnvelope[] {
  const list = userEvents.get(userId) || []
  if (!lastEventId) return list.slice(-25)

  const index = list.findIndex((event) => event.event_id === lastEventId)
  if (index === -1) return list.slice(-25)
  return list.slice(index + 1)
}

export function recordDeliveryLatency(createdAtIso: string): void {
  const latency = Math.max(0, Date.now() - new Date(createdAtIso).getTime())
  deliveryLatencyTotal += latency
}

export function getRealtimeMetrics(): RealtimeMetricsSnapshot {
  return {
    published: publishedCount,
    duplicates: duplicateCount,
    avgDeliveryLatencyMs: publishedCount > 0 ? Math.round(deliveryLatencyTotal / publishedCount) : 0,
  }
}

