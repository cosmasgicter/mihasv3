"""Canonical application-assignment remediation contract (Admissions V2 task 3.2).

This module is the single, DB-free source of truth for *how* a legacy
``applications`` row is deterministically resolved to its canonical assignment
IDs (institution / canonical program / offering / intake) or quarantined into the
exception ledger. The SQL scripts

    backend/scripts/2026_07_16_02_canonical_assignment_backfill.sql
    backend/scripts/2026_07_16_03_canonical_assignment_validate.sql

implement exactly this contract in set-based SQL; the pure functions here let it
be unit/property-tested with no database and no environment gating, and the
invariant queries let a Postgres-gated test (and the evidence ``inventory.sql``)
assert the post-state.

Determinism contract (design.md §7.2, §19)
------------------------------------------
* institution matched by ``institutions.name`` OR ``institutions.code`` (ci) vs
  the ``applications.institution`` display snapshot;
* offering matched by ``programs.name`` (ci) scoped to that institution vs the
  ``applications.program`` snapshot;
* intake matched by ``intakes.name`` (ci) vs the ``applications.intake`` snapshot;
* ``canonical_program_id`` DERIVED from the resolved offering (never guessed);
* a row is backfilled ONLY when it resolves to exactly one offering AND exactly
  one intake AND the offering carries a canonical link — anything else is
  quarantined, never force-resolved.

Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.2
Requirements: R7.1-R7.2, R15.3-R15.7
Findings: DATA-01, DATA-02, DATA-07, DATA-10, STU-01
"""

from __future__ import annotations

from typing import Any

# Resolution outcome / ledger reason codes. ``RESOLVABLE`` is not a ledger row;
# it means the deterministic backfill fills all four canonical IDs. Every other
# value is a ``canonical_assignment_exceptions.reason_code``.
RESOLVABLE = "resolvable"
NO_OFFERING_MATCH = "no_offering_match"
AMBIGUOUS_OFFERING = "ambiguous_offering"
NO_INTAKE_MATCH = "no_intake_match"
AMBIGUOUS_INTAKE = "ambiguous_intake"
OFFERING_MISSING_CANONICAL = "offering_missing_canonical"
DANGLING_FK = "dangling_fk"

#: Reason codes that live in the exception ledger (i.e. everything the backfill
#: refuses to auto-resolve). ``dangling_fk`` is detected structurally (a non-null
#: id pointing nowhere) rather than by :func:`classify_resolution`.
LEDGER_REASON_CODES: frozenset[str] = frozenset(
    {
        NO_OFFERING_MATCH,
        AMBIGUOUS_OFFERING,
        NO_INTAKE_MATCH,
        AMBIGUOUS_INTAKE,
        OFFERING_MISSING_CANONICAL,
        DANGLING_FK,
    }
)


def classify_resolution(
    *,
    offering_candidates: int,
    intake_candidates: int,
    offering_has_canonical: bool,
) -> str:
    """Classify one application row from its candidate counts.

    Mirrors the ``CASE`` in the backfill script's Step 4 (and the resolvable
    predicate in Step 3) exactly, so the SQL and the tests share one contract.

    Returns :data:`RESOLVABLE` when the row resolves to exactly one offering and
    exactly one intake and the offering carries a canonical link; otherwise the
    ledger reason code that most-specifically explains why it cannot be resolved.
    Total and deterministic for any non-negative candidate counts.
    """
    if offering_candidates < 0 or intake_candidates < 0:
        raise ValueError("candidate counts must be non-negative")
    if offering_candidates == 0:
        return NO_OFFERING_MATCH
    if offering_candidates > 1:
        return AMBIGUOUS_OFFERING
    if intake_candidates == 0:
        return NO_INTAKE_MATCH
    if intake_candidates > 1:
        return AMBIGUOUS_INTAKE
    if not offering_has_canonical:
        return OFFERING_MISSING_CANONICAL
    return RESOLVABLE


