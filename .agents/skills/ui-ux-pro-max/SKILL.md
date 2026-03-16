---
name: ui-ux-pro-max
description: "UI/UX design intelligence for web and mobile. Includes 50+ styles, 161 color palettes, 57 font pairings, 161 product types, 99 UX guidelines, and 25 chart types across 10 stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui, and HTML/CSS). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, and check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, and mobile app. Elements: button, modal, navbar, sidebar, card, table, form, and chart. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, and flat design. Topics: color systems, accessibility, animation, layout, typography, font pairing, spacing, interaction states, shadow, and gradient. Integrations: shadcn/ui MCP for component search and examples."
metadata:
  author: nextlevelbuilder
  version: "2.5.0"
  source: "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill"
---

# UI/UX Pro Max - Design Intelligence

Comprehensive design guide for web and mobile applications. Contains 50+ styles, 161 color palettes, 57 font pairings, 161 product types with reasoning rules, 99 UX guidelines, and 25 chart types across 10 technology stacks. Searchable database with priority-based recommendations.

## When to Apply

This Skill should be used when the task involves **UI structure, visual design decisions, interaction patterns, or user experience quality control**.

### Must Use

- Designing new pages (Landing Page, Dashboard, Admin, SaaS, Mobile App)
- Creating or refactoring UI components (buttons, modals, forms, tables, charts, etc.)
- Choosing color schemes, typography systems, spacing standards, or layout systems
- Reviewing UI code for user experience, accessibility, or visual consistency
- Implementing navigation structures, animations, or responsive behavior
- Making product-level design decisions (style, information hierarchy, brand expression)
- Improving perceived quality, clarity, or usability of interfaces

### Recommended

- UI looks "not professional enough" but the reason is unclear
- Receiving feedback on usability or experience
- Pre-launch UI quality optimization
- Aligning cross-platform design (Web / iOS / Android)
- Building design systems or reusable component libraries

### Skip

- Pure backend logic development
- Only involving API or database design
- Performance optimization unrelated to the interface
- Infrastructure or DevOps work
- Non-visual scripts or automation tasks

**Decision criteria**: If the task will change how a feature **looks, feels, moves, or is interacted with**, this Skill should be used.

## Rule Categories by Priority

| Priority | Category | Impact | Domain | Key Checks (Must Have) | Anti-Patterns (Avoid) |
|----------|----------|--------|--------|------------------------|------------------------|
| 1 | Accessibility | CRITICAL | `ux` | Contrast 4.5:1, Alt text, Keyboard nav, Aria-labels | Removing focus rings, Icon-only buttons without labels |
| 2 | Touch & Interaction | CRITICAL | `ux` | Min size 44×44px, 8px+ spacing, Loading feedback | Reliance on hover only, Instant state changes (0ms) |
| 3 | Performance | HIGH | `ux` | WebP/AVIF, Lazy loading, Reserve space (CLS < 0.1) | Layout thrashing, Cumulative Layout Shift |
| 4 | Style Selection | HIGH | `style`, `product` | Match product type, Consistency, SVG icons (no emoji) | Mixing flat & skeuomorphic randomly, Emoji as icons |
| 5 | Layout & Responsive | HIGH | `ux` | Mobile-first breakpoints, Viewport meta, No horizontal scroll | Horizontal scroll, Fixed px container widths, Disable zoom |
| 6 | Typography & Color | MEDIUM | `typography`, `color` | Base 16px, Line-height 1.5, Semantic color tokens | Text < 12px body, Gray-on-gray, Raw hex in components |
| 7 | Animation | MEDIUM | `ux` | Duration 150–300ms, Motion conveys meaning, Spatial continuity | Decorative-only animation, Animating width/height, No reduced-motion |
| 8 | Forms & Feedback | MEDIUM | `ux` | Visible labels, Error near field, Helper text, Progressive disclosure | Placeholder-only label, Errors only at top, Overwhelm upfront |
| 9 | Navigation Patterns | HIGH | `ux` | Predictable back, Bottom nav ≤5, Deep linking | Overloaded nav, Broken back behavior, No deep links |
| 10 | Charts & Data | LOW | `chart` | Legends, Tooltips, Accessible colors | Relying on color alone to convey meaning |

## Quick Reference

### 1. Accessibility (CRITICAL)

