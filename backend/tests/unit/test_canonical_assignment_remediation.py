"""Verifier + regression tests for canonical assignment remediation (task 3.2).

Two layers, matching the repo convention (see test_schema_manifest_*):

* Pure-Python tests over the deterministic resolution *contract*
  (:mod:`apps.common.canonical_assignment`) — no DB, no env gating, run in every
  CI profile (SQLite fast suite + Postgres).
* A Postgres-gated integration test that applies the ACTUAL shipped SQL scripts
  (expand -> backfill -> validate) against seeded fixtures and asserts the target
  invariants hold: resolvable rows are backfilled, ambiguous / no-match /
  offering-missing-canonical rows are quarantined into the ledger, drafts are
  exempt, the non-null CHECK + canonical FKs validate, and the run is idempotent.
  It reuses the task 3.1 manifest verifier to assert the constraints are validated.

Postgres gating uses ``skipif(connection.vendor != 'postgresql')`` because the
scripts use DO blocks, jsonb, partial indexes, and VALIDATE CONSTRAINT that
SQLite cannot run; the pure-contract tests below carry the always-on coverage.

Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.2
Requirements: R7.1-R7.2, R15.3-R15.7
Findings: DATA-01, DATA-02, DATA-07, DATA-10, STU-01
"""

from __future__ import annotations

from pathlib import Path

import pytest
from django.db import connection
from hypothesis import given
from hypothesis import strategies as st

from apps.common.canonical_assignment import (
    AMBIGUOUS_INTAKE,
    AMBIGUOUS_OFFERING,
    NO_INTAKE_MATCH,
    NO_OFFERING_MATCH,
    OFFERING_MISSING_CANONICAL,
    RESOLVABLE,
    classify_resolution,
    is_resolvable,
    run_invariants,
)

# ---------------------------------------------------------------------------
# Layer 1 — pure resolution contract (DB-free, always runs)
# ---------------------------------------------------------------------------


def test_unique_match_with_canonical_is_resolvable():
    assert classify_resolution(
        offering_candidates=1, intake_candidates=1, offering_has_canonical=True
    ) == RESOLVABLE
    assert is_resolvable(
        offering_candidates=1, intake_candidates=1, offering_has_canonical=True
    )


def test_zero_offering_is_no_offering_match():
    assert classify_resolution(
        offering_candidates=0, intake_candidates=1, offering_has_canonical=True
    ) == NO_OFFERING_MATCH


def test_multiple_offerings_is_ambiguous():
    assert classify_resolution(
        offering_candidates=2, intake_candidates=1, offering_has_canonical=True
    ) == AMBIGUOUS_OFFERING


def test_zero_intake_is_no_intake_match():
    assert classify_resolution(
        offering_candidates=1, intake_candidates=0, offering_has_canonical=True
    ) == NO_INTAKE_MATCH


def test_multiple_intakes_is_ambiguous():
    assert classify_resolution(
        offering_candidates=1, intake_candidates=3, offering_has_canonical=True
    ) == AMBIGUOUS_INTAKE


def test_unique_match_without_canonical_is_offering_missing_canonical():
    assert classify_resolution(
        offering_candidates=1, intake_candidates=1, offering_has_canonical=False
    ) == OFFERING_MISSING_CANONICAL


def test_offering_precedence_beats_intake_and_canonical():
    # off_c==0 dominates regardless of intake / canonical state (mirrors SQL CASE).
    assert classify_resolution(
        offering_candidates=0, intake_candidates=0, offering_has_canonical=False
    ) == NO_OFFERING_MATCH


def test_negative_counts_rejected():
    with pytest.raises(ValueError):
        classify_resolution(
            offering_candidates=-1, intake_candidates=1, offering_has_canonical=True
        )


@given(
    off=st.integers(min_value=0, max_value=6),
    intk=st.integers(min_value=0, max_value=6),
    canon=st.booleans(),
)
def test_property_resolvable_iff_unique_and_canonical(off, intk, canon):
    """RESOLVABLE exactly when one offering + one intake + a canonical link."""
    result = classify_resolution(
        offering_candidates=off, intake_candidates=intk, offering_has_canonical=canon
    )
    assert (result == RESOLVABLE) == (off == 1 and intk == 1 and canon)
    # Total + deterministic: always a non-empty string, stable across calls.
    assert isinstance(result, str) and result
    assert result == classify_resolution(
        offering_candidates=off, intake_candidates=intk, offering_has_canonical=canon
    )


# ---------------------------------------------------------------------------
# Layer 2 — Postgres-gated integration against the shipped SQL scripts
# ---------------------------------------------------------------------------

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
EXPAND = "2026_07_16_01_canonical_assignment_expand.sql"
BACKFILL = "2026_07_16_02_canonical_assignment_backfill.sql"
VALIDATE = "2026_07_16_03_canonical_assignment_validate.sql"

