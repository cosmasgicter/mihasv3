# Implementation Plan — Auth Forms Audit Fixes

- [x] 1. Write bug condition exploration tests (BEFORE implementing fix)
  - **Property 1: Bug Condition** — Mobile Overflow, Missing method="post", Missing noValidate
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **Bug 1 — AuthLayout mobile overflow (Scoped PBT)**:
    - Render the AuthLayout FormPanel and inspect the flex column's className
    - Assert the form panel flex column has `min-w-0` in its className
    - Assert the form card container has `overflow-hidden` in its className
    - On UNFIXED code this will FAIL because neither class is present
    - `isBugCondition_Overflow(input) := input.flexColumn NOT CONTAINS "min-w-0" OR input.formCard NOT CONTAINS "overflow-hidden"`
  - **Bug 2 — Form method="post" missing**:
    - Render SignInPage, SignUpPage, ForgotPasswordPage, ResetPasswordPage
    - For each page, locate the `<form>` element
    - Assert the form has `method="post"` attribute
    - On UNFIXED code this will FAIL because no form has an explicit method attribute
  - **Bug 3 — ForgotPasswordPage missing noValidate**:
    - Render ForgotPasswordPage and locate the `<form>` element
    - Assert the form has `noValidate` attribute (rendered as `novalidate` in HTML)
    - On UNFIXED code this will FAIL because the form lacks noValidate
    - Also check ResetPasswordPage for the same issue
  - Run tests on UNFIXED code — expect FAILURE
  - Place tests in `apps/admissions/tests/property/authFormsAuditBugCondition.property.test.ts`
  - _Requirements: 1.1, 1.4, 1.6_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** — Desktop Layout, Zod Validation, Anti-Enumeration
  - **IMPORTANT**: Follow observation-first methodology
  - **Desktop layout preservation**:
    - Render AuthLayout with `showBranding={true}` and verify the BrandingPanel wrapper has `hidden lg:flex lg:w-1/2` classes
    - Verify the FormPanel outer div has `lg:px-12 xl:px-16` classes
    - Verify the form card has `sm:p-8 lg:p-9` responsive padding classes
  - **Sign-in form validation preservation**:
    - Render SignInPage form and verify it has `noValidate` attribute (already present)
    - Verify the Zod schema requires email format and 6+ char password
  - **Sign-up form validation preservation**:
    - Render SignUpPage form and verify it has `noValidate` attribute (already present)
  - **Anti-enumeration preservation**:
    - Verify ForgotPasswordPage Zod schema validates email format
  - Run tests on UNFIXED code — expect ALL PASS
  - Place tests in `apps/admissions/tests/property/authFormsAuditPreservation.property.test.ts`
  - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix auth form defects
  - [x] 3.1 Add `min-w-0` to form panel flex column in `apps/admissions/src/components/auth/AuthLayout.tsx`
    - In the `AuthLayout` component, change the form panel column div's className from `'flex flex-1 flex-col overflow-y-auto'` to `'flex flex-1 flex-col overflow-y-auto min-w-0'`
    - This prevents the flex child from expanding beyond its container on narrow viewports
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2_

  - [x] 3.2 Add `overflow-hidden` to form card in `apps/admissions/src/components/auth/AuthLayout.tsx`
    - In the `FormPanel` component, add `overflow-hidden` to the form card div's className
    - Change `"mt-6 rounded-[28px] border border-border/70 bg-background/90 p-5 shadow-xl backdrop-blur sm:p-8 lg:p-9"` to `"mt-6 overflow-hidden rounded-[28px] border border-border/70 bg-background/90 p-5 shadow-xl backdrop-blur sm:p-8 lg:p-9"`
    - _Requirements: 1.1, 2.2_

  - [x] 3.3 Add `method="post"` to all auth form elements
    - `apps/admissions/src/pages/auth/SignInPage.tsx`: Add `method="post"` to the `<form>` element
    - `apps/admissions/src/pages/auth/SignUpPage.tsx`: Add `method="post"` to the `<form>` element
    - `apps/admissions/src/pages/auth/ForgotPasswordPage.tsx`: Add `method="post"` to the `<form>` element
    - `apps/admissions/src/pages/auth/ResetPasswordPage.tsx`: Add `method="post"` to the `<form>` element
    - _Requirements: 1.4, 1.5, 2.3_

  - [x] 3.4 Add `noValidate` to forgot password and reset password forms
    - `apps/admissions/src/pages/auth/ForgotPasswordPage.tsx`: Add `noValidate` to the `<form>` element
    - `apps/admissions/src/pages/auth/ResetPasswordPage.tsx`: Add `noValidate` to the `<form>` element
    - SignInPage and SignUpPage already have `noValidate`
    - _Requirements: 1.6, 2.4_

  - [x] 3.5 Verify bug condition exploration tests now pass
    - Re-run the SAME tests from task 1 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms all bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.6 Verify preservation tests still pass
    - Re-run the SAME tests from task 2 — do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 4. Write unit tests for all fixes
  - **AuthLayout mobile overflow unit tests** in `apps/admissions/tests/unit/authLayoutMobileOverflow.test.ts`:
    - Test AuthLayout form panel column has `min-w-0` class
    - Test AuthLayout form card has `overflow-hidden` class
    - Test AuthLayout desktop layout classes are preserved (`lg:w-1/2`, `lg:px-12`)
    - Test AuthLayout mobile gradient bar is present (`lg:hidden`)
  - **Auth form method and noValidate unit tests** in `apps/admissions/tests/unit/authFormAttributes.test.ts`:
    - Test SignInPage form has `method="post"` and `noValidate`
    - Test SignUpPage form has `method="post"` and `noValidate`
    - Test ForgotPasswordPage form has `method="post"` and `noValidate`
    - Test ResetPasswordPage form has `method="post"` and `noValidate`
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.3_

- [x] 5. Checkpoint — Ensure all tests pass
  - Run `cd apps/admissions && bun run test` to verify all new and existing tests pass
  - Run `cd apps/admissions && bun run lint` to verify no lint regressions
  - Run `cd apps/admissions && bun run build` to verify production build succeeds
