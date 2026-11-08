"""R1 exploration: every documented environment variable has a reader.

Spec: student-journey-repair task 1.1, clause 1.3 (design R1-c).

A name written into a tracked template or a ``NAME=`` line of a fenced block in
``LOCAL-TESTING.md`` promises that something reads it. At HEAD several names have
no reader (``USE_LOCAL_FILE_STORAGE``, ``CELERY_TASK_ALWAYS_EAGER``, the IMAP
variables that ``tech.md`` says are unused) and the local-test stack has no
tracked template at all. This scanner fails until each documented name is read
or listed in ``ALLOWLIST`` with a reason.

A name counts as read when:
  * its quoted form appears in ``backend/**/*.py`` outside ``tests/``; or
  * it appears as ``${NAME``, ``$NAME``, ``NAME:`` or ``NAME=`` (a build arg) in ``backend/docker-compose*.yml``,
    ``backend/Dockerfile``, ``deploy/**``, ``harness/**`` or ``.github/workflows/**``; or
  * (``VITE_*`` names only) it appears in the admissions app's source or config,
    where the Vite build reads it.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND = REPO_ROOT / "backend"

# The tracked templates whose names this test governs. ``.env.scripts.example``
# is the e2e scripts' template (``E2E_*`` / ``TEST_*``, read by Node scripts) and
# ``apps/admissions/.env.example`` is the SPA's; neither documents the backend.
TEMPLATES = (
    REPO_ROOT / ".env.example",
    BACKEND / ".env.example",
    BACKEND / ".env.local.test.example",
    REPO_ROOT / "deploy" / ".env.prod.example",
)
LOCAL_TESTING_DOC = REPO_ROOT / "LOCAL-TESTING.md"

# name -> reason. A name belongs here only when something other than backend
# Python reads it, or the steering records it as a planned placeholder.
ALLOWLIST: dict[str, str] = {
    "POSTGRES_DB": "read by the postgres image",
    "POSTGRES_USER": "read by the postgres image",
    "POSTGRES_PASSWORD": "read by the postgres image",
    "TELEGRAM_BOT_TOKEN": "planned placeholder: tech.md 'Telegram planned placeholder'",
    "TELEGRAM_WEBHOOK_SECRET": "planned placeholder: tech.md 'Telegram planned placeholder'",
}

_NAME = r"[A-Z][A-Z0-9_]{2,}"
_TEMPLATE_LINE = re.compile(rf"^\s*#?\s*({_NAME})=", re.MULTILINE)
_FENCE_LINE = re.compile(rf"^({_NAME})=", re.MULTILINE)


def _documented_names() -> dict[str, list[str]]:
    """Return ``name -> [source labels]`` for every documented variable."""
    found: dict[str, list[str]] = {}
    for template in TEMPLATES:
        if not template.exists():
            continue
        for match in _TEMPLATE_LINE.finditer(template.read_text(encoding="utf-8")):
            found.setdefault(match.group(1), []).append(str(template.relative_to(REPO_ROOT)))
    if LOCAL_TESTING_DOC.exists():
        in_fence = False
        block: list[str] = []
        for line in LOCAL_TESTING_DOC.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("```"):
                if in_fence:
                    for match in _FENCE_LINE.finditer("\n".join(block)):
                        found.setdefault(match.group(1), []).append("LOCAL-TESTING.md")
                    block = []
                in_fence = not in_fence
                continue
            if in_fence:
                block.append(line)
    return found


def _read_text_safely(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def _python_sources() -> str:
    parts = []
    for path in BACKEND.rglob("*.py"):
        relative = path.relative_to(BACKEND).parts
        if "tests" in relative or "venv" in relative or ".venv" in relative or "node_modules" in relative:
            continue
        parts.append(_read_text_safely(path))
    return "\n".join(parts)


def _infrastructure_sources() -> str:
    parts = []
    for pattern, root in (
        ("docker-compose*.yml", BACKEND),
        ("Dockerfile", BACKEND),
        ("*", REPO_ROOT / "deploy"),
        ("*", REPO_ROOT / "harness"),
        ("*", REPO_ROOT / ".github" / "workflows"),
    ):
        if not root.exists():
            continue
        for path in root.rglob(pattern) if pattern == "*" else root.glob(pattern):
            if path.is_file() and path.name != ".env.prod.example":
                parts.append(_read_text_safely(path))
    return "\n".join(parts)


def _frontend_sources() -> str:
    parts = []
    admissions = REPO_ROOT / "apps" / "admissions"
    for path in list(admissions.glob("*.ts")) + list(admissions.glob("*.js")) + list((admissions / "src").rglob("*.ts*")):
        parts.append(_read_text_safely(path))
    return "\n".join(parts)


def _is_read(name: str, python: str, infra: str, frontend: str) -> bool:
    if f'"{name}"' in python or f"'{name}'" in python:
        return True
    if re.search(rf"(\$\{{{name}\b|\${name}\b|\b{name}[:=])", infra):
        return True
    if name.startswith("VITE_") and name in frontend:
        return True
    return False


@pytest.mark.xfail(strict=True, reason="SJR R1: fixed in task 3.3")
def test_local_test_stack_has_a_tracked_template():
    """The isolated stack's env file is gitignored with no template (Bring-up 1)."""
    template = BACKEND / ".env.local.test.example"
    assert template.exists(), (
        "backend/.env.local.test.example is missing: a developer cannot start the "
        "documented local-test stack without guessing its variables"
    )


@pytest.mark.xfail(strict=True, reason="SJR R1: fixed in task 3.3")
def test_every_documented_variable_is_read_or_allowlisted():
    python, infra, frontend = _python_sources(), _infrastructure_sources(), _frontend_sources()
    documented = _documented_names()
    unread = sorted(
        (name, sources)
        for name, sources in documented.items()
        if name not in ALLOWLIST and not _is_read(name, python, infra, frontend)
    )
    assert not unread, "documented but never read: " + "; ".join(
        f"{name} ({', '.join(sorted(set(sources)))})" for name, sources in unread
    )


def test_allowlist_entries_carry_reasons():
    """Guards the guard: an allowlist entry without a reason is a silent skip."""
    assert all(reason.strip() for reason in ALLOWLIST.values())
