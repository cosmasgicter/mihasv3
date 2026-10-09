/**
 * Admin records stay complete at phone width (admissions-v2 task **11.4**).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 11.4
 *               ("Preserve server filters/pagination and every authorized command
 *               in compact records/detail sheets for applications, users,
 *               tenants, catalog, audit, and settlement. Replace raw UUID
 *               controls with search selectors.").
 * Requirements: **R6.1** / **R6.3** (server-side sort and scoped selectors
 *               instead of raw UUID entry), **R8.3** (the command matrix is the
 *               backend's), **R16.1** (an admin table may become a compact record
 *               list *without losing commands, filters, state, or pagination*),
 *               **R16.2** (44 px targets, accessible names and state).
 * Findings:     **ADM-01** (the roster row), **ADM-03** (the user directory row),
 *               **ADM-05** / **ADM-06** (audit and settlement), **TEN-05** (raw
 *               UUID controls).
 *
 * ## What is asserted here, and what is left to the browser
 *
 * These are the DOM-answerable halves: how many prominent controls a record has,
 * whether the disclosure carries real ARIA state, whether its **count is honest**
 * against what the decision block really renders, whether a compact record still
 * carries the fields the wide one does, and whether the surfaces still hold the
 * 44 px token.
 *
 * Geometry — 44 × 44 measured from layout boxes, and no horizontal overflow at
 * 390 px with long names in the page — is settled by
 * `tests/harness-e2e/required/admin-mobile-journeys.spec.ts`, because jsdom lays
 * nothing out. The `hidden`/display agreement below is the strongest form of that
 * claim jsdom *can* hold, and it exists because a disclosure that disagreed with
 * itself once shipped a wholly inert density fix (11.3 §3).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { AdminRecordActions } from '@/components/admin/AdminRecordActions'
import { ApplicationApprovalActions } from '@/components/admin/applications/ApplicationApprovalActions'
import { UserMobileCard } from '@/components/admin/UserRowCard'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import {
  applicationDecisionCommands,
  applicationPaymentCommands,
  applicationStatusCommands,
} from '@/lib/adminApplicationCommands'
import {
  adminRecordOverflowLabel,
  presentAdminRecordCommands,
  type AdminRecordCommand,
} from '@/lib/adminRecordCommands'
import { APPLICATION_STATUSES } from '@/types/applicationStatus'
import type { CanonicalPaymentStatus } from '@/lib/paymentStatus'
import type { UserProfile } from '@/types/database'

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8')

afterEach(() => cleanup())

function command(id: string, prominence: 'primary' | 'overflow'): AdminRecordCommand {
  return { id, label: id, prominence, onSelect: vi.fn() }
}

// ---------------------------------------------------------------------------
// 1. The split: one primary, and nothing lost
// ---------------------------------------------------------------------------
describe('presentAdminRecordCommands', () => {
  it('promotes the declared primary and keeps every other command in order', () => {
    const commands = [command('a', 'overflow'), command('b', 'primary'), command('c', 'overflow')]
    const { primary, overflow, overflowCount } = presentAdminRecordCommands(commands)
    expect(primary?.id).toBe('b')
    expect(overflow.map((entry) => entry.id)).toEqual(['a', 'c'])
    expect(overflowCount).toBe(2)
  })

  it('never leaves a record with a disclosure and nothing prominent', () => {
    const { primary, overflowCount } = presentAdminRecordCommands([
      command('a', 'overflow'),
      command('b', 'overflow'),
    ])
    expect(primary?.id).toBe('a')
    expect(overflowCount).toBe(1)
  })

  it('is empty for a record with no authorized command', () => {
    expect(presentAdminRecordCommands([])).toEqual({ primary: null, overflow: [], overflowCount: 0 })
  })

  it('counts what it hides, in words', () => {
    expect(adminRecordOverflowLabel(0)).toBe('No other actions')
    expect(adminRecordOverflowLabel(1)).toBe('1 more action')
    expect(adminRecordOverflowLabel(4)).toBe('4 more actions')
  })
})

// ---------------------------------------------------------------------------
// 2. The surface: real ARIA state, an honest count, and a panel that is not a card
// ---------------------------------------------------------------------------
describe('AdminRecordActions', () => {
  const three = [command('open', 'primary'), command('edit', 'overflow'), command('drop', 'overflow')]

  it('shows one prominent control and one counted trigger while closed', () => {
    render(<AdminRecordActions commands={three} recordLabel="record 7" />)
    expect(screen.getByRole('button', { name: 'open' })).toBeTruthy()
    const trigger = screen.getByTestId('admin-record-actions-trigger')
    expect(trigger.textContent).toContain('2 more actions')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-label')).toBe('2 more actions for record 7')
  })

  it('resolves aria-controls to the element that holds the commands', () => {
    render(<AdminRecordActions commands={three} recordLabel="record 7" />)
    const trigger = screen.getByTestId('admin-record-actions-trigger')
    const panel = document.getElementById(trigger.getAttribute('aria-controls') || '')
    expect(panel).toBeTruthy()
    expect(panel).toBe(screen.getByTestId('admin-record-actions-panel'))
    // `hidden: true`, because a closed panel is correctly **out** of the
    // accessibility tree — the attribute is doing its job. The commands are still
    // mounted so a command in flight is not torn down by collapsing the sheet.
    expect(
      within(panel as HTMLElement)
        .getAllByRole('button', { hidden: true })
        .map((b) => b.textContent),
    ).toEqual(['edit', 'drop'])
  })

  it('agrees with itself about display: the attribute and the class say the same thing', () => {
    // The guard 11.3 §3 forced. `[hidden]{display:none}` and `.flex{display:flex}`
    // have equal specificity, so a permanently-`flex` panel carrying `hidden`
    // renders open while `aria-expanded="false"` claims otherwise — and jsdom
    // computes no display from a class, so this is the only jsdom-side statement
    // of it that can fail when either half drifts.
    render(<AdminRecordActions commands={three} recordLabel="record 7" />)
    const panel = screen.getByTestId('admin-record-actions-panel')
    expect(panel.hasAttribute('hidden')).toBe(true)
    expect(panel.className).toContain('hidden')
    expect(panel.className.split(/\s+/)).not.toContain('flex')
  })

  it('opens on activation, and the panel then claims to be visible', () => {
    render(<AdminRecordActions commands={three} recordLabel="record 7" />)
    fireEvent.click(screen.getByTestId('admin-record-actions-trigger'))
    const panel = screen.getByTestId('admin-record-actions-panel')
    expect(panel.hasAttribute('hidden')).toBe(false)
    expect(panel.className.split(/\s+/)).toContain('flex')
    expect(screen.getByTestId('admin-record-actions-trigger').getAttribute('aria-expanded')).toBe('true')
  })

  it('does not turn the disclosure panel into a second card', () => {
    // "One container deep": the record card is the container. The panel carries
    // no border and no surface of its own.
    render(<AdminRecordActions commands={three} recordLabel="record 7" />)
    const panel = screen.getByTestId('admin-record-actions-panel')
    expect(panel.className).not.toMatch(/\bborder\b|\bbg-card\b|\bshadow/)
  })

  it('owns exactly one live region, outside the command cluster', () => {
    render(<AdminRecordActions commands={three} recordLabel="record 7" announcement="Working…" />)
    const live = screen.getByTestId('admin-record-actions-live')
    expect(live.getAttribute('aria-live')).toBe('polite')
    expect(live.textContent).toBe('Working…')
    expect(document.querySelectorAll('[aria-live]').length).toBe(1)
  })

  it('renders nothing when a record has no authorized command', () => {
    const { container } = render(<AdminRecordActions commands={[]} recordLabel="record 7" />)
    expect(container.firstChild).toBeNull()
  })

  it('counts content contributed from outside the commands array', () => {
    render(
      <AdminRecordActions
        commands={[command('open', 'primary')]}
        recordLabel="record 7"
        additionalOverflowCount={3}
        overflowContent={<button type="button">from elsewhere</button>}
      />,
    )
    expect(screen.getByTestId('admin-record-actions-trigger').textContent).toContain('3 more actions')
  })
})

// ---------------------------------------------------------------------------
// 3. The drift guard: the count on an applications row is honest
// ---------------------------------------------------------------------------
describe('the roster row disclosure counts what the decision block really renders', () => {
  const PAYMENT_STATUSES: CanonicalPaymentStatus[] = [
    'not_paid',
    'pending_review',
    'verified',
    'rejected',
    'deferred',
  ]

  /** Every command button the real block renders, by its label. */
  function renderedCommandLabels(
    status: string,
    paymentStatus: CanonicalPaymentStatus,
    canVerifyPayment: boolean,
  ): string[] {
    cleanup()
    render(
      <ApplicationApprovalActions
        applicationId="app-1"
        currentStatus={status}
        currentPaymentStatus={paymentStatus}
        onStatusUpdate={vi.fn()}
        onPaymentStatusUpdate={vi.fn()}
        canVerifyPayment={canVerifyPayment}
      />,
    )
    return screen
      .queryAllByRole('button')
      .map((button) => (button.textContent || '').trim())
      .filter((label) => label.length > 0)
  }

  it('enumerates exactly the commands the block offers, for every status pair', () => {
    for (const status of APPLICATION_STATUSES) {
      for (const paymentStatus of PAYMENT_STATUSES) {
        for (const canVerifyPayment of [true, false]) {
          const rendered = renderedCommandLabels(status, paymentStatus, canVerifyPayment)
          const enumerated = applicationDecisionCommands({
            status,
            paymentStatus,
            canVerifyPayment,
          }).map((entry) => entry.label)

          expect(
            [...rendered].sort(),
            `${status} / ${paymentStatus} / canVerifyPayment=${canVerifyPayment}`,
          ).toEqual([...enumerated].sort())
        }
      }
    }
  })

  it('offers no payment command to an actor the server did not authorize', () => {
    expect(applicationPaymentCommands('pending_review', false)).toEqual([])
    expect(applicationPaymentCommands('pending_review', true).map((c) => c.label)).toEqual([
      'Verify',
      'Reject',
      'Defer',
    ])
  })

  it('offers no transition out of a terminal status', () => {
    for (const terminal of ['approved', 'rejected', 'enrolled', 'withdrawn', 'expired', 'enrollment_expired']) {
      expect(applicationStatusCommands(terminal), terminal).toEqual([])
    }
  })

  it('is total: unrecognised values yield the canonical answer rather than throwing', () => {
    // No transition out of a status the platform does not know…
    expect(applicationStatusCommands('not_a_status')).toEqual([])
    // …and an unrecognised payment string is `not_paid` because that is what
    // `normalizePaymentStatus` says it is — the enumeration adds no vocabulary of
    // its own, which is why it can be a faithful mirror.
    expect(
      applicationDecisionCommands({ status: 'not_a_status', paymentStatus: 'nonsense' }).map(
        (entry) => entry.label,
      ),
    ).toEqual(['Mark as Paid'])
  })
})

