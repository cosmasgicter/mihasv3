# Requirements Document

## Introduction

Comprehensive tech debt remediation based on a full codebase audit that identified 30 items across the MIHAS monorepo. The audit covers critical runtime bugs, dead code, stale comments, deprecated API surfaces, backend data-integrity gaps, unused dependencies, inconsistent error handling, duplicated logic, stale spec artifacts, and configuration drift. This spec groups the 30 items into logical requirement areas and defines acceptance criteria for each remediation.

## Glossary

- **Error_Boundary**: The `EnhancedErrorBoundary` React class component in `apps/admissions/src/components/ui/EnhancedErrorHandling.tsx` that catches unhandled React rendering errors
- **Error_Reporter**: The `reportError()` function exported from `apps/admissions/src/lib/errorReporter.ts` that batches and POSTs frontend errors to `/api/v1/errors/report/`
- **Contact_Form**: The contact inquiry form rendered by `apps/admissions/src/pages/ContactPage.tsx`
- **Notification_API**: The backend endpoint responsible for receiving and processing contact form submissions
- **Bulk_Status_View**: The `ApplicationBulkStatusView` in `backend/apps/applications/views.py` that updates multiple application statuses in a single request
- **Review_View**: The `ApplicationReviewView` in `backend/apps/applications/views.py` that transitions a single application's status
- **Acceptance_Letter_View**: The `AcceptanceLetterView` in `backend/apps/applications/views.py`
- **Finance_Receipt_View**: The `FinanceReceiptView` in `backend/apps/applications/views.py`
- **Accounts_Views**: The authentication and session views in `backend/apps/accounts/views.py`
- **Documents_Views**: The document and payment views in `backend/apps/documents/views.py`
- **Admissions_Frontend**: The React SPA in `apps/admissions/`
- **Backend**: The Django REST Framework API in `backend/`
- **Spec_Directory**: A folder under `.kiro/specs/` containing requirements, design, and task files for a feature
- **Fallback_Email_Constant**: The hardcoded `admin@mihas.edu.zm` string used as a fallback alert email recipient across multiple backend files

## Requirements

### Requirement 1: Fix Critical Error Boundary Reporting

**User Story:** As a platform operator, I want frontend errors caught by the error boundary to reach the production error monitoring pipeline, so that runtime crashes are visible and actionable.

#### Acceptance Criteria

1. WHEN the Error_Boundary catches a rendering error, THE Error_Boundary SHALL call the Error_Reporter `reportError()` function instead of sending a `fetch` request to `/log-error` (audit item F1)
2. WHEN the Error_Boundary reports an error, THE Error_Reporter SHALL POST the error payload to `/api/v1/errors/report/` following the existing error reporting contract
3. THE Error_Boundary SHALL NOT contain any reference to the `/log-error` endpoint after remediation
4. IF the Error_Reporter fails to send the error report, THEN THE Error_Boundary SHALL silently degrade without breaking the fallback UI

### Requirement 2: Fix Contact Form Submission

**User Story:** As a prospective student, I want my contact form submission to reach the admissions team, so that my inquiry is received and can be responded to.

#### Acceptance Criteria

1. WHEN a user submits the Contact_Form with valid data, THE Contact_Form SHALL send the submission payload to the Notification_API backend endpoint
2. WHEN the Notification_API returns a success response, THE Contact_Form SHALL display a confirmation message to the user and reset the form fields
3. IF the Notification_API returns an error or the network request fails, THEN THE Contact_Form SHALL display an error message to the user without losing the entered data
4. THE Contact_Form SHALL NOT use `console.log` as its submission handler after remediation (audit item F2)

### Requirement 3: Remove Frontend Dead Code Files

**User Story:** As a developer, I want unused source files removed from the codebase, so that the project stays navigable and dead code does not mislead future contributors.

#### Acceptance Criteria

1. THE Admissions_Frontend SHALL NOT contain the file `src/services/documentExtraction.ts` after remediation (audit item F3)
2. THE Admissions_Frontend SHALL NOT contain the file `src/utils/lazy-imports.ts` after remediation (audit item F4)
3. THE Admissions_Frontend SHALL NOT contain the file `src/utils/animationOptimization.ts` after remediation (audit item F5)
4. THE Admissions_Frontend SHALL NOT contain the file `src/utils/performance.ts` after remediation (audit item F6)
5. WHEN any of the four files are deleted, THE Admissions_Frontend SHALL continue to build and pass all existing tests without import errors

### Requirement 4: Remove Stale Comments

**User Story:** As a developer, I want misleading comments referencing decommissioned systems removed, so that the codebase accurately reflects the current architecture.

