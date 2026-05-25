"""Property-based test: branch-fork failure mode emits the canonical line.

# Feature: production-schema-reconciliation
# Property: Every Neon branch-fork failure path is tagged with the
#           canonical ``NEON_BRANCH_FORK_UNAVAILABLE`` marker so a CI
#           failure caused by Neon API trouble is distinguishable from
#           a real schema-drift finding.

Per Requirement 5.9 (Acceptance Criterion 10 of Requirement 5):

    IF the Neon_Branch_Fork creation step fails, THEN THE workflow
    SHALL exit with status 1 AND SHALL print
    ``NEON_BRANCH_FORK_UNAVAILABLE: <error>`` so the CI failure is
    distinguishable from a real drift finding.

The fork-creation step in ``.github/workflows/backend-governance.yml``
(design.md Component 7) currently has three failure branches:

    1. ``curl ... || { echo "NEON_BRANCH_FORK_UNAVAILABLE: API request
       failed"; exit 1; }`` — Neon HTTP call failed.
    2. ``if [ -z "$branch_id" ] ... ; then echo
       "NEON_BRANCH_FORK_UNAVAILABLE: branch id missing in response";
       exit 1; fi`` — response JSON shape regression.
    3. ``if [ -z "$conn" ] ... ; then echo
       "NEON_BRANCH_FORK_UNAVAILABLE: connection_uri missing in
       response"; exit 1; fi`` — response JSON shape regression.

The property under test: **every shell branch in the fork-creation
step that terminates with ``exit 1`` is preceded (within the same
local context) by an ``echo`` containing the canonical literal
``NEON_BRANCH_FORK_UNAVAILABLE``.**  An ``exit 1`` without the marker
would degrade R5.9: the CI failure would be indistinguishable from a
genuine drift finding, eroding the operator signal that the spec is
designed to deliver.

The test parses the YAML on every example so it always reflects the
current on-disk state. Hypothesis draws a non-empty unique subset of
the per-rule assertion names per example and runs only the drawn
checks; this lets shrinking pinpoint the single broken rule when a
contract regresses.

**Validates: Requirements 5.9**

Spec: ``.kiro/specs/production-schema-reconciliation/`` — Task 5.5.
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


def _check_every_exit_one_is_tagged_with_canonical_literal() -> None:
    """Rule 3: every ``exit 1`` in the fork-creation step is preceded
    by an ``echo`` containing ``NEON_BRANCH_FORK_UNAVAILABLE``.

    This is the deep form of Rule 2: the literal must not just appear
    *somewhere* in the run body, it must precede *every* failure
    exit. Otherwise a contributor could add a new failure branch
    (e.g. a missing-jq error) that exits 1 silently and the operator
    would see a CI failure indistinguishable from a real drift
    finding.

    The check walks backwards up to 5 non-trivial lines from each
    ``exit 1`` line, skipping blanks and comments. The 5-line window
    matches the longest existing failure branch in design.md
    Component 7's Component 7 YAML (4 lines) plus a one-line
    tolerance for future additions.

    **Validates: Requirements 5.9**
    """
    workflow = _load_workflow()
    job = _drift_guard_job(workflow)
    steps = _drift_guard_steps(job)
    fork_step = _fork_creation_step(steps)
    run_body = _fork_run_body(fork_step)
    lines = run_body.splitlines()
    exit_one_lines = _exit_one_indices(lines)
    assert exit_one_lines, (
        "Fork-creation step's 'run:' body has no 'exit 1' line. The "
        "step must surface failure with status 1 per Requirement 5.9."
    )
    untagged: list[tuple[int, str]] = []
    for idx in exit_one_lines:
        if not _backward_window_has_canonical(lines, idx):
            untagged.append((idx + 1, lines[idx].rstrip()))
    assert not untagged, (
        "Each 'exit 1' in the fork-creation step's 'run:' body MUST "
        "be preceded (within 5 non-trivial lines) by an 'echo' "
        f"containing the canonical literal {CANONICAL_LITERAL!r}. "
        "Per Requirement 5.9, an untagged failure branch is "
        "indistinguishable from a real schema-drift finding in the "
        "CI logs.\n"
        "Untagged 'exit 1' lines (1-based line number, line text): "
        f"{untagged}"
    )


def _check_canonical_literal_appears_at_least_once_per_exit_one() -> None:
    """Rule 4: count(``CANONICAL_LITERAL``) >= count(``exit 1``).

    A weaker but easier-to-shrink form of Rule 3. If there are three
    failure branches each ending in ``exit 1``, the literal must
    appear at least three times. This rule complements Rule 3 by
    catching the common regression of "I added a new failure branch
    but forgot to echo the marker" without requiring per-line
    backward-window analysis.

    **Validates: Requirements 5.9**
    """
    workflow = _load_workflow()
    job = _drift_guard_job(workflow)
    steps = _drift_guard_steps(job)
    fork_step = _fork_creation_step(steps)
    run_body = _fork_run_body(fork_step)
    lines = run_body.splitlines()
    exit_one_count = len(_exit_one_indices(lines))
    literal_count = run_body.count(CANONICAL_LITERAL)
    assert literal_count >= exit_one_count, (
        "Fork-creation step has "
        f"{exit_one_count} 'exit 1' line(s) but the canonical literal "
        f"{CANONICAL_LITERAL!r} appears only {literal_count} time(s). "
        "Each failure branch that exits 1 MUST echo the literal so "
        "operators can distinguish a Neon-API failure from a real "
        "schema-drift finding. Per Requirement 5.9."
    )


# ---------------------------------------------------------------------------
# Hypothesis surface
# ---------------------------------------------------------------------------

ASSERTIONS: dict[str, Callable[[], None]] = {
    "fork_creation_step_exists": _check_fork_creation_step_exists,
    "canonical_literal_present_in_run_body": (
        _check_canonical_literal_present_in_run_body
    ),
    "every_exit_one_is_tagged_with_canonical_literal": (
        _check_every_exit_one_is_tagged_with_canonical_literal
    ),
    "canonical_literal_appears_at_least_once_per_exit_one": (
        _check_canonical_literal_appears_at_least_once_per_exit_one
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
@settings(max_examples=25, deadline=2000)
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
