# Requirements Document

## Introduction

This specification addresses two critical user experience issues in the MIHAS Application System:

1. **Admin UI not updating after status changes** - When an admin approves/rejects an application, the admin dashboard UI does not update automatically. The student receives the notification instantly, but the admin must manually refresh (Ctrl+Shift+R) to see the updated status. Root cause: The admin dashboard uses direct service calls (`adminDashboardService.getMetrics()`) instead of React Query hooks, so cache invalidation from realtime events doesn't trigger UI updates.

2. **Application Wizard auto-save not working** - The draft progress shows zero, data is not being saved every 8 seconds as advertised, and when continuing a draft from the dashboard, the wizard starts at step 1 with no saved data. Root cause: The `watch()` subscription in `useWizardController` uses a debounced timeout that may not be firing correctly, and draft restoration logic has issues with version checking and step restoration.

## Glossary

- **Admin_Dashboard**: The administrative interface where admins review and manage applications
- **Application_Wizard**: The multi-step form students use to submit applications
- **React_Query_Cache**: Client-side cache managed by TanStack Query for server data
- **Realtime_Subscription**: Supabase WebSocket connection that pushes database changes
- **Auto_Save**: Automatic periodic saving of form data to prevent data loss
- **Draft**: A partially completed application saved for localStorage for later continuation
- **Cache_Invalidation**: Marking cached data as stale to trigger a refetch
- **loadDashboardStats**: Custom function in admin dashboard that fetches data directly via service calls (bypasses React Query)

## Requirements

### Requirement 1: Admin Dashboard Real-time UI Updates

**User Story:** As an admin, I want to see application status changes immediately after I approve or reject an application, so that I can confirm my action was successful without manually refreshing.

#### Acceptance Criteria

1. WHEN an admin changes an application status, THE Admin_Dashboard SHALL update the displayed status within 2 seconds without manual refresh
2. WHEN the React_Query_Cache is invalidated by a realtime event, THE Admin_Dashboard SHALL refetch and display the updated data
3. WHEN the admin dashboard loads data, THE System SHALL use React Query hooks instead of direct service calls for data that needs real-time updates
4. THE Admin_Dashboard SHALL display a visual confirmation when data is refreshed via realtime

### Requirement 2: Admin Dashboard Data Consistency

**User Story:** As an admin, I want the dashboard statistics and application list to stay synchronized with the database, so that I always see accurate information.

#### Acceptance Criteria

1. WHEN an application status changes, THE Admin_Dashboard statistics (pending count, approved count, etc.) SHALL update automatically
2. WHEN a payment status changes, THE Admin_Dashboard payment indicators SHALL update automatically
3. THE Admin_Dashboard SHALL NOT require manual refresh to see changes made by the current user
4. IF realtime connection fails, THEN THE Admin_Dashboard SHALL fall back to polling every 30 seconds

### Requirement 3: Application Wizard Auto-Save Functionality

**User Story:** As a student, I want my application progress to be automatically saved every 8 seconds, so that I don't lose my work if I navigate away or close the browser.

#### Acceptance Criteria

1. WHEN a student makes changes in the Application_Wizard, THE System SHALL save the draft to localStorage within 8 seconds
2. WHEN auto-save occurs, THE System SHALL display a "Draft saved" indicator with timestamp
3. THE Auto_Save indicator SHALL show the correct time since last save
4. WHEN auto-save is in progress, THE System SHALL display a "Saving..." indicator
5. THE System SHALL NOT block user interaction during auto-save

### Requirement 4: Draft Restoration

**User Story:** As a student, I want to continue my application from where I left off, so that I don't have to re-enter information I already provided.

#### Acceptance Criteria

1. WHEN a student clicks "Continue Draft" from the dashboard, THE Application_Wizard SHALL restore all previously saved form data
2. WHEN a draft is restored, THE Application_Wizard SHALL navigate to the last saved step
3. WHEN a draft is restored, THE System SHALL display a confirmation message
4. IF no valid draft exists, THEN THE Application_Wizard SHALL start from step 1 with profile data pre-populated
5. THE System SHALL preserve selected grades when restoring a draft

### Requirement 5: Draft Progress Display

**User Story:** As a student, I want to see my application progress percentage on the dashboard, so that I know how much I have completed.

#### Acceptance Criteria

1. THE Student_Dashboard SHALL display the correct completion percentage for draft applications
2. WHEN draft data is saved, THE completion percentage SHALL be calculated based on filled fields
3. THE completion percentage SHALL update when the student returns to the dashboard after saving
4. IF no draft exists, THEN THE completion percentage SHALL show 0%

### Requirement 6: Auto-Save Error Handling

**User Story:** As a student, I want to know if my draft failed to save, so that I can take action to prevent data loss.

#### Acceptance Criteria

1. IF auto-save fails, THEN THE System SHALL display an error indicator
2. IF auto-save fails, THEN THE System SHALL retry with exponential backoff (max 3 attempts)
3. WHEN offline, THE System SHALL queue saves and sync when connection is restored
4. THE System SHALL NOT lose data due to auto-save failures

