// @ts-nocheck
import React, { useState, useEffect } from 'react'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts'
import { 
  Bell, 
  TrendingUp, 
  Users, 
  MousePointer, 
  X,
  AlertTriangle,
  CheckCircle
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { notificationTracker, DeliveryMetrics } from '@/services/notificationTracker'
import { useAuth } from '@/hooks/useAuth'

interface NotificationAnalyticsProps {
  className?: string
  showUserMetrics?: boolean
  days?: number
}

/**
 * Notification Analytics Dashboard
 * Requirements: 9.4 - Add notification scheduling and delivery tracking
 * Requirements: 1.2 - CSS transitions instead of framer-motion
 */
export const NotificationAnalytics: React.FC<NotificationAnalyticsProps> = ({
  className = '',
  showUserMetrics = true,
  days = 30
}) => {
  const { user } = useAuth()
  const [metrics, setMetrics] = useState<DeliveryMetrics | null>(null)
  const [systemMetrics, setSystemMetrics] = useState<DeliveryMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadMetrics = () => {
      try {
        setLoading(true)

        if (showUserMetrics && user?.id) {
          const userMetrics = notificationTracker.getUserMetrics(user.id, days)
          setMetrics(userMetrics)
        }

        const sysMetrics = notificationTracker.getSystemMetrics(days)
        setSystemMetrics(sysMetrics)
      } catch (error) {
        console.error('Failed to load notification metrics:', error)
      } finally {
        setLoading(false)
      }
    }

    loadMetrics()

    // Listen for metric updates
    const unsubscribe = notificationTracker.addListener(() => {
      loadMetrics()
    })

    return unsubscribe
  }, [user?.id, showUserMetrics, days])

  const formatPercentage = (value: number) => `${value.toFixed(1)}%`

  const getStatusColor = (rate: number) => {
    if (rate >= 90) return 'text-success'
    if (rate >= 70) return 'text-warning'
    return 'text-destructive'
  }

  const pieData = systemMetrics ? [
    { name: 'Delivered', value: systemMetrics.totalDelivered, color: '#10b981' },
    { name: 'Clicked', value: systemMetrics.totalClicked, color: '#3b82f6' },
    { name: 'Dismissed', value: systemMetrics.totalDismissed, color: '#f59e0b' },
    { name: 'Failed', value: systemMetrics.totalFailed, color: '#ef4444' }
  ] : []

  const barData = [
    {
      name: 'User',
      delivered: metrics?.deliveryRate || 0,
      clicked: metrics?.clickRate || 0,
      dismissed: metrics?.dismissalRate || 0,
      failed: metrics?.failureRate || 0
    },
    {
      name: 'System',
      delivered: systemMetrics?.deliveryRate || 0,
      clicked: systemMetrics?.clickRate || 0,
      dismissed: systemMetrics?.dismissalRate || 0,
      failed: systemMetrics?.failureRate || 0
    }
  ]

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {showUserMetrics && metrics && (
          <>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Your Notifications</p>
                    <p className="text-2xl font-bold">{metrics.totalSent}</p>
                  </div>
                  <Bell className="h-8 w-8 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Last {days} days
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Delivery Rate</p>
                    <p className={`text-2xl font-bold ${getStatusColor(metrics.deliveryRate)}`}>
                      {formatPercentage(metrics.deliveryRate)}
                    </p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-success" />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {metrics.totalDelivered} of {metrics.totalSent} delivered
                </p>
              </CardContent>
            </Card>
          </>
        )}

        {systemMetrics && (
          <>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">System Total</p>
                    <p className="text-2xl font-bold">{systemMetrics.totalSent}</p>
                  </div>
                  <Users className="h-8 w-8 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  All users, last {days} days
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Click Rate</p>
                    <p className={`text-2xl font-bold ${getStatusColor(systemMetrics.clickRate)}`}>
                      {formatPercentage(systemMetrics.clickRate)}
                    </p>
                  </div>
                  <MousePointer className="h-8 w-8 text-primary" />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {systemMetrics.totalClicked} clicks
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Delivery Status Distribution */}
        {systemMetrics && systemMetrics.totalSent > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Notification Status Distribution</CardTitle>
              <CardDescription>
                Breakdown of notification delivery outcomes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Performance Comparison */}
        {showUserMetrics && metrics && systemMetrics && (
          <Card>
            <CardHeader>
              <CardTitle>Performance Comparison</CardTitle>
              <CardDescription>
                Your metrics vs system average
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                  <Bar dataKey="delivered" fill="#10b981" name="Delivery Rate" />
                  <Bar dataKey="clicked" fill="#3b82f6" name="Click Rate" />
                  <Bar dataKey="failed" fill="#ef4444" name="Failure Rate" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Detailed Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {showUserMetrics && metrics && (
          <Card>
            <CardHeader>
              <CardTitle>Your Notification Metrics</CardTitle>
              <CardDescription>
                Personal notification performance over the last {days} days
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total Sent</span>
                <span className="text-sm">{metrics.totalSent}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Delivered</span>
                <span className="text-sm">{metrics.totalDelivered} ({formatPercentage(metrics.deliveryRate)})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Clicked</span>
                <span className="text-sm">{metrics.totalClicked} ({formatPercentage(metrics.clickRate)})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Dismissed</span>
                <span className="text-sm">{metrics.totalDismissed} ({formatPercentage(metrics.dismissalRate)})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Failed</span>
                <span className="text-sm">{metrics.totalFailed} ({formatPercentage(metrics.failureRate)})</span>
              </div>
            </CardContent>
          </Card>
        )}

        {systemMetrics && (
          <Card>
            <CardHeader>
              <CardTitle>System Metrics</CardTitle>
              <CardDescription>
                Overall system notification performance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total Sent</span>
                <span className="text-sm">{systemMetrics.totalSent}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Delivered</span>
                <span className="text-sm">{systemMetrics.totalDelivered} ({formatPercentage(systemMetrics.deliveryRate)})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Clicked</span>
                <span className="text-sm">{systemMetrics.totalClicked} ({formatPercentage(systemMetrics.clickRate)})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Dismissed</span>
                <span className="text-sm">{systemMetrics.totalDismissed} ({formatPercentage(systemMetrics.dismissalRate)})</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Failed</span>
                <span className="text-sm">{systemMetrics.totalFailed} ({formatPercentage(systemMetrics.failureRate)})</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

export default NotificationAnalytics
