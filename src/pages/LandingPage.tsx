/**
 * LandingPage - Single-source landing sections with SmoothUI animations
 * 
 * @requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9
 * Landing sections are intentionally defined in this page to avoid duplicate block patterns.
 */

import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui';
import { Badge } from '@/components/ui';
import { Button } from '@/components/ui/Button';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { ScrollReveal, StaggerReveal, StaggerItem, AnimatedCounter } from '@/components/smoothui';
import { 
  Star, ArrowRight, 
  CheckCircle
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { Seo } from '@/components/seo/Seo';
import {
  stats,
  features,
  accreditations,
  programs,
} from '@/lib/constants/landing';
import '@/styles/accreditation.css';

const landingStructuredData = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'MIHAS-KATC Admissions',
    alternateName: 'Mukuba Institute of Health and Allied Sciences & Kalulushi Training Centre',
    url: 'https://apply.mihas.edu.zm',
    logo: 'https://apply.mihas.edu.zm/images/logos/mihas-logo.png',
    email: 'info@mihas.edu.zm',
    telephone: '+260961515151',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'ZM',
      addressLocality: 'Kalulushi',
    },
    sameAs: [
      'https://www.facebook.com/',
      'https://x.com/',
      'https://www.linkedin.com/'
    ]
  },
  {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: 'MIHAS-KATC Admissions',
    url: 'https://apply.mihas.edu.zm',
    educationalCredentialAwarded: [
      'Diploma in Registered Nursing',
      'Diploma in Clinical Medicine',
      'Diploma in Environmental Health'
    ],
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Health Sciences Programs',
      itemListElement: [
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Course',
            name: 'Diploma in Registered Nursing',
            provider: { '@type': 'EducationalOrganization', name: 'Mukuba Institute of Health and Applied Sciences' }
          }
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Course',
            name: 'Diploma in Clinical Medicine',
            provider: { '@type': 'EducationalOrganization', name: 'Kalulushi Training Centre' }
          }
        },
        {
          '@type': 'Offer',
          itemOffered: {
            '@type': 'Course',
            name: 'Diploma in Environmental Health',
            provider: { '@type': 'EducationalOrganization', name: 'Kalulushi Training Centre' }
          }
        }
      ]
    }
  }
];

function smoothScrollToSection(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ============================================================================
// HERO SECTION COMPONENT
// ============================================================================

function HeroSection() {
  const handleInPageAnchor = (event: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    event.preventDefault();
    smoothScrollToSection(sectionId);
    window.history.replaceState({}, '', `#${sectionId}`);
  };

  return (
    <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-secondary to-primary opacity-95" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-black/10" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent_40%)]" />

      {/* Hero content with scroll-triggered animation */}
      <ScrollReveal direction="up" className="relative z-10 container-responsive px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 py-24 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
          <div className="text-center text-white lg:text-left">
            <p className="mb-4 inline-flex items-center rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider backdrop-blur-sm">
              Government Accredited Health Programs
            </p>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 sm:mb-6 leading-tight">
              Your Future Starts Here
            </h1>
            <p className="text-base sm:text-lg md:text-xl mb-6 sm:mb-8 max-w-2xl mx-auto lg:mx-0 leading-relaxed text-white/95 font-medium">
              Launch Your Healthcare Career in Zambia and beyond with MIHAS-KATC admissions, transparent application tracking, and high-demand accredited training.
            </p>
            <div className="flex flex-col xs:flex-row gap-4 sm:gap-6 justify-center lg:justify-start items-center max-w-md xs:max-w-none mx-auto lg:mx-0">
              <Button asChild variant="gradient" size="xl" className="w-full xs:w-auto min-h-[48px] px-6 sm:px-8">
                <Link to="/auth/signup">
                  <span className="mr-2">Start Your Application</span>
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="xl" className="w-full xs:w-auto border-2 border-white bg-white/10 text-white hover:bg-white hover:text-primary font-semibold backdrop-blur-sm min-h-[48px] px-6 sm:px-8">
                <a href="#features" onClick={(event) => handleInPageAnchor(event, 'features')}>
                  <span className="mr-2">Learn More</span>
                  <Star className="w-5 h-5" />
                </a>
              </Button>
            </div>
          </div>

          <div className="mx-auto w-full max-w-xl">
            <div className="relative overflow-hidden rounded-3xl border border-white/25 bg-white/10 p-2 shadow-2xl backdrop-blur-sm">
              <OptimizedImage
                src="/images/programs/mihas-campus.jpg"
                alt="Students studying at the Mukuba Institute of Health and Allied Sciences campus"
                className="h-64 w-full rounded-2xl sm:h-80 lg:h-[420px] object-cover"
                width={1024}
                height={420}
              />

              <div className="pointer-events-none absolute inset-x-6 bottom-6 rounded-2xl border border-white/30 bg-black/40 p-4 backdrop-blur-md">
                <p className="text-sm font-semibold text-white">92% Job Placement Rate</p>
                <p className="text-xs text-white/80">Trusted by hospitals, clinics, and public health institutions.</p>
              </div>
            </div>
          </div>
        </div>
      </ScrollReveal>

      {/* Scroll indicator */}
      <a
        href="#stats"
        className="absolute bottom-8 sm:bottom-12 left-1/2 transform -translate-x-1/2 cursor-pointer animate-bounce touch-target z-20"
        aria-label="Scroll to graduate outcomes"
        onClick={(event) => handleInPageAnchor(event, 'stats')}
      >
        <div className="w-6 h-10 border-2 border-white rounded-full flex justify-center hover:border-border transition-colors shadow-sm">
          <div className="w-1 h-3 bg-card rounded-full mt-2" />
        </div>
      </a>
    </section>
  );
}