#### Acceptance Criteria

1. THE Error_Boundary file SHALL NOT contain comments referencing "Supabase error format" after remediation (audit item F7)
2. THE files `Dashboard.tsx`, `useRealtime.ts`, and `RealtimeStatusContext.tsx` SHALL NOT contain comments referencing "replaces Supabase Realtime" after remediation (audit item F8)
3. WHEN stale comments are removed, THE Admissions_Frontend SHALL continue to build and pass all existing tests

### Requirement 5: Remove Deprecated Frontend API Surfaces

**User Story:** As a developer, I want deprecated fields and props removed from the codebase, so that only the canonical API surface is used and maintained.

#### Acceptance Criteria

1. THE `ScheduleInterviewData` interface in `interviews.ts` SHALL NOT contain the deprecated `application_id` field after remediation; all callers SHALL use `applicationId` exclusively (audit item F9)
2. THE `EmptyStateProps` interface in `EmptyState.tsx` SHALL NOT contain the deprecated `title` prop after remediation; all callers SHALL use `heading` exclusively (audit item F10)
3. WHEN deprecated fields are removed, THE Admissions_Frontend SHALL continue to build and pass all existing tests without type errors

### Requirement 6: Wrap Bulk Status Updates in a Database Transaction

**User Story:** As an admin, I want bulk application status updates to either fully succeed or fully roll back, so that a partial failure does not leave applications in an inconsistent state.

#### Acceptance Criteria

1. WHEN the Bulk_Status_View processes a batch of application status updates, THE Bulk_Status_View SHALL wrap all database writes in a `transaction.atomic()` block (audit item B1)
2. IF any single application update within the batch fails, THEN THE Bulk_Status_View SHALL roll back all changes in the batch and return an error response
3. WHEN the entire batch succeeds, THE Bulk_Status_View SHALL commit all changes and return the count of updated applications

### Requirement 7: Deduplicate Acceptance Letter and Finance Receipt Views

**User Story:** As a developer, I want the duplicated PDF generation logic between AcceptanceLetterView and FinanceReceiptView extracted into a shared helper, so that bug fixes and changes apply to both views consistently.

#### Acceptance Criteria

1. THE Backend SHALL contain a shared helper or base class that encapsulates the common PDF generation logic currently duplicated between Acceptance_Letter_View and Finance_Receipt_View (audit item B2)
2. THE Acceptance_Letter_View SHALL delegate to the shared helper for common PDF generation steps
3. THE Finance_Receipt_View SHALL delegate to the shared helper for common PDF generation steps
4. WHEN the shared helper is introduced, THE Backend SHALL continue to pass all existing tests for both views

### Requirement 8: Remove Dead Backend Dependency

**User Story:** As a developer, I want unused Python packages removed from `requirements.txt`, so that the dependency surface is minimal and accurate.

#### Acceptance Criteria

1. THE `backend/requirements.txt` file SHALL NOT list `djangorestframework-simplejwt` after remediation (audit item B3)
2. WHEN the dependency is removed, THE Backend SHALL continue to pass `python3 manage.py check` and all existing tests without import errors

### Requirement 9: Remove Unused Frontend npm Dependencies

**User Story:** As a developer, I want unused npm packages removed from `package.json`, so that install times, bundle risk, and maintenance burden are reduced.

#### Acceptance Criteria

1. THE Admissions_Frontend `package.json` SHALL NOT list `exceljs` after remediation (audit item F11)
2. THE Admissions_Frontend `package.json` SHALL NOT list `xlsx` after remediation (audit item F12)
3. THE Admissions_Frontend `package.json` SHALL NOT list `form-data` after remediation (audit item F13)
4. THE Admissions_Frontend `package.json` SHALL NOT list `react-window` or `@types/react-window` after remediation (audit item F14)
5. THE Admissions_Frontend `package.json` SHALL NOT list `@tsparticles/react` or `@tsparticles/slim` after remediation (audit item F15)
6. THE Admissions_Frontend `package.json` SHALL NOT list `dotenv` after remediation (audit item F16)
7. WHEN unused dependencies are removed, THE Admissions_Frontend SHALL continue to build and pass all existing tests


### Requirement 10: Harden Backend Error Handling in Accounts Views

**User Story:** As a platform operator, I want authentication-related error handling to log failures consistently instead of silently swallowing exceptions, so that token rotation and blacklisting failures are diagnosable.

#### Acceptance Criteria

