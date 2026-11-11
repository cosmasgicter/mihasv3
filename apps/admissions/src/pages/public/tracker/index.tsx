import React, { useState, useCallback, useEffect } from 'react'
import { Search } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { logger } from '@/lib/logger'
import { animateClasses } from '@/lib/animations'
import { onTrackerMount } from '@/lib/speculativePrefetch'
import { useApplicationTracker } from './hooks/useApplicationTracker'
import { buildTrackerShareUrl } from './utils/trackerUtils'
import { Seo } from '@/components/seo/Seo'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { usePortalBrand } from '@/hooks/usePortalBrand'
import { brandedPageTitle } from '@/lib/tenantBrandCopy'
import {
  TrackerSearchSection,
  ApplicationStatusHeader,
  ApplicationStatusDetails,
  ApplicationInfoGrid,
  ApplicationActions,
  HelpSection,
  ShareModal,
  NoResultsView
} from './components'

export default function PublicApplicationTracker() {
  useEffect(() => { onTrackerMount() }, [])
  const { brandName } = usePortalBrand()
  
  const {
    searchTerm,
    setSearchTerm,
    application,
    resolvedCode,
    loading,
    error,
    setError,
    searched,
    setSearched,
    searchApplication
  } = useApplicationTracker()
  // The share link is built from the secret this result was opened with — never
  // from the address bar, and never from the application number (task 10.5,
  // R13.12 / STU-22).
  const shareUrl = resolvedCode ? buildTrackerShareUrl(resolvedCode) : ''

  const [showShareModal, setShowShareModal] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      logger.error('Failed to copy:', err)
    }
  }

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      searchApplication(searchTerm)
    }
  }, [searchApplication, searchTerm])

  const handleInputChange = useCallback((value: string) => {
    setSearchTerm(value)
    if (error) setError('')
  }, [error, setError, setSearchTerm])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text')
    const sanitized = pasted.replace(/[^a-zA-Z0-9\-_]/g, '').trim()
    setSearchTerm(sanitized)
    if (error) setError('')
  }, [error, setError, setSearchTerm])

  const handleTryAgain = () => {
    setSearchTerm('')
    setSearched(false)
    setError('')
  }

  return (
    <PublicLayout>
      {/*
        Brand from resolved tenant context, and no "in real time" claim
        (admissions-v2 task 11.5; STU-24, R2.2 / R2.3, R16.4).

        The description promised tracking "in real time" and the panel below
        promised a status "instantly". Neither is what happens: a tracking link
        resolves the application's stored state when the page is opened, there is
        no live transport, and R16.4 forbids fake real-time framing. It also
        claimed the application number opens tracking, which task 10.5 changed
        (STU-22) — the credential is the tracking link.
      */}
      <Seo
        title={brandedPageTitle('Track your application', brandName)}
        description="Check the status of a submitted application with the tracking link its owner shared."
        path="/track-application"
        siteName={brandName}
      />

      <div className="bg-muted py-10 sm:py-14 lg:py-16">
        <Container size="lg" className="space-y-8 sm:space-y-10">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-7 lg:p-8">
            <PageHeader
              variant="plain"
              icon={<Search className="h-6 w-6" aria-hidden="true" />}
              title="Track your application"
              description="Check the status of a submitted application with its tracking link. No sign-in required."
              className="p-0"
            />
          </div>

          {/* Search Section */}
          <TrackerSearchSection
            searchTerm={searchTerm}
            loading={loading}
            error={error}
            onSearchTermChange={handleInputChange}
            onSearch={() => searchApplication(searchTerm)}
            onKeyPress={handleKeyPress}
            onPaste={handlePaste}
          />

          {/* Application Results - conditional rendering replaces AnimatePresence */}
          {application && (
            <div className={animateClasses.slideUp}>
              <SectionCard className="overflow-hidden rounded-lg border-border bg-card shadow-sm" padding="sm">
                <ApplicationStatusHeader
                  application={application}
                  copied={copied}
                  canShare={Boolean(shareUrl)}
                  onShare={() => setShowShareModal(true)}
                  onCopy={() => copyToClipboard(application.application_number || '')}
                />

                <div className="space-y-6 sm:space-y-8 p-4 sm:p-6">
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 sm:gap-8">
                    <ApplicationStatusDetails application={application} />
                    <ApplicationInfoGrid application={application} />
                  </div>
                </div>

                <ApplicationActions />
              </SectionCard>
            </div>
          )}

          {/* No Results - conditional rendering replaces AnimatePresence */}
          {searched && !application && !loading && (
            <div className={animateClasses.slideUp}>
              <NoResultsView onTryAgain={handleTryAgain} />
            </div>
          )}

          {/* Help Section */}
          <HelpSection />
          
          {/* Share Modal */}
          <ShareModal
            show={showShareModal}
            shareUrl={shareUrl}
            copied={copied}
            onClose={() => setShowShareModal(false)}
            onCopyLink={() => copyToClipboard(shareUrl)}
          />

        </Container>
      </div>
    </PublicLayout>
  )
}
