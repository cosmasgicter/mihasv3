import { Link } from 'react-router-dom'
import { Calendar, CheckCircle, CreditCard, FileText, PencilLine, UserRound } from 'lucide-react'

import { Button } from '@/components/ui/Button'
import type { Application } from '@/types/database'
import { cn, formatDate } from '@/lib/utils'
import { requiresStudentPaymentAction } from '@/lib/paymentStatus'

interface StudentNextActionCardProps {
  applications: Application[]
  draftCount: number
  hasPendingPayment: boolean
  hasScheduledInterview: boolean
  profileCompletion: number
}

type NextAction = {
  eyebrow: string
  title: string
  description: string
  href: string
  cta: string
  secondaryHref?: string
  secondaryCta?: string
  icon: typeof FileText
  tone: 'primary' | 'warning' | 'success' | 'neutral'
}

function getLatestSubmittedApplication(applications: Application[]) {
  const submitted = applications.filter(application => application.status !== 'draft')
  return submitted.sort((a, b) => {
    const aTime = new Date(a.submitted_at || a.updated_at || a.created_at || 0).getTime()
    const bTime = new Date(b.submitted_at || b.updated_at || b.created_at || 0).getTime()
    return bTime - aTime
  })[0]
}

function buildNextAction({
  applications,
  draftCount,
  hasPendingPayment,
  hasScheduledInterview,
  profileCompletion,
}: StudentNextActionCardProps): NextAction {
  const paymentApplication = applications.find(application =>
    application.status !== 'draft' && requiresStudentPaymentAction(application.payment_status)
  )
  const latestApplication = getLatestSubmittedApplication(applications)

  if (hasPendingPayment) {
    return {
      eyebrow: 'Action required',
      title: 'Complete your application payment',
      description: paymentApplication?.application_number
        ? `Application #${paymentApplication.application_number} is waiting for payment follow-up.`
        : 'One of your applications is waiting for payment follow-up.',
      href: '/student/payment',
      cta: 'Go to payment',
      secondaryHref: latestApplication ? `/student/application/${latestApplication.id}` : undefined,
      secondaryCta: latestApplication ? 'View application' : undefined,
      icon: CreditCard,
      tone: 'warning',
    }
  }

  if (draftCount > 0) {
    return {
      eyebrow: draftCount === 1 ? 'Draft ready' : `${draftCount} drafts ready`,
      title: 'Continue your saved application',
      description: 'Pick up where you left off. Your latest saved details are ready in the application wizard.',
      href: '/student/application-wizard',
      cta: 'Continue application',
      secondaryHref: '/student/dashboard#applications',
      secondaryCta: 'Review applications',
      icon: PencilLine,
      tone: 'primary',
    }
  }

  if (hasScheduledInterview) {
    return {
      eyebrow: 'Interview scheduled',
      title: 'Review your interview details',
      description: 'Check your interview time, location, and any preparation notes before the appointment.',
      href: '/student/interview',
      cta: 'View interview',
      secondaryHref: latestApplication ? `/student/application/${latestApplication.id}` : undefined,
      secondaryCta: latestApplication ? 'View application' : undefined,
      icon: Calendar,
      tone: 'success',
    }
  }

  if (latestApplication) {
    return {
      eyebrow: latestApplication.submitted_at ? `Submitted ${formatDate(latestApplication.submitted_at)}` : 'Application submitted',
      title: latestApplication.program || 'Track your application',
      description: latestApplication.application_number
        ? `Application #${latestApplication.application_number} is currently ${latestApplication.status.replace('_', ' ')}.`
        : `Your application is currently ${latestApplication.status.replace('_', ' ')}.`,
      href: `/student/application/${latestApplication.id}`,
      cta: 'View status',
      secondaryHref: profileCompletion < 100 ? '/student/settings' : undefined,
      secondaryCta: profileCompletion < 100 ? 'Update profile' : undefined,
      icon: CheckCircle,
      tone: 'neutral',
    }
  }

  if (profileCompletion < 100) {
    return {
      eyebrow: 'Before you apply',
      title: 'Complete your profile',
      description: 'A complete profile helps pre-fill your application and reduces errors during review.',
      href: '/student/settings',
      cta: 'Update profile',
      secondaryHref: '/student/application-wizard',
      secondaryCta: 'Start anyway',
      icon: UserRound,
      tone: 'primary',
    }
  }

  return {
    eyebrow: 'Ready to apply',
    title: 'Start your first application',
    description: 'Choose a programme, upload your documents, pay securely, and submit for review.',
    href: '/student/application-wizard',
    cta: 'Start application',
    icon: FileText,
    tone: 'primary',
  }
}

export function StudentNextActionCard(props: StudentNextActionCardProps) {
  const action = buildNextAction(props)
  const Icon = action.icon

  const toneClasses = {
    primary: 'border-primary/25 bg-gradient-to-br from-primary/10 via-card to-info/10',
    warning: 'border-warning/35 bg-gradient-to-br from-warning/15 via-card to-card',
    success: 'border-success/30 bg-gradient-to-br from-success/10 via-card to-card',
    neutral: 'border-border bg-card',
  }

  const iconClasses = {
    primary: 'bg-primary text-primary-foreground',
    warning: 'bg-warning text-white',
    success: 'bg-success text-white',
    neutral: 'bg-muted text-foreground',
  }

  return (
    <section
      className={cn(
        'overflow-hidden rounded-3xl border p-4 shadow-lg sm:p-5',
        toneClasses[action.tone]
      )}
      aria-labelledby="student-next-action-heading"
    >
      <div className="flex items-start gap-4">
        <div className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-2xl shadow-sm', iconClasses[action.tone])}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{action.eyebrow}</p>
          <h2 id="student-next-action-heading" className="mt-1 text-xl font-bold leading-tight text-foreground sm:text-2xl">
            {action.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{action.description}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button asChild variant={action.tone === 'warning' ? 'warning' : 'primary'} className="min-h-12 w-full sm:w-auto">
          <Link to={action.href}>{action.cta}</Link>
        </Button>
        {action.secondaryHref && action.secondaryCta && (
          <Button asChild variant="ghost" className="min-h-12 w-full sm:w-auto">
            <Link to={action.secondaryHref}>{action.secondaryCta}</Link>
          </Button>
        )}
      </div>
    </section>
  )
}
