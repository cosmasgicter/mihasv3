#!/usr/bin/env python3
"""Backend lock freshness check (platform-simplification task 5.3, Requirement 10.3, 10.5).

1. Copies ``requirements.in``, ``requirements-dev.in`` and both locks into a
   temporary directory and runs there the exact compile command recorded in the
   ``.in`` headers and ``tech.md`` (same image, same pip-tools pin, same file
   names). pip-compile keeps existing pins, so the diff is empty unless a ``.in``
   file changed without recompiling; new upstream releases do not fail it.
2. Fails, naming the package, when a package pinned in both locks has two
   versions (a hand-edited lock).

``--versions-only`` runs only step 2 (no Docker needed).
"""
from __future__ import annotations

import difflib
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1] / "backend"
FILES = ("requirements.in", "requirements-dev.in", "requirements.txt", "requirements-dev.txt")
PIP_TOOLS = "7.6.2"
IMAGE = "python:3.12-slim"
COMPILE = (
    f"pip install -q pip-tools=={PIP_TOOLS} && "
    "pip-compile --generate-hashes --strip-extras requirements.in && "
    "pip-compile --generate-hashes --strip-extras requirements-dev.in"
)
_PIN = re.compile(r"^([A-Za-z0-9][A-Za-z0-9._-]*)==([^\s;\\]+)", re.MULTILINE)


def pins(text: str) -> dict[str, str]:
    return {name.lower().replace("_", "-"): version for name, version in _PIN.findall(text)}


def version_conflicts(runtime: str, dev: str) -> list[str]:
    runtime_pins, dev_pins = pins(runtime), pins(dev)
    return [
        f"{name}: {runtime_pins[name]} in requirements.txt, {dev_pins[name]} in requirements-dev.txt"
        for name in sorted(set(runtime_pins) & set(dev_pins))
        if runtime_pins[name] != dev_pins[name]
    ]


def stale_locks(backend: Path = BACKEND) -> list[str]:
    problems: list[str] = []
    with tempfile.TemporaryDirectory() as tmp:
        for name in FILES:
            shutil.copy(backend / name, Path(tmp) / name)
        subprocess.run(
            ["docker", "run", "--rm", "-v", f"{tmp}:/w", "-w", "/w", IMAGE, "sh", "-c", COMPILE],
            check=True,
        )
        for lock in ("requirements.txt", "requirements-dev.txt"):
            old = (backend / lock).read_text().splitlines()
            new = (Path(tmp) / lock).read_text().splitlines()
            diff = list(difflib.unified_diff(old, new, f"committed/{lock}", f"recompiled/{lock}", lineterm=""))
            if diff:
                problems.append(f"{lock} is stale; recompile it:\n" + "\n".join(diff[:40]))
    return problems


def main(argv: list[str]) -> int:
    problems = [
        "version conflict between locks: " + c
        for c in version_conflicts(
            (BACKEND / "requirements.txt").read_text(), (BACKEND / "requirements-dev.txt").read_text()
        )
    ]
    if "--versions-only" not in argv:
        problems += stale_locks()
    for problem in problems:
        print(f"FAIL {problem}")
    if not problems:
        print("requirements locks ok")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
