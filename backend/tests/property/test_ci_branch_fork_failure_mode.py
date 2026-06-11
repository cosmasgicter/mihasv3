"""Property-based test: branch-fork failure mode emits the canonical marker.

# Feature: production-schema-reconciliation (amended post Neon→self-hosted migration)
# Property: Every Neon branch-fork failure path is tagged with the
#           canonical ``NEON_BRANCH_FORK_UNAVAILABLE`` marker so a Neon
#           API problem is distinguishable from a real schema-drift
#           finding in the CI logs.

Original Requirement 5.9 (Acceptance Criterion 10 of Requirement 5) said the
workflow SHALL ``exit 1`` on a fork-creation failure. That requirement was
written when **Neon was the production database**. The platform has since
migrated production to self-hosted Postgres (see
``deploy/RUNBOOK.md`` / ``.kiro/steering/infrastructure.md``); Neon is now only
the *authoring* database. A Neon-side problem (missing key, branch-quota
exhaustion → HTTP 422, transient API error) must therefore NOT fail the
Backend Governance run — the drift-guard degrades to a warning+skip while the
``schema-and-outbox-checks`` job remains the hard gate.

The **amended contract** this test now enforces (operator-signal preserved,
fail-fast relaxed):

    Every terminating branch of the fork-creation step — whether it
    ``exit 1`` (genuine contract violation) or ``exit 0`` with
    ``skipped=true`` (graceful Neon-unavailable degrade) — that handles a
    Neon failure MUST echo the canonical literal
    ``NEON_BRANCH_FORK_UNAVAILABLE`` (or the broader skip warning) so the
    CI log distinguishes a Neon problem from a real drift finding.

Concretely we assert:
    1. the fork-creation step exists in the drift-guard job;
    2. the canonical literal appears in the run body;
    3. the step degrades gracefully — it sets ``skipped=true`` and does NOT
       hard-fail the run on a Neon-unavailable condition;
    4. the run body never contains a bare ``exit 1`` (the obsolete fail-fast
       behaviour that broke governance after the migration).

The test parses the YAML on every example so it always reflects the
current on-disk state.

**Validates: Requirements 5.9 (amended for self-hosted production)**

Spec: ``.kiro/specs/production-schema-reconciliation/`` — Task 5.5,
amended by the multi-tenant-beanola / self-hosted migration.
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
#   tests/property/test_ci_branch_fork_failure_mode.py
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

# The literal that every Neon-fork failure branch must echo. This must
# match the spec text in Requirement 5.9 and design.md Component 7.
CANONICAL_LITERAL: str = "NEON_BRANCH_FORK_UNAVAILABLE"


# ---------------------------------------------------------------------------
# Loaders / accessors
# ---------------------------------------------------------------------------


def _load_workflow() -> dict[str, Any]:
    """Parse the workflow YAML once per assertion call."""
    if not WORKFLOW_PATH.is_file():
        pytest.fail(
            f"Workflow YAML not found at expected path {WORKFLOW_PATH}. "
            "The branch-fork failure-mode contract cannot be evaluated."
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
        "The branch-fork failure-mode contract requires a drift-guard "
        "job containing the fork-creation step."
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


# Pre-compiled once. Matches a fork-creation step's name like
# "Create Neon branch fork" (case-insensitive). The ``id: fork`` field
# is the primary discriminator; the name regex is the fallback so a
# rename of ``id:`` does not silently invalidate the test.
_FORK_NAME_RE = re.compile(r"create\s+neon\s+branch\s+fork", re.IGNORECASE)


def _fork_creation_step(steps: list[dict[str, Any]]) -> dict[str, Any]:
    """Return the fork-creation step or fail with a clear message.

    Identification rules, in order:

    1. ``id: fork`` (canonical — the design specifies this).
    2. ``name`` matching ``Create Neon branch fork`` (fallback for
       contributors who rename ``id:`` while preserving the human
       label).

    A step matched by either rule is the fork-creation step. Both
    rules use case-insensitive matching for the human-facing fields.
    """
    for step in steps:
        step_id = step.get("id")
        if isinstance(step_id, str) and step_id.strip().lower() == "fork":
            return step
    for step in steps:
        name = step.get("name")
        if isinstance(name, str) and _FORK_NAME_RE.search(name):
            return step
    pytest.fail(
        "drift-guard job has no fork-creation step. Expected a step "
        "with 'id: fork' OR 'name' matching 'Create Neon branch fork' "
        "(case-insensitive). Per design.md Component 7, this step "
        "owns the Neon branch fork lifecycle and the failure-mode "
        "marker required by Requirement 5.9."
    )


def _fork_run_body(step: dict[str, Any]) -> str:
    """Return the fork-creation step's ``run:`` body as a string."""
    run_block = step.get("run")
    assert isinstance(run_block, str) and run_block.strip(), (
        "Fork-creation step has no non-empty 'run:' body. The shell "
        "block that creates the Neon branch fork (and emits the "
        "canonical failure marker) must live under 'run:'."
    )
    return run_block


