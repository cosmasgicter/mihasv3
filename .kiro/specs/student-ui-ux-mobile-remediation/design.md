# Student UI/UX Mobile Remediation Design

## Target Mobile Dashboard Structure

The dashboard should become a task-first mobile home screen.

Recommended mobile order:

1. Hero task card.
2. Active application or draft card.
3. Action-required alerts.
4. Compact application status list.
5. Documents and downloads.
6. Profile completeness.
7. Deadlines and timeline.
8. Secondary quick actions.

Desktop can keep a two-column layout, but mobile should use a deliberate order instead of simply collapsing the desktop grid.

## Dashboard Information Architecture

### Hero Task Card

Purpose:

- Tell the student what to do next.
- Replace passive metrics as the first visual object.

Inputs:

- `totalDraftCount`
- `hasPendingPayment`
- `hasScheduledInterview`
- `submittedApplications`
- latest application status
- profile completion

States:

- Draft exists: "Continue your application" with last saved time if available.
- Pending payment: "Complete payment" with application number.
- Interview scheduled: "View interview details".
- Submitted with no required action: "Track your application".
- No application: "Start application".

Component proposal:

- Add `StudentNextActionCard` under `apps/admissions/src/components/student/StudentNextActionCard.tsx`.
- Use `SectionCard` or a lighter mobile-first card, not `Card`.
- Primary CTA full width on mobile.
- Secondary CTA as text link or outline button.

Acceptance criteria:

- On 375px width, the primary action is visible without scrolling past metrics.
- Only one primary CTA is visually dominant.
- No destructive action appears in the hero card.

### Metrics

Current metrics are useful but too prominent on mobile.

Design:

- Desktop: keep four metric cards.
- Mobile: use a compact 2x2 grid or horizontal summary strip after the hero card.
- Reduce typography from `text-2xl` to a mobile-aware scale.
- Avoid using "Payment Action Required" as a metric when it should be an alert.

Implementation:

- Update `DashboardStatusOverview.tsx`.
- Split it into:
  - `StudentMetricsGrid`
  - `LatestApplicationStatusCard`
  - `PaymentActionAlert`
- Render `PaymentActionAlert` above metrics when action is required.

Acceptance criteria:

- Metrics do not push the first real action below the first mobile viewport.
- Payment warnings use alert styling, not metric styling.

### Application List

Design:

- Replace large list rows with compact application cards on mobile.
- Preserve the richer row layout for desktop.
- Put status and application number in the first line.
- Put program and intake below.
- Put document actions behind a compact "Documents" action group.

Implementation options:

- Option A: make `ApplicationListItem.tsx` responsive with mobile and desktop sub-layouts.
- Option B: create `ApplicationMobileCard.tsx` and render based on CSS classes.

Recommended:

- Option A initially, because it minimizes file churn.

Mobile card structure:

- Header: status pill left, application number right.
- Title: program name, two lines max.
- Metadata row: intake and submitted date.
- Primary action: View Details.
- Secondary action: Documents disclosure.

Acceptance criteria:

- A submitted application card fits in roughly 220 to 280px height with document disclosure closed.
- Status, program, and View Details are visible without expanding downloads.
- No horizontal overflow with long program names or emails.

### Document Buttons

Design:

- Use a mobile disclosure pattern:
  - Primary document action: "Application slip".
  - Secondary: "Email slip".
  - Conditional: "Receipt", "Acceptance letter".
- On mobile, use a compact segmented row or a disclosure sheet rather than stacking every button.
- On desktop, keep visible inline buttons if space allows.

Implementation:

- Refactor `DocumentButtons.tsx` to receive `compact?: boolean`.
- Add `DocumentActionMenu` or `DocumentsDisclosure`.
- Move email status text out of the list row or collapse it into a single inline status below the group.
- Ensure all buttons remain at least 44px high.

Acceptance criteria:

