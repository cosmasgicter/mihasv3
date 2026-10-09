/**
 * The published preference schema, as the browser reads it.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 10.1.
 * Requirements: R13.4 (delivery state and channel, no provider payloads),
 *               R13.8 (one persisted preference schema; unknown channels rejected).
 * Findings:     **STU-14** — the app declared `whatsapp_enabled` and
 *               `in_app_enabled`, which the backend never had, asked for quiet
 *               hours no delivery path reads, and then rendered read-only tiles.
 *
 * These are the pure-function claims. The rendering claims are in
 * `notificationSettingsControls.test.tsx`; the backend↔frontend drift guard lives
 * on the backend (`backend/tests/unit/test_notification_preferences_10_1.py`),
 * where the authority is.
 *
 * The single most important claim here: **nothing in this module knows the name of
 * a channel or a category.** Every list is read from the server's response. A test
 * that had to be updated because the platform added a channel would mean the field
 * list had leaked back into the client.
 */
import { describe, expect, it } from 'vitest'
import {
  buildPreferenceUpdate,
  canRetryMessage,
  DELIVERY_STATE_NOT_APPLICABLE,
  DELIVERY_STATE_TONES,
  DELIVERY_STATE_UNKNOWN,
  deliveryStateDefinition,
  deliveryStateLabel,
  deliveryStateTone,
  isWritableField,
  messageAudience,
  messageChannels,
  PREFERENCE_REJECTION_CODES,
  PREFERENCE_SCHEMA_VERSION,
  preferenceRejections,
  preferenceRows,
  statedChannelFact,
  UNSUPPORTED_PREFERENCE,
  type NotificationPreferenceSchema,
} from '@/lib/notificationPreferences'

/** A response shaped exactly like the server's, used as data — not as a source. */
const SCHEMA: NotificationPreferenceSchema = {
  schema_version: 1,
  is_default: false,
  channels: [
    {
      key: 'in_app',
      enabled: true,
      configurable: false,
      mandatory: true,
      field: null,
      definition: 'Every message is written to your inbox.',
    },
    {
      key: 'email',
      enabled: true,
      configurable: true,
      mandatory: false,
      field: 'email_enabled',
      definition: 'Optional messages are also emailed to you.',
    },
  ],
  categories: [
    {
      key: 'application_updates',
      enabled: true,
      configurable: false,
      kind: 'mandatory',
      field: null,
      definition: 'Decisions and deadlines. Always sent.',
    },
    {
      key: 'payment_reminders',
      enabled: true,
      configurable: true,
      kind: 'optional',
      field: 'payment_reminders',
      definition: 'Reminders to complete a deferred payment.',
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
      field: 'in_app_enabled',
      code: 'CHANNEL_MANDATORY',
      reason: 'The inbox is the record of what you were told.',
    },
  ],
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
    delivered: 'Written to your inbox.',
    sent: 'Accepted by the mail provider.',
    queued: 'Waiting to be sent.',
    retrying: 'A send attempt failed and the platform is trying again.',
    failed: 'Every send attempt failed.',
    suppressed: 'Not sent on this channel because of your settings.',
    not_applicable: 'This message was not sent on this channel.',
    unknown: 'This message predates delivery tracking.',
  },
  retry_limit: 3,
}

