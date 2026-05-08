// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createXlsxBlob } from '@/lib/xlsxWriter'

async function decodeBlob(blob: Blob) {
  return new TextDecoder().decode(await blob.arrayBuffer())
}

describe('xlsxWriter', () => {
  it('creates an Excel-compatible OOXML package without the xlsx dependency', async () => {
    const blob = createXlsxBlob({
      name: 'Applications',
      rows: [
        ['Application Number', 'Full Name', 'Paid Amount'],
        ['MIHAS-2026-000001', 'A very long applicant name that should remain readable', 250],
      ],
    }, new Date('2026-05-08T10:00:00.000Z'))

    const bytes = new Uint8Array(await blob.arrayBuffer())
    const decoded = await decodeBlob(blob)

    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(bytes[0]).toBe(0x50)
    expect(bytes[1]).toBe(0x4b)
    expect(decoded).toContain('[Content_Types].xml')
    expect(decoded).toContain('xl/worksheets/sheet1.xml')
    expect(decoded).toContain('Application Number')
    expect(decoded).toContain('MIHAS-2026-000001')
    expect(decoded).toContain('<v>250</v>')
  })

  it('writes user text as inline strings so formulas and XML characters are inert', async () => {
    const blob = createXlsxBlob({
      name: 'Users:Export',
      rows: [
        ['Name', 'Notes'],
        ['=HYPERLINK("https://example.test")', '<script>alert("x")</script> & text'],
      ],
    }, new Date('2026-05-08T10:00:00.000Z'))

    const decoded = await decodeBlob(blob)

    expect(decoded).toContain('name="Users Export"')
    expect(decoded).toContain('<c r="A2" t="inlineStr"')
    expect(decoded).toContain('=HYPERLINK(&quot;https://example.test&quot;)')
    expect(decoded).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; text')
  })
})
