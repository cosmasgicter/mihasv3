"""Task 3.4 — validate every tenant foreign key.

Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.4
Requirements: R15.3-R15.4, R18.7
Findings: DATA-07 (tenant FKs added ``NOT VALID`` with no validation migration)
Evidence: docs/v2-evidence/3.4/

Two layers, matching the repo convention (see ``test_canonical_assignment_
remediation.py`` / ``test_integrity_constraints_3_3.py``):

* Always-on, DB-free: a *coverage* proof that every ``NOT VALID`` foreign key
  the June 2026 tenant SQL scripts introduce is validated by a shipped
  validation migration — the 4 ``applications`` canonical FKs by task 3.2's
  ``2026_07_16_03_..._validate.sql`` and the remaining 24 tenant FKs by task
  3.4's ``2026_07_18_01_tenant_fk_validate.sql``. Plus additive-only-lint /
  idempotence hygiene so ``apply_sql_migrations`` accepts the forward script.
* ``@pg_only`` (Postgres): reproduce the genuine fresh-from-empty ``NOT VALID``
  state (the June-named FKs only exist on a DB built from the raw SQL scripts;
  Neon/production carry Django-named *validated* equivalents), then apply the
  real task-3.4 script and assert — via the task-3.1 schema manifest verifier —
  that zero unvalidated tenant FKs remain (Required_Evidence: "zero invalid
  tenant constraints in each schema manifest"). Plus idempotence and the
  orphan fail-closed guarantee.

The real-data online-validation rehearsal + SHARE UPDATE EXCLUSIVE lock
measurement is on the Neon branch — see docs/v2-evidence/3.4/.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path

import pytest
from django.db import connection

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"

# The task-3.4 validation migration (this task's deliverable) + its rollback.
VALIDATE_34 = SCRIPTS_DIR / "2026_07_18_01_tenant_fk_validate.sql"
VALIDATE_34_RB = SCRIPTS_DIR / "2026_07_18_01_tenant_fk_validate_rollback.sql"

# Task 3.2's validate script already owns the 4 ``applications`` canonical FKs.
VALIDATE_32 = SCRIPTS_DIR / "2026_07_16_03_canonical_assignment_validate.sql"

# The June 2026 tenant migration scripts that add ``NOT VALID`` foreign keys.
JUNE_TENANT_SCRIPTS = [
    "2026_06_08_01_multi_tenant_beanola_admissions.sql",
    "2026_06_08_03_institution_document_profiles.sql",
    "2026_06_08_04_communication_templates_tenant.sql",
    "2026_06_18_01_institution_domain_lifecycle.sql",
]

# The 4 ``applications`` canonical FKs owned + validated by task 3.2. Task 3.4
# must NOT duplicate their ownership; the coverage proof subtracts them.
APPLICATIONS_FKS_OWNED_BY_32 = {
    "applications_institution_id_fk",
    "applications_program_id_fk",
    "applications_program_offering_id_fk",
    "applications_intake_id_fk",
}

# The 24 remaining June ``NOT VALID`` tenant FKs that task 3.4 validates.
# (source_table, constraint_name, column, referenced_table) — mirrors the exact
# names + targets the June scripts declare. Single source of truth for both the
# Postgres reproduction and the always-on coverage assertion.
TENANT_FKS_34 = [
    ("programs", "programs_canonical_program_id_fk", "canonical_program_id", "canonical_programs"),
    ("institution_assets", "institution_assets_institution_id_fk", "institution_id", "institutions"),
    ("institution_assets", "institution_assets_created_by_id_fk", "created_by_id", "profiles"),
    ("institution_document_templates", "institution_templates_institution_id_fk", "institution_id", "institutions"),
    ("institution_document_templates", "institution_templates_created_by_id_fk", "created_by_id", "profiles"),
    ("institution_required_documents", "required_documents_institution_id_fk", "institution_id", "institutions"),
    ("institution_required_documents", "required_documents_program_id_fk", "program_id", "programs"),
    ("institution_required_documents", "required_documents_canonical_program_id_fk", "canonical_program_id", "canonical_programs"),
    ("institution_domains", "institution_domains_institution_id_fk", "institution_id", "institutions"),
    ("institution_domains", "institution_domains_created_by_id_fk", "created_by_id", "profiles"),
    ("institution_domains", "institution_domains_approved_by_id_fk", "approved_by_id", "profiles"),
    ("user_institution_memberships", "memberships_user_id_fk", "user_id", "profiles"),
    ("user_institution_memberships", "memberships_institution_id_fk", "institution_id", "institutions"),
    ("user_institution_memberships", "memberships_created_by_id_fk", "created_by_id", "profiles"),
    ("access_grants", "access_grants_user_id_fk", "user_id", "profiles"),
    ("access_grants", "access_grants_institution_id_fk", "institution_id", "institutions"),
    ("access_grants", "access_grants_program_id_fk", "program_id", "programs"),
    ("access_grants", "access_grants_application_id_fk", "application_id", "applications"),
    ("access_grants", "access_grants_created_by_id_fk", "created_by_id", "profiles"),
    ("institution_document_profiles", "fk_doc_profiles_institution", "institution_id", "institutions"),
    ("institution_document_profiles", "fk_doc_profiles_program", "program_id", "programs"),
    ("institution_document_profiles", "fk_doc_profiles_canonical_program", "canonical_program_id", "canonical_programs"),
    ("institution_document_profiles", "fk_doc_profiles_intake", "intake_id", "intakes"),
    ("communication_templates", "fk_comm_templates_institution", "institution_id", "institutions"),
]

TENANT_FK_NAMES_34 = {name for _, name, _, _ in TENANT_FKS_34}
TENANT_TABLES = sorted({table for table, _, _, _ in TENANT_FKS_34} | {"applications"})

_ADD_NOT_VALID_FK_RE = re.compile(
    r"ADD\s+CONSTRAINT\s+([A-Za-z_][A-Za-z0-9_]*)\s+FOREIGN\s+KEY\b[^;]*?\bNOT\s+VALID",
    re.IGNORECASE,
)
_VALIDATE_CONSTRAINT_RE = re.compile(r"VALIDATE\s+CONSTRAINT", re.IGNORECASE)


def _extract_notvalid_fk_names(sql_text: str) -> set[str]:
    """Return the constraint names added ``... FOREIGN KEY ... NOT VALID``.

    Whitespace is collapsed first so the multi-line ``ADD CONSTRAINT`` blocks in
    the June DO-blocks match on one logical line.
    """
    collapsed = re.sub(r"\s+", " ", sql_text)
    return {m.group(1) for m in _ADD_NOT_VALID_FK_RE.finditer(collapsed)}


def _all_june_notvalid_fk_names() -> set[str]:
    names: set[str] = set()
    for script in JUNE_TENANT_SCRIPTS:
        names |= _extract_notvalid_fk_names((SCRIPTS_DIR / script).read_text())
    return names


# ---------------------------------------------------------------------------
# Layer 1 — always-on coverage + hygiene (DB-free, runs in every CI profile)
# ---------------------------------------------------------------------------


class TestValidationMigrationCoverage:
    def test_task_3_4_validate_script_exists(self):
        assert VALIDATE_34.exists(), (
            "task 3.4 deliverable missing: backend/scripts/"
            "2026_07_18_01_tenant_fk_validate.sql (the tenant-FK validation "
            "migration DATA-07 requires)"
        )
        assert VALIDATE_34_RB.exists(), "paired rollback script missing"

    def test_inventory_matches_the_june_scripts(self):
        """The hard-coded 24-FK inventory equals (all June NOT VALID FKs) − (the
        4 applications FKs task 3.2 owns). Guards against the June scripts
        drifting from this task's inventory."""
        june = _all_june_notvalid_fk_names()
        # Sanity: the 4 applications canonical FKs are among the June NOT VALID set.
        assert APPLICATIONS_FKS_OWNED_BY_32 <= june, june
        assert (june - APPLICATIONS_FKS_OWNED_BY_32) == TENANT_FK_NAMES_34, {
            "unexpected_in_june": (june - APPLICATIONS_FKS_OWNED_BY_32) - TENANT_FK_NAMES_34,
            "missing_from_inventory": TENANT_FK_NAMES_34 - (june - APPLICATIONS_FKS_OWNED_BY_32),
        }

    def test_every_june_tenant_fk_is_covered_by_a_validate_migration(self):
        """R15.4: ALL tenant FKs validated. Every June NOT VALID FK must be named
        by task 3.2's validate script (the 4 applications FKs) or task 3.4's."""
        june = _all_june_notvalid_fk_names()
        covered_32 = {n for n in june if n in VALIDATE_32.read_text()}
        script_34 = VALIDATE_34.read_text()
        covered_34 = {n for n in june if n in script_34}
        uncovered = june - covered_32 - covered_34
        assert not uncovered, f"June NOT VALID tenant FKs with no validate migration: {sorted(uncovered)}"
        # Task 3.4 covers exactly the 24 non-applications tenant FKs.
        assert covered_34 == TENANT_FK_NAMES_34, {
            "missing_from_3_4": TENANT_FK_NAMES_34 - covered_34,
            "unexpected_in_3_4": covered_34 - TENANT_FK_NAMES_34,
        }
        assert _VALIDATE_CONSTRAINT_RE.search(script_34), "3.4 script issues no VALIDATE CONSTRAINT"