// ---------------------------------------------------------------------------
// 4. The roster row itself
// ---------------------------------------------------------------------------
describe('the applications roster row (ADM-01)', () => {
  it('leads with Review and puts every decision behind one counted disclosure', () => {
    const source = readSource('src/components/admin/applications/ApplicationCard.tsx')
    // The decision block is inside the disclosure's content, and the count comes
    // from the enumeration rather than from a literal.
    expect(source).toContain('overflowContent=')
    expect(source).toContain('additionalOverflowCount={decisionCommandCount}')
    expect(source).toContain('applicationDecisionCommandCount')
    // R16.5: the row used to carry a third control whose only behaviour was
    // `onViewDetails` again, under a document icon, beside "View Details".
    expect(source).not.toContain('title="Result Slip"')
    expect(source.match(/onViewDetails\(app\.id\)/g)?.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// 5. The user directory row (ADM-03)
// ---------------------------------------------------------------------------
describe('the user directory row (ADM-03)', () => {
  const user: UserProfile = {
    id: 'u-1',
    user_id: 'u-1',
    email: 'operator@example.com',
    full_name: 'Ops Operator',
    phone: '+260900000000',
    role: 'admin',
    created_at: '2026-01-01T00:00:00.000Z',
  } as UserProfile

  function renderRow(role: string) {
    cleanup()
    render(
      <UserMobileCard
        user={{ ...user, role } as UserProfile}
        isSelected={false}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onPermissions={vi.fn()}
        onActivity={vi.fn()}
        onDeactivate={vi.fn()}
      />,
    )
  }

  it('keeps all four commands, one prominent and three counted', () => {
    renderRow('admin')
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    const trigger = screen.getByTestId('user-record-actions-trigger')
    expect(trigger.textContent).toContain('3 more actions')
    fireEvent.click(trigger)
    const panel = screen.getByTestId('user-record-actions-panel')
    expect(within(panel).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Access',
      'Activity',
      'Deactivate',
    ])
  })

  it('offers no deactivation for a super admin, and says so in the count', () => {
    renderRow('super_admin')
    expect(screen.getByTestId('user-record-actions-trigger').textContent).toContain('2 more actions')
  })

  it('names the record the commands belong to', () => {
    renderRow('admin')
    expect(screen.getByTestId('user-record-actions-trigger').getAttribute('aria-label')).toBe(
      '3 more actions for operator@example.com',
    )
  })
})

// ---------------------------------------------------------------------------
// 6. Sort is state, and state survives the record list (R6.1, R16.1)
// ---------------------------------------------------------------------------
describe('the user directory keeps its server sort at phone width', () => {
  it('offers a sort control outside the desktop-only table headers', () => {
    const source = readSource('src/components/admin/users/UsersTableSection.tsx')
    expect(source).toContain('data-testid="users-mobile-sort"')
    // The same registered backend keys the headers use — one vocabulary, not two.
    expect(source).toContain('SORTABLE_COLUMNS')
    expect(source).toContain("onToggleSort(event.target.value as SortField)")
  })

  it('holds the 44 px token on every pagination target', () => {
    const source = readSource('src/components/admin/users/UsersTableSection.tsx')
    // They were `min-h-[36px] min-w-[36px]`, below R16.2's floor.
    expect(source).not.toContain('min-h-[36px]')
    expect(source).not.toContain('min-w-[36px]')
  })
})

// ---------------------------------------------------------------------------
// 7. The catalog record list loses no field (R16.1)
// ---------------------------------------------------------------------------
describe('ResponsiveTable card view', () => {
  interface Row extends Record<string, unknown> {
    name: string
    capacity: number
  }

  it('renders desktop-priority fields instead of dropping them', () => {
    render(
      <ResponsiveTable<Row>
        columns={[
          { key: 'name', header: 'Name', priority: 'always' },
          { key: 'capacity', header: 'Capacity', priority: 'desktop' },
        ]}
        data={[{ name: 'January 2027', capacity: 120 }]}
        caption="Intakes"
      />
    )
    const cardField = document.querySelector('[data-column-key="capacity"][data-column-priority="desktop"]')
    expect(cardField).toBeTruthy()
    expect(cardField?.textContent).toContain('Capacity')
    expect(cardField?.textContent).toContain('120')
  })
})

// ---------------------------------------------------------------------------
// 8. TEN-05: no raw UUID control survives on an admin write form
// ---------------------------------------------------------------------------
describe('TEN-05 — scoped selectors replace raw UUID entry', () => {
  const PANELS = [
    'src/pages/admin/tenants/TenantDocumentsPanel.tsx',
    'src/pages/admin/tenants/ProfilesPanel.tsx',
    'src/pages/admin/tenants/TenantAccessGrantsPanel.tsx',
    'src/pages/admin/tenants/TenantStaffPanel.tsx',
    'src/pages/admin/tenants/onboardingCatalogSteps.tsx',
  ]

  /**
   * Comments are stripped before the scan: two of these files *document* the raw
   * field they replaced, quoting its old `placeholder`, and a scan that matched
   * prose would forbid recording the history.
   */
  const withoutComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

  it('leaves no "paste a UUID" field on any tenant write form', () => {
    for (const panel of PANELS) {
      const source = withoutComments(readSource(panel))
      expect(source, panel).not.toMatch(/placeholder="[^"]*UUID/i)
      expect(source, panel).not.toMatch(/placeholder="Application ID"/)
    }
  })

  it('populates each replaced field from a scoped list', () => {
    const documents = readSource('src/pages/admin/tenants/TenantDocumentsPanel.tsx')
    expect(documents).toContain('listOfferings(institutionId)')
    expect(documents).toContain('getCanonicalPrograms()')

    const profiles = readSource('src/pages/admin/tenants/ProfilesPanel.tsx')
    expect(profiles).toContain('getCanonicalPrograms()')
    expect(profiles).toContain('getIntakes()')

    // The application selector is the roster's own scoped query — the server
    // resolves `institution_id` against the actor's scope before any lookup.
    const grants = readSource('src/pages/admin/tenants/TenantAccessGrantsPanel.tsx')
    expect(grants).toContain('applicationRosterService.getRoster')
    expect(grants).toContain('institution_id: institutionId')
  })
})

// ---------------------------------------------------------------------------
// 9. The audit row's disclosure is a real one (R16.2, ADM-05)
// ---------------------------------------------------------------------------
describe('the audit trail row disclosure', () => {
  it('carries ARIA state and resolves to its own panel', () => {
    const source = readSource('src/pages/admin/AuditTrail.tsx')
    expect(source).toContain('aria-expanded={expanded}')
    expect(source).toContain('aria-controls={panelId}')
    expect(source).toContain('data-testid="audit-entry-details-panel"')
    // The same `hidden` / display agreement, for the same reason.
    expect(source).toContain('hidden={!expanded}')
  })
})
