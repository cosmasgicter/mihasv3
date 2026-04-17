# Student UI/UX Mobile Remediation Tasks

## Phase 0: Baseline QA

- [ ] Capture screenshots at 360x800, 390x844, 412x915, 768x1024, 1280x800.
- [ ] Record current scroll depth to first primary action on dashboard.
- [ ] Record current scroll depth to first form field in wizard.
- [ ] Test with one draft, one submitted app, one pending payment, one approved app, and zero applications.
- [ ] Test long program names, long email addresses, and long student names.
- [ ] Verify no horizontal scrolling on student dashboard and wizard.

## Phase 1: Dashboard Mobile Information Architecture

- [ ] Add `StudentNextActionCard`.
  - File: `apps/admissions/src/components/student/StudentNextActionCard.tsx`
  - Inputs: draft count, pending payment, scheduled interview, latest application, profile completion.
  - Output: one primary CTA and optional secondary link.

- [ ] Reorder dashboard mobile sections.
  - File: `apps/admissions/src/pages/student/Dashboard.tsx`
  - Put `StudentNextActionCard` before metrics.
  - Keep metrics compact.
  - Move profile/deadlines/timeline below core application state.

- [ ] Split status overview into smaller components.
  - File: `apps/admissions/src/components/student/DashboardStatusOverview.tsx`
  - Extract `StudentMetricsGrid`.
  - Extract `PaymentActionAlert`.
  - Extract `LatestApplicationStatusCard`.

- [ ] Reduce mobile header action density.
  - File: `apps/admissions/src/pages/student/Dashboard.tsx`
  - Keep refresh as a secondary icon button on mobile.
  - Move profile completion into content when below 100 percent.

Acceptance:

- [ ] At 390px width, the dashboard first viewport shows greeting plus one clear next action.
- [ ] Metrics no longer dominate the first viewport.
- [ ] Refresh and profile completion do not wrap awkwardly in the title area.

## Phase 2: Application Cards and Download Actions

- [ ] Refactor mobile application cards.
  - File: `apps/admissions/src/components/student/ApplicationListItem.tsx`
  - Use compact card layout on mobile.
  - Keep desktop row behavior if desired.
  - Cap long program names with wrapping or line clamp.

- [ ] Create compact document action pattern.
  - File: `apps/admissions/src/components/student/DocumentButtons.tsx`
  - Add mobile disclosure or compact menu.
  - Show "Application slip" as the main document group.
  - Keep receipt and acceptance letter as conditional secondary actions.

- [ ] Refactor application slip actions.
  - File: `apps/admissions/src/components/student/ApplicationSlipActions.tsx`
  - Support compact mode.
  - Move long status messages below the action group or into a small status chip.
  - Keep `aria-live`.

- [ ] Review button hierarchy.
  - "View Details" should be primary for submitted applications.
  - "Download Slip" should be secondary.
  - "Email Slip" should be tertiary or inside disclosure on mobile.

Acceptance:

- [ ] A submitted application card with all document actions does not consume more than about one third of a 844px mobile viewport when collapsed.
- [ ] No row has more than two visible full-width buttons by default on mobile.
- [ ] Document actions remain keyboard accessible.

## Phase 3: Quick Actions Cleanup

- [ ] Remove duplicate mobile actions.
  - File: `apps/admissions/src/components/student/QuickActions.tsx`
  - Hide generic navigation actions that duplicate bottom nav.
  - Keep only contextual action-required items.

- [ ] Move destructive draft clearing.
  - File: `apps/admissions/src/pages/student/Dashboard.tsx`
  - Put clear drafts inside draft management, not generic quick actions.

- [ ] Adjust bottom navigation primary items if needed.
  - File: `apps/admissions/src/components/navigation/AppLayout.tsx`
  - Confirm Dashboard, Apply, Payment, Interview, More are the right visible mobile items.

Acceptance:

- [ ] Quick Actions section is not shown when there are no contextual actions.
- [ ] Destructive actions are visually separated from normal navigation.

## Phase 4: Wizard Mobile Header and Progress

- [ ] Create or refactor compact wizard header.
  - File: `apps/admissions/src/pages/student/applicationWizard/index.tsx`
  - Show step title, step count, compact progress bar, save status.
  - Remove logged-in email from body header on mobile.

- [ ] Refactor progress indicator mobile behavior.
  - File: `apps/admissions/src/pages/student/applicationWizard/components/EnhancedProgressIndicator.tsx`
  - Desktop: keep full horizontal stepper.
  - Mobile: compact closed state plus "View steps" disclosure.

- [ ] Make Save Now clearer on mobile.
  - File: `apps/admissions/src/pages/student/applicationWizard/index.tsx`
  - Show text when there are unsaved changes or save failed.
  - Keep icon-only only for idle/saved state if space is tight.

Acceptance:

- [ ] First active form field is visible earlier on mobile.
- [ ] Stepper closed mobile height is under 96px.
- [ ] Previous-step navigation still works.

## Phase 5: Wizard Bottom Navigation Conflict

- [ ] Hide global bottom nav on wizard routes.
  - File: `apps/admissions/src/components/navigation/AppLayout.tsx`
  - Hide `BottomNavigation` for `/student/application-wizard` and `/apply`.
  - Adjust `main` bottom padding for wizard routes.

