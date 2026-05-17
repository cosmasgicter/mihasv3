# ADR-013 — System Actor for Automated Transitions

**Status:** Accepted (2026-05-17)
**Supersedes:** Implicit "system" string convention prior to 2026-05-17

## Context

`apps.applications.services.transition_application_status()` updates two columns:

- `Application.reviewed_by` — FK → `profiles.id` (UUID)
- `ApplicationStatusHistory.changed_by` — FK → `profiles.id` (UUID)

Automated tasks that need to perform a transition (draft expiry, condition
expiry, enrollment expiry, waitlist auto-promotion) historically passed the
literal string `"system"` as the `changed_by` parameter. Postgres rejected
this as `invalid_text_representation` for the UUID column, the FK write
failed, and the exception was caught and logged inside the surrounding
Celery task wrapper. The tasks reported success, but no transition occurred.

The bug was silent for an extended period and only surfaced after
`AUDIT-REPORT-2026-04-24.md` and the canonical-truth analysis cross-checked
test mocks against the real DB path. Every existing unit test in
`test_expiry.py`, `test_conditions.py`, `test_waitlist.py` mocked
`transition_application_status` itself, so none of them exercised the
actual FK write.

## Decision

Introduce a single canonical UUID representing the automated system actor:

```python
SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000001"
```

Backed by a real `profiles` row seeded via `backend/scripts/system_actor_seed.sql`:

| Column | Value |
|--------|-------|
| `id` | `00000000-0000-0000-0000-000000000001` |
| `email` | `system@mihas.internal` |
| `role` | `super_admin` |
| `is_active` | **`false`** |
| `first_name` | `System` |
| `last_name` | `Actor` |

`is_active=false` ensures the row cannot be authenticated as through any of
the normal login flows (login views check `is_active`). The fixed UUID lets
all callers reference it deterministically without a database lookup.

`transition_application_status()` now validates `changed_by` is a UUID at
function entry and raises `ValueError` with a clear error message when it
isn't. This converts the silent-failure mode into a loud test-time failure.

## Consequences

### Positive
- Draft expiry (`draft_expiry_reminder_task`) actually expires drafts.
- Condition expiry (`condition_expiry_task`) actually rejects overdue applications.
- Enrollment expiry (`enrollment_confirmation_expiry_task`) actually frees spots.
- Waitlist auto-promotion (`WaitlistManager.promote_next`) actually promotes.
- Admin dashboard urgency counters (added in Wave 1 — May 2026) now reflect a queue that actually drains.
- Test mocks can no longer silently hide regression of this class because the UUID guard fires early.

### Negative
- Any future automated transition path must remember to import `SYSTEM_ACTOR_ID`. Mitigated by the UUID guard and integration tests.
- The `super_admin` role on the system profile is overkill for the actual transitions performed, but keeping the role permissive avoids permission-check surprises in service code that already handles inactive accounts.

### Neutral
- One additional row in `profiles`. Negligible storage cost.

## Implementation

| File | Change |
|------|--------|
| `backend/scripts/system_actor_seed.sql` | New — idempotent INSERT of the system profile |
| `backend/apps/applications/services.py` | New `SYSTEM_ACTOR_ID` constant; UUID guard at top of `transition_application_status` |
| `backend/apps/applications/tasks.py` | Two callsites updated (lines ~197, ~545) |
| `backend/apps/applications/condition_manager.py` | Two callsites updated (auto-rejection, auto-promotion) |
| `backend/apps/applications/waitlist_manager.py` | One callsite updated (`promote_next`) |
| `backend/tests/integration/test_system_actor_transitions.py` | New regression net (real DB, no mocks) |

## Verification

After deploy, monitor the 24-hour window for:

```sql
SELECT count(*) AS system_transitions_last_day
FROM application_status_history
WHERE changed_by = '00000000-0000-0000-0000-000000000001'::uuid
  AND created_at > now() - interval '24 hours';
```

Should be non-zero (drafts expiring, conditions rejecting, etc.). The same
query on the prior 24 hours will return 0 for the historical period because
the bug was silent.

## Pattern adoption

Any future automated background process that performs status transitions
must:

1. Import `SYSTEM_ACTOR_ID` from `apps.applications.services`.
2. Pass it as `changed_by`.
3. Add a real-DB integration test to `tests/integration/test_system_actor_transitions.py`.

The UUID guard will surface any deviation from this pattern at test time.
