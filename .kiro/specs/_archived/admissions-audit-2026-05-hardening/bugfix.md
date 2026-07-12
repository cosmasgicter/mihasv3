# Bugfix Requirements Document

## Introduction

The May 25, 2026 admissions code-quality audit identified five production-blocking
defects in the MIHAS admissions platform. They are bundled into a single
hardening pass because they affect overlapping surfaces (the application wizard,
the admin document preview, and the signed-URL infrastructure that backs both)
and because three of them silently block the student submission funnel.

This bugfix spec captures all five defects as a coherent requirements set so a
single design and a single task list can be derived from it. Each numbered bug
in this document maps to a distinct bug condition `C(X)` and a distinct
fix-checking property `P(result)`.

### In-scope bugs

1. **Draft auto-restore loop** — students cannot start a new application; the
   wizard always restores the most recent draft and the "start fresh" entry
   point on the dashboard 404s.
2. **Silent Zod sex-field casing mismatch** — restored drafts inject
   lowercase `sex` values that fail the title-case Zod enum on submit; React
   Hook Form aborts the submit on a step the user is not viewing, so no
   on-screen error is rendered.
3. **Private R2 preview returns 403 for fallback documents** — admin clicks on
   fallback document entries open the raw private R2 URL instead of a signed
   preview, producing a Cloudflare 403 page.
4. **Boto3 S3 client re-instantiated on every signed-URL call** — every call
   to `generate_signed_url` allocates a fresh boto3 client, defeating
   connection pooling and inflating latency under fan-out.
5. **Dead code, dangling route, and stale planning comments** — an unused
   `useStorageDownload` hook, a referenced-but-unregistered
   `/student/applications/new` route, and verbose multi-phase AI planning
   comments in wizard hooks contribute to confusion without serving runtime
   behavior.

### Out of scope

The audit also flags two larger items that are explicitly **deferred** and
are NOT part of this hardening pass:

- The three overlapping draft-management layers (`draftManager.ts`,
  `useDraftManager.ts`, `useMultiDraft.ts`). Bug 1 is fixed at the navigation
  and gating boundary, not by collapsing those layers.
- Database-level sex-casing divergence between the Profile model
  (`"Male"`/`"Female"`) and the Application model
  (`"male"`/`"female"`). Bug 2 is fixed at the wizard hydration boundary,
  not by a schema migration.

### Hard constraints carried from steering

- Auto-save behaviour on every student form must be preserved.
- Mobile-first usability and touch-target sizing must be preserved.
- Backward data compatibility with existing Neon rows (mixed-case sex
  values, applications with raw `*_url` fields and no joined Document UUID)
  must be preserved.
- The `{"success": true, "data": ...}` API envelope must be preserved on
  every authenticated list endpoint.
- No purple gradients, gradient text, glassmorphism, nested cards, or
  emoji icons. WCAG AA contrast and `≥44 × 44 px` touch targets are
  non-negotiable. Reduced motion remains globally enforced.

## Bug Analysis

### Current Behavior (Defect)

What currently happens when each bug is triggered. Inputs are described in
terms of user state plus the data that hydrates the wizard or admin view.

1.1 WHEN a student has any draft (local or server) AND clicks "Start new application" or
    "New Application" from the student dashboard THEN the system navigates to
    `/student/applications/new`, hits the 404 wildcard, and ultimately leaves
    the student with no working entry point to a fresh wizard session.

1.2 WHEN a student has any draft (local or server) AND opens the application
    wizard from the dashboard, status overview, or application status page
    THEN the system silently runs `loadDraft`, reconciles local + server
    drafts, restores the most recent one, and provides no URL parameter,
    button, or other escape hatch to start a fresh application.

1.3 WHEN a student wants to start a new application despite having a draft
    THEN the system offers no observable affordance to discard the existing
    draft and begin from a clean wizard state.

2.1 WHEN a draft or profile is restored into the wizard with `sex` stored as
    `'male'` or `'female'` (lowercase, the canonical Application-model casing
    and the value re-fetched from the server after auto-save) THEN the system
    injects that lowercase value back into React Hook Form state via
    `setValue('sex', ..., { shouldValidate: false })` without normalizing it
    to the title-case the Zod schema requires.

