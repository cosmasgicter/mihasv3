/**
 * Error Display Component
 * 
 * Displays user-friendly error messages with suggested actions.
 * 
 * Requirements: 14.4 - Display helpful error messages
 * Task: 25.3 - Add comprehensive error messages
 */

import React from 'react';
import { AlertTriangle, XCircle, Info, RefreshCw, ArrowRight } from 'lucide-react';
import { Button } from './Button';
import { formatError, isRetryableError, type ErrorMessage } from '@/utils/errorMessages';

interface ErrorDisplayProps {
  error: any;
  onRetry?: () => void;
  onAction?: () => void;
  showTechnicalDetails?: boolean;
  className?: string;
}

export function ErrorDisplay({
  error,
  onRetry,
  onAction,
  showTechnicalDetails = false,
  className = '',
}: ErrorDisplayProps) {
  const errorMessage: ErrorMessage = formatError(error);
  const canRetry = isRetryableError(error);
  
  // Determine icon based on error severity
  const getIcon = () => {
    if (error.status >= 500) {
      return <XCircle className="w-12 h-12 text-red-500" />;
    }
    if (error.status === 404) {
      return <Info className="w-12 h-12 text-blue-500" />;
    }
    return <AlertTriangle className="w-12 h-12 text-yellow-500" />;
  };
  
  return (
    <div className={`bg-white rounded-lg shadow-md p-6 max-w-md mx-auto ${className}`}>
      {/* Icon */}
      <div className="flex justify-center mb-4">
        {getIcon()}
      </div>
      
      {/* Title */}
      <h3 className="text-xl font-semibold text-gray-900 text-center mb-2">
        {errorMessage.title}
      </h3>
      
      {/* Description */}
      <p className="text-gray-600 text-center mb-6">
        {errorMessage.description}
      </p>
      
      {/* Actions */}
      <div className="flex flex-col gap-3">
        {/* Primary action */}
        {canRetry && onRetry && (
          <Button
            onClick={onRetry}
            className="w-full"
            variant="primary"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {errorMessage.actionLabel || 'Try Again'}
          </Button>
        )}
        
        {/* Custom action */}
        {errorMessage.action && errorMessage.action !== 'retry' && onAction && (
          <Button
            onClick={onAction}
            className="w-full"
            variant={canRetry ? 'secondary' : 'primary'}
          >
            <ArrowRight className="w-4 h-4 mr-2" />
            {errorMessage.actionLabel}
          </Button>
        )}
      </div>
      
      {/* Technical details (for developers) */}
      {showTechnicalDetails && errorMessage.technicalDetails && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
            Technical Details
          </summary>
          <pre className="mt-2 p-3 bg-gray-100 rounded text-xs overflow-x-auto">
            {errorMessage.technicalDetails}
          </pre>
        </details>
      )}
    </div>
  );
}

/**
 * Inline error message (for forms)
 */
interface InlineErrorProps {
  message: string;
  className?: string;
}

export function InlineError({ message, className = '' }: InlineErrorProps) {
  return (
    <div className={`flex items-start gap-2 text-red-600 text-sm mt-1 ${className}`}>
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

/**
 * Error banner (for page-level errors)
 */
interface ErrorBannerProps {
  error: any;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
}

export function ErrorBanner({
  error,
  onDismiss,
  onRetry,
  className = '',
}: ErrorBannerProps) {
  const errorMessage: ErrorMessage = formatError(error);
  const canRetry = isRetryableError(error);
  
  return (
    <div className={`bg-red-50 border-l-4 border-red-500 p-4 ${className}`}>
      <div className="flex items-start">
        <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-800">
            {errorMessage.title}
          </h3>
          <p className="mt-1 text-sm text-red-700">
            {errorMessage.description}
          </p>
          {canRetry && onRetry && (
            <div className="mt-3">
              <Button
                onClick={onRetry}
                size="sm"
                variant="secondary"
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                {errorMessage.actionLabel || 'Try Again'}
              </Button>
            </div>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="ml-3 flex-shrink-0 text-red-500 hover:text-red-700"
            aria-label="Dismiss"
          >
            <XCircle className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Error page (for full-page errors)
 */
interface ErrorPageProps {
  error: any;
  onRetry?: () => void;
  onGoHome?: () => void;
  showTechnicalDetails?: boolean;
}

export function ErrorPage({
  error,
  onRetry,
  onGoHome,
  showTechnicalDetails = false,
}: ErrorPageProps) {
  const errorMessage: ErrorMessage = formatError(error);
  const canRetry = isRetryableError(error);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <ErrorDisplay
          error={error}
          onRetry={onRetry}
          onAction={onGoHome}
          showTechnicalDetails={showTechnicalDetails}
        />
        
        {/* Additional help */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Need help?{' '}
            <a
              href="/contact"
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
