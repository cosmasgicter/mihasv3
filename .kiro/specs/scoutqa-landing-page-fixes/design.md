# ScoutQA Landing Page Fixes — Bugfix Design

## Overview

ScoutQA audit scored the MIHAS landing page 94/100 (A-) but flagged two defects: (1) accreditation logos report 0×0 natural dimensions because `OptimizedImage` cannot handle sources that are already `.webp` — the WebP derivation regex is a no-op, `hasWebp` evaluates to `false`, no `<source>` is emitted, and the bare `<img>` inside the `<picture>` wrapper doesn't propagate dimensions correctly in the constrained parent; (2) the contact page header H1 lacks an explicit text color class, inheriting through a semi-transparent gradient background that breaks WCAG AA contrast.

The fix is minimal and surgical: make `OptimizedImage` recognise already-WebP sources so the `<img>` renders correctly without a redundant `<source>`, and add explicit `text-foreground` to the contact page header text elements.

## Glossary

- **Bug_Condition (C)**: Two disjoint conditions — (C₁) `OptimizedImage` receives a `src` ending in `.webp`, causing the WebP derivation to be a no-op and the image to render with broken dimensions; (C₂) the contact page header text elements lack explicit color classes on a gradient background, causing low contrast.
- **Property (P)**: (P₁) WebP-native sources render a visible `<img>` with correct `width`/`height` attributes and no unnecessary `<source>` element; (P₂) header text has explicit `text-foreground` class ensuring ≥4.5:1 contrast.
- **Preservation**: Existing non-WebP image derivation, error fallback UI, srcset generation, contact form styling, and accreditation card text styling must remain unchanged.
- **OptimizedImage**: The component in `apps/admissions/src/components/ui/OptimizedImage.tsx` that wraps `<picture>` + `<source>` + `<img>` with WebP derivation, lazy loading, and error fallback.
- **hasWebp**: Boolean computed as `derivedWebpSrc !== src` — currently `false` for `.webp` sources because the regex replacement is a no-op.
- **AccreditationSection**: Component in `LandingPageSections.tsx` that renders four accreditation logo cards using `OptimizedImage`.

## Bug Details

### Bug Condition

Two independent bug conditions exist:

**C₁ — WebP-native source handling**: The bug manifests when `OptimizedImage` receives a `src` that already ends in `.webp`. The derivation regex `/\.(jpe?g|png)$/i` does not match, so `derivedWebpSrc === src`, `hasWebp` is `false`, no `<source>` element is generated, and the `<img>` renders inside a `<picture className="block w-full h-full">` wrapper. The `<img>` has `className="max-w-full h-full w-full object-contain"` and explicit `width={64} height={64}` attributes, but the `<picture>` wrapper's `block w-full h-full` combined with the parent's constrained dimensions (h-12 w-12 / sm:h-16 sm:w-16 with p-2) can cause the browser to report 0×0 natural dimensions.

**C₂ — Contact header contrast**: The bug manifests when the contact page H1 renders inside a `bg-gradient-to-br from-primary/10 via-background to-secondary/10` container without an explicit text color class. The H1 only has `text-3xl font-bold sm:text-4xl`, relying on CSS inheritance which may not resolve to `text-foreground` through the gradient layers.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { component: string, src?: string, element?: string, hasExplicitColor?: boolean }
  OUTPUT: boolean

  // C₁: WebP-native source in OptimizedImage
  IF input.component == "OptimizedImage" THEN
    RETURN input.src MATCHES /\.webp$/i

  // C₂: Contact header text without explicit color
  IF input.component == "ContactPage" THEN
    RETURN input.element IN ["h1", "p"]
           AND input.hasExplicitColor == false
           AND parentHasGradientBackground(input.element)

  RETURN false
