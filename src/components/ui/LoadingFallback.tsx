import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { LoadingSpinner } from './LoadingSpinner'

interface LoadingFallbackProps {
  message?: string
  showProgress?: boolean
  timeout?: number
}

export function LoadingFallback({ 
  message = "Loading...", 
  showProgress = false,
  timeout = 15000 
}: LoadingFallbackProps) {
  const [progress, setProgress] = useState(0)
  const [timeoutReached, setTimeoutReached] = useState(false)

  useEffect(() => {
    if (!showProgress && !timeout) return

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev
        return prev + Math.random() * 10
      })
    }, 200)

    const timeoutTimer = setTimeout(() => {
      setTimeoutReached(true)
    }, timeout)

    return () => {
      clearInterval(interval)
      clearTimeout(timeoutTimer)
    }
  }, [showProgress, timeout])

  if (timeoutReached) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <motion.div 
          className="text-center p-8 bg-white dark:bg-gray-800 dark:bg-gray-200 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 max-w-md"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Taking longer than expected</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">Please check your internet connection and try refreshing the page.</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-blue-600/90 transition-colors"
          >
            Refresh Page
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <motion.div 
        className="text-center p-8 bg-white dark:bg-gray-800 dark:bg-gray-200 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <LoadingSpinner 
          size="xl" 
          message={message}
          showPulse={true}
        />
        
        {showProgress && (
          <motion.div 
            className="mt-6 w-64"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>Loading</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <motion.div 
                className="bg-gradient-to-r from-blue-600 to-purple-600 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </motion.div>
        )}

        <motion.div
          className="mt-4 text-xs text-gray-500 dark:text-gray-500"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          Preparing your experience...
        </motion.div>
      </motion.div>
    </div>
  )
}