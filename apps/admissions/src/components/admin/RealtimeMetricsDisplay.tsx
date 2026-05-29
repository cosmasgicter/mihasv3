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
import { cn } from '@/lib/utils';
import { staggerChild } from '@/lib/animations';

interface MetricData {
  value: number;
  previousValue?: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * Semantic tone name (not raw palette). 2026-05-26 audit fix:
   * the public component API previously leaked raw palette names
   * (`'blue' | 'yellow' | 'green' | 'secondary' | 'orange'`) into
   * consumer code. Now mirrors the canonical token vocabulary.
   */
  tone: 'info' | 'warning' | 'success' | 'accent' | 'primary';
  suffix?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  description?: string;
}

interface RealtimeMetricsDisplayProps {
  todayApplications: number;
  pendingApplications: number;
  approvedApplications: number;
  acceptedApplications: number;
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
}

const toneConfig: Record<MetricData['tone'], { bg: string; icon: string; pulse: string }> = {
  info: {
    bg: 'bg-info/10',
    icon: 'text-info',
    pulse: 'bg-info',
  },
  warning: {
    bg: 'bg-warning/10',
    icon: 'text-warning',
    pulse: 'bg-warning',
  },
  success: {
    bg: 'bg-success/10',
    icon: 'text-success',
    pulse: 'bg-success',
  },
  accent: {
    bg: 'bg-accent/40',
    icon: 'text-accent-foreground',
    pulse: 'bg-accent-foreground',
  },
  primary: {
    bg: 'bg-primary/10',
    icon: 'text-primary',
    pulse: 'bg-primary',
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
        'rounded-lg transition-shadow duration-600 motion-reduce:transition-none',
        // Token-based highlight glow: uses --color-primary-rgb instead of a
        // raw rgba literal. Stays in sync with theme + supports dark mode.
        show && 'shadow-[0_0_0_4px_rgb(var(--color-primary-rgb)/0.3)]'
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
  const colors = toneConfig[metric.tone];
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
          "bg-card rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5",
          "transition-all duration-300 border border-border/60 relative overflow-hidden",
          "motion-reduce:hover:translate-y-0",
          "animate-fade-in opacity-0",
          compact ? "p-4" : "p-6"
        )}
        style={staggerChild(delay * 10)}
      >
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className={cn('rounded-lg', colors.bg, compact ? 'p-2' : 'p-3')}>
              <Icon className={cn(colors.icon, compact ? 'h-5 w-5' : 'h-6 w-6')} />
            </div>
            <div className="text-right">
              <div className={cn("font-bold tracking-tight text-foreground", compact ? "text-xl sm:text-2xl" : "text-3xl")}>
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
  acceptedApplications,
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
}: RealtimeMetricsDisplayProps) {
  // Track previous values for change indicators
  const previousValuesRef = useRef<Record<string, number>>({});
  const [previousValues, setPreviousValues] = useState<Record<string, number>>({});
  const [showChangeIndicators, setShowChangeIndicators] = useState(false);
  const [recentUpdates, setRecentUpdates] = useState<string[]>([]);
  
  // Update previous values when metrics change
  useEffect(() => {
    const currentValues = {
      todayApplications,
      pendingApplications,
      approvedApplications,
      acceptedApplications,
      rejectedApplications,
      totalApplications,
      avgProcessingTime,
      activeUsers,
    };
    
    const prev = previousValuesRef.current;
    
    // Only show change indicators after initial load
    if (Object.keys(prev).length > 0) {
      setShowChangeIndicators(true);
      setPreviousValues(prev);
      
      // Track which metrics changed
      const changedMetrics: string[] = [];
      Object.entries(currentValues).forEach(([key, value]) => {
        if (prev[key] !== value) {
          changedMetrics.push(key);
        }
      });
      
      if (changedMetrics.length > 0) {
        setRecentUpdates(changedMetrics);
        const timer = setTimeout(() => setRecentUpdates([]), 3000);
        previousValuesRef.current = currentValues;
        return () => clearTimeout(timer);
      }
      
      const timer = setTimeout(() => setShowChangeIndicators(false), 5000);
      previousValuesRef.current = currentValues;
      return () => clearTimeout(timer);
    }
    
    previousValuesRef.current = currentValues;
    setPreviousValues(currentValues);
  }, [todayApplications, pendingApplications, approvedApplications, acceptedApplications, rejectedApplications, totalApplications, avgProcessingTime, activeUsers]);
  
  // Calculate approval rate
  const totalDecided = acceptedApplications + rejectedApplications;
  const approvalRate = totalDecided > 0 
    ? Math.round((acceptedApplications / totalDecided) * 100) 
    : 0;
  
  const metrics: MetricData[] = [
    {
      value: todayApplications,
      previousValue: showChangeIndicators ? previousValues.todayApplications : undefined,
      label: 'Today',
      description: 'New Applications',
      icon: Calendar,
      tone: 'info',
      trend: todayApplications > 0 ? 'up' : 'stable',
    },
    {
      value: pendingApplications,
      previousValue: showChangeIndicators ? previousValues.pendingApplications : undefined,
      label: 'Queue',
      description: 'Decision Queue',
      icon: Clock,
      tone: 'warning',
      trend: pendingApplications > 5 ? 'up' : 'stable',
    },
    {
      value: avgProcessingTime,
      previousValue: showChangeIndicators ? previousValues.avgProcessingTime : undefined,
      label: 'Days',
      description: 'Avg Processing',
      icon: Zap,
      tone: 'primary',
      trend: 'down',
      trendValue: 15,
    },
    {
      value: approvalRate,
      label: 'Rate',
      description: 'Approval Rate',
      icon: CheckCircle,
      tone: 'success',
      suffix: '%',
      trend: 'stable',
    },
  ];
  
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
              <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-pulse')} />
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
        className="animate-slide-up rounded-lg border border-border bg-card p-4 opacity-0"
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
              <AnimatedCounter value={acceptedApplications} duration={1.5} />
            </div>
            <div className="text-xs text-muted-foreground">Accepted Path</div>
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
      
    </div>
  );
}

export default RealtimeMetricsDisplay;
