import React from 'react'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { Phone, Rocket, Eye } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export const ApplicationActions: React.FC = () => {
  const shouldReduceMotion = useReducedMotion()
  const maybeMotion = <T,>(value: T) => (shouldReduceMotion ? undefined : value)

  return (
    <div className="bg-gradient-to-r from-blue-50 via-purple-50 to-indigo-50 border-t-2 border-blue-200">
      <div className="p-10">
        <div className="flex flex-col lg:flex-row justify-between items-center space-y-6 lg:space-y-0">
          <motion.div
            initial={maybeMotion({ opacity: 0, x: -20 })}
            animate={maybeMotion({ opacity: 1, x: 0 })}
            transition={maybeMotion({ delay: 0.9 })}
            className="text-center lg:text-left"
          >
            <p className="text-2xl text-gray-900 font-bold mb-2 flex items-center justify-center lg:justify-start space-x-2">
              <Phone className="h-6 w-6" />
              <span>Need Help?</span>
            </p>
            <p className="text-lg text-gray-800 font-medium">
              Contact our admissions office for assistance and support.
            </p>
          </motion.div>
          
          <motion.div
            initial={maybeMotion({ opacity: 0, x: 20 })}
            animate={maybeMotion({ opacity: 1, x: 0 })}
            transition={maybeMotion({ delay: 1 })}
            className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4"
          >
            <Link to="/apply">
              <Button 
                variant="outline" 
                size="xl" 
                className="text-xl px-8 py-4 border-2 border-input hover:bg-secondary hover:text-white transition-all duration-300"
              >
                <Rocket className="h-6 w-6 mr-3" />
                Submit New Application
              </Button>
            </Link>
            <Link to="/auth/signin">
              <Button 
                size="xl" 
                className="text-xl px-8 py-4 bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
              >
                <Eye className="h-6 w-6 mr-3" />
                View Full Details
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
