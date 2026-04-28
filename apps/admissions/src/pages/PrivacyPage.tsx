import { Shield } from 'lucide-react'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'

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
            <SectionCard title={<span id="information-collected">1. Information We Collect</span>}>
              <p className="text-sm sm:text-base leading-7 text-muted-foreground">
                The portal may collect your name, email address, phone number, residence details,
                emergency contact details, and any additional information required to process an
                application or respond to admissions inquiries.
              </p>
            </SectionCard>

            <SectionCard title={<span id="how-used">2. How Information Is Used</span>}>
              <p className="text-sm sm:text-base leading-7 text-muted-foreground">
                Applicant information is used to create portal accounts, evaluate applications,
                communicate admissions updates, provide support, and maintain operational records for
                regulatory or institutional reporting where required.
              </p>
            </SectionCard>

            <SectionCard title={<span id="access-protection">3. Access and Protection</span>}>
              <p className="text-sm sm:text-base leading-7 text-muted-foreground">
                Access to applicant data is limited to authorized admissions and administrative staff.
                Reasonable technical and organizational measures are used to protect account and
                application data from unauthorized access, disclosure, or misuse.
              </p>
            </SectionCard>

            <SectionCard title={<span id="questions">4. Questions or Requests</span>}>
              <p className="text-sm sm:text-base leading-7 text-muted-foreground">
                If you need clarification about how your information is handled, contact the admissions
                office using the published support channels before submitting sensitive information through
                the portal.
              </p>
            </SectionCard>
          </div>
        </Container>
      </div>
    </PublicLayout>
  )
}
