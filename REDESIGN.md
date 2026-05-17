# REDESIGN.md — 2026-05-17

> Design direction for the systemic redesign of MIHAS-KATC admissions, jobs-ops,
> and PDF surfaces. Read alongside `PRODUCT.md` (audience, voice, anti-references)
> and `DESIGN.md` (tokens, components, do's and don'ts).
>
> **Constraint:** No breaking changes to canonical truth, auto-save, security
> posture, or the 6-step wizard mental model. The redesign is visual + spatial
> + motion only. Domain logic, drift-guards, and contracts are untouched.

## The single principle

**The work is the product. The interface should disappear.**

Every redesign decision below derives from that. We are building tools that
help students get into a healthcare program and help admin reviewers decide
on those applications fairly and quickly. The interface that disappears is
the interface that respects the audience's time, mental model, and network
conditions.

## What changes, and why

| Surface | Old register | Old issue | New register | New approach |
|---------|--------------|-----------|--------------|--------------|
| **Auth (sign-in/up/forgot/reset)** | brand-leaning, dark-gradient split pane | Hero narrative competes with the action | **product, calm** | Single column, soft canvas, brand wordmark as identity not theatre, primary action dominates |
| **Student Dashboard** | product, but visually busy | Multiple panels at equal weight | **product, focused** | One hero card per state (continue/start/track), supporting info as quiet rows |
| **Wizard shell** | product, functional | Step indicator OK, but transitions are abrupt | **product, paced** | 6-step model preserved; clearer step header with progress narrative; transitions express forward motion |
| **Admin Dashboard** | product, dense | Equal-weight cards lose hierarchy | **product, scannable** | Top-of-page action surface + densified queue preview |
| **Admin queue** | product, dense | Filter/state visible but visually flat | **product, layered** | Sticky filter bar with active-state pills, table density restored to 12-row visible default |
| **Landing** | brand, but two equal CTAs | Primary action ambiguous | **brand, decisive** | Single primary CTA, secondary as outline, proof panel quieter, anti-pattern (purple gradient) already removed |
| **PDF documents** | brand, institutional | (Already strong — Playfair Display + Source Sans 3) | **brand, preserved** | No changes; verified in audit |
| **Jobs-ops** | product, operator-density | Space Grotesk display font flagged | **product, neutral** | Display font deferred (P1 #13 in audit); shell rhythm tightened in this pass |

## Visual system

### Typography rhythm
- Body 16/24 (1.5 line-height) — Inter
- Step heading 28/36, semibold
- Page heading (h1) 32/40, semibold
- Section heading 20/28, semibold
- Caption / meta 14/20, normal weight, `text-muted-foreground`
- Numeric data on dashboards: `font-mono` (system mono fallback) — improves scanning of fees, dates, counts, IDs.

### Spacing rhythm
- 4 px atomic, 8 px compositional. The Tailwind scale (`space-1`, `space-2`, …) already enforces this.
- **Page-level vertical rhythm:** 32 (h1 + body) → 24 (between sections) → 16 (within section). Headers should sit on a 32 px gutter from the next block, never less.

### Surface elevation
- 5-level shadow scale already documented in DESIGN.md §3. Use it. Default surface in product mode is **flat** (`shadow-none` or `shadow-sm` for cards). Keep elevation for what it means: depth, not decoration.

### Color discipline
- Use only the semantic tokens (already swept in the slate sweep). No raw hex, no slate-*, no gray-on-color combos.
- Status colors **always** paired with icon + word. Never color alone.
- Admin surfaces use admin tokens (`bg-admin-bg`, `text-admin-text`); student surfaces use the standard tokens. Don't mix.

### Motion rules
- Duration 150–250 ms for micro-interactions, 250–350 ms for layout changes. Never longer.
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-expo) for entries; `cubic-bezier(0.7, 0, 0.84, 0)` (ease-in-quart) for exits.
- Exit faster than enter: 70% of the entry duration.
- Every transition expresses cause-and-effect. Decorative motion is a regression.
- `prefers-reduced-motion` respected globally (already enforced in `index.css`). Never override.
- No `animate-bounce`, `animate-spin` longer than 1s, no parallax on product surfaces.

### Hierarchy (Kadavy)
- One primary action per surface. Secondary actions are outline or ghost. Tertiary actions are text links.
- The eye path on every page must be obvious within 2 seconds of arrival.
- Use proportions to sell hierarchy: a primary CTA is taller, wider, fuller-saturation than a secondary.

## Auth redesign — concrete

### What was wrong
- A 200+ line `AuthLayout` with three variants, each with a hero panel, feature list, stats list, mobile fallback, and panel badge. The hero competes with the action. Students who came to sign in have to read past two narratives before finding the form.
- `variant="gradient"` Button (now solid but the variant name lies).
- A redundant info box repeating the description ("Sign in to continue saved drafts...") above the form.
- Formal fieldset/legend ("Applicant sign-in details") that adds visual noise without aiding usability.
- Dark gradient backgrounds (`from-slate-950 via-blue-950 to-cyan-700`) — institutional drama.

### What it becomes
- **One surface, two regions:** brand identity (small, top-center) + form (dominant, center). No split pane. No hero copy. Mobile and desktop share a single layout.
- **Calm canvas:** soft `bg-muted` background. Form sits on a `bg-card` panel with `border-border` and `shadow-sm`. No gradients on this surface.
- **Focused header:** brand wordmark + page title (e.g. "Sign in") + one-line description. That's it.
- **Primary action dominates:** full-width, 48 px, `variant="primary"`. Secondary actions ("Forgot password?" / "Create account") are text links below the button, separated by a divider.
- **Errors are inline at the field, plus a banner if the server returned a top-level error.** Never both for the same error.
- **Auto-focus the first field** on mount. **Auto-focus the first invalid field** on submit error.
- **Trust signal at the bottom** — "Your session lasts 7 days · Secured with end-to-end TLS" — small, muted, never dominant.

