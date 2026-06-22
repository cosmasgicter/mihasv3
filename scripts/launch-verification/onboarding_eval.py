"""Pure-logic core for Gate 10 — Onboarding_Smoke_Gate (Requirement 10).

This module is the **pure, deterministic** decision layer behind the end-to-end
tenant onboarding smoke gate. It contains *no* network access, *no* Django, and
*no* I/O — only predicates and a sequencer over already-observed per-step facts
(whether a step succeeded, whether it errored, how long it took, and whether its
result was confirmed scoped to the created school). That keeps it trivially
importable from the ``run-onboarding-smoke.py`` wrapper (task 16.3), from CI, and
from the hypothesis property test (task 16.2), and lets the gate's
halt-at-first-failure behavior be property-tested independent of any live
deployment.

The single rule it encodes comes straight from Requirement 10.12:

* **R10.12 — halt at the first failing step.** IF any onboarding step *fails*,
  *returns an error response*, or *does not complete within 60 seconds*, THEN the
  gate halts the run, records the identity of the failing step, and reports the
  run as failed **without recording any subsequent step as passed**. The canonical
  journey order (R10.1–R10.11) is fixed in :data:`STEP_SEQUENCE`:

      create school → assets → document profile/template → program/offering →
      membership/grant → routing simulator → student application →
      scoped-staff read → super-admin read → payment verified → official document

A step is considered *passing* (:func:`step_passed`) **iff** it succeeded
(``ok``), did **not** error (``errored`` is false), completed within
:data:`STEP_TIMEOUT_MS` (60000 ms, with a non-negative elapsed time), **and** its
result was confirmed scoped to the created school (``scoped_to_school``). Per
R10.1–R10.11 every step is only "passed" after confirming the result is
retrievable and *scoped to the created school*, so ``scoped_to_school`` is a
first-class pass criterion here; callers that drive a step for which a positive
scope confirmation does not apply (none exist in the canonical journey) simply
record ``scoped_to_school = True``. The key defaults to ``True`` when absent so a
step is never penalized for an unobserved scope fact it did not assert.

:func:`sequence_onboarding` walks the provided step results **in order** and
halts at the **first** non-passing step: every step before it that passed is
recorded ``pass``; the failing step is recorded ``fail`` with the reason it
halted; and **every** later step is recorded ``skipped`` and is *never* marked
passed. The overall run ``passed`` is ``True`` **iff** there is at least one step,
**every** step passed, and nothing halted.

Per-step check rows use a closed ``result`` vocabulary (:data:`PASS` |
:data:`FAIL` | :data:`SKIPPED`) and carry the Gate 10 check fields named in the
design (``step``, ``result``, ``scoped_to_school``, ``elapsed_ms``,
``halted_at``) so the ``run-onboarding-smoke.py`` wrapper can drop them straight
into the gate's Evidence_Artifact.

**Validates: Requirements 10.12**
"""

from __future__ import annotations

from typing import Any, List, Mapping, Optional, Sequence

__all__ = [
    "STEP_TIMEOUT_MS",
    "STEP_SEQUENCE",
    "PASS",
    "FAIL",
    "SKIPPED",
    "REASON_FAILED",
    "REASON_ERRORED",
    "REASON_TIMEOUT",
    "REASON_INVALID_ELAPSED",
    "REASON_NOT_SCOPED",
    "step_name",
    "step_passed",
    "failure_reason",
    "sequence_onboarding",
]

# --- Constants -------------------------------------------------------------

#: The per-step completion timeout from R10.12, in milliseconds (60 seconds).
#: A step that does not complete within this budget halts the run.
STEP_TIMEOUT_MS: int = 60000

