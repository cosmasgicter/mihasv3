/**
 * AcceptanceLetter — the formal offer letter issued when an application is
 * approved. Two variants share the same shell:
 *
 *   Unconditional: "We are pleased to offer you..."
 *   Conditional:   "Your offer is subject to the following conditions..."
 *
 * The conditional variant surfaces a numbered conditions list. If the list
 * is long (8+ conditions), @react-pdf's automatic page-break (via the PageFrame
 * fixed header/footer) carries the header to page 2 — solving the old
 * jsPDF "orphaned page 2" and "mid-list break" bugs.
 *
 * Signatory defaults to Dr Solomon Musonda, MD (Managing Director of both
 * MIHAS and KATC), with a real scanned signature image. The division line
 * auto-derives from the program name — nursing programs show "School of
 * Nursing" under the institution, matching MIHAS's paper-form convention.
 * All signature fields (name, role, postnominal, signatureImage, division)
 * are overridable via AcceptanceLetterData.
 *
 * Layout:
 *   BrandHeader
 *
 *   [Title] Letter of Acceptance  (or "Conditional Letter of Acceptance")
 *   [Meta strip] reference │ date │ APPROVED badge
 *
 *   Dear {Student Name},
 *
 *   It is our great pleasure to offer you admission...
 *   [body paragraph 1]
 *   [body paragraph 2]
 *
 *   Section: Programme Details (2-col grid)
 *   (if conditional) Section: Conditions of Offer (numbered list)
 *   Section: Next Steps (numbered list)
 *
 *   Yours sincerely,
 *
 *   [SignatureBlock]           [VerificationBlock]
 *
 *   BrandFooter
 */

import { Document, StyleSheet, Text, View } from '@react-pdf/renderer'

import { formatDate } from '../../utils'

import { FieldGrid } from '../components/FieldGrid'
import { LabeledField } from '../components/LabeledField'
import { MetadataStrip } from '../components/MetadataStrip'
import { PageFrame } from '../components/PageFrame'
import { SectionHeading } from '../components/SectionHeading'
import { SignatureBlock } from '../components/SignatureBlock'
import { VerificationBlock } from '../components/VerificationBlock'
import { buildQrDataUrl } from '../qr'
import { renderToBlob } from '../render'
import {
  colors,
  getInstitution,
  semantic,
  space,
  spacing,
  textStyles,
} from '../theme'

import { DEFAULT_SIGNATORY, type AcceptanceLetterData } from './types'

const styles = StyleSheet.create({
  title: {
    ...textStyles.documentTitle,
    color: semantic.titleText,
    marginBottom: spacing[2],
  },
  salutation: {
    ...textStyles.bodyProse,
    color: semantic.bodyText,
    marginBottom: spacing[2],
  },
  bodyParagraph: {
    ...textStyles.bodyProse,
    color: semantic.bodyText,
    marginBottom: spacing[2],
  },
  section: {
    marginBottom: space.sectionGap,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing[1],
  },
  listNumber: {
    ...textStyles.bodyProse,
    fontWeight: 600,
    color: colors.accent.gold,
    width: spacing[5],
  },
  listText: {
    ...textStyles.bodyProse,
    color: semantic.bodyText,
    flex: 1,
  },
  listDeadline: {
    ...textStyles.metadata,
    color: semantic.mutedText,
    marginLeft: spacing[5],
    marginTop: spacing[0.5],
    marginBottom: spacing[1],
  },
  closing: {
    ...textStyles.bodyProse,
    color: semantic.bodyText,
    marginTop: spacing[4],
    marginBottom: spacing[1],
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing[2],
  },
})

interface Props {
  data: AcceptanceLetterData
  qrDataUrl: string
  generatedLabel: string
}

