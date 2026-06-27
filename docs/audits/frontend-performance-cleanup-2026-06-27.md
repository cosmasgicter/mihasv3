# Frontend Performance Cleanup Evidence

Date: 2026-06-27
Scope: `apps/admissions`

## Before Baseline

No prior Lighthouse JSON or bundle stats artifact existed in the repository for this cleanup. The actionable pre-cleanup baseline was the read-only scan that identified these issues:

- Static asset weight risk: school logos/signature PNGs previously called out as oversized; current public PNG scan now shows every web-exposed PNG is under 60 KB.
- Font cache gap: `/fonts/*` needed immutable cache headers consistently across SPA host blocks.
- Excel export chunking: spreadsheet writer needed to stay outside the initial bundle.
- Admin application card rendering: virtualization threshold needed to be below the previous 100-card trigger.
- Selection membership checks: repeated `selectedIds.includes()` needed a memoized `Set`.
- Admin dashboard polling: dashboard stats needed a single polling owner.
- Global CSS: admin-only CSS needed to remain outside unauthenticated entry CSS.
- Image layout stability: direct `<img>` usage needed explicit intrinsic dimensions.

## Current Build Evidence

Command:

```bash
cd apps/admissions
bun run build
```

Result: passed.

Largest emitted JavaScript/CSS assets by raw size:

| Asset | Raw size |
| --- | ---: |
| `vendor-react-pdf-C2P-c0TB.js` | 1,435,536 bytes |
| `vendor-pdf-B3GKKh9F.js` | 806,556 bytes |
| `vendor-sentry-DTFAjbJH.js` | 459,775 bytes |
| `index-Bh9LbCkb.js` | 291,438 bytes |
| `html2canvas.esm-CyxsxQj2.js` | 199,435 bytes |
| `vendor-react-1rKveos2.js` | 168,217 bytes |
| `Applications-4wVw1mWR.js` | 164,731 bytes |
| `index.es-CbHnMddy.js` | 156,695 bytes |
| `index-GSdAcAW0.css` | 134,059 bytes |
| `proxy-CdeT_Den.js` | 111,182 bytes |

Largest emitted JavaScript/CSS assets by gzip size:

| Asset | Gzip size |
| --- | ---: |
| `vendor-react-pdf-C2P-c0TB.js` | 474,834 bytes |
| `vendor-pdf-B3GKKh9F.js` | 297,152 bytes |
| `vendor-sentry-DTFAjbJH.js` | 147,688 bytes |
| `index-Bh9LbCkb.js` | 78,212 bytes |
| `vendor-react-1rKveos2.js` | 55,361 bytes |
| `index.es-CbHnMddy.js` | 51,223 bytes |
| `html2canvas.esm-CyxsxQj2.js` | 45,619 bytes |
| `Applications-4wVw1mWR.js` | 39,675 bytes |
| `proxy-CdeT_Den.js` | 35,251 bytes |
| `index-DQI9qfol.js` | 29,828 bytes |

Observed Vite warning: `vendor-react-pdf`, `vendor-pdf`, and related document-generation chunks remain large after minification. They are split from the main app path, but they are still the next frontend performance target if document preview/download becomes a frequent mobile path.

## Lighthouse Evidence

Command:

```bash
cd apps/admissions
bun x --bun vite preview --host 127.0.0.1 --port 4173
bun x lighthouse http://127.0.0.1:4173/ --quiet --chrome-flags='--headless --no-sandbox' --output=json --output-path=/tmp/beanola-lighthouse.json
```

Result:

| Category | Score |
| --- | ---: |
| Performance | 74 |
| Accessibility | 96 |
| Best Practices | 96 |
| SEO | 100 |

Key metrics:

| Metric | Value |
| --- | ---: |
| First Contentful Paint | 1.5 s |
| Largest Contentful Paint | 7.4 s |
| Speed Index | 2.0 s |
| Total Blocking Time | 160 ms |
| Cumulative Layout Shift | 0 |
| Time to Interactive | 7.9 s |

## Guard Coverage

`apps/admissions/tests/unit/perfFrontendOptimizations.test.tsx` now guards:

- Spreadsheet writer is dynamically imported.
- Admin card virtualization threshold stays fixed at 40.
- Public PNG assets stay at or below 60 KB.
- Caddy serves `/fonts/*` with immutable cache headers on SPA host blocks.
- Admin-only color CSS is not imported by unauthenticated global entry CSS.
- Direct `<img>` elements in the audited UI files include explicit width and height.
- `OptimizedImage` fallbacks preserve layout dimensions.

