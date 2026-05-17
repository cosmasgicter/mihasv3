import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from '@/lib/zod'
/** Simple wrapper — ScrollReveal was removed, children render directly */
const ScrollReveal = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Card, CardContent, CardTitle } from '@/components/ui'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/Button'
import { ArrowLeft, Mail, Phone, MapPin, MessageCircle } from '@/components/icons'
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

interface ContactItemProps {
  href?: string
  icon: React.ReactNode
  label?: string
  children: React.ReactNode
}

function ContactItem({ href, icon, label, children }: ContactItemProps) {
  const content = (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-primary/15 bg-primary/10">
        {icon}
      </div>
      <div className="min-w-0">
        {label && <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>}
        <p className="font-medium text-foreground truncate">{children}</p>
      </div>
    </div>
  )
  if (href) return <a href={href} className="block">{content}</a>
  return content
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
        title="Contact Admissions | MIHAS-KATC"
        description="Reach the MIHAS-KATC admissions team for application help, program guidance, payment questions, and international student support. WhatsApp is fastest."
        path="/contact"
      />
      <div className="bg-muted">
      <div className="container-responsive px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <ScrollReveal className="mx-auto max-w-5xl space-y-8">
          <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-7 lg:p-8">
            <Link
              to="/"
              className="mb-6 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Home
            </Link>
            <div className="flex flex-wrap gap-2" aria-label="Contact support topics">
              {['Application help', 'Program guidance', 'Payment issues', 'International students'].map((topic) => (
                <span key={topic} className="rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground">
                  {topic}
                </span>
              ))}
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Talk to admissions
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Stuck on the application, not sure which program to pick, or waiting on a payment? Reach out through whichever channel you prefer. WhatsApp is fastest.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">How to reach us, fast</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                WhatsApp for quick questions — we usually reply within an hour during working days. Call if your payment did not go through. Email if it is long or you need to attach documents. If you are near Kalulushi, you can also walk into the KATC campus and someone will help you at reception.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
              <p className="text-xs font-semibold uppercase text-primary">Fastest route</p>
              <div className="mt-4 grid gap-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-emerald-700">WhatsApp</p>
                  <a href={`https://wa.me/${contactInfo.katcPhone.replace(/[\s+]/g, '')}`} className="mt-1 text-lg font-semibold text-foreground hover:underline block">{contactInfo.katcPhone}</a>
                </div>
                <div className="rounded-lg border border-border bg-muted px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Phone support</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">{contactInfo.katcPhone}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* Contact info */}
            <Card className="rounded-lg border border-border bg-card shadow-sm">
              <CardContent className="space-y-5 p-6 sm:p-8">
                <CardTitle className="text-xl font-semibold">Talk to our team</CardTitle>
                <div className="space-y-3">
                  {/* WhatsApp — primary contact for Zambian students */}
                  <ContactItem href={`https://wa.me/${contactInfo.katcPhone.replace(/[\s+]/g, '')}`} icon={<MessageCircle className="h-4 w-4 text-green-600" aria-hidden="true" />} label="WhatsApp (fastest)">
                    {contactInfo.katcPhone}
                  </ContactItem>
                  <ContactItem href={`tel:${contactInfo.katcPhone.replace(/\s/g, '')}`} icon={<Phone className="h-4 w-4 text-primary" aria-hidden="true" />} label="Call KATC">
                    {contactInfo.katcPhone}
                  </ContactItem>
                  <ContactItem href={`tel:${contactInfo.mihasPhone.replace(/\s/g, '')}`} icon={<Phone className="h-4 w-4 text-primary" aria-hidden="true" />} label="Call MIHAS">
                    {contactInfo.mihasPhone}
                  </ContactItem>
                  <ContactItem href={`mailto:${contactInfo.email}`} icon={<Mail className="h-4 w-4 text-primary" aria-hidden="true" />} label="Email">
                    {contactInfo.email}
                  </ContactItem>
                  <ContactItem icon={<MapPin className="h-4 w-4 text-primary" aria-hidden="true" />} label="MIHAS campus">
                    {contactInfo.mihasAddress}
                  </ContactItem>
                  <ContactItem icon={<MapPin className="h-4 w-4 text-primary" aria-hidden="true" />} label="KATC campus">
                    {contactInfo.katcAddress}
                  </ContactItem>
                </div>
              </CardContent>
            </Card>

            {/* Contact form */}
            <Card className="rounded-lg border border-border bg-card shadow-sm">
              <CardContent className="p-6 sm:p-8">
                <CardTitle className="mb-6 text-xl font-semibold">Send a Message</CardTitle>

                {submitState === 'draft_ready' && draftUrl && (
                  <div className="mb-6 space-y-3 rounded-lg border border-green-200 bg-green-50 p-5 text-sm text-green-800" role="status">
                    <p>
                      Your message draft is ready. Open it in your email app using the button below.
                      If no email app is available, use the contact details shown on this page.
                    </p>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button asChild size="lg" className="h-12 w-full sm:w-auto">
                        <a href={draftUrl}>Open Email App</a>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        className="h-12 w-full sm:w-auto"
                        onClick={() => { setSubmitState('idle'); setDraftUrl('') }}
                      >
                        Edit Message
                      </Button>
                    </div>
                  </div>
                )}

                <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
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
                  <Button type="submit" size="lg" className="h-12 w-full">
                    {submitState === 'draft_ready' ? 'Update Email Draft' : 'Prepare Email Draft'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </ScrollReveal>
      </div>
      </div>
    </PublicLayout>
  )
}
