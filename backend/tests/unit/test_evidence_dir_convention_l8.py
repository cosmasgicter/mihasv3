"""The evidence-directory convention is one rule, in two languages — and it stays one.

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 13.6 §8.1 item **L8**
Requirements: **R2.7** (an evidence artifact is immutable), **R18.5** (an evidence
              artifact is a run record, not a claim)
Findings:     **GATE-13.1-07** (med) — three instruments write into
              ``docs/v2-evidence/**``, so five earlier tasks' Required_Evidence
              artifacts are not immutable
Evidence:     ``docs/v2-evidence/13.6/remediation/L7-L8-L12/README.md`` §5

Two halves exist because a Playwright config cannot import a Python module and a pytest
run cannot import a TypeScript one:

* ``backend/tests/v2_evidence.py``
* ``apps/admissions/tests/harness-e2e/helpers/evidence-dir.ts``

They must read the **same three environment variables** in the **same order**. If they
drift, a run that thinks it is writing scratch on one side writes a task's evidence on
the other, which is GATE-13.1-07 restored with extra steps. So this guard parses the
TypeScript source — it does not re-implement it — and pins:

1. the three variable names, on both sides;
2. the resolution order (override -> canonical-home flag -> run-scoped default);
3. that the run-scoped default of **neither** side is under ``docs/v2-evidence/``;
4. that the three write paths GATE-13.1-07 named no longer carry a hard-coded
   ``docs/v2-evidence/<task>`` literal at their write site.

Item 4 is the one that would catch a regression by copy-paste: adding a sixth screenshot
spec with the old literal in it would pass every other check here.

**Validates: Requirements R2.7, R18.5**
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from tests.v2_evidence import (
    EVIDENCE_DIR_ENV,
    EVIDENCE_RUN_ID_ENV,
    EVIDENCE_TASK_DIRS_ENV,
    RUN_SCOPED_EVIDENCE_ROOT,
    evidence_dir,
    evidence_run_id,
    is_truthy_flag,
)

_REPO_ROOT = Path(__file__).resolve().parents[3]
_TS_HELPER = (
    _REPO_ROOT
    / "apps"
    / "admissions"
    / "tests"
    / "harness-e2e"
    / "helpers"
    / "evidence-dir.ts"
)
_HARNESS_CONFIG = _REPO_ROOT / "apps" / "admissions" / "playwright.harness.config.ts"
_HARNESS_RUNNER = _REPO_ROOT / "harness" / "bin" / "harness"
_SMOKE_WORKFLOW = _REPO_ROOT / ".github" / "workflows" / "v2-harness-smoke.yml"
_AUTHORITY_SUITE = (
    _REPO_ROOT / "backend" / "tests" / "property" / "test_authority_matrix_generated.py"
)
_REQUIRED_SPECS = (
    _REPO_ROOT / "apps" / "admissions" / "tests" / "harness-e2e" / "required"
)

#: The five specs 13.1 §7.1 mechanism 2 named, and the task directory each belongs to.
_SCREENSHOT_SPECS = {
    "student-dashboard-task-first.spec.ts": "11.1",
    "student-wizard-mobile.spec.ts": "11.2",
    "student-document-density.spec.ts": "11.3",
    "admin-mobile-journeys.spec.ts": "11.4",
    "design-system-defluff.spec.ts": "11.5",
}


def _ts_source() -> str:
    assert _TS_HELPER.exists(), f"the frontend half of the convention is missing: {_TS_HELPER}"
    return _TS_HELPER.read_text(encoding="utf-8")


_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)


def _code_lines(src: str) -> list[tuple[int, str]]:
    """``(1-based line number, line)`` for the lines that are **code**.

    The scans below look for a hard-coded evidence path at a **write site**. Every file
    L8 touched documents in its own docblock the literal it replaced — quoting it is the
    point, since a reader has to know what the old shape was — so a scan that cannot tell
    code from prose fails on the explanation of the fix. That is not a hypothetical: the
    first run of this guard did exactly that, on all five specs.

    Block comments are blanked (line count preserved) and single-line `//` comments are
    dropped. L12 §2 hit the same distinction from the other side, where a grep appeared
    to find an `eslint-disable` that was prose inside a comment.
    """
    blanked = _BLOCK_COMMENT_RE.sub(
        lambda m: "\n" * m.group(0).count("\n"), src
    )
    out: list[tuple[int, str]] = []
    for lineno, line in enumerate(blanked.splitlines(), start=1):
        stripped = line.strip()
        if stripped.startswith("//"):
            continue
        out.append((lineno, line))
    return out


# --------------------------------------------------------------------------- #
# 1. the three variable names agree
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    "python_name",
    [EVIDENCE_DIR_ENV, EVIDENCE_TASK_DIRS_ENV, EVIDENCE_RUN_ID_ENV],
)
def test_every_env_var_this_side_reads_is_read_by_the_other_side(python_name):
    """A variable one half honours and the other ignores is the drift that matters."""
    assert f"'{python_name}'" in _ts_source(), (
        f"{python_name} is read by backend/tests/v2_evidence.py but does not appear in "
        f"{_TS_HELPER.relative_to(_REPO_ROOT)}. Both halves of the L8 convention must "
        f"read the same variables, or a run writes scratch on one side and a task's "
        f"evidence on the other (GATE-13.1-07)."
    )


def test_the_python_names_are_the_ones_l5_l6_established():
    """``V2_EVIDENCE_DIR`` is L5-L6's variable and L8 did not redefine it."""
    assert EVIDENCE_DIR_ENV == "V2_EVIDENCE_DIR"
    assert EVIDENCE_TASK_DIRS_ENV == "V2_EVIDENCE_TASK_DIRS"
    assert EVIDENCE_RUN_ID_ENV == "V2_EVIDENCE_RUN_ID"


