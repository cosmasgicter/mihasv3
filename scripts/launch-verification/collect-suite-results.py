#!/usr/bin/env python3
"""Gate 6 — Suite_Execution_Gate collector (Requirement 6).

**Execution world: CI.** This collector records the result of every required
frontend and backend suite into a launch-verification ``Evidence_Artifact``. It
is designed to be wired into the existing ``admissions`` / ``backend`` /
``backend-property`` CI jobs (task 18.2) by wrapping each step's exit code and
captured output, but it is equally usable offline by feeding pre-captured
outputs from a JSON file — which is exactly how task 11.4 unit-tests the parser
layer and how the ``--dry-run`` verification below works.

Design (``.kiro/specs/beanola-launch-verification/design.md`` → "Gate 6 —
Suite_Execution_Gate"):

* **Required suites** (R6.1–R6.6): admissions ``type-check``, ``lint``
  (``--max-warnings 0``), ``build``, unit tests, property tests, the Playwright
  smoke run; backend ``manage.py check``, the full ``pytest`` run (including the
  tenant-lifecycle / admin-journey / student-journey tests), and ``manage.py
  spectacular``.
* **Per-tool parsing** (R6.1–R6.6): a *pure* parser layer turns each suite's
  ``(command, exit_code, stdout, stderr)`` into normalized counts
  (``executed`` / ``passed`` / ``failed`` / ``skipped`` / ``errors`` /
  ``warnings``). The spectacular parser reuses the exact ``Errors: N`` /
  ``Warnings: N`` stderr summary the ``ci.yml`` ``OpenAPI schema generation
  (zero errors)`` step already greps, and adds the R6.6 zero-**warning**
  requirement (the ``get_available_offerings`` warning resolved in task 11.1).
* **Conservative rollup** (R6.7, R6.8): the gate passes **iff every** required
  suite was recorded with exit code ``0``, zero failed tests, zero errors, and
  zero warnings *where zero is required* (lint ``--max-warnings 0`` and
  spectacular's zero-warning rule). Any non-zero exit, failed test, or
  disallowed warning marks the gate not passed and records the failing command
  string + exit code. A **missing** suite result (not captured, not executed) is
  treated as not-measured and likewise forces not-passed — never silently
  skipped.
* **Emits** ``docs/launch-evidence/06-suite/suite-evidence.json`` through the
  shared envelope (``gate_id="suite"``, ``requirement="R6"``,
  ``generated_by="ci"``); the process exits non-zero on a not-passed verdict so
  CI fails closed.

The parser layer is intentionally pure and stdlib-only so it is trivially
testable over sample outputs (task 11.4) and importable without Django. The
orchestration layer supports three input modes, in precedence order:

1. ``--inputs FILE`` — ingest pre-captured ``{suite_id: {exit_code, stdout,
   stderr}}`` outputs (the CI / offline path; each CI step writes its captured
   output here).
2. ``--execute`` — run any not-yet-supplied suite via ``subprocess`` from its
   working directory (local / full-run path).
3. ``--dry-run`` — synthesize an all-pass (or, with ``--dry-run-fail SUITE``, a
   one-fail) capture for every suite, for offline envelope verification.

Run it::

    # CI: each job writes its step output into captured-suites.json, then:
    python3 scripts/launch-verification/collect-suite-results.py \\
        --inputs captured-suites.json

    # Local full run (executes every suite from its working dir):
    python3 scripts/launch-verification/collect-suite-results.py --execute

    # Offline envelope check (no subprocess, synthetic all-pass):
    python3 scripts/launch-verification/collect-suite-results.py --dry-run

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8**
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Sequence


# ---------------------------------------------------------------------------
# Locate the repo + import the shared evidence schema (backend).
# ---------------------------------------------------------------------------

_THIS_FILE = Path(__file__).resolve()
_THIS_DIR = _THIS_FILE.parent
# parents[0] = scripts/launch-verification, [1] = scripts, [2] = repo root
REPO_ROOT = _THIS_FILE.parents[2]
_BACKEND_DIR = REPO_ROOT / "backend"


def _ensure_on_path(directory: Path) -> None:
    """Insert ``directory`` at the front of ``sys.path`` if not already present."""
    text = str(directory)
    if text not in sys.path:
        sys.path.insert(0, text)


_ensure_on_path(_BACKEND_DIR)

try:
    from apps.common.launch_verification.evidence import (  # noqa: E402
        EvidenceArtifact,
        EvidenceStatus,
        GeneratedBy,
        to_json,
        utc_now_iso,
    )
except ImportError as exc:  # pragma: no cover - defensive, surfaces a clear error
    raise SystemExit(
        "collect-suite-results: could not import the evidence schema from "
        f"{_BACKEND_DIR}/apps/common/launch_verification/evidence.py — {exc}"
    )


# Per-check result tokens — mirror evidence.CheckResult enum values so the rows
# round-trip cleanly through the envelope.
PASS = "pass"
FAIL = "fail"
NOT_MEASURED = "not-measured"


# ===========================================================================
# Pure parser layer (task 11.4 unit-tests this over sample outputs).
# ===========================================================================
#
# Each parser is a pure function ``(exit_code, stdout, stderr) -> SuiteCounts``.
# A ``SuiteCounts`` carries the normalized, tool-agnostic counts the rollup
# reasons over. Parsers never raise on unrecognized output: they fall back to
# zero counts and lean on ``exit_code`` so an unparseable-but-failing run is
# still (conservatively) treated as a failure by the rollup.


@dataclass
class SuiteCounts:
    """Normalized counts extracted from one suite's captured output."""

    exit_code: int
    executed: int = 0
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    errors: int = 0
    warnings: int = 0

    def to_dict(self) -> Dict[str, int]:
        return {
            "exit_code": self.exit_code,
            "executed": self.executed,
            "passed": self.passed,
            "failed": self.failed,
            "skipped": self.skipped,
            "errors": self.errors,
            "warnings": self.warnings,
        }


