import type { UseFormReturn } from 'react-hook-form'
import type { UserProfile } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { User } from 'lucide-react'
import { isSuperAdmin } from '@/types/roles'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { AVAILABLE_ROLES } from '@/pages/admin/lib/usersReducer'

interface EditUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: UseFormReturn<{ full_name: string; email: string; phone: string; role: string }>
  onSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>
  isPending: boolean
  selectedUser: UserProfile | null
}

export function EditUserDialog({
  open,
  onOpenChange,
  form,
  onSubmit,
  isPending,
  selectedUser,
}: EditUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            <span>Edit user</span>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="space-y-4">
            {selectedUser && (
              <div className="rounded-lg border border-border bg-muted/50 p-4">
                <p className="text-sm font-medium text-foreground">{sanitizeForDisplay(selectedUser.email)}</p>
                <p className="mt-1 text-sm text-foreground">
                  Changing the assigned role revokes active sessions so the user signs in again with fresh access.
                </p>
              </div>
            )}
            <Input
              label="Full name"
              {...form.register('full_name')}
              error={form.formState.errors.full_name?.message}
              placeholder="Enter full name"
              required
            />
            <Input
              label="Email"
              type="email"
              {...form.register('email')}
              error={form.formState.errors.email?.message}
              placeholder="Enter email address"
              required
            />
            <Input
              label="Phone"
              {...form.register('phone')}
              placeholder="Enter phone number"
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Role <span className="text-destructive">*</span>
              </label>
              <select
                {...form.register('role')}
                className="min-h-touch h-12 w-full rounded-lg border border-input bg-background px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                required
                disabled={isSuperAdmin(selectedUser)}
              >
                {AVAILABLE_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label} - {role.description}
                  </option>
                ))}
              </select>
              {form.formState.errors.role?.message && (
                <p className="mt-1.5 text-sm text-destructive">{form.formState.errors.role.message}</p>
              )}
              {isSuperAdmin(selectedUser) ? (
                <p className="mt-1.5 text-sm text-foreground">Super admin access is locked from this dialog.</p>
              ) : (
                <p className="mt-1.5 text-sm text-foreground">Role changes end active sessions and require the user to sign in again.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              Update user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
