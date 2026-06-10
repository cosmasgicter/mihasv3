/**
 * ApplicationSlip — the PDF a student downloads after submitting their
 * application. Replaces the old jsPDF-based `generateApplicationSlip`.
 *
 * Layout:
 *   BrandHeader                                    (fixed at top)
 *   ────────────────────────── (gold hairline)
 *
 *   [Title] Application Slip
 *   [Meta strip] tracking code │ submitted │ status badge
 *
 *   Thank-you introduction paragraph
 *
 *   Section: Application Details (2-column grid)
 *   Section: Applicant Information (2-column grid)
 *   Section: What Happens Next (4-item numbered list)
 *
 *                                       [VerificationBlock]
 *                                        Scan to verify
 *
 *   BrandFooter                                    (fixed at bottom)
 *
 * All content fits on one A4 page for typical Zambian-name-length inputs.
 * If a name is unusually long (40+ chars), the 2-column grid wraps gracefully
 * onto a third row rather than overlapping.
 */

import { Document, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactElement } from 'react'

import { formatTimestamp } from '../../dateFormat'
import {
  getPaymentStatusLabel,
  isPaymentVerified,
  normalizePaymentStatus,
} from '../../paymentStatus'

import { FieldGrid } from '../components/FieldGrid'
import { LabeledField, formatStatusLabel } from '../components/LabeledField'
import { MetadataStrip } from '../components/MetadataStrip'
import { PageFrame } from '../components/PageFrame'
import { SectionHeading } from '../components/SectionHeading'
import { VerificationBlock } from '../components/VerificationBlock'
import { buildQrDataUrl } from '../qr'
import { renderToBlob } from '../render'
import {
  colors,
  getInstitution,
  registerPdfFonts,
  semantic,
  space,
  spacing,
  textStyles,
} from '../theme'

import type { ApplicationSlipData } from './types'

const styles = StyleSheet.create({
  title: {
    ...textStyles.documentTitle,
    color: semantic.titleText,
    marginBottom: spacing[2],
  },
  introText: {
    ...textStyles.body,
    color: semantic.bodyText,
    marginBottom: space.sectionGap,
  },
  nextStepsList: {
    paddingLeft: spacing[2],
  },
  nextStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing[1],
  },
  nextStepBullet: {
    ...textStyles.body,
    color: colors.accent.gold,
    fontWeight: 600,
    width: spacing[5],
    lineHeight: textStyles.body.lineHeight,
  },
  nextStepText: {
    ...textStyles.body,
    color: semantic.bodyText,
    flex: 1,
  },
  verificationRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing[3],
  },
  section: {
    marginBottom: space.sectionGap,
  },
})

interface Props {
  data: ApplicationSlipData
  qrDataUrl: string
  generatedLabel: string
}

function ApplicationSlipDocument({ data, qrDataUrl, generatedLabel }: Props) {
  const institution = getInstitution(data.institution)
  const submittedLabel = data.submitted_at
    ? formatTimestamp(data.submitted_at)
    : 'Not available'

  // Map backend payment status to a StatusBadge variant. Uses the canonical
  // paymentStatus helpers so legacy ('verified', 'paid') and current
  // ('successful', 'force_approved') signals all resolve to 'verified',
  // 'deferred' resolves to 'pending', and every other state falls through to
  // 'pending'. This mirrors the student-facing reads everywhere else in the app.
  const normalizedPayment = normalizePaymentStatus(data.payment_status)
  const statusVariant = isPaymentVerified(data.payment_status) ? 'verified' : 'pending'
  const statusLabel = (
    normalizedPayment === 'deferred'
      ? 'DEFERRED'
      : getPaymentStatusLabel(data.payment_status).toUpperCase()
  )

  return (
    <Document
      title={`Application Slip — ${data.application_number}`}
      author={institution.fullName}
      subject="Official application confirmation"
      creator="Beanola Admissions"
      producer="Beanola Admissions Platform"
    >
      <PageFrame
        institution={institution}
        documentType="APPLICATION SLIP"
        footerGeneratedLabel={generatedLabel}
      >
        <Text style={styles.title}>Application Slip</Text>

        <MetadataStrip
          reference={{ label: 'Tracking Code', value: data.public_tracking_code }}
          issued={{ label: 'Submitted', value: submittedLabel }}
          status={{
            variant: statusVariant,
            label: statusLabel,
          }}
        />

        <Text style={styles.introText}>
          Thank you for submitting your application to {institution.fullName}.
          This slip confirms that your details are now recorded in our admissions
          system. You will be notified by email once a decision is made.
        </Text>

        <View style={styles.section}>
          <SectionHeading accent>Application Details</SectionHeading>
          <FieldGrid>
            <LabeledField label="Application Number" value={data.application_number} mono />
            <LabeledField label="Tracking Code" value={data.public_tracking_code} mono />
            <LabeledField label="Programme" value={data.program_name} fallback="Not specified" />
            <LabeledField label="Intake" value={data.intake_name} fallback="Not specified" />
            <LabeledField label="Institution" value={institution.fullName} />
            <LabeledField
              label="Status"
              value={formatStatusLabel(data.status, 'Pending')}
              strong
            />
          </FieldGrid>
        </View>

        <View style={styles.section}>
          <SectionHeading accent>Applicant Information</SectionHeading>
          <FieldGrid>
            <LabeledField label="Full Name" value={data.full_name} strong />
            <LabeledField label="Email" value={data.email} />
            <LabeledField label="Phone" value={data.phone} />
            <LabeledField label="Nationality" value={data.nationality} />
          </FieldGrid>
        </View>

        <View style={styles.section}>
          <SectionHeading accent>What Happens Next</SectionHeading>
          <View style={styles.nextStepsList}>
            {buildNextSteps(institution.email).map((step, i) => (
              <View key={i} style={styles.nextStepRow}>
                <Text style={styles.nextStepBullet}>{i + 1}.</Text>
                <Text style={styles.nextStepText}>{step}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.verificationRow}>
          <VerificationBlock qrDataUrl={qrDataUrl} />
        </View>
      </PageFrame>
    </Document>
  )
}

const buildNextSteps = (contactEmail: string): string[] => [
  'Keep this slip in a safe place — you will need the tracking code to check your status.',
  'Check your email regularly. All decisions and updates are sent there first.',
  'Pay any outstanding application fee via the portal to complete your submission.',
  `Contact ${contactEmail} if any of your details change before the decision.`,
]

/**
 * Build the ApplicationSlip <Document> element (async — QR is async). Shared
 * by the public generator and the dev-only in-browser preview.
 */
export async function buildApplicationSlipElement(
  data: ApplicationSlipData,
): Promise<ReactElement> {
  if (!data || !data.application_number || !data.public_tracking_code) {
    throw new Error('Missing application data for slip generation')
  }

  registerPdfFonts()

  const qrDataUrl = await buildQrDataUrl({
    type: 'application_slip',
    app_no: data.application_number,
    tracking: data.public_tracking_code,
    institution: data.institution ?? null,
  })

  const generatedLabel = `Generated ${formatTimestamp(new Date().toISOString())}`

  return (
    <ApplicationSlipDocument
      data={data}
      qrDataUrl={qrDataUrl}
      generatedLabel={generatedLabel}
    />
  )
}

/**
 * Public function — replaces the old jsPDF-based generateApplicationSlip.
 * Signature preserved for backward compatibility.
 */
export async function generateApplicationSlip(
  data: ApplicationSlipData,
): Promise<Blob> {
  const element = await buildApplicationSlipElement(data)
  return renderToBlob(element as ReactElement<import('@react-pdf/renderer').DocumentProps>)
}
