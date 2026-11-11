import React from 'react'
import { ArrowLeft } from '@/components/icons'
import { cn } from '@/lib/utils'
import { designTokens } from '@/design-system/tokens'

export interface MobilePageHeaderProps {
  title: string
  showBack?: boolean
  onBack?: () => void
  actions?: React.ReactNode
  /**
   * A persistent scope label, e.g. "Platform admin · all schools" (task 30.5,
   * R17.8). When set, the bar uses the dark `adminColors.text` surface so the
   * super-admin shell is visibly distinct from the tenant-admin one.
   */
  scopeLabel?: string
  className?: string
}

export function MobilePageHeader({
  title,
  showBack,
  onBack,
  actions,
  scopeLabel,
  className,
}: MobilePageHeaderProps) {
  const dark = Boolean(scopeLabel)
  return (
    <header
      className={cn(
        'fixed left-0 right-0 top-0 z-40 flex h-16 items-center md:hidden',
        dark ? 'border-b border-transparent shadow-sm' : 'border-b border-border/60 bg-background shadow-sm',
        className
      )}
      style={dark ? { backgroundColor: designTokens.colors.admin.text } : undefined}
      data-shell-scope={dark ? 'platform' : undefined}
    >
      {/* Left: back button or spacer */}
      <div className="flex w-14 flex-shrink-0 items-center justify-center">
        {showBack ? (
          <button
            type="button"
            onClick={onBack}
            className={cn(
              'flex min-h-touch min-w-touch items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              dark ? 'text-white hover:bg-white/10' : 'text-foreground hover:bg-accent'
            )}
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      {/*
        Center: the page title as a **label, not a heading** (GATE-13.3-08, 13.6
        §8.1 item L6; WCAG 1.3.1).
        
        This was an `h2`, and because the header is rendered before `main` in the
        shell it was the *first* heading in the document — so every authenticated
        surface opened `h2 -> h1`, which task 13.3 measured on the dashboard, the
        status workspace and the payment page. One shell-level cause, three
        surfaces.
        
        A page has one accessible title and `PageShell` already renders it as the
        `h1`. This bar restates it for orientation on a 64 px mobile header, which
        is a label's job: as a `<p>` the text is unchanged, still announced in
        reading order, and no longer a second — earlier, higher — heading competing
        with the page's own. `aria-hidden` would be wrong (a sighted screen-magnifier
        user reads it); demoting it to `h3` would still precede the `h1`.
      */}
      {dark ? (
        <div className="min-w-0 flex-1 px-2 text-center">
          <p className="text-xs font-semibold text-white">{scopeLabel}</p>
          <p className="truncate text-base font-bold tracking-tight text-white">{title}</p>
        </div>
      ) : (
        <p className="flex-1 truncate px-2 text-center text-base font-bold tracking-tight text-foreground">
          {title}
        </p>
      )}

      {/* Right: actions slot or spacer */}
      <div className="flex-shrink-0 min-w-touch pr-2 flex items-center justify-end">
        {actions}
      </div>
    </header>
  )
}
