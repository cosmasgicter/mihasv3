import React from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AnimatedCard } from '@/components/ui/AnimatedCard'

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
    <motion.div
      initial={maybeMotion({ opacity: 0, y: 30 })}
      animate={maybeMotion({ opacity: 1, y: 0 })}
      transition={maybeMotion({ delay: 0.3 })}
    >
      <AnimatedCard className="mb-8 sm:mb-12 bg-gradient-to-br from-white via-blue-50 to-purple-50 card-mobile" glassEffect hover3d>
        <div className="text-center space-y-6 sm:space-y-8">
          <motion.div
            initial={maybeMotion({ scale: 0 })}
            animate={maybeMotion({ scale: 1 })}
            transition={maybeMotion({ delay: 0.5, type: "spring" })}
            className="text-6xl sm:text-8xl"
          >
            🔍
          </motion.div>
          
          <div>
            <h2 className="text-responsive-3xl font-black text-body mb-3 sm:mb-4">
              Find Your Application
            </h2>
            <p className="text-base sm:text-xl text-gray-800 max-w-2xl mx-auto leading-relaxed px-4 font-medium">
              Enter your <span className="font-bold text-info-strong">application number</span> (e.g., MIHAS123456) or 
              <span className="font-bold text-body"> tracking code</span> to check status.
            </p>
          </div>
          
          <div className="max-w-2xl mx-auto px-4">
            <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:gap-4">
              <div className="flex-1">
                <motion.div whileFocus={maybeMotion({ scale: 1.02 })} className="relative">
                  <Search className="absolute left-4 sm:left-6 top-1/2 transform -translate-y-1/2 h-5 w-5 sm:h-6 sm:w-6 text-gray-500" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => onSearchTermChange(e.target.value)}
                    onPaste={onPaste}
                    onKeyPress={onKeyPress}
                    placeholder="Enter application number..."
                    className="form-input-mobile w-full text-base sm:text-xl py-4 sm:py-6 pl-12 sm:pl-16 pr-4 sm:pr-6 border-3 border-border focus:border-primary rounded-2xl shadow-lg font-medium"
                  />
                </motion.div>
              </div>
              <Button
                onClick={onSearch}
                loading={loading}
                size="lg"
                className="btn-responsive text-base sm:text-xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 hover:shadow-2xl rounded-2xl transform hover:scale-105 transition-all duration-300 touch-target"
              >
                <Search className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3" />
                {loading ? 'Searching...' : 'Search Now'}
              </Button>
            </div>
            
            <AnimatePresence initial={!shouldReduceMotion}>
              {error && (
                <motion.div
                  initial={maybeMotion({ opacity: 0, y: 20 })}
                  animate={maybeMotion({ opacity: 1, y: 0 })}
                  exit={maybeMotion({ opacity: 0, y: -20 })}
                  className="mt-8 rounded-2xl bg-gradient-to-r from-red-50 to-pink-50 border-2 border-destructive/30 p-8 shadow-lg"
                >
                  <div className="flex items-center space-x-4">
                    <div className="text-4xl">⚠️</div>
                    <div className="text-xl text-error font-bold">{error}</div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-8 sm:mt-12">
            <motion.div
              initial={maybeMotion({ opacity: 0, y: 20 })}
              animate={maybeMotion({ opacity: 1, y: 0 })}
              transition={maybeMotion({ delay: 0.7 })}
              className="bg-blue-50 rounded-xl p-4 sm:p-6 border border-blue-200"
            >
              <div className="text-2xl sm:text-3xl mb-2 sm:mb-3">📧</div>
              <h3 className="font-bold text-gray-900 mb-2 text-sm sm:text-base">Check Your Email</h3>
              <p className="text-gray-700 text-xs sm:text-sm font-medium">Application number sent after submission</p>
            </motion.div>
            
            <motion.div
              initial={maybeMotion({ opacity: 0, y: 20 })}
              animate={maybeMotion({ opacity: 1, y: 0 })}
              transition={maybeMotion({ delay: 0.8 })}
              className="bg-yellow-50 rounded-xl p-4 sm:p-6 border border-yellow-200"
            >
              <div className="text-2xl sm:text-3xl mb-2 sm:mb-3">🔢</div>
              <h3 className="font-bold text-gray-900 mb-2 text-sm sm:text-base">Format Example</h3>
              <p className="text-gray-800 font-mono text-xs sm:text-sm font-bold">MIHAS123456</p>
            </motion.div>
            
            <motion.div
              initial={maybeMotion({ opacity: 0, y: 20 })}
              animate={maybeMotion({ opacity: 1, y: 0 })}
              transition={maybeMotion({ delay: 0.9 })}
              className="bg-gray-50 rounded-xl p-4 sm:p-6 border border-gray-200 sm:col-span-2 lg:col-span-1"
            >
              <div className="text-2xl sm:text-3xl mb-2 sm:mb-3">⚡</div>
              <h3 className="font-bold text-gray-900 mb-2 text-sm sm:text-base">Instant Results</h3>
              <p className="text-gray-700 text-xs sm:text-sm font-medium">Real-time updates without login</p>
            </motion.div>
          </div>
        </div>
      </AnimatedCard>
    </motion.div>
  )
}
