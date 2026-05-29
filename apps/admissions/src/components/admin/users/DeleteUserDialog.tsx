import type { UserProfile } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { UserX } from 'lucide-react'
import { sanitizeForDisplay } from '@/lib/sanitize'

interface DeleteUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isPending: boolean
  selectedUser: UserProfile | null
}

export function DeleteUserDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  selectedUser,
}: DeleteUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <UserX className="h-5 w-5" />
            <span>Deactivate user</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-sm text-foreground">
            Deactivate <strong>{sanitizeForDisplay(selectedUser?.full_name || selectedUser?.email)}</strong>?
          </p>
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">This removes live sign-in access immediately.</p>
            <p className="mt-1 text-sm text-foreground">
              Existing sessions are revoked, but audit history and owned records remain intact for operational traceability.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={onConfirm} loading={isPending} variant="destructive">
            Deactivate user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
