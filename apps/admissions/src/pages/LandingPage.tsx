/**
 * LandingPage - the student-facing landing (D10 option A, task 33.1).
 *
 * Four sections: hero, open programmes, what you need, how it works. School-buyer
 * content lives on /for-schools. The lower sections load after first paint.
 */

import { Suspense, lazy, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { LandingHero } from '@/components/landing/LandingHero';
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

function LandingSectionsFallback() {
  return (
    <div aria-hidden="true" className="py-12 sm:py-14 lg:py-16">
      <div className="container-responsive space-y-4 px-4 sm:px-6 lg:px-8">
        <div className="h-8 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-16 w-full animate-pulse rounded bg-muted" />
      </div>
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
        title="Beanola Admissions | Apply to Partner College and University Programmes"
        description="Apply online through Beanola Admissions. Choose an open programme and intake, upload your documents, and track your application."
        path="/"
        structuredData={landingStructuredData}
      />
      <LandingHero />
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