# ---------------------------------------------------------------------------
# Helpers for failure-branch analysis
# ---------------------------------------------------------------------------


# Match a line whose first non-whitespace token is ``exit`` followed by
# ``1`` (with an optional trailing comment or semicolon). This catches
# ``    exit 1`` and ``exit 1;`` but does NOT match ``exit 0`` or
# ``# exit 1`` in a comment.
_EXIT_ONE_RE = re.compile(r"^\s*exit\s+1\b")

# A comment line (entirely a ``#`` comment after stripping leading
# whitespace).
_COMMENT_LINE_RE = re.compile(r"^\s*#")


def _is_exit_one_line(line: str) -> bool:
    """True when the line's effective code is ``exit 1``."""
    return bool(_EXIT_ONE_RE.match(line))


def _is_blank_or_comment(line: str) -> bool:
    """True when the line is blank or a shell comment."""
    return not line.strip() or bool(_COMMENT_LINE_RE.match(line))


def _exit_one_indices(lines: list[str]) -> list[int]:
    """Return 0-based line indices of every ``exit 1`` line."""
    return [i for i, line in enumerate(lines) if _is_exit_one_line(line)]


def _backward_window_has_canonical(
    lines: list[str], idx: int, *, window: int = 5
) -> bool:
    """True iff one of the up-to-``window`` non-comment lines preceding
    ``idx`` contains ``CANONICAL_LITERAL``.

    The window walks backwards from ``idx - 1``, skipping blank and
    comment lines, until ``window`` non-trivial lines have been
    examined or the start of the run body is reached. A non-trivial
    line is any line that is neither blank nor a comment. The test
    deliberately ignores blank/comment lines so a contributor adding
    a documentation comment between the ``echo`` and the ``exit 1``
    does not break the property.
    """
    examined = 0
    j = idx - 1
    while j >= 0 and examined < window:
        line = lines[j]
        if _is_blank_or_comment(line):
            j -= 1
            continue
        if CANONICAL_LITERAL in line:
            return True
        examined += 1
        j -= 1
    return False


# ---------------------------------------------------------------------------
# Individual assertion checks (one per contract rule)
# ---------------------------------------------------------------------------


def _check_fork_creation_step_exists() -> None:
    """Rule 1: the fork-creation step is present in the drift-guard job.

    Without this step there is no Neon branch fork to fail against,
    and the failure-marker contract is moot. Loading the step here is
    also a precondition for every other rule in this file.

    **Validates: Requirements 5.9**
    """
    workflow = _load_workflow()
    job = _drift_guard_job(workflow)
    steps = _drift_guard_steps(job)
    _fork_creation_step(steps)


def _check_canonical_literal_present_in_run_body() -> None:
    """Rule 2: the fork-creation step's run body contains the literal.

    This is the minimum bar set by Task 5.5 — the canonical literal
    must appear at least once in the failure-handling block. Rule 3
    strengthens this to "every exit 1 is tagged", but Rule 2 stands
    on its own as a fast structural smoke test.

    **Validates: Requirements 5.9**
    """
    workflow = _load_workflow()
    job = _drift_guard_job(workflow)
    steps = _drift_guard_steps(job)
    fork_step = _fork_creation_step(steps)
    run_body = _fork_run_body(fork_step)
    assert CANONICAL_LITERAL in run_body, (
        "Fork-creation step's 'run:' body does not contain the "
        f"canonical literal {CANONICAL_LITERAL!r}. Per Requirement "
        "5.9, every Neon branch-fork failure branch MUST echo this "
        "literal so the CI failure is distinguishable from a real "
        "schema-drift finding."
    )


