import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Banknote, Wallet } from 'lucide-react'

import { SectionCard, StatusBadge } from '@/components/ui'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorDisplay } from '@/components/ui/ErrorDisplay'
import { tenantAdminService, type TenantSettlementRow } from '@/services/admin/tenants'

/**
 * Tenant-scoped settlement summary (R11.1 IA: settlement).
 *
 * Reads the scoped `/payments/settlements/` grouping (institution / offering /
 * currency). Labels derive from the payment metadata snapshot, so they survive
 * school renames; rows with no tenant metadata bucket under "Unassigned".
 * Filtered client-side to the selected institution.
 */
export function SettlementPanel({ institutionId }: { institutionId: string }) {
  const settlementQuery = useQuery({
    queryKey: ['admin', 'tenants', 'settlements'],
    queryFn: () => tenantAdminService.listSettlements(),
  })

  const rows = useMemo<TenantSettlementRow[]>(
    () => (settlementQuery.data || []).filter(row => String(row.institution_id || '') === String(institutionId)),
    [settlementQuery.data, institutionId]
  )

  const totalsByCurrency = useMemo(() => {
    const totals = new Map<string, { gross: number; count: number }>()
    for (const row of rows) {
      const current = totals.get(row.currency) || { gross: 0, count: 0 }
      current.gross += Number(row.gross_amount) || 0
      current.count += row.payment_count || 0
      totals.set(row.currency, current)
    }
    return [...totals.entries()]
  }, [rows])

  return (
    <SectionCard
      title="Settlement"
      description="Collected payments grouped by offering and currency. Labels derive from the payment snapshot and survive school renames."
      icon={<Banknote className="h-5 w-5" />}
    >
      {settlementQuery.isError ? (
        <ErrorDisplay message="Could not load settlement data." onRetry={() => settlementQuery.refetch()} />
      ) : settlementQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading settlement summary…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Wallet />}
          heading="No settled payments yet"
          description="Payments tagged to this school's offerings will appear here once collected."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {totalsByCurrency.map(([currency, total]) => (
              <StatusBadge
                key={currency}
                tone="success"
                size="md"
                label={`${currency} ${total.gross.toFixed(2)} · ${total.count} payment${total.count === 1 ? '' : 's'}`}
              />
            ))}
          </div>
          <div className="grid gap-3 md:hidden" role="list" aria-label="Settlement totals grouped by offering and currency">
            {rows.map(row => (
              <article
                key={`${row.program_offering_id ?? 'na'}-${row.currency}-card`}
                className="rounded-lg border border-border/60 bg-muted/20 p-3"
                role="listitem"
              >
                <h3 className="break-words text-sm font-semibold text-foreground">{row.program_name}</h3>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Currency</dt>
                    <dd className="mt-1 font-medium text-foreground">{row.currency}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Payments</dt>
                    <dd className="mt-1 font-medium tabular-nums text-foreground">{row.payment_count}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">Gross</dt>
                    <dd className="mt-1 font-semibold tabular-nums text-foreground">
                      {row.currency} {Number(row.gross_amount).toFixed(2)}
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
                  <th scope="col" className="py-2 text-right font-medium">Gross</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={`${row.program_offering_id ?? 'na'}-${row.currency}`} className="border-b border-border/50">
                    <td className="py-2 pr-3 text-foreground">{row.program_name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{row.currency}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">{row.payment_count}</td>
                    <td className="py-2 text-right tabular-nums text-foreground">{Number(row.gross_amount).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SectionCard>
  )
}
