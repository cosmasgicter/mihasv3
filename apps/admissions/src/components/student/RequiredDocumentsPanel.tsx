/**
 * Required-document upload panel (admissions-v2 task 7.2).
 *
 * Requirements: R11.6 (every control comes from the versioned server contract,
 *               including custom tenant types), R11.7 (type/size validation),
 *               R11.8 (replace preserves prior evidence).
 * Findings:     STU-13, STU-19.
 * Design:       §9.3 (Required Documents), §13.1/§13.3 (Student IA — one
 *               `SectionCard` layer, no nested cards, Lucide icons, 44px touch
 *               targets, accessible errors with focus management).
 *
 * The panel renders whatever the server says this application needs. It holds no
 * document-type list and no size/type constants of its own: labels, help text,
 * accepted types, and limits all come from the contract, so a tenant adding
 * `nursing_council_letter` gets a real, validated, accessible upload control
 * without a frontend change.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { FileUpload } from '@/components/ui/FileUpload'
import {
  acceptAttribute,
  constraintHint,
  formatConstraintSize,
  rejectionForDropzoneCode,
  type RequiredDocumentRequirement,
} from '@/lib/requiredDocuments'
import { cn } from '@/lib/utils'
import type { RequiredDocumentUploadState } from '@/hooks/useRequiredDocuments'

export interface RequiredDocumentsPanelProps {
  requirements: RequiredDocumentRequirement[]
  uploadStates: Record<string, RequiredDocumentUploadState>
  loading?: boolean
  /** Set when the contract itself could not be read — no controls are rendered. */
  contractError?: string | null
  contractErrorRetryable?: boolean
  onReload?: () => void
  onSelectFile: (documentType: string, file: File | null) => void
  onRetry: (documentType: string) => void
  /** A drop-zone refusal, reported against the same requirement. */
  onLocalError: (documentType: string, message: string, code?: string) => void
  onBeginReplace: (documentType: string) => void
  onCancelReplace: (documentType: string) => void
  /**
   * Remove the stored evidence on the server (task 7.3, R11.8). Optional so a
   * read-only surface can render the same panel without offering the command.
   */
  onRemove?: (documentType: string) => void
  className?: string
}

type StatusTone = 'verified' | 'uploaded' | 'uploading' | 'removing' | 'failed' | 'missing'

const STATUS_STYLES: Record<StatusTone, string> = {
  verified: 'border-success/30 bg-success/5 text-success',
  uploaded: 'border-success/30 bg-success/5 text-success',
  uploading: 'border-primary/30 bg-primary/5 text-primary',
  removing: 'border-primary/30 bg-primary/5 text-primary',
  failed: 'border-destructive/30 bg-destructive/5 text-destructive',
  missing: 'border-border bg-muted text-muted-foreground',
}

const STATUS_LABELS: Record<StatusTone, string> = {
  verified: 'Verified',
  uploaded: 'Uploaded',
  uploading: 'Uploading',
  removing: 'Removing',
  failed: 'Needs retry',
  missing: 'Not added',
}

function StatusPill({ tone }: { tone: StatusTone }) {
  const Icon =
    tone === 'verified'
      ? ShieldCheck
      : tone === 'uploaded'
        ? CheckCircle2
        : tone === 'uploading' || tone === 'removing'
          ? Loader2
          : tone === 'failed'
            ? AlertCircle
            : FileText

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
        STATUS_STYLES[tone],
      )}
    >
      <Icon
        className={cn(
          'h-3.5 w-3.5',
          (tone === 'uploading' || tone === 'removing') && 'animate-spin',
        )}
        aria-hidden="true"
      />
      {STATUS_LABELS[tone]}
    </span>
  )
}

function toneFor(
  requirement: RequiredDocumentRequirement,
  state: RequiredDocumentUploadState | undefined,
): StatusTone {
  if (state?.status === 'uploading') return 'uploading'
  if (state?.status === 'removing') return 'removing'
  if (state?.status === 'failed') return 'failed'
  if (state?.status === 'replacing') return 'missing'
  if (requirement.state === 'verified') return 'verified'
  if (requirement.state === 'uploaded' || state?.status === 'uploaded') return 'uploaded'
  return 'missing'
}

