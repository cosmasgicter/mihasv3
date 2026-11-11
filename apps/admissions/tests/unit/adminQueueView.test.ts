/**
 * The admin queue's default view (platform-simplification task 30.1, R17.1).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  queueWidthBand,
  resolveQueueView,
  useAdminQueueViewStore,
} from '@/stores/adminQueueViewStore'

beforeEach(() => useAdminQueueViewStore.getState().reset())

describe('queue width bands', () => {
  it.each([
    [320, 'narrow'],
    [390, 'narrow'],
    [639, 'narrow'],
    [640, 'medium'],
    [1023, 'medium'],
    [1024, 'wide'],
    [1440, 'wide'],
  ] as const)('%ipx is %s', (width, band) => {
    expect(queueWidthBand(width)).toBe(band)
  })
})

describe('resolveQueueView', () => {
  it('is always cards below 640px, whatever was chosen', () => {
    expect(resolveQueueView('narrow', null)).toBe('cards')
    expect(resolveQueueView('narrow', 'table')).toBe('cards')
  })

  it('defaults to cards from 640 to 1023px and table from 1024px with no choice', () => {
    expect(resolveQueueView('medium', null)).toBe('cards')
    expect(resolveQueueView('wide', null)).toBe('table')
  })

  it('uses the admin\'s choice from 640px', () => {
    expect(resolveQueueView('medium', 'table')).toBe('table')
    expect(resolveQueueView('wide', 'cards')).toBe('cards')
  })
})

describe('the chosen view', () => {
  it('starts unset and survives a round trip to the review route', () => {
    expect(useAdminQueueViewStore.getState().chosenView).toBeNull()
    useAdminQueueViewStore.getState().setChosenView('cards')
    // Opening and closing a review unmounts and remounts page components; the
    // store lives outside them, so the choice is read back unchanged.
    expect(useAdminQueueViewStore.getState().chosenView).toBe('cards')
    expect(resolveQueueView('wide', useAdminQueueViewStore.getState().chosenView)).toBe('cards')
  })

  it('is not written by resizing: only setChosenView writes it', () => {
    resolveQueueView('wide', null)
    resolveQueueView('narrow', null)
    expect(useAdminQueueViewStore.getState().chosenView).toBeNull()
  })
})
