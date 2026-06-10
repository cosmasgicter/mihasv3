/**
 * AcceptanceLetter — the formal offer letter issued when an application is
 * approved. It faithfully reproduces the structure of the official MIHAS and
 * KATC admission letters (see public/mihasacceptance.pdf,
 * public/"katc cog acceptance.docx", public/"katc eht acceptance.docx"):
 *
 *   BrandHeader (institution letterhead, repeated on every page)
 *
 *   Name / Address / Date block
 *   REF: LETTER OF ADMISSION TO {PROGRAMME} ({CODE}) TRAINING – {YEAR} …
 *   Refer to your application {application number}
 *
 *   "I am glad to inform you that your application to study … was successful.
 *    Kindly note that this offer is non-transferable …"
 *   Medical examination + certified Grade 12 + reporting date paragraph.
 *
 *   ▸ Securing your place (the mandatory K1,000 non-refundable commitment fee,
 *     paid into the school's tuition account, treated as part-payment toward
 *     tuition — with the exact bank account).
 *
 *   Congratulations! / On behalf of {institution}
 *   [SignatureBlock — Dr Solomon Musonda, MD, Managing Director]
 *
 *   ── page break ──
 *   Fee Chart (item · amount · account)
 *   Payment Modalities (tuition + other-fees bank account blocks)
 *   Additional notes (bursary, GNC breakdown, late-registration penalty …)
 *   Other Requirements (items to bring)
 *
 *   (Conditional variant) adds a "Conditions of Offer" section before the
 *   signature, and the QR payload type switches to conditional_acceptance.
 *
 * The exact banking, fee, and requirement data is resolved per
 * institution + programme from `acceptanceLetterProfiles.ts`, which is
 * transcribed verbatim from the official samples. Callers only pass the
 * application's institution + program names; the profile supplies the rest.
 *
 * Signatory defaults to Dr Solomon Musonda, MD (Managing Director of BOTH
 * MIHAS and KATC) with the new transparent scanned signature.
 */

import { Document, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactElement } from 'react'

import { formatDate } from '../../dateFormat'

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
  registerPdfFonts,
  semantic,
  space,
  spacing,
  textStyles,
} from '../theme'

import {
  computeIntakeTotal,
  resolveAcceptanceProfile,
  type AcceptanceProfile,
  type BankAccount,
  type FeeChartRow,
} from './acceptanceLetterProfiles'
import { resolveIntake } from './intakeSchedule'
import { DEFAULT_SIGNATORY, type AcceptanceLetterData } from './types'

const DEFAULT_COMMITMENT_FEE = 1000

