# MIHAS Application Wizard — Deep UX Audit

**Auditor:** Kiro UX Audit Agent  
**Date:** 2026-04-25  
**Scope:** All 10 wizard files — shell, 4 steps, config, success screen, location fields, readiness checker, types  
**Context:** Zambian health sciences institute. Students on 320px–414px phones, slow/intermittent connections, often first-time applicants.

---

## Executive Summary

The wizard is **well-engineered for a production admissions system**. It has auto-save, draft restoration, OCR grade extraction, mobile money payment, browser back/forward support, keyboard shortcuts, aria-live announcements, and a structured readiness checker. These are not trivial — most admissions portals lack half of this.

That said, there are **real UX gaps that will cause friction for the target audience**: missing `autocomplete` attributes on critical fields (phone, name, email, DOB), no `inputMode` hints for mobile keyboards, no focus management on step transitions, a sticky footer that can obscure content on small screens, and several accessibility gaps that screen readers will stumble on.

The audit below is **brutally specific**. Every item has a file, line range, and exact fix.

---

## P0: Broken or Severely Degraded UX (Fix Immediately)

### P0-1. Phone field missing `type="tel"` and `inputMode="tel"` — wrong keyboard on mobile

**File:** `steps/BasicKycStep.tsx`, lines 133–140  
**Impact:** On every mobile phone in Zambia, the phone field opens a full QWERTY keyboard instead of the numeric dialer. This is the #1 mobile form friction for the target audience.

```tsx
// Current (line 133):
<AnimatedInput
  {...register('phone')}
  label="Phone Number *"
  placeholder="e.g., +260971234567"
  ...
/>

// Fix — add type and inputMode:
<AnimatedInput
  type="tel"
  inputMode="tel"
  {...register('phone')}
  label="Phone Number *"
  placeholder="e.g., +260971234567"
  ...
/>
```

Also applies to **Next of Kin Phone** at line 181:
```tsx
<AnimatedInput
  type="tel"
  inputMode="tel"
  {...register('next_of_kin_phone')}
  ...
/>
```

### P0-2. Missing `autocomplete` attributes on all critical fields — no autofill on mobile

**File:** `steps/BasicKycStep.tsx`  
**Impact:** Mobile browsers (Chrome, Samsung Internet) cannot autofill name, email, phone, or DOB. Students must type everything manually on a 5-inch screen. This alone can add 3–5 minutes to the form.

| Line | Field | Missing `autoComplete` value |
|------|-------|------------------------------|
| 89 | `full_name` | `"name"` |
| 120 | `date_of_birth` | `"bday"` |
| 133 | `phone` | `"tel"` |
| 164 | `email` | `"email"` |
| 181 | `next_of_kin_phone` | `"tel"` |

Fix example for full_name (line 89):
```tsx
<AnimatedInput
  {...register('full_name')}
  autoComplete="name"
  label="Full Name *"
  ...
/>
```

### P0-3. No focus management on step transitions — screen readers and keyboard users are lost

**File:** `index.tsx`, lines 155–160 (stepKey/stepDirection state updates)  
**Impact:** When a user clicks "Next Step", the page scrolls but focus stays on the now-invisible previous step's button. Screen reader users hear nothing about the new step. Keyboard users must Tab through the entire page to reach the new content.

**Fix:** After step transition, focus the new step's heading. Add a ref to each step's `<h2>` and focus it:

```tsx
// In index.tsx, after setStepKey(currentStepIndex) in the useEffect at ~line 155:
useEffect(() => {
  setStepKey(currentStepIndex)
  setValidationErrors([])
  // Focus the step heading after render
  requestAnimationFrame(() => {
    const heading = document.querySelector('[data-testid$="-step"] h2')
    if (heading instanceof HTMLElement) {
      heading.setAttribute('tabindex', '-1')
      heading.focus({ preventScroll: false })
    }
  })
}, [currentStepIndex])
```

### P0-4. Sticky bottom navigation bar obscures form fields on small screens

**File:** `index.tsx`, lines 350–370 (the sticky bottom bar)  
**Impact:** On 320px screens, the sticky footer with Previous/Next buttons is ~80px tall. When a student taps the last visible field, the mobile keyboard opens AND the sticky bar covers the field. The student cannot see what they're typing.

