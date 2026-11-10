import React, { useCallback, useState } from 'react'
import { Copy, Link2, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { logger } from '@/lib/logger'
import { publicTrackingService, type IssuedTrackingLink } from '@/services/publicTracking'

/**
 * "Get tracking link" — the owner's own credential-issuing control
 * (admissions-v2 task 10.5, R13.12 / R13.6, finding STU-22).
 *
 * Why this is a button and not a field: the tracking secret is stored only as a
 * SHA-256, so there is no read that can show it. Before 10.5 the surfaces here
 * displayed `public_tracking_code` as "use this for public status tracking" —
 * an identifier printed on every slip, with a guessable stem. This control
 * replaces that display with the one command that mints a real credential.
 *
 * Three things are said out loud, because all three are true and a student
 * acting on a wrong assumption is the failure mode:
 *
 * * issuing **replaces** any earlier link (one live secret per application);
 * * the link is shown once — it cannot be read back;
 * * anyone holding it can see the application's status.
 */
interface TrackingLinkActionProps {
  applicationId: string
  /** Rendered above the control. Defaults to the student-facing explanation. */
  description?: string
  className?: string
}

export const TrackingLinkAction: React.FC<TrackingLinkActionProps> = ({
  applicationId,
  description,
  className,
}) => {
  const [link, setLink] = useState<IssuedTrackingLink | null>(null)
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const issue = useCallback(async () => {
    setIssuing(true)
    setError('')
    try {
      setLink(await publicTrackingService.issueLink(applicationId))
    } catch (err) {
      logger.error('Failed to issue tracking link:', err)
      setError('The tracking link could not be issued. Please try again in a moment.')
    } finally {
      setIssuing(false)
    }
  }, [applicationId])

  const copy = useCallback(async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      logger.error('Failed to copy tracking link:', err)
    }
  }, [link])

  return (
    <div className={className} data-testid="tracking-link-action">
      <p className="text-base sm:text-sm text-muted-foreground">
        {description ??
          'Track this application without signing in, or share its status with someone. Getting a link replaces any link you shared before.'}
      </p>
      {!link && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 min-h-touch"
          onClick={issue}
          disabled={issuing}
        >
          <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
          {issuing ? 'Getting link…' : 'Get tracking link'}
        </Button>
      )}
      {error && (
        <p className="mt-3 text-base sm:text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {link && (
        <div className="mt-3 space-y-3" aria-live="polite">
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tracking link
            </p>
            <p className="break-all font-mono text-base sm:text-sm text-foreground" data-testid="issued-tracking-url">
              {link.url}
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-base sm:text-sm text-foreground">
              Copy it now: it is shown once.{' '}
              {link.replaced_previous
                ? 'Any link you shared earlier no longer works.'
                : 'Anyone with this link can see this application’s status.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="min-h-touch" onClick={copy}>
              <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
              {copied ? 'Link copied' : 'Copy link'}
            </Button>
            <Button variant="ghost" size="sm" className="min-h-touch" onClick={issue} disabled={issuing}>
              {issuing ? 'Replacing…' : 'Replace link'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
