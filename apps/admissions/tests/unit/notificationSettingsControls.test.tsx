/**
 * The preference controls are controls, and the mandatory rows are facts.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 10.1.
 * Requirements: R13.3 (a mandatory transactional message is not a preference),
 *               R13.8 (real GET/PUT controls; unknown channels rejected).
 * Findings:     **STU-14**, **STU-24**.
 *
 * The previous page rendered three badges — "Always on", "Always on",
 * "Coming soon" — over a preference fetch whose answer it discarded. No endpoint
 * test could fail on that: the backend was being called correctly and its response
 * was simply thrown away. So these are render tests, and they assert the four
 * things a student can actually observe:
 *
 * 1. a configurable row is a switch, and flipping it **persists**;
 * 2. a mandatory row is stated as always-sent, and is **not** a disabled switch —
 *    because a greyed-out toggle reads as something you failed to turn on;
 * 3. a field the platform cannot honour is not rendered as a control, and if one
 *    is somehow attempted, the refusal is shown with the server's own reason;
 * 4. nothing on the page is a hardcoded school, address or platform name.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationPreferenceSchema } from '@/lib/notificationPreferences'

// ---------------------------------------------------------------------------
// Seams: the two reads that would otherwise reach the network.
// ---------------------------------------------------------------------------

const getPreferences = vi.fn()
const updatePreferences = vi.fn()

vi.mock('@/services/notifications', () => ({
  notificationService: {
    getPreferences: (...args: unknown[]) => getPreferences(...args),
    updatePreferences: (...args: unknown[]) => updatePreferences(...args),
  },
  normalizeNotificationContent: (v: string) => v,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'student-1' } }),
}))

const portalBrand = {
  brandName: 'Example School',
  brandOwner: 'Beanola Technologies',
  isWhiteLabel: true,
  offeringInstitutionId: 'inst-1',
  supportEmail: 'admissions@example-school.edu.zm' as string | null,
  isLoading: false,
}

vi.mock('@/hooks/usePortalBrand', () => ({
  usePortalBrand: () => portalBrand,
  DEFAULT_BRAND_NAME: 'Beanola Admissions',
}))

// ---------------------------------------------------------------------------
// The server's published schema
// ---------------------------------------------------------------------------

function schema(overrides: Partial<NotificationPreferenceSchema> = {}): NotificationPreferenceSchema {
  return {
    schema_version: 1,
    is_default: false,
    channels: [
      {
        key: 'in_app',
        enabled: true,
        configurable: false,
        mandatory: true,
        field: null,
        definition: 'Every message is written to your inbox and this cannot be turned off.',
      },
      {
        key: 'email',
        enabled: true,
        configurable: true,
        mandatory: false,
        field: 'email_enabled',
        definition: 'Optional messages are also emailed to your registered address.',
      },
    ],
    categories: [
      {
        key: 'application_updates',
        enabled: true,
        configurable: false,
        kind: 'mandatory',
        field: null,
        definition: 'Decisions, verification outcomes and deadlines. Always sent.',
      },
      {
        key: 'payment_reminders',
        enabled: true,
        configurable: true,
        kind: 'optional',
        field: 'payment_reminders',
        definition: 'Reminders to complete a payment you chose to defer.',
      },
    ],
    writable_fields: ['email_enabled', 'payment_reminders'],
    unsupported_fields: [
      {
        field: 'whatsapp_enabled',
        code: 'CHANNEL_NOT_IMPLEMENTED',
        reason: 'The platform has no WhatsApp integration and no column for one.',
      },
      {
        field: 'quiet_hours_start',
        code: 'FIELD_NOT_IMPLEMENTED',
        reason: 'The platform has no message-deferral scheduler.',
      },
    ],
    delivery_states: ['delivered', 'failed', 'unknown'],
    delivery_state_definitions: {
      delivered: 'Written to your inbox.',
      failed: 'Every send attempt failed.',
      unknown: 'This message predates delivery tracking.',
    },
    retry_limit: 3,
    ...overrides,
  }
}

async function renderPage() {
  const { default: NotificationSettings } = await import(
    '@/pages/student/NotificationSettings'
  )
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotificationSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByTestId('preference-row-email')
  return view
}

beforeEach(() => {
  vi.clearAllMocks()
  portalBrand.supportEmail = 'admissions@example-school.edu.zm'
  getPreferences.mockResolvedValue(schema())
  updatePreferences.mockImplementation(async (body: Record<string, boolean>) =>
    schema({
      channels: schema().channels.map((c) =>
        c.field && c.field in body ? { ...c, enabled: body[c.field] as boolean } : c,
      ),
      categories: schema().categories.map((c) =>
        c.field && c.field in body ? { ...c, enabled: body[c.field] as boolean } : c,
      ),
    }),
  )
})

describe('a configurable row is a real control', () => {
  it('renders a switch for every configurable channel and category', async () => {
    await renderPage()
    expect(screen.getByTestId('preference-switch-email')).not.toBeNull()
    expect(screen.getByTestId('preference-switch-payment_reminders')).not.toBeNull()
  })

  it('persists the change through the endpoint and re-renders from the response', async () => {
    await renderPage()

    fireEvent.click(screen.getByTestId('preference-switch-email'))

    await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith({ email_enabled: false }))
    await waitFor(() =>
      expect(screen.getByTestId('preference-switch-email').getAttribute('data-state')).toBe(
        'unchecked',
      ),
    )
  })

  it('sends exactly the one field that changed', async () => {
    await renderPage()
    fireEvent.click(screen.getByTestId('preference-switch-payment_reminders'))

    await waitFor(() => expect(updatePreferences).toHaveBeenCalledTimes(1))
    expect(Object.keys(updatePreferences.mock.calls[0][0])).toEqual(['payment_reminders'])
  })

  it('confirms the save on screen', async () => {
    await renderPage()
    fireEvent.click(screen.getByTestId('preference-switch-email'))
    expect(await screen.findByText('Saved')).not.toBeNull()
  })

  it('renders the server’s definition next to each control', async () => {
    await renderPage()
    expect(
      screen.getByText('Optional messages are also emailed to your registered address.'),
    ).not.toBeNull()
    expect(
      screen.getByText('Reminders to complete a payment you chose to defer.'),
    ).not.toBeNull()
  })
})

describe('a mandatory row is a stated fact, not a badge over a fetch', () => {
  it('states that the inbox and application updates are always sent', async () => {
    await renderPage()
    expect(screen.getByTestId('preference-always-on-in_app').textContent).toContain('Always sent')
    expect(
      screen.getByTestId('preference-always-on-application_updates').textContent,
    ).toContain('Always sent')
  })

  it('renders no switch for a mandatory row', async () => {
    await renderPage()
    expect(screen.queryByTestId('preference-switch-in_app')).toBeNull()
    expect(screen.queryByTestId('preference-switch-application_updates')).toBeNull()
  })

  it('says why, using the server’s own words', async () => {
    await renderPage()
    expect(
      screen.getByText(
        'Every message is written to your inbox and this cannot be turned off.',
      ),
    ).not.toBeNull()
    expect(
      screen.getByText('Decisions, verification outcomes and deadlines. Always sent.'),
    ).not.toBeNull()
  })

  it('no longer shows the retired "Coming soon" tile', async () => {
    await renderPage()
    expect(screen.queryByText(/coming soon/i)).toBeNull()
    expect(screen.queryByText(/always on/i)).toBeNull()
  })
})

describe('a field the platform cannot honour', () => {
  it('is not rendered as a control', async () => {
    await renderPage()
    expect(screen.queryByTestId('preference-switch-whatsapp_enabled')).toBeNull()
    expect(screen.queryByTestId('preference-switch-sms_enabled')).toBeNull()
    expect(screen.queryByTestId('preference-switch-quiet_hours_start')).toBeNull()
  })

  it('is explained rather than silently absent', async () => {
    await renderPage()
    const list = screen.getByTestId('unsupported-preference-list')
    expect(list.textContent).toContain('The platform has no WhatsApp integration')
    expect(list.textContent).toContain('no message-deferral scheduler')
  })

  it('surfaces a server refusal with the server’s reason', async () => {
    updatePreferences.mockRejectedValueOnce({
      code: 'UNSUPPORTED_PREFERENCE',
      details: {
        rejected: [
          {
            field: 'email_enabled',
            code: 'UNKNOWN_FIELD',
            reason: 'This setting is a true/false switch.',
          },
        ],
      },
    })
    await renderPage()

    fireEvent.click(screen.getByTestId('preference-switch-email'))
    expect((await screen.findByTestId('preference-rejection-summary')).textContent).toContain(
      'This setting is a true/false switch.',
    )
  })

  it('leaves the switch showing the stored value after a refusal', async () => {
    updatePreferences.mockRejectedValueOnce({ code: 'UNSUPPORTED_PREFERENCE' })
    await renderPage()

    fireEvent.click(screen.getByTestId('preference-switch-email'))
    await waitFor(() => expect(updatePreferences).toHaveBeenCalled())
    // No optimistic flip: the screen still shows what the server holds.
    expect(screen.getByTestId('preference-switch-email').getAttribute('data-state')).toBe(
      'checked',
    )
  })
})

describe('the page is preferences only, and tenant-resolved (STU-14, STU-24)', () => {
  it('links to the one inbox instead of embedding a second one', async () => {
    await renderPage()
    expect(screen.getByTestId('open-inbox').getAttribute('href')).toBe(
      '/student/communications',
    )
    expect(screen.queryByText(/mark all read/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
  })

  it('sends the student to the resolved school’s admissions inbox', async () => {
    await renderPage()
    expect(screen.getByTestId('notification-support-link').getAttribute('href')).toContain(
      'mailto:admissions@example-school.edu.zm',
    )
  })

  it('falls back to the neutral in-app contact route, never to an invented address', async () => {
    portalBrand.supportEmail = null
    await renderPage()
    expect(screen.getByTestId('notification-support-link').getAttribute('href')).toBe('/contact')
  })
})
