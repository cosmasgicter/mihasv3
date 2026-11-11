#!/usr/bin/env python3
"""Capability inventory (platform-simplification task 8.1, Requirements 8.4, 8.5).

Analysis only. Nothing here changes the catalogue. For every ``platform.*`` and
``tenant.*`` capability in ``backend/apps/catalog/services.py`` it records:

* ``backend``   enforcement sites (file:line) in non-test backend code, outside
                the catalogue and derivation tables themselves
* ``frontend``  gate sites in the admissions and jobs-ops sources (generated
                files excluded)
* ``tests``     test files that name the capability
* ``update_set`` every tracked file ``git grep -l`` lists, outside
                ``.kiro/specs/``, ``docs/archive/`` and ``docs/v2-evidence/``
* ``granted_by`` how the capability is obtained (see ``grant_signature``)

It then proposes a merge table: only pairs that are always granted together
(same grant signature) and that no gate distinguishes (no enforcement or
frontend site names exactly one of the pair). A site that names a capability
through a computed string (for example ``tenant.<kind>.request_change``) cannot
be seen by a text search; the report lists those sites separately so a reader
does not mistake "no literal" for "no gate".

Usage (from the repository root, standard library only):
    python3 scripts/capability_inventory.py [--json out.json] [--markdown out.md]
"""
from __future__ import annotations

import argparse
import ast
import itertools
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SERVICES = "backend/apps/catalog/services.py"
UPDATE_SET_EXCLUDES = (".kiro/specs/", "docs/archive/", "docs/v2-evidence/")
FRONTEND_ROOTS = ("apps/admissions/src/", "apps/jobs-ops/src/")
GENERATED_MARKERS = ("/generated/",)
CAPABILITY_RE = re.compile(r"\b(?:platform|tenant)\.[a-z_]+\.[a-z_]+\b")
DYNAMIC_RE = re.compile(r"(?:platform|tenant)\.(?:<|\{)[a-z_]+(?:>|\})\.[a-z_]+")


def read_catalogue(services_text: str) -> dict:
    """Read the frozensets and the grant tables by AST, without importing Django."""
    tree = ast.parse(services_text)
    found: dict[str, ast.AST] = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "AdminCapabilityService":
            for stmt in node.body:
                if isinstance(stmt, ast.AnnAssign) and isinstance(stmt.target, ast.Name):
                    found[stmt.target.id] = stmt.value
    if not {"PLATFORM_CAPABILITIES", "TENANT_CAPABILITIES"} <= set(found):
        raise SystemExit("capability catalogue not found in AdminCapabilityService")

    def strings(value: ast.AST) -> set[str]:
        return {
            n.value
            for n in ast.walk(value)
            if isinstance(n, ast.Constant) and isinstance(n.value, str)
        }

    granted: dict[str, set[str]] = {}
    mutation = found.get("_GRANTED_MUTATION_CAPABILITIES")
    if isinstance(mutation, ast.Dict):
        for key, val in zip(mutation.keys, mutation.values):
            if isinstance(key, ast.Constant):
                granted[str(key.value)] = strings(val)
    return {
        "platform": sorted(strings(found["PLATFORM_CAPABILITIES"])),
        "tenant": sorted(strings(found["TENANT_CAPABILITIES"])),
        "default_read": strings(found.get("_DEFAULT_TENANT_READ_CAPABILITIES", ast.Tuple(elts=[]))),
        "granted": granted,
    }


def grant_signature(capability: str, catalogue: dict) -> str:
    """Who obtains a capability. Equal signatures mean 'always granted together'."""
    if capability.startswith("platform."):
        return "role:super_admin"
    parts = ["role:super_admin"]
    if capability in catalogue["default_read"]:
        parts.append("default:active-membership")
    for grant_value, caps in sorted(catalogue["granted"].items()):
        if capability in caps:
            parts.append(f"grant:{grant_value}")
    return "+".join(parts)


def git_grep_lines(pattern: str, repo: Path) -> list[tuple[str, int]]:
    out = subprocess.run(
        ["git", "grep", "-nF", "-e", pattern, "--", "."],
        cwd=repo, capture_output=True, text=True,
    ).stdout
    hits = []
    for line in out.splitlines():
        path, _, rest = line.partition(":")
        lineno, _, _ = rest.partition(":")
        if lineno.isdigit():
            hits.append((path, int(lineno)))
    return hits


def is_test(path: str) -> bool:
    return (
        "/tests/" in f"/{path}"
        or path.endswith((".test.ts", ".test.tsx", ".spec.ts"))
        or "/test_" in f"/{path}"
    )


def is_generated(path: str) -> bool:
    return any(m in f"/{path}" for m in GENERATED_MARKERS)


def catalogue_lines(services_text: str) -> set[int]:
    """Line numbers in services.py inside the catalogue and derivation tables."""
    tree = ast.parse(services_text)
    names = {
        "PLATFORM_CAPABILITIES", "TENANT_CAPABILITIES",
        "_DEFAULT_TENANT_READ_CAPABILITIES", "_GRANTED_MUTATION_CAPABILITIES",
    }
    lines: set[int] = set()
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.AnnAssign)
            and isinstance(node.target, ast.Name)
            and node.target.id in names
        ):
            lines.update(range(node.lineno, (node.end_lineno or node.lineno) + 1))
    return lines


