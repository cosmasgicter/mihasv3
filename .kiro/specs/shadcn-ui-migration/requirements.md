# Requirements Document

## Introduction

This specification defines a systematic migration of the MIHAS Application System frontend components to shadcn/ui patterns with Radix UI primitives. The migration prioritizes preserving all existing functionality, React Hook Form compatibility, form validation, accessibility (WCAG), visual layout, and Supabase data integrity while achieving a unified, maintainable component library.

The migration follows a strict incremental approach: one component family at a time, with verification at each step to prevent regressions.

## Glossary

- **Migration_System**: The process and tooling for systematically replacing components with shadcn/ui equivalents
- **shadcn_ui**: A collection of re-usable components built using Radix UI and Tailwind CSS
- **Radix_UI**: A low-level UI component library with focus on accessibility, customization and developer experience
- **RHF**: React Hook Form - the form library used throughout the application
- **Controller**: RHF component for controlled inputs, required for Radix-based components
- **Native_Select**: HTML `<select>` element currently used in forms
- **Native_Radio**: HTML `<input type="radio">` element currently used in forms
- **Supabase_Payload**: The data structure sent to Supabase on form submission
- **Form_Binding**: The connection between form state (RHF) and UI components
- **Backward_Compatibility**: Ensuring existing functionality continues to work after migration

## Requirements

### Requirement 1: Button Component Migration

**User Story:** As a developer, I want all Button components to use the shadcn/ui Button pattern, so that the UI is consistent and maintainable.

#### Acceptance Criteria

1. THE Migration_System SHALL replace all custom Button implementations with shadcn/ui Button
2. THE shadcn_ui Button SHALL support all existing variants (default, primary, secondary, outline, ghost, link, destructive, success, warning, gradient)
3. THE shadcn_ui Button SHALL support all existing sizes (xs, sm, md, lg, xl, icon)
4. THE shadcn_ui Button SHALL maintain the loading state with spinner animation
5. THE shadcn_ui Button SHALL respect prefers-reduced-motion settings
6. THE shadcn_ui Button SHALL maintain 44x44px minimum touch targets on mobile
7. WHEN a Button is disabled or loading, THE shadcn_ui Button SHALL prevent click events
8. THE shadcn_ui Button SHALL maintain all existing ARIA attributes and keyboard navigation

### Requirement 2: Input Component Migration

**User Story:** As a developer, I want all Input components to use the shadcn/ui Input pattern with RHF compatibility, so that form handling is consistent.

#### Acceptance Criteria

1. THE Migration_System SHALL replace all custom Input implementations with shadcn/ui Input
2. THE shadcn_ui Input SHALL support RHF register() spread pattern
3. THE shadcn_ui Input SHALL support label, error, and helperText props
4. THE shadcn_ui Input SHALL support icon prefix display
5. THE shadcn_ui Input SHALL maintain 44px minimum height for touch targets
6. THE shadcn_ui Input SHALL use 16px font size to prevent iOS zoom
7. WHEN validation errors occur, THE shadcn_ui Input SHALL display error styling and messages
8. THE shadcn_ui Input SHALL maintain aria-invalid and aria-describedby attributes

### Requirement 3: Textarea Component Migration

**User Story:** As a developer, I want all Textarea components to use the shadcn/ui Textarea pattern, so that multi-line text input is consistent.

#### Acceptance Criteria

1. THE Migration_System SHALL replace all custom Textarea implementations with shadcn/ui Textarea
2. THE shadcn_ui Textarea SHALL support RHF register() spread pattern
3. THE shadcn_ui Textarea SHALL support label, error, and helperText props
4. THE shadcn_ui Textarea SHALL maintain minimum height and auto-resize behavior
5. WHEN validation errors occur, THE shadcn_ui Textarea SHALL display error styling and messages
6. THE shadcn_ui Textarea SHALL maintain all existing ARIA attributes

### Requirement 4: Card Component Migration

**User Story:** As a developer, I want all Card components to use the shadcn/ui Card pattern, so that content containers are consistent.

#### Acceptance Criteria

