import type { Blocker } from 'react-router-dom'

interface UnsavedChangesDialogProps {
  blocker: Blocker
}

/**
 * Confirmation dialog shown when the user attempts to navigate away
 * from a page with unsaved changes.
 *
 * Renders only when the React Router blocker is in the "blocked" state.
 * Offers "Stay" (cancel navigation) and "Leave" (proceed) options.
 */
export function UnsavedChangesDialog({ blocker }: UnsavedChangesDialogProps) {
  if (blocker.state !== 'blocked') return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-changes-title"
    >
      <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6 shadow-xl">
        <h2
          id="unsaved-changes-title"
          className="text-lg font-semibold text-zinc-100"
        >
          Unsaved changes
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          You have unsaved changes that will be lost if you leave this page. Are
          you sure you want to leave?
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => blocker.reset?.()}
            className="min-h-touch rounded-md border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
          >
            Stay
          </button>
          <button
            type="button"
            onClick={() => blocker.proceed?.()}
            className="min-h-touch rounded-md bg-danger px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-danger/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  )
}
