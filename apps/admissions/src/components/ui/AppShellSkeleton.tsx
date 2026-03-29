/**
 * AppShellSkeleton - Minimal app shell placeholder during auth session check.
 *
 * Shows a header bar + content area skeleton so the page doesn't appear blank
 * while the session listener verifies authentication state.
 *
 * @requirements 14.2
 */

export function AppShellSkeleton() {
  return (
    <div className="flex min-h-screen w-full bg-background" aria-busy="true" aria-label="Loading application">
      {/* Sidebar placeholder - hidden on mobile */}
      <div className="hidden md:block w-20 shrink-0 border-r border-border bg-card/50" />

      <div className="flex flex-col flex-1 min-w-0">
        {/* Header placeholder - matches h-16 (64px) from real Header */}
        <div className="h-16 border-b border-border bg-card/50 flex items-center justify-between px-4 md:px-6">
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
            <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
          </div>
        </div>

        {/* Content area skeleton */}
        <main className="flex-1 p-4 md:p-6 space-y-4">
          <div className="h-6 w-48 rounded bg-muted animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="h-24 rounded-lg bg-muted/60 animate-pulse" />
            <div className="h-24 rounded-lg bg-muted/60 animate-pulse" />
            <div className="h-24 rounded-lg bg-muted/60 animate-pulse hidden lg:block" />
          </div>
          <div className="h-40 rounded-lg bg-muted/40 animate-pulse" />
        </main>
      </div>
    </div>
  );
}
