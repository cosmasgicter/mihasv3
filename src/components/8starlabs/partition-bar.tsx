/**
 * PartitionBar Component - 8starlabs UI style partition/progress bar
 * Displays segmented progress or distribution visualization
 * 
 * @requirements 8.2 - 8starlabs UI specialized components
 */

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface Partition {
  value: number;
  color?: string;
  label?: string;
}

interface PartitionBarProps {
  partitions: Partition[];
  total?: number;
  height?: 'sm' | 'md' | 'lg';
  showLabels?: boolean;
  showValues?: boolean;
  animate?: boolean;
  className?: string;
}

const heightConfig = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

const defaultColors = [
  'bg-primary',
  'bg-success',
  'bg-warning',
  'bg-info',
  'bg-destructive',
  'bg-secondary',
];

export function PartitionBar({
  partitions,
  total,
  height = 'md',
  showLabels = false,
  showValues = false,
  animate = true,
  className,
}: PartitionBarProps) {
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animate && !prefersReducedMotion;

  // Calculate total if not provided
  const calculatedTotal = total || partitions.reduce((sum, p) => sum + p.value, 0);

  // Calculate percentages
  const partitionsWithPercent = partitions.map((partition, index) => ({
    ...partition,
    percent: calculatedTotal > 0 ? (partition.value / calculatedTotal) * 100 : 0,
    color: partition.color || defaultColors[index % defaultColors.length],
  }));

  return (
    <div className={cn('w-full', className)}>
      {/* Bar */}
      <div 
        className={cn(
          'w-full rounded-full overflow-hidden flex bg-muted',
          heightConfig[height]
        )}
      >
        {partitionsWithPercent.map((partition, index) => (
          <motion.div
            key={index}
            className={cn('h-full', partition.color)}
            initial={shouldAnimate ? { width: 0 } : undefined}
            animate={{ width: `${partition.percent}%` }}
            transition={{ 
              duration: shouldAnimate ? 0.5 : 0, 
              delay: shouldAnimate ? index * 0.1 : 0,
              ease: 'easeOut',
            }}
          />
        ))}
      </div>

      {/* Labels */}
      {(showLabels || showValues) && (
        <div className="flex flex-wrap gap-4 mt-2">
          {partitionsWithPercent.map((partition, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <span 
                className={cn('h-2.5 w-2.5 rounded-full', partition.color)} 
              />
              {partition.label && showLabels && (
                <span className="text-sm text-muted-foreground">
                  {partition.label}
                </span>
              )}
              {showValues && (
                <span className="text-sm font-medium text-foreground">
                  {partition.value.toLocaleString()}
                  {showLabels && ` (${partition.percent.toFixed(1)}%)`}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Simple progress bar variant
interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  height?: 'sm' | 'md' | 'lg';
  showValue?: boolean;
  animate?: boolean;
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  color = 'bg-primary',
  height = 'md',
  showValue = false,
  animate = true,
  className,
}: ProgressBarProps) {
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = animate && !prefersReducedMotion;
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn('w-full', className)}>
      <div 
        className={cn(
          'w-full rounded-full overflow-hidden bg-muted',
          heightConfig[height]
        )}
      >
        <motion.div
          className={cn('h-full rounded-full', color)}
          initial={shouldAnimate ? { width: 0 } : undefined}
          animate={{ width: `${percent}%` }}
          transition={{ 
            duration: shouldAnimate ? 0.5 : 0,
            ease: 'easeOut',
          }}
        />
      </div>
      {showValue && (
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">
            {value.toLocaleString()} / {max.toLocaleString()}
          </span>
          <span className="text-xs font-medium text-foreground">
            {percent.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}

export default PartitionBar;
