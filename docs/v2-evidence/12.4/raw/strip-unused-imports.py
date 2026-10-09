#!/usr/bin/env python3
"""Remove dead import bindings named by `tsc --noUnusedLocals` (task 12.4).

Not a linter and not a heuristic: the *input* is the compiler's own diagnostic
list, so this script never decides whether an import is dead. It only performs
the edit the compiler already justified, and it re-runs the compiler after every
pass because removing one name can make a whole declaration unused (TS6133 →
TS6192) and because a declaration removal can shift later line numbers.

Scope is deliberately narrow:
  * TS6133 / TS6196 whose position falls inside an import declaration → drop
    that one binding from the clause.
  * TS6192 ("All imports in import declaration are unused") → drop the whole
    declaration.
  * Anything else (unused *locals*) is left alone and reported: deleting an
    unused local is a judgement call about an incomplete feature, not dead-code
    removal.

Usage:
    python3 strip-unused-imports.py <workspace-dir> [--apply]
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

DIAGNOSTIC = re.compile(r"^(.+?)\((\d+),(\d+)\): error (TS6133|TS6192|TS6196): (.*)$")
NAMED = re.compile(r"^'(?P<name>[^']+)' is declared but (its value is )?never (read|used)\.?$")


def run_tsc(workspace: Path) -> list[tuple[str, int, int, str, str]]:
    proc = subprocess.run(
        ["./node_modules/.bin/tsc", "-p", "tsconfig.build.json", "--noEmit", "--noUnusedLocals"],
        cwd=workspace,
        capture_output=True,
        text=True,
    )
    out = []
    for line in (proc.stdout + proc.stderr).splitlines():
        m = DIAGNOSTIC.match(line.strip())
        if m:
            f, ln, col, code, msg = m.groups()
            out.append((f, int(ln), int(col), code, msg))
    return out


def declaration_range(lines: list[str], at: int) -> tuple[int, int] | None:
    """1-based inclusive range of the import declaration containing line `at`."""
    start = None
    for index in range(at, 0, -1):
        stripped = lines[index - 1].lstrip()
        if stripped.startswith("import ") or stripped.startswith("import{"):
            start = index
            break
        # Boundary check only on *unindented* lines. A braced clause member reads
        # `  type AuditLogFilters,` — indented, and it starts with the word
        # `type`, so an indentation-blind check treats a perfectly ordinary
        # multi-line type import as a type *declaration* and silently declines to
        # edit it. That misfiled three real dead type imports as "unused locals"
        # on the first run.
        if lines[index - 1][:1] not in (" ", "\t") and re.match(
            r"^(export|const|let|var|function|class|type\s+\w+\s*=|interface|/\*\*)", stripped
        ):
            return None
    if start is None:
        return None
    end = start
    while end <= len(lines) and not re.search(r"from\s*['\"][^'\"]+['\"];?\s*$", lines[end - 1]):
        end += 1
        if end > start + 60:
            return None
    return (start, end) if end >= at else None


def drop_binding(text: str, name: str) -> str | None:
    """Remove one binding from an import clause, preserving everything else."""
    head, sep, tail = text.rpartition(" from ")
    if not sep:
        return None
    braced = re.search(r"\{([\s\S]*)\}", head)
    if braced:
        parts = [p for p in braced.group(1).split(",")]
        kept = []
        removed = False
        for part in parts:
            bare = part.strip()
            if not bare:
                continue
            # `type Foo` and `Foo as Bar` both bind a name that is not the raw
            # text: strip the inline `type` modifier before comparing, or every
            # dead `import { type Foo }` silently survives.
            local = re.sub(r"^type\s+", "", bare).split(" as ")[-1].strip()
            if not removed and local == name:
                removed = True
                continue
            kept.append(part)
        if removed:
            if kept:
                # Preserve the clause's own closing whitespace. Each kept `part`
                # still carries its leading newline/indent, but the *trailing*
                # whitespace belonged to the last member — which may be the one
                # just removed — so without this a multi-line clause collapses to
                # `  Users} from '…'` and a single-line one to `{ a, b} from '…'`.
                # Valid TypeScript, gratuitous diff noise.
                trailing = re.search(r"(\s*)$", braced.group(1)).group(1)
                inner = ",".join(kept).rstrip() + trailing
                new_head = head[: braced.start()] + "{" + inner + "}" + head[braced.end():]
            else:
                # Empty clause: drop the braces and any default/namespace comma.
                new_head = head[: braced.start()] + head[braced.end():]
                new_head = re.sub(r",\s*$", "", new_head.rstrip())
                if re.fullmatch(r"\s*import\s*,?\s*", new_head):
                    return ""  # nothing left to import
            return new_head + sep + tail
    # Default or namespace binding.
    clause = head[len("import"):] if head.lstrip().startswith("import") else head
    default_match = re.match(r"^\s*(?:type\s+)?(\*\s+as\s+)?(\w+)\s*(,)?", clause)
    if default_match and default_match.group(2) == name:
        rest = clause[default_match.end():]
        if not rest.strip():
            return ""
        return "import " + rest.lstrip().lstrip(",").strip() + sep + tail
    return None


def apply_once(workspace: Path, apply: bool) -> tuple[int, int, list[str]]:
    diagnostics = run_tsc(workspace)
    imports, others = [], []
    for f, ln, col, code, msg in diagnostics:
        path = workspace / f
        if not path.exists():
            continue
        lines = path.read_text().split("\n")
        rng = declaration_range(lines, ln)
        (imports if rng else others).append((path, ln, col, code, msg, rng))

    # Edit deepest-first per file so earlier ranges keep their line numbers.
    changed = 0
    by_file: dict[Path, list] = {}
    for entry in imports:
        by_file.setdefault(entry[0], []).append(entry)
    for path, entries in by_file.items():
        lines = path.read_text().split("\n")
        seen_ranges: set[tuple[int, int]] = set()
        for path_, ln, col, code, msg, rng in sorted(entries, key=lambda e: -e[1]):
            start, end = rng
            if (start, end) in seen_ranges:
                continue  # one edit per declaration per pass; the next pass sees the rest
            block = "\n".join(lines[start - 1:end])
            if code == "TS6192":
                new_block = ""
            else:
                named = NAMED.match(msg)
                if not named:
                    continue
                result = drop_binding(block, named.group("name"))
                if result is None:
                    continue
                new_block = result
            seen_ranges.add((start, end))
            replacement = [] if new_block == "" else new_block.split("\n")
            lines[start - 1:end] = replacement
            changed += 1
        if apply and changed:
            path.write_text("\n".join(lines))
    return changed, len(others), [f"{e[0]}:{e[1]} {e[3]} {e[4]}" for e in others]


def main() -> int:
    workspace = Path(sys.argv[1]).resolve()
    apply = "--apply" in sys.argv
    total = 0
    for attempt in range(1, 12):
        changed, others, other_list = apply_once(workspace, apply)
        print(f"pass {attempt}: import edits {changed}, non-import unused {others}")
        total += changed
        if changed == 0:
            for line in other_list:
                print(f"  LEFT ALONE (not an import): {line}")
            break
        if not apply:
            break
    print(f"total import edits: {total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
