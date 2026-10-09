#!/usr/bin/env python3
"""
Tests for scripts/validate_spec_governance.py (Admissions V2 task 0.2).

Runs with either
`python3 -m pytest scripts/tests/test_validate_spec_governance.py`
or plain `python3 scripts/tests/test_validate_spec_governance.py` (falls back to
unittest). Standard library only; no Django and no third-party deps. None of
these tests are skipped or gated by an environment/credential (R1.4): the rule
tests build synthetic in-memory spec fixtures in a temp dir and always run.

Each of the five R1.3 rules has an INTENTIONAL FAILING FIXTURE — a synthetic
spec crafted to violate exactly that rule — plus a clean fixture proving the
rule passes when satisfied:

    1. missing-evidence         a checked task with no Required_Evidence
    2. unreferenced-requirement a requirement no task references
    3. unowned-finding          a finding no requirement owns
    4. duplicate-or-invalid     two live specs sharing one spec ID
    5. false-completed          status=completed with unchecked tasks

Also covers parser robustness (trailing-period task ids, trailing-underscore
finding ids) and real-repo regression guards (the V2 spec passes; the known
falsely-completed spec is detected in --all-specs mode).
"""

from __future__ import annotations

import json
import re
import sys
import tempfile
import unittest
from pathlib import Path
from textwrap import dedent

# Make the sibling module importable regardless of the working directory.
_SCRIPTS_DIR = Path(__file__).resolve().parent.parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

import validate_spec_governance as vsg  # noqa: E402

_REPO_ROOT = _SCRIPTS_DIR.parent


# --------------------------------------------------------------------------- #
# Synthetic spec fixture helpers
# --------------------------------------------------------------------------- #

def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dedent(text).lstrip("\n"), encoding="utf-8")


def _clean_requirements() -> str:
    # One requirement (R1) that owns one finding (FOO-01). The finding id is the
    # LAST token on the `_Findings:` line and is immediately followed by the
    # markdown italic `_`, which locks the trailing-underscore ownership fix.
    return """
    # Requirements

    ### R1. First Requirement

    #### Acceptance Criteria

    1. THE system SHALL do the thing.

    _Findings: FOO-01_
    """


def _clean_findings() -> str:
    return """
    # Findings

    | ID | Severity | Observed | Source | Outcome |
    |---|---|---|---|---|
    | FOO-01 | P0 | something broke | src.py | fix it |
    """


def _clean_tasks() -> str:
    return """
    # Implementation Plan

    - [x] 1.1 Do the thing
      - _Requirements: R1_
      - _Findings: FOO-01_
      - _Evidence: proof captured under docs/v2-evidence/1.1/_
    """


def make_spec(
    specs_root: Path,
    name: str = "sample-spec",
    *,
    spec_id: str = "sample-id",
    status: str | None = "planned",
    requirements: str | None = None,
    tasks: str | None = None,
    findings: str | None = None,
) -> Path:
    """Create a spec directory with the four governance files."""
    spec_dir = specs_root / name
    cfg = {"specId": spec_id}
    if status is not None:
        cfg["status"] = status
    _write(spec_dir / ".config.kiro", json.dumps(cfg))
    _write(spec_dir / "requirements.md", requirements if requirements is not None else _clean_requirements())
    _write(spec_dir / "tasks.md", tasks if tasks is not None else _clean_tasks())
    _write(spec_dir / "findings.md", findings if findings is not None else _clean_findings())
    return spec_dir


def make_evidence(evidence_root: Path, task_id: str, body: str = "evidence body") -> None:
    _write(evidence_root / task_id / "summary.md", body)


class GovernanceTestBase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.specs_root = self.root / ".kiro" / "specs"
        self.specs_root.mkdir(parents=True, exist_ok=True)
        self.evidence_root = self.root / "docs" / "v2-evidence"
        self.evidence_root.mkdir(parents=True, exist_ok=True)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def _rules(self, result: dict) -> set:
        return {f["rule"] for f in result["findings"] if f["severity"] == "error"}


