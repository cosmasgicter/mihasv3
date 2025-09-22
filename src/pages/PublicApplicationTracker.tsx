import React, { useState, useCallback, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { AnimatedCard } from '@/components/ui/AnimatedCard'
import { formatDate, getStatusColor } from '@/lib/utils'

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { useToast } from '@/components/ui/Toast'
import { createApplicationSlip } from '@/lib/slipService'
import {
  Search,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  FileText,
  Calendar,
  User,
  ArrowLeft,
  Eye,
  Sparkles,
  Star,
  Zap,
  Heart,
  Trophy,
  Target,
  Rocket,
  Shield,
  Phone,
  Mail,
  MapPin,
  Download,
  Share2,
  Copy,
  ExternalLink,
  GraduationCap,
  CreditCard
} from 'lucide-react'

interface PublicApplicationStatus {
  public_tracking_code: string
  application_number: string
  status: string
  payment_status: string | null
  submitted_at: string | null
  updated_at: string | null
  program_name: string | null
  intake_name: string | null
  institution: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  admin_feedback?: string | null
  admin_feedback_date?: string | null
}

export default function PublicApplicationTracker() {
  const shouldReduceMotion = useReducedMotion()
  const maybeMotion = <T,>(value: T) => (shouldReduceMotion ? undefined : value)
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const [searchTerm, setSearchTerm] = useState('')
  const [application, setApplication] = useState<PublicApplicationStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [slipCache, setSlipCache] = useState<{ objectUrl?: string; publicUrl?: string; path?: string; documentId?: string } | null>(null)
  const [slipLoading, setSlipLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)

  const validateSearchTerm = useCallback((term: string): boolean => {
    const trimmed = term.trim()
    if (!trimmed) return false
    if (trimmed.length > 50) return false

    // Check if it's a valid application number format (KATC/MIHAS + year + sequence)
    const appNumberPattern = /^(KATC|MIHAS)\d{6}$/
    if (appNumberPattern.test(trimmed)) return true

    // Allow tracking codes (TRK format)
    return /^[a-zA-Z0-9\-_]+$/.test(trimmed)
  }, [])

  const resetSlipCache = useCallback(() => {
    setSlipCache(prev => {
      if (prev?.objectUrl) {
        URL.revokeObjectURL(prev.objectUrl)
      }
      return null
    })
  }, [])

  const searchApplication = useCallback(async (term: string) => {
    const trimmedTerm = term.trim()

    if (!trimmedTerm) {
      setError('Please enter an application number or tracking code')
      return
    }

    if (!validateSearchTerm(trimmedTerm)) {
      setError('Invalid search term. Use only letters, numbers, hyphens, and underscores (max 50 characters)')
      return
    }

    try {
      setLoading(true)
      setError('')
      setApplication(null)
      resetSlipCache()

      // Search by application number or tracking code using exact match
      const { data, error: searchError } = await supabase
        .from('public_application_status')
        .select(
          'public_tracking_code, application_number, status, payment_status, submitted_at, updated_at, program_name, intake_name, institution, full_name, email, phone, admin_feedback, admin_feedback_date'
        )
        .or(`application_number.eq."${trimmedTerm}",public_tracking_code.eq."${trimmedTerm}"`)
        .maybeSingle()

      if (searchError) {
        throw searchError
      }

      if (!data) {
        setError('Application not found. Please check your application number or tracking code.')
        setSearched(true)
        return
      }

      setApplication({
        ...(data as PublicApplicationStatus),
        payment_status: (data as PublicApplicationStatus)?.payment_status ?? 'pending_review'
      })
      setSearched(true)
    } catch (error: any) {
      console.error('Error searching application:', error)
      setError('An error occurred while searching. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [resetSlipCache, validateSearchTerm])

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) return

    const trimmed = code.trim()
    if (!validateSearchTerm(trimmed)) {
      setError('Invalid tracking code provided in the link. Please verify and try again.')
      return
    }

    setSearchTerm(trimmed)
    searchApplication(trimmed)
  }, [searchParams, searchApplication, validateSearchTerm])

  useEffect(() => () => {
    if (slipCache?.objectUrl) {
      URL.revokeObjectURL(slipCache.objectUrl)
    }
  }, [slipCache?.objectUrl])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <Trophy className="h-8 w-8 text-green-500" />
      case 'rejected':
        return <XCircle className="h-8 w-8 text-red-500" />
      case 'under_review':
        return <Target className="h-8 w-8 text-primary" />
      case 'submitted':
        return <Rocket className="h-8 w-8 text-yellow-500" />
      default:
        return <Clock className="h-8 w-8 text-secondary" />
    }
  }

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'approved':
        return '🎉'
      case 'rejected':
        return '💔'
      case 'under_review':
        return '🔍'
      case 'submitted':
        return '🚀'
      default:
        return '⏳'
    }
  }

  const getStatusMessage = (status: string) => {
    switch (status) {
      case 'submitted':
        return 'Your application has been successfully received and is in our queue for initial review. Our admissions team will begin processing it shortly.'
      case 'under_review':
        return 'Great news! Your application is currently being carefully reviewed by our expert admissions team. We\'re evaluating all aspects of your submission.'
      case 'approved':
        return 'Congratulations! 🎉 Your application has been approved! You\'ve been accepted into the program. Check your email for detailed next steps and enrollment information.'
      case 'rejected':
        return 'We appreciate your interest in our program. Unfortunately, your application was not successful this time. Don\'t give up - you may apply for future intakes with improved qualifications.'
      default:
        return 'Your application status is being updated. Please check back soon for the latest information.'
    }
  }

  const formatDisplayDate = (value?: string | null) => {
    if (!value) return 'Not available'

    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      return 'Not available'
    }

    return formatDate(parsed)
  }

  const displayValue = (value?: string | null, fallback = 'Not available') => {
    if (!value) return fallback
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : fallback
  }

  const formatPaymentStatus = (status?: string | null) => {
    if (!status) return 'Pending Review'
    return status
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  }

  const getPaymentStatusStyles = (status?: string | null) => {
    switch (status) {
      case 'verified':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      case 'rejected':
        return 'bg-rose-100 text-rose-800 border-rose-200'
      case 'pending_review':
      default:
        return 'bg-amber-100 text-amber-800 border-amber-200'
    }
  }

  const getPaymentStatusDescription = (status?: string | null) => {
    switch (status) {
      case 'verified':
        return 'Payment verified — you are all set.'
      case 'rejected':
        return 'Payment issue detected — please contact support.'
      case 'pending_review':
      default:
        return 'Payment submitted — awaiting verification by admissions.'
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      searchApplication(searchTerm)
    }
  }, [searchApplication, searchTerm])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchTerm(value)
    // Clear error when user starts typing
    if (error) {
      setError('')
    }
  }, [error])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text')
    const sanitized = pasted.replace(/[^a-zA-Z0-9\-_]/g, '').trim()
    setSearchTerm(sanitized)
    // Clear error when pasting
    if (error) {
      setError('')
    }
  }, [error])

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
        if (!response.ok) {
          throw new Error('Unable to download stored application slip')
        }
        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        setSlipCache(prev => {
          if (prev?.objectUrl) {
            URL.revokeObjectURL(prev.objectUrl)
          }
          return { ...prev, objectUrl }
        })
        triggerDownload(objectUrl, filename)
        return
      }

      const slipEmail = application.email?.trim() || 'no-email@mihas.local'
      // Note: Public tracker doesn't have user context, so userId will be undefined
      // This will fall back to service-role upload in persistSlip
      const payload = buildSlipPayload(slipEmail)
      if (!payload) {
        toast.showError('Slip unavailable', 'Missing application details for slip generation.')
        return
      }

      const result = await createApplicationSlip(payload, { toast })

      if (result.error) {
        toast.showError('Download failed', result.error)
        return
      }

      const objectUrl = result.blob ? URL.createObjectURL(result.blob) : undefined
      const downloadUrl = objectUrl || result.publicUrl

      if (!downloadUrl) {
        toast.showError('Download failed', 'We could not prepare the application slip for download.')
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
      console.error('Slip download failed:', downloadError)
      toast.showError('Download failed', downloadError instanceof Error ? downloadError.message : 'Unable to download slip')
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
      toast.showError('Email required', 'Please provide an email address to receive the slip.')
      return
    }

    // Note: Public tracker doesn't have user context, so userId will be undefined
    // This will fall back to service-role upload in persistSlip
    const payload = buildSlipPayload(emailAddress)
    if (!payload) {
      toast.showError('Slip unavailable', 'Missing application details for slip delivery.')
      return
    }

    try {
      setEmailLoading(true)
      const result = await createApplicationSlip(payload, { toast, sendEmail: true })

      if (result.error || result.emailError) {
        const message = result.error || result.emailError || 'We could not email the slip.'
        toast.showError('Email failed', message)
        return
      }

      setSlipCache(prev => {
        if (prev?.objectUrl && result.blob) {
          URL.revokeObjectURL(prev.objectUrl)
        }

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
      console.error('Slip email failed:', emailError)
      toast.showError('Email failed', emailError instanceof Error ? emailError.message : 'Unable to email slip')
    } finally {
      setEmailLoading(false)
    }
  }, [application, buildSlipPayload, toast])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={maybeMotion({
            x: [0, 100, 0],
            y: [0, -100, 0],
            rotate: [0, 180, 360]
          })}
          transition={maybeMotion({ duration: 20, repeat: Infinity, ease: "linear" })}
          className="absolute top-10 left-10 w-20 h-20 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full opacity-20"
        />
        <motion.div
          animate={maybeMotion({
            x: [0, -150, 0],
            y: [0, 100, 0],
            rotate: [360, 180, 0]
          })}
          transition={maybeMotion({ duration: 25, repeat: Infinity, ease: "linear" })}
          className="absolute top-1/3 right-10 w-32 h-32 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full opacity-15"
        />
        <motion.div
          animate={maybeMotion({
            x: [0, 80, 0],
            y: [0, -80, 0],
            scale: [1, 1.2, 1]
          })}
          transition={maybeMotion({ duration: 15, repeat: Infinity, ease: "linear" })}
          className="absolute bottom-20 left-1/4 w-16 h-16 bg-gradient-to-r from-green-400 to-blue-400 rounded-full opacity-25"
        />
      </div>

      {/* Enhanced Header - Mobile First */}
      <motion.header
        initial={maybeMotion({ y: -50, opacity: 0 })}
        animate={maybeMotion({ y: 0, opacity: 1 })}
        className="relative bg-white/90 backdrop-blur-md shadow-2xl border-b border-white/30 safe-area-top"
      >
        <div className="container-mobile">
          <div className="flex flex-col space-y-4 py-4 sm:flex-row sm:justify-between sm:items-center sm:space-y-0 sm:py-8">
            <div className="flex flex-col space-y-3 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-6">
              <Link to="/" className="inline-flex items-center text-primary hover:text-primary/80 transition-all duration-300 group touch-target">
                <ArrowLeft className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3 group-hover:-translate-x-2 transition-transform" />
                <span className="font-bold text-base sm:text-lg">Back to Home</span>
              </Link>
              <div>
                <motion.h1
                  initial={maybeMotion({ scale: 0.8 })}
                  animate={maybeMotion({ scale: 1 })}
                  className="text-responsive-3xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent"
                >
                  🔍 Track Application
                </motion.h1>
                <motion.p
                  initial={maybeMotion({ opacity: 0 })}
                  animate={maybeMotion({ opacity: 1 })}
                  transition={maybeMotion({ delay: 0.2 })}
                  className="text-sm sm:text-xl text-secondary/80 mt-1 sm:mt-2 font-medium"
                >
                  ✨ Check status instantly - no login required!
                </motion.p>
              </div>
            </div>
            <motion.div
              animate={maybeMotion({ rotate: [0, 10, -10, 0] })}
              transition={maybeMotion({ duration: 2, repeat: Infinity })}
              className="text-4xl sm:text-6xl self-center sm:self-auto"
            >
              🎓
            </motion.div>
          </div>
        </div>
      </motion.header>

      <main className="relative container-mobile py-6 sm:py-12 safe-area-bottom mobile-scroll">
        {/* Enhanced Search Section - Mobile First */}
        <motion.div
          initial={maybeMotion({ opacity: 0, y: 30 })}
          animate={maybeMotion({ opacity: 1, y: 0 })}
          transition={maybeMotion({ delay: 0.3 })}
        >
          <AnimatedCard className="mb-8 sm:mb-12 bg-gradient-to-br from-white via-blue-50 to-purple-50 card-mobile" glassEffect hover3d>
            <div className="text-center space-y-6 sm:space-y-8">
              <motion.div
                initial={maybeMotion({ scale: 0 })}
                animate={maybeMotion({ scale: 1 })}
                transition={maybeMotion({ delay: 0.5, type: "spring" })}
                className="text-6xl sm:text-8xl"
              >
                🔍
              </motion.div>
              
              <div>
                <h2 className="text-responsive-3xl font-black text-secondary mb-3 sm:mb-4">
                  Find Your Application
                </h2>
                <p className="text-base sm:text-xl text-secondary/80 max-w-2xl mx-auto leading-relaxed px-4">
                  Enter your <span className="font-bold text-primary">application number</span> (e.g., MIHAS123456) or 
                  <span className="font-bold text-secondary"> tracking code</span> to check status.
                </p>
              </div>
              
              <div className="max-w-2xl mx-auto px-4">
                <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:gap-4">
                  <div className="flex-1">
                    <motion.div
                      whileFocus={maybeMotion({ scale: 1.02 })}
                      className="relative"
                    >
                      <Search className="absolute left-4 sm:left-6 top-1/2 transform -translate-y-1/2 h-5 w-5 sm:h-6 sm:w-6 text-secondary/60" />
                      <Input
                        value={searchTerm}
                        onChange={handleInputChange}
                        onPaste={handlePaste}
                        onKeyPress={handleKeyPress}
                        placeholder="Enter application number..."
                        className="form-input-mobile w-full text-base sm:text-xl py-4 sm:py-6 pl-12 sm:pl-16 pr-4 sm:pr-6 border-3 border-gray-200 focus:border-primary rounded-2xl shadow-lg font-medium"
                      />
                    </motion.div>
                  </div>
                  <Button
                    onClick={() => searchApplication(searchTerm)}
                    loading={loading}
                    size="lg"
                    className="btn-responsive text-base sm:text-xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 hover:shadow-2xl rounded-2xl transform hover:scale-105 transition-all duration-300 touch-target"
                    magnetic
                    glow
                  >
                    <Search className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" />
                    {loading ? 'Searching...' : 'Search Now'}
                  </Button>
                </div>
                
                <AnimatePresence initial={!shouldReduceMotion}>
                  {error && (
                    <motion.div
                      initial={maybeMotion({ opacity: 0, y: 20 })}
                      animate={maybeMotion({ opacity: 1, y: 0 })}
                      exit={maybeMotion({ opacity: 0, y: -20 })}
                      className="mt-8 rounded-2xl bg-gradient-to-r from-red-50 to-pink-50 border-2 border-red-200 p-8 shadow-lg"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="text-4xl">⚠️</div>
                        <div className="text-xl text-red-700 font-bold">{error}</div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              {/* Quick Tips - Mobile First */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-8 sm:mt-12">
                <motion.div
                  initial={maybeMotion({ opacity: 0, y: 20 })}
                  animate={maybeMotion({ opacity: 1, y: 0 })}
                  transition={maybeMotion({ delay: 0.7 })}
                  className="bg-blue-50 rounded-xl p-4 sm:p-6 border border-blue-200"
                >
                  <div className="text-2xl sm:text-3xl mb-2 sm:mb-3">📧</div>
                  <h3 className="font-bold text-secondary mb-2 text-sm sm:text-base">Check Your Email</h3>
                  <p className="text-secondary/70 text-xs sm:text-sm">Application number sent after submission</p>
                </motion.div>
                
                <motion.div
                  initial={maybeMotion({ opacity: 0, y: 20 })}
                  animate={maybeMotion({ opacity: 1, y: 0 })}
                  transition={maybeMotion({ delay: 0.8 })}
                  className="bg-green-50 rounded-xl p-4 sm:p-6 border border-green-200"
                >
                  <div className="text-2xl sm:text-3xl mb-2 sm:mb-3">🔢</div>
                  <h3 className="font-bold text-secondary mb-2 text-sm sm:text-base">Format Example</h3>
                  <p className="text-secondary/70 font-mono text-xs sm:text-sm">MIHAS123456</p>
                </motion.div>
                
                <motion.div
                  initial={maybeMotion({ opacity: 0, y: 20 })}
                  animate={maybeMotion({ opacity: 1, y: 0 })}
                  transition={maybeMotion({ delay: 0.9 })}
                  className="bg-purple-50 rounded-xl p-4 sm:p-6 border border-purple-200 sm:col-span-2 lg:col-span-1"
                >
                  <div className="text-2xl sm:text-3xl mb-2 sm:mb-3">⚡</div>
                  <h3 className="font-bold text-secondary mb-2 text-sm sm:text-base">Instant Results</h3>
                  <p className="text-secondary/70 text-xs sm:text-sm">Real-time updates without login</p>
                </motion.div>
              </div>
            </div>
          </AnimatedCard>
        </motion.div>

        {/* Enhanced Application Status */}
        <AnimatePresence initial={!shouldReduceMotion}>
          {application && (
            <motion.div
              initial={maybeMotion({ opacity: 0, scale: 0.9, y: 50 })}
              animate={maybeMotion({ opacity: 1, scale: 1, y: 0 })}
              exit={maybeMotion({ opacity: 0, scale: 0.9, y: -50 })}
              transition={maybeMotion({ type: "spring", damping: 20 })}
            >
              <AnimatedCard className="overflow-hidden shadow-2xl" glassEffect>
                {/* Spectacular Status Header */}
                <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 relative overflow-hidden">
                  {/* Animated background pattern */}
                  <div className="absolute inset-0 opacity-20">
                    <motion.div
                      animate={maybeMotion({ x: [0, 100, 0], y: [0, -50, 0] })}
                      transition={maybeMotion({ duration: 10, repeat: Infinity })}
                      className="absolute top-0 left-0 w-32 h-32 bg-white rounded-full"
                    />
                    <motion.div
                      animate={maybeMotion({ x: [100, 0, 100], y: [0, 50, 0] })}
                      transition={maybeMotion({ duration: 15, repeat: Infinity })}
                      className="absolute bottom-0 right-0 w-24 h-24 bg-white rounded-full"
                    />
                  </div>
                  
                  <div className="relative space-responsive text-white">
                    <div className="flex flex-col space-y-4 lg:flex-row lg:items-start lg:justify-between lg:space-y-0 lg:space-x-6">
                      <div className="space-y-3 sm:space-y-4 flex-1">
                        <motion.div
                          initial={maybeMotion({ x: -50, opacity: 0 })}
                          animate={maybeMotion({ x: 0, opacity: 1 })}
                          transition={maybeMotion({ delay: 0.2 })}
                        >
                          <h3 className="text-responsive-2xl font-black mb-3 sm:mb-4 flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
                            <span className="text-3xl sm:text-4xl">📋</span>
                            <span className="break-all">Application #{application.application_number}</span>
                          </h3>
                        </motion.div>
                        
                        <motion.div
                          initial={maybeMotion({ x: -50, opacity: 0 })}
                          animate={maybeMotion({ x: 0, opacity: 1 })}
                          transition={maybeMotion({ delay: 0.3 })}
                          className="space-y-2 sm:space-y-3"
                        >
                          <p className="text-white/95 text-base sm:text-2xl font-bold flex items-start sm:items-center space-x-2 sm:space-x-3">
                            <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <span className="break-words">{application.program_name}</span>
                          </p>
                          <p className="text-white/85 text-sm sm:text-xl font-semibold flex items-start sm:items-center space-x-2 sm:space-x-3">
                            <Calendar className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 mt-0.5 sm:mt-0" />
                            <span className="break-words">{application.intake_name}</span>
                          </p>
                        </motion.div>
                      </div>
                      
                      <motion.div
                        initial={maybeMotion({ x: 50, opacity: 0 })}
                        animate={maybeMotion({ x: 0, opacity: 1 })}
                        transition={maybeMotion({ delay: 0.4 })}
                        className="text-center lg:text-right space-y-3 sm:space-y-4 flex-shrink-0"
                      >
                        <div className="flex items-center justify-center lg:justify-end space-x-3 sm:space-x-4">
                          <motion.div
                            animate={maybeMotion({ rotate: [0, 10, -10, 0] })}
                            transition={maybeMotion({ duration: 2, repeat: Infinity })}
                            className="text-4xl sm:text-6xl"
                          >
                            {getStatusEmoji(application.status)}
                          </motion.div>
                          <div className="text-4xl sm:text-6xl">
                            {getStatusIcon(application.status)}
                          </div>
                        </div>
                        
                        <motion.span
                          initial={maybeMotion({ scale: 0 })}
                          animate={maybeMotion({ scale: 1 })}
                          transition={maybeMotion({ delay: 0.5, type: "spring" })}
                          className="inline-block bg-white/25 backdrop-blur-sm px-4 sm:px-8 py-2 sm:py-4 rounded-xl sm:rounded-2xl text-white font-black text-base sm:text-2xl border-2 border-white/30 shadow-lg"
                        >
                          {application.status.replace('_', ' ').toUpperCase()}
                        </motion.span>
                        
                        <p className="text-white/85 text-sm sm:text-lg font-medium flex items-center justify-center lg:justify-end space-x-2">
                          <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
                          <span className="text-xs sm:text-base">Updated: {formatDisplayDate(application.updated_at)}</span>
                        </p>
                        
                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 justify-center lg:justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowShareModal(true)}
                            className="bg-white/20 border-white/30 text-white hover:bg-white/30 btn-mobile touch-target"
                          >
                            <Share2 className="h-4 w-4 mr-2" />
                            Share
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(application.application_number)}
                            className="bg-white/20 border-white/30 text-white hover:bg-white/30 btn-mobile touch-target"
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            {copied ? 'Copied!' : 'Copy #'}
                          </Button>
                        </div>
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDownloadSlip}
                            loading={slipLoading}
                            className="bg-white/20 border-white/30 text-white hover:bg-white/30 btn-mobile touch-target"
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download Slip
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleEmailSlip}
                            loading={emailLoading}
                            className="bg-white/20 border-white/30 text-white hover:bg-white/30 btn-mobile touch-target"
                          >
                            <Mail className="h-4 w-4 mr-2" />
                            Email Me the Slip
                          </Button>
                        </div>
                      </motion.div>
                    </div>
                  </div>
                </div>

                {/* Enhanced Status Details - Mobile First */}
                <div className="space-responsive-lg">
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 sm:gap-8 xl:gap-12">
                    {/* Main Status */}
                    <div className="xl:col-span-2 space-y-6 sm:space-y-8">
                      <motion.div
                        initial={maybeMotion({ opacity: 0, y: 20 })}
                        animate={maybeMotion({ opacity: 1, y: 0 })}
                        transition={maybeMotion({ delay: 0.6 })}
                      >
                        <h4 className="text-responsive-2xl font-black text-secondary mb-6 sm:mb-8 flex items-center space-x-2 sm:space-x-3">
                          <span className="text-2xl sm:text-3xl">📊</span>
                          <span>Current Status</span>
                        </h4>
                        
                        <div className={`bg-gradient-to-br space-responsive rounded-2xl shadow-2xl border-2 ${
                          application.status === 'approved' 
                            ? 'from-green-50 via-emerald-50 to-teal-50 border-green-300'
                            : application.status === 'rejected'
                            ? 'from-red-50 via-pink-50 to-rose-50 border-red-300'
                            : application.status === 'under_review'
                            ? 'from-blue-50 via-indigo-50 to-purple-50 border-blue-300'
                            : 'from-yellow-50 via-orange-50 to-amber-50 border-yellow-300'
                        }`}>
                          <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-4 sm:space-y-0 sm:space-x-6 lg:space-x-8">
                            <motion.div
                              animate={maybeMotion({
                                scale: [1, 1.1, 1],
                                rotate: [0, 5, -5, 0]
                              })}
                              transition={maybeMotion({ duration: 3, repeat: Infinity })}
                              className="text-5xl sm:text-6xl lg:text-7xl flex-shrink-0"
                            >
                              {getStatusEmoji(application.status)}
                            </motion.div>
                            <div className="flex-1 text-center sm:text-left">
                              <p className="font-black text-xl sm:text-2xl lg:text-3xl text-secondary mb-3 sm:mb-4">
                                {application.status.replace('_', ' ').toUpperCase()}
                              </p>
                              <p className="text-secondary text-base sm:text-lg lg:text-xl leading-relaxed">
                                {getStatusMessage(application.status)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </motion.div>

                      {/* Admin Feedback - Mobile First */}
                      <AnimatePresence initial={!shouldReduceMotion}>
                        {application.admin_feedback && (
                          <motion.div
                            initial={maybeMotion({ opacity: 0, y: 20 })}
                            animate={maybeMotion({ opacity: 1, y: 0 })}
                            exit={maybeMotion({ opacity: 0, y: -20 })}
                            transition={maybeMotion({ delay: 0.7 })}
                            className="bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 border-2 border-green-300 rounded-2xl space-responsive shadow-2xl"
                          >
                            <h5 className="font-black text-green-900 mb-4 sm:mb-6 text-lg sm:text-xl lg:text-2xl flex items-center space-x-2 sm:space-x-3">
                              <span className="text-xl sm:text-2xl">💬</span>
                              <span>Message from Admissions</span>
                            </h5>
                            <div className="bg-white/70 rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
                              <p className="text-green-800 text-base sm:text-lg lg:text-xl leading-relaxed font-medium">
                                {application.admin_feedback}
                              </p>
                            </div>
                            {application.admin_feedback_date && (
                              <p className="text-green-600 font-bold text-sm sm:text-base lg:text-lg flex items-center space-x-2">
                                <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
                                <span>Provided on {formatDate(application.admin_feedback_date)}</span>
                              </p>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Application Info - Mobile First */}
                    <motion.div
                      initial={maybeMotion({ opacity: 0, x: 20 })}
                      animate={maybeMotion({ opacity: 1, x: 0 })}
                      transition={maybeMotion({ delay: 0.8 })}
                      className="space-y-4 sm:space-y-6"
                    >
                      <h4 className="text-responsive-2xl font-black text-secondary mb-6 sm:mb-8 flex items-center space-x-2 sm:space-x-3">
                        <span className="text-2xl sm:text-3xl">📋</span>
                        <span>Details</span>
                      </h4>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <AnimatedCard className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200" hover3d>
                          <div className="flex items-center space-x-3 sm:space-x-4">
                            <div className="p-2 sm:p-3 bg-blue-500 rounded-lg sm:rounded-xl flex-shrink-0">
                              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-secondary text-sm sm:text-base lg:text-lg">Application Number</p>
                              <p className="text-secondary font-mono text-base sm:text-lg lg:text-xl break-all">{application.application_number}</p>
                            </div>
                          </div>
                        </AnimatedCard>

                        <AnimatedCard className="bg-gradient-to-r from-slate-50 to-sky-50 border border-sky-200" hover3d delay={0.05}>
                          <div className="flex items-center space-x-3 sm:space-x-4">
                            <div className="p-2 sm:p-3 bg-sky-500 rounded-lg sm:rounded-xl flex-shrink-0">
                              <User className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-secondary text-sm sm:text-base lg:text-lg">Applicant</p>
                              <p className="text-secondary text-base sm:text-lg lg:text-xl break-words">{displayValue(application.full_name)}</p>
                            </div>
                          </div>
                        </AnimatedCard>

                        <AnimatedCard className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200" hover3d delay={0.1}>
                          <div className="flex items-center space-x-3 sm:space-x-4">
                            <div className="p-2 sm:p-3 bg-purple-500 rounded-lg sm:rounded-xl flex-shrink-0">
                              <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-secondary text-sm sm:text-base lg:text-lg">Program</p>
                              <p className="text-secondary text-base sm:text-lg lg:text-xl break-words">{displayValue(application.program_name, 'Program unavailable')}</p>
                            </div>
                          </div>
                        </AnimatedCard>

                        <AnimatedCard className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200" hover3d delay={0.15}>
                          <div className="flex items-center space-x-3 sm:space-x-4">
                            <div className="p-2 sm:p-3 bg-green-500 rounded-lg sm:rounded-xl flex-shrink-0">
                              <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-secondary text-sm sm:text-base lg:text-lg">Intake Period</p>
                              <p className="text-secondary text-base sm:text-lg lg:text-xl break-words">{displayValue(application.intake_name, 'Intake unavailable')}</p>
                            </div>
                          </div>
                        </AnimatedCard>

                        <AnimatedCard className="bg-gradient-to-r from-amber-50 to-orange-50 border border-orange-200" hover3d delay={0.2}>
                          <div className="flex items-center space-x-3 sm:space-x-4">
                            <div className="p-2 sm:p-3 bg-orange-500 rounded-lg sm:rounded-xl flex-shrink-0">
                              <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-secondary text-sm sm:text-base lg:text-lg">Submitted On</p>
                              <p className="text-secondary text-base sm:text-lg lg:text-xl">{application.submitted_at ? formatDisplayDate(application.submitted_at) : 'Not submitted yet'}</p>
                            </div>
                          </div>
                        </AnimatedCard>

                        <AnimatedCard className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200" hover3d delay={0.25}>
                          <div className="flex items-center space-x-3 sm:space-x-4">
                            <div className="p-2 sm:p-3 bg-indigo-500 rounded-lg sm:rounded-xl flex-shrink-0">
                              <MapPin className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-secondary text-sm sm:text-base lg:text-lg">Institution</p>
                              <p className="text-secondary text-base sm:text-lg lg:text-xl break-words">{displayValue(application.institution, 'Not specified')}</p>
                            </div>
                          </div>
                        </AnimatedCard>

                        <AnimatedCard className="bg-gradient-to-r from-rose-50 to-pink-50 border border-rose-200" hover3d delay={0.3}>
                          <div className="flex items-center space-x-3 sm:space-x-4">
                            <div className="p-2 sm:p-3 bg-rose-500 rounded-lg sm:rounded-xl flex-shrink-0">
                              <Mail className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-secondary text-sm sm:text-base lg:text-lg">Email</p>
                              {application.email ? (
                                <a
                                  href={`mailto:${application.email}`}
                                  className="text-primary text-base sm:text-lg lg:text-xl break-all hover:underline"
                                >
                                  {application.email}
                                </a>
                              ) : (
                                <p className="text-secondary text-base sm:text-lg lg:text-xl">{displayValue(application.email)}</p>
                              )}
                            </div>
                          </div>
                        </AnimatedCard>

                        <AnimatedCard className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200" hover3d delay={0.35}>
                          <div className="flex items-center space-x-3 sm:space-x-4">
                            <div className="p-2 sm:p-3 bg-emerald-500 rounded-lg sm:rounded-xl flex-shrink-0">
                              <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-secondary text-sm sm:text-base lg:text-lg">Payment Status</p>
                              <span
                                className={`inline-flex items-center px-3 py-1 mt-1 rounded-full text-xs sm:text-sm font-bold border ${getPaymentStatusStyles(application.payment_status)}`}
                              >
                                {formatPaymentStatus(application.payment_status)}
                              </span>
                              <p className="text-secondary/70 text-xs sm:text-sm mt-2">
                                {getPaymentStatusDescription(application.payment_status)}
                              </p>
                            </div>
                          </div>
                        </AnimatedCard>
                      </div>
                    </motion.div>
                  </div>
                </div>

                {/* Enhanced Action Buttons */}
                <div className="bg-gradient-to-r from-blue-50 via-purple-50 to-indigo-50 border-t-2 border-blue-200">
                  <div className="p-10">
                    <div className="flex flex-col lg:flex-row justify-between items-center space-y-6 lg:space-y-0">
                      <motion.div
                        initial={maybeMotion({ opacity: 0, x: -20 })}
                        animate={maybeMotion({ opacity: 1, x: 0 })}
                        transition={maybeMotion({ delay: 0.9 })}
                        className="text-center lg:text-left"
                      >
                        <p className="text-2xl text-secondary font-bold mb-2 flex items-center justify-center lg:justify-start space-x-2">
                          <Phone className="h-6 w-6" />
                          <span>Need Help?</span>
                        </p>
                        <p className="text-lg text-secondary/80">
                          Contact our admissions office for assistance and support.
                        </p>
                      </motion.div>
                      
                      <motion.div
                        initial={maybeMotion({ opacity: 0, x: 20 })}
                        animate={maybeMotion({ opacity: 1, x: 0 })}
                        transition={maybeMotion({ delay: 1 })}
                        className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4"
                      >
                        <Link to="/apply">
                          <Button 
                            variant="outline" 
                            size="xl" 
                            className="text-xl px-8 py-4 border-2 border-secondary hover:bg-secondary hover:text-white transition-all duration-300"
                            magnetic
                          >
                            <Rocket className="h-6 w-6 mr-3" />
                            Submit New Application
                          </Button>
                        </Link>
                        <Link to="/auth/signin">
                          <Button 
                            size="xl" 
                            className="text-xl px-8 py-4 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
                            magnetic
                            glow
                          >
                            <Eye className="h-6 w-6 mr-3" />
                            View Full Details
                          </Button>
                        </Link>
                      </motion.div>
                    </div>
                  </div>
                </div>
              </AnimatedCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Enhanced No Results */}
        <AnimatePresence initial={!shouldReduceMotion}>
          {searched && !application && !loading && (
            <motion.div
              initial={maybeMotion({ opacity: 0, scale: 0.9 })}
              animate={maybeMotion({ opacity: 1, scale: 1 })}
              exit={maybeMotion({ opacity: 0, scale: 0.9 })}
            >
              <AnimatedCard className="text-center py-20" glassEffect>
                <motion.div
                  initial={maybeMotion({ opacity: 0, y: 20 })}
                  animate={maybeMotion({ opacity: 1, y: 0 })}
                  className="space-y-8"
                >
                  <motion.div
                    animate={maybeMotion({ rotate: [0, -10, 10, 0] })}
                    transition={maybeMotion({ duration: 2, repeat: Infinity })}
                    className="text-8xl"
                  >
                    🔍
                  </motion.div>
                  
                  <div>
                    <h3 className="text-4xl font-black text-secondary mb-6">
                      No Application Found
                    </h3>
                    <p className="text-xl text-secondary/80 max-w-2xl mx-auto leading-relaxed mb-8">
                      We couldn't find an application with that number or tracking code. 
                      Please double-check your information and try again.
                    </p>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-6">
                    <Button 
                      variant="outline" 
                      size="xl"
                      className="text-xl px-10 py-5 border-2"
                      onClick={() => {
                        setSearchTerm('')
                        setSearched(false)
                        setError('')
                      }}
                      magnetic
                    >
                      <Search className="h-6 w-6 mr-3" />
                      Try Again
                    </Button>
                    <Link to="/apply">
                      <Button 
                        size="xl" 
                        className="text-xl px-10 py-5 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600"
                        magnetic
                        glow
                      >
                        <Rocket className="h-6 w-6 mr-3" />
                        Submit New Application
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              </AnimatedCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Enhanced Help Section */}
        <motion.div
          initial={maybeMotion({ opacity: 0, y: 30 })}
          animate={maybeMotion({ opacity: 1, y: 0 })}
          transition={maybeMotion({ delay: 1.2 })}
          className="mt-16"
        >
          <AnimatedCard glassEffect>
            <div className="text-center mb-12">
              <h3 className="text-4xl font-black text-secondary mb-4 flex items-center justify-center space-x-3">
                <span>❓</span>
                <span>Need Help?</span>
              </h3>
              <p className="text-xl text-secondary/80">Everything you need to know about tracking your application</p>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
              <AnimatedCard className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200" hover3d>
                <div className="text-center space-y-4">
                  <div className="text-5xl">📍</div>
                  <h4 className="font-black text-secondary text-2xl">
                    Where to find your application number?
                  </h4>
                  <ul className="text-secondary space-y-3 text-lg text-left">
                    <li className="flex items-start space-x-3">
                      <span className="text-blue-500 font-bold">•</span>
                      <span>Check your email confirmation after submitting</span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-blue-500 font-bold">•</span>
                      <span>Look for format: <code className="bg-blue-100 px-2 py-1 rounded font-mono">MIHAS123456</code></span>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-blue-500 font-bold">•</span>
                      <span>Contact admissions if you can't find it</span>
                    </li>
                  </ul>
                </div>
              </AnimatedCard>
              
              <AnimatedCard className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200" hover3d delay={0.1}>
                <div className="text-center space-y-4">
                  <div className="text-5xl">📊</div>
                  <h4 className="font-black text-secondary text-2xl">
                    Application Status Meanings
                  </h4>
                  <ul className="text-secondary space-y-3 text-lg text-left">
                    <li className="flex items-start space-x-3">
                      <span className="text-2xl">🚀</span>
                      <div>
                        <strong>Submitted:</strong> Application received and queued
                      </div>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-2xl">🔍</span>
                      <div>
                        <strong>Under Review:</strong> Being carefully evaluated
                      </div>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-2xl">🎉</span>
                      <div>
                        <strong>Approved:</strong> Congratulations! You're accepted
                      </div>
                    </li>
                    <li className="flex items-start space-x-3">
                      <span className="text-2xl">💔</span>
                      <div>
                        <strong>Rejected:</strong> Not accepted this time
                      </div>
                    </li>
                  </ul>
                </div>
              </AnimatedCard>
            </div>
            
            <AnimatedCard className="bg-gradient-to-r from-purple-50 via-blue-50 to-indigo-50 border-2 border-purple-200" delay={0.2}>
              <div className="text-center space-y-6">
                <div className="flex items-center justify-center space-x-4">
                  <Phone className="h-8 w-8 text-purple-600" />
                  <Mail className="h-8 w-8 text-blue-600" />
                  <MapPin className="h-8 w-8 text-indigo-600" />
                </div>
                
                <h4 className="text-3xl font-black text-secondary">
                  📞 Contact Information
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-lg">
                  <div className="bg-white/70 rounded-xl p-6">
                    <p className="font-bold text-secondary mb-2">📧 Email Support</p>
                    <a href="mailto:info@mihas.edu.zm" className="text-primary font-bold hover:underline">
                      info@mihas.edu.zm
                    </a>
                  </div>
                  
                  <div className="bg-white/70 rounded-xl p-6">
                    <p className="font-bold text-secondary mb-2">📱 Phone Support</p>
                    <div className="space-y-1">
                      <p><strong>KATC:</strong> <a href="tel:0966992299" className="text-primary font-bold hover:underline">0966992299</a></p>
                      <p><strong>MIHAS:</strong> <a href="tel:0961515151" className="text-primary font-bold hover:underline">0961515151</a></p>
                    </div>
                  </div>
                </div>
              </div>
            </AnimatedCard>
          </AnimatedCard>
        </motion.div>
        
        {/* Share Modal */}
        <AnimatePresence initial={!shouldReduceMotion}>
          {showShareModal && (
            <motion.div
              initial={maybeMotion({ opacity: 0 })}
              animate={maybeMotion({ opacity: 1 })}
              exit={maybeMotion({ opacity: 0 })}
              className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
              onClick={() => setShowShareModal(false)}
            >
              <motion.div
                initial={maybeMotion({ scale: 0.8, opacity: 0 })}
                animate={maybeMotion({ scale: 1, opacity: 1 })}
                exit={maybeMotion({ scale: 0.8, opacity: 0 })}
                className="bg-white rounded-2xl p-8 max-w-md w-full"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-2xl font-bold text-secondary mb-6 text-center">
                  📤 Share Application Status
                </h3>
                
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-sm text-secondary/70 mb-2">Application Number</p>
                    <p className="font-mono text-lg font-bold">{application?.application_number}</p>
                  </div>
                  
                  <div className="flex space-x-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => copyToClipboard(window.location.href)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Link
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => copyToClipboard(application?.application_number || '')}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Copy Number
                    </Button>
                  </div>
                  
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => setShowShareModal(false)}
                  >
                    Close
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