// ============================================================================
// STATS SECTION COMPONENT - Animated counters
// ============================================================================

function StatsSection() {
  return (
    <section id="stats" className="py-12 sm:py-16 lg:py-20 bg-card">
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <StaggerReveal className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 lg:gap-12" staggerDelay={0.15}>
          {stats.map((stat, index) => (
            <StaggerItem key={index}>
              <div className="text-center">
                <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold gradient-text-primary mb-2">
                  <AnimatedCounter 
                    value={stat.value} 
                    suffix={stat.suffix} 
                    duration={2}
                  />
                </div>
                <p className="text-sm sm:text-base md:text-lg text-foreground font-medium">{stat.label}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerReveal>
      </div>
    </section>
  );
}

// ============================================================================
// FEATURES SECTION COMPONENT - Icon cards with hover effects
// ============================================================================

function FeaturesSection() {
  return (
    <section id="features" className="py-12 sm:py-16 lg:py-20 bg-muted">
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="text-center mb-12 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold gradient-text-primary mb-4 sm:mb-6">
            Why Choose MIHAS-KATC for Your Healthcare Career?
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto font-medium">
            Join 300+ successful graduates working across Zambia and internationally
          </p>
        </ScrollReveal>
        
        <StaggerReveal className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-10" staggerDelay={0.1}>
          {features.map((feature, index) => (
            <StaggerItem key={index}>
              <Card className="text-center group hover:shadow-xl transition-all duration-300 h-full">
                <CardContent className="p-6 sm:p-8">
                  <div className={cn(
                    'bg-gradient-to-br w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-2xl',
                    'flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-lg',
                    'group-hover:scale-110 transition-transform duration-300',
                    feature.gradient
                  )}>
                    <feature.icon className="h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 text-white" />
                  </div>
                  <CardTitle className="text-lg sm:text-xl md:text-2xl text-foreground mb-3 sm:mb-4">
                    {feature.title}
                  </CardTitle>
                  <CardDescription className="text-sm sm:text-base text-muted-foreground leading-relaxed font-medium">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerReveal>
      </div>
    </section>
  );
}

// ============================================================================
// ACCREDITATION SECTION COMPONENT - Logo cards
// ============================================================================

function AccreditationSection() {
  return (
    <section className="py-12 sm:py-16 lg:py-20 bg-card">
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="text-center mb-12">
          <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold gradient-text-primary mb-4 px-4">
            Qualifications Recognized by Employers Across Zambia & Beyond
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground px-4">
            Our graduates are qualified to work in hospitals, clinics, and health organizations throughout Zambia, SADC region, and internationally
          </p>
        </ScrollReveal>
        
        <StaggerReveal className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8" staggerDelay={0.1}>
          {accreditations.map((accred, index) => (
            <StaggerItem key={index}>
              <Card className="text-center border border-border hover:shadow-xl transition-all duration-300 h-full group">
                <CardContent className="p-4 sm:p-6">
                  <div className="h-12 w-12 sm:h-16 sm:w-16 mb-4 flex items-center justify-center bg-muted rounded-lg p-2 mx-auto group-hover:scale-110 transition-transform duration-300">
                    <OptimizedImage
                      src={`/images/accreditation/${accred.logo}`}
                      alt={`${accred.title} logo`}
                      className="h-full w-full object-contain"
                      width={64}
                      height={64}
                    />
                  </div>
                  <CardTitle className="text-base sm:text-lg lg:text-xl font-bold text-foreground mb-2">
                    {accred.title}
                  </CardTitle>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-3">{accred.org}</p>
                  <CardDescription className="text-xs sm:text-sm text-muted-foreground">
                    {accred.desc}
                  </CardDescription>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerReveal>
      </div>
    </section>
  );
}

// ============================================================================
// PROGRAMS SECTION COMPONENT - Program cards with images
// ============================================================================

function ProgramsSection() {
  return (
    <section id="programs" className="py-12 sm:py-16 lg:py-20 bg-card">
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="text-center mb-12 sm:mb-16">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold gradient-text-primary mb-6 px-4">
            High-Demand Healthcare Jobs Training Programs
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground font-medium px-4">
            Three government-accredited programs with guaranteed job opportunities
          </p>
        </ScrollReveal>
        
        <StaggerReveal className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12" staggerDelay={0.2}>
          {programs.map((program, index) => (
            <StaggerItem key={index}>
              <Card className="hover:shadow-xl transition-all duration-300 group">
                <CardContent className="p-6 sm:p-8">
                  <div className="relative mb-6 overflow-hidden rounded-lg">
                    <OptimizedImage
                      src={program.image}
                      alt={`Photo of ${program.institution} campus and facilities`}
                      className="w-full h-48 sm:h-56 lg:h-64 group-hover:scale-105 transition-transform duration-500 object-cover"
                      width={640}
                      height={256}
                    />
                    <div className="absolute top-4 right-4 space-y-2">
                      <Badge className="bg-gradient-to-r from-primary to-secondary text-white text-xs sm:text-sm">
                        {program.highlight}
                      </Badge>
                      <Badge className="bg-success text-success-foreground text-xs sm:text-sm block">
                        {program.accreditation}
                      </Badge>
                    </div>
                  </div>
                  <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold gradient-text-primary mb-4">
                    {program.institution}
                  </CardTitle>
                  <div className="space-y-3">
                    {program.courses.map((course, courseIndex) => (
                      <div key={courseIndex} className="flex items-start space-x-3">
                        <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm sm:text-base text-foreground font-medium leading-relaxed">
                          {course}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerReveal>
      </div>
    </section>
  );
}

// ============================================================================
// CTA SECTION COMPONENT - Gradient background with animated button
// ============================================================================

function CTASection() {
  return (
    <section className="relative py-16 sm:py-20 lg:py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-primary" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/20" />
      
      <ScrollReveal className="relative z-10 container-responsive px-4 sm:px-6 lg:px-8 text-center text-white">
        <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-6 px-4">
          Ready to Secure Your Healthcare Job in Zambia?
        </h2>
        <p className="text-base sm:text-lg md:text-xl lg:text-2xl mb-8 max-w-3xl mx-auto px-4">
          Applications open now! Join 300+ graduates working in hospitals, clinics, and health organizations
        </p>
        <Button 
          asChild
          variant="outline" 
          size="xl" 
          className="border-2 border-white text-white hover:bg-white hover:text-primary min-h-[48px] px-6 sm:px-8 group"
        >
          <Link to="/auth/signup">
            <span className="mr-2">Apply Now</span>
            <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-1 transition-transform" />
          </Link>
        </Button>
      </ScrollReveal>
    </section>
  );
}

// ============================================================================
// MAIN LANDING PAGE COMPONENT
// ============================================================================

export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect authenticated users to role-appropriate dashboard
  useEffect(() => {
    if (!loading && user) {
      const role = user.role;
      if (role === 'admin' || role === 'super_admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/student/dashboard');
      }
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!location.hash) return;
    const sectionId = location.hash.replace('#', '');
    requestAnimationFrame(() => smoothScrollToSection(sectionId));
  }, [location.hash]);

  return (
    <PublicLayout>
      <Seo
        title="MIHAS-KATC Admissions | Apply to Accredited Health Science Programs"
        description="Apply online to MIHAS-KATC accredited nursing and allied health diploma programs. Track admissions, deadlines, and enrollment updates in one portal."
        path="/"
        structuredData={landingStructuredData}
      />
      <HeroSection />
      <StatsSection />
      <FeaturesSection />
      <AccreditationSection />
      <ProgramsSection />
      <CTASection />
    </PublicLayout>
  );
}
