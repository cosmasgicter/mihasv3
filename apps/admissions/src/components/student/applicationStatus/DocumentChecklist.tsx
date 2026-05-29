import React from 'react'
import { FileText, Eye } from 'lucide-react'
import { staggerChild, animateClasses } from '@/lib/animations'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

interface DocumentChecklistProps {
  resultSlipUrl: string | null | undefined
  extraKycUrl: string | null | undefined
}

export function DocumentChecklist({ resultSlipUrl, extraKycUrl }: DocumentChecklistProps) {
  return (
    <div className="space-y-4">
      {resultSlipUrl && (
        <div
          className={`flex items-center justify-between rounded-lg border border-border bg-muted px-4 py-3 ${animateClasses.fadeIn}`}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Result slip</p>
              <p className="text-xs font-medium text-info-strong">{'\u2713'} Uploaded</p>
            </div>
          </div>
          {String(resultSlipUrl).includes('supabase') ? (
            <span className="text-xs text-muted-foreground">File migrated {'\u2014'} re-upload if needed</span>
          ) : (
            <Button asChild variant="outline" size="sm" className="min-h-touch">
              <a
                href={resultSlipUrl as string}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View uploaded result slip"
              >
                <Eye className="mr-1 h-4 w-4" />
                View
              </a>
            </Button>
          )}
        </div>
      )}

      {extraKycUrl && (
        <div
          className={`flex items-center justify-between rounded-lg border border-border bg-muted px-4 py-3 ${animateClasses.fadeIn}`}
          style={staggerChild(1, 100)}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-accent/10 p-2">
              <FileText className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Identity document (NRC or Passport)</p>
              <p className="text-xs font-medium text-warning-strong">{'\u2713'} Uploaded</p>
            </div>
          </div>
          {String(extraKycUrl).includes('supabase') ? (
            <span className="text-xs text-muted-foreground">File migrated {'\u2014'} re-upload if needed</span>
          ) : (
            <Button asChild variant="outline" size="sm" className="min-h-touch">
              <a
                href={extraKycUrl as string}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View uploaded identity document"
              >
                <Eye className="mr-1 h-4 w-4" />
                View
              </a>
            </Button>
          )}
        </div>
      )}

      {!resultSlipUrl && !extraKycUrl && (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          heading="No supporting documents uploaded"
          description="Uploaded documents will appear here once they are available for review."
        />
      )}
    </div>
  )
}
