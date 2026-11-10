/**
 * Notification preferences — real controls, derived from the published schema.
 *
 * Admissions-v2 task 10.1 — R13.3, R13.4, R13.8; findings **STU-14**, **STU-24**.
 *
 * ## What this page used to be
 *
 * It fetched `GET /notifications/preferences/` and then ignored the answer,
 * rendering three read-only tiles: "In-app notifications — Always on",
 * "Email notifications — Always on", and "SMS alerts — Coming soon". Below them
 * it rendered a **second full inbox** (mark read, open, delete, mark-all-read)
 * duplicating `/student/communications`. So the page had a preference fetch that
 * changed nothing, three badges that were not controls, and half of another
 * page's job.
 *
 * ## What it is now
 *
 * Preferences, and only preferences. Every row comes from the server's published
 * schema:
 *
 * - a row the server marks `configurable` renders a **switch** that persists;
 * - a row it marks `mandatory` renders as a **stated fact** with the server's own
 *   definition — not a disabled switch, because a disabled switch reads as
 *   something the student failed to turn on;
 * - a field the platform cannot honour is **not rendered at all**, and the
 *   refusal table is shown as "what this platform does not do" so the absence is
 *   explained rather than mysterious.
 *
 * The inbox lives at `/student/communications`, which this page links to. That is
 * the merge R13.8 asks for: one communications/inbox history, one preferences
 * screen.
 *
 * STU-24: the page title and the support affordance come from resolved tenant
 * context (`usePortalBrand` → `resolveTenantSupportContact`). No address and no
 * school name is written here.
 */

import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Bell, CheckCircle2, Inbox, Info, Lock, Mail } from 'lucide-react'
import { Seo } from '@/components/seo/Seo'
import { Button } from '@/components/ui/Button'
import { SkeletonCard } from '@/components/ui'
import { SectionCard } from '@/components/ui/SectionCard'
import { PageShell } from '@/components/ui/PageShell'
import { Banner } from '@/components/ui/Banner'
import { Switch } from '@/components/ui/switch'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { useNotificationPreferenceSchema } from '@/hooks/useNotificationPreferenceSchema'
import { usePortalBrand } from '@/hooks/usePortalBrand'
import { brandedPageTitle } from '@/lib/tenantBrandCopy'
import { resolveTenantSupportContact } from '@/lib/tenantSupport'
import {
  buildPreferenceUpdate,
  preferenceRejections,
  type PreferenceRejection,
} from '@/lib/notificationPreferences'
import { pathFor } from '@/routes/routeRegistry'

interface PreferenceRow {
  key: string
  field: string | null
  enabled: boolean
  configurable: boolean
  definition: string
  /** Set for the always-on rows, so the reason is stated rather than badged. */
  alwaysOnReason: string | null
}

function ChannelIcon({ channelKey }: { channelKey: string }) {
  if (channelKey === 'email') return <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
  return <Bell className="h-5 w-5 text-primary" aria-hidden="true" />
}

