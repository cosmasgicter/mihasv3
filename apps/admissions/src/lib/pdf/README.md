# MIHAS-KATC PDF Document System

Student-facing PDFs (application slip, payment receipt, acceptance letter) are
rendered client-side with [`@react-pdf/renderer`](https://react-pdf.org/) v4.

Source lives in `apps/admissions/src/lib/pdf/`. All external callers import
from the barrel:

```ts
import {
  generateApplicationSlip,
  generatePaymentReceipt,
  generateAcceptanceLetter,
  type ApplicationSlipData,
  type PaymentReceiptData,
  type AcceptanceLetterData,
} from '@/lib/pdf'

const blob = await generateApplicationSlip(data)
```

Each generator returns `Promise<Blob>` with MIME `application/pdf`.

---

## Directory layout

```
apps/admissions/src/lib/pdf/
├── theme/
│   ├── colors.ts          # ink scale + 3 accent colors
│   ├── typography.ts      # Font.register + typeScale + textStyles presets
│   ├── spacing.ts         # 4pt baseline + A4 dims + radius + border widths
│   └── index.ts           # barrel + logos + institutions
├── components/
│   ├── BrandHeader.tsx       # logo + institution name + doc-type banner
│   ├── BrandFooter.tsx       # fixed footer with auto page numbering
│   ├── MetadataStrip.tsx     # reference · issued · status row
│   ├── SectionHeading.tsx    # Playfair Display headings with optional gold underline
│   ├── LabeledField.tsx      # UPPERCASE label + value (mono/strong/fallback variants)
│   ├── FieldGrid.tsx         # 1- or 2-column layout of LabeledFields
│   ├── StatusBadge.tsx       # pill: verified / approved / conditional / pending
│   ├── VerificationBlock.tsx # QR code + "Scan to verify" caption
│   ├── SignatureBlock.tsx    # name + role + institution; optional scan image
│   └── PageFrame.tsx         # A4 Page with fixed header/footer — the doc shell
├── documents/
│   ├── ApplicationSlip.tsx
│   ├── PaymentReceipt.tsx
│   ├── AcceptanceLetter.tsx  # handles both unconditional + conditional variants
│   └── types.ts              # input data shapes + DEFAULT_SIGNATORY
├── qr.ts                     # buildQrDataUrl() — JSON payload → PNG data URL
├── render.ts                 # renderToBlob() — the single async render seam
└── index.ts                  # public barrel
```

---

## Design tokens

### Colors (print-safe, WCAG AA on white)

| Token      | Hex       | Contrast | Use |
|------------|-----------|----------|-----|
| `ink-900`  | `#0B1F3A` | 16.6:1   | body text, titles |
| `ink-700`  | `#1D3557` | 11.5:1   | section headings |
| `ink-500`  | `#5C6B7A` | 5.1:1    | labels, metadata |
| `ink-300`  | `#B8C3CF` | 2.3:1    | dividers only (not text) |
| `ink-50`   | `#F3F6FA` | —        | subtle surface |
| `gold`     | `#A67C00` | 5.4:1    | one decorative accent per doc |
| `green`    | `#2F6B3A` | 7.6:1    | verified / paid / approved |
| `red`      | `#8B1E3F` | 8.4:1    | conditional warnings only |

### Typography

| Slot       | Face              | Weights        |
|------------|-------------------|----------------|
| Display    | Playfair Display  | 600, 700       |
| Body       | Source Sans 3     | 400, 600       |
| Monospace  | JetBrains Mono    | 500            |

TTF files live in `apps/admissions/public/fonts/pdf/`. Registered once per
session via `registerPdfFonts()` in `theme/typography.ts`; idempotent.

### Spacing

4-point baseline grid. Numeric keys on `spacing` (e.g. `spacing[4] = 16pt`)
and semantic aliases on `space` (e.g. `space.sectionGap = 32pt`).

---

## Adding a new document type

1. Add an input-data shape to `documents/types.ts`.
2. Create `documents/MyDoc.tsx` that returns a `<Document>` with one
   `<PageFrame>` child. Use the existing primitives — avoid raw `<View>`
   unless you really need custom layout.
3. Export a `generateMyDoc(data): Promise<Blob>` wrapper that builds a QR
   payload (if applicable) and calls `renderToBlob(<MyDocDocument ... />)`.
4. Wire it through the public barrel in `index.ts`.
5. Add a unit test under `tests/unit/pdf/myDoc.test.tsx` that mocks
   `@react-pdf/renderer`, calls the generator, and verifies the returned
   Blob + QR payload structure.

Keep the shell consistent: every doc has `BrandHeader` via `PageFrame`, a
document title, a `MetadataStrip`, section headings, a body, and a
`VerificationBlock`. Optional: `SignatureBlock` for letters.

---

## Page-break discipline

Documents should fit one page for typical content. When content is legitimately
long (conditional acceptance with many conditions), mark each logical unit
with `<View wrap={false}>` so it won't split across pages. `PageFrame`
repeats `BrandHeader` and `BrandFooter` on any continuation page — this is
the fix for the pre-migration "orphaned page 2" bug.

---

## QR verification contract

Every document carries a QR at the bottom-right that encodes a small JSON
blob:

```json
{
  "type": "application_slip" | "payment_receipt" | "acceptance_letter" | "conditional_acceptance",
  ...document-specific fields...
}
```

Payload is built in the document's generator function via `buildQrDataUrl()`
(`qr.ts`). Keep payloads small — <300 bytes encoded — so they remain scannable
with error-correction level M at 80 pt render size.

---

## Testing

Tests under `tests/unit/pdf/` mock `@react-pdf/renderer` so they run in jsdom
without the full layout engine:

```ts
vi.mock('@react-pdf/renderer', async () => { /* stubbed primitives */ })
```

This lets us verify:
- Element trees construct without throwing
- Props flow through correctly
- QR payloads contain the expected fields
- Required fields trigger the expected errors

For visual regressions against real rendered PDFs, capture sample PDFs
manually and compare in a PDF viewer before releases.

---

## Known constraints

- `@react-pdf/renderer` supports PNG and JPEG images only. Logos are `.png`.
- Custom fonts are loaded from same-origin `/fonts/pdf/`. If the server is
  offline, rendering falls back to Helvetica.
- Bundle size: `@react-pdf/renderer` adds ~500 KB ungzipped. Mitigated by
  dynamic import inside `renderToBlob()` — bundle is only pulled in on
  first PDF download.

---

## Migration history

This system replaced a jsPDF + `jspdf-autotable` implementation for **student-
facing branded documents** in the May 2026 PDF redesign. The old generators
lived at:

- `apps/admissions/src/lib/applicationSlipPdf.ts`
- `apps/admissions/src/lib/receiptGenerator.ts`
- `apps/admissions/src/lib/acceptanceLetterGenerator.ts`
- `apps/admissions/src/lib/pdfLayout.ts`

All four files are deleted. Rationale: the ADR at
`docs/adrs/ADR-008-react-pdf-adoption.md`.

## Scope boundary — where jsPDF is still used

`jspdf` and `jspdf-autotable` remain as dependencies for **admin-only large-
table exports** that are structurally different from branded documents:

- `src/lib/auditExports.ts::exportAuditEntriesToPdf` — audit trail export
  with potentially thousands of rows, consumed only by admins.
- `src/lib/exportUtils.ts::exportToPDF` — applications roster export, also
  admin-only, also table-heavy.

These are pure tabular outputs with no typography, logos, or signatures.
@react-pdf is optimized for composed documents with layout, fonts, and
flexbox — it's a poor fit for a 2,000-row audit table. Keeping jsPDF for
those exports is an intentional tooling split.

If we later need admin PDF exports that **do** have institutional branding
(e.g. an admissions statistics report for the board), those should be built
in `@/lib/pdf` following the same component system as the student-facing
documents.
