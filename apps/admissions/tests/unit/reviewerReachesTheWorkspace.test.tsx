/**
 * A Reviewer can reach the admin review workspace in a browser (task 9.4, AUTH-01).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.4
 * Requirements: R8.2, R8.7 · Finding: AUTH-01
 *
 * AUTH-01 is a *frontend denial* of work the backend grants: "Reviewers are
 * excluded by frontend admin guards and treated as students by backend lists,
 * while review mutations require `IsAdmin`." The backend half is fixed by the
 * capability matrix; this is the browser half, and it has two moving parts:
 *
 * 1. `CapabilityProvider` has to **ask** for the actor's capabilities. It used to
 *    ask only when the role string was `admin` or above, so a Reviewer's
 *    capability set was never fetched and `noAccess` was permanently `true`.
 * 2. `AdminRoute` has to admit an actor the backend says holds authority, rather
 *    than one whose role string is in a tier.
 *
 * Both are one-line predicates, and both are the kind of predicate that fails
 * *silently in the safe-looking direction* — an always-false gate looks like a
 * working permission check until someone tries to use it. Two of these cases fail
 * if either predicate becomes always-true or always-false.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAdmin, isReviewer, isStudent } from '@/types/roles'

const getCapabilities = vi.fn()
let currentUser: { id: string; role: string } | null = { id: 'u1', role: 'reviewer' }

vi.mock('@/services/admin/capabilities', () => ({
  adminCapabilityService: { getCapabilities: () => getCapabilities() },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: currentUser }),
}))

async function capabilitiesFor(role: string | null) {
  currentUser = role ? { id: 'u1', role } : null
  window.sessionStorage.clear()
  const { CapabilityProvider, useCapabilities } = await import('@/contexts/CapabilityContext')
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <CapabilityProvider>{children}</CapabilityProvider>
    </QueryClientProvider>
  )
  const { result } = renderHook(() => useCapabilities(), { wrapper })
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  return result
}

beforeEach(() => {
  getCapabilities.mockReset()
  getCapabilities.mockResolvedValue({
    role: 'reviewer',
    is_super_admin: false,
    all_access: false,
    capabilities: [],
    institutions: [
      {
        id: 'inst-1',
        code: 'SCH',
        name: 'Example School',
        capabilities: ['tenant.application.read', 'tenant.application.review'],
      },
    ],
  })
})

afterEach(() => {
  currentUser = { id: 'u1', role: 'reviewer' }
})

describe('the role helpers are hierarchy predicates, not equality checks', () => {
  it('isStudent is true for every role, so it cannot express "is not a student"', () => {
    // This is why the predicate is spelled `isReviewer` and not `!isStudent`.
    // `hasRole(actor, 'student')` asks "at least student", which an admin also
    // satisfies — so `!isStudent(user)` is false for **everyone**, and a gate
    // written that way silently admits nobody.
    for (const role of ['student', 'reviewer', 'admin', 'super_admin']) {
      expect(isStudent({ role })).toBe(true)
    }
  })

  it('isReviewer is exactly "reviewer or above"', () => {
    expect(isReviewer({ role: 'student' })).toBe(false)
    expect(isReviewer({ role: 'reviewer' })).toBe(true)
    expect(isReviewer({ role: 'admin' })).toBe(true)
    expect(isReviewer({ role: 'super_admin' })).toBe(true)
    // And it is strictly wider than the tier the guard used to use.
    expect(isAdmin({ role: 'reviewer' })).toBe(false)
  })
})

describe('the capability provider asks for a Reviewer’s capabilities (AUTH-01)', () => {
  it('fetches and resolves a scoped reviewer’s tenant capabilities', async () => {
    const result = await capabilitiesFor('reviewer')

    expect(getCapabilities).toHaveBeenCalled()
    // The backend said this actor holds review authority for one school, so the
    // browser must not treat them as having no access.
    expect(result.current.noAccess).toBe(false)
    expect(result.current.canForInstitution('inst-1', 'tenant.application.review')).toBe(true)
    // A single-institution actor is auto-locked to it, so `can()` answers too.
    expect(result.current.can('tenant.application.review')).toBe(true)
  })

  it('still asks for an admin’s capabilities', async () => {
    const result = await capabilitiesFor('admin')
    expect(getCapabilities).toHaveBeenCalled()
    expect(result.current.noAccess).toBe(false)
  })

  it('does not ask for a student’s', async () => {
    const result = await capabilitiesFor('student')
    expect(getCapabilities).not.toHaveBeenCalled()
    expect(result.current.noAccess).toBe(true)
    expect(result.current.can('tenant.application.review')).toBe(false)
  })

  it('does not ask when there is no actor', async () => {
    const result = await capabilitiesFor(null)
    expect(getCapabilities).not.toHaveBeenCalled()
    expect(result.current.noAccess).toBe(true)
  })

  it('a reviewer whose capabilities resolve to nothing has no access', async () => {
    // Fail closed: the browser follows the backend's answer in both directions.
    getCapabilities.mockResolvedValue({
      role: 'reviewer',
      is_super_admin: false,
      all_access: false,
      capabilities: [],
      institutions: [],
    })
    const result = await capabilitiesFor('reviewer')
    expect(result.current.noAccess).toBe(true)
    expect(result.current.can('tenant.application.review')).toBe(false)
  })
})
