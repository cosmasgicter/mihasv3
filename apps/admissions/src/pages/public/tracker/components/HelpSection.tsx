import React from 'react'
import { Link } from 'react-router-dom'
import { Mail, HelpCircle, FileSearch, Target } from 'lucide-react'
import { SectionCard } from '@/components/ui/SectionCard'
import { Button } from '@/components/ui/Button'
import { animateClasses } from '@/lib/animations'
import { usePortalBrand } from '@/hooks/usePortalBrand'
import { resolveTenantSupportContact } from '@/lib/tenantSupport'

/**
 * The tracker's help panel.
 *
 * Two things changed here in admissions-v2 task 11.5.
 *
 * **1. The support address is resolved, not hardcoded (STU-24, R2.2 / R2.3).**
 * This panel printed `admissions@beanola.com` — the platform's own inbox — into
 * every tenant's tracker, beside a "Phone Support" tile whose entire content was
 * a sentence telling the student to look up the number themselves. A student who
 * applied to a school was handed the platform's address and a shrug. It now uses
 * the same `resolveTenantSupportContact` the payment page and the
 * official-document recovery use (tasks 8.3 / 10.4): the resolved school's
 * admissions inbox when tenant context supplies one, and the in-app `/contact`
 * route when it does not. No address is invented, and a legacy example tenant is
 * never a fallback.
 *
 * **2. One container deep (R16.4).** The contact block was a `bg-card` card
 * inside this `SectionCard` holding two more `bg-muted/50` cards — three levels
 * of card for two facts. The two explanation blocks stay as flat `bg-muted`
 * panels (content inside the section's one container), and the contact affordance
 * is now a single row with one button.
 *
 * The status glossary keeps only what a tracking student cannot get elsewhere —
 * what each status means for them. The celebratory and consoling asides
 * ("Congratulations! You're accepted", "Not accepted this time") are gone: this
 * panel is a legend, and the decision itself is delivered by the application
 * record and the official letter (R16.5).
 */
export const HelpSection: React.FC = () => {
  const { brandName, supportEmail } = usePortalBrand()
  const support = resolveTenantSupportContact({
    supportEmail,
    brandName,
    subject: 'Application tracking help',
  })

  return (
    <div className={animateClasses.slideUp} style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}>
      <SectionCard
        title="Need Help?"
        description="Where a tracking link comes from, and what each status means."
        icon={<HelpCircle className="h-5 w-5" />}
        headerVariant="tinted"
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/*
              Where to get a tracking link. admissions-v2 task 10.5 (R13.12,
              STU-22): this panel used to explain where to find the application
              NUMBER, which no longer opens tracking. It now explains where the
              credential actually comes from — the owner's own command — and that
              getting a new link replaces the old one.
            */}
            <div className="rounded-lg border border-border bg-muted p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <FileSearch className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  Where to get your tracking link
                </h3>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span aria-hidden="true" className="font-bold text-primary">•</span>
                  <span className="leading-relaxed">Sign in, open your application, and choose &ldquo;Get tracking link&rdquo;</span>
                </li>
                <li className="flex items-start gap-2">
                  <span aria-hidden="true" className="font-bold text-primary">•</span>
                  <span className="leading-relaxed">Getting a new link replaces any link you shared before</span>
                </li>
                <li className="flex items-start gap-2">
                  <span aria-hidden="true" className="font-bold text-primary">•</span>
                  <span className="leading-relaxed">Your application number identifies you to the office, but does not open tracking</span>
                </li>
              </ul>
            </div>

            {/* Status glossary — what each status means for the applicant. */}
            <div className="rounded-lg border border-border bg-muted p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="rounded-lg bg-warning/10 p-2">
                  <Target className="h-5 w-5 text-warning" aria-hidden="true" />
                </div>
                <h3 className="text-base font-semibold text-foreground">
                  What each status means
                </h3>
              </div>
              <dl className="space-y-2 text-sm text-muted-foreground">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="font-semibold text-foreground">Submitted</dt>
                  <dd className="leading-relaxed">received and queued for review</dd>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="font-semibold text-foreground">Under review</dt>
                  <dd className="leading-relaxed">an admissions officer is assessing it</dd>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="font-semibold text-foreground">Approved</dt>
                  <dd className="leading-relaxed">a decision to admit has been recorded</dd>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="font-semibold text-foreground">Rejected</dt>
                  <dd className="leading-relaxed">a decision not to admit has been recorded</dd>
                </div>
              </dl>
            </div>
          </div>

          {/*
            One support affordance, resolved from tenant context. Flat inside the
            section's own container — no card, no nested card (R16.4).
          */}
          <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Mail className="h-4 w-4 text-primary" aria-hidden="true" />
                Still need help?
              </p>
              <p className="mt-1 break-words text-sm text-muted-foreground">{support.description}</p>
            </div>
            {support.isExternal ? (
              <Button asChild variant="outline" className="min-h-touch w-full shrink-0 justify-center gap-2 sm:w-auto">
                <a href={support.href}>
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  <span>{support.label}</span>
                </a>
              </Button>
            ) : (
              <Button asChild variant="outline" className="min-h-touch w-full shrink-0 justify-center gap-2 sm:w-auto">
                <Link to={support.href}>
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  <span>{support.label}</span>
                </Link>
              </Button>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
