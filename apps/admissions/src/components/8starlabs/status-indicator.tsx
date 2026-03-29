/**
 * StatusIndicator Component - 8starlabs UI style status indicator
 * Displays operational status with animated pulse effects
 * Uses CSS animations instead of framer-motion for performance.
 * 
 * @requirements 1.2 - CSS transitions instead of framer-motion
 * @requirements 1.5 - Preserve same visual transition behavior
 * @requirements 8.2 - 8starlabs UI specialized components
 */

import { cn } from '@/lib/utils';

type StatusType = 'operational' | 'degraded' | 'down' | 'idle' | 'pending' | 'success' | 'error' | 'warning';

interface StatusIndicatorProps {
  status: StatusType;
  label?: string;
  showPulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const statusConfig: Record<StatusType, { color: string; bgColor: string; label: string }> = {
  operational: {
    color: 'bg-success',
    bgColor: 'bg-success/20',
    label: 'Operational',
  },
  degraded: {
    color: 'bg-warning',
    bgColor: 'bg-warning/20',
    label: 'Degraded',
  },
  down: {
    color: 'bg-destructive',
    bgColor: 'bg-destructive/20',
    label: 'Down',
  },
  idle: {
    color: 'bg-muted-foreground',
    bgColor: 'bg-muted',
    label: 'Idle',
  },
  pending: {
    color: 'bg-info',
    bgColor: 'bg-info/20',
    label: 'Pending',
  },
  success: {
    color: 'bg-success',
    bgColor: 'bg-success/20',
    label: 'Success',
  },
  error: {
    color: 'bg-destructive',
    bgColor: 'bg-destructive/20',
    label: 'Error',
  },
  warning: {
    color: 'bg-warning',
    bgColor: 'bg-warning/20',
    label: 'Warning',
  },
};

const sizeConfig = {
  sm: {
    dot: 'h-2 w-2',
    pulse: 'h-2 w-2',
    text: 'text-xs',
    gap: 'gap-1.5',
  },
  md: {
    dot: 'h-2.5 w-2.5',
    pulse: 'h-2.5 w-2.5',
    text: 'text-sm',
    gap: 'gap-2',
  },
  lg: {
    dot: 'h-3 w-3',
    pulse: 'h-3 w-3',
    text: 'text-base',
    gap: 'gap-2.5',
  },
};

export function StatusIndicator({
  status,
  label,
  showPulse = true,
  size = 'md',
  className,
}: StatusIndicatorProps) {
  const config = statusConfig[status];
  const sizes = sizeConfig[size];
  const displayLabel = label || config.label;

  const shouldPulse = showPulse && (status === 'operational' || status === 'pending' || status === 'success');

  return (
    <div className={cn('inline-flex items-center', sizes.gap, className)}>
      <div className="relative flex items-center justify-center">
        {/* Pulse animation using CSS */}
        {shouldPulse && (
          <span
            className={cn(
              'absolute rounded-full animate-ping opacity-75 motion-reduce:animate-none',
              sizes.pulse,
              config.color,
            )}
          />
        )}
        
        {/* Status dot */}
        <span
          className={cn(
            'relative rounded-full',
            sizes.dot,
            config.color
          )}
        />
      </div>
      
      {displayLabel && (
        <span className={cn('font-medium text-foreground', sizes.text)}>
          {displayLabel}
        </span>
      )}
    </div>
  );
}

// Badge variant of status indicator
interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  const displayLabel = label || config.label;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        config.bgColor,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', config.color)} />
      {displayLabel}
    </span>
  );
}

export default StatusIndicator;
