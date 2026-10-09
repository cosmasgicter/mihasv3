"""Task 3.3 — catalog/fee/grant/template/waitlist/capacity integrity constraints.

Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.3
Requirements: R5.6, R6.7, R7.4-R7.7, R15.5
Findings: TEN-08, DATA-02, DATA-03, DATA-05, DATA-06
Evidence: docs/v2-evidence/3.3/

Two layers, matching the repo convention (e.g.
``test_schema_manifest_introspection.py``):

* Always-on, DB-free: the forward + rollback scripts are structurally
  idempotent and additive-only-lint clean (so ``apply_sql_migrations`` accepts
  them and re-running is a no-op).
* ``@pg_only`` (Postgres): constraint *introspection* via the task-3.1 schema
  manifest (Required_Evidence), per-constraint duplicate/negative rejection,
  null-safe uniqueness, canonical-only waitlist scoping, and a genuinely
  *concurrent* last-seat/duplicate proof (Required_Evidence).

The ``@pg_only`` tests need the constraints the SQL scripts add; on the
ephemeral test DB those are mirrored by ``tests/conftest.py::unmanaged_schema``
(the SQL scripts themselves are proven on the Neon rehearsal branch — see the
evidence folder).
"""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal
from pathlib import Path

import pytest
from django.db import IntegrityError, connection, transaction
from django.utils import timezone

from tests.tenant_fixtures import (
    build_application,
    build_canonical_program,
    build_institution,
    build_intake,
    build_offering,
    build_profile,
)

pg_only = pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason=f"Postgres-only integrity constraints; active backend is {connection.vendor!r}.",
)

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
EXPAND = SCRIPTS_DIR / "2026_07_17_01_integrity_constraints_expand.sql"
SWITCH = SCRIPTS_DIR / "2026_07_17_02_communication_template_unique_switch.sql"
EXPAND_RB = SCRIPTS_DIR / "2026_07_17_01_integrity_constraints_expand_rollback.sql"
SWITCH_RB = SCRIPTS_DIR / "2026_07_17_02_communication_template_unique_switch_rollback.sql"

EXPECTED_UNIQUE_INDEXES = {
    "uq_program_fees_one_active",
    "uq_access_grants_active_institution",
    "uq_access_grants_active_program",
    "uq_access_grants_active_application",
    "uq_doc_profiles_scope_version",
    "uq_comm_templates_key_inst_version",
    "uq_comm_templates_one_active",
    "uq_applications_waitlist_position",
}
EXPECTED_CHECKS = {
    "chk_program_intakes_capacity_nonneg",
    "chk_program_intakes_enrollment_nonneg",
    "chk_intakes_capacity_nonneg",
    "chk_intakes_enrollment_nonneg",
    "chk_access_grants_scope_target",
}


def _u() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Always-on: script hygiene (idempotent + additive-only-lint clean)
# ---------------------------------------------------------------------------


