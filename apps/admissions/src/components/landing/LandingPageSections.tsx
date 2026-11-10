import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { ArrowRight, CheckCircle } from '@/components/icons'
import { preloadAuthRoutes } from '@/lib/routePreload'
import { useLandingProgrammes } from '@/hooks/useLandingProgrammes'
import { usePortalBrand } from '@/hooks/usePortalBrand'
import { formatDate } from '@/lib/dateFormat'
import { resolveTenantSupportContact } from '@/lib/tenantSupport'
import {
  accreditations,
  accommodationHighlights,
  applicationFees,
  eligibilityItems,
  features,
  howItWorksSteps,
  internationalHighlights,
  LANDING_ACTIONS,
} from '@/lib/constants/landing'

import { StaggerContainer, StaggerItem as MStaggerItem } from '@/components/motion/stagger'
import { ScrollReveal } from '@/components/motion/scroll-reveal'

/** CSS-first wrappers keep the public route out of the framer-motion chunk. */
const StaggerReveal = ({ children, className, staggerDelay = 0 }: { children: React.ReactNode; className?: string; staggerDelay?: number }) => <StaggerContainer className={className} delay={staggerDelay}>{children}</StaggerContainer>
const StaggerItem = ({ children }: { children: React.ReactNode }) => <MStaggerItem>{children}</MStaggerItem>
const TextEffect = ({ children }: { children: React.ReactNode; effect?: string }) => <>{children}</>

const deferredSectionStyle = {
  contentVisibility: 'auto',
  containIntrinsicSize: '900px',
} as const

function warmAuthRoutes() {
  void preloadAuthRoutes('landing-section-cta')
}

