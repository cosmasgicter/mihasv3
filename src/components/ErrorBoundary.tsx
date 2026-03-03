import React from 'react';

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: unknown }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    const message = error.message || '';
    // Don't show error boundary for browser extension conflicts
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
      return { hasError: false, error: null };
    }

    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const message = error.message || '';
    // Silently ignore extension errors
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
      return;
    }

    // Sanitize strings to prevent log injection
    const sanitize = (str: string) => str.replace(/[\r\n\t]/g, ' ');

    console.error('Error caught by boundary:', {
      timestamp: new Date().toISOString(),
      error: {
        name: sanitize(error.name),
        message: sanitize(error.message),
      },
      componentStack: errorInfo.componentStack,
      url: sanitize(window.location.href),
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex min-h-screen items-center justify-center bg-background px-4"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm sm:p-8">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <svg
                className="h-6 w-6 text-destructive"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
            </div>
            <h2 className="mb-2 text-lg font-semibold text-foreground sm:text-xl">
              Something went wrong
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              An unexpected error occurred. Please reload the page to try again.
            </p>
            {import.meta.env.DEV && this.state.error instanceof Error && (
              <pre className="mb-6 max-h-32 overflow-auto rounded bg-muted p-3 text-left text-xs text-muted-foreground">
                {this.state.error.message}
              </pre>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

