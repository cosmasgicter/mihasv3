# Student-Facing Pages UX Audit

**Date:** 2026-04-25
**Auditor:** Kiro UX Audit Agent
**Target users:** Zambian students on 320px–414px mobile phones with slow/unstable connections
**Files audited:** 12 pages across auth, public, and student-authenticated surfaces

---

## Executive Summary

The codebase is significantly above average for an early-stage admissions platform. Touch targets are consistently 44px+, loading skeletons exist on most pages, error states use a shared `ErrorDisplay` primitive, and dirty-state protection is implemented on Settings. However, there are real problems that will hurt students on cheap Android phones over 3G in Zambia:

1. **The Dashboard is a wall of content** — too many sections, too much copy, no progressive disclosure on mobile.
2. **Dialogs are hand-rolled without focus trapping** — keyboard and screen reader users can tab behind modals.
3. **Interview page uses manual state management instead of React Query** — no cache, no stale-while-revalidate, no background refresh.
4. **Contact form doesn't actually send anything** — it opens a `mailto:` link, which fails silently on phones without a configured email app.
5. **Payment page has no offline/retry resilience** — a failed mobile money initiation on a flaky connection gives no recovery path.

---

## P0 — Broken or Severely Degraded

### P0-1: ApplicationStatus withdrawal/enrollment dialogs lack focus trap and Escape-close on overlay click

**File:** `apps/admissions/src/pages/student/ApplicationStatus.tsx` (lines ~580–650)
**What:** The withdrawal and enrollment confirmation dialogs are hand-rolled `<div>` overlays. They handle `Escape` via `onKeyDown` on the backdrop, but:
- No focus trap — users can Tab into content behind the modal.
- Clicking the backdrop does not close the dialog (only Escape does).
- `tabIndex={-1}` on the dialog div is not sufficient for screen readers to announce it as a modal.
- No `aria-describedby` linking the dialog description to the modal.

**Why it matters:** A student on a screen reader will not know a modal opened. A keyboard-only user can tab to the "Clear All Drafts" button behind the modal and trigger it. On mobile, tapping outside the dialog does nothing — students will think the app froze.

**Fix:** Replace with the existing `Dialog`/`ConfirmAlertDialog` primitives already in the codebase (used on Dashboard for draft clearing). These use Radix UI with proper focus trap, overlay dismiss, and ARIA.

---

### P0-2: Interview page uses manual `useState` data fetching — no cache, no background refresh, no stale-while-revalidate

**File:** `apps/admissions/src/pages/student/Interview.tsx`
**What:** The page uses `useState` + `useCallback` + `useEffect` for data fetching instead of React Query. This means:
- No cached data on revisit — full loading spinner every time.
- No background refetch when the tab regains focus.
- No stale-while-revalidate — students see a blank screen while waiting.
- No retry on transient network failure.

**Why it matters:** A student on a slow Zambian 3G connection navigates to the interview page, sees a spinner, the request times out, and they see an error with no cached fallback. They go back to dashboard, come back, and wait again from scratch. Every other data-fetching page uses React Query.

**Fix:** Convert to `useQuery` with the same `CACHE_CONFIG.applications` pattern used by `ApplicationStatus` and `Payment`. Add `staleTime: 60_000` and `retry: 2`.

---

### P0-3: Contact form `mailto:` link fails silently on phones without email app

**File:** `apps/admissions/src/pages/ContactPage.tsx`
**What:** The form's "submit" action builds a `mailto:` URL and shows a "draft ready" state with an "Open Email App" button. On many cheap Android phones used by Zambian students:
- No email app is configured (they use WhatsApp/SMS).
- Clicking the `mailto:` link does nothing — no error, no feedback.
- The form data is lost because it was never sent anywhere.

**Why it matters:** A student fills out a contact form, clicks "Prepare Email Draft", clicks "Open Email App", and nothing happens. They have no idea their message wasn't sent. The fallback text ("If no email app is available, use the contact details shown on this page") is easy to miss.

**Fix:** Add a WhatsApp link as the primary CTA (WhatsApp is ubiquitous in Zambia). Format: `https://wa.me/260961515151?text=...`. Keep mailto as secondary. Consider adding a server-side contact form endpoint that actually sends the message.

---

### P0-4: Dashboard loads 3+ parallel API calls with no request deduplication guard on rapid remounts

