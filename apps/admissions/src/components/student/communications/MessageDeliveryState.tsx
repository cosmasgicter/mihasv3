/**
 * What happened to one message, per channel — and the one action if it failed.
 *
 * Admissions-v2 task 10.1 — R13.4; finding **STU-14**.
 *
 * R13.4 asks the communications history to show **delivery state and channel**
 * "without exposing secrets or internal provider payloads", and to make retry
 * "an authorized audited command". Both halves are visible here:
 *
 * - the states, their definitions and the retry ceiling are the **server's**
 *   (published on the preference schema); this component renders them and adds
 *   no vocabulary of its own;
 * - a state this build does not recognise renders as `unknown`, never as
 *   healthy — a message whose delivery predates tracking says so;
 * - the two states a badge alone misreads — a channel this message class never
 *   had, and a channel with no record at all — state the server's own definition
 *   as **visible** text, each keyed on its own state. Saying "this predates
 *   delivery tracking" about a channel that was simply never applicable would be
 *   false: the message predates nothing, and a staff work item is inbox-only
 *   because the platform decided so, not because the record was lost;
 * - the raw material for all of this (`EmailQueue.error_message`,
 *   `recipient_email`) is never sent to the browser, so there is nothing here to
 *   leak: provider text and the student's own address stay on the server.
 *
 * The retry control appears **only** when the server said `can_retry`. It is not
 * a client-side inference from the state string, because "may this be retried"
 * depends on the attempt count and the platform's ceiling, both of which the
 * server owns.
 *
 * The message's `audience` is carried onto the rendered element rather than
 * turned into copy. Which channels a message class may use is already resolved
 * by the server into the per-channel state this renders, and the platform
 * publishes the audience token without publishing its explanation — so writing
 * one here would be exactly the invented copy STU-14 is about.
 */

import React from 'react'
import { AlertTriangle, BellOff, CheckCircle2, Clock, HelpCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  canRetryMessage,
  deliveryStateLabel,
  deliveryStateTone,
  messageAudience,
  messageChannels,
  statedChannelFact,
  type CommunicationMessage,
  type DeliveryTone,
  type NotificationPreferenceSchema,
} from '@/lib/notificationPreferences'
import { cn } from '@/lib/utils'

const CHANNEL_LABELS: Record<string, string> = {
  in_app: 'Inbox',
  email: 'Email',
}

const TONE_STYLES: Record<DeliveryTone, string> = {
  positive: 'border-success/30 bg-success/10 text-success',
  pending: 'border-info/30 bg-info/10 text-foreground',
  negative: 'border-destructive/30 bg-destructive/10 text-destructive',
  muted: 'border-border bg-muted text-muted-foreground',
  unknown: 'border-border bg-muted text-muted-foreground',
}

/** Every tone carries an icon as well as a colour (never colour alone). */
const TONE_ICONS: Record<DeliveryTone, React.ComponentType<{ className?: string }>> = {
  positive: CheckCircle2,
  pending: Clock,
  negative: AlertTriangle,
  muted: BellOff,
  unknown: HelpCircle,
}

export interface MessageDeliveryStateProps {
  message: CommunicationMessage
  /** The published vocabulary. Definitions render only when the server sent one. */
  schema: NotificationPreferenceSchema | null
  onRetry?: (messageId: string) => void
  isRetrying?: boolean
  retryError?: string | null
  retryNotice?: string | null
}

export function MessageDeliveryState({
  message,
  schema,
  onRetry,
  isRetrying = false,
  retryError = null,
  retryNotice = null,
}: MessageDeliveryStateProps) {
  const channels = messageChannels(message)
  if (channels.length === 0) return null

  const showRetry = Boolean(onRetry) && canRetryMessage(message)
  const audience = messageAudience(message)
  // Each fact is resolved from its own channel's state, so the two states that
  // must never borrow each other's words cannot.
  const statedFacts = channels
    .map((channel) => ({ channel, fact: statedChannelFact(schema, channel) }))
    .filter((entry) => entry.fact !== '')

  return (
    <div
      className="mt-2 space-y-2"
      data-testid={`delivery-${message.id}`}
      data-audience={audience ?? undefined}
    >
      <ul className="flex flex-wrap items-center gap-2" role="list">
        {channels.map((channel) => {
          const tone = deliveryStateTone(channel.state)
          const Icon = TONE_ICONS[tone]
          const definition = schema?.delivery_state_definitions?.[channel.state] ?? ''
          return (
            <li key={channel.channel}>
              <span
                data-text-role="caption"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-sm font-medium',
                  TONE_STYLES[tone],
                )}
                title={definition || undefined}
                data-testid={`delivery-${message.id}-${channel.channel}`}
                data-state={channel.state}
              >
                <Icon className="h-3 w-3" aria-hidden="true" />
                <span>
                  {CHANNEL_LABELS[channel.channel] ?? channel.channel}:{' '}
                  {deliveryStateLabel(channel.state)}
                </span>
              </span>
            </li>
          )
        })}
      </ul>

      {statedFacts.length > 0 && (
        <ul className="space-y-1" role="list">
          {statedFacts.map(({ channel, fact }) => (
            <li
              key={channel.channel}
              data-text-role="caption"
              className="text-sm text-muted-foreground"
              data-testid={`delivery-${message.id}-${channel.channel}-fact`}
              data-state={channel.state}
            >
              {CHANNEL_LABELS[channel.channel] ?? channel.channel}: {fact}
            </li>
          ))}
        </ul>
      )}

      {showRetry && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-touch"
            loading={isRetrying}
            onClick={() => onRetry?.(message.id)}
            data-testid={`retry-${message.id}`}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Try sending again
          </Button>
          <span data-text-role="caption" className="text-sm text-muted-foreground">
            {schema?.delivery_state_definitions?.failed ??
              'The platform will queue another attempt.'}
          </span>
        </div>
      )}

      {retryNotice && (
        <p className="text-base font-medium text-success" role="status">
          {retryNotice}
        </p>
      )}
      {retryError && (
        <p className="text-base font-medium text-destructive" role="alert">
          {retryError}
        </p>
      )}
    </div>
  )
}

export default MessageDeliveryState
