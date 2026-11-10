/**
 * The wizard's **one** mobile bottom action surface (task 11.2, R16.3).
 *
 * Requirements: **R16.3** ("THE wizard SHALL render one mobile bottom action
 * surface. The global bottom navigation SHALL not overlap, obscure, or compete
 * with wizard controls"), **R16.2** (44 px targets, visible focus),
 * **R10.7** (autosave exposes saving / saved / offline without blocking typing).
 * Findings: **STU-03** ("a floating draft manager and wizard footer compete with
 * global bottom navigation").
 *
 * ── What "one surface" means here ───────────────────────────────────────────
 *
 * Before this, a student on a phone could have **four** things anchored to the
 * edges of the viewport at once: the wizard's own sticky footer, the global bottom
 * navigation bar, a floating `Drafts (n)` button pinned at `top-20 right-4` (over
 * the mobile header's own controls), and a floating keyboard-shortcuts button. The
 * suppression of the global bar is the shell's job (`AppLayout` already drops it on
 * the wizard route, and `wizardShellSuppression.test.tsx` now pins that so it
 * cannot regress); dropping the two floating buttons is this component's, by being
 * the only anchored surface the wizard renders.
 *
 * Safe area: the bar's bottom padding is `env(safe-area-inset-bottom)`, so the
 * primary control clears a home indicator instead of sitting under it. It is
 * additive to the normal padding, which is why it is written as a `calc` rather
 * than replacing it — on a device with no inset the value is `0px` and the bar is
 * unchanged.
 *
 * Keyboard: when the on-screen keyboard is open the bar stops being sticky. A
 * sticky bar plus a shrunken visual viewport is how a mobile keyboard ends up
 * covering the field being typed into; released, the bar scrolls with the form and
 * the field stays visible.
 *
 * The autosave state lives here rather than in a second strip because the bar is
 * the surface the student is already looking at when they press Continue, and
 * because R16.3's "one surface" is about *state* as much as controls. It is
 * announced politely and never blocks: a failed save shows its reason and the
 * Continue control keeps working.
 *
 * The state is the draft machine's (task 6.3, R10.7): saving, saved, saved on
 * this device, offline, retrying and conflict each have words and an icon, never
 * colour alone. A conflict offers the two resolutions design §8.2 names — reload
 * the newer version, or explicitly keep the student's own changes on top of it.
 */
import { ArrowLeft, ArrowRight, HardDrive, RefreshCw, Save, Send, WifiOff } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { AutoSaveIndicator } from '@/components/ui/AutoSaveIndicator'
import { cn } from '@/lib/utils'
import type { WizardDraftSaveStatus } from '@/lib/wizardDraftController'

import { previousButtonLabel, saveNowLabel } from '../steps/config'

export interface WizardActionBarProps {
  /** Label of the previous step, for the back control's accessible name. */
  previousStepTitle: string | null
  /** Label of the next step, for the forward control's accessible name. */
  nextStepTitle: string | null
  isLastStep: boolean
  loading: boolean
  /** True when the forward control must refuse (an unmet step gate). */
  nextDisabled: boolean
  /** True when the submit control must refuse (readiness not met). */
  submitDisabled: boolean
  nextLabel: string
  onPrev: () => void
  onNext: () => void
  /** Manual save (R10.2). Always available, never the only way work is kept. */
  onSaveNow: () => void
  /** Reload the authoritative server draft after an optimistic conflict. */
  onReloadConflict?: () => void
  /** Explicit merge: keep the student's changes on top of the newer version. */
  onKeepConflictChanges?: () => void
  saveStatus: WizardDraftSaveStatus
  saveError?: string | null
  lastSavedAt: number | null
  isOnline: boolean
  /** True while the on-screen keyboard is open: the bar releases its sticky position. */
  keyboardOpen: boolean
}

