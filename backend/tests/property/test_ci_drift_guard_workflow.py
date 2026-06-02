"""Property-based test: CI drift-guard workflow YAML schema.

# Feature: production-schema-reconciliation
# Property: CI drift-guard job structure

The ``drift-guard`` job in ``.github/workflows/backend-governance.yml``
encodes the CI invariants from design.md Component 7 (CI drift-guard
workflow) and Requirements 5.7 / 5.8. This property test parses the
YAML and asserts the five structural facts that *together* define the
"job is wired correctly" contract:

    1. A ``drift-guard`` job exists under ``jobs``.
    2. The ``drift-guard`` job's ``actions/checkout@v4`` step sets
       ``with.fetch-depth: 0`` — the migration-history coverage check
       reads ``git log -1 --format=%cI -- <file>`` timestamps, which
       only resolve correctly with the full history.
    3. Any step in the drift-guard job whose ``name`` contains
       "Delete" or "cleanup" (case-insensitive) carries
       ``if: always()`` so the Neon branch-fork cleanup runs even
       when an earlier step fails. This passes vacuously today (the
       cleanup step from Task 5.6 has not landed yet) and becomes a
       meaningful guard once Task 5.6 ships.
    4. ``NEON_API_KEY`` is referenced via the canonical secret
       expression ``${{ secrets.NEON_API_KEY }}`` somewhere inside
       the drift-guard job.
    5. At least one step in the drift-guard job invokes the
       ``check_schema_drift`` management command with **both**
       ``--check-fk-indexes`` and ``--check-migration-history-coverage``
       flags. Without both flags the CI guard would silently regress
       to the legacy default check.

Hypothesis is wired into this file the same way ``test_rollback_pairing.py``
wires it into the rollback-pairing structural property: each example
draws an arbitrary, unique, non-empty subset of the five assertion
names and runs only the drawn checks. The structural property does not
need generated input — every check is deterministic — but the draw-and-
dispatch pattern lets hypothesis shrink the failing sample to the
smallest single assertion name when a regression breaks just one rule,
which makes the failure message in CI immediately point at the broken
contract.

**Validates: Requirements 5.7, 5.8**

Spec: ``.kiro/specs/production-schema-reconciliation/`` — Task 5.4.
"""
from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any, Callable

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import pytest  # noqa: E402
import yaml  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402


# ---------------------------------------------------------------------------
# Path discovery
# ---------------------------------------------------------------------------

# ``parents[3]`` resolves to the repo root regardless of cwd:
#   tests/property/test_ci_drift_guard_workflow.py
#   parents[0] = property/
#   parents[1] = tests/
#   parents[2] = backend/
#   parents[3] = <repo root>
WORKFLOW_PATH: Path = (
    Path(__file__).resolve().parents[3]
    / ".github"
    / "workflows"
    / "backend-governance.yml"
)


# ---------------------------------------------------------------------------
# Loaders / accessors
# ---------------------------------------------------------------------------


def _load_workflow() -> dict[str, Any]:
    """Parse the workflow YAML once per assertion call.

    Re-reading the file inside each assertion keeps the test honest —
    it always reflects the current on-disk state, even when hypothesis
    runs many examples in a single test process. The file is small
    (well under 4 KiB), so the I/O cost is negligible.
    """
    if not WORKFLOW_PATH.is_file():
        pytest.fail(
            f"Workflow YAML not found at expected path {WORKFLOW_PATH}. "
            "The CI drift-guard contract cannot be evaluated."
        )
    with WORKFLOW_PATH.open("r", encoding="utf-8") as handle:
        loaded = yaml.safe_load(handle)
    assert isinstance(loaded, dict), (
        "Workflow YAML did not parse as a top-level mapping; got "
        f"{type(loaded).__name__}."
    )
    return loaded


def _drift_guard_job(workflow: dict[str, Any]) -> dict[str, Any]:
    """Return the ``drift-guard`` job mapping or fail with a clear message."""
    jobs = workflow.get("jobs")
    assert isinstance(jobs, dict), (
        "Workflow YAML is missing the top-level 'jobs' mapping."
    )
    job = jobs.get("drift-guard")
    assert isinstance(job, dict), (
        "Workflow YAML is missing the 'drift-guard' job under 'jobs'. "
        "Per Requirement 5.7, the CI guard ships as a dedicated job."
    )
    return job


def _drift_guard_steps(job: dict[str, Any]) -> list[dict[str, Any]]:
    """Return the drift-guard job's mapping-typed steps list."""
    steps = job.get("steps")
    assert isinstance(steps, list) and steps, (
        "drift-guard job has no 'steps' list — the job body is empty."
    )
    typed_steps = [step for step in steps if isinstance(step, dict)]
    assert typed_steps, (
        "drift-guard job 'steps' contains no mapping entries; "
        "GitHub Actions step entries must be mappings."
    )
    return typed_steps