**File:** `apps/admissions/src/pages/student/Dashboard.tsx`
**What:** `loadDashboardData` fires on mount via `useEffect`, but also via multiple event listeners (`applicationSubmitted`, `applicationUpdated`, `applicationCreated`, `draftSaved`, `draftCleared`). The `scheduleDashboardReload` debounce is only 150ms. On slow connections:
- Multiple overlapping requests can fire before the first completes.
- The `abortControllerRef` cancels the previous request, but the UI flickers between loading states.
- `Promise.allSettled` means partial data can render while other calls are still in flight.

**Why it matters:** Student submits an application → `applicationSubmitted` event fires → dashboard reloads → polling also triggers → two concurrent loads fight. On 3G this causes visible flicker and wasted bandwidth.

**Fix:** Increase debounce to 500ms. Add a `loadingRef` guard that skips re-entry if a load is already in progress. Consider migrating the entire dashboard data layer to React Query (like Payment and ApplicationStatus already do) to get automatic deduplication.

---

## P1 — Significant Friction

### P1-1: Dashboard is overwhelming on mobile — 7+ sections with no progressive disclosure

**File:** `apps/admissions/src/pages/student/Dashboard.tsx`
**What:** On a 375px screen, the dashboard renders in order:
1. PageShell header with 4 metrics
2. Refresh progress bar
3. Glass panel with feature chips + description paragraph
4. "Today's readiness" panel
5. StudentNextActionCard
6. ContinueApplication
7. DashboardStatusOverview (4 metric cards + latest status + payment alert)
8. "My applications" section
9. Profile summary sidebar
10. Upcoming deadlines sidebar
11. ApplicationTimeline
12. QuickActions

That's 12 distinct content blocks before the student even sees their application list. On mobile, the sidebar stacks below the main content, pushing applications even further down.

**Why it matters:** A student opens the dashboard to check their application status. They have to scroll through ~4 screens of motivational copy, feature chips, and readiness panels before finding their actual application. On a slow phone, this is 3-5 seconds of scrolling.

**Fix:** 
- Move "My applications" to position 2 (right after the header).
- Collapse the glass panel, readiness panel, and feature chips into a single compact "What's next" card.
- Make DashboardStatusOverview collapsible or move it below applications.
- Consider a mobile-specific layout that prioritizes actionable content.

---

### P1-2: DashboardStatusOverview animation classes cause invisible content on slow devices

**File:** `apps/admissions/src/components/student/DashboardStatusOverview.tsx`
**What:** Every metric card and section uses `opacity-0` as an initial class with `animateClasses.slideUp`:
```tsx
className={`${animateClasses.slideUp} opacity-0`}
```
If the CSS animation doesn't fire (JS error, slow paint, reduced motion), the content stays invisible forever. The `staggerChild` inline styles add animation delays up to 600ms+.

**Why it matters:** On a low-end phone where the animation keyframes haven't loaded yet, the student sees blank space where their application stats should be. The `opacity-0` class is the default state — it requires the animation to make content visible.

**Fix:** Use `animate-in` patterns that start visible and enhance with animation, or add a `motion-safe:` prefix so reduced-motion users see content immediately. Better: remove `opacity-0` from the initial class and use `animation-fill-mode: backwards` in the keyframe definition.

---

### P1-3: Payment page has no offline/retry UX for mobile money initiation

**File:** `apps/admissions/src/pages/student/Payment.tsx`
**What:** The `PaymentForm` component is embedded inline, but there's no visible retry mechanism if the mobile money initiation fails mid-request. The `onPaymentRefresh` callback refetches data, but if the network is down:
- No "You appear to be offline" banner.
- No "Retry payment" button after a network error.
- The `PaymentForm` component's error handling is opaque from this page's perspective.

**Why it matters:** Mobile money payments in Zambia frequently fail due to network issues. A student initiates payment, the request hangs, they close the app, come back, and don't know if the payment went through. The polling mechanism (`usePaymentStatus`) helps, but only if the initial request succeeded.

**Fix:** Add `navigator.onLine` detection with a banner. Show explicit "Payment may still be processing — we'll check automatically" message after timeout. Add a manual "Check payment status" button that's always visible.

---

### P1-4: Settings page has no loading skeleton — blank page while profile loads

**File:** `apps/admissions/src/pages/student/Settings.tsx`
**What:** The page renders the form immediately with empty default values, then hydrates from `profile` and `metadata` via `useEffect`. There's no loading state — the form fields flash from empty to populated.

**Why it matters:** Student opens Settings, sees empty fields, thinks their data is lost, starts typing, then the `useEffect` fires and overwrites their input with the loaded profile data. The `hasHydratedInitialValues` ref prevents this after first load, but the initial flash is confusing.

