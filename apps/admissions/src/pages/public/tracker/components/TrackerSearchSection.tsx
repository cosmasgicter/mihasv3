import React, { useState, useEffect } from 'react'
import { Search, Mail, Hash, Zap, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { SectionCard } from '@/components/ui/SectionCard'

interface TrackerSearchSectionProps {
  searchTerm: string
  loading: boolean
  error: string
  onSearchTermChange: (value: string) => void
  onSearch: () => void
  onKeyPress: (e: React.KeyboardEvent) => void
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void
}

export const TrackerSearchSection: React.FC<TrackerSearchSectionProps> = ({
  searchTerm,
  loading,
  error,
  onSearchTermChange,
  onSearch,
  onKeyPress,
  onPaste
}) => {
  const [errorVisible, setErrorVisible] = useState(false)

  useEffect(() => {
    if (error) {
      const id = requestAnimationFrame(() => setErrorVisible(true))
      return () => cancelAnimationFrame(id)
    } else {
      setErrorVisible(false)
    }
  }, [error])

  return (
    <SectionCard
      title="Find your application"
      description="Paste the tracking link issued for your application to check its status."
      icon={<Search className="h-5 w-5" />}
      headerVariant="default"
    >
      <div className="space-y-6">
        <div className="mx-auto max-w-2xl">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <label htmlFor="tracker-search" className="sr-only">
                Tracking link or code
              </label>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input
                id="tracker-search"
                value={searchTerm}
                onChange={(e) => onSearchTermChange(e.target.value)}
                onPaste={onPaste}
                onKeyPress={onKeyPress}
                placeholder="TRK-XXXXXXXX-XXXXXXXXXXXXXXXXXXXX"
                autoComplete="off"
                inputMode="text"
                aria-describedby={error ? 'tracker-search-error' : 'tracker-search-hint'}
                aria-invalid={Boolean(error)}
                disabled={loading}
                className="h-14 w-full rounded-lg border border-border bg-card pl-12 pr-4 text-lg shadow-sm focus:border-primary"
              />
            </div>
            <Button
              onClick={onSearch}
              loading={loading}
              size="lg"
              disabled={loading || searchTerm.trim().length === 0}
              className="h-14 min-h-touch w-full rounded-lg bg-primary px-8 font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 sm:w-auto"
            >
              <Search className="h-5 w-5 mr-2" aria-hidden="true" />
              {loading ? 'Searching…' : 'Search'}
            </Button>
          </div>
          {/*
            admissions-v2 task 10.5 (R13.12, STU-22): this hint used to name the
            application number as the thing to enter. It is not a credential any
            more — a tracking link is — so the hint names the link, and the cards
            below say where to get one instead of where to find the number.
          */}
          <p id="tracker-search-hint" className="mt-2 max-w-prose text-sm text-muted-foreground">
            Your tracking link looks like <span className="font-mono">TRK-XXXXXXXX-XXXXXXXXXXXXXXXXXXXX</span>. An application number will not open tracking.
          </p>
          
          {error && (
            <div
              id="tracker-search-error"
              role="alert"
              className={`mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 transition-all duration-200 ease-out ${
                errorVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              }`}
            >
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" aria-hidden="true" />
                <p className="text-sm font-medium text-destructive">{error}</p>
              </div>
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted p-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-card">
              <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Get your link</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">Sign in and choose &ldquo;Get tracking link&rdquo; on your application</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted p-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-card">
              <Hash className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Format example</h3>
              <p className="mt-0.5 break-all text-sm font-mono text-muted-foreground">TRK-4KP2M9XT-9QW3RT7VZ2KDN8YH6JF4</p>
            </div>
          </div>
          {/*
            No "Instant Results" (admissions-v2 task 11.5, R16.4/R16.5). A tracking
            link resolves the application's **stored** state when the page is
            opened; there is no live transport behind it, so "instant" was a
            promotional claim about latency rather than a statement of what the
            student gets. What they get is the current recorded status without
            signing in, which is worth saying plainly.
          */}
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted p-4">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-card">
              <Zap className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">What you see</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">The current recorded status, without signing in</p>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}
