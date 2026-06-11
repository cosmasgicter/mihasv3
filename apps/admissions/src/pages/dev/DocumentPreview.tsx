/**
 * DEV-ONLY document preview — renders all three branded PDFs (acceptance
 * letter, application slip, payment receipt) live in the browser with a
 * doc-type + variant selector. Only mounted when `import.meta.env.DEV` is
 * true (see App.tsx); never shipped in production builds.
 */

import { PDFViewer } from '@react-pdf/renderer'
import { useEffect, useMemo, useState, type ReactElement } from 'react'

import { buildAcceptanceLetterElement } from '@/lib/pdf/documents/AcceptanceLetter'
import { buildApplicationSlipElement } from '@/lib/pdf/documents/ApplicationSlip'
import { buildPaymentReceiptElement } from '@/lib/pdf/documents/PaymentReceipt'

type DocBuild = () => Promise<ReactElement>

interface PreviewItem {
  group: 'Acceptance Letter' | 'Application Slip' | 'Payment Receipt'
  label: string
  build: DocBuild
}

const studentName = 'Mary Kasonde'
const longName = 'Mwansa-Chimfwembe Kapyepye-Nakamba Sikazwe-Mukelabai Wamundila III'

const items: PreviewItem[] = [
  // ── Acceptance Letter ──
  {
    group: 'Acceptance Letter',
    label: 'MIHAS — Registered Nursing',
    build: () =>
      buildAcceptanceLetterElement({
        applicationNumber: 'APP-20260608-7K3M9XQ2',
        studentName,
        studentAddress: 'P.O. Box 71234, Ndola, Zambia',
        studentNumber: 'MIHAS/26/00042',
        program: 'Diploma in Registered Nursing',
        institution: 'Mukuba Institute of Health and Applied Sciences',
        intake: 'July 2026 Intake',
        approvedDate: '2026-06-08T08:00:00Z',
      }),
  },
  {
    group: 'Acceptance Letter',
    label: 'KATC — Clinical Medicine (COG)',
    build: () =>
      buildAcceptanceLetterElement({
        applicationNumber: 'APP-20260608-COG00123',
        studentName,
        studentAddress: 'P.O. Box 23597, Kalulushi, Zambia',
        studentNumber: 'KATC/26/00007',
        program: 'Diploma in Clinical Medicine',
        institution: 'Kalulushi Training Centre',
        intake: '',
        approvedDate: '2026-06-08T08:00:00Z',
      }),
  },
  {
    group: 'Acceptance Letter',
    label: 'KATC — Environmental Health (EHT)',
    build: () =>
      buildAcceptanceLetterElement({
        applicationNumber: 'APP-20260608-EHT00088',
        studentName,
        studentAddress: 'P.O. Box 23597, Kalulushi, Zambia',
        studentNumber: 'KATC/26/00031',
        program: 'Diploma in Environmental Health',
        institution: 'KATC',
        intake: 'July 2026 Intake',
        approvedDate: '2026-06-08T08:00:00Z',
      }),
  },
  {
    group: 'Acceptance Letter',
    label: 'MIHAS — Conditional + edge case (long name, Sept offer → Jan 2027)',
    build: () =>
      buildAcceptanceLetterElement({
        applicationNumber: 'APP-20260915-VERYLONGCODE9999',
        studentName: longName,
        studentAddress: 'Plot 99999 Off A Very Long Street Name Indeed, P.O. Box 999999, Some Long Town, Zambia',
        studentNumber: 'MIHAS/26/99999',
        program: 'Diploma in Registered Nursing',
        institution: 'MIHAS',
        intake: '',
        approvedDate: '2026-09-15T08:00:00Z',
        conditional: true,
        conditions: [
          { description: 'Submit your original ECZ Grade 12 certificate, all supporting transcripts, and a certified copy of your National Registration Card for verification.', deadline: '2026-09-30' },
          { description: 'Provide a medical fitness certificate from a registered practitioner.' },
        ],
      }),
  },
  // ── Application Slip ──
  {
    group: 'Application Slip',
    label: 'MIHAS — submitted (deferred)',
    build: () =>
      buildApplicationSlipElement({
        public_tracking_code: 'TRK-MIHAS2026ABCDEF',
        application_number: 'APP-20260608-7K3M9XQ2',
        status: 'submitted',
        payment_status: 'deferred',
        submitted_at: '2026-06-08T08:00:00Z',
        updated_at: null,
        program_name: 'Diploma in Registered Nursing',
        intake_name: 'July 2026 Intake',
        institution: 'Mukuba Institute of Health and Applied Sciences',
        full_name: studentName,
        email: 'mary.kasonde@example.com',
        phone: '+260 977 123456',
        nationality: 'Zambian',
      }),
  },
  {
    group: 'Application Slip',
    label: 'KATC — under review (long name edge case)',
    build: () =>
      buildApplicationSlipElement({
        public_tracking_code: 'TRK-KATC2026ABCDEF',
        application_number: 'APP-20260608-VERYLONGCODE9999',
        status: 'under_review',
        payment_status: 'successful',
        submitted_at: '2026-06-08T08:00:00Z',
        updated_at: null,
        program_name: 'Diploma in Environmental Health (Distance, Part-Time)',
        intake_name: 'July 2026 Intake',
        institution: 'Kalulushi Training Centre',
        full_name: longName,
        email: 'very.long.email.address.indeed@students.example.edu.zm',
        phone: '+260 977 123456',
        nationality: 'Zambian',
      }),
  },
  // ── Payment Receipt ──
  {
    group: 'Payment Receipt',
    label: 'MIHAS — Airtel Money (ZMW)',
    build: () =>
      buildPaymentReceiptElement({
        receiptNumber: 'RCP-20260608-AB12CD',
        applicationNumber: 'APP-20260608-7K3M9XQ2',
        studentName,
        email: 'mary.kasonde@example.com',
        phone: '+260 977 123456',
        program: 'Diploma in Registered Nursing',
        institution: 'Mukuba Institute of Health and Applied Sciences',
        amount: 153,
        currency: 'ZMW',
        paymentMethod: 'Airtel Money',
        paymentReference: 'LENCO-7K3M9XQ2',
        paymentDate: '2026-06-08T08:00:00Z',
        verifiedDate: '2026-06-08T09:00:00Z',
        verifiedBy: 'Finance Office',
      }),
  },
  {
    group: 'Payment Receipt',
    label: 'KATC — Card (long name edge case)',
    build: () =>
      buildPaymentReceiptElement({
        receiptNumber: 'RCP-20260608-LONG99',
        applicationNumber: 'APP-20260608-VERYLONGCODE9999',
        studentName: longName,
        email: 'very.long.email.address.indeed@students.example.edu.zm',
        phone: '+260 977 123456',
        program: 'Diploma in Environmental Health (Distance, Part-Time)',
        institution: 'Kalulushi Training Centre',
        amount: 153,
        currency: 'ZMW',
        paymentMethod: 'Card (Visa)',
        paymentReference: 'LENCO-XXXXXXXXXXXX',
        paymentDate: '2026-06-08T08:00:00Z',
        verifiedDate: '2026-06-08T09:00:00Z',
        verifiedBy: 'Finance Officer With A Long Name',
      }),
  },
]