class TestScriptHygiene:
    def test_forward_script_passes_additive_only_lint(self):
        """The container-boot runner rejects DROP/TRUNCATE/unqualified DELETE/
        narrowing ALTER TYPE. VALIDATE CONSTRAINT is additive, so the forward
        script must lint clean (no --allow-non-additive needed)."""
        from apps.common.management.commands.apply_sql_migrations import (
            _find_non_additive_violations,
        )

        assert _find_non_additive_violations(VALIDATE_34.read_text()) == []

    def test_forward_script_is_convalidated_guarded_and_idempotent(self):
        """Each VALIDATE only fires while the constraint is still NOT VALID
        (``convalidated = false``) and exists, so a re-run — or a Django-built
        DB where the June names are absent/already valid — is a no-op."""
        text = VALIDATE_34.read_text().lower()
        assert "convalidated" in text and "false" in text
        assert "pg_constraint" in text

    def test_rollback_is_a_documented_no_op(self):
        """VALIDATE CONSTRAINT is not independently reversible (a validated FK
        stays valid); the rollback must be a safe no-op, not a DROP."""
        rb = VALIDATE_34_RB.read_text()
        from apps.common.management.commands.apply_sql_migrations import (
            _find_non_additive_violations,
        )

        assert _find_non_additive_violations(rb) == []
        assert not re.search(r"\bDROP\s+CONSTRAINT\b", rb, re.IGNORECASE)

    def test_forward_script_is_excluded_from_no_files(self):
        """Forward script sits at top level so apply_sql_migrations sweeps it;
        rollback ends with _rollback.sql so the sweep excludes it."""
        assert VALIDATE_34.parent == SCRIPTS_DIR
        assert VALIDATE_34_RB.name.endswith("_rollback.sql")


