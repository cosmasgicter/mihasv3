/**
 * The tenant audit panel reads the selected school's endpoint (task 9.5).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.5 — "Correct tenant
 * audit and amendment notification scope".
 * Requirements: **R3** (backend authority; the frontend gates on backend
 * capabilities, never on a role string), **R6.6** (the tenant audit list and export
 * use the selected institution endpoint, paginate, and never leak another tenant's
 * events).
 * Findings: **ADM-05**.
 *
 * These render the REAL `AuditPanel` against a mocked audit service, so what is
 * under test is the wiring the finding was about:
 *
 *   1. the **selected institution** reaches the request — the panel does not call
 *      a generic feed and hope;
 *   2. switching schools issues a request for the *other* school, rather than
 *      re-reading one list under a new cache key;
 *   3. the counts shown are the server's `facets`, not a tally of the rendered
 *      rows, and they do not move when the operator turns a page;
 *   4. the category is the server's, rendered with a label (never colour alone),
 *      and the filter is sent rather than applied afterwards;
 *   5. the export control follows the backend's `can_export` **and** the
 *      capability set, and the export request drops the page because it is
 *      page-independent.
 *
 * The backend authority half — capability gating, cross-tenant masking, the
 * audited export — lives in
 * `backend/tests/unit/test_tenant_audit_amendment_scope_9_5.py`.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CapabilityValue } from '@/contexts/CapabilityContext'

const { capabilityState } = vi.hoisted(() => ({
  capabilityState: { current: null as unknown as CapabilityValue },
}))

vi.mock('@/contexts/CapabilityContext', () => ({
  useCapabilities: () => capabilityState.current,
  CapabilityProvider: ({ children }: { children: ReactNode }) => children,
}))

const list = vi.fn()
const download = vi.fn()
const exportPath = vi.fn(
  (query: Record<string, unknown>) =>
    `/admin/institutions/${query.institutionId}/audit/?export=csv&spy=${JSON.stringify(query)}`,
)

vi.mock('@/services/admin/tenantAudit', async () => {
  const actual = await vi.importActual<typeof import('@/services/admin/tenantAudit')>(
    '@/services/admin/tenantAudit',
  )
  return {
    ...actual,
    tenantAuditService: {
      list: (...args: unknown[]) => list(...args),
      exportPath: (...args: unknown[]) => exportPath(...(args as [Record<string, unknown>])),
      download: (...args: unknown[]) => download(...args),
    },
  }
})

import { AuditPanel } from '@/pages/admin/tenants/AuditPanel'

const INSTITUTION_A = 'inst-a'
const INSTITUTION_B = 'inst-b'

function tenantCapabilities(overrides: Partial<CapabilityValue> = {}): CapabilityValue {
  return {
    isSuperAdmin: false,
    isTenantAdmin: true,
    platformCapabilities: [],
    institutionCapabilities: { [INSTITUTION_A]: ['tenant.audit.read'] },
    scopedInstitutionIds: [INSTITUTION_A],
    selectedInstitutionId: INSTITUTION_A,
    selectInstitution: vi.fn(),
    can: () => false,
    canForInstitution: (institutionId: string, capability: string) =>
      institutionId === INSTITUTION_A && capability === 'tenant.audit.read',
    noAccess: false,
    isLoading: false,
    ...overrides,
  } as CapabilityValue
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    institution_id: INSTITUTION_A,
    page: 1,
    pageSize: 15,
    totalCount: 42,
    totalPages: 3,
    results: [
      {
        id: 'event-1',
        created_at: '2026-08-10T09:00:00Z',
        action: 'tenant.domain.activated',
        category: 'configuration',
        entity_type: 'institution_domain',
        entity_id: 'domain-1',
        actor_id: 'actor-1',
        institution_id: INSTITUTION_A,
        retention_category: 'standard',
        changes: { institution_id: INSTITUTION_A },
      },
    ],
    facets: {
      event_count: 42,
      actor_count: 4,
      by_action: [{ action: 'tenant.domain.activated', event_count: 30 }],
      by_category: [
        { category: 'configuration', event_count: 30 },
        { category: 'authorization', event_count: 12 },
      ],
      row_limit: 5000,
    },
    filters: { category: null },
    categories: [
      'configuration',
      'authorization',
      'review',
      'document',
      'payment',
      'export',
      'communication',
      'other',
    ],
    definitions: {
      configuration: 'Changes to this school’s configuration.',
      authorization: 'Refused authorizations and access changes.',
    },
    can_export: true,
    ...overrides,
  }
}

function renderPanel(institutionId = INSTITUTION_A) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AuditPanel institutionId={institutionId} />
    </QueryClientProvider>,
  )
}

/** The query object the panel handed to the service on its most recent call. */
function lastQuery(): Record<string, unknown> {
  expect(list).toHaveBeenCalled()
  return list.mock.calls[list.mock.calls.length - 1][0] as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  capabilityState.current = tenantCapabilities()
  list.mockResolvedValue(report())
  download.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

describe('the tenant audit panel asks about the selected school', () => {
  it('sends the selected institution to the server', async () => {
    renderPanel()
    await waitFor(() => expect(list).toHaveBeenCalled())
    expect(lastQuery().institutionId).toBe(INSTITUTION_A)
  })

  it('asks a different question when a different school is selected', async () => {
    // The defect: `institutionId` was in the cache key but not in the request, so
    // switching schools produced a new cache entry holding the same global list.
    capabilityState.current = tenantCapabilities({
      institutionCapabilities: {
        [INSTITUTION_A]: ['tenant.audit.read'],
        [INSTITUTION_B]: ['tenant.audit.read'],
      },
      scopedInstitutionIds: [INSTITUTION_A, INSTITUTION_B],
      canForInstitution: (institutionId: string, capability: string) =>
        capability === 'tenant.audit.read' &&
        [INSTITUTION_A, INSTITUTION_B].includes(institutionId),
    })
    const first = renderPanel(INSTITUTION_A)
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1))
    first.unmount()

    renderPanel(INSTITUTION_B)
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    expect(lastQuery().institutionId).toBe(INSTITUTION_B)
  })

  it('never sends a generic entity-type filter in place of the institution', async () => {
    renderPanel()
    await waitFor(() => expect(list).toHaveBeenCalled())
    const query = lastQuery()
    expect(query.entity_type).toBeUndefined()
    expect(Object.keys(query)).toContain('institutionId')
  })

  it('renders no audit data when the backend refuses the read', async () => {
    list.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
    renderPanel()
    await waitFor(() => expect(screen.getByText(/not authorized/i)).toBeTruthy())
    expect(screen.queryByText('tenant.domain.activated')).toBeNull()
  })

  it('shows nothing about a school it was refused', async () => {
    // A masked 404 for an out-of-scope institution must not become a rendered
    // hint that the school exists.
    list.mockRejectedValue(Object.assign(new Error('Institution not found'), { status: 404 }))
    const { container } = renderPanel(INSTITUTION_B)
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(screen.queryByText('tenant.domain.activated')).toBeNull()
    expect(container.querySelector('[data-tenant-audit]')).toBeNull()
    expect(container.textContent).not.toContain(INSTITUTION_B)
  })
})

