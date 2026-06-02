"""Property-based test: every forward migration script ships with a rollback.

# Feature: production-schema-reconciliation
# Property: Rollback Pairing

For every ``*.sql`` file in ``backend/scripts/`` that is intended to be
applied as a forward migration, a sibling ``<basename>_rollback.sql``
file SHALL exist in the same directory. This is the structural contract
that backs the ``Rollback_Plan`` term in the requirements glossary —
without it, an operator hitting a production issue would have to write
an inverse SQL artefact under pressure rather than running a reviewed,
version-controlled file.

The property is evaluated against the *actual* on-disk set of
``backend/scripts/*.sql`` files. The forward set is computed by:

1. Listing top-level ``.sql`` files in ``backend/scripts/`` (no recursion
   — the ``applied/`` and ``archive/`` subdirectories are explicitly
   excluded by Requirement 9.1's wording, and ``migrations/`` is the
   legacy directory mentioned in design.md Component 3).
2. Dropping any filename ending in ``_rollback.sql`` (those *are* the
   rollback siblings — the property does not require a "rollback of a
   rollback").
3. Dropping ``00_full_schema.sql`` (documentation snapshot, never
   applied) and ``legacy_columns_drop_2026_08_15.sql`` (deliberately
   not applied — see ``backend/scripts/MIGRATION_HISTORY.md``).

For every remaining filename, a matching ``<basename>_rollback.sql`` file
must be present.

Hypothesis is used to draw arbitrary non-empty subsets of the discovered
forward-script set and assert the rollback-pairing invariant per draw.
The structural property does not require generated input, but exercising
it via hypothesis confirms the property-test framework is wired in for
this Wave-4 task and surfaces shrinking output when an operator forgets
to author a sibling.

**Validates: Requirements 9.1**

Spec: ``.kiro/specs/production-schema-reconciliation/`` — Task 2.4.
"""
from __future__ import annotations

import os
from pathlib import Path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from hypothesis import given, settings
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Discover the forward-script set
# ---------------------------------------------------------------------------

# ``parents[2]`` resolves to ``backend/`` regardless of cwd:
#   tests/property/test_rollback_pairing.py
#   parents[0] = property/
#   parents[1] = tests/
#   parents[2] = backend/
SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"

# Excluded forward filenames per Requirement 9.1 and the task description.
# ``00_full_schema.sql`` is a documentation snapshot generated from the
# live schema, never applied as a migration. ``legacy_columns_drop_*``
# is reserved for a future, deliberate non-additive operation that is
# explicitly called out as "deliberately not applied" in the migration
# history mirror.
EXCLUDED_FORWARD_FILENAMES = frozenset(
    {
        "00_full_schema.sql",
        "legacy_columns_drop_2026_08_15.sql",
    }
)

ROLLBACK_SUFFIX = "_rollback.sql"


def _discover_forward_scripts() -> list[str]:
    """Return the sorted list of forward-script basenames.

    Top-level ``backend/scripts/*.sql`` only. The ``applied/``,
    ``archive/``, and legacy ``migrations/`` subdirectories are excluded
    by virtue of not iterating into them.
    """
    if not SCRIPTS_DIR.is_dir():
        return []

    candidates: list[str] = []
    for entry in sorted(SCRIPTS_DIR.iterdir()):
        if not entry.is_file():
            continue
        name = entry.name
        if not name.endswith(".sql"):
            continue
        if name.endswith(ROLLBACK_SUFFIX):
            continue
        if name in EXCLUDED_FORWARD_FILENAMES:
            continue
        candidates.append(name)
    return candidates


FORWARD_SCRIPTS: list[str] = _discover_forward_scripts()


def _rollback_sibling_for(forward_name: str) -> Path:
    """Compute the expected rollback path for a forward filename."""
    basename = forward_name[: -len(".sql")]
    return SCRIPTS_DIR / f"{basename}{ROLLBACK_SUFFIX}"


# ---------------------------------------------------------------------------
# Property: every forward script has a rollback sibling
# ---------------------------------------------------------------------------


@given(
    forward_subset=st.lists(
        st.sampled_from(FORWARD_SCRIPTS) if FORWARD_SCRIPTS else st.nothing(),
        min_size=1,
        max_size=max(1, len(FORWARD_SCRIPTS)),
        unique=True,
    )
)
@settings(max_examples=20, deadline=2000)
def test_every_forward_script_has_rollback_sibling(forward_subset: list[str]) -> None:
    """For every forward ``*.sql`` script, ``<basename>_rollback.sql`` must exist.

    Requirement 9.1 binds the Schema_Reconciliator to produce a sibling
    rollback file whenever it produces a forward Migration_Script. This
    property test enforces that contract structurally — no SQL is
    executed; only the on-disk presence of the sibling file is checked.

    Drawing arbitrary non-empty subsets exercises the property under
    hypothesis-controlled shrinking, so a missing rollback shows up with
    the offending filename in the shrunk counterexample rather than a
    bulk failure that hides which forward script forgot its sibling.

    **Validates: Requirements 9.1**
    """
    missing: list[str] = []
    for forward_name in forward_subset:
        rollback_path = _rollback_sibling_for(forward_name)
        if not rollback_path.is_file():
            missing.append(rollback_path.name)

    assert not missing, (
        "Forward migration script(s) missing required _rollback.sql sibling(s) "
        f"in {SCRIPTS_DIR}: {sorted(missing)}. "
        "Per Requirement 9.1, every forward Migration_Script must ship with a "
        "sibling rollback file in the same directory."
    )


# ---------------------------------------------------------------------------
# Sanity check: discovery itself is not silently empty
# ---------------------------------------------------------------------------


def test_forward_script_discovery_is_non_empty() -> None:
    """Guard against the property silently passing on an empty draw set.

    If ``FORWARD_SCRIPTS`` is empty (e.g. someone moves the scripts
    directory), the hypothesis ``sampled_from`` strategy collapses to
    ``st.nothing()`` and the property degenerates into a no-op. This
    sanity check makes that mode an explicit failure so the operator
    sees the misconfiguration immediately.

    **Validates: Requirements 9.1**
    """
    assert SCRIPTS_DIR.is_dir(), (
        f"backend/scripts/ not found at expected path {SCRIPTS_DIR}. "
        "The rollback-pairing property cannot run."
    )
    assert FORWARD_SCRIPTS, (
        f"No forward migration scripts discovered under {SCRIPTS_DIR}. "
        "Either the directory is empty or every script is excluded. "
        "Verify EXCLUDED_FORWARD_FILENAMES has not over-matched."
    )
