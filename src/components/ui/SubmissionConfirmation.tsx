import React from 'react'
import { CheckCircle, Download, Mail, ExternalLink, Copy } from 'lucide-react'
import { Button } from './Button'

interface SubmissionConfirmationProps {
  referenceNumber: string
  trackingCode: string
  applicationId: string
  programName: string
  submissionDate: string
  paymentStatus: string
  userEmail: string
  onDownloadReceipt: () => void
  onTrackApplication: () => void
  onGoToDashboard: () => void
}

export const SubmissionConfirmation: React.FC<SubmissionConfirmationProps> = ({
  referenceNumber,
  trackingCode,
  applicationId,
  programName,
  submissionDate,
  paymentStatus,
  userEmail,
  onDownloadReceipt,
  onTrackApplication,
  onGoToDashboard
}) => {
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    alert(`${label} copied to clipboard!`)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Success Header */}
          <div className="text-center mb-8">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Application Submitted Successfully!
            </h1>
            <p className="text-gray-600">
              Your application has been received and is being processed.
            </p>
          </div>

          {/* Application Details */}
          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Application Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Reference Number
                </label>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="font-mono text-lg text-blue-600 font-bold">
                    {referenceNumber}
                  </span>
                  <button
                    onClick={() => copyToClipboard(referenceNumber, 'Reference number')}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Tracking Code
                </label>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="font-mono text-lg text-green-600 font-bold">
                    {trackingCode}
                  </span>
                  <button
                    onClick={() => copyToClipboard(trackingCode, 'Tracking code')}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Program
                </label>
                <p className="mt-1 text-gray-900">{programName}</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Submission Date
                </label>
                <p className="mt-1 text-gray-900">
                  {new Date(submissionDate).toLocaleDateString()}
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Payment Status
                </label>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  paymentStatus === 'completed' 
                    ? 'bg-green-100 text-green-800'
                    : paymentStatus === 'pending'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {paymentStatus.charAt(0).toUpperCase() + paymentStatus.slice(1)}
                </span>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Email Confirmation
                </label>
                <div className="flex items-center space-x-2 mt-1">
                  <Mail className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-gray-600">Sent to {userEmail}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Important Information */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-blue-800 mb-2">Important Information</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Keep your reference number and tracking code safe for future reference</li>
              <li>• You will receive email updates about your application status</li>
              <li>• Processing typically takes 5-10 business days</li>
              <li>• You can track your application status using the tracking code</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              onClick={onDownloadReceipt}
              variant="outline"
              className="flex items-center justify-center"
            >
              <Download className="h-4 w-4 mr-2" />
              Download Receipt
            </Button>
            
            <Button
              onClick={onTrackApplication}
              variant="outline"
              className="flex items-center justify-center"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Track Application
            </Button>
            
            <Button
              onClick={onGoToDashboard}
              className="flex items-center justify-center"
            >
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}