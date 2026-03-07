# Bugfix Requirements Document

## Introduction

The MIHAS Application System (https://apply.mihas.edu.zm) is a live production admissions portal with real users and real data. A previous developer implemented extensive changes but many features remain broken on the live site. This bugfix addresses 36+ distinct issues spanning authentication failures, API errors, broken CRUD operations, UI/UX misalignment, and PWA problems. The bugs collectively prevent students from completing applications and admins from managing the system, making the portal largely non-functional despite code existing for most features.

## Bug Analysis

### Current Behavior (Defect)

**Authentication & Post-Login Loading (Critical)**

1.1 WHEN a user (student or admin) logs in successfully THEN the system shows skeleton loading indefinitely and no data is fetched until the page is manually reloaded

1.2 WHEN the frontend attempts to refresh the auth token via `POST /api/auth?action=refresh` THEN the system returns 403 Forbidden because the refresh action is subject to CSRF validation but the client cannot supply a valid CSRF token during token refresh (the token rotation happens inside refresh itself)

1.3 WHEN the frontend attempts to fetch the user profile via `GET /api/auth?action=profile` THEN the system returns 500 Internal Server Error, blocking post-login data hydration

1.4 WHEN the user logs out THEN the system briefly flickers error console messages before the logout completes, indicating race conditions in the sign-out flow

**CSP & Security Headers**

1.5 WHEN the browser loads `index.html` THEN the inline `<script>` (console error suppressor) is blocked by the CSP `script-src 'self'` policy in `vercel.json` because no script hash or nonce is configured for it

**Document Upload**

1.6 WHEN a student uploads a document via `POST /api/documents?action=upload` THEN the system returns 500 Internal Server Error repeatedly

1.6a WHEN the slip service attempts to upload a generated slip via `POST /api/documents?action=upload` THEN the system returns 403 Forbidden, indicating CSRF or auth middleware is blocking legitimate authenticated requests from the slip generation flow

1.7 WHEN the document upload fails with a 500 error THEN the retry logic loops through 4 attempts on what is a deterministic server error (not transient), creating a cascade of identical failing requests

**Catalog API**

1.7a WHEN the frontend fetches programmes via `GET /api/catalog?type=programs` THEN the system returns 500 Internal Server Error repeatedly, with React Query retrying the request 8+ times in rapid succession, preventing the application wizard from loading programme options

**Application CRUD**

1.8 WHEN a student attempts to update an application during the payment stage via `PUT /api/applications?id=xxx` THEN the system returns 403 Forbidden despite the student being the application owner

1.9 WHEN the system attempts to delete a draft application via `DELETE /api/applications?id=xxx` THEN the system returns 404 Not Found, preventing draft cleanup

1.10 WHEN a student submits an application and the system tries to clear drafts THEN the draft deletion fails with 404 and the "Continue your application" card persists on the dashboard

1.11 WHEN a student clicks "Clear all drafts" THEN the operation fails silently and drafts remain visible

1.12 WHEN an admin attempts to review a payment via `PATCH /api/applications?id=xxx` with `action: update_payment_status` THEN the system returns 500 Internal Server Error

1.13 WHEN an admin views the communication and history tabs on an application detail THEN the tabs fail to load or display data correctly

1.14 WHEN a student attempts to email an application slip via `POST /api/applications?action=email-slip` THEN the system returns 400 Bad Request

**Session Management**

1.15 WHEN a student navigates to the profile/settings page to view active sessions THEN the sessions fail to load, and date values cause format errors because ISO timestamps (e.g., "1994-09-08T00:00:00.000Z") do not conform to the required `yyyy-MM-dd` format for date inputs

**Profile & Data**

1.16 WHEN a student fully completes their profile THEN the profile completion indicator remains stuck at 71% regardless of actual completion

1.17 WHEN a student creates an account and then starts an application THEN the data auto-populated in the wizard does not match what was entered during account creation

**Application Wizard**

1.18 WHEN a student selects a programme in the application wizard THEN the institution field does not update to reflect the programme's linked institution

1.19 WHEN the auto-save feature should trigger during the application wizard THEN saving only occurs on explicit button click, and the draft count always shows zero

1.20 WHEN the progress stats are displayed on the student dashboard THEN the system shows incorrect data such as "932h avg time", "31 completed", "0 in progress"

**Payment System**

1.21 WHEN a student reaches the payment stage THEN there is no pay-later option, and text fields are misaligned on the payment form

**Notifications**

1.22 WHEN a student views the notifications page THEN the system displays "No number on file" even when a phone number exists in the profile, and in-app notifications do not function

**UI Persistence Issues**

1.23 WHEN a student submits an application or views the application detail THEN the "Generating application slip" popup appears and does not disappear, even when clicking the X button

**Admin Issues**

1.24 WHEN an admin views the applications page THEN the system shows 25 applications when there are more in the system, indicating pagination or count logic is wrong

1.25 WHEN an admin attempts to export applications to PDF or other formats THEN the export fails

**UI/UX Alignment**

1.26 WHEN a student is on the education step of the wizard and adds a new subject THEN they must scroll up to find the add button, instead of the new subject appearing below

1.27 WHEN a student views the subject list in the education step THEN the subjects are outdated and do not include Zambia's updated curriculum (e.g., both Ordinary and A Level Additional Mathematics)

1.28 WHEN a student views the upload section THEN there is an extra "KYC documents" section that is confusing, and NRC/passport handling is unclear

1.29 WHEN a user visits the sign-up or sign-in pages THEN the pages are misaligned with unclear labeling and no clear distinction between the two flows

1.30 WHEN the desktop sidebar is collapsed THEN the visual presentation looks broken

1.31 WHEN a user views the dashboard THEN the colors appear oversaturated

1.32 WHEN a user accesses the site on mobile THEN the layout is not properly responsive

**Admin Management Pages**

1.33 WHEN an admin views the users page THEN the layout is misaligned and role management/permissions assignment does not work

1.34 WHEN an admin tries to edit an institution THEN the system shows "Institution is required" error, and there is no CRUD functionality for institutions

1.35 WHEN an admin views the audit page THEN it does not show current changes and the page needs redesign

1.36 WHEN an admin views the settings page THEN it nonsensically asks to "add a settings to a system"

**PWA Issues**

1.37 WHEN the browser fires the `beforeinstallprompt` event THEN `preventDefault()` is called but `prompt()` is never called, blocking the PWA install banner

1.38 WHEN the PWA manifest references icons at `/icons/icon-192x192.svg` etc. THEN the icons return 404 because SVG icons are not available at those paths (PNG icons are needed)

1.39 WHEN the PWA install UI is evaluated THEN no wide or mobile screenshots are declared in the manifest, preventing the richer install experience

### Expected Behavior (Correct)

**Authentication & Post-Login Loading (Critical)**

2.1 WHEN a user logs in successfully THEN the system SHALL immediately fetch and display dashboard data without requiring a manual page reload

2.2 WHEN the frontend attempts to refresh the auth token via `POST /api/auth?action=refresh` THEN the system SHALL exempt the refresh action from CSRF validation (since it is authenticated via the refresh token cookie itself) and return 200 with new tokens

2.3 WHEN the frontend attempts to fetch the user profile via `GET /api/auth?action=profile` THEN the system SHALL return 200 with the user's profile data

2.4 WHEN the user logs out THEN the system SHALL cleanly clear auth state, cookies, and redirect without any visible error flicker

**CSP & Security Headers**

2.5 WHEN the browser loads `index.html` THEN the CSP policy SHALL include the SHA-256 hash of the inline script (`sha256-1LDFLH+kueTZQfDsiIVkia1KCnpjVgQ1Rmpz5qOU95s=`) so the script executes without violation, OR the inline script SHALL be moved to an external file

**Document Upload**

2.6 WHEN a student uploads a document via `POST /api/documents?action=upload` THEN the system SHALL process the upload and return 200 with the document metadata

2.6a WHEN the slip service uploads a generated slip via `POST /api/documents?action=upload` THEN the system SHALL accept the authenticated request and return 200, with CSRF validation properly handling internal service calls

2.7 WHEN a document upload fails with a deterministic server error (non-transient) THEN the retry logic SHALL NOT retry and SHALL immediately surface the error to the user

**Catalog API**

2.7a WHEN the frontend fetches programmes via `GET /api/catalog?type=programs` THEN the system SHALL return 200 with the complete list of programmes including institution linkage, and React Query SHALL NOT retry more than 3 times on failure

**Application CRUD**

2.8 WHEN a student updates their own application during the payment stage THEN the system SHALL allow the update and return 200

2.9 WHEN the system attempts to delete a draft application THEN the system SHALL find and delete the draft, returning 200 with `{ deleted: true }`

2.10 WHEN a student submits an application THEN the system SHALL successfully clear associated drafts and remove the "Continue your application" card from the dashboard

2.11 WHEN a student clicks "Clear all drafts" THEN the system SHALL delete all draft applications and update the UI to reflect zero drafts

2.12 WHEN an admin reviews a payment via `PATCH /api/applications?id=xxx` with `action: update_payment_status` THEN the system SHALL update the payment status and return 200

2.13 WHEN an admin views the communication and history tabs THEN the system SHALL load and display the relevant data

2.14 WHEN a student emails an application slip via `POST /api/applications?action=email-slip` THEN the system SHALL send the email and return 200

**Session Management**

2.15 WHEN a student navigates to the profile/settings page THEN the system SHALL display active sessions correctly, with all date values properly formatted as `yyyy-MM-dd` for date inputs

**Profile & Data**

2.16 WHEN a student fully completes their profile THEN the profile completion indicator SHALL reflect the actual completion percentage

2.17 WHEN a student creates an account and starts an application THEN the wizard SHALL auto-populate with the exact data entered during account creation

**Application Wizard**

2.18 WHEN a student selects a programme THEN the institution field SHALL automatically update to the programme's linked institution

2.19 WHEN the auto-save interval triggers during the application wizard THEN the system SHALL save the current state to the server and the draft count SHALL reflect the actual number of drafts

2.20 WHEN progress stats are displayed THEN the system SHALL show accurate data derived from the student's actual application history

**Payment System**

2.21 WHEN a student reaches the payment stage THEN the system SHALL offer a pay-later option and all text fields SHALL be properly aligned

**Notifications**

2.22 WHEN a student views the notifications page THEN the system SHALL display the correct phone number from the profile and in-app notifications SHALL function correctly

**UI Persistence Issues**

2.23 WHEN a student submits an application or closes the slip popup THEN the "Generating application slip" popup SHALL disappear immediately

**Admin Issues**

2.24 WHEN an admin views the applications page THEN the system SHALL show the correct total count of all applications using server-side pagination totals

2.25 WHEN an admin exports applications THEN the export SHALL generate valid PDF/CSV/Excel/JSON files

**UI/UX Alignment**

2.26 WHEN a student adds a new subject in the education step THEN the new subject form SHALL appear below the existing subjects without requiring scroll-up

2.27 WHEN a student views the subject list THEN the system SHALL include both old and new Zambian curriculum subjects (e.g., Ordinary Mathematics and A Level Additional Mathematics)

2.28 WHEN a student views the upload section THEN the document requirements SHALL be clear, with NRC/passport handled as identity documents rather than a confusing "KYC" section

2.29 WHEN a user visits the sign-up or sign-in pages THEN the pages SHALL be properly aligned with clear labeling distinguishing new account creation from returning user login

2.30 WHEN the desktop sidebar is collapsed THEN the visual presentation SHALL be clean and properly styled

2.31 WHEN a user views the dashboard THEN the color palette SHALL use balanced, non-oversaturated tones

2.32 WHEN a user accesses the site on mobile THEN the layout SHALL be fully responsive with proper touch targets

**Admin Management Pages**

2.33 WHEN an admin views the users page THEN the layout SHALL be properly aligned and role management/permissions SHALL function correctly

2.34 WHEN an admin manages institutions THEN the system SHALL provide full CRUD functionality on the programs page, and editing SHALL work without spurious validation errors

2.35 WHEN an admin views the audit page THEN the system SHALL display current audit events with proper filtering, timeline view, and export capabilities

2.36 WHEN an admin views the settings page THEN the system SHALL present guided operational configuration for portal/contact/admissions controls

**PWA Issues**

2.37 WHEN the browser fires the `beforeinstallprompt` event THEN the system SHALL properly store the event and call `prompt()` when the user interacts with the install banner

2.38 WHEN the PWA manifest references icons THEN the icons SHALL be available as PNG files at the declared paths and SHALL load successfully

2.39 WHEN the PWA install UI is evaluated THEN the manifest SHALL include both wide and mobile screenshots for the richer install experience

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user is not authenticated and accesses a protected route THEN the system SHALL CONTINUE TO redirect to the sign-in page

3.2 WHEN a student submits a valid application through the complete wizard flow THEN the system SHALL CONTINUE TO create the application record in the database with correct status

3.3 WHEN an admin reviews an application status (approve/reject) THEN the system SHALL CONTINUE TO update the status, create audit trail entries, and send notifications

3.4 WHEN the auto-save interval fires on a form-heavy route during a service worker cache update THEN the system SHALL CONTINUE TO avoid disrupting in-progress form data

3.5 WHEN a student accesses the application wizard with a valid draft THEN the system SHALL CONTINUE TO restore the draft state from the last save point

3.6 WHEN API endpoints receive requests without valid authentication THEN the system SHALL CONTINUE TO return 401 Unauthorized

3.7 WHEN CSRF validation is required on state-changing endpoints (POST/PUT/DELETE on non-exempt actions) THEN the system SHALL CONTINUE TO enforce CSRF token validation

3.8 WHEN the Arcjet security perimeter detects suspicious activity THEN the system SHALL CONTINUE TO block the request with 403

3.9 WHEN a student uploads a valid document with correct format and size THEN the system SHALL CONTINUE TO store the document and return metadata

3.10 WHEN the catalog API returns programmes and intakes THEN the system SHALL CONTINUE TO return the correct data structure with institution linkage

3.11 WHEN password reset tokens are generated THEN the system SHALL CONTINUE TO hash them with SHA-256 and enforce 1-hour expiry and single-use semantics

3.12 WHEN login attempts exceed the threshold (5 failures) THEN the system SHALL CONTINUE TO enforce progressive backoff and account lockout after 10 consecutive failures
