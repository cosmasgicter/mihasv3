# Visual QA Checklist (Color, Contrast & Emphasis)

Use this lightweight checklist during UI review for high-impact screens.

## Checklist

- [ ] **Contrast baseline:** Body text and controls use `text-foreground` / semantic foreground tokens against `bg-background`, `bg-card`, or semantic surfaces.
- [ ] **Muted usage discipline:** `text-muted-foreground` and `text-caption` are reserved for secondary/support text only (never main KPI labels, step descriptions, or auth guidance).
- [ ] **CTA prominence:** Primary actions are visually dominant (solid/fully opaque primary gradient or semantic primary fills), with no low-opacity primary endpoints.
- [ ] **Semantic emphasis:** Important status and progress labels use stronger semantic tokens (`text-foreground`, `text-success`, `text-warning`, etc.) rather than muted defaults.
- [ ] **Surface consistency:** Page-level shells default to `bg-background`; tinted/translucent backgrounds are decorative and scoped.

## Applied In This Pass

- **Student dashboard:** strengthened quick-action supporting copy and metric descriptors where muted text reduced scanability.
- **Admin dashboard:** promoted quick-action and KPI subtitle text from muted to stronger foreground-adjacent tokens.
- **Auth pages:** promoted guidance/help copy in sign-in/sign-up/forgot/reset flows to foreground-adjacent tokens for better readability.
- **Application wizard:** promoted step meta text/progress details from caption-level styling to stronger foreground-adjacent tokens.

## Suggested QA Flow

1. Open each target page in desktop + mobile breakpoints.
2. Confirm CTA hierarchy in each key section (top fold and critical completion states).
3. Spot-check text contrast for headings, descriptors, and status copy.
4. Verify muted/caption text appears only in genuinely secondary contexts.
5. Capture visual regressions if any element appears less prominent than before.
