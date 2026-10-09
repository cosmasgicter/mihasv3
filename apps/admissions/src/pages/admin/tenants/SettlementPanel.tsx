/**
 * Tenant-scoped settlement report (Admissions V2, task 8.4).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 8.4
 * Requirements: R3 (backend authority), R6.5 (server filters/page/export),
 * R8.3-R8.4, R12.5-R12.7 (server is the money authority).
 * Findings: **ADM-06**, **AUTH-02**.
 *
 * What this panel used to do, and no longer does: it called
 * `/payments/settlements/` with **no institution filter**, received every row the
 * actor could reach, and then dropped the other schools' rows with
 * `rows.filter(row => row.institution_id === institutionId)` — scope as a
 * rendering decision. It then produced the per-currency totals itself with
 * `Number(row.gross_amount) + …` and `.toFixed(2)`, which made the browser a
 * second money authority.
 *
 * Now: the institution is a **server** filter, the page and the aggregates come
 * from the backend, amounts are printed as the decimal strings the server
 * authored, the reconciliation state is the server's verdict, and the export is a
 * backend command that covers the whole filtered set and is audited server-side.
 */
import { useMemo, useState } from 'react'
import { AlertTriangle, Banknote, Clock, Download, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import { SectionCard, StatusBadge } from '@/components/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { useCapabilities } from '@/contexts/CapabilityContext'
import { useSettlementExport, useSettlementReport } from '@/hooks/admin/useMoneyAdmin'
import { formatServerAmount } from '@/lib/serverAmount'
import { toError } from '@/lib/toError'
import type { ReconciliationState, SettlementRow } from '@/services/admin/settlement'

const PAGE_SIZE = 10

/** The export authority (R6.5) — the platform's one tenant export grant. */
const EXPORT_CAPABILITY = 'tenant.application.export'

/**
 * Presentation for the server's reconciliation verdict. The vocabulary is the
 * server's; this only chooses a label, a tone, and an icon for it — and every
 * status carries a label, never colour alone.
 */
const RECONCILIATION_PRESENTATION: Record<
  ReconciliationState,
  { label: string; tone: 'success' | 'info' | 'warning' | 'destructive' | 'muted'; hint: string }
> = {
  settled: {
    label: 'Reconciled',
    tone: 'success',
    hint: 'Every attempt in this group has settled.',
  },
  in_flight: {
    label: 'With the provider',
    tone: 'info',
    hint: 'An attempt is still in flight and within its wait budget.',
  },
  uncollected: {
    label: 'Still owed',
    tone: 'warning',
    hint: 'Fees were deferred or the attempt expired — nothing was charged.',
  },
  attention_required: {
    label: 'Needs attention',
    tone: 'destructive',
    hint: 'An attempt failed, or has been pending past the reconciliation window.',
  },
  no_activity: {
    label: 'No activity',
    tone: 'muted',
    hint: 'No payment attempts match the current filters.',
  },
}

const RECONCILIATION_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All activity' },
  { value: 'settled', label: 'Settled' },
  { value: 'in_flight', label: 'In flight' },
  { value: 'stale', label: 'Stale pending' },
  { value: 'failed', label: 'Failed' },
  { value: 'expired', label: 'Expired' },
  { value: 'deferred', label: 'Deferred' },
]

function ReconciliationBadge({ state }: { state: ReconciliationState }) {
  const presentation = RECONCILIATION_PRESENTATION[state] ?? RECONCILIATION_PRESENTATION.no_activity
  return <StatusBadge tone={presentation.tone} size="sm" label={presentation.label} />
}

