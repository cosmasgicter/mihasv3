/**
 * RealtimeIndicator Component - Shows realtime connection status
 * Visual indicator for Supabase realtime connection state
 * 
 * @requirements 8.3 - Supabase UI realtime components
 */

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useRealtime } from './realtime-provider';
import { Wifi, WifiOff } from 'lucide-react';

interface RealtimeIndicatorProps {
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeConfig = {
  sm: {
    dot: 'h-2 w-2',
    icon: 'h-3 w-3',
    text: 'text-xs',
    gap: 'gap-1',
  },
  md: {
    dot: 'h-2.5 w-2.5',
    icon: 'h-4 w-4',
    text: 'text-sm',
    gap: 'gap-1.5',
  },
  lg: {
    dot: 'h-3 w-3',
    icon: 'h-5 w-5',
    text: 'text-base',
    gap: 'gap-2',
  },
};

export function RealtimeIndicator({
  showLabel = true,
  size = 'md',
  className,
}: RealtimeIndicatorProps) {
  const { isConnected } = useRealtime();
  const prefersReducedMotion = useReducedMotion();
  const sizes = sizeConfig[size];

  return (
    <div className={cn('inline-flex items-center', sizes.gap, className)}>
      <div className="relative flex items-center justify-center">
        {/* Pulse animation for connected state */}
        {isConnected && !prefersReducedMotion && (
          <motion.span
            className={cn(
              'absolute rounded-full bg-success opacity-75',
              sizes.dot
            )}
            animate={{
              scale: [1, 1.8, 1],
              opacity: [0.7, 0, 0.7],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}
        
        {/* Status dot */}
        <span
          className={cn(
            'relative rounded-full',
            sizes.dot,
            isConnected ? 'bg-success' : 'bg-muted-foreground'
          )}
        />
      </div>
      
      {showLabel && (
        <span className={cn('font-medium text-muted-foreground', sizes.text)}>
          {isConnected ? 'Live' : 'Offline'}
        </span>
      )}
    </div>
  );
}

// Icon-based indicator
export function RealtimeIconIndicator({
  size = 'md',
  className,
}: Omit<RealtimeIndicatorProps, 'showLabel'>) {
  const { isConnected } = useRealtime();
  const sizes = sizeConfig[size];

  return (
    <div 
      className={cn(
        'inline-flex items-center justify-center',
        className
      )}
      title={isConnected ? 'Connected - Live updates enabled' : 'Disconnected - Updates paused'}
    >
      {isConnected ? (
        <Wifi className={cn(sizes.icon, 'text-success')} />
      ) : (
        <WifiOff className={cn(sizes.icon, 'text-muted-foreground')} />
      )}
    </div>
  );
}

export default RealtimeIndicator;
