/**
 * One draft picker (task 11.2, R16.1/R16.6, findings STU-03 / STU-12).
 *
 * ── What it replaces ────────────────────────────────────────────────────────
 *
 * The wizard had **two** draft pickers with two different mental models:
 *
 * 1. a full-page "Choose an application" screen, shown only on a bare visit, which
 *    offered *continue* and *delete* but not *rename*; and
 * 2. a floating `Drafts (n)` button pinned at `top-20 right-4` — over the mobile
 *    header's own profile / notifications / logout controls — opening a
 *    right-hand drawer that offered *continue*, *rename* and *delete*.
 *
 * STU-03 names the floating one directly ("a floating draft manager and wizard
 * footer compete with global bottom navigation"). Deleting it alone would have lost
 * the rename affordance task 6.2 built, and R16.1 is explicit that a compact layout
 * may not lose commands — so this component is the union of the two: **continue**,
 * **rename** and **delete**, in one list, reachable from the choice screen and from
 * inside the wizard, with no anchored surface of its own.
 *
 * ── Where it is used, and where it deliberately is not ─────────────────────
 *
 * It renders on the **draft-choice screen**, where no wizard form is mounted. It is
 * deliberately *not* embedded inside the wizard itself: `useMultiDraft` re-lists the
 * student's drafts on every draft-store revision, and a second reader of draft state
 * next to the one state machine that owns it is exactly what R10.2 forbids. The
 * browser characterisation caught the consequence — a manual save returning the
 * profile's town instead of the student's — so the wizard links here instead
 * (see `index.tsx`'s "Switch application", and `docs/v2-evidence/11.2/README.md` §6).
 *
 * Every command is an existing one. `useMultiDraft` owns list / rename (task 6.2's
 * validated `draft_name` field), and its delete delegates to task 11.1's
 * `deleteStudentDraft` — one user, one application, task 6.3's addressed local
 * cleanup, the platform's payment-linked refusal surfaced as protection. Deletion
 * confirms through the product `ConfirmAlertDialog`, which names *which* draft is
 * going and says the others survive; `window.confirm` cannot do either (R16.6).
 */
