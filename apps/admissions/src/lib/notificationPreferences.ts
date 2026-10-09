/**
 * The one notification-preference schema, as the browser sees it (task 10.1).
 *
 * Admissions-v2 task 10.1 — R13.3, R13.4, R13.8; finding **STU-14**.
 *
 * ## Why this file exists
 *
 * STU-14 is a drift finding, not a rendering finding. The platform had three
 * disagreeing answers to *"what can a student control?"*:
 *
 * - the database held nine columns;
 * - the endpoint accepted and stored all nine;
 * - this app declared `whatsapp_enabled` / `in_app_enabled` (which the backend
 *   never had), asked for quiet hours (which no delivery path reads), and then
 *   rendered three read-only tiles reading "Always on", "Always on" and
 *   "Coming soon" — so the fetch was decorative.
 *
 * The fix is that the **server publishes the schema** and this app renders it.
 * There is no field list in a component and no channel constant in a page: a
 * control appears because `GET /api/v1/notifications/preferences/` said it is
 * `configurable`, and its explanation is the server's own `definition`.
 *
 * ## What is mirrored here, and why that is safe
 *
 * Only two things are duplicated from the backend, and both are drift-guarded by
 * `tests/unit/notificationPreferenceSchema.test.ts` against a fixture generated
 * from `apps/common/notification_preferences.py`:
 *
 * 1. `PREFERENCE_SCHEMA_VERSION` — so a shape change is a failing test rather
 *    than a silently mis-rendered screen;
 * 2. the **rejection codes**, because the browser has to explain a 400 to a
 *    student and cannot invent that copy on the fly.
 *
 * Everything else — which channels exist, which are mandatory, which categories
 * are optional, what each one means, which fields are writable, and what the
 * delivery states mean — is read from the response. That is the whole point:
 * a channel the platform cannot send must not be renderable here.
 */

/** Bumped by the backend when the published shape changes. */
export const PREFERENCE_SCHEMA_VERSION = 1

/** Top-level error code for a PUT naming anything not writable. */
export const UNSUPPORTED_PREFERENCE = 'UNSUPPORTED_PREFERENCE'

export const PREFERENCE_REJECTION_CODES = [
  'CHANNEL_NOT_IMPLEMENTED',
  'CHANNEL_MANDATORY',
  'CATEGORY_NOT_IMPLEMENTED',
  'CATEGORY_MANDATORY',
  'FIELD_NOT_IMPLEMENTED',
  'UNKNOWN_FIELD',
] as const

export type PreferenceRejectionCode = (typeof PREFERENCE_REJECTION_CODES)[number]

// ---------------------------------------------------------------------------
// The published schema (server-authored)
// ---------------------------------------------------------------------------

export interface PreferenceChannel {
  key: string
  enabled: boolean
  /** True when the student may switch it. False is a fact, not a badge. */
  configurable: boolean
  /** True when every message uses it and it cannot be switched off. */
  mandatory: boolean
  /** The stored column, or null when there is nothing to store. */
  field: string | null
  definition: string
}

export interface PreferenceCategory {
  key: string
  enabled: boolean
  configurable: boolean
  /** `mandatory` — a transactional message — or `optional`. */
  kind: string
  field: string | null
  definition: string
}

export interface UnsupportedPreferenceField {
  field: string
  code: string
  reason: string
}

export interface NotificationPreferenceSchema {
  schema_version: number
  /** True when no row is stored yet, so these are the published defaults. */
  is_default: boolean
  channels: PreferenceChannel[]
  categories: PreferenceCategory[]
  writable_fields: string[]
  unsupported_fields: UnsupportedPreferenceField[]
  /** The delivery-state vocabulary the communications history renders. */
  delivery_states: string[]
  delivery_state_definitions: Record<string, string>
  retry_limit: number
}

/** A PUT body: writable field names only, all boolean. */
export type PreferenceUpdate = Record<string, boolean>

// ---------------------------------------------------------------------------
// Reading the schema
// ---------------------------------------------------------------------------