2.2 WHEN the user, on the final Submit step, accepts terms and clicks
    "Submit Application" with a hydrated lowercase `sex` value THEN the system
    runs the cross-step Zod schema, fails on Step 1's
    `z.enum(['Male', 'Female'])` constraint, aborts the submit handler, and
    renders no field-level error on any visible step.

2.3 WHEN the submit handler aborts under condition 2.2 THEN the system
    presents at most a generic top-of-form flash and provides no actionable
    instruction telling the student which step or field to correct.

2.4 WHEN the cross-step submit validation fails on a field that lives on a
    step the user is not currently viewing THEN the system does not navigate
    the user to that step and does not announce the failure to assistive
    technology, leaving the user stuck on the Submit step indefinitely.

3.1 WHEN an admin opens the application detail document panel for an
    application whose document list contains a fallback entry (an entry whose
    `id` is not a UUID, typically synthesised from a raw `result_slip_url` or
    similar field on the Application model) AND clicks that entry THEN the
    system calls `window.open(doc.file_url, '_blank', 'noopener,noreferrer')`
    on the unsigned R2 URL.

3.2 WHEN the unsigned URL from 3.1 is opened against a private R2 bucket
    THEN Cloudflare returns a 403 / "Access Denied" page instead of the
    document preview, with no in-app explanation of the failure.

4.1 WHEN any caller invokes `generate_signed_url` to mint a presigned R2
    URL THEN the system allocates a fresh `boto3.client("s3", ...)` instance
    inside the function body, parsing service JSON, loading config, and
    allocating new socket descriptors every call.

4.2 WHEN a single dashboard render or document list render fans out N
    signed-URL requests THEN the system performs N independent client
    instantiations with no HTTP connection reuse, multiplying latency and
    CPU under load.

5.1 WHEN a developer searches the admissions frontend for usages of the
    `useStorageDownload` hook in `apps/admissions/src/hooks/queries/useStorageQueries.ts`
    THEN the system surfaces the hook definition but zero call sites, while
    the hook still ships in the bundle and would download an entire file into
    memory if invoked.

5.2 WHEN a developer or student follows the `/student/applications/new` link
    that the dashboard renders THEN the system falls through to the 404
    wildcard route because no entry for that path exists in
    `apps/admissions/src/routes/config.tsx`.

5.3 WHEN a maintainer reads files such as
    `apps/admissions/src/pages/student/applicationWizard/hooks/wizard/useWizardForm.ts`
    THEN the system shows multi-phase AI planning comments
    (e.g. "Decision A6", "Phase 2 of 6", "Stream 8 of canonical-truth program")
    that no longer reflect the shipped behavior and slow code review without
    serving any runtime purpose.

### Expected Behavior (Correct)

What should happen instead, expressed clause-by-clause against the same
triggers. Every Current Behavior clause has a paired Expected Behavior clause.

1.1 WHEN a student clicks "Start new application" or "New Application" from
    the student dashboard THEN the system SHALL navigate to a registered
    route that renders the application wizard in fresh-start mode, with no
    silent restoration of any existing draft.

1.2 WHEN a student opens the application wizard with an explicit
    fresh-start intent (URL parameter, dashboard CTA, or status-page CTA)
    AND has any draft (local or server) THEN the system SHALL bypass the
    `loadDraft` reconciliation effect and present a clean wizard state
    initialised from defaults plus, where available, the student profile.

1.3 WHEN a student wants to discard an existing draft and begin again
    THEN the system SHALL provide a discoverable in-flow affordance
    (URL parameter, button, or both) that performs the discard and starts a
    fresh wizard session, with auto-save of the new session preserved.

2.1 WHEN a draft or profile is restored into the wizard with a `sex` value
    in any casing (`'male'`, `'Male'`, `'MALE'`, `'female'`, `'Female'`,
    `'FEMALE'`) THEN the system SHALL normalise the value at the wizard
    hydration boundary to the title-case form required by the Zod schema
    (`'Male'` or `'Female'`), or to `''` if the input does not match any
    recognised casing, before calling `setValue('sex', ...)`.

2.2 WHEN the user submits the application with a draft hydrated under 2.1
    AND the underlying value was originally stored as lowercase
    THEN the system SHALL still pass the cross-step Zod schema, run the
    submit handler to completion, and continue to send the canonical
    lowercase value to `POST /api/v1/applications/{id}/submit/`.