class TestScriptHygiene:
    def test_all_four_scripts_exist(self):
        for path in (EXPAND, SWITCH, EXPAND_RB, SWITCH_RB):
            assert path.exists(), f"missing script: {path.name}"

    def test_forward_scripts_pass_the_additive_only_lint(self):
        """The runner rejects DROP COLUMN / DROP TABLE / TRUNCATE / unqualified
        DELETE / narrowing ALTER TYPE. The forward scripts must be clean so the
        boot sweep applies them without ``--allow-non-additive`` (DROP
        CONSTRAINT on the superseded global unique is intentionally NOT flagged
        by that lint — it is the design's expand→switch step)."""
        from apps.common.management.commands.apply_sql_migrations import (
            _find_non_additive_violations,
        )

        for path in (EXPAND, SWITCH):
            violations = _find_non_additive_violations(path.read_text())
            assert violations == [], f"{path.name} tripped additive-only lint: {violations}"

    def test_forward_scripts_are_idempotent_by_construction(self):
        """Every created object is guarded (IF NOT EXISTS / pg_constraint DO
        block) so a second application is a no-op."""
        expand = EXPAND.read_text()
        # Every CREATE INDEX in the expand script is IF NOT EXISTS.
        import re

        creates = re.findall(r"CREATE(?:\s+UNIQUE)?\s+INDEX\s+(IF NOT EXISTS)?", expand, re.IGNORECASE)
        assert creates, "expected CREATE INDEX statements in the expand script"
        assert all(flag.strip().upper() == "IF NOT EXISTS" for flag in creates), (
            "every CREATE INDEX in the expand script must be IF NOT EXISTS"
        )
        # Every ADD CONSTRAINT is behind a pg_constraint NOT EXISTS guard.
        assert expand.count("ADD CONSTRAINT") == expand.count("WHERE conname ="), (
            "every ADD CONSTRAINT must be guarded by a pg_constraint existence check"
        )
        # The switch drop is IF EXISTS.
        assert "DROP CONSTRAINT IF EXISTS" in SWITCH.read_text()

    def test_rollback_scripts_are_drop_if_exists(self):
        rb = EXPAND_RB.read_text()
        assert "DROP INDEX IF EXISTS" in rb
        assert "DROP CONSTRAINT IF EXISTS" in rb


# ---------------------------------------------------------------------------
# pg_only: constraint introspection (Required_Evidence)
# ---------------------------------------------------------------------------


@pg_only
@pytest.mark.django_db
class TestConstraintIntrospection:
    def test_manifest_reports_every_task_3_3_object(self):
        """Prove the constraints exist via the task-3.1 live schema manifest —
        the Required_Evidence 'constraint introspection'."""
        from apps.common.schema_manifest import build_manifest_from_connection

        manifest = build_manifest_from_connection(connection, label="task-3.3")
        tables = manifest["tables"]

        def index_names(table: str) -> set[str]:
            return {ix["name"] for ix in tables[table]["indexes"]}

        def check_names(table: str) -> set[str]:
            return {c["name"] for c in tables[table]["check_constraints"]}

        all_indexes = set().union(*(index_names(t) for t in tables))
        all_checks = set().union(*(check_names(t) for t in tables))

        missing_idx = EXPECTED_UNIQUE_INDEXES - all_indexes
        assert not missing_idx, f"missing unique indexes: {missing_idx}"
        missing_chk = EXPECTED_CHECKS - all_checks
        assert not missing_chk, f"missing check constraints: {missing_chk}"

        # ProgramIntake pair uniqueness exists under *some* name (Django
        # unique_together on the test DB / our uq_ index on production).
        pi_uniques = {u["definition"] for u in tables["program_intakes"]["unique_constraints"]}
        pi_indexes = {ix["definition"] for ix in tables["program_intakes"]["indexes"] if ix["unique"]}
        assert any("program_id" in d and "intake_id" in d for d in pi_uniques | pi_indexes), (
            "expected a unique on program_intakes(program_id, intake_id)"
        )

    def test_partial_and_nulls_not_distinct_predicates_are_present(self):
        """The one-active + null-safe semantics must be encoded in the index
        definitions, not merely the column list."""
        from apps.common.schema_manifest import build_manifest_from_connection

        tables = build_manifest_from_connection(connection, label="pred")["tables"]
        by_name = {
            ix["name"]: ix
            for t in tables
            for ix in tables[t]["indexes"]
        }
        # one-active fee is partial on is_active
        assert by_name["uq_program_fees_one_active"]["predicate"]
        # comm template one-active is partial + null-safe
        assert by_name["uq_comm_templates_one_active"]["predicate"]
        assert "NULLS NOT DISTINCT" in by_name["uq_comm_templates_one_active"]["definition"]
        assert "NULLS NOT DISTINCT" in by_name["uq_comm_templates_key_inst_version"]["definition"]
        assert "NULLS NOT DISTINCT" in by_name["uq_doc_profiles_scope_version"]["definition"]
        # waitlist is partial (canonical-only)
        assert by_name["uq_applications_waitlist_position"]["predicate"]


