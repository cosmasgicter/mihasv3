/**
 * Unit tests — AcceptanceLetter document generator.
 *
 * Verifies both unconditional and conditional variants produce correct PDF
 * output, QR payloads encode the right type tag, and signatory defaults
 * resolve to Dr Solomon Musonda unless overridden.
 */

import { describe, expect, it, vi } from 'vitest'

const { toDataURLSpy } = vi.hoisted(() => ({
  toDataURLSpy: vi.fn(async (_data: string) => 'data:image/png;base64,QRMOCK'),
}))
vi.mock('qrcode', () => ({ default: { toDataURL: toDataURLSpy } }))

vi.mock('@react-pdf/renderer', async () => {
  const R = await import('react')
  return {
    Document: ({ children }: any) => R.createElement('pdf-document', null, children),
    Page: ({ children }: any) => R.createElement('pdf-page', null, children),
    View: ({ children }: any) => R.createElement('pdf-view', null, children),
    Text: ({ children, render: r }: any) =>
      R.createElement('pdf-text', null, r ? r({ pageNumber: 1, totalPages: 1 }) : children),
    Image: () => R.createElement('pdf-image', null),
    StyleSheet: { create: (s: any) => s },
    Font: {
      register: vi.fn(),
      registerHyphenationCallback: vi.fn(),
    },
    pdf: (_el: unknown) => ({
      toBlob: async () =>
        new Blob(['%PDF-1.4\n%synthetic'], { type: 'application/pdf' }),
    }),
  }
})

import { generateAcceptanceLetter, DEFAULT_SIGNATORY } from '@/lib/pdf'
import type { AcceptanceLetterData } from '@/lib/pdf'

const unconditional: AcceptanceLetterData = {
  applicationNumber: 'APP-20260510-ABCD1234',
  studentName: 'Bwalya Chanda',
  program: 'Diploma in Registered Nursing',
  institution: 'MIHAS',
  intake: 'January 2027',
  approvedDate: '2026-10-15T08:00:00Z',
  startDate: '2027-01-12T00:00:00Z',
}

const conditional: AcceptanceLetterData = {
  ...unconditional,
  conditional: true,
  conditions: [
    { description: 'Submit original ECZ School Certificate.', deadline: '2026-12-01' },
    { description: 'Provide proof of English proficiency (minimum Credit).' },
    { description: 'Complete a medical fitness assessment.', deadline: '2026-12-15' },
  ],
}

describe('generateAcceptanceLetter — unconditional', () => {
  it('returns a PDF Blob', async () => {
    toDataURLSpy.mockClear()
    const blob = await generateAcceptanceLetter(unconditional)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
  })

  it('encodes the acceptance_letter type in the QR payload', async () => {
    toDataURLSpy.mockClear()
    await generateAcceptanceLetter(unconditional)
    const payload = JSON.parse(toDataURLSpy.mock.calls[0]?.[0] as string)
    expect(payload.v).toBe(1)
    expect(payload.type).toBe('acceptance_letter')
    expect(payload.app_no).toBe('APP-20260510-ABCD1234')
    expect(payload.institution).toBe('MIHAS')
  })

  it('handles missing startDate without throwing', async () => {
    const { startDate: _drop, ...noStart } = unconditional
    const blob = await generateAcceptanceLetter(noStart)
    expect(blob).toBeInstanceOf(Blob)
  })
})

describe('generateAcceptanceLetter — conditional', () => {
  it('renders with multiple conditions', async () => {
    toDataURLSpy.mockClear()
    const blob = await generateAcceptanceLetter(conditional)
    expect(blob).toBeInstanceOf(Blob)
    const payload = JSON.parse(toDataURLSpy.mock.calls[0]?.[0] as string)
    expect(payload.type).toBe('conditional_acceptance')
  })

  it('renders with a single condition', async () => {
    const blob = await generateAcceptanceLetter({
      ...conditional,
      conditions: [{ description: 'One single condition.' }],
    })
    expect(blob).toBeInstanceOf(Blob)
  })

  it('renders with 10 conditions (forces page-break logic)', async () => {
    const manyConditions: AcceptanceLetterData = {
      ...conditional,
      conditions: Array.from({ length: 10 }, (_, i) => ({
        description: `Condition ${i + 1}: This is a reasonably long condition description to stress the layout engine.`,
        deadline: i % 2 === 0 ? '2026-12-31' : undefined,
      })),
    }
    const blob = await generateAcceptanceLetter(manyConditions)
    expect(blob).toBeInstanceOf(Blob)
  })

  it('falls back to unconditional variant when conditional=true but conditions are empty', async () => {
    toDataURLSpy.mockClear()
    const blob = await generateAcceptanceLetter({
      ...unconditional,
      conditional: true,
      conditions: [],
    })
    expect(blob).toBeInstanceOf(Blob)
    // The QR payload type depends only on the `conditional` flag, not the
    // presence of conditions — keeps the payload stable for verification.
    const payload = JSON.parse(toDataURLSpy.mock.calls[0]?.[0] as string)
    expect(payload.type).toBe('conditional_acceptance')
  })
})

