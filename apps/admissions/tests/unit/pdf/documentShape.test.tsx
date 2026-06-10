/**
 * Snapshot tests — document component shape.
 *
 * These catch structural regressions that the behavioural tests miss:
 * if a refactor accidentally removes the StatusBadge from the MetadataStrip
 * or drops the SignatureBlock from the AcceptanceLetter, these tests fail.
 *
 * The snapshot is a *shape summary* (component names + key props) rather
 * than a full tree dump — stable under reformatting, sensitive to real
 * structural changes.
 */

import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { treeShape } from './__helpers__/treeShape'

// Capture the JSX element that each generator passes to renderToBlob.
// We mock @react-pdf/renderer's `pdf()` factory so we can inspect the
// element without actually running the layout engine.
const { capturedElement } = vi.hoisted(() => ({
  capturedElement: { current: null as ReactElement | null },
}))

vi.mock('@react-pdf/renderer', async () => {
  const R = await import('react')
  return {
    Document: (props: any) => R.createElement('Document', props, props.children),
    Page: (props: any) => R.createElement('Page', props, props.children),
    View: (props: any) => R.createElement('View', props, props.children),
    Text: (props: any) => R.createElement('Text', props, props.children),
    Image: (props: any) => R.createElement('Image', props, null),
    StyleSheet: { create: (s: any) => s },
    Font: {
      register: vi.fn(),
      registerHyphenationCallback: vi.fn(),
    },
    pdf: (element: ReactElement) => {
      capturedElement.current = element
      return {
        toBlob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
      }
    },
  }
})

vi.mock('qrcode', () => ({
  default: { toDataURL: async () => 'data:image/png;base64,MOCK' },
}))

import {
  generateAcceptanceLetter,
  generateApplicationSlip,
  generatePaymentReceipt,
} from '@/lib/pdf'
import type {
  AcceptanceLetterData,
  ApplicationSlipData,
  PaymentReceiptData,
} from '@/lib/pdf'

const slipFixture: ApplicationSlipData = {
  application_number: 'APP-1',
  public_tracking_code: 'TRK-1',
  status: 'under_review',
  payment_status: 'verified',
  submitted_at: '2026-05-09T12:00:00Z',
  updated_at: '2026-05-09T12:00:00Z',
  program_name: 'Diploma in Registered Nursing',
  intake_name: 'January 2027',
  institution: 'MIHAS',
  full_name: 'Test Student',
  email: 'test@example.com',
  phone: '+260 977 000 000',
  nationality: 'Zambian',
}

const receiptFixture: PaymentReceiptData = {
  receiptNumber: 'RCP-1',
  applicationNumber: 'APP-1',
  studentName: 'Test Student',
  email: 'test@example.com',
  phone: '+260 977 000 000',
  program: 'Diploma in Registered Nursing',
  institution: 'MIHAS',
  amount: 150,
  currency: 'ZMW',
  paymentMethod: 'Airtel Money',
  paymentReference: 'LENCO-1',
  paymentDate: '2026-05-09T15:30:00Z',
  verifiedDate: '2026-05-10T08:00:00Z',
  verifiedBy: 'admin@mihas.edu.zm',
}

const acceptanceUnconditionalFixture: AcceptanceLetterData = {
  applicationNumber: 'APP-1',
  studentName: 'Test Student',
  program: 'Diploma in Registered Nursing',
  institution: 'MIHAS',
  intake: 'January 2027',
  approvedDate: '2026-10-15T08:00:00Z',
  startDate: '2027-01-12T00:00:00Z',
}

const acceptanceConditionalFixture: AcceptanceLetterData = {
  ...acceptanceUnconditionalFixture,
  conditional: true,
  conditions: [
    { description: 'Submit original certificate.', deadline: '2026-12-01' },
    { description: 'Pass medical fitness check.' },
  ],
}

