/**
 * The admin queue's chosen view (platform-simplification task 30.1, R17.1).
 *
 * In-memory only, on purpose: the choice survives opening and closing a review
 * (the queue stays mounted, and so does this store), and resets on reload. A
 * resize never writes it; only the admin pressing a view button does.
 */
import { create } from 'zustand'

export type QueueView = 'cards' | 'table'

/** `narrow` is below 640 px, `medium` 640-1023 px, `wide` 1024 px and up. */
export type QueueWidthBand = 'narrow' | 'medium' | 'wide'

export const QUEUE_MEDIUM_MIN_WIDTH = 640
export const QUEUE_WIDE_MIN_WIDTH = 1024

export function queueWidthBand(width: number): QueueWidthBand {
  if (width < QUEUE_MEDIUM_MIN_WIDTH) return 'narrow'
  return width >= QUEUE_WIDE_MIN_WIDTH ? 'wide' : 'medium'
}

/**
 * Below 640 px always cards. From 640 px the admin's choice when there is one,
 * otherwise table at 1024 px and wider and cards from 640 to 1023 px.
 */
export function resolveQueueView(band: QueueWidthBand, chosen: QueueView | null): QueueView {
  if (band === 'narrow') return 'cards'
  if (chosen) return chosen
  return band === 'wide' ? 'table' : 'cards'
}

interface AdminQueueViewState {
  chosenView: QueueView | null
  setChosenView: (view: QueueView) => void
  reset: () => void
}

export const useAdminQueueViewStore = create<AdminQueueViewState>((set) => ({
  chosenView: null,
  setChosenView: (view) => set({ chosenView: view }),
  reset: () => set({ chosenView: null }),
}))