const styles = StyleSheet.create({
  title: {
    ...textStyles.documentTitle,
    color: semantic.titleText,
    marginBottom: spacing[2],
  },
  addressBlock: {
    marginBottom: spacing[2],
  },
  addressLine: {
    ...textStyles.body,
    color: semantic.bodyText,
    marginBottom: spacing[0.5],
  },
  refLine: {
    ...textStyles.bodyStrong,
    color: semantic.titleText,
    marginBottom: spacing[1],
  },
  applicationRef: {
    ...textStyles.body,
    color: semantic.mutedText,
    marginBottom: spacing[2],
  },
  salutation: {
    ...textStyles.body,
    color: semantic.bodyText,
    marginBottom: spacing[1.5],
  },
  bodyParagraph: {
    ...textStyles.body,
    color: semantic.bodyText,
    marginBottom: spacing[1],
  },
  section: {
    marginBottom: space.sectionGap,
  },
  // Highlighted commitment-fee callout — the single most important action.
  commitmentBox: {
    borderWidth: 1,
    borderColor: colors.accent.gold,
    backgroundColor: colors.ink[50],
    borderRadius: 4,
    padding: spacing[2],
    marginBottom: spacing[2],
  },
  commitmentHeading: {
    ...textStyles.bodyStrong,
    color: colors.accent.gold,
    marginBottom: spacing[1],
  },
  commitmentText: {
    ...textStyles.body,
    color: semantic.bodyText,
  },
  commitmentAccount: {
    marginTop: spacing[1.5],
    paddingTop: spacing[1],
    borderTopWidth: 0.5,
    borderTopColor: colors.accent.gold,
  },
  commitmentAccountText: {
    ...textStyles.body,
    color: semantic.bodyText,
    marginBottom: spacing[0.5],
  },
  commitmentAccountNo: {
    ...textStyles.code,
    color: semantic.titleText,
  },
  commitmentAccountNote: {
    ...textStyles.metadata,
    color: semantic.mutedText,
    marginTop: spacing[0.5],
  },
  // Fee chart table.
  table: {
    borderWidth: 0.5,
    borderColor: semantic.divider,
    borderRadius: 4,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.ink[50],
    borderBottomWidth: 0.5,
    borderBottomColor: semantic.divider,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: semantic.divider,
  },
  tableRowLast: {
    flexDirection: 'row',
  },
  th: {
    ...textStyles.label,
    color: semantic.labelText,
    paddingVertical: spacing[1.5],
    paddingHorizontal: spacing[2],
  },
  td: {
    ...textStyles.body,
    color: semantic.bodyText,
    paddingVertical: spacing[1.5],
    paddingHorizontal: spacing[2],
  },
  colItem: { flex: 3 },
  colAmount: { flex: 1.4 },
  colAccount: { flex: 2.2 },
  tdAmount: {
    ...textStyles.body,
    color: semantic.bodyText,
    paddingVertical: spacing[1.5],
    paddingHorizontal: spacing[2],
  },
  tdAccount: {
    ...textStyles.code,
    fontSize: 9,
    color: semantic.bodyText,
    paddingVertical: spacing[1.5],
    paddingHorizontal: spacing[2],
  },
  cadence: {
    ...textStyles.metadata,
    color: semantic.mutedText,
  },
  // Fee-chart row variants.
  tableRowDeduction: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: semantic.divider,
    backgroundColor: colors.badge.greenBg,
  },
  tableRowSubtotal: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: semantic.divider,
    backgroundColor: colors.ink[50],
  },
  tableRowOptional: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: semantic.divider,
  },
  tableTotalRow: {
    flexDirection: 'row',
    backgroundColor: colors.accent.gold,
  },
  tdStrong: {
    ...textStyles.bodyStrong,
    color: semantic.bodyText,
    paddingVertical: spacing[1.5],
    paddingHorizontal: spacing[2],
  },
  tdDeduction: {
    ...textStyles.body,
    color: colors.accent.green,
    paddingVertical: spacing[1.5],
    paddingHorizontal: spacing[2],
  },
  tdTotalLabel: {
    ...textStyles.bodyStrong,
    color: colors.paper,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
  },
  tdTotalAmount: {
    ...textStyles.bodyStrong,
    color: colors.paper,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
  },
  optionalBadge: {
    ...textStyles.metadata,
    fontSize: 7.5,
    color: colors.accent.gold,
    marginTop: spacing[0.5],
  },
  feeChartCaption: {
    ...textStyles.metadata,
    color: semantic.mutedText,
    marginTop: spacing[1.5],
  },
  // Bank account block (Payment Modalities).
  bankBlock: {
    borderLeftWidth: 2,
    borderLeftColor: colors.accent.gold,
    paddingLeft: spacing[3],
    marginBottom: spacing[3],
  },
  bankLabel: {
    ...textStyles.bodyStrong,
    color: semantic.titleText,
    marginBottom: spacing[1],
  },
  bankRow: {
    flexDirection: 'row',
    marginBottom: spacing[0.5],
  },
  bankKey: {
    ...textStyles.body,
    color: semantic.mutedText,
    width: 130,
  },
  bankValue: {
    ...textStyles.bodyStrong,
    color: semantic.bodyText,
    flex: 1,
  },
  bankValueMono: {
    ...textStyles.code,
    color: semantic.bodyText,
    flex: 1,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing[1],
  },
  listNumber: {
    ...textStyles.body,
    fontWeight: 600,
    color: colors.accent.gold,
    width: spacing[5],
  },
  listBullet: {
    ...textStyles.body,
    color: colors.accent.gold,
    width: spacing[4],
  },
  listText: {
    ...textStyles.body,
    color: semantic.bodyText,
    flex: 1,
  },
  noteText: {
    ...textStyles.body,
    color: semantic.bodyText,
    marginBottom: spacing[1.5],
  },
  listDeadline: {
    ...textStyles.metadata,
    color: semantic.mutedText,
    marginLeft: spacing[5],
    marginTop: spacing[0.5],
    marginBottom: spacing[1],
  },
  closing: {
    ...textStyles.body,
    color: semantic.bodyText,
    marginTop: spacing[1],
    marginBottom: spacing[0.5],
  },
  onBehalf: {
    ...textStyles.body,
    color: semantic.bodyText,
    marginBottom: spacing[0.5],
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: spacing[1],
    height: 80,
  },
  requirementsIntro: {
    ...textStyles.body,
    color: semantic.bodyText,
    marginBottom: spacing[2],
  },
})

