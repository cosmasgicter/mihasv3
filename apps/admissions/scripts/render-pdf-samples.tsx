/**
 * Sample-render script: generates the three documents with realistic data
 * and writes them to /tmp. Not part of the production build — only used
 * during QA review to eyeball the output.
 *
 * Run:
 *   cd apps/admissions
 *   bun run scripts/render-pdf-samples.tsx
 */

import React from 'react'
import ReactPDF from '@react-pdf/renderer'
import * as path from 'node:path'
import * as url from 'node:url'

// Disable the registerPdfFonts guard so our manual registrations aren't
// overwritten by the fetch-based URLs inside typography.ts.
import { __resetFontRegistration, registerPdfFonts } from '../src/lib/pdf/theme'

// We also need to intercept image loads for the logo.
// Skip the logos by turning off showLogo=false in samples below.

import { generateApplicationSlip } from '../src/lib/pdf/documents/ApplicationSlip'
import { generatePaymentReceipt } from '../src/lib/pdf/documents/PaymentReceipt'
import { generateAcceptanceLetter } from '../src/lib/pdf/documents/AcceptanceLetter'

import * as fs from 'node:fs/promises'

// Patch the logos dictionary used by BrandHeader (via getInstitution) so the
// sample PDFs actually show the institution logos, not the ENOENT fallback.
import { institutions } from '../src/lib/pdf/theme'

// Monkey-patch the font URLs so @react-pdf can load from the local file
// system during Node rendering (normally served same-origin from /fonts/).
const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const fontsBase = path.resolve(__dirname, '../public/fonts/pdf')

// Override the font paths by registering directly with the Node file URLs.
const { Font } = ReactPDF
Font.register({
  family: 'Playfair Display',
  fonts: [
    { src: `${fontsBase}/playfair-display-v40-latin-600.ttf`, fontWeight: 600 },
    { src: `${fontsBase}/playfair-display-v40-latin-700.ttf`, fontWeight: 700 },
  ],
})
Font.register({
  family: 'Source Sans 3',
  fonts: [
    { src: `${fontsBase}/source-sans-3-v19-latin-regular.ttf`, fontWeight: 400 },
    { src: `${fontsBase}/source-sans-3-v19-latin-600.ttf`, fontWeight: 600 },
  ],
})
Font.register({
  family: 'JetBrains Mono',
  fonts: [{ src: `${fontsBase}/jetbrains-mono-v24-latin-500.ttf`, fontWeight: 500 }],
})
Font.register({
  family: 'Pinyon Script',
  fonts: [{ src: `${fontsBase}/pinyon-script-v24-latin-regular.ttf`, fontWeight: 400 }],
})
Font.registerHyphenationCallback((word) => [word])
__resetFontRegistration()
// Prevent the library's own registerPdfFonts from running (our registrations above
// already set up the fonts with absolute file paths that Node can load).
const noop = () => {}
;(registerPdfFonts as unknown as { _overridden?: boolean })._overridden = true

