"""Unit tests — Gate 6 Suite_Execution_Gate per-tool parsers + conservative rollup.

Spec: ``.kiro/specs/beanola-launch-verification`` (task 11.4). Module under
test: ``scripts/launch-verification/collect-suite-results.py``.

These tests exercise the **pure** parser + rollup layer of the suite-results
collector over *sample captured outputs* — no subprocess, no Django, no I/O.
The collector inserts ``backend/`` on ``sys.path`` at import time and pulls in
the (pure, stdlib-only) ``apps.common.launch_verification.evidence`` envelope,
so the module imports cleanly without ``django.setup()``.

Coverage:

* **Per-tool parsers** (R6.1–R6.6 inputs): feed realistic stdout/stderr for
  each tool (``tsc``, ``eslint``, ``build``, ``vitest``, ``playwright``,
  ``pytest``, ``django_check``, ``spectacular``) and assert the extracted
  ``SuiteCounts`` (exit_code / executed / passed / failed / skipped / errors /
  warnings) are correct — e.g. a pytest ``X passed, Y failed, Z skipped``
  summary, eslint with warnings, vitest pass/fail, spectacular
  ``Errors: 0 Warnings: 1``.
* **R6.8 — per-suite gate** (``suite_passes``): a non-zero exit code, ≥1 failed
  test, an error, OR a disallowed warning (lint ``--max-warnings 0``,
  spectacular zero-warning) makes that suite NOT pass.
* **R6.7 — conservative rollup** (``evaluate_suites``): the gate passes only
  when EVERY required suite is recorded passing; a missing suite is
  not-measured and forces the gate not-passed.

The hyphenated filename ``collect-suite-results.py`` is an illegal dotted module
name, so it is loaded directly via ``importlib.util.spec_from_file_location``
and registered in ``sys.modules`` under a legal alias before ``exec_module``.

Validates: Requirements 6.7, 6.8
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Load the hyphenated collector module via importlib.
#
#   backend/tests/unit/test_*.py
#     parents[0] -> backend/tests/unit
#     parents[1] -> backend/tests
#     parents[2] -> backend
#     parents[3] -> <repo root>
# ---------------------------------------------------------------------------

_REPO_ROOT = Path(__file__).resolve().parents[3]
_MODULE_PATH = _REPO_ROOT / "scripts" / "launch-verification" / "collect-suite-results.py"
_MODULE_NAME = "launch_verification_collect_suite_results"


def _load_collector():
    """Load ``collect-suite-results.py`` under a legal alias (idempotent)."""
    if _MODULE_NAME in sys.modules:
        return sys.modules[_MODULE_NAME]
    assert _MODULE_PATH.is_file(), f"collector script missing at {_MODULE_PATH}"
    spec = importlib.util.spec_from_file_location(_MODULE_NAME, _MODULE_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    # Register before exec so the module's ``from __future__`` / dataclass refs
    # resolve cleanly and a re-import is a no-op.
    sys.modules[_MODULE_NAME] = module
    spec.loader.exec_module(module)
    return module


collector = _load_collector()


# Convenience handles.
SuiteCounts = collector.SuiteCounts
SuiteSpec = collector.SuiteSpec
SuiteRecord = collector.SuiteRecord
suite_passes = collector.suite_passes
evaluate_suites = collector.evaluate_suites
PARSERS = collector.PARSERS
SUITE_SPECS = collector.SUITE_SPECS


# ===========================================================================
# Per-tool parser layer — sample captured outputs -> SuiteCounts.
# ===========================================================================


class TestParseTsc:
    """``tsc`` / ``bun run type-check`` -> error count."""

    def test_clean_run_reports_zero_errors(self):
        counts = collector.parse_tsc(0, "Found 0 errors.\n", "")
        assert counts.exit_code == 0
        assert counts.errors == 0

    def test_summary_line_drives_error_count(self):
        stdout = (
            "src/api/client.ts(12,5): error TS2304: Cannot find name 'foo'.\n"
            "src/lib/x.ts(3,1): error TS2552: Cannot find name 'bar'.\n"
            "Found 2 errors.\n"
        )
        counts = collector.parse_tsc(2, stdout, "")
        assert counts.exit_code == 2
        assert counts.errors == 2

    def test_falls_back_to_counting_diagnostics_without_summary(self):
        stdout = (
            "src/a.ts(1,1): error TS2304: Cannot find name 'a'.\n"
            "src/b.ts(2,2): error TS1005: ';' expected.\n"
        )
        counts = collector.parse_tsc(1, stdout, "")
        assert counts.errors == 2


class TestParseEslint:
    """ESLint -> error + warning counts (R6.1 lint ``--max-warnings 0``)."""

    def test_summary_with_errors_and_warnings(self):
        stderr = "\u2716 5 problems (2 errors, 3 warnings)\n"
        counts = collector.parse_eslint(1, "", stderr)
        assert counts.errors == 2
        assert counts.warnings == 3

    def test_warnings_only_still_recorded(self):
        # --max-warnings 0 makes a warning-only run exit non-zero; the warning
        # count must still be captured so the rollup can name it.
        stderr = "\u2716 1 problem (0 errors, 1 warning)\n"
        counts = collector.parse_eslint(1, "", stderr)
        assert counts.exit_code == 1
        assert counts.errors == 0
        assert counts.warnings == 1

    def test_clean_run_zero_counts(self):
        counts = collector.parse_eslint(0, "", "")
        assert counts.errors == 0
        assert counts.warnings == 0

    def test_fallback_counts_per_line_markers(self):
        text = (
            "/x.ts\n"
            "  1:1  error    Unexpected console statement  no-console\n"
            "  2:3  warning  Missing return type           ts/explicit\n"
            "  3:5  warning  Prefer const                  prefer-const\n"
        )
        counts = collector.parse_eslint(1, text, "")
        assert counts.errors == 1
        assert counts.warnings == 2


class TestParseBuild:
    """A build is gated purely on exit code."""

    def test_success_exit_zero(self):
        counts = collector.parse_build(0, "build complete in 4.2s", "")
        assert counts.exit_code == 0
        assert counts.errors == 0

    def test_failure_surfaces_one_error(self):
        counts = collector.parse_build(1, "", "Build failed: out of memory")
        assert counts.exit_code == 1
        assert counts.errors == 1


class TestParseVitest:
    """Vitest ``Tests`` summary line -> counts."""

    def test_pass_only(self):
        counts = collector.parse_vitest(0, "Tests  42 passed (42)\n", "")
        assert counts.passed == 42
        assert counts.failed == 0
        assert counts.skipped == 0
        assert counts.executed == 42

    def test_mixed_pass_fail_skip(self):
        stdout = (
            "Test Files  1 failed | 3 passed (4)\n"
            "     Tests  2 failed | 10 passed | 1 skipped (13)\n"
        )
        counts = collector.parse_vitest(1, stdout, "")
        # Parses the ``Tests`` line, not the ``Test Files`` line.
        assert counts.passed == 10
        assert counts.failed == 2
        assert counts.skipped == 1
        assert counts.executed == 13


class TestParsePlaywright:
    """Playwright -> counts; a flaky test counts toward failed (R6.2)."""

    def test_pass_only(self):
        counts = collector.parse_playwright(0, "12 passed (5.0s)\n", "")
        assert counts.passed == 12
        assert counts.failed == 0
        assert counts.executed == 12

    def test_failed_and_skipped(self):
        stdout = "2 failed\n1 skipped\n9 passed (6.1s)\n"
        counts = collector.parse_playwright(1, stdout, "")
        assert counts.passed == 9
        assert counts.failed == 2
        assert counts.skipped == 1
        assert counts.executed == 12

    def test_flaky_counts_as_failed(self):
        stdout = "1 flaky\n11 passed (5.0s)\n"
        counts = collector.parse_playwright(1, stdout, "")
        assert counts.passed == 11
        assert counts.failed == 1  # flaky folded into failed
        assert counts.executed == 12


class TestParsePytest:
    """pytest terminal summary line -> counts (X passed, Y failed, Z skipped)."""

    def test_pass_and_skip(self):
        stdout = "===== 512 passed, 7 skipped in 30.00s =====\n"
        counts = collector.parse_pytest(0, stdout, "")
        assert counts.passed == 512
        assert counts.skipped == 7
        assert counts.failed == 0
        assert counts.errors == 0
        assert counts.executed == 519

    def test_failed_skipped_error_warning_summary(self):
        stdout = (
            "===== 5 failed, 100 passed, 3 skipped, 1 error, 2 warnings "
            "in 1.23s =====\n"
        )
        counts = collector.parse_pytest(1, stdout, "")
        assert counts.passed == 100
        assert counts.failed == 5
        assert counts.skipped == 3
        assert counts.errors == 1
        assert counts.warnings == 2
        # executed = passed + failed + skipped + errors
        assert counts.executed == 100 + 5 + 3 + 1

    def test_singular_error_and_warning_tokens(self):
        stdout = "===== 1 passed, 1 warning in 0.10s =====\n"
        counts = collector.parse_pytest(0, stdout, "")
        assert counts.passed == 1
        assert counts.warnings == 1


class TestParseDjangoCheck:
    """``manage.py check`` -> error (E/C) + warning (W) counts by severity code."""

    def test_clean_run(self):
        stdout = "System check identified no issues (0 silenced).\n"
        counts = collector.parse_django_check(0, stdout, "")
        assert counts.errors == 0
        assert counts.warnings == 0

    def test_error_and_warning_codes_classified(self):
        stdout = (
            "SystemCheckError: System check identified some issues:\n"
            "ERRORS:\n"
            "?: (admin.E001) bad config\n"
            "WARNINGS:\n"
            "?: (models.W042) auto-created primary key used\n"
            "?: (security.W004) SECURE_HSTS_SECONDS not set\n"
        )
        counts = collector.parse_django_check(1, stdout, "")
        assert counts.errors == 1  # admin.E001
        assert counts.warnings == 2  # models.W042 + security.W004

    def test_critical_code_counts_as_error(self):
        counts = collector.parse_django_check(1, "?: (caches.C001) bad cache\n", "")
        assert counts.errors == 1


class TestParseSpectacular:
    """drf-spectacular ``Errors: N`` / ``Warnings: N`` stderr summary -> counts."""

    def test_zero_errors_zero_warnings(self):
        stderr = "Schema generation summary:\nErrors: 0\nWarnings: 0\n"
        counts = collector.parse_spectacular(0, "Schema generated", stderr)
        assert counts.errors == 0
        assert counts.warnings == 0

    def test_zero_errors_one_warning(self):
        # The R6.6 zero-warning case (e.g. the resolved get_available_offerings).
        stderr = "Errors: 0\nWarnings: 1\n"
        counts = collector.parse_spectacular(0, "Schema generated", stderr)
        assert counts.errors == 0
        assert counts.warnings == 1

    def test_errors_and_warnings(self):
        stderr = "Errors: 2\nWarnings: 3\n"
        counts = collector.parse_spectacular(0, "", stderr)
        assert counts.errors == 2
        assert counts.warnings == 3


# ===========================================================================
# R6.8 — per-suite gate: suite_passes() rejects any failing signal.
# ===========================================================================


class TestSuitePassesR68:
    """A suite passes only with exit 0, zero failed, zero errors (+ zero warnings
    where required). Any failing signal makes it NOT pass (R6.8)."""

    def test_clean_suite_passes(self):
        counts = SuiteCounts(exit_code=0, executed=10, passed=10)
        assert suite_passes(counts, zero_warning_required=False) is True

    def test_non_zero_exit_code_fails(self):
        counts = SuiteCounts(exit_code=1, executed=10, passed=10)
        assert suite_passes(counts, zero_warning_required=False) is False

    def test_one_failed_test_fails(self):
        counts = SuiteCounts(exit_code=0, executed=10, passed=9, failed=1)
        assert suite_passes(counts, zero_warning_required=False) is False

    def test_reported_error_fails(self):
        counts = SuiteCounts(exit_code=0, errors=1)
        assert suite_passes(counts, zero_warning_required=False) is False

    def test_disallowed_warning_fails_when_zero_required(self):
        # lint --max-warnings 0 / spectacular zero-warning: a warning blocks.
        counts = SuiteCounts(exit_code=0, warnings=1)
        assert suite_passes(counts, zero_warning_required=True) is False

    def test_warning_allowed_when_not_required(self):
        # A warning where zero is NOT required (e.g. pytest warnings) is non-gating.
        counts = SuiteCounts(exit_code=0, passed=5, warnings=3)
        assert suite_passes(counts, zero_warning_required=False) is True

    @pytest.mark.parametrize("parser_name", sorted(PARSERS.keys()))
    def test_every_parser_is_pure_and_registered(self, parser_name):
        # Smoke: every declared parser is callable and returns SuiteCounts.
        counts = PARSERS[parser_name](0, "", "")
        assert isinstance(counts, SuiteCounts)
        assert counts.exit_code == 0


# ===========================================================================
# R6.7 — conservative rollup: gate passes iff EVERY required suite passed.
# ===========================================================================


def _spec(suite_id: str, *, zero_warning_required: bool = False) -> "SuiteSpec":
    return SuiteSpec(
        id=suite_id,
        requirement="R6",
        command=f"run {suite_id}",
        cwd="apps/admissions",
        parser="vitest",
        zero_warning_required=zero_warning_required,
    )


def _passing_record(suite_id: str) -> "SuiteRecord":
    counts = SuiteCounts(exit_code=0, executed=3, passed=3)
    return SuiteRecord(spec=_spec(suite_id), counts=counts, passed=True, measured=True)


def _failing_record(suite_id: str) -> "SuiteRecord":
    counts = SuiteCounts(exit_code=1, executed=3, passed=2, failed=1)
    return SuiteRecord(spec=_spec(suite_id), counts=counts, passed=False, measured=True)


def _missing_record(suite_id: str) -> "SuiteRecord":
    return SuiteRecord(spec=_spec(suite_id), counts=None, passed=False, measured=False)


class TestEvaluateSuitesR67:
    """``evaluate_suites`` only passes when every required suite is recorded
    passing; a missing suite is not-measured and forces not-passed (R6.7)."""

    def test_all_passing_gate_passes(self):
        records = [_passing_record(f"s{i}") for i in range(3)]
        rollup = evaluate_suites(records)
        assert rollup["passed"] is True
        assert rollup["total"] == 3
        assert rollup["passed_count"] == 3
        assert rollup["not_passed"] == []

    def test_one_failing_suite_blocks_gate(self):
        records = [_passing_record("a"), _failing_record("b"), _passing_record("c")]
        rollup = evaluate_suites(records)
        assert rollup["passed"] is False
        assert rollup["passed_count"] == 2
        assert [r.spec.id for r in rollup["not_passed"]] == ["b"]

    def test_missing_suite_forces_not_passed(self):
        # A not-measured suite is never silently skipped: it blocks the gate.
        records = [_passing_record("a"), _missing_record("b")]
        rollup = evaluate_suites(records)
        assert rollup["passed"] is False
        not_passed_ids = [r.spec.id for r in rollup["not_passed"]]
        assert "b" in not_passed_ids
        # The blocking record is the unmeasured one.
        blocking = next(r for r in rollup["not_passed"] if r.spec.id == "b")
        assert blocking.measured is False

    def test_empty_records_is_not_passed(self):
        # No suites recorded at all -> conservatively not passed.
        rollup = evaluate_suites([])
        assert rollup["passed"] is False
        assert rollup["total"] == 0


# ===========================================================================
# End-to-end over the real SUITE_SPECS with sample captures (R6.7 + R6.8).
# ===========================================================================


class TestCollectSuiteResultsOverSamples:
    """Drive ``collect_suite_results`` with pre-captured sample outputs for every
    real required suite and assert the conservative verdict (R6.7, R6.8)."""

    @staticmethod
    def _all_pass_capture() -> dict:
        # One realistic clean capture per parser, keyed by real suite id.
        by_parser = {
            "tsc": {"exit_code": 0, "stdout": "Found 0 errors.\n", "stderr": ""},
            "eslint": {"exit_code": 0, "stdout": "", "stderr": ""},
            "build": {"exit_code": 0, "stdout": "build complete", "stderr": ""},
            "vitest": {"exit_code": 0, "stdout": "Tests  42 passed (42)\n", "stderr": ""},
            "playwright": {"exit_code": 0, "stdout": "12 passed (5.0s)\n", "stderr": ""},
            "pytest": {
                "exit_code": 0,
                "stdout": "===== 512 passed, 7 skipped in 30.00s =====\n",
                "stderr": "",
            },
            "django_check": {
                "exit_code": 0,
                "stdout": "System check identified no issues (0 silenced).\n",
                "stderr": "",
            },
            "spectacular": {
                "exit_code": 0,
                "stdout": "Schema generated",
                "stderr": "Errors: 0\nWarnings: 0\n",
            },
        }
        return {spec.id: by_parser[spec.parser] for spec in SUITE_SPECS}

    def test_all_suites_pass_gate_passes(self):
        artifact = collector.collect_suite_results(captured=self._all_pass_capture())
        assert artifact.gate_id == "suite"
        assert artifact.status == collector.EvidenceStatus.PASSED
        assert artifact.failures == []
        assert len(artifact.checks) == len(SUITE_SPECS)
        assert all(c.result == collector.PASS for c in artifact.checks)

    def test_spectacular_warning_blocks_gate_r66_r68(self):
        captured = self._all_pass_capture()
        # Inject the R6.6 zero-warning violation into the spectacular suite.
        captured["backend-spectacular"] = {
            "exit_code": 0,
            "stdout": "Schema generated",
            "stderr": "Errors: 0\nWarnings: 1\n",
        }
        artifact = collector.collect_suite_results(captured=captured)
        assert artifact.status == collector.EvidenceStatus.FAILED
        failed_ids = [f["suite"] for f in artifact.failures]
        assert "backend-spectacular" in failed_ids
        reason = next(
            f["reason"] for f in artifact.failures if f["suite"] == "backend-spectacular"
        )
        assert "warning" in reason.lower()

    def test_missing_suite_recorded_not_measured_and_blocks(self):
        captured = self._all_pass_capture()
        # Drop one suite entirely -> not measured, must block the gate (R6.7).
        del captured["admissions-build"]
        artifact = collector.collect_suite_results(captured=captured)
        assert artifact.status == collector.EvidenceStatus.FAILED
        build_check = next(c for c in artifact.checks if c.id == "admissions-build")
        assert build_check.result == collector.NOT_MEASURED
        failed_ids = [f["suite"] for f in artifact.failures]
        assert "admissions-build" in failed_ids
