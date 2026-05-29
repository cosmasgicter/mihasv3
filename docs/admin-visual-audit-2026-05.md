# MIHAS Admin Surface — Visual Design Audit

**Date:** 2026-05-26  
**Scope:** All admin pages and components under `apps/admissions/src/pages/admin/` and `apps/admissions/src/components/admin/`  
**Method:** Static code analysis against `design-tokens.css`, `tokens.colors.cjs`, and steering guardrails  
**Verdict:** Significant color-token drift, inconsistent spacing rhythm, and repeated metric-tile reinvention across every admin page

---

## Section A — Per-File Findings

### A.1 `pages/admin/Dashboard.tsx`

#### Color token drift (21 instances)

| Line | Raw color | Should be |
|------|-----------|-----------|
| 402 | `border-red-500/30 bg-red-500/5 hover:bg-red-500/10` | `border-destructive/30 bg-destructive/5 hover:bg-destructive/10` |
| 404 | `bg-red-500/10` | `bg-destructive/10` |
| 404 | `text-red-600` | `text-destructive` |
| 410 | `text-red-600` | `text-destructive` |
| 414 | `border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10` | `border-warning/30 bg-warning/5 hover:bg-warning/10` |
| 416 | `bg-amber-500/10`, `text-amber-600` | `bg-warning/10`, `text-warning` |
| 422 | `text-amber-600` | `text-warning` |
| 426 | `border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10` | `border-info/30 bg-info/5 hover:bg-info/10` |
| 428 | `bg-blue-500/10`, `text-blue-600` | `bg-info/10`, `text-info` |
| 434 | `text-blue-600` | `text-info` |
| 438 | `border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10` | `border-destructive/30 bg-destructive/5` (or a dedicated `payment-warning` token) |
| 440 | `bg-rose-500/10`, `text-rose-600` | `bg-destructive/10`, `text-destructive` |
| 446 | `text-rose-600` | `text-destructive` |
| 450 | `border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/10` | `border-info/30 bg-info/5 hover:bg-info/10` |
| 452 | `bg-sky-500/10`, `text-sky-600` | `bg-info/10`, `text-info` |
| 458 | `text-sky-600` | `text-info` |
| 462 | `border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10` | `border-warning/30 bg-warning/5 hover:bg-warning/10` |
| 464 | `bg-orange-500/10`, `text-orange-600` | `bg-warning/10`, `text-warning` |
| 470 | `text-orange-600` | `text-warning` |
| 474 | `border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10` | `border-success/30 bg-success/5 hover:bg-success/10` |
| 476 | `bg-emerald-500/10`, `text-emerald-600` | `bg-success/10`, `text-success` |

#### Grid alignment problems

- **Line 400:** `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` with **7 items**. At `sm` (2 cols): 4+3 → lonely card. At `xl` (3 cols): 3+3+1 → lonely card. Neither breakpoint produces a full row.
- **Line 591:** `grid-cols-1 sm:grid-cols-3` with 3 items — correct.
- **Line 564:** `grid-cols-1 lg:grid-cols-3` — 2/3 + 1/3 split — correct.

#### Spacing rhythm violations

- `mb-6 sm:mb-8` used at lines 367, 398, 544 (consistent within Dashboard).
- `mb-6` alone at lines 492, 523 (no responsive step-up — inconsistent with siblings).
- `mb-3` at line 399 (heading margin) vs `mb-4` used elsewhere for section headings.
- `mt-8` at line 580 (Weekly Overview) — breaks the `mb-6 sm:mb-8` rhythm used above.

#### Typography inconsistency

- Line 399: `<h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">` — custom section label, not a heading primitive.
- Line 584: `<h3 className="text-lg font-bold text-foreground">` — different weight/size for same heading level.
- Line 318: `<h2 className="text-xl font-semibold">` — yet another h2 style.

#### Layout anti-patterns

- **Line 316:** `min-h-screen` on auth-required fallback — this div is inside `AppLayout` which already has `min-h-screen` on the flex container, creating a double-height scroll container.
- **Lines 369–388:** System Status Bar uses `flex flex-wrap` with `ml-auto` on the total counter. On viewports 640–768px, the `ml-auto` element wraps below the badges and loses its right-alignment.
- **Lines 370, 378, 383:** `space-x-2` used inside a parent that uses `gap-2 sm:gap-4` — mixing spacing models in the same flex container.

#### AI-tells

- 7 color-coded "attention cards" in a bento-style grid where each card uses a unique raw palette color. This is the classic AI dashboard pattern: visually busy, semantically undifferentiated. The color variety does not encode priority — all 7 items are equally "needs attention."

---

### A.2 `components/admin/RealtimeMetricsDisplay.tsx`

#### Color token drift

- **Line ~108 (DataUpdateFlash):** Inline comment acknowledges `rgba(59,130,246,0.3)` (blue-500) used for highlight glow ring. Should use `ring-primary/30` or a CSS custom property.
- Uses semantic tokens correctly for most elements (`text-primary`, `text-success`, `text-destructive`, `text-warning`, `bg-success/10`, etc.) — **good**.

#### Grid alignment

- **Metrics grid:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` with 4 items — correct.
- **Summary stats row:** `grid-cols-2 sm:grid-cols-4` with 4 items — correct.

#### Spacing rhythm

- `space-y-6` as the root container spacing — consistent internally.
- `mb-4` inside MetricCard — consistent.

#### Touch targets

- **Refresh button (line ~260):** `p-2 rounded-lg` with no `min-h-touch` or `min-w-touch`. The `h-4 w-4` icon inside a `p-2` container yields 32×32px — **below the 44px minimum**.

---

### A.3 `components/admin/dashboard/DashboardActivityFeed.tsx`

#### Color token drift

- None — uses semantic tokens (`text-foreground`, `text-muted-foreground`, `text-primary`, `bg-muted/50`, `border-border/40`). **Clean.**

#### Typography

- `<h3 className="text-lg font-bold text-foreground">` — matches Dashboard's Weekly Overview heading style but differs from the `text-sm uppercase tracking-wide` section label pattern.

#### Touch targets

- Activity items are not interactive (no links/buttons) — N/A.

---

### A.4 `components/admin/dashboard/DashboardQuickActions.tsx`

#### Color token drift

- None — uses `text-primary`, `text-foreground`, `text-muted-foreground`. **Clean.**

#### Touch targets

- Quick action links have `min-h-touch` — **compliant**.

#### Typography

- `<h3 className="text-lg font-bold text-foreground">` — consistent with ActivityFeed.

