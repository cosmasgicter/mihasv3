import React from 'react'
import { Link } from 'react-router-dom'
import { Rocket, Eye, HelpCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export const ApplicationActions: React.FC = () => {
  return (
    <div className="border-t border-border bg-muted/30 p-6 sm:p-8">
      <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
        <div className="text-center lg:text-left">
          <p className="text-base font-semibold text-foreground flex items-center justify-center lg:justify-start gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            Need Help?
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Contact our admissions office for assistance and support.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <Link to="/auth/signup">
            <Button 
              variant="outline" 
              size="lg" 
              className="w-full sm:w-auto h-12 rounded-2xl border-2 border-border hover:bg-secondary hover:text-white hover:border-secondary transition-all"
            >
              <Rocket className="h-5 w-5 mr-2" />
              Create Account
            </Button>
          </Link>
          <Link to="/auth/signin">
            <Button 
              size="lg" 
              className="w-full sm:w-auto h-12 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md hover:shadow-lg transition-all"
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
