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
  toDirectoryQuery,
  SORTABLE_COLUMNS,
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

  it('TOGGLE_SORT flips direction when same field, resets on a new field', () => {
    // The sort field names are the registered backend keys after task 9.3
    // (R6.1): the header an operator clicks and the `sort=` a request carries
    // are the same string, so a sorted view is reproducible from a URL.
    const state = usersReducer(initialUsersState, { type: 'TOGGLE_SORT', field: 'created_at' })
    // created_at is the default (desc), so the first toggle flips to asc.
    expect(state.filters.sortField).toBe('created_at')
    expect(state.filters.sortDirection).toBe('asc')
    const state2 = usersReducer(state, { type: 'TOGGLE_SORT', field: 'email' })
    expect(state2.filters.sortField).toBe('email')
    expect(state2.filters.sortDirection).toBe('asc')
    // A date column starts newest-first, because that is what an operator means.
    const state3 = usersReducer(state2, { type: 'TOGGLE_SORT', field: 'created_at' })
    expect(state3.filters.sortDirection).toBe('desc')
  })

  it('every sortable column names a registered backend sort key', () => {
    // Drift guard: the UI's sort vocabulary is the server's. ADM-03's second
    // habit was a UI-invented spelling no parser understood.
    const registered = ['created_at', 'display_name', 'email', 'role', 'is_active']
    for (const column of SORTABLE_COLUMNS) {
      expect(registered).toContain(column.field)
    }
  })

  it('toDirectoryQuery emits only registered parameter names', () => {
    const registered = new Set([
      'institution_id', 'role', 'search', 'is_active', 'include_inactive',
      'has_membership', 'start_date', 'end_date', 'sort', 'order', 'page', 'pageSize',
    ])
    const query = toDirectoryQuery(
      {
        ...initialUsersState.filters,
        roleFilter: 'admin',
        activeFilter: false,
        membershipFilter: true,
        institutionId: 'inst-1',
        currentPage: 3,
      },
      'needle',
    )
    for (const key of Object.keys(query)) {
      expect(registered.has(key)).toBe(true)
    }
    expect(query.page).toBe(3)
    expect(query.role).toBe('admin')
    expect(query.search).toBe('needle')
    expect(query.is_active).toBe('false')
    expect(query.has_membership).toBe('true')
    expect(query.institution_id).toBe('inst-1')
  })

  it('an unset tri-state filter is absent, not guessed', () => {
    // Absent means "the platform's default" (enabled accounts only). Sending
    // `is_active=true` unasked would make the default invisible in the URL.
    const query = toDirectoryQuery(initialUsersState.filters, '')
    expect('is_active' in query).toBe(false)
    expect('has_membership' in query).toBe(false)
    expect('search' in query).toBe(false)
  })

  it('CLEAR_FILTERS resets search, role, and page', () => {
    const dirty: UsersState = {
      ...initialUsersState,
      filters: {
        ...initialUsersState.filters,
        searchTerm: 'test',
        roleFilter: 'admin',
        activeFilter: false,
        membershipFilter: true,
        institutionId: 'inst-1',
        currentPage: 3,
      },
    }
    const result = usersReducer(dirty, { type: 'CLEAR_FILTERS' })
    expect(result.filters.searchTerm).toBe('')
    expect(result.filters.roleFilter).toBe('')
    expect(result.filters.activeFilter).toBeNull()
    expect(result.filters.membershipFilter).toBeNull()
    expect(result.filters.institutionId).toBe('')
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
