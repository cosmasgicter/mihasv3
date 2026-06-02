import { Wrench } from 'lucide-react'

export default function MaintenancePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted px-4 py-10 text-center">
      <div className="mx-auto w-full max-w-md rounded-lg border border-border bg-card px-6 py-10 shadow-sm">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
          <Wrench className="h-7 w-7 text-primary" aria-hidden="true" />
        </div>
        <h1 className="mb-3 text-2xl font-semibold tracking-tight text-foreground">
          Scheduled maintenance
        </h1>
        <p className="text-sm text-muted-foreground">
          We&apos;re performing a quick upgrade to improve your experience.
          The admissions portal will be back shortly. Thank you for your patience.
        </p>
      </div>
    </div>
  )
}
