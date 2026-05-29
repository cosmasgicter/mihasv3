import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Institution } from '@/pages/admin/lib/programsReducer'

function isInstitutionActive(institution: Institution) {
  return institution.is_active !== false
}

interface InstitutionsTableProps {
  institutions: Institution[]
  getInstitutionProgramCount: (id: string) => number
  onEdit: (institution: Institution) => void
  onDelete: (institution: Institution) => void
  onCreate: () => void
}

export function InstitutionsTable({
  institutions,
  getInstitutionProgramCount,
  onEdit,
  onDelete,
  onCreate,
}: InstitutionsTableProps) {
  if (institutions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/40 px-6 py-14 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Building2 className="h-10 w-10" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">No Institutions Yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Add institutions here first so program setup, admissions routing, and student applications stay aligned.
        </p>
        <div className="mt-6 flex justify-center">
          <Button onClick={onCreate}>
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            Create First Institution
          </Button>
        </div>
      </div>
    )
  }

  return (
    <ResponsiveTable<Institution>
      columns={[
        {
          key: 'name',
          header: 'Institution',
          priority: 'always',
          render: (_value, row) => (
            <div>
              <div className="font-semibold text-foreground">{row.name}</div>
              {row.full_name && row.full_name !== row.name ? (
                <div className="text-xs text-muted-foreground">{row.full_name}</div>
              ) : null}
            </div>
          ),
        },
        {
          key: 'code',
          header: 'Code',
          priority: 'desktop',
          render: (_value, row) => (
            <span className="text-sm text-muted-foreground">{row.code || '\u2014'}</span>
          ),
        },
        {
          key: 'is_active',
          header: 'Status',
          priority: 'always',
          render: (_value, row) => {
            const archived = !isInstitutionActive(row)
            return (
              <Badge variant={archived ? 'outline' : 'success'}>
                {archived ? 'Archived' : 'Active'}
              </Badge>
            )
          },
        },
        {
          key: 'id',
          header: 'Active Programs',
          priority: 'desktop',
          render: (_value, row) => (
            <span className="text-sm text-muted-foreground">
              {getInstitutionProgramCount(row.id)}
            </span>
          ),
        },
        {
          key: 'description',
          header: 'Description',
          priority: 'desktop',
          render: (_value, row) => (
            <div className="max-w-sm truncate text-sm text-muted-foreground">
              {row.description || 'No institution summary provided yet.'}
            </div>
          ),
        },
        {
          key: 'full_name',
          header: 'Actions',
          priority: 'always',
          render: (_value, row) => {
            const archived = !isInstitutionActive(row)
            const activeProgramCount = getInstitutionProgramCount(row.id)
            return (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onEdit(row) }}
                  aria-label={`Edit ${row.name}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  <span className="md:hidden ml-1">Edit</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); onDelete(row) }}
                  disabled={archived || activeProgramCount > 0}
                  className="text-destructive border-destructive/30 hover:bg-destructive/5"
                  aria-label={`Archive ${row.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span className="md:hidden ml-1">Archive</span>
                </Button>
              </div>
            )
          },
        },
      ]}
      data={institutions}
      caption="Institutions"
      loading={false}
    />
  )
}