def _first_int(pattern: str, text: str, *, default: int = 0) -> int:
    """Return the first capture group of ``pattern`` in ``text`` as int, or default."""
    match = re.search(pattern, text)
    if not match:
        return default
    try:
        return int(match.group(1))
    except (ValueError, IndexError):
        return default


def parse_tsc(exit_code: int, stdout: str, stderr: str) -> SuiteCounts:
    """Parse ``tsc`` / ``bun run type-check`` output into error counts.

    ``tsc`` prints ``Found N errors.`` (or ``Found 1 error.``) and one
    ``error TSxxxx:`` line per diagnostic. We prefer the summary and fall back to
    counting diagnostic lines.
    """
    text = f"{stdout}\n{stderr}"
    summary = re.search(r"Found (\d+) error", text)
    if summary:
        errors = int(summary.group(1))
    else:
        errors = len(re.findall(r"error TS\d+", text))
    return SuiteCounts(exit_code=exit_code, errors=errors)


def parse_eslint(exit_code: int, stdout: str, stderr: str) -> SuiteCounts:
    """Parse ESLint output into error + warning counts.

    ESLint prints a summary like ``✖ 5 problems (2 errors, 3 warnings)``. With
    ``--max-warnings 0`` any warning also makes ESLint exit non-zero, but we
    record the warning count explicitly so the rollup can name it.
    """
    text = f"{stdout}\n{stderr}"
    match = re.search(r"\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)", text)
    if match:
        errors = int(match.group(1))
        warnings = int(match.group(2))
    else:
        # No summary line — fall back to counting per-line markers.
        errors = len(re.findall(r"^\s*\d+:\d+\s+error\b", text, re.M))
        warnings = len(re.findall(r"^\s*\d+:\d+\s+warning\b", text, re.M))
    return SuiteCounts(exit_code=exit_code, errors=errors, warnings=warnings)


