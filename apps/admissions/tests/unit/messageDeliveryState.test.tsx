/**
 * What one message's delivery record says on screen.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 10.1.
 * Requirements: R13.4 — communication history shows **delivery state and
 *               channel** without exposing secrets or internal provider
 *               payloads, and retry is an authorized command.
 * Findings:     **STU-14**.
 *
 * The one defect these exist to prevent is a *false* delivery statement. Before
 * this task a staff work item carried no delivery record at all, so the history
 * reported its email channel as `unknown` — whose published definition is "this
 * message predates delivery tracking". That was untrue: the message predated
 * nothing, email was simply never applicable to it. The backend now records the
 * distinction (`not_applicable` vs `unknown`); this file asserts the browser
 * keeps them apart and renders the server's own words for each.
 *
 * Everything on screen is the server's: the states, the definitions, and the
 * decision that a retry may be offered. This component contributes a tone, an
 * icon and a channel label — and nothing that could contradict the record.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageDeliveryState } from '@/components/student/communications/MessageDeliveryState'
import type {
  CommunicationMessage,
  MessageChannelState,
  NotificationPreferenceSchema,
} from '@/lib/notificationPreferences'

/** The published vocabulary, verbatim from `apps/common/communication_history.py`. */
const SCHEMA: NotificationPreferenceSchema = {
  schema_version: 1,
  is_default: false,
  channels: [],
  categories: [],
  writable_fields: [],
  unsupported_fields: [],
  delivery_states: [
    'delivered',
    'sent',
    'queued',
    'retrying',
    'failed',
    'suppressed',
    'not_applicable',
    'unknown',
  ],
  delivery_state_definitions: {
    delivered:
      'Written to your inbox. In-app messages are delivered as they are created.',
    sent: 'Accepted by the mail provider.',
    queued: 'Waiting to be sent.',
    retrying: 'A send attempt failed and the platform is trying again.',
    failed: 'Every send attempt failed. You can ask the platform to try again.',
    suppressed: 'Not sent on this channel because of your notification settings.',
    not_applicable: 'This message was not sent on this channel.',
    unknown:
      'This message predates delivery tracking, so the platform cannot state what happened on this channel.',
  },
  retry_limit: 3,
}

function channel(overrides: Partial<MessageChannelState>): MessageChannelState {
  return {
    channel: 'email',
    state: 'sent',
    attempts: 1,
    last_attempt_at: null,
    can_retry: false,
    ...overrides,
  }
}

function message(overrides: Partial<CommunicationMessage> = {}): CommunicationMessage {
  return {
    id: 'msg-1',
    title: 'Application submitted',
    message: 'We have your application.',
    type: 'info',
    is_read: false,
    action_url: null,
    created_at: '2027-01-05T09:00:00Z',
    audience: 'student',
    channels: [
      channel({ channel: 'in_app', state: 'delivered' }),
      channel({ channel: 'email', state: 'sent' }),
    ],
    can_retry: false,
    ...overrides,
  }
}

describe('a staff work item states why a channel was never used', () => {
  const workItem = message({
    id: 'work-1',
    audience: 'staff',
    category: 'staff_action_required',
    channels: [
      channel({ channel: 'in_app', state: 'delivered' }),
      channel({ channel: 'email', state: 'not_applicable', attempts: 0 }),
    ],
  })

  it('renders the server’s not-applicable definition as visible text', () => {
    render(<MessageDeliveryState message={workItem} schema={SCHEMA} />)
    const fact = screen.getByTestId('delivery-work-1-email-fact')
    expect(fact.textContent).toContain('This message was not sent on this channel.')
  })

  it('never renders the "predates delivery tracking" copy for it', () => {
    render(<MessageDeliveryState message={workItem} schema={SCHEMA} />)
    expect(screen.queryByText(/predates delivery tracking/i)).toBeNull()
    expect(screen.getByTestId('delivery-work-1-email').getAttribute('data-state')).toBe(
      'not_applicable',
    )
  })

  it('carries the audience the server resolved onto the rendered record', () => {
    render(<MessageDeliveryState message={workItem} schema={SCHEMA} />)
    expect(screen.getByTestId('delivery-work-1').getAttribute('data-audience')).toBe('staff')
  })

  it('offers no retry for a channel that was never applicable', () => {
    render(<MessageDeliveryState message={workItem} schema={SCHEMA} onRetry={vi.fn()} />)
    expect(screen.queryByTestId('retry-work-1')).toBeNull()
  })
})

describe('a message with no record says so, in the server’s words', () => {
  const preTracking = message({
    id: 'old-1',
    audience: undefined,
    channels: [
      channel({ channel: 'in_app', state: 'delivered' }),
      channel({ channel: 'email', state: 'unknown', attempts: 0 }),
    ],
  })

  it('renders the unknown definition rather than a healthy-looking badge', () => {
    render(<MessageDeliveryState message={preTracking} schema={SCHEMA} />)
    expect(screen.getByTestId('delivery-old-1-email-fact').textContent).toContain(
      'predates delivery tracking',
    )
  })

  it('states no message class for a message that carried none', () => {
    render(<MessageDeliveryState message={preTracking} schema={SCHEMA} />)
    expect(screen.getByTestId('delivery-old-1').hasAttribute('data-audience')).toBe(false)
  })
})

describe('a self-explanatory state is a badge and nothing more', () => {
  it('adds no sentence for a delivered or sent channel', () => {
    render(<MessageDeliveryState message={message()} schema={SCHEMA} />)
    expect(screen.getByTestId('delivery-msg-1-email').getAttribute('data-state')).toBe('sent')
    expect(screen.queryByTestId('delivery-msg-1-email-fact')).toBeNull()
    expect(screen.queryByTestId('delivery-msg-1-in_app-fact')).toBeNull()
  })

  it('states a suppression as the reader’s own setting, without a second sentence', () => {
    render(
      <MessageDeliveryState
        message={message({
          channels: [
            channel({ channel: 'in_app', state: 'delivered' }),
            channel({ channel: 'email', state: 'suppressed', attempts: 0 }),
          ],
        })}
        schema={SCHEMA}
      />,
    )
    // The badge carries the definition as its tooltip; a suppression is not one
    // of the two states a reader can misread.
    expect(screen.getByTestId('delivery-msg-1-email').getAttribute('title')).toBe(
      SCHEMA.delivery_state_definitions.suppressed,
    )
    expect(screen.queryByTestId('delivery-msg-1-email-fact')).toBeNull()
  })
})

describe('a failed email is the only thing that offers a retry', () => {
  const failed = message({
    channels: [
      channel({ channel: 'in_app', state: 'delivered' }),
      channel({ channel: 'email', state: 'failed', attempts: 1, can_retry: true }),
    ],
    can_retry: true,
  })

  it('offers the command when the server said it may be retried', () => {
    render(<MessageDeliveryState message={failed} schema={SCHEMA} onRetry={vi.fn()} />)
    expect(screen.getByTestId('retry-msg-1')).not.toBeNull()
  })

  it('does not offer it when the server withheld it, however the badge reads', () => {
    render(
      <MessageDeliveryState
        message={message({
          channels: [
            channel({ channel: 'email', state: 'failed', attempts: 4, can_retry: false }),
          ],
          can_retry: false,
        })}
        schema={SCHEMA}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('retry-msg-1')).toBeNull()
  })

  it('renders nothing at all for a message the server tracked no channel for', () => {
    const { container } = render(
      <MessageDeliveryState message={message({ channels: [] })} schema={SCHEMA} />,
    )
    expect(container.textContent).toBe('')
  })
})