import { useState } from 'react'
import { Clock, FilePlus2, Pencil, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { ConfirmAlertDialog } from '@/components/ui/alert-dialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'
import { toast } from '@/hooks/useToast'
import { formatTimestamp } from '@/lib/dateFormat'

import { useMultiDraft } from '../hooks/useMultiDraft'
import type { Application } from '@/types/database'

export interface WizardDraftPickerProps {
  userId: string | undefined
  /** The draft currently open in the wizard, so it is labelled rather than offered. */
  currentDraftId?: string | null
  onContinueDraft: (draft: Application, draftId: string) => void
  onStartNew: () => void
  /** How many drafts to list before the list becomes noise. */
  limit?: number
}

export function WizardDraftPicker({
  userId,
  currentDraftId,
  onContinueDraft,
  onStartNew,
  limit = 5,
}: WizardDraftPickerProps) {
  const { drafts, loading, error, renameDraft, deleteDraft, loadDraft } = useMultiDraft(userId)
  const confirmDialog = useConfirmDialog()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const handleContinue = async (draftId: string) => {
    setBusyId(draftId)
    try {
      const data = await loadDraft(draftId)
      if (data) onContinueDraft(data, draftId)
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (draftId: string, draftName: string) => {
    const confirmed = await confirmDialog.confirm({
      title: 'Delete this draft?',
      message: `"${draftName}" and everything saved in it will be permanently deleted. Your other drafts are not affected.`,
      confirmText: 'Delete draft',
      cancelText: 'Keep draft',
      variant: 'danger',
    })
    if (!confirmed) return

    setBusyId(draftId)
    try {
      const result = await deleteDraft(draftId)
      if (result.success) {
        toast.success('Draft deleted', `"${draftName}" was removed.`)
      } else if (result.code === 'DRAFT_HAS_PAYMENT_ACTIVITY') {
        // A draft with money against it is protected, not broken (task 11.1).
        toast.warning('Draft protected', result.error ?? '')
      } else {
        toast.error('Delete failed', result.error ?? 'Please try again.')
      }
    } finally {
      setBusyId(null)
    }
  }

  const handleRename = async (draftId: string) => {
    const trimmed = renameValue.trim()
    if (!trimmed) return
    setBusyId(draftId)
    try {
      // `renameDraft` surfaces its own failure through `error` below (task 6.2).
      await renameDraft(draftId, trimmed)
      setRenamingId(null)
      setRenameValue('')
    } finally {
      setBusyId(null)
    }
  }

  const visible = drafts.slice(0, limit)

  return (
    <div data-testid="wizard-draft-picker" className="space-y-3">
      {error && <ErrorDisplay message={error} />}

      {loading && drafts.length === 0 ? (
        <p className="text-base sm:text-sm text-muted-foreground">Loading your saved applications…</p>
      ) : visible.length === 0 ? (
        <p className="text-base sm:text-sm text-muted-foreground">
          You have no saved applications yet. Starting a new one will save as you go.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map(draft => {
            const isCurrent = draft.id === currentDraftId
            const busy = busyId === draft.id
            return (
              <li
                key={draft.id}
                data-testid="wizard-draft-row"
                className="rounded-lg border border-border bg-card p-4"
              >
                {renamingId === draft.id ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={event => setRenameValue(event.target.value)}
                      aria-label={`New name for ${draft.draft_name}`}
                      autoFocus
                      className="min-h-touch flex-1 rounded-lg border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onKeyDown={event => {
                        if (event.key === 'Enter') void handleRename(draft.id)
                        if (event.key === 'Escape') setRenamingId(null)
                      }}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        className="min-h-touch"
                        loading={busy}
                        onClick={() => {
                          void handleRename(draft.id)
                        }}
                      >
                        Save name
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-h-touch"
                        onClick={() => setRenamingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="break-words text-base font-semibold text-foreground">
                      {draft.draft_name}
                    </p>
                    {draft.updated_at && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Last saved {formatTimestamp(draft.updated_at)}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {isCurrent ? (
                        <span
                          className="inline-flex min-h-touch items-center rounded-lg border border-primary/30 bg-primary/5 px-3 text-base sm:text-sm font-semibold text-primary"
                          data-testid="wizard-draft-current"
                        >
                          Open now
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="primary"
                          className="min-h-touch"
                          loading={busy}
                          disabled={busy}
                          aria-label={`Continue draft ${draft.draft_name}`}
                          onClick={() => {
                            void handleContinue(draft.id)
                          }}
                        >
                          Continue draft
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-touch"
                        aria-label={`Rename draft ${draft.draft_name}`}
                        onClick={() => {
                          setRenamingId(draft.id)
                          setRenameValue(draft.draft_name)
                        }}
                      >
                        <Pencil className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                        <span className="hidden sm:inline">Rename</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-touch text-destructive hover:bg-destructive/5"
                        loading={busy}
                        disabled={busy}
                        aria-label={`Delete draft ${draft.draft_name}`}
                        onClick={() => {
                          void handleDelete(draft.id, draft.draft_name)
                        }}
                      >
                        <Trash2 className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                        <span className="hidden sm:inline">Delete</span>
                      </Button>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Button
        type="button"
        variant={visible.length === 0 ? 'primary' : 'outline'}
        className="min-h-touch w-full sm:w-auto"
        onClick={onStartNew}
      >
        <FilePlus2 className="h-4 w-4 mr-2" aria-hidden="true" />
        Start a new application
      </Button>
      <p className="text-xs text-muted-foreground">
        A new application does not restore or change any saved draft. Drafts with payment activity
        cannot be deleted here. Continue the draft or contact admissions.
      </p>

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
    </div>
  )
}