pg_only = pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="canonical-assignment SQL uses DO blocks / jsonb / VALIDATE CONSTRAINT; "
           f"active backend is {connection.vendor!r}. Pure-contract tests above cover the logic.",
)


def _apply_script(name: str) -> None:
    from apps.common.management.commands.apply_sql_migrations import _split_sql_statements

    sql = (SCRIPTS_DIR / name).read_text()
    with connection.cursor() as cursor:
        # pytest-django wraps each test in a transaction and Django's FKs are
        # DEFERRABLE INITIALLY DEFERRED, so the fixture INSERTs leave pending
        # trigger events. Postgres refuses ALTER TABLE (the expand script's
        # ADD COLUMN / ADD CONSTRAINT) while such events are pending. Force the
        # deferred FK checks to run now so the DDL can proceed. This is a
        # test-transaction artifact only: on Neon and via apply_sql_migrations
        # each script runs in its own committed transaction with no pending
        # trigger events, so no such statement is needed in production.
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        for statement in _split_sql_statements(sql):
            cursor.execute(statement)


def _legacy_app(*, institution, canonical_program, offering, intake, student,
                status, program_str, institution_str, intake_str):
    """A pre-migration legacy application: NULL canonical IDs, display strings set."""
    from apps.applications.models import Application
    from tests.tenant_fixtures import build_application

    app = build_application(
        student=student, institution=institution, canonical_program=canonical_program,
        offering=offering, intake=intake, with_canonical_ids=False, status=status,
    )
    Application.objects.filter(id=app.id).update(
        program=program_str, institution=institution_str, intake=intake_str
    )
    return Application.objects.get(id=app.id)


@pg_only
@pytest.mark.django_db
def test_scripts_backfill_resolvable_and_quarantine_the_rest():
    from apps.applications.models import Application
    from apps.catalog.models import CanonicalProgram, Program
    from tests.tenant_fixtures import (
        build_canonical_program,
        build_institution,
        build_intake,
        build_offering,
        build_profile,
    )

    # --- resolvable world (institution matched by CODE, offering by name) -----
    inst_a = build_institution(suffix="ra")
    canon_a = build_canonical_program(suffix="ra")
    off_a = build_offering(institution=inst_a, canonical_program=canon_a, suffix="ra",
                           name="Diploma In Registered Nursing")
    intake_a = build_intake(suffix="ra", name="July 2026 Intake")
    stu = build_profile(role="student", suffix="ra")
    app_ok = _legacy_app(
        institution=inst_a, canonical_program=canon_a, offering=off_a, intake=intake_a,
        student=stu, status="submitted",
        program_str="diploma in registered nursing",  # ci match
        institution_str=inst_a.code,                   # code match
        intake_str="July 2026 Intake",
    )

    # --- ambiguous offering (two offerings share a name in one institution) ---
    off_dup1 = build_offering(institution=inst_a, canonical_program=canon_a, suffix="d1",
                              name="Ambiguous Program")
    build_offering(institution=inst_a, canonical_program=canon_a, suffix="d2",
                   name="Ambiguous Program")
    app_amb = _legacy_app(
        institution=inst_a, canonical_program=canon_a, offering=off_dup1, intake=intake_a,
        student=stu, status="submitted",
        program_str="Ambiguous Program", institution_str=inst_a.code,
        intake_str="July 2026 Intake",
    )

    # --- no offering match -----------------------------------------------------
    app_nomatch = _legacy_app(
        institution=inst_a, canonical_program=canon_a, offering=off_a, intake=intake_a,
        student=stu, status="under_review",
        program_str="No Such Program", institution_str=inst_a.code,
        intake_str="July 2026 Intake",
    )

    # --- offering with no canonical link (fail-closed, task 5.1 owns the fix) --
    inst_b = build_institution(suffix="rb")
    canon_b = build_canonical_program(suffix="rb")
    off_nc = build_offering(institution=inst_b, canonical_program=canon_b, suffix="rb",
                            name="Uncanonical Offering")
    Program.objects.filter(id=off_nc.id).update(canonical_program=None)
    intake_b = build_intake(suffix="rb", name="January 2027 Intake")
    app_missing_canon = _legacy_app(
        institution=inst_b, canonical_program=canon_b, offering=off_nc, intake=intake_b,
        student=stu, status="approved",
        program_str="Uncanonical Offering", institution_str=inst_b.name,
        intake_str="January 2027 Intake",
    )

    # --- draft with nulls + no match: exempt, never quarantined ----------------
    app_draft = _legacy_app(
        institution=inst_a, canonical_program=canon_a, offering=off_a, intake=intake_a,
        student=stu, status="draft",
        program_str="Whatever", institution_str="Whatever", intake_str="Whatever",
    )

    _apply_script(EXPAND)
    _apply_script(BACKFILL)
    _apply_script(VALIDATE)

    # ``assignment_quarantined`` is added by the expand SQL script and is
    # intentionally NOT a mapped field on the Application model: mapping it
    # would put the column in every ORM SELECT and break application reads on
    # any database where task 3.2 has not been applied yet (production, Neon
    # default). Read it via raw SQL, exactly as the exception ledger is read.
    def _is_quarantined(app_id) -> bool:
        with connection.cursor() as cur:
            cur.execute(
                "SELECT assignment_quarantined FROM applications WHERE id = %s",
                [str(app_id)],
            )
            return bool(cur.fetchone()[0])

    def _reason(app_id):
        with connection.cursor() as cur:
            cur.execute(
                "SELECT reason_code FROM canonical_assignment_exceptions "
                "WHERE application_id = %s AND resolved = false",
                [str(app_id)],
            )
            rows = cur.fetchall()
        return {r[0] for r in rows}

    # resolvable row fully backfilled + not quarantined
    app_ok.refresh_from_db()
    assert app_ok.institution_ref_id == inst_a.id
    assert app_ok.program_offering_id == off_a.id
    assert app_ok.canonical_program_id == canon_a.id
    assert app_ok.intake_ref_id == intake_a.id
    assert _is_quarantined(app_ok.id) is False

    for app, expected in [
        (app_amb, AMBIGUOUS_OFFERING),
        (app_nomatch, NO_OFFERING_MATCH),
        (app_missing_canon, OFFERING_MISSING_CANONICAL),
    ]:
        app.refresh_from_db()
        assert _is_quarantined(app.id) is True, f"{expected} row should be quarantined"
        assert expected in _reason(app.id), f"expected ledger reason {expected}"

    # draft exempt: not quarantined, still unresolved, no ledger row
    app_draft.refresh_from_db()
    assert _is_quarantined(app_draft.id) is False
    assert app_draft.canonical_program_id is None
    assert _reason(app_draft.id) == set()

    # post-state invariant gate: every count must be 0
    with connection.cursor() as cur:
        invariants = run_invariants(cur)
    assert invariants == {
        "nondraft_nonquarantined_missing": 0,
        "dangling": 0,
        "quarantined_without_ledger": 0,
    }, invariants


