/**
 * Timeline Component - 8starlabs UI style timeline
 * Displays events in a vertical or horizontal timeline with status indicators
 * 
 * @requirements 8.2 - 8starlabs UI specialized components
 */

import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Check, Clock, AlertCircle, Circle, Loader2 } from 'lucide-react';

type TimelineStatus = 'completed' | 'current' | 'pending' | 'error';

interface TimelineEvent {
  id: string | number;
  date: Date | string;
  title: string;
  description?: string;
  status?: TimelineStatus;
}

interface TimelineProps {
  events: TimelineEvent[];
  orientation?: 'vertical' | 'horizontal';
  className?: string;
  showConnector?: boolean;
  animate?: boolean;
}

const statusConfig: Record<TimelineStatus, { 
  icon: React.ComponentType<{ className?: string }>; 
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  completed: {
    icon: Check,
    color: 'text-success',
    bgColor: 'bg-success/10',
    borderColor: 'border-success',
  },
  current: {
    icon: Loader2,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary',
  },
  pending: {
    icon: Clock,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    borderColor: 'border-muted-foreground',
  },
  error: {
    icon: AlertCircle,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    borderColor: 'border-destructive',
  },
};

export function Timeline({
  events,
  orientation = 'vertical',
  className,
  showConnector = true,
  animate = true,
}: TimelineProps) {
  const prefersReducedMotion = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
  const shouldAnimate = animate && !prefersReducedMotion;

  if (orientation === 'horizontal') {
    return (
      <HorizontalTimeline 
        events={events} 
        className={className}
        showConnector={showConnector}
        animate={shouldAnimate}
      />
    );
  }

  return (
    <div className={cn('relative', className)}>
      {events.map((event, index) => {
        const status = event.status || 'pending';
        const config = statusConfig[status];
        const Icon = config.icon;
        const isLast = index === events.length - 1;

        return (
          <div
            key={event.id}
            className="relative flex gap-4 pb-8 last:pb-0 animate-fade-in"
            style={shouldAnimate ? { animationDelay: `${index * 100}ms`, animationFillMode: 'forwards', opacity: 0 } : undefined}
          >
            {/* Connector line */}
            {showConnector && !isLast && (
              <div 
                className={cn(
                  'absolute left-[15px] top-8 w-0.5 h-[calc(100%-2rem)]',
                  status === 'completed' ? 'bg-success/30' : 'bg-border'
                )}
              />
            )}

            {/* Status icon */}
            <div
              className={cn(
                'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
                config.bgColor,
                config.borderColor
              )}
            >
              <Icon 
                className={cn(
                  'h-4 w-4',
                  config.color,
                  status === 'current' && 'animate-spin'
                )} 
              />
            </div>

            {/* Content */}
            <div className="flex-1 pt-0.5">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium text-foreground">{event.title}</h4>
                <time className="text-xs text-muted-foreground">
                  {formatDate(event.date)}
                </time>
              </div>
              {event.description && (
                <p className="text-sm text-muted-foreground">
                  {event.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Horizontal timeline variant
function HorizontalTimeline({
  events,
  className,
  showConnector,
  animate,
}: Omit<TimelineProps, 'orientation'> & { animate: boolean }) {
  return (
    <div className={cn('flex items-start overflow-x-auto pb-4', className)}>
      {events.map((event, index) => {
        const status = event.status || 'pending';
        const config = statusConfig[status];
        const Icon = config.icon;
        const isLast = index === events.length - 1;

        return (
          <div
            key={event.id}
            className="relative flex flex-col items-center min-w-[140px] px-4 animate-fade-in"
            style={animate ? { animationDelay: `${index * 100}ms`, animationFillMode: 'forwards', opacity: 0 } : undefined}
          >
            {/* Connector line */}
            {showConnector && !isLast && (
              <div 
                className={cn(
                  'absolute top-4 left-[calc(50%+20px)] w-[calc(100%-40px)] h-0.5',
                  status === 'completed' ? 'bg-success/30' : 'bg-border'
                )}
              />
            )}

            {/* Status icon */}
            <div
              className={cn(
                'relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2',
                config.bgColor,
                config.borderColor
              )}
            >
              <Icon 
                className={cn(
                  'h-4 w-4',
                  config.color,
                  status === 'current' && 'animate-spin'
                )} 
              />
            </div>

            {/* Content */}
            <div className="mt-3 text-center">
              <h4 className="font-medium text-sm text-foreground">{event.title}</h4>
              <time className="text-xs text-muted-foreground block mt-1">
                {formatDate(event.date)}
              </time>
              {event.description && (
                <p className="text-xs text-muted-foreground mt-1 max-w-[120px]">
                  {event.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Helper to format dates
function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'MMM d, yyyy');
}

// Simple timeline item for custom layouts
interface TimelineItemProps {
  status?: TimelineStatus;
  title: string;
  description?: string;
  date?: Date | string;
  children?: React.ReactNode;
  className?: string;
}

export function TimelineItem({
  status = 'pending',
  title,
  description,
  date,
  children,
  className,
}: TimelineItemProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={cn('flex gap-4', className)}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
          config.bgColor,
          config.borderColor
        )}
      >
        <Icon 
          className={cn(
            'h-4 w-4',
            config.color,
            status === 'current' && 'animate-spin'
          )} 
        />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium text-foreground">{title}</h4>
          {date && (
            <time className="text-xs text-muted-foreground">
              {formatDate(date)}
            </time>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {children}
      </div>
    </div>
  );
}

export default Timeline;
