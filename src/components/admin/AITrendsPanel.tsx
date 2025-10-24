import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Minus, Sparkles, BarChart3 } from 'lucide-react'
import { predictiveAnalytics } from '../../lib/predictiveAnalytics'

export function AITrendsPanel() {
  const [loading, setLoading] = useState(true)
  const [trends, setTrends] = useState<any>(null)

  useEffect(() => {
    loadTrends()
  }, [])

  const loadTrends = async () => {
    setLoading(true)
    try {
      const result = await predictiveAnalytics.analyzeTrends()
      setTrends(result)
    } catch (error) {
      console.error('Failed to load trends:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg p-6 border border-gray-200">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-purple-600 animate-pulse" />
          <span className="text-gray-600">AI is analyzing trends...</span>
        </div>
      </div>
    )
  }

  if (!trends) {
    return null
  }

  const getTrendIcon = () => {
    switch (trends.applicationTrend) {
      case 'increasing':
        return <TrendingUp className="w-5 h-5 text-green-600" />
      case 'decreasing':
        return <TrendingDown className="w-5 h-5 text-red-600" />
      default:
        return <Minus className="w-5 h-5 text-gray-600" />
    }
  }

  const getTrendColor = () => {
    switch (trends.applicationTrend) {
      case 'increasing':
        return 'text-green-600'
      case 'decreasing':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  return (
    <div className="bg-white rounded-lg p-6 border border-gray-200 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900">AI Trends Analysis</h3>
        </div>
        <button
          onClick={loadTrends}
          className="text-sm text-purple-600 hover:text-purple-700"
        >
          Refresh
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Total Applications</p>
          <p className="text-2xl font-bold text-gray-900">{trends.totalApplications}</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Avg Processing</p>
          <p className="text-2xl font-bold text-gray-900">{trends.avgProcessingTime}d</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <p className="text-sm text-gray-600 mb-1">Efficiency</p>
          <p className="text-2xl font-bold text-gray-900">{Math.round(trends.efficiency)}%</p>
        </div>
      </div>

      {/* Application Trend */}
      <div className="border-t pt-4">
        <div className="flex items-center gap-3 mb-3">
          {getTrendIcon()}
          <div>
            <p className="font-medium text-gray-900">Application Trend</p>
            <p className={`text-sm capitalize ${getTrendColor()}`}>
              {trends.applicationTrend}
            </p>
          </div>
        </div>
      </div>

      {/* AI Insights */}
      {trends.bottlenecks?.length > 0 && (
        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h4 className="font-medium text-gray-900">AI Insights</h4>
          </div>
          <ul className="space-y-2">
            {trends.bottlenecks.map((insight: string, idx: number) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-purple-600 mt-0.5">•</span>
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-xs text-gray-500 text-center pt-4 border-t">
        Powered by Cloudflare AI • Last 30 days
      </div>
    </div>
  )
}