@pg_only
@pytest.mark.django_db
def test_check_constraint_and_fks_are_validated_after_scripts():
    """Reuse the task 3.1 manifest verifier to prove the constraints validate."""
    from apps.common.schema_manifest import build_manifest_from_connection

    _apply_script(EXPAND)
    _apply_script(BACKFILL)
    _apply_script(VALIDATE)

    manifest = build_manifest_from_connection(connection, label="task-3.2-test")
    apps_table = manifest["tables"]["applications"]

    # The non-null-for-active CHECK exists and is validated.
    checks = {c["name"]: c for c in apps_table["check_constraints"]}
    assert "chk_applications_canonical_assignment" in checks
    assert checks["chk_applications_canonical_assignment"]["validated"] is True

    # No unvalidated FK remains on applications (R15.4).
    for fk in apps_table["foreign_keys"]:
        assert fk["validated"] is True, f"unvalidated FK {fk['name']}"

    # The ledger table exists with its FK back to applications.
    assert "canonical_assignment_exceptions" in manifest["tables"]


@pg_only
@pytest.mark.django_db
def test_backfill_is_idempotent():
    from tests.tenant_fixtures import (
        build_canonical_program,
        build_institution,
        build_intake,
        build_offering,
        build_profile,
    )

    inst = build_institution(suffix="idem")
    canon = build_canonical_program(suffix="idem")
    off = build_offering(institution=inst, canonical_program=canon, suffix="idem",
                         name="Idempotent Program")
    intake = build_intake(suffix="idem", name="Idempotent Intake")
    stu = build_profile(role="student", suffix="idem")
    _legacy_app(  # one resolvable, one ambiguous-by-no-match
        institution=inst, canonical_program=canon, offering=off, intake=intake,
        student=stu, status="submitted", program_str="Idempotent Program",
        institution_str=inst.code, intake_str="Idempotent Intake",
    )
    _legacy_app(
        institution=inst, canonical_program=canon, offering=off, intake=intake,
        student=stu, status="submitted", program_str="Ghost Program",
        institution_str=inst.code, intake_str="Idempotent Intake",
    )

    _apply_script(EXPAND)
    _apply_script(BACKFILL)

    def _ledger_count():
        with connection.cursor() as cur:
            cur.execute("SELECT count(*) FROM canonical_assignment_exceptions")
            return cur.fetchone()[0]

    first = _ledger_count()
    _apply_script(BACKFILL)  # re-run
    second = _ledger_count()
    assert first == second == 1, (first, second)


