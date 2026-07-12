# Implementation Plan: Authenticated Pages Polish

## Overview

Six frontend-only improvements within `apps/admissions/`: add `<Seo>` to 14 authenticated pages, fix heading hierarchy in admin Settings and AuditTrail, add `aria-label` to icon-only buttons, simplify the signup form, and fix student dashboard test assertions. All changes are TypeScript/React, no backend modifications.

## Tasks

- [x] 1. Add Seo components to student authenticated pages
  - [x] 1.1 Add `<Seo>` to student Settings, NotificationSettings, Payment, Interview, ApplicationStatus, ApplicationDetail, and ApplicationWizard pages
    - Import `Seo` from `@/components/seo/Seo`
    - Render `<Seo title="{Page Name} | MIHAS-KATC Admissions" description="..." noindex={true} />` in each page
    - Use the title values from the design document table
    - _Requirements: 1.1, 1.3, 1.4, 1.5_

  - [x] 1.2 Write property test: authenticated pages set noindex robots directive (student pages)
    - **Property 1: Authenticated pages set noindex robots directive**
    - **Validates: Requirements 1.1, 1.5**

- [x] 2. Add Seo components to admin authenticated pages
  - [x] 2.1 Add `<Seo>` to admin Applications, Programs, Intakes, Users, AuditTrail, ProgramFees, and Settings pages
    - Import `Seo` from `@/components/seo/Seo`
    - Render `<Seo title="{Page Name} | MIHAS-KATC Admissions" description="..." noindex={true} />` in each page
    - Use the title values from the design document table
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

  - [x] 2.2 Write property test: authenticated page titles include site name suffix
    - **Property 2: Authenticated page titles include site name suffix**
    - **Validates: Requirements 1.3**

  - [x] 2.3 Verify student Dashboard and admin Dashboard retain existing Seo usage without regression
    - Assert existing `<Seo>` props on both Dashboard pages are unchanged
    - _Requirements: 1.6_

- [x] 3. Checkpoint — Seo integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Fix heading hierarchy and add aria-labels to admin pages
  - [x] 4.1 Verify and fix heading hierarchy in admin Settings page
    - Audit heading tags in `src/pages/admin/Settings.tsx` and its sub-components
    - Ensure h1 → h2 → h3 → h4 flow with no skipped levels
    - Design notes the hierarchy is already correct — verify and fix only if discrepancies found
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 4.2 Verify and fix heading hierarchy in AuditTrail page
    - Audit heading tags in `src/pages/admin/AuditTrail.tsx` and its sub-components
    - Ensure section headings are `<h2>`, entry titles are `<h3>`, detail sub-sections are `<h4>`
    - Design notes the hierarchy is already correct — verify and fix only if discrepancies found
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 4.3 Add `aria-label` to icon-only buttons in admin Settings advanced settings table
    - Add `aria-label="Edit setting"` to Edit icon button
    - Add `aria-label="Delete setting"` to Delete icon button
    - Add `aria-label="Save setting"` to Save icon button
    - Add `aria-label="Cancel editing"` to Cancel icon button
    - _Requirements: 4.1, 4.2_

  - [x] 4.4 Audit and add `aria-label` to all remaining icon-only buttons across authenticated pages
    - Scan student and admin pages for `<Button>` elements with only icon children and no visible text
    - Add descriptive `aria-label` to each icon-only button found
    - Verify NotificationSettings unread indicator retains its existing `aria-label`
    - _Requirements: 4.1, 4.3, 4.4_

  - [x] 4.5 Write property test: icon-only buttons have accessible labels
    - **Property 4: Icon-only buttons have accessible labels**
    - **Validates: Requirements 4.1, 4.2**

  - [x] 4.6 Write property test: heading hierarchy is valid within PageShell pages
    - **Property 3: Heading hierarchy is valid within PageShell pages**
    - **Validates: Requirements 2.5, 3.4**

- [x] 5. Checkpoint — Heading hierarchy and aria-labels
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Optimize signup flow by removing non-essential fields
  - [x] 6.1 Remove deferred fields from SignUpPage Zod schema and form JSX
    - Remove `residence_town`, `nationality`, `next_of_kin_name`, `next_of_kin_phone` from `signUpSchema`
    - Remove the "Residence and identity" fieldset from JSX
    - Remove the "Emergency contact" fieldset from JSX
    - Remove these fields from `FormErrorAnnouncer` `fieldLabels` map
    - Remove these fields from the `signUp` mutation destructuring
    - Verify "Portal access" and "Profile basics" fieldsets remain intact
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6_

  - [x] 6.2 Write property test: SignUp schema accepts registration without deferred fields
    - **Property 5: SignUp schema accepts registration without deferred fields**
    - **Validates: Requirements 5.3**

  - [x] 6.3 Write property test: SignUp schema rejects registration without required fields
    - **Property 6: SignUp schema rejects registration without required fields**
    - **Validates: Requirements 5.1, 5.6**

- [x] 7. Checkpoint — Signup flow
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Fix student dashboard test expectations
  - [x] 8.1 Update error assertion tests in `tests/unit/page-verification/student-dashboard.test.tsx`
    - Replace assertions for raw API URLs (`/api/v1/applications/`, `/api/v1/catalog/intakes/`, `/api/v1/interviews/`) with user-friendly error messages
    - Assert error sections contain titles like "Applications failed to load", "Intakes failed to load", "Interviews failed to load"
    - Assert the presence of a "Retry" button in each error section
    - Verify partial failure isolation: when one endpoint fails, other sections still render
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 9. Final checkpoint — All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Property test file: `apps/admissions/tests/property/authenticated-pages-polish.test.tsx`
- Test command: `cd apps/admissions && bun run test`
