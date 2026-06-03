import type { ReactNode } from 'react'

/**
 * jobs-ops renders standalone. Its read endpoints are public scaffold routes
 * (AllowAny on the backend) and write actions stay backend-policy-gated, so the
 * dashboard UI must always render — it must never hard-redirect to the
 * admissions sign-in page. Auth state still drives in-app affordances via
 * useAuth(); this wrapper just stops gating the whole shell.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  return <>{children}</>
}
