import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
import { GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Program, Institution } from '@/pages/admin/lib/programsReducer'

interface ProgramsTableProps {
  programs: Program[]
  activeInstitutions: Institution[]
  onEdit: (program: Program) => void
  onDelete: (program: Program) => void
  onCreateProgram: () => void
  onCreateInstitution: () => void
}

export function ProgramsTable({
  programs,
  activeInstitutions,
  onEdit,
  onDelete,
  onCreateProgram,
  onCreateInstitution,
}: ProgramsTableProps) {
  if (programs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/40 px-6 py-14 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
          <GraduationCap className="h-10 w-10" aria-hidden="true" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">No Programs Yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Build the institution catalog first, then add the academic programs students can apply for.
        </p>
        <div className="mt-6 flex justify-center">
          <Button onClick={activeInstitutions.length > 0 ? onCreateProgram : onCreateInstitution}>
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            {activeInstitutions.length > 0 ? 'Create First Program' : 'Create Institution First'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <ResponsiveTable<Program>
      columns={[
        {
          key: 'name',
          header: 'Program',
          priority: 'always',
          render: (_value, row) => (
            <span className="font-semibold text-foreground">{row.name}</span>
          ),
        },
        {
          key: 'institution_id',
          header: 'Institution',
          priority: 'always',
          render: (_value, row) => (
            <Badge variant="secondary">
              {row.institutions?.name || 'Unknown institution'}
            </Badge>
          ),
        },
        {
          key: 'duration_years',
          header: 'Duration',
          priority: 'desktop',
          render: (_value, row) => (
            <span className="text-sm text-muted-foreground">
              {row.duration_years} year{row.duration_years !== 1 ? 's' : ''}
            </span>
          ),
        },
        {
          key: 'description',
          header: 'Description',
          priority: 'desktop',
          render: (_value, row) => (
            <div className="max-w-sm truncate text-sm text-muted-foreground">
              {row.description || 'No description provided yet.'}
            </div>
          ),
        },
        {
          key: 'id',
          header: 'Actions',
          priority: 'always',
          render: (_value, row) => (
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
                className="text-destructive border-destructive/30 hover:bg-destructive/5"
                aria-label={`Archive ${row.name}`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span className="md:hidden ml-1">Archive</span>
              </Button>
            </div>
          ),
        },
      ]}
      data={programs}
      caption="Academic programs"
      loading={false}
    />
  )
}