# --------------------------------------------------------------------------- #
# Clean fixture: everything satisfied -> PASS
# --------------------------------------------------------------------------- #

class CleanSpecPassesTests(GovernanceTestBase):
    def test_fully_satisfied_spec_passes(self):
        spec_dir = make_spec(self.specs_root)
        make_evidence(self.evidence_root, "1.1")

        result = vsg.validate_spec(spec_dir, self.evidence_root)

        self.assertTrue(result["ok"], msg=f"unexpected errors: {result['findings']}")
        self.assertEqual(result["error_count"], 0)
        self.assertEqual(result["requirement_count"], 1)
        self.assertEqual(result["finding_count"], 1)
        self.assertEqual(result["checked_task_count"], 1)


# --------------------------------------------------------------------------- #
# Rule 1 — missing evidence (INTENTIONAL FAILING FIXTURE)
# --------------------------------------------------------------------------- #

class RuleMissingEvidenceTests(GovernanceTestBase):
    def test_checked_task_without_evidence_descriptor_or_dir_fails(self):
        tasks = """
        # Plan
        - [x] 1.1 Do the thing
          - _Requirements: R1_
          - _Findings: FOO-01_
        """
        spec_dir = make_spec(self.specs_root, tasks=tasks)
        # No evidence descriptor line AND no docs/v2-evidence/1.1/.

        result = vsg.validate_spec(spec_dir, self.evidence_root)

        self.assertFalse(result["ok"])
        self.assertIn("missing-evidence", self._rules(result))

    def test_checked_task_with_descriptor_but_no_evidence_dir_fails(self):
        spec_dir = make_spec(self.specs_root)  # clean tasks HAVE an _Evidence: line
        # Deliberately do NOT create docs/v2-evidence/1.1/.

        result = vsg.validate_spec(spec_dir, self.evidence_root)

        self.assertFalse(result["ok"])
        errs = [f for f in result["findings"] if f["rule"] == "missing-evidence"]
        self.assertEqual(len(errs), 1)
        self.assertIn("no linked Required_Evidence", errs[0]["message"])

    def test_unchecked_task_needs_no_evidence(self):
        tasks = """
        # Plan
        - [-] 1.1 In progress, no evidence yet
          - _Requirements: R1_
          - _Findings: FOO-01_
        - [~] 1.2 Not started
          - _Requirements: R1_
          - _Findings: FOO-01_
        """
        spec_dir = make_spec(self.specs_root, tasks=tasks)

        result = vsg.validate_spec(spec_dir, self.evidence_root)

        self.assertTrue(result["ok"], msg=f"unexpected errors: {result['findings']}")


# --------------------------------------------------------------------------- #
# Rule 2 — unreferenced requirement (INTENTIONAL FAILING FIXTURE)
# --------------------------------------------------------------------------- #

class RuleUnreferencedRequirementTests(GovernanceTestBase):
    def test_requirement_referenced_by_no_task_fails(self):
        requirements = """
        # Requirements
        ### R1. First
        _Findings: FOO-01_
        ### R2. Second, referenced by nothing
        _Findings: FOO-01_
        """
        # Tasks reference only R1; R2 is orphaned.
        tasks = """
        # Plan
        - [x] 1.1 Do the thing
          - _Requirements: R1_
          - _Findings: FOO-01_
          - _Evidence: see evidence dir_
        """
        spec_dir = make_spec(self.specs_root, requirements=requirements, tasks=tasks)
        make_evidence(self.evidence_root, "1.1")

        result = vsg.validate_spec(spec_dir, self.evidence_root)

        self.assertFalse(result["ok"])
        self.assertIn("unreferenced-requirement", self._rules(result))
        self.assertTrue(any("R2" in f["message"] for f in result["findings"]))

    def test_all_requirements_referenced_passes(self):
        requirements = """
        # Requirements
        ### R1. First
        _Findings: FOO-01_
        ### R2. Second
        _Findings: FOO-01_
        """
        tasks = """
        # Plan
        - [x] 1.1 Cover both
          - _Requirements: R1, R2_
          - _Findings: FOO-01_
          - _Evidence: see evidence dir_
        """
        spec_dir = make_spec(self.specs_root, requirements=requirements, tasks=tasks)
        make_evidence(self.evidence_root, "1.1")

        result = vsg.validate_spec(spec_dir, self.evidence_root)

        self.assertNotIn("unreferenced-requirement", self._rules(result))


