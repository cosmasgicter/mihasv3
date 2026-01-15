import React, { useState, useEffect } from 'react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Button } from '@/components/ui/Button'
import { useToastStore } from '@/components/ui/Toast'
import { TrendingUp, Calendar, Users, BarChart3, RefreshCw, Download } from 'lucide-react'
import { usePredictiveAnalytics, useGeneratePredictiveReport } from '@/hooks/useAnalyticsQueries'

export default function PredictiveAnalytics() {
  const [timeRange, setTimeRange] = useState('30')
  const { success: showSuccess, error: showError } = useToastStore()
  
  // Use React Query hook for data fetching
  const { data, isLoading, refetch, isFetching } = usePredictiveAnalytics(parseInt(timeRange))
  const generateReportMutation = useGeneratePredictiveReport()

  const predictions = data?.predictions || []

  const refreshData = async () => {
    try {
      await refetch()
      showSuccess('Predictions refreshed successfully')
    } catch (error) {
      showError('Failed to refresh predictions', error instanceof Error ? error.message : undefined)
    }
  }

  const generateReport = async () => {
    try {
      const blob = await generateReportMutation.mutateAsync({
        daysAhead: parseInt(timeRange),
        format: 'pdf'
      })

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `predictive-analytics-${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      showSuccess('Report generated successfully')
    } catch (error) {
      console.error('Failed to generate report:', error)
      showError('Failed to generate report', error instanceof Error ? error.message : undefined)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <main className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 rounded-2xl p-6 text-white shadow-xl mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold flex items-center gap-2">
                <TrendingUp className="w-6 h-6" />
                Predictive Analytics
              </h1>
              <p className="text-sm text-white/90 mt-2">
                Forecast application volumes and trends using machine learning
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                onClick={refreshData}
                disabled={isFetching}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                onClick={generateReport}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-2xl shadow-lg border border-border p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <h3 className="text-lg font-bold text-gray-900">Prediction Settings</h3>
            <div className="flex items-center space-x-4">
              <label htmlFor="time_range" className="text-sm font-medium text-gray-900">
                Forecast Period:
              </label>
              <select
                id="time_range"
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="border-2 border-border rounded-xl px-3 py-2 focus:border-success focus:ring-2 focus:ring-green-500/20"
              >
                <option value="7">Next 7 days</option>
                <option value="14">Next 14 days</option>
                <option value="30">Next 30 days</option>
                <option value="60">Next 60 days</option>
                <option value="90">Next 90 days</option>
              </select>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 mb-1">Predicted Volume</p>
                <p className="text-2xl sm:text-3xl font-bold text-primary">
                  {predictions.reduce((sum, p) => sum + p.predictedVolume, 0)}
                </p>
                <p className="text-xs text-gray-600 mt-1">Next {timeRange} days</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-2xl">
                <Users className="h-8 w-8 text-primary" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 mb-1">Avg Confidence</p>
                <p className="text-2xl sm:text-3xl font-bold text-success">
                  {predictions.length > 0
                    ? Math.round((predictions.reduce((sum, p) => sum + p.confidence, 0) / predictions.length) * 100)
                    : 0}%
                </p>
                <p className="text-xs text-gray-600 mt-1">Model accuracy</p>
              </div>
              <div className="p-3 bg-success/10 rounded-2xl">
                <BarChart3 className="h-8 w-8 text-success" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 mb-1">Trend Direction</p>
                <p className="text-2xl sm:text-3xl font-bold text-accent">
                  {predictions.filter(p => p.trend === 'up').length > predictions.length / 2 ? '↑' : 
                   predictions.filter(p => p.trend === 'down').length > predictions.length / 2 ? '↓' : '→'}
                </p>
                <p className="text-xs text-gray-600 mt-1">Overall trend</p>
              </div>
              <div className="p-3 bg-accent/10 rounded-2xl">
                <TrendingUp className="h-8 w-8 text-accent" />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl shadow-lg border border-border p-6 hover:shadow-xl transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 mb-1">Peak Day</p>
                <p className="text-2xl sm:text-3xl font-bold text-secondary">
                  {predictions.length > 0
                    ? new Date(predictions.reduce((max, p) => p.predictedVolume > max.predictedVolume ? p : max).period).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : 'N/A'}
                </p>
                <p className="text-xs text-gray-600 mt-1">Highest volume</p>
              </div>
              <div className="p-3 bg-secondary/10 rounded-2xl">
                <Calendar className="h-8 w-8 text-secondary" />
              </div>
            </div>
          </div>
        </div>

        {/* Predictions Table */}
        <div className="bg-card rounded-2xl shadow-lg border border-border overflow-hidden">
          <div className="px-6 py-4 bg-gradient-to-r from-muted to-blue-50 border-b border-border">
            <h3 className="text-xl font-bold text-gray-900">Detailed Predictions</h3>
          </div>
          <div className="p-6">
            {predictions.length === 0 ? (
              <div className="text-center text-gray-600 py-8">
                No predictions available. Try adjusting the forecast period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                        Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                        Predicted Volume
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                        Confidence
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">
                        Trend
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {predictions.map((prediction, index) => (
                      <tr key={index} className="hover:bg-muted transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(prediction.period).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                          {prediction.predictedVolume}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            prediction.confidence >= 0.8
                              ? 'bg-success/10 text-success'
                              : prediction.confidence >= 0.6
                              ? 'bg-accent/10 text-accent'
                              : 'bg-warning/10 text-warning'
                          }`}>
                            {Math.round(prediction.confidence * 100)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${
                            prediction.trend === 'up'
                              ? 'bg-success/10 text-success'
                              : prediction.trend === 'down'
                              ? 'bg-error/10 text-error'
                              : 'bg-muted text-gray-900'
                          }`}>
                            {prediction.trend === 'up' ? '↑ Up' : prediction.trend === 'down' ? '↓ Down' : '→ Stable'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
