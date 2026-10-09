import React from 'react'
import { Copy, Link2, Share2, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/Dialog'

/**
 * Share the tracking **link**, not the application number
 * (admissions-v2 task 10.5, R13.12 / STU-22).
 *
 * Two pre-10.5 behaviours are gone:
 *
 * * "Copy Link" copied `window.location.href`, which for a result reached by
 *   typing the code into the search box is just `/track-application` — a URL that
 *   tracks nothing. The link is now built from the secret the result was opened
 *   with, so it is contract-valid by construction.
 * * "Copy Number" offered the application number as the thing to pass on. That
 *   number is a sequential counter and no longer opens anything, so offering it
 *   as a share affordance would be teaching the wrong habit.
 *
 * The dialog also says out loud what the link is, because a URL that carries a
 * credential should not be shared casually.
 */
interface ShareModalProps {
  show: boolean
  shareUrl: string
  onClose: () => void
  onCopyLink: () => void
  copied?: boolean
}

export const ShareModal: React.FC<ShareModalProps> = ({
  show,
  shareUrl,
  onClose,
  onCopyLink,
  copied = false
}) => {
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose()
    }
  }
  return (
    <Dialog open={show} onOpenChange={handleOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Share2 className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <DialogTitle>Share status link</DialogTitle>
          </div>
          <DialogDescription>
            This link opens this application&apos;s public status page. It contains a
            random token and no personal details.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tracking link
            </p>
            <p
              className="break-all font-mono text-sm text-foreground"
              data-testid="tracker-share-url"
            >
              {shareUrl}
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <p className="text-sm text-foreground">
              Anyone with this link can see this application&apos;s status. Share it only
              with people you trust — you can replace it at any time from your
              application.
            </p>
          </div>
          <Button variant="outline" className="w-full" onClick={onCopyLink}>
            {copied ? (
              <Copy className="mr-2 h-4 w-4" aria-hidden="true" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            {copied ? 'Link copied' : 'Copy link'}
          </Button>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