# --------------------------------------------------------------------------- #
# Rule 3 — unowned finding (INTENTIONAL FAILING FIXTURE)
# --------------------------------------------------------------------------- #

class RuleUnownedFindingTests(GovernanceTestBase):
    def test_finding_without_owner_requirement_fails(self):
        # findings.md defines FOO-01 and BAR-02, but no requirement owns BAR-02.
        findings = """
        # Findings
        | ID | Severity | Observed | Source | Outcome |
        |---|---|---|---|---|
        | FOO-01 | P0 | a | s | o |
        | BAR-02 | P1 | b | s | o |
        """
        spec_dir = make_spec(self.specs_root, findings=findings)
        make_evidence(self.evidence_root, "1.1")

        result = vsg.validate_spec(spec_dir, self.evidence_root)

        self.assertFalse(result["ok"])
        self.assertIn("unowned-finding", self._rules(result))
        self.assertTrue(any("BAR-02" in f["message"] for f in result["findings"]))

    def test_dotted_finding_without_owner_requirement_fails(self):
        """The guard item M6 owes the next dotted finding (GATE-13.6-04).

        Widening the grammar means a future `GATE-13.7-01` row is now *parsed* —
        which is only an improvement if the absence of an owner is then caught.
        Synthetic, so it holds whatever the real register happens to contain.
        """
        findings = """
        # Findings
        | ID | Severity | Observed | Owner requirement(s) | Outcome |
        |---|---|---|---|---|
        | FOO-01 | P0 | a | R1 | o |
        | GATE-13.7-01 | med | filed by a future phase-13 task | R1 | open |
        """
        spec_dir = make_spec(self.specs_root, findings=findings)
        make_evidence(self.evidence_root, "1.1")

        result = vsg.validate_spec(spec_dir, self.evidence_root)

        self.assertEqual(result["finding_count"], 2, msg="the dotted row must PARSE")
        self.assertFalse(result["ok"])
        self.assertIn("unowned-finding", self._rules(result))
        self.assertTrue(
            any("GATE-13.7-01" in f["message"] for f in result["findings"]),
            msg="rule 3 must name the dotted id: %s" % result["findings"],
        )

    def test_dotted_finding_with_owner_requirement_passes(self):
        """The other half: a dotted id on a `_Findings:` line counts as owned.

        Both halves are needed. Only this one passing would mean the grammar
        widened without rule 3 gaining teeth; only the other one passing would
        mean a dotted id can never be satisfied.
        """
        requirements = """
        # Requirements
        ### R1. First
        _Findings: FOO-01, GATE-13.7-01_
        """
        findings = """
        # Findings
        | ID | Severity | Observed | Owner requirement(s) | Outcome |
        |---|---|---|---|---|
        | FOO-01 | P0 | a | R1 | o |
        | GATE-13.7-01 | med | filed by a future phase-13 task | R1 | open |
        """
        spec_dir = make_spec(
            self.specs_root, requirements=requirements, findings=findings
        )
        make_evidence(self.evidence_root, "1.1")

        result = vsg.validate_spec(spec_dir, self.evidence_root)

        self.assertEqual(result["finding_count"], 2)
        self.assertNotIn("unowned-finding", self._rules(result))
        self.assertIn(
            "GATE-13.7-01",
            vsg.parse_requirements(requirements_text := dedent(requirements))[
                "findings_by_requirement"
            ]["R1"],
            msg="the dotted id must be attributed to R1, not merely 'owned somewhere'",
        )
        del requirements_text

    def test_finding_owned_as_last_token_with_trailing_underscore_passes(self):
        # Regression: the owning `_Findings:` line ends with the italic `_`
        # directly after the id (…, BAR-02_). It must still count as owned.
        requirements = """
        # Requirements
        ### R1. First
        _Findings: FOO-01, BAR-02_
        """
        findings = """
        # Findings
        | ID | Severity | Observed | Source | Outcome |
        |---|---|---|---|---|
        | FOO-01 | P0 | a | s | o |
        | BAR-02 | P1 | b | s | o |
        """
        spec_dir = make_spec(self.specs_root, requirements=requirements, findings=findings)
        make_evidence(self.evidence_root, "1.1")

        result = vsg.validate_spec(spec_dir, self.evidence_root)

        self.assertNotIn("unowned-finding", self._rules(result))


