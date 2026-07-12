# Bugfix Requirements Document


## Introduction

A ScoutQA audit of the MIHAS admissions portal authentication system identified three defects: (1) auth forms overflow horizontally on 375px mobile viewports, requiring horizontal scrolling; (2) auth form HTML elements default to method GET because no explicit method attribute is set; (3) the forgot password and reset password forms lack noValidate, causing inconsistent validation behavior.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the sign-in page renders on a 375px viewport (iPhone SE/6/7/8) THEN the form card exceeds the viewport width (462px wide), causing horizontal scrolling. The AuthLayout FormPanel uses px-4 outer padding, the form card uses p-5 sm:p-8 inner padding with rounded-[28px], and the sign-in fieldset adds p-4 sm:p-5 with rounded-2xl border. The flex layout flex-1 on the form panel does not enforce min-w-0, allowing content to push beyond the viewport.

1.2 WHEN the sign-up page renders on a 375px viewport THEN the same overflow occurs, compounded by max-w-3xl (768px) on the form panel container.

1.3 WHEN the forgot password or reset password pages render on a 375px viewport THEN the same overflow occurs via the shared AuthLayout.

1.4 WHEN the sign-in form renders in HTML THEN it has no explicit method attribute, defaulting to GET per the HTML spec. JavaScript intercepts via onSubmit and sends POST, but the HTML form would submit credentials as URL query parameters if JS fails.

1.5 WHEN the sign-up form renders THEN it similarly lacks an explicit method attribute.

1.6 WHEN the forgot password form renders THEN it lacks both method and noValidate. Without noValidate, browser HTML5 email validation runs before Zod validation, creating inconsistency with the sign-in form which has noValidate. The reset password form has the same issue.

### Expected Behavior (Correct)

2.1 WHEN any auth page renders on a 375px viewport THEN the form content SHALL fit within the viewport without horizontal scrolling.

2.2 WHEN the AuthLayout FormPanel renders on viewports narrower than 475px THEN the form card SHALL be constrained using overflow-hidden and min-w-0 to prevent overflow.

2.3 WHEN any auth form element renders in HTML THEN it SHALL include method="post".

2.4 WHEN the forgot password and reset password forms render THEN they SHALL include noValidate.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN auth pages render on desktop viewports (>=1024px) THEN the split-panel layout with BrandingPanel and FormPanel SHALL be unchanged.

3.2 WHEN auth forms are submitted via JavaScript THEN POST requests to API endpoints SHALL continue unchanged.

3.3 WHEN the sign-in form validates input THEN Zod validation for email and password SHALL continue unchanged.

3.4 WHEN the forgot password form is submitted THEN the generic success message SHALL continue to prevent email enumeration.

3.5 WHEN the sign-up form validates input THEN password strength requirements SHALL continue unchanged.

3.6 WHEN auth pages render on tablet viewports (768px-1023px) THEN the mobile layout SHALL continue unchanged.