/**
 * The switches to render, in the server's own order.
 *
 * A **mandatory** entry is included, because a student is entitled to know that
 * decisions about their application are always sent — but it is returned with
 * `configurable: false` so the caller renders a stated fact rather than a
 * disabled switch that looks like something they failed to turn on.
 */
export function preferenceRows(
  schema: NotificationPreferenceSchema | null | undefined,
): Array<
  | { kind: 'channel'; item: PreferenceChannel }
  | { kind: 'category'; item: PreferenceCategory }
> {
  if (!schema) return []
  return [
    ...schema.channels.map((item) => ({ kind: 'channel' as const, item })),
    ...schema.categories.map((item) => ({ kind: 'category' as const, item })),
  ]
}

/** Whether a field name may be sent in a PUT, according to the server. */
export function isWritableField(
  schema: NotificationPreferenceSchema | null | undefined,
  field: string | null | undefined,
): boolean {
  if (!schema || !field) return false
  return schema.writable_fields.includes(field)
}

/**
 * Build a PUT body from one switch change.
 *
 * Returns `null` when the field is not writable according to the server, so the
 * browser cannot send a field it was told would be refused. The backend rejects
 * it either way — this only avoids a pointless round trip and a confusing error.
 */
export function buildPreferenceUpdate(
  schema: NotificationPreferenceSchema | null | undefined,
  field: string | null | undefined,
  enabled: boolean,
): PreferenceUpdate | null {
  if (!isWritableField(schema, field)) return null
  return { [field as string]: enabled }
}

// ---------------------------------------------------------------------------
// Explaining a refusal
// ---------------------------------------------------------------------------

export interface PreferenceRejection {
  field: string
  code: string
  reason: string
}

/**
 * Extract the per-field refusals from a 400 response.
 *
 * The server states the reason for every refusal, so this reads them rather than
 * mapping codes to invented copy. A response that carries no per-field detail
 * yields an empty list and the caller falls back to the envelope message.
 */
export function preferenceRejections(error: unknown): PreferenceRejection[] {
  const details = (error as { details?: unknown } | null)?.details
  const rejected = (details as { rejected?: unknown } | null)?.rejected
  if (!Array.isArray(rejected)) return []
  return rejected.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const row = entry as Record<string, unknown>
    const field = typeof row.field === 'string' ? row.field : ''
    if (!field) return []
    return [
      {
        field,
        code: typeof row.code === 'string' ? row.code : 'UNKNOWN_FIELD',
        reason: typeof row.reason === 'string' ? row.reason : '',
      },
    ]
  })
}

// ---------------------------------------------------------------------------
// Delivery state presentation (R13.4)
// ---------------------------------------------------------------------------

export type DeliveryTone = 'positive' | 'pending' | 'negative' | 'muted' | 'unknown'

/**
 * The state that means *this message class never had this channel*.
 *
 * Not a delivery outcome and not a setting the reader failed to enable: a fact
 * about the message. A staff work item is written to the inbox only — the
 * platform publishes no staff notification settings and a resolved recipient is
 * a user id rather than an address — so its other channel reads this.
 */
export const DELIVERY_STATE_NOT_APPLICABLE = 'not_applicable'

/** The state that means the platform genuinely cannot say what happened. */
export const DELIVERY_STATE_UNKNOWN = 'unknown'

/**
 * The two states whose badge alone invites a wrong conclusion, so the server's
 * definition is rendered as **visible** text rather than only as a tooltip.
 *
 * They are also the two that must never be confused with each other: one says
 * "this was never applicable", the other says "no record exists". Rendering the
 * second for the first is a false statement about the platform, which is the
 * defect this set exists to prevent.
 */
const STATED_FACT_STATES: ReadonlySet<string> = new Set([
  DELIVERY_STATE_NOT_APPLICABLE,
  DELIVERY_STATE_UNKNOWN,
])

/**
 * How each published delivery state is presented.
 *
 * The **words** and their definitions are the server's; this maps them to a
 * tone. A state the server publishes that is missing here renders as `unknown`
 * rather than as healthy — the ADM-02 rule applied to a delivery label — and
 * `notificationPreferenceSchema.test.ts` fails if the server grows a state this
 * map has no entry for.
 */
