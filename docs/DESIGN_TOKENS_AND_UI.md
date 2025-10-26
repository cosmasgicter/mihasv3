# Design tokens, ParticlesBackground & UI Guidelines

This document describes the minimal design system tokens added, how to use the new `ParticlesBackground`, and mobile/animation guidelines.

## Tokens (quick reference)

- `designTokens.typography`: central type scale and line-height values.
  - Use `designTokens.typography.scale` for consistent font sizing.
- `designTokens.layout`:
  - `sidebarCollapsed`: 80 (px)
  - `sidebarExpanded`: 256 (px)
  - `headerHeight`: 64 (px)

Also exposed as CSS variables in `src/index.css`:

- `--sidebar-collapsed`, `--sidebar-expanded`, `--header-height`
- `--icon-size`, `--nav-min-width`, `--touch-target`
- `--type-xs` `--type-sm` `--type-base` `--type-lg` `--type-xl` `--type-2xl`

## Using tokens in components

- In TSX you can import `designTokens`:

```ts
import { designTokens } from '@/design-system/tokens'

const collapsed = designTokens.layout.sidebarCollapsed
```

- For CSS-level values prefer the CSS variables (e.g., `var(--sidebar-collapsed)`) to avoid repeated TS imports.

## ParticlesBackground

- File: `src/components/ui/ParticlesBackground.tsx`
- Lightweight canvas-based particle effect. Key points:
  - Respects `prefers-reduced-motion` and will not animate if set.
  - Disabled on mobile by default (the `AppLayout` passes `enabled={!isMobile}`).
  - `pointer-events: none` so it won't block UI interactions.

Usage: already mounted in `AppLayout`. To enable it on a page-level only, import and render it under a conditional.

```tsx
import ParticlesBackground from '@/components/ui/ParticlesBackground'

<ParticlesBackground enabled={true} />
```

## Mobile & animation guidelines

- Respect `prefers-reduced-motion`: avoid or reduce animation durations and disable decorative motion where practical.
- Keep touch targets >= 44px (we expose `--touch-target` for helper sizing).
- For icons use `--icon-size` and avoid tiny touch icons.
- Avoid heavy background animations on mobile; keep decorative elements off mobile by default.

## Next steps and recommendations

- Migrate 3–5 high-traffic components to read from `designTokens.typography` and use CSS variables for spacing.
- Add a small `tokens.ts` export helper that converts px numbers to `px` strings where helpful.
- Consider adding Storybook or a small styleguide page under `docs/` with visual examples for tokens and buttons.

---
Generated: 2025-10-26