1. THE Migration_System SHALL replace all custom Card implementations with shadcn/ui Card
2. THE shadcn_ui Card SHALL support CardHeader, CardTitle, CardDescription, CardContent, CardFooter subcomponents
3. THE shadcn_ui Card SHALL maintain existing shadow and hover effect styles
4. THE shadcn_ui Card SHALL be fully responsive across all breakpoints
5. THE shadcn_ui Card SHALL maintain proper heading hierarchy within CardTitle

### Requirement 5: Native Select to Radix Select Migration

**User Story:** As a developer, I want all native `<select>` elements replaced with shadcn/ui Select (Radix-based), so that the UI is consistent and accessible.

#### Acceptance Criteria

1. THE Migration_System SHALL replace all native `<select>` elements with shadcn/ui Select
2. THE shadcn_ui Select SHALL use RHF Controller for form binding
3. THE shadcn_ui Select SHALL preserve all existing option values and labels
4. THE shadcn_ui Select SHALL preserve default/selected values on form load
5. THE shadcn_ui Select SHALL maintain keyboard navigation (arrow keys, type-ahead)
6. THE shadcn_ui Select SHALL maintain 44px minimum touch target height
7. WHEN form is submitted, THE Supabase_Payload SHALL contain identical field names and values as before migration
8. THE shadcn_ui Select SHALL support disabled state and error styling
9. IF a select is used inside tables, modals, or dynamic lists, THEN THE Migration_System SHALL migrate it last after simpler cases

### Requirement 6: Native Radio to Radix RadioGroup Migration

**User Story:** As a developer, I want all native radio inputs replaced with shadcn/ui RadioGroup (Radix-based), so that radio selection is consistent and accessible.

#### Acceptance Criteria

1. THE Migration_System SHALL replace all native `<input type="radio">` elements with shadcn/ui RadioGroup
2. THE shadcn_ui RadioGroup SHALL use RHF Controller for form binding
3. THE shadcn_ui RadioGroup SHALL preserve name grouping for radio sets
4. THE shadcn_ui RadioGroup SHALL preserve default/selected values on form load
5. THE shadcn_ui RadioGroup SHALL maintain keyboard navigation (arrow keys between options)
6. THE shadcn_ui RadioGroup SHALL maintain 44px minimum touch target for each option
7. WHEN form is submitted, THE Supabase_Payload SHALL contain identical field names and values as before migration
8. THE shadcn_ui RadioGroup SHALL support horizontal and vertical orientations
9. THE shadcn_ui RadioGroup SHALL maintain proper accessibility labels

### Requirement 7: Modal to Dialog Migration

**User Story:** As a developer, I want all Modal components replaced with shadcn/ui Dialog (Radix-based), so that overlays are consistent and accessible.

#### Acceptance Criteria

1. THE Migration_System SHALL replace all custom Modal implementations with shadcn/ui Dialog
2. THE shadcn_ui Dialog SHALL maintain focus trapping within the dialog
3. THE shadcn_ui Dialog SHALL close on Escape key press
4. THE shadcn_ui Dialog SHALL close on backdrop click (unless configured otherwise)
5. THE shadcn_ui Dialog SHALL support title, description, and custom content
6. THE shadcn_ui Dialog SHALL support size variants (sm, md, lg, xl, full)
7. THE shadcn_ui Dialog SHALL prevent body scroll when open
8. THE shadcn_ui Dialog SHALL maintain proper ARIA attributes (role="dialog", aria-modal)
9. IF nested dialogs exist, THEN THE Migration_System SHALL ensure no focus trapping regressions

### Requirement 8: Alert Component Migration

**User Story:** As a developer, I want all Alert components to use the shadcn/ui Alert pattern, so that feedback messages are consistent.

#### Acceptance Criteria

1. THE Migration_System SHALL replace all custom Alert implementations with shadcn/ui Alert
2. THE shadcn_ui Alert SHALL support variants (default, destructive, success, warning, info)
3. THE shadcn_ui Alert SHALL support AlertTitle and AlertDescription subcomponents
4. THE shadcn_ui Alert SHALL support icon display
5. THE shadcn_ui Alert SHALL maintain proper ARIA role="alert" for important messages

### Requirement 9: ConfirmDialog to AlertDialog Migration