- `color-contrast` - Minimum 4.5:1 ratio for normal text (large text 3:1)
- `focus-states` - Visible focus rings on interactive elements (2–4px)
- `alt-text` - Descriptive alt text for meaningful images
- `aria-labels` - aria-label for icon-only buttons
- `keyboard-nav` - Tab order matches visual order; full keyboard support
- `form-labels` - Use label with for attribute
- `skip-links` - Skip to main content for keyboard users
- `heading-hierarchy` - Sequential h1→h6, no level skip
- `color-not-only` - Don't convey info by color alone (add icon/text)
- `dynamic-type` - Support system text scaling
- `reduced-motion` - Respect prefers-reduced-motion
- `voiceover-sr` - Meaningful accessibilityLabel; logical reading order
- `escape-routes` - Provide cancel/back in modals and multi-step flows
- `keyboard-shortcuts` - Preserve system and a11y shortcuts

### 2. Touch & Interaction (CRITICAL)

- `touch-target-size` - Min 44×44pt / 48×48dp; extend hit area if needed
- `touch-spacing` - Minimum 8px gap between touch targets
- `hover-vs-tap` - Use click/tap for primary interactions; don't rely on hover alone
- `loading-buttons` - Disable button during async operations; show spinner
- `error-feedback` - Clear error messages near problem
- `cursor-pointer` - Add cursor-pointer to clickable elements (Web)
- `gesture-conflicts` - Avoid horizontal swipe on main content
- `tap-delay` - Use touch-action: manipulation to reduce 300ms delay
- `standard-gestures` - Use platform standard gestures consistently
- `press-feedback` - Visual feedback on press (ripple/highlight)
- `haptic-feedback` - Use haptic for confirmations; avoid overuse
- `gesture-alternative` - Always provide visible controls for critical actions
- `safe-area-awareness` - Keep targets away from notch, Dynamic Island, gesture bar
- `no-precision-required` - Avoid requiring pixel-perfect taps
- `swipe-clarity` - Swipe actions must show clear affordance
- `drag-threshold` - Use movement threshold before starting drag

### 3. Performance (HIGH)

- `image-optimization` - Use WebP/AVIF, responsive images, lazy load non-critical
- `image-dimension` - Declare width/height or aspect-ratio to prevent layout shift
- `font-loading` - Use font-display: swap/optional
- `font-preload` - Preload only critical fonts
- `critical-css` - Prioritize above-the-fold CSS
- `lazy-loading` - Lazy load non-hero components via dynamic import
- `bundle-splitting` - Split code by route/feature
- `third-party-scripts` - Load async/defer; audit unnecessary ones
- `reduce-reflows` - Batch DOM reads then writes
- `content-jumping` - Reserve space for async content
- `virtualize-lists` - Virtualize lists with 50+ items
- `main-thread-budget` - Keep per-frame work under ~16ms for 60fps
- `progressive-loading` - Use skeleton screens instead of long spinners
- `debounce-throttle` - Use debounce/throttle for high-frequency events
- `offline-support` - Provide offline state messaging and fallback
- `network-fallback` - Offer degraded modes for slow networks

### 4. Style Selection (HIGH)

- `style-match` - Match style to product type (use `--design-system` for recommendations)
- `consistency` - Use same style across all pages
- `no-emoji-icons` - Use SVG icons (Heroicons, Lucide), not emojis
- `color-palette-from-product` - Choose palette from product/industry
- `effects-match-style` - Shadows, blur, radius aligned with chosen style
- `platform-adaptive` - Respect platform idioms (iOS HIG vs Material)
- `state-clarity` - Make hover/pressed/disabled states visually distinct
- `elevation-consistent` - Use consistent elevation/shadow scale
- `dark-mode-pairing` - Design light/dark variants together
- `icon-style-consistent` - Use one icon set/visual language
- `system-controls` - Prefer native/system controls over fully custom ones
- `blur-purpose` - Use blur for background dismissal, not decoration
- `primary-action` - Each screen should have only one primary CTA

### 5. Layout & Responsive (HIGH)

- `viewport-meta` - width=device-width initial-scale=1 (never disable zoom)
- `mobile-first` - Design mobile-first, then scale up
- `breakpoint-consistency` - Use systematic breakpoints (375 / 768 / 1024 / 1440)
- `readable-font-size` - Minimum 16px body text on mobile
- `line-length-control` - Mobile 35–60 chars; desktop 60–75 chars
- `horizontal-scroll` - No horizontal scroll on mobile
- `spacing-scale` - Use 4pt/8dp incremental spacing system
- `touch-density` - Keep component spacing comfortable for touch
- `container-width` - Consistent max-width on desktop
- `z-index-management` - Define layered z-index scale
- `fixed-element-offset` - Fixed navbar/bottom bar must reserve safe padding
- `scroll-behavior` - Avoid nested scroll regions
- `viewport-units` - Prefer min-h-dvh over 100vh on mobile
- `orientation-support` - Keep layout readable in landscape
- `content-priority` - Show core content first on mobile
- `visual-hierarchy` - Establish hierarchy via size, spacing, contrast