describe('the schema is the server’s, and this module reads it', () => {
  it('renders a row for every channel and category the server published', () => {
    const rows = preferenceRows(SCHEMA)
    expect(rows.map((r) => r.item.key)).toEqual([
      'in_app',
      'email',
      'application_updates',
      'payment_reminders',
    ])
  })

  it('publishes nothing when the schema has not loaded', () => {
    expect(preferenceRows(null)).toEqual([])
    expect(preferenceRows(undefined)).toEqual([])
  })

  it('treats only the server’s writable_fields as writable', () => {
    expect(isWritableField(SCHEMA, 'email_enabled')).toBe(true)
    expect(isWritableField(SCHEMA, 'payment_reminders')).toBe(true)
    // Both of the fields STU-14 named, and the ones the DB has but nothing reads.
    for (const field of [
      'whatsapp_enabled',
      'in_app_enabled',
      'sms_enabled',
      'marketing_emails',
      'quiet_hours_start',
      'quiet_hours_end',
      'timezone',
      'application_updates',
    ]) {
      expect(isWritableField(SCHEMA, field), field).toBe(false)
    }
  })

  it('will not build a body for a field the server said it would refuse', () => {
    expect(buildPreferenceUpdate(SCHEMA, 'whatsapp_enabled', true)).toBeNull()
    expect(buildPreferenceUpdate(SCHEMA, 'in_app_enabled', false)).toBeNull()
    expect(buildPreferenceUpdate(SCHEMA, 'application_updates', false)).toBeNull()
    // A mandatory row carries no field at all, so there is nothing to send.
    expect(buildPreferenceUpdate(SCHEMA, null, false)).toBeNull()
  })

  it('builds a single-field body for a writable switch', () => {
    expect(buildPreferenceUpdate(SCHEMA, 'email_enabled', false)).toEqual({
      email_enabled: false,
    })
    expect(buildPreferenceUpdate(SCHEMA, 'payment_reminders', true)).toEqual({
      payment_reminders: true,
    })
  })

  it('sends nothing before the schema has loaded', () => {
    expect(buildPreferenceUpdate(null, 'email_enabled', false)).toBeNull()
  })
})

describe('a refusal is explained with the server’s own reason', () => {
  it('reads the per-field refusals out of the 400 envelope', () => {
    const rejections = preferenceRejections({
      code: UNSUPPORTED_PREFERENCE,
      details: {
        rejected: [
          {
            field: 'whatsapp_enabled',
            code: 'CHANNEL_NOT_IMPLEMENTED',
            reason: 'No WhatsApp integration.',
          },
          { field: 'timezone', code: 'FIELD_NOT_IMPLEMENTED', reason: 'Nothing reads it.' },
        ],
      },
    })
    expect(rejections).toEqual([
      {
        field: 'whatsapp_enabled',
        code: 'CHANNEL_NOT_IMPLEMENTED',
        reason: 'No WhatsApp integration.',
      },
      { field: 'timezone', code: 'FIELD_NOT_IMPLEMENTED', reason: 'Nothing reads it.' },
    ])
  })

  it('yields nothing rather than inventing copy when there is no detail', () => {
    expect(preferenceRejections(null)).toEqual([])
    expect(preferenceRejections(new Error('boom'))).toEqual([])
    expect(preferenceRejections({ details: { rejected: 'not-a-list' } })).toEqual([])
    expect(preferenceRejections({ details: { rejected: [null, {}, { code: 'x' }] } })).toEqual(
      [],
    )
  })

  it('pins the rejection codes and the schema version the server publishes', () => {
    expect(PREFERENCE_SCHEMA_VERSION).toBe(SCHEMA.schema_version)
    expect([...PREFERENCE_REJECTION_CODES]).toEqual([
      'CHANNEL_NOT_IMPLEMENTED',
      'CHANNEL_MANDATORY',
      'CATEGORY_NOT_IMPLEMENTED',
      'CATEGORY_MANDATORY',
      'FIELD_NOT_IMPLEMENTED',
      'UNKNOWN_FIELD',
    ])
  })
})

describe('delivery state presentation (R13.4)', () => {
  it('has a tone for every state the server publishes', () => {
    for (const state of SCHEMA.delivery_states) {
      expect(DELIVERY_STATE_TONES[state], state).toBeDefined()
    }
  })

  it('never renders an unrecognised state as healthy', () => {
    expect(deliveryStateTone('a_state_this_build_never_heard_of')).toBe('unknown')
    expect(deliveryStateTone(null)).toBe('unknown')
    expect(deliveryStateTone(undefined)).toBe('unknown')
  })

  it('distinguishes a failure from a suppression from an unknown', () => {
    expect(deliveryStateTone('failed')).toBe('negative')
    expect(deliveryStateTone('suppressed')).toBe('muted')
    expect(deliveryStateTone('unknown')).toBe('unknown')
    expect(deliveryStateTone('sent')).toBe('positive')
  })

  it('reads the definition from the server, or says nothing', () => {
    expect(deliveryStateDefinition(SCHEMA, 'failed')).toBe('Every send attempt failed.')
    expect(deliveryStateDefinition(SCHEMA, 'invented')).toBe('')
    expect(deliveryStateDefinition(null, 'failed')).toBe('')
  })

  it('labels a state without translating it into something else', () => {
    expect(deliveryStateLabel('not_applicable')).toBe('Not applicable')
    expect(deliveryStateLabel(null)).toBe('Unknown')
  })
})