describe('the numbers and labels are the server’s', () => {
  it('shows the server facet counts, not a tally of the rendered rows', async () => {
    renderPanel()
    // One row is rendered; the server says 42 events and 4 actors.
    await waitFor(() => expect(screen.getByText('42 events')).toBeTruthy())
    expect(screen.getByText('4 actors')).toBeTruthy()
    expect(screen.getAllByText('tenant.domain.activated')).toHaveLength(1)
  })

  it('keeps the totals when the operator turns a page', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByText('42 events')).toBeTruthy())
    list.mockResolvedValue(report({ page: 2, results: [] }))
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    await waitFor(() => expect(lastQuery().page).toBe(2))
    expect(screen.getByText('42 events')).toBeTruthy()
  })

  it('renders the server category with a label, never colour alone', async () => {
    const { container } = renderPanel()
    await waitFor(() => expect(screen.getByText('Configuration · 30')).toBeTruthy())
    expect(screen.getByText('Authorization · 12')).toBeTruthy()
    // The event row carries the category as a readable label, not a bare colour.
    const row = container.querySelector('[data-audit-event="event-1"]')
    expect(row?.textContent).toContain('Configuration')
  })

  it('publishes the server definition alongside the event', async () => {
    renderPanel()
    await waitFor(() =>
      expect(screen.getByText(/Changes to this school’s configuration\./)).toBeTruthy(),
    )
  })

  it('sends the category filter to the server rather than filtering afterwards', async () => {
    renderPanel()
    await waitFor(() =>
      expect(screen.getByLabelText(/filter audit events by category/i)).toBeTruthy(),
    )
    fireEvent.change(screen.getByLabelText(/filter audit events by category/i), {
      target: { value: 'authorization' },
    })
    await waitFor(() => expect(lastQuery().category).toBe('authorization'))
    // A new filter resets to the first page — a filtered page 3 is not a page 3.
    expect(lastQuery().page).toBe(1)
  })

  it('offers the categories the server published', async () => {
    renderPanel()
    await waitFor(() => expect(screen.getByLabelText(/filter audit events by category/i)).toBeTruthy())
    const select = screen.getByLabelText(/filter audit events by category/i) as HTMLSelectElement
    const values = Array.from(select.options).map((option) => option.value)
    expect(values).toEqual([
      '',
      'configuration',
      'authorization',
      'review',
      'document',
      'payment',
      'export',
      'communication',
      'other',
    ])
  })
})

