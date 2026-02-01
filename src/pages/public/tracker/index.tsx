// @ts-nocheck
import React, { useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Search } from 'lucide-react'
import { useToastStore } from '@/components/ui/Toast'
import { SectionCard } from '@/components/ui/SectionCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { createApplicationSlip } from '@/lib/slipService'
import { logger } from '@/utils/logger'
import { useApplicationTracker } from './hooks/useApplicationTracker'
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
  const shouldReduceMotion = useReducedMotion()
  const maybeMotion = <T,>(value: T) => (shouldReduceMotion ? undefined : value)
  const toast = useToastStore()
  
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
  const [slipCache, setSlipCache] = useState<{ objectUrl?: string; publicUrl?: string; path?: string; documentId?: string } | null>(null)
  const [slipLoading, setSlipLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)

  useEffect(() => () => {
    if (slipCache?.objectUrl) {
      URL.revokeObjectURL(slipCache.objectUrl)
    }
  }, [slipCache?.objectUrl])

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

  const triggerDownload = useCallback((url: string, filename: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [])

  const buildSlipPayload = useCallback((email: string, userId?: string) => {
    if (!application) return null
    return {
      public_tracking_code: application.public_tracking_code,
      application_number: application.application_number,
      status: application.status,
      payment_status: application.payment_status,
      submitted_at: application.submitted_at,
      updated_at: application.updated_at,
      program_name: application.program_name,
      intake_name: application.intake_name,
      institution: application.institution,
      full_name: application.full_name,
      email,
      phone: application.phone,
      admin_feedback: application.admin_feedback,
      admin_feedback_date: application.admin_feedback_date,
      userId
    }
  }, [application])

  const handleDownloadSlip = useCallback(async () => {
    if (!application) return
    const filename = `Application-Slip-${application.application_number || application.public_tracking_code}.pdf`

    if (slipCache?.objectUrl) {
      triggerDownload(slipCache.objectUrl, filename)
      return
    }

    try {
      setSlipLoading(true)

      if (slipCache?.publicUrl && !slipCache.objectUrl) {
        const response = await fetch(slipCache.publicUrl)
        if (!response.ok) throw new Error('Unable to download stored application slip')
        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        setSlipCache(prev => {
          if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl)
          return { ...prev, objectUrl }
        })
        triggerDownload(objectUrl, filename)
        return
      }

      const slipEmail = application.email?.trim() || 'no-email@mihas.local'
      const payload = buildSlipPayload(slipEmail)
      if (!payload) {
        toast.error('Slip unavailable', 'Missing application details for slip generation.')
        return
      }

      const result = await createApplicationSlip(payload, { toast })

      if (result.error) {
        toast.error('Download failed', result.error)
        return
      }

      const objectUrl = result.blob ? URL.createObjectURL(result.blob) : undefined
      const downloadUrl = objectUrl || result.publicUrl

      if (!downloadUrl) {
        toast.error('Download failed', 'We could not prepare the application slip for download.')
        return
      }

      setSlipCache(prev => {
        if (prev?.objectUrl && objectUrl && prev.objectUrl !== objectUrl) {
          URL.revokeObjectURL(prev.objectUrl)
        }
        return {
          objectUrl: objectUrl || prev?.objectUrl,
          publicUrl: result.publicUrl || prev?.publicUrl,
          path: result.path || prev?.path,
          documentId: result.documentId || prev?.documentId
        }
      })

      triggerDownload(downloadUrl, filename)
    } catch (downloadError) {
      logger.error('Slip download failed:', downloadError)
      toast.error('Download failed', downloadError instanceof Error ? downloadError.message : 'Unable to download slip')
    } finally {
      setSlipLoading(false)
    }
  }, [application, buildSlipPayload, slipCache, toast, triggerDownload])

  const handleEmailSlip = useCallback(async () => {
    if (!application) return

    let emailAddress = application.email?.trim() || ''
    if (!emailAddress) {
      const promptResult = window.prompt('Enter the email address to send your application slip to:')
      emailAddress = promptResult?.trim() || ''
    }

    if (!emailAddress) {
      toast.error('Email required', 'Please provide an email address to receive the slip.')
      return
    }

    const payload = buildSlipPayload(emailAddress)
    if (!payload) {
      toast.error('Slip unavailable', 'Missing application details for slip delivery.')
      return
    }

    try {
      setEmailLoading(true)
      const result = await createApplicationSlip(payload, { toast, sendEmail: true })

      if (result.error || result.emailError) {
        const message = result.error || result.emailError || 'We could not email the slip.'
        toast.error('Email failed', message)
        return
      }

      setSlipCache(prev => {
        if (prev?.objectUrl && result.blob) URL.revokeObjectURL(prev.objectUrl)
        const objectUrl = result.blob ? URL.createObjectURL(result.blob) : prev?.objectUrl
        return {
          objectUrl,
          publicUrl: result.publicUrl || prev?.publicUrl,
          path: result.path || prev?.path,
          documentId: result.documentId || prev?.documentId
        }
      })

      setApplication(prev => (prev ? { ...prev, email: emailAddress } : prev))
    } catch (emailError) {
      logger.error('Slip email failed:', emailError)
      toast.error('Email failed', emailError instanceof Error ? emailError.message : 'Unable to email slip')
    } finally {
      setEmailLoading(false)
    }
  }, [application, buildSlipPayload, setApplication, toast])

  const handleTryAgain = () => {
    setSearchTerm('')
    setSearched(false)
    setError('')
  }

  return (
    <div className="min-h-screen bg-background safe-area-top safe-area-bottom">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-md border-b border-border shadow-sm">
        <Container size="lg">
          <div className="flex items-center justify-between py-4">
            <Link 
              to="/" 
              className="inline-flex items-center text-primary hover:text-primary/80 transition-colors group touch-target"
            >
              <ArrowLeft className="h-5 w-5 mr-2 group-hover:-translate-x-1 transition-transform" />
              <span className="font-semibold text-base">Back to Home</span>
            </Link>
          </div>
        </Container>
      </header>

      <main className="py-6 sm:py-8 lg:py-12">
        <Container size="lg" className="space-y-6 sm:space-y-8">
          {/* Page Header */}
          <PageHeader
            variant="gradient"
            icon={<Search className="h-6 w-6" />}
            title="Track Your Application"
            description="Check your application status instantly — no login required. Enter your application number or tracking code below."
          />

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

          {/* Application Results */}
          <AnimatePresence initial={!shouldReduceMotion}>
            {application && (
              <motion.div
                initial={maybeMotion({ opacity: 0, y: 20 })}
                animate={maybeMotion({ opacity: 1, y: 0 })}
                exit={maybeMotion({ opacity: 0, y: -20 })}
                transition={maybeMotion({ duration: 0.3 })}
              >
                <SectionCard className="overflow-hidden" padding="sm">
                  <ApplicationStatusHeader
                    application={application}
                    copied={copied}
                    slipLoading={slipLoading}
                    emailLoading={emailLoading}
                    onShare={() => setShowShareModal(true)}
                    onCopy={() => copyToClipboard(application.application_number)}
                    onDownloadSlip={handleDownloadSlip}
                    onEmailSlip={handleEmailSlip}
                  />

                  <div className="space-y-6 sm:space-y-8 p-4 sm:p-6">
                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 sm:gap-8">
                      <ApplicationStatusDetails application={application} />
                      <ApplicationInfoGrid application={application} />
                    </div>
                  </div>

                  <ApplicationActions />
                </SectionCard>
              </motion.div>
            )}
          </AnimatePresence>

          {/* No Results */}
          <AnimatePresence initial={!shouldReduceMotion}>
            {searched && !application && !loading && (
              <motion.div
                initial={maybeMotion({ opacity: 0, y: 20 })}
                animate={maybeMotion({ opacity: 1, y: 0 })}
                exit={maybeMotion({ opacity: 0, y: -20 })}
              >
                <NoResultsView onTryAgain={handleTryAgain} />
              </motion.div>
            )}
          </AnimatePresence>

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
      </main>
    </div>
  )
}
