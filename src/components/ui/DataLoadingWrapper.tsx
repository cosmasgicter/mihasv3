/**
 * DataLoadingWrapper - Unified loading/error/content pattern
 *
 * One skeleton per content area. Transitions from skeleton → content or skeleton → error+retry.
 * Prevents infinite skeleton states and nested loading indicators.
 *
 * @requirements 14.1, 14.3, 14.4, 14.5
 */

import { type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

interface DataLoadingWrapperProps {
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Whether the fetch encountered an error */
  isError?: boolean;
  /** Error message to display */
  errorMessage?: string;
  /** Retry callback for error state */
  onRetry?: () => void;
  /** Skeleton placeholder matching the target layout */
  skeleton: ReactNode;
  /** The actual content to render when loaded */
  children: ReactNode;
}

export function DataLoadingWrapper({
  isLoading,
  isError = false,
  errorMessage = 'Something went wrong. Please try again.',
  onRetry,
  skeleton,
  children,
}: DataLoadingWrapperProps) {
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center" role="alert">
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="min-h-[44px] min-w-[44px]">
            Try again
          </Button>
        )}
      </div>
    );
  }

  if (isLoading) {
    return <>{skeleton}</>;
  }

  return <>{children}</>;
}
