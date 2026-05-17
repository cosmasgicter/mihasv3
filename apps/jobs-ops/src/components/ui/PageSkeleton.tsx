// ---------------------------------------------------------------------------
// PageSkeleton — configurable loading skeleton for jobs-ops feature pages.
// Variants: "header" (title bar), "cards" (metric card grid, default),
// "table" (tabular row placeholders).
// Uses the jobs-ops design tokens (canvas, line, white) and matches the
// rounded-[28px] panel styling used across the dashboard.
// ---------------------------------------------------------------------------

export interface PageSkeletonProps {
  /** Which skeleton layout to render. Defaults to "cards". */
  variant?: 'header' | 'cards' | 'table'
}

export function PageSkeleton({ variant = 'cards' }: PageSkeletonProps) {
  if (variant === 'header') {
    return (
      <div
        aria-busy="true"
        aria-label="Loading page header"
        className="animate-pulse border-b border-line/70 px-6 py-6"
      >
        {/* Eyebrow */}
        <div className="h-3 w-20 rounded-full bg-canvas" />
        {/* Title */}
        <div className="mt-4 h-8 w-1/3 rounded-full bg-canvas" />
        {/* Description */}
        <div className="mt-3 h-4 w-2/3 rounded-full bg-canvas" />
      </div>
    )
  }

  if (variant === 'table') {
    return (
      <div
        aria-busy="true"
        aria-label="Loading table"
        className="animate-pulse rounded-[28px] border border-line/70 bg-panel/85 p-5 shadow-sm"
      >
        {/* Table header row */}
        <div className="flex gap-4 border-b border-line/40 pb-3">
          <div className="h-3 w-1/4 rounded-full bg-canvas" />
          <div className="h-3 w-1/5 rounded-full bg-canvas" />
          <div className="h-3 w-1/6 rounded-full bg-canvas" />
          <div className="h-3 w-1/6 rounded-full bg-canvas" />
        </div>
        {/* Table body rows */}
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex gap-4 border-b border-line/20 py-4 last:border-b-0">
            <div className="h-4 w-1/4 rounded-full bg-canvas" />
            <div className="h-4 w-1/5 rounded-full bg-canvas" />
            <div className="h-4 w-1/6 rounded-full bg-canvas" />
            <div className="h-4 w-1/6 rounded-full bg-canvas" />
          </div>
        ))}
      </div>
    )
  }

  // Default: "cards" variant — matches the metric card grid layout
  return (
    <div aria-busy="true" aria-label="Loading page" className="animate-pulse space-y-5 px-6 py-6">
      {/* Header skeleton */}
      <div className="border-b border-line/70 pb-6">
        <div className="h-3 w-20 rounded-full bg-canvas" />
        <div className="mt-4 h-8 w-1/3 rounded-full bg-canvas" />
        <div className="mt-3 h-4 w-2/3 rounded-full bg-canvas" />
      </div>
      {/* Metric cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-[28px] border border-line/70 bg-panel/85 p-5 shadow-sm"
          >
            <div className="h-3 w-24 rounded-full bg-canvas" />
            <div className="mt-4 h-8 w-16 rounded-full bg-canvas" />
            <div className="mt-4 h-4 w-full rounded-full bg-canvas" />
          </div>
        ))}
      </div>
      {/* Content section skeleton */}
      <div className="rounded-[28px] border border-line/70 bg-panel/85 p-5 shadow-sm">
        <div className="h-5 w-40 rounded-full bg-canvas" />
        <div className="mt-2 h-4 w-64 rounded-full bg-canvas" />
        <div className="mt-5 grid gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-[22px] bg-canvas" />
          ))}
        </div>
      </div>
    </div>
  )
}
