import React, { Suspense } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { LazyLoadErrorBoundary } from '@/components/LazyLoadErrorBoundary'
import { DetailSkeleton } from '@/components/ui/skeletons'
import LandingPage from '@/pages/LandingPage'

const PublicApplicationTracker = React.lazy(() => import('@/pages/public/tracker/index'))
const ContactPage = React.lazy(() => import('@/pages/ContactPage'))
const TermsPage = React.lazy(() => import('@/pages/TermsPage'))
const PrivacyPage = React.lazy(() => import('@/pages/PrivacyPage'))
const NotFoundPage = React.lazy(() => import('@/pages/NotFoundPage'))

function getMarketingFallback(pathname: string) {
  if (pathname === '/track-application') {
    return <DetailSkeleton />
  }

  return null
}

export function MarketingRoutes() {
  const location = useLocation()

  return (
    <LazyLoadErrorBoundary>
      <Suspense fallback={getMarketingFallback(location.pathname)}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/track-application" element={<PublicApplicationTracker />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/404" element={<NotFoundPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </LazyLoadErrorBoundary>
  )
}

export default MarketingRoutes
