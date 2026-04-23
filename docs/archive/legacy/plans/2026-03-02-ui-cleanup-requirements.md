# UI Cleanup Requirements (Public Experience)

Date: 2026-03-02
Owner: Codex session
Scope: Landing page, public tracker, contact, auth pages, shared public shell

## Problem Statement
The public UI is inconsistent across pages, several elements feel misaligned/dense on mobile, and the home experience under-delivers visually while showing weak perceived performance.

## Issue Inventory (Scanned)
Evidence sources:
- Route screenshots and metrics: `/tmp/ui-scan/report.json`, `/tmp/ui-scan/*.png`
- Code inspection of public layout, landing animations, tracker/auth components

1. Critical: homepage sections are visually missing/blank due broken stagger animation state.
- Affected file: `src/components/smoothui/scroll-reveal.tsx`
- Symptom: cards and image sections stay at `opacity-0` and appear absent.

2. Critical: above-the-fold hero has no real image content, reducing visual trust and hurting LCP/page perception.
- Affected file: `src/pages/LandingPage.tsx`
- Symptom: user sees mostly gradient + text; images only appear later (or appear missing when reveal fails).

3. High: inconsistent visual language between landing/contact/tracker/auth (spacing, card rhythm, text density, button size).
- Affected files: `src/pages/LandingPage.tsx`, `src/pages/ContactPage.tsx`, `src/pages/public/tracker/*`, `src/components/auth/AuthLayout.tsx`

4. High: mobile readability/tap ergonomics are weak in tracker helper/status blocks.
- Evidence: many small text blocks and compact controls in `/tmp/ui-scan/mobile-track-application.png`

5. Medium: invalid image prop warning in runtime (`fetchPriority` on `img`) adds console noise and risks future rendering mismatch.
- Affected file: `src/components/ui/OptimizedImage.tsx`

6. Medium: auth layout has React key warning in branding panel map.
- Affected file: `src/components/auth/AuthLayout.tsx`

7. Medium: gradient page headers use low-contrast foreground defaults on rich backgrounds.
- Affected file: `src/components/ui/PageHeader.tsx`

## Functional Requirements
1. Homepage must render visible section content consistently without hidden cards/images.
2. Hero must include at least one high-quality, optimized visual image above fold.
3. Public pages must share coherent spacing, radius, type scale, and interaction sizing.
4. Mobile controls must meet minimum 44px touch targets where practical.
5. Remove known runtime warnings in scanned public routes.

## Performance Requirements
1. Prioritize hero/LCP image delivery (eager loading and appropriate decoding strategy).
2. Keep below-the-fold imagery lazy-loaded.
3. Reduce costly/fragile animation behavior that hides content or delays rendering.
4. Prepare for Lighthouse rerun command once unrestricted network/package fetch is available.

## Acceptance Criteria
1. `StaggerItem` content becomes visible when parent section enters view.
2. Home hero visibly includes image media on desktop and mobile.
3. Public pages show consistent padding rhythm and CTA/input heights.
4. No React warnings for missing keys or invalid image DOM props on scanned pages.
5. Updated screenshots from `/tmp/ui-scan/*.png` show visible homepage sections and improved mobile legibility.
