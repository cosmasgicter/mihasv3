import React from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Search, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { AnimatedCard } from '@/components/ui/AnimatedCard'

interface NoResultsViewProps {
  onTryAgain: () => void
}

export const NoResultsView: React.FC<NoResultsViewProps> = ({ onTryAgain }) => {
  const shouldReduceMotion = useReducedMotion()
  const maybeMotion = <T,>(value: T) => (shouldReduceMotion ? undefined : value)

  return (
    <AnimatedCard className="text-center py-20" glassEffect>
      <motion.div
        initial={maybeMotion({ opacity: 0, y: 20 })}
        animate={maybeMotion({ opacity: 1, y: 0 })}
        className="space-y-8"
      >
        <motion.div
          animate={maybeMotion({ rotate: [0, -10, 10, 0] })}
          transition={maybeMotion({ duration: 2, repeat: Infinity })}
          className="text-8xl"
        >
          🔍
        </motion.div>
        
        <div>
          <h3 className="text-4xl font-black text-gray-900 mb-6">
            No Application Found
          </h3>
          <p className="text-xl text-gray-800 max-w-2xl mx-auto leading-relaxed mb-8 font-medium">
            We couldn't find an application with that number or tracking code. 
            Please double-check your information and try again.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-6">
          <Button 
            variant="outline" 
            size="xl"
            className="text-xl px-10 py-5 border-2"
            onClick={onTryAgain}
          >
            <Search className="h-6 w-6 mr-3" />
            Try Again
          </Button>
          <Link to="/apply">
            <Button 
              size="xl" 
              className="text-xl px-10 py-5 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600"
            >
              <Rocket className="h-6 w-6 mr-3" />
              Submit New Application
            </Button>
          </Link>
        </div>
      </motion.div>
    </AnimatedCard>
  )
}
