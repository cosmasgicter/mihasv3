import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function ApplicationReport({ data, onExport }: { data: any, onExport: (format: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Application Report
        </h3>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => onExport('pdf')}>Export PDF</Button>
          <Button size="sm" variant="outline" onClick={() => onExport('excel')}>Export Excel</Button>
        </div>
      </div>
      <div className="bg-card border rounded-lg p-4">
        <p className="text-sm text-muted-foreground">Total Applications: {data?.applications?.length || 0}</p>
      </div>
    </div>
  )
}
