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
              className="h-12 w-full rounded-lg border border-border transition-colors hover:bg-slate-100 sm:w-auto"
            >
              <Rocket className="h-5 w-5 mr-2" />
              Create Account
            </Button>
          </Link>
          <Link to="/auth/signin">
            <Button 
              size="lg" 
              className="h-12 w-full rounded-lg bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-auto"
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