describe('one message’s delivery record', () => {
  const message = {
    channels: [
      { channel: 'in_app', state: 'delivered', attempts: 1, last_attempt_at: null, can_retry: false },
      { channel: 'email', state: 'failed', attempts: 1, last_attempt_at: null, can_retry: true },
    ],
  }

  it('reads the channels the server sent', () => {
    expect(messageChannels(message).map((c) => c.channel)).toEqual(['in_app', 'email'])
  })

  it('asserts nothing for a message with no delivery record', () => {
    expect(messageChannels({})).toEqual([])
    expect(messageChannels(null)).toEqual([])
    expect(messageChannels({ channels: 'nope' } as never)).toEqual([])
  })

  it('offers a retry only when the server said so', () => {
    expect(canRetryMessage(message)).toBe(true)
    expect(canRetryMessage({ can_retry: true })).toBe(true)
    expect(
      canRetryMessage({
        channels: [
          { channel: 'email', state: 'failed', attempts: 9, last_attempt_at: null, can_retry: false },
        ],
      }),
    ).toBe(false)
    // A `failed` label alone is not the retry decision — the attempt count and
    // the platform's ceiling are the server's to weigh.
    expect(canRetryMessage({})).toBe(false)
  })
})

describe('the audience the server resolved (R13.4)', () => {
  it('reads the token the server sent, and invents none', () => {
    expect(messageAudience({ audience: 'staff' })).toBe('staff')
    expect(messageAudience({ audience: 'student' })).toBe('student')
    // A message from before the field was published states no class.
    expect(messageAudience({})).toBeNull()
    expect(messageAudience(null)).toBeNull()
    expect(messageAudience({ audience: '' })).toBeNull()
    expect(messageAudience({ audience: 7 } as never)).toBeNull()
  })
})

describe('a channel whose badge is not self-explanatory', () => {
  it('states the server’s definition for a channel this message class never had', () => {
    expect(statedChannelFact(SCHEMA, { state: DELIVERY_STATE_NOT_APPLICABLE })).toBe(
      'This message was not sent on this channel.',
    )
  })

  it('states the server’s definition for a channel with no record', () => {
    expect(statedChannelFact(SCHEMA, { state: DELIVERY_STATE_UNKNOWN })).toBe(
      'This message predates delivery tracking.',
    )
  })

  it('never describes an inapplicable channel as one whose record is missing', () => {
    // The whole point: the two are resolved from their own state, so a staff work
    // item's unused channel can never be told it "predates delivery tracking".
    const inapplicable = statedChannelFact(SCHEMA, { state: DELIVERY_STATE_NOT_APPLICABLE })
    const noRecord = statedChannelFact(SCHEMA, { state: DELIVERY_STATE_UNKNOWN })
    expect(inapplicable).not.toBe(noRecord)
    expect(inapplicable).not.toContain('predates')
  })

  it('says nothing for a state the badge already explains', () => {
    for (const state of ['delivered', 'sent', 'queued', 'retrying', 'failed', 'suppressed']) {
      expect(statedChannelFact(SCHEMA, { state }), state).toBe('')
    }
  })

  it('says nothing rather than guessing when the server published no definition', () => {
    expect(statedChannelFact(null, { state: DELIVERY_STATE_NOT_APPLICABLE })).toBe('')
    expect(
      statedChannelFact(
        { ...SCHEMA, delivery_state_definitions: {} },
        { state: DELIVERY_STATE_UNKNOWN },
      ),
    ).toBe('')
    expect(statedChannelFact(SCHEMA, null)).toBe('')
    expect(statedChannelFact(SCHEMA, { state: 'a_state_this_build_never_heard_of' })).toBe('')
  })
})