1. WHEN JTI blacklisting fails during logout, THE Accounts_Views SHALL log the exception at warning level instead of using a bare `except Exception: pass` (audit item B4)
2. WHEN token rotation fails during refresh, THE Accounts_Views SHALL log the exception at warning level instead of using a bare `except Exception` that swallows the error (audit item B5)
3. THE Accounts_Views SHALL use a consistent error handling pattern across logout (B4), refresh (B5), and any other bare exception handlers (audit item B6)
4. WHEN exceptions are logged, THE Accounts_Views SHALL NOT include PII, tokens, or secrets in log messages

### Requirement 11: Prevent Internal Exception Leakage in Documents Views

**User Story:** As a platform operator, I want internal exception messages hidden from API responses, so that implementation details are not exposed to clients.

#### Acceptance Criteria

1. WHEN an unhandled exception occurs in Documents_Views, THE Documents_Views SHALL return a generic error message instead of `str(e)` (audit item B7)
2. WHEN an unhandled exception occurs in Documents_Views, THE Documents_Views SHALL log the full exception server-side at error level for debugging
3. THE Documents_Views error response SHALL use the standard envelope error format with an appropriate error code

### Requirement 12: Centralize Hardcoded Fallback Email Constant

**User Story:** As a developer, I want the hardcoded fallback email address defined in a single location, so that updating it requires changing only one place.

#### Acceptance Criteria

1. THE Backend SHALL define the Fallback_Email_Constant (`admin@mihas.edu.zm`) in exactly one shared location (audit item B8)
2. THE three files currently hardcoding `admin@mihas.edu.zm` SHALL reference the shared constant instead of inline strings
3. WHEN the shared constant is introduced, THE Backend SHALL continue to pass all existing tests

### Requirement 13: Deduplicate Status Transition Logic

**User Story:** As a developer, I want the duplicated status transition pattern between ApplicationReviewView and ApplicationBulkStatusView extracted into a shared helper, so that status transition rules are maintained in one place.

#### Acceptance Criteria

1. THE Backend SHALL contain a shared helper function that encapsulates the application status transition logic (audit item B9)
2. THE Review_View SHALL delegate to the shared helper for status transitions
3. THE Bulk_Status_View SHALL delegate to the shared helper for status transitions
4. WHEN the shared helper is introduced, THE Backend SHALL continue to pass all existing tests for both views

### Requirement 14: Remove Stale Test Reference to Arcjet

**User Story:** As a developer, I want test code that references decommissioned services removed, so that the test suite accurately reflects the current system.

#### Acceptance Criteria

1. THE Backend test suite SHALL NOT contain the test `test_scope_limits_match_arcjet_config` after remediation (audit item B10)
2. WHEN the stale test is removed, THE Backend SHALL continue to pass all remaining tests

### Requirement 15: Clean Up Stale Spec Directories

**User Story:** As a developer, I want outdated spec directories that reference decommissioned systems removed or archived, so that the spec inventory reflects the current project state.

#### Acceptance Criteria

1. THE Spec_Directory `.kiro/specs/admin-dashboard-fixes/` SHALL be deleted or archived after remediation because it references Supabase Auth (audit item X1)
2. THE Spec_Directory `.kiro/specs/bun-vercel-runtime-forensics/` SHALL be deleted or archived after remediation because it references Supabase client (audit item X2)
3. THE four Supabase removal spec directories (`supabase-auth-removal`, `supabase-complete-removal`, `supabase-exit-migration`, `supabase-remnant-purge`) SHALL be deleted or archived after remediation because the migration is complete (audit item X3)

### Requirement 16: Clean Up Stale Environment Configuration

**User Story:** As a developer, I want environment configuration files to reflect the current system accurately, so that new developers and deployment pipelines are not misled by stale or conflicting entries.

#### Acceptance Criteria

1. THE root `.env.example` SHALL NOT contain the `ARCJET_KEY` variable after remediation because Arcjet is not used (audit item X4)
2. THE root `.env.example` SHALL use `ZOHO_SMTP_*` naming to match the backend `.env.example`, or the naming conflict SHALL be resolved with a single consistent convention (audit item X5)
3. THE root `.env.example` SHALL clearly separate frontend-only variables (prefixed `VITE_`) from backend-only variables, or backend-only variables SHALL be removed from the root file since they belong in `backend/.env.example` (audit item X7)

### Requirement 17: Add Completion Markers to Spec Directories

**User Story:** As a developer, I want spec directories to have clear completion or archival markers, so that the status of past work is immediately visible without reading every file.

#### Acceptance Criteria

1. WHEN a spec directory represents completed work, THE Spec_Directory SHALL contain a completion marker (e.g., a `.completed` file or a status field in `.config.kiro`) indicating the spec is done (audit item X6)
2. THE completion marker approach SHALL be documented so future specs follow the same convention
