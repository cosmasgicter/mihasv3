/**
 * PaymentReceipt — the PDF issued when a student's payment is verified.
 * Replaces the old jsPDF-based `generatePaymentReceipt`.
 *
 * Fixes the old overlap bug where the "AMOUNT RECEIVED" box was drawn at
 * y − 18 while "PAYMENT DETAILS" was at y — the new layout uses flex so
 * nothing can accidentally collide.
 *
 * Layout:
 *   BrandHeader (MIHAS FINANCE OFFICE tagLine)
 *
 *   [Title] Payment Receipt
 *   [Meta strip] receipt no │ issued │ VERIFIED badge
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  AMOUNT RECEIVED                                         │
 *   │  K150.00 ZMW          via Airtel Money                   │
 *   │  Reference: LENCO-XXXXXXXX                               │
 *   └──────────────────────────────────────────────────────────┘
 *
 *   Section: Student Information (2-column)
 *   Section: Payment Details (2-column)
 *
 *                                       [VerificationBlock]
 *   BrandFooter
 */

import { Document, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { ReactElement } from 'react'

import { formatDate } from '../../dateFormat'

import { FieldGrid } from '../components/FieldGrid'
import { LabeledField } from '../components/LabeledField'
import { MetadataStrip } from '../components/MetadataStrip'
import { PageFrame } from '../components/PageFrame'
import { SectionHeading } from '../components/SectionHeading'
import { VerificationBlock } from '../components/VerificationBlock'
import { formatAmount } from '../currency'
import { buildQrDataUrl } from '../qr'
import { renderToBlob } from '../render'
import {
  colors,
  getInstitution,
  radius,
  registerPdfFonts,
  semantic,
  space,
  spacing,
  textStyles,
} from '../theme'

import type { PaymentReceiptData } from './types'

const styles = StyleSheet.create({
  title: {
    ...textStyles.documentTitle,
    color: semantic.titleText,
    marginBottom: spacing[2],
  },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: spacing[4],
    backgroundColor: colors.ink[900],
    borderRadius: radius.md,
    marginBottom: space.sectionGap,
  },
  heroLabel: {
    ...textStyles.label,
    color: colors.ink[300],
    marginBottom: spacing[2],
  },
  heroAmount: {
    fontFamily: textStyles.documentTitle.fontFamily,
    fontWeight: 700,
    fontSize: 30,
    lineHeight: 1.1,
    color: colors.paper,
    letterSpacing: -0.4,
  },
  heroCurrency: {
    ...textStyles.bodyStrong,
    color: colors.ink[300],
    marginLeft: spacing[2],
  },
  heroMethod: {
    alignItems: 'flex-end',
  },
  heroMethodLabel: {
    ...textStyles.label,
    color: colors.ink[300],
    marginBottom: spacing[1],
    letterSpacing: 1.4,
  },
  heroMethodValue: {
    ...textStyles.bodyStrong,
    color: colors.paper,
  },
  referenceLine: {
    ...textStyles.code,
    color: colors.ink[300],
    marginTop: spacing[3],
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  section: {
    marginBottom: space.sectionGap,
  },
  verificationRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing[3],
  },
})

interface Props {
  data: PaymentReceiptData
  qrDataUrl: string
  generatedLabel: string
}

function PaymentReceiptDocument({ data, qrDataUrl, generatedLabel }: Props) {
  const institution = getInstitution(data.institution)
  const currency = data.currency ?? 'ZMW'
  const amount = formatAmount(data.amount, currency)

  return (
    <Document
      title={`Payment Receipt — ${data.receiptNumber}`}
      author={institution.fullName}
      subject="Official payment receipt"
      creator="Beanola Admissions"
      producer="Beanola Admissions Platform"
    >
      <PageFrame
        institution={institution}
        documentType="PAYMENT RECEIPT"
        tagLine="Finance Office"
        footerGeneratedLabel={generatedLabel}
      >
        <Text style={styles.title}>Payment Receipt</Text>

        <MetadataStrip
          reference={{ label: 'Receipt Number', value: data.receiptNumber }}
          issued={{ label: 'Issued', value: formatDate(data.verifiedDate) }}
          status={{ variant: 'verified', label: 'VERIFIED' }}
        />

        {/* Hero card — the amount is the single most important number, so it */}
        {/* gets its own dark container. Everything else supports it. */}
        <View style={styles.heroCard}>
          <View>
            <Text style={styles.heroLabel}>Amount Received</Text>
            <View style={styles.heroAmountRow}>
              <Text style={styles.heroAmount}>
                {amount.symbol}
                {amount.numeric}
              </Text>
              <Text style={styles.heroCurrency}>{amount.code}</Text>
            </View>
            {data.paymentReference ? (
              <Text style={styles.referenceLine}>Ref {data.paymentReference}</Text>
            ) : null}
          </View>
          <View style={styles.heroMethod}>
            <Text style={styles.heroMethodLabel}>Method</Text>
            <Text style={styles.heroMethodValue}>{data.paymentMethod}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeading accent>Student Information</SectionHeading>
          <FieldGrid>
            <LabeledField label="Full Name" value={data.studentName} strong />
            <LabeledField label="Application Number" value={data.applicationNumber} mono />
            <LabeledField label="Email" value={data.email} />
            <LabeledField label="Phone" value={data.phone} />
            <LabeledField label="Programme" value={data.program} />
            <LabeledField label="Institution" value={institution.fullName} />
          </FieldGrid>
        </View>

        <View style={styles.section}>
          <SectionHeading accent>Payment Details</SectionHeading>
          <FieldGrid>
            <LabeledField label="Payment Date" value={formatDate(data.paymentDate)} />
            <LabeledField label="Verified Date" value={formatDate(data.verifiedDate)} />
            <LabeledField label="Verified By" value={data.verifiedBy} />
            {data.paymentReference ? (
              <LabeledField label="Reference" value={data.paymentReference} mono />
            ) : null}
          </FieldGrid>
        </View>

        <View style={styles.verificationRow}>
          <VerificationBlock qrDataUrl={qrDataUrl} />
        </View>
      </PageFrame>
    </Document>
  )
}

/**
 * Build the PaymentReceipt <Document> element (async — QR is async). Shared
 * by the public generator and the dev-only in-browser preview.
 */
export async function buildPaymentReceiptElement(
  data: PaymentReceiptData,
): Promise<ReactElement> {
  if (!data || !data.receiptNumber || !data.applicationNumber) {
    throw new Error('Missing payment data for receipt generation')
  }

  registerPdfFonts()

  const qrDataUrl = await buildQrDataUrl({
    type: 'payment_receipt',
    receipt_no: data.receiptNumber,
    app_no: data.applicationNumber,
    student: data.studentName,
    institution: data.institution,
    amount: data.amount,
    currency: data.currency ?? 'ZMW',
    verified: data.verifiedDate,
  })

  const generatedLabel = `Generated ${formatDate(new Date().toISOString())}`

  return (
    <PaymentReceiptDocument
      data={data}
      qrDataUrl={qrDataUrl}
      generatedLabel={generatedLabel}
    />
  )
}

/**
 * Public function — replaces the old jsPDF-based generatePaymentReceipt.
 * Signature preserved for backward compatibility.
 */
export async function generatePaymentReceipt(
  data: PaymentReceiptData,
): Promise<Blob> {
  const element = await buildPaymentReceiptElement(data)
  return renderToBlob(element as ReactElement<import('@react-pdf/renderer').DocumentProps>)
}
