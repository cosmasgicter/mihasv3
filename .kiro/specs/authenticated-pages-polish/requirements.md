# Requirements Document

## Introduction

This specification addresses six remaining UI/UX issues discovered during the authenticated pages audit of `apps/admissions/`. The issues span missing SEO metadata on authenticated pages, heading hierarchy inconsistencies in admin views, missing accessibility labels on icon-only interactive elements, signup flow optimization to reduce upfront friction, and pre-existing test failures in the student dashboard test suite. All changes are frontend-only within `apps/admissions/`.

## Glossary

- **App**: The MIHAS admissions single-page application at `apps/admissions/`
- **Seo_Component**: The `<Seo>` component at `src/components/seo/Seo.tsx` that manages `<title>`, meta description, Open Graph tags, and robots directives via `useEffect`
- **PageShell**: The page layout wrapper at `src/components/ui/PageShell.tsx` that renders the page title as `<h1>`
- **Admin_Settings_Page**: The admin operational settings page at `src/pages/admin/Settings.tsx`
- **AuditTrail_Page**: The admin audit trail page at `src/pages/admin/AuditTrail.tsx`
- **SignUp_Page**: The student registration page at `src/pages/auth/SignUpPage.tsx`
- **Student_Dashboard_Tests**: The test file at `tests/unit/page-verification/student-dashboard.test.tsx`
- **ErrorDisplay**: The error presentation component at `src/components/ui/ErrorDisplay.tsx`
- **Wizard**: The multi-step application form at `src/pages/student/applicationWizard/`

## Requirements

### Requirement 1: Add Seo Components to Authenticated Pages

**User Story:** As a student or admin, I want each authenticated page to set a meaningful browser tab title and robots noindex directive, so that I can identify open tabs and search engines do not index private content.

#### Acceptance Criteria

1. THE App SHALL render a Seo_Component with `noindex={true}` on each of the following student pages: Settings, NotificationSettings, Payment, Interview, ApplicationStatus, ApplicationDetail, and ApplicationWizard.
2. THE App SHALL render a Seo_Component with `noindex={true}` on each of the following admin pages: Applications, Programs, Intakes, Users, AuditTrail, ProgramFees, and Settings.
3. WHEN an authenticated page renders its Seo_Component, THE Seo_Component SHALL set a descriptive `title` prop that includes the page name and the site name suffix "MIHAS-KATC Admissions" (e.g., "My Settings | MIHAS-KATC Admissions").
4. WHEN an authenticated page renders its Seo_Component, THE Seo_Component SHALL set a `description` prop that summarizes the page purpose in one sentence.
5. WHEN an authenticated page renders its Seo_Component, THE Seo_Component SHALL set the `robots` meta tag to `noindex, nofollow` via the existing `noindex` prop.
6. THE student Dashboard page and admin Dashboard page SHALL retain their existing Seo_Component usage without regression.

---

### Requirement 2: Fix Heading Hierarchy in Admin Settings Page

**User Story:** As a screen reader user, I want the admin Settings page to use a consistent heading hierarchy, so that I can navigate the page structure predictably.

#### Acceptance Criteria

1. THE Admin_Settings_Page SHALL use `<h2>` for the two top-level section headings: "Guided Configuration" and "Advanced Keys".
2. THE Admin_Settings_Page SHALL use `<h3>` for guided section group titles (e.g., "Admissions Operations", "Portal Appearance") that appear within the Guided Configuration section.
3. THE Admin_Settings_Page SHALL use `<h4>` for individual setting labels (blueprint labels) that appear within each guided section group.
4. THE Admin_Settings_Page SHALL use `<h3>` for the "Create Advanced Key" heading and for empty-state headings within the Advanced Keys section.
5. THE Admin_Settings_Page SHALL NOT skip heading levels within any section (e.g., no jump from `<h2>` to `<h4>` without an intervening `<h3>`).

---

### Requirement 3: Fix AuditTrail Heading Levels

**User Story:** As a screen reader user, I want the AuditTrail page to use correct heading levels for audit entry titles, so that the page structure is navigable.

#### Acceptance Criteria

