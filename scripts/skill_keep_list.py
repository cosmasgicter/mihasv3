#!/usr/bin/env python3
"""Skill keep-list builder (platform-simplification task 8.2, Requirement 4.6, D6).

Analysis only; it deletes nothing. It lists every skill under ``.kiro/skills/``
and ``.agents/skills/`` that a source named in design section 4 refers to, adds
the skills the spec asks to keep regardless, and for each kept skill records
where its one real copy lives (a ``.kiro/skills/`` directory, or the
``.agents/skills/`` target of a ``.kiro/skills/`` symlink).

Archived specs and this spec's own text are not sources (see EXCLUDED_SOURCE_PREFIXES).
A name counts as referenced when a source writes it as a path
(``skills/<name>``), in backticks or in bold. A bare word such as ``seo`` or
``performance`` is not a reference.

Usage (repository root, standard library only):
    python3 scripts/skill_keep_list.py [--json out.json]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]

# Design section 4: the three design skills, the four engineering skills the
# steering names, and the skills the authoring workflow of this spec used.
ALWAYS_KEEP = {
    "impeccable": "design skill (design-skills.md)",
    "ui-ux-pro-max": "design skill (design-skills.md)",
    "design-for-ai": "design skill (design-skills.md)",
    "a11y-audit": "spec authoring workflow; needed by P2 tasks",
    "spec-driven-workflow": "spec authoring workflow",
    "senior-architect": "spec authoring workflow",
    "tech-debt-tracker": "spec authoring workflow",
    "copywriting": "spec authoring workflow",
    "content-humanizer": "spec authoring workflow",
    "copy-editing": "spec authoring workflow",
}

SOURCE_GLOBS = [
    ".kiro/steering/*",
    ".agents/AGENTS.md",
    "PRODUCT.md",
    "DESIGN.md",
    ".kiro/hooks/*",
    ".kiro/settings/*",
    ".kiro/specs/*/tasks.md",
    ".kiro/specs/*/design.md",
]


def skill_dirs(repo: Path) -> dict[str, dict]:
    """name -> where the entry and its real copy live."""
    found: dict[str, dict] = {}
    kiro = repo / ".kiro" / "skills"
    for entry in sorted(kiro.iterdir()):
        if entry.name.startswith(".") or entry.is_file():
            continue
        if entry.is_symlink():
            target = (entry.parent / __import__("os").readlink(entry)).resolve()
            ok = target.exists()
            found[entry.name] = {
                "entry": f".kiro/skills/{entry.name}",
                "kind": "symlink",
                "real_copy": str(target.relative_to(repo)) if ok else None,
                "dangling": not ok,
            }
        else:
            found[entry.name] = {
                "entry": f".kiro/skills/{entry.name}",
                "kind": "directory",
                "real_copy": f".kiro/skills/{entry.name}",
                "dangling": False,
            }
    agents = repo / ".agents" / "skills"
    if agents.is_dir():
        for entry in sorted(agents.iterdir()):
            if entry.is_dir() and entry.name not in found:
                found[entry.name] = {
                    "entry": None,
                    "kind": "agents-only",
                    "real_copy": f".agents/skills/{entry.name}",
                    "dangling": False,
                }
    return found


# This spec describes the skills it prunes (including the dangling links), so its
# own text is not a reason to keep one. Archived specs are not live.
EXCLUDED_SOURCE_PREFIXES = (
    ".kiro/specs/_archived/",
    ".kiro/specs/platform-simplification-and-polish/",
)


def tracked_sources(repo: Path) -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "--", *SOURCE_GLOBS], cwd=repo, capture_output=True, text=True
    ).stdout.split()
    return sorted(p for p in out if not p.startswith(EXCLUDED_SOURCE_PREFIXES))


def references(names: list[str], sources: list[str], repo: Path) -> dict[str, list[str]]:
    refs: dict[str, set[str]] = {n: set() for n in names}
    for src in sources:
        try:
            text = (repo / src).read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for name in names:
            pat = re.compile(
                rf"skills/{re.escape(name)}(?![A-Za-z0-9_-])|`{re.escape(name)}`|\*\*{re.escape(name)}\*\*"
            )
            if pat.search(text):
                refs[name].add(src)
    return {n: sorted(s) for n, s in refs.items() if s}


def build(repo: Path = REPO) -> dict:
    skills = skill_dirs(repo)
    refs = references(sorted(skills), tracked_sources(repo), repo)
    keep: dict[str, dict] = {}
    for name in sorted(skills):
        reasons = []
        if name in refs:
            reasons.append("referenced by " + ", ".join(refs[name]))
        if name in ALWAYS_KEEP:
            reasons.append(ALWAYS_KEEP[name])
        if reasons and not skills[name]["dangling"]:
            keep[name] = {**skills[name], "reasons": reasons}
    missing = sorted(set(ALWAYS_KEEP) - set(skills))
    return {
        "keep": keep,
        "always_keep_missing_from_tree": missing,
        "dangling_symlinks": sorted(n for n, s in skills.items() if s["dangling"]),
        "symlink_targets_not_kept": sorted(
            s["real_copy"] for n, s in skills.items()
            if s["kind"] == "symlink" and not s["dangling"] and n not in keep
        ),
        "second_real_copies": sorted(
            f".agents/skills/{n}" for n, s in skills.items()
            if s["kind"] == "directory" and (repo / ".agents" / "skills" / n).is_dir()
        ),
        "agents_only": sorted(n for n, s in skills.items() if s["kind"] == "agents-only"),
        "total_entries": len(skills),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--json")
    args = parser.parse_args(argv)
    data = build()
    text = json.dumps(data, indent=2, sort_keys=True) + "\n"
    if args.json:
        Path(args.json).write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