def test_the_ts_half_declares_no_fourth_v2_evidence_variable():
    """A fourth knob is a second convention. Three, or the guard fails."""
    found = set(re.findall(r"V2_EVIDENCE_[A-Z_]+", _ts_source()))
    assert found == {EVIDENCE_DIR_ENV, EVIDENCE_TASK_DIRS_ENV, EVIDENCE_RUN_ID_ENV}, (
        f"unexpected V2_EVIDENCE_* variables in the frontend helper: "
        f"{sorted(found - {EVIDENCE_DIR_ENV, EVIDENCE_TASK_DIRS_ENV, EVIDENCE_RUN_ID_ENV})}"
    )


# --------------------------------------------------------------------------- #
# 2. resolution order, and the truthiness spelling
# --------------------------------------------------------------------------- #


def test_override_wins_over_the_canonical_home_flag(monkeypatch):
    monkeypatch.setenv(EVIDENCE_DIR_ENV, "docs/v2-evidence/13.6/remediation/L7-L8-L12")
    monkeypatch.setenv(EVIDENCE_TASK_DIRS_ENV, "1")
    resolved = evidence_dir("2.2")
    assert resolved == _REPO_ROOT / "docs/v2-evidence/13.6/remediation/L7-L8-L12"
    # L5-L6's semantics, unchanged: the override names one home for the whole run, so
    # the task id is NOT appended to it.
    assert not str(resolved).endswith("2.2")


def test_the_canonical_home_flag_writes_the_task_directory(monkeypatch):
    monkeypatch.delenv(EVIDENCE_DIR_ENV, raising=False)
    monkeypatch.setenv(EVIDENCE_TASK_DIRS_ENV, "1")
    assert evidence_dir("2.2") == _REPO_ROOT / "docs" / "v2-evidence" / "2.2"


def test_the_default_is_run_scoped_and_is_not_anyones_evidence(monkeypatch):
    """The property L8 exists for: an incidental run writes nobody's evidence."""
    monkeypatch.delenv(EVIDENCE_DIR_ENV, raising=False)
    monkeypatch.delenv(EVIDENCE_TASK_DIRS_ENV, raising=False)
    monkeypatch.setenv(EVIDENCE_RUN_ID_ENV, "run-under-test")
    resolved = evidence_dir("2.2")
    assert resolved == _REPO_ROOT / RUN_SCOPED_EVIDENCE_ROOT / "run-under-test" / "2.2"
    assert "docs/v2-evidence" not in resolved.as_posix(), (
        "the run-scoped default must not live inside the evidence tree — a throwaway "
        "run directory in docs/v2-evidence/ is eventually read as evidence"
    )


