import { Link } from 'react-router-dom'
import { PublicLayout } from '@/components/layout/PublicLayout'
import { Seo } from '@/components/seo/Seo'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'

/**
 * For schools (D10 option A, task 33.2). The school-buyer copy that used to sit on
 * the student landing lives here. Every line describes something the platform
 * already does; there is no number, logo or endorsement. Rows, not cards.
 */
const platformPoints = [
  {
    title: 'One portal, many schools',
    description:
      'Students choose a programme and submit one application. The platform attaches it to the school that offers the programme, with the intake, payment and document rules that school configured.',
  },
  {
    title: 'Your own documents and branding',
    description:
      'Each school keeps its own logo, signature, programme templates and accreditation wording, so official documents carry the identity of the school that issued the offer.',
  },
  {
    title: 'Staff see only their school',
    description:
      'Platform operators onboard schools and assign programmes. A school administrator sees the applications, documents and payments of their own school and nothing else.',
  },
] as const

const configuredBySchool = [
  {
    title: 'Accreditation and recognition wording',
    description: 'Set per school and programme, never written into the platform.',
  },
  {
    title: 'Programmes and intakes',
    description: 'Shared programmes can be assigned to one school or several, with each offer tied to the right school.',
  },
  {
    title: 'Required documents and grades',
    description: 'Each school defines the documents, grades and review steps an intake needs.',
  },
  {
    title: 'Offer letters, slips and receipts',
    description: 'Generated with the school profile, logo, signature and approved template.',
  },
] as const

function PointList({ items }: { items: ReadonlyArray<{ title: string; description: string }> }) {
  return (
    <ul className="max-w-3xl divide-y divide-border border-y border-border">
      {items.map((item) => (
        <li key={item.title} className="py-4">
          <p className="text-base font-semibold text-foreground">{item.title}</p>
          <p className="mt-1 max-w-prose text-base leading-6 text-muted-foreground">{item.description}</p>
        </li>
      ))}
    </ul>
  )
}

export default function ForSchoolsPage() {
  return (
    <PublicLayout>
      <Seo
        title="For schools | Beanola Admissions"
        description="How a college or university takes applications on the Beanola admissions platform: its own programmes, documents and branding, with staff access limited to its own school."
        path="/for-schools"
      />
      <div className="py-10 sm:py-14 lg:py-16">
        <Container size="lg" className="space-y-12">
          <header className="max-w-3xl">
            <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground sm:text-[2rem]">
              For schools
            </h1>
            <p className="mt-4 max-w-prose text-lg leading-7 text-muted-foreground">
              Beanola Technologies runs the admissions platform. A college or university joins as its own school,
              with its own programmes, documents and staff.
            </p>
          </header>
          <section aria-labelledby="platform-heading">
            <h2 id="platform-heading" className="mb-6 text-2xl font-semibold tracking-tight text-foreground">
              What the platform does
            </h2>
            <PointList items={platformPoints} />
          </section>
          <section aria-labelledby="configured-heading">
            <h2 id="configured-heading" className="mb-6 text-2xl font-semibold tracking-tight text-foreground">
              What each school configures
            </h2>
            <PointList items={configuredBySchool} />
          </section>
          <section aria-labelledby="talk-heading" className="max-w-3xl">
            <h2 id="talk-heading" className="text-2xl font-semibold tracking-tight text-foreground">
              Talk to us
            </h2>
            <p className="mt-3 max-w-prose text-base leading-7 text-muted-foreground">
              To ask about adding your school, use the contact page. Students applying to a programme can go straight to
              the home page.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="min-h-touch w-full sm:w-auto">
                <Link to="/contact">Contact Beanola</Link>
              </Button>
              <Button asChild variant="outline" className="min-h-touch w-full sm:w-auto">
                <Link to="/">Back to the student home page</Link>
              </Button>
            </div>
          </section>
        </Container>
      </div>
    </PublicLayout>
  )
}