**Fix:** Add a loading skeleton (like Dashboard and Payment have) that shows until `profile` is loaded. Gate the form render on `profile !== undefined`.

---

### P1-5: ApplicationStatus page loads full application detail on every visit — no list-to-detail cache sharing

**File:** `apps/admissions/src/pages/student/ApplicationStatus.tsx`
**What:** The page uses `useQuery(['application-status', id])` which is a separate cache key from the dashboard's application list. Every navigation from dashboard to status page triggers a fresh API call, even though the dashboard already has the application data.

**Why it matters:** Student taps an application on the dashboard → full loading skeleton → waits for API → sees the same data they just saw. On 3G, this is 2-4 seconds of unnecessary waiting.

**Fix:** Use `initialData` or `placeholderData` from the dashboard's cached application list. The dashboard already has `applications` in state — pass it via React Query's `queryClient.getQueryData(['payment-applications'])` or use route state.

---

### P1-6: Tracker page search has no debounce — every keystroke could trigger a search on Enter

**File:** `apps/admissions/src/pages/public/tracker/index.tsx`
**What:** The search is triggered by Enter key or button click (good), but the `handlePaste` handler strips characters with a regex that could confuse students:
```tsx
const sanitized = pasted.replace(/[^a-zA-Z0-9\-_]/g, '').trim()
```
If a student copies "APP-20260101-ABCD1234 " (with trailing space or newline), the space is stripped silently. But if they copy from a PDF with special characters, the code gets mangled with no feedback.

**Why it matters:** Students receive tracking codes via SMS or email. Copy-paste is the primary input method. Silent character stripping without feedback causes "Application not found" errors that the student can't diagnose.

**Fix:** Show a brief toast or inline hint when characters are stripped: "We cleaned up your tracking code — some special characters were removed."

---

### P1-7: Landing page hero loads a WebP image with no `<img>` fallback for older Android browsers

**File:** `apps/admissions/src/pages/LandingPage.tsx`
**What:** The hero proof panel specifies:
```tsx
image: {
  src: '/images/programs/mihas-campus.webp',
  ...
}
```
The `ShapeLandingHero` component receives this, but if it renders a raw `<img>` without `<picture>` + JPEG fallback, older Android WebView browsers (common on cheap phones in Zambia) will show a broken image.

**Why it matters:** The hero image is the first visual impression. A broken image on the landing page signals "this site doesn't work on my phone."

**Fix:** Verify `ShapeLandingHero` uses `OptimizedImage` (which has `onError` fallback per project conventions). If not, add a `<picture>` element with JPEG fallback, or use the `OptimizedImage` component.

---

### P1-8: SignUp page has no password strength indicator

**File:** `apps/admissions/src/pages/auth/SignUpPage.tsx`
**What:** Password validation is `min(6)` only. No strength meter, no requirements list, no feedback on what makes a good password. The `PasswordInput` component has show/hide toggle but no strength visualization.

**Why it matters:** Students create weak passwords, get locked out, and contact support. A simple strength bar with "weak/fair/strong" reduces support burden and improves security.

**Fix:** Add a password strength indicator below the password field. Even a simple "6+ characters ✓ | Has number ✓ | Has uppercase ✓" checklist would help.

---

### P1-9: ApplicationStatus amendment form has no character count or field-specific validation

**File:** `apps/admissions/src/pages/student/ApplicationStatus.tsx` (amendment section)
**What:** The amendment form has three fields (field selector, new value, reason) with only "All fields are required" validation. No character limits shown, no field-specific validation (e.g., phone format for phone field, email format for email field).

**Why it matters:** Student selects "Phone" as the field to amend, types "my new number is 0961234567" in the value field (instead of just the number), submits, and the backend rejects it. No guidance on expected format.

**Fix:** Show placeholder text that matches the selected field type. Add field-specific validation: if `amendField === 'phone'`, validate as phone number. Show character count for the reason field.

---

### P1-10: Interview page "Join Meeting" button has no pre-join guidance

**File:** `apps/admissions/src/pages/student/Interview.tsx`
**What:** The "Join Meeting" button opens the meeting link in a new tab with no preparation guidance. Students on mobile may not have Zoom/Teams installed.

**Why it matters:** Student taps "Join Meeting" → browser opens Zoom link → Zoom app not installed → confusing app store redirect → student misses interview.

**Fix:** Add a brief pre-join checklist: "Make sure you have [Zoom/Teams] installed. Test your camera and microphone. Join 5 minutes early." Show this as expandable content near the Join button.

---

## P2 — Polish

### P2-1: Dashboard "feature chips" are decorative noise on mobile

