import { useState } from 'react'
import { CheckCircle, XCircle, Clock, Trash2, Download, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface BulkActionsBarProps {
  selectedIds: string[]
  onBulkAction: (action: string, ids: string[]) => Promise<void>
  onClearSelection: () => void
}

export function BulkActionsBar({ selectedIds, onBulkAction, onClearSelection }: BulkActionsBarProps) {
  const [loading, setLoading] = useState<string | null>(null)

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
            onClick={() => handleAction('reject')}
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
  )
}