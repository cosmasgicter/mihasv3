import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from '@/lib/zod'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/Button'
import { ArrowLeft, Mail, Phone, MapPin, MessageCircle, Clock } from '@/components/icons'
import { Seo } from '@/components/seo/Seo'
import { contactInfo } from '@/lib/constants/landing'

export const contactFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  message: z.string().min(1, 'Message is required'),
})

export type ContactFormData = z.infer<typeof contactFormSchema>
export type SubmitState = 'idle' | 'draft_ready'

export function buildContactMailtoUrl(data: ContactFormData): string {
  const subject = encodeURIComponent(`Admissions inquiry from ${data.name}`)
  const body = encodeURIComponent(
    [`Name: ${data.name}`, `Email: ${data.email}`, '', data.message].join('\n')
  )
  return `mailto:${contactInfo.email}?subject=${subject}&body=${body}`
}

export default function ContactPage() {
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [draftUrl, setDraftUrl] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { name: '', email: '', message: '' },
  })

  const onSubmit = (data: ContactFormData) => {
    setDraftUrl(buildContactMailtoUrl(data))
    setSubmitState('draft_ready')
  }

  return (
    <PublicLayout>
      <Seo
        title="Contact Admissions | Beanola"
        description="Reach the Beanola admissions team for application help, program guidance, payment questions, and international student support. WhatsApp is fastest."
        path="/contact"
      />
      <div className="bg-muted">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
          {/* Hero */}
          <div className="space-y-8">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-7 lg:p-8">
              <Link
                to="/"
                className="mb-6 inline-flex min-h-touch items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to Home
              </Link>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Reach the admissions team
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Stuck on the application, not sure which program to pick, or waiting on a payment? Reach out through whichever channel you prefer. WhatsApp is fastest.
              </p>
            </div>

            {/* WhatsApp primary CTA */}
            <div className="rounded-lg border border-success/30 bg-success/5 p-5 shadow-sm sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-success/10">
                    <MessageCircle className="h-5 w-5 text-success" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-wider text-success">Fastest response</p>
                    <p className="text-base text-foreground">WhatsApp — usually within an hour on working days</p>
                  </div>
                </div>
                <Button asChild size="lg" className="min-h-touch bg-success text-white hover:bg-success/90 sm:w-auto">
                  <a href={`https://wa.me/${contactInfo.admissionsPhone.replace(/[\s+]/g, '')}`}>
                    <MessageCircle className="mr-2 h-5 w-5" aria-hidden="true" />
                    Chat on WhatsApp
                  </a>
                </Button>
              </div>
            </div>

            {/* Contact grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <a
                href={`tel:${contactInfo.admissionsPhone.replace(/\s/g, '')}`}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Phone className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Call admissions</p>
                  <p className="font-medium text-foreground">{contactInfo.admissionsPhone}</p>
                </div>
              </a>

              <a
                href={`tel:${contactInfo.supportPhone.replace(/\s/g, '')}`}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Phone className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Call support</p>
                  <p className="font-medium text-foreground">{contactInfo.supportPhone}</p>
                </div>
              </a>

              <a
                href={`mailto:${contactInfo.email}`}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Email</p>
                  <p className="font-medium text-foreground truncate">{contactInfo.email}</p>
                </div>
              </a>

              <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Admissions office</p>
                  <p className="text-sm text-foreground leading-5">{contactInfo.admissionsAddress}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <MapPin className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Student support office</p>
                  <p className="text-sm text-foreground leading-5">{contactInfo.supportAddress}</p>
                </div>
              </div>

              <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Clock className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Hours of operation</p>
                  <p className="text-sm font-medium text-foreground">Mon–Fri: 08:00–17:00</p>
                  <p className="text-sm text-muted-foreground">Sat: 08:00–12:00</p>
                </div>
              </div>
            </div>

            {/* Contact form */}
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-7 lg:p-8">
              <h2 className="text-xl font-semibold text-foreground">Send a message</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Prefer email? Fill in the form and we will prepare a draft in your email app.
              </p>

              {submitState === 'draft_ready' && draftUrl && (
                <div className="mt-6 space-y-3 rounded-lg border border-success/30 bg-success/5 p-5 text-sm text-foreground" role="status">
                  <p>
                    Your message draft is ready. Open it in your email app using the button below.
                    If no email app is available, use the contact details shown on this page.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button asChild size="lg" className="min-h-touch w-full sm:w-auto">
                      <a href={draftUrl}>Open Email App</a>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="min-h-touch w-full sm:w-auto"
                      onClick={() => { setSubmitState('idle'); setDraftUrl('') }}
                    >
                      Edit Message
                    </Button>
                  </div>
                </div>
              )}

              <form className="mt-6 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
                <Input
                  {...register('name')}
                  type="text"
                  inputMode="text"
                  label="Name"
                  autoComplete="name"
                  placeholder="Your name"
                  error={errors.name?.message}
                  className="h-12 rounded-lg"
                  required
                />
                <Input
                  {...register('email')}
                  type="email"
                  inputMode="email"
                  label="Email"
                  autoComplete="email"
                  placeholder="Email"
                  error={errors.email?.message}
                  className="h-12 rounded-lg"
                  required
                />
                <div className="w-full">
                  <label htmlFor="contact-message" className="block text-sm font-medium text-foreground mb-2">
                    Message <span className="text-destructive ml-1">*</span>
                  </label>
                  <textarea
                    id="contact-message"
                    autoComplete="off"
                    placeholder="How can we help?"
                    rows={5}
                    className="w-full min-h-[120px] rounded-lg border border-input bg-background px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors duration-150"
                    aria-invalid={!!errors.message}
                    aria-describedby={errors.message ? 'contact-message-error' : undefined}
                    {...register('message')}
                  />
                  {errors.message && (
                    <p id="contact-message-error" className="mt-1 text-sm text-destructive" role="alert">
                      {errors.message.message}
                    </p>
                  )}
                </div>
                <Button type="submit" size="lg" className="min-h-touch w-full">
                  {submitState === 'draft_ready' ? 'Update Email Draft' : 'Prepare Email Draft'}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  )
}
