import React from 'react'
import { Badge } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  formatBuildVersion,
  getBackendBuildVersion,
  getFrontendBuildVersion,
} from '@/lib/appVersion'

interface BuildVersionBadgeProps {
  className?: string
  compact?: boolean
  muted?: boolean
}

export function BuildVersionBadge({
  className,
  compact = false,
  muted = false,
}: BuildVersionBadgeProps) {
  const frontendVersion = React.useMemo(() => getFrontendBuildVersion(), [])
  const [backendVersion, setBackendVersion] = React.useState('loading')

  React.useEffect(() => {
    let cancelled = false

    void getBackendBuildVersion().then((version) => {
      if (!cancelled) {
        setBackendVersion(version)
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

  const frontendLabel = formatBuildVersion(frontendVersion)
  const backendLabel = formatBuildVersion(backendVersion)

  if (compact) {
    return (
      <div
        className={cn('flex flex-wrap items-center gap-2 text-[11px]', className)}
        aria-label={`Frontend build ${frontendVersion}. Backend build ${backendVersion}.`}
      >
        <Badge
          variant="outline"
          className={cn('border-white/20 bg-white/5 font-medium text-current', muted && 'border-border/60 bg-background/70')}
          title={`Frontend build: ${frontendVersion}`}
        >
          FE {frontendLabel}
        </Badge>
        <Badge
          variant="outline"
          className={cn('border-white/20 bg-white/5 font-medium text-current', muted && 'border-border/60 bg-background/70')}
          title={`Backend build: ${backendVersion}`}
        >
          BE {backendLabel}
        </Badge>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'inline-flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-background/80 px-3 py-2 text-xs text-muted-foreground backdrop-blur',
        className,
      )}
      aria-label={`Frontend build ${frontendVersion}. Backend build ${backendVersion}.`}
    >
      <span className="font-medium text-foreground">Runtime</span>
      <Badge variant="outline" className="border-border/60 bg-background/70" title={`Frontend build: ${frontendVersion}`}>
        Frontend {frontendLabel}
      </Badge>
      <Badge variant="outline" className="border-border/60 bg-background/70" title={`Backend build: ${backendVersion}`}>
        Backend {backendLabel}
      </Badge>
    </div>
  )
}
