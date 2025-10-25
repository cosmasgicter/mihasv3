import React, { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Download, Mail, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabaseClient, isSupabaseConfigured, SUPABASE_MISSING_CONFIG_MESSAGE } from '@/lib/supabase'
import { getApiBaseUrl } from '@/lib/apiConfig'
import { generateApplicationSlip } from '@/lib/applicationSlip'

interface ApplicationSlipActionsProps {
  applicationId: string
  applicationNumber: string
}

export function ApplicationSlipActions({ applicationId, applicationNumber }: ApplicationSlipActionsProps) {
  const { user } = useAuth()
  const apiBaseUrl = getApiBaseUrl()
  const supabase = useMemo(() => {
    if (!isSupabaseConfigured) {
      return null
    }

    return getSupabaseClient()
  }, [])
  const [isDownloading, setIsDownloading] = useState(false)
  const [isEmailing, setIsEmailing] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const authUnavailable = !supabase

  const handleDownload = async () => {
    if (!supabase) {
      alert(SUPABASE_MISSING_CONFIG_MESSAGE)
      return
    }

    setIsDownloading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token

      const response = await fetch(`${apiBaseUrl}/applications/generate/slip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({ applicationId })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to generate slip')
      }

      const result = await response.json()
      if (!result.success || !result.data) {
        throw new Error('Invalid response from server')
      }

      const blob = await generateApplicationSlip({ ...result.data, email: user?.email || '', userId: user?.id })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `application-slip-${applicationNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Download failed:', error)
      alert(`Failed to download application slip: ${error.message}`)
    } finally {
      setIsDownloading(false)
    }
  }

  const handleEmailRequest = async () => {
    if (!supabase) {
      alert(SUPABASE_MISSING_CONFIG_MESSAGE)
      return
    }

    setIsEmailing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token

      const response = await fetch(`${apiBaseUrl}/applications/email/slip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({ applicationId })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to send email')
      }

      const result = await response.json()
      if (result.success) {
        setEmailSent(true)
        setTimeout(() => setEmailSent(false), 5000)
      } else {
        throw new Error(result.error || 'Failed to send email')
      }
    } catch (error) {
      console.error('Email failed:', error)
      alert(`Failed to send email: ${error.message}`)
    } finally {
      setIsEmailing(false)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <Button
        onClick={handleDownload}
        disabled={isDownloading || authUnavailable}
        className="flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all duration-200"
      >
        {isDownloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        <span>{isDownloading ? 'Generating...' : 'Download Slip'}</span>
      </Button>

      <Button
        onClick={handleEmailRequest}
        disabled={isEmailing || emailSent || authUnavailable}
        variant="outline"
        className="flex items-center justify-center space-x-2 border-green-300 text-accent hover:bg-accent/10 hover:border-green-400 transition-all duration-200"
      >
        {isEmailing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Mail className="h-4 w-4" />
        )}
        <span>
          {isEmailing ? 'Sending...' : emailSent ? 'Email Sent!' : 'Email Slip'}
        </span>
      </Button>

      {emailSent && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="text-sm text-accent font-medium"
        >
          ✓ Application slip will be sent to your email shortly
        </motion.div>
      )}

      {authUnavailable && (
        <p className="text-sm text-accent font-medium">
          {SUPABASE_MISSING_CONFIG_MESSAGE}
        </p>
      )}
    </div>
  )
}