- On mobile, no application card shows more than two document/action buttons by default.
- Email fallback status remains visible and accessible via `aria-live`.
- Approved applications still expose Acceptance Letter clearly.

### Quick Actions

Design:

- Make quick actions contextual and secondary.
- Remove duplicate navigation items already available in bottom navigation unless they are action-required.
- Move "Clear All Drafts" out of Quick Actions and into draft management with a confirmation flow.

Implementation:

- Update `QuickActions.tsx`.
- Keep only:
  - Payment action if pending.
  - Interview action if scheduled.
  - Profile action if profile completion below threshold.
- Hide generic settings/start actions on mobile when already represented elsewhere.

Acceptance criteria:

- Quick Actions should never be the longest section of the dashboard.
- Destructive draft clearing should not appear beside ordinary navigation tasks.

## Target Wizard Mobile Structure

The wizard should feel like a guided checklist with one focused task at a time.

Recommended mobile order:

1. Compact step header.
2. Current step card.
3. Inline checklist drawer or collapsible helper.
4. Sticky action footer above bottom navigation or route-specific bottom nav suppression.

## Wizard Header

Current header contains too much information.

Design:

- Mobile header should show:
  - Step title.
  - Step x of y.
  - Compact progress bar.
  - Save status.
- Move logged-in email into a collapsible account/status area or remove it from the wizard body.
- Make Save Now text visible on mobile when there are unsaved changes.

Implementation:

- Add `WizardMobileHeader` or simplify the header inside `applicationWizard/index.tsx`.
- Use `AutoSaveIndicator` plus a visible "Save" button only when changed fields exist or save failed.
- Keep detailed missing field text in a collapsible "Step checklist".

Acceptance criteria:

- First form field appears within the first mobile viewport after header and progress.
- Save failure is visible without relying on console or toast only.
- Logged-in email does not cause wrapping in the header area.

## Wizard Progress

Design:

- Mobile should use compact progress by default:
  - Step x of y
  - Progress bar
  - Current step title
- Full step list should be behind "View steps" disclosure.

Implementation:

- Update `EnhancedProgressIndicator.tsx`:
  - Keep desktop horizontal stepper.
  - Change mobile default to compact current-step summary.
  - Add expandable step list for completed previous steps.

Acceptance criteria:

- Mobile stepper closed height is under 96px.
- Previous steps remain accessible via disclosure.
- Keyboard navigation remains available when disclosure is open.

## Wizard Support Context

Current desktop support rail disappears on mobile.

Design:

- Replace hidden desktop-only rail with mobile accordions:
  - Checklist.
  - Preview.
  - Tips.
- Keep reminders and analytics desktop-only unless they have direct user value on mobile.

Implementation:

- Create `WizardMobileSupportPanel.tsx`.
- Move `StepChecklist` into the mobile panel.
- Add an "Application preview" accordion for review.
- Keep `ReminderSettings` hidden on mobile initially.

Acceptance criteria:

- Mobile users can view checklist and tips without leaving the active step.
- Checklist updates as fields are completed.
- The support panel does not push the form below the first viewport by default.

## Wizard Sticky Footer and Bottom Navigation

Design options:

- Option A: hide global bottom navigation while inside the wizard.
- Option B: keep global nav and position wizard footer above it.

Recommended:

- Option A for focus and reduced accidental navigation.

Rationale:

- The wizard is a linear high-stakes flow.
- Bottom navigation encourages leaving the form mid-step.
- Browser back and the explicit "Back to Dashboard" link already provide escape paths.

Implementation:

- Add route metadata or layout prop to suppress `BottomNavigation` on `/student/application-wizard` and `/apply`.
- In `AppLayout.tsx`, compute `hideBottomNav` for wizard routes.
- Reduce duplicate bottom padding when bottom nav is hidden.
- Keep wizard sticky footer at bottom with safe-area padding.

Acceptance criteria:

- No overlap between wizard Next/Previous controls and app bottom nav.
- Users can still leave via Back to Dashboard and browser back.
- Sticky footer respects safe area on iOS and Android gesture navigation.

