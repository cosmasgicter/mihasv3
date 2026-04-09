import { FileText } from 'lucide-react'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Seo } from '@/components/seo/Seo'
import { Container } from '@/components/ui/Container'
import { PageHeader } from '@/components/ui/PageHeader'
import { SectionCard } from '@/components/ui/SectionCard'

export default function TermsPage() {
  return (
    <PublicLayout>
      <Seo
        title="Terms of Use | MIHAS-KATC Admissions"
        description="Read the terms that govern use of the MIHAS-KATC admissions portal and related applicant services."
        path="/terms"
      />

      <div className="py-8 sm:py-10 lg:py-12">
        <Container size="lg" className="space-y-6 sm:space-y-8">
          <PageHeader
            variant="surface"
            icon={<FileText className="h-6 w-6" aria-hidden="true" />}
            title="Terms of Use"
            description="These terms explain how applicants may use the MIHAS-KATC admissions portal and what responsibilities apply when creating and managing an account."
          />

          <SectionCard title="Portal Use">
            <p className="text-sm leading-7 text-muted-foreground">
              Use this portal only for legitimate admissions activity, including account registration,
              application submission, document upload, and status tracking. Do not attempt to access
              records that do not belong to you or interfere with other applicants&apos; use of the service.
            </p>
          </SectionCard>

          <SectionCard title="Account Responsibility">
            <p className="text-sm leading-7 text-muted-foreground">
              You are responsible for keeping your sign-in credentials secure and for ensuring the
              information you provide is accurate, current, and complete. MIHAS-KATC may suspend or
              restrict access when fraudulent, misleading, or abusive activity is detected.
            </p>
          </SectionCard>

          <SectionCard title="Application Records">
            <p className="text-sm leading-7 text-muted-foreground">
              Submission through the portal does not guarantee admission. Application decisions,
              document requirements, payment requirements, and deadlines are subject to institutional
              review and may change according to official admissions policy.
            </p>
          </SectionCard>

          <SectionCard title="Contact">
            <p className="text-sm leading-7 text-muted-foreground">
              If you have questions about these terms, contact the admissions office through the
              details published on the contact page before continuing to use the portal.
            </p>
          </SectionCard>
        </Container>
      </div>
    </PublicLayout>
  )
}
