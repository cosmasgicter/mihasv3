import { Shield } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function AuditReport({ data, onExport }: { data: any, onExport: (format: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Audit Report
        </h3>
        <Button size="sm" onClick={() => onExport('pdf')}>Export PDF</Button>
      </div>
      <div className="bg-card border rounded-lg p-4">
        <p className="text-sm text-muted-foreground">Audit Trail</p>
      </div>
    </div>
  )
}
