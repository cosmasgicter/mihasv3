import React, { useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useInView } from 'react-intersection-observer'
import '@/styles/accreditation.css'
import { Button } from '@/components/ui/Button'
import { MobileNavigation } from '@/components/ui/MobileNavigation'
import { OptimizedImage } from '@/components/ui/OptimizedImage'
import { useIsMobile } from '@/hooks/use-mobile'
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
  const isMobile = useIsMobile()
  const [heroRef, heroInView] = useInView({ threshold: 0.3, triggerOnce: true })
  const [statsRef, statsInView] = useInView({ threshold: 0.3, triggerOnce: true })
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
      gradient: "from-blue-600 to-blue-600/60"
    },
    {
      icon: Award,
      title: "Government Recognized Qualifications",
      description: "NMCZ, HPCZ & ECZ accredited programs accepted by employers across Zambia, SADC region, and internationally",
      gradient: "from-purple-600 to-purple-600/60"
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
    <div className="page-container bg-gradient-to-br from-background via-primary/5 to-secondary/5 overflow-x-hidden">
      <header className="fixed top-0 left-0 right-0 z-50 glass-effect border-b border-white/20 animate-fade-in">
        <div className="content-wrapper">
          <MobileNavigation />
        </div>
      </header>

      {!supabaseAvailable && supabaseStatusMessage && (
        <div className="mt-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto rounded-2xl border border-warning/30 bg-warning/10 p-4 shadow-sm">
            <div className="flex items-start gap-3 text-amber-900">
              <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-semibold">Supabase disabled</p>
                <p className="text-sm leading-relaxed">{supabaseStatusMessage}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-blue-800 opacity-95" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-black/10" />

        <div ref={heroRef} className={`relative z-10 content-wrapper text-center text-white ${heroInView ? 'animate-fade-in-up' : 'opacity-0'}`}>
          <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold mb-6 px-4">
            Your Future Starts Here
          </h1>
          <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl mb-8 max-w-4xl mx-auto leading-relaxed text-white/95 font-medium px-4">
            Launch Your Healthcare Career in Zambia & Beyond – Apply for Accredited Health Sciences Programs with 92% Job Placement Success
          </p>
          <div className={`flex ${isMobile ? 'flex-col px-4' : 'flex-col sm:flex-row'} gap-4 sm:gap-6 justify-center items-center`}>
            <Link to="/auth/signup">
              <Button variant="gradient" size="xl">
                <span className="mr-2">Start Your Application</span>
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Button 
              variant="outline" 
              size="xl" 
              className="border-2 border-white bg-white/10 text-white hover:bg-white hover:text-primary font-semibold backdrop-blur-sm"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <span className="mr-2">Learn More</span>
              <Star className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div 
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2 cursor-pointer animate-bounce"
          onClick={() => document.getElementById('stats')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <div className="w-6 h-10 border-2 border-white rounded-full flex justify-center hover:border-border transition-colors">
            <div className="w-1 h-3 bg-card rounded-full mt-2" />
          </div>
        </div>
      </section>

      <section id="stats" className="py-20 bg-card">
        <div ref={statsRef} className={`content-wrapper ${statsInView ? 'animate-fade-in-up' : 'opacity-0'}`}>
          <div className={`grid ${isMobile ? 'grid-cols-1 gap-6 px-4' : 'grid-cols-2 md:grid-cols-4 gap-8'}`}>
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl sm:text-4xl md:text-5xl font-bold gradient-text mb-2">
                  {stat.number}
                </div>
                <p className="text-sm sm:text-base text-gray-900 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="py-20 bg-muted">
        <div className="content-wrapper">
          <div className="text-center mb-16 animate-fade-in-up">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold gradient-text mb-6 px-4">
              Why Choose MIHAS-KATC for Your Healthcare Career?
            </h2>
            <p className="text-lg sm:text-xl text-gray-900 max-w-3xl mx-auto font-medium px-4">
              Join 300+ successful graduates working across Zambia and internationally
            </p>
          </div>
          
          <div className={`grid ${isMobile ? 'grid-cols-1 gap-6 px-4' : 'md:grid-cols-3 gap-8'}`}>
            {features.map((feature, index) => (
              <div key={index} className="bg-card rounded-lg shadow-lg p-6 text-center group hover:shadow-xl transition-shadow">
                <div className={`bg-gradient-to-br ${feature.gradient} w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg`}>
                  <feature.icon className="h-10 w-10 text-white" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold mb-4 text-gray-900">{feature.title}</h3>
                <p className="text-sm sm:text-base text-gray-900 leading-relaxed font-medium">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-card">
        <div className="content-wrapper">
          <div className="text-center mb-12 animate-fade-in-up">
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold gradient-text mb-4 px-4">
              Qualifications Recognized by Employers Across Zambia & Beyond
            </h2>
            <p className="text-base sm:text-lg text-gray-900 px-4">
              Our graduates are qualified to work in hospitals, clinics, and health organizations throughout Zambia, SADC region, and internationally
            </p>
          </div>
          
          <div className={`grid ${isMobile ? 'grid-cols-1 gap-6 px-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8'}`}>
            {[
              { logo: "GNCLogo.png", title: "NMCZ Accredited", org: "Nursing and Midwifery Council of Zambia", desc: "Graduates qualified for nursing jobs in all Zambian hospitals and clinics" },
              { logo: "hpc_logobig.png", title: "HPCZ Accredited", org: "Health Professions Council of Zambia", desc: "Graduates eligible for clinical officer positions nationwide" },
              { logo: "eczlogo.png", title: "ECZ Recognized", org: "Examinations Council of Zambia", desc: "Environmental health graduates work in government and private sectors" },
              { logo: "unza.jpg", title: "UNZA Affiliated", org: "University of Zambia", desc: "University-level qualifications recognized by international employers" }
            ].map((accred, index) => (
              <div key={index} className="bg-card rounded-lg shadow-lg p-6 text-center border border-border hover:shadow-xl transition-shadow">
                <div className="h-16 w-16 mb-4 flex items-center justify-center bg-muted rounded-lg p-2 mx-auto">
                  <OptimizedImage
                    src={`/images/accreditation/${accred.logo}`}
                    alt={`${accred.title} logo`}
                    className="h-full w-full"
                    loading="lazy"
                  />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">{accred.title}</h3>
                <p className="text-gray-900 text-xs sm:text-sm mb-3">{accred.org}</p>
                <p className="text-xs text-gray-900">{accred.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-card">
        <div className="content-wrapper">
          <div className="text-center mb-16 animate-fade-in-up">
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold gradient-text mb-6 px-4">
              High-Demand Healthcare Jobs Training Programs
            </h2>
            <p className="text-lg sm:text-xl text-gray-900 font-medium px-4">
              Three government-accredited programs with guaranteed job opportunities
            </p>
          </div>
          
          <div className={`grid ${isMobile ? 'grid-cols-1 gap-8 px-4' : 'md:grid-cols-2 gap-12'}`}>
            {programs.map((program, index) => (
              <div key={index} className="bg-card rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
                <div className="relative mb-6">
                  <img
                    src={program.image}
                    alt={`${program.institution} campus`}
                    className="w-full h-48 object-cover rounded-lg"
                    loading="lazy"
                  />
                  <div className="absolute top-4 right-4 space-y-2">
                    <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                      {program.highlight}
                    </div>
                    <div className="bg-success text-white px-3 py-1 rounded-full text-xs font-semibold">
                      {program.accreditation}
                    </div>
                  </div>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold gradient-text mb-4">{program.institution}</h3>
                <div className="space-y-3">
                  {program.courses.map((course, courseIndex) => (
                    <div key={courseIndex} className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                      <span className="text-sm sm:text-base text-gray-900 font-medium">{course}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/20" />
        <div className="relative z-10 content-wrapper text-center text-white">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-6 px-4">
            Ready to Secure Your Healthcare Job in Zambia?
          </h2>
          <p className="text-lg sm:text-xl md:text-2xl mb-8 max-w-3xl mx-auto px-4">
            Applications open now! Join 300+ graduates working in hospitals, clinics, and health organizations
          </p>
          <Link to="/auth/signup">
            <Button variant="outline" size="xl" className="border-2 border-white text-white hover:bg-white hover:text-info-strong">
              <span className="mr-2">Apply Now</span>
              <ArrowRight className="w-6 h-6" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="bg-foreground text-white py-16">
        <div className="content-wrapper">
          <div className="grid md:grid-cols-3 gap-12">
            <div>
              <div className="flex items-center space-x-2 mb-6">
                <GraduationCap className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold gradient-text">MIHAS-KATC</span>
              </div>
              <h3 className="text-xl font-semibold mb-4">Apply Today - Contact Us</h3>
              <div className="space-y-2 text-white/90 text-sm">
                <p><strong>Location:</strong> Mukuba University Campus, Kitwe, Zambia</p>
                <p><strong>KATC:</strong> +260 966 992 299</p>
                <p><strong>MIHAS:</strong> +260 961 515 151</p>
                <p><strong>Email:</strong> info@katc.edu.zm | info@mihas.edu.zm</p>
              </div>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold mb-6">Quick Links</h3>
              <ul className="space-y-3">
                {[
                  { name: 'About Us', href: '#' },
                  { name: 'Programs', href: '#programs' },
                  { name: 'Track Application', href: '/track-application' },
                  { name: 'Contact', href: '#' }
                ].map((link) => (
                  <li key={link.name}>
                    <Link to={link.href} className="text-white/90 hover:text-primary transition-colors flex items-center group">
                      <ArrowRight className="w-4 h-4 mr-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            
            <div>
              <h3 className="text-xl font-semibold mb-6">Follow Us</h3>
              <div className="flex space-x-4">
                {['Facebook', 'Twitter', 'LinkedIn'].map((social) => (
                  <a
                    key={social}
                    href="#"
                    className="text-white/90 hover:text-primary transition-colors px-4 py-2 rounded-lg hover:bg-white/10"
                  >
                    {social}
                  </a>
                ))}
              </div>
            </div>
          </div>
          
          <div className="border-t border-border mt-12 pt-8 text-center">
            <p className="text-white/90 mb-2">&copy; 2025 MIHAS-KATC. All rights reserved.</p>
            <p className="text-white/70">
              Developed with ❤️ by{' '}
              <a href="https://beanola.com" className="gradient-text font-semibold hover:underline">
                Beanola Technologies
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