2.3 WHEN the submit handler encounters any cross-step Zod validation
    failure THEN the system SHALL surface a field-level error message that
    names the offending field and step, in addition to any top-of-form
    flash, in a manner that respects WCAG AA contrast and is announced to
    assistive technology.

2.4 WHEN cross-step submit validation fails on a field that lives on a
    step the user is not currently viewing THEN the system SHALL navigate
    or redirect focus to the step containing the offending field, expose
    the error via `aria-live`, and keep the user's progress through other
    steps intact.

3.1 WHEN an admin clicks any document entry in the application detail
    document panel — whether the entry is backed by a real Document row or
    by a fallback synthesised from a raw URL field — THEN the system SHALL
    request a short-lived signed URL for the underlying object before
    opening it.

3.2 WHEN the underlying object is hosted in a private R2 bucket
    THEN the system SHALL only ever open URLs that are signed (or proxied
    through a backend endpoint that signs on demand), so the admin sees the
    document preview rather than a Cloudflare 403 page.

4.1 WHEN any caller invokes `generate_signed_url` THEN the system SHALL
    reuse a single, module-level boto3 S3 client (with HTTP connection
    pooling enabled) for the lifetime of the worker process, instead of
    allocating a fresh client inside the function body.

4.2 WHEN a single render fans out N signed-URL requests THEN the system
    SHALL reuse the pooled client across all N calls, so dashboard-load and
    document-list latency does not scale with N due to client construction.

5.1 WHEN a developer audits the frontend for unused exports
    THEN the system SHALL no longer ship `useStorageDownload`, or any other
    code path that downloads entire files into memory without an in-product
    consumer.

5.2 WHEN any UI surface links to `/student/applications/new`
    THEN the system SHALL either register that route to the fresh-start
    wizard described in 1.1–1.3 OR remove the link in favour of an existing
    registered route that produces the same fresh-start outcome — with no
    fall-through to the 404 wildcard.

5.3 WHEN a maintainer reads wizard hook files such as `useWizardForm.ts`
    THEN the system SHALL contain only comments that describe the
    behaviour as it ships today, with stale multi-phase AI planning
    comments removed.

### Unchanged Behavior (Regression Prevention)

Existing behavior that must be preserved across every bug fix in this pass.

3.1 WHEN a student or admin works in any flow that does not navigate to the
    wizard with fresh-start intent (1.1–1.3) THEN the system SHALL CONTINUE
    TO restore the most recent draft from the existing reconciliation logic,
    so that students who closed the tab mid-application still resume exactly
    where they left off.

3.2 WHEN auto-save fires from the wizard (debounced field changes, step
    navigation, or background sync) THEN the system SHALL CONTINUE TO
    persist drafts silently to local storage and to the server with the
    same cadence and the same mobile-network resilience as today.

3.3 WHEN draft expiry, draft reminders, and the 30-day draft purge run from
    `draft_expiry_reminder_task` THEN the system SHALL CONTINUE TO operate
    on the same draft records and the same Celery schedule.

3.4 WHEN a draft or profile is restored with `sex` already in the
    title-case form expected by the Zod schema (e.g. `'Male'`, `'Female'`)
    THEN the system SHALL CONTINUE TO accept those values without
    modification and SHALL CONTINUE TO submit them to the backend in the
    canonical lowercase form via the existing
    `sex: formData.sex?.toLowerCase()` step in the submit payload builder.

3.5 WHEN the backend serializer at `backend/apps/applications/serializers.py`
    validates the `sex` field on `POST /api/v1/applications/{id}/submit/`
    THEN the system SHALL CONTINUE TO accept the canonical lowercase
    choices `['male', 'female']` and SHALL CONTINUE TO reject other values,
    so existing application rows and existing API consumers are unaffected.

3.6 WHEN the backend Profile model and Profile serializer read or write
    the profile `sex` field THEN the system SHALL CONTINUE TO use the
    title-case `'Male'`/`'Female'` values they already use, because the
    Profile-vs-Application DB casing divergence is explicitly out of scope
    for this hardening pass.

3.7 WHEN an admin clicks a document entry whose `id` IS a UUID (a real
    Document row) in the application detail panel THEN the system SHALL
    CONTINUE TO fetch a signed URL through the existing flow and open the
    preview successfully.