function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="scroll-mt-24 bg-muted py-14 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-10 max-w-3xl sm:mb-12">
          <TextEffect effect="fadeUp">
            <h2 id="features-heading" className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Why students pick Beanola
            </h2>
          </TextEffect>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-4 md:grid-cols-3" staggerDelay={0.1}>
          {features.map((feature) => (
            <StaggerItem key={feature.title}>
              <Card className="h-full rounded-lg border border-border bg-card shadow-sm">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-primary/15 bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <CardTitle className="mb-2 text-lg font-semibold text-foreground">
                    {feature.title}
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-muted-foreground">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerReveal>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="scroll-mt-24 border-y border-border bg-card py-14 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-10 max-w-3xl sm:mb-12">
          <TextEffect effect="fadeUp">
            <h2 id="how-it-works-heading" className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              How the application works
            </h2>
          </TextEffect>
          <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-lg">
            Four steps. You can pause anywhere and come back.
          </p>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4" staggerDelay={0.1}>
          {howItWorksSteps.map((item) => (
            <StaggerItem key={item.step}>
              <Card className="h-full rounded-lg border border-border bg-card shadow-sm">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {item.step}
                  </div>
                  <CardTitle className="mb-2 text-base font-semibold text-foreground">
                    {item.title}
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerReveal>

        <div className="mx-auto mt-10 max-w-3xl rounded-lg border border-border bg-muted p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Application fees</p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {applicationFees.map((fee) => (
              <div key={fee.audience} className="rounded-md border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{fee.audience}</p>
                <p className="mt-2 text-4xl font-semibold tracking-tight text-primary">{fee.amount}</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">{fee.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Short on cash right now? You can defer payment and still submit. Pay before your interview.
          </p>
        </div>
      </div>
    </section>
  )
}

function EligibilitySection() {
  return (
    <section
      id="eligibility"
      aria-labelledby="eligibility-heading"
      className="scroll-mt-24 bg-muted py-14 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-10 max-w-3xl sm:mb-12">
          <TextEffect effect="fadeUp">
            <h2 id="eligibility-heading" className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              What you need to apply
            </h2>
          </TextEffect>
          <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-lg">
            Simple list. If you have these, you qualify to apply. We will tell you the exact grades required for each programme once you are in.
          </p>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-4 md:grid-cols-2" staggerDelay={0.1}>
          {eligibilityItems.map((item) => (
            <StaggerItem key={item.title}>
              <Card className="h-full rounded-lg border border-border bg-card shadow-sm">
                <CardContent className="flex gap-4 p-5 sm:p-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10">
                    <item.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="mb-1 text-base font-semibold text-foreground">
                      {item.title}
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-muted-foreground">
                      {item.description}
                    </CardDescription>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerReveal>
      </div>
    </section>
  )
}

function AccreditationSection() {
  return (
    <section
      id="accreditation"
      aria-label="Accreditation and recognition"
      className="scroll-mt-24 border-y border-border bg-card py-14 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-10 max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">Configured by school</p>
          <TextEffect effect="fadeUp">
            <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Each programme carries the school details that matter.
            </h2>
          </TextEffect>
          <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-lg">
            Accreditation, progression, fee, and document wording comes from the institution profile assigned to the programme.
          </p>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" staggerDelay={0.1}>
          {accreditations.map((accred) => (
            <StaggerItem key={accred.title}>
              <Card className="h-full rounded-lg border border-border bg-card shadow-sm">
                <CardContent className="p-5">
                  <CardTitle className="mb-1 text-base font-semibold text-foreground">
                    {accred.title}
                  </CardTitle>
                  <p className="mb-3 text-xs font-medium text-muted-foreground">{accred.org}</p>
                  <CardDescription className="text-sm leading-6 text-muted-foreground">
                    {accred.desc}
                  </CardDescription>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerReveal>
      </div>
    </section>
  )
}

function ProgramsSection() {
  const { rows, isLoading, errorMessage, retry } = useLandingProgrammes()
  const { brandName, supportEmail } = usePortalBrand()
  const support = resolveTenantSupportContact({ supportEmail, brandName })
  return (
    <section
      id="programs"
      aria-labelledby="programs-heading"
      className="scroll-mt-24 bg-muted py-14 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-10 max-w-3xl sm:mb-12">
          <TextEffect effect="fadeUp">
            <h2 id="programs-heading" className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Open programmes
            </h2>
          </TextEffect>
          <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-lg">
            Each programme lists the school and the intake it is open for. You choose your programme and intake when you apply.
          </p>
        </ScrollReveal>
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
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
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
function AccommodationSection() {
  return (
    <section
      id="accommodation"
      aria-labelledby="accommodation-heading"
      className="scroll-mt-24 border-y border-border bg-card py-14 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-10 max-w-3xl sm:mb-12">
          <TextEffect effect="fadeUp">
            <h2 id="accommodation-heading" className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Coming from out of town? Check school housing options early.
            </h2>
          </TextEffect>
          <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-lg">
            Housing is arranged by the school, not through this portal.
          </p>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4" staggerDelay={0.1}>
          {accommodationHighlights.map((item) => (
            <StaggerItem key={item.title}>
              <Card className="h-full rounded-lg border border-border bg-card shadow-sm">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-primary/15 bg-primary/10">
                    <item.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <CardTitle className="mb-2 text-base font-semibold text-foreground">
                    {item.title}
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerReveal>
      </div>
    </section>
  )
}

function InternationalSection() {
  return (
    <section
      id="international"
      aria-labelledby="international-heading"
      className="scroll-mt-24 bg-muted py-14 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-10 max-w-3xl sm:mb-12">
          <TextEffect effect="fadeUp">
            <h2 id="international-heading" className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Applying from outside Zambia?
            </h2>
          </TextEffect>
          <p className="mt-3 text-base leading-7 text-muted-foreground sm:text-lg">
            Beanola welcomes international students. The application is the same portal, in the same place, payable in USD.
          </p>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4" staggerDelay={0.1}>
          {internationalHighlights.map((item) => (
            <StaggerItem key={item.title}>
              <Card className="h-full rounded-lg border border-border bg-card shadow-sm">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-primary/15 bg-primary/10">
                    <item.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <CardTitle className="mb-2 text-base font-semibold text-foreground">
                    {item.title}
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-muted-foreground">
                    {item.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerReveal>
      </div>
    </section>
  )
}

function CTASection() {
  return (
    <section
      id="cta"
      aria-label="Apply now"
      className="scroll-mt-24 border-t border-border bg-foreground py-14 sm:scroll-mt-28 sm:py-18 lg:py-20"
      style={deferredSectionStyle}
    >
      <ScrollReveal className="container-responsive grid gap-6 px-4 text-white sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:text-left lg:px-8">
        <TextEffect effect="fadeUp">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {LANDING_ACTIONS.start}
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-accent sm:text-lg">
              Your application fee is shown before you pay. You can pay by mobile money or card.
            </p>
          </div>
        </TextEffect>
        <Button
          asChild
          size="lg"
          className="min-h-[48px] bg-primary px-6 font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors duration-150 sm:px-8"
        >
          <Link
            to="/auth/signup"
            onPointerEnter={warmAuthRoutes}
            onFocus={warmAuthRoutes}
            onTouchStart={warmAuthRoutes}
          >
            <span>{LANDING_ACTIONS.start}</span>
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </Button>
      </ScrollReveal>
    </section>
  )
}

export function LandingPageSections() {
  return (
    <>
      <FeaturesSection />
      <HowItWorksSection />
      <EligibilitySection />
      <AccreditationSection />
      <ProgramsSection />
      <AccommodationSection />
      <InternationalSection />
      <CTASection />
    </>
  )
}

export default LandingPageSections