export const DELIVERY_STATE_TONES: Record<string, DeliveryTone> = {
  delivered: 'positive',
  sent: 'positive',
  queued: 'pending',
  retrying: 'pending',
  failed: 'negative',
  suppressed: 'muted',
  not_applicable: 'muted',
  unknown: 'unknown',
}

export function deliveryStateTone(state: string | null | undefined): DeliveryTone {
  if (!state) return 'unknown'
  return DELIVERY_STATE_TONES[state] ?? 'unknown'
}

/** Human label for a state. Falls back to the raw key, never to a guess. */
export function deliveryStateLabel(state: string | null | undefined): string {
  if (!state) return 'Unknown'
  return state.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

/**
 * The definition the server published for a state.
 *
 * Returns an empty string when the server said nothing, so a caller renders no
 * explanation rather than one this app made up.
 */
export function deliveryStateDefinition(
  schema: NotificationPreferenceSchema | null | undefined,
  state: string | null | undefined,
): string {
  if (!schema || !state) return ''
  return schema.delivery_state_definitions[state] ?? ''
}

// ---------------------------------------------------------------------------
// One message's delivery record
// ---------------------------------------------------------------------------

export interface MessageChannelState {
  channel: string
  state: string
  attempts: number
  last_attempt_at: string | null
  can_retry: boolean
}

export interface CommunicationMessage {
  id: string
  title: string
  message: string
  type: string | null
  is_read: boolean
  action_url: string | null
  created_at: string
  /** Published by the server from 10.1 on; absent on a pre-10.1 message. */
  category?: string
  kind?: string
  /**
   * Who this class of message is for, as the server resolved it from the
   * category — not from the call site that produced it.
   *
   * The token is read, never re-interpreted: which channels an audience may use
   * is the server's decision and it already arrives resolved, as a per-channel
   * state. So this is carried onto the rendered surface (so a reader of the DOM
   * can see which message class was rendered) and deliberately not turned into
   * user-facing copy, because the platform publishes the audience token without
   * publishing its explanation — and the explanation a reader actually needs is
   * the channel state's own published definition.
   */
  audience?: string
  channels?: MessageChannelState[]
  can_retry?: boolean
}

/**
 * Read one message's per-channel delivery states.
 *
 * A message the server sent no `channels` for yields an empty list, and the
 * caller shows nothing rather than asserting a delivery that was never tracked.
 */
export function messageChannels(
  message: Pick<CommunicationMessage, 'channels'> | null | undefined,
): MessageChannelState[] {
  const channels = message?.channels
  if (!Array.isArray(channels)) return []
  return channels.filter(
    (channel): channel is MessageChannelState =>
      Boolean(channel) && typeof channel.channel === 'string' && typeof channel.state === 'string',
  )
}

/** Whether the platform is offering a retry for this message. */
export function canRetryMessage(
  message: Pick<CommunicationMessage, 'can_retry' | 'channels'> | null | undefined,
): boolean {
  if (message?.can_retry === true) return true
  return messageChannels(message).some((channel) => channel.can_retry)
}

/**
 * The audience the server resolved for this message, or `null`.
 *
 * `null` for a message sent before the field was published — the surface then
 * states no message class rather than assuming one.
 */
export function messageAudience(
  message: Pick<CommunicationMessage, 'audience'> | null | undefined,
): string | null {
  const audience = message?.audience
  return typeof audience === 'string' && audience ? audience : null
}

/**
 * The sentence to render for a channel whose badge is not self-explanatory.
 *
 * Keyed **strictly** on that channel's own state, so the two easily-confused
 * states can never be handed each other's words: a channel this message class
 * never had cannot be described as one whose record is missing, and vice versa.
 * Returns `''` for every other state (the badge says it) and for a state the
 * server published no definition for (nothing rather than a guess).
 */
export function statedChannelFact(
  schema: NotificationPreferenceSchema | null | undefined,
  channel: Pick<MessageChannelState, 'state'> | null | undefined,
): string {
  const state = channel?.state
  if (!state || !STATED_FACT_STATES.has(state)) return ''
  return deliveryStateDefinition(schema, state)
}