# ---------------------------------------------------------------------------
# Layer 2 — Postgres: reproduce NOT VALID → validate → manifest clean
# ---------------------------------------------------------------------------

pg_only = pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason=(
        "tenant-FK validation uses NOT VALID / VALIDATE CONSTRAINT / pg_constraint "
        f"introspection; active backend is {connection.vendor!r}. The always-on "
        "coverage + hygiene tests above carry the non-gated proof."
    ),
)


def _u() -> str:
    return str(uuid.uuid4())


def _apply_sql_file(path: Path) -> None:
    from apps.common.management.commands.apply_sql_migrations import _split_sql_statements

    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        for statement in _split_sql_statements(path.read_text()):
            cursor.execute(statement)


def _reproduce_june_not_valid_fks() -> None:
    """Add the 24 June-named NOT VALID tenant FKs the conftest (Django) schema
    lacks, reproducing the genuine fresh-from-empty state. Postgres permits a
    second FK on a column, so these sit alongside the Django-named validated
    ones; each is NOT VALID so no existing row is scanned."""
    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        for table, name, column, ref in TENANT_FKS_34:
            cursor.execute(
                "SELECT 1 FROM pg_constraint WHERE conname = %s", [name]
            )
            if cursor.fetchone():
                continue
            cursor.execute(
                f'ALTER TABLE {table} ADD CONSTRAINT {name} '
                f'FOREIGN KEY ({column}) REFERENCES {ref}(id) NOT VALID'
            )


def _unvalidated_tenant_fks() -> dict[str, list[str]]:
    """Manifest-driven map of {tenant_table: [unvalidated FK names]} — the exact
    signal the task-3.1 verifier fails on (R15.4)."""
    from apps.common.schema_manifest import build_manifest_from_connection

    manifest = build_manifest_from_connection(connection, label="task-3.4-test")
    out: dict[str, list[str]] = {}
    for table in TENANT_TABLES:
        spec = manifest["tables"].get(table, {})
        bad = [fk["name"] for fk in spec.get("foreign_keys", []) if fk.get("validated") is False]
        if bad:
            out[table] = sorted(bad)
    return out


