# Bugfix Requirements Document

## Introduction

ScoutQA production audit of the MIHAS admissions landing page (https://apply.mihas.edu.zm) scored 94/100 (A-) but identified two issues: accreditation logo images failing to render (naturalWidth/naturalHeight 0x0, complete: false), and WCAG AA color contrast violations on the contact page header section. This document captures the bug conditions and expected fixes for both findings.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the AccreditationSection renders logos whose `src` is already a `.webp` file (e.g. `GNCLogo.webp`, `hpc_logobig.webp`, `eczlogo.webp`, `unza.webp`) THEN the OptimizedImage component's WebP derivation regex `/\.(jpe?g|png)$/i` does not match, `hasWebp` evaluates to false, no `<source>` element is generated inside the `<picture>`, and the `<img>` element renders inside a `<picture className="block w-full h-full">` wrapper without explicit intrinsic dimension hints that the browser can resolve against the constrained parent container (h-12 w-12 / sm:h-16 sm:w-16), resulting in images reporting naturalWidth/naturalHeight of 0x0 and `complete: false`.

1.2 WHEN the `<picture>` element wraps an `<img>` whose source is already WebP and the parent container has fixed dimensions (h-12 w-12 / sm:h-16 sm:w-16 with p-2), THEN the image may fail to paint at the correct intrinsic size because the `<img>` relies on CSS classes (`h-full w-full object-contain`) without the `<picture>` element properly propagating dimension constraints, causing the browser to report zero natural dimensions.

1.3 WHEN the contact page header section renders with `bg-gradient-to-br from-primary/10 via-background to-secondary/10` THEN the H1 element "Contact Admissions" has no explicit text color class (only `text-3xl font-bold sm:text-4xl`), relying on CSS inheritance which may not resolve to `text-foreground` through the gradient container, causing ScoutQA to measure contrast ratios as low as 1.18:1 against the gradient background.

1.4 WHEN the contact page header paragraph uses `text-muted-foreground` on the gradient background with `from-primary/10` and `to-secondary/10` color stops THEN the effective contrast may fall below WCAG AA 4.5:1 requirements at certain gradient positions where the background color blends with the semi-transparent primary/secondary overlays.

### Expected Behavior (Correct)

2.1 WHEN the AccreditationSection renders logos whose `src` is already a `.webp` file THEN the OptimizedImage component SHALL correctly handle WebP-native sources so that the `<img>` element loads successfully with non-zero naturalWidth/naturalHeight and `complete: true`.

2.2 WHEN the `<picture>` element wraps an `<img>` inside a fixed-dimension parent container THEN the image SHALL render at the correct size by ensuring proper dimension propagation between the `<picture>` wrapper, the `<img>` element, and the parent container's constraints.

2.3 WHEN the contact page header section renders with a gradient background THEN the H1 "Contact Admissions" SHALL have an explicit `text-foreground` class ensuring a minimum contrast ratio of 4.5:1 (WCAG AA) against all gradient positions.

2.4 WHEN the contact page header paragraph renders on the gradient background THEN the text SHALL maintain WCAG AA compliant contrast (minimum 4.5:1) by using explicit color classes that do not depend on inheritance through semi-transparent gradient layers.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN OptimizedImage receives a `src` with a non-WebP extension (`.jpg`, `.jpeg`, `.png`) THEN the system SHALL CONTINUE TO derive a WebP `<source>` element and render the fallback `<img>` as it does today.

3.2 WHEN OptimizedImage encounters an image load error THEN the system SHALL CONTINUE TO display the placeholder fallback UI with the broken-image icon and alt text.

3.3 WHEN the contact page form inputs, labels, and error messages render THEN the system SHALL CONTINUE TO display with their current explicit `text-foreground`, `text-muted-foreground`, and `text-destructive` color classes unchanged.

3.4 WHEN the AccreditationSection renders card titles, organization names, and descriptions THEN the system SHALL CONTINUE TO display with their current `text-foreground` and `text-muted-foreground` styling unchanged.

3.5 WHEN OptimizedImage is used with `srcSetWidths` for responsive images elsewhere on the landing page THEN the system SHALL CONTINUE TO generate correct srcset attributes for both WebP sources and fallback formats.
