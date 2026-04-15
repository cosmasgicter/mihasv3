# Auth Forms Audit Fixes — Bugfix Design

## Overview

ScoutQA audit found three defects in the auth forms: (1) horizontal overflow on 375px mobile viewports caused by unconstrained flex children and nested padding in AuthLayout; (2) auth form HTML elements missing `method="post"`, defaulting to GET; (3) forgot password form missing `noValidate`, causing inconsistent validation. All fixes are surgical CSS/attribute changes with no logic modifications.

## Glossary

- **Bug_Condition (C)**: Three conditions — (C₁) AuthLayout form panel overflows on viewports ≤475px due to `flex-1` without `min-w-0`; (C₂) auth form elements lack `method="post"` attribute; (C₃) forgot password form lacks `noValidate` attribute.
- **AuthLayout**: Shared layout component at `apps/admissions/src/components/auth/AuthLayout.tsx` wrapping all auth pages.
- **FormPanel**: Inner component of AuthLayout that renders the form card with nested padding layers.

## Bug Details

### Bug Condition

**C₁ — Mobile overflow**: The `AuthLayout` root uses `<div className="flex min-h-screen">` with the form panel column using `flex flex-1 flex-col overflow-y-auto`. The `flex-1` allows the column to grow but doesn't set `min-w-0`, so the column's minimum width defaults to `min-content`. Inside, the FormPanel has `px-4` outer padding, then a form card with `p-5 sm:p-8 rounded-[28px]`, then page-specific content (e.g., sign-in fieldset with `p-4 rounded-2xl border`). On a 375px viewport, the cumulative padding (16px + 20px + 16px = 52px per side = 104px total) plus border widths leaves only ~271px for content, but the form card's `rounded-[28px]` and the badge's `tracking-[0.18em]` uppercase text can push the minimum content width beyond the viewport.

**C₂ — Form method GET**: `SignInPage.tsx` form: `<form className="space-y-6" onSubmit={...} noValidate>` — no `method`. `SignUpPage.tsx` and `ForgotPasswordPage.tsx` forms similarly lack `method`.

**C₃ — Missing noValidate**: `ForgotPasswordPage.tsx` form: `<form className="space-y-6 ..." onSubmit={...}>` — no `noValidate`. The sign-in form has `noValidate` but forgot password doesn't.

## Fix Implementation

### Changes Required

**File 1**: `apps/admissions/src/components/auth/AuthLayout.tsx`

1. Add `min-w-0` to the form panel flex column (line ~374): Change `'flex flex-1 flex-col overflow-y-auto'` to `'flex flex-1 flex-col overflow-y-auto min-w-0'`. This prevents the flex child from expanding beyond its container.

2. Add `overflow-hidden` to the form card container: Change `"mt-6 rounded-[28px] border border-border/70 bg-background/90 p-5 shadow-xl backdrop-blur sm:p-8 lg:p-9"` to `"mt-6 overflow-hidden rounded-[28px] border border-border/70 bg-background/90 p-5 shadow-xl backdrop-blur sm:p-8 lg:p-9"`. This clips any content that exceeds the card boundary.

**File 2**: `apps/admissions/src/pages/auth/SignInPage.tsx`

3. Add `method="post"` to the form element.

**File 3**: `apps/admissions/src/pages/auth/SignUpPage.tsx`

4. Add `method="post"` to the form element.

**File 4**: `apps/admissions/src/pages/auth/ForgotPasswordPage.tsx`

5. Add `method="post"` and `noValidate` to the form element.

**File 5**: `apps/admissions/src/pages/auth/ResetPasswordPage.tsx`

6. Add `method="post"` to the form element (if it has a form element).

## Correctness Properties

Property 1: On a 375px viewport, no auth page produces a document body `scrollWidth` greater than 375px.

Property 2: Every `<form>` element in auth pages has `method="post"` in the rendered HTML.

Property 3: Every `<form>` element in auth pages that uses React Hook Form + Zod validation has `noValidate` in the rendered HTML.

Property 4 (Preservation): On a 1024px+ viewport, the split-panel layout renders identically — BrandingPanel visible, FormPanel padding and styling unchanged.

## Testing Strategy

### Bug Condition Tests
- Render each auth page form and assert `method="post"` attribute exists
- Render ForgotPasswordPage form and assert `noValidate` attribute exists
- For mobile overflow: render AuthLayout with content and verify the form card has `overflow-hidden` class and the flex column has `min-w-0` class

### Preservation Tests
- Render AuthLayout and verify desktop classes (`lg:w-1/2`, `lg:px-12`) are present
- Render sign-in form and verify Zod validation still works (email format, password length)
- Render forgot password form and verify anti-enumeration message still appears on submit