#: The canonical ordered onboarding journey (R10.1–R10.11). The sequencer always
#: evaluates steps in the order they are provided; this tuple is the reference
#: order the ``run-onboarding-smoke.py`` wrapper drives and emits.
STEP_SEQUENCE: tuple = (
    "create_school",          # R10.1  create school (unique hostname + slug)
    "assets",                 # R10.2  logo + signature assets
    "document_profile",       # R10.3  document profile / template configuration
    "program_offering",       # R10.4  program + offering assignment
    "membership_grant",       # R10.5  staff membership + access grant
    "routing_simulator",      # R10.6  routing simulator run
    "student_application",    # R10.7  student application submission
    "scoped_staff_read",      # R10.8  scoped-staff read (in-scope vs not-found)
    "super_admin_read",       # R10.9  super-admin cross-school read
    "payment_verified",       # R10.10 payment reaches verified state
    "official_document",      # R10.11 official document generated
)

#: Per-step result vocabulary (mirrors the shared Evidence_Artifact envelope,
#: extended with ``skipped`` for steps after the halt point).
PASS: str = "pass"
FAIL: str = "fail"
SKIPPED: str = "skipped"

#: Reasons a step halts the run (recorded on the failing step's row and on the
#: overall ``failing_step``). Mutually exclusive; resolved in priority order by
#: :func:`failure_reason`.
REASON_FAILED: str = "failed"               # ``ok`` was not true
REASON_ERRORED: str = "errored"             # the step returned an error response
REASON_TIMEOUT: str = "timeout"             # elapsed_ms exceeded STEP_TIMEOUT_MS
REASON_INVALID_ELAPSED: str = "invalid_elapsed"  # elapsed_ms missing/negative/non-numeric
REASON_NOT_SCOPED: str = "not_scoped"       # result not confirmed scoped to school


# --- Field extraction helpers ----------------------------------------------


def _is_true(value: Any) -> bool:
    """Return ``True`` only for a real boolean ``True``.

    Defensive against ``None``/missing flags: anything that is not exactly the
    boolean ``True`` is treated as false.
    """
    return value is True


def _elapsed_within_timeout(elapsed_ms: Any, timeout_ms: float) -> Optional[bool]:
    """Classify ``elapsed_ms`` against ``timeout_ms``.

    Returns ``True`` if the elapsed time is a valid, non-negative number within
    ``timeout_ms``; ``False`` if it is a valid number that exceeds the timeout;
    and ``None`` if it is missing, non-numeric, or negative (an invalid
    measurement, which can never count as completing in time).
    """
    if isinstance(elapsed_ms, bool) or not isinstance(elapsed_ms, (int, float)):
        return None
    if elapsed_ms < 0:
        return None
    return elapsed_ms <= timeout_ms


def step_name(step: Mapping[str, Any], index: int = -1) -> str:
    """Return a stable identity for ``step``.

    Uses the ``step`` key when present (the canonical step name from
    :data:`STEP_SEQUENCE`); otherwise falls back to a positional ``step[<index>]``
    label so the failing step can always be named.
    """
    if isinstance(step, Mapping):
        name = step.get("step")
        if name:
            return str(name)
    return f"step[{index}]" if index >= 0 else "step[?]"


# --- Pass predicate (R10.12 / R10.1–R10.11) --------------------------------


def step_passed(step: Mapping[str, Any], timeout_ms: float = STEP_TIMEOUT_MS) -> bool:
    """Return ``True`` iff ``step`` passed (R10.12 + the per-step scope rule).

    A step passes **iff** all of the following hold:

    * ``ok`` is ``True`` — the step succeeded;
    * ``errored`` is not true — the step did not return an error response;
    * ``elapsed_ms`` is a valid, non-negative number **at most** ``timeout_ms``
      (default :data:`STEP_TIMEOUT_MS` = 60000 ms); and
    * ``scoped_to_school`` is true — the result was confirmed scoped to the
      created school (defaults to ``True`` when the key is absent).

    Anything else — a failure, an error, a missing/over-budget/invalid elapsed
    time, or an unscoped result — makes the step **not** passed.
    """
    if not isinstance(step, Mapping):
        return False
    if not _is_true(step.get("ok")):
        return False
    if _is_true(step.get("errored")):
        return False
    if _elapsed_within_timeout(step.get("elapsed_ms"), timeout_ms) is not True:
        return False
    # ``scoped_to_school`` defaults to True when unobserved; only an explicit
    # falsey scope fact fails the step.
    if not step.get("scoped_to_school", True):
        return False
    return True