### Compositional template (auth pages)

```tsx
<AuthShell title="Sign in" subtitle="Continue your application">
  <Banner ... />          {/* only when there's a server error */}
  <form>
    <Input label="Email" />
    <PasswordInput />
    <Button variant="primary" size="lg" className="w-full">Sign in</Button>
  </form>
  <AuthFooterLinks>
    <Link>Forgot password?</Link>
    <Link>Create account</Link>
  </AuthFooterLinks>
  <TrustNote />
</AuthShell>
```

The new `AuthShell` replaces `AuthLayout`. The old layout file stays as a re-export shim until every consumer migrates (one PR per page is fine, but we'll do all four in this pass).

## Student dashboard redesign — concrete

### What was wrong
- Multiple panels at equal visual weight: profile completion, application list, notification bell, quick actions, recent activity. The eye doesn't know where to land.
- Hero "Welcome back, {name}" treated as decoration, not as a signal of state.

### What it becomes
- **State-driven hero card** at the top: "Continue your application" / "Start an application" / "Your application is under review" — one card whose content reflects the student's current canonical state. Single primary CTA on this card.
- Below the hero: a compact **Application timeline** (the existing `ApplicationTimeline` primitive) with the current step highlighted.
- **Quiet supporting rows** for Notifications, Profile completion, Help/Contact. Each row is a flat link, not a card.
- **Skeleton on first paint** matches the layout. No layout shift on first load.

## Wizard shell redesign — concrete

### What was wrong (per audit)
- 6-step wizard works, but the step header is small and the progress narrative is implicit (just dots).
- Transitions between steps are instantaneous — no spatial continuity, students lose their place.
- Footer with "Back / Next" buttons sits below the form on mobile but doesn't obviously belong to the form.

### What it becomes (preserves the 6-step canonical model)
- **Step header** uses the existing `Stepper` primitive but with a progress narrative below: "Step 3 of 6 · Education · Auto-saved 2 minutes ago". The narrative carries the saved-state for student trust.
- **Forward transitions slide left** (entering content slides in from right, exiting slides out to left) at 200 ms ease-out-expo. **Backward transitions reverse**. This makes the spatial model explicit. Reduced-motion fades instead.
- **Footer is sticky on mobile**, with "Back" outline-ghost on the left and "Next" primary on the right. On desktop it sits inline with the form.
- **Auto-save indicator is inline with the step header**, not a toast. Students see "Saved" passively while they work.

## Admin dashboard redesign — concrete

- Replace the three-column equal-weight stat grid with a top action bar (counts as compact metrics, color-coded by SLA freshness) and a queue preview below.
- Queue preview shows the next 8 actionable applications with filter pills above (All · Submitted · Under review · Waitlisted) — clicking a pill drills into the queue.

## Landing redesign — concrete (P1 #10 + #11 + #12 fixed in this pass)

- **One primary CTA in the hero**: "Start your application". Secondary "Browse programs" becomes outline.
- **Proof panel** uses real data sourced from the catalog API or a single constant module — no more hardcoded `2 campuses / 3 programs`.
- **Section spacing** tightened: hero (no padding-y > 96), proof (48), programs grid (64), testimonials (64), CTA (96). Predictable rhythm.
- **No dark gradients anywhere on the landing.** The detector flagged none, but the audit noticed the landing inherits the dark auth-y vibe in some sections — this redesign keeps the brand calm.

## What this redesign explicitly does NOT do

- **Doesn't change any URL.** Auth routes (`/auth/signin`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password`, `/signin`, `/login`) all keep working. The redesign is component-level only.
- **Doesn't break canonical truth.** Status enums, role hierarchy, error codes, payment-status mapping, and submission gates are untouched.
- **Doesn't break auto-save.** `draftManager`, `applicationSession`, and `useApplicationDirty` keep their current contracts.
- **Doesn't break the 6-step wizard model.** Same steps, same names, same canonical IDs.
- **Doesn't introduce new dependencies.** No `framer-motion` upgrade, no new icon library. Inter, Lucide, Tailwind tokens, Radix UI primitives — same set.
- **Doesn't replace any canonical primitive.** `PageShell`, `SectionCard`, `ErrorDisplay`, `EmptyState`, `Button`, `Input`, `PasswordInput`, `Banner`, `SaveStatusIndicator`, `Seo` all stay. New compositions, same atoms.

## Order of operations

1. **Auth (this PR):** new `AuthShell`, refactor 4 pages.
2. **Student Dashboard:** new state-driven hero, quiet supporting rows.
3. **Wizard shell:** richer step header + auto-save inline + slide-transitions on step change.
4. **Admin Dashboard:** queue-preview + action bar.
5. **Landing:** single-primary-CTA hero + sourced proof panel.

Each step ships its own commit. Each must:
- Run `bun run lint:design` clean (the gate I just shipped).
- Pass `bun run test` for canonical-truth tests.
- Pass `tsc --noEmit`.
- Render in dev (`bun run dev`) without console warnings.

## Success criteria

- Detector reports **no new** anti-patterns beyond the documented baseline (Inter font, Space Grotesk in jobs-ops).
- WCAG AA contrast verified on every text/background pair.
- Every page surface has **one primary CTA** (Kadavy hierarchy rule).
- Auto-save still works on every form a student touches.
- Drift-guard tests still pass.
- TypeScript clean.
- Visual: the wordmark "MIHAS-KATC" reads institutional, not tech-startup. The auth surface looks like a calm tool, not a marketing landing. The dashboard's hero card answers "what should I do next?" within 2 seconds of arrival.

That's the bar. Ship it.
