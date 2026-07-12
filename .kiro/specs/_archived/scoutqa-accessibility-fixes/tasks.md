# Tasks

## Task 1: Tracker Error Differentiation
- [x] 1.1 Update `useApplicationTracker.ts` catch block to inspect `error.status` and produce status-specific error messages: 400 → format guidance with `APP-YYYYMMDD-XXXXXXXX` and `TRK-XXXXXXXXXXXX`, 404 → descriptive "not found" message, other → existing generic message
- [x] 1.2 Verify the `apiClient` error object carries `.status` for HTTP errors by checking the existing `executeRequest` error enhancement logic

## Task 2: Sign-Up Form inputMode Attributes
- [x] 2.1 Add `inputMode="email"` to the email `<Input>` on `SignUpPage.tsx`
- [x] 2.2 Add `inputMode="tel"` to the phone `<Input>` on `SignUpPage.tsx`
- [x] 2.3 Add `inputMode="text"` to the first name and last name `<Input>` fields on `SignUpPage.tsx`

## Task 3: Forgot Password Form inputMode Attribute
- [x] 3.1 Add `inputMode="email"` to the email `<Input>` on `ForgotPasswordPage.tsx`

## Task 4: Sign-In Form aria-label Attributes
- [x] 4.1 Add `aria-label="Account email"` to the email `<Input>` on `SignInPage.tsx`
- [x] 4.2 Add `aria-label="Account password"` to the password `<PasswordInput>` on `SignInPage.tsx`

## Task 5: Sign-Up Form aria-label Attributes
- [x] 5.1 Add `aria-label="Account email"` to the email `<Input>` on `SignUpPage.tsx`
- [x] 5.2 Add `aria-label="First name"` and `aria-label="Last name"` to the name `<Input>` fields on `SignUpPage.tsx`
- [x] 5.3 Add `aria-label="Phone number"` to the phone `<Input>` on `SignUpPage.tsx`
- [x] 5.4 Add `aria-label="Create password"` and `aria-label="Confirm password"` to the `<PasswordInput>` fields on `SignUpPage.tsx`

## Task 6: Contact Page SVG Accessibility
- [x] 6.1 Audit all SVG icons on `ContactPage.tsx` and confirm `aria-hidden="true"` is set on all decorative icons; add it where missing

## Task 7: Password Reset Form Alert Attributes
- [x] 7.1 Add `role="alert"`, `aria-live="assertive"`, and `aria-atomic="true"` to the error container `<div>` in `ResetPasswordPage.tsx`

## Task 8: Landing Page Color Contrast Fixes
- [x] 8.1 Verify and fix the secondary CTA ("See Our Programs") text contrast against the gradient background in `shape-landing-hero.tsx`
- [x] 8.2 Verify and fix the accreditation badge label contrast — increase `bg-slate-950/60` opacity if needed to meet 4.5:1 ratio

## Task 9: Password Toggle SVG Accessibility
- [x] 9.1 Add `aria-hidden="true"` to the `<Eye>` and `<EyeOff>` SVG icons in `PasswordInput.tsx`

## Task 10: Property-Based Tests
- [x] 10.1 Write property test: Tracker error differentiation by HTTP status code (Property 1) — generate random status codes and verify message mapping in `scoutqaAccessibilityFixValidation.property.test.ts`
- [x] 10.2 Write property test: No empty inputMode on auth form inputs (Property 2) in `scoutqaAccessibilityFixValidation.property.test.ts`
- [x] 10.3 Write property test: Input component label-to-id association (Property 3) in `scoutqaAccessibilityFixValidation.property.test.ts`
- [x] 10.4 Write property test: Decorative SVGs excluded from accessibility tree (Property 4) in `scoutqaAccessibilityFixValidation.property.test.ts`
- [x] 10.5 Write property test: Error alert attributes completeness (Property 5) in `scoutqaAccessibilityFixValidation.property.test.ts`
- [x] 10.6 Write property test: Password toggle accessibility (Property 6) in `scoutqaAccessibilityFixValidation.property.test.ts`

## Task 11: Unit Tests
- [x] 11.1 Write unit tests for specific inputMode values on each auth form field (Requirements 3.1–3.3, 4.1) in `scoutqaAccessibilityFixes.test.ts`
- [x] 11.2 Write unit tests for specific aria-label values on each auth form field (Requirements 5.1–5.2, 6.1–6.5) in `scoutqaAccessibilityFixes.test.ts`
- [x] 11.3 Write unit tests for landing page contrast verification (Requirements 9.1–9.2) in `scoutqaAccessibilityFixes.test.ts`
- [x] 11.4 Write unit test for tracker hook network error fallback (Requirement 1.3) in `scoutqaAccessibilityFixes.test.ts`