export function WizardActionBar({
  previousStepTitle,
  nextStepTitle,
  isLastStep,
  loading,
  nextDisabled,
  submitDisabled,
  nextLabel,
  onPrev,
  onNext,
  onSaveNow,
  onReloadConflict,
  onKeepConflictChanges,
  saveStatus,
  saveError,
  lastSavedAt,
  isOnline,
  keyboardOpen,
}: WizardActionBarProps) {
  const indicatorStatus: 'idle' | 'saving' | 'saved' | 'error' =
    saveStatus === 'conflict' || saveStatus === 'error'
      ? 'error'
      : saveStatus === 'saving' || saveStatus === 'saved'
        ? saveStatus
        : 'idle'
  const showOfflineBadge = !isOnline || saveStatus === 'offline'
  const alertMessage = (saveStatus === 'error' || saveStatus === 'conflict') && saveError
  const politeMessage =
    (saveStatus === 'retrying' || saveStatus === 'offline' || saveStatus === 'saved-local') && saveError

  return (
    <div
      data-testid="wizard-action-bar"
      className={cn(
        'z-30 -mx-4 border-t border-border bg-card px-4 pt-3',
        'pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]',
        keyboardOpen ? 'relative' : 'sticky bottom-0',
        'sm:mx-0 sm:rounded-lg sm:border sm:px-4 sm:py-4',
      )}
    >
      {/* Draft state: polite, never modal, never in the way of the controls. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          {showOfflineBadge && (
            <span data-text-role="caption"
              className="inline-flex items-center gap-1.5 text-sm sm:text-xs font-medium text-warning"
              data-testid="wizard-offline-badge"
            >
              <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Offline: saved on this device
            </span>
          )}
          {!showOfflineBadge && saveStatus === 'retrying' && (
            <span
              className="inline-flex min-h-[24px] items-center gap-1.5 text-base sm:text-sm text-warning"
              data-testid="wizard-save-retrying"
              role="status"
              aria-live="polite"
            >
              <RefreshCw
                className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Retrying save…
            </span>
          )}
          {!showOfflineBadge && saveStatus === 'saved-local' && (
            <span
              className="inline-flex min-h-[24px] items-center gap-1.5 text-base sm:text-sm text-muted-foreground"
              data-testid="wizard-save-local"
              role="status"
              aria-live="polite"
            >
              <HardDrive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Saved on this device
            </span>
          )}
          {!showOfflineBadge && saveStatus !== 'retrying' && saveStatus !== 'saved-local' && (
            <AutoSaveIndicator
              status={indicatorStatus}
              lastSavedAt={lastSavedAt}
              className="min-h-[24px]"
            />
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSaveNow}
          disabled={saveStatus === 'saving' || saveStatus === 'conflict'}
          aria-label={saveNowLabel}
          className="min-h-touch min-w-touch shrink-0"
        >
          <Save className="h-4 w-4 sm:mr-2" aria-hidden="true" />
          <span className="hidden sm:inline">{saveNowLabel}</span>
        </Button>
      </div>

      {alertMessage && (
        <div className="mb-2 flex flex-wrap items-center gap-2" role="alert">
          <p className="min-w-0 flex-1 break-words text-base sm:text-sm font-medium text-destructive">
            {saveError}
          </p>
          {saveStatus === 'conflict' && onReloadConflict && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onReloadConflict}
              className="min-h-touch"
            >
              Reload latest draft
            </Button>
          )}
          {saveStatus === 'conflict' && onKeepConflictChanges && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onKeepConflictChanges}
              className="min-h-touch"
            >
              Keep my changes
            </Button>
          )}
        </div>
      )}

      {politeMessage && (
        <p
          className="mb-2 min-w-0 break-words text-base sm:text-sm text-muted-foreground"
          data-testid="wizard-save-detail"
        >
          {saveError}
        </p>
      )}

      {/*
        `flex-wrap` and `whitespace-normal` are the 200%-text fix, added because the
        browser run measured the primary control extending 36 px past the bar at a
        32 px root font: clipped text is the failure R16.8 names, wrapped text is not.
      */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          {previousStepTitle && (
            <Button
              type="button"
              variant="outline"
              onClick={onPrev}
              disabled={loading}
              className="min-h-touch"
              aria-label={`Go back to ${previousStepTitle}`}
            >
              <ArrowLeft className="h-4 w-4 sm:mr-2" aria-hidden="true" />
              <span className="hidden sm:inline">{previousButtonLabel}</span>
            </Button>
          )}
        </div>

        <div className="min-w-0">
          {isLastStep ? (
            <Button
              type="submit"
              variant="success"
              loading={loading}
              disabled={loading || submitDisabled}
              className="min-h-touch max-w-full whitespace-normal text-left"
            >
              {loading ? (
                'Submitting…'
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" aria-hidden="true" />
                  Submit application
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              onClick={onNext}
              loading={loading}
              disabled={loading || nextDisabled}
              className="min-h-touch max-w-full whitespace-normal text-left"
              aria-label={`Continue to ${nextStepTitle ?? 'next step'}`}
            >
              {loading ? (
                nextLabel
              ) : (
                <>
                  <span>{nextLabel}</span>
                  <ArrowRight className="h-4 w-4 ml-2" aria-hidden="true" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