@pg_only
@pytest.mark.django_db
def test_manifest_flags_then_clears_notvalid_tenant_fks():
    """Failing-first proof via the schema manifest: reproduce the June NOT VALID
    FKs (verifier FAILS), apply the real task-3.4 script, verifier PASSES."""
    _reproduce_june_not_valid_fks()

    before = _unvalidated_tenant_fks()
    reproduced = {n for names in before.values() for n in names}
    assert TENANT_FK_NAMES_34 <= reproduced, {
        "missing": sorted(TENANT_FK_NAMES_34 - reproduced)
    }

    _apply_sql_file(VALIDATE_34)

    after = _unvalidated_tenant_fks()
    leftover = {n for names in after.values() for n in names} & TENANT_FK_NAMES_34
    assert not leftover, f"still NOT VALID after task-3.4 validate: {sorted(leftover)}"


@pg_only
@pytest.mark.django_db
def test_verify_manifest_gate_fails_then_passes():
    """The task-3.1 release-gate verifier (verify_manifest) must FAIL while any
    tenant FK is NOT VALID and PASS after the task-3.4 script runs (R15.3)."""
    from apps.common.schema_manifest import build_manifest_from_connection, verify_manifest

    _reproduce_june_not_valid_fks()

    before = verify_manifest(build_manifest_from_connection(connection, label="before"))
    unvalidated = {
        d.object.split(".", 1)[-1]
        for d in before.failures
        if d.category == "unvalidated_foreign_key"
    }
    assert TENANT_FK_NAMES_34 <= unvalidated, {"missing": sorted(TENANT_FK_NAMES_34 - unvalidated)}
    assert not before.ok

    _apply_sql_file(VALIDATE_34)

    after = verify_manifest(build_manifest_from_connection(connection, label="after"))
    still_bad = {
        d.object.split(".", 1)[-1]
        for d in after.failures
        if d.category == "unvalidated_foreign_key"
    } & TENANT_FK_NAMES_34
    assert not still_bad, f"verifier still flags: {sorted(still_bad)}"


@pg_only
@pytest.mark.django_db
def test_validate_script_is_idempotent():
    """Re-running the validate script is a no-op (a validated FK stays valid)."""
    _reproduce_june_not_valid_fks()
    _apply_sql_file(VALIDATE_34)
    _apply_sql_file(VALIDATE_34)  # second run must not error
    leftover = {n for names in _unvalidated_tenant_fks().values() for n in names} & TENANT_FK_NAMES_34
    assert not leftover


@pg_only
@pytest.mark.django_db
def test_no_op_on_django_built_schema():
    """On the conftest (Django) schema the June names are absent, so the script
    is a clean no-op — the exact Neon/production case where FKs are already
    validated under Django names."""
    _apply_sql_file(VALIDATE_34)  # no reproduction first
    leftover = {n for names in _unvalidated_tenant_fks().values() for n in names} & TENANT_FK_NAMES_34
    assert not leftover


@pg_only
@pytest.mark.django_db
def test_validate_fails_closed_on_orphan():
    """R15.3/R15.4 fail-closed guarantee: VALIDATE CONSTRAINT rejects a table
    whose NOT VALID FK has an orphan row, so the migration aborts (transaction
    rolls back) rather than silently marking a broken constraint valid. Proven
    on a throwaway table pair so no real tenant row is mutated."""
    from django.db import ProgrammingError, IntegrityError

    with connection.cursor() as cursor:
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cursor.execute("CREATE TEMP TABLE _t34_parent (id uuid PRIMARY KEY)")
        cursor.execute("CREATE TEMP TABLE _t34_child (id uuid PRIMARY KEY, parent_id uuid)")
        # Orphan child: parent_id points at a row that does not exist.
        cursor.execute(
            "INSERT INTO _t34_child (id, parent_id) VALUES (%s, %s)", [_u(), _u()]
        )
        cursor.execute(
            "ALTER TABLE _t34_child ADD CONSTRAINT _t34_child_fk "
            "FOREIGN KEY (parent_id) REFERENCES _t34_parent(id) NOT VALID"
        )
        # The NOT VALID add succeeded (no scan); validation must now fail closed.
        with pytest.raises((IntegrityError, ProgrammingError)):
            cursor.execute("ALTER TABLE _t34_child VALIDATE CONSTRAINT _t34_child_fk")