```tsx
// Current (line 350):
<div className="sticky bottom-0 z-10 -mx-4 border-t border-border/40 bg-background/80 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 backdrop-blur-xl sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
```

**Fix options (pick one):**
1. Add `scroll-padding-bottom: 120px` to the form container so focused fields scroll above the sticky bar
2. Make the bar non-sticky on mobile when the keyboard is open (detect via `visualViewport.resize` event)
3. Add bottom padding to the form content equal to the bar height:

```tsx
// Add to the form element at line 340:
<form ... className="space-y-6 lg:space-y-8 pb-24 sm:pb-0">
```

### P0-5. Date of birth field has no `max` attribute — students can select future dates

**File:** `steps/BasicKycStep.tsx`, line 120  
**Impact:** The native date picker on mobile shows all dates including tomorrow. The Zod validation catches it on submit, but the error message ("must be at least 16 years old") appears only after the student has already moved on. Set `max` on the input to prevent invalid selection.

```tsx
// Fix:
<AnimatedInput
  type="date"
  max={new Date(new Date().getFullYear() - 16, new Date().getMonth(), new Date().getDate()).toISOString().split('T')[0]}
  {...register('date_of_birth')}
  label="Date of Birth *"
  ...
/>
```

---

## P1: Significant Friction Points (Fix Before Launch)

### P1-1. Grade subject/grade selects have no `aria-required` and no error states

**File:** `steps/EducationStep.tsx`, lines 175–200 (CanonicalSelect usage)  
**Impact:** When a student adds a subject row but doesn't select a subject or grade, there's no inline error. The error only appears as a generic "Minimum 5 subjects required" at the top. Screen readers don't announce which row is incomplete.

**Fix:** Add `aria-required="true"` to both CanonicalSelect instances and show inline validation when subject_id is empty but grade is set (or vice versa):

```tsx
<CanonicalSelect
  value={grade.subject_id}
  onChange={(value) => updateGrade(index, 'subject_id', value)}
  options={getSubjectOptions(grade.subject_id)}
  placeholder={subjects.length === 0 ? 'Loading subjects...' : 'Select subject'}
  aria-label={`Subject ${index + 1}`}
  aria-required="true"
  aria-invalid={!grade.subject_id && grade.grade > 0 ? 'true' : undefined}
/>
```

### P1-2. No `inputMode="numeric"` on the mobile money phone input

**File:** `components/student/PaymentForm.tsx`, line 233  
**Impact:** The phone input in the payment form correctly has `type="tel"` and `inputMode="tel"`, which is good. However, the `onChange` handler strips non-digits but the formatted display (`0977 123 456`) means the tel keyboard works. This is actually correct — **no change needed here**. ✅

### P1-3. Education step "Add Your First Subject" button is full-width on mobile but has no visual hierarchy

**File:** `steps/EducationStep.tsx`, lines 131–141  
**Impact:** When a student arrives at the education step with 0 subjects, the only call-to-action is a primary-colored button that says "+ Add Your First Subject". But it's placed next to the heading in a flex row, and on mobile it wraps below. The student may not realize they need to click it — it looks like a secondary action.

**Fix:** When `selectedGrades.length === 0`, show an empty state card with clear instructions:

```tsx
{selectedGrades.length === 0 && (
  <div className="rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-6 text-center">
    <GraduationCap className="mx-auto h-10 w-10 text-primary/50 mb-3" />
    <p className="text-sm font-medium text-foreground mb-1">No subjects added yet</p>
    <p className="text-xs text-muted-foreground mb-4">Add your Grade 12 subjects and grades. You need at least 5.</p>
    <Button type="button" onClick={addGrade} className="bg-primary hover:bg-primary min-h-[48px]">
      + Add Your First Subject
    </Button>
  </div>
)}
```

### P1-4. Wizard header section is too tall on mobile — pushes actual form content below the fold

**File:** `index.tsx`, lines 240–280 (the glass-panel hero section)  
**Impact:** On a 320px screen, the hero section with "A guided application experience that stays clear under pressure", the session panel, feature chips, and progress bar consume ~400px before the student sees any form field. The student must scroll past marketing copy to start filling in their application.

**Fix:** Collapse the hero section on mobile. Hide the description paragraph and session panel on small screens:

