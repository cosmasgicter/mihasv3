import React, { useState } from 'react'
import { CheckCircle, ChevronDown, ChevronUp, User } from 'lucide-react'

interface ProfileAutoPopulationIndicatorProps {
  isPopulated: boolean
  fieldName: string
}

export function ProfileAutoPopulationIndicator({ isPopulated, fieldName }: ProfileAutoPopulationIndicatorProps) {
  if (!isPopulated) return null

  return (
    <div
      className="inline-flex items-center space-x-1 text-xs text-success-foreground bg-success/10 px-2 py-1 rounded-full border border-success/30 animate-scale-in"
    >
      <CheckCircle className="h-3 w-3" />
      <span>Auto-filled from profile</span>
    </div>
  )
}

interface ProfileCompletionBadgeProps {
  completionPercentage: number
  missingFields?: { key: string; label: string }[]
}

export function ProfileCompletionBadge({ completionPercentage, missingFields = [] }: ProfileCompletionBadgeProps) {
  const [expanded, setExpanded] = useState(false)

  const getColor = () => {
    if (completionPercentage >= 100) return 'bg-success/10 text-success-foreground border-success/30'
    if (completionPercentage >= 80) return 'bg-success/10 text-success-foreground border-success/30'
    if (completionPercentage >= 60) return 'bg-warning/10 text-warning-foreground border-warning/30'
    return 'bg-destructive/10 text-destructive-foreground border-destructive/30'
  }

  const hasMissing = completionPercentage < 100 && missingFields.length > 0

  return (
    <div className="relative">
      <button
        type="button"
        onClick={hasMissing ? () => setExpanded(!expanded) : undefined}
        className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full border text-sm font-medium animate-fade-in ${getColor()} ${hasMissing ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
        aria-expanded={hasMissing ? expanded : undefined}
        aria-label={`Profile ${completionPercentage}% complete${hasMissing ? `. ${missingFields.length} field${missingFields.length === 1 ? '' : 's'} missing. Click to see details.` : ''}`}
      >
        <User className="h-4 w-4" />
        <span>Profile {completionPercentage}% Complete</span>
        {hasMissing && (
          expanded
            ? <ChevronUp className="h-3 w-3 ml-1" />
            : <ChevronDown className="h-3 w-3 ml-1" />
        )}
      </button>

      {hasMissing && expanded && (
        <div
          className="absolute right-0 top-full mt-2 z-50 w-64 rounded-lg border border-border bg-white shadow-lg p-3"
          role="tooltip"
        >
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            Missing fields ({missingFields.length}):
          </p>
          <ul className="space-y-1">
            {missingFields.map(({ key, label }) => (
              <li key={key} className="flex items-center gap-2 text-sm text-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive flex-shrink-0" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
