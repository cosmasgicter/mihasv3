import React, { useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useInView } from 'react-intersection-observer'
import '@/styles/accreditation.css'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MobileNavigation } from '@/components/ui/MobileNavigation'
import { OptimizedImage } from '@/components/ui/OptimizedImage'
import { useAuth } from '@/contexts/AuthContext'
import { GraduationCap, Users, Award, BookOpen, Star, ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react'
import {
  isSupabaseConfigured,
  SUPABASE_MISSING_CONFIG_MESSAGE,
  SUPABASE_STATUS_EVENT,
  type SupabaseStatusDetail
} from '@/lib/supabase'

export default function LandingPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [heroRef, heroInView] = useInView({ threshold: 0.3, triggerOnce: true })
  const [statsRef, statsInView] = useInView({ threshold: 0.3, triggerOnce: true })
  const [featuresRef, featuresInView] = useInView({ threshold: 0.2, triggerOnce: true })
  const [supabaseAvailable, setSupabaseAvailable] = React.useState(isSupabaseConfigured)
  const [supabaseStatusMessage, setSupabaseStatusMessage] = React.useState<string | null>(
    isSupabaseConfigured ? null : SUPABASE_MISSING_CONFIG_MESSAGE
  )

  useEffect(() => {
    if (!loading && user) {
      navigate('/student/dashboard')
    }
  }, [user, loading, navigate])

  const handleSupabaseStatus = useCallback((event: Event) => {
    const detail = (event as CustomEvent<SupabaseStatusDetail>).detail
    if (!detail) return
    setSupabaseAvailable(detail.available)
    setSupabaseStatusMessage(detail.available ? null : detail.message ?? SUPABASE_MISSING_CONFIG_MESSAGE)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.addEventListener(SUPABASE_STATUS_EVENT, handleSupabaseStatus as EventListener)
    return () => window.removeEventListener(SUPABASE_STATUS_EVENT, handleSupabaseStatus as EventListener)
  }, [handleSupabaseStatus])

  const stats = [
    { number: "300+", label: "Graduates Employed" },
    { number: "92%", label: "Job Placement Rate" },
    { number: "6+", label: "Years Training Healthcare Workers" },
    { number: "25+", label: "Employer Partners Hiring Our Graduates" }
  ]

  const features = [
    {
      icon: Users,
      title: "Career-Ready Training",
      description: "Learn from healthcare professionals actively working in Zambian hospitals and clinics. Get mentored by experts who understand the job market",
      gradient: "from-primary to-primary/60"
    },
    {
      icon: Award,
      title: "Government Recognized Qualifications",
      description: "NMCZ, HPCZ & ECZ accredited programs accepted by employers across Zambia, SADC region, and internationally",
      gradient: "from-secondary to-secondary/60"
    },
    {
      icon: BookOpen,
      title: "Guaranteed Job Placement Support",
      description: "92% employment rate with direct connections to hospitals, clinics, and health organizations seeking qualified graduates",
      gradient: "from-accent to-accent/60"
    }
  ]

  const programs = [
    {
      institution: "Kalulushi Training Centre",
      courses: [
        "Diploma in Clinical Medicine (HPCZ & UNZA Accredited)",
        "Diploma in Environmental Health (ECZ Certified & UNZA Accredited)"
      ],
      highlight: "Professional Excellence",
      accreditation: "HPCZ, ECZ & UNZA Certified",
      image: "/images/programs/katc-campus.webp"
    },
    {
      institution: "Mukuba Institute of Health and Applied Sciences",
      courses: ["Diploma in Registered Nursing (NMCZ Accredited)"],
      highlight: "NMCZ Certified",
      accreditation: "NMCZ Approved",
      image: "/images/programs/mihas-campus.webp"
    }
  ]

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="container-responsive">
          <MobileNavigation />
        </div>
      </header>

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

      <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-secondary to-primary opacity-95" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-black/10" />

        <div ref={heroRef} className={`relative z-10 container-responsive text-center text-white px-4 sm:px-6 lg:px-8 ${heroInView ? 'animate-fade-in-up' : 'opacity-0'}`}>
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
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <span className="mr-2">Learn More</span>
              <Star className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div 
          className="absolute bottom-4 sm:bottom-8 left-1/2 transform -translate-x-1/2 cursor-pointer animate-bounce touch-target"
          onClick={() => document.getElementById('stats')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <div className="w-6 h-10 border-2 border-white rounded-full flex justify-center hover:border-border transition-colors">
            <div className="w-1 h-3 bg-card rounded-full mt-2" />
          </div>
        </div>
      </section>

      <section id="stats" className="py-12 sm:py-16 lg:py-20 bg-card">
        <div ref={statsRef} className={`container-responsive px-4 sm:px-6 lg:px-8 ${statsInView ? 'animate-fade-in-up' : 'opacity-0'}`}>
          <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 lg:gap-12">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold gradient-text-primary mb-2">
                  {stat.number}
                </div>
                <p className="text-sm sm:text-base md:text-lg text-foreground font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="py-12 sm:py-16 lg:py-20 bg-muted">
        <div className="container-responsive px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16 animate-fade-in-up">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold gradient-text-primary mb-4 sm:mb-6">
              Why Choose MIHAS-KATC for Your Healthcare Career?
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto font-medium">
              Join 300+ successful graduates working across Zambia and internationally
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-10">
            {features.map((feature, index) => (
              <Card key={index} className="text-center group hover:shadow-xl transition-shadow" hover>
                <CardContent className="p-6 sm:p-8">
                  <div className={`bg-gradient-to-br ${feature.gradient} w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-lg`}>
                    <feature.icon className="h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 text-white" />
                  </div>
                  <CardTitle className="text-lg sm:text-xl md:text-2xl text-foreground mb-3 sm:mb-4">{feature.title}</CardTitle>
                  <CardDescription className="text-sm sm:text-base text-muted-foreground leading-relaxed font-medium">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20 bg-card">
        <div className="container-responsive px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 animate-fade-in-up">
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold gradient-text-primary mb-4 px-4">
              Qualifications Recognized by Employers Across Zambia & Beyond
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground px-4">
              Our graduates are qualified to work in hospitals, clinics, and health organizations throughout Zambia, SADC region, and internationally
            </p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {[
              { logo: "GNCLogo.webp", title: "NMCZ Accredited", org: "Nursing and Midwifery Council of Zambia", desc: "Graduates qualified for nursing jobs in all Zambian hospitals and clinics" },
              { logo: "hpc_logobig.webp", title: "HPCZ Accredited", org: "Health Professions Council of Zambia", desc: "Graduates eligible for clinical officer positions nationwide" },
              { logo: "eczlogo.webp", title: "ECZ Recognized", org: "Examinations Council of Zambia", desc: "Environmental health graduates work in government and private sectors" },
              { logo: "unza.webp", title: "UNZA Affiliated", org: "University of Zambia", desc: "University-level qualifications recognized by international employers" }
            ].map((accred, index) => (
              <Card key={index} className="text-center border border-border hover:shadow-xl transition-shadow" hover>
                <CardContent className="p-4 sm:p-6">
                  <div className="h-12 w-12 sm:h-16 sm:w-16 mb-4 flex items-center justify-center bg-muted rounded-lg p-2 mx-auto">
                    <OptimizedImage
                      src={`/images/accreditation/${accred.logo}`}
                      alt={`${accred.title} logo`}
                      className="h-full w-full object-contain"
                      loading="lazy"
                      width={64}
                      height={64}
                    />
                  </div>
                  <CardTitle className="text-base sm:text-lg lg:text-xl font-bold text-foreground mb-2">{accred.title}</CardTitle>
                  <p className="text-muted-foreground text-xs sm:text-sm mb-3">{accred.org}</p>
                  <CardDescription className="text-xs sm:text-sm text-muted-foreground">{accred.desc}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 lg:py-20 bg-card">
        <div className="container-responsive px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16 animate-fade-in-up">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold gradient-text-primary mb-6 px-4">
              High-Demand Healthcare Jobs Training Programs
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground font-medium px-4">
              Three government-accredited programs with guaranteed job opportunities
            </p>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12">
            {programs.map((program, index) => (
              <Card key={index} className="hover:shadow-xl transition-shadow" hover>
                <CardContent className="p-6 sm:p-8">
                  <div className="relative mb-6">
                    <img
                      src={program.image}
                      alt={`${program.institution} campus`}
                      className="w-full h-48 sm:h-56 lg:h-64 object-cover rounded-lg"
                      loading="lazy"
                    />
                    <div className="absolute top-4 right-4 space-y-2">
                      <Badge className="bg-gradient-to-r from-primary to-secondary text-white text-xs sm:text-sm">
                        {program.highlight}
                      </Badge>
                      <Badge className="bg-success text-success-foreground text-xs sm:text-sm">
                        {program.accreditation}
                      </Badge>
                    </div>
                  </div>
                  <CardTitle className="text-lg sm:text-xl lg:text-2xl font-bold gradient-text-primary mb-4">{program.institution}</CardTitle>
                  <div className="space-y-3">
                    {program.courses.map((course, courseIndex) => (
                      <div key={courseIndex} className="flex items-start space-x-3">
                        <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                        <span className="text-sm sm:text-base text-foreground font-medium leading-relaxed">{course}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-16 sm:py-20 lg:py-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-primary" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/20" />
        <div className="relative z-10 container-responsive px-4 sm:px-6 lg:px-8 text-center text-white">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-6 px-4">
            Ready to Secure Your Healthcare Job in Zambia?
          </h2>
          <p className="text-base sm:text-lg md:text-xl lg:text-2xl mb-8 max-w-3xl mx-auto px-4">
            Applications open now! Join 300+ graduates working in hospitals, clinics, and health organizations
          </p>
          <Link to="/auth/signup">
            <Button variant="outline" size="xl" className="border-2 border-white text-white hover:bg-white hover:text-primary min-h-[48px] px-6 sm:px-8">
              <span className="mr-2">Apply Now</span>
              <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="bg-foreground text-white py-12 sm:py-16">
        <div className="container-responsive px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12">
            <div>
              <div className="flex items-center space-x-2 mb-6">
                <GraduationCap className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
                <span className="text-xl sm:text-2xl font-bold gradient-text-primary">MIHAS-KATC</span>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold mb-4">Apply Today - Contact Us</h3>
              <div className="space-y-2 text-white/90 text-sm sm:text-base">
                <p><strong>Location:</strong> President Avenue, Kalulushi, 2-Shaft, Next to KMC</p>
                <p><strong>KATC:</strong> +260 966 992 299</p>
                <p><strong>MIHAS:</strong> +260 961 515 151</p>
                <p><strong>Email:</strong> info@katc.edu.zm | info@mihas.edu.zm</p>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg sm:text-xl font-semibold mb-6">Quick Links</h3>
              <ul className="space-y-3">
                {[
                  { name: 'About Us', href: '#' },
                  { name: 'Programs', href: '#programs' },
                  { name: 'Track Application', href: '/track-application' },
                  { name: 'Contact', href: '#' }
                ].map((link) => (
                  <li key={link.name}>
                    <Link to={link.href} className="text-white/90 hover:text-primary transition-colors flex items-center group text-sm sm:text-base">
                      <ArrowRight className="w-4 h-4 mr-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg sm:text-xl font-semibold mb-6">Follow Us</h3>
              <div className="flex flex-wrap gap-2 sm:gap-4">
                {['Facebook', 'Twitter', 'LinkedIn'].map((social) => (
                  <a
                    key={social}
                    href="#"
                    className="text-white/90 hover:text-primary transition-colors px-3 py-2 sm:px-4 sm:py-2 rounded-lg hover:bg-white/10 text-sm sm:text-base min-h-[44px] flex items-center"
                  >
                    {social}
                  </a>
                ))}
              </div>
            </div>
          </div>
          
          <div className="border-t border-white/20 mt-8 sm:mt-12 pt-6 sm:pt-8 text-center">
            <p className="text-white/90 mb-2 text-sm sm:text-base">&copy; 2025 MIHAS-KATC. All rights reserved.</p>
            <p className="text-white/70 text-sm">
              Developed with ❤️ by{' '}
              <a href="https://beanola.com" className="gradient-text-primary font-semibold hover:underline">
                Beanola Technologies
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
