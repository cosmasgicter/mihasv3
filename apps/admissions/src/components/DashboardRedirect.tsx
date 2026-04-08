import React, { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Skeleton } from '@/components/ui/skeleton'

export function DashboardRedirect() {
  const { user, loading, isAdmin } = useAuth()
  const [redirectPath, setRedirectPath] = useState<string | null>(null)

  // Determine redirect path only once when conditions are met
  useEffect(() => {
    if (loading || redirectPath) return
    
    if (!user) {
      setRedirectPath('/auth/signin')
      return
    }

    // Strict admin check - only redirect to admin if explicitly admin
    if (isAdmin) {
      setRedirectPath('/admin')
      return
    }

    // Default to student dashboard for all other users
    setRedirectPath('/student/dashboard')
  }, [loading, user, isAdmin, redirectPath])

  if (loading || !redirectPath) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-primary/5 to-secondary/5">
        <div className="bg-card rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 border border-border">
          <div className="flex flex-col items-center space-y-6">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold text-foreground">
                {loading ? 'Loading...' : 'Preparing your dashboard...'}
              </h3>
              <p className="text-sm text-caption">Please wait a moment...</p>
            </div>
            <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
              <div className="h-full w-2/3 bg-gradient-to-r from-blue-600 to-purple-600 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <Navigate to={redirectPath} replace />
}
