/**
 * Detailed Score Breakdown Component
 * 
 * Displays comprehensive eligibility scoring with explanatory feedback
 * and improvement recommendations for students.
 * Uses CSS transitions instead of framer-motion for performance.
 * 
 * @requirements 1.2 - CSS transitions instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior
 */

import React, { useState } from 'react'
import { cn } from '@/lib/utils'
import { 
  ChevronDown, 
  ChevronUp, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Info,
  Target,
  BookOpen,
  Clock,
  Award
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { 
  DetailedEligibilityAssessment, 
  DetailedScoreBreakdown,
  ImprovementRecommendation 
} from '@/lib/detailedEligibilityScoring'

interface DetailedScoreBreakdownProps {
  assessment: DetailedEligibilityAssessment
  showRecommendations?: boolean
  onRecommendationAction?: (recommendation: ImprovementRecommendation) => void
}

export function DetailedScoreBreakdown({ 
  assessment, 
  showRecommendations = true,
  onRecommendationAction 
}: DetailedScoreBreakdownProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']))
  const [selectedRecommendation, setSelectedRecommendation] = useState<ImprovementRecommendation | null>(null)

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return 'text-green-700 bg-green-50 border-green-200'
      case 'good': return 'text-blue-700 bg-blue-50 border-blue-200'
      case 'conditional': return 'text-yellow-700 bg-yellow-50 border-yellow-200'
      case 'needs_improvement': return 'text-orange-700 bg-orange-50 border-orange-200'
      case 'not_eligible': return 'text-red-700 bg-red-50 border-red-200'
      default: return 'text-gray-700 bg-gray-50 border-gray-200'
    }
  }

  const getCompetitivenessColor = (level: string) => {
    switch (level) {
      case 'highly_competitive': return 'bg-green-100 text-green-800'
      case 'competitive': return 'bg-blue-100 text-blue-800'
      case 'minimum_requirements': return 'bg-yellow-100 text-yellow-800'
      case 'below_minimum': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high': return <AlertTriangle className="h-4 w-4 text-red-500" />
      case 'medium': return <Info className="h-4 w-4 text-yellow-500" />
      case 'low': return <CheckCircle className="h-4 w-4 text-green-500" />
      default: return <Info className="h-4 w-4 text-gray-500" />
    }
  }

  const ScoreComponent = ({ 
    title, 
    score, 
    maxScore, 
    weight, 
    explanation, 
    feedback 
  }: {
    title: string
    score: number
    maxScore: number
    weight: number
    explanation: string
    feedback: string
  }) => {
    const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0
    const weightedContribution = score * weight
    
    return (
      <div className="border rounded-lg p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-gray-900">{title}</h4>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Weight: {(weight * 100).toFixed(0)}%</span>
            <span className={`px-2 py-1 rounded text-sm font-medium ${
              percentage >= 80 ? 'bg-green-100 text-green-800' :
              percentage >= 60 ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {percentage.toFixed(1)}%
            </span>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
          <div 
            className={`h-2 rounded-full transition-all duration-500 motion-reduce:transition-none ${
              percentage >= 80 ? 'bg-green-500' :
              percentage >= 60 ? 'bg-yellow-500' :
              'bg-red-500'
            }`}
            style={{ width: `${Math.min(100, percentage)}%` }}
          />
        </div>
        
        <div className="space-y-2">
          <p className="text-sm text-gray-600">{explanation}</p>
          <div className="p-3 bg-gray-50 rounded border-l-4 border-blue-400">
            <p className="text-sm text-gray-700 whitespace-pre-line">{feedback}</p>
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Raw Score: {score.toFixed(1)}/{maxScore}</span>
            <span>Weighted Contribution: {weightedContribution.toFixed(1)}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Overall Status */}
      <div className={`rounded-lg border p-6 ${getStatusColor(assessment.eligibilityStatus)}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold mb-2">
              Eligibility Assessment for {assessment.programName}
            </h3>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl font-bold">
                {assessment.scoreBreakdown.percentageScore.toFixed(1)}%
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getCompetitivenessColor(assessment.competitivenessLevel)}`}>
                {assessment.competitivenessLevel.replace('_', ' ').toUpperCase()}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 mb-2">
              <Award className="h-5 w-5" />
              <span className="text-sm font-medium">
                {assessment.comparisonToTypicalAdmitted.percentile}th percentile
              </span>
            </div>
            <p className="text-xs">
              {assessment.comparisonToTypicalAdmitted.explanation}
            </p>
          </div>
        </div>
        
        <p className="text-sm leading-relaxed">{assessment.overallFeedback}</p>
        
        {/* Key insights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {assessment.scoreBreakdown.strengthAreas.length > 0 && (
            <div className="bg-white/50 rounded p-3">
              <h5 className="font-medium text-green-800 mb-1 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                Strengths
              </h5>
              <ul className="text-xs space-y-1">
                {assessment.scoreBreakdown.strengthAreas.map((area, idx) => (
                  <li key={idx}>• {area}</li>
                ))}
              </ul>
            </div>
          )}
          
          {assessment.scoreBreakdown.improvementAreas.length > 0 && (
            <div className="bg-white/50 rounded p-3">
              <h5 className="font-medium text-yellow-800 mb-1 flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Can Improve
              </h5>
              <ul className="text-xs space-y-1">
                {assessment.scoreBreakdown.improvementAreas.map((area, idx) => (
                  <li key={idx}>• {area}</li>
                ))}
              </ul>
            </div>
          )}
          
          {assessment.scoreBreakdown.criticalGaps.length > 0 && (
            <div className="bg-white/50 rounded p-3">
              <h5 className="font-medium text-red-800 mb-1 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Critical Gaps
              </h5>
              <ul className="text-xs space-y-1">
                {assessment.scoreBreakdown.criticalGaps.map((area, idx) => (
                  <li key={idx}>• {area}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Score Breakdown */}
      <div className="bg-white rounded-lg border">
        <button
          onClick={() => toggleSection('breakdown')}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
        >
          <h3 className="text-lg font-semibold">Detailed Score Breakdown</h3>
          {expandedSections.has('breakdown') ? 
            <ChevronUp className="h-5 w-5" /> : 
            <ChevronDown className="h-5 w-5" />
          }
        </button>
        
        <div
          className={cn(
            'overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none',
            expandedSections.has('breakdown') ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
          )}
        >
          <div className="border-t p-4 space-y-4">
            <ScoreComponent
              title="Subject Count Score"
              score={assessment.scoreBreakdown.subjectCountScore.score}
              maxScore={assessment.scoreBreakdown.subjectCountScore.maxScore}
              weight={assessment.scoreBreakdown.subjectCountScore.weight}
              explanation={assessment.scoreBreakdown.subjectCountScore.explanation}
              feedback={assessment.scoreBreakdown.subjectCountScore.feedback}
            />
            
            <ScoreComponent
              title="Grade Average Score"
              score={assessment.scoreBreakdown.gradeAverageScore.score}
              maxScore={assessment.scoreBreakdown.gradeAverageScore.maxScore}
              weight={assessment.scoreBreakdown.gradeAverageScore.weight}
              explanation={assessment.scoreBreakdown.gradeAverageScore.explanation}
              feedback={assessment.scoreBreakdown.gradeAverageScore.feedback}
            />
            
            <ScoreComponent
              title="Core Subjects Score"
              score={assessment.scoreBreakdown.coreSubjectsScore.score}
              maxScore={assessment.scoreBreakdown.coreSubjectsScore.maxScore}
              weight={assessment.scoreBreakdown.coreSubjectsScore.weight}
              explanation={assessment.scoreBreakdown.coreSubjectsScore.explanation}
              feedback={assessment.scoreBreakdown.coreSubjectsScore.feedback}
            />
            
            <ScoreComponent
              title="Regulatory Compliance Score"
              score={assessment.scoreBreakdown.regulatoryComplianceScore.score}
              maxScore={assessment.scoreBreakdown.regulatoryComplianceScore.maxScore}
              weight={assessment.scoreBreakdown.regulatoryComplianceScore.weight}
              explanation={assessment.scoreBreakdown.regulatoryComplianceScore.explanation}
              feedback={assessment.scoreBreakdown.regulatoryComplianceScore.feedback}
            />
            
            {/* Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">Score Summary</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-blue-700">Total Weighted Score:</span>
                  <span className="font-medium ml-2">
                    {assessment.scoreBreakdown.totalWeightedScore.toFixed(1)}
                  </span>
                </div>
                <div>
                  <span className="text-blue-700">Max Possible Score:</span>
                  <span className="font-medium ml-2">
                    {assessment.scoreBreakdown.maxPossibleScore.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* Improvement Recommendations */}
      {showRecommendations && assessment.improvementRecommendations.length > 0 && (
        <div className="bg-white rounded-lg border">
          <button
            onClick={() => toggleSection('recommendations')}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
          >
            <h3 className="text-lg font-semibold">Improvement Recommendations</h3>
            {expandedSections.has('recommendations') ? 
              <ChevronUp className="h-5 w-5" /> : 
              <ChevronDown className="h-5 w-5" />
            }
          </button>
          
          <div
            className={cn(
              'overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none',
              expandedSections.has('recommendations') ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0'
            )}
          >
            <div className="border-t p-4 space-y-4">
              {assessment.improvementRecommendations.map((rec, idx) => (
                <div key={idx} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getPriorityIcon(rec.priority)}
                      <h4 className="font-semibold">{rec.title}</h4>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        rec.priority === 'high' ? 'bg-red-100 text-red-800' :
                        rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {rec.priority.toUpperCase()}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedRecommendation(rec)}
                    >
                      View Details
                    </Button>
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-3">{rec.description}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-green-500" />
                      <span>+{rec.expectedImpact.scoreIncrease} points</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-blue-500" />
                      <span>{rec.timeframe}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Target className="h-3 w-3 text-purple-500" />
                      <span>{rec.category.replace('_', ' ')}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Alternative Pathways */}
      {assessment.alternativePathways.length > 0 && (
        <div className="bg-white rounded-lg border">
          <button
            onClick={() => toggleSection('pathways')}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50"
          >
            <h3 className="text-lg font-semibold">Alternative Pathways</h3>
            {expandedSections.has('pathways') ? 
              <ChevronUp className="h-5 w-5" /> : 
              <ChevronDown className="h-5 w-5" />
            }
          </button>
          
          <div
            className={cn(
              'overflow-hidden transition-all duration-300 ease-out motion-reduce:transition-none',
              expandedSections.has('pathways') ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
            )}
          >
            <div className="border-t p-4 space-y-4">
              {assessment.alternativePathways.map((pathway, idx) => (
                <div key={idx} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold">{pathway.name}</h4>
                    <span className="text-xs text-gray-500">{pathway.timeToCompletion}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{pathway.description}</p>
                  <div>
                    <h5 className="text-xs font-medium text-gray-700 mb-1">Requirements:</h5>
                    <ul className="text-xs text-gray-600 space-y-1">
                      {pathway.requirements.map((req, reqIdx) => (
                        <li key={reqIdx}>• {req}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recommendation Detail Modal */}
      {selectedRecommendation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold">{selectedRecommendation.title}</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedRecommendation(null)}
                >
                  Close
                </Button>
              </div>
              
              <div className="space-y-4">
                <p className="text-gray-600">{selectedRecommendation.description}</p>
                
                <div>
                  <h4 className="font-semibold mb-2">Action Steps:</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm">
                    {selectedRecommendation.actionSteps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Expected Impact:</h4>
                    <p className="text-sm text-gray-600">
                      Score increase: +{selectedRecommendation.expectedImpact.scoreIncrease} points
                    </p>
                    <p className="text-sm text-gray-600">
                      {selectedRecommendation.expectedImpact.eligibilityImprovement}
                    </p>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Timeframe:</h4>
                    <p className="text-sm text-gray-600">{selectedRecommendation.timeframe}</p>
                  </div>
                </div>
                
                {selectedRecommendation.resources && (
                  <div>
                    <h4 className="font-semibold mb-2">Resources:</h4>
                    <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                      {selectedRecommendation.resources.map((resource, idx) => (
                        <li key={idx}>{resource}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {onRecommendationAction && (
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      onClick={() => {
                        onRecommendationAction(selectedRecommendation)
                        setSelectedRecommendation(null)
                      }}
                    >
                      Take Action
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setSelectedRecommendation(null)}
                    >
                      Maybe Later
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DetailedScoreBreakdown