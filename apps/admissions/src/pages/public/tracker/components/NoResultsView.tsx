import React from 'react'
import { Link } from 'react-router-dom'
import { Search, UserPlus, FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SectionCard } from '@/components/ui/SectionCard'
import { animateClasses } from '@/lib/animations'

interface NoResultsViewProps {
  onTryAgain: () => void
}

export const NoResultsView: React.FC<NoResultsViewProps> = ({ onTryAgain }) => {
  return (
    <SectionCard className="text-center">
      <div className={`py-8 space-y-6 ${animateClasses.slideUp}`}>
        {/* Icon */}
        <div className="flex justify-center">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <FileQuestion className="h-12 w-12 text-muted-foreground" />
          </div>
        </div>
        
        {/* Message */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">
            No Application Found
          </h2>
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
          <Link to="/auth/signup">
            <Button 
              size="lg" 
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
            >
              <UserPlus className="h-5 w-5 mr-2" />
              Create Account to Apply
            </Button>
          </Link>
        </div>
      </div>
    </SectionCard>
  )
}
