import React, { useState, useCallback, useEffect } from 'react'
import { Search } from 'lucide-react'
import { useToastStore } from '@/hooks/useToast'
import { Button } from '@/components/ui/Button'
import { SectionCard } from '@/components/ui/SectionCard'
import { PageHeader } from '@/components/ui/PageHeader'
import { Container } from '@/components/ui/Container'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog'
import { repairLegacyDocumentReference } from '@/lib/applicationSlipStorage'
import { createApplicationSlip } from '@/lib/slipService'
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
  const toast = useToastStore()

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
  const [slipCache, setSlipCache] = useState<{ objectUrl?: string; publicUrl?: string; path?: string; documentId?: string } | null>(null)
  const [slipLoading, setSlipLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailPromptOpen, setEmailPromptOpen] = useState(false)
  const [emailDraftAddress, setEmailDraftAddress] = useState('')
  const [emailPromptError, setEmailPromptError] = useState('')

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

  const closeEmailPrompt = useCallback(() => {
    setEmailPromptOpen(false)
    setEmailDraftAddress('')
    setEmailPromptError('')
  }, [])

  const buildSlipPayload = useCallback((email: string, userId?: string) => {
    if (!application) return null
    return {
      application_id: application.id || undefined,
      public_tracking_code: application.public_tracking_code || application.application_number || '',
      application_number: application.application_number || '',
      status: application.status,
      payment_status: application.payment_status,
      submitted_at: application.submitted_at,
      updated_at: application.updated_at,
      program_name: application.program_name,
      intake_name: application.intake_name,
      institution: application.institution,
      full_name: null,
      email,
      phone: null,
      admin_feedback: application.admin_feedback,
      admin_feedback_date: application.admin_feedback_date,
      userId
    } as any
  }, [application])

  const handleDownloadSlip = useCallback(async () => {
    if (!application) return
    const filename = `Application-Slip-${application.application_number || 'unknown'}.pdf`

    if (slipCache?.objectUrl) {
      triggerDownload(slipCache.objectUrl, filename)
      return
    }

    try {
      setSlipLoading(true)

      if (slipCache?.publicUrl && !slipCache.objectUrl) {
        let response = await fetch(slipCache.publicUrl)
        let canonicalUrl = slipCache.publicUrl

        if (!response.ok) {
          const repaired = await repairLegacyDocumentReference(slipCache.publicUrl)
          if (repaired.publicUrl) {
            canonicalUrl = repaired.publicUrl
            response = await fetch(canonicalUrl)
          }
        }

        if (!response.ok) throw new Error('Unable to download stored application slip')
        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        setSlipCache(prev => {
          if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl)
          return { ...prev, objectUrl, publicUrl: canonicalUrl }
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

      const result = await createApplicationSlip(payload, { toast: toast as any })

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

  const sendSlipToEmail = useCallback(async (emailAddress: string) => {
    if (!application) return false

    const payload = buildSlipPayload(emailAddress)
    if (!payload) {
      toast.error('Slip unavailable', 'Missing application details for slip delivery.')
      return false
    }

    try {
      setEmailLoading(true)
      const result = await createApplicationSlip(payload, { toast: toast as any, sendEmail: true })

      if (result.error || result.emailError) {
        const message = result.error || result.emailError || 'We could not email the slip.'
        toast.error('Email failed', message)
        return false
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
      toast.success('Slip emailed', `Application slip sent to ${emailAddress}.`)
      return true
    } catch (emailError) {
      logger.error('Slip email failed:', emailError)
      toast.error('Email failed', emailError instanceof Error ? emailError.message : 'Unable to email slip')
      return false
    } finally {
      setEmailLoading(false)
    }
  }, [application, buildSlipPayload, toast])

  const handleEmailSlip = useCallback(async () => {
    if (!application) return

    const existingEmail = application.email?.trim() || ''
    if (!existingEmail) {
      setEmailDraftAddress('')
      setEmailPromptError('')
      setEmailPromptOpen(true)
      return
    }

    await sendSlipToEmail(existingEmail)
  }, [application, sendSlipToEmail])

  const handleEmailPromptSubmit = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const normalizedEmail = emailDraftAddress.trim()

    if (!normalizedEmail) {
      setEmailPromptError('Email address is required.')
      return
    }

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
    if (!isValidEmail) {
      setEmailPromptError('Enter a valid email address.')
      return
    }

    setEmailPromptError('')
    const sent = await sendSlipToEmail(normalizedEmail)
    if (sent) {
      closeEmailPrompt()
    }
  }, [closeEmailPrompt, emailDraftAddress, sendSlipToEmail])

  const handleTryAgain = () => {
    setSearchTerm('')
    setSearched(false)
    setError('')
  }

  return (
    <PublicLayout>
      <Seo
        title="Track Your Application | MIHAS-KATC Admissions"
        description="Track your MIHAS-KATC application status in real time using your application number and view key admissions milestones."
        path="/track-application"
      />

      <div className="py-10 sm:py-16 lg:py-20">
        <Container size="lg" className="space-y-8 sm:space-y-10">
          <div className="glass-panel p-6 sm:p-8 lg:p-10">
            <PageHeader
              variant="gradient"
              icon={<Search className="h-6 w-6" aria-hidden="true" />}
              title="Track Your Application"
              description="Check your application status instantly — no login required. Enter your application number or tracking code below."
            />
            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.75fr)]">
              <div>
                <div className="flex flex-wrap gap-2">
                  <span className="feature-chip">No sign-in required</span>
                  <span className="feature-chip">Live status visibility</span>
                  <span className="feature-chip">Slip download and sharing</span>
                </div>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  This tracker is designed for confidence. Students and sponsors can see where an application stands without navigating the full portal, while still keeping the result clear and action-oriented.
                </p>
              </div>
              <div className="polished-panel p-5 sm:p-6">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-primary/80">Best input</p>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-lg bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Use</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">Application number or tracking code</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Outcome</p>
                    <p className="mt-1 text-lg font-semibold text-slate-950">Status, milestones, and application slip</p>
                  </div>
                </div>
              </div>
            </div>
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
              <SectionCard className="overflow-hidden rounded-lg border-white/70 bg-white/92 shadow-[0_22px_60px_-34px_rgba(15,23,42,0.25)]" padding="sm">
                <ApplicationStatusHeader
                  application={application}
                  copied={copied}
                  slipLoading={slipLoading}
                  emailLoading={emailLoading}
                  onShare={() => setShowShareModal(true)}
                  onCopy={() => copyToClipboard(application.application_number || '')}
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

          <Dialog open={emailPromptOpen} onOpenChange={(open) => {
            if (!open) {
              closeEmailPrompt()
            } else {
              setEmailPromptOpen(true)
            }
          }}>
            <DialogContent size="sm">
              <DialogHeader>
                <DialogTitle>Email Application Slip</DialogTitle>
                <DialogDescription>
                  Enter the email address that should receive the application slip.
                </DialogDescription>
              </DialogHeader>

              <form className="space-y-4" onSubmit={handleEmailPromptSubmit} noValidate>
                <Input
                  id="application-slip-email"
                  type="email"
                  label="Recipient email"
                  value={emailDraftAddress}
                  onChange={(e) => {
                    setEmailDraftAddress(e.target.value)
                    if (emailPromptError) {
                      setEmailPromptError('')
                    }
                  }}
                  autoComplete="email"
                  error={emailPromptError}
                  disabled={emailLoading}
                  required
                />

                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={closeEmailPrompt} disabled={emailLoading}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={emailLoading}>
                    {emailLoading ? 'Sending slip...' : 'Send slip'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </Container>
      </div>
    </PublicLayout>
  )
}
