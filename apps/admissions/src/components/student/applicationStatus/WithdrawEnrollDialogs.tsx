import React from 'react'
import { Button } from '@/components/ui/Button'
import { CheckCircle, LogOut } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'

interface WithdrawDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reason: string
  onReasonChange: (value: string) => void
  onConfirm: () => void
  isPending: boolean
  error: string | null
}

export function WithdrawDialog({ open, onOpenChange, reason, onReasonChange, onConfirm, isPending, error }: WithdrawDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader className="p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-destructive/10 p-2">
              <LogOut className="h-5 w-5 text-destructive" />
            </div>
            <AlertDialogTitle>Withdraw application</AlertDialogTitle>
          </div>
        </AlertDialogHeader>
        <div className="px-6">
          <AlertDialogDescription>
            This action cannot be undone. Your application will be permanently withdrawn.
          </AlertDialogDescription>
          <div className="mt-4">
            <label htmlFor="withdrawal-reason" className="block text-sm font-medium text-foreground mb-1">
              Reason for withdrawal (min 10 characters)
            </label>
            <textarea
              id="withdrawal-reason"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              rows={3}
              minLength={10}
              maxLength={500}
              className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Please explain why you are withdrawing this application..."
            />
            <p className="text-xs text-muted-foreground mt-1">{reason.length}/10 characters minimum</p>
          </div>
          {error && (
            <p className="text-sm text-destructive mt-3">{error}</p>
          )}
        </div>
        <AlertDialogFooter className="p-6">
          <AlertDialogCancel asChild>
            <Button variant="outline" size="sm">Cancel</Button>
          </AlertDialogCancel>
          <Button
            variant="primary"
            size="sm"
            className="bg-destructive hover:bg-destructive/90 text-white"
            onClick={onConfirm}
            loading={isPending}
            disabled={reason.trim().length < 10}
          >
            Confirm withdrawal
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface EnrollDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  isPending: boolean
  error: string | null
}

export function EnrollDialog({ open, onOpenChange, onConfirm, isPending, error }: EnrollDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader className="p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-success/10 p-2">
              <CheckCircle className="h-5 w-5 text-success" />
            </div>
            <AlertDialogTitle>Confirm enrollment</AlertDialogTitle>
          </div>
        </AlertDialogHeader>
        <div className="px-6">
          <AlertDialogDescription>
            Are you sure you want to confirm your enrollment? This action cannot be undone.
          </AlertDialogDescription>
          {error && (
            <p className="text-sm text-destructive mt-3">{error}</p>
          )}
        </div>
        <AlertDialogFooter className="p-6">
          <AlertDialogCancel asChild>
            <Button variant="outline" size="sm">Cancel</Button>
          </AlertDialogCancel>
          <Button
            variant="primary"
            size="sm"
            onClick={onConfirm}
            loading={isPending}
          >
            Confirm
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