describe('ApplicationSlip shape', () => {
  it('matches the expected component hierarchy', async () => {
    capturedElement.current = null
    await generateApplicationSlip(slipFixture)
    expect(capturedElement.current).not.toBeNull()
    const shape = treeShape(capturedElement.current!)
    expect(shape).toMatchInlineSnapshot(`
      "ApplicationSlipDocument
        Document
          PageFrame[documentType=APPLICATION SLIP]
            Page
              View
                BrandHeader[documentType=APPLICATION SLIP]
                  View
                    View
                      Image
                      View
                        Text
                        Text
                      View
                        Text
              View
                Text
                MetadataStrip
                  View
                    View
                      Unknown
                        Text
                        Text
                    View
                      Text
                      Text
                    View
                      StatusBadge[variant=verified]
                        View
                          Text
                Text
                View
                  SectionHeading[accent]
                    View
                      Text
                      View
                  FieldGrid
                    View
                      View
                        LabeledField[label=Application Number,mono]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Tracking Code,mono]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Programme]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Intake]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Institution]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Status,strong]
                          View
                            Text
                            Text
                View
                  SectionHeading[accent]
                    View
                      Text
                      View
                  FieldGrid
                    View
                      View
                        LabeledField[label=Full Name,strong]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Email]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Phone]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Nationality]
                          View
                            Text
                            Text
                View
                  SectionHeading[accent]
                    View
                      Text
                      View
                  View
                    View
                      Text
                      Text
                    View
                      Text
                      Text
                    View
                      Text
                      Text
                    View
                      Text
                      Text
                View
                  VerificationBlock
                    View
                      Image
                      Text
              View
                BrandFooter
                  View
                    Text
                    Text
                    Text"
    `)
  })
})

describe('PaymentReceipt shape', () => {
  it('matches the expected component hierarchy', async () => {
    capturedElement.current = null
    await generatePaymentReceipt(receiptFixture)
    const shape = treeShape(capturedElement.current!)
    expect(shape).toMatchInlineSnapshot(`
      "PaymentReceiptDocument
        Document
          PageFrame[documentType=PAYMENT RECEIPT]
            Page
              View
                BrandHeader[documentType=PAYMENT RECEIPT]
                  View
                    View
                      Image
                      View
                        Text
                        Text
                      View
                        Text
                        Text
              View
                Text
                MetadataStrip
                  View
                    View
                      Unknown
                        Text
                        Text
                    View
                      Text
                      Text
                    View
                      StatusBadge[variant=verified]
                        View
                          Text
                View
                  View
                    Text
                    View
                      Text
                      Text
                    Text
                  View
                    Text
                    Text
                View
                  SectionHeading[accent]
                    View
                      Text
                      View
                  FieldGrid
                    View
                      View
                        LabeledField[label=Full Name,strong]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Application Number,mono]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Email]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Phone]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Programme]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Institution]
                          View
                            Text
                            Text
                View
                  SectionHeading[accent]
                    View
                      Text
                      View
                  FieldGrid
                    View
                      View
                        LabeledField[label=Payment Date]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Verified Date]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Verified By]
                          View
                            Text
                            Text
                      View
                        LabeledField[label=Reference,mono]
                          View
                            Text
                            Text
                View
                  VerificationBlock
                    View
                      Image
                      Text
              View
                BrandFooter
                  View
                    Text
                    Text
                    Text"
    `)
  })
})

describe('AcceptanceLetter shape', () => {
  it('unconditional variant includes the official fee/requirements sections and SignatureBlock', async () => {
    capturedElement.current = null
    await generateAcceptanceLetter(acceptanceUnconditionalFixture)
    const shape = treeShape(capturedElement.current!)
    expect(shape).toContain('PageFrame[documentType=ADMISSION]')
    expect(shape).toContain('SignatureBlock')
    expect(shape).toContain('VerificationBlock')
    // The official letter (MIHAS Registered Nursing fixture) carries four
    // accented section headings on the attached fees page: Fee Chart,
    // Payment Modalities, Important Notes, Other Requirements.
    const sectionHeadings = shape.match(/SectionHeading\[accent\]/g)
    expect(sectionHeadings).not.toBeNull()
    expect(sectionHeadings!.length).toBe(4)
  })

  it('conditional variant adds the Conditions of Offer section', async () => {
    capturedElement.current = null
    await generateAcceptanceLetter(acceptanceConditionalFixture)
    const shape = treeShape(capturedElement.current!)
    expect(shape).toContain('PageFrame[documentType=CONDITIONAL ADMISSION]')
    expect(shape).toContain('SignatureBlock')
    // Conditional adds "Conditions of Offer" ahead of the four fees-page
    // headings = 5 accented SectionHeadings.
    const sectionHeadings = shape.match(/SectionHeading\[accent\]/g)
    expect(sectionHeadings!.length).toBe(5)
  })
})
