import { History, CheckCircle, XCircle, Eye, Clock } from 'lucide-react'
import { UnifiedLoader } from '@/components/ui/UnifiedLoader'
import { formatDate } from '@/lib/utils'

interface StatusHistoryItem {
  id: string
  status: string
  changed_by: string
  notes?: string
  created_at: string
  changed_by_profile?: { email: string; full_name?: string }
}

export function StatusHistoryTab({ history, loading }: { history: StatusHistoryItem[], loading: boolean }) {
  if (loading) return <UnifiedLoader variant="inline" size="sm" message="Loading details" />
  if (history.length === 0) return <div className="text-center py-8"><History className="h-8 w-8 mx-auto mb-2" /><p>No history</p></div>
  
  const getIcon = (status: string) => {
    if (status === 'approved') return <CheckCircle className="h-4 w-4 text-accent" />
    if (status === 'rejected') return <XCircle className="h-4 w-4 text-destructive" />
    if (status === 'under_review') return <Eye className="h-4 w-4 text-accent" />
    return <Clock className="h-4 w-4 text-primary" />
  }
  
  return (
    <div className="space-y-3">
      {history.map(item => (
        <div key={item.id} className="flex gap-4 p-4 bg-card border rounded-lg">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${item.status === 'approved' ? 'bg-green-100' : item.status === 'rejected' ? 'bg-red-100' : 'bg-blue-100'}`}>
            {getIcon(item.status)}
          </div>
          <div className="flex-1">
            <div className="flex justify-between mb-1">
              <p className="font-medium capitalize">{item.status.replace('_', ' ')}</p>
              <p className="text-xs">{formatDate(item.created_at)}</p>
            </div>
            <p className="text-sm">By {item.changed_by_profile?.full_name || item.changed_by_profile?.email || 'System'}</p>
            {item.notes && <p className="text-sm bg-muted p-2 rounded mt-2">{item.notes}</p>}
          </div>
        </div>
      ))}
    </div>
  )
}
