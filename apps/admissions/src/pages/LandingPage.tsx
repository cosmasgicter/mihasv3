/**
 * LandingPage - Single-source landing sections with SmoothUI animations
 * 
 * @requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9
 * Landing sections are intentionally defined in this page to avoid duplicate block patterns.
 */

import { Suspense, lazy, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { ShapeLandingHero } from '@/components/smoothui/shape-landing-hero';
import { 
  Star, ArrowRight, 
} from '@/components/icons';
import { Seo } from '@/components/seo/Seo';
import { prefersReducedMotion } from '@/lib/animation-config';

const LandingPageSections = lazy(() => import('@/components/landing/LandingPageSections').then((mod) => ({ default: mod.LandingPageSections })));

const landingStructuredData = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'MIHAS-KATC Admissions',
    alternateName: 'Mukuba Institute of Health and Allied Sciences & Kalulushi Training Centre',
    url: '***REMOVED***',
    logo: '***REMOVED***/images/logos/mihas-logo.png',
    email: 'info@mihas.edu.zm',
    telephone: '+260961515151',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'ZM',
      addressLocality: 'Kalulushi',
    },
    sameAs: [
      'https://www.facebook.com/mihaskatc',
      'https://x.com/mihaskatc',
      'https://www.linkedin.com/company/mihaskatc'
    ]
  },
  {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: 'MIHAS-KATC Admissions',
    url: '***REMOVED***',
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
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'MIHAS-KATC Admissions',
    url: '***REMOVED***',
    potentialAction: {
      '@type': 'SearchAction',
      target: '***REMOVED***/track-application?q={search_term_string}',
      'query-input': 'required name=search_term_string'
    }
  }
];

/** Rotating phrases displayed in the hero via TextRotate */
const heroRotatingPhrases = [
  'Nursing Excellence',
  'Clinical Medicine',
  'Pharmacy',
  'Public Health',
];

function LandingSectionsFallback() {
  return (
    <div aria-hidden="true">
      <section className="scroll-mt-24 bg-card py-12 sm:scroll-mt-28 sm:py-16 lg:py-20">
        <div className="container-responsive grid grid-cols-1 gap-6 px-4 xs:grid-cols-2 sm:gap-8 sm:px-6 lg:grid-cols-4 lg:gap-12 lg:px-8">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-3 text-center">
              <div className="mx-auto h-10 w-28 animate-pulse rounded bg-muted sm:h-12 sm:w-32" />
              <div className="mx-auto h-4 w-36 animate-pulse rounded bg-muted/80" />
            </div>
          ))}
        </div>
      </section>
      <section className="bg-muted py-12 sm:py-16 lg:py-20">
        <div className="container-responsive px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-12 max-w-3xl space-y-4 text-center">
            <div className="mx-auto h-8 w-3/4 animate-pulse rounded bg-card sm:h-10" />
            <div className="mx-auto h-5 w-2/3 animate-pulse rounded bg-card/80" />
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-10">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="mb-5 h-16 w-16 animate-pulse rounded-2xl bg-muted" />
                <div className="mb-3 h-6 w-2/3 animate-pulse rounded bg-muted" />
                <div className="space-y-2">
                  <div className="h-4 w-full animate-pulse rounded bg-muted/80" />
                  <div className="h-4 w-11/12 animate-pulse rounded bg-muted/80" />
                  <div className="h-4 w-4/5 animate-pulse rounded bg-muted/80" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function smoothScrollToSection(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'start',
  });
}

export default function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let idleId: number | null = null

    const checkSession = async () => {
      try {
        const [{ authService }, { extractAuthUser, isAdminUser }] = await Promise.all([
          import('@/services/auth'),
          import('@/lib/authSession'),
        ])
        const user = extractAuthUser(await authService.session())
        if (!user || cancelled) {
          return
        }

        navigate(isAdminUser(user) ? '/admin/dashboard' : '/student/dashboard', { replace: true })
      } catch {
        // Expected for logged-out visitors.
      }
    }

    const scheduleCheck = () => {
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(() => {
          void checkSession()
        }, { timeout: 1500 })
        return
      }

      timeoutId = setTimeout(() => {
        void checkSession()
      }, 600)
    }

    scheduleCheck()

    return () => {
      cancelled = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      if (idleId !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId)
      }
    }
  }, [navigate]);

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
      <ShapeLandingHero
        headline="Your Future Starts Here"
        description="Launch your healthcare career with accredited training, transparent admissions, and 92% job placement across Zambia and beyond."
        rotatingPhrases={heroRotatingPhrases}
        primaryCta={{
          label: 'Start Your Application',
          href: '/auth/signup',
          icon: <ArrowRight className="w-5 h-5" />,
        }}
        secondaryCta={{
          label: 'Learn More',
          href: '#features',
          icon: <Star className="w-5 h-5" />,
        }}
        proofPanel={{
          image: {
            src: '/images/programs/mihas-campus.webp',
            alt: 'Students and facilities at the MIHAS-KATC healthcare training campuses',
            width: 640,
            height: 768,
          },
          eyebrow: 'Admissions Snapshot',
          title: 'Real campuses. Accredited pathways. Clear admissions tracking.',
          description: 'Move from first click to confirmed placement with government-recognized programs and live progress visibility.',
          badges: ['NMCZ', 'HPCZ', 'ECZ', 'UNZA'],
          highlights: [
            { value: '2', label: 'campuses' },
            { value: '3', label: 'diploma tracks' },
            { value: 'Live', label: 'status updates' },
          ],
          checklist: [
            'Study across Mukuba Institute and Kalulushi Training Centre facilities.',
            'Apply for Nursing, Clinical Medicine, or Environmental Health from one admissions portal.',
            'Track each admissions milestone online instead of relying on manual follow-up.',
          ],
        }}
      />
      <Suspense fallback={<LandingSectionsFallback />}>
        <LandingPageSections />
      </Suspense>
    </PublicLayout>
  );
}
