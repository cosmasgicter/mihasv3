/**
 * Scoped draft management on the dashboard (admissions-v2 task 11.1).
 *
 * Requirements: R10.10, R13.1, R16.1, R16.5, R16.6. Findings: STU-04, STU-12.
 *
 * One row per draft, each addressed by its own application id: continue it, or
 * delete it. That is the whole card, and it is what "move destructive draft
 * cleanup into scoped draft management" means — the destructive control is no
 * longer a global wipe sitting beside the primary action, it is a per-draft
 * command inside the surface that manages drafts.
 *
 * What it replaces on the dashboard: `ContinueApplication`, whose "Delete" called
 * `draftManager.clearAllDrafts(userId)`. A student with two drafts who wanted to
 * abandon one lost both, plus every draft key in `localStorage`. The card also
 * carried a four-row metric table (progress, last saved, expires in), a Refresh
 * button beside the page's own Refresh, and an expiry countdown recomputed from
 * the browser clock every minute.
 *
 * Deletion goes through `deleteStudentDraft` — one user, one application, task
 * 6.3's `clearWizardDraftCache` — and confirms through the product alert dialog.
 * Never `window.confirm` (R16.6).
 */
import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { FilePlus2, FileText, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { SectionCard } from '@/components/ui/SectionCard'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { toast } from '@/hooks/useToast'
import { formatDate } from '@/lib/utils'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { deleteStudentDraft } from '@/lib/studentDraftCleanup'
import {
  studentApplicationLocalResumePath,
  studentApplicationNewPath,
  studentApplicationResumePath,
} from '@/routes/routeRegistry'
import type { Application } from '@/types/database'

export interface DraftManagementCardProps {
  /** The student's own `Application(status='draft')` rows, newest first. */
  drafts: Application[]
  /**
   * True when a local wizard snapshot exists with no server draft behind it yet.
   * It is offered as a resumable draft, and it is deliberately **not** deletable
   * here: there is no application id to address, so the only honest scoped
   * command is to open it.
   */
  hasLocalOnlyDraft: boolean
  userId: string | null | undefined
  /** Called after a successful deletion so the page re-reads the server. */
  onDeleted: (applicationId: string) => void
}

export function DraftManagementCard({
  drafts,
  hasLocalOnlyDraft,
  userId,
  onDeleted,
}: DraftManagementCardProps) {
  const confirmDialog = useConfirmDialog()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = useCallback(
    async (draft: Application) => {
      const label = draftLabel(draft)
      const confirmed = await confirmDialog.confirm({
        title: 'Delete this draft?',
        message: `"${label}" and everything saved in it will be permanently deleted. Your other drafts are not affected.`,
        confirmText: 'Delete draft',
        cancelText: 'Keep draft',
        variant: 'danger',
      })
      if (!confirmed) return

      setDeletingId(draft.id)
      try {
        const result = await deleteStudentDraft({ userId, applicationId: draft.id })
        if (result.success) {
          toast.success('Draft deleted', `"${label}" was removed.`)
          onDeleted(draft.id)
          return
        }
        if (result.code === 'DRAFT_HAS_PAYMENT_ACTIVITY') {
          toast.warning('Draft protected', result.error ?? '')
          return
        }
        toast.error('Delete failed', result.error ?? 'Please try again.')
      } finally {
        setDeletingId(null)
      }
    },
    [confirmDialog, onDeleted, userId],
  )

  if (drafts.length === 0 && !hasLocalOnlyDraft) return null

  return (
    <SectionCard
      title={drafts.length > 1 ? `Your drafts (${drafts.length})` : 'Your draft'}
      icon={<FileText className="h-5 w-5" />}
      padding="sm"
      data-testid="draft-management"
      actions={
        <Button asChild variant="outline" size="sm" className="min-h-touch">
          <Link to={studentApplicationNewPath()}>
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            Start another
          </Link>
        </Button>
      }
    >
      <ul className="divide-y divide-border/45">
        {drafts.map((draft) => (
          <li
            key={draft.id}
            data-testid="draft-row"
            className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="break-words text-base sm:text-sm font-semibold text-foreground">
                {draftLabel(draft)}
              </p>
              {/*
                Only when the platform recorded one. `applications.created_at` /
                `updated_at` are nullable with no database default, so a freshly
                created draft can carry neither — the browser run that found this
                rendered "Saved Not available", which is worse than saying nothing
                (MAINT-02). The missing default is a schema-truth question for
                Phase 3 (R15.2), not something to paper over with a browser clock.
              */}
              {savedAt(draft) && (
                <p className="mt-0.5 text-base sm:text-sm text-muted-foreground">
                  Saved {formatDate(savedAt(draft))}
                </p>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <Button asChild variant="primary" size="sm" className="min-h-touch">
                <Link to={studentApplicationResumePath(draft.id)}>Continue</Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDelete(draft)}
                disabled={deletingId === draft.id}
                loading={deletingId === draft.id}
                aria-label={`Delete draft ${draftLabel(draft)}`}
                className="min-h-touch min-w-touch text-destructive hover:bg-destructive/5"
              >
                {deletingId !== draft.id && <Trash2 className="h-4 w-4" aria-hidden="true" />}
                <span className="sr-only sm:not-sr-only">Delete</span>
              </Button>
            </div>
          </li>
        ))}

        {hasLocalOnlyDraft && (
          <li
            data-testid="draft-row-local"
            className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-base sm:text-sm font-semibold text-foreground">Unsaved application</p>
              <p className="mt-0.5 text-base sm:text-sm text-muted-foreground">
                Saved on this device only. Continue it to save it to your account.
              </p>
            </div>
            <Button asChild variant="primary" size="sm" className="min-h-touch">
              <Link to={studentApplicationLocalResumePath()}>Continue</Link>
            </Button>
          </li>
        )}
      </ul>

      <ConfirmAlertDialog
        isOpen={confirmDialog.isOpen}
        onClose={confirmDialog.handleCancel}
        onConfirm={confirmDialog.handleConfirm}
        title={confirmDialog.options.title}
        message={confirmDialog.options.message}
        confirmText={confirmDialog.options.confirmText}
        cancelText={confirmDialog.options.cancelText}
        variant={confirmDialog.options.variant}
      />
    </SectionCard>
  )
}

/** The last time the platform recorded a change, or `null` if it recorded none. */
function savedAt(draft: Application): string | null {
  return draft.updated_at || draft.created_at || null
}

/** The draft's own name, then its programme, then a neutral fallback. */
function draftLabel(draft: Application): string {
  return (
    sanitizeForDisplay(draft.draft_name) ||
    sanitizeForDisplay(draft.program) ||
    'Untitled application'
  )
}