def parse_build(exit_code: int, stdout: str, stderr: str) -> SuiteCounts:
    """Parse a build command — gated purely on its exit code.

    A build emits no standard test counts; success is exit ``0``. We surface an
    error count of ``1`` when the build failed so the failure is visible in the
    row even though the rollup already gates on the exit code.
    """
    return SuiteCounts(exit_code=exit_code, errors=0 if exit_code == 0 else 1)


def parse_vitest(exit_code: int, stdout: str, stderr: str) -> SuiteCounts:
    """Parse Vitest output into test counts.

    Vitest prints a ``Tests`` summary line such as
    ``Tests  2 failed | 10 passed | 1 skipped (13)``. We parse that line
    specifically (not the ``Test Files`` line) and compute ``executed`` as the
    sum of passed + failed + skipped.
    """
    text = f"{stdout}\n{stderr}"
    line_match = re.search(r"^\s*Tests\s+(.+)$", text, re.M)
    segment = line_match.group(1) if line_match else text
    passed = _first_int(r"(\d+)\s+passed", segment)
    failed = _first_int(r"(\d+)\s+failed", segment)
    skipped = _first_int(r"(\d+)\s+skipped", segment)
    return SuiteCounts(
        exit_code=exit_code,
        executed=passed + failed + skipped,
        passed=passed,
        failed=failed,
        skipped=skipped,
    )


def parse_playwright(exit_code: int, stdout: str, stderr: str) -> SuiteCounts:
    """Parse Playwright test output into test counts.

    Playwright prints lines like ``10 passed (3.2s)``, ``2 failed``,
    ``1 skipped``, and ``1 flaky``. A *flaky* test failed before passing on
    retry; conservatively we count it toward ``failed`` so a flaky smoke run does
    not slip through the zero-failed requirement (R6.2).
    """
    text = f"{stdout}\n{stderr}"
    passed = _first_int(r"(\d+)\s+passed", text)
    failed = _first_int(r"(\d+)\s+failed", text)
    skipped = _first_int(r"(\d+)\s+skipped", text)
    flaky = _first_int(r"(\d+)\s+flaky", text)
    return SuiteCounts(
        exit_code=exit_code,
        executed=passed + failed + skipped + flaky,
        passed=passed,
        failed=failed + flaky,
        skipped=skipped,
    )


def parse_pytest(exit_code: int, stdout: str, stderr: str) -> SuiteCounts:
    """Parse pytest's terminal summary line into test counts.

    pytest prints a final summary such as
    ``===== 5 failed, 100 passed, 3 skipped, 1 error, 2 warnings in 1.23s =====``.
    Any subset of those tokens may be present. ``errors`` here are pytest
    *errors* (e.g. collection errors), which the rollup gates on alongside
    ``failed``.
    """
    text = f"{stdout}\n{stderr}"
    passed = _first_int(r"(\d+)\s+passed", text)
    failed = _first_int(r"(\d+)\s+failed", text)
    skipped = _first_int(r"(\d+)\s+skipped", text)
    errors = _first_int(r"(\d+)\s+errors?\b", text)
    warnings = _first_int(r"(\d+)\s+warnings?\b", text)
    return SuiteCounts(
        exit_code=exit_code,
        executed=passed + failed + skipped + errors,
        passed=passed,
        failed=failed,
        skipped=skipped,
        errors=errors,
        warnings=warnings,
    )


