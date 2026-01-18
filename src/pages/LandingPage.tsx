/**
 * LandingPage - Block-based architecture with SmoothUI animations
 * 
 * @requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9
 * Visual redesign with ShadcnBlocks patterns and scroll-triggered animations
 */

import React, { useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ResponsiveHeader } from '@/components/navigation/ResponsiveHeader';
import { Card, CardContent, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/Button';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { PageTransition } from '@/components/smoothui';
import { ScrollReveal, StaggerReveal, StaggerItem, AnimatedCounter } from '@/components/smoothui';
import { 
  GraduationCap, Users, Award, BookOpen, Star, ArrowRight, 
  CheckCircle, AlertTriangle, Mail, Phone, MapPin, Facebook, 
  Twitter, Linkedin 
} from '@/components/icons';
import {
  isSupabaseConfigured,
  SUPABASE_MISSING_CONFIG_MESSAGE,
  SUPABASE_STATUS_EVENT,
  type SupabaseStatusDetail
} from '@/lib/supabase';
import { cn } from '@/lib/utils';
import '@/styles/accreditation.css';

// ============================================================================
// DATA DEFINITIONS - Preserving all existing content
// ============================================================================

const stats = [
  { value: 300, suffix: '+', label: 'Graduates Employed' },
  { value: 92, suffix: '%', label: 'Job Placement Rate' },
  { value: 6, suffix: '+', label: 'Years Training Healthcare Workers' },
  { value: 25, suffix: '+', label: 'Employer Partners Hiring Our Graduates' }
];

const features = [
  {
    icon: Users,
    title: 'Career-Ready Training',
    description: 'Learn from healthcare professionals actively working in Zambian hospitals and clinics. Get mentored by experts who understand the job market',
    gradient: 'from-primary to-primary/60'
  },
  {
    icon: Award,
    title: 'Government Recognized Qualifications',
    description: 'NMCZ, HPCZ & ECZ accredited programs accepted by employers across Zambia, SADC region, and internationally',
    gradient: 'from-secondary to-secondary/60'
  },
  {
    icon: BookOpen,
    title: 'Guaranteed Job Placement Support',
    description: '92% employment rate with direct connections to hospitals, clinics, and health organizations seeking qualified graduates',
    gradient: 'from-accent to-accent/60'
  }
];

const accreditations = [
  { 
    logo: 'GNCLogo.webp', 
    title: 'NMCZ Accredited', 
    org: 'Nursing and Midwifery Council of Zambia', 
    desc: 'Graduates qualified for nursing jobs in all Zambian hospitals and clinics' 
  },
  { 
    logo: 'hpc_logobig.webp', 
    title: 'HPCZ Accredited', 
    org: 'Health Professions Council of Zambia', 
    desc: 'Graduates eligible for clinical officer positions nationwide' 
  },
  { 
    logo: 'eczlogo.webp', 
    title: 'ECZ Recognized', 
    org: 'Examinations Council of Zambia', 
    desc: 'Environmental health graduates work in government and private sectors' 
  },
  { 
    logo: 'unza.webp', 
    title: 'UNZA Affiliated', 
    org: 'University of Zambia', 
    desc: 'University-level qualifications recognized by international employers' 
  }
];

const programs = [
  {
    institution: 'Kalulushi Training Centre',
    courses: [
      'Diploma in Clinical Medicine (HPCZ & UNZA Accredited)',
      'Diploma in Environmental Health (ECZ Certified & UNZA Accredited)'
    ],
    highlight: 'Professional Excellence',
    accreditation: 'HPCZ, ECZ & UNZA Certified',
    image: '/images/programs/katc-campus.webp'
  },
  {
    institution: 'Mukuba Institute of Health and Applied Sciences',
    courses: ['Diploma in Registered Nursing (NMCZ Accredited)'],
    highlight: 'NMCZ Certified',
    accreditation: 'NMCZ Approved',
    image: '/images/programs/mihas-campus.webp'
  }
];

const quickLinks = [
  { name: 'About Us', href: '#' },
  { name: 'Programs', href: '#programs' },
  { name: 'Track Application', href: '/track-application' },
  { name: 'Contact', href: '#' }
];

const socialLinks = [
  { name: 'Facebook', href: '#', icon: Facebook },
  { name: 'Twitter', href: '#', icon: Twitter },
  { name: 'LinkedIn', href: '#', icon: Linkedin }
];

// ============================================================================
// HERO SECTION COMPONENT
// ============================================================================

function HeroSection() {
  const scrollToStats = () => {
    document.getElementById('stats')?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToFeatures = () => {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary via-secondary to-primary opacity-95" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-black/10" />

      {/* Hero content with scroll-triggered animation */}
      <ScrollReveal direction="up" className="relative z-10 container-responsive text-center text-white px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-4 sm:mb-6 leading-tight">
          Your Future Starts Here
        </h1>
        <p className="text-base sm:text-lg md:text-xl lg:text-2xl mb-6 sm:mb-8 max-w-4xl mx-auto leading-relaxed text-white/95 font-medium">
          Launch Your Healthcare Career in Zambia & Beyond – Apply for Accredited Health Sciences Programs with 92% Job Placement Success
        </p>
        <div className="flex flex-col xs:flex-row gap-4 sm:gap-6 justify-center items-center max-w-md xs:max-w-none mx-auto">
          <Link to="/auth/signup" className="w-full xs:w-auto">
            <Button variant="gradient" size="xl" className="w-full xs:w-auto min-h-[48px] px-6 sm:px-8">
              <span className="mr-2">Start Your Application</span>
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <Button 
            variant="outline" 
            size="xl" 
            className="w-full xs:w-auto border-2 border-white bg-white/10 text-white hover:bg-white hover:text-primary font-semibold backdrop-blur-sm min-h-[48px] px-6 sm:px-8"
            onClick={scrollToFeatures}
          >
            <span className="mr-2">Learn More</span>
            <Star className="w-5 h-5" />
          </Button>
        </div>
      </ScrollReveal>

      {/* Scroll indicator */}
      <div 
        className="absolute bottom-8 sm:bottom-12 left-1/2 transform -translate-x-1/2 cursor-pointer animate-bounce touch-target z-20"
        onClick={scrollToStats}
      >
        <div className="w-6 h-10 border-2 border-white rounded-full flex justify-center hover:border-border transition-colors shadow-sm">
          <div className="w-1 h-3 bg-card rounded-full mt-2" />
        </div>
      </div>
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
              <Card className="text-center group hover:shadow-xl transition-all duration-300 h-full" hover>
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
              <Card className="text-center border border-border hover:shadow-xl transition-all duration-300 h-full group" hover>
                <CardContent className="p-4 sm:p-6">
                  <div className="h-12 w-12 sm:h-16 sm:w-16 mb-4 flex items-center justify-center bg-muted rounded-lg p-2 mx-auto group-hover:scale-110 transition-transform duration-300">
                    <OptimizedImage
                      src={`/images/accreditation/${accred.logo}`}
                      alt={`${accred.title} logo`}
                      className="h-full w-full object-contain"
                      loading="lazy"
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
              <Card className="hover:shadow-xl transition-all duration-300 group" hover>
                <CardContent className="p-6 sm:p-8">
                  <div className="relative mb-6 overflow-hidden rounded-lg">
                    <OptimizedImage
                      src={program.image}
                      alt={`${program.institution} campus`}
                      className="w-full h-48 sm:h-56 lg:h-64 group-hover:scale-105 transition-transform duration-500"
                      containerClassName="w-full h-48 sm:h-56 lg:h-64"
                      objectFit="cover"
                      loading="lazy"
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
        <Link to="/auth/signup">
          <Button 
            variant="outline" 
            size="xl" 
            className="border-2 border-white text-white hover:bg-white hover:text-primary min-h-[48px] px-6 sm:px-8 group"
          >
            <span className="mr-2">Apply Now</span>
            <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </ScrollReveal>
    </section>
  );
}

// ============================================================================
// FOOTER SECTION COMPONENT - Contact info, links, social icons
// ============================================================================

function FooterSection() {
  return (
    <footer className="bg-foreground text-white py-12 sm:py-16">
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12">
          {/* Contact Info */}
          <div>
            <div className="flex items-center space-x-2 mb-6">
              <GraduationCap className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              <span className="text-xl sm:text-2xl font-bold gradient-text-primary">MIHAS-KATC</span>
            </div>
            <h3 className="text-lg sm:text-xl font-semibold mb-4">Apply Today - Contact Us</h3>
            <div className="space-y-2 text-white/90 text-sm sm:text-base">
              <p className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-1 flex-shrink-0" />
                <span>President Avenue, Kalulushi, 2-Shaft, Next to KMC</span>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 flex-shrink-0" />
                <span><strong>KATC:</strong> +260 966 992 299</span>
              </p>
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 flex-shrink-0" />
                <span><strong>MIHAS:</strong> +260 961 515 151</span>
              </p>
              <p className="flex items-center gap-2">
                <Mail className="h-4 w-4 flex-shrink-0" />
                <span>info@katc.edu.zm | info@mihas.edu.zm</span>
              </p>
            </div>
          </div>
          
          {/* Quick Links */}
          <div>
            <h3 className="text-lg sm:text-xl font-semibold mb-6">Quick Links</h3>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link 
                    to={link.href} 
                    className="text-white/90 hover:text-primary transition-colors flex items-center group text-sm sm:text-base"
                  >
                    <ArrowRight className="w-4 h-4 mr-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Social Links */}
          <div>
            <h3 className="text-lg sm:text-xl font-semibold mb-6">Follow Us</h3>
            <div className="flex flex-wrap gap-2 sm:gap-4">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  className="text-white/90 hover:text-primary transition-colors px-3 py-2 sm:px-4 sm:py-2 rounded-lg hover:bg-white/10 text-sm sm:text-base min-h-[44px] flex items-center gap-2"
                  aria-label={`Follow us on ${social.name}`}
                >
                  <social.icon className="h-5 w-5" />
                  {social.name}
                </a>
              ))}
            </div>
          </div>
        </div>
        
        {/* Copyright */}
        <div className="border-t border-white/20 mt-8 sm:mt-12 pt-6 sm:pt-8 text-center">
          <p className="text-white/90 mb-2 text-sm sm:text-base">
            &copy; 2025 MIHAS-KATC. All rights reserved.
          </p>
          <p className="text-white/70 text-sm">
            Developed with ❤️ by{' '}
            <a href="https://beanola.com" className="gradient-text-primary font-semibold hover:underline">
              Beanola Technologies
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

// ============================================================================
// MAIN LANDING PAGE COMPONENT
// ============================================================================

export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [supabaseAvailable, setSupabaseAvailable] = React.useState(isSupabaseConfigured);
  const [supabaseStatusMessage, setSupabaseStatusMessage] = React.useState<string | null>(
    isSupabaseConfigured ? null : SUPABASE_MISSING_CONFIG_MESSAGE
  );

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!loading && user) {
      navigate('/student/dashboard');
    }
  }, [user, loading, navigate]);

  // Listen for Supabase status changes
  const handleSupabaseStatus = useCallback((event: Event) => {
    const detail = (event as CustomEvent<SupabaseStatusDetail>).detail;
    if (!detail) return;
    setSupabaseAvailable(detail.available);
    setSupabaseStatusMessage(detail.available ? null : detail.message ?? SUPABASE_MISSING_CONFIG_MESSAGE);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.addEventListener(SUPABASE_STATUS_EVENT, handleSupabaseStatus as EventListener);
    return () => window.removeEventListener(SUPABASE_STATUS_EVENT, handleSupabaseStatus as EventListener);
  }, [handleSupabaseStatus]);

  return (
    <PageTransition mode="fade">
      <div className="min-h-screen bg-background overflow-x-hidden">
        {/* Fixed Header with hide-on-scroll-down behavior */}
        <ResponsiveHeader />

        {/* Supabase Status Warning */}
        {!supabaseAvailable && supabaseStatusMessage && (
          <div className="mt-16 sm:mt-20 container-responsive">
            <Card className="border-warning/30 bg-warning/10">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5 text-warning" aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Supabase disabled</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{supabaseStatusMessage}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Page Sections */}
        <HeroSection />
        <StatsSection />
        <FeaturesSection />
        <AccreditationSection />
        <ProgramsSection />
        <CTASection />
        <FooterSection />
      </div>
    </PageTransition>
  );
}