def _check_degrades_gracefully_not_hard_fail() -> None:
    """Rule 3: the fork-creation step degrades to a skip, never hard-fails.

    Post-migration contract: a Neon-unavailable condition must set
    ``skipped=true`` (consumed by the ``if: steps.fork.outputs.skipped !=
    'true'`` guard on the drift run) and must NOT contain a bare ``exit 1``
    that would fail the whole Backend Governance run. Neon is authoring-only;
    the ``schema-and-outbox-checks`` job is the real hard gate.

    **Validates: Requirements 5.9 (amended)**
    """
    workflow = _load_workflow()
    job = _drift_guard_job(workflow)
    steps = _drift_guard_steps(job)
    fork_step = _fork_creation_step(steps)
    run_body = _fork_run_body(fork_step)
    lines = run_body.splitlines()

    # No bare ``exit 1`` — the obsolete fail-fast that broke governance.
    exit_one_lines = [
        (i + 1, lines[i].rstrip()) for i in _exit_one_indices(lines)
    ]
    assert not exit_one_lines, (
        "Fork-creation step still contains a bare 'exit 1'. Post Neon→self-"
        "hosted migration the step must degrade to a warning+skip (set "
        "'skipped=true' and 'exit 0'), not fail the governance run. "
        f"Offending lines: {exit_one_lines}"
    )

    # Must set the skip signal the drift run is gated on.
    assert "skipped=true" in run_body, (
        "Fork-creation step must emit 'skipped=true' on a Neon-unavailable "
        "condition so the drift run is bypassed gracefully (the run step is "
        "gated on \"if: steps.fork.outputs.skipped != 'true'\")."
    )


def _check_skip_paths_are_tagged_or_warned() -> None:
    """Rule 4: every graceful-skip path carries an operator signal.

    Each branch that sets ``skipped=true`` must, within a small backward
    window, surface either the canonical ``NEON_BRANCH_FORK_UNAVAILABLE``
    marker or a ``::warning::`` annotation — so a skipped drift-guard is
    visible in the CI log and never silently mistaken for a clean pass.

    **Validates: Requirements 5.9 (amended)**
    """
    workflow = _load_workflow()
    job = _drift_guard_job(workflow)
    steps = _drift_guard_steps(job)
    fork_step = _fork_creation_step(steps)
    run_body = _fork_run_body(fork_step)
    lines = run_body.splitlines()

    skip_indices = [i for i, line in enumerate(lines) if "skipped=true" in line]
    assert skip_indices, (
        "Fork-creation step has no 'skipped=true' branch; the graceful-"
        "degrade contract requires at least one."
    )

    def _window_has_signal(idx: int, *, window: int = 6) -> bool:
        examined = 0
        j = idx - 1
        while j >= 0 and examined < window:
            line = lines[j]
            if _is_blank_or_comment(line):
                j -= 1
                continue
            if CANONICAL_LITERAL in line or "::warning::" in line:
                return True
            examined += 1
            j -= 1
        return False

    untagged = [
        (idx + 1, lines[idx].rstrip())
        for idx in skip_indices
        if not _window_has_signal(idx)
    ]
    assert not untagged, (
        "Each 'skipped=true' branch MUST be preceded (within 6 non-trivial "
        f"lines) by an operator signal — the canonical {CANONICAL_LITERAL!r} "
        "marker or a '::warning::' annotation — so a Neon-unavailable skip is "
        f"distinguishable from a clean pass. Untagged: {untagged}"
    )


# ---------------------------------------------------------------------------
# Hypothesis surface
# ---------------------------------------------------------------------------

ASSERTIONS: dict[str, Callable[[], None]] = {
    "fork_creation_step_exists": _check_fork_creation_step_exists,
    "canonical_literal_present_in_run_body": (
        _check_canonical_literal_present_in_run_body
    ),
    "degrades_gracefully_not_hard_fail": (
        _check_degrades_gracefully_not_hard_fail
    ),
    "skip_paths_are_tagged_or_warned": (
        _check_skip_paths_are_tagged_or_warned
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
def test_branch_fork_failure_mode_contract_holds(selected: list[str]) -> None:
    """For every drawn assertion, the fork-creation step satisfies the contract.

    Hypothesis draws a non-empty unique subset of the four rule names
    per example. Each rule's check function is deterministic and
    self-contained — it loads the workflow, navigates to the fork
    creation step, and asserts the contract. When a contract
    regresses, hypothesis shrinks the failing example down to the
    single offending rule name, so the CI failure message points the
    contributor at exactly the rule that broke.

    **Validates: Requirements 5.9**
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

    **Validates: Requirements 5.9**
    """
    assert WORKFLOW_PATH.is_file(), (
        f"Workflow YAML not found at expected path {WORKFLOW_PATH}. "
        "The branch-fork failure-mode contract cannot be evaluated."
    )
    workflow = _load_workflow()
    assert isinstance(workflow.get("jobs"), dict), (
        "Workflow YAML missing top-level 'jobs' mapping; the "
        "branch-fork failure-mode contract cannot be evaluated."
    )
