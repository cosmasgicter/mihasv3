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
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom duration-300">
      <div className="backdrop-blur-xl bg-background/90 border-t border-border shadow-lg px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-7 min-w-[28px] rounded-full bg-primary text-primary-foreground text-xs font-bold px-2">
              {selectedIds.length}
            </span>
            <span className="text-sm font-medium text-foreground">
              selected
            </span>
          </div>
        
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction('approve')}
              loading={loading === 'approve'}
              className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 rounded-xl min-h-[40px]"
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Approve
            </Button>
          
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmReject(true)}
              loading={loading === 'reject'}
              className="text-destructive border-destructive/30 hover:bg-destructive/5 rounded-xl min-h-[40px]"
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
          
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction('review')}
              loading={loading === 'review'}
              className="text-primary border-primary/30 hover:bg-primary/5 rounded-xl min-h-[40px]"
            >
              <Clock className="h-4 w-4 mr-1" />
              Review
            </Button>

            <div className="h-5 w-px bg-border mx-1" />
        
            <Button
              size="sm"
              variant="ghost"
              onClick={onClearSelection}
              className="text-muted-foreground hover:text-foreground rounded-xl"
            >
              Clear
            </Button>
          </div>
        </div>
      </div>
    </div>

    {confirmReject && (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onKeyDown={(e) => { if (e.key === 'Escape') setConfirmReject(false) }}>
        <div ref={rejectDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="bulk-reject-dialog-title" className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
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