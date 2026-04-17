# Student Application UI/UX Mobile Audit

## Scope

This audit covers the student dashboard and application wizard in `apps/admissions`.

Primary files reviewed:

- `apps/admissions/src/pages/student/Dashboard.tsx`
- `apps/admissions/src/components/student/ApplicationListItem.tsx`
- `apps/admissions/src/components/student/DocumentButtons.tsx`
- `apps/admissions/src/components/student/ApplicationSlipActions.tsx`
- `apps/admissions/src/components/student/DashboardStatusOverview.tsx`
- `apps/admissions/src/components/student/QuickActions.tsx`
- `apps/admissions/src/pages/student/applicationWizard/index.tsx`
- `apps/admissions/src/pages/student/applicationWizard/steps/BasicKycStep.tsx`
- `apps/admissions/src/pages/student/applicationWizard/steps/EducationStep.tsx`
- `apps/admissions/src/pages/student/applicationWizard/steps/PaymentStep.tsx`
- `apps/admissions/src/pages/student/applicationWizard/steps/SubmitStep.tsx`
- `apps/admissions/src/pages/student/applicationWizard/components/EnhancedProgressIndicator.tsx`
- `apps/admissions/src/pages/student/applicationWizard/components/DraftManager.tsx`
- `apps/admissions/src/components/ui/PageShell.tsx`
- `apps/admissions/src/components/navigation/AppLayout.tsx`
- `apps/admissions/src/components/ui/BottomNavigation.tsx`

This is a source-grounded UI/UX audit. It does not include screenshot-based visual QA because no mobile screenshots were provided.

## Executive Summary

The current student experience is functional but visually fragmented on mobile. The dashboard uses several card systems at once, stacks too many competing actions, and lacks a clear "next best action" hierarchy. The application wizard has better accessibility and validation infrastructure, but its layout is desktop-first: supporting context disappears on mobile, draft controls float awkwardly, and sticky wizard navigation can compete with the global bottom navigation.

The highest-impact fix is not a color refresh. The highest-impact fix is restructuring mobile information hierarchy around the user's next action:

1. Continue or start application.
2. Resolve payment or interview action.
3. View submitted application status.
4. Download or email documents.
5. Update profile or settings.

## Key UX Problems

### 1. Dashboard Mobile Hierarchy Is Unclear

Current source:

- `Dashboard.tsx` renders `DashboardStatusOverview`, `ContinueApplication`, then a two-column grid with applications plus profile, deadlines, timeline, and quick actions.
- On mobile, the `lg:grid-cols-3` collapses into one long column, so the order becomes metrics, continue draft, applications, profile, deadlines, timeline, quick actions.
- `PageShell` actions contain refresh and profile completion badge, but on mobile this can compete with the page title and primary actions.

Observed issue:

- The page does not answer "what should I do next?" strongly enough.
- Metrics appear before the user's primary action, even when the user has a draft, pending payment, or scheduled interview.
- Profile completion is visually treated like a header utility, but it can be a required task for application quality.

Impact:

- Mobile users scan past too many cards before finding the next action.
- Important calls to action have equal or weaker weight than passive metrics.
- The dashboard feels busy because visual weight is spread across cards instead of focused.

### 2. Dashboard Cards Use Mixed Visual Systems

Current source:

- `DashboardStatusOverview.tsx` uses `Card`, custom metric cards, `StatusIndicator`, `StatusBadge`, gradient/pulse animation classes.
- `Dashboard.tsx` uses `SectionCard`.
- `QuickActions.tsx` uses `Card`.
- `ApplicationListItem.tsx` is a list row with a left border hover state.

Observed issue:

- There are multiple card treatments: `Card`, `SectionCard`, custom border-left cards, muted tiles, alert cards.
- The resulting mobile dashboard looks assembled from components rather than designed as one page.

Impact:

- Weak perceived quality.
- Inconsistent density and spacing.
- Harder to build a consistent mobile rhythm.

### 3. Application List Items Are Too Heavy On Mobile

Current source:

- `ApplicationListItem.tsx` uses `px-6 py-6`, a large title, status pill, details grid, a divider, document buttons, and View Details.
- `DocumentButtons.tsx` renders a full-width column on mobile.
- `ApplicationSlipActions.tsx` renders Download Slip and Email Slip as full-width buttons.

Observed issue:

- One submitted application can consume a large portion of a mobile viewport.
- Download Slip, Email Slip, Acceptance Letter, Payment Receipt, and View Details can all compete as equally prominent buttons.
- Document actions are implementation-focused rather than user-goal focused. Users need "Application Slip" with secondary actions, not multiple equally weighted blocks.

Impact:

- Mobile dashboard looks crowded.
- The important application status gets pushed apart from actions.
- Download buttons feel visually oversized and can create awkward wrapping.

### 4. Download Buttons Need A Mobile-Specific Interaction Pattern

Current source:

- `DocumentButtons.tsx` stacks actions in `flex-col` on mobile.
- `ApplicationSlipActions.tsx` is another full-width action group inside `DocumentButtons`.

Observed issue:

- The full-width stacked buttons are accessible but visually heavy.
- The action group has no hierarchy between primary, secondary, and rare actions.
- Status messages from email slip can add more vertical height inside the list item.

