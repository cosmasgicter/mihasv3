"""Neon-branch idempotence integration test for the gated production cutover.

Spec: ``.kiro/specs/beanola-production-readiness/`` — Phase 3 (Component 3),
task 6.5. The non-property operator-cutover verification that complements the
live Neon validation already captured in task 6.1 (branch
``br-proud-rice-ah2b0nfg``).

What this asserts
-----------------
The gated production cutover applies four additive scripts through
``apply_sql_migrations`` (the same runner the production image executes on
boot):

    2026_06_08_01_multi_tenant_beanola_admissions.sql
    2026_06_08_03_institution_document_profiles.sql
    2026_06_08_04_communication_templates_tenant.sql
    2026_06_08_student_number.sql

R3.2 — a dry-run lists the pending cutover scripts in correct **lexical order**
and the additive-only lint passes (no ``DROP``/``TRUNCATE``/unguarded
``DELETE``).

R3.3 — applying then **re-applying** on a Neon staging branch is a strict no-op:
the second run records **no new** ``migration_history`` rows (one row per
script, unchanged across runs), and the runbook validation SQL invariants hold
(``canonical_programs`` non-zero; duplicate-hostname and duplicate-slug checks
return zero rows).

How it runs
-----------
Mirrors the ``TENANT_MIGRATION_NEON_BRANCH`` gate from
``backend/tests/unit/test_tenant_migration.py`` (P16):

* **Locally (sqlite / ``config.settings.test``)** the structure and
  runner-mechanism assertions run — the four cutover scripts are discovered in
  the right order, are additive-only, a dry-run lists them, and the runner's
  "re-apply records no new rows" mechanism is proven against a synthetic,
  vendor-portable migration set. The four real scripts use Postgres-only DDL
  (``gen_random_uuid()``, ``jsonb``, ``DO $$`` blocks), so applying them is
  **gated**.
* **On a real Neon branch** (``TENANT_MIGRATION_NEON_BRANCH`` set against a
  PostgreSQL connection) the gated class applies the four real scripts,
  re-applies them, asserts no new ``migration_history`` rows, and runs the
  validation SQL invariants. It is **never** applied to production or the Neon
  default branch — the connection must be an opt-in branch the operator points
  the settings at, exactly as the P16 suite requires.

**Validates: Requirements 3.2, 3.3**
"""

from __future__ import annotations

import os
import shutil
from io import StringIO
from pathlib import Path

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection

from apps.common.management.commands.apply_sql_migrations import (
    DEFAULT_MIGRATIONS_DIR,
    _find_non_additive_violations,
    _iter_migration_files,
)


# The four additive cutover scripts, in the lexical order the runner discovers
# them (``sorted`` by filename). ``_03`` and ``_04`` sort before ``student``
# because digits precede lowercase letters in ASCII.
CUTOVER_SCRIPTS: tuple[str, ...] = (
    "2026_06_08_01_multi_tenant_beanola_admissions.sql",
    "2026_06_08_03_institution_document_profiles.sql",
    "2026_06_08_04_communication_templates_tenant.sql",
    "2026_06_08_student_number.sql",
)


# ---------------------------------------------------------------------------
# Real-Postgres-branch availability probe (collection-time, no DB connection)
# ---------------------------------------------------------------------------


def _neon_branch_available() -> tuple[bool, str]:
    """Return ``(available, skip_reason)`` for the live-branch assertions.

    Evaluated at collection time. Reads only the configured engine string
    (``connection.vendor``) and the explicit ``TENANT_MIGRATION_NEON_BRANCH``
    opt-in — it never opens a connection. The opt-in guards against ever
    applying the cutover scripts against the production database or the Neon
    default branch that ``.env`` points at: the operator sets it only after
    branching (see ``docs/runbooks/multi-tenant-beanola-rollout.md``).
    """
    opt_in = os.environ.get("TENANT_MIGRATION_NEON_BRANCH", "").strip().lower()
    if opt_in in ("", "0", "false", "no", "off"):
        return False, (
            "Cutover idempotence on a live branch is gated: set "
            "TENANT_MIGRATION_NEON_BRANCH=1 against a dedicated Neon branch "
            "(after backup + dry-run) to run the real apply/re-apply + "
            "validation-SQL assertions. The cutover scripts are never applied "
            "to production or the Neon default branch from this environment."
        )
    if connection.vendor != "postgresql":
        return False, (
            "Cutover idempotence requires PostgreSQL; the configured database "
            f"vendor is '{connection.vendor}'. Run against a Neon branch."
        )
    return True, ""


