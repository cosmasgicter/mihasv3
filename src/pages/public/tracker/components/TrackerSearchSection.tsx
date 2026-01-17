import React from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Search, Mail, Hash, Zap, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
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
  const shouldReduceMotion = useReducedMotion()
  const maybeMotion = <T,>(value: T) => (shouldReduceMotion ? undefined : value)

  return (
    <SectionCard
      title="Find Your Application"
      description="Enter your application number (e.g., MIHAS123456) or tracking code to check status."
      icon={<Search className="h-5 w-5" />}
      headerVariant="tinted"
    >
      <div className="space-y-6">
        {/* Search Input */}
        <div className="max-w-2xl mx-auto">
          <div className="flex flex-col space-y-3 sm:flex-row sm:space-y-0 sm:gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => onSearchTermChange(e.target.value)}
                onPaste={onPaste}
                onKeyPress={onKeyPress}
                placeholder="Enter application number..."
                className="w-full pl-12 pr-4 py-3 text-base border-2 border-border focus:border-primary rounded-xl"
              />
            </div>
            <Button
              onClick={onSearch}
              loading={loading}
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl px-6 touch-target"
            >
              <Search className="h-5 w-5 mr-2" />
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </div>
          
          {/* Error Message */}
          <AnimatePresence initial={!shouldReduceMotion}>
            {error && (
              <motion.div
                initial={maybeMotion({ opacity: 0, y: 10 })}
                animate={maybeMotion({ opacity: 1, y: 0 })}
                exit={maybeMotion({ opacity: 0, y: -10 })}
                className="mt-4 rounded-xl bg-error/10 border border-error/30 p-4"
              >
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-error flex-shrink-0" />
                  <p className="text-sm font-medium text-error">{error}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Help Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex-shrink-0 p-2 rounded-lg bg-primary/10">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Check Your Email</h3>
              <p className="text-xs text-muted-foreground mt-1">Application number sent after submission</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/5 border border-warning/20">
            <div className="flex-shrink-0 p-2 rounded-lg bg-warning/10">
              <Hash className="h-5 w-5 text-warning" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Format Example</h3>
              <p className="text-xs font-mono text-muted-foreground mt-1">MIHAS123456</p>
            </div>
          </div>
          
          <div className="flex items-start gap-3 p-4 rounded-xl bg-success/5 border border-success/20">
            <div className="flex-shrink-0 p-2 rounded-lg bg-success/10">
              <Zap className="h-5 w-5 text-success" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">Instant Results</h3>
              <p className="text-xs text-muted-foreground mt-1">Real-time updates without login</p>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  )
}
