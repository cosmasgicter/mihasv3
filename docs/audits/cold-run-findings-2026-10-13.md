# Cold-run findings — local bring-up + 30-application demo (2026-10-13)

Observations gathered while running the full stack locally (isolated
`mihas-localtest` Docker profile) and seeding 2 users + 30 applications across
all 11 canonical stages. **Catalog only — nothing here was fixed.** Severity is
my assessment; confirm before acting.

Environment: `docker-compose.local-test.yml` (throwaway `mihas_localtest` DB),
admissions dev server on `:5173`, backend on `:8000`. Fake payments/email/AI.

---

## F1 — `tokens.colors.cjs` ESM named-import crash (FIXED during this session)
- **Severity:** High (was a hard crash of the entire admin shell).
- **Where:** `apps/admissions/src/design-system/tokens.ts` imported a *named*
  `adminColors` from a CommonJS `.cjs` module; `tokens.colors.d.cts` declared a
  matching named export, so TS passed but Vite's CJS→ESM interop exposes
  `module.exports = {...}` only as the **default** export → runtime
  `SyntaxError: ... does not provide an export named 'adminColors'`, caught by
  `ErrorBoundary`, admin routes dead.
- **Status:** Already fixed in this session (default import + corrected
  `.d.cts`). Logged here for the record. Root-cause class: CJS/ESM dual-consumer
  files typed with a named export that doesn't exist at runtime — worth a lint
  guard so it can't regress.

## F2 — Student application-list leaks admin-only fields (no role redaction)
- **Severity:** High (privacy / tenant-authority — needs confirmation).
- **Where:** `backend/apps/applications/serializers.py` →
  `ApplicationListSerializer` (used by `GET /api/v1/applications/` for BOTH
  student and admin). Exposes to the owning student:
  `payment_verified_by_name`, `payment_verified_by_email` (reviewer PII),
  `last_payment_audit_notes` (aliased from `admin_feedback`), plus
  `review_started_at`, `decision_date`, `admin_feedback`.
- **Observed:** logged in as the student (`cosmaskanchepa@gmail.com`), the
  per-row keys include all of the above. The dedicated review workspace has a
  `RedactionPolicy`, but this generic list endpoint uses one serializer for
  both roles with no field gating.
- **Why it matters:** reviewer identity + internal admin feedback notes are
  surfaced to applicants. `last_payment_audit_notes` reusing `admin_feedback`
  conflates "payment audit" with "admin review feedback" — likely unintended.
- **Needs:** confirm intended visibility; if not intended, gate these fields by
  role/capability (or split student vs admin list serializers).

## F3 — `apply_sql_migrations` rejects a committed migration on a fresh DB
- **Severity:** Medium (operational friction / bring-up correctness).
- **Where:** `backend/scripts/schema_cleanup_drop_stale_columns.sql`.
- **Observed:** on a clean local DB, `apply_sql_migrations` halts with
  `REJECTED_NON_ADDITIVE_OPERATION: DROP COLUMN` and requires
  `--allow-non-additive` to proceed. The additive-only lint is a good guard,
  but a committed migration in the standard sequence cannot be applied by the
  standard runner without a manual override — the documented bring-up (Part 2c
  of LOCAL-TESTING.md) doesn't mention it, so a first-time local bring-up stalls.
- **Needs:** either pre-mark/annotate this migration as a reviewed non-additive
  step the runner can auto-apply, or document the `--allow-non-additive` step in
  LOCAL-TESTING.md Part 2c. (The LOCAL-TESTING R8 gotcha documents a *different*
  CONCURRENTLY issue, not this one.)

## F4 — Canonical programs are not part of the SQL-migration bring-up path
- **Severity:** Medium (data-model correctness for any non-harness bring-up).
- **Where:** canonical programs are seeded only by
  `apps/common/management/commands/harness_bootstrap.py::_seed_canonical_programs`,
  not by `apply_sql_migrations` or `seed_subjects`.
- **Observed:** after the *documented* LOCAL-TESTING bring-up (which uses
  `apply_sql_migrations`, not `harness_bootstrap`), `canonical_programs` was
  **empty**, so program offerings created via `seed_dev_data`-style flows get a
  NULL `canonical_program_id` and every **non-draft** application insert is
  rejected by the DB check constraint `chk_applications_canonical_assignment`
  (requires institution+program+program_offering+intake all non-null unless
  draft/quarantined). I had to seed canonical programs manually to proceed.