_BRANCH_AVAILABLE, _BRANCH_SKIP_REASON = _neon_branch_available()

_requires_neon_branch = pytest.mark.skipif(
    not _BRANCH_AVAILABLE,
    reason=_BRANCH_SKIP_REASON or "real Neon branch required for cutover idempotence",
)


# ---------------------------------------------------------------------------
# migration_history DDL helpers — match the post-extend shape so the structure
# and runner-mechanism assertions run on the local SQLite test database.
# (Mirrors backend/tests/unit/test_apply_sql_migrations.py.)
# ---------------------------------------------------------------------------

_PG_EXTENDED_DDL = """
CREATE TABLE migration_history (
    id INTEGER PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY,
    migration_name TEXT NOT NULL,
    applied_at TIMESTAMPTZ NULL,
    checksum TEXT NULL,
    notes TEXT NULL
);
CREATE UNIQUE INDEX uq_migration_history_migration_name
    ON migration_history (migration_name);
"""

_SQLITE_EXTENDED_DDL = """
CREATE TABLE migration_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    migration_name TEXT NOT NULL,
    applied_at TEXT NULL,
    checksum TEXT NULL,
    notes TEXT NULL
);
CREATE UNIQUE INDEX uq_migration_history_migration_name
    ON migration_history (migration_name);
"""


def _drop_migration_history() -> None:
    with connection.cursor() as cur:
        cur.execute("DROP INDEX IF EXISTS uq_migration_history_migration_name")
        cur.execute("DROP TABLE IF EXISTS migration_history")


def _create_extended_migration_history() -> None:
    ddl = _SQLITE_EXTENDED_DDL if connection.vendor == "sqlite" else _PG_EXTENDED_DDL
    with connection.cursor() as cur:
        for statement in [s.strip() for s in ddl.split(";") if s.strip()]:
            cur.execute(statement)


def _migration_history_count(names: tuple[str, ...] | None = None) -> int:
    with connection.cursor() as cur:
        if names is None:
            cur.execute("SELECT count(*) FROM migration_history")
        else:
            placeholders = ", ".join(["%s"] * len(names))
            cur.execute(
                f"SELECT count(*) FROM migration_history "
                f"WHERE migration_name IN ({placeholders})",
                list(names),
            )
        return cur.fetchone()[0]


@pytest.fixture
def fresh_migration_history():
    """Provide an isolated extended ``migration_history`` table per test."""
    _drop_migration_history()
    _create_extended_migration_history()
    yield
    _drop_migration_history()


# ---------------------------------------------------------------------------
# Local structure assertions (sqlite / config.settings.test) — R3.2
# ---------------------------------------------------------------------------