interface Props {
  data: AcceptanceLetterData
  profile: AcceptanceProfile
  qrDataUrl: string
  generatedLabel: string
}

function formatKwacha(amount: number): string {
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('en-ZM', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return amount < 0 ? `(K${formatted})` : `K${formatted}`
}

/** Render one fee-chart row with styling appropriate to its kind. */
function FeeRow({ row }: { row: FeeChartRow }) {
  const kind = row.kind ?? 'charge'
  const rowStyle =
    kind === 'deduction'
      ? styles.tableRowDeduction
      : kind === 'subtotal'
        ? styles.tableRowSubtotal
        : row.optional
          ? styles.tableRowOptional
          : styles.tableRow
  const amountStyle =
    kind === 'deduction'
      ? [styles.tdDeduction, styles.colAmount]
      : row.emphasis || kind === 'subtotal'
        ? [styles.tdStrong, styles.colAmount]
        : [styles.tdAmount, styles.colAmount]
  const itemStyle = row.emphasis || kind === 'subtotal' ? styles.tdStrong : styles.td

  return (
    <View style={rowStyle} wrap={false}>
      <View style={styles.colItem}>
        <Text style={itemStyle}>{row.item}</Text>
        {row.cadence ? (
          <Text style={[styles.cadence, { paddingHorizontal: spacing[2], paddingBottom: spacing[1] }]}>
            {row.cadence}
          </Text>
        ) : null}
        {row.optional ? (
          <Text style={[styles.optionalBadge, { paddingHorizontal: spacing[2], paddingBottom: spacing[1] }]}>
            OPTIONAL — not included in the intake total
          </Text>
        ) : null}
      </View>
      <Text style={amountStyle}>{formatKwacha(row.amount)}</Text>
      <Text style={[styles.tdAccount, styles.colAccount]}>{row.account ?? '—'}</Text>
    </View>
  )
}

function BankAccountBlock({ account }: { account: BankAccount }) {
  return (
    <View style={styles.bankBlock} wrap={false}>
      <Text style={styles.bankLabel}>{account.label}</Text>
      <View style={styles.bankRow}>
        <Text style={styles.bankKey}>Account Name</Text>
        <Text style={styles.bankValue}>{account.accountName}</Text>
      </View>
      <View style={styles.bankRow}>
        <Text style={styles.bankKey}>Bank Name</Text>
        <Text style={styles.bankValue}>{account.bankName}</Text>
      </View>
      <View style={styles.bankRow}>
        <Text style={styles.bankKey}>Account Number</Text>
        <Text style={styles.bankValueMono}>{account.accountNumber}</Text>
      </View>
      <View style={styles.bankRow}>
        <Text style={styles.bankKey}>Branch Name</Text>
        <Text style={styles.bankValue}>{account.branchName}</Text>
      </View>
      <View style={styles.bankRow}>
        <Text style={styles.bankKey}>Branch Code</Text>
        <Text style={styles.bankValueMono}>{account.branchCode}</Text>
      </View>
      <View style={styles.bankRow}>
        <Text style={styles.bankKey}>Swift Code</Text>
        <Text style={styles.bankValueMono}>{account.swiftCode}</Text>
      </View>
      <View style={styles.bankRow}>
        <Text style={styles.bankKey}>Sort Code</Text>
        <Text style={styles.bankValueMono}>{account.sortCode}</Text>
      </View>
    </View>
  )
}

function AcceptanceLetterDocument({ data, profile, qrDataUrl, generatedLabel }: Props) {
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

  const commitmentFee = data.commitmentFee ?? DEFAULT_COMMITMENT_FEE
  const tuition = profile.tuitionAccount

  // Resolve the correct intake (month + year) — July or January, rolled
  // forward from the offer date when the intake string lacks a year.
  const intake = resolveIntake(data.intake, data.approvedDate)

  // Compose the dynamic REF title + academic-year clause from the resolved
  // intake so the letter never shows a stale hard-coded year.
  const refTitle =
    `LETTER OF ADMISSION TO ${profile.refProgramTitle} TRAINING – ` +
    `${intake.shortLabel.toUpperCase()} INTAKE ${profile.studyMode.toUpperCase()} PROGRAMME`
  const academicYear = `${intake.shortLabel} ${profile.programDisplayName} academic year`

  // Reporting clause — append the intake year to the day/month from the profile.
  const reportingClause = profile.reportingDayMonth
    ? ` You are expected to report to school on ${profile.reportingDayMonth}, ${intake.year}.`
    : ''

  // Commitment-fee deadline clause — append the intake year when known.
  const deadlineClause = profile.commitmentDeadlineDayMonth
    ? ` before ${profile.commitmentDeadlineDayMonth}, ${intake.year}`
    : ' upon receipt of this offer'

  const intakeTotal = computeIntakeTotal(profile.feeChart)

  return (
    <Document
      title={`${titleLine} — ${data.applicationNumber}`}
      author={institution.fullName}
      subject="Official offer of admission"
      creator="Beanola Admissions"
      producer="Beanola Admissions Platform"
    >
      <PageFrame
        institution={institution}
        documentType={isConditional ? 'CONDITIONAL ADMISSION' : 'ADMISSION'}
        tagLine="Office of the Managing Director"
        footerGeneratedLabel={generatedLabel}
        footerDisclaimer="All correspondence to be addressed to the Managing Director."
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

        {/* Name / Address block — matches the official letter head matter. */}
        <View style={styles.addressBlock}>
          <Text style={styles.addressLine}>Name: {data.studentName}</Text>
          <Text style={styles.addressLine}>
            Address: {data.studentAddress?.trim() || '………………………………………………'}
          </Text>
          {data.studentNumber ? (
            <Text style={styles.addressLine}>
              Student Number:{' '}
              <Text style={textStyles.code}>{data.studentNumber}</Text>
            </Text>
          ) : null}
        </View>

        <Text style={styles.refLine}>REF: {refTitle}</Text>
        <Text style={styles.applicationRef}>
          Refer to your application {data.applicationNumber}, dated{' '}
          {formatDate(data.approvedDate)}.
        </Text>

        <Text style={styles.salutation}>Dear {data.studentName},</Text>

        <Text style={styles.bodyParagraph}>
          I am glad to inform you that your application to study{' '}
          <Text style={textStyles.bodyStrong}>{profile.studyDescriptor}</Text>{' '}
          was successful. Kindly note that this offer is non-transferable to any
          other person, institution or programme and it is for the{' '}
          {academicYear} only.
          {isConditional
            ? ' Your admission is further subject to the conditions listed below.'
            : ''}
        </Text>

        <Text style={styles.bodyParagraph}>
          You are expected to undergo a medical examination for the purpose of
          obtaining a medical certificate deeming you fit for training. Kindly
          ensure that your Grade 12 school certificate results are certified;
          certified copies should be presented to us on the day of reporting.
          {reportingClause}
        </Text>

        {/* The mandatory K1,000 commitment fee — the single most important */}
        {/* action and the reason this clause is visually highlighted. */}
        <View style={styles.commitmentBox} wrap={false}>
          <Text style={styles.commitmentHeading}>
            Securing your place — {formatKwacha(commitmentFee)} commitment fee
          </Text>
          <Text style={styles.commitmentText}>
            To accept this offer and secure your place, you are required to pay
            a non-refundable commitment fee of{' '}
            <Text style={textStyles.bodyStrong}>{formatKwacha(commitmentFee)}</Text>
            {deadlineClause}. This amount is not an extra charge — it is treated
            as part-payment towards your tuition fees. Deposit it into the
            school&apos;s tuition account below and bring proof of payment on the
            day of reporting.
          </Text>
          <View style={styles.commitmentAccount}>
            <Text style={styles.commitmentAccountText}>
              <Text style={textStyles.bodyStrong}>{tuition.accountName}</Text>
              {'  ·  '}
              {tuition.bankName}
            </Text>
            <Text style={styles.commitmentAccountText}>
              A/C <Text style={styles.commitmentAccountNo}>{tuition.accountNumber}</Text>
              {'  ·  '}
              {tuition.branchName} ({tuition.branchCode})
              {'  ·  '}
              Swift {tuition.swiftCode}
            </Text>
            <Text style={styles.commitmentAccountNote}>
              Full fee schedule and payment accounts are attached overleaf.
            </Text>
          </View>
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

        <Text style={styles.bodyParagraph}>
          Attached is a copy of the school fees and other requirements for the
          first semester of the first academic year.
        </Text>

        {/* Closing + signature. Signature row stays atomic (wrap=false); the */}
        {/* closing lines flow naturally so the block fills page 1. */}
        <Text style={styles.closing}>Congratulations!</Text>
        <Text style={styles.onBehalf}>On behalf of {institution.fullName}</Text>
        <View style={styles.footerRow} wrap={false}>
          <SignatureBlock
            name={signatoryName}
            role={signatoryRole}
            postnominal={signatoryPostnominal}
            signatureImage={signatureImage}
          />
          <VerificationBlock qrDataUrl={qrDataUrl} />
        </View>

        {/* ── School fees & requirements — starts on a fresh page so the */}
        {/* letter proper reads as one clean page, matching the samples. ── */}
        <View break>
          {profile.feeChart.length > 0 ? (
            <View style={styles.section}>
              <SectionHeading accent>
                Fee Chart — {profile.programDisplayName}
              </SectionHeading>
              <View style={styles.table}>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.th, styles.colItem]}>Item</Text>
                  <Text style={[styles.th, styles.colAmount]}>Amount (ZMW)</Text>
                  <Text style={[styles.th, styles.colAccount]}>Account</Text>
                </View>
                {profile.feeChart.map((row, i) => (
                  <FeeRow key={i} row={row} />
                ))}
                {/* Computed mandatory total for the intake (excludes optional */}
                {/* items; tuition is counted net of the 50% bursary). */}
                <View style={styles.tableTotalRow} wrap={false}>
                  <Text style={[styles.tdTotalLabel, styles.colItem]}>
                    Total payable for the intake (excluding optional items)
                  </Text>
                  <Text style={[styles.tdTotalAmount, styles.colAmount]}>
                    {formatKwacha(intakeTotal)}
                  </Text>
                  <Text style={[styles.tdTotalAmount, styles.colAccount]}> </Text>
                </View>
              </View>
              <Text style={styles.feeChartCaption}>
                {profile.feeChart.some((r) => r.kind === 'deduction')
                  ? 'The 50% tuition bursary is already reflected above. Optional items (accommodation and per-year fees) are charged separately and are not part of the intake total.'
                  : 'Optional items (accommodation and per-year fees) are charged separately and are not part of the intake total.'}
              </Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <SectionHeading accent>Payment Modalities</SectionHeading>
            <Text style={styles.requirementsIntro}>
              Students are required to pay fees in full per semester or per year
              into the school account(s) below.
            </Text>
            <BankAccountBlock account={profile.tuitionAccount} />
            {profile.otherFeesAccount ? (
              <BankAccountBlock account={profile.otherFeesAccount} />
            ) : null}
          </View>

          {profile.notes.length > 0 ? (
            <View style={styles.section}>
              <SectionHeading accent>Important Notes</SectionHeading>
              {profile.notes.map((note, i) => (
                <View key={i} style={styles.listRow} wrap={false}>
                  <Text style={styles.listBullet}>•</Text>
                  <Text style={styles.listText}>{note}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {profile.requirements.length > 0 ? (
            <View style={styles.section}>
              <SectionHeading accent>Other Requirements</SectionHeading>
              <Text style={styles.requirementsIntro}>
                Prospective students are expected to bring the following training
                requirements:
              </Text>
              {profile.requirements.map((req, i) => (
                <View key={i} style={styles.listRow} wrap={false}>
                  <Text style={styles.listBullet}>•</Text>
                  <Text style={styles.listText}>{req}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </PageFrame>
    </Document>
  )
}

/**
 * Build the AcceptanceLetter <Document> element (async, because the QR code
 * is generated asynchronously). Shared by the public generator and the
 * dev-only in-browser preview (which renders the element directly through
 * @react-pdf's <PDFViewer> instead of toBlob).
 */
export async function buildAcceptanceLetterElement(
  data: AcceptanceLetterData,
): Promise<ReactElement> {
  if (!data || !data.applicationNumber || !data.studentName) {
    throw new Error('Missing acceptance data for letter generation')
  }

  registerPdfFonts()

  const profile = resolveAcceptanceProfile(data.institution, data.program)

  const qrDataUrl = await buildQrDataUrl({
    type: data.conditional ? 'conditional_acceptance' : 'acceptance_letter',
    app_no: data.applicationNumber,
    student: data.studentName,
    institution: data.institution,
    program: data.program,
    approved: data.approvedDate,
  })

  const generatedLabel = `Generated ${formatDate(new Date().toISOString())}`

  return (
    <AcceptanceLetterDocument
      data={data}
      profile={profile}
      qrDataUrl={qrDataUrl}
      generatedLabel={generatedLabel}
    />
  )
}

/**
 * Public function — replaces the old jsPDF-based generateAcceptanceLetter.
 * Signature preserved for backward compatibility.
 */
export async function generateAcceptanceLetter(
  data: AcceptanceLetterData,
): Promise<Blob> {
  const element = await buildAcceptanceLetterElement(data)
  return renderToBlob(element as ReactElement<import('@react-pdf/renderer').DocumentProps>)
}
