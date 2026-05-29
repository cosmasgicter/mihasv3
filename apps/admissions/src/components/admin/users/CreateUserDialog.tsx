import type { UseFormReturn } from 'react-hook-form'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Eye, EyeOff, UserPlus } from 'lucide-react'
import { AVAILABLE_ROLES } from '@/pages/admin/lib/usersReducer'

interface CreateUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: UseFormReturn<{ email: string; password: string; full_name: string; phone: string; role: string }>
  onSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>
  isPending: boolean
  showPassword: boolean
  onTogglePassword: () => void
}

export function CreateUserDialog({
  open,
  onOpenChange,
  form,
  onSubmit,
  isPending,
  showPassword,
  onTogglePassword,
}: CreateUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <span>Create user</span>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/50 p-4">
              <p className="text-sm font-medium text-foreground">Create the account with its operational role from the start.</p>
              <p className="mt-1 text-sm text-foreground">
                The phone number captured here now feeds the same profile/contact flows used elsewhere in the system.
              </p>
            </div>
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
            <div className="relative">
              <Input
                label="Temporary password"
                type={showPassword ? 'text' : 'password'}
                {...form.register('password')}
                error={form.formState.errors.password?.message}
                placeholder="Enter password"
                helperText="Share this securely with the user after creation."
                required
              />
              <button
                type="button"
                className="absolute right-3 top-[2.75rem] min-h-touch min-w-touch flex items-center justify-center text-foreground hover:text-foreground"
                onClick={onTogglePassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
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
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={isPending}>
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
