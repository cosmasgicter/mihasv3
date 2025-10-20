import React from 'react';

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    // In production, limit stack trace exposure
    const isDevelopment = import.meta.env.DEV
    return isDevelopment 
      ? error.message + '\n' + (error.stack || '')
      : error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return '[Unable to serialize error object]';
  }
};

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: unknown }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    // Check if this is an extension-related error that should be ignored
    const message = error.message || ''
    if (
      message.includes('Could not establish connection') ||
      message.includes('Receiving end does not exist') ||
      message.includes('Extension context invalidated') ||
      message.includes('chrome-extension://') ||
      message.includes('Private Access Token challenge') ||
      message.includes('cdn-cgi/challenge-platform') ||
      message.includes('Failed to load resource') ||
      message.includes('Registration failed')
    ) {
      // Don't show error boundary for extension conflicts
      return { hasError: false, error: null }
    }
    
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Check if this is an extension-related error that should be ignored
    const message = error.message || ''
    if (
      message.includes('Could not establish connection') ||
      message.includes('Receiving end does not exist') ||
      message.includes('Extension context invalidated') ||
      message.includes('chrome-extension://') ||
      message.includes('Private Access Token challenge') ||
      message.includes('cdn-cgi/challenge-platform') ||
      message.includes('Failed to load resource') ||
      message.includes('Registration failed')
    ) {
      // Silently ignore extension errors
      return
    }
    
    // Sanitize strings to prevent log injection
    const sanitize = (str: string) => str.replace(/[\r\n\t]/g, ' ');
    
    // Comprehensive error logging
    const errorReport = {
      timestamp: new Date().toISOString(),
      error: {
        name: sanitize(error.name),
        message: sanitize(error.message),
        stack: error.stack ? sanitize(error.stack) : undefined
      },
      errorInfo,
      userAgent: sanitize(navigator.userAgent),
      url: sanitize(window.location.href)
    };
    
    console.error('Error caught by boundary:', errorReport);
    
    // In production, send to error reporting service
    if (!import.meta.env.DEV) {
      // TODO: Send errorReport to monitoring service (e.g., Sentry, LogRocket)
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 border border-error rounded">
          <h2 className="text-error">Something went wrong.</h2>
          <pre className="mt-2 text-sm">{serializeError(this.state.error)}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}