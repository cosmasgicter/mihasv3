import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardTitle, Badge } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { OptimizedImage } from '@/components/ui/OptimizedImage'
import {
  AnimatedCounter,
} from '@/components/smoothui'

/** Passthrough wrappers for removed animation components */
const ScrollReveal = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>
const StaggerReveal = ({ children, className }: { children: React.ReactNode; className?: string; staggerDelay?: number }) => <div className={className}>{children}</div>
const StaggerItem = ({ children }: { children: React.ReactNode }) => <>{children}</>
const TextEffect = ({ children }: { children: React.ReactNode; effect?: string }) => <>{children}</>
import { ArrowRight, CheckCircle } from '@/components/icons'
import { preloadAuthRoutes } from '@/lib/routePreload'
import {
  accreditations,
  accommodationHighlights,
  applicationFees,
  eligibilityItems,
  features,
  howItWorksSteps,
  internationalHighlights,
  programs,
  stats,
} from '@/lib/constants/landing'

const deferredSectionStyle = {
  contentVisibility: 'auto',
  containIntrinsicSize: '900px',
} as const

function warmAuthRoutes() {
  void preloadAuthRoutes('landing-section-cta')
}

function StatsSection() {
  return (
    <section
      id="stats"
      aria-label="Key statistics"
      className="scroll-mt-24 border-b border-slate-200 bg-white py-10 sm:scroll-mt-28 sm:py-12 lg:py-14"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <StaggerReveal className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 lg:grid-cols-4" staggerDelay={0.15}>
          {stats.map((stat) => (
            <StaggerItem key={stat.label}>
              <div className="bg-white p-5 sm:p-6">
                <div className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} duration={2} />
                </div>
                <p className="mt-2 text-sm font-medium text-slate-600">{stat.label}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerReveal>
      </div>
    </section>
  )
}

function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="scroll-mt-24 bg-slate-50 py-14 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-10 max-w-3xl sm:mb-12">
          <TextEffect effect="fadeUp">
            <h2 id="features-heading" className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">
              Why students pick MIHAS-KATC
            </h2>
          </TextEffect>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            Because we teach the job, not just the theory.
          </p>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-4 md:grid-cols-3" staggerDelay={0.1}>
          {features.map((feature) => (
            <StaggerItem key={feature.title}>
              <Card className="h-full rounded-lg border border-slate-200 bg-white shadow-sm">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg border border-primary/15 bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <CardTitle className="mb-2 text-lg font-semibold text-slate-950">
                    {feature.title}
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-600">
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
      className="scroll-mt-24 border-y border-slate-200 bg-white py-14 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-10 max-w-3xl sm:mb-12">
          <TextEffect effect="fadeUp">
            <h2 id="how-it-works-heading" className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">
              How the application works
            </h2>
          </TextEffect>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            Four steps, about 30 minutes end-to-end if your documents are ready. You can pause anywhere.
          </p>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4" staggerDelay={0.1}>
          {howItWorksSteps.map((item) => (
            <StaggerItem key={item.step}>
              <Card className="h-full rounded-lg border border-slate-200 bg-white shadow-sm">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {item.step}
                  </div>
                  <CardTitle className="mb-2 text-base font-semibold text-slate-950">
                    {item.title}
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-600">
                    {item.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerReveal>

        <div className="mx-auto mt-10 max-w-3xl rounded-lg border border-slate-200 bg-slate-50 p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Application fees</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {applicationFees.map((fee) => (
              <div key={fee.audience} className="rounded-md border border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-500">{fee.audience}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">{fee.amount}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{fee.note}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Short on cash right now? You can defer payment and still submit — pay before your interview.
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
      className="scroll-mt-24 bg-slate-50 py-14 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-10 max-w-3xl sm:mb-12">
          <TextEffect effect="fadeUp">
            <h2 id="eligibility-heading" className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">
              What you need to apply
            </h2>
          </TextEffect>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            Simple list. If you have these, you qualify to apply. We will tell you the exact grades required for each program once you are in.
          </p>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-4 md:grid-cols-2" staggerDelay={0.1}>
          {eligibilityItems.map((item) => (
            <StaggerItem key={item.title}>
              <Card className="h-full rounded-lg border border-slate-200 bg-white shadow-sm">
                <CardContent className="flex gap-4 p-5 sm:p-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10">
                    <item.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="mb-1 text-base font-semibold text-slate-950">
                      {item.title}
                    </CardTitle>
                    <CardDescription className="text-sm leading-6 text-slate-600">
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
      className="scroll-mt-24 border-y border-slate-200 bg-white py-14 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-10 max-w-3xl">
          <TextEffect effect="fadeUp">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">
              Your diploma gets you registered. Here is who backs it.
            </h2>
          </TextEffect>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            Our graduates work in Zambian hospitals, plus Botswana, Namibia, and South Africa. UNZA affiliation means you can top up to a degree later.
          </p>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" staggerDelay={0.1}>
          {accreditations.map((accred) => (
            <StaggerItem key={accred.title}>
              <Card className="h-full rounded-lg border border-slate-200 bg-white shadow-sm">
                <CardContent className="p-5">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <OptimizedImage
                      src={`/images/accreditation/${accred.logo}`}
                      alt={`${accred.title} logo`}
                      className="h-full w-full object-contain"
                      width={64}
                      height={64}
                    />
                  </div>
                  <CardTitle className="mb-1 text-base font-semibold text-slate-950">
                    {accred.title}
                  </CardTitle>
                  <p className="mb-3 text-xs font-medium text-slate-500">{accred.org}</p>
                  <CardDescription className="text-sm leading-6 text-slate-600">
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
  return (
    <section
      id="programs"
      aria-labelledby="programs-heading"
      className="scroll-mt-24 bg-slate-50 py-14 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-10 max-w-3xl sm:mb-12">
          <TextEffect effect="fadeUp">
            <h2 id="programs-heading" className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">
              Three diplomas. Three career paths.
            </h2>
          </TextEffect>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            Pick the one that matches the work you want to do. You can only apply to one program at a time.
          </p>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-5 lg:grid-cols-2" staggerDelay={0.2}>
          {programs.map((program) => (
            <StaggerItem key={program.institution}>
              <Card className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <CardContent className="p-0">
                  <div className="relative mb-6 overflow-hidden rounded-lg">
                    <OptimizedImage
                      src={program.image}
                      alt={`Photo of ${program.institution} campus and facilities`}
                      className="h-52 w-full object-cover sm:h-60"
                      width={640}
                      height={256}
                      srcSetWidths={[320]}
                      sizes="(min-width: 1024px) 32rem, (min-width: 640px) 80vw, 100vw"
                    />
                    <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                      <Badge className="rounded-md border border-white/40 bg-white text-xs text-slate-950 shadow-sm">
                        {program.highlight}
                      </Badge>
                      <Badge className="rounded-md bg-primary text-xs text-primary-foreground shadow-sm">
                        {program.accreditation}
                      </Badge>
                    </div>
                  </div>
                  <div className="px-5 pb-5 sm:px-6 sm:pb-6">
                    <CardTitle className="mb-4 text-xl font-semibold tracking-tight text-slate-950">
                      {program.institution}
                    </CardTitle>
                    <div className="space-y-3">
                      {program.courses.map((course) => (
                        <div key={course} className="flex items-start space-x-3">
                          <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
                          <span className="text-sm leading-6 text-slate-700 sm:text-base">
                            {course}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6">
                      <Button asChild variant="outline" className="w-full sm:w-auto">
                        <Link
                          to={`/auth/signup?program=${encodeURIComponent(program.institution)}`}
                          onPointerEnter={warmAuthRoutes}
                          onFocus={warmAuthRoutes}
                          onTouchStart={warmAuthRoutes}
                        >
                          Apply to {program.institution.split(' ')[0]}
                          <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                        </Link>
                      </Button>
                    </div>
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

function AccommodationSection() {
  return (
    <section
      id="accommodation"
      aria-labelledby="accommodation-heading"
      className="scroll-mt-24 border-y border-slate-200 bg-white py-14 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-10 max-w-3xl sm:mb-12">
          <TextEffect effect="fadeUp">
            <h2 id="accommodation-heading" className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">
              Coming from out of town? We have a bed for you.
            </h2>
          </TextEffect>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            On-campus accommodation at both campuses. If you are coming from Lusaka, Livingstone, or outside Zambia, you do not need to hunt for a hostel.
          </p>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4" staggerDelay={0.1}>
          {accommodationHighlights.map((item) => (
            <StaggerItem key={item.title}>
              <Card className="h-full rounded-lg border border-slate-200 bg-white shadow-sm">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-primary/15 bg-primary/10">
                    <item.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <CardTitle className="mb-2 text-base font-semibold text-slate-950">
                    {item.title}
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-600">
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
      className="scroll-mt-24 bg-slate-50 py-14 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-10 max-w-3xl sm:mb-12">
          <TextEffect effect="fadeUp">
            <h2 id="international-heading" className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl lg:text-4xl">
              Applying from outside Zambia?
            </h2>
          </TextEffect>
          <p className="mt-3 text-base leading-7 text-slate-600 sm:text-lg">
            MIHAS-KATC welcomes international students. The application is the same portal, in the same place, payable in USD.
          </p>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4" staggerDelay={0.1}>
          {internationalHighlights.map((item) => (
            <StaggerItem key={item.title}>
              <Card className="h-full rounded-lg border border-slate-200 bg-white shadow-sm">
                <CardContent className="p-5 sm:p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-primary/15 bg-primary/10">
                    <item.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  </div>
                  <CardTitle className="mb-2 text-base font-semibold text-slate-950">
                    {item.title}
                  </CardTitle>
                  <CardDescription className="text-sm leading-6 text-slate-600">
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
      className="scroll-mt-24 border-t border-slate-200 bg-slate-950 py-14 sm:scroll-mt-28 sm:py-18 lg:py-20"
      style={deferredSectionStyle}
    >
      <ScrollReveal className="container-responsive grid gap-6 px-4 text-white sm:px-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:text-left lg:px-8">
        <TextEffect effect="fadeUp">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              The current intake is open. You can start tonight.
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Takes about 30 minutes if your documents are ready. K150 for Zambian applicants, USD 20 for international applicants. Mobile money or card — either works.
            </p>
          </div>
        </TextEffect>
        <Button
          asChild
          variant="secondary"
          size="lg"
          className="min-h-[48px] bg-white px-6 font-semibold text-slate-950 shadow-sm hover:bg-slate-100 sm:px-8"
        >
          <Link
            to="/auth/signup"
            onPointerEnter={warmAuthRoutes}
            onFocus={warmAuthRoutes}
            onTouchStart={warmAuthRoutes}
          >
            <span>Start Your Application</span>
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
      <StatsSection />
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