class TestCutoverScriptStructure:
    """The four cutover scripts exist, sort correctly, and are additive.

    Pure filesystem assertions — no database dependency, so they run on every
    checkout including the local SQLite suite.

    **Validates: Requirements 3.2**
    """

    def test_all_four_cutover_scripts_present(self):
        for name in CUTOVER_SCRIPTS:
            assert (DEFAULT_MIGRATIONS_DIR / name).is_file(), (
                f"Expected cutover script {name} under {DEFAULT_MIGRATIONS_DIR}"
            )

    def test_cutover_scripts_discovered_in_lexical_order(self):
        """The runner discovers the four scripts in the expected lexical order.

        ``_iter_migration_files`` is the exact discovery the production runner
        uses. Filtering its output to the cutover set must preserve the
        documented order (``_01`` → ``_03`` → ``_04`` → ``student``).
        """
        discovered = [p.name for p in _iter_migration_files(DEFAULT_MIGRATIONS_DIR)]
        cutover_in_order = [n for n in discovered if n in set(CUTOVER_SCRIPTS)]
        assert cutover_in_order == list(CUTOVER_SCRIPTS), (
            f"Cutover scripts discovered out of order: {cutover_in_order}"
        )

    def test_cutover_scripts_are_additive_only(self):
        """Each cutover script passes the additive-only lint (R3.2)."""
        for name in CUTOVER_SCRIPTS:
            sql = (DEFAULT_MIGRATIONS_DIR / name).read_text()
            violations = _find_non_additive_violations(sql)
            assert violations == [], (
                f"Cutover script {name} is not additive-only: {violations}"
            )

    def test_rollback_siblings_excluded_from_sweep(self):
        """Rollback siblings are never picked up by the runner's sweep."""
        discovered = {p.name for p in _iter_migration_files(DEFAULT_MIGRATIONS_DIR)}
        for name in CUTOVER_SCRIPTS:
            rollback = name.replace(".sql", "_rollback.sql")
            if (DEFAULT_MIGRATIONS_DIR / rollback).exists():
                assert rollback not in discovered, (
                    f"Rollback sibling {rollback} must not be auto-applied"
                )


@pytest.mark.django_db
class TestCutoverDryRunAndRunnerIdempotence:
    """Local (sqlite) verification of dry-run listing and re-apply no-op.

    The four real scripts use Postgres-only DDL, so the *content* apply is
    gated to a Neon branch. These assertions instead prove (a) the dry-run
    lists the cutover scripts in order without applying them (R3.2), and
    (b) the runner's "re-apply records no new ``migration_history`` rows"
    mechanism, using a synthetic vendor-portable migration set that stands in
    for the cutover set (R3.3).

    **Validates: Requirements 3.2, 3.3**
    """

    def test_dry_run_lists_cutover_scripts_without_applying(
        self, fresh_migration_history
    ):
        out = StringIO()
        call_command(
            "apply_sql_migrations",
            "--migrations-dir",
            str(DEFAULT_MIGRATIONS_DIR),
            "--dry-run",
            stdout=out,
            stderr=StringIO(),
        )
        text = out.getvalue()
        for name in CUTOVER_SCRIPTS:
            assert name in text, f"Dry-run did not list cutover script {name}"
            assert f"would apply: {name}" in text
        # Dry-run must not record anything.
        assert _migration_history_count() == 0, (
            "Dry-run recorded migration_history rows; it must not apply anything"
        )

    def test_reapply_records_no_new_rows(self, fresh_migration_history, tmp_path):
        """Apply→re-apply is a no-op: the second run adds no new history rows.

        Stands in for the four cutover scripts with a synthetic set of
        vendor-portable ``SELECT 1;`` files named like the cutover scripts so
        the ordering and one-row-per-file guarantee are exercised on sqlite.
        The production scripts are themselves idempotent (``IF NOT EXISTS`` /
        ``ON CONFLICT``); this test pins the *runner-level* idempotence the
        operator relies on.
        """
        synthetic_dir = tmp_path / "scripts"
        synthetic_dir.mkdir()
        for name in CUTOVER_SCRIPTS:
            (synthetic_dir / name).write_text("SELECT 1;")

        # First apply records exactly one row per script.
        first = StringIO()
        call_command(
            "apply_sql_migrations",
            "--migrations-dir",
            str(synthetic_dir),
            stdout=first,
            stderr=StringIO(),
        )
        count_after_first = _migration_history_count(CUTOVER_SCRIPTS)
        assert count_after_first == len(CUTOVER_SCRIPTS), (
            f"First apply recorded {count_after_first} rows, "
            f"expected {len(CUTOVER_SCRIPTS)}"
        )

        # Second apply is a strict no-op — nothing pending, no new rows.
        second = StringIO()
        call_command(
            "apply_sql_migrations",
            "--migrations-dir",
            str(synthetic_dir),
            stdout=second,
            stderr=StringIO(),
        )
        count_after_second = _migration_history_count(CUTOVER_SCRIPTS)
        assert count_after_second == count_after_first, (
            "Re-applying the cutover set recorded new migration_history rows"
        )
        assert "already applied" in second.getvalue()


