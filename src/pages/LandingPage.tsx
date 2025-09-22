import React, { lazy, Suspense, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useInView } from 'react-intersection-observer'
import '@/styles/accreditation.css'
import { Button } from '@/components/ui/Button'
import { MobileNavigation } from '@/components/ui/MobileNavigation'
import { OptimizedImage } from '@/components/ui/OptimizedImage'
import { useIsMobile } from '@/hooks/use-mobile'
import { GraduationCap, Users, Award, BookOpen, Star, ArrowRight, CheckCircle } from 'lucide-react'

// Static import for AnimatedCard to avoid chunk conflicts
import { AnimatedCard } from '@/components/ui/AnimatedCard'

// Conditionally load heavy components only when needed
const TypewriterText = lazy(() => import('@/components/ui/TypewriterText'))
const FloatingElements = lazy(() => import('@/components/ui/FloatingElements').then(m => ({ default: m.FloatingElements })))
const GeometricPatterns = lazy(() => import('@/components/ui/FloatingElements').then(m => ({ default: m.GeometricPatterns })))

export default function LandingPageNew() {
  const isMobile = useIsMobile()
  const shouldReduceMotion = useReducedMotion()
  const [heroRef, heroInView] = useInView({ threshold: 0.3, triggerOnce: true })
  const [statsRef, statsInView] = useInView({ threshold: 0.3, triggerOnce: true })
  const [statsBackgroundRef, statsBackgroundInView] = useInView({ threshold: 0.1, triggerOnce: false })
  const [programsBackgroundRef, programsBackgroundInView] = useInView({ threshold: 0.1, triggerOnce: false })
  const [ctaBackgroundRef, ctaBackgroundInView] = useInView({ threshold: 0.1, triggerOnce: false })
  const [footerBackgroundRef, footerBackgroundInView] = useInView({ threshold: 0.1, triggerOnce: false })
  const [showAnimations, setShowAnimations] = useState(false)
  const animationHelpersEnabled = showAnimations && !shouldReduceMotion
  const maybeMotion = <T,>(value: T) => (shouldReduceMotion ? undefined : value)

  const heroFloatingCount = isMobile ? 16 : 30
  const statsFloatingCount = isMobile ? 5 : 10
  const programsFloatingCount = isMobile ? 8 : 15
  const ctaFloatingCount = isMobile ? 12 : 25
  const footerFloatingCount = isMobile ? 4 : 8
  
  useEffect(() => {
    // Defer animations to improve LCP
    const timer = setTimeout(() => setShowAnimations(true), 300)
    return () => clearTimeout(timer)
  }, [])

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: [0.25, 0.25, 0, 1]
      }
    }
  }

  const stats = [
    { number: "300+", label: "Graduates Employed", delay: 0.1 },
    { number: "92%", label: "Job Placement Rate", delay: 0.2 },
    { number: "6+", label: "Years Training Healthcare Workers", delay: 0.3 },
    { number: "25+", label: "Employer Partners Hiring Our Graduates", delay: 0.4 }
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
      image: "/images/programs/katc-campus.webp",
      fallback: "/images/programs/katc-campus.webp"
    },
    {
      institution: "Mukuba Institute of Health and Applied Sciences",
      courses: [
        "Diploma in Registered Nursing (NMCZ Accredited)"
      ],
      highlight: "NMCZ Certified",
      accreditation: "NMCZ Approved",
      image: "/images/programs/mihas-campus.webp",
      fallback: "/images/programs/mihas-campus.webp"
    }
  ]

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Enhanced Header */}
      <motion.header
        className="fixed top-0 left-0 right-0 z-50 glass-effect border-b border-white/20"
        initial={maybeMotion({ y: -100, opacity: 0 })}
        animate={maybeMotion({ y: 0, opacity: 1 })}
        transition={maybeMotion({ duration: 0.6, ease: [0.25, 0.25, 0, 1] })}
      >
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <MobileNavigation />
        </nav>
      </motion.header>

      {/* Enhanced Hero Section */}
      <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-secondary to-accent opacity-95" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-black/10" />
        {animationHelpersEnabled && (
          <Suspense fallback={null}>
            <FloatingElements count={heroFloatingCount} />
            <GeometricPatterns />
          </Suspense>
        )}

        <motion.div
          ref={heroRef}
          className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white"
          variants={shouldReduceMotion ? undefined : containerVariants}
          initial={shouldReduceMotion ? undefined : 'hidden'}
          animate={shouldReduceMotion ? undefined : (heroInView ? 'visible' : 'hidden')}
        >
          <motion.div variants={shouldReduceMotion ? undefined : itemVariants} className="mb-6">
            {animationHelpersEnabled ? (
              <Suspense fallback={<h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold mb-6 px-4 text-center">Your Future Starts Here</h1>}>
                <TypewriterText
                  text="Your Future Starts Here"
                  className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold mb-6 px-4 text-center"
                  delay={1000}
                  speed={100}
                />
              </Suspense>
            ) : (
              <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold mb-6 px-4 text-center">Your Future Starts Here</h1>
            )}
          </motion.div>
          
          <motion.p
            variants={shouldReduceMotion ? undefined : itemVariants}
            className="text-lg sm:text-xl md:text-2xl lg:text-3xl mb-8 max-w-4xl mx-auto leading-relaxed text-white/95 font-medium px-4"
          >
            Launch Your Healthcare Career in Zambia & Beyond – Apply for Accredited Health Sciences Programs with 92% Job Placement Success
          </motion.p>
          
          <motion.div
            variants={shouldReduceMotion ? undefined : itemVariants}
            className={`flex ${isMobile ? 'flex-col px-4' : 'flex-col sm:flex-row'} gap-4 sm:gap-6 justify-center items-center`}
          >
            <Link to="/auth/signup">
              <Button variant="gradient" size="xl" magnetic glow>
                <span className="mr-2">Start Your Application</span>
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Button 
              variant="outline" 
              size="xl" 
              className="border-2 border-white text-white hover:bg-white hover:text-primary font-semibold"
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <span className="mr-2">Learn More</span>
              <Star className="w-5 h-5" />
            </Button>
          </motion.div>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2 cursor-pointer"
          animate={maybeMotion({ y: [0, 10, 0] })}
          transition={maybeMotion({ duration: 2, repeat: Infinity })}
          onClick={() => document.getElementById('stats')?.scrollIntoView({ behavior: 'smooth' })}
        >
          <div className="w-6 h-10 border-2 border-white rounded-full flex justify-center hover:border-gray-200 transition-colors">
            <motion.div
              className="w-1 h-3 bg-white rounded-full mt-2"
              animate={maybeMotion({ y: [0, 12, 0] })}
              transition={maybeMotion({ duration: 2, repeat: Infinity })}
            />
          </div>
        </motion.div>
      </section>

      {/* Stats Section */}
      <section id="stats" ref={statsBackgroundRef} className="py-20 bg-gray-50 relative">
        {animationHelpersEnabled && (
          <Suspense fallback={null}>
            <FloatingElements
              count={statsFloatingCount}
              className="opacity-30"
              shouldAnimate={statsBackgroundInView}
            />
          </Suspense>
        )}
        <motion.div
          ref={statsRef}
          className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
          variants={shouldReduceMotion ? undefined : containerVariants}
          initial={shouldReduceMotion ? undefined : 'hidden'}
          animate={shouldReduceMotion ? undefined : (statsInView ? 'visible' : 'hidden')}
        >
          <div className={`grid ${isMobile ? 'grid-cols-1 gap-6 px-4' : 'grid-cols-2 md:grid-cols-4 gap-8'}`}>
            {stats.map((stat, index) => (
              <motion.div
                key={index}
                variants={shouldReduceMotion ? undefined : itemVariants}
                className="text-center"
                style={{ transitionDelay: `${stat.delay}s` }}
              >
                <motion.div
                  className="text-3xl sm:text-4xl md:text-5xl font-bold gradient-text mb-2"
                  initial={maybeMotion({ scale: 0 })}
                  animate={maybeMotion(statsInView ? { scale: 1 } : { scale: 0 })}
                  transition={maybeMotion({ duration: 0.8, delay: stat.delay, type: "spring" })}
                >
                  {stat.number}
                </motion.div>
                <p className="text-sm sm:text-base text-gray-600 font-medium text-center">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Enhanced Features Section */}
      <section id="features" className="py-20 bg-white relative">
        {animationHelpersEnabled && (
          <Suspense fallback={null}>
            <GeometricPatterns />
          </Suspense>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-16"
            initial={maybeMotion({ opacity: 0, y: 50 })}
            whileInView={maybeMotion({ opacity: 1, y: 0 })}
            viewport={shouldReduceMotion ? undefined : { once: true }}
            transition={maybeMotion({ duration: 0.8 })}
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold gradient-text mb-6 px-4">
              Why Choose MIHAS-KATC for Your Healthcare Career?
            </h2>
            <p className="text-lg sm:text-xl text-gray-700 max-w-3xl mx-auto font-medium px-4">
              Join 300+ successful graduates working across Zambia and internationally. Get job-ready with our accredited programs and industry partnerships
            </p>
          </motion.div>
          
          <div className={`grid ${isMobile ? 'grid-cols-1 gap-6 px-4' : 'md:grid-cols-3 gap-8'}`}>
            {features.map((feature, index) => (
              animationHelpersEnabled ? (
                <AnimatedCard
                  key={index}
                  delay={index * 0.2}
                  direction="up"
                  hover3d={true}
                  gradient={true}
                  className="text-center group"
                >
                  <motion.div
                    className={`bg-gradient-to-br ${feature.gradient} w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg`}
                    whileHover={maybeMotion({ scale: 1.1, rotate: 5 })}
                    transition={maybeMotion({ type: "spring", stiffness: 300 })}
                  >
                    <feature.icon className="h-10 w-10 text-white" />
                  </motion.div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-4 text-gray-900">{feature.title}</h3>
                  <p className="text-sm sm:text-base text-gray-700 leading-relaxed font-medium">
                    {feature.description}
                  </p>
                </AnimatedCard>
              ) : (
                <div key={index} className="bg-white rounded-lg shadow-lg p-6 text-center group">
                  <div className={`bg-gradient-to-br ${feature.gradient} w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg`}>
                    <feature.icon className="h-10 w-10 text-white" />
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold mb-4 text-gray-900">{feature.title}</h3>
                  <p className="text-sm sm:text-base text-gray-700 leading-relaxed font-medium">
                    {feature.description}
                  </p>
                </div>
              )
            ))}
          </div>
        </div>
      </section>

      {/* Accreditation Section */}
      <section className="py-16 bg-white relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-12"
            initial={maybeMotion({ opacity: 0, y: 30 })}
            whileInView={maybeMotion({ opacity: 1, y: 0 })}
            viewport={shouldReduceMotion ? undefined : { once: true }}
            transition={maybeMotion({ duration: 0.6 })}
          >
            <h2 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold gradient-text mb-4 px-4">
              Qualifications Recognized by Employers Across Zambia & Beyond
            </h2>
            <p className="text-base sm:text-lg text-gray-700 px-4">
              Our graduates are qualified to work in hospitals, clinics, and health organizations throughout Zambia, SADC region, and internationally
            </p>
          </motion.div>
          
          <div className={`grid ${isMobile ? 'grid-cols-1 gap-6 px-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8'} items-stretch`}>
            <motion.div
              className="bg-white rounded-lg shadow-lg p-6 text-center border border-gray-100 h-full flex flex-col justify-between"
              initial={maybeMotion({ opacity: 0, y: 30 })}
              whileInView={maybeMotion({ opacity: 1, y: 0 })}
              viewport={shouldReduceMotion ? undefined : { once: true }}
              transition={maybeMotion({ duration: 0.6, delay: 0.1 })}
              whileHover={maybeMotion({ y: -5, shadow: "0 20px 40px rgba(0,0,0,0.1)" })}
            >
              <div className="flex-1 flex flex-col items-center">
                <div className="h-16 w-16 mb-4 flex items-center justify-center bg-gray-50 rounded-lg p-2">
                  <OptimizedImage
                    src="/images/accreditation/GNCLogo.png"
                    alt="Nursing and Midwifery Council of Zambia (NMCZ) official accreditation logo"
                    className="h-full w-full"
                    loading="lazy"
                  />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">NMCZ Accredited</h3>
                <p className="text-gray-600 text-xs sm:text-sm mb-3">
                  Nursing and Midwifery Council of Zambia
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-auto">
                Graduates qualified for nursing jobs in all Zambian hospitals and clinics
              </p>
            </motion.div>
            
            <motion.div
              className="bg-white rounded-lg shadow-lg p-6 text-center border border-gray-100 h-full flex flex-col justify-between"
              initial={maybeMotion({ opacity: 0, y: 30 })}
              whileInView={maybeMotion({ opacity: 1, y: 0 })}
              viewport={shouldReduceMotion ? undefined : { once: true }}
              transition={maybeMotion({ duration: 0.6, delay: 0.2 })}
              whileHover={maybeMotion({ y: -5, shadow: "0 20px 40px rgba(0,0,0,0.1)" })}
            >
              <div className="flex-1 flex flex-col items-center">
                <div className="h-16 w-16 mb-4 flex items-center justify-center bg-gray-50 rounded-lg p-2">
                  <OptimizedImage
                    src="/images/accreditation/hpc_logobig.png"
                    alt="Health Professions Council of Zambia (HPCZ) official accreditation logo"
                    className="h-full w-full"
                    loading="lazy"
                  />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">HPCZ Accredited</h3>
                <p className="text-gray-600 text-xs sm:text-sm mb-3">
                  Health Professions Council of Zambia
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-auto">
                Graduates eligible for clinical officer positions nationwide
              </p>
            </motion.div>
            
            <motion.div
              className="bg-white rounded-lg shadow-lg p-6 text-center border border-gray-100 h-full flex flex-col justify-between"
              initial={maybeMotion({ opacity: 0, y: 30 })}
              whileInView={maybeMotion({ opacity: 1, y: 0 })}
              viewport={shouldReduceMotion ? undefined : { once: true }}
              transition={maybeMotion({ duration: 0.6, delay: 0.3 })}
              whileHover={maybeMotion({ y: -5, shadow: "0 20px 40px rgba(0,0,0,0.1)" })}
            >
              <div className="flex-1 flex flex-col items-center">
                <div className="h-16 w-16 mb-4 flex items-center justify-center bg-gray-50 rounded-lg p-2">
                  <OptimizedImage
                    src="/images/accreditation/eczlogo.png"
                    alt="Examinations Council of Zambia (ECZ) official certification logo"
                    className="h-full w-full"
                    loading="lazy"
                  />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">ECZ Recognized</h3>
                <p className="text-gray-600 text-xs sm:text-sm mb-3">
                  Examinations Council of Zambia
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-auto">
                Environmental health graduates work in government and private sectors
              </p>
            </motion.div>
            
            <motion.div
              className="bg-white rounded-lg shadow-lg p-6 text-center border border-gray-100 h-full flex flex-col justify-between"
              initial={maybeMotion({ opacity: 0, y: 30 })}
              whileInView={maybeMotion({ opacity: 1, y: 0 })}
              viewport={shouldReduceMotion ? undefined : { once: true }}
              transition={maybeMotion({ duration: 0.6, delay: 0.4 })}
              whileHover={maybeMotion({ y: -5, shadow: "0 20px 40px rgba(0,0,0,0.1)" })}
            >
              <div className="flex-1 flex flex-col items-center">
                <div className="h-16 w-16 mb-4 flex items-center justify-center bg-gray-50 rounded-lg p-2">
                  <OptimizedImage
                    src="/images/accreditation/unza.jpg"
                    alt="University of Zambia (UNZA) official affiliation logo"
                    className="h-full w-full rounded"
                    loading="lazy"
                  />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">UNZA Affiliated</h3>
                <p className="text-gray-600 text-xs sm:text-sm mb-3">
                  University of Zambia
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-auto">
                University-level qualifications recognized by international employers
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Enhanced Programs Section */}
      <section ref={programsBackgroundRef} className="py-20 bg-gray-50 relative">
        {animationHelpersEnabled && (
          <Suspense fallback={null}>
            <FloatingElements
              count={programsFloatingCount}
              shouldAnimate={programsBackgroundInView}
            />
          </Suspense>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="text-center mb-16"
            initial={maybeMotion({ opacity: 0, y: 50 })}
            whileInView={maybeMotion({ opacity: 1, y: 0 })}
            viewport={shouldReduceMotion ? undefined : { once: true }}
            transition={maybeMotion({ duration: 0.8 })}
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold gradient-text mb-6 px-4">
              High-Demand Healthcare Jobs Training Programs
            </h2>
            <p className="text-lg sm:text-xl text-gray-700 font-medium px-4">
              Three government-accredited programs with guaranteed job opportunities in Zambia's growing healthcare sector
            </p>
          </motion.div>
          
          <div className={`grid ${isMobile ? 'grid-cols-1 gap-8 px-4' : 'md:grid-cols-2 gap-12'}`}>
            {programs.map((program, index) => (
              animationHelpersEnabled ? (
                <AnimatedCard
                  key={index}
                  delay={index * 0.3}
                  direction={index % 2 === 0 ? 'left' : 'right'}
                  hover3d={true}
                  className="overflow-hidden"
                >
                    <div className="relative">
                      <motion.picture
                        className="w-full h-48 rounded-lg mb-6 overflow-hidden"
                        whileHover={maybeMotion({ scale: 1.05 })}
                        transition={maybeMotion({ duration: 0.3 })}
                      >
                        <source srcSet={program.image} type="image/webp" />
                        <motion.img
                          src={program.fallback}
                          alt={`${program.institution} campus facility and learning environment`}
                          className="w-full h-48 object-cover"
                          loading="lazy"
                          width="400"
                          height="192"
                        />
                      </motion.picture>
                      <div className="absolute top-4 right-4 space-y-2">
                        <motion.div
                          className="bg-gradient-to-r from-primary to-secondary text-white px-3 py-1 rounded-full text-xs font-semibold"
                          whileHover={maybeMotion({ scale: 1.1 })}
                        >
                          {program.highlight}
                        </motion.div>
                        <motion.div
                          className="bg-green-600 text-white px-3 py-1 rounded-full text-xs font-semibold"
                          whileHover={maybeMotion({ scale: 1.1 })}
                        >
                          {program.accreditation}
                        </motion.div>
                      </div>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold gradient-text mb-4">
                      {program.institution}
                    </h3>
                    <div className="space-y-3">
                      {program.courses.map((course, courseIndex) => (
                        <motion.div
                          key={courseIndex}
                          className="flex items-center space-x-3"
                          initial={maybeMotion({ opacity: 0, x: -20 })}
                          whileInView={maybeMotion({ opacity: 1, x: 0 })}
                          viewport={shouldReduceMotion ? undefined : { once: true }}
                          transition={maybeMotion({ delay: courseIndex * 0.1 })}
                        >
                          <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                          <span className="text-sm sm:text-base text-gray-800 font-medium">{course}</span>
                        </motion.div>
                      ))}
                    </div>
                </AnimatedCard>
              ) : (
                <div key={index} className="bg-white rounded-lg shadow-lg p-6 overflow-hidden">
                  <div className="relative">
                    <picture className="w-full h-48 rounded-lg mb-6 overflow-hidden block">
                      <source srcSet={program.image} type="image/webp" />
                      <img
                        src={program.fallback}
                        alt={`${program.institution} campus facility and learning environment`}
                        className="w-full h-48 object-cover"
                        loading="lazy"
                        width="400"
                        height="192"
                      />
                    </picture>
                    <div className="absolute top-4 right-4 space-y-2">
                      <div className="bg-gradient-to-r from-primary to-secondary text-white px-3 py-1 rounded-full text-xs font-semibold">
                        {program.highlight}
                      </div>
                      <div className="bg-green-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                        {program.accreditation}
                      </div>
                    </div>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold gradient-text mb-4">
                    {program.institution}
                  </h3>
                  <div className="space-y-3">
                    {program.courses.map((course, courseIndex) => (
                      <div key={courseIndex} className="flex items-center space-x-3">
                        <CheckCircle className="h-5 w-5 text-primary flex-shrink-0" />
                        <span className="text-sm sm:text-base text-gray-800 font-medium">{course}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      </section>

      {/* Enhanced CTA Section */}
      <section ref={ctaBackgroundRef} className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-accent" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/20" />
        {animationHelpersEnabled && (
          <Suspense fallback={null}>
            <FloatingElements
              count={ctaFloatingCount}
              shouldAnimate={ctaBackgroundInView}
            />
            <GeometricPatterns />
          </Suspense>
        )}

        <motion.div
          className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white"
          initial={maybeMotion({ opacity: 0, scale: 0.9 })}
          whileInView={maybeMotion({ opacity: 1, scale: 1 })}
          viewport={shouldReduceMotion ? undefined : { once: true }}
          transition={maybeMotion({ duration: 0.8 })}
        >
          <motion.h2
            className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-6 px-4"
            animate={maybeMotion({ y: [0, -5, 0] })}
            transition={maybeMotion({ duration: 4, repeat: Infinity })}
          >
            Ready to Secure Your Healthcare Job in Zambia?
          </motion.h2>
          <motion.p
            className="text-lg sm:text-xl md:text-2xl mb-8 max-w-3xl mx-auto px-4"
            animate={maybeMotion({ y: [0, 5, 0] })}
            transition={maybeMotion({ duration: 4, repeat: Infinity, delay: 0.5 })}
          >
            Applications open now! Join 300+ graduates working in hospitals, clinics, and health organizations across Zambia and beyond
          </motion.p>
          <motion.div
            whileHover={maybeMotion({ scale: 1.05 })}
            whileTap={maybeMotion({ scale: 0.95 })}
          >
            <Link to="/auth/signup">
              <Button variant="outline" size="xl" className="border-2 border-white text-white hover:bg-white hover:text-primary" magnetic>
                <span className="mr-2">Apply Now</span>
                <ArrowRight className="w-6 h-6" />
              </Button>
            </Link>
          </motion.div>
        </motion.div>
      </section>

      {/* Enhanced Footer */}
      <footer ref={footerBackgroundRef} className="bg-gray-900 text-white py-16 relative">
        {animationHelpersEnabled && (
          <Suspense fallback={null}>
            <FloatingElements
              count={footerFloatingCount}
              className="opacity-20"
              shouldAnimate={footerBackgroundInView}
            />
          </Suspense>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="grid md:grid-cols-3 gap-12"
            variants={shouldReduceMotion ? undefined : containerVariants}
            initial={shouldReduceMotion ? undefined : 'hidden'}
            whileInView={shouldReduceMotion ? undefined : 'visible'}
            viewport={shouldReduceMotion ? undefined : { once: true }}
          >
            <motion.div variants={shouldReduceMotion ? undefined : itemVariants}>
              <motion.div
                className="flex items-center space-x-2 mb-6"
                whileHover={maybeMotion({ scale: 1.05 })}
              >
                <GraduationCap className="h-8 w-8 text-primary" />
                <span className="text-2xl font-bold gradient-text">MIHAS-KATC</span>
              </motion.div>
              <h3 className="text-xl font-semibold mb-4">Apply Today - Contact Us</h3>
              <div className="space-y-2 text-gray-300">
                <p><strong>Location:</strong> Mukuba University Campus, Kitwe, Copperbelt Province, Zambia</p>
                <p><strong>Applications:</strong> Open for Zambian & International Students</p>
                <p><strong>KATC:</strong> +260 966 992 299</p>
                <p><strong>MIHAS:</strong> +260 961 515 151</p>
                <p><strong>Email:</strong> info@katc.edu.zm | info@mihas.edu.zm</p>
                <p><strong>Career Support:</strong> info@mihas.edu.zm | info@katc.edu.zm</p>
              </div>
            </motion.div>
            
            <motion.div variants={shouldReduceMotion ? undefined : itemVariants}>
              <h3 className="text-xl font-semibold mb-6">Quick Links</h3>
              <ul className="space-y-3">
                {[
                  { name: 'About Us', href: '#' },
                  { name: 'Programs', href: '#programs' },
                  { name: 'Track Application', href: '/track-application' },
                  { name: 'Contact', href: '#' }
                ].map((link, index) => (
                  <motion.li
                    key={link.name}
                    initial={maybeMotion({ opacity: 0, x: -20 })}
                    whileInView={maybeMotion({ opacity: 1, x: 0 })}
                    viewport={shouldReduceMotion ? undefined : { once: true }}
                    transition={maybeMotion({ delay: index * 0.1 })}
                  >
                    <Link to={link.href} className="text-gray-300 hover:text-primary transition-colors duration-300 flex items-center group">
                      <ArrowRight className="w-4 h-4 mr-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      {link.name}
                    </Link>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
            
            <motion.div variants={shouldReduceMotion ? undefined : itemVariants}>
              <h3 className="text-xl font-semibold mb-6">Follow Us</h3>
              <div className="flex space-x-4">
                {['Facebook', 'Twitter', 'LinkedIn'].map((social, index) => (
                  <motion.a
                    key={social}
                    href="#"
                    className="text-gray-300 hover:text-primary transition-colors duration-300 px-4 py-2 rounded-lg hover:bg-primary/10"
                    whileHover={maybeMotion({ scale: 1.1 })}
                    whileTap={maybeMotion({ scale: 0.9 })}
                    initial={maybeMotion({ opacity: 0, y: 20 })}
                    whileInView={maybeMotion({ opacity: 1, y: 0 })}
                    viewport={shouldReduceMotion ? undefined : { once: true }}
                    transition={maybeMotion({ delay: index * 0.1 })}
                  >
                    {social}
                  </motion.a>
                ))}
              </div>
            </motion.div>
          </motion.div>
          
          <motion.div
            className="border-t border-gray-700 mt-12 pt-8 text-center"
            initial={maybeMotion({ opacity: 0, y: 20 })}
            whileInView={maybeMotion({ opacity: 1, y: 0 })}
            viewport={shouldReduceMotion ? undefined : { once: true }}
          >
            <p className="text-gray-300 mb-2">&copy; 2025 MIHAS-KATC. All rights reserved.</p>
            <p className="text-gray-400">
              Developed with ❤️ by{' '}
              <motion.a
                href="https://beanola.com"
                className="gradient-text font-semibold"
                whileHover={maybeMotion({ scale: 1.05 })}
              >
                Beanola Technologies
              </motion.a>
            </p>
          </motion.div>
        </div>
      </footer>
    </div>
  )
}