function AcceptanceLetterDocument({ data, qrDataUrl, generatedLabel }: Props) {
  const institution = getInstitution(data.institution)
  const isConditional = Boolean(data.conditional && data.conditions?.length)
  const titleLine = isConditional
    ? 'Conditional Letter of Acceptance'
    : 'Letter of Acceptance'

  const signatoryName = data.signatoryName ?? DEFAULT_SIGNATORY.name
  const signatoryRole = data.signatoryRole ?? DEFAULT_SIGNATORY.role
  const signatoryPostnominal =
    data.signatoryPostnominal ?? DEFAULT_SIGNATORY.postnominal
  const signatureImage = data.signatureImage ?? DEFAULT_SIGNATORY.signatureImage
  const signatoryDivision =
    data.signatoryDivision ?? deriveSignatoryDivision(data.program)

  return (
    <Document
      title={`${titleLine} — ${data.applicationNumber}`}
      author={institution.fullName}
      subject="Official offer of admission"
      creator="MIHAS-KATC Admissions"
      producer="MIHAS-KATC Admissions Platform"
    >
      <PageFrame
        institution={institution}
        documentType={isConditional ? 'CONDITIONAL ADMISSION' : 'ADMISSION'}
        tagLine="Office of the Director"
        footerGeneratedLabel={generatedLabel}
      >
        <Text style={styles.title}>{titleLine}</Text>

        <MetadataStrip
          reference={{ label: 'Reference', value: data.applicationNumber }}
          issued={{ label: 'Date', value: formatDate(data.approvedDate) }}
          status={{
            variant: isConditional ? 'conditional' : 'approved',
            label: isConditional ? 'CONDITIONAL' : 'APPROVED',
          }}
        />

        <Text style={styles.salutation}>Dear {data.studentName},</Text>

        <Text style={styles.bodyParagraph}>
          It is our great pleasure to offer you admission to{' '}
          <Text style={textStyles.bodyStrong}>{data.program}</Text> at{' '}
          {institution.fullName} for the{' '}
          <Text style={textStyles.bodyStrong}>{data.intake}</Text> intake.
          {isConditional
            ? ' Your admission is subject to the conditions listed below.'
            : ' This offer recognises the quality of your application and the strength of your preparation.'}
        </Text>

        {!isConditional ? (
          <Text style={styles.bodyParagraph}>
            We look forward to welcoming you to our learning community, where
            you will train alongside experienced clinicians and graduate with
            qualifications recognised across Zambia and the SADC region.
          </Text>
        ) : null}

        <View style={styles.section}>
          <SectionHeading accent>Programme Details</SectionHeading>
          <FieldGrid>
            <LabeledField label="Programme" value={data.program} strong />
            <LabeledField label="Intake" value={data.intake} />
            <LabeledField label="Application Number" value={data.applicationNumber} mono />
            {data.startDate ? (
              <LabeledField label="Start Date" value={formatDate(data.startDate)} />
            ) : null}
          </FieldGrid>
        </View>

        {isConditional && data.conditions ? (
          <View style={styles.section}>
            <SectionHeading accent>Conditions of Offer</SectionHeading>
            <Text style={styles.bodyParagraph}>
              This offer becomes unconditional once the following are satisfied:
            </Text>
            {data.conditions.map((cond, i) => (
              <View key={i} wrap={false}>
                <View style={styles.listRow}>
                  <Text style={styles.listNumber}>{i + 1}.</Text>
                  <Text style={styles.listText}>{cond.description}</Text>
                </View>
                {cond.deadline ? (
                  <Text style={styles.listDeadline}>
                    Deadline: {formatDate(cond.deadline)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* "Next Steps" appears only for unconditional offers. For conditional */}
        {/* letters the conditions list IS the next-steps list, so we skip to */}
        {/* avoid redundant content and keep the letter on one page. */}
        {!isConditional ? (
          <View style={styles.section}>
            <SectionHeading accent>Next Steps</SectionHeading>
            {NEXT_STEPS.map((step, i) => (
              <View key={i} style={styles.listRow} wrap={false}>
                <Text style={styles.listNumber}>{i + 1}.</Text>
                <Text style={styles.listText}>{step}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.closing}>
          Congratulations once again. We look forward to seeing you on campus.
        </Text>
        <Text style={styles.bodyParagraph}>Yours sincerely,</Text>

        {/* Keep the signature + verification row together — if they orphan */}
        {/* across a page break the letter looks unsigned. The prose above is */}
        {/* allowed to flow naturally so page 1 can fill its available space. */}
        <View style={styles.footerRow} wrap={false}>
          <SignatureBlock
            name={signatoryName}
            role={signatoryRole}
            postnominal={signatoryPostnominal}
            institution={institution.fullName}
            division={signatoryDivision}
            signatureImage={signatureImage}
          />
          <VerificationBlock qrDataUrl={qrDataUrl} />
        </View>
      </PageFrame>
    </Document>
  )
}

const NEXT_STEPS = [
  'Confirm your acceptance through the admissions portal within 14 days.',
  'Complete registration and pay the tuition deposit by the stated deadline.',
  'Attend the orientation programme in the first week of the intake.',
  'Contact admissions@mihas.edu.zm if you have any questions or need support.',
]

/**
 * Map a program name to its originating school/division.
 *
 * Mirrors MIHAS's paper application form convention, where the footer
 * reads "On behalf of Mukuba Institute of Health and Applied Sciences,
 * School of Nursing" for nursing programs. Adding a division line under
 * the institution is a small visual concession that matches the
 * authority of the paper stationery.
 *
 * Returns `undefined` when the program has no mapped division — the
 * institution name stands alone in that case.
 */
function deriveSignatoryDivision(program: string): string | undefined {
  const lower = program.toLowerCase()
  if (lower.includes('nursing')) return 'School of Nursing'
  if (lower.includes('midwifery')) return 'School of Midwifery'
  if (lower.includes('clinical medicine') || lower.includes('medical')) {
    return 'School of Clinical Medicine'
  }
  if (lower.includes('pharmacy')) return 'School of Pharmacy'
  if (lower.includes('environmental health')) return 'School of Environmental Health'
  return undefined
}

/**
 * Public function — replaces the old jsPDF-based generateAcceptanceLetter.
 * Signature preserved for backward compatibility.
 */
export async function generateAcceptanceLetter(
  data: AcceptanceLetterData,
): Promise<Blob> {
  if (!data || !data.applicationNumber || !data.studentName) {
    throw new Error('Missing acceptance data for letter generation')
  }

  const qrDataUrl = await buildQrDataUrl({
    type: data.conditional ? 'conditional_acceptance' : 'acceptance_letter',
    app_no: data.applicationNumber,
    student: data.studentName,
    institution: data.institution,
    program: data.program,
    approved: data.approvedDate,
  })

  const generatedLabel = `Generated ${formatDate(new Date().toISOString())}`

  return renderToBlob(
    <AcceptanceLetterDocument
      data={data}
      qrDataUrl={qrDataUrl}
      generatedLabel={generatedLabel}
    />,
  )
}
