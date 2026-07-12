# UI/UX Remediation Requirements

## Context
Production MIHAS admissions platform audit revealed hardcoded colors, deprecated component exports, and inconsistent token usage across auth pages and dashboards.

## Requirements

### REQ-1: Replace hardcoded colors with design tokens
- Auth pages (SignIn, SignUp) use raw Tailwind colors (cyan-200, emerald-200, slate-950) instead of semantic tokens
- Admin Dashboard welcome banner uses hardcoded gradients
- Student Dashboard has hardcoded border/bg colors in some spots
- All should use the semantic color system defined in tailwind.config.js

### REQ-2: Clean up deprecated UI exports
- `src/components/ui/index.ts` has 6+ deprecated exports with @deprecated JSDoc
- Remove deprecated re-exports and update any remaining consumers

### REQ-3: Standardize info callout pattern
- SignInPage and SignUpPage use ad-hoc callout boxes with inconsistent styling
- Extract a reusable `InfoCallout` component using design tokens

### REQ-4: Fix color contrast in status-specific callouts
- Ensure all callout/alert variants meet WCAG AA contrast (4.5:1)
- Use semantic color tokens (destructive, warning, success, info) consistently

### REQ-5: Improve admin dashboard token consistency
- Welcome banner gradient should use token-based colors
- Stats cards should use semantic color classes consistently
- Weekly overview section should use design tokens

## Non-Goals
- No structural rewrites of working components
- No removal of AnimatedInput (it's well-built with proper a11y)
- No changes to auto-save, auth flow, or RBAC
- No new dependencies