export default function NotificationSettings() {
  const { brandName, supportEmail } = usePortalBrand()
  const {
    schema,
    isLoading,
    error,
    save,
    isSaving,
    savingField,
  } = useNotificationPreferenceSchema()

  const [saved, setSaved] = useState<string | null>(null)
  const [rejections, setRejections] = useState<PreferenceRejection[]>([])
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const support = useMemo(
    () =>
      resolveTenantSupportContact({
        supportEmail,
        brandName,
        subject: 'Question about my notification settings',
      }),
    [supportEmail, brandName],
  )

  const channelRows: PreferenceRow[] = useMemo(
    () =>
      (schema?.channels ?? []).map((channel) => ({
        key: channel.key,
        field: channel.field,
        enabled: channel.enabled,
        configurable: channel.configurable,
        definition: channel.definition,
        alwaysOnReason: channel.mandatory ? channel.definition : null,
      })),
    [schema],
  )

  const categoryRows: PreferenceRow[] = useMemo(
    () =>
      (schema?.categories ?? []).map((category) => ({
        key: category.key,
        field: category.field,
        enabled: category.enabled,
        configurable: category.configurable,
        definition: category.definition,
        alwaysOnReason: category.configurable ? null : category.definition,
      })),
    [schema],
  )

  const handleToggle = useCallback(
    async (row: PreferenceRow, next: boolean) => {
      const update = buildPreferenceUpdate(schema, row.field, next)
      if (!update) {
        // The server told us this field is not writable. Saying so beats sending
        // a request we already know it will refuse.
        setRejections([
          {
            field: row.field ?? row.key,
            code: 'CHANNEL_MANDATORY',
            reason: row.definition,
          },
        ])
        return
      }

      setRejections([])
      setSaveMessage(null)
      setSaved(null)
      try {
        await save(update)
        setSaved(row.key)
      } catch (err) {
        const refusals = preferenceRejections(err)
        if (refusals.length > 0) {
          setRejections(refusals)
          return
        }
        setSaveMessage(
          err instanceof Error && err.message
            ? err.message
            : 'That setting could not be saved. Please try again.',
        )
      }
    },
    [save, schema],
  )

  const renderRow = (row: PreferenceRow, showIcon: boolean) => {
    const isBusy = isSaving && savingField === row.field
    const justSaved = saved === row.key && !isBusy
    const rowRejection = rejections.find((r) => r.field === (row.field ?? row.key))

    return (
      <div
        key={row.key}
        className="rounded-lg border border-border bg-card px-4 py-3"
        data-testid={`preference-row-${row.key}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {showIcon && <ChannelIcon channelKey={row.key} />}
            <div className="min-w-0">
              <p className="text-base sm:text-sm font-medium text-foreground">
                {PREFERENCE_LABELS[row.key] ?? row.key}
              </p>
              <p className="mt-1 text-base sm:text-sm text-muted-foreground">{row.definition}</p>
              {rowRejection && (
                <p className="mt-2 text-base sm:text-sm font-medium text-destructive" role="alert">
                  {rowRejection.reason}
                </p>
              )}
            </div>
          </div>

          {row.configurable ? (
            <div className="flex shrink-0 items-center gap-2">
              {justSaved && (
                <span data-text-role="caption"
                  className="inline-flex items-center gap-1 text-sm sm:text-xs font-medium text-success"
                  role="status"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Saved
                </span>
              )}
              <Switch
                checked={row.enabled}
                disabled={isBusy}
                onCheckedChange={(next) => handleToggle(row, next)}
                aria-label={`${PREFERENCE_LABELS[row.key] ?? row.key}: ${
                  row.enabled ? 'on' : 'off'
                }`}
                data-testid={`preference-switch-${row.key}`}
              />
            </div>
          ) : (
            // A mandatory row is a fact about the platform, so it is stated with
            // its reason. It is deliberately not a disabled switch: a greyed-out
            // toggle reads as a control the student failed to use.
            <span data-text-role="caption"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-sm sm:text-xs font-semibold text-muted-foreground"
              data-testid={`preference-always-on-${row.key}`}
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Always sent
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <Seo
        title={brandedPageTitle('Notification settings', brandName)}
        description="Choose which optional messages this platform sends you, and on which channel."
        path={pathFor('student.notifications')}
        siteName={brandName}
        noindex
      />
      <PageShell
        title="Notification settings"
        subtitle="Choose which optional messages we send, and where they go."
        eyebrow="Settings"
        tone="student"
      >
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="min-h-touch">
              <Link to={pathFor('student.settings')}>
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Back to settings
              </Link>
            </Button>
            <Button asChild size="sm" className="min-h-touch">
              <Link to={pathFor('student.communications')} data-testid="open-inbox">
                <Inbox className="mr-2 h-4 w-4" aria-hidden="true" />
                Open your inbox
              </Link>
            </Button>
          </div>

          {error && (
            <ErrorDisplay
              title="Your notification settings could not be loaded"
              message={error.message || 'Please try again in a moment.'}
            />
          )}

          {saveMessage && (
            <Banner variant="danger" dismissible onDismiss={() => setSaveMessage(null)}>
              {saveMessage}
            </Banner>
          )}

          {rejections.length > 0 && (
            <Banner variant="warning" dismissible onDismiss={() => setRejections([])}>
              <span data-testid="preference-rejection-summary">
                {rejections.length === 1 && rejections[0]?.reason
                  ? rejections[0].reason
                  : 'Some of those settings are not available on this platform.'}
              </span>
            </Banner>
          )}

          {isLoading ? (
            <div className="space-y-6" role="status" aria-label="Loading notification settings">
              <SkeletonCard />
              <SkeletonCard />
              <span className="sr-only">Loading notification settings</span>
            </div>
          ) : !schema ? null : (
            <>
              <SectionCard
                title="Where messages go"
                description="Your inbox always has every message. Email is optional for the messages you can switch off."
                icon={<Bell className="h-5 w-5" />}
              >
                <div className="space-y-3">{channelRows.map((row) => renderRow(row, true))}</div>
              </SectionCard>

              <SectionCard
                title="What we send"
                description="Messages about a decision, a deadline or a payment outcome are always sent. The rest are yours to choose."
                icon={<Mail className="h-5 w-5" />}
              >
                <div className="space-y-3">
                  {categoryRows.map((row) => renderRow(row, false))}
                </div>
              </SectionCard>

              {schema.unsupported_fields.length > 0 && (
                <SectionCard
                  title="What this platform does not do"
                  description="These are named so their absence is explained rather than assumed."
                  icon={<Info className="h-5 w-5" />}
                  padding="sm"
                >
                  <ul className="space-y-2" data-testid="unsupported-preference-list">
                    {schema.unsupported_fields.map((entry) => (
                      <li
                        key={entry.field}
                        className="rounded-lg border border-dashed border-border px-3 py-2 text-base sm:text-sm text-muted-foreground"
                      >
                        <span className="font-medium text-foreground">
                          {PREFERENCE_LABELS[entry.field] ?? entry.field}
                        </span>{' '}
                        — {entry.reason}
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}

              <SectionCard title="Need something changed?" padding="sm">
                <p className="text-base sm:text-sm text-muted-foreground">{SUPPORT_SENTENCE}</p>
                <div className="mt-3">
                  {support.isExternal ? (
                    <Button asChild variant="outline" size="sm" className="min-h-touch">
                      <a href={support.href} data-testid="notification-support-link">
                        {support.label}
                      </a>
                    </Button>
                  ) : (
                    <Button asChild variant="outline" size="sm" className="min-h-touch">
                      <Link to={support.href} data-testid="notification-support-link">
                        {support.label}
                      </Link>
                    </Button>
                  )}
                </div>
              </SectionCard>
            </>
          )}
        </div>
      </PageShell>
    </>
  )
}

/**
 * Display labels for the server's field and row keys.
 *
 * Copy only — it holds no authority. A key with no entry renders as the key
 * itself, so a channel or category the platform adds appears (unlabelled) rather
 * than silently disappearing because this app did not know its name.
 */
export const PREFERENCE_LABELS: Record<string, string> = {
  in_app: 'Your inbox',
  email: 'Email',
  application_updates: 'Updates about your application',
  payment_reminders: 'Payment reminders',
  interview_reminders: 'Interview reminders',
  sms_enabled: 'SMS alerts',
  whatsapp_enabled: 'WhatsApp messages',
  in_app_enabled: 'Turning your inbox off',
  marketing_emails: 'Marketing email',
  quiet_hours_start: 'Quiet hours',
  quiet_hours_end: 'Quiet hours',
  timezone: 'A saved timezone',
}

const SUPPORT_SENTENCE =
  'If a message did not reach you, your inbox shows what we sent and on which channel. Admissions can help with anything it does not explain.'