# --------------------------------------------------------------------------- #
# Rule 5 — false completed status (INTENTIONAL FAILING FIXTURE)
# --------------------------------------------------------------------------- #

class RuleFalseCompletedTests(GovernanceTestBase):
    def test_completed_spec_with_unchecked_task_fails(self):
        tasks = """
        # Plan
        - [x] 1.1 Done
          - _Requirements: R1_
          - _Findings: FOO-01_
          - _Evidence: see evidence dir_
        - [ ] 1.2 Not done, but the spec claims completion
          - _Requirements: R1_
          - _Findings: FOO-01_
        """
        spec_dir = make_spec(self.specs_root, status="completed", tasks=tasks)
        make_evidence(self.evidence_root, "1.1")

        result = vsg.validate_spec(spec_dir, self.evidence_root)

        self.assertFalse(result["ok"])
        self.assertIn("false-completed", self._rules(result))
        self.assertTrue(any("1.2" in f["message"] for f in result["findings"]))

    def test_completed_spec_with_all_tasks_checked_passes_status_rule(self):
        tasks = """
        # Plan
        - [x] 1.1 Done
          - _Requirements: R1_
          - _Findings: FOO-01_
          - _Evidence: see evidence dir_
        """
        spec_dir = make_spec(self.specs_root, status="completed", tasks=tasks)
        make_evidence(self.evidence_root, "1.1")

        result = vsg.validate_spec(spec_dir, self.evidence_root)

        self.assertNotIn("false-completed", self._rules(result))


# --------------------------------------------------------------------------- #
# Rule 4 — duplicate spec id (delegated to the task 0.1 validator)
# --------------------------------------------------------------------------- #

class RuleDuplicateSpecIdTests(GovernanceTestBase):
    def test_duplicate_live_spec_id_fails_via_delegation(self):
        make_spec(self.specs_root, name="alpha", spec_id="dup-xyz")
        make_spec(self.specs_root, name="beta", spec_id="dup-xyz")
        make_evidence(self.evidence_root, "1.1")

        result = vsg.validate(
            self.specs_root,
            target_spec="alpha",
            evidence_root=self.evidence_root,
        )

        self.assertFalse(result["ok"])
        self.assertIn("duplicate-or-invalid-metadata", self._rules(result))
        self.assertTrue(any("dup-xyz" in f["message"] for f in result["findings"]))

    def test_unique_ids_do_not_trip_duplicate_rule(self):
        make_spec(self.specs_root, name="alpha", spec_id="id-a")
        make_spec(self.specs_root, name="beta", spec_id="id-b")
        make_evidence(self.evidence_root, "1.1")

        result = vsg.validate(
            self.specs_root,
            target_spec="alpha",
            evidence_root=self.evidence_root,
        )

        self.assertNotIn("duplicate-or-invalid-metadata", self._rules(result))


# --------------------------------------------------------------------------- #
# CLI exit codes
# --------------------------------------------------------------------------- #