function RequirementRow({
  requirement,
  state,
  onSelectFile,
  onRetry,
  onLocalError,
  onBeginReplace,
  onCancelReplace,
  onRemove,
}: {
  requirement: RequiredDocumentRequirement
  state: RequiredDocumentUploadState | undefined
  onSelectFile: (documentType: string, file: File | null) => void
  onRetry: (documentType: string) => void
  onLocalError: (documentType: string, message: string, code?: string) => void
  onBeginReplace: (documentType: string) => void
  onCancelReplace: (documentType: string) => void
  onRemove?: (documentType: string) => void
}) {
  const tone = toneFor(requirement, state)
  const hasPersistedEvidence = requirement.state !== 'missing'
  const isReplacing = state?.status === 'replacing'
  const isRemoving = state?.status === 'removing'
  // A *remove* that failed leaves the server record intact, so the stored
  // summary must stay on screen: hiding it would show the student a removal that
  // never happened, which is the STU-19 defect in the other direction.
  const removeFailed = state?.status === 'failed' && state.failedCommand === 'remove'
  // The stored summary is the *persisted* state. It shows as soon as the upload
  // command succeeded — even before the contract re-read lands — because the
  // evidence is on the server at that point, not on the device.
  const showStoredSummary =
    (hasPersistedEvidence || state?.status === 'uploaded') &&
    !isReplacing &&
    state?.status !== 'uploading' &&
    (state?.status !== 'failed' || removeFailed)
  const documentName = requirement.document?.documentName ?? state?.file?.name
  const documentSize = requirement.document?.fileSize ?? state?.file?.size
  const storedVersion = requirement.document?.version ?? null
  // Prior versions the server preserved. Published by the contract, so this line
  // is evidence that a replace changed the server record rather than the view.
  const preservedVersions = requirement.history.length
  const canRemove = Boolean(onRemove) && Boolean(requirement.document?.id)

  return (
    <div className="flex h-full flex-col gap-3 border-t border-border/60 pt-4 first:border-t-0 first:pt-0 md:border-t-0 md:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-foreground">
            {requirement.label}
            {!requirement.required && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">(optional)</span>
            )}
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {requirement.description ? `${requirement.description} ` : ''}
            {constraintHint(requirement)}.
          </p>
        </div>
        <StatusPill tone={tone} />
      </div>

      {showStoredSummary ? (
        <div className="flex flex-1 flex-col gap-2 rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-success">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-medium">
                {requirement.state === 'verified' ? 'Verified by the admissions team' : 'Saved'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {documentName ?? 'Uploaded document'}
                {documentSize ? ` · ${formatConstraintSize(documentSize)}` : ''}
              </p>
              {/*
                The stored version and the count of preserved earlier versions.
                Both come from the server contract, so a student who replaces a
                file can see that the record itself moved on and the previous
                upload is still on file (R11.7-R11.8).
              */}
              {(storedVersion !== null || preservedVersions > 0) && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {storedVersion !== null ? `Version ${storedVersion}` : null}
                  {storedVersion !== null && preservedVersions > 0 ? ' · ' : null}
                  {preservedVersions > 0
                    ? `${preservedVersions} earlier ${
                        preservedVersions === 1 ? 'version' : 'versions'
                      } kept`
                    : null}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isRemoving}
              onClick={() => onBeginReplace(requirement.documentType)}
              className="min-h-touch"
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Replace file
            </Button>
            {canRemove && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isRemoving}
                onClick={() => onRemove?.(requirement.documentType)}
                className="min-h-touch text-muted-foreground"
              >
                {isRemoving ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                )}
                {isRemoving ? 'Removing…' : 'Remove'}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2">
          <FileUpload
            label={`Upload ${requirement.label}`}
            accept={acceptAttribute(requirement)}
            maxSize={requirement.maxSizeBytes}
            value={state?.file ?? null}
            uploading={state?.status === 'uploading'}
            progress={state?.progress}
            error={state?.status === 'failed' ? (state.error ?? undefined) : undefined}
            onChange={(files) =>
              onSelectFile(
                requirement.documentType,
                (Array.isArray(files) ? files[0] : files) ?? null,
              )
            }
            onError={(message, rejection) => {
              // The drop zone enforces `accept`/`maxSize` before our validator
              // sees the file, so translate its refusal into the requirement's
              // own words rather than showing a second wording of the same
              // rejection.
              const translated = rejectionForDropzoneCode(
                requirement,
                rejection?.code,
                rejection?.file,
              )
              onLocalError(
                requirement.documentType,
                translated?.message ?? message,
                translated?.code,
              )
            }}
            onRetry={
              state?.status === 'failed' && state.retryable && state.file
                ? () => onRetry(requirement.documentType)
                : undefined
            }
          />
          {isReplacing && hasPersistedEvidence && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onCancelReplace(requirement.documentType)}
              className="min-h-touch self-start"
            >
              Keep the file already uploaded
            </Button>
          )}
          {/*
            A requirement with no current evidence can still have preserved
            versions — after a removal, or while a replacement is being chosen.
            Saying so is what tells the student the earlier upload was kept
            rather than destroyed (R11.8).
          */}
          {preservedVersions > 0 && (
            <p className="text-xs text-muted-foreground">
              {preservedVersions} earlier {preservedVersions === 1 ? 'version' : 'versions'} kept on
              file.
            </p>
          )}
        </div>
      )}

      {/*
        No per-row error paragraph here: on failure the control below always
        renders the same message inline, and the summary above lists it. A third
        copy only made a screen reader announce one rejection three times.
      */}
    </div>
  )
}