# ---------------------------------------------------------------------------
# Gated Neon-branch assertions (PostgreSQL + TENANT_MIGRATION_NEON_BRANCH) —
# the real apply→re-apply no-op plus the runbook validation SQL invariants.
# ---------------------------------------------------------------------------


@_requires_neon_branch
@pytest.mark.django_db(transaction=True)
class TestNeonBranchCutoverIdempotence:
    """Apply→re-apply the four real cutover scripts on a Neon branch is a no-op.

    Runs only when ``TENANT_MIGRATION_NEON_BRANCH`` is set against a PostgreSQL
    connection (a dedicated branch, never production / the default branch).

    **Validates: Requirements 3.2, 3.3**
    """

    def _cutover_only_dir(self, tmp_path: Path) -> Path:
        """Copy just the four cutover scripts into an isolated temp dir.

        Applying through an isolated directory keeps the apply/re-apply scoped
        to the cutover set rather than every top-level script on disk.
        """
        cutover_dir = tmp_path / "cutover"
        cutover_dir.mkdir()
        for name in CUTOVER_SCRIPTS:
            shutil.copy2(DEFAULT_MIGRATIONS_DIR / name, cutover_dir / name)
        return cutover_dir

    def test_apply_then_reapply_is_noop_and_invariants_hold(self, tmp_path):
        cutover_dir = self._cutover_only_dir(tmp_path)

        # The branch must already carry the migration_history extend
        # prerequisite; otherwise the runner refuses (MIGRATION_HISTORY_NOT_
        # EXTENDED), which is itself the correct gated behaviour.
        try:
            first = StringIO()
            call_command(
                "apply_sql_migrations",
                "--migrations-dir",
                str(cutover_dir),
                stdout=first,
                stderr=StringIO(),
            )
        except CommandError as exc:
            pytest.fail(
                "apply_sql_migrations refused on the Neon branch — apply the "
                f"migration_history extend prerequisite first: {exc}"
            )

        count_after_first = _migration_history_count(CUTOVER_SCRIPTS)
        assert count_after_first == len(CUTOVER_SCRIPTS), (
            f"Expected one history row per cutover script, got {count_after_first}"
        )

        # Re-apply: strict no-op, no new migration_history rows.
        second = StringIO()
        call_command(
            "apply_sql_migrations",
            "--migrations-dir",
            str(cutover_dir),
            stdout=second,
            stderr=StringIO(),
        )
        count_after_second = _migration_history_count(CUTOVER_SCRIPTS)
        assert count_after_second == count_after_first, (
            "Re-applying the cutover scripts recorded new migration_history rows"
        )
        assert "already applied" in second.getvalue()

        # Runbook validation SQL invariants (R3.3).
        with connection.cursor() as cursor:
            cursor.execute("SELECT count(*) FROM canonical_programs")
            canonical_programs = cursor.fetchone()[0]
            assert canonical_programs > 0, (
                "canonical_programs must be non-zero after the cutover"
            )

            cursor.execute(
                "SELECT hostname, count(*) FROM institution_domains "
                "GROUP BY hostname HAVING count(*) > 1"
            )
            duplicate_hostnames = cursor.fetchall()
            assert duplicate_hostnames == [], (
                f"Duplicate institution_domains hostnames found: {duplicate_hostnames}"
            )

            cursor.execute(
                "SELECT slug, count(*) FROM institutions "
                "WHERE slug IS NOT NULL GROUP BY slug HAVING count(*) > 1"
            )
            duplicate_slugs = cursor.fetchall()
            assert duplicate_slugs == [], (
                f"Duplicate institution slugs found: {duplicate_slugs}"
            )
