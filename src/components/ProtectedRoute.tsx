import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface ProtectedRouteProps {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center p-8 bg-white dark:bg-gray-800 dark:bg-gray-200 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 max-w-md mx-4">
          <LoadingSpinner size="lg" message="Loading..." />
          <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">Please wait</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth/signin" replace />
  }

  return <>{children}</>
}