/**
 * `/student/documents/open`: the one place a student's View/Open control lands.
 *
 * SJR task 3.17 (R5-a, clauses 2.21 and 2.25; findings B-01 and B-07). A stored
 * link is a signature with a lifetime, so no control in the student UI links to
 * one. Each is a plain anchor to this page, which asks the platform for a fresh
 * URL at the moment it is opened and then replaces itself with that URL. The
 * anchor needs no code after an await, so a popup blocker has nothing to block.
 *
 * The route is `student`-guarded, so its guard restores an expired session before
 * any redirect (R8-a): a tab opened long after sign-in recovers instead of
 * showing Sign in.
 *
 * It only reads. Preparing an official document stays on the page that offered
 * the "Prepare" control, so opening a link can never start work or take a payment.
 *
 * Logging records the kind, code and status of a failure and never an id, URL or
 * filename.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Loader2, Mail, RotateCcw } from 'lucide-react'

import { Seo } from '@/components/seo/Seo'
import { Button } from '@/components/ui/Button'
import { PageShell } from '@/components/ui/PageShell'
import { usePortalBrand } from '@/hooks/usePortalBrand'
import {
  isNavigableUrl,
  parseDocumentOpenSearch,
  type DocumentOpenTarget,
} from '@/lib/documentOpen'
import { logger } from '@/lib/logger'
import { isRateLimitedError, rateLimitMessage, retryAfterOf } from '@/lib/rateLimitCopy'
import { resolveTenantSupportContact } from '@/lib/tenantSupport'
import { pathFor } from '@/routes/routeRegistry'
import { documentService } from '@/services/documents'
import { officialDocumentService } from '@/services/officialDocuments'

/** What the page is showing. `opening` is the only state that navigates away. */
type OpenState =
  | { kind: 'opening' }
  | { kind: 'invalid' }
  | { kind: 'not_found' }
  | { kind: 'unavailable' }
  | { kind: 'rate_limited'; message: string }
  | { kind: 'not_prepared'; message: string; retry: boolean }

export const DOCUMENT_LINK_UNAVAILABLE_CODE = 'DOCUMENT_LINK_UNAVAILABLE'

class OpenOutcome extends Error {
  constructor(readonly state: OpenState) {
    super(state.kind)
  }
}

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : null
}

function codeOf(error: unknown): string | null {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : null
}

/** Resolve a target to a URL that can be opened now, or throw an {@link OpenOutcome}. */
async function resolveOpenUrl(target: DocumentOpenTarget): Promise<string> {
  if (target.kind === 'document') {
    const result = await documentService.getSignedUrl(target.documentId)
    if (isNavigableUrl(result?.url)) return result.url
    throw new OpenOutcome({ kind: 'unavailable' })
  }

  if (target.kind === 'legacy') {
    const rows = (await documentService.listByApplication(target.applicationId)) as Array<{
      id?: unknown
      file_url?: unknown
    }>
    const wanted = `legacy:${target.documentType}:${target.applicationId}`
    const row = rows.find((candidate) => candidate?.id === wanted)
    if (!row) throw new OpenOutcome({ kind: 'not_found' })
    if (isNavigableUrl(row.file_url)) return row.file_url
    throw new OpenOutcome({ kind: 'unavailable' })
  }

  const document = await officialDocumentService.getOfficialDocument(
    target.applicationId,
    target.documentType,
  )
  if (!document) throw new OpenOutcome({ kind: 'unavailable' })
  if (document.status === 'ready') {
    if (document.error_code === DOCUMENT_LINK_UNAVAILABLE_CODE) {
      throw new OpenOutcome({ kind: 'unavailable' })
    }
    if (isNavigableUrl(document.download_url)) return document.download_url
    throw new OpenOutcome({ kind: 'unavailable' })
  }
  switch (document.status) {
    case 'queued':
      throw new OpenOutcome({
        kind: 'not_prepared',
        message: 'This document is still being prepared. Try again in a moment.',
        retry: true,
      })
    case 'failed':
      throw new OpenOutcome({
        kind: 'not_prepared',
        message: "This document couldn't be prepared. Go back to your application and prepare it again.",
        retry: false,
      })
    case 'setup_required':
      throw new OpenOutcome({
        kind: 'not_prepared',
        message: "This document isn't available yet. The admissions office has been told.",
        retry: false,
      })
    default:
      throw new OpenOutcome({
        kind: 'not_prepared',
        message: "This document hasn't been prepared yet. Go back to your application and prepare it first.",
        retry: false,
      })
  }
}

