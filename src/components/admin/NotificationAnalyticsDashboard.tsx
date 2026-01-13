import React, { useState, useEffect } from 'react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useToastStore } from '@/components/ui/Toast'
import { 
  Bell, 
  Mail, 
  MessageSquare, 
  Smartphone, 
  TrendingUp, 
  Clock, 
  Users, 
  CheckCircle, 
  XCircle, 
  RefreshCw,
  BarChart3,
  Filter,
  Download
} from 'lucide-react'
import { 
  exportNotificationAnalytics, 
  generateAnalyticsReportData, 
  type ExportFormat 
} from '@/lib/notificationAnalyticsExport'

interface NotificationAnalytics {
  summary: {
    total_notifications: number
    successful_deliveries: number
    failed_deliveries: number
    overall_success_rate: number
    time_period_days: number
  }
  channel_breakdown: Array<{
    channel: string
    total_notifications: number
    success_rate: number
    delivery_rate: number
  }>
  daily_trends: Array<{
    date: string
    total_notifications: number
    success_rate: number
  }>
  optimal_hours: Array<{
    hour: number
    success_rate: number
    total_notifications: number
  }>
  top_performing_channels: Array<{
    channel: string
    success_rate: number
    total_notifications: number
  }>
}

interface DeliveryRates {
  delivery_rates: Array<{
    date?: string
    hour?: number
    channels: Record<string, {
      total_notifications: number
      success_rate: number
      delivery_rate: number
    }>
    total_notifications: number
    overall_success_rate: number
  }>
  group_by: 'hour' | 'day'
  time_period_days: number
  channel_filter?: string
}

interface UserEngagement {
  user_engagement: Array<{
    user_id: string
    engagement_score: number
    preferred_channel: string
    total_notifications_received: number
    total_notifications_opened: number
  }>
  statistics: {
    total_users: number
    avg_engagement_score: number
    high_engagement_users: number
    low_engagement_users: number
    most_popular_channel: string
    channel_distribution: Record<string, number>
  }
  time_period_days: number
}

interface OptimalTimes {
  recommendations: Array<{
    channel: string
    optimal_hour: number
    success_rate: number
    recommendation: string
  }>
  detailed_analysis: Array<{
    hour: number
    channel: string
    success_rate: number
    total_notifications: number
  }>
  channel_filter?: string
}

interface ChannelPerformance {
  channel_performance: Array<{
    channel: string
    total_notifications: number
    avg_success_rate: number
    avg_delivery_rate: number
    avg_delivery_time_seconds: number
  }>
  time_period_days: number
}