Impact:

- The dashboard "doesn't look good on mobile" partly because document actions dominate submitted application rows.
- Users may accidentally tap the wrong document action because the grouping is not clear.

### 5. Quick Actions Duplicate Other Navigation

Current source:

- `QuickActions.tsx` includes start application, complete payment, interview, profile settings, and clear drafts.
- `BottomNavigation.tsx` already exposes Dashboard, Apply, Payment, Interview, More.
- `Dashboard.tsx` also shows `ContinueApplication`.

Observed issue:

- Several actions appear in multiple places.
- On mobile, duplicate action cards add length without adding clarity.
- "Clear All Drafts" appears as a quick action near productive actions, which is risky and visually negative.

Impact:

- More scrolling.
- More cognitive load.
- Destructive draft clearing is too close to ordinary navigation tasks.

### 6. Wizard Mobile Layout Hides Helpful Context

Current source:

- `applicationWizard/index.tsx` shows `ApplicationPreview`, `StepChecklist`, `ReminderSettings`, `AnalyticsDashboard`, and quick tips only inside a `hidden lg:block` aside.
- On mobile, the user loses the checklist and tips.

Observed issue:

- The desktop wizard has a support rail. Mobile users get the form only.
- Step completion exists above the form, but it does not provide the same task-level checklist.

Impact:

- Mobile users get less guidance in the hardest flow.
- Users may discover missing fields only after trying to continue.

### 7. Wizard Header Area Is Dense On Mobile

Current source:

- The wizard page header includes Back to Dashboard, logged-in email, step title, progress bar, percent, estimated time, field completion, missing fields, autosave, unsaved changes, and Save Now.

Observed issue:

- Too much status data appears before the form.
- The logged-in email is not critical in the form flow and can wrap awkwardly.
- Save Now becomes mostly icon-only on mobile, which is compact but less obvious during a high-stakes form.

Impact:

- Important form content starts lower than necessary.
- The save model is not obvious to mobile users.

### 8. Sticky Wizard Footer Can Conflict With Bottom Navigation

Current source:

- `applicationWizard/index.tsx` has a sticky bottom navigation footer inside the form.
- `AppLayout.tsx` always renders mobile `BottomNavigation`.
- `PageShell.tsx` adds `pb-20`, and `main` also has `pb-20`.

Observed issue:

- There are two bottom UI systems on mobile: wizard step controls and app bottom nav.
- The sticky wizard footer uses `bottom-0`, while the global bottom navigation is fixed at `bottom-0`.
- Padding reduces the chance of overlap, but the interaction still feels crowded and visually noisy.

Impact:

- Step navigation can visually compete with or sit near the global nav.
- Users may mis-tap between wizard controls and app navigation.

### 9. Floating Draft Manager Is Awkward On Mobile

Current source:

- `DraftManager.tsx` renders a fixed button at `top-20 right-4`.
- It opens a right-side drawer.

Observed issue:

- The fixed button can overlap content and mobile headers.
- Drafts are a critical part of the application flow but appear as a floating utility, not as part of the page structure.
- The drawer is full-width on mobile, but the launch point is not integrated into the wizard header or save status.

Impact:

- Draft management feels bolted on.
- It may contribute to the feeling of unstable UI on smaller screens.

### 10. Wizard Progress Indicator Is Too Tall For Mobile

Current source:

- `EnhancedProgressIndicator.tsx` has desktop horizontal progress and mobile vertical step items.

Observed issue:

- A vertical list of all steps can be clear, but it is expensive above a form.
- The current step summary already shows progress percent and missing fields, so the indicator duplicates information.

Impact:

- Users must scroll more before reaching the active step.
- First form field appears lower than ideal.

### 11. Form Sections Need Better Progressive Disclosure

Current source:

- `BasicKycStep.tsx` displays all personal, identity, location, next of kin, program, and intake fields in one card.
- `EducationStep.tsx` shows subject rows, eligibility, recommended subjects, and uploads together.

Observed issue:

- Mobile users face long cards with many fields and little grouping beyond grid layout.
- Important dependencies are not visually emphasized enough: program and intake should come before personal details because program controls fee and eligibility context.

Impact:

- Form feels longer than it is.
- Users can miss why fields matter.

### 12. Payment Step Needs A Test/Real Payment UX Strategy

Current source:

- `PaymentStep.tsx` has fee display, status alerts, Lenco widget availability, dev bypass in local development, and pay button.

Observed issue:

- Real payment dependency blocks full end-to-end testing in non-production environments.
- The UI explains pending and failed states, but it does not clearly separate "waiting for payment provider" from "you must take action".

Impact:

- Users and testers can feel stuck.
- Payment status polling can look like a disabled button rather than a system process.

## UX Principles For The Fix

1. Mobile-first, not desktop-collapsed.
2. One primary action per screen section.
3. Status before metrics.
4. Drafts and payments are workflow states, not secondary widgets.
5. Document downloads are secondary actions unless application is approved or payment is verified.
6. Reduce duplicate navigation because mobile already has bottom navigation.
7. Keep all touch targets at least 44x44.
8. Preserve the existing accessible labels, aria-live feedback, and validation focus behavior.
9. Do not redesign with a disconnected visual style. Use existing tokens and components, but normalize the card system.