function classify(error: unknown): OpenState {
  if (error instanceof OpenOutcome) return error.state
  if (isRateLimitedError(error)) {
    return { kind: 'rate_limited', message: rateLimitMessage(retryAfterOf(error)) }
  }
  const status = statusOf(error)
  if (status === 404 || codeOf(error) === 'NOT_FOUND') return { kind: 'not_found' }
  // 5xx, a network error and DOCUMENT_LINK_UNAVAILABLE are all "try again".
  return { kind: 'unavailable' }
}

function BackToStatusLink() {
  return (
    <Button asChild variant="outline" className="min-h-touch gap-2">
      <Link to={pathFor('student.status')}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Application Status
      </Link>
    </Button>
  )
}

/** Only rendered in a failure state, so the tenant context is read only when needed. */
function SupportContact() {
  const { brandName, supportEmail } = usePortalBrand()
  const support = resolveTenantSupportContact({
    supportEmail,
    brandName,
    purpose: 'official_document',
    subject: 'Document request',
  })
  return (
    <div className="space-y-2">
      <p className="text-base sm:text-sm text-muted-foreground">{support.description}</p>
      <Button asChild variant="ghost" className="min-h-touch gap-2">
        {support.isExternal ? (
          <a href={support.href}>
            <Mail className="h-4 w-4" aria-hidden="true" />
            {support.label}
          </a>
        ) : (
          <Link to={support.href}>
            <Mail className="h-4 w-4" aria-hidden="true" />
            {support.label}
          </Link>
        )}
      </Button>
    </div>
  )
}

export default function DocumentOpen() {
  const [searchParams] = useSearchParams()
  const target = useMemo(() => parseDocumentOpenSearch(searchParams), [searchParams])
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<OpenState>(target ? { kind: 'opening' } : { kind: 'invalid' })

  useEffect(() => {
    if (!target) {
      setState({ kind: 'invalid' })
      return undefined
    }
    let cancelled = false
    setState({ kind: 'opening' })
    resolveOpenUrl(target)
      .then((url) => {
        if (!cancelled) window.location.replace(url)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const next = classify(error)
        logger.info('[document-open] failed', {
          kind: target.kind,
          code: codeOf(error) ?? next.kind,
          status: statusOf(error),
        })
        setState(next)
      })
    return () => {
      cancelled = true
    }
  }, [target, attempt])

  const retry = useCallback(() => setAttempt((current) => current + 1), [])

  return (
    <PageShell title="Your document" tone="student" maxWidth="md">
      <Seo title="Opening your document" description="Opening your document." path="/student/documents/open" noindex />
      <div className="space-y-4" data-testid="document-open">
        {state.kind === 'opening' && (
          <p role="status" aria-live="polite" className="flex items-center gap-2 text-base sm:text-sm text-foreground">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Opening your document…
          </p>
        )}

        {state.kind === 'invalid' && (
          <div className="space-y-3" role="alert">
            <p className="flex items-start gap-2 text-base sm:text-sm font-medium text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              This link isn&apos;t valid.
            </p>
            <BackToStatusLink />
          </div>
        )}

        {state.kind === 'not_found' && (
          <div className="space-y-3" role="alert">
            <p className="flex items-start gap-2 text-base sm:text-sm font-medium text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              This document isn&apos;t available. It may have been replaced or removed.
            </p>
            <BackToStatusLink />
          </div>
        )}

        {state.kind === 'unavailable' && (
          <div className="space-y-3" role="alert">
            <p className="flex items-start gap-2 text-base sm:text-sm font-medium text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              This file can&apos;t be opened right now.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={retry} variant="secondary" className="min-h-touch gap-2">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Retry
              </Button>
              <BackToStatusLink />
            </div>
            <SupportContact />
          </div>
        )}

        {state.kind === 'rate_limited' && (
          <div className="space-y-3" role="alert">
            <p className="flex items-start gap-2 text-base sm:text-sm font-medium text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              {state.message}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button onClick={retry} variant="secondary" className="min-h-touch gap-2">
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Retry
              </Button>
              <BackToStatusLink />
            </div>
          </div>
        )}

        {state.kind === 'not_prepared' && (
          <div className="space-y-3" role="alert">
            <p className="flex items-start gap-2 text-base sm:text-sm font-medium text-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              {state.message}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {state.retry && (
                <Button onClick={retry} variant="secondary" className="min-h-touch gap-2">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Retry
                </Button>
              )}
              <BackToStatusLink />
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}
