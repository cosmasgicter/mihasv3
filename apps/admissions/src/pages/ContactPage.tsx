import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ScrollReveal } from '@/components/smoothui'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Card, CardContent, CardTitle } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { ArrowLeft, Mail, Phone, MapPin } from '@/components/icons'
import { contactInfo } from '@/lib/constants/landing'
import { apiClient } from '@/services/client'

// Zod schema for contact form validation (Requirement 3.1)
export const contactFormSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  message: z.string().min(1, 'Message is required'),
})

export type ContactFormData = z.infer<typeof contactFormSchema>

export type SubmitState = 'idle' | 'submitting' | 'success' | 'error'

export default function ContactPage() {
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { name: '', email: '', message: '' },
  })

  const onSubmit = async (data: ContactFormData) => {
    setSubmitState('submitting')
    setErrorMessage('')

    try {
      const payload = {
        title: `Contact inquiry from ${data.name}`,
        message: `From: ${data.name} <${data.email}>\n\n${data.message}`,
        type: 'contact_inquiry',
      }

      await apiClient.request('/notifications/', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      setSubmitState('success')
      reset()
    } catch {
      setSubmitState('error')
      setErrorMessage('Unable to send your message. Please try again or contact us directly.')
    }
  }

  return (
    <PublicLayout>
      <div className="container-responsive px-4 py-10 sm:px-6 lg:px-8">
        <ScrollReveal className="mx-auto max-w-5xl space-y-8">
          <div className="rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-6 sm:p-10">
            <Link
              to="/"
              className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Home
            </Link>
            <h1 className="text-3xl font-bold sm:text-4xl">Contact Admissions</h1>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Reach our admissions team for application help, program guidance, and enrollment support.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Contact info card — uses shared constants */}
            <Card className="shadow-sm">
              <CardContent className="space-y-4 p-6">
                <CardTitle>Talk to our team</CardTitle>
                <a
                  href={`tel:${contactInfo.katcPhone.replace(/\s/g, '')}`}
                  className="flex items-center gap-3 hover:text-primary"
                >
                  <Phone className="h-4 w-4" />
                  <span>KATC: {contactInfo.katcPhone}</span>
                </a>
                <a
                  href={`tel:${contactInfo.mihasPhone.replace(/\s/g, '')}`}
                  className="flex items-center gap-3 hover:text-primary"
                >
                  <Phone className="h-4 w-4" />
                  <span>MIHAS: {contactInfo.mihasPhone}</span>
                </a>
                <a
                  href={`mailto:${contactInfo.email}`}
                  className="flex items-center gap-3 hover:text-primary"
                >
                  <Mail className="h-4 w-4" />
                  <span>{contactInfo.email}</span>
                </a>
                <p className="flex items-start gap-3 text-muted-foreground">
                  <MapPin className="mt-1 h-4 w-4" />
                  <span>{contactInfo.address}</span>
                </p>
              </CardContent>
            </Card>

            {/* Contact form card — React Hook Form + Zod */}
            <Card className="shadow-sm">
              <CardContent className="p-6">
                <CardTitle className="mb-4">Send a Message</CardTitle>

                {submitState === 'success' && (
                  <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800" role="status">
                    Thank you for your inquiry. Our admissions team will get back to you shortly.
                  </div>
                )}

                {submitState === 'error' && errorMessage && (
                  <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
                    {errorMessage}
                  </div>
                )}

                <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
                  <div>
                    <label htmlFor="contact-name" className="block text-sm font-medium text-foreground mb-2">
                      Name
                    </label>
                    <input
                      id="contact-name"
                      placeholder="Your name"
                      className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      aria-invalid={!!errors.name}
                      aria-describedby={errors.name ? 'contact-name-error' : undefined}
                      disabled={submitState === 'submitting'}
                      {...register('name')}
                    />
                    {errors.name && (
                      <p id="contact-name-error" className="mt-1 text-sm text-destructive" role="alert">
                        {errors.name.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="contact-email" className="block text-sm font-medium text-foreground mb-2">
                      Email
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      placeholder="Email"
                      className="w-full min-h-[44px] rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      aria-invalid={!!errors.email}
                      aria-describedby={errors.email ? 'contact-email-error' : undefined}
                      disabled={submitState === 'submitting'}
                      {...register('email')}
                    />
                    {errors.email && (
                      <p id="contact-email-error" className="mt-1 text-sm text-destructive" role="alert">
                        {errors.email.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="contact-message" className="block text-sm font-medium text-foreground mb-2">
                      Message
                    </label>
                    <textarea
                      id="contact-message"
                      placeholder="How can we help?"
                      rows={5}
                      className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      aria-invalid={!!errors.message}
                      aria-describedby={errors.message ? 'contact-message-error' : undefined}
                      disabled={submitState === 'submitting'}
                      {...register('message')}
                    />
                    {errors.message && (
                      <p id="contact-message-error" className="mt-1 text-sm text-destructive" role="alert">
                        {errors.message.message}
                      </p>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={submitState === 'submitting'}>
                    {submitState === 'submitting' ? 'Sending…' : 'Submit Inquiry'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </ScrollReveal>
      </div>
    </PublicLayout>
  )
}
