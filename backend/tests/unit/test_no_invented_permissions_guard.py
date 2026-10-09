"""Grep-report guard: zero invented permissions / unsupported roles remain.

Admissions-v2 task 2.4 (AUTH-04 / R3.4): the product must remove invented
colon-permission vocabulary (``users:read``, ``admin:access`` …) and unsupported
roles (``admissions_officer``, ``registrar``, ``finance_officer``,
``academic_head``) from forms, imports, frontend constants, tokens, and code.

This executable guard is the "grep report for invented permissions" evidence:
it scans the shipped product source (backend apps + admissions frontend src,
excluding tests and migrations) and fails if any invented token remains. It is
deliberately scoped to product code — historical evidence snapshots, archived
specs, skills, and test fixtures are out of scope for the shipped-surface check.
"""

import re
from pathlib import Path

# backend/tests/unit/<file> -> parents[3] == repo root
REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_APPS = REPO_ROOT / "backend" / "apps"
FRONTEND_SRC = REPO_ROOT / "apps" / "admissions" / "src"

# Invented colon-permission vocabulary retired by task 2.4. Anchored to the
# specific resource:action combinations the fake editor / legacy override /
# token catalogue used, so ordinary code (``md:`` Tailwind prefixes, dict
# literals with a space after the colon, etc.) is not matched.
_RESOURCES = (
    "users|applications|payments|programs|documents|profile|settings|"
    "analytics|notifications|audit|student|reviewer|admin|super_admin|owner"
)
_ACTIONS = (
    "read|write|delete|create|review|verify|access|make_own|read_own|"
    "update_own|upload_own"
)
COLON_PERMISSION_RE = re.compile(rf"\b(?:{_RESOURCES}):(?:{_ACTIONS})\b")

# Unsupported roles retired by task 2.4 — canonical roles are only
# student, reviewer, admin, super_admin.
UNSUPPORTED_ROLE_RE = re.compile(
    r"\b(?:admissions_officer|registrar|finance_officer|academic_head)\b"
)


def _iter_source_files():
    for base, suffixes in ((BACKEND_APPS, (".py",)), (FRONTEND_SRC, (".ts", ".tsx"))):
        if not base.exists():
            continue
        for path in base.rglob("*"):
            if path.suffix not in suffixes:
                continue
            parts = set(path.parts)
            if "migrations" in parts or "__pycache__" in parts:
                continue
            yield path


def _scan(pattern):
    hits = []
    for path in _iter_source_files():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for lineno, line in enumerate(text.splitlines(), 1):
            if pattern.search(line):
                rel = path.relative_to(REPO_ROOT)
                hits.append(f"{rel}:{lineno}: {line.strip()[:140]}")
    return hits


def test_no_invented_colon_permissions_in_product_source():
    hits = _scan(COLON_PERMISSION_RE)
    assert not hits, (
        "Invented colon-permission vocabulary must not appear in product source "
        "(task 2.4, AUTH-04 / R3.4):\n" + "\n".join(hits)
    )


def test_no_unsupported_roles_in_product_source():
    hits = _scan(UNSUPPORTED_ROLE_RE)
    assert not hits, (
        "Unsupported role strings must not appear in product source "
        "(task 2.4, R3.4). Canonical roles: student, reviewer, admin, "
        "super_admin.\n" + "\n".join(hits)
    )
