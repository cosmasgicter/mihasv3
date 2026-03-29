import React from 'react'
import { Link } from 'react-router-dom'
import { Phone, Rocket, Eye, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export const ApplicationActions: React.FC = () => {
  return (
    <div className="bg-muted/50 border-t border-border p-6">
      <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
        {/* Help Text */}
        <div className="text-center lg:text-left">
          <p className="text-base font-semibold text-foreground flex items-center justify-center lg:justify-start gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            Need Help?
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Contact our admissions office for assistance and support.
          </p>
        </div>
        
        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link to="/apply">
            <Button 
              variant="outline" 
              size="lg" 
              className="w-full sm:w-auto border-2 hover:bg-secondary hover:text-white transition-colors"
            >
              <Rocket className="h-5 w-5 mr-2" />
              New Application
            </Button>
          </Link>
          <Link to="/auth/signin">
            <Button 
              size="lg" 
              className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
            >
              <Eye className="h-5 w-5 mr-2" />
              View Full Details
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
