import React from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Search, Rocket, FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SectionCard } from '@/components/ui/SectionCard'

interface NoResultsViewProps {
  onTryAgain: () => void
}

export const NoResultsView: React.FC<NoResultsViewProps> = ({ onTryAgain }) => {
  const shouldReduceMotion = useReducedMotion()
  const maybeMotion = <T,>(value: T) => (shouldReduceMotion ? undefined : value)

  return (
    <SectionCard className="text-center">
      <motion.div
        initial={maybeMotion({ opacity: 0, y: 20 })}
        animate={maybeMotion({ opacity: 1, y: 0 })}
        className="py-8 space-y-6"
      >
        {/* Icon */}
        <div className="flex justify-center">
          <div className="p-4 rounded-full bg-muted">
            <FileQuestion className="h-12 w-12 text-muted-foreground" />
          </div>
        </div>
        
        {/* Message */}
        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-gray-900">
            No Application Found
          </h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            We couldn't find an application with that number or tracking code. 
            Please double-check your information and try again.
          </p>
        </div>
        
        {/* Actions */}
        <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
          <Button 
            variant="outline" 
            size="lg"
            className="border-2"
            onClick={onTryAgain}
          >
            <Search className="h-5 w-5 mr-2" />
            Try Again
          </Button>
          <Link to="/apply">
            <Button 
              size="lg" 
              className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
            >
              <Rocket className="h-5 w-5 mr-2" />
              Submit New Application
            </Button>
          </Link>
        </div>
      </motion.div>
    </SectionCard>
  )
}
