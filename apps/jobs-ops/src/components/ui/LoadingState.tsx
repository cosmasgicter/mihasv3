type LoadingStateProps = {
  title: string
  message: string
}

export function LoadingState({ title, message }: LoadingStateProps) {
  return (
    <div className="rounded-[28px] border border-line/70 bg-panel/85 px-5 py-8">
      <div className="h-3 w-24 animate-pulse rounded-full bg-canvas" />
      <div className="mt-5 h-8 w-56 animate-pulse rounded-full bg-canvas" />
      <div className="mt-4 h-4 w-full animate-pulse rounded-full bg-canvas" />
      <div className="mt-2 h-4 w-4/5 animate-pulse rounded-full bg-canvas" />
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <div className="h-24 animate-pulse rounded-[22px] bg-canvas" />
        <div className="h-24 animate-pulse rounded-[22px] bg-canvas" />
        <div className="h-24 animate-pulse rounded-[22px] bg-canvas" />
      </div>
      <div className="mt-6">
        <h3 className="font-display text-xl font-semibold tracking-tight text-ink">{title}</h3>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{message}</p>
      </div>
    </div>
  )
}
