# Implementation Plan: shadcn/ui Component Migration

## Overview

This implementation plan systematically migrates the MIHAS Application System frontend components to shadcn/ui patterns with Radix UI primitives. The approach follows a strict incremental process: one component family at a time, with verification at each step to prevent regressions.

The migration is organized into three phases: Foundation Components (low risk), Form Controls (high risk), and Overlays & Feedback.

## Tasks

- [x] 1. Phase 1: Foundation Components - Button Migration
  - [x] 1.1 Inventory all Button usages across the codebase
    - Scan for imports from '@/components/ui/Button'
    - Document all variant and size combinations in use
    - Identify any custom props or extensions
    - _Requirements: 1.1_

  - [x] 1.2 Update Button component to pure shadcn/ui pattern
    - Preserve all existing variants (default, primary, secondary, outline, ghost, link, destructive, success, warning, gradient)
    - Preserve all existing sizes (xs, sm, md, lg, xl, icon)
    - Maintain loading state with spinner
    - Ensure 44px minimum touch targets
    - Respect prefers-reduced-motion
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 1.3 Write property test for Button variants and touch targets
    - **Property 1: Button Variant Rendering**
    - **Property 2: Touch Target Compliance (Button)**
    - **Validates: Requirements 1.2, 1.3, 1.6**

  - [x] 1.4 Write property test for disabled/loading click prevention
    - **Property 3: Disabled/Loading State Click Prevention**
    - **Validates: Requirements 1.7**

  - [x] 1.5 Verify build and visual parity
    - Run `npm run build` to ensure no compilation errors
    - Manually verify Button renders correctly across the app
    - _Requirements: 14.2, 14.4_

- [x] 2. Phase 1: Foundation Components - Input Migration
  - [x] 2.1 Inventory all Input usages across the codebase
    - Scan for imports from '@/components/ui/Input'
    - Document RHF register() bindings
    - Identify label, error, helperText, icon prop usage
    - _Requirements: 2.1_

  - [x] 2.2 Update Input component to shadcn/ui pattern
    - Maintain RHF register() spread compatibility
    - Preserve label, error, helperText, icon props
    - Ensure 44px minimum height
    - Use 16px font size for iOS zoom prevention
    - Maintain aria-invalid and aria-describedby
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 2.3 Write property test for Input error state accessibility
    - **Property 5: Input Error State Accessibility**
    - **Validates: Requirements 2.7, 2.8**

  - [x] 2.4 Verify form submission works with migrated Input
    - Test SignUpPage form submission
    - Test Application Wizard Step 1 form submission
    - Verify Supabase payloads are unchanged
    - _Requirements: 11.5, 14.3_

- [x] 3. Phase 1: Foundation Components - Textarea Migration
  - [x] 3.1 Inventory all Textarea usages across the codebase
    - Scan for imports from '@/components/ui/textarea'
    - Document RHF register() bindings
    - Identify label, error, helperText prop usage
    - _Requirements: 3.1_

  - [x] 3.2 Update Textarea component to shadcn/ui pattern
    - Maintain RHF register() spread compatibility
    - Preserve label, error, helperText props
    - Maintain minimum height and auto-resize
    - Maintain ARIA attributes
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 3.3 Verify form submission works with migrated Textarea
    - Test CommunicationModal message textarea
    - Verify Supabase payloads are unchanged
    - _Requirements: 11.5, 14.3_

- [-] 4. Phase 1: Foundation Components - Card Migration
  - [x] 4.1 Inventory all Card usages across the codebase
    - Scan for imports from '@/components/ui/card'
    - Document CardHeader, CardTitle, CardDescription, CardContent, CardFooter usage
    - _Requirements: 4.1_

  - [x] 4.2 Verify Card component follows shadcn/ui pattern
    - Ensure all subcomponents are properly exported
    - Maintain shadow and hover effect styles
    - Ensure responsive behavior
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

- [x] 5. Checkpoint - Phase 1 Complete
  - Run full build: `npm run build`
  - Run existing tests: `npm run test:unit`
  - Verify all forms still submit correctly
  - Ask the user if questions arise

