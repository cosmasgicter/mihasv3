import { AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { motion } from 'framer-motion'
import type { EligibilityResult } from '@/lib/eligibility'

interface EligibilityNotificationProps {
  eligibility: EligibilityResult
  programName?: string
}

export function EligibilityNotification({ eligibility, programName }: EligibilityNotificationProps) {
  if (!eligibility) return null

  const { eligible, message, score, regulatoryBody, recommendations, canProceed } = eligibility

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-lg border p-4 ${
        eligible
          ? 'bg-green-50 border-green-200'
          : 'bg-yellow-50 border-yellow-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {eligible ? (
            <CheckCircle className="h-5 w-5 text-accent" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-accent" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className={`font-semibold ${
              eligible ? 'text-accent-foreground' : 'text-accent-foreground'
            }`}>
              {eligible ? '✓ Eligible' : '⚠ Advisory'} {programName ? `for ${programName}` : ''}
            </h4>
            
            {score !== undefined && (
              <span className="px-2 py-0.5 bg-primary/10 text-primary-foreground text-xs font-medium rounded-full">
                Score: {score}%
              </span>
            )}
            
            {regulatoryBody && (
              <span className="px-2 py-0.5 bg-secondary/10 text-purple-800 text-xs font-medium rounded-full">
                {regulatoryBody}
              </span>
            )}
          </div>
          
          <p className={`text-sm mb-2 ${
            eligible ? 'text-accent' : 'text-yellow-700'
          }`}>
            {message}
          </p>
          
          {eligibility.competitivenessLevel && (
            <div className={`inline-block px-2 py-1 rounded text-xs font-medium mb-3 ${
              eligibility.competitivenessLevel === 'Highly Competitive' ? 'bg-accent/10 text-accent-foreground' :
              eligibility.competitivenessLevel === 'Competitive' ? 'bg-primary/10 text-primary-foreground' :
              eligibility.competitivenessLevel === 'Minimum' ? 'bg-accent/10 text-accent-foreground' :
              'bg-accent text-foreground'
            }`}>
              {eligibility.competitivenessLevel}
            </div>
          )}

          {!eligible && canProceed && (
            <div className="mb-3 p-3 bg-primary/5/30 border border-primary/30 rounded-md">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-xs text-primary-foreground">
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
              <p className="text-xs font-medium text-foreground">Recommendations:</p>
              <ul className="space-y-1">
                {recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start gap-2 text-xs text-foreground">
                    <span className="text-foreground mt-0.5">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {eligibility.alternativePathways && eligibility.alternativePathways.length > 0 && (
            <div className="mt-2 p-2 bg-secondary/5/30 border border-input/30 rounded">
              <p className="text-xs font-medium text-purple-800 mb-1">Alternative Entry Routes:</p>
              <ul className="space-y-1">
                {eligibility.alternativePathways.map((pathway, index) => (
                  <li key={index} className="text-xs text-purple-700">
                    • {pathway}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
