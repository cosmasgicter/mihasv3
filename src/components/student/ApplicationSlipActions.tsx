import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Download, Mail, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '@/contexts/AuthContext'

interface ApplicationSlipActionsProps {
  applicationId: string
  applicationNumber: string
}

export function ApplicationSlipActions({ applicationId, applicationNumber }: ApplicationSlipActionsProps) {
  const { session } = useAuth()
  const [isDownloading, setIsDownloading] = useState(false)
  const [isEmailing, setIsEmailing] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const response = await fetch('/.netlify/functions/applications-generate-slip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ applicationId })
      })

      if (!response.ok) {
        throw new Error('Failed to generate slip')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `application-slip-${applicationNumber}.html`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Download failed:', error)
      alert('Failed to download application slip')
    } finally {
      setIsDownloading(false)
    }
  }

  const handleEmailRequest = async () => {
    setIsEmailing(true)
    try {
      const response = await fetch('/.netlify/functions/applications-email-slip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({ applicationId })
      })

      if (!response.ok) {
        throw new Error('Failed to send email')
      }

      setEmailSent(true)
      setTimeout(() => setEmailSent(false), 5000)
    } catch (error) {
      console.error('Email failed:', error)
      alert('Failed to send email')
    } finally {
      setIsEmailing(false)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <Button
        onClick={handleDownload}
        disabled={isDownloading}
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
        disabled={isEmailing || emailSent}
        variant="outline"
        className="flex items-center justify-center space-x-2 border-green-300 text-green-700 hover:bg-green-50 hover:border-green-400 transition-all duration-200"
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
          className="text-sm text-green-600 font-medium"
        >
          ✓ Application slip will be sent to your email shortly
        </motion.div>
      )}
    </div>
  )
}