def is_resolvable(
    *, offering_candidates: int, intake_candidates: int, offering_has_canonical: bool
) -> bool:
    """True iff the row is uniquely, canonically resolvable (Step 3 predicate)."""
    return (
        classify_resolution(
            offering_candidates=offering_candidates,
            intake_candidates=intake_candidates,
            offering_has_canonical=offering_has_canonical,
        )
        == RESOLVABLE
    )


def removal_path_for(reason_code: str) -> str:
    """Human-readable owner remediation path for a ledger reason (Legacy_Exception)."""
    return {
        NO_OFFERING_MATCH: (
            "No tenant offering matches the (institution, program) display snapshot. "
            "Create/link the offering (task 5.1) or archive the legacy row, then re-run the backfill."
        ),
        AMBIGUOUS_OFFERING: (
            "The (institution, program) display snapshot matches more than one offering "
            "(same-name collision). Disambiguate from the student record / audit trail, "
            "then set the canonical IDs explicitly."
        ),
        NO_INTAKE_MATCH: (
            "No intake matches the intake display snapshot. Create/link the intake, then re-run the backfill."
        ),
        AMBIGUOUS_INTAKE: (
            "The intake display snapshot matches more than one intake. Disambiguate, then set intake_id explicitly."
        ),
        OFFERING_MISSING_CANONICAL: (
            "The resolved offering has no canonical_program_id. Canonicalise the catalog "
            "(task 5.1), then re-run the backfill."
        ),
        DANGLING_FK: (
            "A canonical FK pointed to a missing row; the id was cleared to NULL and the row "
            "re-quarantined. Re-derive from the display snapshot or archive the legacy row, then re-run."
        ),
    }.get(reason_code, "Unresolved; investigate manually.")


# ---------------------------------------------------------------------------
# Invariant queries (post-state gate) — shared by the verifier test and the
# evidence inventory.sql. Each returns a single integer column ``n`` that MUST be
# zero after expand + backfill + validate for the release gate to pass (R15.3).
# ---------------------------------------------------------------------------

#: Non-draft, non-quarantined applications missing any canonical id. Must be 0.
Q_NONDRAFT_NONQUARANTINED_MISSING = """
SELECT count(*) AS n
FROM applications
WHERE status <> 'draft'
  AND assignment_quarantined = false
  AND (institution_id IS NULL OR program_id IS NULL
       OR program_offering_id IS NULL OR intake_id IS NULL)
"""

#: Dangling canonical FKs (non-null id with no target row). Must be 0.
Q_DANGLING = """
SELECT count(*) AS n
FROM applications a
WHERE (a.institution_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM institutions i WHERE i.id = a.institution_id))
   OR (a.program_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM canonical_programs c WHERE c.id = a.program_id))
   OR (a.program_offering_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM programs p WHERE p.id = a.program_offering_id))
   OR (a.intake_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM intakes t WHERE t.id = a.intake_id))
"""

#: Quarantined rows must all carry an open ledger entry (no silent quarantine).
Q_QUARANTINED_WITHOUT_LEDGER = """
SELECT count(*) AS n
FROM applications a
WHERE a.assignment_quarantined = true
  AND NOT EXISTS (
      SELECT 1 FROM canonical_assignment_exceptions e
      WHERE e.application_id = a.id AND e.resolved = false
  )
"""

INVARIANT_QUERIES: dict[str, str] = {
    "nondraft_nonquarantined_missing": Q_NONDRAFT_NONQUARANTINED_MISSING,
    "dangling": Q_DANGLING,
    "quarantined_without_ledger": Q_QUARANTINED_WITHOUT_LEDGER,
}


def run_invariants(cursor: Any) -> dict[str, int]:
    """Execute every post-state invariant query and return ``{name: count}``.

    All counts must be 0 for the canonical-assignment release gate to pass.
    """
    results: dict[str, int] = {}
    for name, sql in INVARIANT_QUERIES.items():
        cursor.execute(sql)
        results[name] = int(cursor.fetchone()[0])
    return results
