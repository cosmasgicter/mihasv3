import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Home, ArrowLeft, Search, FileText, User, Settings } from 'lucide-react'
import { Seo } from '@/components/seo/Seo'
import {
  CANONICAL_ADMIN_DASHBOARD_PATH,
  CANONICAL_SIGN_IN_PATH,
  CANONICAL_STUDENT_DASHBOARD_PATH,
  pathFor,
} from '@/routes/routeRegistry'

interface SuggestedPage {
  path: string
  label: string
  icon: React.ReactNode
  description: string
}

export default function NotFoundPage() {
  const location = useLocation()
  const [suggestedPages, setSuggestedPages] = useState<SuggestedPage[]>([])

  useEffect(() => {
    // Generate suggested pages based on the attempted URL and user role
    const suggestions: SuggestedPage[] = []
    const attemptedPath = location.pathname.toLowerCase()
    const looksLikeAdminPath = attemptedPath.startsWith('/admin')
    const looksLikeStudentPath = attemptedPath.startsWith('/student')

    // Common suggestions for all users
    suggestions.push({
      path: pathFor('public.home'),
      label: 'Home',
      icon: <Home className="h-4 w-4" />,
      description: 'Return to the homepage'
    })

    if (attemptedPath.includes('track') || attemptedPath.includes('application') || attemptedPath === '/404') {
      suggestions.push({
        path: pathFor('public.trackApplication'),
        label: 'Track Application',
        icon: <Search className="h-4 w-4" />,
        description: 'Check your application status'
      })
    }

    if (looksLikeAdminPath) {
      suggestions.push({
        path: CANONICAL_ADMIN_DASHBOARD_PATH,
        label: 'Admin Dashboard',
        icon: <FileText className="h-4 w-4" />,
        description: 'Return to the admin dashboard'
      })
    }

    if (looksLikeStudentPath) {
      suggestions.push({
        path: CANONICAL_STUDENT_DASHBOARD_PATH,
        label: 'My Dashboard',
        icon: <FileText className="h-4 w-4" />,
        description: 'Return to your student dashboard'
      })
    }

    if (attemptedPath.includes('signin') || attemptedPath.includes('login') || attemptedPath.includes('auth')) {
      suggestions.push({
        path: CANONICAL_SIGN_IN_PATH,
        label: 'Sign In',
        icon: <User className="h-4 w-4" />,
        description: 'Sign in to your account'
      })
    }

    if (attemptedPath.includes('signup') || attemptedPath.includes('register')) {
      suggestions.push({
        path: pathFor('auth.signUp'),
        label: 'Sign Up',
        icon: <User className="h-4 w-4" />,
        description: 'Create a new account'
      })
    }

    if (attemptedPath.includes('apply')) {
      suggestions.push({
        path: pathFor('auth.signUp'),
        label: 'Apply Now',
        icon: <FileText className="h-4 w-4" />,
        description: 'Start your application'
      })
    }

    if (attemptedPath.includes('setting') || attemptedPath.includes('profile')) {
      suggestions.push({
        path: looksLikeAdminPath ? pathFor('admin.settings') : looksLikeStudentPath ? pathFor('student.settings') : pathFor('public.contact'),
        label: looksLikeAdminPath || looksLikeStudentPath ? 'Settings' : 'Contact',
        icon: <Settings className="h-4 w-4" />,
        description: looksLikeAdminPath || looksLikeStudentPath ? 'Open the settings page' : 'Contact the admissions team for help'
      })
    }

    // Remove duplicates and limit to 4 suggestions
    const uniqueSuggestions = suggestions.filter(
      (suggestion, index, self) =>
        index === self.findIndex((s) => s.path === suggestion.path)
    ).slice(0, 4)

    setSuggestedPages(uniqueSuggestions)
  }, [location.pathname])

  return (
    <PublicLayout>
      <Seo
        title="Page Not Found | Beanola Admissions"
        description="The page you're looking for doesn't exist or has been moved."
        path="/404"
        noindex
      />
      <div className="flex min-h-[60vh] flex-col justify-center bg-muted px-4 py-10 sm:px-6 sm:py-14">
        <div className="mx-auto w-full max-w-2xl">
            <div className="rounded-lg border border-border bg-card px-5 py-8 shadow-sm sm:px-8">
              <div className="mb-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/10">
                  <span className="text-3xl font-semibold text-destructive">404</span>
                </div>
                <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">Page Not Found</h1>
                <p className="mb-2 text-sm text-muted-foreground">
                  The page you're looking for doesn't exist or has been moved.
                </p>
                <p className="text-xs text-muted-foreground">
                  Attempted path: <code className="rounded bg-muted px-2 py-1">{location.pathname}</code>
                </p>
              </div>

              <div className="mb-8 space-y-3">
                <Link to="/" className="block">
                  <Button className="w-full">
                    <Home className="h-4 w-4 mr-2" aria-hidden="true" />
                    Go to Home
                  </Button>
                </Link>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => window.history.back()}
                >
                  <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                  Go Back
                </Button>
              </div>

              {/* Suggested Pages */}
              {suggestedPages.length > 0 && (
                <div>
                  <h2 className="mb-3 text-sm font-semibold text-foreground">
                    You might be looking for:
                  </h2>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {suggestedPages.map((page) => (
                      <Link
                        key={page.path}
                        to={page.path}
                        className="block rounded-lg border border-border p-4 transition-colors hover:border-primary/40 hover:bg-muted"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex-shrink-0 text-primary">
                            {page.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="mb-1 text-sm font-medium text-foreground">
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
              <div className="mt-8 border-t border-border pt-6 text-center">
                <p className="text-xs text-muted-foreground">
                  If you believe this is an error, please contact support or try refreshing the page.
                </p>
              </div>
            </div>
        </div>
      </div>
    </PublicLayout>
  )
}