- [-] 6. Phase 2: Form Controls - Native Select Migration (HIGH RISK)
  - [x] 6.1 Inventory all native `<select>` elements
    - Scan for `<select` in all .tsx files
    - Document each file, field name, and options
    - Identify RHF bindings (register vs uncontrolled)
    - Identify Supabase submission paths
    - _Requirements: 5.1_

  - [x] 6.2 Create FormSelect wrapper component
    - Create src/components/ui/form-select.tsx
    - Use RHF Controller for form binding
    - Support label, error, placeholder, disabled props
    - Ensure 44px minimum touch target
    - _Requirements: 5.2, 5.6, 5.8, 10.1_

  - [x] 6.3 Migrate simple Select usages first
    - Migrate SignUpPage sex select
    - Migrate StepOne sex, program, intake selects
    - Migrate BasicKycStep sex, program, intake selects
    - Verify form submission after each migration
    - _Requirements: 5.3, 5.4, 5.7_

  - [x] 6.4 Write property test for Select default value preservation
    - **Property 6: Select Default Value Preservation**
    - **Validates: Requirements 5.4**

  - [x] 6.5 Write property test for Select keyboard navigation
    - **Property 8: Select Keyboard Navigation**
    - **Validates: Requirements 5.5**

  - [x] 6.6 Write property test for form payload round-trip
    - **Property 7: Form Payload Round-Trip Integrity**
    - **Validates: Requirements 5.7, 11.5**

  - [x] 6.7 Migrate complex Select usages (tables, modals, dynamic lists)
    - Migrate ApplicationsAdmin filter selects
    - Migrate Users role filter and form selects
    - Migrate Programs institution selects
    - Migrate Analytics export format select
    - Verify each migration individually
    - _Requirements: 5.9_

- [-] 7. Phase 2: Form Controls - Native Radio Migration (HIGH RISK)
  - [x] 7.1 Inventory all native radio elements
    - Scan for Radio component usage
    - Document each file, field name, and options
    - Identify RHF bindings
    - _Requirements: 6.1_

  - [x] 7.2 Create FormRadioGroup wrapper component
    - Create src/components/ui/form-radio-group.tsx
    - Use RHF Controller for form binding
    - Support label, error, orientation props
    - Ensure 44px minimum touch target per option
    - _Requirements: 6.2, 6.6, 6.8, 10.1_

  - [x] 7.3 Migrate Radio usages to FormRadioGroup
    - Replace Radio component usages with FormRadioGroup
    - Verify form submission after migration
    - _Requirements: 6.3, 6.4, 6.7, 6.9_
- [x] 9. Phase 3: Overlays - Modal to Dialog Migration
  - [x] 9.1 Inventory all Modal usages
    - Scan for imports from '@/components/ui/Modal'
    - Document each usage with props
    - _Requirements: 7.1_

  - [x] 9.2 Create Dialog compatibility wrapper
    - Ensure Dialog supports isOpen/onClose props (Modal API)
    - Support size variants (sm, md, lg, xl, full)
    - Maintain focus trapping
    - Maintain Escape key close
    - Maintain backdrop click close
    - Prevent body scroll when open
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x] 9.3 Migrate Modal usages to Dialog
    - Replace Modal imports with Dialog
    - Update prop names if needed (isOpen → open)
    - Verify each migration individually
    - _Requirements: 7.9_

  - [x] 9.4 Write property test for Dialog focus trapping
    - **Property 10: Dialog Focus Trapping**
    - **Validates: Requirements 7.2**

  - [x] 9.5 Write property test for Dialog escape key close
    - **Property 11: Dialog Escape Key Close**
    - **Validates: Requirements 7.3**

  - [x] 9.6 Write property test for Dialog body scroll lock
    - **Property 13: Dialog Body Scroll Lock**
    - **Validates: Requirements 7.7**

- [x] 10. Phase 3: Overlays - Alert Migration
  - [x] 10.1 Inventory all Alert usages
    - Scan for imports from '@/components/ui/Alert'
    - Document variant usage
    - _Requirements: 8.1_

  - [x] 10.2 Update Alert component to shadcn/ui pattern
    - Support variants (default, destructive, success, warning, info)
    - Support AlertTitle and AlertDescription
    - Support icon display
    - Maintain role="alert" for important messages
    - _Requirements: 8.2, 8.3, 8.4, 8.5_

