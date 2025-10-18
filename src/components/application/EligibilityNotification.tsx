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
            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className={`font-semibold ${
              eligible ? 'text-green-800 dark:text-green-200' : 'text-yellow-800 dark:text-yellow-200'
            }`}>
              {eligible ? '✓ Eligible' : '⚠ Advisory'} {programName ? `for ${programName}` : ''}
            </h4>
            
            {score !== undefined && (
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 dark:text-blue-800 text-xs font-medium rounded-full">
                Score: {score}%
              </span>
            )}
            
            {regulatoryBody && (
              <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-800 text-xs font-medium rounded-full">
                {regulatoryBody}
              </span>
            )}
          </div>
          
          <p className={`text-sm mb-2 ${
            eligible ? 'text-green-700 dark:text-green-300' : 'text-yellow-700'
          }`}>
            {message}
          </p>
          
          {eligibility.competitivenessLevel && (
            <div className={`inline-block px-2 py-1 rounded text-xs font-medium mb-3 ${
              eligibility.competitivenessLevel === 'Highly Competitive' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' :
              eligibility.competitivenessLevel === 'Competitive' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 dark:text-blue-800' :
              eligibility.competitivenessLevel === 'Minimum' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200' :
              'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 dark:text-gray-700'
            }`}>
              {eligibility.competitivenessLevel}
            </div>
          )}

          {!eligible && canProceed && (
            <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-blue-800 dark:text-blue-200 dark:text-blue-800">
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
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 dark:text-gray-600">Recommendations:</p>
              <ul className="space-y-1">
                {recommendations.map((rec, index) => (
                  <li key={index} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 dark:text-gray-500">
                    <span className="text-gray-400 dark:text-gray-500 mt-0.5">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {eligibility.alternativePathways && eligibility.alternativePathways.length > 0 && (
            <div className="mt-2 p-2 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded">
              <p className="text-xs font-medium text-purple-800 mb-1">Alternative Entry Routes:</p>
              <ul className="space-y-1">
                {eligibility.alternativePathways.map((pathway, index) => (
                  <li key={index} className="text-xs text-purple-700 dark:text-purple-300">
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
