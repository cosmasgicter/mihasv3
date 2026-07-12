# Bugfix Requirements Document

## Introduction

Five production-critical bugs in the MIHAS admissions platform are causing degraded user experience for students actively applying. These range from CSP violations blocking print styles, to broken navigation links, race conditions in the application wizard, silent session expiry failures, and a missing email slip backend. Together they affect the core student journey from application through payment to post-submission status tracking.

---

## Bug 1: CSP Hardening — Print Stylesheet Inlined as `data:` URI

### Current Behavior (Defect)

1.1 WHEN the admissions app is built with Vite's `assetsInlineLimit: 4096` AND the print stylesheet (`src/styles/print.css`, ~2.2KB) is imported via `@import './styles/print.css'` in `index.css` THEN the system inlines the CSS as a `data:text/css;base64,...` URI. The current CSP in `vercel.json` includes `data:` in `style-src` and `style-src-elem` to work around this, but this weakens the CSP by allowing arbitrary `data:` style URIs — a security concern that should be eliminated.

1.2 WHEN a student attempts to print an application slip or any page THEN the system relies on `data:` being allowed in the CSP for print styles to work, creating a fragile dependency on a permissive CSP directive that should be tightened

### Expected Behavior (Correct)

2.1 WHEN the admissions app is built THEN the system SHALL emit the print stylesheet as a separate CSS file (not inlined as a `data:` URI) so that it is served from `'self'` and the CSP `style-src` directive can be tightened to remove `data:`, improving security posture

2.2 WHEN a student prints any page THEN the system SHALL apply all print styles (hidden navigation, single-column layout, white background, readable text) without relying on `data:` URIs in the CSP

2.2a WHEN the CSP is tightened THEN the `style-src` and `style-src-elem` directives in `vercel.json` SHALL be updated to remove `data:`, leaving only `'self' 'unsafe-inline'`

### Unchanged Behavior (Regression Prevention)

3.1 WHEN other CSS files larger than the inline limit are imported THEN the system SHALL CONTINUE TO emit them as separate files as it does today

3.2 WHEN assets other than CSS (images, fonts, SVGs) are below the inline limit THEN the system SHALL CONTINUE TO inline them as `data:` URIs per existing behavior

---

## Bug 2: Payment Page "Review Payment" Link Shows "Application Not Found"

### Current Behavior (Defect)

1.3 WHEN a student clicks "Review payment status" on the Payment page (`/student/payment`) AND the link navigates to `/student/application/{id}/status` AND the user's session has expired THEN the system shows "Application Not Found" instead of distinguishing between an authentication failure and a genuine 404

1.4 WHEN the `ApplicationStatus` component's `queryFn` catches any error from `applicationService.getById(id)` THEN the system throws a generic `'Application not found or access denied'` error regardless of whether the underlying HTTP status was 401, 403, or 404

### Expected Behavior (Correct)

2.3 WHEN the `ApplicationStatus` component receives a 401 or `AuthenticationError` from the API client THEN the system SHALL allow the existing auth failure flow to redirect the user to the login page with a clear "session expired" indication, rather than displaying "Application Not Found"

2.4 WHEN the `ApplicationStatus` component receives a genuine 404 from the API THEN the system SHALL display an appropriate "Application Not Found" message with a link back to the dashboard

### Unchanged Behavior (Regression Prevention)

3.3 WHEN the user's session is valid AND the application ID exists THEN the system SHALL CONTINUE TO load and display the full application status page with timeline, payment info, and details

3.4 WHEN the user navigates to `/student/application/{id}/status` with a valid session but a non-existent application ID THEN the system SHALL CONTINUE TO show an appropriate not-found state

---

## Bug 3: Wizard Step Validation Shows "0 added" Despite Grades Existing in Database

### Current Behavior (Defect)

1.5 WHEN a student navigates to the education step (step 2) of the application wizard during draft restoration AND `hydrateServerGrades()` is called asynchronously THEN the system runs step validation before the async grade hydration completes, counting `selectedGrades` as empty (0 valid grades) and displaying "Minimum 5 subjects required (0 added)" even though grades exist in the database

1.6 WHEN the wizard is restoring a draft with existing grades AND the `selectedGrades` state is initialized as an empty array in `useWizardState.ts` THEN the system validates against the empty initial state rather than waiting for hydrated data

### Expected Behavior (Correct)