### 6. Typography & Color (MEDIUM)

- `line-height` - Use 1.5-1.75 for body text
- `line-length` - Limit to 65-75 characters per line
- `font-pairing` - Match heading/body font personalities
- `font-scale` - Consistent type scale (12 14 16 18 24 32)
- `contrast-readability` - Darker text on light backgrounds
- `text-styles-system` - Use platform type system
- `weight-hierarchy` - Bold headings (600–700), Regular body (400), Medium labels (500)
- `color-semantic` - Define semantic color tokens, not raw hex
- `color-dark-mode` - Dark mode uses desaturated/lighter tonal variants
- `color-accessible-pairs` - Foreground/background pairs must meet 4.5:1 (AA)
- `color-not-decorative-only` - Functional color must include icon/text
- `truncation-strategy` - Prefer wrapping over truncation
- `letter-spacing` - Respect default letter-spacing per platform
- `number-tabular` - Use tabular figures for data columns, prices, timers
- `whitespace-balance` - Use whitespace intentionally to group related items

### 7. Animation (MEDIUM)

- `duration-timing` - Use 150–300ms for micro-interactions; ≤400ms for complex transitions
- `transform-performance` - Use transform/opacity only; avoid animating width/height
- `loading-states` - Show skeleton or progress when loading exceeds 300ms
- `excessive-motion` - Animate 1-2 key elements per view max
- `easing` - Use ease-out for entering, ease-in for exiting
- `motion-meaning` - Every animation must express cause-effect, not just decoration
- `state-transition` - State changes should animate smoothly, not snap
- `continuity` - Page transitions should maintain spatial continuity
- `spring-physics` - Prefer spring/physics-based curves for natural feel
- `exit-faster-than-enter` - Exit animations ~60–70% of enter duration
- `stagger-sequence` - Stagger list item entrance by 30–50ms per item
- `shared-element-transition` - Use shared element transitions for visual continuity
- `interruptible` - Animations must be interruptible by user input
- `no-blocking-animation` - Never block user input during animation
- `scale-feedback` - Subtle scale (0.95–1.05) on press for tappable elements
- `motion-consistency` - Unify duration/easing tokens globally
- `layout-shift-avoid` - Animations must not cause layout reflow or CLS

### 8. Forms & Feedback (MEDIUM)

- `input-labels` - Visible label per input (not placeholder-only)
- `error-placement` - Show error below the related field
- `submit-feedback` - Loading then success/error state on submit
- `required-indicators` - Mark required fields (e.g. asterisk)
- `empty-states` - Helpful message and action when no content
- `toast-dismiss` - Auto-dismiss toasts in 3-5s
- `confirmation-dialogs` - Confirm before destructive actions
- `input-helper-text` - Persistent helper text below complex inputs
- `disabled-states` - Reduced opacity (0.38–0.5) + cursor change
- `progressive-disclosure` - Reveal complex options progressively
- `inline-validation` - Validate on blur, not keystroke
- `input-type-keyboard` - Use semantic input types for correct mobile keyboard
- `password-toggle` - Provide show/hide toggle for password fields
- `autofill-support` - Use autocomplete attributes
- `undo-support` - Allow undo for destructive actions
- `success-feedback` - Confirm completed actions with brief visual feedback
- `error-recovery` - Error messages must include recovery path
- `multi-step-progress` - Show step indicator; allow back navigation
- `form-autosave` - Long forms should auto-save drafts
- `focus-management` - After submit error, auto-focus first invalid field
- `error-summary` - For multiple errors, show summary at top with anchor links
- `destructive-emphasis` - Destructive actions use danger color, visually separated
- `toast-accessibility` - Toasts use aria-live="polite"
- `aria-live-errors` - Form errors use aria-live or role="alert"

### 9. Navigation Patterns (HIGH)

- `bottom-nav-limit` - Bottom navigation max 5 items; use labels with icons
- `drawer-usage` - Use drawer/sidebar for secondary navigation
- `back-behavior` - Back navigation must be predictable; preserve scroll/state
- `deep-linking` - All key screens must be reachable via deep link/URL
- `nav-label-icon` - Navigation items must have both icon and text label
- `nav-state-active` - Current location must be visually highlighted
- `nav-hierarchy` - Primary vs secondary nav must be clearly separated
- `modal-escape` - Modals must offer clear close/dismiss affordance
- `search-accessible` - Search must be easily reachable
- `breadcrumb-web` - Web: use breadcrumbs for 3+ level deep hierarchies
- `state-preservation` - Navigating back must restore previous state
- `gesture-nav-support` - Support system gesture navigation without conflict
- `overflow-menu` - Use overflow/more menu when actions exceed space
- `adaptive-navigation` - Large screens prefer sidebar; small screens use bottom/top nav
- `back-stack-integrity` - Never silently reset the navigation stack
- `navigation-consistency` - Navigation placement must stay the same across all pages
- `focus-on-route-change` - After page transition, move focus to main content
- `persistent-nav` - Core navigation must remain reachable from deep pages
- `destructive-nav-separation` - Dangerous actions separated from normal nav items