export function RequiredDocumentsPanel({
  requirements,
  uploadStates,
  loading = false,
  contractError = null,
  contractErrorRetryable = false,
  onReload,
  onSelectFile,
  onRetry,
  onLocalError,
  onBeginReplace,
  onCancelReplace,
  onRemove,
  className,
}: RequiredDocumentsPanelProps) {
  const summaryRef = useRef<HTMLDivElement>(null)

  const failures = useMemo(
    () =>
      requirements
        .map((requirement) => ({
          requirement,
          state: uploadStates[requirement.documentType],
        }))
        .filter((entry) => entry.state?.status === 'failed' && entry.state.error),
    [requirements, uploadStates],
  )

  const failureSignature = failures
    .map((entry) => `${entry.requirement.documentType}:${entry.state?.errorCode ?? ''}`)
    .join('|')

  // Move focus to the summary when a new upload failure appears, so a
  // screen-reader or keyboard user lands on the actionable message instead of
  // having to hunt for the field that failed (design §13.3).
  useEffect(() => {
    if (failureSignature && summaryRef.current) {
      summaryRef.current.focus()
    }
  }, [failureSignature])

  // Polite announcements of upload outcomes ("<Label> uploaded" / "<Label> did not
  // upload: <message>"), derived from state transitions so a re-render never
  // repeats a message.
  const previousStatuses = useRef<Record<string, string | undefined>>({})
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    let next: string | null = null
    for (const requirement of requirements) {
      const state = uploadStates[requirement.documentType]
      const status = state?.status
      const before = previousStatuses.current[requirement.documentType]
      if (status !== before) {
        if (status === 'uploaded') {
          next = `${requirement.label} uploaded`
        } else if (status === 'failed' && state?.failedCommand === 'upload' && state.error) {
          next = `${requirement.label} did not upload: ${state.error}`
        }
        previousStatuses.current[requirement.documentType] = status
      }
    }
    if (next) setAnnouncement(next)
  }, [requirements, uploadStates])

  if (loading) {
    return (
      <div className={cn('space-y-3', className)} aria-busy="true">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading the documents this application needs…
        </p>
      </div>
    )
  }

  if (contractError) {
    // Fail-closed surface (R11.6): render no upload controls rather than an
    // unverified "nothing is required" list.
    return (
      <div
        className={cn(
          'flex flex-col gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4',
          className,
        )}
        role="alert"
      >
        <div className="flex items-start gap-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-sm text-destructive">{contractError}</p>
        </div>
        {contractErrorRetryable && onReload && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReload}
            className="min-h-touch self-start"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </Button>
        )}
      </div>
    )
  }

  if (requirements.length === 0) {
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        No documents are required for this application.
      </p>
    )
  }

  return (
    <div className={cn('space-y-4', className)} data-testid="required-documents-panel">
      <p className="sr-only" role="status" aria-live="polite" data-testid="upload-announcer">
        {announcement}
      </p>
      {failures.length > 0 && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {failures.length === 1
              ? '1 document needs your attention'
              : `${failures.length} documents need your attention`}
          </p>
          <ul className="mt-1.5 space-y-1 pl-6 text-xs text-destructive">
            {failures.map((entry) => (
              <li key={entry.requirement.documentType}>
                <span className="font-medium">{entry.requirement.label}:</span>{' '}
                {entry.state?.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        {requirements.map((requirement) => (
          <RequirementRow
            key={requirement.documentType}
            requirement={requirement}
            state={uploadStates[requirement.documentType]}
            onSelectFile={onSelectFile}
            onRetry={onRetry}
            onLocalError={onLocalError}
            onBeginReplace={onBeginReplace}
            onCancelReplace={onCancelReplace}
            onRemove={onRemove}
          />
        ))}
      </div>
    </div>
  )
}

export default RequiredDocumentsPanel
