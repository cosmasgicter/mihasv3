/**
 * Admin Users Reducer Property Tests
 *
 * Verifies the usersReducer state machine properties:
 * - Dialog open/close round-trips
 * - Filter state resets page
 * - Selection toggle idempotence
 */

import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import {
  usersReducer,
  initialUsersState,
  AVAILABLE_ROLES,
  getRoleLabel,
  getSessionSummary,
  PAGE_SIZE,
} from '@/pages/admin/lib/usersReducer'
import type { UsersAction, UsersState } from '@/pages/admin/lib/usersReducer'

describe('usersReducer property tests', () => {
  it('OPEN then CLOSE returns dialogs to initial state for create', () => {
    const opened = usersReducer(initialUsersState, { type: 'OPEN_CREATE' })
    expect(opened.dialogs.showCreateDialog).toBe(true)
    const closed = usersReducer(opened, { type: 'CLOSE_CREATE' })
    expect(closed.dialogs.showCreateDialog).toBe(false)
  })

  it('SET_SEARCH always resets currentPage to 1', () => {
    fc.assert(
      fc.property(fc.string(), (term) => {
        const withPage = { ...initialUsersState, filters: { ...initialUsersState.filters, currentPage: 5 } }
        const result = usersReducer(withPage, { type: 'SET_SEARCH', payload: term })
        expect(result.filters.currentPage).toBe(1)
        expect(result.filters.searchTerm).toBe(term)
      })
    )
  })

  it('SET_ROLE_FILTER always resets currentPage to 1', () => {
    fc.assert(
      fc.property(fc.string(), (role) => {
        const withPage = { ...initialUsersState, filters: { ...initialUsersState.filters, currentPage: 10 } }
        const result = usersReducer(withPage, { type: 'SET_ROLE_FILTER', payload: role })
        expect(result.filters.currentPage).toBe(1)
      })
    )
  })

  it('TOGGLE_USER is its own inverse', () => {
    fc.assert(
      fc.property(fc.uuid(), (userId) => {
        const once = usersReducer(initialUsersState, { type: 'TOGGLE_USER', userId })
        expect(once.selection.selectedUsers).toContain(userId)
        const twice = usersReducer(once, { type: 'TOGGLE_USER', userId })
        expect(twice.selection.selectedUsers).not.toContain(userId)
      })
    )
  })

  it('TOGGLE_SORT flips direction when same field, resets to asc on new field', () => {
    const state = usersReducer(initialUsersState, { type: 'TOGGLE_SORT', field: 'name' })
    // name is default, so first toggle flips to desc
    expect(state.filters.sortDirection).toBe('desc')
    const state2 = usersReducer(state, { type: 'TOGGLE_SORT', field: 'email' })
    expect(state2.filters.sortField).toBe('email')
    expect(state2.filters.sortDirection).toBe('asc')
  })

  it('CLEAR_FILTERS resets search, role, and page', () => {
    const dirty: UsersState = {
      ...initialUsersState,
      filters: { ...initialUsersState.filters, searchTerm: 'test', roleFilter: 'admin', currentPage: 3 },
    }
    const result = usersReducer(dirty, { type: 'CLEAR_FILTERS' })
    expect(result.filters.searchTerm).toBe('')
    expect(result.filters.roleFilter).toBe('')
    expect(result.filters.currentPage).toBe(1)
  })

  it('getRoleLabel returns label for known roles', () => {
    for (const role of AVAILABLE_ROLES) {
      expect(getRoleLabel(role.value)).toBe(role.label)
    }
  })

  it('getSessionSummary handles zero and positive counts', () => {
    expect(getSessionSummary(0)).toContain('No active sessions')
    expect(getSessionSummary(1)).toContain('1 active session')
    expect(getSessionSummary(3)).toContain('3 active sessions')
  })

  it('PAGE_SIZE is 25', () => {
    expect(PAGE_SIZE).toBe(25)
  })
})
