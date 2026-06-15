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
import { PROOF_HIGHLIGHTS } from '@/lib/institutionFacts';
import { useDeferredHydration } from '@/hooks/useDeferredHydration';
import { onLandingMount } from '@/lib/speculativePrefetch';
import { scheduleLikelyAuthRoutePreload } from '@/lib/routePreload';

const LandingPageSections = lazy(() => import('@/components/landing/LandingPageSections').then((mod) => ({ default: mod.LandingPageSections })));

const landingStructuredData = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Beanola Admissions',
    alternateName: 'Beanola Technologies Admissions Platform',
    url: 'https://apply.beanola.com',
    logo: 'https://apply.beanola.com/images/logos/beanolalogo.webp',
    email: 'admissions@beanola.com',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'ZM',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Beanola Admissions',
    url: 'https://apply.beanola.com',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web',
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Beanola Admissions',
    url: 'https://apply.beanola.com',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://apply.beanola.com/track-application?q={search_term_string}',
      'query-input': 'required name=search_term_string'
    }
  }
];

/** Rotating phrases displayed in the hero via TextRotate */
const heroRotatingPhrases = [
  'College Programmes',
  'University Programmes',
  'Professional Courses',
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
        title="Beanola Admissions | Apply to Partner College and University Programs"
        description="Apply online through Beanola Admissions. Choose a program and intake first, then Beanola routes your application to the right school."
        path="/"
        structuredData={landingStructuredData}
      />
      <ShapeLandingHero
        headline="Apply to the right school from one admissions portal."
        description="Beanola lets students choose a program and intake first, then routes the application to the configured school before payment and submission."
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
          eyebrow: 'Program first. School assigned clearly.',
          title: 'Start now. Finish when your documents are ready.',
          description: 'Save your progress, upload documents, confirm payment, and review the assigned school before submission.',
          badges: ['Schools', 'Programs', 'Payments', 'Documents'],
          highlights: [...PROOF_HIGHLIGHTS],
          checklist: [
            'One shared application form across configured schools and offerings.',
            'White-label school portals can filter choices to that school.',
            'Beanola tags every payment by school and offering for reporting.',
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