3.8 WHEN any caller invokes `generate_signed_url` against a non-private
    bucket, a CDN-backed URL, or a path that bypasses presigning (e.g.
    a direct download endpoint) THEN the system SHALL CONTINUE TO produce
    a URL that opens the resource exactly as it does today.

3.9 WHEN any backend call site outside `generate_signed_url` constructs a
    fresh boto3 client for unrelated reasons (uploads, MediaStorage,
    head-object checks) THEN the system SHALL CONTINUE TO behave
    identically — this fix is scoped to the signed-URL hot path.

3.10 WHEN any frontend route other than `/student/applications/new` is
     navigated to (including `/student/application-wizard`, the admin
     workspace, auth pages, public pages, and existing 404 fallbacks)
     THEN the system SHALL CONTINUE TO resolve to the same components,
     with the same authentication guards, lazy-loaded chunks, and route
     preload behaviour as today.

3.11 WHEN any frontend code path other than `useStorageDownload` reads or
     writes through `useStorageQueries.ts` THEN the system SHALL CONTINUE
     TO operate without regression — only the unused export and its tests
     (if any) are removed.

3.12 WHEN any wizard hook other than the touched ones is read or executed
     THEN the system SHALL CONTINUE TO behave identically; comment cleanup
     in `useWizardForm.ts` and adjacent files MUST NOT alter runtime
     semantics, exported types, hook signatures, or React Query cache
     keys.

3.13 WHEN any student form interacts with dirty-state guards, the
     `beforeunload` handler, the canonical UI primitives (`PageShell`,
     `SectionCard`, `ErrorDisplay`, `EmptyState`, `Button asChild`), the
     `OptimizedImage` component with its required `onError` fallback, or
     the full Inter font fallback chain in `tailwind.config.js`
     THEN the system SHALL CONTINUE TO honour those existing
     conventions without regression.

3.14 WHEN any property test under `apps/admissions/tests/property/` or
     `backend/tests/property/` runs against the post-fix code THEN the
     system SHALL CONTINUE TO pass every preservation property already
     enforced in the audit-production, payment-hardening, and auth-forms
     suites.

3.15 WHEN any authenticated list endpoint (e.g. `GET /api/v1/sessions/`,
     `GET /api/v1/applications/interviews/?mine=true`,
     `GET /api/v1/applications/{id}/conditions/`) returns data
     THEN the system SHALL CONTINUE TO use the
     `{"success": true, "data": [...]}` envelope and SHALL CONTINUE TO
     normalise legacy `verified` and current `paid`/`successful` payment
     states consistently in student-facing reads.

## Deriving the Bug Conditions

Each bug above maps to a distinct `C(X)` and `P(result)`. Definitions:

- **F**: the original (unfixed) function or flow as it ships today.
- **F'**: the fixed function or flow after this spec lands.
- **isBugCondition_n(X)**: predicate over the relevant input space.
- **Property P_n**: the post-condition that must hold on `F'(X)` whenever
  `isBugCondition_n(X)` is true.

### Bug 1 — Draft auto-restore loop

```pascal
FUNCTION isBugCondition_1(X)
  INPUT: X = {
    has_local_draft : boolean,
    has_server_draft : boolean,
    fresh_start_intent : boolean   // user clicked "Start new application"
                                   // OR navigated with explicit ?new=true
                                   // OR otherwise signalled fresh-start
  }
  OUTPUT: boolean

  RETURN (X.has_local_draft OR X.has_server_draft) AND X.fresh_start_intent
END FUNCTION
```

```pascal
// Property: Fix Checking — Fresh-start respects user intent
FOR ALL X WHERE isBugCondition_1(X) DO
  result ← openWizard'(X)
  ASSERT route_resolved(result) = true                  // no 404 fall-through
     AND wizard_initial_form_state(result) = defaults_plus_profile(X)
     AND no_silent_draft_restore(result) = true
     AND fresh_start_affordance_visible(result) = true
END FOR
```

### Bug 2 — Silent Zod sex-field casing mismatch

```pascal
FUNCTION isBugCondition_2(X)
  INPUT: X = {
    sex_in_storage : string,       // raw value from local draft, server draft,
                                   // or profile hydration
    user_clicked_submit : boolean,
    other_steps_valid : boolean
  }
  OUTPUT: boolean

  RETURN X.user_clicked_submit
     AND X.other_steps_valid
     AND lower(X.sex_in_storage) IN {"male", "female"}
     AND X.sex_in_storage NOT IN {"Male", "Female"}
END FUNCTION
```

