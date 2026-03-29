// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { _getScrollPositions } from '@/hooks/useScrollRestoration'

describe('useScrollRestoration — scroll position map', () => {
  beforeEach(() => {
    // Clear the module-level map between tests
    _getScrollPositions().clear()
  })

  it('starts with an empty map', () => {
    expect(_getScrollPositions().size).toBe(0)
  })

  it('stores and retrieves a scroll position by pathname', () => {
    const map = _getScrollPositions()
    map.set('/dashboard', 250)
    expect(map.get('/dashboard')).toBe(250)
  })

  it('returns undefined for an unvisited route', () => {
    expect(_getScrollPositions().get('/never-visited')).toBeUndefined()
  })

  it('overwrites a previously stored position', () => {
    const map = _getScrollPositions()
    map.set('/settings', 100)
    map.set('/settings', 400)
    expect(map.get('/settings')).toBe(400)
  })

  it('maintains independent positions for different routes', () => {
    const map = _getScrollPositions()
    map.set('/dashboard', 0)
    map.set('/applications', 500)
    map.set('/settings', 120)

    expect(map.get('/dashboard')).toBe(0)
    expect(map.get('/applications')).toBe(500)
    expect(map.get('/settings')).toBe(120)
  })
})
