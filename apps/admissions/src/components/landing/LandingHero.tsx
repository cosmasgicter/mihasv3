import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen } from '@/components/icons'
import { preloadAuthRoutes } from '@/lib/routePreload'
import { LANDING_ACTIONS } from '@/lib/constants/landing'
import { cn } from '@/lib/utils'

/**
 * The landing's first screen: one heading, one sentence and two actions.
 *
 * Both actions keep their `data-landing-action` markers so the rendered gate
 * keeps measuring that the primary action lies in the first screen and that both
 * are equally wide on a phone (R12.8). There is no card, no chip and no motion
 * here: nothing on this screen is a claim the platform cannot back.
 */
const actionBase =
  'inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg px-6 text-base transition-colors duration-150 touch-manipulation sm:w-auto'

export function LandingHero() {
  const warmAuthRoutes = () => {
    void preloadAuthRoutes('hero-cta')
  }
  return (
    <section id="hero" aria-labelledby="hero-heading" className="border-b border-border bg-muted">
      <div className="container-responsive px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <div className="max-w-3xl">
          <h1
            id="hero-heading"
            className="text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground sm:text-[2rem]"
          >
            Apply to a college or university programme online.
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-7 text-muted-foreground">
            Choose an open programme, upload your documents, see the fee before you pay, and track your
            application from your phone.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/auth/signup"
              data-landing-action="primary"
              onPointerEnter={warmAuthRoutes}
              onFocus={warmAuthRoutes}
              onTouchStart={warmAuthRoutes}
              className={cn(
                actionBase,
                'bg-primary font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/85',
              )}
            >
              <span>{LANDING_ACTIONS.start}</span>
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            <a
              href="#programs"
              data-landing-action="secondary"
              className={cn(
                actionBase,
                'border border-border bg-transparent font-medium text-foreground hover:border-foreground/40 hover:bg-card',
              )}
            >
              <span>{LANDING_ACTIONS.explore}</span>
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

export default LandingHero