2.5 WHEN the wizard is restoring a draft and grade hydration is in progress THEN the system SHALL defer education step validation until grade hydration has completed, or display a loading indicator instead of a validation error

2.6 WHEN grade hydration completes successfully with grades from the server THEN the system SHALL update `selectedGrades` state before any validation runs, so the validation count reflects the actual hydrated grades

### Unchanged Behavior (Regression Prevention)

3.5 WHEN a student is on the education step with no prior grades (fresh application) THEN the system SHALL CONTINUE TO show "Minimum 5 subjects required (0 added)" as a valid validation message

3.6 WHEN a student manually adds or removes grades on the education step THEN the system SHALL CONTINUE TO validate the grade count in real-time and enforce the minimum of 5 valid subjects

3.7 WHEN a student has fewer than 5 valid grades after hydration completes THEN the system SHALL CONTINUE TO show the correct count and prevent progression to the next step

---

## Bug 4: Session 403 — Expired JWT Causes Silent Auth Failure

### Current Behavior (Defect)

1.7 WHEN the user's JWT access token expires (15-minute TTL) AND the `JWTAuthenticationMiddleware` returns `None` for the expired token (line 262: `except pyjwt.ExpiredSignatureError: return None`) THEN the system passes the request through unauthenticated, causing DRF's `IsAuthenticated` permission class to return 403 Forbidden on `GET /api/v1/auth/session/`

1.8 WHEN the frontend's `ApiClient` receives a 403 on a GET request (not 401) THEN the system does not trigger the token refresh flow because the 401-intercept logic only activates on HTTP 401 responses, leaving the user in a silently broken auth state

1.9 WHEN the token refresh flow fails (due to expired refresh token, cookie domain mismatch, or lost cookie) THEN the system does not display a clear "session expired" message to the user, instead showing generic errors or broken page states on subsequent API calls

### Expected Behavior (Correct)

2.7 WHEN the user's access token has expired AND a request to a protected endpoint returns 403 with an authentication-related error THEN the system SHALL attempt a token refresh (same as the existing 401 flow) before giving up

2.8 WHEN the token refresh attempt fails (refresh token expired, missing, or invalid) THEN the system SHALL display a clear "Your session has expired. Please sign in again." message and redirect the user to the login page

2.9 WHEN the session endpoint (`GET /api/v1/auth/session/`) returns 403 due to an expired access token THEN the system SHALL treat this as a recoverable auth state and attempt refresh, not as a permanent authorization denial

### Unchanged Behavior (Regression Prevention)

3.8 WHEN the user's access token is valid and not expired THEN the system SHALL CONTINUE TO authenticate requests normally via the JWT middleware without triggering any refresh flow

3.9 WHEN a 403 is returned for a genuine authorization failure (user lacks permission for a resource, not an expired token) THEN the system SHALL CONTINUE TO display the appropriate permission-denied error without attempting a token refresh

3.10 WHEN the token refresh succeeds THEN the system SHALL CONTINUE TO retry the original request exactly once with the new tokens, as it does today for 401 responses

---

## Bug 5: Email Slip Sending Not Implemented

### Current Behavior (Defect)

1.10 WHEN a student attempts to email their application slip via the frontend UI THEN the system returns the hardcoded error message "Application slip email delivery is not implemented in the Django backend yet" from `slipService.ts` and falls back to downloading the slip

1.11 WHEN the `sendEmail` option is true AND the applicant has a valid email address THEN the system does not attempt any backend call because no endpoint exists for sending application slip emails

### Expected Behavior (Correct)

2.10 WHEN a student requests to email their application slip AND the applicant has a valid email address THEN the system SHALL call a backend endpoint that generates the slip PDF and sends it to the applicant's email via the existing Resend email infrastructure

2.11 WHEN the backend email sending succeeds THEN the system SHALL return a success response and the frontend SHALL display a confirmation message indicating the slip was emailed

2.12 WHEN the backend email sending fails (Resend API error, invalid email, etc.) THEN the system SHALL return an appropriate error and the frontend SHALL fall back to the download behavior with a clear message explaining the email could not be sent

### Unchanged Behavior (Regression Prevention)

3.11 WHEN a student downloads their application slip directly (without requesting email) THEN the system SHALL CONTINUE TO generate and download the PDF slip as it does today

3.12 WHEN the applicant has no email address on file THEN the system SHALL CONTINUE TO show the "Missing applicant email address" error and not attempt to send an email
