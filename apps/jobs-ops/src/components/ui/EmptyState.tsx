type EmptyStateProps = {
  title: string
  message: string
}

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <div className="rounded-[28px] border border-dashed border-line bg-canvas/70 px-5 py-8 text-center">
      <h3 className="font-display text-xl font-semibold tracking-tight text-ink">{title}</h3>
      <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-muted">{message}</p>
    </div>
  )
}

