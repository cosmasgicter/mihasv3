import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'

/**
 * Protects unsaved form changes from accidental navigation.
 *
 * - Registers a `beforeunload` handler when `isDirty` is true (browser tab close/refresh).
 * - Uses React Router v6's `useBlocker` to intercept in-app navigation when `isDirty` is true.
 *
 * Returns the blocker state so the consumer can render a confirmation dialog.
 *
 * @example
 * ```tsx
 * const { blocker } = useUnsavedChanges(form.formState.isDirty)
 *
 * return (
 *   <>
 *     <form>...</form>
 *     <UnsavedChangesDialog blocker={blocker} />
 *   </>
 * )
 * ```
 */
export function useUnsavedChanges(isDirty: boolean) {
  // Browser tab close / refresh protection
  useEffect(() => {
    if (!isDirty) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  // React Router in-app navigation blocking
  const blocker = useBlocker(isDirty)

  return { blocker }
}