describe('generateAcceptanceLetter — signatory defaults', () => {
  it('defaults to Dr Solomon Musonda, MD (Managing Director) when not provided', () => {
    expect(DEFAULT_SIGNATORY.name).toBe('Dr Solomon Musonda')
    expect(DEFAULT_SIGNATORY.role).toBe('Managing Director')
    expect(DEFAULT_SIGNATORY.postnominal).toBe('MD')
    // The real scanned signature is now a bundled `?url` asset (relocated out
    // of public/ for perf-hardening R10.2), so the default resolves to an
    // emitted asset URL rather than the old `/images/signatures/...` public
    // path. Assert it still references the director signature and is no longer
    // a publicly-fetchable public/ path.
    expect(typeof DEFAULT_SIGNATORY.signatureImage).toBe('string')
    expect(DEFAULT_SIGNATORY.signatureImage).toMatch(/director-signature\.png/)
    expect(DEFAULT_SIGNATORY.signatureImage).not.toBe(
      '/images/signatures/director-signature.png',
    )
  })

  it('honours custom signatoryName and signatoryRole when provided', async () => {
    const blob = await generateAcceptanceLetter({
      ...unconditional,
      signatoryName: 'Prof. Mwenya Nkonde',
      signatoryRole: 'Acting Director',
    })
    expect(blob).toBeInstanceOf(Blob)
  })

  it('accepts a custom signatureImage override (e.g. a scanned signature)', async () => {
    const blob = await generateAcceptanceLetter({
      ...unconditional,
      signatureImage: '/images/signatures/acting-director.png',
    })
    expect(blob).toBeInstanceOf(Blob)
  })

  it('accepts a custom postnominal and signatoryDivision override', async () => {
    const blob = await generateAcceptanceLetter({
      ...unconditional,
      signatoryPostnominal: 'PhD',
      signatoryDivision: 'School of Pharmacy',
    })
    expect(blob).toBeInstanceOf(Blob)
  })
})

describe('generateAcceptanceLetter — validation', () => {
  it('throws when applicationNumber is missing', async () => {
    await expect(
      generateAcceptanceLetter({ ...unconditional, applicationNumber: '' }),
    ).rejects.toThrow(/missing acceptance data/i)
  })

  it('throws when studentName is missing', async () => {
    await expect(
      generateAcceptanceLetter({ ...unconditional, studentName: '' }),
    ).rejects.toThrow(/missing acceptance data/i)
  })
})

describe('generateAcceptanceLetter — institution + programme variants', () => {
  it('renders a KATC letter when institution is the full name', async () => {
    const blob = await generateAcceptanceLetter({
      ...unconditional,
      institution: 'Kalulushi Training Centre',
      program: 'Diploma in Clinical Medicine',
      intake: 'January 2026',
    })
    expect(blob).toBeInstanceOf(Blob)
  })

  it('renders a KATC Environmental Health (distance) letter', async () => {
    const blob = await generateAcceptanceLetter({
      ...unconditional,
      institution: 'KATC',
      program: 'Diploma in Environmental Health',
    })
    expect(blob).toBeInstanceOf(Blob)
  })

  it('accepts an explicit studentAddress and custom commitmentFee', async () => {
    const blob = await generateAcceptanceLetter({
      ...unconditional,
      studentAddress: 'P.O. Box 12345, Kitwe',
      commitmentFee: 1000,
    })
    expect(blob).toBeInstanceOf(Blob)
  })
})
