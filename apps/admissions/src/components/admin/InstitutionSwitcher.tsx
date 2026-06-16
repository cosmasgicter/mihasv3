/**
 * Institution switcher — super-admin tenant filter for the admin area.
 *
 * Renders only for super-admins with more than one institution (via
 * `useInstitutionScope().showSwitcher`). Selecting a school sets the shared
 * `selectedInstitutionId`, which admin pages pass as `?institution_id=` to
 * narrow platform-wide views to that tenant. "All schools" clears the filter.
 *
 * Scoped school admins never see this — they are auto-locked to their own
 * institution, so the control returns null for them.
 */
import { Building2 } from 'lucide-react'

import { useInstitutionScope } from '@/contexts/InstitutionScopeContext'

export function InstitutionSwitcher({ className }: { className?: string }) {
  const { showSwitcher, institutions, selectedInstitutionId, setSelectedInstitutionId } =
    useInstitutionScope()

  if (!showSwitcher) return null

  return (
    <label className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <span className="sr-only">Filter by institution</span>
      <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <select
        value={selectedInstitutionId ?? ''}
        onChange={(event) => setSelectedInstitutionId(event.target.value || null)}
        aria-label="Filter admin views by institution"
        className="min-h-touch h-10 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <option value="">All schools</option>
        {institutions.map((inst) => (
          <option key={inst.id} value={inst.id}>
            {inst.name} ({inst.code})
          </option>
        ))}
      </select>
    </label>
  )
}
