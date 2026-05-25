# ADR-009: Dual Reduced-Motion Strategy (Belt + Suspenders)

**Status:** Accepted
**Date:** 2026-05-25
**Deciders:** Cosmas Kanchepa (CTO/Founder)

---

## Context

The admissions app uses two independent mechanisms to honour
`prefers-reduced-motion: reduce`. Both were introduced early in the
SmoothUI animation pass and have coexisted since. During the May 2026
motion-primitives audit a question arose: is the duplication intentional
or accidental? This ADR records the answer.

### Layer 1 — CSS global override ("the belt")

`apps/admissions/src/styles/smooth-animations.css` ends with:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This fires on every element in the document — including third-party
libraries (Radix UI transitions, Tailwind `animate-*` utilities, any
future dependency that ships CSS animations). It is a safety net: even
if a developer forgets to add reduced-motion handling to a component,
the user never sees sustained animation.

### Layer 2 — JS reactive hook ("the suspenders")

`apps/admissions/src/lib/animation-config.ts` exports:

- `useReducedMotion()` — a React hook that subscribes to
  `MediaQueryList.change` and re-renders when the preference toggles.
- `prefersReducedMotion()` — a synchronous one-shot read for non-React
  contexts.

Components that use `framer-motion` consume the hook to short-circuit
animation props at the source:

```ts
const reduced = useReducedMotion()
const motionProps = {
  initial: reduced ? false : { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: reduced ? { duration: 0 } : { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
}
```

This prevents framer-motion from scheduling animation frames in
JavaScript — the CSS override alone would render the animation
invisibly but the JS engine would still run the interpolation loop,
wasting CPU cycles and battery.

---

## Decision

**Keep both layers.** They serve complementary purposes:

| Responsibility | CSS layer | JS layer |
|----------------|-----------|----------|
| Third-party CSS animations | ✓ | — |
| Raw Tailwind / custom CSS animations | ✓ | — |
| Fallback safety net for forgotten components | ✓ | — |
| framer-motion JS animation loop suppression | — | ✓ |
| Conditional rendering of motion vs. static fallbacks | — | ✓ |
| Reactive toggle without page reload | — | ✓ |

### Rules for contributors

1. A component that uses **framer-motion** (directly or via
   `@/components/motion`) **must** also consume `useReducedMotion()`
   from `@/lib/animation-config`. The CSS override does not stop
   framer-motion's internal requestAnimationFrame loop.

2. A component that uses **only Tailwind / CSS animations** does
   **not** need the JS hook — the CSS layer handles it automatically.

3. The CSS layer must remain a universal `*` selector with `!important`
   so it cannot be accidentally overridden by specificity.

---

## Consequences

### Positive

- **Defence in depth.** A missed `useReducedMotion()` call in a CSS-only
  component is still safe. A missed CSS import in a framer-motion
  component is still safe (the JS hook handles it).
- **Zero runtime cost when motion is allowed.** The CSS media query is
  evaluated by the browser engine; the JS hook is a single
  `matchMedia` listener per component tree (shared via React state).
- **Reactive.** If the user toggles reduced motion in system settings
  while the app is open, both layers respond immediately — CSS via the
  media query, JS via the `change` event.

### Negative

- **Cognitive overhead.** Contributors must know which layer applies to
  their animation type. Mitigated by the two-rule summary above and
  lint-time detection (planned).
- **Slight redundancy for framer-motion.** When reduced motion is on,
  both the CSS override and the JS hook fire. The JS hook makes the CSS
  override a no-op for those elements, but neither conflicts with the
  other.

---

## Alternatives Considered

### Option A — CSS-only (remove the JS hook)

Rely solely on the global CSS override. framer-motion would still
interpolate values in JS and apply them as inline styles — the CSS
`!important` would override the inline `style` attribute for
`animation-duration` but **not** for `transform` or `opacity` set
directly by framer-motion's style prop. Result: invisible but
CPU-expensive animation loops. **Rejected.**

### Option B — JS-only (remove the CSS override)

Rely solely on `useReducedMotion()` in every animated component. This
requires perfect developer discipline — any component that forgets the
hook would animate for reduced-motion users. Third-party libraries
would be uncontrolled. **Rejected.**

### Option C — framer-motion's built-in `useReducedMotion`

framer-motion ships its own `useReducedMotion` hook. We could use it
instead of our custom one. **Rejected** because our hook is already
used across the codebase, is framework-agnostic (works outside React
component trees via `prefersReducedMotion()`), and avoids coupling
non-framer-motion code to the framer-motion package.

---

## References

- WCAG 2.3.3 Animation from Interactions (Level AAA) —
  https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html
- CSS Media Queries Level 5 `prefers-reduced-motion` —
  https://drafts.csswg.org/mediaqueries-5/#prefers-reduced-motion
- CSS override — `apps/admissions/src/styles/smooth-animations.css`
- JS hook — `apps/admissions/src/lib/animation-config.ts`
- Motion primitives — `apps/admissions/src/components/motion/index.tsx`
- PageShell (canonical consumer) — `apps/admissions/src/components/ui/PageShell.tsx`
- ButtonSpinner (CSS-only pattern) — `apps/admissions/src/components/ui/ButtonSpinner.tsx`
