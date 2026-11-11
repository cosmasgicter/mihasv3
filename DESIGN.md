# DESIGN.md

> Google Stitch DESIGN.md format. Six sections in fixed order. Read by Impeccable
> on every command. Mirrors the actual tokens, fonts, and components shipping in
> `apps/admissions/src/styles/design-tokens.css` and `apps/admissions/tailwind.config.js`.

## 1. Color

WCAG AA-compliant palette. Every contrast ratio is documented inline in
`apps/admissions/src/styles/design-tokens.css`. Token names use CSS custom
properties with RGB triplets so Tailwind can apply alpha modifiers
(`bg-primary/50`, `text-foreground/60`).

### Brand & semantic

| Token | Hex | Usage | Contrast on white |
|-------|-----|-------|-------------------|
| `--color-primary` | `#2563eb` | Buttons, links, focus ring | 4.52 : 1 (AA) |
| `--color-primary-hover` | `#1d4ed8` | Hover state | 5.93 : 1 (AA) |
| `--color-primary-active` | `#1e40af` | Pressed state | 7.04 : 1 (AAA) |
| `--color-primary-foreground` | `#ffffff` | Text on primary | 21 : 1 |
| `--color-secondary` | `#e0e7ff` | Light surface accent | – |
| `--color-secondary-foreground` | `#1e293b` | Text on secondary | 8.32 : 1 |
| `--color-accent` | `#dbeafe` | Subtle accent surface | – |
| `--color-accent-foreground` | `#1e40af` | Text on accent | 7.04 : 1 |

### Neutrals

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-background` | `#ffffff` | Page background |
| `--color-foreground` | `#0f172a` | Default text (19.07 : 1) |
| `--color-muted` | `#f1f5f9` | Subtle row / section backgrounds |
| `--color-muted-foreground` | `#374151` | Secondary text (7.59 : 1 on muted) |
| `--color-border` | `#6b7280` | Visible borders (4.83 : 1 — visible to low-vision users) |
| `--color-input` | `#6b7280` | Input borders |
| `--color-ring` | `#2563eb` | Focus ring |
| `--color-card` | `#ffffff` | Card surface |
| `--color-card-foreground` | `#0f172a` | Card text |
| `--color-popover` | `#ffffff` | Popover surface |
| `--color-popover-foreground` | `#0f172a` | Popover text |

### Status

| Token | Hex | Contrast on white | Pair with |
|-------|-----|-------------------|-----------|
| `--color-destructive` | `#dc2626` | 5.25 : 1 | `--color-destructive-foreground: #ffffff` |
| `--color-warning` | `#b45309` | 4.52 : 1 | `--color-warning-foreground: #ffffff` |
| `--color-success` | `#047857` | 4.56 : 1 | `--color-success-foreground: #ffffff` |
| `--color-info` | `#2563eb` | 4.52 : 1 (= primary) | `--color-info-foreground: #ffffff` |

Status colors are **never used alone**. Pair with an icon (Lucide), a label,
or a status-prefix word ("Failed —", "Verified —"). See `StatusIcon.tsx`.

### Admin-only palette

A separate token set for the admin dashboard so admin and student surfaces
are visually distinct. Defined in
`apps/admissions/src/design-system/tokens.colors.json` and referenced by
`tailwind.config.js`.

| Token | Hex |
|-------|-----|
| `adminColors.bg` | `#f9fafb` |
| `adminColors.card` | `#ffffff` |
| `adminColors.border` | `#858c98` |
| `adminColors.text` | `#111827` |
| `adminColors.textSecondary` | `#374151` |
| `adminColors.textMuted` | `#6b7280` |

### Dark mode

Disabled at the HTML level: `html { color-scheme: light only !important }`
in `index.css`. Re-enabling dark mode is a project-wide design decision and
must follow the dark-mode-pairing rule (light + dark designed together,
contrast verified in both).

## 2. Typography

### Web (admissions + jobs-ops)