```tsx
// Line 258 — hide the description on mobile:
<p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base hidden sm:block">
  Every step is framed around what admissions actually needs...
</p>

// Line 262 — hide the session panel on mobile:
<div className="polished-panel p-5 sm:p-6 hidden lg:block">
```

### P1-5. No validation on blur for required fields — errors only appear on "Next Step" click

**File:** `steps/BasicKycStep.tsx` (all fields), `index.tsx` (validation logic)  
**Impact:** A student fills in 8 fields, clicks "Next Step", and THEN sees "Full name is required" at the top. They have to scroll back up to find the problem. On-blur validation would catch errors immediately.

**Fix:** The form uses `react-hook-form` with `register()`. Add `mode: 'onBlur'` to the form configuration in the wizard controller hook. This is likely in `hooks/useWizardController.ts`:

```tsx
const form = useForm<WizardFormData>({
  resolver: zodResolver(wizardSchema),
  mode: 'onBlur',        // ← Add this
  reValidateMode: 'onChange',  // ← And this for re-validation after first error
  ...
})
```

### P1-6. SubmitStep readiness checks are not linked to their respective wizard steps — no "go fix it" action

**File:** `steps/SubmitStep.tsx`, lines 140–175 (readinessChecks array)  
**Impact:** The review step shows "Result slip attached: Upload your result slip to complete this step" with a warning icon, but there's no button to jump back to the Education step. The student must manually click "Previous" twice.

**Fix:** Add a "Go to step" link for incomplete items:

```tsx
{!item.completed && (
  <button
    type="button"
    className="mt-1 text-xs font-medium text-primary underline"
    onClick={() => {
      // Map field to step index
      const stepMap: Record<string, number> = {
        full_name: 0, grades: 1, result_slip: 1, extra_kyc: 1, payment: 2
      }
      const targetStep = stepMap[item.field ?? '']
      if (targetStep !== undefined) goToStep(targetStep)
    }}
  >
    Go to this step →
  </button>
)}
```

Note: This requires passing `goToStep` as a prop to SubmitStep.

### P1-7. SubmissionSuccess page links are not spaced for mobile tap targets

**File:** `components/SubmissionSuccess.tsx`, lines 130–145  
**Impact:** The "Complete Payment Later", "Go to Dashboard", and "Track Application Status" buttons are stacked with `space-y-3` (12px gap). On mobile, this is barely enough to avoid accidental taps. The Link wrapping also means the Button doesn't fill the Link's click area.

**Fix:** Increase gap and ensure Links have proper sizing:

```tsx
// Line 130 — increase spacing:
<div className="space-y-4">
  {/* ... */}
  <Link to="/student/payment" className="block">
    <Button variant="outline" className="w-full min-h-[48px]">Complete Payment Later</Button>
  </Link>
  <Link to="/student/dashboard" className="block">
    <Button className="w-full min-h-[48px] bg-primary hover:bg-primary">Go to Dashboard</Button>
  </Link>
  <Link to="/track-application" className="block">
    <Button variant="outline" className="w-full min-h-[48px]">Track Application Status</Button>
  </Link>
</div>
```

### P1-8. PaymentStep "Pay Later" button is styled as a text link — easy to miss on mobile

**File:** `steps/PaymentStep.tsx`, lines 100–110  
**Impact:** The "Pay Later" option is a small underlined text link at the bottom of the payment section. On a 320px screen, students who can't pay right now may not see it and think they're stuck. This is a critical escape hatch for the Zambian context where mobile money balances fluctuate.

**Fix:** Make it more visible while keeping it secondary:

```tsx
// Replace the text link with a visible secondary button:
<button
  type="button"
  className="w-full rounded-xl border-2 border-dashed border-border bg-card/50 px-4 py-4 text-center transition-colors hover:border-primary/40 hover:bg-primary/5"
  disabled={deferring}
  onClick={handleDefer}
>
  <p className="text-sm font-medium text-foreground">Can't pay right now?</p>
  <p className="mt-1 text-xs text-muted-foreground">You can submit your application and pay later from your dashboard</p>
</button>
```

### P1-9. No `aria-describedby` linking error messages to grade rows in EducationStep

**File:** `steps/EducationStep.tsx`, lines 175–210  
**Impact:** When the wizard shows "Minimum 5 subjects required (3 added)", screen readers don't associate this error with the grade entry area. The error appears in the wizard-level error summary but has no programmatic link to the grade fieldset.

