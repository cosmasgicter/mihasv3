import { useState, useRef, useEffect } from 'react'
import { CheckCircle, XCircle, Clock, Trash2, Download, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface BulkActionsBarProps {
  selectedIds: string[]
  onBulkAction: (action: string, ids: string[]) => Promise<void>
  onClearSelection: () => void
}

export function BulkActionsBar({ selectedIds, onBulkAction, onClearSelection }: BulkActionsBarProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [confirmReject, setConfirmReject] = useState(false)
  const rejectDialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (confirmReject) rejectDialogRef.current?.focus()
  }, [confirmReject])

  const handleAction = async (action: string) => {
    if (selectedIds.length === 0) return
    
    try {
      setLoading(action)
      await onBulkAction(action, selectedIds)
      onClearSelection()
    } catch (error) {
      console.error('Bulk action failed:', error)
    } finally {
      setLoading(null)
    }
  }

  if (selectedIds.length === 0) return null

  return (
    <>
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
      <div className="bg-card rounded-xl shadow-lg border border-border p-4 flex items-center gap-3">
        <span className="text-sm font-medium text-foreground">
          {selectedIds.length} selected
        </span>
        
        <div className="h-4 w-px bg-muted" />
        
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction('approve')}
            loading={loading === 'approve'}
            className="text-accent border-green-300 hover:bg-accent/10"
          >
            <CheckCircle className="h-4 w-4 mr-1" />
            Approve
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmReject(true)}
            loading={loading === 'reject'}
            className="text-destructive border-destructive/30 hover:bg-destructive/5"
          >
            <XCircle className="h-4 w-4 mr-1" />
            Reject
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction('review')}
            loading={loading === 'review'}
            className="text-primary border-blue-300 hover:bg-primary/5"
          >
            <Clock className="h-4 w-4 mr-1" />
            Review
          </Button>
        </div>
        
        <div className="h-4 w-px bg-muted" />
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onClearSelection}
          className="text-foreground hover:text-foreground"
        >
          Clear
        </Button>
      </div>
    </div>

    {confirmReject && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onKeyDown={(e) => { if (e.key === 'Escape') setConfirmReject(false) }}>
        <div ref={rejectDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="bulk-reject-dialog-title" className="w-full max-w-sm rounded-xl bg-card p-6 shadow-xl">
          <h3 id="bulk-reject-dialog-title" className="text-lg font-semibold text-foreground mb-2">Confirm bulk reject</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Are you sure you want to reject {selectedIds.length} application{selectedIds.length > 1 ? 's' : ''}? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" size="sm" onClick={() => setConfirmReject(false)}>Cancel</Button>
            <Button variant="primary" size="sm" className="bg-destructive hover:bg-destructive/90 text-white" loading={loading === 'reject'} onClick={() => { setConfirmReject(false); handleAction('reject') }}>
              Confirm reject
            </Button>
          </div>
        </div>
      </div>
    )}
  </>
  )
}