END FUNCTION
```

### Examples

- `OptimizedImage src="/images/accreditation/GNCLogo.webp"` → regex no-op, `hasWebp=false`, no `<source>`, image reports 0×0 naturalWidth/Height
- `OptimizedImage src="/images/accreditation/hpc_logobig.webp"` → same no-op path, image invisible
- `OptimizedImage src="/images/hero.jpg"` → regex matches, `hasWebp=true`, `<source>` emitted, image renders correctly (NOT a bug condition)
- Contact page `<h1 className="text-3xl font-bold sm:text-4xl">` → no `text-foreground`, ScoutQA measures 1.18:1 contrast on gradient
- Contact page `<p className="mt-3 max-w-2xl text-muted-foreground">` → has explicit color but may need reinforcement on gradient

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Non-WebP sources (`.jpg`, `.jpeg`, `.png`) must continue to derive a WebP `<source>` element and render the fallback `<img>` exactly as today
- Image error fallback UI (broken-image icon + alt text placeholder) must continue to work
- `srcSetWidths` must continue to generate correct `srcset` attributes for both WebP sources and fallback formats
- Contact form inputs, labels, and error messages must retain their current explicit `text-foreground`, `text-muted-foreground`, and `text-destructive` classes
- AccreditationSection card titles (`text-foreground`), org names (`text-muted-foreground`), and descriptions (`text-muted-foreground`) must remain unchanged
- The `<picture>` wrapper's `block w-full h-full` class must remain for layout consistency across all image usages

**Scope:**
All inputs that do NOT involve `.webp`-native sources or the contact page header text should be completely unaffected by this fix. This includes:
- All non-WebP image sources throughout the landing page
- All other page header sections (landing hero, programs, etc.)
- Mouse/keyboard interactions with the contact form
- Image lazy loading and async decoding behavior

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **WebP derivation is a no-op for `.webp` sources**: `src.replace(/\.(jpe?g|png)$/i, '.webp')` returns the original string when `src` already ends in `.webp`. This means `derivedWebpSrc === src`, `hasWebp` is `false`, and no `<source>` element is emitted. The `<img>` is the sole child of `<picture>`, which is correct for a WebP-native source — but the dimension propagation chain breaks.

2. **`<picture>` wrapper interferes with dimension resolution**: The `<picture>` element has `className="block w-full h-full"` which makes it fill its parent. The `<img>` inside has `width={64} height={64}` attributes and `className="max-w-full h-full w-full object-contain"`. When the parent container is `h-12 w-12` (48×48px) with `p-2` (8px padding each side → 32×32px available), the CSS `h-full w-full` on both `<picture>` and `<img>` should resolve correctly. However, the `max-w-full` class on `<img>` combined with the `<picture>` wrapper may cause the browser to compute 0 intrinsic dimensions when the image hasn't loaded yet (lazy loading + `decoding="async"`).

3. **The real fix for C₁**: Since the source is already WebP, the component should skip the `<picture>/<source>` pattern entirely for WebP-native sources (no `<source>` needed) and ensure the `<img>` renders with proper dimension hints. Alternatively, the `<picture>` wrapper could be omitted when there's no `<source>` to emit, rendering a plain `<img>` instead.

4. **Missing explicit text color on H1**: The contact page H1 has no `text-*` color class. On a plain `bg-background` this would inherit correctly, but the gradient `bg-gradient-to-br from-primary/10 via-background to-secondary/10` creates a composite background that ScoutQA's contrast checker evaluates against the gradient stops rather than the dominant `via-background` color.

## Correctness Properties

Property 1: Bug Condition — WebP-native sources render with correct dimensions

_For any_ `OptimizedImage` input where `src` ends in `.webp` (isBugCondition C₁ returns true), the fixed component SHALL render an `<img>` element with explicit `width` and `height` attributes matching the provided props, and the rendered output SHALL NOT include a redundant `<source type="image/webp">` element pointing to the same URL as the `<img> src`.

**Validates: Requirements 2.1, 2.2**

Property 2: Preservation — Non-WebP source derivation unchanged

_For any_ `OptimizedImage` input where `src` ends in `.jpg`, `.jpeg`, or `.png` (isBugCondition C₁ returns false), the fixed component SHALL produce exactly the same rendered output as the original component, including the derived WebP `<source>` element, fallback `<img>`, and any `srcset` attributes.

**Validates: Requirements 3.1, 3.5**

Property 3: Bug Condition — Contact header text has explicit contrast-safe color

_For any_ text element in the contact page header section rendered on the gradient background (isBugCondition C₂ returns true), the fixed component SHALL include an explicit `text-foreground` class on the H1 element, ensuring WCAG AA compliant contrast (≥4.5:1) against all gradient positions.

**Validates: Requirements 2.3, 2.4**

Property 4: Preservation — Contact form and accreditation styling unchanged

_For any_ contact form element (inputs, labels, error messages) or accreditation card text element, the fixed code SHALL preserve the existing explicit color classes (`text-foreground`, `text-muted-foreground`, `text-destructive`) without modification.

**Validates: Requirements 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `apps/admissions/src/components/ui/OptimizedImage.tsx`

**Function**: `OptimizedImage`

**Specific Changes**:
1. **Skip `<picture>` wrapper when no `<source>` is needed**: When `hasWebp` is `false` (i.e., the source is already WebP or has an unrecognised extension), render a plain `<img>` element directly instead of wrapping it in `<picture>`. This eliminates the dimension propagation issue caused by the `<picture>` wrapper when it has no `<source>` children.
2. **Preserve `<picture>` for non-WebP sources**: When `hasWebp` is `true`, continue rendering the existing `<picture>` + `<source>` + `<img>` structure unchanged.
3. **Ensure `<img>` className consistency**: The plain `<img>` fallback path must use the same `className`, `width`, `height`, `loading`, `decoding`, `onError`, and spread props as the `<picture>`-wrapped path.

**File**: `apps/admissions/src/pages/ContactPage.tsx`

**Element**: `<h1>` in the header section

**Specific Changes**:
4. **Add `text-foreground` to H1**: Change `className="text-3xl font-bold sm:text-4xl"` to `className="text-3xl font-bold text-foreground sm:text-4xl"` to ensure explicit high-contrast color on the gradient background.
5. **Reinforce paragraph color**: The `<p>` already has `text-muted-foreground` which provides 7.59:1 on white. This is likely sufficient even with the 10% opacity gradient overlays, but we should verify during testing. No change needed unless ScoutQA specifically flags it.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write unit tests that render `OptimizedImage` with `.webp` sources and inspect the output structure. Write unit tests that render the contact page header and check for explicit color classes. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **WebP Source Rendering Test**: Render `OptimizedImage` with `src="logo.webp"` and assert the `<img>` has correct `width`/`height` attributes and is not wrapped in a `<picture>` with no `<source>` (will fail on unfixed code — `<picture>` wraps with no `<source>`)
2. **Multiple WebP Sources Test**: Render with each accreditation logo filename and verify non-zero dimension attributes (will fail on unfixed code)
3. **Contact H1 Color Test**: Render contact page header and assert H1 has `text-foreground` class (will fail on unfixed code)
4. **Contact Paragraph Color Test**: Render contact page header and assert paragraph has explicit color class (may pass on unfixed code — already has `text-muted-foreground`)

**Expected Counterexamples**:
- `OptimizedImage` with `.webp` src renders inside `<picture>` with no `<source>`, causing dimension issues
- Contact H1 has no `text-foreground` class, only sizing classes
- Possible causes: regex no-op for `.webp`, missing CSS class on H1

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  IF input.component == "OptimizedImage" THEN
    result := renderOptimizedImage_fixed(input.src, input.width, input.height)
    ASSERT result.imgElement.width == input.width
    ASSERT result.imgElement.height == input.height
    ASSERT result.hasNoPictureWrapper OR result.hasSourceElement
  IF input.component == "ContactPage" THEN
    result := renderContactHeader_fixed()
    ASSERT result.h1.classList.contains("text-foreground")
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT renderOptimizedImage_original(input) = renderOptimizedImage_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many random image source strings to verify non-WebP sources still produce identical output
- It catches edge cases like unusual extensions, query parameters, or paths with dots
- It provides strong guarantees that the WebP derivation logic is unchanged for all non-`.webp` inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-WebP sources and contact form elements, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Non-WebP Derivation Preservation**: Generate random image paths ending in `.jpg`/`.jpeg`/`.png` and verify the component still produces a `<source type="image/webp">` element with the derived path
2. **srcSet Preservation**: Generate random `srcSetWidths` arrays and verify srcset output is identical for non-WebP sources
3. **Error Fallback Preservation**: Verify the error fallback UI renders identically when `onError` fires
4. **Contact Form Styling Preservation**: Verify form inputs, labels, and error messages retain their explicit color classes

### Unit Tests

- Test `OptimizedImage` with `.webp` source renders plain `<img>` (no `<picture>` wrapper or correct `<picture>` with `<source>`)
- Test `OptimizedImage` with `.jpg` source still renders `<picture>` + `<source>` + `<img>`
- Test `OptimizedImage` error fallback renders placeholder UI
- Test contact page H1 has `text-foreground` class
- Test contact page paragraph has explicit color class

### Property-Based Tests

- Generate random image source paths with `.webp` extension and verify the component renders with correct `width`/`height` attributes and no redundant `<source>`
- Generate random image source paths with non-`.webp` extensions and verify the component produces identical output to the original (preservation)
- Generate random `srcSetWidths` arrays with non-WebP sources and verify srcset generation is unchanged

### Integration Tests

- Render full `AccreditationSection` and verify all four logos have non-zero dimension attributes
- Render full `ContactPage` header section and verify all text elements have WCAG AA compliant color classes
- Verify `OptimizedImage` with various extensions renders correctly in the accreditation card layout
