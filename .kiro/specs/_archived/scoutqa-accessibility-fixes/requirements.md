# Requirements Document

## Introduction

This spec addresses accessibility and usability issues identified during a ScoutQA audit of the MIHAS admissions frontend. The findings span four areas: (1) application tracker error handling that swallows backend error codes, (2) missing `inputMode` attributes on auth form fields for mobile keyboard optimization, (3) missing `aria-label` attributes on auth form inputs for screen reader support, and (4) decorative SVG elements, alert region attributes, and color contrast deficiencies on public pages. All fixes target `apps/admissions/`.

## Glossary

- **Tracker_Hook**: The `useApplicationTracker` custom hook in `apps/admissions/src/pages/public/tracker/hooks/useApplicationTracker.ts` that handles application search requests and error state.
- **Tracker_Search_Section**: The `TrackerSearchSection` component that renders the search input and error messages for application tracking.
- **API_Client**: The `apiClient` service used by the frontend to make HTTP requests to the Django `/api/v1/` backend.
- **Sign_In_Page**: The `SignInPage` component at `apps/admissions/src/pages/auth/SignInPage.tsx`.
- **Sign_Up_Page**: The `SignUpPage` component at `apps/admissions/src/pages/auth/SignUpPage.tsx`.
- **Forgot_Password_Page**: The `ForgotPasswordPage` component at `apps/admissions/src/pages/auth/ForgotPasswordPage.tsx`.
- **Reset_Password_Page**: The `ResetPasswordPage` component at `apps/admissions/src/pages/auth/ResetPasswordPage.tsx`.
- **Input_Component**: The shared `Input` UI component at `apps/admissions/src/components/ui/input.tsx`.
- **Password_Input_Component**: The shared `PasswordInput` UI component at `apps/admissions/src/components/ui/PasswordInput.tsx`.
- **Contact_Page**: The `ContactPage` component at `apps/admissions/src/pages/ContactPage.tsx`.
- **Landing_Page**: The `LandingPage` component at `apps/admissions/src/pages/LandingPage.tsx`.
- **Shape_Landing_Hero**: The `ShapeLandingHero` component at `apps/admissions/src/components/smoothui/shape-landing-hero.tsx`.
- **INVALID_FORMAT**: The error code returned by the backend (`GET /api/v1/applications/track/`) with HTTP 400 when the tracking code does not match `APP-YYYYMMDD-XXXXXXXX` or `TRK-XXXXXXXXXXXX` patterns.

## Requirements

### Requirement 1: Tracker Error Differentiation for Invalid Format

**User Story:** As a student, I want to see format guidance when I enter an invalid tracking code, so that I can correct my input without guessing the expected format.

#### Acceptance Criteria

1. WHEN the backend returns HTTP 400 with error code INVALID_FORMAT, THE Tracker_Hook SHALL set the error state to a message that includes the expected formats `APP-YYYYMMDD-XXXXXXXX` and `TRK-XXXXXXXXXXXX`.
2. THE Tracker_Hook SHALL parse the HTTP status code from the API_Client error response instead of falling through to the generic catch message.
3. IF the API_Client request fails with a network error or unexpected status code, THEN THE Tracker_Hook SHALL display the existing generic error message "An error occurred while searching. Please try again."

### Requirement 2: Tracker Error Differentiation for Not Found

**User Story:** As a student, I want to see a clear "not found" message when my tracking code format is valid but no application exists, so that I know the code itself is wrong rather than the system being broken.

#### Acceptance Criteria

1. WHEN the backend returns HTTP 404 for a valid-format tracking code, THE Tracker_Hook SHALL set the error state to a descriptive message such as "No application found with this tracking code. Please check the code and try again."
2. THE Tracker_Hook SHALL distinguish HTTP 404 responses from HTTP 400 responses and display different messages for each.

### Requirement 3: Sign-Up Form inputMode Attributes

**User Story:** As a mobile user, I want the sign-up form to show the appropriate keyboard layout for each field, so that I can fill in my details faster.

#### Acceptance Criteria

1. THE Sign_Up_Page SHALL set `inputMode="email"` on the email input field.
2. THE Sign_Up_Page SHALL set `inputMode="tel"` on the phone number input field.
3. THE Sign_Up_Page SHALL set `inputMode="text"` on the first name and last name input fields.
4. THE Sign_Up_Page SHALL NOT render empty `inputMode=""` attributes on any input field.