describe('the export follows the backend', () => {
  it('is offered when the server grants it and the capability is held', async () => {
    capabilityState.current = tenantCapabilities({
      institutionCapabilities: {
        [INSTITUTION_A]: ['tenant.audit.read', 'tenant.application.export'],
      },
      canForInstitution: (institutionId: string, capability: string) =>
        institutionId === INSTITUTION_A &&
        ['tenant.audit.read', 'tenant.application.export'].includes(capability),
    })
    renderPanel()
    await waitFor(() => expect(screen.getByRole('button', { name: /export csv/i })).toBeTruthy())
  })

  it('is withheld when the server says the actor cannot export', async () => {
    capabilityState.current = tenantCapabilities({
      institutionCapabilities: {
        [INSTITUTION_A]: ['tenant.audit.read', 'tenant.application.export'],
      },
      canForInstitution: () => true,
    })
    list.mockResolvedValue(report({ can_export: false }))
    renderPanel()
    await waitFor(() => expect(screen.getByText('42 events')).toBeTruthy())
    expect(screen.queryByRole('button', { name: /export csv/i })).toBeNull()
  })

  it('is withheld when the capability set does not carry the export grant', async () => {
    // The server said yes for *some* institution in scope; this one is not it.
    renderPanel()
    await waitFor(() => expect(screen.getByText('42 events')).toBeTruthy())
    expect(screen.queryByRole('button', { name: /export csv/i })).toBeNull()
  })

  it('requests a page-independent export and lets the server author the file', async () => {
    capabilityState.current = tenantCapabilities({
      institutionCapabilities: {
        [INSTITUTION_A]: ['tenant.audit.read', 'tenant.application.export'],
      },
      canForInstitution: () => true,
    })
    renderPanel()
    await waitFor(() => expect(screen.getByRole('button', { name: /export csv/i })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }))
    await waitFor(() => expect(download).toHaveBeenCalled())
    const [path] = download.mock.calls[0] as [string, string]
    expect(path).toContain(`/admin/institutions/${INSTITUTION_A}/audit/`)
    expect(path).toContain('export=csv')
    // The panel hands the query to the service; the service drops the paging.
    const spied = exportPath.mock.calls[0][0] as Record<string, unknown>
    expect(spied.institutionId).toBe(INSTITUTION_A)
  })

  it('surfaces the server’s refusal instead of saving an error page', async () => {
    capabilityState.current = tenantCapabilities({
      institutionCapabilities: {
        [INSTITUTION_A]: ['tenant.audit.read', 'tenant.application.export'],
      },
      canForInstitution: () => true,
    })
    download.mockRejectedValue(new Error('You do not have permission to export this report.'))
    renderPanel()
    await waitFor(() => expect(screen.getByRole('button', { name: /export csv/i })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /export csv/i }))
    await waitFor(() =>
      expect(screen.getByText(/do not have permission to export this report/i)).toBeTruthy(),
    )
  })
})

describe('the export path is page-independent by construction', () => {
  it('drops page and pageSize and adds export=csv', async () => {
    const actual = await vi.importActual<typeof import('@/services/admin/tenantAudit')>(
      '@/services/admin/tenantAudit',
    )
    const path = actual.tenantAuditService.exportPath({
      institutionId: INSTITUTION_A,
      category: 'configuration',
      page: 3,
      pageSize: 15,
    })
    expect(path).toContain('export=csv')
    expect(path).toContain('category=configuration')
    expect(path).not.toContain('page=')
    expect(path).not.toContain('pageSize=')
  })

  it('puts the institution in the path, not in a query parameter', async () => {
    const actual = await vi.importActual<typeof import('@/services/admin/tenantAudit')>(
      '@/services/admin/tenantAudit',
    )
    expect(actual.tenantAuditEndpoint(INSTITUTION_A)).toBe(
      `/admin/institutions/${INSTITUTION_A}/audit/`,
    )
  })
})

describe('the panel no longer reads the generic audit feed', () => {
  /**
   * Executable source only — block comments stripped.
   *
   * Both modules deliberately *name* the generic feed they replaced, because
   * recording which of the two questions each endpoint answers is part of the
   * fix. A grep over the raw file would therefore fail on its own documentation,
   * so the guard reads what runs.
   */
  const code = (relative: string) =>
    readFileSync(resolve(process.cwd(), relative), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('does not call the platform-wide audit feed', () => {
    const source = code('src/pages/admin/tenants/AuditPanel.tsx')
    expect(source).not.toContain('adminAuditService')
    expect(source).not.toContain('/admin/audit-logs/')
    // The category is the server's; the browser must not re-derive it.
    expect(source).not.toContain('getAuditCategory')
  })

  it('does not derive a category from the action string', () => {
    const source = code('src/services/admin/tenantAudit.ts')
    expect(source).not.toContain('/admin/audit-logs/')
    expect(source).not.toMatch(/new RegExp|\.test\(/)
  })

  it('sends the institution in the path rather than as a target-table hint', () => {
    const source = code('src/services/admin/tenantAudit.ts')
    expect(source).toContain('/admin/institutions/')
    expect(source).not.toContain('targetTable')
  })
})
