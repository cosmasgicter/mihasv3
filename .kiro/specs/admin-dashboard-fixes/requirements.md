# Requirements Document

## Introduction

This specification addresses multiple issues across the MIHAS admin and student dashboards including data inconsistencies in AI analytics, missing draft applications, broken PDF extraction, session management limitations, sidebar collapse behavior, and page speed best practices violations.

**Root Cause Analysis:**
- Database shows 28 total applications (14 approved, 4 under_review, 4 submitted, 4 draft, 2 rejected)
- AI Dashboard shows 8 applications - likely querying only submitted/under_review status
- Applications page shows 24 - excludes 4 draft applications
- Sidebar header doesn't collapse properly due to conditional rendering logic
- Sessions stored in `device_sessions` table (507 rows) - no bulk termination endpoint

## Glossary

- **AI_Dashboard**: The PredictiveDashboard component (`src/components/admin/PredictiveDashboard.tsx`) showing application trends and predictions
- **Applications_Page**: The admin applications page using `useApplicationsData` hook to fetch from `admin_application_detailed` view
- **Session_Manager**: The component handling user session display and termination, backed by `device_sessions` table
- **Sidebar**: The AdminSidebar component (`src/components/admin/AdminSidebar.tsx`) with collapsible navigation
- **Draft_Application**: An application with status='draft' in the `applications` table
- **PDF_Extractor**: The document analysis service for extracting data from uploaded PDFs

## Requirements

### Requirement 1: AI Dashboard Data Consistency

**User Story:** As an admin, I want the AI predictive dashboard to show accurate application counts, so that I can make informed decisions based on real data.

#### Acceptance Criteria

1. WHEN the AI_Dashboard loads, THE AI_Dashboard SHALL query the `applications` table directly for total count
2. WHEN displaying total applications, THE AI_Dashboard SHALL count all applications regardless of status (draft, submitted, under_review, approved, rejected)
3. WHEN the AI trend analysis displays counts, THE AI_Dashboard SHALL match the total of 28 shown in the database
4. THE `fetchPredictiveDashboardMetrics` function SHALL return accurate `totalApplications` from the database
5. THE `/analytics/predictive-dashboard` endpoint SHALL query all application statuses when calculating totals

### Requirement 2: Include Draft Applications in Applications Page

**User Story:** As an admin, I want to see draft applications in the applications list, so that I can reach out to applicants who haven't completed their submissions.

#### Acceptance Criteria

1. WHEN the Applications_Page loads with default filters, THE Applications_Page SHALL include applications with status "draft" in the results
2. WHEN displaying draft applications, THE Applications_Page SHALL show a "Draft" badge with distinct styling (yellow/amber color)
3. WHEN filtering applications, THE Applications_Page SHALL provide a "Draft Status" filter with options: "All", "Drafts Only", "Completed Only"
4. THE Applications_Page SHALL display the total count of 28 when no filters are applied
5. WHEN viewing a draft application, THE Applications_Page SHALL show completion percentage and last updated timestamp

### Requirement 3: PDF Extraction Functionality

**User Story:** As an admin, I want PDF extraction to work correctly, so that I can automatically extract data from uploaded documents.

#### Acceptance Criteria

1. WHEN a PDF document is uploaded, THE PDF_Extractor SHALL attempt to extract text content using pdf-lib or similar library
2. IF PDF extraction fails, THEN THE PDF_Extractor SHALL return a descriptive error message with the failure reason
3. WHEN extraction succeeds, THE PDF_Extractor SHALL return structured data including extracted text and metadata
4. THE PDF_Extractor SHALL handle text-based PDFs and provide fallback messaging for scanned documents
5. THE document_analysis table SHALL store extraction results with quality and completeness scores

### Requirement 4: Bulk Session Termination

**User Story:** As a student, I want to terminate all my sessions at once, so that I don't have to click through each session individually.

#### Acceptance Criteria

1. WHEN viewing active sessions, THE Session_Manager SHALL display a "Terminate All Other Sessions" button
2. WHEN the user clicks "Terminate All Other Sessions", THE Session_Manager SHALL call Supabase `signOut({ scope: 'others' })` to terminate all sessions except current
3. WHEN bulk termination completes, THE Session_Manager SHALL display a success message with count of terminated sessions
4. THE Session_Manager SHALL update the `device_sessions` table to mark terminated sessions as inactive
5. IF bulk termination fails, THEN THE Session_Manager SHALL display an error message and allow retry

### Requirement 5: Sidebar Collapse Behavior

**User Story:** As a user, I want the sidebar to collapse properly including the header section, so that I have more screen space when needed.

#### Acceptance Criteria

1. WHEN the sidebar is collapsed, THE Sidebar header section SHALL show only the "M" logo icon centered
2. WHEN the sidebar is collapsed, THE Sidebar SHALL reduce to 64px width (var(--sidebar-collapsed))
3. WHEN the sidebar is collapsed, THE collapse toggle button SHALL be centered below the logo
4. WHEN the sidebar is expanded, THE Sidebar SHALL show full "MIHAS Admin" text and navigation labels
5. THE Sidebar header layout SHALL use consistent flex alignment in both collapsed and expanded states

### Requirement 6: Page Speed Best Practices

**User Story:** As a developer, I want the application to follow web best practices, so that it scores well on Lighthouse and provides a secure experience.

#### Acceptance Criteria

1. THE index.html SHALL include `<meta charset="UTF-8">` within the first 1024 bytes of the document
2. THE Cloudflare functions middleware SHALL set Content-Security-Policy header with script-src, style-src, and img-src directives
3. THE Cloudflare functions middleware SHALL set Strict-Transport-Security header with max-age of at least 31536000
4. THE Cloudflare functions middleware SHALL set Cross-Origin-Opener-Policy header to "same-origin"
5. THE vite.config.production.ts SHALL enable source map generation for production builds
6. THE public/_headers file SHALL include all security headers for static assets