export default function NotificationAnalyticsDashboard() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<'overview' | 'delivery' | 'engagement' | 'timing' | 'channels'>('overview')
  
  // Data states
  const [analytics, setAnalytics] = useState<NotificationAnalytics | null>(null)
  const [deliveryRates, setDeliveryRates] = useState<DeliveryRates | null>(null)
  const [userEngagement, setUserEngagement] = useState<UserEngagement | null>(null)
  const [optimalTimes, setOptimalTimes] = useState<OptimalTimes | null>(null)
  const [channelPerformance, setChannelPerformance] = useState<ChannelPerformance | null>(null)
  
  // Filter states
  const [dateRange, setDateRange] = useState({
    days: 7,
    channel: '',
    groupBy: 'day' as 'hour' | 'day'
  })
  
  // Export state
  const [exportFormat, setExportFormat] = useState<ExportFormat>('pdf')
  const [exporting, setExporting] = useState(false)
  
  const { success: showSuccess, error: showError } = useToastStore()

  useEffect(() => {
    loadAnalytics()
  }, [dateRange])

  const loadAnalytics = async () => {
    try {
      setLoading(true)
      await Promise.all([
        loadOverviewAnalytics(),
        loadDeliveryRates(),
        loadUserEngagement(),
        loadOptimalTimes(),
        loadChannelPerformance()
      ])
    } catch (error) {
      console.error('Failed to load notification analytics:', error)
      showError('Failed to load analytics data')
    } finally {
      setLoading(false)
    }
  }

  const loadOverviewAnalytics = async () => {
    try {
      const params = new URLSearchParams({
        action: 'overview',
        days: dateRange.days.toString()
      })
      if (dateRange.channel) {
        params.append('channel', dateRange.channel)
      }

      const response = await fetch(`/notifications/analytics?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch overview analytics')
      }

      const result = await response.json()
      if (result.success) {
        setAnalytics(result.data)
      }
    } catch (error) {
      console.error('Failed to load overview analytics:', error)
    }
  }

  const loadDeliveryRates = async () => {
    try {
      const params = new URLSearchParams({
        action: 'delivery-rates',
        days: dateRange.days.toString(),
        group_by: dateRange.groupBy
      })
      if (dateRange.channel) {
        params.append('channel', dateRange.channel)
      }

      const response = await fetch(`/notifications/analytics?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch delivery rates')
      }

      const result = await response.json()
      if (result.success) {
        setDeliveryRates(result.data)
      }
    } catch (error) {
      console.error('Failed to load delivery rates:', error)
    }
  }

  const loadUserEngagement = async () => {
    try {
      const params = new URLSearchParams({
        action: 'user-engagement',
        days: dateRange.days.toString(),
        limit: '50'
      })

      const response = await fetch(`/notifications/analytics?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch user engagement')
      }

      const result = await response.json()
      if (result.success) {
        setUserEngagement(result.data)
      }
    } catch (error) {
      console.error('Failed to load user engagement:', error)
    }
  }

  const loadOptimalTimes = async () => {
    try {
      const params = new URLSearchParams({
        action: 'optimal-times'
      })
      if (dateRange.channel) {
        params.append('channel', dateRange.channel)
      }

      const response = await fetch(`/notifications/analytics?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch optimal times')
      }

      const result = await response.json()
      if (result.success) {
        setOptimalTimes(result.data)
      }
    } catch (error) {
      console.error('Failed to load optimal times:', error)
    }
  }

  const loadChannelPerformance = async () => {
    try {
      const params = new URLSearchParams({
        action: 'channel-performance',
        days: dateRange.days.toString()
      })

      const response = await fetch(`/notifications/analytics?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch channel performance')
      }

      const result = await response.json()
      if (result.success) {
        setChannelPerformance(result.data)
      }
    } catch (error) {
      console.error('Failed to load channel performance:', error)
    }
  }

  const refreshData = async () => {
    try {
      setRefreshing(true)
      await loadAnalytics()
      showSuccess('Analytics data refreshed successfully')
    } catch (error) {
      showError('Failed to refresh analytics data')
    } finally {
      setRefreshing(false)
    }
  }

  const exportAnalytics = async () => {
    try {
      setExporting(true)
      
      if (!analytics) {
        showError('No analytics data available to export')
        return
      }

      const reportData = generateAnalyticsReportData(analytics, deliveryRates, userEngagement)
      await exportNotificationAnalytics(reportData, exportFormat)
      
      showSuccess(`Analytics report exported as ${exportFormat.toUpperCase()}`)
    } catch (error) {
      console.error('Export failed:', error)
      showError('Failed to export analytics report')
    } finally {
      setExporting(false)
    }
  }

  const getChannelIcon = (channel: string) => {
    switch (channel.toLowerCase()) {
      case 'email':
        return <Mail className="h-4 w-4" />
      case 'sms':
        return <MessageSquare className="h-4 w-4" />
      case 'whatsapp':
        return <MessageSquare className="h-4 w-4" />
      case 'push':
        return <Smartphone className="h-4 w-4" />
      case 'in-app':
        return <Bell className="h-4 w-4" />
      default:
        return <Bell className="h-4 w-4" />
    }
  }

  const getChannelColor = (channel: string) => {
    switch (channel.toLowerCase()) {
      case 'email':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'sms':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'whatsapp':
        return 'text-emerald-600 bg-emerald-50 border-emerald-200'
      case 'push':
        return 'text-purple-600 bg-purple-50 border-purple-200'
      case 'in-app':
        return 'text-orange-600 bg-orange-50 border-orange-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  if (loading) {
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
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold flex items-center">
                <Bell className="w-6 h-6 mr-3" />
                Notification Analytics
              </h1>
              <p className="text-lg text-white/90 mt-2">
                Track delivery rates, user engagement, and optimal delivery times
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                onClick={refreshData}
                disabled={refreshing}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <div className="text-right">
                <div className="text-2xl sm:text-3xl font-bold">
                  {analytics?.summary.total_notifications || 0}
                </div>
                <div className="text-sm text-white/80">Total Notifications</div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 mb-8">
          <div className="flex flex-wrap border-b border-gray-200">
            {[
              { key: 'overview', label: 'Overview', icon: BarChart3 },
              { key: 'delivery', label: 'Delivery Rates', icon: TrendingUp },
              { key: 'engagement', label: 'User Engagement', icon: Users },
              { key: 'timing', label: 'Optimal Times', icon: Clock },
              { key: 'channels', label: 'Channel Performance', icon: Bell }
            ].map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`flex items-center px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? 'border-blue-500 text-blue-600 bg-blue-50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Filters */}
        <Card className="p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 mb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center">
              <Filter className="h-5 w-5 mr-2" />
              Filters & Export
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={exportAnalytics}
                disabled={exporting || !analytics}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Download className={`h-4 w-4 mr-2 ${exporting ? 'animate-pulse' : ''}`} />
                {exporting ? 'Exporting...' : 'Export Report'}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Time Period</label>
              <select
                value={dateRange.days}
                onChange={(e) => setDateRange(prev => ({ ...prev, days: parseInt(e.target.value) }))}
                className="w-full border-2 border-gray-300 rounded-xl px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value={1}>Last 24 hours</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Channel Filter</label>
              <select
                value={dateRange.channel}
                onChange={(e) => setDateRange(prev => ({ ...prev, channel: e.target.value }))}
                className="w-full border-2 border-gray-300 rounded-xl px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">All Channels</option>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="push">Push Notifications</option>
                <option value="in-app">In-App</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Group By</label>
              <select
                value={dateRange.groupBy}
                onChange={(e) => setDateRange(prev => ({ ...prev, groupBy: e.target.value as 'hour' | 'day' }))}
                className="w-full border-2 border-gray-300 rounded-xl px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="hour">Hourly</option>
                <option value="day">Daily</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Export Format</label>
              <select
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                className="w-full border-2 border-gray-300 rounded-xl px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="pdf">PDF Report</option>
                <option value="excel">Excel Spreadsheet</option>
                <option value="csv">CSV Data</option>
                <option value="json">JSON Data</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={refreshData}
                disabled={refreshing}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                Apply Filters
              </Button>
            </div>
          </div>
        </Card>
        {/* Tab Content */}
        {activeTab === 'overview' && analytics && (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Card className="p-6 hover:shadow-xl transition-all duration-300 hover:scale-105">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Total Notifications</p>
                    <p className="text-2xl sm:text-3xl font-bold text-gray-900">
                      {analytics.summary.total_notifications.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Last {analytics.summary.time_period_days} days
                    </p>
                  </div>
                  <div className="p-3 bg-blue-100 rounded-2xl">
                    <Bell className="h-8 w-8 text-blue-600" />
                  </div>
                </div>
              </Card>

              <Card className="p-6 hover:shadow-xl transition-all duration-300 hover:scale-105">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Success Rate</p>
                    <p className="text-2xl sm:text-3xl font-bold text-green-600">
                      {analytics.summary.overall_success_rate.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {analytics.summary.successful_deliveries.toLocaleString()} delivered
                    </p>
                  </div>
                  <div className="p-3 bg-green-100 rounded-2xl">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                </div>
              </Card>

              <Card className="p-6 hover:shadow-xl transition-all duration-300 hover:scale-105">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Failed Deliveries</p>
                    <p className="text-2xl sm:text-3xl font-bold text-red-600">
                      {analytics.summary.failed_deliveries.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {((analytics.summary.failed_deliveries / analytics.summary.total_notifications) * 100).toFixed(1)}% failure rate
                    </p>
                  </div>
                  <div className="p-3 bg-red-100 rounded-2xl">
                    <XCircle className="h-8 w-8 text-red-600" />
                  </div>
                </div>
              </Card>

              <Card className="p-6 hover:shadow-xl transition-all duration-300 hover:scale-105">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Active Channels</p>
                    <p className="text-2xl sm:text-3xl font-bold text-purple-600">
                      {analytics.channel_breakdown.length}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Notification channels
                    </p>
                  </div>
                  <div className="p-3 bg-purple-100 rounded-2xl">
                    <TrendingUp className="h-8 w-8 text-purple-600" />
                  </div>
                </div>
              </Card>
            </div>

            {/* Channel Breakdown */}
            <Card className="mb-8 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 flex items-center">
                  <Bell className="w-5 h-5 mr-2" />
                  Channel Performance Overview
                </h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {analytics.channel_breakdown.map((channel, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-xl border-2 ${getChannelColor(channel.channel)}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center">
                          {getChannelIcon(channel.channel)}
                          <span className="ml-2 font-semibold capitalize">
                            {channel.channel}
                          </span>
                        </div>
                        <span className="text-sm font-medium">
                          {channel.success_rate.toFixed(1)}%
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Total Sent:</span>
                          <span className="font-medium">{channel.total_notifications.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Delivery Rate:</span>
                          <span className="font-medium">{channel.delivery_rate.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-current h-2 rounded-full transition-all duration-300"
                            style={{ width: `${channel.success_rate}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Top Performing Channels */}
            <Card className="overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Top Performing Channels
                </h3>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {analytics.top_performing_channels.map((channel, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <div className="flex items-center">
                        <div className={`p-2 rounded-lg ${getChannelColor(channel.channel)}`}>
                          {getChannelIcon(channel.channel)}
                        </div>
                        <div className="ml-4">
                          <h4 className="font-semibold text-gray-900 capitalize">{channel.channel}</h4>
                          <p className="text-sm text-gray-600">
                            {channel.total_notifications.toLocaleString()} notifications sent
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-green-600">
                          {channel.success_rate.toFixed(1)}%
                        </div>
                        <div className="text-sm text-gray-500">Success Rate</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </>
        )}

        {activeTab === 'delivery' && deliveryRates && (
          <Card className="overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 flex items-center">
                <TrendingUp className="w-5 h-5 mr-2" />
                Delivery Rates Over Time ({deliveryRates.group_by === 'hour' ? 'Hourly' : 'Daily'})
              </h3>
            </div>
            <div className="p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {deliveryRates.group_by === 'hour' ? 'Hour' : 'Date'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Notifications
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Success Rate
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Channels
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {deliveryRates.delivery_rates.map((rate, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {deliveryRates.group_by === 'hour' 
                            ? `${rate.hour}:00` 
                            : new Date(rate.date || '').toLocaleDateString()
                          }
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {rate.total_notifications.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            rate.overall_success_rate >= 90 
                              ? 'bg-green-100 text-green-800'
                              : rate.overall_success_rate >= 70
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {rate.overall_success_rate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(rate.channels).map(([channel, data]) => (
                              <span
                                key={channel}
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getChannelColor(channel)}`}
                              >
                                {getChannelIcon(channel)}
                                <span className="ml-1 capitalize">{channel}</span>
                                <span className="ml-1">({data.success_rate.toFixed(0)}%)</span>
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'engagement' && userEngagement && (
          <>
            {/* Engagement Statistics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Total Users</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {userEngagement.statistics.total_users.toLocaleString()}
                    </p>
                  </div>
                  <Users className="h-8 w-8 text-blue-600" />
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Avg Engagement</p>
                    <p className="text-2xl font-bold text-green-600">
                      {userEngagement.statistics.avg_engagement_score.toFixed(1)}%
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-600" />
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">High Engagement</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {userEngagement.statistics.high_engagement_users}
                    </p>
                    <p className="text-xs text-gray-500">Users ≥80%</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-purple-600" />
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 mb-1">Popular Channel</p>
                    <p className="text-lg font-bold text-orange-600 capitalize">
                      {userEngagement.statistics.most_popular_channel || 'N/A'}
                    </p>
                  </div>
                  {userEngagement.statistics.most_popular_channel && 
                    getChannelIcon(userEngagement.statistics.most_popular_channel)
                  }
                </div>
              </Card>
            </div>

            {/* Channel Distribution */}
            <Card className="mb-8 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900">Channel Preference Distribution</h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(userEngagement.statistics.channel_distribution).map(([channel, count]) => (
                    <div key={channel} className={`p-4 rounded-xl border-2 ${getChannelColor(channel)}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          {getChannelIcon(channel)}
                          <span className="ml-2 font-semibold capitalize">{channel}</span>
                        </div>
                        <span className="text-2xl font-bold">{count}</span>
                      </div>
                      <div className="mt-2 text-sm">
                        {((count / userEngagement.statistics.total_users) * 100).toFixed(1)}% of users
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* User Engagement Details */}
            <Card className="overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900">User Engagement Details</h3>
              </div>
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Engagement Score
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Preferred Channel
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Notifications Received
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Notifications Opened
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {userEngagement.user_engagement.slice(0, 20).map((user, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {user.user_id.substring(0, 8)}...
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              user.engagement_score >= 80 
                                ? 'bg-green-100 text-green-800'
                                : user.engagement_score >= 50
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {user.engagement_score.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="flex items-center">
                              {getChannelIcon(user.preferred_channel)}
                              <span className="ml-2 capitalize">{user.preferred_channel}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {user.total_notifications_received}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {user.total_notifications_opened}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </>
        )}

        {activeTab === 'timing' && optimalTimes && (
          <>
            {/* Recommendations */}
            <Card className="mb-8 overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 flex items-center">
                  <Clock className="w-5 h-5 mr-2" />
                  Optimal Delivery Time Recommendations
                </h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {optimalTimes.recommendations.map((rec, index) => (
                    <div key={index} className={`p-6 rounded-xl border-2 ${getChannelColor(rec.channel)}`}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center">
                          {getChannelIcon(rec.channel)}
                          <h4 className="ml-2 text-lg font-semibold capitalize">{rec.channel}</h4>
                        </div>
                        <span className="text-2xl font-bold">{rec.optimal_hour}:00</span>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm">Success Rate:</span>
                          <span className="font-medium">{rec.success_rate.toFixed(1)}%</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-3">{rec.recommendation}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Detailed Time Analysis */}
            <Card className="overflow-hidden">
              <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
                <h3 className="text-xl font-bold text-gray-900">Detailed Time Analysis</h3>
              </div>
              <div className="p-6">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Hour
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Channel
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Success Rate
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Notifications
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {optimalTimes.detailed_analysis
                        .sort((a, b) => b.success_rate - a.success_rate)
                        .slice(0, 20)
                        .map((analysis, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {analysis.hour}:00
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <div className="flex items-center">
                              {getChannelIcon(analysis.channel)}
                              <span className="ml-2 capitalize">{analysis.channel}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              analysis.success_rate >= 90 
                                ? 'bg-green-100 text-green-800'
                                : analysis.success_rate >= 70
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {analysis.success_rate.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {analysis.total_notifications.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </>
        )}

        {activeTab === 'channels' && channelPerformance && (
          <Card className="overflow-hidden">
            <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900 flex items-center">
                <Bell className="w-5 h-5 mr-2" />
                Channel Performance Comparison
              </h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {channelPerformance.channel_performance.map((channel, index) => (
                  <div key={index} className={`p-6 rounded-xl border-2 ${getChannelColor(channel.channel)}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        {getChannelIcon(channel.channel)}
                        <h4 className="ml-2 text-xl font-bold capitalize">{channel.channel}</h4>
                      </div>
                      <span className="text-2xl font-bold">
                        {channel.avg_success_rate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm">Total Notifications:</span>
                        <span className="font-medium">{channel.total_notifications.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Delivery Rate:</span>
                        <span className="font-medium">{channel.avg_delivery_rate.toFixed(1)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Avg Delivery Time:</span>
                        <span className="font-medium">{channel.avg_delivery_time_seconds.toFixed(1)}s</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-current h-3 rounded-full transition-all duration-300"
                          style={{ width: `${channel.avg_success_rate}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Performance Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Channel
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Notifications
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Success Rate
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Delivery Rate
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Avg Delivery Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {channelPerformance.channel_performance
                      .sort((a, b) => b.avg_success_rate - a.avg_success_rate)
                      .map((channel, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex items-center">
                            {getChannelIcon(channel.channel)}
                            <span className="ml-2 font-medium capitalize">{channel.channel}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {channel.total_notifications.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            channel.avg_success_rate >= 90 
                              ? 'bg-green-100 text-green-800'
                              : channel.avg_success_rate >= 70
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {channel.avg_success_rate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {channel.avg_delivery_rate.toFixed(1)}%
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {channel.avg_delivery_time_seconds.toFixed(1)}s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  )
}