/**
 * Unit tests — PDF primitives
 *
 * Verifies the 7 shared primitives introduced in Task 2 each render without
 * throwing, return a valid React element, and accept the documented props.
 *
 * We avoid @testing-library/react here to keep the dep surface small — the
 * real rendering verification happens in Task 5+ property tests that run
 * the components through the actual @react-pdf renderer.
 */

import React from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@react-pdf/renderer', async () => {
  const R = await import('react')
  return {
    Page: ({ children, ...rest }: any) =>
      R.createElement('pdf-page', rest, children),
    View: ({ children, ...rest }: any) =>
      R.createElement('pdf-view', rest, children),
    Text: ({ children, render: r, ...rest }: any) =>
      R.createElement('pdf-text', rest, r ? r({ pageNumber: 1, totalPages: 1 }) : children),
    Image: (props: any) => R.createElement('pdf-image', props),
    StyleSheet: { create: (s: Record<string, unknown>) => s },
    Font: {
      register: vi.fn(),
      registerHyphenationCallback: vi.fn(),
    },
  }
})

import { BrandFooter } from '@/lib/pdf/components/BrandFooter'
import { BrandHeader } from '@/lib/pdf/components/BrandHeader'
import { FieldGrid } from '@/lib/pdf/components/FieldGrid'
import { LabeledField, formatStatusLabel } from '@/lib/pdf/components/LabeledField'
import { MetadataStrip } from '@/lib/pdf/components/MetadataStrip'
import { PageFrame } from '@/lib/pdf/components/PageFrame'
import { SectionHeading } from '@/lib/pdf/components/SectionHeading'
import { SignatureBlock } from '@/lib/pdf/components/SignatureBlock'
import { StatusBadge } from '@/lib/pdf/components/StatusBadge'
import { VerificationBlock } from '@/lib/pdf/components/VerificationBlock'
import { institutions } from '@/lib/pdf/theme'

/** Return true if the given value is a valid React element tree (no throws during creation). */
function rendersCleanly(el: React.ReactElement): boolean {
  return React.isValidElement(el)
}

describe('SectionHeading', () => {
  it('returns a valid element', () => {
    expect(rendersCleanly(<SectionHeading>Applicant Information</SectionHeading>)).toBe(true)
  })
  it('accepts the accent prop', () => {
    expect(rendersCleanly(<SectionHeading accent>Details</SectionHeading>)).toBe(true)
  })
})

describe('LabeledField', () => {
  it('returns a valid element with label and value', () => {
    expect(rendersCleanly(<LabeledField label="FULL NAME" value="Bwalya Chanda" />)).toBe(true)
  })
  it('accepts null value', () => {
    expect(rendersCleanly(<LabeledField label="Phone" value={null} />)).toBe(true)
  })
  it('accepts mono and strong variants', () => {
    expect(rendersCleanly(<LabeledField label="Ref" value="APP-1" mono />)).toBe(true)
    expect(rendersCleanly(<LabeledField label="Amt" value="K150.00" strong />)).toBe(true)
  })
})

describe('formatStatusLabel', () => {
  it('title-cases snake_case and kebab-case', () => {
    expect(formatStatusLabel('under_review')).toBe('Under Review')
    expect(formatStatusLabel('conditionally_approved')).toBe('Conditionally Approved')
    expect(formatStatusLabel('force-approved')).toBe('Force Approved')
    expect(formatStatusLabel('force approved')).toBe('Force Approved')
  })
  it('returns fallback for null/empty/whitespace', () => {
    expect(formatStatusLabel(null)).toBe('Unknown')
    expect(formatStatusLabel('')).toBe('Unknown')
    expect(formatStatusLabel('   ')).toBe('Unknown')
    expect(formatStatusLabel(null, 'Pending')).toBe('Pending')
  })
})

describe('FieldGrid', () => {
  it('renders with 2-column default', () => {
    expect(
      rendersCleanly(
        <FieldGrid>
          <LabeledField label="A" value="1" />
          <LabeledField label="B" value="2" />
        </FieldGrid>,
      ),
    ).toBe(true)
  })
  it('renders with columns=1', () => {
    expect(
      rendersCleanly(
        <FieldGrid columns={1}>
          <LabeledField label="A" value="1" />
        </FieldGrid>,
      ),
    ).toBe(true)
  })
})

describe('StatusBadge', () => {
  it.each(['verified', 'approved', 'conditional', 'pending'] as const)(
    'renders variant %s',
    (variant) => {
      expect(rendersCleanly(<StatusBadge variant={variant}>TEST</StatusBadge>)).toBe(true)
    },
  )
})