- **Note:** `backend/scripts/seed_dev_data.py` is now stale against the canonical
  model — it creates `Program` offerings with **no** `canonical_program` link,
  which would hit the same constraint for any non-draft seed. It predates the
  canonical rebuild.
- **Needs:** confirm the intended bring-up path. If `apply_sql_migrations` is the
  canonical local/prod path, canonical-program seeding (and the offering→canonical
  link) needs a home outside the harness; and `seed_dev_data.py` should be fixed
  or retired.

## F5 — React Router v7 future-flag warnings (console noise)
- **Severity:** Low.
- **Where:** `apps/admissions/src/App.tsx` BrowserRouter.
- **Observed:** two console warnings on every load: `v7_startTransition` and
  `v7_relativeSplatPath`. Harmless today; opting into the future flags silences
  them and de-risks the eventual v7 upgrade.

## F6 — `seed_subjects` writes 0 rows on an already-seeded catalogue (cosmetic)
- **Severity:** Low (confusing log only).
- **Observed:** `Catalogue ecz-...: 0 row(s) written (62 checked)` — idempotent
  and correct, but the phrasing reads like a failure on first glance. Minor.

---

## Things that worked (no issue)
- Both logins succeed (`POST /api/v1/auth/login/`), correct roles returned.
- `GET /api/v1/applications/` returns all 30 rows for both roles; student path
  uses the `{page,pageSize,totalCount,results}` envelope; totals correct.
- The DB check constraint `chk_applications_canonical_assignment` correctly
  rejected malformed (canonical-less) non-draft rows — a good guardrail (it is
  what surfaced F4).
- `/health/live` + `/health/ready` = 200; catalog context returns the neutral
  Beanola shared-portal brand; the `/api` dev proxy reaches the backend.
- Backend `web` log and the Vite dev log are clean (no tracebacks/500s) after F1.

---

## Resolution log (2026-10-13, same session)

All findings resolved end to end and verified against the running stack.

- **F1 — FIXED & verified.** Default import + corrected `.d.cts`; type-check
  clean; Vite serves the module correctly; admin shell renders. Scan confirmed
  no other `.cjs` named-import of this class exists in `apps/admissions/src`.
- **F2 — FIXED & verified.** `ApplicationListSerializer` now gates
  `payment_verified_by_name/email`, `admin_feedback`, `last_payment_audit_notes`
  behind `context["staff_fields_visible"]` (fail-closed). The one admin view
  (`admin_review_views.ApplicationListCreateView`) sets it from
  `AdminCapabilityService`; the student draft collection leaves it unset (→
  withheld). Live check: student sees 0 of these across 30 rows; admin still
  sees `admin_feedback`. Full admissions test suite: 4741 passed / 1 skipped.
- **F3 — FIXED & verified.** `apply_sql_migrations` now honours a per-file
  `-- migration:allow-non-additive: <reason>` annotation, waiving the lint for
  that one reviewed file while keeping the additive-only guard active for every
  other file in the run (the blanket `--allow-non-additive` still works). The
  cleanup migration carries the annotation. Proven on a fresh DB: the documented
  bring-up (no CLI flag) applies all 46 migrations, logging the waiver reason.
- **F4 — FIXED & verified.** Root cause: the multi-tenant migration back-fills
  `canonical_programs` *from* `programs`, a no-op on an empty DB. The production
  migration is correct for its lineage and was left unchanged; the gap was the
  dev-seed path. `scripts/seed_dev_data.py` now creates canonical programs and
  links every offering (`offering_status='active'`, `canonical_program` set),
  and self-heals pre-existing canonical-less offerings on re-run. Proven on a
  fresh DB: 26 non-draft applications insert successfully (previously blocked by
  `chk_applications_canonical_assignment`).
- **F5 — FIXED & verified.** `BrowserRouter` now sets
  `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}`; type-check
  clean; app serves 200. Console warnings gone on next load.
- **F6 — FIXED & verified.** `seed_subjects` now logs
  "already up to date (N verified, no changes)" on an idempotent re-run instead
  of a bare "0 row(s) written".