def test_the_ts_run_scoped_default_is_also_outside_the_evidence_tree():
    src = _ts_source()
    match = re.search(r"RUN_SCOPED_EVIDENCE_ROOT\s*=\s*'([^']+)'", src)
    assert match, "the frontend helper must declare RUN_SCOPED_EVIDENCE_ROOT"
    assert "docs/v2-evidence" not in match.group(1), (
        f"the frontend run-scoped default is inside the evidence tree: {match.group(1)}"
    )
    assert "test-results" in match.group(1), (
        "the run-scoped default should sit under the repo's already-gitignored "
        f"test-results/ scratch convention, not {match.group(1)}"
    )


@pytest.mark.parametrize("value", ["1", "true", "TRUE", "yes", "on", " On "])
def test_flag_spellings_accepted(value):
    assert is_truthy_flag(value) is True


@pytest.mark.parametrize("value", [None, "", "0", "false", "no", "off", "maybe", "2"])
def test_flag_spellings_rejected(value):
    assert is_truthy_flag(value) is False


def test_the_ts_half_accepts_exactly_the_same_flag_spellings():
    src = _ts_source()
    match = re.search(r"\[([^\]]*)\]\.includes\(", src)
    assert match, "the frontend helper must declare its accepted flag spellings"
    spellings = {s.strip().strip("'\"") for s in match.group(1).split(",") if s.strip()}
    assert spellings == {"1", "true", "yes", "on"}, (
        f"frontend flag spellings {sorted(spellings)} differ from the backend's "
        f"{['1', 'true', 'yes', 'on']}"
    )


def test_an_override_that_escapes_the_repo_is_refused(monkeypatch):
    """L8's own slip, turned into a caught error.

    `V2_EVIDENCE_DIR="../docs/v2-evidence/…"` is repo-relative-but-written-as-cwd-relative.
    It used to resolve outside the repository and write a plausible-looking evidence tree
    into the parent directory, silently — the failure GATE-13.1-07 is about, pointing the
    other way. Recorded in `raw/23-l8-own-instrument-slip.txt`.
    """
    monkeypatch.delenv(EVIDENCE_TASK_DIRS_ENV, raising=False)
    monkeypatch.setenv(EVIDENCE_DIR_ENV, "../docs/v2-evidence/13.6")
    with pytest.raises(ValueError) as exc:
        evidence_dir("2.2")
    assert "outside the repository" in str(exc.value)
    assert "REPOSITORY ROOT" in str(exc.value), (
        "the message must say what the value IS relative to, not only that it is wrong"
    )


def test_a_legitimate_override_inside_the_repo_is_accepted(monkeypatch):
    monkeypatch.delenv(EVIDENCE_TASK_DIRS_ENV, raising=False)
    monkeypatch.setenv(EVIDENCE_DIR_ENV, "docs/v2-evidence/13.6/remediation/L7-L8-L12/raw")
    assert evidence_dir("2.2") == (
        _REPO_ROOT / "docs/v2-evidence/13.6/remediation/L7-L8-L12/raw"
    )


def test_the_ts_half_also_refuses_an_escaping_override():
    """Both halves, or a run is safe on one side and not the other."""
    src = _ts_source()
    assert "insideRepo" in src, "the frontend helper must carry the same escape check"
    assert "outside the repository" in src, (
        "the frontend helper's message should match the backend's wording"
    )
    # Both public resolvers must apply it, not only one.
    for fn in ("evidenceDir", "evidenceDirRelative"):
        body = src.split(f"export function {fn}(")[1].split("\n}")[0]
        assert "insideRepo" in body, f"{fn}() does not apply the escape check"


def test_run_id_falls_back_to_a_stable_value(monkeypatch):
    monkeypatch.delenv(EVIDENCE_RUN_ID_ENV, raising=False)
    assert evidence_run_id() == "current"
    monkeypatch.setenv(EVIDENCE_RUN_ID_ENV, "   ")
    assert evidence_run_id() == "current", "whitespace is not a run id"


# --------------------------------------------------------------------------- #
# 3. no write site carries a hard-coded task-evidence literal any more
# --------------------------------------------------------------------------- #


def test_the_backend_authority_suite_no_longer_hardcodes_task_2_2():
    """Mechanism 3 of GATE-13.1-07."""
    src = _AUTHORITY_SUITE.read_text(encoding="utf-8")
    write_lines = [
        line
        for line in src.splitlines()
        if "_EVIDENCE_DIR" in line and "=" in line and not line.lstrip().startswith("#")
    ]
    assert write_lines, "the suite must still resolve an evidence directory"
    for line in write_lines:
        assert '"v2-evidence"' not in line and "'v2-evidence'" not in line, (
            f"a hard-coded task evidence path is back at a write site: {line.strip()}"
        )
    assert "evidence_dir(" in src, "the suite must resolve through tests/v2_evidence.py"
    # The 2.1 case matrix is READ, so it legitimately still names its path.
    assert "authority-case-matrix.json" in src