class CliExitCodeTests(GovernanceTestBase):
    def test_clean_target_exits_zero(self):
        make_spec(self.specs_root, name="only-spec", spec_id="unique")
        make_evidence(self.evidence_root, "1.1")
        code = vsg.main(
            [
                "--specs-root", str(self.specs_root),
                "--spec", "only-spec",
                "--evidence-root", str(self.evidence_root),
            ]
        )
        self.assertEqual(code, 0)

    def test_violation_exits_two(self):
        # Completed spec with an unchecked task -> error -> exit 2.
        tasks = """
        # Plan
        - [ ] 1.1 Not done
          - _Requirements: R1_
          - _Findings: FOO-01_
        """
        make_spec(self.specs_root, name="only-spec", spec_id="unique", status="completed", tasks=tasks)
        code = vsg.main(
            [
                "--specs-root", str(self.specs_root),
                "--spec", "only-spec",
                "--evidence-root", str(self.evidence_root),
            ]
        )
        self.assertEqual(code, 2)


# --------------------------------------------------------------------------- #
# Parser robustness
# --------------------------------------------------------------------------- #

class ParserRobustnessTests(unittest.TestCase):
    def test_task_ids_with_and_without_trailing_period(self):
        text = dedent(
            """
            # Plan
            - [x] 0.1 No trailing period
            - [x] 1.1. Trailing period style
            - [-] 2.10 Two-digit minor
            """
        )
        tasks = vsg.parse_tasks(text)
        ids = [t["id"] for t in tasks]
        self.assertEqual(ids, ["0.1", "1.1", "2.10"])
        self.assertTrue(tasks[0]["checked"])
        self.assertTrue(tasks[1]["checked"])
        self.assertFalse(tasks[2]["checked"])  # "[-]" is not complete

    def test_requirement_tokens_ignore_trailing_underscore_and_ranges(self):
        text = "_Requirements: R1.2-R1.5, R14.7_"
        tasks = vsg.parse_tasks("# P\n- [ ] 1.1 t\n  " + text)
        self.assertEqual(tasks[0]["requirements"], {"R1", "R14"})

    def test_finding_row_parser_ignores_header_and_separator(self):
        text = dedent(
            """
            | ID | Severity | Observed |
            |---|---|---|
            | GOV-01 | P0 | x |
            | MAINT-02 | P2 | y |
            """
        )
        self.assertEqual(vsg.parse_findings(text), ["GOV-01", "MAINT-02"])


# --------------------------------------------------------------------------- #
# Real-repo regression guards
# --------------------------------------------------------------------------- #

