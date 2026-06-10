"""Tenant migration idempotency exploration tests (P16).

Spec: ``multi-tenant-beanola-admissions`` — Phase 0 exploration baseline.
Pins migration safety:

    P16 The additive tenant migration is idempotent (re-applying is a no-op)
        and the backfill is idempotent; legacy null-ID applications remain
        readable and new applications write all four canonical IDs.

Per task 1.10, the full idempotency assertions require a **real Postgres
branch**. Applying ``0001_multi_tenant_beanola_admissions.sql`` against a live
database is gated behind an explicit opt-in (``TENANT_MIGRATION_NEON_BRANCH``)
so this exploration suite can never apply the migration against the production
Neon database configured in ``.env``. When that opt-in is absent — the default
in this checkout — every assertion that needs a live database is **skipped with
a clear reason** and deferred to Phase 1 (task 3.5), which applies the
migration on a dedicated Neon branch after a backup and dry-run.

When ``TENANT_MIGRATION_NEON_BRANCH`` is set against a real Postgres branch the
suite executes the actual P16 properties:

    * re-applying the whole migration script changes nothing (schema columns,
      indexes, and constraints are identical between the first and second
      application); and
    * re-running the backfill is idempotent (a legacy null-ID application is
      linked exactly once, the four canonical IDs do not change on a second
      pass thanks to the ``COALESCE`` guards, and ``ON CONFLICT (code) DO
      UPDATE`` never duplicates ``canonical_programs``).

**Validates: Requirements R9.1, R14.7**
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest
from django.db import connection


# Resolve ``backend/scripts/2026_06_08_01_multi_tenant_beanola_admissions.sql``
# from this test file location (backend/tests/unit/ -> backend/). The tenant
# migration was relocated out of the excluded ``scripts/migrations/`` directory
# to the top-level deployable path so ``apply_sql_migrations`` discovers it.
_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
_TENANT_MIGRATION = (
    _BACKEND_ROOT / "scripts" / "2026_06_08_01_multi_tenant_beanola_admissions.sql"
)


# ---------------------------------------------------------------------------
# Real-Postgres availability probe (collection-time, no DB connection opened)
# ---------------------------------------------------------------------------


def _real_postgres_branch_available() -> tuple[bool, str]:
    """Return ``(available, skip_reason)`` for the live-migration assertions.

    Evaluated at import/collection time. It never opens a database connection
    (``connection.vendor`` reads the configured engine string only), so
    collection stays clean even when no database is reachable.

    Applying the migration requires an **explicit** opt-in via the
    ``TENANT_MIGRATION_NEON_BRANCH`` environment variable. This guards against
    ever applying ``0001_multi_tenant_beanola_admissions.sql`` against the
    production Neon database that ``.env`` points at — Phase 1 (task 3.5) sets
    the opt-in only after branching, backing up, and dry-running.
    """
    opt_in = os.environ.get("TENANT_MIGRATION_NEON_BRANCH", "").strip().lower()
    if opt_in in ("", "0", "false", "no", "off"):
        return False, (
            "P16 migration idempotency is deferred to Phase 1 (task 3.5): set "
            "TENANT_MIGRATION_NEON_BRANCH=1 against a dedicated Neon branch "
            "(after backup + dry-run) to run the real re-apply/backfill assertions. "
            "Applying the migration is never attempted against the production "
            "database configured in .env."
        )
    if connection.vendor != "postgresql":
        return False, (
            "P16 migration idempotency requires PostgreSQL; the configured test "
            f"database vendor is '{connection.vendor}'. Deferred to Phase 1 (task 3.5)."
        )
    return True, ""


_PG_AVAILABLE, _PG_SKIP_REASON = _real_postgres_branch_available()

# A single gate shared by **every** test in this module. The whole P16 suite is
# treated as one unit that is deferred to Phase 1 (task 3.5) until a real
# Postgres branch is opted into. Gating via a marker (not inside the test body)
# matters for a second reason in this repo: the session-scoped autouse
# ``unmanaged_schema`` fixture in ``conftest.py`` opens a real database
# connection, so *any* executed test errors when no database is reachable.
# Because pytest evaluates skip markers before triggering that fixture, marking
# the entire module skipped keeps the file clean (a tidy "skipped", never an
# error) in a database-less checkout, while still running in full — including
# the cheap filesystem guards below — on a Neon branch where the opt-in is set.
_requires_real_pg = pytest.mark.skipif(
    not _PG_AVAILABLE,
    reason=_PG_SKIP_REASON or "real Postgres branch required for P16 migration idempotency",
)

# Apply the gate to the whole module. See the note above: skip markers are
# evaluated before the autouse ``unmanaged_schema`` fixture, so a module-level
# skip yields a clean "skipped" outcome in a database-less checkout instead of
# fixture-setup errors.
pytestmark = _requires_real_pg


# Tenant tables (new) plus pre-existing tables the migration extends with new
# nullable columns / indexes / constraints. Used to fingerprint the schema.
_TENANT_TABLES = (
    "canonical_programs",
    "institution_assets",
    "institution_document_templates",
    "institution_required_documents",
    "institution_domains",
    "user_institution_memberships",
    "access_grants",
    "programs",
    "institutions",
    "applications",
    "program_intakes",
    "intakes",
)


def _apply_migration(cursor) -> None:
    """Execute the entire tenant migration script in one call.

    psycopg2 runs every ``;``-separated statement (including the ``DO $$ ... $$``
    block) in a single ``execute`` call, so this faithfully replays the
    operator-applied migration.
    """
    cursor.execute(_TENANT_MIGRATION.read_text())


def _ensure_canonical_programs_db_default(cursor) -> None:
    """Compensate for the test harness creating ``canonical_programs`` from the model.

    In production the migration's ``CREATE TABLE canonical_programs (... id uuid
    PRIMARY KEY DEFAULT gen_random_uuid() ...)`` establishes the DB-level UUID
    default, and the backfill ``INSERT`` (which omits ``id``) relies on it. In
    the test DB the ``managed=False`` table is created ahead of time by the
    ``unmanaged_schema`` conftest fixture from the Django model, whose UUID
    default is Python-side only — so the column has no DB default and the
    migration's ``CREATE TABLE IF NOT EXISTS`` is a no-op. Set the DB default
    here so the migration's id-less INSERT behaves exactly as it does in
    production. Harmless no-op on a real branch where the migration already set
    it.
    """
    cursor.execute(
        "ALTER TABLE canonical_programs ALTER COLUMN id SET DEFAULT gen_random_uuid()"
    )


def _apply_migration_immediate_fks(cursor) -> None:
    """Apply the migration with FK checks forced immediate (test-harness only).

    Production safety of the whole-file single-transaction apply was confirmed
    directly on a Neon branch: the migration's ``ADD COLUMN`` + backfill
    ``UPDATE`` + ``CREATE INDEX`` + ``ADD CONSTRAINT`` all run in one
    transaction against *committed* production-copy data with no error. The
    reason it is safe there is that production has **no tenant FK constraints
    on ``applications``/``programs`` until the migration's final ``DO`` block
    adds them (as ``NOT VALID``)** — so the backfill ``UPDATE`` queues no
    FK-check trigger events and the ``CREATE INDEX`` is unobstructed.

    The pytest harness differs: the ``unmanaged_schema`` conftest fixture
    creates the tenant tables from the Django models via
    ``schema_editor.create_model``, which materialises the model's FKs as
    ``DEFERRABLE INITIALLY DEFERRED`` constraints **before** the migration
    runs. The migration's backfill ``UPDATE`` then queues deferred FK-check
    events, and Postgres refuses the following ``CREATE INDEX`` /
    ``ADD CONSTRAINT`` with "cannot ... because it has pending trigger events".

    Forcing ``SET CONSTRAINTS ALL IMMEDIATE`` *inside the migration's own
    transaction* (by prepending it to the script) makes those FK checks fire
    per-statement instead of deferring, so no events are pending when
    ``CREATE INDEX`` runs — reproducing the production sequencing. Run as the
    first statement of the same ``execute`` call so it shares the transaction.
    """
    cursor.execute("SET CONSTRAINTS ALL IMMEDIATE;\n" + _TENANT_MIGRATION.read_text())


def _schema_fingerprint(cursor) -> dict:
    """Capture a comparable snapshot of tenant columns, indexes, constraints."""
    cursor.execute(
        """
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = ANY(%s)
        ORDER BY table_name, column_name
        """,
        [list(_TENANT_TABLES)],
    )
    columns = cursor.fetchall()

    cursor.execute(
        """
        SELECT tablename, indexname
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = ANY(%s)
        ORDER BY tablename, indexname
        """,
        [list(_TENANT_TABLES)],
    )
    indexes = cursor.fetchall()

    cursor.execute(
        """
        SELECT conname
        FROM pg_constraint
        WHERE connamespace = (SELECT oid FROM pg_namespace WHERE nspname = current_schema())
        ORDER BY conname
        """
    )
    constraints = cursor.fetchall()

    return {"columns": columns, "indexes": indexes, "constraints": constraints}


class TestTenantMigrationFilePresent:
    """The additive tenant migration script exists on disk.

    These are pure filesystem assertions with no database dependency. They are
    nonetheless gated by the module-level ``pytestmark`` so the entire P16 suite
    behaves as one Phase-1-deferred unit in a database-less checkout (see the
    module docstring). On a real Neon branch (opt-in set) they run and pass.

    **Validates: Requirements R9.1**
    """

    def test_migration_file_exists(self):
        assert _TENANT_MIGRATION.is_file(), (
            f"Expected tenant migration at {_TENANT_MIGRATION}"
        )

    def test_migration_is_additive_only(self):
        """The migration script contains no destructive DDL.

        R9.1 requires the migration to be additive: new tables, nullable
        columns, and indexes only. A grep-style guard keeps it honest without
        needing a database.
        """
        sql = _TENANT_MIGRATION.read_text().upper()
        for forbidden in ("DROP TABLE", "DROP COLUMN", "TRUNCATE ", "DELETE FROM "):
            assert forbidden not in sql, (
                f"Migration must be additive but contains destructive DDL: {forbidden!r}"
            )


@pytest.mark.django_db
class TestTenantTablesReachable:
    """The ``managed=False`` tenant tables are reachable on a real branch.

    **Validates: Requirements R9.1, R14.7**
    """

    def test_canonical_programs_table_queryable(self):
        from apps.catalog.models import CanonicalProgram

        assert CanonicalProgram.objects.count() >= 0


@pytest.mark.django_db
class TestTenantMigrationIdempotency:
    """P16: re-applying the migration and backfill is a no-op (Postgres only).

    **Validates: Requirements R9.1, R14.7**
    """

    def test_reapplying_migration_is_noop(self):
        """Applying the migration a second time changes nothing.

        The first application brings the schema to the migration's target
        state; the second must be a strict no-op. Idempotency is the property
        ``f(f(x)) == f(x)`` over the schema fingerprint (columns, indexes,
        constraints).
        """
        with connection.cursor() as cursor:
            _apply_migration(cursor)
            before = _schema_fingerprint(cursor)
            _apply_migration(cursor)
            after = _schema_fingerprint(cursor)

        assert before == after, "Re-applying the tenant migration mutated the schema"

    @pytest.mark.django_db(transaction=True)
    def test_backfill_is_idempotent(self):
        """The backfill links a legacy row exactly once and never re-mutates it.

        Runs under ``transaction=True`` so the fixture rows are *committed*
        before the migration script executes — mirroring production, where
        ``apply_sql_migrations`` runs the whole file in one ``transaction.atomic``
        against already-committed data. Without a real commit, pytest-django's
        wrapping transaction leaves the fixture INSERTs as pending FK-check
        trigger events, and Postgres refuses the migration's
        ``ALTER TABLE ... ADD CONSTRAINT`` with "cannot ALTER TABLE because it
        has pending trigger events" — a test-harness artifact that never occurs
        in production.

        A legacy application carries null canonical IDs and legacy string
        snapshots aligned (by name, case-insensitively) to its institution,
        offering, and intake. The migration backfill must:

          * populate all four canonical IDs on the first application; and
          * leave them unchanged on a second application (``COALESCE`` guards);
            and
          * never duplicate ``canonical_programs`` (``ON CONFLICT (code) DO
            UPDATE``).
        """
        from tests.tenant_fixtures import (
            build_application,
            build_canonical_program,
            build_institution,
            build_intake,
            build_offering,
            build_profile,
            build_program_intake,
        )

        sfx = uuid.uuid4().hex[:8]
        institution = build_institution(suffix=sfx)
        canonical = build_canonical_program(suffix=sfx)
        offering = build_offering(
            institution=institution, canonical_program=canonical, suffix=sfx
        )
        intake = build_intake(suffix=sfx)
        build_program_intake(offering=offering, intake=intake)
        student = build_profile(role="student", suffix=f"stu-{sfx}")

        # Legacy application: null canonical IDs; legacy ``program`` string is
        # overridden to the *offering* name so the migration's name-based
        # backfill (lower(programs.name) = lower(applications.program)) links it.
        # ``institution`` and ``intake`` legacy snapshots already default to the
        # institution/intake names, which the backfill also matches on.
        application = build_application(
            student=student,
            institution=institution,
            canonical_program=canonical,
            offering=offering,
            intake=intake,
            suffix=sfx,
            with_canonical_ids=False,
            program=offering.name,
        )

        select_ids = (
            "SELECT institution_id, program_id, program_offering_id, intake_id "
            "FROM applications WHERE id = %s"
        )

        with connection.cursor() as cursor:
            _ensure_canonical_programs_db_default(cursor)
            _apply_migration_immediate_fks(cursor)
            cursor.execute(select_ids, [str(application.id)])
            first = cursor.fetchone()
            cursor.execute("SELECT count(*) FROM canonical_programs")
            canon_count_first = cursor.fetchone()[0]

            _apply_migration_immediate_fks(cursor)
            cursor.execute(select_ids, [str(application.id)])
            second = cursor.fetchone()
            cursor.execute("SELECT count(*) FROM canonical_programs")
            canon_count_second = cursor.fetchone()[0]

        # First pass linked all four canonical IDs.
        assert all(value is not None for value in first), (
            f"Backfill failed to link legacy application: {first}"
        )
        # Expected canonical targets.
        assert str(first[0]) == str(institution.id)
        assert str(first[1]) == str(canonical.id)
        assert str(first[2]) == str(offering.id)
        assert str(first[3]) == str(intake.id)
        # Second pass changed nothing (COALESCE guards make backfill idempotent).
        assert first == second, "Re-running the backfill mutated canonical IDs"
        # ON CONFLICT (code) DO UPDATE never duplicates canonical_programs.
        assert canon_count_first == canon_count_second, (
            "Re-running the backfill duplicated canonical_programs rows"
        )

    @pytest.mark.django_db(transaction=True)
    def test_legacy_null_id_application_remains_readable(self):
        """A pre-migration row whose strings do not match stays null but readable.

        R9.5 / R14.7: legacy applications that cannot be linked must remain
        readable (their canonical IDs stay null and they are reported, never
        dropped or errored).

        Runs under ``transaction=True`` (committed fixtures) for the same
        reason as ``test_backfill_is_idempotent``: the migration's
        ``ADD CONSTRAINT`` phase cannot run while fixture INSERTs are pending
        FK-check trigger events inside pytest-django's wrapping transaction.
        """
        from apps.applications.models import Application
        from tests.tenant_fixtures import (
            build_application,
            build_canonical_program,
            build_institution,
            build_intake,
            build_offering,
            build_profile,
            build_program_intake,
        )

        sfx = uuid.uuid4().hex[:8]
        institution = build_institution(suffix=sfx)
        canonical = build_canonical_program(suffix=sfx)
        offering = build_offering(
            institution=institution, canonical_program=canonical, suffix=sfx
        )
        intake = build_intake(suffix=sfx)
        build_program_intake(offering=offering, intake=intake)
        student = build_profile(role="student", suffix=f"stu-{sfx}")

        application = build_application(
            student=student,
            institution=institution,
            canonical_program=canonical,
            offering=offering,
            intake=intake,
            suffix=sfx,
            with_canonical_ids=False,
        )
        # Force the legacy string snapshots to values that match no real
        # institution/program/intake so the name-based backfill cannot link
        # them. (``institution`` / ``intake`` are reserved parameter names on
        # ``build_application`` for the model objects, so the legacy string
        # columns of the same name are set here directly.)
        Application.objects.filter(id=application.id).update(
            institution="No Such School",
            program="No Such Program",
            intake="No Such Intake",
        )

        with connection.cursor() as cursor:
            _ensure_canonical_programs_db_default(cursor)
            _apply_migration_immediate_fks(cursor)

        refreshed = Application.objects.get(id=application.id)
        # Canonical IDs remain null (ambiguous / unmatched legacy row)...
        assert refreshed.institution_ref_id is None
        assert refreshed.canonical_program_id is None
        assert refreshed.program_offering_id is None
        assert refreshed.intake_ref_id is None
        # ...but the row is still readable via its legacy snapshot fields.
        assert refreshed.institution == "No Such School"
        assert refreshed.program == "No Such Program"
        assert refreshed.intake == "No Such Intake"