- [-] 11. Phase 3: Overlays - ConfirmDialog to AlertDialog Migration
  - [x] 11.1 Inventory all ConfirmDialog usages
    - Scan for imports from '@/components/ui/ConfirmDialog'
    - Document each usage with callbacks
    - _Requirements: 9.1_

  - [x] 11.2 Create AlertDialog component
    - Create src/components/ui/alert-dialog.tsx using Radix AlertDialog
    - Maintain focus trapping
    - Prevent backdrop close (require explicit action)
    - Support title, description, action buttons
    - Maintain role="alertdialog"
    - _Requirements: 9.2, 9.3, 9.4, 9.5_

  - [x] 11.3 Migrate ConfirmDialog usages to AlertDialog
    - Replace ConfirmDialog with AlertDialog
    - Preserve confirm/cancel callback behavior
    - Verify each migration individually
    - _Requirements: 9.6_

  - [x] 11.4 Write property test for AlertDialog no backdrop close
    - **Property 12: AlertDialog No Backdrop Close**
    - **Validates: Requirements 9.3**

  - [ ] 11.5 Write property test for ARIA attributes
    - **Property 14: ARIA Attributes Compliance**
    - **Validates: Requirements 7.8, 9.5**

- [ ] 12. Checkpoint - Phase 3 Complete
  - Run full build: `npm run build`
  - Run all tests: `npm run test:unit`
  - Test all dialogs and modals
  - Verify accessibility with screen reader
  - Ask the user if questions arise

- [ ] 13. Cross-Cutting Concerns
  - [ ] 13.1 Verify React Hook Form compatibility
    - Test register() pattern on Input, Textarea
    - Test Controller pattern on Select, RadioGroup
    - Verify auto-save in Application Wizard
    - _Requirements: 10.2, 10.4, 10.5, 10.7_

  - [ ] 13.2 Write property test for RHF Controller binding
    - **Property 15: RHF Controller Binding**
    - **Validates: Requirements 10.2, 10.5**

  - [ ] 13.3 Write property test for Zod validation preservation
    - **Property 16: Zod Validation Preservation**
    - **Validates: Requirements 10.6**

  - [ ] 13.4 Verify Supabase data integrity
    - Test Application Wizard full submission
    - Test Admin user creation
    - Test Admin application status updates
    - Compare payloads before/after migration
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ] 13.5 Verify accessibility compliance
    - Run axe-core on all pages
    - Test keyboard navigation
    - Test with screen reader
    - Verify color contrast
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ] 13.6 Write property test for reduced motion compliance
    - **Property 4: Reduced Motion Compliance**
    - **Validates: Requirements 1.5, 12.6**

- [ ] 14. Final Verification
  - [ ] 14.1 Run full test suite
    - Run unit tests: `npm run test:unit`
    - Run property tests
    - Run e2e tests: `npm run test`
    - _Requirements: 14.2, 14.3, 14.4_

  - [ ] 14.2 Verify backward compatibility
    - Test all existing routes work
    - Test all forms submit correctly
    - Test auto-save functionality
    - Test authentication flows
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [ ] 14.3 Document migration changes
    - Update component documentation
    - Document any breaking changes
    - Update COMPONENT_GUIDELINES.md
    - _Requirements: 13.7_

- [ ] 15. Final Checkpoint - Migration Complete
  - All components migrated to shadcn/ui patterns
  - All property tests passing
  - All forms submit correctly
  - Supabase data integrity verified
  - Accessibility compliance verified
  - Ask the user if questions arise

## Notes

- All tasks including property-based tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation before proceeding
- Property tests use fast-check library with minimum 100 iterations
- STOP IMMEDIATELY if any failure condition occurs:
  - Form stops submitting
  - Validation breaks
  - Default values disappear
  - Keyboard navigation regresses
  - Supabase insert/update fails
  - Hydration or controlled/uncontrolled warnings appear
- Roll back immediately and isolate the cause before proceeding
- Existing API integrations and business logic remain unchanged
