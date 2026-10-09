#!/usr/bin/env python3
"""
Spec governance validator (Admissions V2 task 0.2; findings GOV-02, GOV-03, GOV-05).

This is the BROADER finding/requirement/task/evidence validator required by
R1.3. It layers on top of the narrow spec-metadata validator from task 0.1
(`scripts/validate_spec_metadata.py`, which owns "every live spec has a unique
spec ID" and "every `.config.kiro` is valid JSON"). This validator parses the
Kiro config, `requirements.md`, `tasks.md`, `findings.md`, checkbox state, and
`_Evidence:` links, and enforces the full R1.3 rule set.

R1.3 — the spec validator SHALL fail when:

    1. a required task is checked without Required_Evidence;
    2. a requirement is not referenced by a task;
    3. a finding has no owner requirement;
    4. a live spec ID is duplicated;                 (delegated to task 0.1)
    5. a completed spec has unchecked required tasks.

Required_Evidence (glossary): "Executable test output, schema evidence,
screenshots, or operational proof linked from a task. A checklist mark is not
evidence." The execution rules further require it to be linked under
`docs/v2-evidence/<task-id>/`. So a CHECKED (`[x]`) task must both:

    (a) carry a non-empty `_Evidence:` descriptor line, and
    (b) have a `docs/v2-evidence/<task-id>/` directory containing at least one
        non-empty file.

Design choices (documented so the rule is unambiguous):

- "Checked" means the checkbox is exactly `[x]`. The V2 tasks file also uses
  `[-]` (in progress) and `[~]` (not started); those are NOT complete and are
  never required to carry evidence.
- "Requirement" is evaluated at the top-level requirement granularity (`R1`..
  `R18`, one per `### Rn.` heading). A task that references any sub-criterion
  (e.g. `R1.2-R1.5`) counts as referencing `R1`. This is the defensible reading
  of R1.3's "a requirement is not referenced by a task".
- A finding is "owned" when its ID appears in at least one requirement's
  `_Findings:` ownership line in `requirements.md`.
- The duplicate-live-spec-ID and invalid-`.config.kiro`-JSON checks (rule 4) are
  delegated to the task 0.1 validator and run repo-wide, so this tool remains a
  single governance entry point without duplicating that logic.

Scope of the per-spec rules (1, 2, 3, 5): by default they run against the
target spec (`admissions-v2-canonical-rebuild`), which is the active admissions
authority that adopts this evidence-driven governance. `--all-specs` additionally
audits the completed-status rule (5) across every live spec and the structural
rules (1, 2, 3) for any spec that carries the full requirements/tasks/findings
trio. Fixing pre-existing status debt in unrelated specs is out of task 0.2's
scope; this tool only reports it.

Exit codes: 0 = clean (or warnings only), 1 = warnings with --strict, 2 = errors.
No third-party dependencies; standard library only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

# Reuse the task 0.1 metadata validator for the repo-wide duplicate-live-spec-ID
# and invalid-JSON checks (R1.3 rule 4). Importing it keeps a single source of
# truth for that logic instead of re-implementing it here.
_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

import validate_spec_metadata as vsm  # noqa: E402

# The spec that adopts this governance by default.
DEFAULT_SPEC = "admissions-v2-canonical-rebuild"

# A requirement heading, e.g. "### R1. Evidence-Driven Scope And Spec Governance".
_REQ_HEADING_RE = re.compile(r"^#{2,4}\s+(R\d+)\.\s")
# A top-level requirement token inside a reference list, e.g. "R1", "R14".
# A trailing markdown italic `_` (as in "_Requirements: R1_") is a word
# character, so `\bR1\b` would fail to match; use explicit boundaries that treat
# `_` as a terminator while still consuming the full number.
_REQ_TOKEN_RE = re.compile(r"(?<![A-Za-z0-9])R(\d+)(?![0-9])")
# A finding ID. The register uses TWO shapes, and both are definitions:
#
#   GOV-01, AUTH-02, ADM-06, TEN-10, STU-24, DATA-11, API-04, MAINT-01, REL-02
#       two-to-six uppercase letters, a dash, digits. The original shape.
#   GATE-13.1-01 … GATE-13.6-04
#       the Phase 13 gate findings, whose middle segment is a DOTTED task id.
#       Registered in findings.md by task 13.6 remediation item L9; admitted here
#       by item M6, which is finding GATE-13.6-04. Before M6 this parser matched
#       only the first shape, so 39 registered rows were invisible to it:
#       `finding_count` read 71 instead of 110 and R1.3 rule 3 ("a finding has no
#       owner requirement") was structurally unable to fire over any of them.
#       Renaming them into the original shape was rejected because every Phase 13
#       evidence README references them by the dotted id and that evidence is
#       immutable under R2.7 — a register you can only read by rewriting history
#       is not a register.
#
# ONE pattern, shared by both regexes below, because two spellings of one grammar
# is how the grammar drifts. The dotted alternative is FIRST: alternation is
# ordered, and if the plain one were tried first `GATE-13.1-01` would match as
# `GATE-13` (the `.` satisfies the "not alphanumeric" boundary) and the register
# would gain a phantom id while losing a real one.
_FINDING_ID_BODY = r"[A-Z]{2,6}-\d+\.\d+-\d+|[A-Z]{2,6}-\d+"
# Trailing-underscore concern: "…, GOV-05_" (last id + markdown italic close) must
# still match, so a following `_` is a boundary rather than a blocker (which a
# plain `\b` is, because `_` is a word character).
#
# A following `.` + identifier character is NOT a boundary. Ordered alternation
# alone handles a real dotted id, but the register also discusses the *template*
# `GATE-13.x-nn` in prose (findings.md:205, :303, tasks.md:865), where the dotted
# alternative cannot match because `x` is not a digit — and the plain one would
# then match `GATE-13`, inventing an id that does not exist. Blocking `.`-followed-
# by-anything-identifier-like costs nothing real: no id in any live spec is
# immediately followed by `.` and another identifier character, which is asserted
# rather than assumed (test_finding_ids_are_not_truncated_by_a_dotted_neighbour).
_FINDING_ID_RE = re.compile(
    rf"(?<![A-Za-z0-9])({_FINDING_ID_BODY})(?![0-9A-Za-z]|\.[0-9A-Za-z])"
)
# A finding definition row in findings.md: "| GOV-01 | P0 | ... |" or
# "| GATE-13.1-01 | med | ... |".
_FINDING_ROW_RE = re.compile(rf"^\|\s*({_FINDING_ID_BODY})\s*\|")
# A task line. Tolerates both numbering styles seen across specs:
#   "- [x] 0.1 Title"   (admissions V2)
#   "- [x] 1.1. Title"  (trailing period, e.g. full-platform-remediation-2026-07)
# and the in-progress/not-started markers "[-]" and "[~]" in addition to "[x]".
_TASK_RE = re.compile(r"^\s*[-*]\s*\[([ xX~\-])\]\s*(\d+(?:\.\d+)*)\.?\s+(.*\S)\s*$")
# Metadata annotation lines within a task block.
_META_RE = re.compile(r"^\s*[-*]?\s*_?(Requirements|Findings|Evidence)\s*:\s*(.*?)_?\s*$")
# A markdown header ends a task's metadata scope.
_HEADER_RE = re.compile(r"^#{1,6}\s")


# --------------------------------------------------------------------------- #
# Parsing
# --------------------------------------------------------------------------- #

def parse_requirements(text: str) -> Dict[str, Any]:
    """Parse requirements.md.

    Returns:
        requirement_ids: ordered list of top-level requirement IDs (R1..Rn).
        owned_findings: set of finding IDs declared in any `_Findings:` line.
        findings_by_requirement: {requirement_id: set(finding_ids)}.
    """
    requirement_ids: List[str] = []
    owned_findings: Set[str] = set()
    findings_by_requirement: Dict[str, Set[str]] = {}
    current_req: Optional[str] = None

    for line in text.splitlines():
        heading = _REQ_HEADING_RE.match(line)
        if heading:
            current_req = heading.group(1)
            if current_req not in requirement_ids:
                requirement_ids.append(current_req)
                findings_by_requirement.setdefault(current_req, set())
            continue

        # A findings-ownership line (tolerate `_Findings: ..._`, `Findings: ...`).
        if "Findings:" in line:
            ids = set(_FINDING_ID_RE.findall(line))
            if ids:
                owned_findings |= ids
                if current_req is not None:
                    findings_by_requirement.setdefault(current_req, set()).update(ids)

    return {
        "requirement_ids": requirement_ids,
        "owned_findings": owned_findings,
        "findings_by_requirement": findings_by_requirement,
    }


def parse_findings(text: str) -> List[str]:
    """Parse findings.md; return the ordered list of defined finding IDs.

    Only the first cell of a markdown table row is treated as a finding
    definition, so finding IDs mentioned in prose are not miscounted as
    definitions.
    """
    seen: List[str] = []
    seen_set: Set[str] = set()
    for line in text.splitlines():
        m = _FINDING_ROW_RE.match(line)
        if m:
            fid = m.group(1)
            if fid not in seen_set:
                seen.append(fid)
                seen_set.add(fid)
    return seen


def parse_tasks(text: str) -> List[Dict[str, Any]]:
    """Parse tasks.md into task records.

    Each record has: id, title, state (raw checkbox char), checked (bool),
    line_no, requirements (set of top-level R-ids), finding_refs (set),
    evidence (descriptor str or None), raw_requirements/raw_findings (str|None).
    """
    tasks: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None

    for idx, line in enumerate(text.splitlines(), start=1):
        task_match = _TASK_RE.match(line)
        if task_match:
            state = task_match.group(1)
            current = {
                "id": task_match.group(2),
                "title": task_match.group(3).strip(),
                "state": state,
                "checked": state.lower() == "x",
                "line_no": idx,
                "requirements": set(),
                "finding_refs": set(),
                "evidence": None,
                "raw_requirements": None,
                "raw_findings": None,
            }
            tasks.append(current)
            continue

        if _HEADER_RE.match(line):
            # A new section header closes the current task's metadata scope.
            current = None
            continue

        if current is None:
            continue

        meta = _META_RE.match(line)
        if not meta:
            continue
        key, value = meta.group(1), meta.group(2).strip()
        if key == "Requirements":
            current["raw_requirements"] = value
            current["requirements"] = {f"R{n}" for n in _REQ_TOKEN_RE.findall(value)}
        elif key == "Findings":
            current["raw_findings"] = value
            current["finding_refs"] = set(_FINDING_ID_RE.findall(value))
        elif key == "Evidence":
            current["evidence"] = value

    return tasks


def _load_config(config_path: Path) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Return (config_dict, parse_error)."""
    if not config_path.is_file():
        return None, None
    try:
        parsed = json.loads(config_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        return None, str(exc)
    if not isinstance(parsed, dict):
        return None, "config root is not a JSON object"
    return parsed, None


def _dir_has_content(directory: Path) -> bool:
    """True if directory exists and holds at least one non-empty file."""
    if not directory.is_dir():
        return False
    for path in directory.rglob("*"):
        try:
            if path.is_file() and path.stat().st_size > 0:
                return True
        except OSError:
            continue
    return False


# --------------------------------------------------------------------------- #
# Per-spec validation (rules 1, 2, 3, 5)
# --------------------------------------------------------------------------- #

def validate_spec(spec_dir: Path, evidence_root: Path) -> Dict[str, Any]:
    """Validate one spec's finding/requirement/task/evidence/status governance.

    Returns a structured record including a `findings` list of
    {severity, spec, rule, message}.
    """
    name = spec_dir.name
    findings: List[Dict[str, str]] = []

    def add(severity: str, rule: str, message: str) -> None:
        findings.append({"severity": severity, "spec": name, "rule": rule, "message": message})

    req_path = spec_dir / "requirements.md"
    tasks_path = spec_dir / "tasks.md"
    findings_path = spec_dir / "findings.md"
    config_path = spec_dir / ".config.kiro"

    config, config_error = _load_config(config_path)
    if config_error:
        # Duplicated with the task 0.1 validator, but keep a local signal too.
        add("error", "config", f".config.kiro is not valid JSON: {config_error}")

    req_data = parse_requirements(req_path.read_text(encoding="utf-8")) if req_path.is_file() else None
    finding_ids = parse_findings(findings_path.read_text(encoding="utf-8")) if findings_path.is_file() else None
    tasks = parse_tasks(tasks_path.read_text(encoding="utf-8")) if tasks_path.is_file() else []

    checked_tasks = [t for t in tasks if t["checked"]]
    unchecked_tasks = [t for t in tasks if not t["checked"]]

    # Rule 1: a checked (required) task must have Required_Evidence.
    for task in checked_tasks:
        descriptor_ok = bool(task["evidence"] and task["evidence"].strip())
        evidence_dir = evidence_root / task["id"]
        dir_ok = _dir_has_content(evidence_dir)
        if not descriptor_ok and not dir_ok:
            add(
                "error",
                "missing-evidence",
                f"task {task['id']} is checked but has no _Evidence: descriptor and "
                f"no non-empty evidence directory at {evidence_dir}",
            )
        elif not descriptor_ok:
            add(
                "error",
                "missing-evidence",
                f"task {task['id']} is checked but has no _Evidence: descriptor line",
            )
        elif not dir_ok:
            add(
                "error",
                "missing-evidence",
                f"task {task['id']} is checked but has no linked Required_Evidence at "
                f"{evidence_dir} (a checklist mark is not evidence)",
            )

    # Rule 2: every requirement must be referenced by at least one task.
    if req_data is not None:
        referenced: Set[str] = set()
        for task in tasks:
            referenced |= task["requirements"]
        for req_id in req_data["requirement_ids"]:
            if req_id not in referenced:
                add(
                    "error",
                    "unreferenced-requirement",
                    f"requirement {req_id} is not referenced by any task",
                )

    # Rule 3: every finding must have an owner requirement.
    if finding_ids is not None:
        owned = req_data["owned_findings"] if req_data is not None else set()
        for fid in finding_ids:
            if fid not in owned:
                add(
                    "error",
                    "unowned-finding",
                    f"finding {fid} has no owner requirement "
                    f"(not listed in any requirement's _Findings: line)",
                )

    # Rule 5: a completed spec must have no unchecked required tasks.
    status = (config or {}).get("status")
    if isinstance(status, str) and status.strip().lower() == "completed":
        if unchecked_tasks:
            preview = ", ".join(t["id"] for t in unchecked_tasks[:10])
            more = "" if len(unchecked_tasks) <= 10 else f" (+{len(unchecked_tasks) - 10} more)"
            add(
                "error",
                "false-completed",
                f"spec is marked status=completed but {len(unchecked_tasks)} required "
                f"task(s) are unchecked: {preview}{more}",
            )

    # Supplementary signal (WARNINGS, non-blocking): dangling references in a
    # task to a requirement/finding that is not defined for this spec. This
    # surfaces typos without expanding the required blocking rule set.
    if req_data is not None:
        defined_reqs = set(req_data["requirement_ids"])
        for task in tasks:
            for ref in sorted(task["requirements"]):
                if ref not in defined_reqs:
                    add(
                        "warning",
                        "unknown-requirement-ref",
                        f"task {task['id']} references {ref}, which is not a defined requirement",
                    )
    if finding_ids is not None:
        defined_findings = set(finding_ids)
        for task in tasks:
            for ref in sorted(task["finding_refs"]):
                if ref not in defined_findings:
                    add(
                        "warning",
                        "unknown-finding-ref",
                        f"task {task['id']} references {ref}, which is not a defined finding",
                    )

    error_count = sum(1 for f in findings if f["severity"] == "error")
    warning_count = sum(1 for f in findings if f["severity"] == "warning")

    return {
        "spec": name,
        "spec_dir": str(spec_dir),
        "status": status,
        "has_requirements": req_path.is_file(),
        "has_tasks": tasks_path.is_file(),
        "has_findings": findings_path.is_file(),
        "requirement_count": len(req_data["requirement_ids"]) if req_data else 0,
        "finding_count": len(finding_ids) if finding_ids is not None else 0,
        "task_count": len(tasks),
        "checked_task_count": len(checked_tasks),
        "findings": findings,
        "error_count": error_count,
        "warning_count": warning_count,
        "ok": error_count == 0,
    }


# --------------------------------------------------------------------------- #
# Repo-level orchestration (adds rule 4 via the task 0.1 validator)
# --------------------------------------------------------------------------- #

def _spec_has_governance_trio(spec_dir: Path) -> bool:
    return (spec_dir / "requirements.md").is_file() and \
           (spec_dir / "tasks.md").is_file() and \
           (spec_dir / "findings.md").is_file()


def validate(
    specs_root: Path,
    target_spec: str = DEFAULT_SPEC,
    evidence_root: Optional[Path] = None,
    all_specs: bool = False,
) -> Dict[str, Any]:
    """Run the full governance validation and return a structured result."""
    if evidence_root is None:
        # specs_root is <repo>/.kiro/specs -> repo root is two levels up.
        repo_root = specs_root.parent.parent
        evidence_root = repo_root / "docs" / "v2-evidence"

    findings: List[Dict[str, str]] = []

    # Rule 4 (+ invalid JSON): delegate to the task 0.1 metadata validator.
    metadata_result = vsm.validate(specs_root)
    for f in metadata_result["findings"]:
        if f["severity"] == "error":
            findings.append(
                {
                    "severity": "error",
                    "spec": f["spec"],
                    "rule": "duplicate-or-invalid-metadata",
                    "message": f["message"],
                }
            )

    # Determine which specs get the per-spec structural/status checks.
    spec_results: List[Dict[str, Any]] = []
    if all_specs:
        target_dirs = [
            child
            for child in sorted(specs_root.iterdir())
            if child.is_dir() and not child.name.startswith("_")
        ]
    else:
        target_dirs = [specs_root / target_spec]

    for spec_dir in target_dirs:
        if not spec_dir.is_dir():
            findings.append(
                {
                    "severity": "error",
                    "spec": spec_dir.name,
                    "rule": "missing-spec",
                    "message": f"target spec directory does not exist: {spec_dir}",
                }
            )
            continue
        # In --all-specs mode, run per-spec checks on whatever governance files
        # a spec actually has (validate_spec degrades gracefully). Every spec
        # with a .config.kiro + tasks.md still gets the completed-status rule.
        if not all_specs or (spec_dir / "tasks.md").is_file():
            result = validate_spec(spec_dir, evidence_root)
            spec_results.append(result)
            findings.extend(result["findings"])

    error_count = sum(1 for f in findings if f["severity"] == "error")
    warning_count = sum(1 for f in findings if f["severity"] == "warning")

    return {
        "specs_root": str(specs_root),
        "evidence_root": str(evidence_root),
        "target_spec": None if all_specs else target_spec,
        "all_specs": all_specs,
        "metadata_ok": metadata_result["ok"],
        "spec_results": spec_results,
        "findings": findings,
        "error_count": error_count,
        "warning_count": warning_count,
        "ok": error_count == 0,
    }


# --------------------------------------------------------------------------- #
# Reporting / CLI
# --------------------------------------------------------------------------- #

def format_human(result: Dict[str, Any]) -> str:
    lines = [
        "=" * 64,
        "SPEC GOVERNANCE VALIDATION (finding/requirement/task/evidence)",
        "=" * 64,
        f"Specs root:    {result['specs_root']}",
        f"Evidence root: {result['evidence_root']}",
        f"Target:        {'ALL live specs' if result['all_specs'] else result['target_spec']}",
        f"Errors: {result['error_count']}  Warnings: {result['warning_count']}",
        "",
    ]

    for spec in result["spec_results"]:
        lines.append(
            f"[{spec['spec']}] status={spec['status']} "
            f"reqs={spec['requirement_count']} findings={spec['finding_count']} "
            f"tasks={spec['task_count']} (checked={spec['checked_task_count']})"
        )
    lines.append("")

    errors = [f for f in result["findings"] if f["severity"] == "error"]
    warnings = [f for f in result["findings"] if f["severity"] == "warning"]

    if errors:
        lines.append("ERRORS (block):")
        for f in errors:
            lines.append(f"  [{f['spec']}] ({f['rule']}) {f['message']}")
        lines.append("")
    if warnings:
        lines.append("WARNINGS (informational):")
        for f in warnings:
            lines.append(f"  [{f['spec']}] ({f['rule']}) {f['message']}")
        lines.append("")

    lines.append("RESULT: " + ("PASS" if result["ok"] else "FAIL (governance violations present)"))
    return "\n".join(lines)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Validate spec finding/requirement/task/evidence governance (R1.3): "
            "checked tasks carry evidence, requirements are referenced, findings "
            "are owned, spec IDs are unique, and completed specs have no unchecked tasks."
        ),
    )
    parser.add_argument(
        "--specs-root",
        type=Path,
        default=vsm._default_specs_root(),
        help="Path to the .kiro/specs directory (default: auto-detected).",
    )
    parser.add_argument(
        "--spec",
        default=DEFAULT_SPEC,
        help=f"Target spec for structural/status rules (default: {DEFAULT_SPEC}).",
    )
    parser.add_argument(
        "--evidence-root",
        type=Path,
        default=None,
        help="Path to docs/v2-evidence (default: <repo>/docs/v2-evidence).",
    )
    parser.add_argument(
        "--all-specs",
        action="store_true",
        help="Audit completed-status across every live spec and structural rules "
        "for any spec with the requirements/tasks/findings trio.",
    )
    parser.add_argument("--json", action="store_true", dest="json_flag", help="Emit JSON.")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero (1) on warnings as well as errors.",
    )
    args = parser.parse_args(argv)

    result = validate(
        args.specs_root,
        target_spec=args.spec,
        evidence_root=args.evidence_root,
        all_specs=args.all_specs,
    )

    if args.json_flag:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(format_human(result))

    if result["error_count"] > 0:
        return 2
    if args.strict and result["warning_count"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
