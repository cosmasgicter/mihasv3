import React from 'react'
import { GraduationCap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AuthLayoutProps {
  children: React.ReactNode
  className?: string
}

export function AuthLayout({ children, className }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className={cn('max-w-md w-full', className)}>
        {/* MIHAS branding */}
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="h-6 w-6" aria-hidden="true" />
          </div>
          <span className="text-lg font-semibold text-foreground">MIHAS</span>
        </div>

        {/* Form card */}
        <main className="rounded-lg shadow-lg bg-card p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