def _step_name(step: dict[str, Any]) -> str:
    """Return the step's ``name:`` field as a string ('' when absent)."""
    name = step.get("name")
    return "" if name is None else str(name)


def _is_checkout_v4_step(step: dict[str, Any]) -> bool:
    """True when the step is an ``actions/checkout@v4`` invocation."""
    uses = step.get("uses")
    if not isinstance(uses, str):
        return False
    return uses.strip().startswith("actions/checkout@v4")


# Pre-compile once; the `re.IGNORECASE` flag handles "Delete", "delete",
# "Cleanup", "cleanup" in step names without per-call re-parsing.
_DELETE_OR_CLEANUP_RE = re.compile(r"(delete|cleanup)", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Individual assertion checks (one per contract rule)
# ---------------------------------------------------------------------------


def _check_drift_guard_job_exists() -> None:
    """Rule 1: a ``drift-guard`` job exists under ``jobs``.

    **Validates: Requirements 5.7**
    """
    workflow = _load_workflow()
    _drift_guard_job(workflow)


def _check_checkout_fetch_depth_zero() -> None:
    """Rule 2: ``actions/checkout@v4`` step sets ``with.fetch-depth: 0``.

    The migration-history coverage check (``--check-migration-history-coverage``)
    reads ``git log -1 --format=%cI -- <file>`` timestamps. GitHub
    Actions defaults to a shallow clone (``fetch-depth: 1``) which
    makes ``git log`` return empty for files older than HEAD, breaking
    the staleness comparison. ``fetch-depth: 0`` requests a full
    history clone.

    **Validates: Requirements 5.7**
    """
    workflow = _load_workflow()
    job = _drift_guard_job(workflow)
    steps = _drift_guard_steps(job)
    checkout_steps = [step for step in steps if _is_checkout_v4_step(step)]
    assert checkout_steps, (
        "drift-guard job has no 'actions/checkout@v4' step. The job "
        "must check out the repository before invoking check_schema_drift."
    )
    for step in checkout_steps:
        with_block = step.get("with")
        assert isinstance(with_block, dict), (
            "drift-guard 'actions/checkout@v4' step is missing a "
            "'with:' block. fetch-depth must be set explicitly."
        )
        fetch_depth = with_block.get("fetch-depth")
        # YAML parses bare ``0`` as the int 0; tolerate the string '0'
        # so a contributor writing ``fetch-depth: '0'`` is not
        # surprised by a false negative.
        assert fetch_depth == 0 or fetch_depth == "0", (
            "drift-guard checkout step must set with.fetch-depth: 0 "
            f"(observed {fetch_depth!r}). git log timestamps used by "
            "--check-migration-history-coverage require a full-history "
            "clone."
        )


def _check_delete_or_cleanup_steps_have_if_always() -> None:
    """Rule 3: every Delete/cleanup step in the drift-guard job has ``if: always()``.

    The Neon branch-fork cleanup added by Task 5.6 must run even when
    an earlier drift-guard step fails — otherwise a transient failure
    leaks a fork and burns through the Neon project's branch quota.

    Today (pre-Task-5.6) no step's ``name`` matches "Delete" or
    "cleanup", so this check passes vacuously. Once Task 5.6 lands a
    step with name like "Delete Neon branch fork" or "Neon branch
    cleanup", the same property automatically gains real teeth.

    **Validates: Requirements 5.7, 5.8**
    """
    workflow = _load_workflow()
    job = _drift_guard_job(workflow)
    steps = _drift_guard_steps(job)
    offenders: list[str] = []
    for step in steps:
        name = _step_name(step)
        if not name or _DELETE_OR_CLEANUP_RE.search(name) is None:
            continue
        if_clause = step.get("if")
        if if_clause is None or str(if_clause).strip() != "always()":
            offenders.append(name or "<unnamed>")
    assert not offenders, (
        "Steps whose name matches 'Delete' or 'cleanup' (case-insensitive) "
        "in the drift-guard job MUST carry 'if: always()' so the Neon "
        "branch-fork cleanup runs even when an earlier step fails. "
        f"Offending step name(s): {offenders}."
    )


def _check_neon_api_key_referenced_via_secrets() -> None:
    """Rule 4: ``NEON_API_KEY`` is sourced from ``${{ secrets.NEON_API_KEY }}``.

    The branch-fork creation step authenticates against Neon's API
    using ``Authorization: Bearer ${NEON_API_KEY}``. The value MUST
    come from a GitHub Actions secret reference; a hard-coded literal
    or an unset env var would either leak credentials or break the
    fork creation.

    **Validates: Requirements 5.7**
    """
    workflow = _load_workflow()
    job = _drift_guard_job(workflow)
    # ``yaml.safe_dump`` round-trips the parsed mapping back to a YAML
    # string. The secret expression ``${{ secrets.NEON_API_KEY }}``
    # survives the round-trip verbatim (PyYAML may quote it, but the
    # substring is preserved either way), which gives us a single
    # robust serialised view to grep over without having to walk
    # every nested mapping by hand.
    serialised_job = yaml.safe_dump(
        job, default_flow_style=False, sort_keys=False
    )
    assert "${{ secrets.NEON_API_KEY }}" in serialised_job, (
        "drift-guard job must reference NEON_API_KEY via the canonical "
        "GitHub Actions secret expression '${{ secrets.NEON_API_KEY }}'. "
        "A hard-coded literal or unset env var would either leak the "
        "key or break Neon branch-fork creation."
    )


def _check_drift_guard_cli_invoked_with_required_flags() -> None:
    """Rule 5: at least one ``run:`` step invokes the CLI with both flags.

    The drift-guard CLI's default behaviour (no flags) only exercises
    the legacy field/column coverage check. Both ``--check-fk-indexes``
    *and* ``--check-migration-history-coverage`` must be passed for
    the new invariants from this spec to be enforced in CI.

    **Validates: Requirements 5.7**
    """
    workflow = _load_workflow()
    job = _drift_guard_job(workflow)
    steps = _drift_guard_steps(job)
    matching_step_names: list[str] = []
    for step in steps:
        run_block = step.get("run")
        if not isinstance(run_block, str):
            continue
        if "check_schema_drift" not in run_block:
            continue
        if "--check-fk-indexes" not in run_block:
            continue
        if "--check-migration-history-coverage" not in run_block:
            continue
        matching_step_names.append(_step_name(step) or "<unnamed>")
    assert matching_step_names, (
        "drift-guard job must contain at least one step that invokes "
        "'check_schema_drift' with BOTH '--check-fk-indexes' and "
        "'--check-migration-history-coverage'. Without both flags the "
        "CI guard silently regresses to the legacy default check, "
        "leaving FK-index and migration-history coverage unenforced."
    )


# ---------------------------------------------------------------------------
# Hypothesis surface
# ---------------------------------------------------------------------------

ASSERTIONS: dict[str, Callable[[], None]] = {
    "drift_guard_job_exists": _check_drift_guard_job_exists,
    "checkout_fetch_depth_zero": _check_checkout_fetch_depth_zero,
    "delete_or_cleanup_steps_have_if_always": (
        _check_delete_or_cleanup_steps_have_if_always
    ),
    "neon_api_key_referenced_via_secrets": (
        _check_neon_api_key_referenced_via_secrets
    ),
    "drift_guard_cli_invoked_with_required_flags": (
        _check_drift_guard_cli_invoked_with_required_flags
    ),
}

ASSERTION_NAMES: list[str] = sorted(ASSERTIONS.keys())


@given(
    selected=st.lists(
        st.sampled_from(ASSERTION_NAMES),
        min_size=1,
        max_size=len(ASSERTION_NAMES),
        unique=True,
    )
)
@settings(max_examples=20, deadline=2000)
def test_drift_guard_workflow_contract_holds(selected: list[str]) -> None:
    """For every drawn assertion, the drift-guard job satisfies the contract.

    Hypothesis draws a non-empty unique subset of the five rule names
    per example. Each rule's check function is deterministic and
    self-contained — it loads the workflow, navigates to its corner
    of the YAML, and asserts the contract. When a contract regresses,
    hypothesis shrinks the failing example down to the single
    offending rule name, so the CI failure message points the
    contributor at exactly the rule that broke.

    **Validates: Requirements 5.7, 5.8**
    """
    for name in selected:
        ASSERTIONS[name]()


# ---------------------------------------------------------------------------
# Discovery sanity check
# ---------------------------------------------------------------------------


def test_workflow_yaml_discovery_is_present_and_parses() -> None:
    """Guard against the property silently passing on a missing or unparseable file.

    If the workflow file moves, is renamed, or becomes invalid YAML,
    every property example would fail to load it and the failure
    output would be repetitive. This sanity check produces a single
    clear error in that scenario so the contributor sees the
    misconfiguration immediately.

    **Validates: Requirements 5.7, 5.8**
    """
    assert WORKFLOW_PATH.is_file(), (
        f"Workflow YAML not found at expected path {WORKFLOW_PATH}. "
        "The CI drift-guard contract cannot be evaluated."
    )
    workflow = _load_workflow()
    assert isinstance(workflow.get("jobs"), dict), (
        "Workflow YAML missing top-level 'jobs' mapping; the "
        "drift-guard contract cannot be evaluated."
    )
