"""Task 13.4 - every NOT VALID foreign key in backend/scripts/ has a validate script.

Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 13.4
Requirements: R15.3-R15.4 ("a remaining NOT VALID tenant constraint SHALL block
    V2"), R18.7
Findings: GATE-13.1-01 (an expand with no validate - nine July tenant FKs left
    permanently NOT VALID, so ``schema_manifest --verify`` could never return ok
    and a real future NOT VALID was indistinguishable from the permanent one)
Evidence: docs/v2-evidence/13.4/

Why this file exists in addition to ``test_tenant_fk_validation_3_4.py``
-----------------------------------------------------------------------
Task 3.4's coverage proof is scoped to a hard-coded list of **June** scripts
(``JUNE_TENANT_SCRIPTS``). That is why the same mistake could be made three more
times in July without any test noticing: the July scripts were simply outside
what the proof looked at. This file replaces the enumerate-the-scripts approach
with an exhaustive one - it *discovers* every ``ADD CONSTRAINT ... FOREIGN KEY
... NOT VALID`` in every forward script under ``backend/scripts/`` and requires
each discovered name to appear in some shipped ``*_validate.sql``. A fourth
expand script that forgets its validate sibling fails here on the day it lands,
whatever it is called.

Two layers, matching the repo convention:

* Always-on, DB-free: the exhaustive discover-then-require-coverage proof, the
  9-FK inventory this task's script owns, and additive-only-lint / idempotence
  hygiene so ``apply_sql_migrations`` accepts the forward script.
* ``pg_only`` (Postgres): reproduce the genuine fresh-from-empty ``NOT VALID``
  state for the three July tables (the July-named FKs only exist on a database
  built from the raw SQL; a Django-built database carries Django-named validated
  equivalents), apply the real script, and assert zero unvalidated FKs remain -
  plus idempotence and the orphan fail-closed guarantee.

The timed rehearsal and the SHARE UPDATE EXCLUSIVE lock measurement are on the
Neon rehearsal branch - see docs/v2-evidence/13.4/.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest
from django.db import connection

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"

# This task's deliverable + its paired rollback.
VALIDATE_134 = SCRIPTS_DIR / "2026_08_12_01_tenant_new_table_fk_validate.sql"
VALIDATE_134_RB = SCRIPTS_DIR / "2026_08_12_01_tenant_new_table_fk_validate_rollback.sql"

# The 9 July NOT VALID FKs this script owns:
# (source_table, constraint_name, column, referenced_table).
JULY_TENANT_FKS = [
    ("tenant_onboarding", "tenant_onboarding_institution_id_fk", "institution_id", "institutions"),
    ("tenant_onboarding", "tenant_onboarding_created_by_id_fk", "created_by_id", "profiles"),
    ("tenant_staff_invitations", "tenant_staff_invitations_institution_id_fk", "institution_id", "institutions"),
    ("tenant_staff_invitations", "tenant_staff_invitations_profile_id_fk", "profile_id", "profiles"),
    ("tenant_staff_invitations", "tenant_staff_invitations_membership_id_fk", "membership_id", "user_institution_memberships"),
    ("tenant_staff_invitations", "tenant_staff_invitations_invited_by_id_fk", "invited_by_id", "profiles"),
    ("tenant_change_requests", "tenant_change_requests_institution_id_fk", "institution_id", "institutions"),
    ("tenant_change_requests", "tenant_change_requests_requested_by_id_fk", "requested_by_id", "profiles"),
    ("tenant_change_requests", "tenant_change_requests_reviewed_by_id_fk", "reviewed_by_id", "profiles"),
]
JULY_FK_NAMES = {name for _, name, _, _ in JULY_TENANT_FKS}
JULY_TABLES = sorted({table for table, _, _, _ in JULY_TENANT_FKS})

_ADD_NOT_VALID_FK_RE = re.compile(
    r"ADD\s+CONSTRAINT\s+([A-Za-z_][A-Za-z0-9_]*)\s+FOREIGN\s+KEY\b[^;]*?\bNOT\s+VALID",
    re.IGNORECASE,
)
_VALIDATE_CONSTRAINT_RE = re.compile(r"VALIDATE\s+CONSTRAINT", re.IGNORECASE)


def _forward_scripts() -> list[Path]:
    """Top-level forward migration scripts (the sweep's own view of them).

    Mirrors ``apply_sql_migrations._iter_migration_files``: top level only,
    ``*.sql``, no ``*_rollback.sql``. ``00_full_schema.sql`` is a generated
    snapshot of an already-migrated database, so it restates constraints rather
    than introducing them and is excluded here too - including it would demand a
    validate script for constraints it merely reproduces.
    """
    return sorted(
        p
        for p in SCRIPTS_DIR.iterdir()
        if p.is_file()
        and p.suffix == ".sql"
        and not p.name.endswith("_rollback.sql")
        and p.name != "00_full_schema.sql"
    )


def _notvalid_fks_by_script() -> dict[str, set[str]]:
    """Discover every ``ADD CONSTRAINT ... FOREIGN KEY ... NOT VALID`` name."""
    found: dict[str, set[str]] = {}
    for path in _forward_scripts():
        collapsed = re.sub(r"\s+", " ", path.read_text(encoding="utf-8"))
        names = {m.group(1) for m in _ADD_NOT_VALID_FK_RE.finditer(collapsed)}
        if names:
            found[path.name] = names
    return found


def _validate_script_texts() -> dict[str, str]:
    """Every shipped forward script that runs ``VALIDATE CONSTRAINT``."""
    return {
        p.name: p.read_text(encoding="utf-8")
        for p in _forward_scripts()
        if _VALIDATE_CONSTRAINT_RE.search(p.read_text(encoding="utf-8"))
    }


# ---------------------------------------------------------------------------
# Layer 1 - always-on coverage + hygiene (DB-free, runs in every CI profile)
# ---------------------------------------------------------------------------


class TestJulyValidateScriptShipped:
    def test_task_13_4_validate_script_and_rollback_exist(self):
        assert VALIDATE_134.exists(), (
            "task 13.4 deliverable missing: backend/scripts/"
            "2026_08_12_01_tenant_new_table_fk_validate.sql (the validate "
            "migration GATE-13.1-01 requires)"
        )
        assert VALIDATE_134_RB.exists(), "paired rollback script missing"

    def test_it_names_exactly_the_nine_july_fks(self):
        text = VALIDATE_134.read_text(encoding="utf-8")
        named = {n for n in JULY_FK_NAMES if n in text}
        assert named == JULY_FK_NAMES, {
            "missing": sorted(JULY_FK_NAMES - named),
        }
        # And it must not reach into another validate script's territory: the
        # June/3.2/3.5 FKs are owned elsewhere and double-validation would make
        # ownership unreadable rather than wrong.
        for foreign in ("memberships_user_id_fk", "applications_institution_id_fk",
                        "application_documents_supersedes_id_fk"):
            assert foreign not in text, (
                f"{foreign} belongs to another validate script; do not re-own it here"
            )

    def test_it_is_guarded_on_convalidated_so_a_re_run_is_a_no_op(self):
        text = VALIDATE_134.read_text(encoding="utf-8")
        assert "convalidated = false" in text, (
            "the VALIDATE loop must be guarded on convalidated = false so a "
            "re-run, and a Django-built database where the July names are "
            "absent, are both no-ops"
        )

    def test_it_passes_the_additive_only_lint(self):
        """The sweep applies this script at container boot, so it must not trip
        the pre-execution additive-only lint."""
        from apps.common.management.commands.apply_sql_migrations import (
            _find_non_additive_violations,
        )

        violations = _find_non_additive_violations(
            VALIDATE_134.read_text(encoding="utf-8")
        )
        assert violations == [], violations


class TestEveryNotValidForeignKeyHasAValidateScript:
    """The exhaustive proof. R15.4 admits no exceptions, so neither does this."""

    def test_discovery_is_non_empty(self):
        """Guard against the proof silently passing because the regex or the
        path resolution broke."""
        discovered = _notvalid_fks_by_script()
        assert discovered, (
            "no NOT VALID foreign keys discovered in backend/scripts/ - the "
            "coverage proof below would be vacuous"
        )
        assert _validate_script_texts(), "no VALIDATE CONSTRAINT script discovered"

    def test_every_discovered_not_valid_fk_is_covered(self):
        discovered = _notvalid_fks_by_script()
        validate_texts = _validate_script_texts()

        uncovered: dict[str, list[str]] = {}
        for script, names in discovered.items():
            missing = sorted(
                name
                for name in names
                if not any(name in body for body in validate_texts.values())
            )
            if missing:
                uncovered[script] = missing

        assert not uncovered, (
            "Every foreign key added NOT VALID must be validated by a shipped "
            "*_validate.sql, or schema_manifest --verify can never return ok on "
            "any environment and a real future NOT VALID constraint becomes "
            "indistinguishable from the permanent one (R15.3-R15.4, "
            f"GATE-13.1-01). Uncovered: {uncovered}"
        )


# ---------------------------------------------------------------------------
# Layer 2 - Postgres: reproduce, validate, verify
# ---------------------------------------------------------------------------

pg_only = pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="NOT VALID constraints and VALIDATE CONSTRAINT are Postgres-only",
)


def _reproduce_july_not_valid_fks() -> None:
    """Add the July-named FKs ``NOT VALID`` if they are absent.

    A Django-built test database carries Django-named, already-valid FKs on
    these tables; the July names only exist on a database built from the raw
    SQL scripts (the fresh-from-empty and self-hosted production path). This
    reproduces that state so the script under test has something to do -
    the same technique ``test_tenant_fk_validation_3_4.py`` uses.
    """
    with connection.cursor() as cursor:
        for table, name, column, target in JULY_TENANT_FKS:
            cursor.execute(
                "SELECT 1 FROM pg_constraint WHERE conname = %s", [name]
            )
            if cursor.fetchone():
                continue
            cursor.execute(
                f'ALTER TABLE {table} ADD CONSTRAINT {name} '
                f'FOREIGN KEY ({column}) REFERENCES {target} (id) NOT VALID'
            )


def _unvalidated(names: set[str]) -> set[str]:
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT conname FROM pg_constraint "
            "WHERE contype = 'f' AND convalidated = false AND conname = ANY(%s)",
            [sorted(names)],
        )
        return {row[0] for row in cursor.fetchall()}


@pg_only
@pytest.mark.django_db(transaction=True)
def test_validate_script_clears_every_july_not_valid_fk():
    _reproduce_july_not_valid_fks()
    assert _unvalidated(JULY_FK_NAMES) == JULY_FK_NAMES, (
        "precondition: all nine July FKs should be NOT VALID before the script runs"
    )

    sql = VALIDATE_134.read_text(encoding="utf-8")
    with connection.cursor() as cursor:
        cursor.execute(sql)

    assert _unvalidated(JULY_FK_NAMES) == set(), (
        "after the validate script no July tenant FK may remain NOT VALID (R15.4)"
    )


@pg_only
@pytest.mark.django_db(transaction=True)
def test_validate_script_is_idempotent():
    _reproduce_july_not_valid_fks()
    sql = VALIDATE_134.read_text(encoding="utf-8")
    with connection.cursor() as cursor:
        cursor.execute(sql)
        cursor.execute(sql)  # second run must match zero constraints, not error
    assert _unvalidated(JULY_FK_NAMES) == set()


@pg_only
@pytest.mark.django_db(transaction=True)
def test_validate_fails_closed_on_an_orphan_rather_than_marking_it_valid():
    """R15.3: an orphan must abort the migration, never be blessed as valid.

    ``tenant_onboarding.created_by_id`` is the cheapest orphan to manufacture -
    it is a nullable profile reference on a table the platform seeds lazily, so
    a fabricated row needs no institution, no user, and no membership graph.
    """
    _reproduce_july_not_valid_fks()

    orphan_profile = str(uuid.uuid4())
    onboarding_id = str(uuid.uuid4())
    dropped: list[str] = []
    try:
        with connection.cursor() as cursor:
            # Create the institution rather than skipping when the database has
            # none: a fail-closed guarantee that only gets checked on a seeded
            # database is a guarantee nobody checks.
            institution_id = str(uuid.uuid4())
            cursor.execute(
                "INSERT INTO institutions (id, name, code, is_active) "
                "VALUES (%s, %s, %s, true)",
                [institution_id, "FK Validate Rehearsal", f"FKV{uuid.uuid4().hex[:6]}"],
            )
            # Every FK on created_by_id has to come off to manufacture the
            # orphan, not just the July-named one: a Django-built database also
            # carries an already-VALID Django-named equivalent, and that one
            # would refuse the insert. Dropping both reproduces the state a
            # database built from the raw SQL is genuinely in - an expand-only
            # migration that never scanned its existing rows.
            cursor.execute(
                "SELECT conname FROM pg_constraint con "
                "JOIN pg_attribute att "
                "  ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1] "
                "WHERE con.contype = 'f' "
                "  AND con.conrelid = 'tenant_onboarding'::regclass "
                "  AND att.attname = 'created_by_id'"
            )
            dropped = [row[0] for row in cursor.fetchall()]
            for name in dropped:
                cursor.execute(
                    f'ALTER TABLE tenant_onboarding DROP CONSTRAINT "{name}"'
                )
            cursor.execute(
                "INSERT INTO tenant_onboarding "
                "(id, institution_id, created_by_id, state, configuration_version, "
                " steps, blockers) "
                "VALUES (%s, %s, %s, %s, 0, %s, %s)",
                [onboarding_id, institution_id, orphan_profile, "draft", "{}", "[]"],
            )
            cursor.execute(
                "ALTER TABLE tenant_onboarding "
                "ADD CONSTRAINT tenant_onboarding_created_by_id_fk "
                "FOREIGN KEY (created_by_id) REFERENCES profiles (id) NOT VALID"
            )

        sql = VALIDATE_134.read_text(encoding="utf-8")
        with pytest.raises(Exception):
            with connection.cursor() as cursor:
                cursor.execute(sql)

        # And the constraint is still NOT VALID afterwards - the migration
        # aborted rather than blessing a broken constraint (R15.3).
        assert "tenant_onboarding_created_by_id_fk" in _unvalidated(JULY_FK_NAMES)
    finally:
        # Leave the schema as found: this test runs against a shared
        # transaction=True database, and a dropped constraint would silently
        # weaken every test that follows.
        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM tenant_onboarding WHERE id = %s", [onboarding_id]
            )
            cursor.execute(
                "ALTER TABLE tenant_onboarding "
                "DROP CONSTRAINT IF EXISTS tenant_onboarding_created_by_id_fk"
            )
            for name in dropped:
                if name == "tenant_onboarding_created_by_id_fk":
                    continue
                cursor.execute(
                    "SELECT 1 FROM pg_constraint WHERE conname = %s", [name]
                )
                if cursor.fetchone():
                    continue
                cursor.execute(
                    f'ALTER TABLE tenant_onboarding ADD CONSTRAINT "{name}" '
                    f"FOREIGN KEY (created_by_id) REFERENCES profiles (id)"
                )
