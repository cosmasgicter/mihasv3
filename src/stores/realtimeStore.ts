import { create } from 'zustand'

export interface RealtimeEventEnvelope {
  event_id: string
  entity_id: string
  version: number
  created_at: string
  event_type: string
  payload: Record<string, unknown>
}

interface RealtimeStoreState {
  latestByEntity: Record<string, number>
  seenEventIds: Record<string, true>
  processed: number
  duplicates: number
  totalLatencyMs: number
  ingestEvent: (event: RealtimeEventEnvelope) => boolean
}

export const useRealtimeStore = create<RealtimeStoreState>((set, get) => ({
  latestByEntity: {},
  seenEventIds: {},
  processed: 0,
  duplicates: 0,
  totalLatencyMs: 0,
  ingestEvent: (event) => {
    const state = get()
    if (state.seenEventIds[event.event_id]) {
      set({ duplicates: state.duplicates + 1 })
      return false
    }

    const latest = state.latestByEntity[event.entity_id] || 0
    if (event.version < latest) {
      set({ duplicates: state.duplicates + 1 })
      return false
    }

    const latency = Math.max(0, Date.now() - new Date(event.created_at).getTime())
    set({
      seenEventIds: { ...state.seenEventIds, [event.event_id]: true },
      latestByEntity: { ...state.latestByEntity, [event.entity_id]: event.version },
      processed: state.processed + 1,
      totalLatencyMs: state.totalLatencyMs + latency,
    })

    return true
  },
}))

