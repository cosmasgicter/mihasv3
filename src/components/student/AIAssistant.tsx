import { useState } from 'react'
import { Sparkles, TrendingUp, Clock, AlertCircle } from 'lucide-react'
import { predictiveAnalytics } from '../../lib/predictiveAnalytics'
import { useToast } from '../../hooks/useToast'

interface AIAssistantProps {
  applicationId: string
  applicationData: any
}

export function AIAssistant({ applicationId, applicationData }: AIAssistantProps) {
  const [loading, setLoading] = useState(false)
  const [prediction, setPrediction] = useState<any>(null)
  const { showToast } = useToast()

  const runPrediction = async () => {
    setLoading(true)
    try {
      const result = await predictiveAnalytics.predictAdmissionSuccess({
        id: applicationId,
        ...applicationData
      })
      setPrediction(result)
    } catch (error) {
      showToast('Failed to generate AI prediction', 'error')
    } finally {
      setLoading(false)
    }
  }

  if (!prediction && !loading) {
    return (
      <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg p-6 border border-purple-200">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-6 h-6 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900">AI Assistant</h3>
        </div>
        <p className="text-gray-600 mb-4">
          Get AI-powered insights about your application including admission probability and personalized recommendations.
        </p>
        <button
          onClick={runPrediction}
          className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
        >
          Analyze My Application
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-purple-600 animate-pulse" />
          <span className="text-gray-600">AI is analyzing your application...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg p-6 border border-gray-200 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900">AI Analysis</h3>
        </div>
        <span className="text-xs text-gray-500">Powered by Cloudflare AI</span>
      </div>

      {/* Admission Probability */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-5 h-5 text-green-600" />
          <span className="font-medium text-gray-900">Admission Probability</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-gray-900">
            {Math.round(prediction.admissionProbability * 100)}%
          </span>
          <span className="text-sm text-gray-600">
            (Confidence: {Math.round(prediction.confidence * 100)}%)
          </span>
        </div>
      </div>

      {/* Processing Time */}
      <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
        <Clock className="w-5 h-5 text-blue-600" />
        <div>
          <p className="text-sm font-medium text-gray-900">Estimated Processing Time</p>
          <p className="text-sm text-gray-600">{prediction.processingTimeEstimate} days</p>
        </div>
      </div>

      {/* Recommendations */}
      {prediction.recommendations?.length > 0 && (
        <div>
          <h4 className="font-medium text-gray-900 mb-2">AI Recommendations</h4>
          <ul className="space-y-2">
            {prediction.recommendations.map((rec: string, idx: number) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-purple-600 mt-0.5">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risk Factors */}
      {prediction.riskFactors?.length > 0 && (
        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-orange-600" />
            <h4 className="font-medium text-gray-900">Areas to Address</h4>
          </div>
          <ul className="space-y-1">
            {prediction.riskFactors.map((risk: string, idx: number) => (
              <li key={idx} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="text-orange-600 mt-0.5">⚠</span>
                <span>{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={runPrediction}
        className="text-sm text-purple-600 hover:text-purple-700"
      >
        Refresh Analysis
      </button>
    </div>
  )
}
