#!/usr/bin/env python3
"""Backend image package check (platform-simplification task 5.2, Requirement 10.2).

Runs INSIDE the built backend image (stdlib only) and exits non-zero, naming each
offender, when:

* a test-only module is importable (``pytest``, ``pytest_django``, ``xdist``,
  ``pytest_timeout``, ``hypothesis``, ``factory``, ``freezegun``, ``fakeredis``);
* a distribution that ``requirements.in`` names is not installed;
* ``cryptography.fernet`` does not import (``apps/common/audit_network.py`` needs it).

Usage (CI builds the image first)::

    docker run --rm -v "$PWD/scripts/check_backend_image.py:/check.py:ro" IMAGE \
        python /check.py /app/requirements.in
"""
from __future__ import annotations

import importlib
import importlib.metadata
import importlib.util
import re
import sys
from pathlib import Path

TEST_ONLY_MODULES = (
    "pytest",
    "pytest_django",
    "xdist",
    "pytest_timeout",
    "hypothesis",
    "factory",
    "freezegun",
    "fakeredis",
)

_NAME = re.compile(r"^\s*([A-Za-z0-9][A-Za-z0-9._-]*)")


def parse_requirement_names(text: str) -> list[str]:
    """Distribution names in a ``.in`` file, extras, specifiers and markers removed."""
    names: list[str] = []
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].split(";", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        match = _NAME.match(line)
        if match:
            names.append(match.group(1))
    return names


def find_problems(requirements_in: str) -> list[str]:
    problems: list[str] = []
    for module in TEST_ONLY_MODULES:
        if importlib.util.find_spec(module) is not None:
            problems.append(f"test-only module importable in the image: {module}")
    for name in parse_requirement_names(requirements_in):
        try:
            importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            problems.append(f"runtime package named in requirements.in is not installed: {name}")
    try:
        importlib.import_module("cryptography.fernet")
    except Exception as exc:  # noqa: BLE001 - any import failure is a finding
        problems.append(f"cryptography.fernet does not import: {type(exc).__name__}")
    return problems


def main(argv: list[str]) -> int:
    path = Path(argv[1] if len(argv) > 1 else "/app/requirements.in")
    problems = find_problems(path.read_text())
    for problem in problems:
        print(f"FAIL {problem}")
    if problems:
        return 1
    print("backend image check ok")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
