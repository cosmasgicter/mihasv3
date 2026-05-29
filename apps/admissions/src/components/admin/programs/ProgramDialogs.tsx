import type { UseFormReturn } from 'react-hook-form'
import type { Program, Institution } from '@/pages/admin/lib/programsReducer'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CanonicalSelect } from '@/components/ui/CanonicalSelect'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'
import { Plus } from 'lucide-react'
import type { ProgramFormData } from './programFormSchemas'

function getInstitutionDisplayName(institution: Institution) {
  return institution.full_name?.trim() || institution.name
}

function getInstitutionOptionLabel(institution: Institution) {
  const name = getInstitutionDisplayName(institution)
  return institution.code ? `${name} (${institution.code})` : name
}

interface ProgramFormFieldsProps {
  form: UseFormReturn<ProgramFormData>
  activeInstitutions: Institution[]
  onAddInstitution: () => void
  addInstitutionLabel: string
}

function ProgramFormFields({ form, activeInstitutions, onAddInstitution, addInstitutionLabel }: ProgramFormFieldsProps) {
  return (
    <div className="space-y-4 py-4">
      <Input label="Program name" {...form.register('name')} error={form.formState.errors.name?.message} required />
      <CanonicalSelect
        label="Institution"
        value={form.watch('institution_id')}
        onChange={(value) => form.setValue('institution_id', value)}
        placeholder="Select an institution"
        options={activeInstitutions.map((institution) => ({
          value: institution.id,
          label: getInstitutionOptionLabel(institution),
        }))}
        error={form.formState.errors.institution_id?.message}
        required
      />
      <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
        <p className="text-sm text-muted-foreground">{addInstitutionLabel}</p>
        <Button variant="ghost" size="sm" type="button" onClick={onAddInstitution}>
          <Plus className="h-4 w-4 mr-1" />
          Add institution
        </Button>
      </div>
      <Textarea
        label="Program description"
        {...form.register('description')}
        helperText="Use this to clarify the course focus for admissions teams and applicants."
      />
      <Input
        label="Duration (years)"
        type="number"
        min={1}
        max={10}
        {...form.register('duration_years', { valueAsNumber: true })}
        error={form.formState.errors.duration_years?.message}
      />
      <Input
        label="Tuition fee (ZMW)"
        type="number"
        min={0}
        step="0.01"
        {...form.register('tuition_fee')}
        placeholder="e.g. 15000"
      />
      <Input
        label="Regulatory body"
        {...form.register('regulatory_body')}
        placeholder="e.g. HPCZ, NMCZ, ECZ"
      />
      <div>
        <label htmlFor="accreditation_status" className="block text-sm font-medium text-foreground mb-1">Accreditation status</label>
        <select id="accreditation_status" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm h-12" {...form.register('accreditation_status')}>
          <option value="active">Active</option>
          <option value="provisional">Provisional</option>
          <option value="suspended">Suspended</option>
          <option value="expired">Expired</option>
        </select>
      </div>
    </div>
  )
}

interface ProgramDialogsProps {
  showCreate: boolean
  showEdit: boolean
  showDelete: boolean
  currentProgram: Program | null
  saving: boolean
  form: UseFormReturn<ProgramFormData>
  activeInstitutions: Institution[]
  onCloseCreate: () => void
  onCloseEdit: () => void
  onCloseDelete: () => void
  onSubmitCreate: (e?: React.BaseSyntheticEvent) => void
  onSubmitEdit: (e?: React.BaseSyntheticEvent) => void
  onDelete: () => void
  onAddInstitutionFromCreate: () => void
  onAddInstitutionFromEdit: () => void
}

export function ProgramDialogs({
  showCreate,
  showEdit,
  showDelete,
  currentProgram,
  saving,
  form,
  activeInstitutions,
  onCloseCreate,
  onCloseEdit,
  onCloseDelete,
  onSubmitCreate,
  onSubmitEdit,
  onDelete,
  onAddInstitutionFromCreate,
  onAddInstitutionFromEdit,
}: ProgramDialogsProps) {
  return (
    <>
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) onCloseCreate() }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Create Program</DialogTitle>
            <DialogDescription>Add the academic program details and assign it to an institution.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmitCreate}>
            <ProgramFormFields
              form={form}
              activeInstitutions={activeInstitutions}
              onAddInstitution={onAddInstitutionFromCreate}
              addInstitutionLabel="Need a new institution before saving this program?"
            />
            <DialogFooter>
              <Button variant="outline" type="button" onClick={onCloseCreate} disabled={saving}>Cancel</Button>
              <Button type="submit" loading={saving}>Create Program</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showEdit} onOpenChange={(open) => { if (!open) onCloseEdit() }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit Program</DialogTitle>
            <DialogDescription>Update the academic program details and institution ownership.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmitEdit}>
            <ProgramFormFields
              form={form}
              activeInstitutions={activeInstitutions}
              onAddInstitution={onAddInstitutionFromEdit}
              addInstitutionLabel="Need to register a missing institution first?"
            />
            <DialogFooter>
              <Button variant="outline" type="button" onClick={onCloseEdit} disabled={saving}>Cancel</Button>
              <Button type="submit" loading={saving}>Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showDelete} onOpenChange={(open) => { if (!open) onCloseDelete() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive Program</DialogTitle>
            <DialogDescription>
              Archive "{currentProgram?.name}" to remove it from active admissions setup while keeping historical records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onCloseDelete} disabled={saving}>Cancel</Button>
            <Button variant="danger" onClick={onDelete} loading={saving}>Archive Program</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