### Requirement 4: Forgot Password Form inputMode Attribute

**User Story:** As a mobile user, I want the forgot password form to show the email keyboard layout, so that I can enter my email address efficiently.

#### Acceptance Criteria

1. THE Forgot_Password_Page SHALL set `inputMode="email"` on the email input field.

### Requirement 5: Sign-In Form aria-label Attributes

**User Story:** As a screen reader user, I want each sign-in form input to have a descriptive aria-label, so that I can understand the purpose of each field.

#### Acceptance Criteria

1. THE Sign_In_Page email input SHALL have an `aria-label` attribute with a descriptive value such as "Account email".
2. THE Sign_In_Page password input SHALL have an `aria-label` attribute with a descriptive value such as "Account password".
3. WHILE the Input_Component has a `label` prop set, THE Input_Component SHALL use the visible label as the accessible name via the `htmlFor`/`id` association, making an explicit `aria-label` redundant only when the label is rendered.

### Requirement 6: Sign-Up Form aria-label Attributes

**User Story:** As a screen reader user, I want each sign-up form input to have a descriptive aria-label, so that I can navigate the registration form confidently.

#### Acceptance Criteria

1. THE Sign_Up_Page email input SHALL have an `aria-label` attribute with a descriptive value such as "Account email".
2. THE Sign_Up_Page first name input SHALL have an `aria-label` attribute with a descriptive value such as "First name".
3. THE Sign_Up_Page last name input SHALL have an `aria-label` attribute with a descriptive value such as "Last name".
4. THE Sign_Up_Page phone input SHALL have an `aria-label` attribute with a descriptive value such as "Phone number".
5. THE Sign_Up_Page password inputs SHALL have `aria-label` attributes with descriptive values such as "Create password" and "Confirm password".

### Requirement 7: Contact Page SVG Accessibility

**User Story:** As a screen reader user, I want decorative SVG icons on the contact page to be hidden from assistive technology, so that they do not clutter my navigation experience.

#### Acceptance Criteria

1. THE Contact_Page SHALL ensure all decorative SVG icons (social media icons, contact icons) have `aria-hidden="true"` set.
2. THE Contact_Page SHALL ensure all decorative SVG icons have `role="img"` or are excluded from the accessibility tree via `aria-hidden="true"`.
3. WHILE an SVG icon conveys meaningful information without adjacent text, THE Contact_Page SHALL provide a `<title>` element or `aria-label` on that SVG.

### Requirement 8: Password Reset Form Alert Attributes

**User Story:** As a screen reader user, I want error messages on the password reset form to be announced immediately when they appear, so that I am aware of problems without manually searching the page.

#### Acceptance Criteria

1. WHEN an error message is displayed on the Reset_Password_Page, THE error container SHALL include `role="alert"`, `aria-live="assertive"`, and `aria-atomic="true"` attributes.
2. THE Reset_Password_Page error container SHALL NOT render `role="alert"` without the accompanying `aria-live` and `aria-atomic` attributes.

### Requirement 9: Landing Page Color Contrast Fixes

**User Story:** As a user with low vision, I want all text on the landing page to meet WCAG 2.1 AA contrast requirements, so that I can read the content.

#### Acceptance Criteria

1. THE Shape_Landing_Hero "See Our Programs" secondary CTA link SHALL have a text-to-background contrast ratio of at least 4.5:1.
2. THE Shape_Landing_Hero accreditation badge labels (NMCZ, HPCZ, ECZ, UNZA) SHALL have a text-to-background contrast ratio of at least 4.5:1.
3. IF the current badge styling produces a contrast ratio below 4.5:1, THEN THE Shape_Landing_Hero SHALL adjust the badge background opacity or text color to meet the minimum ratio.

### Requirement 10: Registration Page SVG Accessibility

**User Story:** As a screen reader user, I want the show/hide password toggle icons on the registration page to be properly labeled, so that I understand the toggle action.

#### Acceptance Criteria

1. THE Password_Input_Component toggle button SHALL have an `aria-label` that describes the current action ("Show password" or "Hide password").
2. THE Password_Input_Component SVG icons (Eye, EyeOff) SHALL have `aria-hidden="true"` set since the parent button carries the accessible label.
