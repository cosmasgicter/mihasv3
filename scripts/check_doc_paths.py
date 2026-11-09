#!/usr/bin/env python3
"""Doc-path and skill-path check (platform-simplification task 3.3, Requirements 6.2, 4.7).

Steering, agent instructions and the top-level docs are loaded on every task, so
a path they name that does not exist sends an agent to nothing. This check
fails, naming the file and the path, when one does.

Scanned files: the steering files, ``.agents/AGENTS.md``, ``PRODUCT.md``,
``DESIGN.md``, ``LOCAL-TESTING.md`` and ``README.md``. For ``.kiro/skills/<name>``
paths only, it also reads ``.kiro/hooks/*`` and every live spec's ``tasks.md``.

Candidates are backticked tokens and Markdown link targets that

* do not start with ``/`` (API routes), ``http``, ``~`` or ``@`` (npm scopes,
  the ``@/`` import alias);
* contain none of ``* ? { } < > … ... ://`` or whitespace;
* are not a Tailwind opacity utility such as ``bg-primary/50``;
* and contain ``/`` or end in a known file extension.

Before resolution a candidate loses a leading ``./``, a ``:<line>`` or
``:<symbol>`` suffix after a file extension, a ``::<test>`` suffix, a ``#anchor``
and trailing punctuation.

Resolution is against the tracked tree (``git ls-files``), because CI checks out
only tracked files. A candidate with ``/`` is valid if it names a tracked file,
or a directory holding one, relative to the repository root, ``backend/``,
``apps/admissions/``, ``apps/admissions/src/``, ``apps/jobs-ops/`` or
``apps/jobs-ops/src/``. A bare file name is valid if any tracked file has that
name. A path ``git check-ignore --no-index`` reports as ignored is valid too,
because it is local-only by design (``backend/.env``).

``scripts/doc-paths-allowlist.json`` holds ``{file, path, reason}`` for names
that are absent on purpose. An entry is stale, and fails, when the path now
resolves or the file no longer names it, so the list can only shrink.

Skill links (Requirement 4.7): every mode-120000 entry under ``.kiro/skills/``
and ``.agents/skills/`` must resolve, and every ``path`` in
``.agents/skills.json`` must name a directory relative to ``.agents/`` or the
repository root. Known dangling items live in ``scripts/skill-paths-baseline.json``
(``{path, reason, decision?}``); a stale baseline entry fails too.

Usage (from the repository root): ``python3 scripts/check_doc_paths.py``
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

REPO_ROOT = Path(__file__).resolve().parents[1]
ALLOWLIST_FILE = "scripts/doc-paths-allowlist.json"
SKILL_BASELINE_FILE = "scripts/skill-paths-baseline.json"

DOC_FILES = (
    ".agents/AGENTS.md",
    "PRODUCT.md",
    "DESIGN.md",
    "LOCAL-TESTING.md",
    "README.md",
)
ROOTS = (
    "",
    "backend/",
    "apps/admissions/",
    "apps/admissions/src/",
    "apps/jobs-ops/",
    "apps/jobs-ops/src/",
)
KNOWN_EXTENSIONS = {
    "md", "py", "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "yml", "yaml", "sql",
    "sh", "css", "html", "txt", "toml", "ini", "lock", "csv", "cfg", "svg", "png",
    "jpg", "jpeg", "webp", "ttf", "woff", "woff2", "conf", "example", "pem",
}
_FORBIDDEN = ("*", "?", "{", "}", "<", ">", "…", "...", "://")
_BACKTICK = re.compile(r"`([^`\n]+)`")
_LINK = re.compile(r"\]\(([^)\s]+)\)")
_TAILWIND_OPACITY = re.compile(r"^[a-z][a-z0-9-]*(?:-[a-z0-9]+)*/\d{1,3}$")
_SKILL_PATH = re.compile(r"\.kiro/skills/[A-Za-z0-9_.\-]+")
_SUFFIX = re.compile(r"(\.(?:%s))(?::[A-Za-z0-9_\-]+(?:::.*)?|::.*)$" % "|".join(sorted(KNOWN_EXTENSIONS)))


@dataclass(frozen=True)
class Finding:
    file: str
    path: str
    problem: str

    def __str__(self) -> str:
        return f"{self.file}: {self.path} ({self.problem})"


# --------------------------------------------------------------------------- #
# Candidates
# --------------------------------------------------------------------------- #
def normalise(token: str) -> str:
    """Strip the decorations a path carries in prose (see the module docstring)."""
    text = token.strip()
    text = text.split("#", 1)[0]
    if text.startswith("./"):
        text = text[2:]
    text = _SUFFIX.sub(r"\1", text)
    return text.rstrip(".,;:)]")


def is_candidate(token: str) -> bool:
    if not token or token[0] in "/~@" or token.startswith("http"):
        return False
    if any(c.isspace() for c in token) or any(f in token for f in _FORBIDDEN):
        return False
    if _TAILWIND_OPACITY.match(token):
        return False
    text = normalise(token)
    if not text:
        return False
    if "/" in text:
        return True
    if text.startswith(".") and text.count(".") == 1:
        return False  # an extension on its own (".pem"), not a file
    ext = text.rsplit(".", 1)[-1] if "." in text else ""
    return ext in KNOWN_EXTENSIONS


def extract_candidates(markdown: str) -> list[str]:
    """Normalised candidate paths in first-seen order, duplicates removed."""
    seen: dict[str, None] = {}
    for pattern in (_BACKTICK, _LINK):
        for match in pattern.finditer(markdown):
            raw = match.group(1)
            # A raw token with a trailing ":" or "." is prose punctuation inside the backticks.
            if is_candidate(raw.strip()):
                text = normalise(raw)
                if text:
                    # Keep a directory's trailing slash: it is what tells
                    # "src/" (a directory) from "src" (a word).
                    seen.setdefault(text + "/" if raw.strip().endswith("/") and not text.endswith("/") else text, None)
    return list(seen)


# --------------------------------------------------------------------------- #
# Resolution
# --------------------------------------------------------------------------- #
class Tree:
    """The tracked tree, with the lookups the rules need."""

    def __init__(self, tracked: Iterable[str], repo_root: Path = REPO_ROOT):
        self.repo_root = repo_root
        self.files = set(tracked)
        self.basenames = {f.rsplit("/", 1)[-1] for f in self.files}
        self.dirs: set[str] = set()
        for f in self.files:
            parts = f.split("/")
            for i in range(1, len(parts)):
                self.dirs.add("/".join(parts[:i]))

    def names(self, rel: str) -> bool:
        rel = rel.rstrip("/")
        return bool(rel) and (rel in self.files or rel in self.dirs)

    def resolves(self, candidate: str) -> bool:
        text = candidate.rstrip("/")
        if "/" not in candidate:  # a bare file name: any tracked file with that name
            return text in self.basenames
        return any(self.names(root + text) for root in ROOTS)

    def ignored(self, candidate: str) -> bool:
        paths = [(root + candidate).rstrip("/") for root in ROOTS]
        try:
            out = subprocess.run(
                ["git", "check-ignore", "--no-index", "--stdin"],
                input="\n".join(paths),
                cwd=self.repo_root,
                capture_output=True,
                text=True,
                check=False,
            ).stdout
        except OSError:
            return False
        return bool(out.strip())


def tracked_files(repo_root: Path = REPO_ROOT) -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "-z"], cwd=repo_root, capture_output=True, check=True
    ).stdout.decode("utf-8")
    return [p for p in out.split("\0") if p]


def scanned_files(tree: Tree) -> tuple[list[str], list[str]]:
    """``(full_scan, skill_only_scan)`` as repo-relative paths that are tracked."""
    full = [f for f in tree.files if f.startswith(".kiro/steering/") and f.endswith(".md")]
    full += [f for f in DOC_FILES if f in tree.files]
    skill_only = [f for f in tree.files if f.startswith(".kiro/hooks/")]
    skill_only += [
        f
        for f in tree.files
        if re.fullmatch(r"\.kiro/specs/(?!_archived/)[^/]+/tasks\.md", f)
    ]
    return sorted(set(full)), sorted(set(skill_only))


# --------------------------------------------------------------------------- #
# Checks
# --------------------------------------------------------------------------- #
def skill_path_exists(repo_root: Path, path: str) -> bool:
    return (repo_root / path.rstrip("/")).exists()  # follows symlinks: a dangling link is False


def check_docs(
    tree: Tree,
    read,
    allowlist: list[dict],
    full_files: list[str],
    skill_files: list[str],
) -> tuple[list[Finding], list[str]]:
    findings: list[Finding] = []
    problems: list[str] = []
    allowed: dict[tuple[str, str], dict] = {}
    for entry in allowlist:
        if not (isinstance(entry, dict) and all(isinstance(entry.get(k), str) and entry[k].strip() for k in ("file", "path", "reason"))):
            problems.append(f"allowlist entry needs file, path and a non-empty reason: {entry!r}")
            continue
        allowed[(entry["file"], entry["path"])] = entry
    used: set[tuple[str, str]] = set()

    for rel in full_files:
        for candidate in extract_candidates(read(rel)):
            ok = tree.resolves(candidate) or tree.ignored(candidate)
            if _SKILL_PATH.fullmatch(candidate.rstrip("/")) is not None:
                ok = ok or skill_path_exists(tree.repo_root, candidate)
            key = (rel, candidate)
            if key in allowed:
                used.add(key)
                if ok:
                    problems.append(f"stale allowlist entry, the path now exists: {rel}: {candidate}")
                continue
            if not ok:
                findings.append(Finding(rel, candidate, "path does not exist"))
    for rel in skill_files:
        for match in _SKILL_PATH.finditer(read(rel)):
            path = match.group(0)
            if not skill_path_exists(tree.repo_root, path):
                findings.append(Finding(rel, path, "skill path does not exist"))
    for key in allowed:
        if key not in used and key[0] in full_files:
            problems.append(f"stale allowlist entry, {key[0]} no longer names {key[1]}")
        elif key[0] not in full_files:
            problems.append(f"stale allowlist entry, {key[0]} is not a scanned file")
    return findings, problems


def list_symlink_entries(repo_root: Path) -> list[str]:
    out = subprocess.run(
        ["git", "ls-files", "-s", ".kiro/skills", ".agents/skills"],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    entries = []
    for line in out.splitlines():
        meta, _, path = line.partition("\t")
        if meta.startswith("120000"):
            entries.append(path)
    return entries


def check_skill_links(
    repo_root: Path, symlinks: list[str], manifest: dict | list | None, baseline: list[dict]
) -> tuple[list[Finding], list[str]]:
    findings: list[Finding] = []
    problems: list[str] = []
    based: dict[str, dict] = {}
    for entry in baseline:
        if not (isinstance(entry, dict) and all(isinstance(entry.get(k), str) and entry[k].strip() for k in ("path", "reason"))):
            problems.append(f"skill baseline entry needs a path and a non-empty reason: {entry!r}")
            continue
        based[entry["path"]] = entry

    dangling: set[str] = set()
    for link in symlinks:
        if not (repo_root / link).exists():
            dangling.add(link)
    manifest_entries = []
    if manifest is not None:
        manifest_entries = manifest["entries"] if isinstance(manifest, dict) else manifest
    for entry in manifest_entries:
        value = entry.get("path") if isinstance(entry, dict) else None
        if not isinstance(value, str) or not value:
            findings.append(Finding(".agents/skills.json", repr(entry), "entry has no path"))
            continue
        ok = (repo_root / ".agents" / value).is_dir() or (repo_root / value).is_dir()
        if not ok:
            dangling.add(f".agents/skills.json::{value}")

    for item in sorted(dangling):
        if item in based:
            continue
        label = item.split("::", 1)[1] if "::" in item else item
        where = ".agents/skills.json" if "::" in item else "symlink"
        findings.append(Finding(where, label, "does not resolve"))
    for path in based:
        if path not in dangling:
            problems.append(f"stale skill baseline entry, it now resolves or is gone: {path}")
    return findings, problems


def _load_entries(path: Path) -> list[dict]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return data["entries"] if isinstance(data, dict) else data


def run(repo_root: Path = REPO_ROOT) -> tuple[list[Finding], list[str]]:
    tree = Tree(tracked_files(repo_root), repo_root)
    full_files, skill_files = scanned_files(tree)

    def read(rel: str) -> str:
        return (repo_root / rel).read_text(encoding="utf-8", errors="replace")

    findings, problems = check_docs(
        tree, read, _load_entries(repo_root / ALLOWLIST_FILE), full_files, skill_files
    )
    manifest_path = repo_root / ".agents/skills.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else None
    more_findings, more_problems = check_skill_links(
        repo_root,
        list_symlink_entries(repo_root),
        manifest,
        _load_entries(repo_root / SKILL_BASELINE_FILE),
    )
    return findings + more_findings, problems + more_problems


def main(argv: list[str] | None = None) -> int:
    findings, problems = run()
    for finding in findings:
        print(f"ERROR {finding}")
    for problem in problems:
        print(f"ERROR {problem}")
    if findings or problems:
        print(f"\n{len(findings)} missing path(s), {len(problems)} list problem(s)")
        return 1
    print("doc paths ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
