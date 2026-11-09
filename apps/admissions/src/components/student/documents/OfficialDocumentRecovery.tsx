/**
 * What a student sees when an official document cannot be produced.
 *
 * admissions-v2 task 10.4, finding **STU-18** — third clause: *"student errors
 * expose tenant setup instructions"*. The pre-10.4 student error was
 * `OFFICIAL_DOCUMENT_SETUP_REQUIRED_MESSAGE`:
 *
 * > "Tenant document setup is incomplete. Configure the document profile,
 * > template, logo, and signature before generating this document."
 *
 * Two things are wrong with showing that to an applicant. It asks them to do
 * work only a school operator can do — so it is a dead end dressed as an
 * instruction — and it discloses that the school's configuration is incomplete,
 * which is the school's internal state.
 *
 * This component is the replacement, and it is deliberately three things and no
 * more:
 *
 * 1. **what happened**, in the platform's own neutral sentence
 *    (`useOfficialDocument`'s audience-aware `error`);
 * 2. **who is dealing with it** — the tenant's own staff were alerted by the
 *    renderer, so the student is told the office knows rather than being sent to
 *    chase it;
 * 3. **a way to reach a human**, resolved by task 8.3's
 *    `resolveTenantSupportContact` — the resolved school's own admissions
 *    address, or the neutral in-app `/contact` route. Never a hardcoded address
 *    and never an example tenant's (STU-24).
 *
 * The retry control appears exactly when the **server** says retrying could
 * change the outcome (`can_retry` on the durable job). A tenant setup failure is
 * not the student's to retry, so no button is offered for it — the alternative,
 * a button that reliably fails, is the loop STU-18 describes with a nicer label.
 */
import { AlertTriangle, Mail, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/Button'
import { usePortalBrand } from '@/hooks/usePortalBrand'
import { resolveTenantSupportContact } from '@/lib/tenantSupport'

export interface OfficialDocumentRecoveryProps {
  /** The platform's own sentence for this failure. */
  message: string | null
  /** The server's answer to "would retrying help?" */
  canRetry: boolean
  /** True when the failure needs tenant configuration rather than a retry. */
  isSetupRequired: boolean
  /** Non-PII context for the support `mailto:` — an application number is fine. */
  applicationNumber?: string | null
  /** Human label of the document that could not be produced. */
  documentLabel?: string
  onRetry?: () => void
  busy?: boolean
  /**
   * True when the letter is "not available yet" because the school has not set it
   * up (SJR R7-d). Nothing was attempted, so there is no "the office has been
   * notified" sentence and no retry; only the message and the support route.
   */
  notAvailableYet?: boolean
}

export function OfficialDocumentRecovery({
  message,
  canRetry,
  isSetupRequired,
  applicationNumber,
  documentLabel = 'official document',
  onRetry,
  busy = false,
  notAvailableYet = false,
}: OfficialDocumentRecoveryProps) {
  const { brandName, supportEmail } = usePortalBrand()
  const support = resolveTenantSupportContact({
    supportEmail,
    brandName,
    purpose: 'official_document',
    subject: `${documentLabel} request`,
    bodyLines: applicationNumber
      ? [`Application number: ${applicationNumber}`, `Document: ${documentLabel}`]
      : [`Document: ${documentLabel}`],
  })

  if (!message) return null

  return (
    <div
      className="flex w-full flex-col gap-3 rounded-lg border border-border bg-muted/40 p-4"
      role={notAvailableYet ? 'status' : 'alert'}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={`mt-0.5 h-4 w-4 shrink-0 ${notAvailableYet ? 'text-muted-foreground' : 'text-destructive'}`}
          aria-hidden="true"
        />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">{message}</p>
          <p className="text-sm text-muted-foreground">{support.description}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {canRetry && onRetry && !notAvailableYet && (
          <Button
            onClick={onRetry}
            variant="secondary"
            loading={busy}
            className="min-h-touch w-full justify-center gap-2 rounded-lg sm:w-auto"
          >
            {!busy && <RotateCcw className="h-4 w-4" aria-hidden="true" />}
            <span>Try again</span>
          </Button>
        )}
        {support.isExternal ? (
          <Button
            asChild
            variant="ghost"
            className="min-h-touch w-full justify-center gap-2 rounded-lg sm:w-auto"
          >
            <a href={support.href}>
              <Mail className="h-4 w-4" aria-hidden="true" />
              <span>{support.label}</span>
            </a>
          </Button>
        ) : (
          <Button
            asChild
            variant="ghost"
            className="min-h-touch w-full justify-center gap-2 rounded-lg sm:w-auto"
          >
            <Link to={support.href}>
              <Mail className="h-4 w-4" aria-hidden="true" />
              <span>{support.label}</span>
            </Link>
          </Button>
        )}
      </div>
      {/* No tenant configuration detail is named here even when the cause is a
          setup failure: the school's own staff were told, by name, through the
          inbox work item the renderer writes (task 10.4 part 3). */}
      {isSetupRequired && !notAvailableYet && (
        <p className="text-xs text-muted-foreground">
          The admissions office has been notified and does not need you to do
          anything else.
        </p>
      )}
    </div>
  )
}

export default OfficialDocumentRecovery
