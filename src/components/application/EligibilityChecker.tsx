import React, { useState, useEffect } from 'react'
import { CheckCircle, XCircle, AlertTriangle, TrendingUp, FileText, MessageSquare } from 'lucide-react'
import { eligibilityEngine, EligibilityAssessment, MissingRequirement } from '../../lib/eligibilityEngine'
import { Button } from '../ui/Button'

interface EligibilityCheckerProps {
  applicationId: string
  programId: string
  grades: Array<{
    subject_id: string
    subject_name: string
    grade: number
  }>
  onEligibilityChange?: (assessment: EligibilityAssessment) => void
}

export function EligibilityChecker({ 
  applicationId, 
  programId, 
  grades, 
  onEligibilityChange 
}: EligibilityCheckerProps) {
  const [assessment, setAssessment] = useState<EligibilityAssessment | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAppealForm, setShowAppealForm] = useState(false)
  const [appealReason, setAppealReason] = useState('')

  useEffect(() => {
    if (grades.length > 0 && programId) {
      performEligibilityCheck()
    }
  }, [grades, programId])

  const performEligibilityCheck = async () => {
    setLoading(true)
    try {
      const result = await eligibilityEngine.assessEligibility(applicationId, programId, grades)
      setAssessment(result)
      onEligibilityChange?.(result)
    } catch (error) {
      console.error('Eligibility check failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'eligible':
        return <CheckCircle className="h-6 w-6 text-green-600" />
      case 'conditional':
        return <AlertTriangle className="h-6 w-6 text-yellow-600" />
      case 'not_eligible':
        return <XCircle className="h-6 w-6 text-red-600" />
      default:
        return <AlertTriangle className="h-6 w-6 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'eligible':
        return 'bg-green-50 border-green-200 text-green-800'
      case 'conditional':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800'
      case 'not_eligible':
        return 'bg-red-50 border-red-200 text-red-800'
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800'
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50'
      case 'major':
        return 'text-orange-600 bg-orange-50'
      case 'minor':
        return 'text-yellow-600 bg-yellow-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  const handleAppealSubmit = async () => {
    if (!assessment || !appealReason.trim()) return
    
    try {
      await eligibilityEngine.submitAppeal(
        applicationId,
        assessment.id!,
        appealReason,
        []
      )
      setShowAppealForm(false)
      setAppealReason('')
      alert('Appeal submitted successfully')
    } catch (error) {
      console.error('Appeal submission failed:', error)
      alert('Failed to submit appeal')
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Eligibility Assessment</h3>
        <p className="text-gray-600">Add subjects and grades to see eligibility status</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Main Status Card */}
      <div className={`rounded-lg border-2 p-6 ${getStatusColor(assessment.eligibility_status)}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            {getStatusIcon(assessment.eligibility_status)}
            <div>
              <h3 className="text-xl font-bold">
                {assessment.eligibility_status === 'eligible' && 'Eligible'}
                {assessment.eligibility_status === 'conditional' && 'Conditionally Eligible'}
                {assessment.eligibility_status === 'not_eligible' && 'Not Eligible'}
                {assessment.eligibility_status === 'under_review' && 'Under Review'}
              </h3>
              <p className="text-sm opacity-75">
                Overall Score: {Math.round(assessment.overall_score)}%
              </p>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-2xl font-bold">
              {Math.round(assessment.overall_score)}%
            </div>
            <div className="text-sm opacity-75">
              {assessment.detailed_breakdown.requirements_met}/{assessment.detailed_breakdown.total_requirements} requirements met
            </div>
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-white bg-opacity-50 rounded-lg p-3">
            <div className="text-sm font-medium opacity-75">Subject Count</div>
            <div className="text-lg font-bold">
              {Math.round(assessment.detailed_breakdown.subject_count_score)}%
            </div>
          </div>
          <div className="bg-white bg-opacity-50 rounded-lg p-3">
            <div className="text-sm font-medium opacity-75">Grade Average</div>
            <div className="text-lg font-bold">
              {Math.round(assessment.detailed_breakdown.grade_average_score)}%
            </div>
          </div>
          <div className="bg-white bg-opacity-50 rounded-lg p-3">
            <div className="text-sm font-medium opacity-75">Core Subjects</div>
            <div className="text-lg font-bold">
              {Math.round(assessment.detailed_breakdown.core_subjects_score)}%
            </div>
          </div>
        </div>
      </div>

      {/* Missing Requirements */}
      {assessment.missing_requirements.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <AlertTriangle className="h-5 w-5 text-orange-500 mr-2" />
            Missing Requirements
          </h4>
          <div className="space-y-3">
            {assessment.missing_requirements.map((req: MissingRequirement, index: number) => (
              <div key={index} className={`p-3 rounded-lg border ${getSeverityColor(req.severity)}`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium">{req.description}</div>
                    <div className="text-sm mt-1 opacity-75">{req.suggestion}</div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getSeverityColor(req.severity)}`}>
                    {req.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {assessment.recommendations.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <TrendingUp className="h-5 w-5 text-blue-500 mr-2" />
            Recommendations
          </h4>
          <ul className="space-y-2">
            {assessment.recommendations.map((rec: string, index: number) => (
              <li key={index} className="flex items-start space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                <span className="text-gray-700">{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Actions</h4>
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={performEligibilityCheck}
            variant="outline"
            className="flex items-center space-x-2"
          >
            <TrendingUp className="h-4 w-4" />
            <span>Refresh Assessment</span>
          </Button>
          
          {assessment.eligibility_status === 'not_eligible' && (
            <Button
              onClick={() => setShowAppealForm(true)}
              variant="outline"
              className="flex items-center space-x-2"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Submit Appeal</span>
            </Button>
          )}
          
          <Button
            variant="outline"
            className="flex items-center space-x-2"
          >
            <FileText className="h-4 w-4" />
            <span>Download Report</span>
          </Button>
        </div>
      </div>

      {/* Appeal Form Modal */}
      {showAppealForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">Submit Eligibility Appeal</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Appeal
                </label>
                <textarea
                  value={appealReason}
                  onChange={(e) => setAppealReason(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Explain why you believe the assessment should be reconsidered..."
                />
              </div>
              <div className="flex justify-end space-x-3">
                <Button
                  onClick={() => setShowAppealForm(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAppealSubmit}
                  disabled={!appealReason.trim()}
                >
                  Submit Appeal
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}