def failure_reason(
    step: Mapping[str, Any], timeout_ms: float = STEP_TIMEOUT_MS
) -> Optional[str]:
    """Return the reason ``step`` halts the run, or ``None`` if it passed.

    Reasons are resolved in priority order so each failing step has a single,
    deterministic cause: :data:`REASON_ERRORED` (error response) →
    :data:`REASON_FAILED` (not ``ok``) → :data:`REASON_TIMEOUT` /
    :data:`REASON_INVALID_ELAPSED` (timing) → :data:`REASON_NOT_SCOPED` (result
    not scoped to the created school).
    """
    if not isinstance(step, Mapping):
        return REASON_FAILED
    if _is_true(step.get("errored")):
        return REASON_ERRORED
    if not _is_true(step.get("ok")):
        return REASON_FAILED
    within = _elapsed_within_timeout(step.get("elapsed_ms"), timeout_ms)
    if within is None:
        return REASON_INVALID_ELAPSED
    if within is False:
        return REASON_TIMEOUT
    if not step.get("scoped_to_school", True):
        return REASON_NOT_SCOPED
    return None


# --- Sequencer (R10.12) ----------------------------------------------------


def _check_row(
    step: Mapping[str, Any],
    name: str,
    result: str,
    halted_at: Optional[str],
    reason: Optional[str] = None,
) -> dict:
    """Build a single per-step check row in the Gate 10 shape."""
    scoped = step.get("scoped_to_school", True) if isinstance(step, Mapping) else None
    elapsed = step.get("elapsed_ms") if isinstance(step, Mapping) else None
    row = {
        "step": name,
        "result": result,
        "scoped_to_school": bool(scoped) if scoped is not None else None,
        "elapsed_ms": elapsed,
        "halted_at": halted_at,
    }
    if reason is not None:
        row["reason"] = reason
    return row


def sequence_onboarding(
    steps: Sequence[Mapping[str, Any]],
    timeout_ms: float = STEP_TIMEOUT_MS,
) -> dict:
    """Sequence onboarding step results, halting at the first failure (R10.12).

    Walks ``steps`` **in order**. Every step is evaluated with
    :func:`step_passed` until the **first** non-passing step is reached: that step
    is recorded :data:`FAIL` with its :func:`failure_reason`, becomes
    ``halted_at`` / ``failing_step``, and **every** subsequent step is recorded
    :data:`SKIPPED` — never :data:`PASS`. Steps before the halt that passed are
    recorded :data:`PASS`.

    Returns an object::

        {
          "passed": bool,            # True iff >=1 step and every step passed
          "halted_at": str | None,   # name of the first failing step, else None
          "failing_step": {          # identity + cause of the halt, else None
            "step": str, "reason": str
          } | None,
          "total": int,              # number of provided steps
          "passed_count": int,       # steps recorded pass (before any halt)
          "checks": [ <row>, ... ]   # per-step rows in the Gate 10 shape
        }

    The overall ``passed`` is ``True`` **iff** there is at least one step, nothing
    halted, and every step passed — matching the conservative default used across
    the harness (an empty step set is *not* a pass).
    """
    if steps is None:
        steps = []
    steps = list(steps)

    checks: List[dict] = []
    halted_at: Optional[str] = None
    failing_step: Optional[dict] = None
    passed_count = 0

    for index, step in enumerate(steps):
        name = step_name(step, index)

        if halted_at is not None:
            # Already halted: every later step is skipped, never passed.
            checks.append(_check_row(step, name, SKIPPED, halted_at))
            continue

        if step_passed(step, timeout_ms):
            passed_count += 1
            checks.append(_check_row(step, name, PASS, None))
        else:
            reason = failure_reason(step, timeout_ms) or REASON_FAILED
            halted_at = name
            failing_step = {"step": name, "reason": reason}
            checks.append(_check_row(step, name, FAIL, halted_at, reason))

    overall = len(steps) > 0 and halted_at is None
    return {
        "passed": overall,
        "halted_at": halted_at,
        "failing_step": failing_step,
        "total": len(steps),
        "passed_count": passed_count,
        "checks": checks,
    }
