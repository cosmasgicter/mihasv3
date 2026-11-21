import { AlertTriangle, CheckCircle, Info } from 'lucide-react'
import type { EligibilityResult } from '@/lib/eligibilityEngine'

interface EligibilityNotificationProps {
  eligibility: EligibilityResult
  programName?: string
}

export function EligibilityNotification({ eligibility, programName }: EligibilityNotificationProps) {
  if (!eligibility) return null

  const { eligible, message, score, regulatoryBody, recommendations, canProceed } = eligibility

  return (
    <div
      data-testid="eligibility-notification"
      // Tint only, from the status-tone map: this sits inside the wizard's card
      // (task 31.3, R21.5); the icon and the heading carry the status too.
      className={`rounded-lg p-4 animate-fade-in ${eligible ? 'bg-success/10' : 'bg-warning/10'}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {eligible ? (
            <CheckCircle className="h-5 w-5 text-accent-foreground" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-accent-foreground" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          {/*
            The heading row wraps (task 22.5). Unwrapped, its minimum width was the
            heading's longest word plus both badges: wider than this column on a
            390 px phone once the font is wider than Inter, as DejaVu Sans is on the
            CI runner (Inter is not shipped, so the font is whatever the device has).
            That widened the whole step past the card's edge. Now the badges move to
            the next line.
          */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
            <h3 className={`min-w-0 break-words font-semibold ${
              eligible ? 'text-accent-foreground' : 'text-accent-foreground'
            }`}>
              {eligible ? 'Eligible' : 'Advisory'} {programName ? `for ${programName}` : ''}
            </h3>
            
            {score !== undefined && (
              <span data-text-role="caption" className="px-2 py-0.5 bg-primary/10 text-foreground text-sm sm:text-xs font-medium rounded-full">
                Score: {score}%
              </span>
            )}
            
            {regulatoryBody && (
              <span data-text-role="caption" className="px-2 py-0.5 bg-secondary/10 text-purple-800 text-sm sm:text-xs font-medium rounded-full">
                {regulatoryBody}
              </span>
            )}
          </div>
          
          {/*
            The advisory message is `text-foreground`, the status-tone map's label
            colour (task 23.1, R18.2), not `text-yellow-700`: amber on the warning
            tint measured 4.3:1 (#a16207 on #f8eee6), under AA's 4.5:1. axe reports it
            whenever the panel has rendered before the scan (task 22.5).
          */}
          <p className={`text-base sm:text-sm mb-2 ${
            eligible ? 'text-accent-foreground' : 'text-foreground'
          }`}>
            {message}
          </p>
          
          {eligibility.competitivenessLevel && (
            <div data-text-role="caption" className={`inline-block px-2 py-1 rounded text-sm sm:text-xs font-medium mb-3 ${
              eligibility.competitivenessLevel === 'Highly Competitive' ? 'bg-accent/10 text-accent-foreground' :
              eligibility.competitivenessLevel === 'Competitive' ? 'bg-primary/10 text-foreground' :
              eligibility.competitivenessLevel === 'Minimum' ? 'bg-accent/10 text-accent-foreground' :
              'bg-accent text-foreground'
            }`}>
              {eligibility.competitivenessLevel}
            </div>
          )}

          {!eligible && canProceed && (
            <div className="mb-3 p-3 bg-primary/5 rounded-md">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <div data-text-role="caption" className="text-sm sm:text-xs text-primary-foreground">
                  <p className="font-medium mb-1">✓ You can still proceed with your application</p>
                  <p>
                    The admissions committee reviews all applications. Consider alternative entry routes or improving grades for better competitiveness.
                  </p>
                </div>
              </div>
            </div>
          )}

          {recommendations && recommendations.length > 0 && (
            <div className="space-y-1 mb-2">
              <p className="text-base sm:text-sm font-medium text-foreground">Recommendations:</p>
              <ul className="space-y-1">
                {recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start gap-2 text-base sm:text-sm text-foreground">
                    <span className="text-foreground mt-0.5">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {eligibility.alternativePathways && eligibility.alternativePathways.length > 0 && (
            <div className="mt-2 p-2 bg-secondary/5 rounded">
              <p className="text-base sm:text-sm font-medium text-purple-800 mb-1">Alternative Entry Routes:</p>
              <ul className="space-y-1">
                {eligibility.alternativePathways.map((pathway, index) => (
                  <li key={index} className="text-base sm:text-sm text-purple-700">
                    • {pathway}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
