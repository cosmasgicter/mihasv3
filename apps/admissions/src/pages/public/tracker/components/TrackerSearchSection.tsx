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
      title="Find Your Application"
      description="Enter your application number (e.g., MIHAS123456) or tracking code to check status."
      icon={<Search className="h-5 w-5" />}
      headerVariant="default"
    >
      <div className="space-y-6">
        <div className="mx-auto max-w-2xl">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <label htmlFor="tracker-search" className="sr-only">
                Application number or tracking code
              </label>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" aria-hidden="true" />
              <Input
                id="tracker-search"
                value={searchTerm}
                onChange={(e) => onSearchTermChange(e.target.value)}
                onPaste={onPaste}
                onKeyPress={onKeyPress}
                placeholder="Enter application number..."
                autoComplete="off"
                inputMode="text"
                aria-describedby={error ? 'tracker-search-error' : undefined}
                aria-invalid={Boolean(error)}
                disabled={loading}
                className="h-14 w-full rounded-lg border border-border bg-card pl-12 pr-4 text-base shadow-sm focus:border-primary"
              />
            </div>
            <Button
              onClick={onSearch}
              loading={loading}
              size="lg"
              disabled={loading || searchTerm.trim().length === 0}
              className="h-14 w-full rounded-lg bg-primary px-8 font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 sm:w-auto"
            >
              <Search className="h-5 w-5 mr-2" aria-hidden="true" />
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </div>
          
          {error && (
            <div
              id="tracker-search-error"
              role="alert"
              className={`mt-4 rounded-lg bg-error/10 border border-error/30 p-4 transition-all duration-300 ease-out ${
                errorVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              }`}
            >
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-error flex-shrink-0" />
                <p className="text-sm font-medium text-error">{error}</p>
              </div>
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted p-4">
            <div className="flex-shrink-0 rounded-lg bg-card p-2.5 text-primary">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Check Your Email</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">Application number sent after submission</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted p-4">
            <div className="flex-shrink-0 rounded-lg bg-card p-2.5 text-primary">
              <Hash className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Format Example</h3>
              <p className="mt-0.5 text-sm font-mono text-muted-foreground">MIHAS123456</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted p-4">
            <div className="flex-shrink-0 rounded-lg bg-card p-2.5 text-primary">
              <Zap className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Instant Results</h3>
              <p className="mt-0.5 text-sm text-muted-foreground">Real-time updates without login</p>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}
