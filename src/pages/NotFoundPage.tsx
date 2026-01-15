import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Home, ArrowLeft, Search, FileText, User, Settings } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface SuggestedPage {
  path: string
  label: string
  icon: React.ReactNode
  description: string
}

export default function NotFoundPage() {
  const location = useLocation()
  const { user, isAdmin } = useAuth()
  const [suggestedPages, setSuggestedPages] = useState<SuggestedPage[]>([])

  useEffect(() => {
    // Generate suggested pages based on the attempted URL and user role
    const suggestions: SuggestedPage[] = []
    const attemptedPath = location.pathname.toLowerCase()

    // Common suggestions for all users
    suggestions.push({
      path: '/',
      label: 'Home',
      icon: <Home className="h-4 w-4" />,
      description: 'Return to the homepage'
    })

    // Suggest track application for public users or if path contains 'track' or 'application'
    if (!user || attemptedPath.includes('track') || attemptedPath.includes('application')) {
      suggestions.push({
        path: '/track-application',
        label: 'Track Application',
        icon: <Search className="h-4 w-4" />,
        description: 'Check your application status'
      })
    }

    // Suggestions for authenticated users
    if (user) {
      if (isAdmin) {
        // Admin-specific suggestions
        suggestions.push({
          path: '/admin/dashboard',
          label: 'Admin Dashboard',
          icon: <FileText className="h-4 w-4" />,
          description: 'View admin dashboard'
        })

        if (attemptedPath.includes('application') || attemptedPath.includes('student')) {
          suggestions.push({
            path: '/admin/applications',
            label: 'Applications',
            icon: <FileText className="h-4 w-4" />,
            description: 'Manage student applications'
          })
        }

        if (attemptedPath.includes('user') || attemptedPath.includes('role')) {
          suggestions.push({
            path: '/admin/users',
            label: 'User Management',
            icon: <User className="h-4 w-4" />,
            description: 'Manage system users'
          })
        }

        if (attemptedPath.includes('setting') || attemptedPath.includes('config')) {
          suggestions.push({
            path: '/admin/settings',
            label: 'Settings',
            icon: <Settings className="h-4 w-4" />,
            description: 'Configure system settings'
          })
        }

        if (attemptedPath.includes('analytic') || attemptedPath.includes('report')) {
          suggestions.push({
            path: '/admin/analytics',
            label: 'Analytics',
            icon: <FileText className="h-4 w-4" />,
            description: 'View system analytics'
          })
        }
      } else {
        // Student-specific suggestions
        suggestions.push({
          path: '/student/dashboard',
          label: 'My Dashboard',
          icon: <FileText className="h-4 w-4" />,
          description: 'View your dashboard'
        })

        if (attemptedPath.includes('apply') || attemptedPath.includes('application')) {
          suggestions.push({
            path: '/apply',
            label: 'Apply Now',
            icon: <FileText className="h-4 w-4" />,
            description: 'Start or continue your application'
          })
        }

        if (attemptedPath.includes('status')) {
          suggestions.push({
            path: '/student/status',
            label: 'Application Status',
            icon: <Search className="h-4 w-4" />,
            description: 'Check your application status'
          })
        }

        if (attemptedPath.includes('setting') || attemptedPath.includes('profile')) {
          suggestions.push({
            path: '/student/settings',
            label: 'Profile Settings',
            icon: <Settings className="h-4 w-4" />,
            description: 'Update your profile'
          })
        }
      }
    } else {
      // Suggestions for non-authenticated users
      if (attemptedPath.includes('signin') || attemptedPath.includes('login') || attemptedPath.includes('auth')) {
        suggestions.push({
          path: '/auth/signin',
          label: 'Sign In',
          icon: <User className="h-4 w-4" />,
          description: 'Sign in to your account'
        })
      }

      if (attemptedPath.includes('signup') || attemptedPath.includes('register')) {
        suggestions.push({
          path: '/auth/signup',
          label: 'Sign Up',
          icon: <User className="h-4 w-4" />,
          description: 'Create a new account'
        })
      }

      if (attemptedPath.includes('apply')) {
        suggestions.push({
          path: '/auth/signup',
          label: 'Apply Now',
          icon: <FileText className="h-4 w-4" />,
          description: 'Sign up to start your application'
        })
      }
    }

    // Remove duplicates and limit to 4 suggestions
    const uniqueSuggestions = suggestions.filter(
      (suggestion, index, self) =>
        index === self.findIndex((s) => s.path === suggestion.path)
    ).slice(0, 4)

    setSuggestedPages(uniqueSuggestions)
  }, [location.pathname, user, isAdmin])

  return (
    <div className="page-container bg-muted flex flex-col justify-center py-6 sm:py-12">
      <div className="content-wrapper">
        <div className="mx-auto w-full max-w-2xl">
          <div className="bg-card py-8 px-4 shadow sm:rounded-lg sm:px-10">
            <div className="text-center mb-8">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-destructive/10 mb-4">
                <span className="text-3xl font-bold text-destructive">404</span>
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Page Not Found</h1>
              <p className="text-sm text-muted-foreground mb-2">
                The page you're looking for doesn't exist or has been moved.
              </p>
              <p className="text-xs text-muted-foreground">
                Attempted path: <code className="bg-muted px-2 py-1 rounded">{location.pathname}</code>
              </p>
            </div>

            {/* Quick Actions */}
            <div className="space-y-3 mb-8">
              <Link to="/" className="block">
                <Button className="w-full">
                  <Home className="h-4 w-4 mr-2" />
                  Go to Home
                </Button>
              </Link>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => window.history.back()}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
            </div>

            {/* Suggested Pages */}
            {suggestedPages.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-foreground mb-3">
                  You might be looking for:
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {suggestedPages.map((page) => (
                    <Link
                      key={page.path}
                      to={page.path}
                      className="block p-4 border border-border rounded-lg hover:border-primary hover:bg-accent transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5 text-primary">
                          {page.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-foreground mb-1">
                            {page.label}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {page.description}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Help Text */}
            <div className="mt-8 pt-6 border-t border-border text-center">
              <p className="text-xs text-muted-foreground">
                If you believe this is an error, please contact support or try refreshing the page.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}