**User Story:** As a developer, I want all ConfirmDialog components replaced with shadcn/ui AlertDialog, so that confirmation flows are consistent and accessible.

#### Acceptance Criteria

1. THE Migration_System SHALL replace all ConfirmDialog implementations with shadcn/ui AlertDialog
2. THE shadcn_ui AlertDialog SHALL maintain focus trapping
3. THE shadcn_ui AlertDialog SHALL require explicit action (no backdrop close for destructive actions)
4. THE shadcn_ui AlertDialog SHALL support title, description, and action buttons
5. THE shadcn_ui AlertDialog SHALL maintain proper ARIA attributes (role="alertdialog")
6. THE shadcn_ui AlertDialog SHALL preserve existing confirm/cancel callback behavior

### Requirement 10: React Hook Form Compatibility

**User Story:** As a developer, I want all migrated components to work seamlessly with React Hook Form, so that form handling remains consistent.

#### Acceptance Criteria

1. THE Migration_System SHALL use Controller from RHF for all Radix-based form components
2. THE Migration_System SHALL preserve onChange, value, and ref bindings
3. THE Migration_System SHALL NOT rely on Radix internal state alone for form values
4. WHEN using register() pattern, THE shadcn_ui components SHALL spread props correctly
5. WHEN using Controller pattern, THE shadcn_ui components SHALL bind value and onChange correctly
6. THE Migration_System SHALL preserve all existing Zod validation schemas
7. THE Migration_System SHALL maintain auto-save functionality in Application Wizard

### Requirement 11: Supabase Data Integrity

**User Story:** As a developer, I want all form submissions to maintain identical Supabase payloads after migration, so that no data is lost or corrupted.

#### Acceptance Criteria

1. THE Migration_System SHALL NOT change any field names in form submissions
2. THE Migration_System SHALL NOT change any field types in form submissions
3. THE Migration_System SHALL NOT impact RLS policies
4. THE Migration_System SHALL NOT change insert/update semantics
5. WHEN a form is submitted, THE Supabase_Payload SHALL be byte-identical to pre-migration payload
6. THE Migration_System SHALL verify all CRUD operations work correctly after each component migration

### Requirement 12: Accessibility Compliance

**User Story:** As a user with disabilities, I want all migrated components to maintain or improve accessibility, so that I can use the application with assistive technologies.

#### Acceptance Criteria

1. THE Migration_System SHALL maintain WCAG 2.1 AA compliance for all migrated components
2. THE Migration_System SHALL ensure all interactive elements are keyboard navigable
3. THE Migration_System SHALL maintain proper focus management in dialogs
4. THE Migration_System SHALL preserve all existing ARIA labels and roles
5. THE Migration_System SHALL maintain color contrast ratios meeting WCAG AA standards
6. WHEN animations play, THE migrated components SHALL respect prefers-reduced-motion settings

### Requirement 13: Backward Compatibility

**User Story:** As an existing user, I want all my current workflows to continue working after migration, so that I don't experience any disruption.

#### Acceptance Criteria

1. THE Migration_System SHALL maintain all existing component prop interfaces
2. THE Migration_System SHALL create compatibility wrappers where prop interfaces differ
3. THE Migration_System SHALL preserve all existing routes and URL structures
4. THE Migration_System SHALL maintain all existing form validations
5. THE Migration_System SHALL preserve auto-save functionality
6. THE Migration_System SHALL maintain all existing authentication flows
7. IF any breaking changes are unavoidable, THEN THE Migration_System SHALL provide migration documentation

### Requirement 14: Incremental Migration Process

**User Story:** As a developer, I want the migration to happen incrementally with verification at each step, so that regressions are caught early.

#### Acceptance Criteria

1. THE Migration_System SHALL migrate only ONE component family at a time
2. THE Migration_System SHALL verify build success after each component migration
3. THE Migration_System SHALL verify form submission works after each form component migration
4. THE Migration_System SHALL verify visual parity after each component migration
5. IF any failure condition occurs (form stops submitting, validation breaks, default values disappear, keyboard navigation regresses, Supabase operations fail, hydration warnings appear), THEN THE Migration_System SHALL roll back immediately
6. THE Migration_System SHALL document all files affected by each migration step