def parse_django_check(exit_code: int, stdout: str, stderr: str) -> SuiteCounts:
    """Parse ``manage.py check`` output into error + warning counts.

    Django prints ``System check identified no issues (0 silenced).`` on a clean
    run, and tags each issue with a severity-coded id like ``(admin.E001)`` /
    ``(models.W042)``. R6.3 requires zero issues at ERROR/CRITICAL severity, so
    we count ``.E``-coded (and ``.C``-coded) ids as errors and ``.W``-coded ids
    as warnings. Django itself exits non-zero only when errors are present.
    """
    text = f"{stdout}\n{stderr}"
    errors = len(re.findall(r"\([\w.]+\.[EC]\d+\)", text))
    warnings = len(re.findall(r"\([\w.]+\.W\d+\)", text))
    return SuiteCounts(exit_code=exit_code, errors=errors, warnings=warnings)


def parse_spectacular(exit_code: int, stdout: str, stderr: str) -> SuiteCounts:
    """Parse ``manage.py spectacular`` output into error + warning counts.

    drf-spectacular exits ``0`` even when it reports schema problems, so — exactly
    as the ``ci.yml`` ``OpenAPI schema generation (zero errors)`` step does — we
    parse the ``Errors: N`` / ``Warnings: N`` summary it prints to stderr. R6.5
    requires zero errors and R6.6 requires zero warnings (including the
    ``CanonicalProgramSerializer.get_available_offerings`` warning resolved in
    task 11.1).
    """
    text = f"{stderr}\n{stdout}"
    errors = _first_int(r"Errors:\s+(\d+)", text)
    warnings = _first_int(r"Warnings:\s+(\d+)", text)
    return SuiteCounts(exit_code=exit_code, errors=errors, warnings=warnings)


#: Registry mapping a parser name to its pure parser function.
PARSERS: Dict[str, Callable[[int, str, str], SuiteCounts]] = {
    "tsc": parse_tsc,
    "eslint": parse_eslint,
    "build": parse_build,
    "vitest": parse_vitest,
    "playwright": parse_playwright,
    "pytest": parse_pytest,
    "django_check": parse_django_check,
    "spectacular": parse_spectacular,
}


# ===========================================================================
# Suite specifications — the required suites and how each is parsed/gated.
# ===========================================================================


@dataclass(frozen=True)
class SuiteSpec:
    """A required suite: its identity, command, working dir, parser, and gate rule."""

    id: str
    requirement: str
    command: str
    cwd: str  # relative to REPO_ROOT
    parser: str
    #: When True, the suite passes only with zero warnings (lint --max-warnings 0,
    #: spectacular zero-warning). Otherwise warnings are recorded but non-gating.
    zero_warning_required: bool = False
    description: str = ""


#: The nine required suites (R6.1–R6.6). Commands mirror ``.github/workflows/
#: ci.yml`` and the steering ``tech.md`` command table.
SUITE_SPECS: List[SuiteSpec] = [
    SuiteSpec(
        id="admissions-type-check",
        requirement="R6.1",
        command="bun run type-check",
        cwd="apps/admissions",
        parser="tsc",
        description="Admissions TypeScript type-check (zero errors).",
    ),
    SuiteSpec(
        id="admissions-lint",
        requirement="R6.1",
        command="bun run lint",
        cwd="apps/admissions",
        parser="eslint",
        zero_warning_required=True,
        description="Admissions ESLint (--max-warnings 0: zero errors and zero warnings).",
    ),
    SuiteSpec(
        id="admissions-build",
        requirement="R6.1",
        command="bun run build",
        cwd="apps/admissions",
        parser="build",
        description="Admissions production build (exit 0).",
    ),
    SuiteSpec(
        id="admissions-unit",
        requirement="R6.2",
        command="bun run test",
        cwd="apps/admissions",
        parser="vitest",
        description="Admissions Vitest unit tests (zero failed).",
    ),
    SuiteSpec(
        id="admissions-property",
        requirement="R6.2",
        command="bunx vitest run tests/property",
        cwd="apps/admissions",
        parser="vitest",
        description="Admissions fast-check property tests (zero failed).",
    ),
    SuiteSpec(
        id="admissions-playwright-smoke",
        requirement="R6.2",
        command="bunx playwright test",
        cwd="apps/admissions",
        parser="playwright",
        description="Admissions Playwright smoke run (zero failed).",
    ),
    SuiteSpec(
        id="backend-django-check",
        requirement="R6.3",
        command="python manage.py check",
        cwd="backend",
        parser="django_check",
        description="Django system check (zero ERROR/CRITICAL issues).",
    ),
    SuiteSpec(
        id="backend-pytest",
        requirement="R6.4",
        command="python -m pytest",
        cwd="backend",
        parser="pytest",
        description="Full backend pytest (tenant lifecycle / admin / student journeys; zero failed).",
    ),
    SuiteSpec(
        id="backend-spectacular",
        requirement="R6.5/R6.6",
        command="python manage.py spectacular --file /tmp/openapi.yaml",
        cwd="backend",
        parser="spectacular",
        zero_warning_required=True,
        description="OpenAPI schema generation (zero errors AND zero warnings).",
    ),
]


