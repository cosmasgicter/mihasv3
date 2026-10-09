#!/usr/bin/env python3
"""
Spec metadata validator (Admissions V2 task 0.1, findings GOV-01/GOV-03).

Validates the `.config.kiro` metadata of every LIVE Kiro spec under
`.kiro/specs/` and enforces the one invariant task 0.1 owns:

    Every live spec has a unique spec ID.

This is deliberately narrow. It is NOT the finding/requirement/task/evidence
validator (that is task 0.2). It only inspects spec *metadata* so that the
duplicate-live-spec-ID defect (GOV-03) cannot recur and so the canonical truth
map's "active spec" authority statement (GOV-01) rests on unambiguous IDs.

Scope:
- Live specs are the immediate child directories of `.kiro/specs/` whose names
  do NOT start with "_" (so `_archived/` and any other underscore-prefixed
  holding area are treated as history and skipped, per GOV-01).
- Archived specs are intentionally left untouched and unvalidated; keeping them
  as historical inputs is a task 0.1 requirement.

Severity:
- ERROR (blocks, exit 2):
    * two or more live specs share the same spec ID;
    * a `.config.kiro` file exists but is not valid JSON.
- WARNING (informational, exit 0 unless --strict):
    * a live spec directory has no `.config.kiro`;
    * a live spec `.config.kiro` has no usable spec ID field.

Exit codes: 0 = clean (or warnings only), 1 = warnings with --strict,
2 = errors. No third-party dependencies; standard library only.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

# Candidate keys that may carry a spec's identity. `specId` is the canonical
# Kiro field; the others are tolerated so a spec written with an alternate
# schema is reported as "has an id" rather than falsely flagged, while still
# letting the duplicate check span every id-bearing spec.
_ID_KEYS = ("specId", "spec_id", "id")

# Directory names under `.kiro/specs/` that are never treated as live specs.
_NON_SPEC_DIRS = {"_archived"}


def _default_specs_root() -> Path:
    """Locate `.kiro/specs/` relative to this file (repo-root/scripts/..)."""
    return Path(__file__).resolve().parent.parent / ".kiro" / "specs"


def _extract_spec_id(config: Dict[str, Any]) -> Optional[str]:
    """Return the first non-empty id-like field, or None."""
    for key in _ID_KEYS:
        value = config.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def discover_live_specs(specs_root: Path) -> List[Dict[str, Any]]:
    """Enumerate live spec directories and read their `.config.kiro`.

    Each returned record has: name, dir, config_path, has_config,
    parse_error (str|None), config (dict|None), spec_id (str|None).
    """
    records: List[Dict[str, Any]] = []
    if not specs_root.is_dir():
        return records

    for child in sorted(specs_root.iterdir()):
        if not child.is_dir():
            continue
        if child.name.startswith("_") or child.name in _NON_SPEC_DIRS:
            continue

        config_path = child / ".config.kiro"
        record: Dict[str, Any] = {
            "name": child.name,
            "dir": str(child),
            "config_path": str(config_path),
            "has_config": config_path.is_file(),
            "parse_error": None,
            "config": None,
            "spec_id": None,
        }

        if record["has_config"]:
            try:
                raw = config_path.read_text(encoding="utf-8")
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    record["config"] = parsed
                    record["spec_id"] = _extract_spec_id(parsed)
                else:
                    record["parse_error"] = "config root is not a JSON object"
            except (json.JSONDecodeError, OSError) as exc:
                record["parse_error"] = str(exc)

        records.append(record)

    return records


def validate(specs_root: Path) -> Dict[str, Any]:
    """Validate live spec metadata and return a structured result."""
    records = discover_live_specs(specs_root)
    findings: List[Dict[str, str]] = []

    def add(severity: str, spec: str, message: str) -> None:
        findings.append({"severity": severity, "spec": spec, "message": message})

    # Group live spec IDs to detect duplicates (GOV-03).
    id_to_specs: Dict[str, List[str]] = {}

    for rec in records:
        name = rec["name"]
        if not rec["has_config"]:
            add("warning", name, "no .config.kiro file (spec has no tracked metadata)")
            continue
        if rec["parse_error"]:
            add("error", name, f".config.kiro is not valid JSON: {rec['parse_error']}")
            continue
        spec_id = rec["spec_id"]
        if not spec_id:
            add("warning", name, "no spec id field (expected one of: %s)" % ", ".join(_ID_KEYS))
            continue
        id_to_specs.setdefault(spec_id, []).append(name)

    duplicate_ids: Dict[str, List[str]] = {
        spec_id: names for spec_id, names in id_to_specs.items() if len(names) > 1
    }
    for spec_id, names in sorted(duplicate_ids.items()):
        joined = ", ".join(sorted(names))
        for name in sorted(names):
            add(
                "error",
                name,
                f"duplicate live spec id '{spec_id}' shared by: {joined}",
            )

    error_count = sum(1 for f in findings if f["severity"] == "error")
    warning_count = sum(1 for f in findings if f["severity"] == "warning")

    return {
        "specs_root": str(specs_root),
        "live_spec_count": len(records),
        "specs": [
            {"name": r["name"], "spec_id": r["spec_id"], "has_config": r["has_config"]}
            for r in records
        ],
        "duplicate_ids": duplicate_ids,
        "findings": findings,
        "error_count": error_count,
        "warning_count": warning_count,
        "ok": error_count == 0,
    }


def format_human(result: Dict[str, Any]) -> str:
    lines = [
        "=" * 60,
        "SPEC METADATA VALIDATION",
        "=" * 60,
        f"Specs root: {result['specs_root']}",
        f"Live specs: {result['live_spec_count']}",
        f"Errors: {result['error_count']}  Warnings: {result['warning_count']}",
        "",
        "Live spec IDs:",
    ]
    for spec in result["specs"]:
        spec_id = spec["spec_id"] or ("<no-id>" if spec["has_config"] else "<no-config>")
        lines.append(f"  {spec['name']}: {spec_id}")
    lines.append("")

    errors = [f for f in result["findings"] if f["severity"] == "error"]
    warnings = [f for f in result["findings"] if f["severity"] == "warning"]

    if errors:
        lines.append("ERRORS (block):")
        for f in errors:
            lines.append(f"  [{f['spec']}] {f['message']}")
        lines.append("")
    if warnings:
        lines.append("WARNINGS (informational):")
        for f in warnings:
            lines.append(f"  [{f['spec']}] {f['message']}")
        lines.append("")

    lines.append("RESULT: " + ("PASS" if result["ok"] else "FAIL (duplicate/invalid spec metadata)"))
    return "\n".join(lines)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate Kiro spec metadata (unique live spec IDs, valid config JSON).",
    )
    parser.add_argument(
        "--specs-root",
        type=Path,
        default=_default_specs_root(),
        help="Path to the .kiro/specs directory (default: auto-detected from repo layout).",
    )
    parser.add_argument("--json", action="store_true", dest="json_flag", help="Emit JSON.")
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit non-zero (1) on warnings as well as errors.",
    )
    args = parser.parse_args(argv)

    result = validate(args.specs_root)

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
