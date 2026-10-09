/**
 * Reviewer assignment (AUTH-03) — extracted from `ApplicationDetailModal.tsx` by
 * admissions-v2 task **12.1** (MAINT-01), verbatim.
 *
 * A self-contained control: it owns its popover state, its candidate search, and
 * it issues the assignment as a versioned command through the applications domain
 * service. Nothing about it changed; it stopped being 163 lines inside a
 * 1,443-line file.
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2, Search, Shield, X } from 'lucide-react'

import { useToastStore } from '@/hooks/useToast'
import { logApiError } from '@/lib/apiErrorLogger'
import { toError } from '@/lib/toError'
import { applicationService, type ReviewerCandidate } from '@/services/applications'
import { reviewWorkspaceService } from '@/services/admin/reviewWorkspace'


export function AssignReviewerControl({
  applicationId,
  expectedVersion,
  onAssigned,
}: {
  applicationId: string
  expectedVersion: number
  onAssigned: () => void
}) {
  const [open, setOpen] = useState(false)
  const [candidates, setCandidates] = useState<ReviewerCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { success: showSuccess, error: showError } = useToastStore()

  const loadCandidates = useCallback(
    async (term: string) => {
      setLoading(true)
      setError(null)
      try {
        setCandidates(await applicationService.getAssignmentCandidates(applicationId, term))
      } catch (err) {
        logApiError(
          'admin-assignment-candidates',
          `/applications/${applicationId}/assignment-candidates/`,
          err,
        )
        setError(toError(err).message || 'Unable to load reviewer candidates.')
        setCandidates([])
      } finally {
        setLoading(false)
      }
    },
    [applicationId],
  )

  // Load on open and whenever the (debounced) search term changes. AUTH-03: the
  // reviewer id posted to /assign/ is always a real, tenant-eligible candidate id
  // chosen here — never an empty string.
  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => {
      void loadCandidates(search)
    }, 250)
    return () => clearTimeout(timer)
  }, [open, search, loadCandidates])

  const handleAssign = async (candidate: ReviewerCandidate) => {
    setAssigningId(candidate.id)
    try {
      await reviewWorkspaceService.assignReviewer(applicationId, {
        reviewer_id: candidate.id,
        expected_version: expectedVersion,
      })
      showSuccess('Reviewer assigned', `${candidate.full_name} has been assigned to this application.`)
      setOpen(false)
      onAssigned()
    } catch (err) {
      showError('Assignment failed', toError(err).message || 'Unable to assign reviewer.')
    } finally {
      setAssigningId(null)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="assign-reviewer-open"
        className="inline-flex min-h-touch items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Shield className="h-3.5 w-3.5" aria-hidden="true" />
        Assign Reviewer
      </button>
    )
  }

  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Assign a reviewer</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Cancel reviewer assignment"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="relative mb-2">
        <Search
          className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <label htmlFor="reviewer-candidate-search" className="sr-only">
          Search reviewers by name or email
        </label>
        <input
          id="reviewer-candidate-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reviewers..."
          className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs text-foreground focus:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div className="max-h-56 overflow-y-auto" role="listbox" aria-label="Eligible reviewers">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Loading reviewers...
          </div>
        ) : error ? (
          <p className="py-3 text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : candidates.length === 0 ? (
          <p className="py-3 text-xs text-muted-foreground">
            No eligible reviewers found for this institution.
          </p>
        ) : (
          <ul className="space-y-1">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  disabled={assigningId !== null}
                  onClick={() => {
                    void handleAssign(candidate)
                  }}
                  className="flex min-h-touch w-full items-center justify-between gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs text-foreground transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">
                      {candidate.full_name}
                    </span>
                    <span className="block truncate text-muted-foreground">{candidate.email}</span>
                  </span>
                  {assigningId === candidate.id ? (
                    <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin" aria-hidden="true" />
                  ) : (
                    <Shield className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