export default function DocumentPreview() {
  const [index, setIndex] = useState(0)
  const [element, setElement] = useState<ReactElement | null>(null)
  const [error, setError] = useState<string | null>(null)

  const current = items[index] ?? items[0]!

  useEffect(() => {
    let alive = true
    setElement(null)
    setError(null)
    current
      .build()
      .then((el) => { if (alive) setElement(el) })
      .catch((e) => { if (alive) setError(String(e?.message ?? e)) })
    return () => { alive = false }
  }, [index])

  // Group buttons by document type for a tidy toolbar.
  const groups = useMemo(() => {
    const map = new Map<string, { item: PreviewItem; i: number }[]>()
    items.forEach((item, i) => {
      const list = map.get(item.group) ?? []
      list.push({ item, i })
      map.set(item.group, list)
    })
    return [...map.entries()]
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ padding: 12, borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>MIHAS / KATC document preview (dev only)</strong>
        {groups.map(([group, entries]) => (
          <div key={group} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ width: 130, fontSize: 12, color: '#64748b' }}>{group}</span>
            {entries.map(({ item, i }) => (
              <button
                key={item.label}
                onClick={() => setIndex(i)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  background: i === index ? '#0d5bd7' : '#fff',
                  color: i === index ? '#fff' : '#1e293b',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
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