# ---------------------------------------------------------------------------
# pg_only: per-constraint rejection behaviour (ORM-based, so FK/NOT NULL parents
# are real and only the task-3.3 constraint under test can fire).
# ---------------------------------------------------------------------------


def _expect_ie(fn):
    """Assert ``fn()`` raises IntegrityError; keep the outer test tx usable."""
    with pytest.raises(IntegrityError):
        with transaction.atomic():
            fn()


@pg_only
@pytest.mark.django_db
class TestConstraintRejections:
    def test_program_intake_duplicate_pair_rejected(self):
        from apps.catalog.models import ProgramIntake

        # ProgramIntake FKs are db_constraint=False, so raw ids need no parent.
        p, i = _u(), _u()
        ProgramIntake.objects.create(id=_u(), program_id=p, intake_id=i, is_active=True)
        _expect_ie(lambda: ProgramIntake.objects.create(id=_u(), program_id=p, intake_id=i, is_active=True))

    def test_negative_capacity_counters_rejected(self):
        from apps.catalog.models import Intake, ProgramIntake

        _expect_ie(lambda: ProgramIntake.objects.create(id=_u(), program_id=_u(), intake_id=_u(), max_capacity=-1))
        _expect_ie(lambda: ProgramIntake.objects.create(id=_u(), program_id=_u(), intake_id=_u(), current_enrollment=-1))
        _expect_ie(lambda: Intake.objects.create(id=_u(), name="x", max_capacity=-1))
        # NULL capacity (unconfigured) is allowed.
        Intake.objects.create(id=_u(), name="ok", max_capacity=None)

    def test_one_active_fee_per_scope(self):
        from apps.documents.models import ProgramFee

        offering = build_offering(institution=build_institution(), canonical_program=build_canonical_program())
        ProgramFee.objects.create(
            id=_u(), program=offering, fee_type="application", residency_category="local",
            amount=Decimal("150.00"), currency="ZMW", is_active=True,
        )
        _expect_ie(lambda: ProgramFee.objects.create(
            id=_u(), program=offering, fee_type="application", residency_category="local",
            amount=Decimal("175.00"), currency="ZMW", is_active=True,
        ))
        # an inactive row for the same scope is fine (fee history)
        ProgramFee.objects.create(
            id=_u(), program=offering, fee_type="application", residency_category="local",
            amount=Decimal("175.00"), currency="ZMW", is_active=False,
        )

    def test_access_grant_scope_target_and_active_duplicate(self):
        from apps.catalog.models import AccessGrant

        user = build_profile(role="reviewer")
        institution = build_institution()
        # scope_type requires its target id (chk_access_grants_scope_target)
        _expect_ie(lambda: AccessGrant.objects.create(
            id=_u(), user=user, scope_type="institution", institution=None, is_active=True))
        _expect_ie(lambda: AccessGrant.objects.create(
            id=_u(), user=user, scope_type="bogus", institution=institution, is_active=True))
        # first active institution grant is fine
        AccessGrant.objects.create(id=_u(), user=user, scope_type="institution", institution=institution, is_active=True)
        # a second active grant for the same (user, institution) loses to the partial unique
        _expect_ie(lambda: AccessGrant.objects.create(
            id=_u(), user=user, scope_type="institution", institution=institution, is_active=True))

    def test_document_profile_version_null_safe(self):
        from apps.catalog.models import InstitutionDocumentProfile

        institution = build_institution()
        InstitutionDocumentProfile.objects.create(
            id=_u(), institution_id=institution.id, document_type="acceptance", version=1, is_active=True)
        # NULL program/canonical/intake scope treated as equal -> same version rejected.
        _expect_ie(lambda: InstitutionDocumentProfile.objects.create(
            id=_u(), institution_id=institution.id, document_type="acceptance", version=1, is_active=False))
        # a higher version in the same scope is fine
        InstitutionDocumentProfile.objects.create(
            id=_u(), institution_id=institution.id, document_type="acceptance", version=2, is_active=True)

    def test_communication_template_null_safe_version_and_one_active(self):
        from apps.common.models import CommunicationTemplate

        # Platform rows carry institution_id NULL; NULLS NOT DISTINCT keeps them constrained (TEN-08).
        CommunicationTemplate.objects.create(id=_u(), template_key="welcome", institution_id=None, version=1, is_active=True)
        _expect_ie(lambda: CommunicationTemplate.objects.create(
            id=_u(), template_key="welcome", institution_id=None, version=1, is_active=False))
        # a second *active* version for the same (key, platform) loses to one-active
        _expect_ie(lambda: CommunicationTemplate.objects.create(
            id=_u(), template_key="welcome", institution_id=None, version=2, is_active=True))
        # an inactive higher version is fine
        CommunicationTemplate.objects.create(id=_u(), template_key="welcome", institution_id=None, version=2, is_active=False)

    def test_global_template_key_unique_is_dropped(self):
        """The tenant-aware model needs several rows per key; the legacy global
        unique must be gone (TEN-08)."""
        from apps.common.models import CommunicationTemplate

        with connection.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_constraint WHERE conname='communication_templates_template_key_key'")
            assert cur.fetchone() is None
        # Same key, one platform + one institution row — allowed now.
        CommunicationTemplate.objects.create(id=_u(), template_key="shared", institution_id=None, version=1, is_active=True)
        CommunicationTemplate.objects.create(id=_u(), template_key="shared", institution_id=_u(), version=1, is_active=True)

    def test_waitlist_position_canonical_only(self):
        from apps.applications.models import Application

        institution = build_institution()
        canonical = build_canonical_program()
        offering = build_offering(institution=institution, canonical_program=canonical)
        intake = build_intake()
        build_application(
            student=build_profile(role="student"), institution=institution, canonical_program=canonical,
            offering=offering, intake=intake, status="waitlisted", waitlist_position=1,
        )
        # a second application at the same canonical (offering, intake, position) is rejected
        _expect_ie(lambda: build_application(
            student=build_profile(role="student"), institution=institution, canonical_program=canonical,
            offering=offering, intake=intake, status="waitlisted", waitlist_position=1,
        ))
        # legacy rows with NULL canonical ids are NOT constrained (pre-5.2 backfill)
        build_application(
            student=build_profile(role="student"), institution=institution, canonical_program=canonical,
            offering=offering, intake=intake, status="waitlisted", waitlist_position=1,
            with_canonical_ids=False,
        )
        build_application(
            student=build_profile(role="student"), institution=institution, canonical_program=canonical,
            offering=offering, intake=intake, status="waitlisted", waitlist_position=1,
            with_canonical_ids=False,
        )


