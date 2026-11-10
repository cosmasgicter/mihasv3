#!/usr/bin/env python3
"""List, and optionally annotate, references to untracked raw evidence artefacts.

Task 11.3 (requirement 4.1, 4.9). The raw artefact types a run produces are untracked
under ``docs/v2-evidence/`` (they stay in git history). Every tracked Markdown file
that names one of them, as a link target or as a backticked path (glob patterns such as
``raw/*.txt`` included), gets one dated line pointing at the commit that still holds
the files.

    python3 scripts/evidence_refs.py --base <sha>            # list references
    python3 scripts/evidence_refs.py --base <sha> --annotate \
        --date 2026-11-09 --permalink-base <https://github.com/org/repo/tree/<sha>>

The set of raw files is read from ``git ls-tree`` at ``--base``, so the script gives
the same answer before and after ``git rm --cached``. Files under ``.kiro/specs/``
are listed and never edited (requirement 22.11).
"""
from __future__ import annotations

import argparse
import fnmatch
import posixpath
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
EVIDENCE_ROOT = "docs/v2-evidence"
RAW_SUFFIXES = (
    ".zip", ".png", ".txt", ".log", ".jsonl", ".err", ".exit", ".xml", ".html", ".js",
    ".css", ".ttf", ".svg", ".webmanifest", ".before", ".after",
)
NOTE_MARKER = "Raw evidence artefacts were removed from the tree on"
NEVER_EDIT_PREFIXES = (".kiro/specs/",)
# A path inside backticks or a Markdown link target.
TOKEN_RE = re.compile(r"`([^`\n]+)`|\]\(([^)\s]+)\)")


def is_raw(path: str) -> bool:
    return path.startswith(EVIDENCE_ROOT + "/") and path.endswith(RAW_SUFFIXES)


def git(*args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(REPO_ROOT), *args], check=True, capture_output=True, text=True
    ).stdout


def raw_files_at(base: str) -> set[str]:
    out = subprocess.run(
        ["git", "-C", str(REPO_ROOT), "ls-tree", "-r", "-z", "--name-only", base, "--", EVIDENCE_ROOT],
        check=True, capture_output=True,
    ).stdout.decode("utf-8", "surrogateescape")
    return {p for p in out.split("\0") if p and is_raw(p)}


def tracked_markdown() -> list[str]:
    out = git("ls-files", "-z", "--", "*.md")
    return [p for p in out.split("\0") if p]


def candidates(token: str, md_path: str) -> list[str]:
    """Repo-relative spellings a token could mean: as written, or relative to the file."""
    token = token.split("#", 1)[0].strip()
    if not token or token.startswith(("http://", "https://", "mailto:")):
        return []
    token = token.lstrip("/") if token.startswith("/") else token
    out = [posixpath.normpath(token)]
    out.append(posixpath.normpath(posixpath.join(posixpath.dirname(md_path), token)))
    # Absolute checkout paths written in docs: keep what follows the evidence root.
    if EVIDENCE_ROOT in token:
        out.append(EVIDENCE_ROOT + token.split(EVIDENCE_ROOT, 1)[1])
    return out


def references(md_path: str, text: str, raw: set[str]) -> list[str]:
    found: list[str] = []
    for m in TOKEN_RE.finditer(text):
        token = m.group(1) or m.group(2)
        for cand in candidates(token, md_path):
            if not cand.startswith(EVIDENCE_ROOT + "/") and EVIDENCE_ROOT not in cand:
                continue
            if cand in raw or (any(ch in cand for ch in "*?[") and any(fnmatch.fnmatch(r, cand) for r in raw)):
                found.append(token)
                break
    return found


def scan(base: str) -> dict[str, list[str]]:
    raw = raw_files_at(base)
    result: dict[str, list[str]] = {}
    for md in tracked_markdown():
        try:
            text = (REPO_ROOT / md).read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        refs = references(md, text, raw)
        if refs:
            result[md] = refs
    return result


def note_line(date: str, sha: str, permalink_base: str) -> str:
    return (
        f"> {NOTE_MARKER} {date}; they remain in git history at commit `{sha}`. "
        f"Paths named below that point at them resolve at {permalink_base}.\n"
    )


def annotate(md_path: str, line: str) -> bool:
    path = REPO_ROOT / md_path
    text = path.read_text(encoding="utf-8")
    if NOTE_MARKER in text:
        return False
    lines = text.splitlines(keepends=True)
    # Put the note under the first heading if there is one, otherwise at the top.
    for i, ln in enumerate(lines):
        if ln.startswith("#"):
            lines[i + 1:i + 1] = ["\n", line]
            break
    else:
        lines[0:0] = [line, "\n"]
    path.write_text("".join(lines), encoding="utf-8")
    return True


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--base", required=True, help="commit that still tracks the raw files")
    ap.add_argument("--annotate", action="store_true")
    ap.add_argument("--date")
    ap.add_argument("--permalink-base")
    args = ap.parse_args(argv)
    sha = git("rev-parse", args.base).strip()
    refs = scan(sha)
    protected = sorted(p for p in refs if p.startswith(NEVER_EDIT_PREFIXES))
    editable = sorted(p for p in refs if p not in protected)
    for p in editable:
        print(f"{p}: {len(refs[p])} reference(s)")
    for p in protected:
        print(f"{p}: {len(refs[p])} reference(s) (not edited: spec file)")
    print(f"{len(editable)} editable file(s), {len(protected)} protected file(s)")
    if args.annotate:
        if not (args.date and args.permalink_base):
            ap.error("--annotate needs --date and --permalink-base")
        line = note_line(args.date, sha[:12], f"{args.permalink_base.rstrip('/')}/{EVIDENCE_ROOT}")
        changed = sum(annotate(p, line) for p in editable)
        print(f"annotated {changed} file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
