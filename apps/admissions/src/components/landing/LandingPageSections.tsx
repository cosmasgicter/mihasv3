import { Link } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/Button'
import { OptimizedImage } from '@/components/ui/OptimizedImage'
import {
  AnimatedCounter,
  ScrollReveal,
  ShinyText,
  StaggerItem,
  StaggerReveal,
  TextEffect,
} from '@/components/smoothui'
import { ArrowRight, CheckCircle } from '@/components/icons'
import { cn } from '@/lib/utils'
import {
  accreditations,
  features,
  programs,
  stats,
} from '@/lib/constants/landing'

const deferredSectionStyle = {
  contentVisibility: 'auto',
  containIntrinsicSize: '900px',
} as const

function StatsSection() {
  return (
    <section
      id="stats"
      aria-label="Key statistics"
      className="scroll-mt-24 bg-card py-12 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <StaggerReveal className="grid grid-cols-1 gap-6 xs:grid-cols-2 sm:gap-8 lg:grid-cols-4 lg:gap-12" staggerDelay={0.15}>
          {stats.map((stat) => (
            <StaggerItem key={stat.label}>
              <div className="text-center">
                <div className="mb-2 text-3xl font-bold gradient-text-primary sm:text-4xl md:text-5xl lg:text-6xl">
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} duration={2} />
                </div>
                <p className="text-sm font-medium text-foreground sm:text-base md:text-lg">{stat.label}</p>
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
      className="scroll-mt-24 bg-muted py-12 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-12 text-center sm:mb-16">
          <TextEffect effect="fadeUp">
            <h2 className="mb-4 text-2xl font-semibold gradient-text-primary sm:mb-6 sm:text-3xl md:text-4xl lg:text-5xl">
              Why Choose <ShinyText text="MIHAS-KATC" className="font-semibold" /> for Your Healthcare Career?
            </h2>
          </TextEffect>
          <p className="mx-auto max-w-3xl text-base font-medium text-muted-foreground sm:text-lg md:text-xl">
            Join 300+ successful graduates working across Zambia and internationally
          </p>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2 lg:grid-cols-3 lg:gap-10" staggerDelay={0.1}>
          {features.map((feature) => (
            <StaggerItem key={feature.title}>
              <Card className="group h-full text-center transition-shadow duration-300 hover:shadow-xl">
                <CardContent className="p-6 sm:p-8">
                  <div
                    className={cn(
                      'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg sm:mb-6 sm:h-20 sm:w-20 lg:h-24 lg:w-24',
                      'group-hover:scale-110 transition-transform duration-300',
                      feature.gradient,
                    )}
                  >
                    <feature.icon className="h-8 w-8 text-white sm:h-10 sm:w-10 lg:h-12 lg:w-12" aria-hidden="true" />
                  </div>
                  <CardTitle className="mb-3 text-lg text-foreground sm:mb-4 sm:text-xl md:text-2xl">
                    {feature.title}
                  </CardTitle>
                  <CardDescription className="text-sm font-medium leading-relaxed text-muted-foreground sm:text-base">
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

function AccreditationSection() {
  return (
    <section
      id="accreditation"
      aria-label="Accreditation and recognition"
      className="scroll-mt-24 bg-card py-12 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-12 text-center">
          <TextEffect effect="fadeUp">
            <h2 className="mb-4 px-4 text-xl font-bold gradient-text-primary sm:text-2xl md:text-3xl lg:text-4xl">
              Qualifications Recognized by Employers Across Zambia & Beyond
            </h2>
          </TextEffect>
          <p className="px-4 text-base text-muted-foreground sm:text-lg">
            Our graduates are qualified to work in hospitals, clinics, and health organizations throughout Zambia, SADC region, and internationally
          </p>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8" staggerDelay={0.1}>
          {accreditations.map((accred) => (
            <StaggerItem key={accred.title}>
              <Card className="group h-full border border-border text-center transition-shadow duration-300 hover:shadow-xl">
                <CardContent className="p-4 sm:p-6">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted p-2 sm:h-16 sm:w-16 group-hover:scale-110 transition-transform duration-300">
                    <OptimizedImage
                      src={`/images/accreditation/${accred.logo}`}
                      alt={`${accred.title} logo`}
                      className="h-full w-full object-contain"
                      width={64}
                      height={64}
                    />
                  </div>
                  <CardTitle className="mb-2 text-base font-bold text-foreground sm:text-lg lg:text-xl">
                    {accred.title}
                  </CardTitle>
                  <p className="mb-3 text-xs text-muted-foreground sm:text-sm">{accred.org}</p>
                  <CardDescription className="text-xs text-muted-foreground sm:text-sm">
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
      className="scroll-mt-24 bg-card py-12 sm:scroll-mt-28 sm:py-16 lg:py-20"
      style={deferredSectionStyle}
    >
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-12 text-center sm:mb-16">
          <TextEffect effect="fadeUp">
            <h2 className="mb-6 px-4 text-2xl font-bold gradient-text-primary sm:text-3xl md:text-4xl lg:text-5xl">
              High-Demand Healthcare Jobs Training Programs
            </h2>
          </TextEffect>
          <p className="px-4 text-base font-medium text-muted-foreground sm:text-lg md:text-xl">
            Three government-accredited programs with proven job opportunities
          </p>
        </ScrollReveal>

        <StaggerReveal className="grid grid-cols-1 gap-8 sm:gap-12 lg:grid-cols-2" staggerDelay={0.2}>
          {programs.map((program) => (
            <StaggerItem key={program.institution}>
              <Card className="group transition-shadow duration-300 hover:shadow-xl">
                <CardContent className="p-6 sm:p-8">
                  <div className="relative mb-6 overflow-hidden rounded-lg">
                    <OptimizedImage
                      src={program.image}
                      alt={`Photo of ${program.institution} campus and facilities`}
                      className="h-48 w-full object-cover transition-transform duration-500 group-hover:scale-105 sm:h-56 lg:h-64"
                      width={640}
                      height={256}
                      srcSetWidths={[320]}
                      sizes="(min-width: 1024px) 32rem, (min-width: 640px) 80vw, 100vw"
                    />
                    <div className="absolute right-4 top-4 space-y-2">
                      <Badge className="bg-gradient-to-r from-primary to-secondary text-xs text-white sm:text-sm">
                        {program.highlight}
                      </Badge>
                      <Badge className="block bg-success text-xs text-success-foreground sm:text-sm">
                        {program.accreditation}
                      </Badge>
                    </div>
                  </div>
                  <CardTitle className="mb-4 text-lg font-bold gradient-text-primary sm:text-xl lg:text-2xl">
                    {program.institution}
                  </CardTitle>
                  <div className="space-y-3">
                    {program.courses.map((course) => (
                      <div key={course} className="flex items-start space-x-3">
                        <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
                        <span className="text-sm font-medium leading-relaxed text-foreground sm:text-base">
                          {course}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6">
                    <Button asChild variant="outline" className="w-full sm:w-auto">
                      <Link to="/auth/signup">
                        Apply to {program.institution.split(' ')[0]}
                        <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
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

function CTASection() {
  return (
    <section
      id="cta"
      aria-label="Apply now"
      className="relative scroll-mt-24 overflow-hidden py-16 sm:scroll-mt-28 sm:py-20 lg:py-24"
      style={deferredSectionStyle}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-primary via-primary/90 to-primary" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/20" />

      <ScrollReveal className="relative z-10 container-responsive px-4 text-center text-white sm:px-6 lg:px-8">
        <TextEffect effect="fadeUp">
          <h2 className="mb-6 px-4 text-2xl font-bold sm:text-3xl md:text-4xl lg:text-5xl">
            Ready to Secure Your Healthcare Job in Zambia?
          </h2>
        </TextEffect>
        <p className="mx-auto mb-8 max-w-3xl px-4 text-base sm:text-lg md:text-xl lg:text-2xl">
          January 2026 intake applications closing soon. Join 300+ graduates working in hospitals, clinics, and health organizations.
        </p>
        <Button
          asChild
          variant="secondary"
          size="xl"
          className="group min-h-[48px] bg-white px-6 font-bold text-primary shadow-lg hover:bg-white/90 sm:px-8"
        >
          <Link to="/auth/signup">
            <span className="mr-2">Apply Now - Start Free</span>
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1 sm:h-6 sm:w-6" aria-hidden="true" />
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
      <AccreditationSection />
      <ProgramsSection />
      <CTASection />
    </>
  )
}

export default LandingPageSections