def test_the_harness_config_no_longer_hardcodes_task_0_4():
    """Mechanism 1 of GATE-13.1-07 — the one L5-L6 left to the harness lane."""
    src = _HARNESS_CONFIG.read_text(encoding="utf-8")
    reporter = next(
        (line for _, line in _code_lines(src) if "outputFile" in line),
        None,
    )
    assert reporter, "the harness config must still configure a json reporter"
    assert "docs/v2-evidence" not in reporter, (
        f"the harness reporter path is hard-coded into the evidence tree again: "
        f"{reporter.strip()}"
    )
    assert "evidenceDirRelative(" in src, (
        "the harness config must resolve its report path through the shared helper"
    )


def test_the_harness_runner_script_no_longer_hardcodes_task_0_4():
    """The fourth mechanism, which 13.1 §7.1 did not catalogue.

    ``harness/bin/harness`` copies ``playwright-required-report.json`` and
    ``playwright-gatecheck-report.json`` and writes ``smoke-run.md``, all through its own
    ``EVIDENCE_DIR``. 13.1 catalogued the *config's* reporter, so fixing only the config
    would have left three of task 0.4's five artifacts still overwritten by the next
    ``harness smoke``.
    """
    assert _HARNESS_RUNNER.exists(), "the harness runner script is missing"
    src = _HARNESS_RUNNER.read_text(encoding="utf-8")
    assignments = [
        line
        for line in src.splitlines()
        if re.search(r"\bEVIDENCE_(DIR|REL)=", line) and not line.lstrip().startswith("#")
    ]
    assert assignments, "the runner must still resolve an evidence directory"
    # Exactly one assignment may name 0.4 directly: the V2_EVIDENCE_TASK_DIRS branch,
    # which is the deliberate-regeneration case. A second one is an unconditional write.
    names_0_4 = [line for line in assignments if "docs/v2-evidence" in line]
    assert len(names_0_4) == 1, (
        f"expected exactly one deliberate-regeneration branch naming 0.4, found "
        f"{len(names_0_4)}: {[line.strip() for line in names_0_4]}"
    )
    assert EVIDENCE_TASK_DIRS_ENV in names_0_4[0] or "TASK_DIRS" in src.split(
        names_0_4[0]
    )[0].splitlines()[-1], (
        f"the one branch naming 0.4 is not gated on {EVIDENCE_TASK_DIRS_ENV}: "
        f"{names_0_4[0].strip()}"
    )
    assert EVIDENCE_TASK_DIRS_ENV in src, (
        "the runner must honour V2_EVIDENCE_TASK_DIRS, or `harness smoke` overwrites "
        "task 0.4's three copied artifacts (GATE-13.1-07)"
    )
    assert EVIDENCE_DIR_ENV in src, "the runner must honour V2_EVIDENCE_DIR"
    assert EVIDENCE_RUN_ID_ENV in src, (
        "the runner must stamp V2_EVIDENCE_RUN_ID once, or `harness smoke`'s two "
        "Playwright invocations land in two different run directories"
    )
    # The runner is a Playwright instrument, so its default root is the *frontend*
    # helper's, read from that helper rather than restated here.
    ts_root = re.search(r"RUN_SCOPED_EVIDENCE_ROOT\s*=\s*'([^']+)'", _ts_source())
    assert ts_root
    default_line = next(
        (line for line in assignments if ts_root.group(1) in line), None
    )
    assert default_line, (
        f"the runner's default must be the frontend helper's run-scoped root "
        f"{ts_root.group(1)!r}, so the config and the runner agree about where a "
        f"defaulted run's artifacts go"
    )