- [ ] Update wizard sticky footer.
  - File: `apps/admissions/src/pages/student/applicationWizard/index.tsx`
  - Add safe-area padding.
  - Keep footer only for step navigation actions.

Acceptance:

- [ ] No overlap between Next/Previous and global bottom nav.
- [ ] No accidental route navigation controls directly under wizard primary CTA.
- [ ] Footer works with iOS safe area and Android gesture navigation.

## Phase 6: Draft Manager Mobile UX

- [ ] Replace floating Drafts button on mobile.
  - File: `apps/admissions/src/pages/student/applicationWizard/components/DraftManager.tsx`
  - Add inline trigger mode.
  - Keep floating trigger only on desktop if still needed.

- [ ] Use mobile bottom sheet for drafts.
  - File: `apps/admissions/src/pages/student/applicationWizard/components/DraftManager.tsx`
  - Mobile: bottom sheet, max height 85dvh.
  - Desktop: right drawer.

- [ ] Integrate draft trigger into wizard header.
  - File: `apps/admissions/src/pages/student/applicationWizard/index.tsx`
  - Place near autosave status.

Acceptance:

- [ ] Draft controls no longer overlap content on mobile.
- [ ] Draft sheet has focus trap, Escape support, visible close, and safe-area padding.

## Phase 7: Wizard Support Panel On Mobile

- [ ] Create `WizardMobileSupportPanel`.
  - File: `apps/admissions/src/pages/student/applicationWizard/components/WizardMobileSupportPanel.tsx`
  - Contains StepChecklist, quick tips, and optional preview.

- [ ] Render mobile support panel under compact header.
  - File: `apps/admissions/src/pages/student/applicationWizard/index.tsx`
  - Keep desktop aside for large screens.

- [ ] Keep support collapsed by default.
  - Checklist can be expanded when validation fails.

Acceptance:

- [ ] Mobile users can access checklist and tips without scrolling to a desktop-only aside.
- [ ] Support panel does not block the form by default.

## Phase 8: Form Step Refinement

- [ ] Reorder Basic KYC fields.
  - File: `apps/admissions/src/pages/student/applicationWizard/steps/BasicKycStep.tsx`
  - Program and intake first.
  - Identity, contact, residence, next of kin after.

- [ ] Add group headings to Basic KYC.
  - Program details.
  - Identity.
  - Contact.
  - Residence.
  - Emergency contact.

- [ ] Improve Education mobile flow.
  - File: `apps/admissions/src/pages/student/applicationWizard/steps/EducationStep.tsx`
  - Add subject count progress.
  - Reduce repeated add buttons.
  - Keep upload cards clear and separate.

- [ ] Improve Payment state clarity.
  - File: `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx`
  - Add status panel.
  - Make pending confirmation feel active.
  - Make disabled Pay Now reason immediate.

- [ ] Improve Submit review.
  - File: `apps/admissions/src/pages/student/applicationWizard/steps/SubmitStep.tsx`
  - Collapse long sections on mobile.
  - Keep blockers and confirmation near final submit.

Acceptance:

- [ ] Each wizard step has one obvious task on mobile.
- [ ] Missing fields are visible before the user hits Next when possible.
- [ ] Payment pending state does not look broken.

## Phase 9: Visual System Cleanup

- [ ] Standardize student card container.
  - Prefer `SectionCard` or a new `StudentCard`.
  - Avoid mixing `Card`, `SectionCard`, and ad hoc cards in the same section unless there is a clear reason.

- [ ] Normalize spacing.
  - Mobile card padding: 16px.
  - Desktop card padding: 24px.
  - Section gap: 16px mobile, 24px desktop.

- [ ] Normalize status chips.
  - Reuse one status chip mapping for application/payment/interview status.

- [ ] Reduce decorative animation on mobile.
  - Keep state change animations.
  - Remove hover-only affordances from mobile-critical controls.

Acceptance:

- [ ] Student dashboard and wizard feel like the same product.
- [ ] No component relies on hover to communicate action.
- [ ] Reduced-motion users see no unnecessary movement.

## Phase 10: Testing and Validation

- [ ] Add source-level responsive invariants.
  - Student dashboard document actions must expose compact mode.
  - Wizard route must hide global bottom navigation.
  - Draft manager must support non-floating trigger.

- [ ] Add interaction tests where feasible.
  - Application card document disclosure opens and closes.
  - Wizard mobile support panel opens and remains keyboard accessible.
  - Save failure displays visible recovery message.

- [ ] Manual QA matrix.
  - 360x800 Android.
  - 390x844 iPhone.
  - 412x915 Android.
  - 768x1024 tablet.
  - Desktop 1280+.

- [ ] Accessibility QA.
  - Keyboard tab order.
  - Screen reader labels for icon actions.
  - Focus trap in draft sheet.
  - Aria-live validation and download status.

## Implementation Order

Recommended order for actual code work:

1. Phase 5: hide bottom nav in wizard and fix sticky footer conflict.
2. Phase 1: add next action card and reorder dashboard.
3. Phase 2: compact application cards and document buttons.
4. Phase 4: compact wizard header and stepper.
5. Phase 6: draft manager mobile integration.
6. Phase 7 and Phase 8: support panel and step-level refinements.
7. Phase 9 and Phase 10: visual system cleanup and testing.

This order fixes the most visible mobile pain first while minimizing risk to data and application logic.

