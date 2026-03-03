import { staggerChild, animateClasses } from '@/lib/animations'
import {
 TrendingUp,
 TrendingDown,
 BarChart3,
 PieChart,
 Calendar,
 Users,
 CheckCircle,
 XCircle,
 Clock
} from 'lucide-react'

// Traffic overview — analytics removed in migration. Static empty shape.
const useTrafficOverview = () => ({
  activeUsers: 0,
  dailyCounts: [] as { date: string; count: number; label: string }[],
  isLoading: false,
  isError: false,
})

interface AnalyticsData {
 applications: {
 total: number
 approved: number
 rejected: number
 pending: number
 thisWeek: number
 lastWeek: number
 }
 trends: {
 approvalRate: number
 processingTime: number
 weeklyGrowth: number
 }
}

interface AnalyticsChartsProps {
 data: AnalyticsData
}

export function AnalyticsCharts({ data }: AnalyticsChartsProps) {
 const {
 activeUsers,
 dailyCounts,
 isLoading: isAnalyticsLoading,
 isError: isAnalyticsError
 } = useTrafficOverview()

 const approvalRate = data.applications.total > 0
 ? Math.round((data.applications.approved / (data.applications.approved + data.applications.rejected)) * 100)
 : 0

 const weeklyGrowth = data.applications.lastWeek > 0
 ? Math.round(((data.applications.thisWeek - data.applications.lastWeek) / data.applications.lastWeek) * 100)
 : 0

 const maxDailyCount = dailyCounts.reduce((max, day) => Math.max(max, day.count), 0)
 const fallbackMessage = isAnalyticsError ? 'Analytics data is currently unavailable.' : 'Loading analytics data...'
 const activeUsersDisplay = isAnalyticsError ? '—' : isAnalyticsLoading ? '...' : activeUsers.toLocaleString()
 const activeUsersStatus = isAnalyticsError
 ? 'Analytics unavailable'
 : isAnalyticsLoading
 ? 'Fetching latest data'
 : 'Online now'
 const activeUsersStatusClass = isAnalyticsError ? 'text-error' : 'text-secondary'

 const chartData = [
 { label: 'Approved', value: data.applications.approved, color: 'bg-success', percentage: Math.round((data.applications.approved / data.applications.total) * 100) },
 { label: 'Rejected', value: data.applications.rejected, color: 'bg-error', percentage: Math.round((data.applications.rejected / data.applications.total) * 100) },
 { label: 'Pending', value: data.applications.pending, color: 'bg-warning', percentage: Math.round((data.applications.pending / data.applications.total) * 100) }
 ]

 return (
 <div className="space-y-6">
 {/* Key Metrics */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 <div
 className={`${animateClasses.slideUp} opacity-0 bg-card rounded-xl p-6 shadow-lg border border-border`}
 style={staggerChild(0)}
 >
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm font-medium text-foreground">Approval Rate</p>
 <p className="text-2xl font-bold text-warning-strong">{approvalRate}%</p>
 <div className="flex items-center mt-2 text-xs">
 {approvalRate >= 70 ? (
 <TrendingUp className="h-3 w-3 text-success mr-1" />
 ) : (
 <TrendingDown className="h-3 w-3 text-error mr-1" />
 )}
 <span className={approvalRate >= 70 ? 'text-success' : 'text-error'}>
 {approvalRate >= 70 ? 'Good' : 'Needs attention'}
 </span>
 </div>
 </div>
 <CheckCircle className="h-8 w-8 text-success" />
 </div>
 </div>

 <div
 className={`${animateClasses.slideUp} opacity-0 bg-card rounded-xl p-6 shadow-lg border border-border`}
 style={staggerChild(1)}
 >
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm font-medium text-foreground">Weekly Growth</p>
 <p className="text-2xl font-bold text-info-strong">{weeklyGrowth}%</p>
 <div className="flex items-center mt-2 text-xs">
 {weeklyGrowth >= 0 ? (
 <TrendingUp className="h-3 w-3 text-success mr-1" />
 ) : (
 <TrendingDown className="h-3 w-3 text-error mr-1" />
 )}
 <span className={weeklyGrowth >= 0 ? 'text-success' : 'text-error'}>
 vs last week
 </span>
 </div>
 </div>
 <BarChart3 className="h-8 w-8 text-primary" />
 </div>
 </div>

 <div
 className={`${animateClasses.slideUp} opacity-0 bg-card rounded-xl p-6 shadow-lg border border-border`}
 style={staggerChild(2)}
 >
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm font-medium text-foreground">Processing Time</p>
 <p className="text-2xl font-bold text-foreground">3.2 days</p>
 <div className="flex items-center mt-2 text-xs">
 <TrendingDown className="h-3 w-3 text-success mr-1" />
 <span className="text-warning-strong">15% faster</span>
 </div>
 </div>
 <Clock className="h-8 w-8 text-purple-500" />
 </div>
 </div>

 <div
 className={`${animateClasses.slideUp} opacity-0 bg-card rounded-xl p-6 shadow-lg border border-border`}
 style={staggerChild(3)}
 >
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm font-medium text-foreground">Active Users</p>
 <p className="text-2xl font-bold text-foreground">{activeUsersDisplay}</p>
 <div className="flex items-center mt-2 text-xs">
 <Users className={`h-3 w-3 mr-1 ${isAnalyticsError ? 'text-error' : 'text-indigo-500'}`} />
 <span className={activeUsersStatusClass}>{activeUsersStatus}</span>
 </div>
 </div>
 <Users className="h-8 w-8 text-indigo-500" />
 </div>
 </div>
 </div>

 {/* Application Status Distribution */}
 <div
 className={`${animateClasses.slideUp} opacity-0 bg-card rounded-xl shadow-lg border border-border`}
 style={staggerChild(4)}
 >
 <div className="px-6 py-4 border-b border-border">
 <h3 className="text-lg font-bold text-foreground flex items-center">
 <PieChart className="h-5 w-5 mr-2" />
 Application Status Distribution
 </h3>
 </div>
 
 <div className="p-6">
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 {/* Chart Visualization */}
 <div className="space-y-4">
 {chartData.map((item, index) => (
 <div 
 key={item.label}
 className={`${animateClasses.fadeIn} opacity-0 flex items-center space-x-4`}
 style={staggerChild(index)}
 >
 <div className="flex items-center space-x-3 flex-1">
 <div className={`w-4 h-4 rounded-full ${item.color}`}></div>
 <span className="text-sm font-medium text-foreground">{item.label}</span>
 </div>
 <div className="flex items-center space-x-3">
 <div className="w-32 bg-skeleton rounded-full h-2">
 <div 
 className={`h-2 rounded-full ${item.color} transition-all duration-700 ease-out`}
 style={{ width: `${item.percentage}%` }}
 ></div>
 </div>
 <span className="text-sm font-bold text-foreground w-12 text-right">{item.value}</span>
 </div>
 </div>
 ))}
 </div>

 {/* Summary Stats */}
 <div className="space-y-4">
 <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-4">
 <h4 className="font-semibold text-foreground mb-3">Summary</h4>
 <div className="space-y-2">
 <div className="flex justify-between">
 <span className="text-sm text-foreground">Total Applications</span>
 <span className="font-semibold">{data.applications.total}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-sm text-foreground">Success Rate</span>
 <span className="font-semibold text-warning-strong">{approvalRate}%</span>
 </div>
 <div className="flex justify-between">
 <span className="text-sm text-foreground">Pending Review</span>
 <span className="font-semibold text-warning-strong">{data.applications.pending}</span>
 </div>
 </div>
 </div>

 <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4">
 <h4 className="font-semibold text-foreground mb-3">Performance</h4>
 <div className="space-y-2">
 <div className="flex justify-between">
 <span className="text-sm text-foreground">This Week</span>
 <span className="font-semibold">{data.applications.thisWeek}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-sm text-foreground">Last Week</span>
 <span className="font-semibold">{data.applications.lastWeek}</span>
 </div>
 <div className="flex justify-between">
 <span className="text-sm text-foreground">Growth</span>
 <span className={`font-semibold ${weeklyGrowth >= 0 ? 'text-success' : 'text-error'}`}>
 {weeklyGrowth >= 0 ? '+' : ''}{weeklyGrowth}%
 </span>
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* Weekly Trend */}
 <div
 className={`${animateClasses.slideUp} opacity-0 bg-card rounded-xl shadow-lg border border-border`}
 style={staggerChild(6)}
 >
 <div className="px-6 py-4 border-b border-border">
 <h3 className="text-lg font-bold text-foreground flex items-center">
 <Calendar className="h-5 w-5 mr-2" />
 Weekly Application Trend
 </h3>
 </div>
 
 <div className="p-6">
 {isAnalyticsLoading ? (
 <div className="grid grid-cols-7 gap-2 mb-4">
 {Array.from({ length: 7 }).map((_, index) => (
 <div key={index} className="text-center">
 <div className="text-xs text-foreground mb-2">---</div>
 <div className="h-16 w-full rounded-lg bg-skeleton animate-pulse mx-auto"></div>
 <div className="text-xs font-semibold text-foreground mt-2">--</div>
 </div>
 ))}
 </div>
 ) : isAnalyticsError || dailyCounts.length === 0 ? (
 <div className="flex flex-col items-center justify-center py-10 text-sm text-foreground">
 <XCircle className="h-6 w-6 text-red-400 mb-2" />
 <p>{fallbackMessage}</p>
 </div>
 ) : (
 <>
 <div className="grid grid-cols-7 gap-2 mb-4">
 {dailyCounts.map((day, index) => {
 const height = maxDailyCount > 0 ? Math.max(12, Math.round((day.count / maxDailyCount) * 80)) : 12

 return (
 <div key={day.date} className="text-center">
 <div className="text-xs text-foreground mb-2">{day.label}</div>
 <div
 className="bg-gradient-to-t from-blue-600 to-purple-600 rounded-lg mx-auto transition-all duration-500 ease-out"
 style={{ width: '100%', height: `${height}px` }}
 ></div>
 <div className="text-xs font-semibold text-foreground mt-2">
 {day.count.toLocaleString()}
 </div>
 </div>
 )
 })}
 </div>

 <div className="text-center text-sm text-foreground">
 Page views for the last 7 days
 </div>
 </>
 )}
 </div>
 </div>
 </div>
 )
}
