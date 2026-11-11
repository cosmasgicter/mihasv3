import { useEffect, useState } from 'react'
import {
  QUEUE_MEDIUM_MIN_WIDTH,
  QUEUE_WIDE_MIN_WIDTH,
  queueWidthBand,
  type QueueWidthBand,
} from '@/stores/adminQueueViewStore'

const currentBand = (): QueueWidthBand =>
  typeof window === 'undefined' ? 'wide' : queueWidthBand(window.innerWidth)

/**
 * Which of the queue's three width bands the viewport is in (task 30.1).
 * Follows the two media-query boundaries, so it changes only when a band does.
 */
export function useQueueWidthBand(): QueueWidthBand {
  const [band, setBand] = useState<QueueWidthBand>(currentBand)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const update = () => setBand(currentBand())
    update()
    if (typeof window.matchMedia !== 'function') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const queries = [
      window.matchMedia(`(min-width: ${QUEUE_MEDIUM_MIN_WIDTH}px)`),
      window.matchMedia(`(min-width: ${QUEUE_WIDE_MIN_WIDTH}px)`),
    ]
    queries.forEach((query) => query.addEventListener('change', update))
    return () => queries.forEach((query) => query.removeEventListener('change', update))
  }, [])

  return band
}
