# UI Cleanup Design

Date: 2026-03-02

## Design Direction
- Tone: clean, trustworthy admissions product with strong editorial hero.
- Keep existing blue brand palette but improve contrast hierarchy and spacing discipline.
- Mobile-first ergonomics: clear typography steps, better block spacing, stronger controls.

## Architecture Decisions
1. Fix animation contract, not per-page hacks.
- Introduce parent-child reveal coordination in `ScrollReveal/StaggerReveal/StaggerItem` so child visibility depends on reveal state.

2. Make hero media explicit.
- Add a right-side (desktop) / stacked (mobile) hero image panel using existing optimized assets.
- Mark hero image as priority/LCP candidate.

3. Normalize public section primitives.
- Reuse consistent container widths, card paddings, and heading/body scale through existing utility tokens.

4. Improve tracker information hierarchy.
- Increase helper/status text sizes on mobile.
- Standardize action button height and spacing.

5. Resolve runtime quality defects.
- Remove invalid DOM image attribute forwarding.
- Add missing React keys.
- Improve gradient header foreground contrast.

## Performance Strategy
1. Use one prioritized hero image (`loading='eager'`, `decoding='sync'`), keep others lazy.
2. Avoid hiding content behind brittle animation states.
3. Keep animation transforms lightweight (opacity/translate only).
4. Retain existing image optimization component and WebP paths.

## Accessibility Strategy
1. Ensure main interactive controls stay >=44px in primary public flows.
2. Preserve semantic heading order and landmarks.
3. Maintain visible focus states (already globally defined).

## Non-Goals
1. No deep redesign of authenticated admin/student dashboards in this pass.
2. No global type-system cleanup unrelated to public UI.