# ---------------------------------------------------------------------------
# pg_only: concurrent duplicate / last-seat (Required_Evidence)
# ---------------------------------------------------------------------------


@pg_only
@pytest.mark.django_db(transaction=True)
class TestConcurrentRaces:
    """Genuinely concurrent inserts: the DB unique is the final race guard, so
    exactly one of N simultaneous duplicate/last-seat writers wins."""

    @staticmethod
    def _race(insert_sql_factory, workers: int = 8) -> tuple[int, int]:
        """Run ``workers`` threads that each try the same constrained insert
        behind a barrier. Returns (successes, integrity_errors)."""
        import threading

        barrier = threading.Barrier(workers)
        successes = [0]
        conflicts = [0]
        errors: list[str] = []
        lock = threading.Lock()

        def worker(idx: int):
            # Use the thread-local Django connection (the repo's proven
            # concurrency pattern, see test_reviewer_assignment_concurrency.py):
            # each worker thread gets its own autocommit connection to the test
            # DB and sees the parents committed by the main thread.
            from django.db import connection as tconn

            try:
                barrier.wait(timeout=10)
                with tconn.cursor() as cur:
                    cur.execute(insert_sql_factory(idx))  # autocommit
                with lock:
                    successes[0] += 1
            except IntegrityError as exc:
                with lock:
                    conflicts[0] += 1
                    errors.append(str(exc).splitlines()[0])
            finally:
                tconn.close()

        with ThreadPoolExecutor(max_workers=workers) as pool:
            list(pool.map(worker, range(workers)))
        return successes[0], conflicts[0], errors

    def test_concurrent_duplicate_program_intake_link(self):
        # program_intakes FKs are db_constraint=False → raw ids need no parents.
        p, i = _u(), _u()

        def factory(_idx):
            return (
                "INSERT INTO program_intakes (id, program_id, intake_id, is_active) "
                f"VALUES ('{_u()}', '{p}', '{i}', true)"
            )

        successes, conflicts, errors = self._race(factory)
        assert successes == 1, f"expected exactly one winner, got {successes}; errors={errors[:3]}"
        assert conflicts >= 1
        with connection.cursor() as cur:
            cur.execute("SELECT count(*) FROM program_intakes WHERE program_id=%s AND intake_id=%s", [p, i])
            assert cur.fetchone()[0] == 1

    def test_concurrent_last_seat_waitlist_position(self):
        """The last-seat analog: many writers race for waitlist position 1 in
        the same Intake_Offering; only one may hold it. Uses real FK parents
        (offering, intake, one profile per writer) committed before the race."""
        from apps.applications.models import Application

        institution = build_institution()
        canonical = build_canonical_program()
        offering = build_offering(institution=institution, canonical_program=canonical)
        intake = build_intake()
        workers = 8
        students = [build_profile(role="student") for _ in range(workers)]
        off, ino = str(offering.id), str(intake.id)
        now_iso = timezone.now().date().isoformat()

        def factory(idx):
            student_id = str(students[idx].id)
            appno = f"APP-RACE-{uuid.uuid4().hex[:10].upper()}"
            trk = f"TRK-{uuid.uuid4().hex[:12].upper()}"
            return (
                "INSERT INTO applications (id, program_offering_id, intake_id, waitlist_position, status, "
                "application_number, public_tracking_code, user_id, full_name, date_of_birth, sex, phone, email, "
                "residence_town, program, intake, institution, version, is_late_submission, assignment_version) "
                f"VALUES ('{_u()}', '{off}', '{ino}', 1, 'waitlisted', '{appno}', '{trk}', '{student_id}', "
                f"'Racer', '{now_iso}', 'Female', '+260970000001', 'r@example.com', 'Lusaka', 'p', 'i', 'inst', 1, false, 1)"
            )

        successes, conflicts, errors = self._race(factory, workers=workers)
        try:
            assert successes == 1, (
                f"expected exactly one seat winner, got {successes}; errors={errors[:3]}"
            )
            assert conflicts >= 1
            with connection.cursor() as cur:
                cur.execute(
                    "SELECT count(*) FROM applications WHERE program_offering_id=%s AND intake_id=%s AND waitlist_position=1",
                    [off, ino],
                )
                assert cur.fetchone()[0] == 1
        finally:
            # transaction=True does not auto-rollback committed rows; clean up.
            Application.objects.filter(program_offering_id=off).delete()


# ---------------------------------------------------------------------------
# pg_only: rollback reverses cleanly
# ---------------------------------------------------------------------------


@pg_only
@pytest.mark.django_db(transaction=True)
def test_rollback_scripts_reverse_task_3_3_objects():
    """Applying the expand-rollback removes the task-3.3 objects. Run on a
    throwaway savepoint-free transaction so DDL commits; re-mirror afterwards so
    later tests in the session still see the constraints."""
    from apps.common.schema_manifest import build_manifest_from_connection

    with connection.cursor() as cur:
        cur.execute(EXPAND_RB.read_text())
    # After rollback, none of our named unique indexes remain.
    tables = build_manifest_from_connection(connection, label="post-rb")["tables"]
    remaining = {ix["name"] for t in tables for ix in tables[t]["indexes"]}
    assert not (EXPECTED_UNIQUE_INDEXES & remaining), "rollback left task-3.3 indexes behind"

    # Re-apply the mirror so the rest of the session is unaffected.
    with connection.cursor() as cur:
        cur.execute(EXPAND.read_text())
