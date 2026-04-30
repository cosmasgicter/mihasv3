/**
 * LandingPage - Single-source landing sections with SmoothUI animations
 * 
 * @requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9
 * Landing sections are intentionally defined in this page to avoid duplicate block patterns.
 */

import { Suspense, lazy, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { ShapeLandingHero } from '@/components/smoothui/shape-landing-hero';
import { 
  ArrowRight, BookOpen,
} from '@/components/icons';
import { Seo } from '@/components/seo/Seo';
import { prefersReducedMotion } from '@/lib/animation-config';
import { useDeferredHydration } from '@/hooks/useDeferredHydration';
import { onLandingMount } from '@/lib/speculativePrefetch';
import { scheduleLikelyAuthRoutePreload } from '@/lib/routePreload';

const LandingPageSections = lazy(() => import('@/components/landing/LandingPageSections').then((mod) => ({ default: mod.LandingPageSections })));

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
      'https://www.facebook.com/mihaskatc',
      'https://x.com/mihaskatc',
      'https://www.linkedin.com/company/mihaskatc'
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
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'MIHAS-KATC Admissions',
    url: 'https://apply.mihas.edu.zm',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://apply.mihas.edu.zm/track-application?q={search_term_string}',
      'query-input': 'required name=search_term_string'
    }
  }
];

/** Rotating phrases displayed in the hero via TextRotate */
const heroRotatingPhrases = [
  'Registered Nursing',
  'Clinical Medicine',
  'Environmental Health',
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
              <div key={index} className="rounded-lg border border-border bg-card p-6 shadow-sm">
                <div className="mb-5 h-16 w-16 animate-pulse rounded-lg bg-muted" />
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
  const location = useLocation();
  const showDeferredSections = useDeferredHydration(true, 450)

  useEffect(() => {
    onLandingMount()
    return scheduleLikelyAuthRoutePreload(900)
  }, [])

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
        headline="Apply to accredited health science programs in one place"
        description="Start your MIHAS-KATC application, choose your diploma path, upload documents, and track every admissions step from your phone."
        rotatingPhrases={heroRotatingPhrases}
        primaryCta={{
          label: 'Start Your Application',
          href: '/auth/signup',
          icon: <ArrowRight className="w-5 h-5" />,
        }}
        secondaryCta={{
          label: 'Explore Programs',
          href: '#programs',
          icon: <BookOpen className="w-5 h-5" />,
        }}
        proofPanel={{
          image: {
            src: '/images/programs/mihas-campus.webp',
            alt: 'Students and facilities at the MIHAS-KATC healthcare training campuses',
            width: 400,
            height: 300,
          },
          eyebrow: 'Two Campuses, One Portal',
          title: 'Apply once. Track everything online.',
          description: 'No paper forms. No phone calls. See exactly where your application stands — anytime, from any device.',
          badges: ['NMCZ', 'HPCZ', 'ECZ', 'UNZA'],
          highlights: [
            { value: '2', label: 'campuses' },
            { value: '3', label: 'diploma tracks' },
            { value: 'Live', label: 'status updates' },
          ],
          checklist: [
            'Mukuba Institute (Nursing) and Kalulushi Training Centre (Clinical Medicine, Environmental Health).',
            'One application form covers all three programs — pick the one that fits you.',
            'Check your admissions status anytime from your phone. No office visits needed.',
          ],
        }}
      />
      {showDeferredSections ? (
        <Suspense fallback={<LandingSectionsFallback />}>
          <LandingPageSections />
        </Suspense>
      ) : (
        <LandingSectionsFallback />
      )}
    </PublicLayout>
  );
}
