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
      <div className="bg-white dark:bg-gray-800 dark:bg-gray-200 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4 flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {selectedIds.length} selected
        </span>
        
        <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 dark:bg-gray-400" />
        
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction('approve')}
            loading={loading === 'approve'}
            className="text-green-600 dark:text-green-400 border-green-300 dark:border-green-700 hover:bg-green-50 dark:bg-green-950/30"
          >
            <CheckCircle className="h-4 w-4 mr-1" />
            Approve
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction('reject')}
            loading={loading === 'reject'}
            className="text-red-600 dark:text-red-400 border-red-300 dark:border-red-700 hover:bg-red-50 dark:bg-red-950/30"
          >
            <XCircle className="h-4 w-4 mr-1" />
            Reject
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAction('review')}
            loading={loading === 'review'}
            className="text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:bg-blue-950/30"
          >
            <Clock className="h-4 w-4 mr-1" />
            Review
          </Button>
        </div>
        
        <div className="h-4 w-px bg-gray-300 dark:bg-gray-600 dark:bg-gray-400" />
        
        <Button
          size="sm"
          variant="ghost"
          onClick={onClearSelection}
          className="text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:text-gray-300"
        >
          Clear
        </Button>
      </div>
    </div>
  )
}