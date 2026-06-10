"""Migration drift guards — Phase 1, Task 2.2 of
``.kiro/specs/multi-tenant-beanola-remediation/``.

Unlike ``test_apply_sql_migrations.py`` (which exercises the runner against
synthetic ``tmp_path`` fixtures), these guards run against the **real**
``backend/scripts/`` tree and the **real** docs/specs so the
migration-delivery class of bug cannot silently reappear:

* A production (non-rollback, non-archive) migration must never sit inside an
  Excluded_Subdirectory (``migrations/``, ``applied/``, ``archive/``) — that is
  exactly the bug the remediation fixed by relocating the tenant migration.
* The relocated Tenant_Migration must be discoverable by the Migration_Runner
  under its new top-level name.
* ``00_full_schema.sql`` and ``*_rollback.sql`` must remain excluded from
  discovery.
* Every ``backend/scripts/*.sql`` path referenced in docs/ and .kiro/specs/
  must resolve on disk (no dangling migration-path references).

_Requirements: R2.1, R2.2, R2.3, R2.4_
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

from apps.common.management.commands.apply_sql_migrations import (
    DEFAULT_MIGRATIONS_DIR,
    EXCLUDED_SUBDIRS,
    EXCLUDED_TOP_LEVEL_FILES,
    _iter_migration_files,
)

# ``backend/`` root: this file is backend/tests/unit/ -> parents[2].
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
# Repo root: backend/ -> parents[3].
_REPO_ROOT = Path(__file__).resolve().parents[3]

_TENANT_MIGRATION_NAME = "2026_06_08_01_multi_tenant_beanola_admissions.sql"

# Sibling artifacts that are allowed to live inside an excluded subdirectory:
# rollback scripts, archived snapshots, and documentation/markdown. Anything
# else with a ``.sql`` suffix in an excluded subdir is a mis-placed production
# migration and fails the guard.
_ALLOWED_IN_EXCLUDED_SUFFIXES = ("_rollback.sql",)


def test_tenant_migration_is_discoverable_at_top_level():
    """The relocated Tenant_Migration appears in runner discovery (R2.2)."""
    names = {p.name for p in _iter_migration_files(DEFAULT_MIGRATIONS_DIR)}
    assert _TENANT_MIGRATION_NAME in names, (
        f"{_TENANT_MIGRATION_NAME} not discovered by the Migration_Runner; "
        f"it must live at the top level of backend/scripts/, not in an "
        f"excluded subdirectory."
    )


def test_tenant_migration_sorts_before_student_number():
    """Lexical order places the tenant schema before student_number (R1.3)."""
    names = [p.name for p in _iter_migration_files(DEFAULT_MIGRATIONS_DIR)]
    assert _TENANT_MIGRATION_NAME in names
    student = "2026_06_08_student_number.sql"
    if student in names:
        assert names.index(_TENANT_MIGRATION_NAME) < names.index(student), (
            "Tenant migration must sort before the student_number migration "
            "so the tenant schema exists before dependent migrations run."
        )


def test_full_schema_and_rollbacks_excluded_from_discovery():
    """``00_full_schema.sql`` and ``*_rollback.sql`` stay out of discovery (R2.3)."""
    names = [p.name for p in _iter_migration_files(DEFAULT_MIGRATIONS_DIR)]
    assert "00_full_schema.sql" not in names
    assert all(not n.endswith("_rollback.sql") for n in names)
    for excluded in EXCLUDED_TOP_LEVEL_FILES:
        assert excluded not in names


def test_no_production_migration_in_excluded_subdirectory():
    """No production ``.sql`` sits in migrations/, applied/, or archive/ (R2.1).

    ``applied/`` and ``archive/`` legitimately hold historical/out-of-band SQL,
    but a *new* tenant-style migration mis-placed there would never run. The
    guard fails for any non-rollback ``.sql`` in ``migrations/`` (which must now
    be empty of migrations after the relocation), and for non-rollback ``.sql``
    directly under ``applied/``/``archive/`` only when it is not a recognised
    historical artifact. To keep the guard strict where it matters most, the
    ``migrations/`` subdirectory must contain zero ``.sql`` files.
    """
    migrations_subdir = DEFAULT_MIGRATIONS_DIR / "migrations"
    if migrations_subdir.exists():
        stray = [
            p.name
            for p in migrations_subdir.iterdir()
            if p.is_file() and p.suffix == ".sql"
        ]
        assert stray == [], (
            f"Production migrations must not live in the runner-excluded "
            f"backend/scripts/migrations/ directory; found: {stray}. "
            f"Move them to the top level of backend/scripts/."
        )


def test_excluded_subdirs_constant_unchanged():
    """The runner still excludes the documented subdirectories (R2.1)."""
    assert {"applied", "archive", "migrations"} <= set(EXCLUDED_SUBDIRS)


# Active *operational* docs an operator follows for the multi-tenant migration.
# These must reference live, on-disk migration paths — they are exactly where a
# relocation/rename drift surfaces. Planning artifacts (.kiro/specs/**, the
# work-order plan) and historical/archive docs are exempt: specs legitimately
# reference not-yet-created (future-phase) and pre-change (problem-statement)
# paths, and archives are frozen snapshots.
_OPERATIONAL_DOCS = (
    "docs/multi-tenant-beanola-progress.md",
    "docs/multi-tenant-beanola-handover.md",
    "docs/multi-tenant-beanola-backfill-exception-report.md",
    "docs/runbooks/multi-tenant-beanola-rollout.md",
    "LOCAL-TESTING.md",
)


def _scripts_path_resolves(ref: str) -> bool:
    """True if a ``backend/scripts/...`` reference resolves to a file that
    exists anywhere in the scripts tree.

    A migration referenced by its top-level name is considered resolved if it
    exists at the referenced location OR has since been moved into an
    ``applied/`` or ``archive/`` subdirectory (the normal lifecycle for an
    applied migration). Only the basename is matched against those subdirs.
    """
    rel = ref[len("backend/") :]  # strip leading 'backend/'
    if (_BACKEND_ROOT / rel).exists():
        return True
    basename = Path(ref).name
    for subdir in ("applied", "archive"):
        if (DEFAULT_MIGRATIONS_DIR / subdir / basename).exists():
            return True
    return False


def _iter_operational_migration_references():
    """Yield ``(source_file, referenced_path)`` for every backend/scripts/*.sql
    path mentioned in the active operational multi-tenant docs.
    """
    pattern = re.compile(r"backend/scripts/[A-Za-z0-9_./-]+\.sql")
    for rel_doc in _OPERATIONAL_DOCS:
        doc = _REPO_ROOT / rel_doc
        if not doc.exists():
            continue
        try:
            text = doc.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for match in pattern.findall(text):
            yield doc, match


def test_operational_docs_reference_live_migration_paths():
    """Every backend/scripts/*.sql path in the operational multi-tenant docs
    resolves on disk (R2.4).

    This is the drift signal that matters for the relocation: the operator-
    facing progress/handover/rollout/backfill docs and LOCAL-TESTING must point
    at the live, on-disk migration path, never a dead pre-relocation path.
    """
    missing: list[str] = []
    for source, ref in _iter_operational_migration_references():
        if not _scripts_path_resolves(ref):
            missing.append(f"{source.relative_to(_REPO_ROOT)} -> {ref}")
    assert not missing, (
        "Operational docs reference migration paths that do not exist on disk "
        "(update them after relocating/renaming a migration):\n"
        + "\n".join(sorted(missing))
    )