**File:** `apps/admissions/src/pages/student/Dashboard.tsx`
**What:** Multiple sections have `<span className="feature-chip">` elements like "Application command center", "Live timeline cues", "Decision-ready status tracking". These are marketing copy, not functional UI.

**Why it matters:** On a 320px screen, these chips wrap to 2-3 lines and push actual content down. They add no information value for a student who's already signed in.

**Fix:** Hide feature chips on mobile with `hidden sm:flex` or remove them from authenticated pages entirely. They belong on the landing page, not the dashboard.

---

### P2-2: Dashboard glass-panel description paragraphs are too long for mobile

**File:** `apps/admissions/src/pages/student/Dashboard.tsx`
**What:** The glass panel contains:
> "This dashboard is designed to keep the next step obvious: continue a draft, settle a payment issue, prepare for an interview, or review the latest admissions decision without hunting through menus."

This is 40+ words of explanatory copy that a returning student doesn't need.

**Why it matters:** Wastes vertical space on every visit. Students who've used the dashboard once don't need the explanation again.

**Fix:** Show this copy only on first visit (localStorage flag) or collapse it behind a "Learn more" toggle. On mobile, remove it entirely.

---

### P2-3: ApplicationStatus page has redundant "Back to dashboard" links

**File:** `apps/admissions/src/pages/student/ApplicationStatus.tsx`
**What:** There are three ways to go back to the dashboard:
1. `feature-chip` link at the top of the content area
2. "Back to dashboard" button in the "Next actions" sidebar card
3. Browser back button

**Why it matters:** Minor clutter, but the sidebar "Back to dashboard" ghost button takes up a full-width row in the actions card on mobile.

**Fix:** Keep only the top breadcrumb-style link. Remove the sidebar duplicate.

---

### P2-4: Payment page info card is redundant with the page header

**File:** `apps/admissions/src/pages/student/Payment.tsx`
**What:** The PageShell already has title "Application Payment" and subtitle "View payment history and complete outstanding application fees." Then there's a separate Card with:
- "Application Fee" title
- "Payment is handled securely via the Lenco payment gateway" description
- "Pay outstanding fees directly from this page" inner card

This is three levels of the same message.

**Why it matters:** On mobile, the info card pushes the actual application payment cards below the fold.

**Fix:** Remove the info card. The PageShell header already communicates the purpose. Move the "Pay outstanding fees directly" hint into the PageShell subtitle.

---

### P2-5: Settings page notification section is read-only display of obvious information

**File:** `apps/admissions/src/pages/student/Settings.tsx`
**What:** The "Notification delivery" section shows three cards:
- "Delivery phone: [phone number]"
- "In-app inbox: Always available in the portal"
- "Channel controls: SMS delivery settings"

The second and third cards are static text that never changes.

**Why it matters:** Takes up vertical space on mobile with no actionable information.

**Fix:** Collapse into a single line: "Notifications are sent to [phone] and your portal inbox. [Manage preferences →]"

---

### P2-6: ForgotPassword success state has unnecessary icon animation

**File:** `apps/admissions/src/pages/auth/ForgotPasswordPage.tsx`
**What:** The success state uses `animateClasses.scaleIn` on both the icon container and the icon itself — double animation on the same element.

**Why it matters:** Minor visual jank on low-end devices. The scale animation on a 16x16 icon is imperceptible anyway.

**Fix:** Remove the inner `animateClasses.scaleIn` on the icon. Keep only the outer container animation.

---

### P2-7: SignIn page "You'll stay signed in for 7 days" text has no visual hierarchy

**File:** `apps/admissions/src/pages/auth/SignInPage.tsx`
**What:** The text `"You'll stay signed in for 7 days"` appears as `text-xs text-muted-foreground text-center mt-4` below the submit button. It's useful information but looks like an afterthought.

**Why it matters:** Students on shared devices need to know this. It should be slightly more prominent.

**Fix:** Move it inside the fieldset or add a small lock icon. Consider: "🔒 You'll stay signed in for 7 days on this device."

---

### P2-8: Tracker page has excessive decorative panels for a utility page

**File:** `apps/admissions/src/pages/public/tracker/index.tsx`
**What:** The tracker page has:
- A glass-panel with PageHeader
- Feature chips ("No sign-in required", "Live status visibility", "Slip download and sharing")
- A description paragraph
- A "polished-panel" with "Best input" guidance
- Then the actual search input

A student just wants to paste their tracking code and see the result.

**Why it matters:** On mobile, the search input is below the fold. The student has to scroll past marketing copy to find the one thing they came for.