# ===========================================================================
# Per-suite evaluation + conservative rollup (R6.7, R6.8).
# ===========================================================================


def suite_passes(counts: SuiteCounts, *, zero_warning_required: bool) -> bool:
    """Return True iff a suite's counts satisfy its gate rule (R6.1–R6.6).

    A suite passes only with exit code ``0``, zero failed tests, and zero errors;
    plus zero warnings when ``zero_warning_required`` (lint / spectacular).
    """
    if counts.exit_code != 0:
        return False
    if counts.failed > 0:
        return False
    if counts.errors > 0:
        return False
    if zero_warning_required and counts.warnings > 0:
        return False
    return True


def _failure_reason(counts: SuiteCounts, *, zero_warning_required: bool) -> str:
    """Human-readable reason a suite did not pass (for the failures list / row)."""
    reasons: List[str] = []
    if counts.exit_code != 0:
        reasons.append(f"exit code {counts.exit_code}")
    if counts.failed > 0:
        reasons.append(f"{counts.failed} failed test(s)")
    if counts.errors > 0:
        reasons.append(f"{counts.errors} error(s)")
    if zero_warning_required and counts.warnings > 0:
        reasons.append(f"{counts.warnings} disallowed warning(s)")
    return "; ".join(reasons) if reasons else "did not meet pass condition"


@dataclass
class SuiteRecord:
    """The result of evaluating one suite: its spec, captured counts, and verdict."""

    spec: SuiteSpec
    counts: Optional[SuiteCounts]  # None == not measured / missing
    passed: bool
    measured: bool

    def to_check_row(self) -> Dict[str, Any]:
        """Build the envelope ``checks[]`` row for this suite."""
        if not self.measured or self.counts is None:
            return {
                "id": self.spec.id,
                "result": NOT_MEASURED,
                "observed": "no result captured",
                "threshold": self.spec.description,
                "detail": (
                    "suite result was neither captured (--inputs) nor executed "
                    "(--execute); conservatively treated as not passed"
                ),
                "command": self.spec.command,
                "requirement": self.spec.requirement,
                "cwd": self.spec.cwd,
                "zero_warning_required": self.spec.zero_warning_required,
            }
        counts = self.counts
        observed = (
            f"exit {counts.exit_code}; "
            f"{counts.passed} passed, {counts.failed} failed, "
            f"{counts.skipped} skipped, {counts.errors} error(s), "
            f"{counts.warnings} warning(s)"
        )
        detail = (
            self.spec.description
            if self.passed
            else _failure_reason(
                counts, zero_warning_required=self.spec.zero_warning_required
            )
        )
        return {
            "id": self.spec.id,
            "result": PASS if self.passed else FAIL,
            "observed": observed,
            "threshold": self.spec.description,
            "detail": detail,
            "command": self.spec.command,
            "requirement": self.spec.requirement,
            "cwd": self.spec.cwd,
            "zero_warning_required": self.spec.zero_warning_required,
            "exit_code": counts.exit_code,
            "executed": counts.executed,
            "passed_tests": counts.passed,
            "failed_tests": counts.failed,
            "skipped_tests": counts.skipped,
            "errors": counts.errors,
            "warnings": counts.warnings,
        }