| Role | Font family | Weight | Size | Line-height |
|------|-------------|--------|------|-------------|
| Body | `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif` | 400 | 16 px | 1.5 |
| Body (small) | same | 400 | 14 px | 1.5 |
| Heading 1–6 | same | 600 | 32 / 28 / 24 / 20 / 18 / 16 px | 1.2 |
| Code / mono | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` | 400 | 14 px | 1.5 |

- `font-display: swap` is set in `index.css` to prevent FOIT.
- `font-feature-settings: 'kern' 1` and `text-rendering: optimizeLegibility`
  enabled when `font-variation-settings` is supported.
- Inter loads from the user's system if available (`local('Inter')`,
  `local('Inter-Regular')`, `local('InterVariable')`) before falling back
  to the system stack. No external font CDN.

### Print / PDF (acceptance letters, receipts, application slips)
Official documents are rendered on the backend, not in the browser. The
renderers live in `backend/apps/applications/tasks/pdf/` (one module per
document type under `backend/apps/applications/tasks/pdf/renderers/`, the letter
layouts under `backend/apps/applications/tasks/pdf/layouts/`) and are reached through
`GET/POST /api/v1/applications/{id}/official-documents/{document_type}/`
(`backend/apps/applications/official_document_views.py`); the frontend only
calls `apps/admissions/src/services/officialDocuments.ts`.
They draw with reportlab's built-in `Helvetica` and `Helvetica-Bold` faces, so
no font file ships with them. Logos, signatures, seals, signatories and letter
content come from the tenant's `InstitutionDocumentProfile` and
`InstitutionAsset` configuration, with the neutral Beanola fallback when a
tenant has none.
The client `@react-pdf` stack and its bundled fonts were removed by
platform-simplification task 14.1; there is no browser-side PDF renderer for
official documents. Admin large-table exports still use `jspdf` in the
browser (`@/lib/auditExports`, `@/lib/exportUtils`).
### Type scale rule

Use the established scale: 12 / 14 / 16 / 18 / 20 / 24 / 28 / 32 px.
Never introduce ad-hoc sizes. Body text never below 16 px on mobile (avoids
iOS auto-zoom on focus).

## 3. Elevation

Single shadow scale. Applied through Tailwind utilities. Never stack 3 shadows.

| Level | Token / utility | Use |
|-------|-----------------|-----|
| 0 | none | Default surface, in-flow content |
| 1 | `shadow-sm` | Cards, default buttons |
| 2 | `shadow` | Hover state on cards |
| 3 | `shadow-md` | Popovers, dropdowns |
| 4 | `shadow-lg` | Modals, dialogs |
| 5 | `shadow-xl` | Top-level sheets, app shell |

Active / pressed states use `active:scale-[0.98]` on buttons (subtle scale,
no shadow change).

## 4. Components
These are the primitives the app renders: each one is reachable from
`apps/admissions/src/main.tsx` in the import graph of
`scripts/unreferenced-modules.ts`. Use them before building anything new. Every
primitive is keyboard-accessible, focus-trap-aware where modal, and respects
reduced motion. A component that file exists for but no page renders is not
listed; do not build on it.
### Layout / shell
`PageShell`, `PageHeader`, `MobilePageHeader`, `Container`, `Grid`, `Stack`,
`Section`, `SectionCard`, `ResponsiveLayout`, `SafeAreaProvider`,
`AuthenticatedRouteShell`, `BottomNavigation`.
### Inputs
`Button` (variants: default / primary / secondary / outline / ghost / link /
destructive / danger / success / warning / gradient), `PasswordInput`,
`radio-group`, `select`, `form-select`, `CanonicalSelect`, `checkbox`,
`switch`, `input`, `textarea`, `label`, `FileUpload`.
### Feedback
`Alert`, `Banner`, `ErrorBoundary`, `ErrorDisplay` *(returns null on empty
message — never renders empty `role="alert"`)*, `EmptyState`,
`FormErrorAnnouncer`, `Toast`, `InfoCallout`, `AutoSaveIndicator`, `Progress`,
`ButtonSpinner`, `Skeleton`.
The wizard's step indicator is `EnhancedProgressIndicator`
(`apps/admissions/src/pages/student/applicationWizard/components/`), not a
`components/ui` primitive.
### Display
`Card`, `Badge`, `Table`, `ResponsiveTable`, `Pagination`, `Tabs`, `Accordion`,
`Separator`, `Tooltip`, `OptimizedImage` *(WebP/AVIF + `onError` fallback
required for content images)*, `StatusIcon`, `Modal`, `Dialog`, `alert-dialog`,
`dropdown-menu`, `ConfirmDialog`, `ProfileAutoPopulationIndicator`.
### A11y / focus
`SkipLink`, `FormErrorAnnouncer` (announces form errors to screen readers).
### Auth / account
`UserMenu`, `ActiveSessions`.
Development diagnostics only: `BuildVersionBadge` renders on the development server
and is removed from production builds (no badge, no `/health/live/` version
probe). Support reads the backend version from the `X-Backend-Version` header.
### Skeletons
`GuardInlineSkeleton`, plus `components/ui/skeletons/` folder for view-specific
skeleton screens.
### Composition rules

- One container deep. `SectionCard > content`, never `SectionCard > Card > Card`.
- Buttons use `Button asChild` for semantic links. Never wrap a `Link` in a `<button>`.
- Forms use React Hook Form + Zod. Settings forms must protect dirty state on
  navigation and `beforeunload`.
- Lists with 50+ items must virtualise (`react-virtual` already in deps).

## 5. Do's and Don'ts

### Do

- Use `PageShell` + `SectionCard` + `ErrorDisplay` + `EmptyState` + `Button asChild` as the canonical student-page composition.
- Match status colour to status icon (red ! / amber ⚠ / green ✓), and include a status word.
- Use the design tokens by name: `bg-primary`, `text-destructive`, `border-border/60`.
- Apply `min-h-touch` (44 px) to every interactive element on touch surfaces.
- Add `OptimizedImage` (or raw `<img>` with an `onError` fallback) for every content image.
- Pair every animation with `prefers-reduced-motion` (already enforced globally).
- Use `font-mono` (system mono on web) for reference numbers, receipt totals, timer countdowns, and tabular figures.
- Validate forms `onBlur`, not on every keystroke. Show error inline + auto-focus the first invalid field on submit.
- Auto-save drafts on the wizard and on Settings. Show an `AutoSaveIndicator` for the save state (idle / saving / saved / error).
- Use the right register: `product` for the wizard and admin tools, `brand` for landing and PDFs.

### Don't

- Don't introduce purple gradients, gradient-text headings, glassmorphism on product surfaces, or 3-card-deep nesting.
- Don't use emoji as structural icons. Use Lucide.
- Don't render `role="alert"` with empty content (`ErrorDisplay` already guards against this — never bypass).
- Don't reduce the Inter font fallback chain below the Tailwind default + Inter.
- Don't add per-screen hardcoded hex values. Use the tokens.
- Don't add ad-hoc font sizes. Stay on the 12 / 14 / 16 / 18 / 20 / 24 / 28 / 32 px scale.
- Don't mix admin tokens (`adminColors.*`) into student-facing surfaces, or vice versa.
- Don't ship animations that exceed 400 ms. Keep micro-interactions in 150–300 ms.
- Don't animate `width` / `height` / `top` / `left`. Use `transform` and `opacity`.
- Don't disable `prefers-reduced-motion` overrides.
- Don't break the wizard's `EnhancedProgressIndicator`. The 6-step wizard is the student's mental map.
- Don't return raw lists from authenticated endpoints. Always wrap in `{ "success": true, "data": [...] }` (backend rule, surfaces in UI as a typed envelope).

### Hardline rules (will fail CI)

- No new domain enum without registering in `docs/canonical-truth-map.md` and adding a drift-guard test.
- No new payment-status branch without going through `normalizePaymentStatus()` from `apps/admissions/src/lib/paymentStatus.ts`.
- No tracked `.env`, `.env.development`, `.env.production`, `.env.*.local` files. Only `.env.example` and `.env.scripts.example` are tracked.
- No `<button>` wrapping a `<Link>` (or vice versa). Use `Button asChild`.
- No PWA dependencies (`vite-plugin-pwa`, `workbox-*`). Removed by design.

## 6. Quick reference: where to put new code

| Adding | Location | Notes |
|--------|----------|-------|
| Page or route | `apps/admissions/src/pages/` | Register in the routing setup. |
| Reusable component | `apps/admissions/src/components/{domain}/` | Follow existing domain organization. |
| Shared frontend helper | `apps/admissions/src/lib/` | Prefer this over `src/utils/` for new code. |
| API service | `apps/admissions/src/services/` | Use `apiClient`, never raw `fetch`. |
| Tests | `apps/admissions/tests/{unit,integration,property}/` | Vitest + fast-check. |
| Backend route | App-local `urls.py` + `backend/config/urls.py` if cross-cutting | All routes under `/api/v1/`. |
| Backend domain logic | `backend/apps/{domain}/services.py` | Single mutation entry-point per domain. |
| Backend tests | `backend/tests/{unit,property,contract}/` | pytest + hypothesis. |

Full structural guidance lives in `.kiro/steering/structure.md`. Tech-stack
conventions live in `.kiro/steering/tech.md`. Domain truth map lives in
`docs/canonical-truth-map.md`.
