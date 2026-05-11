/**
 * MarketingRouteSkeleton — the above-the-fold placeholder shown on
 * public routes (`/`, `/contact`, `/terms`, `/privacy`, `/404`) while
 * their lazy chunk (LandingPage, ContactPage, etc.) downloads.
 *
 * Before this existed, the Suspense fallback on those routes was
 * `null`, meaning the user saw only the app's generic preloader dots
 * for the full duration of the LandingPage chunk fetch (~474 KB
 * gzipped — up to 13s on 3G). This skeleton bridges that gap with a
 * recognisable masthead + hero silhouette so the page feels "loading"
 * instead of "broken".
 *
 * Intentional constraints:
 *  - Zero runtime deps beyond React — must be in the entry chunk.
 *  - Only Tailwind utility classes that are already used elsewhere
 *    on public routes, so no new CSS ships for this component.
 *  - No images — every byte here is bytes we're trying NOT to have
 *    on the critical path.
 *  - No Link/Router hooks — this renders before a route matches.
 */

import type { FC } from 'react'

export const MarketingRouteSkeleton: FC = () => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading MIHAS Admissions"
      className="flex min-h-screen flex-col bg-background"
    >
      {/* Masthead — matches PublicSiteHeader geometry so hydration doesn't shift layout */}
      <header className="border-b border-border/60 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-muted" aria-hidden />
            <div className="h-4 w-40 rounded bg-muted/70" aria-hidden />
          </div>
          <div className="hidden items-center gap-6 sm:flex">
            <div className="h-3 w-16 rounded bg-muted/60" aria-hidden />
            <div className="h-3 w-20 rounded bg-muted/60" aria-hidden />
            <div className="h-9 w-28 rounded-md bg-primary/80" aria-hidden />
          </div>
          <div className="h-9 w-9 rounded-md bg-muted sm:hidden" aria-hidden />
        </div>
      </header>

      {/* Hero silhouette — approximates ShapeLandingHero's above-the-fold shape */}
      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center sm:px-6">
        <div className="h-4 w-32 rounded-full bg-primary/20" aria-hidden />
        <div className="space-y-3">
          <div className="mx-auto h-10 w-72 rounded bg-muted sm:h-12 sm:w-[30rem]" aria-hidden />
          <div className="mx-auto h-10 w-64 rounded bg-muted sm:h-12 sm:w-[24rem]" aria-hidden />
        </div>
        <div className="mx-auto max-w-2xl space-y-2">
          <div className="mx-auto h-3 w-full max-w-md rounded bg-muted/70" aria-hidden />
          <div className="mx-auto h-3 w-3/4 max-w-sm rounded bg-muted/60" aria-hidden />
        </div>
        <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row">
          <div className="h-11 w-40 rounded-md bg-primary/80" aria-hidden />
          <div className="h-11 w-32 rounded-md border border-border bg-background" aria-hidden />
        </div>
      </section>

      <span className="sr-only">Loading page — please wait a moment…</span>
    </div>
  )
}

export default MarketingRouteSkeleton
