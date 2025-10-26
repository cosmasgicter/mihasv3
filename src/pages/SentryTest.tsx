import React from 'react'
import * as Sentry from '@sentry/react'

export default function SentryTest() {
  const triggerError = () => {
    throw new Error('Sentry test error - monitoring is working!')
  }

  const captureMessage = () => {
    Sentry.captureMessage('Test message from MIHAS', 'info')
    alert('Message sent to Sentry!')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-2xl font-bold mb-4">Sentry Test Page</h1>
        <p className="text-gray-600 mb-6">
          Click the buttons below to test Sentry error tracking
        </p>
        
        <div className="space-y-4">
          <button
            onClick={triggerError}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg"
          >
            Trigger Test Error
          </button>
          
          <button
            onClick={captureMessage}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg"
          >
            Send Test Message
          </button>
          
          <a
            href="/"
            className="block w-full text-center bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-4 rounded-lg"
          >
            Back to Home
          </a>
        </div>
        
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Sentry Status:</strong> {import.meta.env.VITE_SENTRY_DSN ? '✅ Configured' : '❌ Not Configured'}
          </p>
          <p className="text-sm text-blue-800 mt-2">
            <strong>Environment:</strong> {import.meta.env.VITE_NODE_ENV || 'development'}
          </p>
        </div>
      </div>
    </div>
  )
}