def evaluate_suites(records: Sequence[SuiteRecord]) -> Dict[str, Any]:
    """Conservative rollup over every required suite (R6.7, R6.8).

    The gate passes **iff** every required suite was measured and passed. Missing
    (not-measured), failed, or error/disallowed-warning suites all force a
    not-passed verdict. Returns a summary dict the caller turns into the artifact.
    """
    total = len(records)
    passed_records = [r for r in records if r.measured and r.passed]
    not_passed = [r for r in records if not (r.measured and r.passed)]
    gate_passed = total > 0 and len(not_passed) == 0
    return {
        "passed": gate_passed,
        "total": total,
        "passed_count": len(passed_records),
        "not_passed": not_passed,
    }


# ===========================================================================
# Orchestration — ingest captured outputs and/or execute suites.
# ===========================================================================


def _synthetic_capture(spec: SuiteSpec, *, fail: bool) -> Dict[str, Any]:
    """Build a synthetic captured-output dict for ``--dry-run`` verification.

    The all-pass variant produces clean tool output for the suite's parser; the
    fail variant injects a representative failure (non-zero exit + a failed/error
    /warning marker appropriate to the parser).
    """
    parser = spec.parser
    if not fail:
        synthetic = {
            "tsc": (0, "Found 0 errors.", ""),
            "eslint": (0, "", ""),
            "build": (0, "build complete", ""),
            "vitest": (0, "Tests  42 passed (42)", ""),
            "playwright": (0, "12 passed (5.0s)", ""),
            "pytest": (0, "===== 512 passed, 7 skipped in 30.0s =====", ""),
            "django_check": (0, "System check identified no issues (0 silenced).", ""),
            "spectacular": (0, "Schema generated", "Errors: 0\nWarnings: 0\n"),
        }
    else:
        synthetic = {
            "tsc": (2, "src/x.ts(1,1): error TS2304: Cannot find name 'x'.\nFound 1 error.", ""),
            "eslint": (1, "", "✖ 1 problem (0 errors, 1 warning)"),
            "build": (1, "", "build failed"),
            "vitest": (1, "Tests  1 failed | 41 passed (42)", ""),
            "playwright": (1, "1 failed\n11 passed (5.0s)", ""),
            "pytest": (1, "===== 1 failed, 511 passed, 7 skipped in 30.0s =====", ""),
            "django_check": (1, "ERRORS:\n?: (admin.E001) bad config", ""),
            "spectacular": (0, "Schema generated", "Errors: 0\nWarnings: 1\n"),
        }
    exit_code, stdout, stderr = synthetic[parser]
    return {"exit_code": exit_code, "stdout": stdout, "stderr": stderr}


def _execute_suite(spec: SuiteSpec, *, timeout_s: float) -> Dict[str, Any]:
    """Run a suite via ``subprocess`` from its working dir, returning a capture.

    Never raises: a missing working dir, missing tool, or timeout is returned as
    a non-zero capture so the rollup conservatively treats it as a failure.
    """
    workdir = REPO_ROOT / spec.cwd
    if not workdir.is_dir():
        return {
            "exit_code": -1,
            "stdout": "",
            "stderr": f"working directory not found: {workdir}",
        }
    try:
        completed = subprocess.run(  # noqa: S602 - intentional shell command from a fixed spec
            spec.command,
            shell=True,
            cwd=str(workdir),
            capture_output=True,
            text=True,
            timeout=timeout_s,
        )
        return {
            "exit_code": completed.returncode,
            "stdout": completed.stdout or "",
            "stderr": completed.stderr or "",
        }
    except subprocess.TimeoutExpired:
        return {
            "exit_code": -1,
            "stdout": "",
            "stderr": f"timeout after {timeout_s:.0f}s",
        }
    except Exception as exc:  # noqa: BLE001 - degrade clearly
        return {"exit_code": -1, "stdout": "", "stderr": f"{type(exc).__name__}: {exc}"}