def test_the_three_spellings_share_one_run_scoped_root():
    """One rule in three languages — TS, Python, bash — must name one default root."""
    ts_match = re.search(r"RUN_SCOPED_EVIDENCE_ROOT\s*=\s*'([^']+)'", _ts_source())
    assert ts_match
    bash_src = _HARNESS_RUNNER.read_text(encoding="utf-8")
    assert ts_match.group(1) in bash_src, (
        f"the harness runner's run-scoped default does not match the frontend helper's "
        f"({ts_match.group(1)}). Three spellings of one rule is the drift L10 pinned a "
        f"date against; this is the same shape."
    )
    # The backend's root differs on purpose (it is a backend scratch tree), but it must
    # still be under test-results/ and outside the evidence tree.
    assert RUN_SCOPED_EVIDENCE_ROOT.startswith("backend/test-results/")
    assert "docs/v2-evidence" not in RUN_SCOPED_EVIDENCE_ROOT


def test_ci_still_publishes_task_0_4s_evidence_deliberately():
    """L8's default must not silently break the job that PRODUCES 0.4's evidence.

    ``v2-harness-smoke.yml`` uploads ``docs/v2-evidence/0.4/`` as its CI artifact. With the
    default flipped to run-scoped, that directory would be empty on a fresh checkout
    (``docs/v2-evidence/`` is untracked), and the upload would find nothing — a gate that
    reports success while publishing an empty artifact. A CI smoke run is precisely the
    deliberate case, so the workflow opts in explicitly.
    """
    assert _SMOKE_WORKFLOW.exists(), "the harness smoke workflow is missing"
    src = _SMOKE_WORKFLOW.read_text(encoding="utf-8")
    assert "docs/v2-evidence/0.4/" in src, (
        "the workflow no longer uploads 0.4's evidence; if that is deliberate, this guard "
        "should change with it"
    )
    assert EVIDENCE_TASK_DIRS_ENV in src, (
        f"v2-harness-smoke.yml uploads docs/v2-evidence/0.4/ but does not set "
        f"{EVIDENCE_TASK_DIRS_ENV}, so after L8 the harness writes run-scoped and the "
        f"upload publishes an empty artifact"
    )
    # The flag must be on the step that RUNS the harness, not merely present in a comment.
    # Split on the `run:` line specifically: the workflow's own header comment also names
    # `bash harness/bin/harness smoke`, and splitting on the bare command found that first.
    assert "run: bash harness/bin/harness smoke" in src
    tail = src.split("run: bash harness/bin/harness smoke")[0][-400:]
    assert f"{EVIDENCE_TASK_DIRS_ENV}: " in tail, (
        f"{EVIDENCE_TASK_DIRS_ENV} appears in the workflow but not as env on the step that "
        f"runs `harness/bin/harness smoke`"
    )


@pytest.mark.parametrize("spec_name,task_id", sorted(_SCREENSHOT_SPECS.items()))
def test_no_required_spec_hardcodes_a_task_screenshot_directory(spec_name, task_id):
    """Mechanism 2 of GATE-13.1-07, per spec."""
    path = _REQUIRED_SPECS / spec_name
    assert path.exists(), f"missing required spec {spec_name}"
    src = path.read_text(encoding="utf-8")
    offenders = [
        line
        for _, line in _code_lines(src)
        if re.search(r"['\"][^'\"]*docs/v2-evidence/[^'\"]*['\"]", line)
    ]
    assert not offenders, (
        f"{spec_name} carries a hard-coded evidence path again — an ordinary required "
        f"profile run would rewrite task {task_id}'s screenshots (GATE-13.1-07): "
        f"{[o.strip() for o in offenders]}"
    )
    assert f"evidenceDir('{task_id}')" in src, (
        f"{spec_name} must resolve its screenshot directory through evidenceDir("
        f"'{task_id}') so the canonical home is still reachable on purpose"
    )


def test_the_required_directory_gained_no_new_hardcoded_evidence_writer():
    """The copy-paste regression: a sixth spec with the old literal in it.

    Scans **every** spec under ``required/``, not only the five 13.1 named, because the
    next one will not be on 13.1's list.
    """
    offenders: list[str] = []
    for path in sorted(_REQUIRED_SPECS.glob("*.spec.ts")):
        for lineno, line in _code_lines(path.read_text(encoding="utf-8")):
            if re.search(r"['\"][^'\"]*docs/v2-evidence/[^'\"]*['\"]", line):
                offenders.append(f"{path.name}:{lineno}: {line.strip()}")
    assert not offenders, (
        "a required spec computes a docs/v2-evidence path as a string literal. Resolve "
        "it through helpers/evidence-dir.ts instead, or an ordinary run overwrites a "
        "recorded artifact (GATE-13.1-07):\n  " + "\n  ".join(offenders)
    )