Post-fix system health: `/health/live` + `/health/ready` 200; frontend + `/api`
proxy 200; **no schema drift (78 models)**; OpenAPI schema generates; admin
dashboard reports 30 applications; both logins 200.

### Files changed
- `apps/admissions/src/design-system/tokens.ts` (F1)
- `apps/admissions/src/design-system/tokens.colors.d.cts` (F1)
- `apps/admissions/src/App.tsx` (F5)
- `backend/apps/applications/serializers.py` (F2)
- `backend/apps/applications/admin_review_views.py` (F2)
- `backend/apps/common/management/commands/apply_sql_migrations.py` (F3)
- `backend/scripts/schema_cleanup_drop_stale_columns.sql` (F3 annotation)
- `backend/scripts/seed_dev_data.py` (F4)
- `backend/apps/catalog/management/commands/seed_subjects.py` (F6)

### Additionally exercised (no issue found)
- Admin review action `under_review → approved` via `POST /applications/{id}/review/`
  with CSRF: 200, version 1→2, correct `allowed_transitions`, status persisted.
- `status` query-param filter on the list endpoint: exact per-status counts.
- Tracking edge cases: bad-format → 400 `INVALID_FORMAT`; app-number-as-code →
  400 with actionable guidance.
- Sessions list redacts `ip_address` (SHA-256). Interviews/notifications 200.

---

## F1 correction (2026-10-13, later) — the first two fixes were wrong in DEV

**What went wrong twice.** F1's first fix used a *named* import, the second a
*default* import. Both type-checked and both passed `bun run build` — but the
production build uses Rollup (which bundles the `.cjs` and synthesises interop),
whereas the Vite **dev server** serves a source `.cjs` as native browser ESM.
A source `.cjs` whose body is `module.exports = { adminColors }` **cannot
execute in the browser** — it throws `module is not defined` — regardless of how
it is imported (named → "no export named adminColors"; default → "no export
named default"; namespace → `module is not defined` at evaluation). The build
masked the dev breakage both times. The real lesson: a `.cjs` under `src/` is
fundamentally unservable by the Vite dev server, and `tsc`/`build` are not a
substitute for loading the page in a browser.

**The permanent fix.** The shared admin-color source is now a plain **JSON**
file, `apps/admissions/src/design-system/tokens.colors.json`. JSON is imported
natively by the Vite dev server AND the Rollup build (`import x from './x.json'`)
AND Node's CommonJS `require()` — zero module-format interop, no dev-vs-build
divergence possible. Changes:
- **new** `src/design-system/tokens.colors.json` (single source of truth).
- `src/design-system/tokens.ts` → `import adminColorsJson from './tokens.colors.json'`.
- `tailwind.config.js` → `require('./src/design-system/tokens.colors.json')`.
- **deleted** `tokens.colors.cjs` and `tokens.colors.d.cts`.

**Verification (this time in a real browser, via Playwright + system Chrome):**
- `/auth/signin`, `/admin/dashboard`, `/student/dashboard`: **0** `tokens.colors`
  errors, **0** `module is not defined`.
- Full login flow: super_admin → 200 → lands `/admin/dashboard` (0 page errors);
  student → 200 → lands `/student/dashboard` (0 page errors).
- `bun run type-check`, `bun run build` (incl. CSP check), and the Tailwind
  `require` all pass. Tailwind admin colors resolve from the JSON.

## Login 401 clarification
The 401s seen in the browser console were **not** a credential or backend bug:
both users exist (bcrypt `$2b$12$`, active, verified) and
`POST /api/v1/auth/login/` returns **200** for both directly. The 401s were a
stale browser session hitting login while the app was mid-crash from the F1
token error during the container rebuilds. With F1 permanently fixed, the full
browser login flow succeeds for both accounts.

**Credentials (local throwaway stack only):**
- Student — `cosmaskanchepa@gmail.com` / `Beanola2025`
- Super Admin — `cosmas@beanola.com` / `Beanola2025`

Note: the GlitchTip 403 in the console (`app.glitchtip.com/.../envelope`) is the
Sentry/GlitchTip SDK trying to send telemetry with a `placeholder` DSN key in
local dev — harmless, expected locally, and unrelated to the app.