class RealRepoRegressionTests(unittest.TestCase):
    def _specs_root(self) -> Path:
        return _REPO_ROOT / ".kiro" / "specs"

    def test_admissions_v2_spec_passes_all_rules(self):
        specs_root = self._specs_root()
        if not (specs_root / vsg.DEFAULT_SPEC).is_dir():
            self.skipTest("admissions-v2-canonical-rebuild spec not present")

        result = vsg.validate(specs_root)  # default target = V2 spec

        self.assertTrue(
            result["ok"],
            msg="V2 governance errors: %s"
            % [f for f in result["findings"] if f["severity"] == "error"],
        )
        self.assertEqual(result["error_count"], 0)

    def test_v2_spec_shape_is_parsed(self):
        specs_root = self._specs_root()
        spec_dir = specs_root / vsg.DEFAULT_SPEC
        if not spec_dir.is_dir():
            self.skipTest("admissions-v2-canonical-rebuild spec not present")

        result = vsg.validate_spec(spec_dir, _REPO_ROOT / "docs" / "v2-evidence")

        self.assertEqual(result["requirement_count"], 18)
        # The finding-count pin. Its history, because the number moving is not
        # the same thing as the number being wrong:
        #
        #    70  as task 0.2 froze it.
        #    71  after task 2.1's disclosure-policy analysis filed AUTH-07. Task
        #        13.6 §2.1 measured the resulting `71 != 70` self-test failure and
        #        deliberately left it, on the grounds that moving another task's
        #        assertion to make a gate green was not a closure audit's call;
        #        it named the right moment as "when the register is next edited".
        #    71  still, after task 13.6's remediation item L9 registered the 39
        #        Phase 13 GATE findings — not an oversight: the id grammar of the
        #        day matched `[A-Z]{2,6}-\d+`, which a dotted `GATE-13.1-01` does
        #        not satisfy, so those 39 rows were registered documentally and
        #        were invisible to this parser. Filed as finding GATE-13.6-04.
        #   110  after 13.6 remediation item **M6** closed GATE-13.6-04 with the
        #        two coordinated edits L9-L11 §3.3 said it needed: the grammar
        #        widened (`_FINDING_ID_BODY`) AND all 39 ids added to the matching
        #        `_Findings:` lines in requirements.md, so rule 3 has an owner to
        #        find for each. 71 + 39 = 110, and rule 3 reports 0 unowned over
        #        all 110. Widening alone was measured first and does exactly what
        #        L9-L11 predicted — 39 errors, exit 2, CI red:
        #        docs/v2-evidence/13.6/remediation/M4-M5-M6/raw/33.
        #
        # The number the parser sees and the number the register holds are now the
        # same number, which is the whole point of GATE-13.6-04.
        self.assertEqual(result["finding_count"], 110)
        self.assertGreaterEqual(result["task_count"], 70)

    def test_every_registered_finding_has_an_owner_requirement(self):
        """R1.3 rule 3 over the REAL register, dotted ids included.

        The assertion GATE-13.6-04 exists to make true. Kept separate from
        `test_admissions_v2_spec_passes_all_rules` so a rule-3 regression names
        itself instead of arriving as "some governance error".
        """
        specs_root = self._specs_root()
        spec_dir = specs_root / vsg.DEFAULT_SPEC
        if not spec_dir.is_dir():
            self.skipTest("admissions-v2-canonical-rebuild spec not present")

        result = vsg.validate_spec(spec_dir, _REPO_ROOT / "docs" / "v2-evidence")
        unowned = [f for f in result["findings"] if f["rule"] == "unowned-finding"]

        self.assertEqual(
            unowned, [], msg="findings with no owner requirement: %s" % unowned
        )
        # And the population rule 3 ran over really is both shapes, so a future
        # grammar narrowing cannot make this pass vacuously.
        ids = vsg.parse_findings((spec_dir / "findings.md").read_text())
        dotted = [i for i in ids if "." in i]
        self.assertEqual(len(ids), 110)
        self.assertEqual(len(dotted), 39)

    def test_finding_ids_are_not_truncated_by_a_dotted_neighbour(self):
        """No live spec contains a string the id grammar truncates.

        `GATE-13.x-nn` — the *template*, discussed in prose in findings.md and
        tasks.md — is the case that matters: the dotted alternative cannot match
        it (`x` is not a digit), and a grammar that then fell back to the plain
        alternative would invent `GATE-13`. This asserts the corpus is clean of
        every such truncation, so the negative lookahead is verified against real
        text rather than trusted.
        """
        specs_root = self._specs_root()
        if not specs_root.is_dir():
            self.skipTest("no specs root")

        truncated = []
        for spec_dir in sorted(p for p in specs_root.iterdir() if p.is_dir()):
            for name in ("requirements.md", "tasks.md", "findings.md"):
                path = spec_dir / name
                if not path.is_file():
                    continue
                for lineno, line in enumerate(
                    path.read_text(encoding="utf-8").splitlines(), start=1
                ):
                    for match in vsg._FINDING_ID_RE.findall(line):
                        # A bare `GATE-<n>` is never a real id in this register;
                        # every one is `GATE-<major>.<minor>-<nn>`.
                        if re.fullmatch(r"GATE-\d+", match):
                            truncated.append(f"{path}:{lineno}: {match}")

        self.assertEqual(truncated, [], msg="truncated finding ids: %s" % truncated)

    def test_all_specs_audit_detects_known_false_completed(self):
        specs_root = self._specs_root()
        target = specs_root / "full-platform-remediation-2026-07"
        if not target.is_dir():
            self.skipTest("full-platform-remediation-2026-07 spec not present")

        result = vsg.validate(specs_root, all_specs=True)
        false_completed = [
            f
            for f in result["findings"]
            if f["rule"] == "false-completed"
            and f["spec"] == "full-platform-remediation-2026-07"
        ]
        self.assertTrue(
            false_completed,
            msg="expected the completed spec with unchecked tasks to be flagged",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