def classify_hit(path: str, line: int, skip_lines: set[int]) -> str | None:
    if is_generated(path):
        return None
    if is_test(path):
        return "tests"
    if path == SERVICES and line in skip_lines:
        return None
    if path.startswith("backend/") and path.endswith(".py"):
        return "backend"
    if path.startswith(FRONTEND_ROOTS):
        return "frontend"
    return None


def update_set(capability: str, repo: Path) -> list[str]:
    out = subprocess.run(
        ["git", "grep", "-lF", "-e", capability, "--", "."],
        cwd=repo, capture_output=True, text=True,
    ).stdout.split()
    return sorted(p for p in out if not p.startswith(UPDATE_SET_EXCLUDES))


def dynamic_sites(repo: Path) -> list[str]:
    """Sites that build a capability name from a variable (invisible to a literal search)."""
    out = subprocess.run(
        ["git", "grep", "-nE", "-e", r"(platform|tenant)\.(<|\{)[a-z_]+(>|\})\.[a-z_]+",
         "--", "backend/apps", "apps/admissions/src", "apps/jobs-ops/src"],
        cwd=repo, capture_output=True, text=True,
    ).stdout
    return sorted({line.split(":", 2)[0] + ":" + line.split(":", 2)[1] for line in out.splitlines() if line.count(":") >= 2})


def build(repo: Path = REPO) -> dict:
    services_text = (repo / SERVICES).read_text(encoding="utf-8")
    catalogue = read_catalogue(services_text)
    skip = catalogue_lines(services_text)
    all_caps = catalogue["platform"] + catalogue["tenant"]
    records: dict[str, dict] = {}
    for cap in all_caps:
        sites: dict[str, list[str]] = {"backend": [], "frontend": [], "tests": []}
        for path, line in git_grep_lines(cap, repo):
            kind = classify_hit(path, line, skip)
            if kind:
                sites[kind].append(f"{path}:{line}")
        records[cap] = {
            "granted_by": grant_signature(cap, catalogue),
            "backend": sorted(sites["backend"]),
            "frontend": sorted(sites["frontend"]),
            "tests": sorted({s.rsplit(":", 1)[0] for s in sites["tests"]}),
            "update_set": update_set(cap, repo),
        }
    return {
        "capabilities": records,
        "merge_candidates": merge_candidates(records),
        "dynamic_name_sites": dynamic_sites(repo),
    }


def merge_candidates(records: dict[str, dict]) -> list[dict]:
    """Pairs always granted together that no single gate site distinguishes."""
    site_caps: dict[str, set[str]] = {}
    for cap, rec in records.items():
        for site in rec["backend"] + rec["frontend"]:
            site_caps.setdefault(site, set()).add(cap)
    # A site is a distinguishing gate when it names exactly one of the pair.
    # Sites on the same file and line name every capability on that line.
    result = []
    for a, b in itertools.combinations(sorted(records), 2):
        if records[a]["granted_by"] != records[b]["granted_by"]:
            continue
        if a.split(".")[0] != b.split(".")[0]:
            continue
        distinguishing = [s for s, caps in site_caps.items() if len(caps & {a, b}) == 1]
        if not distinguishing:
            result.append({
                "pair": [a, b],
                "granted_by": records[a]["granted_by"],
                "enforcement_sites": {a: records[a]["backend"], b: records[b]["backend"]},
                "frontend_gates": {a: records[a]["frontend"], b: records[b]["frontend"]},
                "tests": {a: records[a]["tests"], b: records[b]["tests"]},
            })
    return result


def render_markdown(data: dict) -> str:
    rows = ["# Capability inventory", "",
            "Generated by `python3 scripts/capability_inventory.py`. Analysis only; the catalogue is unchanged.", "",
            "| Capability | Granted by | Backend sites | Frontend gates | Test files | Update set |",
            "|---|---|---:|---:|---:|---:|"]
    for cap, rec in data["capabilities"].items():
        rows.append(
            f"| `{cap}` | `{rec['granted_by']}` | {len(rec['backend'])} | {len(rec['frontend'])} "
            f"| {len(rec['tests'])} | {len(rec['update_set'])} |"
        )
    rows += ["", "## Merge candidates (always granted together, no gate distinguishes them)", ""]
    if data["merge_candidates"]:
        for c in data["merge_candidates"]:
            rows.append(f"- `{c['pair'][0]}` + `{c['pair'][1]}` (granted by `{c['granted_by']}`)")
    else:
        rows.append("None. Every pair that is granted together is told apart by at least one gate site.")
    rows += ["", "## Sites that build a capability name from a variable", ""]
    rows += [f"- `{s}`" for s in data["dynamic_name_sites"]] or ["None."]
    rows += ["", "## Update sets", ""]
    for cap, rec in data["capabilities"].items():
        rows.append(f"### `{cap}` ({len(rec['update_set'])} files)")
        rows += [f"- `{p}`" for p in rec["update_set"]] or ["- (none)"]
        rows.append("")
    return "\n".join(rows) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--json")
    parser.add_argument("--markdown")
    args = parser.parse_args(argv)
    data = build()
    if args.json:
        Path(args.json).write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.markdown:
        Path(args.markdown).write_text(render_markdown(data), encoding="utf-8")
    if not (args.json or args.markdown):
        sys.stdout.write(render_markdown(data))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