### 10. Charts & Data (LOW)

- `chart-type` - Match chart type to data type (trend → line, comparison → bar)
- `color-guidance` - Use accessible color palettes; avoid red/green only pairs
- `data-table` - Provide table alternative for accessibility
- `pattern-texture` - Supplement color with patterns/textures
- `legend-visible` - Always show legend near the chart
- `tooltip-on-interact` - Provide tooltips on hover/tap showing exact values
- `axis-labels` - Label axes with units and readable scale
- `responsive-chart` - Charts must reflow on small screens
- `empty-data-state` - Show meaningful empty state when no data
- `loading-chart` - Use skeleton placeholder while chart data loads
- `large-dataset` - For 1000+ points, aggregate; provide drill-down
- `number-formatting` - Use locale-aware formatting
- `touch-target-chart` - Interactive chart elements must have ≥44pt tap area
- `no-pie-overuse` - Avoid pie/donut for >5 categories
- `contrast-data` - Data lines/bars vs background ≥3:1
- `legend-interactive` - Legends should be clickable to toggle series
- `sortable-table` - Data tables must support sorting with aria-sort
- `screen-reader-summary` - Provide text summary for screen readers
- `export-option` - For data-heavy products, offer CSV/image export

## How to Use

### Prerequisites

Check if Python is installed:

```bash
python3 --version || python --version
```

### Search CLI

Use the search script to query the design database:

```bash
# Generate a complete design system (REQUIRED for new projects)
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]

# Persist design system for hierarchical retrieval
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name"

# Search specific domains
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]

# Get stack-specific guidelines
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack <stack_name>
```

### Available Domains

| Domain | Use For | Example Keywords |
|--------|---------|------------------|
| `product` | Product type recommendations | SaaS, e-commerce, portfolio, healthcare |
| `style` | UI styles, colors, effects | glassmorphism, minimalism, dark mode |
| `typography` | Font pairings, Google Fonts | elegant, playful, professional |
| `color` | Color palettes by product type | saas, ecommerce, healthcare, fintech |
| `landing` | Page structure, CTA strategies | hero, testimonial, pricing |
| `chart` | Chart types, library recommendations | trend, comparison, timeline |
| `ux` | Best practices, anti-patterns | animation, accessibility, loading |
| `google-fonts` | Individual Google Fonts lookup | sans serif, monospace, variable |
| `react` | React/Next.js performance | waterfall, bundle, suspense, memo |
| `web` | App interface guidelines | accessibilityLabel, touch targets |
| `prompt` | AI prompts, CSS keywords | (style name) |

### Workflow

| Scenario | Start From |
|----------|------------|
| New project / page | Step 1: `--design-system` |
| New component | Domain search: style, ux |
| Choose style / color / font | `--design-system` with keywords |
| Review existing UI | Quick Reference checklist above |
| Fix a UI bug | Quick Reference → relevant section |
| Improve / optimize | Domain search: ux, react |
| Add charts / data viz | Domain search: chart |

## Pre-Delivery Checklist

### Visual Quality
- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon family and style
- [ ] Official brand assets with correct proportions
- [ ] Semantic theme tokens used consistently

### Interaction
- [ ] All tappable elements provide pressed feedback
- [ ] Touch targets meet minimum size (≥44×44pt)
- [ ] Micro-interaction timing 150-300ms
- [ ] Disabled states visually clear and non-interactive
- [ ] Screen reader focus order matches visual order

### Light/Dark Mode
- [ ] Primary text contrast ≥4.5:1 in both modes
- [ ] Secondary text contrast ≥3:1 in both modes
- [ ] Dividers/borders visible in both modes
- [ ] Both themes tested before delivery

### Layout
- [ ] Safe areas respected for headers and bars
- [ ] Scroll content not hidden behind fixed bars
- [ ] Verified on small phone, large phone, and tablet
- [ ] 4/8dp spacing rhythm maintained
- [ ] Long-form text readable on larger devices

### Accessibility
- [ ] All meaningful images/icons have accessibility labels
- [ ] Form fields have labels, hints, and error messages
- [ ] Color is not the only indicator
- [ ] Reduced motion and dynamic text size supported