# ---------------------------------------------------------------------------
# Layer 3 — release-gate CLI wiring
# (schema_manifest --verify-canonical-assignment). Proves the task 3.2 post-state
# data invariants are consumed by the task 3.1 release-gate verifier rather than
# living only in the evidence inventory.sql. The absent-case tests are backend-
# agnostic (they run in every CI profile); the applied-case test is Postgres-gated.
# ---------------------------------------------------------------------------


@pytest.mark.django_db
def test_release_gate_skips_when_remediation_absent():
    """Before task 3.2 is applied, the data-invariant gate is a no-op skip (exit 0)."""
    from io import StringIO

    from django.core.management import call_command

    out = StringIO()
    call_command("schema_manifest", verify_canonical_assignment=True, stdout=out, stderr=out)
    assert "SKIP" in out.getvalue()


@pytest.mark.django_db
def test_release_gate_require_applied_fails_when_absent():
    """--require-applied turns the absent case into a hard gate failure (exit 1)."""
    from io import StringIO

    from django.core.management import call_command

    out = StringIO()
    with pytest.raises(SystemExit) as exc:
        call_command(
            "schema_manifest",
            verify_canonical_assignment=True,
            require_applied=True,
            stdout=out,
            stderr=out,
        )
    assert exc.value.code == 1
    assert "FAIL" in out.getvalue()


@pg_only
@pytest.mark.django_db
def test_release_gate_passes_after_scripts_when_invariants_zero():
    """After expand+backfill+validate the CLI gate reports every invariant zero."""
    from io import StringIO

    from django.core.management import call_command

    _apply_script(EXPAND)
    _apply_script(BACKFILL)
    _apply_script(VALIDATE)

    out = StringIO()
    call_command("schema_manifest", verify_canonical_assignment=True, stdout=out, stderr=out)
    output = out.getvalue()
    assert "OK: canonical-assignment post-state invariants all zero" in output
    assert "nondraft_nonquarantined_missing=0" in output


@pg_only
@pytest.mark.django_db
def test_release_gate_fails_on_seeded_violation_then_passes_after_remediation():
    """The gate FAILS on a seeded data violation, then PASSES once it is remediated.

    Models the real half-applied failure mode: the remediation *objects* are
    present (expand ran) but a non-draft application has not yet been
    resolved-or-quarantined by the backfill, so it is missing canonical IDs and
    is not quarantined — ``nondraft_nonquarantined_missing`` is non-zero and the
    release gate MUST exit non-zero (DRIFT), not pass. Running the backfill (which
    quarantines the unresolvable row into the ledger) and validate then drives
    every invariant back to zero and the same gate PASSES clean on the same data.

    The violating row is seeded BEFORE expand so the NOT VALID CHECK does not
    reject the insert; expand does not scan existing rows, so the violation
    survives until the backfill acts on it.
    """
    from io import StringIO

    from django.core.management import call_command
    from tests.tenant_fixtures import (
        build_canonical_program,
        build_institution,
        build_intake,
        build_offering,
        build_profile,
    )

    inst = build_institution(suffix="viol")
    canon = build_canonical_program(suffix="viol")
    off = build_offering(institution=inst, canonical_program=canon, suffix="viol",
                         name="Violation Program")
    intake = build_intake(suffix="viol", name="Violation Intake")
    stu = build_profile(role="student", suffix="viol")
    # Non-draft legacy row whose display strings match NO offering ('Ghost
    # Program'): the backfill will quarantine it as no_offering_match. Created
    # before expand so it starts unresolved AND unquarantined.
    _legacy_app(
        institution=inst, canonical_program=canon, offering=off, intake=intake,
        student=stu, status="submitted", program_str="Ghost Program",
        institution_str=inst.code, intake_str="Violation Intake",
    )

    _apply_script(EXPAND)  # objects present; backfill intentionally NOT run yet

    fail_out = StringIO()
    with pytest.raises(SystemExit) as exc:
        call_command("schema_manifest", verify_canonical_assignment=True,
                     stdout=fail_out, stderr=fail_out)
    assert exc.value.code == 1
    failure = fail_out.getvalue()
    assert "DRIFT" in failure
    assert "nondraft_nonquarantined_missing = 1" in failure

    # Remediate: backfill quarantines the unresolvable row into the ledger, then
    # validate switches the CHECK/FKs on. The same gate now passes clean.
    _apply_script(BACKFILL)
    _apply_script(VALIDATE)

    pass_out = StringIO()
    call_command("schema_manifest", verify_canonical_assignment=True,
                 stdout=pass_out, stderr=pass_out)
    passed = pass_out.getvalue()
    assert "OK: canonical-assignment post-state invariants all zero" in passed
    assert "nondraft_nonquarantined_missing=0" in passed
