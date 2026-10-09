# Legacy_Exception — `profiles.email_verified`

**Registered by:** Task 1.6 (`.kiro/specs/admissions-v2-canonical-rebuild/`)
**Requirements:** R9.7 (verification-removal migration), R15.6 (legacy fields
SHALL be output-only snapshots or named Legacy_Exceptions)
**Findings:** STU-21

Per the requirements glossary, a **Legacy_Exception** is "a named, measured
fallback for a pre-cutover record with an owner and removal date." This registers
the retained `email_verified` column.

| Field | Value |
|-------|-------|
| **Name** | `profiles.email_verified` (Django `Profile.email_verified`) |
| **Type** | `boolean NULL` in Postgres; ORM field `BooleanField(null=True, blank=True, default=True)` |
| **Why retained** | Backward data compatibility (product hard constraint "Preserve backward data compatibility"). Existing `profiles` rows carry historical values; the `managed=False` model maps the live column, and dropping it would break every `Profile` query. |
| **Reads (runtime)** | **None.** No login, submission, permission, serializer, or view path reads this column (verified by grep + `test_no_verify_email_route_registered`). |
| **Writes (runtime)** | `RegisterView` sets it `True`; seeds/harness set it `True`; ORM `default=True` covers any other creation path. Written for consistency only — never consumed. |
| **Measurement** | `backend/tests/integration/test_email_links_and_verification_removal.py::TestEmailVerificationRemoved` asserts no verify-email route/model, immediate login (no gate), and `default=True` (no NULL/ambiguous new rows). |
| **Owner** | Admissions V2 spec owner (release owner for `admissions-v2-canonical-rebuild`). |
| **Removal date / gate** | Contract (drop the column) during **Phase 12 legacy contraction** — `tasks.md` **12.3** (contract legacy identity/payment columns) and covered by the **12.5** grep-loop review. Target window: alongside the next legacy-column contraction wave. Removal proceeds only after: (a) the `Profile.email_verified` model field declaration is removed, and (b) an additive `managed=False` drop script runs Neon-first then production per `infrastructure.md`. Until then this exception is the registered record that keeps the column a known, measured, read-by-nothing legacy field rather than unregistered dead state. |

## Removal checklist (for whoever executes Phase 12.3)

1. Confirm zero runtime reads/writes remain (re-run the grep + the task-1.6
   evidence test).
2. Remove the `email_verified` field declaration from
   `backend/apps/accounts/models.py` (`managed=False` ⇒ removing the field stops
   the ORM selecting it).
3. Author an additive drop script under `backend/scripts/` (Neon branch first,
   prove, then production self-hosted Postgres) — do **not** hand-edit
   production first.
4. Update `backend/scripts/00_full_schema.sql` and the schema manifest.
5. Remove this Legacy_Exception registration.

## Note on the separate legacy-column deprecation cycle

`docs/runbooks/legacy-column-deprecation.md` tracks a **different** set of
columns (`applications.*` payment columns, `profiles.refresh_token_hash /
failed_login_attempts / locked_until`, `error_logs`) scheduled for a dated drop
under a no-writes invariant. `email_verified` is **intentionally not** in that
runbook: it is actively written (True) rather than write-frozen, so it is
tracked here as a V2 Legacy_Exception instead of being added to that no-writes
drop list.
