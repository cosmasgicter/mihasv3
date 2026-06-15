import type { UseFormReturn } from 'react-hook-form'
import type { Institution } from '@/pages/admin/lib/programsReducer'
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
import type { InstitutionFormData } from './programFormSchemas'

function isInstitutionActive(institution: Institution) {
  return institution.is_active !== false
}

interface InstitutionFormFieldsProps {
  form: UseFormReturn<InstitutionFormData>
  showStatus?: boolean
}

function InstitutionFormFields({ form, showStatus }: InstitutionFormFieldsProps) {
  return (
    <div className="space-y-4 py-4">
      <Input
        label="Institution name"
        {...form.register('name')}
        error={form.formState.errors.name?.message}
        helperText="Use the short operational name used throughout the system."
        required
      />
      <Input
        label="Full name"
        {...form.register('full_name')}
        helperText="Optional, but recommended for formal reports and applicant-facing labels."
      />
      <Input
        label="Institution code"
        {...form.register('code')}
        helperText="Short internal code such as BNL."
      />
      <Textarea
        label="Description"
        {...form.register('description')}
        helperText="Briefly describe the institution for admins managing programs and applications."
      />
      <Input
        label="Address"
        {...form.register('address')}
        placeholder="Physical address"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Phone"
          type="tel"
          {...form.register('phone')}
          placeholder="+260..."
        />
        <Input
          label="Email"
          type="email"
          {...form.register('email')}
          placeholder="info@institution.edu.zm"
        />
      </div>
      <Input
        label="Website"
        type="url"
        {...form.register('website')}
        placeholder="https://..."
      />
      {showStatus ? (
        <CanonicalSelect
          label="Status"
          value={form.watch('status')}
          onChange={(value) =>
            form.setValue('status', value === 'archived' ? 'archived' : 'active')
          }
          options={[
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived' },
          ]}
          helperText="Archived institutions remain visible to admins but should not receive new programs."
        />
      ) : null}
    </div>
  )
}

interface InstitutionDialogsProps {
  showCreate: boolean
  showEdit: boolean
  showDelete: boolean
  currentInstitution: Institution | null
  currentInstitutionProgramCount: number
  saving: boolean
  form: UseFormReturn<InstitutionFormData>
  onCloseCreate: () => void
  onCloseEdit: () => void
  onCloseDelete: () => void
  onSubmitCreate: (e?: React.BaseSyntheticEvent) => void
  onSubmitEdit: (e?: React.BaseSyntheticEvent) => void
  onDelete: () => void
  onOpenChangeCreate: (open: boolean) => void
}

export function InstitutionDialogs({
  showCreate,
  showEdit,
  showDelete,
  currentInstitution,
  currentInstitutionProgramCount,
  saving,
  form,
  onCloseCreate,
  onCloseEdit,
  onCloseDelete,
  onSubmitCreate,
  onSubmitEdit,
  onDelete,
  onOpenChangeCreate,
}: InstitutionDialogsProps) {
  return (
    <>
      <Dialog open={showCreate} onOpenChange={onOpenChangeCreate}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Create Institution</DialogTitle>
            <DialogDescription>Add the institution first so programs can be assigned to it immediately.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmitCreate}>
            <InstitutionFormFields form={form} />
            <DialogFooter>
              <Button variant="outline" type="button" onClick={onCloseCreate} disabled={saving}>Cancel</Button>
              <Button type="submit" loading={saving}>Create Institution</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showEdit} onOpenChange={(open) => { if (!open) onCloseEdit() }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>Edit Institution</DialogTitle>
            <DialogDescription>Update institution details and control whether it stays active in the admissions catalog.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmitEdit}>
            <InstitutionFormFields form={form} showStatus />
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
            <DialogTitle>Archive Institution</DialogTitle>
            <DialogDescription>
              {currentInstitution ? (
                <>
                  Archive &quot;{currentInstitution.name}&quot; once there are no active programs still linked to it.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            {currentInstitutionProgramCount > 0 ? (
              <>
                This institution still has {currentInstitutionProgramCount} active program{currentInstitutionProgramCount !== 1 ? 's' : ''}.
                Reassign or archive those programs before archiving the institution.
              </>
            ) : (
              <>The institution will be removed from active program assignment but stay available for historical admin records.</>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onCloseDelete} disabled={saving}>Cancel</Button>
            <Button
              variant="danger"
              onClick={onDelete}
              loading={saving}
              disabled={saving || currentInstitutionProgramCount > 0 || !currentInstitution || !isInstitutionActive(currentInstitution)}
            >
              Archive Institution
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
