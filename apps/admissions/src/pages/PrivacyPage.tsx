import { Shield } from 'lucide-react'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'

export default function PrivacyPage() {
  return (
    <PublicLayout>
      <Seo
        title="Privacy Policy | MIHAS-KATC Admissions"
        description="Learn how MIHAS-KATC collects, uses, and protects applicant information submitted through the admissions portal."
        path="/privacy"
      />

      <div className="py-8 sm:py-10 lg:py-12">
        <Container size="lg" className="space-y-6 sm:space-y-8">
          <PageHeader
            variant="surface"
            icon={<Shield className="h-6 w-6" aria-hidden="true" />}
            title="Privacy Policy"
            description="This page outlines how applicant information is handled when you create an account, submit application details, and use the public admissions tools."
          />

          <SectionCard title="Information We Collect">
            <p className="text-sm leading-7 text-muted-foreground">
              The portal may collect your name, email address, phone number, residence details,
              emergency contact details, and any additional information required to process an
              application or respond to admissions inquiries.
            </p>
          </SectionCard>

          <SectionCard title="How Information Is Used">
            <p className="text-sm leading-7 text-muted-foreground">
              Applicant information is used to create portal accounts, evaluate applications,
              communicate admissions updates, provide support, and maintain operational records for
              regulatory or institutional reporting where required.
            </p>
          </SectionCard>

          <SectionCard title="Access and Protection">
            <p className="text-sm leading-7 text-muted-foreground">
              Access to applicant data is limited to authorized admissions and administrative staff.
              Reasonable technical and organizational measures are used to protect account and
              application data from unauthorized access, disclosure, or misuse.
            </p>
          </SectionCard>

          <SectionCard title="Questions or Requests">
            <p className="text-sm leading-7 text-muted-foreground">
              If you need clarification about how your information is handled, contact the admissions
              office using the published support channels before submitting sensitive information through
              the portal.
            </p>
          </SectionCard>
        </Container>
      </div>
    </PublicLayout>
  )
}
