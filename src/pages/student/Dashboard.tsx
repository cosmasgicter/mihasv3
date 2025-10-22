import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import type { Application, Intake } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { ContinueApplication } from '@/components/application/ContinueApplication'
import { formatDate, getStatusColor } from '@/lib/utils'
import { draftManager } from '@/lib/draftManager'
import { sanitizeForLog, safeJsonParse, sanitizeForDisplay } from '@/lib/sanitize'
import { getUserMetadata, getBestValue, calculateProfileCompletion } from '@/hooks/useProfileAutoPopulation'
import { ProfileCompletionBadge } from '@/components/ui/ProfileAutoPopulationIndicator'
import { clearAllDraftData } from '@/lib/draftCleanup'
import { useDraftManager } from '@/hooks/useDraftManager'
import { applicationService } from '@/services/applications'
import { catalogService } from '@/services/catalog'
import { StudentDashboardSkeleton } from '@/components/student/StudentDashboardSkeleton'
import { User, FileText, Clock, CheckCircle, XCircle, Plus, X, RefreshCw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'
import { useToastStore } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useConfirmDialog } from '@/hooks/useConfirmDialog'

export default function StudentDashboard() {
  const { user } = useAuth()
  const { profile } = useProfileQuery()
  const [applications, setApplications] = useState<Application[]>([])
  const [intakes, setIntakes] = useState<Intake[]>([])
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [hasDraft, setHasDraft] = useState(false)
  const [draftData, setDraftData] = useState<any>(null)
  const [isDeletingDraft, setIsDeletingDraft] = useState(false)
  const [isClearingAllDrafts, setIsClearingAllDrafts] = useState(false)
  const hasLoadedRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const confirmDialog = useConfirmDialog()

  useEffect(() => {
    if (user) {
      loadDashboardData()
    }

    // Cleanup function to abort pending requests
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [user, profile])

  // Listen for storage changes and draft cleared events to update draft status
  useEffect(() => {
    const handleStorageChange = () => {
      const savedDraft = localStorage.getItem('applicationWizardDraft')
      if (savedDraft) {
        const draft = safeJsonParse(savedDraft, null)
        if (draft) {
          setHasDraft(true)
          setDraftData(draft)
        } else {
          setHasDraft(false)
          setDraftData(null)
        }
      } else {
        setHasDraft(false)
        setDraftData(null)
      }
    }

    const handleDraftCleared = () => {
      setHasDraft(false)
      setDraftData(null)
      // Reload dashboard data to reflect changes
      loadDashboardData()
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('focus', handleStorageChange)
    window.addEventListener('draftCleared', handleDraftCleared)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('focus', handleStorageChange)
      window.removeEventListener('draftCleared', handleDraftCleared)
    }
  }, [])

  const loadDashboardData = async () => {
    const isInitialLoad = !hasLoadedRef.current

    // Cancel any pending requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    try {
      if (isInitialLoad) {
        setIsInitialLoading(true)
      } else {
        setIsRefreshing(true)
      }

      const savedDraft = localStorage.getItem('applicationWizardDraft')
      if (savedDraft) {
        const draft = safeJsonParse(savedDraft, null)
        if (draft) {
          setHasDraft(true)
          setDraftData(draft)
        } else {
          console.error('Error parsing draft:', sanitizeForLog('Invalid JSON in localStorage'))
          localStorage.removeItem('applicationWizardDraft')
          setHasDraft(false)
        }
      } else {
        setHasDraft(false)
      }

      const draftResponse = await applicationService.list({
        page: 0,
        pageSize: 1,
        status: 'draft',
        sortBy: 'date',
        sortOrder: 'desc',
        mine: true
      })

      // Check if request was aborted
      if (signal.aborted) return

      if (draftResponse?.applications && draftResponse.applications.length > 0) {
        setHasDraft(true)
        setDraftData(draftResponse.applications[0])
      }

      const applicationsResponse = await applicationService.list({
        page: 0,
        pageSize: 50,
        sortBy: 'date',
        sortOrder: 'desc',
        mine: true
      })

      // Check if request was aborted
      if (signal.aborted) return

      setApplications((applicationsResponse?.applications || []) as Application[])

      const intakesResponse = await catalogService.getIntakes()

      // Check if request was aborted
      if (signal.aborted) return

      setIntakes((intakesResponse.intakes || []) as Intake[])
    } catch (error) {
      // Ignore abort errors
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes('aborted'))) {
        return
      }
      console.error('Error loading dashboard data:', sanitizeForLog(error))
      setError(error instanceof Error ? sanitizeForLog(error.message) : 'Failed to load dashboard data')
    } finally {
      hasLoadedRef.current = true
      if (isInitialLoad) {
        setIsInitialLoading(false)
      } else {
        setIsRefreshing(false)
      }
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-success" />
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-800" />
      case 'under_review':
        return <Clock className="h-5 w-5 text-primary" />
      default:
        return <Clock className="h-5 w-5 text-warning" />
    }
  }

  const getProgramName = (programName: string) => {
    return programName || 'Unknown Program'
  }

  const getIntakeName = (intakeName: string) => {
    return intakeName || 'Unknown Intake'
  }

  const getDraftTimestamp = () => {
    if (draftData?.savedAt) {
      return formatDate(draftData.savedAt)
    }
    if (draftData?.updated_at) {
      return formatDate(draftData.updated_at)
    }
    return 'Unknown'
  }

  const getDraftProgress = () => {
    if (!draftData) return 'No progress'

    const step = draftData.currentStep || draftData.step_completed || 1
    const steps = ['KYC Info', 'Education', 'Payment', 'Review']
    return `Step ${step}/4: ${steps[step - 1] || 'Unknown'}`
  }

  const metadata = getUserMetadata(user)
  const profileCompletion = calculateProfileCompletion(profile, metadata)
  const displayName = sanitizeForDisplay(
    getBestValue(profile?.full_name, metadata.full_name, user?.email?.split('@')[0] || 'Student')
  )
  const firstName = displayName?.split(' ')[0] || 'Student'

  const draftApplications = applications.filter(app => app.status === 'draft')
  const submittedApplications = applications.filter(app => app.status !== 'draft' && app.status !== 'deleted')
  const hasLocalDraftOnly = hasDraft && draftApplications.length === 0
  const totalDraftCount = draftApplications.length + (hasLocalDraftOnly ? 1 : 0)

  return (
    <div className="safe-area-bottom py-4 sm:py-6 lg:py-8 px-3 sm:px-6 lg:px-8 w-full max-w-full overflow-x-hidden">
      <div className="max-w-7xl mx-auto w-full">
        {isInitialLoading ? (
          <StudentDashboardSkeleton />
        ) : (
          <div className="space-y-6 sm:space-y-8">
            <AnimatePresence>
              {isRefreshing && (
                <motion.div
                  key="dashboard-refresh-indicator"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="rounded-full bg-white px-6 py-3 shadow-lg"
                >
                  <div className="h-1 w-full overflow-hidden rounded-full bg-blue-100">
                    <motion.div
                      className="h-full w-1/3 rounded-full bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800"
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                    />
                  </div>
                  <span className="sr-only">Refreshing dashboard data</span>
                </motion.div>
              )}
            </AnimatePresence>

            <PageHeader
              variant="gradient"
              icon={<User className="h-6 w-6" />}
              title={`Welcome back, ${firstName}`}
              description="Track your applications, manage drafts, and keep your profile information up to date."
              stats={[
                {
                  label: 'Submitted applications',
                  value: submittedApplications.length,
                  accent: 'primary',
                  icon: <CheckCircle className="h-5 w-5" />
                },
                {
                  label: 'Drafts in progress',
                  value: totalDraftCount,
                  accent: totalDraftCount > 0 ? 'warning' : 'neutral',
                  icon: <Clock className="h-5 w-5" />
                }
              ]}
              actions={
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadDashboardData()}
                    disabled={isRefreshing}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                  </Button>
                  <ProfileCompletionBadge completionPercentage={profileCompletion} />
                </div>
              }
            />

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-red-300 bg-red-50 px-6 py-5 text-red-800 shadow-lg"
              >
                <div className="flex items-start gap-3">
                  <XCircle className="h-6 w-6 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold">Dashboard Error</p>
                    <p className="text-sm text-destructive/80">{error}</p>
                  </div>
                  <button
                    onClick={() => setError('')}
                    className="flex-shrink-0 p-1 rounded-md hover:bg-red-100 transition-colors"
                    aria-label="Dismiss error"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </motion.div>
            )}

            <ContinueApplication />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
              <SectionCard
                className="lg:col-span-2"
                title="My applications"
                description="Monitor each submission and jump back into drafts when you're ready."
                icon={<FileText className="h-5 w-5" />}
                headerVariant="tinted"
                contentClassName="p-0"
              >
                {submittedApplications.length === 0 && draftApplications.length === 0 && !hasLocalDraftOnly ? (
                  <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                    <div className="text-foreground"><FileText className="w-16 h-16" /></div>
                    <div className="space-y-2">
                      <h3 className="text-xl sm:text-2xl font-semibold text-foreground">No applications yet</h3>
                      <p className="text-foreground">
                        Start your journey by submitting your first application. We'll guide you every step of the way.
                      </p>
                    </div>
                    <Link to="/student/application-wizard">
                      <Button className="bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg hover:from-blue-700 hover:to-purple-700">
                        <Plus className="mr-2 h-5 w-5" />
                        New Application
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {draftApplications.map((application, index) => (
                      <motion.div
                        key={`draft-${application.id}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="px-6 py-5 transition-colors hover:bg-yellow-50"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between min-w-0">
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <Clock className="h-5 w-5 text-accent" />
                              <h4 className="text-base font-semibold text-foreground break-all">Draft application #{application.application_number}</h4>
                              <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800 border border-yellow-300">Draft</span>
                            </div>
                            <dl className="grid gap-2 text-sm text-foreground sm:grid-cols-2">
                              <div className="flex gap-2">
                                <dt className="font-medium text-foreground">Program:</dt>
                                <dd className="text-foreground break-words">{application.program}</dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="font-medium text-foreground">Intake:</dt>
                                <dd className="text-foreground break-words">{application.intake}</dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="font-medium text-foreground">Created:</dt>
                                <dd className="text-foreground">{formatDate(application.created_at)}</dd>
                              </div>
                            </dl>
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Link to="/student/application-wizard" className="w-full sm:w-auto">
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full sm:w-auto border-warning/30 text-accent hover:bg-amber-100"
                              >
                                Continue draft
                              </Button>
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full sm:w-auto border-red-300 text-red-700 hover:bg-red-50"
                              onClick={async () => {
                                const confirmed = await confirmDialog.confirm({
                                  title: 'Delete Draft',
                                  message: 'This draft will be permanently deleted.',
                                  confirmText: 'Delete',
                                  variant: 'danger'
                                })
                                if (!confirmed) return
                                try {
                                  await applicationService.delete(application.id)
                                  setApplications(prev => prev.filter(app => app.id !== application.id))
                                  setError('')
                                  useToastStore.getState().addToast('success', 'Draft deleted successfully')
                                } catch (error) {
                                  console.error('Delete error:', error)
                                  if (error instanceof Error && (error.message.includes('404') || error.message.includes('not found'))) {
                                    setApplications(prev => prev.filter(app => app.id !== application.id))
                                    useToastStore.getState().addToast('success', 'Draft removed')
                                  } else {
                                    const errorMsg = error instanceof Error ? error.message : 'Failed to delete draft'
                                    setError(errorMsg)
                                    useToastStore.getState().addToast('error', errorMsg)
                                  }
                                }
                              }}
                            >
                              <X className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))}

                    {hasLocalDraftOnly && (
                      <div className="px-6 py-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
                          <div className="space-y-1">
                            <div className="flex items-center gap-3">
                              <Clock className="h-5 w-5 text-accent" />
                              <h4 className="text-base font-semibold text-foreground truncate">Local draft in progress</h4>
                              <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800 border border-yellow-300">Draft</span>
                            </div>
                            <p className="text-sm text-foreground">Progress: {getDraftProgress()}</p>
                            <p className="text-sm text-foreground">Last saved: {getDraftTimestamp()}</p>
                            {draftData?.formData?.program && (
                              <p className="text-sm text-foreground break-words">Program: {draftData.formData.program}</p>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Link to="/student/application-wizard" className="w-full sm:w-auto">
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full sm:w-auto border-warning/30 text-accent hover:bg-amber-100"
                              >
                                Continue draft
                              </Button>
                            </Link>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full sm:w-auto border-red-300 text-red-700 hover:bg-red-50"
                              onClick={async () => {
                                const confirmed = await confirmDialog.confirm({
                                  title: 'Delete Draft',
                                  message: 'This local draft will be permanently deleted.',
                                  confirmText: 'Delete',
                                  variant: 'danger'
                                })
                                if (!confirmed) return
                                try {
                                  clearAllDraftData()
                                  if (user) {
                                    await draftManager.clearAllDrafts(user.id)
                                  }
                                  setHasDraft(false)
                                  setDraftData(null)
                                  setError('')
                                  useToastStore.getState().addToast('success', 'Draft deleted successfully')
                                } catch (error) {
                                  console.error('Delete error:', error)
                                  const errorMsg = error instanceof Error ? error.message : 'Failed to delete draft'
                                  setError(errorMsg)
                                  useToastStore.getState().addToast('error', errorMsg)
                                }
                              }}
                            >
                              <X className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {submittedApplications.map((application, index) => (
                      <motion.div
                        key={application.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + index * 0.05 }}
                        className="px-6 py-5 transition-colors hover:bg-blue-50"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between min-w-0">
                          <div className="space-y-2 min-w-0 flex-1">
                            <div className="flex items-start gap-2 flex-wrap">
                              <div className="flex-shrink-0">{getStatusIcon(application.status)}</div>
                              <h4 className="text-base font-semibold text-foreground break-words min-w-0 flex-1">{getProgramName(application.program)}</h4>
                              <span className={`rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${getStatusColor(application.status)}`}>
                                {application.status.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                            <dl className="grid gap-2 text-sm text-foreground grid-cols-1 sm:grid-cols-2">
                              <div className="flex gap-2 min-w-0">
                                <dt className="font-medium text-foreground flex-shrink-0">Application:</dt>
                                <dd className="text-foreground break-all min-w-0">#{application.application_number}</dd>
                              </div>
                              <div className="flex gap-2 min-w-0">
                                <dt className="font-medium text-foreground flex-shrink-0">Intake:</dt>
                                <dd className="text-foreground break-words min-w-0">{getIntakeName(application.intake)}</dd>
                              </div>
                              <div className="flex gap-2 min-w-0">
                                <dt className="font-medium text-foreground flex-shrink-0">Submitted:</dt>
                                <dd className="text-foreground min-w-0">{formatDate(application.submitted_at)}</dd>
                              </div>
                            </dl>
                          </div>
                          <Link to={`/student/application/${application.id}`} className="w-full sm:w-auto">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full sm:w-auto border-primary text-primary hover:bg-primary hover:text-white"
                            >
                              View Details
                            </Button>
                          </Link>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <div className="space-y-6">
                <SectionCard
                  title="Profile summary"
                  description="Keep your personal details up to date so we can assist you faster."
                  icon={<User className="h-5 w-5" />}
                >
                  <div className="grid gap-3">
                    <div className="rounded-xl bg-muted px-4 py-3 overflow-hidden">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Full name</p>
                      <p className="text-sm font-semibold text-foreground break-words overflow-wrap-anywhere">
                        {sanitizeForDisplay(getBestValue(profile?.full_name, metadata.full_name, user?.email?.split('@')[0]))}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted px-4 py-3 overflow-hidden">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Email</p>
                      <p className="text-sm font-semibold text-foreground break-all overflow-wrap-anywhere">{sanitizeForDisplay(user?.email) || 'Not provided'}</p>
                    </div>
                    <div className="rounded-xl bg-muted px-4 py-3 overflow-hidden">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Phone</p>
                      <p className="text-sm font-semibold text-foreground break-words overflow-wrap-anywhere">
                        {sanitizeForDisplay(getBestValue(profile?.phone, metadata.phone, 'Not provided'))}
                      </p>
                    </div>
                    <div className="rounded-xl bg-muted px-4 py-3 overflow-hidden">
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Residence</p>
                      <p className="text-sm font-semibold text-foreground break-words overflow-wrap-anywhere">
                        {sanitizeForDisplay(getBestValue(profile?.address, metadata.address, 'Not provided'))}
                      </p>
                    </div>
                  </div>
                  <Link to="/settings" className="block">
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4 w-full border-primary text-primary hover:bg-primary hover:text-white"
                    >
                      Update profile
                    </Button>
                  </Link>
                </SectionCard>

                <SectionCard
                  title="Upcoming deadlines"
                  description="Never miss an important date for upcoming intakes."
                  icon={<Clock className="h-5 w-5" />}
                >
                  <div className="space-y-3">
                    {intakes.slice(0, 3).map((intake, index) => (
                      <motion.div
                        key={intake.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 * index }}
                        className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3"
                      >
                        <p className="text-sm font-semibold text-foreground">{intake.name}</p>
                        <p className="text-xs font-semibold text-orange-700">Deadline: {formatDate(intake.application_deadline)}</p>
                      </motion.div>
                    ))}
                    {intakes.length === 0 && (
                      <p className="rounded-xl bg-muted px-4 py-4 text-center text-sm text-foreground">
                        No upcoming deadlines yet. Check back soon.
                      </p>
                    )}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Quick actions"
                  description="Access the most common tasks in a single tap."
                  icon={<Plus className="h-5 w-5" />}
                >
                  <div className="grid gap-3">
                    {totalDraftCount > 0 ? (
                      <Link to="/student/application-wizard" className="block">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start border-yellow-300 bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Continue draft
                        </Button>
                      </Link>
                    ) : (
                      <Link to="/student/application-wizard" className="block">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-start border-primary bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Start new application
                        </Button>
                      </Link>
                    )}
                    {totalDraftCount > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start border-red-300 text-red-700 hover:bg-red-50"
                        disabled={isClearingAllDrafts}
                        onClick={async () => {
                          const confirmed = await confirmDialog.confirm({
                            title: 'Clear All Drafts',
                            message: 'All draft applications will be permanently deleted.',
                            confirmText: 'Clear All',
                            variant: 'danger'
                          })
                          if (!confirmed) return
                          setIsClearingAllDrafts(true)
                          try {
                            clearAllDraftData()
                            if (user) {
                              await draftManager.clearAllDrafts(user.id)
                            }
                            
                            const draftApps = applications.filter(app => app.status === 'draft')
                            await Promise.allSettled(
                              draftApps.map(app => applicationService.delete(app.id))
                            )
                            
                            setApplications(prev => prev.filter(app => app.status !== 'draft'))
                            setHasDraft(false)
                            setDraftData(null)
                            setError('')
                            useToastStore.getState().addToast('success', 'All drafts cleared successfully')
                          } catch (error) {
                            console.error('Clear drafts error:', error)
                            const errorMsg = error instanceof Error ? error.message : 'Failed to clear drafts'
                            setError(errorMsg)
                            useToastStore.getState().addToast('error', errorMsg)
                          } finally {
                            setIsClearingAllDrafts(false)
                          }
                        }}
                      >
                        {isClearingAllDrafts ? (
                          <motion.div
                            className="mr-2 h-4 w-4 rounded-full border-2 border-current border-t-transparent"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                          />
                        ) : (
                          <X className="mr-2 h-4 w-4" />
                        )}
                        {isClearingAllDrafts ? 'Clearing...' : 'Clear all drafts'}
                      </Button>
                    )}
                    <Link to="/settings" className="block">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start border-border text-foreground hover:bg-muted"
                      >
                        <User className="mr-2 h-4 w-4" />
                        Profile settings
                      </Button>
                    </Link>
                  </div>
                </SectionCard>
              </div>
            </div>
          </div>
        )}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={confirmDialog.handleCancel}
        onConfirm={confirmDialog.handleConfirm}
        title={confirmDialog.options.title}
        message={confirmDialog.options.message}
        confirmText={confirmDialog.options.confirmText}
        cancelText={confirmDialog.options.cancelText}
        variant={confirmDialog.options.variant}
      />
      </div>
    </div>
  )
}
