/**
 * DEV-ONLY acceptance-letter preview.
 *
 * Renders the live AcceptanceLetter PDF in an in-browser viewer with controls
 * to switch institution, programme, and the conditional variant. This page is
 * only mounted when `import.meta.env.DEV` is true (see App.tsx) and is never
 * shipped in a production build. It exists purely so the letter design can be
 * reviewed and iterated without going through the full admin → approve flow.
 */

import { PDFViewer } from '@react-pdf/renderer'
import { useEffect, useState, type ReactElement } from 'react'

import { buildAcceptanceLetterElement } from '@/lib/pdf/documents/AcceptanceLetter'
import type { AcceptanceLetterData } from '@/lib/pdf'

type Preset = {
  label: string
  data: AcceptanceLetterData
}

const baseData = {
  applicationNumber: 'APP-20260608-7K3M9XQ2',
  studentName: 'Mary Kasonde',
  studentAddress: 'P.O. Box 71234, Ndola, Zambia',
  intake: 'July 2026 Intake',
  approvedDate: '2026-06-08T08:00:00Z',
}

const presets: Preset[] = [
  {
    label: 'MIHAS — Registered Nursing',
    data: { ...baseData, program: 'Diploma in Registered Nursing', institution: 'Mukuba Institute of Health and Applied Sciences' },
  },
  {
    label: 'KATC — Clinical Medicine (COG)',
    data: { ...baseData, program: 'Diploma in Clinical Medicine', institution: 'Kalulushi Training Centre' },
  },
  {
    label: 'KATC — Environmental Health (EHT)',
    data: { ...baseData, program: 'Diploma in Environmental Health', institution: 'KATC' },
  },
  {
    label: 'MIHAS — Registered Nursing (Conditional)',
    data: {
      ...baseData,
      program: 'Diploma in Registered Nursing',
      institution: 'MIHAS',
      conditional: true,
      conditions: [
        { description: 'Submit your original ECZ Grade 12 certificate for verification.', deadline: '2026-06-25' },
        { description: 'Provide a medical fitness certificate from a registered practitioner.' },
      ],
    },
  },
]

export default function AcceptanceLetterPreview() {
  const [index, setIndex] = useState(0)
  const [element, setElement] = useState<ReactElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setElement(null)
    setError(null)
    const preset = presets[index] ?? presets[0]!
    buildAcceptanceLetterElement(preset.data)
      .then((el) => { if (alive) setElement(el) })
      .catch((e) => { if (alive) setError(String(e?.message ?? e)) })
    return () => { alive = false }
  }, [index])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', gap: 8, padding: 12, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'center' }}>
        <strong style={{ marginRight: 8 }}>Acceptance Letter Preview (dev only)</strong>
        {presets.map((p, i) => (
          <button
            key={p.label}
            onClick={() => setIndex(i)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              background: i === index ? '#0d5bd7' : '#fff',
              color: i === index ? '#fff' : '#1e293b',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {error ? (
        <pre style={{ padding: 16, color: '#b91c1c' }}>{error}</pre>
      ) : element ? (
        <PDFViewer style={{ flex: 1, border: 'none', width: '100%' }} showToolbar>
          {element}
        </PDFViewer>
      ) : (
        <div style={{ padding: 16, color: '#64748b' }}>Rendering…</div>
      )}
    </div>
  )
}
