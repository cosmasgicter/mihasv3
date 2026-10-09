/**
 * Directory statistics from the server's whole-set aggregates (task 9.3).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 9.3.
 * Requirement: **R6.1** · Finding: **ADM-03**.
 *
 * What this replaces: the component took a `users: UserProfile[]` prop — the
 * rows the page had loaded — and computed "New This Month" with
 * `users.filter(...)`, "Recent Users" with a `sort`, and a role distribution
 * from a separate `getUserStats()` call that itself re-fetched one page. So the
 * headline said "Total Users" while the percentages described twenty rows, and
 * the two numbers were computed from different data.
 *
 * Now every number arrives from `data.aggregates` with its own definition, and
 * the component renders nothing it cannot label. A count the server did not
 * send is rendered as **Unknown**, never as `0` — the distinction 9.2 made
 * structural on the dashboard and this surface inherits.
 */
import { Shield, User, Users } from 'lucide-react'

import type { UserDirectoryAggregates } from '@/services/admin/userDirectory'
import { getRoleLabel } from '@/pages/admin/lib/usersReducer'

interface UserStatsProps {
  /** The server's whole-filtered-set counters, or `null` while unknown. */
  aggregates: UserDirectoryAggregates | null
  /** One sentence per counter, from the server. */
  definitions?: Record<string, string>
  isLoading?: boolean
  className?: string
}

export const UNKNOWN_STAT_LABEL = 'Unknown'

/** A measured number renders as itself; anything else renders as Unknown. */
export function formatStat(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : UNKNOWN_STAT_LABEL
}

function StatCard({
  label,
  value,
  helper,
  icon,
}: {
  label: string
  value: number | null | undefined
  helper?: string
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="break-words text-2xl font-bold text-foreground sm:text-3xl">
            {formatStat(value)}
          </p>
          {helper && <p className="mt-2 text-sm text-foreground">{helper}</p>}
        </div>
        <span aria-hidden="true">{icon}</span>
      </div>
    </div>
  )
}

export function UserStats({
  aggregates,
  definitions = {},
  isLoading = false,
  className = '',
}: UserStatsProps) {
  if (isLoading && !aggregates) {
    return (
      <div className={`rounded-lg border border-border bg-card p-6 shadow-sm ${className}`}>
        <div className="animate-pulse">
          <div className="mb-4 h-4 w-1/4 rounded bg-skeleton"></div>
          <div className="space-y-3">
            <div className="h-3 rounded bg-skeleton"></div>
            <div className="h-3 w-5/6 rounded bg-skeleton"></div>
            <div className="h-3 w-4/6 rounded bg-skeleton"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!aggregates) {
    return (
      <div
        className={`rounded-lg border border-border bg-muted/40 p-6 ${className}`}
        role="status"
      >
        <p className="text-sm font-medium text-foreground">
          Directory statistics are {UNKNOWN_STAT_LABEL.toLowerCase()}
        </p>
        <p className="mt-1 text-sm text-foreground">
          The directory read did not answer, so there is nothing measured to show.
        </p>
      </div>
    )
  }

  const total = aggregates.total_count
  const breakdown = Object.entries(aggregates.role_breakdown || {}).sort(
    ([, a], [, b]) => b - a,
  )

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          label="Accounts matching"
          value={aggregates.total_count}
          helper={definitions.total_count}
          icon={<Users className="h-8 w-8 text-primary" />}
        />
        <StatCard
          label="Enabled to sign in"
          value={aggregates.enabled_count}
          helper={definitions.enabled_count}
          icon={<User className="h-8 w-8 text-primary" />}
        />
        <StatCard
          label="Staff without a school"
          value={aggregates.staff_without_membership_count}
          helper={definitions.staff_without_membership_count}
          icon={<Shield className="h-8 w-8 text-primary" />}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h3 className="mb-1 flex items-center text-lg font-semibold text-foreground">
          <Shield className="mr-2 h-5 w-5 text-foreground" aria-hidden="true" />
          Role distribution
        </h3>
        <p className="mb-4 text-sm text-foreground">
          Counted by the server over every matching account in your scope.
        </p>
        <div className="space-y-3">
          {breakdown.length === 0 ? (
            <p className="py-4 text-center text-foreground">No accounts match the current filters.</p>
          ) : (
            breakdown.map(([role, count]) => {
              // A percentage of zero accounts is not 0% — it is undefined, and
              // saying "0%" would be the same instinct as a healthy zero.
              const share = total > 0 ? Math.round((count / total) * 100) : null
              return (
                <div
                  key={role}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-muted"
                >
                  <span className="font-medium text-foreground">{getRoleLabel(role)}</span>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full border border-border bg-accent px-3 py-1 text-sm font-medium text-foreground">
                      {count} {count === 1 ? 'account' : 'accounts'}
                    </span>
                    <div className="h-2 w-20 rounded-full bg-skeleton">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${share ?? 0}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm text-foreground">
                      {share === null ? '—' : `${share}%`}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-foreground">School membership</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            label="With an active membership"
            value={aggregates.with_membership_count}
            helper={definitions.with_membership_count}
            icon={<Users className="h-8 w-8 text-primary" />}
          />
          <StatCard
            label="Without an active membership"
            value={aggregates.without_membership_count}
            helper={definitions.without_membership_count}
            icon={<Users className="h-8 w-8 text-primary" />}
          />
        </div>
      </div>
    </div>
  )
}
