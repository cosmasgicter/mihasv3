/**
 * RealtimeMetricsDisplay Component
 * Displays real-time admin metrics with animated counters and visual indicators
 * Uses CSS transitions instead of framer-motion for performance.
 * 
 * @requirements 1.2 - CSS transitions instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior
 * @requirements 6.2, 6.4 - Real-time metrics display with animated counters
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown,
  Users, 
  Clock, 
  CheckCircle, 
  FileText,
  Calendar,
  Zap,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Wifi,
  WifiOff,
  Bell,
  Sparkles
} from 'lucide-react';
import { AnimatedCounter } from '@/components/smoothui/animated-counter';
import { StatusIndicator, StatusBadge } from '@/components/8starlabs/status-indicator';
import { cn } from '@/lib/utils';
import { staggerChild } from '@/lib/animations';

interface MetricData {
  value: number;
  previousValue?: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'blue' | 'yellow' | 'green' | 'purple' | 'orange';
  suffix?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  description?: string;
}

interface RealtimeMetricsDisplayProps {
  todayApplications: number;
  pendingApplications: number;
  approvedApplications: number;
  rejectedApplications: number;
  totalApplications: number;
  avgProcessingTime: number;
  activeUsers: number;
  isConnected: boolean;
  lastUpdated?: Date | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
  compact?: boolean;
  showSystemHealth?: boolean;
  systemHealth?: {
    database: 'healthy' | 'degraded' | 'down';
    api: 'healthy' | 'degraded' | 'down';
    storage: 'healthy' | 'degraded' | 'down';
    auth: 'healthy' | 'degraded' | 'down';
  };
}

const colorConfig = {
  blue: {
    bg: 'bg-primary/10',
    gradient: 'from-blue-500/10 to-blue-600/20',
    icon: 'text-primary',
    pulse: 'bg-primary',
  },
  yellow: {
    bg: 'bg-warning/10',
    gradient: 'from-yellow-500/10 to-orange-600/20',
    icon: 'text-warning',
    pulse: 'bg-warning',
  },
  green: {
    bg: 'bg-success/10',
    gradient: 'from-green-500/10 to-green-600/20',
    icon: 'text-success',
    pulse: 'bg-success',
  },
  purple: {
    bg: 'bg-secondary/10',
    gradient: 'from-purple-500/10 to-purple-600/20',
    icon: 'text-secondary',
    pulse: 'bg-secondary',
  },
  orange: {
    bg: 'bg-accent/10',
    gradient: 'from-orange-500/10 to-orange-600/20',
    icon: 'text-accent',
    pulse: 'bg-accent',
  },
};


// Change indicator component for showing value changes
function ChangeIndicator({ 
  change, 
  showAnimation = true 
}: { 
  change: number; 
  showAnimation?: boolean;
}) {
  if (change === 0) return null;
  
  const isPositive = change > 0;
  const Icon = isPositive ? ArrowUp : ArrowDown;
  
  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full',
        'transition-all duration-300 ease-out motion-reduce:transition-none',
        showAnimation && 'animate-fade-in',
        isPositive ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'
      )}
    >
      <Icon className="h-3 w-3" />
      <span>{Math.abs(change)}</span>
    </div>
  );
}

// Flash animation for data updates
function DataUpdateFlash({ 
  show, 
  children 
}: { 
  show: boolean; 
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl transition-shadow duration-600 motion-reduce:transition-none',
        show && 'shadow-[0_0_0_4px_rgba(59,130,246,0.3)]'
      )}
    >
      {children}
    </div>
  );
}

// Pulse animation for live data indicator
function LivePulse({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        {isConnected && (
          <span
            className="absolute inset-0 rounded-full bg-success animate-ping opacity-75 motion-reduce:animate-none"
          />
        )}
        <span
          className={cn(
            'relative block h-2 w-2 rounded-full',
            isConnected ? 'bg-success' : 'bg-muted-foreground'
          )}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {isConnected ? 'Live' : 'Offline'}
      </span>
    </div>
  );
}

// Single metric card with animated counter
function MetricCard({
  metric,
  previousValue,
  delay = 0,
  compact = false,
}: {
  metric: MetricData;
  previousValue?: number;
  delay?: number;
  compact?: boolean;
}) {
  const colors = colorConfig[metric.color];
  const Icon = metric.icon;
  const change = previousValue !== undefined ? metric.value - previousValue : 0;
  const [showFlash, setShowFlash] = useState(false);
  const prevValueRef = useRef(metric.value);
  
  // Trigger flash animation when value changes
  useEffect(() => {
    if (prevValueRef.current !== metric.value) {
      setShowFlash(true);
      const timer = setTimeout(() => setShowFlash(false), 600);
      prevValueRef.current = metric.value;
      return () => clearTimeout(timer);
    }
  }, [metric.value]);
  
  return (
    <DataUpdateFlash show={showFlash}>
      <div
        className={cn(
          "bg-card rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02]",
          "transition-all duration-300 border border-border relative overflow-hidden",
          "motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100",
          "animate-fade-in opacity-0",
          compact ? "p-4" : "p-6"
        )}
        style={staggerChild(delay * 10)}
      >
        {/* Background gradient */}
        <div className={cn('absolute top-0 right-0 w-20 h-20 bg-gradient-to-br rounded-bl-full', colors.gradient)} />
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className={cn('rounded-xl', colors.bg, compact ? 'p-2' : 'p-3')}>
              <Icon className={cn(colors.icon, compact ? 'h-5 w-5' : 'h-6 w-6')} />
            </div>
            <div className="text-right">
              <div className={cn("font-bold text-foreground", compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl")}>
                <AnimatedCounter
                  value={metric.value}
                  suffix={metric.suffix}
                  duration={1.5}
                  delay={delay}
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {metric.label}
                </span>
                {change !== 0 && <ChangeIndicator change={change} />}
              </div>
            </div>
          </div>
          
          {/* Description */}
          {metric.description && !compact && (
            <div className="text-sm font-medium text-foreground mb-2">
              {metric.description}
            </div>
          )}
          
          {/* Trend indicator */}
          {metric.trend && (
            <div className="flex items-center mt-2 text-xs">
              {metric.trend === 'up' && (
                <>
                  <TrendingUp className="h-3 w-3 text-success mr-1" />
                  <span className="text-success">
                    {metric.trendValue ? `+${metric.trendValue}%` : 'Increasing'}
                  </span>
                </>
              )}
              {metric.trend === 'down' && (
                <>
                  <TrendingDown className="h-3 w-3 text-destructive mr-1" />
                  <span className="text-destructive">
                    {metric.trendValue ? `-${metric.trendValue}%` : 'Decreasing'}
                  </span>
                </>
              )}
              {metric.trend === 'stable' && (
                <>
                  <Activity className="h-3 w-3 text-muted-foreground mr-1" />
                  <span className="text-muted-foreground">Stable</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </DataUpdateFlash>
  );
}


export function RealtimeMetricsDisplay({
  todayApplications,
  pendingApplications,
  approvedApplications,
  rejectedApplications,
  totalApplications,
  avgProcessingTime,
  activeUsers,
  isConnected,
  lastUpdated,
  onRefresh,
  isRefreshing = false,
  className,
  compact = false,
  showSystemHealth = false,
  systemHealth,
}: RealtimeMetricsDisplayProps) {
  // Track previous values for change indicators
  const [previousValues, setPreviousValues] = useState<Record<string, number>>({});
  const [showChangeIndicators, setShowChangeIndicators] = useState(false);
  const [recentUpdates, setRecentUpdates] = useState<string[]>([]);
  
  // Update previous values when metrics change
  useEffect(() => {
    const currentValues = {
      todayApplications,
      pendingApplications,
      approvedApplications,
      rejectedApplications,
      totalApplications,
      avgProcessingTime,
      activeUsers,
    };
    
    // Only show change indicators after initial load
    if (Object.keys(previousValues).length > 0) {
      setShowChangeIndicators(true);
      
      // Track which metrics changed
      const changedMetrics: string[] = [];
      Object.entries(currentValues).forEach(([key, value]) => {
        if (previousValues[key] !== value) {
          changedMetrics.push(key);
        }
      });
      
      if (changedMetrics.length > 0) {
        setRecentUpdates(changedMetrics);
        const timer = setTimeout(() => setRecentUpdates([]), 3000);
        return () => clearTimeout(timer);
      }
      
      const timer = setTimeout(() => setShowChangeIndicators(false), 5000);
      return () => clearTimeout(timer);
    }
    
    setPreviousValues(currentValues);
  }, [todayApplications, pendingApplications, approvedApplications, rejectedApplications, totalApplications, avgProcessingTime, activeUsers]);
  
  // Calculate approval rate
  const totalDecided = approvedApplications + rejectedApplications;
  const approvalRate = totalDecided > 0 
    ? Math.round((approvedApplications / totalDecided) * 100) 
    : 0;
  
  const metrics: MetricData[] = [
    {
      value: todayApplications,
      previousValue: showChangeIndicators ? previousValues.todayApplications : undefined,
      label: 'Today',
      description: 'New Applications',
      icon: Calendar,
      color: 'blue',
      trend: todayApplications > 0 ? 'up' : 'stable',
    },
    {
      value: pendingApplications,
      previousValue: showChangeIndicators ? previousValues.pendingApplications : undefined,
      label: 'Pending',
      description: 'Awaiting Review',
      icon: Clock,
      color: 'yellow',
      trend: pendingApplications > 5 ? 'up' : 'stable',
    },
    {
      value: avgProcessingTime,
      previousValue: showChangeIndicators ? previousValues.avgProcessingTime : undefined,
      label: 'Days',
      description: 'Avg Processing',
      icon: Zap,
      color: 'purple',
      trend: 'down',
      trendValue: 15,
    },
    {
      value: approvalRate,
      label: 'Rate',
      description: 'Approval Rate',
      icon: CheckCircle,
      color: 'green',
      suffix: '%',
      trend: 'stable',
    },
  ];
  
  // Map system health status to StatusIndicator status
  const mapHealthStatus = (status: 'healthy' | 'degraded' | 'down'): 'operational' | 'degraded' | 'down' => {
    switch (status) {
      case 'healthy': return 'operational';
      case 'degraded': return 'degraded';
      case 'down': return 'down';
      default: return 'operational';
    }
  };
  
  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with connection status */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Real-time Metrics
          </h2>
          <LivePulse isConnected={isConnected} />
          
          {/* Recent update indicator */}
          {recentUpdates.length > 0 && (
            <div
              className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-1 rounded-full animate-fade-in"
            >
              <Sparkles className="h-3 w-3" />
              <span>Data updated</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className={cn(
                'p-2 rounded-lg hover:bg-muted transition-colors',
                isRefreshing && 'opacity-50 cursor-not-allowed'
              )}
              aria-label="Refresh metrics"
            >
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
            </button>
          )}
        </div>
      </div>
      
      {/* Connection status banner */}
      {!isConnected && (
        <div
          className="bg-warning/10 border border-warning/30 rounded-lg p-3 flex items-center gap-3 animate-fade-in"
        >
          <WifiOff className="h-4 w-4 text-warning" />
          <span className="text-sm text-warning-foreground">
            Real-time connection lost. Data may be outdated. Polling for updates...
          </span>
        </div>
      )}
      
      {/* Metrics grid */}
      <div className={cn(
        "grid gap-4",
        compact ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
      )}>
        {metrics.map((metric, index) => (
          <MetricCard
            key={metric.label}
            metric={metric}
            previousValue={metric.previousValue}
            delay={index * 0.1}
            compact={compact}
          />
        ))}
      </div>
      
      {/* Summary stats row */}
      <div
        className="bg-card rounded-xl border border-border p-4 animate-slide-up opacity-0"
        style={staggerChild(5)}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-foreground">
              <AnimatedCounter value={totalApplications} duration={1.5} />
            </div>
            <div className="text-xs text-muted-foreground">Total Applications</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-success">
              <AnimatedCounter value={approvedApplications} duration={1.5} />
            </div>
            <div className="text-xs text-muted-foreground">Approved</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-destructive">
              <AnimatedCounter value={rejectedApplications} duration={1.5} />
            </div>
            <div className="text-xs text-muted-foreground">Rejected</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-primary">
              <AnimatedCounter value={activeUsers} duration={1.5} />
            </div>
            <div className="text-xs text-muted-foreground">Active Users</div>
          </div>
        </div>
      </div>
      
      {/* System Health Section */}
      {showSystemHealth && systemHealth && (
        <div
          className="bg-card rounded-xl border border-border p-4 animate-slide-up opacity-0"
          style={staggerChild(6)}
        >
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4" />
            System Health
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
              <StatusIndicator 
                status={mapHealthStatus(systemHealth.database)} 
                size="sm"
              />
              <span className="text-sm text-foreground">Database</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
              <StatusIndicator 
                status={mapHealthStatus(systemHealth.api)} 
                size="sm"
              />
              <span className="text-sm text-foreground">API</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
              <StatusIndicator 
                status={mapHealthStatus(systemHealth.storage)} 
                size="sm"
              />
              <span className="text-sm text-foreground">Storage</span>
            </div>
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
              <StatusIndicator 
                status={mapHealthStatus(systemHealth.auth)} 
                size="sm"
              />
              <span className="text-sm text-foreground">Auth</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RealtimeMetricsDisplay;