def _capture_for_suite(
    spec: SuiteSpec,
    captured: Dict[str, Any],
    *,
    execute: bool,
    dry_run: bool,
    dry_run_fail: Sequence[str],
    timeout_s: float,
) -> Optional[Dict[str, Any]]:
    """Resolve the capture for one suite by the input-mode precedence.

    Returns ``None`` when no capture is available (no input, not executed,
    not synthesized) so the rollup records the suite as not-measured.
    """
    # 1) Explicit pre-captured output wins.
    if spec.id in captured:
        return captured[spec.id]
    # 2) Synthetic capture for dry-run verification.
    if dry_run:
        return _synthetic_capture(spec, fail=spec.id in dry_run_fail)
    # 3) Execute the suite via subprocess.
    if execute:
        return _execute_suite(spec, timeout_s=timeout_s)
    return None


def _record_for_suite(spec: SuiteSpec, capture: Optional[Dict[str, Any]]) -> SuiteRecord:
    """Parse a capture (if any) and evaluate the suite's pass/fail verdict."""
    if capture is None:
        return SuiteRecord(spec=spec, counts=None, passed=False, measured=False)
    parser = PARSERS[spec.parser]
    counts = parser(
        int(capture.get("exit_code", -1)),
        str(capture.get("stdout", "")),
        str(capture.get("stderr", "")),
    )
    passed = suite_passes(
        counts, zero_warning_required=spec.zero_warning_required
    )
    return SuiteRecord(spec=spec, counts=counts, passed=passed, measured=True)


def collect_suite_results(
    *,
    captured: Optional[Dict[str, Any]] = None,
    execute: bool = False,
    dry_run: bool = False,
    dry_run_fail: Optional[Sequence[str]] = None,
    timeout_s: float = 1800.0,
) -> EvidenceArtifact:
    """Collect every required suite result and build the Gate 6 ``Evidence_Artifact``.

    Performs no file I/O for the artifact itself (the caller persists it); it may
    run subprocesses when ``execute=True``. The artifact status is ``passed`` only
    when the conservative rollup passes (R6.7); otherwise ``failed`` (R6.8).
    """
    captured = captured or {}
    dry_run_fail = list(dry_run_fail or [])

    records: List[SuiteRecord] = []
    for spec in SUITE_SPECS:
        capture = _capture_for_suite(
            spec,
            captured,
            execute=execute,
            dry_run=dry_run,
            dry_run_fail=dry_run_fail,
            timeout_s=timeout_s,
        )
        records.append(_record_for_suite(spec, capture))

    rollup = evaluate_suites(records)
    gate_passed = rollup["passed"]

    checks = [r.to_check_row() for r in records]
    failures: List[Dict[str, Any]] = []
    for record in rollup["not_passed"]:
        if record.measured and record.counts is not None:
            failures.append(
                {
                    "suite": record.spec.id,
                    "command": record.spec.command,
                    "exit_code": record.counts.exit_code,
                    "reason": _failure_reason(
                        record.counts,
                        zero_warning_required=record.spec.zero_warning_required,
                    ),
                }
            )
        else:
            failures.append(
                {
                    "suite": record.spec.id,
                    "command": record.spec.command,
                    "exit_code": None,
                    "reason": "no result captured (not measured)",
                }
            )

    status = EvidenceStatus.PASSED if gate_passed else EvidenceStatus.FAILED
    summary = (
        f"{rollup['passed_count']}/{rollup['total']} required suites passed "
        f"({'PASS' if gate_passed else 'FAIL'})"
        + (" [dry-run synthetic]" if dry_run else "")
    )

    return EvidenceArtifact(
        gate_id="suite",
        requirement="R6",
        status=status,
        generated_by=GeneratedBy.CI,
        summary=summary,
        checks=checks,
        assets=[],
        failures=failures,
    )