**Fix:** Add `aria-describedby` to the grades fieldset:

```tsx
// Line 127 — add id to the error count:
<h3 className="text-md font-medium text-foreground">
  Grade 12 Subjects (<span id="grade-count-status" className={...}>{selectedGrades.length}/5 minimum</span>)
</h3>

// Line 126 — add aria-describedby to the fieldset:
<fieldset className="border-none p-0 m-0" aria-describedby="grade-count-status">
```

### P1-10. ResidenceLocationFields suggestion buttons disappear on blur before click registers

**File:** `components/ResidenceLocationFields.tsx`, lines 50–65 (SuggestionButtons) and 100–130 (onBlur handlers)  
**Impact:** On mobile, tapping a suggestion button triggers the input's `onBlur` first, which sets `focusedField` to `null`, hiding the suggestions before the `onClick` fires. The `onMouseDown={e => e.preventDefault()}` on the buttons prevents this on desktop but **does not work reliably on mobile touch events**.

**Fix:** Add a small delay to the blur handler:

```tsx
// Line 115 — add delay to onBlur:
onBlur={event => {
  // Delay to allow suggestion button click to register on mobile
  setTimeout(() => {
    field.onChange(normalizeResidenceCountry(event.target.value))
    field.onBlur()
    setFocusedField(null)
  }, 150)
}}
```

Apply the same pattern to the `residence_town` onBlur at line 155.

### P1-11. Wizard shell has no offline/connection-lost indicator

**File:** `index.tsx` (entire file)  
**Impact:** When a Zambian student loses their mobile data connection mid-wizard, the auto-save silently fails. The `smartAutoSave.saveStatus` shows 'error' with a small text message, but there's no prominent banner telling the student "You're offline — your work is saved locally."

**Fix:** Add a connection status banner at the top of the wizard:

```tsx
// After the aria-live region (~line 240):
{smartAutoSave.saveStatus === 'offline' && (
  <Alert variant="warning" className="mb-4">
    <WifiOff className="h-4 w-4" />
    <AlertTitle>You appear to be offline</AlertTitle>
    <AlertDescription>
      Your progress is saved on this device. It will sync when your connection returns.
    </AlertDescription>
  </Alert>
)}
```

---

## P2: Polish Items (Nice to Have)

### P2-1. Step transition animation has no `prefers-reduced-motion` guard on the CSS class

**File:** `index.tsx`, line 338  
**Impact:** The `wizard-step-forward` / `wizard-step-backward` CSS classes likely include slide animations. Users with vestibular disorders who have enabled `prefers-reduced-motion` may still see them.

**Fix:** Wrap the animation class in the `shouldAnimate` check:

```tsx
<div key={stepKey} className={shouldAnimate ? (stepDirection === 'forward' ? 'wizard-step-forward' : 'wizard-step-backward') : ''}>
```

### P2-2. SubmissionSuccess confetti animation has no reduced-motion guard

**File:** `components/SubmissionSuccess.tsx`, lines 90–100  
**Impact:** The ping animation on the success checkmark and the confetti spans animate regardless of motion preferences.

**Fix:** Add `motion-safe:` prefix to the animations:

```tsx
// Line 93:
<div className="absolute inset-0 w-20 h-20 rounded-full bg-success/20 motion-safe:animate-ping" ... />

// Line 98 — wrap confetti in motion check:
<style>{`
  @media (prefers-reduced-motion: no-preference) {
    @keyframes confetti-fall { ... }
  }
`}</style>
```

### P2-3. "Back to Dashboard" link at top of wizard has small touch target

**File:** `index.tsx`, line 245  
**Impact:** The `feature-chip` class link is likely smaller than 44x44px. On mobile, it's hard to tap.

**Fix:**

```tsx
<Link
  to="/student/dashboard"
  className="feature-chip inline-flex items-center min-h-[44px] px-3"
>
```

### P2-4. Education step grade rows lack visual numbering on mobile

**File:** `steps/EducationStep.tsx`, lines 170–210  
**Impact:** On mobile, the column headers ("Subject", "Grade", "Action") are hidden (`hidden sm:grid`). Each grade row shows a subject select, grade select, and remove button, but there's no visual indicator of which row number it is. With 7+ subjects, students lose track.

**Fix:** Add a row number badge on mobile:

```tsx
// Inside the grade row div, before the subject select:
<span className="sm:hidden text-xs font-bold text-muted-foreground bg-muted rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0">
  {index + 1}
</span>
```

### P2-5. PaymentForm method selection cards don't indicate which is recommended

**File:** `components/student/PaymentForm.tsx`, lines 195–230  
**Impact:** Mobile money is the primary payment method for Zambian students, but both cards look equally weighted. A "Recommended" badge on mobile money would reduce decision paralysis.

**Fix:**

```tsx
// Inside the mobile money button, after the icon div:
<span className="absolute -top-2 left-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">
  Recommended
</span>
```

### P2-6. SubmitStep AI summary loading state shows spinner below the fallback text — confusing

**File:** `steps/SubmitStep.tsx`, lines 115–130  
**Impact:** The fallback summary renders immediately, then a spinner appears below it saying "Personalizing your preview…". When the AI summary loads, the text changes. This creates a jarring content shift.

**Fix:** Show a subtle shimmer overlay on the fallback text while AI is loading, rather than a separate spinner:

```tsx
<p className={cn("mt-1.5 text-sm leading-relaxed text-foreground", aiLoading && "animate-pulse")} role="status">
  {aiSummary || fallbackSummary}
</p>
// Remove the separate aiLoading spinner div
```

### P2-7. Wizard readiness checker doesn't validate email format — only checks non-empty

**File:** `lib/wizardReadiness.ts`, line 72  
**Impact:** `isCompleteValue(values.email)` returns true for "asdf" — the readiness bar shows email as complete even though Zod will reject it on submit.

**Fix:** Add a basic email format check:

```tsx
createItem('basicKyc', 'email', 'Email', 
  isCompleteValue(values.email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email)),
  'Enter a valid email address.'
),
```

### P2-8. SubmissionSuccess slip generation overlay has no focus trap

**File:** `components/SubmissionSuccess.tsx`, lines 70–85  
**Impact:** The modal overlay for slip generation has `role="dialog"` and `aria-modal="true"` but no focus trap. Keyboard users can Tab behind the overlay.

**Fix:** Use a focus-trap library or add manual focus trapping:

```tsx
// Add useEffect to trap focus when overlay is visible:
useEffect(() => {
  if (persistingSlip || slipLoading) {
    const dialog = document.querySelector('[role="dialog"]')
    const closeBtn = dialog?.querySelector('button')
    closeBtn?.focus()
  }
}, [persistingSlip, slipLoading])
```

### P2-9. Education step file upload cards don't show file type icons for already-uploaded files

**File:** `steps/EducationStep.tsx`, lines 220–260  
**Impact:** When a student returns to the education step and their files are already uploaded (from a previous session), the upload cards show "Uploaded" badge but the FileUpload component shows the default drop zone, not a preview. The `preview` prop is only set when `uploadedFiles.result_slip` is true AND the file object exists locally.

**Fix:** Show a "Previously uploaded" state when `uploadedFiles.result_slip` is true but `resultSlipFile` is null:

```tsx
{!resultSlipFile && uploadedFiles.result_slip && (
  <div className="flex items-center gap-2 text-sm text-success">
    <CheckCircle className="h-4 w-4" />
    <span>Previously uploaded — select a new file to replace</span>
  </div>
)}
```

### P2-10. Keyboard shortcuts (Ctrl+Arrow) are not discoverable on mobile

**File:** `index.tsx`, lines 220–240 (keyboard shortcut handler), `components/KeyboardShortcutsHelp.tsx`  
**Impact:** The keyboard shortcuts help component exists but is only useful for desktop users. On mobile, it takes up space without value.

**Fix:** Hide `KeyboardShortcutsHelp` on mobile:

```tsx
<div className="hidden md:block">
  <KeyboardShortcutsHelp />
</div>
```

### P2-11. NRC number field has no input mask or format hint beyond placeholder

**File:** `steps/BasicKycStep.tsx`, line 96  
**Impact:** The placeholder says "e.g., 123456/78/9" but students may type "12345678/9" or "123456789". There's no real-time formatting or validation feedback until form submission.

**Fix:** Add a pattern hint and `inputMode="numeric"`:

```tsx
<AnimatedInput
  {...register('nrc_number')}
  label="NRC Number"
  placeholder="e.g., 123456/78/9"
  inputMode="text"
  pattern="[0-9/]+"
  error={errors.nrc_number?.message}
  helperText="Format: 123456/78/9. Either NRC or Passport is required."
  ...
/>
```

### P2-12. Program and Intake selects have tall `min-h-[56px]` but no loading skeleton

**File:** `steps/BasicKycStep.tsx`, lines 195–230  
**Impact:** When programs are loading (`programsLoading` is true), the select shows "Select programme" in a 56px-tall box. There's no visual indication that data is loading. The `disabled` state just grays it out.

**Fix:** Show a skeleton when loading:

```tsx
{programsLoading ? (
  <Skeleton className="h-14 w-full rounded-xl" />
) : (
  <FormSelect name="program" ... />
)}
```

---

## File-by-File Summary

| File | Grade | Key Issues |
|------|-------|------------|
| `index.tsx` (wizard shell) | B+ | Excellent auto-save, keyboard shortcuts, aria-live. Missing: focus management on step change, sticky bar obscures fields, no offline banner. |
| `BasicKycStep.tsx` | C+ | Clean layout, good field organization. Missing: `autocomplete` on ALL fields, `type="tel"` on phone, `max` on date, no on-blur validation. |
| `EducationStep.tsx` | B | Good OCR integration, mobile-aware grade rows. Missing: empty state for 0 subjects, no inline grade row validation, no `aria-describedby` on grade fieldset. |
| `PaymentStep.tsx` | B+ | Excellent fee display, defer flow, mobile money. Missing: "Pay Later" is too subtle, no loading skeleton for fee. |
| `SubmitStep.tsx` | B | Good readiness checklist, AI summary. Missing: no "go fix it" links, AI loading causes content shift. |
| `config.ts` | A | Clean, well-typed step configuration. No issues. |
| `SubmissionSuccess.tsx` | B- | Celebratory UX is nice. Missing: no focus trap on slip overlay, no reduced-motion guard on confetti, button spacing too tight. |
| `ResidenceLocationFields.tsx` | B | Good suggestion buttons, proper `autoComplete`. Missing: blur-before-click race condition on mobile. |
| `wizardReadiness.ts` | A- | Thorough readiness model. Minor: email validation is too permissive (non-empty = complete). |
| `types.ts` | A | Solid Zod schema with good validation messages. Phone normalization is correct. |

---

## Priority Matrix

| Priority | Count | Effort | Impact |
|----------|-------|--------|--------|
| P0 | 5 | Low–Medium | High — these cause real data entry failures on mobile |
| P1 | 11 | Medium | Medium–High — these cause friction and confusion |
| P2 | 12 | Low–Medium | Low–Medium — polish and edge cases |

**Recommended fix order:**
1. P0-1 + P0-2 (phone type + autocomplete) — 15 minutes, massive mobile improvement
2. P0-4 (sticky bar padding) — 5 minutes, prevents field obscuring
3. P0-3 (focus management) — 30 minutes, critical for accessibility
4. P0-5 (date max) — 5 minutes, prevents invalid input
5. P1-5 (on-blur validation) — 10 minutes if form mode change works cleanly
6. P1-4 (hero section collapse on mobile) — 10 minutes, immediate scroll reduction
7. P1-8 (Pay Later visibility) — 15 minutes, critical for Zambian payment context
8. P1-10 (suggestion blur race) — 10 minutes, prevents lost taps
9. Everything else in P1, then P2

---

## What's Already Good (Don't Break These)

- **Auto-save with smart dirty detection** — this is production-grade
- **Browser back/forward support** with `pushState` — rare in wizard UIs
- **OCR grade extraction** with graceful fallback messaging
- **Mobile money as primary payment** with operator auto-detection
- **Aria-live announcements** on step transitions
- **Keyboard shortcuts** (Ctrl+Arrow, Ctrl+S, Escape)
- **Draft restoration** across sessions
- **Structured readiness checker** with per-step progress
- **Touch-optimized checkbox** (44x44px touch target)
- **EnhancedProgressIndicator** with separate mobile/desktop layouts
- **Error boundary** wrapping the entire wizard
- **Idempotent submission** (backend-enforced)
- **Payment polling** with auto-advance on success
- **Confetti celebration** on successful submission (delightful)

These represent significant engineering investment and should be preserved through any fixes.
