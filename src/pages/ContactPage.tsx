import React from 'react'
import { Link } from 'react-router-dom'
import { PageTransition, ScrollReveal } from '@/components/smoothui'
import { ResponsiveHeader } from '@/components/navigation/ResponsiveHeader'
import { Card, CardContent, CardTitle } from '@/components/ui'
import { Button } from '@/components/ui/Button'
import { ArrowLeft, Mail, Phone, MapPin } from '@/components/icons'
import { useAnalytics } from '@/hooks/useAnalytics'

export default function ContactPage() {
  const { trackAction } = useAnalytics()

  const handleTrack = (actionType: string, destination: string) => {
    trackAction(actionType, {
      page: 'contact',
      destination,
      funnel: 'contact'
    })
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    handleTrack('contact_form_submit_click', '/contact#form')
  }

  return (
    <PageTransition mode="fade">
      <div className="min-h-screen bg-background">
        <ResponsiveHeader />

        <main className="container-responsive px-4 py-10 sm:px-6 lg:px-8">
          <ScrollReveal className="mx-auto max-w-5xl space-y-8">
            <div className="rounded-3xl border border-border bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-6 sm:p-10">
              <Link
                to="/"
                onClick={() => handleTrack('contact_back_to_home_click', '/')}
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
              <Card className="shadow-sm">
                <CardContent className="space-y-4 p-6">
                  <CardTitle>Talk to our team</CardTitle>
                  <a href="tel:+260966992299" className="flex items-center gap-3 hover:text-primary" onClick={() => handleTrack('contact_phone_katc_click', 'tel:+260966992299')}>
                    <Phone className="h-4 w-4" />
                    <span>KATC: +260 966 992 299</span>
                  </a>
                  <a href="tel:+260961515151" className="flex items-center gap-3 hover:text-primary" onClick={() => handleTrack('contact_phone_mihas_click', 'tel:+260961515151')}>
                    <Phone className="h-4 w-4" />
                    <span>MIHAS: +260 961 515 151</span>
                  </a>
                  <a href="mailto:info@mihas.edu.zm" className="flex items-center gap-3 hover:text-primary" onClick={() => handleTrack('contact_email_click', 'mailto:info@mihas.edu.zm')}>
                    <Mail className="h-4 w-4" />
                    <span>info@mihas.edu.zm</span>
                  </a>
                  <p className="flex items-start gap-3 text-muted-foreground">
                    <MapPin className="mt-1 h-4 w-4" />
                    <span>President Avenue, Kalulushi, 2-Shaft, Next to KMC</span>
                  </p>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardContent className="p-6">
                  <CardTitle className="mb-4">Send a Message</CardTitle>
                  <form id="form" className="space-y-4" onSubmit={handleSubmit}>
                    <input required placeholder="Your name" className="w-full rounded-lg border border-border bg-card px-3 py-2" />
                    <input required type="email" placeholder="Email" className="w-full rounded-lg border border-border bg-card px-3 py-2" />
                    <textarea required placeholder="How can we help?" rows={5} className="w-full rounded-lg border border-border bg-card px-3 py-2" />
                    <Button type="submit" className="w-full">Submit Inquiry</Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          </ScrollReveal>
        </main>
      </div>
    </PageTransition>
  )
}