export function SettlementPanel({ institutionId }: { institutionId: string }) {
  const { isSuperAdmin, canForInstitution } = useCapabilities()
  const [page, setPage] = useState(1)
  const [reconciliation, setReconciliation] = useState('')

  // The institution is a server filter, not a client predicate (ADM-06).
  const query = useMemo(
    () => ({
      institutionId,
      reconciliation: reconciliation || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [institutionId, reconciliation, page],
  )

  const settlementQuery = useSettlementReport(query, { enabled: Boolean(institutionId) })
  const exportMutation = useSettlementExport()

  const report = settlementQuery.data
  const rows: SettlementRow[] = report?.results ?? []
  const aggregates = report?.aggregates
  // The page count is the server's answer, not a division done here.
  const totalPages = report?.totalPages ?? 1
  const mayExport =
    (report?.can_export ?? false) &&
    (isSuperAdmin || canForInstitution(institutionId, EXPORT_CAPABILITY))

  return (
    <SectionCard
      title="Settlement"
      description="Collected payments grouped by offering and currency, with reconciliation state. Filters, totals, and the export are the server's; labels derive from the payment snapshot and survive school renames."
      icon={<Banknote className="h-5 w-5" />}
      actions={
        mayExport ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            loading={exportMutation.isPending}
            onClick={() => exportMutation.mutate(query)}
          >
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
        ) : undefined
      }
    >
      {settlementQuery.isError ? (
        <ErrorDisplay
          message="Could not load settlement data."
          onRetry={() => settlementQuery.refetch()}
        />
      ) : settlementQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading settlement summary…</p>
      ) : (
        <div className="space-y-4">
          {exportMutation.isError && (
            <ErrorDisplay message={toError(exportMutation.error).message} />
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
              Reconciliation
              <select
                aria-label="Filter by reconciliation state"
                className="min-h-touch rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                value={reconciliation}
                onChange={(event) => {
                  setReconciliation(event.target.value)
                  setPage(1)
                }}
              >
                {RECONCILIATION_FILTERS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {aggregates && (
              <div className="flex flex-wrap items-center gap-2">
                <ReconciliationBadge state={aggregates.reconciliation_state} />
                {aggregates.stale_pending_count > 0 && (
                  <StatusBadge
                    tone="warning"
                    size="sm"
                    icon={Clock}
                    label={`${aggregates.stale_pending_count} pending over ${aggregates.reconciliation_stale_hours}h`}
                  />
                )}
                {aggregates.failed_count > 0 && (
                  <StatusBadge
                    tone="destructive"
                    size="sm"
                    icon={AlertTriangle}
                    label={`${aggregates.failed_count} failed`}
                  />
                )}
              </div>
            )}
          </div>

          {aggregates && aggregates.totals_by_currency.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="Settlement totals by currency">
              {aggregates.totals_by_currency.map((total) => (
                <StatusBadge
                  key={total.currency}
                  tone="success"
                  size="md"
                  label={`${formatServerAmount(total.gross_amount, total.currency)} · ${total.payment_count} payment${total.payment_count === 1 ? '' : 's'}`}
                />
              ))}
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState
              icon={<Wallet />}
              heading="No settled payments yet"
              description="Payments tagged to this school's offerings will appear here once collected."
            />
          ) : (
            <>
              {/*
                One container deep (admissions-v2 task 11.5, R16.4). Task 11.4 §11
                recorded that these records were `rounded-lg border border-border/60
                bg-muted/20 p-3` cards drawn inside this panel's own `SectionCard`,
                and left them. They are rows of one list now, separated by the rule
                the list owns — the same shape 11.5 gave the student dashboard's
                application row inside `ApplicationsGrid`.
              */}
              <div
                className="divide-y divide-border/45 md:hidden"
                role="list"
                aria-label="Settlement totals grouped by offering and currency"
              >
                {rows.map(row => (
                  <article
                    key={`${row.program_offering_id ?? 'na'}-${row.currency}-card`}
                    className="py-3 first:pt-0 last:pb-0"
                    role="listitem"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="break-words text-sm font-semibold text-foreground">{row.program_name}</h3>
                      <ReconciliationBadge state={row.reconciliation_state} />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Currency</dt>
                        <dd className="mt-1 font-medium text-foreground">{row.currency}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Payments</dt>
                        <dd className="mt-1 font-medium tabular-nums text-foreground">{row.payment_count}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Settled</dt>
                        <dd className="mt-1 font-medium tabular-nums text-foreground">
                          {formatServerAmount(row.settled_amount, row.currency)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">Gross</dt>
                        <dd className="mt-1 font-semibold tabular-nums text-foreground">
                          {formatServerAmount(row.gross_amount, row.currency)}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
              <div className="hidden md:block">
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">Settlement totals grouped by offering and currency</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="py-2 pr-3 font-medium">Offering</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Currency</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Payments</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Settled</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Gross</th>
                      <th scope="col" className="py-2 font-medium">Reconciliation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={`${row.program_offering_id ?? 'na'}-${row.currency}`} className="border-b border-border/50">
                        <td className="py-2 pr-3 text-foreground">{row.program_name}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{row.currency}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-foreground">{row.payment_count}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                          {formatServerAmount(row.settled_amount, row.currency)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                          {formatServerAmount(row.gross_amount, row.currency)}
                        </td>
                        <td className="py-2">
                          <ReconciliationBadge state={row.reconciliation_state} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-muted-foreground">
                    Page {report?.page ?? page} of {totalPages} · {report?.totalCount ?? 0} groups
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={(report?.page ?? page) <= 1}
                      onClick={() => setPage(current => Math.max(1, current - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={(report?.page ?? page) >= totalPages}
                      onClick={() => setPage(current => current + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {report?.redaction.applied && report.redaction.withheld_fields.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Platform-only columns are not shown for your scope.
            </p>
          )}
        </div>
      )}
    </SectionCard>
  )
}
