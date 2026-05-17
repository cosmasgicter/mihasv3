import { Shield } from 'lucide-react'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'

const sections = [
  { id: 'information-collected', title: 'Information We Collect' },
  { id: 'how-used', title: 'How Information Is Used' },
  { id: 'access-protection', title: 'Access and Protection' },
  { id: 'questions', title: 'Questions or Requests' },
] as const

export default function PrivacyPage() {
  return (
    <PublicLayout>
      <Seo
        title="Privacy Policy | MIHAS-KATC Admissions"
        description="Learn how MIHAS-KATC collects, uses, and protects applicant information submitted through the admissions portal."
        path="/privacy"
      />

      <div className="py-10 sm:py-16 lg:py-20">
        <Container size="lg" className="space-y-8 sm:space-y-10">
          <PageHeader
            variant="surface"
            icon={<Shield className="h-6 w-6" aria-hidden="true" />}
            title="Privacy Policy"
            description="This page outlines how applicant information is handled when you create an account, submit application details, and use the public admissions tools."
          />

          <article className="mx-auto max-w-prose space-y-10">
            {/* Table of Contents */}
            <nav aria-label="Table of contents" className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">On this page</h2>
              <ol className="space-y-2">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="text-base text-primary hover:underline">
                      {i + 1}. {s.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            {/* Sections */}
            <section id="information-collected" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-foreground">1. Information We Collect</h2>
              <p className="mt-3 text-base leading-7 text-muted-foreground sm:leading-8">
                The portal may collect your name, email address, phone number, residence details,
                emergency contact details, and any additional information required to process an
                application or respond to admissions inquiries.
              </p>
            </section>

            <section id="how-used" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-foreground">2. How Information Is Used</h2>
              <p className="mt-3 text-base leading-7 text-muted-foreground sm:leading-8">
                Applicant information is used to create portal accounts, evaluate applications,
                communicate admissions updates, provide support, and maintain operational records for
                regulatory or institutional reporting where required.
              </p>
            </section>

            <section id="access-protection" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-foreground">3. Access and Protection</h2>
              <p className="mt-3 text-base leading-7 text-muted-foreground sm:leading-8">
                Access to applicant data is limited to authorized admissions and administrative staff.
                Reasonable technical and organizational measures are used to protect account and
                application data from unauthorized access, disclosure, or misuse.
              </p>
            </section>

            <section id="questions" className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-foreground">4. Questions or Requests</h2>
              <p className="mt-3 text-base leading-7 text-muted-foreground sm:leading-8">
                If you need clarification about how your information is handled, contact the admissions
                office using the published support channels before submitting sensitive information through
                the portal.
              </p>
            </section>
          </article>
        </Container>
      </div>
    </PublicLayout>
  )
}