describe('MetadataStrip', () => {
  it('renders with all slots', () => {
    expect(
      rendersCleanly(
        <MetadataStrip
          reference={{ label: 'TRACKING', value: 'TRK-123456789012' }}
          issued={{ label: 'ISSUED', value: '12 Oct 2026' }}
          status={{ variant: 'verified', label: 'VERIFIED' }}
        />,
      ),
    ).toBe(true)
  })
  it('renders with some slots omitted', () => {
    expect(
      rendersCleanly(
        <MetadataStrip
          reference={{ label: 'REF', value: 'ABC' }}
          issued={null}
          status={null}
        />,
      ),
    ).toBe(true)
  })
})

describe('BrandHeader', () => {
  it('renders with MIHAS institution', () => {
    expect(
      rendersCleanly(
        <BrandHeader institution={institutions.MIHAS} documentType="APPLICATION SLIP" />,
      ),
    ).toBe(true)
  })
  it('renders with KATC institution and tagLine', () => {
    expect(
      rendersCleanly(
        <BrandHeader
          institution={institutions.KATC}
          documentType="PAYMENT RECEIPT"
          tagLine="Finance Office"
        />,
      ),
    ).toBe(true)
  })
  it('accepts showLogo=false', () => {
    expect(
      rendersCleanly(
        <BrandHeader
          institution={institutions.MIHAS}
          documentType="TEST"
          showLogo={false}
        />,
      ),
    ).toBe(true)
  })
})

describe('BrandFooter', () => {
  it('renders with defaults', () => {
    expect(rendersCleanly(<BrandFooter />)).toBe(true)
  })
  it('accepts custom disclaimer and generatedLabel', () => {
    expect(
      rendersCleanly(
        <BrandFooter disclaimer="Custom notice." generatedLabel="Generated 12 Oct 2026 14:30" />,
      ),
    ).toBe(true)
  })
})

describe('VerificationBlock', () => {
  it('renders with QR data URL', () => {
    const fakeQr = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQAA'
    expect(rendersCleanly(<VerificationBlock qrDataUrl={fakeQr} />)).toBe(true)
  })
  it('accepts custom caption', () => {
    expect(
      rendersCleanly(
        <VerificationBlock qrDataUrl="data:image/png;base64,Xx" caption="Verify at mihas.edu.zm" />,
      ),
    ).toBe(true)
  })
})

describe('SignatureBlock', () => {
  it('renders with name and role only', () => {
    expect(
      rendersCleanly(
        <SignatureBlock name="Dr Solomon Musonda" role="Managing Director" />,
      ),
    ).toBe(true)
  })
  it('renders with institution line', () => {
    expect(
      rendersCleanly(
        <SignatureBlock
          name="Dr Solomon Musonda"
          role="Managing Director"
          institution="Mukuba Institute of Health and Applied Sciences"
        />,
      ),
    ).toBe(true)
  })
  it('renders with postnominal appended to the name', () => {
    expect(
      rendersCleanly(
        <SignatureBlock
          name="Dr Solomon Musonda"
          postnominal="MD"
          role="Managing Director"
          institution="Mukuba Institute of Health and Applied Sciences"
        />,
      ),
    ).toBe(true)
  })
  it('renders with a school/division line beneath the institution', () => {
    expect(
      rendersCleanly(
        <SignatureBlock
          name="Dr Solomon Musonda"
          postnominal="MD"
          role="Managing Director"
          institution="Mukuba Institute of Health and Applied Sciences"
          division="School of Nursing"
        />,
      ),
    ).toBe(true)
  })
  it('renders with a scanned signature image', () => {
    expect(
      rendersCleanly(
        <SignatureBlock
          name="Dr Solomon Musonda"
          postnominal="MD"
          role="Managing Director"
          signatureImage="data:image/png;base64,Xx"
        />,
      ),
    ).toBe(true)
  })
})

describe('PageFrame', () => {
  it('renders with institution, doc type, and children', () => {
    expect(
      rendersCleanly(
        <PageFrame
          institution={institutions.MIHAS}
          documentType="APPLICATION SLIP"
        >
          <SectionHeading>Body</SectionHeading>
        </PageFrame>,
      ),
    ).toBe(true)
  })
  it('renders with tagLine and footer options', () => {
    expect(
      rendersCleanly(
        <PageFrame
          institution={institutions.KATC}
          documentType="PAYMENT RECEIPT"
          tagLine="Finance Office"
          footerDisclaimer="Issued electronically."
          footerGeneratedLabel="Generated 12 Oct 2026 14:30"
        >
          <SectionHeading>Details</SectionHeading>
        </PageFrame>,
      ),
    ).toBe(true)
  })
  it('accepts showLogo=false', () => {
    expect(
      rendersCleanly(
        <PageFrame
          institution={institutions.MIHAS}
          documentType="TEST"
          showLogo={false}
        >
          <></>
        </PageFrame>,
      ),
    ).toBe(true)
  })
})
