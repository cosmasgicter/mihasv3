import React, { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import type { Application, Program, Intake } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { AuthenticatedNavigation } from '@/components/ui/AuthenticatedNavigation'
import { ContinueApplication } from '@/components/application/ContinueApplication'
import { formatDate, getStatusColor } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { applicationSessionManager } from '@/lib/applicationSession'
import { draftManager } from '@/lib/draftManager'
import { useDraftManager } from '@/hooks/useDraftManager'
import { sanitizeForLog, safeJsonParse, sanitizeForDisplay } from '@/lib/sanitize'
import { getUserMetadata, getBestValue, calculateProfileCompletion } from '@/hooks/useProfileAutoPopulation'
import { ProfileCompletionBadge } from '@/components/ui/ProfileAutoPopulationIndicator'
import { clearAllDraftData } from '@/lib/draftCleanup'
import { applicationService } from '@/services/applications'
import { catalogService } from '@/services/catalog'
import { StudentDashboardSkeleton } from '@/components/student/StudentDashboardSkeleton'
import { 
  User, 
  FileText, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Plus,
  X
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function StudentDashboard() {
  const isMobile = useIsMobile()
  const { user } = useAuth()
  const { profile } = useProfileQuery()
  const { deleteDraft, clearAllDrafts } = useDraftManager()
  const [applications, setApplications] = useState<Application[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [intakes, setIntakes] = useState<Intake[]>([])
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [hasDraft, setHasDraft] = useState(false)
  const [draftData, setDraftData] = useState<any>(null)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (user) {
      loadDashboardData()
    }
  }, [user, profile])

  // Listen for storage changes to update draft status
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

    // Listen for storage events from other tabs/windows
    window.addEventListener('storage', handleStorageChange)
    
    // Also check when the window gains focus (user returns from another page)
    window.addEventListener('focus', handleStorageChange)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('focus', handleStorageChange)
    }
  }, [])

  const loadDashboardData = async () => {
    const isInitialLoad = !hasLoadedRef.current

    try {
      if (isInitialLoad) {
        setIsInitialLoading(true)
      } else {
        setIsRefreshing(true)
      }

      // Check for saved draft in localStorage
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
      
      // Load latest draft from API
      const draftResponse = await applicationService.list({
        page: 0,
        pageSize: 1,
        status: 'draft',
        sortBy: 'date',
        sortOrder: 'desc',
        mine: true
      })

      if (draftResponse?.applications && draftResponse.applications.length > 0) {
        setHasDraft(true)
        setDraftData(draftResponse.applications[0])
      }

      // Load user's applications
      const applicationsResponse = await applicationService.list({
        page: 0,
        pageSize: 50,
        sortBy: 'date',
        sortOrder: 'desc',
        mine: true
      })

      setApplications((applicationsResponse?.applications || []) as Application[])

      // Load programs and intakes
      const [programsResponse, intakesResponse] = await Promise.all([
        catalogService.getPrograms(),
        catalogService.getIntakes()
      ])

      setPrograms((programsResponse.programs || []) as Program[])
      setIntakes((intakesResponse.intakes || []) as Intake[])
    } catch (error) {
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
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'rejected':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'under_review':
        return <Clock className="h-5 w-5 text-primary" />
      default:
        return <Clock className="h-5 w-5 text-yellow-500" />
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <AuthenticatedNavigation />

      <main className="w-full">
        <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto py-4 sm:py-6 lg:py-8 pb-20">
        {isInitialLoading ? (
          <StudentDashboardSkeleton />
        ) : (
          <>
            <AnimatePresence>
              {isRefreshing && (
                <motion.div
                  key="dashboard-refresh-indicator"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-6"
                >
                  <div className="h-1 w-full overflow-hidden rounded-full bg-primary/10">
                    <motion.div
                      className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary via-secondary to-primary"
                      animate={{ x: ['-100%', '100%'] }}
                      transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                    />
                  </div>
                  <span className="sr-only">Refreshing dashboard data</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Welcome Section - Mobile First */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8"
        >
          <div className="bg-gradient-to-r from-primary to-secondary rounded-2xl p-6 sm:p-8 text-white shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
              <div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">
                  🎓 Welcome back, {(() => {
                    const metadata = getUserMetadata(user)
                    const fullName = getBestValue(profile?.full_name, metadata.full_name, user?.email?.split('@')[0] || 'Student')
                    return sanitizeForDisplay(fullName)?.split(' ')[0] || 'Student'
                  })()}!
                </h1>
                <p className="text-lg sm:text-xl text-white/90">
                  Track your applications and manage your profile
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl sm:text-4xl font-bold">{applications.length}</div>
                <div className="text-sm sm:text-base text-white/80">Applications</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Error Display */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="rounded-xl bg-red-50 border border-red-200 p-4 sm:p-6 mb-6 shadow-lg"
            >
              <div className="flex items-center space-x-3">
                <XCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
                <div className="text-sm sm:text-base text-red-700 font-medium">{error}</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Continue Application */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-6 sm:mb-8"
        >
          <ContinueApplication />
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Applications List - Mobile First */}
          <div className="lg:col-span-2">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-white rounded-2xl shadow-lg border border-gray-100"
            >
              <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-blue-50">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center">
                  📋 My Applications
                </h3>
                <p className="text-sm text-gray-600 mt-1">Track your application progress</p>
              </div>
              
              <div className="divide-y divide-gray-200">
                {applications.length === 0 && !hasDraft ? (
                  <div className="px-6 py-16 text-center">
                    <div className="text-8xl mb-6">📋</div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      No Applications Yet
                    </h3>
                    <p className="text-gray-600 mb-6 max-w-md mx-auto">
                      You haven't submitted any applications. Start your journey by applying to our programs.
                    </p>
                    <Link to="/student/application-wizard">
                      <Button className="bg-gradient-to-r from-primary to-secondary text-white font-semibold shadow-lg hover:shadow-xl">
                        <Plus className="h-5 w-5 mr-2" />
                        Create First Application
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    {/* Show draft applications from database */}
                    {applications.filter(app => app.status === 'draft').map((application) => (
                      <motion.div 
                        key={`draft-${application.id}`} 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="px-6 py-4 hover:bg-yellow-50 bg-gradient-to-r from-yellow-50 to-orange-50 border-l-4 border-yellow-400 transition-all duration-300"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <Clock className="h-5 w-5 text-yellow-600" />
                              <h4 className="text-base font-semibold text-gray-900">
                                📝 Draft Application
                              </h4>
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-yellow-200 text-yellow-800">
                                DRAFT
                              </span>
                            </div>
                            
                            <div className="text-sm text-gray-700 space-y-1">
                              <p><strong>Application:</strong> #{application.application_number}</p>
                              <p><strong>Program:</strong> {application.program}</p>
                              <p><strong>Intake:</strong> {application.intake}</p>
                              <p><strong>Created:</strong> {formatDate(application.created_at)}</p>
                            </div>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Link to="/student/application-wizard">
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="w-full sm:w-auto text-yellow-700 border-yellow-300 hover:bg-yellow-100 font-semibold"
                              >
                                Continue Draft
                              </Button>
                            </Link>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="w-full sm:w-auto text-red-600 border-red-300 hover:bg-red-50 font-semibold"
                              onClick={async () => {
                                try {
                                  await applicationService.delete(application.id)

                                  // Refresh data immediately
                                  await loadDashboardData()
                                } catch (error) {
                                  setError('Failed to delete draft')
                                }
                              }}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    
                    {/* Show localStorage draft if exists */}
                    {hasDraft && !applications.some(app => app.status === 'draft') && (
                      <div className="px-6 py-4 hover:bg-gray-50 bg-yellow-50 border-l-4 border-yellow-400">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <Clock className="h-5 w-5 text-yellow-500" />
                              <h4 className="text-sm font-medium text-secondary">
                                📝 Draft Application
                              </h4>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                DRAFT
                              </span>
                            </div>
                            
                            <div className="text-sm text-secondary space-y-1">
                              <p>Progress: {getDraftProgress()}</p>
                              <p>Last saved: {getDraftTimestamp()}</p>
                              {draftData?.formData?.program && (
                                <p>Program: {draftData.formData.program}</p>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row gap-2">
                            <Link to="/student/application-wizard">
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="w-full sm:w-auto text-yellow-700 border-yellow-300 hover:bg-yellow-100 font-semibold"
                              >
                                Continue Draft
                              </Button>
                            </Link>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="w-full sm:w-auto text-red-600 border-red-300 hover:bg-red-50 font-semibold"
                              onClick={() => {
                                // Clear all draft data
                                clearAllDraftData()
                                
                                // Update local state
                                setHasDraft(false)
                                setDraftData(null)
                              }}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Show submitted applications */}
                    {applications.filter(app => app.status !== 'draft').map((application, index) => (
                      <motion.div 
                        key={application.id} 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="px-6 py-4 hover:bg-blue-50 transition-all duration-300 border-l-4 border-transparent hover:border-primary"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              {getStatusIcon(application.status)}
                              <h4 className="text-base font-semibold text-gray-900">
                                {getProgramName(application.program)}
                              </h4>
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                                getStatusColor(application.status)
                              }`}>
                                {application.status.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                            
                            <div className="text-sm text-gray-700 space-y-1">
                              <p><strong>Application:</strong> #{application.application_number}</p>
                              <p><strong>Intake:</strong> {getIntakeName(application.intake)}</p>
                              <p><strong>Submitted:</strong> {formatDate(application.submitted_at)}</p>
                            </div>
                          </div>
                          
                          <Link to={`/student/application/${application.id}`}>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="w-full sm:w-auto text-primary border-primary hover:bg-primary hover:text-white font-semibold"
                            >
                              View Details
                            </Button>
                          </Link>
                        </div>
                      </motion.div>
                    ))}
                  </>
                )}
              </div>
            </motion.div>
          </div>

          {/* Sidebar - Mobile First */}
          <div className="space-y-6">
            {/* Profile Summary */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 flex items-center">
                  👤 Profile Summary
                </h3>
                <ProfileCompletionBadge 
                  completionPercentage={calculateProfileCompletion(profile, getUserMetadata(user))} 
                />
              </div>
              <div className="space-y-4 text-sm">
                {(() => {
                  const metadata = getUserMetadata(user)
                  return (
                    <>
                      <div className="p-3 bg-gray-50 rounded-xl">
                        <span className="text-gray-600 text-xs uppercase tracking-wide">Full Name</span>
                        <p className="font-semibold text-gray-900">
                          {sanitizeForDisplay(getBestValue(profile?.full_name, metadata.full_name, user?.email?.split('@')[0]))}
                        </p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-xl">
                        <span className="text-gray-600 text-xs uppercase tracking-wide">Email</span>
                        <p className="font-semibold text-gray-900 truncate">{sanitizeForDisplay(user?.email) || 'Not provided'}</p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-xl">
                        <span className="text-gray-600 text-xs uppercase tracking-wide">Phone</span>
                        <p className="font-semibold text-gray-900">
                          {sanitizeForDisplay(getBestValue(profile?.phone, metadata.phone, 'Not provided'))}
                        </p>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-xl">
                        <span className="text-gray-600 text-xs uppercase tracking-wide">City</span>
                        <p className="font-semibold text-gray-900">
                          {sanitizeForDisplay(getBestValue(profile?.city || profile?.address, metadata.city, 'Not provided'))}
                        </p>
                      </div>
                    </>
                  )
                })()}
              </div>
              <Link to="/settings">
                <Button variant="outline" size="sm" className="w-full mt-4 border-2 hover:border-primary hover:bg-primary hover:text-white font-semibold">
                  <User className="h-4 w-4 mr-2" />
                  Update Profile
                </Button>
              </Link>
            </motion.div>

            {/* Upcoming Deadlines */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                ⏰ Upcoming Deadlines
              </h3>
              <div className="space-y-3">
                {intakes.slice(0, 3).map((intake, index) => (
                  <motion.div 
                    key={intake.id} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + index * 0.1 }}
                    className="border-l-4 border-red-400 pl-4 p-3 bg-red-50 rounded-r-xl"
                  >
                    <p className="text-sm font-semibold text-gray-900">{intake.name}</p>
                    <p className="text-xs text-red-600 font-medium">
                      Deadline: {formatDate(intake.application_deadline)}
                    </p>
                  </motion.div>
                ))}
                {intakes.length === 0 && (
                  <div className="text-center py-4">
                    <p className="text-gray-500 text-sm">No upcoming deadlines</p>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Quick Links */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
              className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                ⚡ Quick Actions
              </h3>
              <div className="space-y-3">
                {hasDraft ? (
                  <>
                    <Link to="/student/application-wizard" className="block">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full justify-start bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100 font-semibold"
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Continue Draft
                      </Button>
                    </Link>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-start text-red-600 border-red-300 hover:bg-red-50 font-semibold"
                      onClick={() => {
                        // Clear all draft data
                        clearAllDraftData()
                        
                        // Update local state
                        setHasDraft(false)
                        setDraftData(null)
                      }}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Clear Draft
                    </Button>
                  </>
                ) : (
                  <Link to="/student/application-wizard" className="block">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full justify-start bg-gradient-to-r from-primary to-secondary text-white border-primary hover:from-primary/90 hover:to-secondary/90 font-semibold shadow-lg"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      New Application
                    </Button>
                  </Link>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full justify-start border-gray-300 hover:bg-gray-50 font-semibold"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Document Templates
                </Button>
                <Link to="/settings" className="block">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start border-purple-300 text-purple-700 hover:bg-purple-50 font-semibold"
                  >
                    <User className="h-4 w-4 mr-2" />
                    Profile Settings
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
          </>
        )}
        </div>
      </main>
    </div>
  )
}