## Draft Manager

Design:

- Remove floating top-right Drafts button on mobile.
- Integrate draft state into the wizard header:
  - "Draft saved"
  - "Manage drafts"
  - "New draft"
- Use a bottom sheet on mobile and side drawer on desktop.

Implementation:

- Update `DraftManager.tsx` to support `trigger="inline" | "floating"`.
- In wizard, render inline trigger inside header/status area.
- Use bottom sheet classes on mobile:
  - `fixed inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl`
  - side drawer on `sm` and above.

Acceptance criteria:

- No fixed draft button overlaps header or content on mobile.
- Draft drawer/sheet has visible close, focus trap, Escape support, and safe-area padding.

## Form Step Improvements

### Basic KYC

Design:

- Reorder into logical mobile groups:
  - Program and intake.
  - Identity.
  - Contact.
  - Residence.
  - Next of kin.
- Use clear section dividers or mini headings.
- Keep phone helper aligned with backend format.

Implementation:

- Update `BasicKycStep.tsx`.
- Consider extracting `ProgramIntakeFields`, `IdentityFields`, `ContactFields`, `NextOfKinFields`.

Acceptance criteria:

- Program and intake are above personal details.
- Phone placeholder and helper never suggest a rejected format.
- Each group has visible heading and helper text.

### Education

Design:

- Subject rows should feel like editable chips/cards on mobile.
- Add subject count progress: "3 of 5 minimum subjects".
- Keep upload cards after subject progress.

Implementation:

- Update `EducationStep.tsx`.
- Add `SubjectProgressSummary`.
- Make add/remove actions less repetitive: one Add Subject CTA below list, remove icon as secondary.

Acceptance criteria:

- Adding subjects is obvious when zero subjects exist and after some subjects exist.
- The user sees how many more subjects are required before trying Next.

### Payment

Design:

- Separate system status from user action:
  - Fee card.
  - Payment method/status card.
  - Primary action.
  - Troubleshooting/help.
- Pending state should read as "checking confirmation" rather than disabled failure.

Implementation:

- Update `PaymentStep.tsx`.
- Add `PaymentStatusPanel`.
- Add explicit support copy for test/non-production if applicable.

Acceptance criteria:

- A pending payment state has a visible "Check status" action and explanatory copy.
- Failed payment has retry and support contact.
- Disabled Pay Now always has a nearby reason.

### Submit

Design:

- Review should be a compact summary first, details expandable.
- Readiness list should be first and actionable.
- Subjects list can collapse after 5+ items on mobile.

Implementation:

- Update `SubmitStep.tsx`.
- Add collapsible sections for "Personal details", "Documents", "Subjects".

Acceptance criteria:

- User can identify blocking items in under 5 seconds.
- Confirmation checkbox remains close to final submit button.

## Visual Direction

Keep the existing MIHAS style but tighten it:

- Use `SectionCard` as the primary card container for student pages.
- Use one elevation scale: border plus subtle shadow, not multiple shadow strengths.
- Use semantic statuses consistently:
  - Primary: start/continue.
  - Warning: payment/draft attention.
  - Success: approved/completed.
  - Destructive: delete/rejected only.
- Use less animation on mobile. Keep meaningful transitions only.
- Prefer compact status chips and clear headings over decorative gradients.

## Accessibility Requirements

- All touch targets at least 44x44.
- No icon-only actions without `aria-label`.
- Focus remains visible.
- Wizard step changes update aria-live.
- Validation errors remain linked to fields.
- Bottom sheets and drawers retain focus trap and Escape close.
- Motion respects reduced-motion.
- Download/email status remains announced via `aria-live`.

## Performance Requirements

- Do not add large UI libraries.
- Keep route-level code splitting.
- Avoid rendering hidden desktop support panels with expensive child effects on mobile if not needed.
- Avoid layout shifts in dashboard metrics and application cards.