```pascal
// Property: Fix Checking — Submit succeeds for any recognised sex casing
FOR ALL X WHERE isBugCondition_2(X) DO
  result ← submitWizard'(X)
  ASSERT zod_passes(result, "sex") = true
     AND submit_payload_sex(result) = lower(X.sex_in_storage)
     AND http_call_made(result, "POST /api/v1/applications/{id}/submit/") = true
END FOR

// Property: Fix Checking — Any cross-step failure is observable
FOR ALL X WHERE submit_attempted(X) AND zod_fails(X) DO
  result ← submitWizard'(X)
  ASSERT field_level_error_visible(result) = true
     AND aria_live_announced(result) = true
     AND focus_navigated_to_offending_step(result) = true
END FOR
```

### Bug 3 — Private R2 preview returns 403 for fallback documents

```pascal
FUNCTION isBugCondition_3(X)
  INPUT: X = {
    doc : { id : string, file_url : string, ... },
    bucket_is_private : boolean,
    admin_clicked_preview : boolean
  }
  OUTPUT: boolean

  RETURN X.admin_clicked_preview
     AND X.bucket_is_private
     AND NOT is_uuid(X.doc.id)        // fallback entry, not a real Document row
END FUNCTION
```

```pascal
// Property: Fix Checking — Preview always opens via a signed URL
FOR ALL X WHERE isBugCondition_3(X) DO
  result ← previewDocument'(X)
  ASSERT opened_url_is_signed(result) = true
     AND http_status_observed(result) <> 403
     AND user_sees_document_preview(result) = true
END FOR
```

### Bug 4 — Boto3 S3 client re-instantiated on every signed-URL call

```pascal
FUNCTION isBugCondition_4(X)
  INPUT: X = N : integer    // number of generate_signed_url calls in a single
                            // logical render or fan-out
  OUTPUT: boolean

  RETURN N >= 1
END FUNCTION
```

```pascal
// Property: Fix Checking — Single shared client across N calls
FOR ALL X WHERE isBugCondition_4(X) DO
  result ← runSignedUrlFanout'(X)
  ASSERT distinct_boto3_clients_constructed(result) <= 1
     AND every_returned_url_is_valid_signed(result) = true
     AND every_returned_url_remains_short_lived(result) = true   // unchanged TTL
END FOR
```

### Bug 5 — Dead code, dangling route, stale comments

```pascal
FUNCTION isBugCondition_5(X)
  INPUT: X = repository_state
  OUTPUT: boolean

  // X exhibits the bug if any of these hold:
  RETURN has_export_with_zero_callers(X, "useStorageDownload")
      OR has_link_to_unregistered_route(X, "/student/applications/new")
      OR has_stale_phase_planning_comments(X,
           ["Decision A6", "Phase 2 of 6", "Stream 8 of canonical-truth program"])
END FUNCTION
```

```pascal
// Property: Fix Checking — Repository is free of these specific dead-code shapes
FOR ALL X WHERE isBugCondition_5(X) DO
  result ← cleanRepository'(X)
  ASSERT NOT has_export_with_zero_callers(result, "useStorageDownload")
     AND NOT has_link_to_unregistered_route(result, "/student/applications/new")
     AND NOT has_stale_phase_planning_comments(result,
              ["Decision A6", "Phase 2 of 6", "Stream 8 of canonical-truth program"])
     AND runtime_behavior(result) = runtime_behavior(F)   // pure cleanup
END FOR
```

### Preservation Goal — applies to all five bugs

```pascal
// Property: Preservation Checking
//
// For every input X that does NOT trigger any of the five bug conditions,
// the fixed system must behave identically to the original.

FOR ALL X WHERE NOT (isBugCondition_1(X) OR isBugCondition_2(X)
                  OR isBugCondition_3(X) OR isBugCondition_4(X)
                  OR isBugCondition_5(X)) DO
  ASSERT F(X) = F'(X)
END FOR
```

This preservation goal is the formal counterpart to the Unchanged Behavior
clauses 3.1–3.15 above and is the single most important regression check
for this hardening pass.