**Fix:** Put the search input at the top, immediately visible. Move the explanatory content below the search results area.

---

### P2-9: Interview page help card email link has no `min-h-[44px]` touch target

**File:** `apps/admissions/src/pages/student/Interview.tsx`
**What:** The "Contact the admissions office at admissions@mihas.edu.zm" link is an inline `<a>` with no minimum touch target sizing.

**Why it matters:** On mobile, the email link is a small text target that's hard to tap accurately.

**Fix:** Wrap in a Button or add `inline-flex items-center min-h-[44px]` to the link.

---

### P2-10: DashboardStatusOverview "Total Applications" uses AlertCircle icon — misleading

**File:** `apps/admissions/src/components/student/DashboardStatusOverview.tsx`
**What:** The "Total Applications" metric card uses `<AlertCircle>` as its icon, which visually suggests a warning or error. But it's just a count of all applications.

**Why it matters:** Students may think something is wrong when they see the alert icon next to their total count.

**Fix:** Use `<FileText>` or `<BarChart3>` instead — something neutral that represents a count.

---

### P2-11: Landing page deferred hydration delay (450ms) adds perceived latency

**File:** `apps/admissions/src/pages/LandingPage.tsx`
**What:** `useDeferredHydration(true, 450)` delays rendering of below-fold sections by 450ms. During this time, the skeleton fallback shows. On fast connections, this is unnecessary artificial delay.

**Why it matters:** On a fast connection, the student sees skeleton placeholders for half a second when the real content could render immediately.

**Fix:** Reduce to 150ms or use `requestIdleCallback` instead of a fixed timeout. The skeleton fallback is good — the delay just needs to be shorter.

---

### P2-12: SignUp page success state redirect timer (350ms) is fragile

**File:** `apps/admissions/src/pages/auth/SignUpPage.tsx`
**What:** After successful signup, a 350ms `setTimeout` navigates to the dashboard. If the navigation is slow or the component unmounts, the redirect may not fire. The cleanup in `useEffect` clears the timer on unmount.

**Why it matters:** Edge case: if React strict mode double-mounts in dev, or if the auth state update triggers a re-render that unmounts the component, the redirect is lost. The "Open dashboard" link is a good fallback, but the auto-redirect should be more robust.

**Fix:** Use `navigate` in the `onSuccess` callback directly instead of a timer. The success UI can still flash briefly via a `useEffect` that navigates after paint.

---

## Summary by Page

| Page | P0 | P1 | P2 | Overall |
|------|----|----|----|----|
| Dashboard | 1 | 1 | 2 | Functional but overwhelming on mobile |
| DashboardStatusOverview | 0 | 1 | 1 | Animation-dependent visibility is risky |
| ApplicationStatus | 1 | 2 | 1 | Dialogs need focus trap; amendment form needs validation |
| Payment | 0 | 1 | 1 | No offline resilience for mobile money |
| Settings | 0 | 1 | 1 | Missing loading skeleton; notification section is noise |
| Interview | 1 | 1 | 1 | Manual state management; no cache; no pre-join guidance |
| LandingPage | 0 | 1 | 1 | WebP-only hero image; deferred hydration delay |
| ContactPage | 1 | 0 | 0 | mailto: fails silently on most student phones |
| Tracker | 0 | 1 | 1 | Search input buried below marketing copy |
| SignInPage | 0 | 0 | 1 | Solid — minor polish only |
| SignUpPage | 0 | 1 | 1 | No password strength indicator |
| ForgotPasswordPage | 0 | 0 | 1 | Clean — minor animation redundancy |

**Totals: 4 P0, 10 P1, 12 P2**

---

## Recommended Fix Order

1. **P0-1** — Replace hand-rolled dialogs with Radix-based `ConfirmAlertDialog` (1 hour)
2. **P0-2** — Convert Interview page to React Query (1 hour)
3. **P0-3** — Add WhatsApp CTA to Contact page (30 min)
4. **P0-4** — Add loading guard to Dashboard data fetching (1 hour)
5. **P1-1** — Restructure Dashboard mobile layout (2 hours)
6. **P1-2** — Fix animation opacity-0 pattern (1 hour)
7. **P1-3** — Add offline detection to Payment page (1 hour)
8. **P1-4** — Add loading skeleton to Settings page (30 min)
9. **P1-5** — Add cache sharing for ApplicationStatus (1 hour)
10. **P1-8** — Add password strength indicator to SignUp (1 hour)

Total estimated effort for P0+P1: ~10 hours of focused work.
