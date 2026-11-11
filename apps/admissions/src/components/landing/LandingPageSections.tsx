import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { ArrowRight } from '@/components/icons'
import { preloadAuthRoutes } from '@/lib/routePreload'
import { useLandingProgrammes } from '@/hooks/useLandingProgrammes'
import { usePortalBrand } from '@/hooks/usePortalBrand'
import { formatDate } from '@/lib/dateFormat'
import { resolveTenantSupportContact } from '@/lib/tenantSupport'
import { howItWorksSteps } from '@/lib/constants/landing'
import { requirementItems } from '@/lib/constants/landingRequirements'

/**
 * The landing's three lower sections (D10 option A): open programmes, what you
 * need, and how it works. They are rows and lists on the page surface, never
 * cards, so no card sits inside another (R21.5). Student-facing copy only.
 */
const deferredSectionStyle = {
  contentVisibility: 'auto',
  containIntrinsicSize: '900px',
} as const

function warmAuthRoutes() {
  void preloadAuthRoutes('landing-section-cta')
}

function ProgramsSection() {
  const { rows, isLoading, errorMessage, retry } = useLandingProgrammes()
  const { brandName, supportEmail } = usePortalBrand()
  const support = resolveTenantSupportContact({ supportEmail, brandName })
  return (
    <section
      id="programs"
      aria-labelledby="programs-heading"
      className="scroll-mt-24 bg-muted py-12 sm:scroll-mt-28 sm:py-14 lg:py-16"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-3xl">
          <h2 id="programs-heading" className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Open programmes
          </h2>
          <p className="mt-3 max-w-prose text-base leading-7 text-muted-foreground sm:text-lg">
            Each programme lists the school and the intake it is open for. You choose your programme and intake when you apply.
          </p>
        </div>
        {isLoading ? (
          <p role="status" className="text-base text-muted-foreground">Loading programmes…</p>
        ) : errorMessage ? (
          <div role="alert" className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-base text-foreground">{errorMessage}</p>
            <Button type="button" variant="outline" className="min-h-touch" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-base text-foreground">
              Applications are closed right now. You can track an existing application or contact admissions.
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="outline" className="min-h-touch">
                <Link to="/track-application">Track an application</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-touch">
                {support.isExternal ? (
                  <a href={support.href}>{support.label}</a>
                ) : (
                  <Link to={support.href}>Contact admissions</Link>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {rows.map((row) => {
              const programmeId = `programme-${row.key}-name`
              const schoolId = `programme-${row.key}-school`
              return (
                <li key={row.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div className="min-w-0">
                    <p id={programmeId} className="break-words text-lg font-semibold text-foreground">
                      {row.programmeName}
                    </p>
                    {row.schoolNames.length > 0 && (
                      <p id={schoolId} className="mt-0.5 break-words text-base text-foreground">
                        {row.schoolNames.join(', ')}
                      </p>
                    )}
                    <p className="mt-0.5 text-base text-muted-foreground">
                      {row.intakeName}
                      {row.closesOn ? ` · Applications close ${formatDate(row.closesOn)}` : ''}
                    </p>
                  </div>
                  <Button asChild className="min-h-touch w-full sm:w-auto">
                    <Link
                      to="/auth/signup"
                      aria-describedby={row.schoolNames.length > 0 ? `${programmeId} ${schoolId}` : programmeId}
                      onPointerEnter={warmAuthRoutes}
                      onFocus={warmAuthRoutes}
                      onTouchStart={warmAuthRoutes}
                    >
                      Apply
                      <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
function RequirementsSection() {
  return (
    <section
      id="what-you-need"
      aria-labelledby="what-you-need-heading"
      className="scroll-mt-24 border-y border-border bg-muted py-12 sm:scroll-mt-28 sm:py-14 lg:py-16"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-3xl">
          <h2 id="what-you-need-heading" className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            What you need
          </h2>
          <p className="mt-3 max-w-prose text-base leading-7 text-muted-foreground sm:text-lg">
            Have these ready. Your application tells you the exact grades and documents each programme asks for.
          </p>
        </div>
        <ul className="max-w-3xl divide-y divide-border border-y border-border">
          {requirementItems.map((item) => (
            <li key={item.title} className="flex gap-4 py-4">
              <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <p className="text-base font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 max-w-prose text-base leading-6 text-muted-foreground">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="scroll-mt-24 py-12 sm:scroll-mt-28 sm:py-14 lg:py-16"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-3xl">
          <h2 id="how-it-works-heading" className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            How the application works
          </h2>
          <p className="mt-3 max-w-prose text-base leading-7 text-muted-foreground sm:text-lg">
            Four steps. You can pause anywhere and come back.
          </p>
        </div>
        <ol className="max-w-3xl divide-y divide-border border-y border-border">
          {howItWorksSteps.map((item) => (
            <li key={item.step} className="flex gap-4 py-4">
              <span className="w-6 shrink-0 text-lg font-semibold text-primary" aria-hidden="true">
                {item.step}.
              </span>
              <div>
                <p className="text-base font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 max-w-prose text-base leading-6 text-muted-foreground">{item.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function LandingPageSections() {
  return (
    <>
      <ProgramsSection />
      <RequirementsSection />
      <HowItWorksSection />
    </>
  )
}

export default LandingPageSections
