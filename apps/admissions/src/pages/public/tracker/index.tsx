import React, { useState, useCallback, useEffect } from 'react'
import { Search } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { logger } from '@/lib/logger'
import { animateClasses } from '@/lib/animations'
import { onTrackerMount } from '@/lib/speculativePrefetch'
import { useApplicationTracker } from './hooks/useApplicationTracker'
import { Seo } from '@/components/seo/Seo'
import { PublicLayout } from '@/components/layout/PublicLayout'
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
  
  const {
    searchTerm,
    setSearchTerm,
    application,
    setApplication,
    loading,
    error,
    setError,
    searched,
    setSearched,
    searchApplication
  } = useApplicationTracker()

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
      <Seo
        title="Track Your Application | Beanola Admissions"
        description="Track your Beanola application status in real time using your application number and view key admissions milestones."
        path="/track-application"
      />

      <div className="bg-muted py-10 sm:py-14 lg:py-16">
        <Container size="lg" className="space-y-8 sm:space-y-10">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-7 lg:p-8">
            <PageHeader
              variant="surface"
              icon={<Search className="h-6 w-6" aria-hidden="true" />}
              title="Track Your Application"
              description="Check your application status instantly — no login required. Enter your application number or tracking code below."
              className="border-0 bg-transparent p-0 shadow-none"
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
            applicationNumber={application?.application_number || ''}
            onClose={() => setShowShareModal(false)}
            onCopyLink={() => copyToClipboard(window.location.href)}
            onCopyNumber={() => copyToClipboard(application?.application_number || '')}
          />

        </Container>
      </div>
    </PublicLayout>
  )
}
