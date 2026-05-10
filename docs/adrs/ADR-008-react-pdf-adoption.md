# ADR-008: Adopt `@react-pdf/renderer` for student-facing PDFs

**Status:** Accepted
**Date:** 2026-05-10
**Deciders:** Cosmas Kanchepa (CTO/Founder), with approval from the admissions lead

---

## Context

Three PDFs are sent or downloaded by every successful applicant:

1. **Application slip** — confirmation after submission.
2. **Payment receipt** — issued when a fee is verified.
3. **Acceptance letter** — formal offer of admission (unconditional or conditional).

Prior to May 2026 these were generated client-side with [`jsPDF`](https://github.com/parallax/jsPDF)
and `jspdf-autotable`, in the files:

- `apps/admissions/src/lib/applicationSlipPdf.ts`
- `apps/admissions/src/lib/receiptGenerator.ts`
- `apps/admissions/src/lib/acceptanceLetterGenerator.ts`

The jsPDF approach had three chronic problems visible in production:

1. **Visible text overlap.** The payment receipt drew the "AMOUNT RECEIVED"
   box at `y - 18` while the "PAYMENT DETAILS" heading was at `y` — one
   overlapped the other whenever the content stacked at certain heights.
2. **2-page spill with orphaned headers.** Documents routinely broke onto
   a second page; the continuation page showed no brand header because
   `ensurePdfSpace` added a page without redrawing the letterhead.
3. **Conditional acceptance condition lists broke mid-sentence** because
   the generator had no page-break-awareness inside the loop.

Root cause: jsPDF is an imperative y-cursor API with manual text metrics
(`splitTextToSize`) and no declarative element layout. It works fine for
simple one-page outputs but is fragile when content length varies.

---

## Decision

Migrate all three documents to [`@react-pdf/renderer`](https://react-pdf.org/)
v4, a React-based PDF engine that:

- Uses a yoga layout engine under the hood (same as React Native) — text
  metrics and flexbox are automatic.
- Supports declarative page-break hints via `<View wrap={false}>` and
  `fixed` positioning for repeating headers/footers.
- Registers custom fonts via `Font.register()` — we use Playfair Display,
  Source Sans 3, and JetBrains Mono, served from same-origin
  `/fonts/pdf/`.
- Lets us compose documents out of typed, testable React components.

The public API is preserved:

```ts
generateApplicationSlip(data: ApplicationSlipData): Promise<Blob>
generatePaymentReceipt(data: PaymentReceiptData): Promise<Blob>
generateAcceptanceLetter(data: AcceptanceLetterData): Promise<Blob>
```

Call sites did not need to change; the internal implementation rotated behind
a thin re-export shim for one release, then the shims were deleted in Task 11
of the migration.

---

## Alternatives considered

### Option A — Surgical fix of the jsPDF generators
Keep jsPDF; fix the specific overlap bugs; tighten layouts to fit one page.
**Rejected** because the ceiling is "non-broken," not "industry-leading."
The imperative y-cursor code is structurally hostile to variable-length
content.

### Option B — Redesign with the same stack
Keep jsPDF but rebuild the visual system with better discipline.
**Rejected** because it leaves the architectural fragility in place —
future documents would hit the same problems.

### Option D — HTML-to-PDF via browser print
Leverage browser print-to-PDF with HTML templates + CSS `@page` rules.
**Rejected** because output quality depends on the browser's print engine
and is inconsistent across Chrome/Safari/Firefox. Institutional documents
need pixel-stable output.

### Option E — Server-side PDF rendering with headless Chromium
Render HTML in a headless Chrome instance server-side via Playwright or
puppeteer and stream the PDF back.
**Rejected** because it adds a backend service dependency, introduces a
new failure mode during the most sensitive flow (receipts immediately
after payment), and costs $ on Koyeb.

---

## Consequences

### Positive

- **Overlap eliminated.** Flexbox layout can't produce overlapping siblings.
- **Page-break discipline.** `<View wrap={false}>` keeps conditions together.
  `fixed` headers + footers repeat on every page automatically.
- **Shared design system** — new `apps/admissions/src/lib/pdf/theme/` tokens
  and primitive components are reusable across documents. Adding a fourth
  document type is now a 1-file addition under `documents/`.
- **Custom typography.** Playfair Display for institutional headings; Source
  Sans 3 for body; JetBrains Mono for reference codes. Registered once,
  cached by the browser after the first download.
- **Logo integration.** Both institution marks (MIHAS + KATC) appear on
  every document header.
- **Signatory system.** `DEFAULT_SIGNATORY` = Dr Solomon Musonda, MD (Managing Director)
  of Admissions. Overridable per document via `signatoryName` /
  `signatoryRole` props on acceptance letters.
- **Test ergonomics improved.** JSX element trees are easier to mock than
  imperative `doc.text()` calls. 105 admissions-side tests now cover the
  new system.

### Negative

- **Bundle size: `vendor-pdf-*.js` measures 602 KB raw / 173 KB gzipped** (measured via `bun run build` in May 2026). The chunk isolates `@react-pdf/renderer` + its transitive dependencies (yoga, fontkit, pdfkit). It is dynamically imported by `renderToBlob` and only downloaded when a student clicks "Download" on a document — never in the initial page-load path.
- **Context — other PDF chunks already in the bundle.** `jspdf` ships 156 KB / 51 KB gz, `html2canvas` 199 KB / 45 KB gz, `pdf-lib` + UPNG 164 KB / 111 KB gz. Keeping `jspdf` for admin table exports (see *Scope boundary* in `pdf/README.md`) is an intentional split — all these chunks are lazy-loaded behind explicit user actions.
- **Total PDF-tooling footprint: ~1.1 MB raw / ~380 KB gzipped.** Acceptable because every byte is lazy-loaded, cached after first download, and students download documents rarely (once per application milestone).
- **Adds a dependency** (`@react-pdf/renderer@^4.5.1`) alongside the existing `jspdf` + `jspdf-autotable`. The scope split is documented in `pdf/README.md`.
- **Custom fonts must be served from the same origin.** If the server is offline, the engine falls back to Helvetica — still legible but not institutional. Acceptable risk.
- **WebP images are not supported** by `@react-pdf`. Logo assets in the `/public/images/logos/` folder are kept as `.png` for PDF consumption.

### Rebuild the measurement

```bash
cd apps/admissions
VITE_API_BASE_URL=https://api.example.com \
VITE_APP_BASE_URL=https://app.example.com \
VITE_APP_VERSION=0.0.0-bundle-measure \
VITE_GLITCHTIP_DSN=https://dummy@glitchtip.example.com/1 \
VITE_SITE_URL=https://app.example.com \
bun run build

# Per-chunk gzipped size:
cd dist/assets/js
for f in vendor-pdf-*.js; do
  gz=$(gzip -c9 < "$f" | wc -c)
  echo "$f: gzip=$gz B"
done
```

Re-run after any `@react-pdf/renderer` upgrade.

---

## Rollout

The migration ran in 12 tasks (May 2026) with incremental commits and
hard review checkpoints after Task 5, Task 7, and Task 10. Each task
ended with passing tests and a clean TypeScript + ESLint run. The old
generators remained functional until Task 11 via shim re-exports.

No downtime. No API contract changes. Zero production regressions reported.

---

## References

- `@react-pdf/renderer` documentation — https://react-pdf.org/
- PDF system README — `apps/admissions/src/lib/pdf/README.md`
- Email system README (shared design tokens) — `backend/apps/common/email/README.md`
- Test suites — `apps/admissions/tests/unit/pdf/*.test.tsx`,
  `backend/tests/unit/test_email_component_system.py`,
  `backend/tests/unit/test_email_messages.py`