# ---------------------------------------------------------------------------
# Artifact persistence + CLI.
# ---------------------------------------------------------------------------


def _default_output_path() -> Path:
    """The Gate 6 artifact path under the evidence store."""
    return REPO_ROOT / "docs" / "launch-evidence" / "06-suite" / "suite-evidence.json"


def write_artifact(artifact: EvidenceArtifact, output_path: Path) -> None:
    """Write the artifact to ``output_path`` as pretty JSON, creating parent dirs."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(to_json(artifact) + "\n", encoding="utf-8")


def _load_inputs(path: Path) -> Dict[str, Any]:
    """Load and validate a captured-outputs JSON file.

    Expected shape: ``{suite_id: {"exit_code": int, "stdout": str, "stderr": str}}``.
    Raises ``SystemExit`` with a clear message on malformed input.
    """
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"collect-suite-results: could not read --inputs {path}: {exc}")
    if not isinstance(data, dict):
        raise SystemExit(
            f"collect-suite-results: --inputs {path} must be a JSON object "
            "mapping suite id -> {exit_code, stdout, stderr}"
        )
    return data


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="collect-suite-results.py",
        description=(
            "Gate 6 Suite_Execution_Gate collector. Parses each required suite's "
            "exit code + output into normalized counts, applies the conservative "
            "rollup, and emits docs/launch-evidence/06-suite/suite-evidence.json."
        ),
    )
    parser.add_argument(
        "--inputs",
        type=Path,
        default=None,
        help=(
            "JSON file mapping suite id -> {exit_code, stdout, stderr} of "
            "pre-captured suite output (the CI / offline path)."
        ),
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Run any suite not supplied via --inputs from its working directory.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Synthesize an all-pass capture for every suite (offline; no subprocess).",
    )
    parser.add_argument(
        "--dry-run-fail",
        action="append",
        default=[],
        metavar="SUITE_ID",
        help="In --dry-run, force this suite to fail (repeatable). Implies --dry-run.",
    )
    parser.add_argument(
        "--timeout-s",
        type=float,
        default=1800.0,
        help="Per-suite subprocess timeout in seconds for --execute (default 1800).",
    )
    parser.add_argument(
        "--list-suites",
        action="store_true",
        help="Print the required suite ids and their commands, then exit.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Artifact output path (default: docs/launch-evidence/06-suite/suite-evidence.json).",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    """CLI: collect suite results, write the artifact, return the exit code.

    Returns ``0`` only when the gate passed (every required suite measured and
    passed); any not-passed verdict returns ``1`` so CI fails closed.
    """
    args = build_arg_parser().parse_args(argv)

    if args.list_suites:
        for spec in SUITE_SPECS:
            print(f"{spec.id:30s} [{spec.requirement}] ({spec.cwd}) -> {spec.command}")
        return 0

    captured: Dict[str, Any] = {}
    if args.inputs is not None:
        captured = _load_inputs(args.inputs)

    dry_run = args.dry_run or bool(args.dry_run_fail)

    artifact = collect_suite_results(
        captured=captured,
        execute=args.execute,
        dry_run=dry_run,
        dry_run_fail=args.dry_run_fail,
        timeout_s=args.timeout_s,
    )

    output_path: Path = args.output or _default_output_path()
    write_artifact(artifact, output_path)

    passed = artifact.status == EvidenceStatus.PASSED.value
    print(f"launch-verification suite gate: {artifact.status}")
    print(f"  {artifact.summary}")
    print(f"  written: {output_path}")
    if artifact.failures:
        for failure in artifact.failures:
            print(
                f"  FAIL {failure.get('suite')}: {failure.get('reason')} "
                f"(exit {failure.get('exit_code')}) — {failure.get('command')}"
            )
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