1. WHEN the AuditTrail_Page renders inside a PageShell (which provides the `<h1>`), THE AuditTrail_Page SHALL use `<h2>` for top-level section headings ("Category breakdown", "Most frequent actions", "Filter activity").
2. WHEN the AuditTrail_Page renders an individual audit entry card, THE AuditEntryCard component SHALL use `<h3>` for the action title (currently uses `<h3>`, which is correct given the `<h2>` sections above).
3. WHEN the AuditTrail_Page renders expanded detail sections within an audit entry card, THE AuditEntryCard component SHALL use `<h4>` for sub-section headings ("Request context", "Change payload").
4. THE AuditTrail_Page SHALL NOT skip heading levels between the page title (`<h1>` from PageShell) and the section headings.

---

### Requirement 4: Add Aria Labels to Icon-Only Interactive Elements

**User Story:** As a screen reader user, I want icon-only buttons and indicators to have accessible labels, so that I understand their purpose without seeing the visual icon.

#### Acceptance Criteria

1. WHEN a `<Button>` component renders with only an icon and no visible text label, THE Button SHALL include an `aria-label` attribute that describes the action (e.g., "Edit setting", "Delete setting", "Save setting").
2. THE Admin_Settings_Page icon-only action buttons (Edit, Delete, Save, Cancel) in the advanced settings table SHALL each have a descriptive `aria-label`.
3. WHEN the NotificationSettings page renders the unread indicator dot, THE indicator SHALL retain its existing `aria-label="Unread notification"` without regression.
4. THE App SHALL audit all icon-only `<Button>` elements across authenticated student and admin pages and add `aria-label` attributes where the button text content is empty or icon-only.

---

### Requirement 5: Optimize Signup Flow by Deferring Non-Essential Fields

**User Story:** As a prospective student, I want to create an account quickly with only essential information, so that I can start my application without filling out a long registration form.

#### Acceptance Criteria

1. THE SignUp_Page SHALL require only the following fields for account creation: email, password, confirm password, first name, last name, and phone number.
2. THE SignUp_Page SHALL remove the "Residence and identity" fieldset (residence_town, nationality) and the "Emergency contact" fieldset (next_of_kin_name, next_of_kin_phone) from the registration form.
3. THE SignUp_Page Zod schema SHALL remove `residence_town`, `nationality`, `next_of_kin_name`, and `next_of_kin_phone` from the validation schema.
4. WHEN a student creates an account without providing residence_town, nationality, next_of_kin_name, or next_of_kin_phone, THE App SHALL allow account creation to succeed without those fields.
5. THE deferred fields (residence_town, nationality, next_of_kin_name, next_of_kin_phone) SHALL remain available for completion on the student Settings page or during the application wizard profile step.
6. THE SignUp_Page SHALL retain the "Portal access" fieldset (email, password, confirm password) and the "Profile basics" fieldset (first name, last name, phone) without modification.

---

### Requirement 6: Fix Student Dashboard Test Expectations

**User Story:** As a developer, I want the student dashboard tests to pass against the current error display behavior, so that the test suite is green and trustworthy.

#### Acceptance Criteria

1. WHEN the applications endpoint fails, THE Student_Dashboard_Tests SHALL assert that the error section contains the text "Applications failed to load" and a user-friendly error message — not the raw API URL `/api/v1/applications/`.
2. WHEN the intakes endpoint fails, THE Student_Dashboard_Tests SHALL assert that the error section contains the text "Intakes failed to load" and a user-friendly error message — not the raw API URL `/api/v1/catalog/intakes/`.
3. WHEN the interviews endpoint fails, THE Student_Dashboard_Tests SHALL assert that the error section contains the text "Interviews failed to load" and a user-friendly error message — not the raw API URL `/api/v1/interviews/`.
4. THE Student_Dashboard_Tests SHALL NOT assert the presence of raw API endpoint URLs in rendered error output, because the Dashboard uses the ErrorDisplay component which shows user-friendly messages.
5. THE Student_Dashboard_Tests SHALL verify that the ErrorDisplay "Retry" button is present when a section fails to load.
6. WHEN one endpoint fails and others succeed, THE Student_Dashboard_Tests SHALL verify that the successful sections still render their content (partial failure isolation).
