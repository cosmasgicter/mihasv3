import { describe, expect, it, vi } from 'vitest'

import { renderOfferLetter } from '@/lib/documentTemplates'

vi.mock('jspdf', () => {
  class FakeJsPdf {
    internal = {
      pageSize: {
        getWidth: () => 210,
        getHeight: () => 297,
      },
    }

    setFillColor() {}
    rect() {}
    setTextColor() {}
    setFont() {}
    setFontSize() {}
    text() {}
    splitTextToSize(text: string) {
      return [text]
    }
    addPage() {}
    setDrawColor() {}
    line() {}
    roundedRect() {}
    output(type: string) {
      if (type === 'arraybuffer') return new ArrayBuffer(16)
      return ''
    }
  }

  return { jsPDF: FakeJsPdf }
})

vi.mock('jspdf-autotable', () => ({}))

describe('document template premium shell', () => {
  it('renders branded premium html for offer letters', async () => {
    const rendered = await renderOfferLetter({
      student: { fullName: 'Jane Doe' },
      application: {
        programName: 'Diploma in Nursing',
        intake: 'August 2026',
        startDate: '2026-08-04',
        responseDeadline: '2026-06-15',
        referenceNumber: 'APP-2026-001',
      },
      staff: {
        fullName: 'Admissions Office',
        title: 'Director of Admissions',
      },
    })

    expect(rendered.html).toContain('MIHAS Documents')
    expect(rendered.html).toContain('Mukuba Institute of Health and Allied Sciences')
    expect(rendered.html).toContain('Formal admission confirmation and onboarding guidance')
    expect(rendered.html).toContain('Jane Doe')
    expect(rendered.html).toContain('APP-2026-001')
    expect(rendered.pdf.bytes).toBeInstanceOf(Uint8Array)
  })
})
