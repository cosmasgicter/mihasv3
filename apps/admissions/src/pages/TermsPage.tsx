import { FileText } from 'lucide-react'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'

const sections = [
  { id: 'portal-use', title: 'Portal Use' },
  { id: 'account-responsibility', title: 'Account Responsibility' },
  { id: 'application-records', title: 'Application Records' },
  { id: 'contact', title: 'Contact' },
] as const

export default function TermsPage() {
  return (
    <PublicLayout>
      <Seo
        title="Terms of Use | MIHAS-KATC Admissions"
        description="Read the terms that govern use of the MIHAS-KATC admissions portal and related applicant services."
        path="/terms"
      />

      <div className="py-10 sm:py-16 lg:py-20">
        <Container size="lg" className="space-y-8 sm:space-y-10">
          <PageHeader
            variant="surface"
            icon={<FileText className="h-6 w-6" aria-hidden="true" />}
            title="Terms of Use"
            description="These terms explain how applicants may use the MIHAS-KATC admissions portal and what responsibilities apply when creating and managing an account."
          />

          {/* Table of Contents */}
          <nav aria-label="Table of contents" className="rounded-lg border border-border/40 bg-card/80  p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">On this page</h2>
            <ol className="space-y-2">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-sm sm:text-base text-primary hover:underline">
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="space-y-6">
            <SectionCard title={<span id="portal-use">1. Portal Use</span>}>
              <p className="text-sm sm:text-base leading-7 text-muted-foreground">
                Use this portal only for legitimate admissions activity, including account registration,
                application submission, document upload, and status tracking. Do not attempt to access
                records that do not belong to you or interfere with other applicants&apos; use of the service.
              </p>
            </SectionCard>

            <SectionCard title={<span id="account-responsibility">2. Account Responsibility</span>}>
              <p className="text-sm sm:text-base leading-7 text-muted-foreground">
                You are responsible for keeping your sign-in credentials secure and for ensuring the
                information you provide is accurate, current, and complete. MIHAS-KATC may suspend or
                restrict access when fraudulent, misleading, or abusive activity is detected.
              </p>
            </SectionCard>

            <SectionCard title={<span id="application-records">3. Application Records</span>}>
              <p className="text-sm sm:text-base leading-7 text-muted-foreground">
                Submission through the portal does not guarantee admission. Application decisions,
                document requirements, payment requirements, and deadlines are subject to institutional
                review and may change according to official admissions policy.
              </p>
            </SectionCard>

            <SectionCard title={<span id="contact">4. Contact</span>}>
              <p className="text-sm sm:text-base leading-7 text-muted-foreground">
                If you have questions about these terms, contact the admissions office through the
                details published on the contact page before continuing to use the portal.
              </p>
            </SectionCard>
          </div>
        </Container>
      </div>
    </PublicLayout>
  )
}
