// Dashboard Types for Real-time Analytics Display

export interface DashboardKPI {
  id: string
  title: string
  value: number | string
  previousValue?: number | string
  change?: number
  changeType?: 'increase' | 'decrease' | 'neutral'
  format?: 'number' | 'percentage' | 'currency' | 'duration'
  icon?: string
  color?: 'primary' | 'success' | 'warning' | 'error' | 'info'
}

export interface DashboardChart {
  id: string
  title: string
  type: 'line' | 'bar' | 'pie' | 'area' | 'donut'
  data: ChartDataPoint[]
  xAxisLabel?: string
  yAxisLabel?: string
  showLegend?: boolean
  height?: number
}

export interface ChartDataPoint {
  x: string | number
  y: number
  label?: string
  color?: string
}

export interface DashboardWidget {
  id: string
  title: string
  type: 'kpi' | 'chart' | 'table' | 'metric' | 'alert'
  size: 'small' | 'medium' | 'large' | 'full'
  position: { row: number; col: number }
  data: DashboardKPI | DashboardChart | DashboardTable | DashboardAlert
  refreshInterval?: number // in seconds
  lastUpdated?: string
}

export interface DashboardTable {
  id: string
  title: string
  headers: string[]
  rows: (string | number)[][]
  sortable?: boolean
  pagination?: boolean
  maxRows?: number
}

export interface DashboardAlert {
  id: string
  title: string
  message: string
  severity: 'info' | 'warning' | 'error' | 'success'
  timestamp: string
  actionable?: boolean
  actionUrl?: string
}

export interface DashboardLayout {
  id: string
  name: string
  description?: string
  widgets: DashboardWidget[]
  refreshInterval: number // in seconds
  autoRefresh: boolean
  createdAt: string
  updatedAt: string
}

export interface DashboardConfig {
  layout: DashboardLayout
  theme: 'light' | 'dark' | 'auto'
  timezone: string
  dateFormat: string
  numberFormat: string
  enableNotifications: boolean
  enableAutoRefresh: boolean
}

export interface ExecutiveSummaryReport {
  id: string
  title: string
  generatedAt: string
  timeRange: {
    startDate: string
    endDate: string
    label: string
  }
  summary: {
    totalApplications: number
    completionRate: number
    approvalRate: number
    averageProcessingTime: number
    systemHealth: 'excellent' | 'good' | 'fair' | 'poor'
  }
  keyMetrics: DashboardKPI[]
  trends: {
    applications: 'up' | 'down' | 'stable'
    approvals: 'up' | 'down' | 'stable'
    processingTime: 'up' | 'down' | 'stable'
  }
  recommendations: string[]
  alerts: DashboardAlert[]
}

export interface DashboardDataSource {
  id: string
  name: string
  endpoint: string
  refreshInterval: number
  lastFetch?: string
  status: 'active' | 'error' | 'loading'
  errorMessage?: string
}