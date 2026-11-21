/**
 * AuthShell — calm, single-column auth surface.
 *
 * Replaces the legacy AuthLayout's split-pane variant configuration with a
 * focused tool surface: brand identity at top, page title and one-line
 * description, form region, footer links, trust note. No hero narrative,
 * no dark gradient, no feature/stat panels.
 *
 * Per REDESIGN.md (2026-05-17). The legacy AuthLayout is preserved as a
 * re-export shim so existing imports keep working.
 *
 * Composition contract:
 *
 *   <AuthShell title="Sign in" description="Continue your application">
 *     {/* form + banner *\/}
 *     {children}
 *     <AuthShellFooter>
 *       <Link>Forgot password?</Link>
 *       <Link>Create account</Link>
 *     </AuthShellFooter>
 *   </AuthShell>
 */

import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface AuthShellProps {
  title: string
  description?: ReactNode
  children: ReactNode
  /**
   * Optional standalone action rendered on its own line under the
   * description, for example the link to the other auth page. Keep links out
   * of the description sentence: a link inside running text cannot meet the
   * 44 × 44 px target rule (decision D17, confirmed 2026-11-21).
   */
  headerAction?: ReactNode
  /**
   * Optional content rendered below the form, separated by a divider. Use
   * this for the secondary action links (forgot-password, create-account).
   */
  footer?: ReactNode
  /**
   * Optional trust note rendered below the footer. Defaults to the
   * standard session-length notice. Pass `null` to suppress.
   */
  trustNote?: ReactNode
  /**
   * Optional className applied to the form card. Use sparingly — the
   * default is correct for every auth page.
   */
  className?: string
}

const DEFAULT_TRUST_NOTE = (
  <p className="text-center text-xs text-muted-foreground">
    You stay signed in on this device until your session ends. Sign out on a shared device.
  </p>
)

export function AuthShell({
  title,
  description,
  headerAction,
  children,
  footer,
  trustNote = DEFAULT_TRUST_NOTE,
  className,
}: AuthShellProps) {
  return (
    <div className="min-h-dvh bg-muted">
      <div className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-10 sm:px-6 sm:py-16">
        {/* Brand identity - top-center, calm */}
        <Link
          to="/"
          className="mx-auto mb-10 flex min-h-touch items-center gap-3 rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted"
          aria-label="Beanola home"
        >
          <img
            src="/images/logos/beanolalogo.webp"
            alt="Beanola Admissions"
            width={32}
            height={32}
            loading="eager"
            decoding="async"
            className="h-8 w-8"
          />
          <span className="text-lg font-semibold tracking-tight text-foreground">Beanola</span>
        </Link>

        {/* Form card — the dominant surface */}
        <main
          className={cn(
            'rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8',
            className,
          )}
        >
          <header className="mb-6 space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="text-sm text-muted-foreground sm:text-base">{description}</p>
            ) : null}
            {headerAction ? (
              <div className="text-sm sm:text-base">{headerAction}</div>
            ) : null}
          </header>

          {children}
        </main>

        {footer ? (
          <div className="mt-6 border-t border-border/60 pt-6">{footer}</div>
        ) : null}

        {trustNote ? <div className="mt-8">{trustNote}</div> : null}
      </div>
    </div>
  )
}

/**
 * AuthShellFooter — preset layout for secondary action links beneath the
 * form. Auto-distributes its children with horizontal divider on desktop.
 */
export function AuthShellFooter({ children }: { children: ReactNode }) {
  return (
    <nav
      aria-label="Auth alternatives"
      className="flex flex-col items-center gap-3 text-sm sm:flex-row sm:justify-center sm:gap-6"
    >
      {children}
    </nav>
  )
}

/**
 * Convenience: typed standalone link for the auth pages (footer, header
 * action, the sign-up consent links). Same focus + hover treatment across
 * every auth page, and a 44 × 44 px minimum target however short the label.
 * Use this instead of a raw `<Link>`.
 */
export function AuthShellLink({
  to,
  children,
  emphasis = 'default',
}: {
  to: string
  children: ReactNode
  emphasis?: 'default' | 'muted'
}) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex min-h-touch min-w-touch items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        emphasis === 'default'
          ? 'text-primary hover:text-link-hover'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </Link>
  )
}
