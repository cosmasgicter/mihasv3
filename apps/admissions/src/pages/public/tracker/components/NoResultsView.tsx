import React from 'react'
import { Link } from 'react-router-dom'
import { Search, UserPlus, FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SectionCard } from '@/components/ui/SectionCard'

interface NoResultsViewProps {
  onTryAgain: () => void
}

export const NoResultsView: React.FC<NoResultsViewProps> = ({ onTryAgain }) => {
  return (
    <SectionCard className="text-center">
      <div className="py-8 space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="rounded-lg border border-border bg-muted p-4">
            <FileQuestion className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
          </div>
        </div>
        
        {/* Message */}
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-foreground">
            No application found
          </h2>
          {/*
            admissions-v2 task 10.5 (R13.12, STU-22): a tracking link can also stop
            working because it was replaced by a newer one, so the recovery advice
            names that rather than assuming the visitor mistyped.
          */}
          <p className="text-base leading-7 text-muted-foreground max-w-md mx-auto">
            That tracking link did not open an application. It may have been replaced by a newer link.
          </p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Sign in and choose &ldquo;Get tracking link&rdquo; on your application to get the current one.
          </p>
        </div>
        
        {/* Actions */}
        <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
          <Button 
            variant="outline" 
            size="lg"
            className="min-h-touch"
            onClick={onTryAgain}
          >
            <Search className="h-5 w-5 mr-2" aria-hidden="true" />
            Try Again
          </Button>
          <Button asChild size="lg" className="min-h-touch">
            <Link to="/auth/signup">
              <UserPlus className="h-5 w-5 mr-2" aria-hidden="true" />
              Create Account to Apply
            </Link>
          </Button>
        </div>
      </div>
    </SectionCard>
  )
}
