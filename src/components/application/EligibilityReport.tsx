import React from 'react'
import { Download, FileText, CheckCircle, XCircle, AlertTriangle, Clock } from 'lucide-react'
import { EligibilityAssessment, MissingRequirement } from '../../lib/eligibilityEngine'
import { Button } from '../ui/Button'

interface EligibilityReportProps {
  assessment: EligibilityAssessment
  programName: string
  applicantName: string
  applicationNumber: string
  onDownload?: () => void
}

export function EligibilityReport({
  assessment,
  programName,
  applicantName,
  applicationNumber,
  onDownload
}: EligibilityReportProps) {
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'eligible':
        return <CheckCircle className="h-8 w-8 text-green-600" />
      case 'conditional':
        return <AlertTriangle className="h-8 w-8 text-yellow-600" />
      case 'not_eligible':
        return <XCircle className="h-8 w-8 text-red-600" />
      case 'under_review':
        return <Clock className="h-8 w-8 text-blue-600" />
      default:
        return <AlertTriangle className="h-8 w-8 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'eligible':
        return 'text-green-800 bg-green-100'
      case 'conditional':
        return 'text-yellow-800 bg-yellow-100'
      case 'not_eligible':
        return 'text-red-800 bg-red-100'
      case 'under_review':
        return 'text-blue-800 bg-blue-100'
      default:
        return 'text-gray-800 bg-gray-100'
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'border-red-300 bg-red-50'
      case 'major':
        return 'border-orange-300 bg-orange-50'
      case 'minor':
        return 'border-yellow-300 bg-yellow-50'
      default:
        return 'border-gray-300 bg-gray-50'
    }
  }

  const generateReportContent = () => {
    const date = new Date().toLocaleDateString()
    const time = new Date().toLocaleTimeString()
    
    return `
ELIGIBILITY ASSESSMENT REPORT
============================

Application Details:
- Application Number: ${applicationNumber}
- Applicant Name: ${applicantName}
- Program: ${programName}
- Assessment Date: ${date} ${time}

Overall Assessment:
- Status: ${assessment.eligibility_status.toUpperCase()}
- Overall Score: ${Math.round(assessment.overall_score)}%
- Requirements Met: ${assessment.detailed_breakdown.requirements_met}/${assessment.detailed_breakdown.total_requirements}

Detailed Breakdown:
- Subject Count Score: ${Math.round(assessment.detailed_breakdown.subject_count_score)}%
- Grade Average Score: ${Math.round(assessment.detailed_breakdown.grade_average_score)}%
- Core Subjects Score: ${Math.round(assessment.detailed_breakdown.core_subjects_score)}%
- Total Weighted Score: ${Math.round(assessment.detailed_breakdown.total_weighted_score)}%

${assessment.missing_requirements.length > 0 ? `
Missing Requirements:
${assessment.missing_requirements.map((req: MissingRequirement, index: number) => 
  `${index + 1}. [${req.severity.toUpperCase()}] ${req.description}
     Suggestion: ${req.suggestion}`
).join('\n')}
` : 'All requirements met.'}

${assessment.recommendations.length > 0 ? `
Recommendations:
${assessment.recommendations.map((rec: string, index: number) => 
  `${index + 1}. ${rec}`
).join('\n')}
` : ''}

${assessment.assessor_notes ? `
Assessor Notes:
${assessment.assessor_notes}
` : ''}

This report was generated automatically by the Eligibility Assessment System.
For appeals or queries, please contact the admissions office.
    `.trim()
  }

  const downloadReport = () => {
    const content = generateReportContent()
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `eligibility-report-${applicationNumber}-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    onDownload?.()
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="border-b border-gray-200 pb-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <FileText className="h-10 w-10 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Eligibility Assessment Report
              </h1>
              <p className="text-gray-600">
                Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
              </p>
            </div>
          </div>
          <Button
            onClick={downloadReport}
            className="flex items-center space-x-2"
          >
            <Download className="h-4 w-4" />
            <span>Download Report</span>
          </Button>
        </div>
      </div>

      {/* Application Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Application Details</h2>
          <div className="space-y-2 text-sm">
            <div><strong>Application Number:</strong> {applicationNumber}</div>
            <div><strong>Applicant Name:</strong> {applicantName}</div>
            <div><strong>Program:</strong> {programName}</div>
            <div><strong>Assessment ID:</strong> {assessment.id}</div>
          </div>
        </div>
        
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-900">Assessment Summary</h2>
          <div className="space-y-2 text-sm">
            <div><strong>Assessment Date:</strong> {new Date().toLocaleDateString()}</div>
            <div><strong>Requirements Met:</strong> {assessment.detailed_breakdown.requirements_met}/{assessment.detailed_breakdown.total_requirements}</div>
            <div><strong>Overall Score:</strong> {Math.round(assessment.overall_score)}%</div>
          </div>
        </div>
      </div>

      {/* Status Section */}
      <div className={`rounded-lg border-2 p-6 mb-8 ${getStatusColor(assessment.eligibility_status)}`}>
        <div className="flex items-center space-x-4">
          {getStatusIcon(assessment.eligibility_status)}
          <div>
            <h2 className="text-2xl font-bold">
              {assessment.eligibility_status === 'eligible' && 'ELIGIBLE'}
              {assessment.eligibility_status === 'conditional' && 'CONDITIONALLY ELIGIBLE'}
              {assessment.eligibility_status === 'not_eligible' && 'NOT ELIGIBLE'}
              {assessment.eligibility_status === 'under_review' && 'UNDER REVIEW'}
            </h2>
            <p className="text-lg">
              Overall Assessment Score: {Math.round(assessment.overall_score)}%
            </p>
          </div>
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Detailed Score Breakdown</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-sm font-medium text-blue-600">Subject Count</div>
            <div className="text-2xl font-bold text-blue-900">
              {Math.round(assessment.detailed_breakdown.subject_count_score)}%
            </div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-sm font-medium text-green-600">Grade Average</div>
            <div className="text-2xl font-bold text-green-900">
              {Math.round(assessment.detailed_breakdown.grade_average_score)}%
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-sm font-medium text-purple-600">Core Subjects</div>
            <div className="text-2xl font-bold text-purple-900">
              {Math.round(assessment.detailed_breakdown.core_subjects_score)}%
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm font-medium text-gray-600">Weighted Total</div>
            <div className="text-2xl font-bold text-gray-900">
              {Math.round(assessment.detailed_breakdown.total_weighted_score)}%
            </div>
          </div>
        </div>
      </div>

      {/* Missing Requirements */}
      {assessment.missing_requirements.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Missing Requirements</h2>
          <div className="space-y-3">
            {assessment.missing_requirements.map((req: MissingRequirement, index: number) => (
              <div key={index} className={`border rounded-lg p-4 ${getSeverityColor(req.severity)}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded uppercase ${
                        req.severity === 'critical' ? 'bg-red-200 text-red-800' :
                        req.severity === 'major' ? 'bg-orange-200 text-orange-800' :
                        'bg-yellow-200 text-yellow-800'
                      }`}>
                        {req.severity}
                      </span>
                      <span className="text-xs text-gray-500 uppercase">{req.type}</span>
                    </div>
                    <div className="font-medium text-gray-900 mb-1">{req.description}</div>
                    <div className="text-sm text-gray-700">{req.suggestion}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {assessment.recommendations.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recommendations</h2>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <ul className="space-y-2">
              {assessment.recommendations.map((rec: string, index: number) => (
                <li key={index} className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
                  <span className="text-blue-800">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Assessor Notes */}
      {assessment.assessor_notes && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Assessor Notes</h2>
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-gray-700">{assessment.assessor_notes}</p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-gray-200 pt-6">
        <div className="text-sm text-gray-600">
          <p className="mb-2">
            <strong>Important Notes:</strong>
          </p>
          <ul className="space-y-1 ml-4">
            <li>• This assessment is based on the information provided at the time of evaluation</li>
            <li>• Meeting eligibility requirements does not guarantee admission</li>
            <li>• Additional requirements may apply based on program-specific criteria</li>
            <li>• For appeals or queries, please contact the admissions office</li>
          </ul>
          
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              This report was generated automatically by the Eligibility Assessment System on {new Date().toLocaleString()}.
              Report ID: {assessment.id}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}