import { motion } from 'framer-motion'
import { CheckCircle, Download, Mail, Send } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/Button'

import type { SubmittedApplicationSummary } from '../hooks/useApplicationSlip'

interface SubmissionSuccessProps {
  submittedApplication: SubmittedApplicationSummary
  persistingSlip: boolean
  slipLoading: boolean
  emailLoading: boolean
  onDownload: () => Promise<void>
  onEmail: () => Promise<void>
}

const formatPaymentStatusLabel = (status?: string | null) => {
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

const SubmissionSuccess = ({
  submittedApplication,
  persistingSlip,
  slipLoading,
  emailLoading,
  onDownload,
  onEmail
}: SubmissionSuccessProps) => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
    <div className="max-w-lg w-full">
      <motion.div
        className="bg-white rounded-lg shadow-lg p-8 text-center"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}>
          <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-6" />
        </motion.div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Application Submitted Successfully!</h2>

        {persistingSlip && (
          <p className="text-sm text-blue-600 mb-4">Saving a copy of your application slip for admissions records...</p>
        )}

        <motion.div
          className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h3 className="font-semibold text-green-800 mb-3">Application Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-green-700">Application Number:</span>
              <span className="font-mono font-bold text-green-900">{submittedApplication.applicationNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-700">Tracking Code:</span>
              <span className="font-mono font-bold text-green-900">{submittedApplication.trackingCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-700">Program:</span>
              <span className="font-semibold text-green-900">{submittedApplication.program}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green-700">Institution:</span>
              <span className="font-semibold text-green-900">{submittedApplication.institution}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <span className="text-green-700 flex items-center justify-between sm:justify-start">
                <Send className="h-4 w-4 mr-2" />
                Payment Status:
              </span>
              <span
                className={`inline-flex items-center px-2 py-1 mt-2 sm:mt-0 rounded-full border text-xs font-semibold ${getPaymentStatusStyles(submittedApplication.paymentStatus)}`}
              >
                {formatPaymentStatusLabel(submittedApplication.paymentStatus)}
              </span>
            </div>
            <p className="text-left text-xs text-green-700">{getPaymentStatusDescription(submittedApplication.paymentStatus)}</p>
          </div>
        </motion.div>

        <p className="text-gray-600 mb-6">
          Your application is now under review. You'll receive notifications about status updates.
        </p>

        <div className="space-y-3 mb-6">
          <Button onClick={onDownload} loading={slipLoading || persistingSlip} className="w-full bg-emerald-600 hover:bg-emerald-700">
            <Download className="h-5 w-5 mr-2" />
            Download Application Slip
          </Button>
          <Button variant="outline" onClick={onEmail} loading={emailLoading} className="w-full">
            <Mail className="h-5 w-5 mr-2" />
            Email Me the Slip
          </Button>
        </div>

        <div className="space-y-3">
          <Link to="/student/dashboard">
            <Button className="w-full bg-blue-600 hover:bg-blue-700">Go to Dashboard</Button>
          </Link>
          <Link to="/track-application">
            <Button variant="outline" className="w-full">Track Application Status</Button>
          </Link>
        </div>
      </motion.div>
    </div>
  </div>
)

export default SubmissionSuccess