// In production, @react-pdf fetches images from absolute URLs served by the
// frontend (e.g. /images/signatures/solomon-musonda.png). Under Node there is
// no HTTP server, so we resolve any /public-rooted path to an absolute
// filesystem path that @react-pdf can read directly via fs.
const publicDir = path.resolve(__dirname, '../public')
function publicFilePath(publicPath: string): string {
  return path.resolve(publicDir, publicPath.replace(/^\//, ''))
}
for (const inst of Object.values(institutions) as Array<{
  logoMark: string
  logoFull: string
}>) {
  ;(inst as { logoMark: string }).logoMark = publicFilePath(inst.logoMark)
  ;(inst as { logoFull: string }).logoFull = publicFilePath(inst.logoFull)
}

// Resolved absolute filesystem path for Dr Musonda's scanned signature.
const signatureImageFile = publicFilePath('/images/signatures/solomon-musonda.png')

async function main() {
  console.log('Rendering sample PDFs...')

  // Sample: Application Slip
  const slipBlob = await generateApplicationSlip({
    application_number: 'APP-20260510-ABCD1234',
    public_tracking_code: 'TRK-DEMOABC123456',
    status: 'under_review',
    payment_status: 'successful',
    submitted_at: '2026-05-09T12:30:00Z',
    updated_at: '2026-05-10T08:00:00Z',
    program_name: 'Diploma in Registered Nursing',
    intake_name: 'January 2027',
    institution: 'MIHAS',
    full_name: 'Bwalya Chanda',
    email: 'bwalya.chanda@example.com',
    phone: '+260 977 000 000',
    nationality: 'Zambian',
  })
  await fs.writeFile('/tmp/mihas-sample-application-slip.pdf', Buffer.from(await slipBlob.arrayBuffer()))
  console.log('✓ /tmp/mihas-sample-application-slip.pdf')

  // Sample: Payment Receipt (ZMW)
  const receiptBlob = await generatePaymentReceipt({
    receiptNumber: 'RCP-20260510-00042',
    applicationNumber: 'APP-20260510-ABCD1234',
    studentName: 'Bwalya Chanda',
    email: 'bwalya.chanda@example.com',
    phone: '+260 977 000 000',
    program: 'Diploma in Registered Nursing',
    institution: 'MIHAS',
    amount: 150,
    currency: 'ZMW',
    paymentMethod: 'Airtel Money',
    paymentReference: 'LENCO-XZQ29481',
    paymentDate: '2026-05-09T15:30:00Z',
    verifiedDate: '2026-05-10T08:15:00Z',
    verifiedBy: 'admin@mihas.edu.zm',
  })
  await fs.writeFile('/tmp/mihas-sample-receipt-zmw.pdf', Buffer.from(await receiptBlob.arrayBuffer()))
  console.log('✓ /tmp/mihas-sample-receipt-zmw.pdf')

  // Sample: Payment Receipt (USD)
  const receiptUsdBlob = await generatePaymentReceipt({
    receiptNumber: 'RCP-20260510-00043',
    applicationNumber: 'APP-20260510-INTL1234',
    studentName: 'Ana Martinez',
    email: 'ana.martinez@example.com',
    phone: '+27 82 123 4567',
    program: 'Diploma in Clinical Medicine',
    institution: 'KATC',
    amount: 20,
    currency: 'USD',
    paymentMethod: 'Card',
    paymentDate: '2026-05-09T15:30:00Z',
    verifiedDate: '2026-05-10T08:15:00Z',
    verifiedBy: 'admin@mihas.edu.zm',
  })
  await fs.writeFile('/tmp/mihas-sample-receipt-usd.pdf', Buffer.from(await receiptUsdBlob.arrayBuffer()))
  console.log('✓ /tmp/mihas-sample-receipt-usd.pdf')

  // Sample: Unconditional Acceptance Letter
  const acceptanceBlob = await generateAcceptanceLetter({
    applicationNumber: 'APP-20260510-ABCD1234',
    studentName: 'Bwalya Chanda',
    program: 'Diploma in Registered Nursing',
    institution: 'MIHAS',
    intake: 'January 2027',
    approvedDate: '2026-10-15T08:00:00Z',
    startDate: '2027-01-12T00:00:00Z',
    signatureImage: signatureImageFile,
  })
  await fs.writeFile('/tmp/mihas-sample-acceptance-unconditional.pdf', Buffer.from(await acceptanceBlob.arrayBuffer()))
  console.log('✓ /tmp/mihas-sample-acceptance-unconditional.pdf')

  // Sample: Conditional Acceptance Letter (2 conditions — typical)
  const conditionalShortBlob = await generateAcceptanceLetter({
    applicationNumber: 'APP-20260510-ABC9988',
    studentName: 'Kunda Phiri',
    program: 'Diploma in Clinical Medicine',
    institution: 'KATC',
    intake: 'January 2027',
    approvedDate: '2026-10-15T08:00:00Z',
    startDate: '2027-01-12T00:00:00Z',
    conditional: true,
    conditions: [
      { description: 'Submit original ECZ School Certificate.', deadline: '2026-12-01' },
      { description: 'Complete the medical fitness assessment.', deadline: '2026-12-15' },
    ],
    signatureImage: signatureImageFile,
  })
  await fs.writeFile('/tmp/mihas-sample-acceptance-conditional-2conds.pdf', Buffer.from(await conditionalShortBlob.arrayBuffer()))
  console.log('✓ /tmp/mihas-sample-acceptance-conditional-2conds.pdf')

  // Sample: Conditional Acceptance Letter (4 conditions — stress test)
  const conditionalBlob = await generateAcceptanceLetter({
    applicationNumber: 'APP-20260510-XYZ9876',
    studentName: 'Mwamba Tembo',
    program: 'Diploma in Environmental Health',
    institution: 'KATC',
    intake: 'January 2027',
    approvedDate: '2026-10-15T08:00:00Z',
    startDate: '2027-01-12T00:00:00Z',
    conditional: true,
    conditions: [
      { description: 'Submit original ECZ School Certificate.', deadline: '2026-12-01' },
      { description: 'Provide proof of English proficiency (minimum Credit).' },
      { description: 'Complete the medical fitness assessment through an accredited provider.', deadline: '2026-12-15' },
      { description: 'Pay the Year 1 tuition deposit of K2,500.', deadline: '2026-12-31' },
    ],
    signatureImage: signatureImageFile,
  })
  await fs.writeFile('/tmp/mihas-sample-acceptance-conditional.pdf', Buffer.from(await conditionalBlob.arrayBuffer()))
  console.log('✓ /tmp/mihas-sample-acceptance-conditional.pdf')

  console.log('\nAll samples rendered. File sizes:')
  for (const filename of [
    'mihas-sample-application-slip.pdf',
    'mihas-sample-receipt-zmw.pdf',
    'mihas-sample-receipt-usd.pdf',
    'mihas-sample-acceptance-unconditional.pdf',
    'mihas-sample-acceptance-conditional-2conds.pdf',
    'mihas-sample-acceptance-conditional.pdf',
  ]) {
    const stat = await fs.stat(`/tmp/${filename}`)
    console.log(`  ${(stat.size / 1024).toFixed(1).padStart(8)} KB   /tmp/${filename}`)
  }
}

void noop
void main().catch((err) => {
  console.error('Render failed:', err)
  process.exit(1)
})
