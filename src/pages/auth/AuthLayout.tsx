import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, GraduationCap } from 'lucide-react'

interface AuthLayoutProps {
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  hero?: ReactNode
  backLinkLabel?: string
  backLinkHref?: string
}

const defaultHero = (
  <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
    <div className="rounded-3xl bg-gradient-to-br from-primary/90 via-secondary/90 to-accent/90 p-8 text-white shadow-2xl backdrop-blur-sm">
      <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/20 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-white backdrop-blur">
        <span className="h-2 w-2 rounded-full bg-white" aria-hidden />
        MIHAS Student Portal
      </span>
      <div className="mt-6 space-y-4">
        <h1 className="text-4xl font-bold leading-tight text-white drop-shadow-lg sm:text-5xl">Grow your healthcare career with confidence</h1>
        <p className="text-base leading-relaxed text-white/90 drop-shadow">
          Access your personalized portal to monitor applications, manage enrollment tasks, and stay connected with our admissions team every step of the way.
        </p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/30 bg-white/20 p-4 text-left backdrop-blur">
          <p className="text-sm font-semibold text-white drop-shadow">24/7 Access</p>
          <p className="mt-1 text-sm text-white/90 drop-shadow-sm">Manage your journey from any device at any time.</p>
        </div>
        <div className="rounded-2xl border border-white/30 bg-white/20 p-4 text-left backdrop-blur">
          <p className="text-sm font-semibold text-white drop-shadow">Dedicated Support</p>
          <p className="mt-1 text-sm text-white/90 drop-shadow-sm">Our advisors are ready to help you take the next step.</p>
        </div>
      </div>
    </div>
  </div>
)

export function AuthLayout({
  title,
  description,
  children,
  footer,
  hero = defaultHero,
  backLinkHref = '/',
  backLinkLabel = 'Back to Home',
}: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-primary/20 via-secondary/10 to-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.18),transparent_45%),radial-gradient(circle_at_bottom,_rgba(147,51,234,0.18),transparent_55%)]" aria-hidden />
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/60 to-transparent" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-white/60 to-transparent" aria-hidden />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-16 sm:px-6 lg:grid lg:grid-cols-[1.1fr_minmax(0,1fr)] lg:items-center lg:gap-16 lg:px-8">
        <div className="order-2 lg:order-1">
          {hero}
        </div>

        <div className="order-1 lg:order-2">
          <div className="relative">
            <div className="pointer-events-none absolute inset-0 rounded-[32px] bg-white/60 blur-3xl" aria-hidden />
            <div className="relative flex flex-col gap-8 rounded-[32px] border border-white/60 bg-white/80 p-8 shadow-2xl backdrop-blur-xl sm:p-10">
              <div className="space-y-6 text-center sm:text-left">
                <Link
                  to={backLinkHref}
                  className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-white rounded-full px-3 py-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {backLinkLabel}
                </Link>
                <div className="flex items-center justify-center sm:justify-start">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-lg">
                    <GraduationCap className="h-7 w-7" />
                  </div>
                </div>
                <div>
                  <h2 className="text-3xl font-semibold text-secondary sm:text-4xl">{title}</h2>
                  {description && (
                    <p className="mt-3 text-base text-secondary/80">
                      {description}
                    </p>
                  )}
                </div>
              </div>

              <div>
                {children}
              </div>

              {footer && (
                <div className="border-t border-secondary/10 pt-8">
                  {footer}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
