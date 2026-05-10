"""Regression test — PaymentService is the sole writer of ``payments.status``.

This test is the static-analysis complement to ``_transition()`` in
``apps/documents/payment_service.py``. It walks every Python module under
``backend/apps/`` (excluding the canonical payment service itself) and
greps for the three patterns that would indicate another module is
mutating payment status out of band:

* ``UPDATE payments SET status`` — raw SQL status writes (any case).
* ``Payment.objects.<…>.update(status=…)`` — bulk ORM status writes.
* ``<var>.status = '…'`` followed within a few lines by ``.save(``
  — direct ORM attribute writes on a ``Payment`` model instance.

If any offending pattern is found, the test fails with a descriptive
message listing every file, line, and match so the offending call site
can be routed through ``PaymentService._transition()``.

TDD note: this test is written BEFORE the Task 11 refactor lands. It is
expected to FAIL on the current tree because
``apps/documents/views.py`` (dev-bypass path) and
``apps/documents/tasks.py`` (reconciliation expiry) still mutate
``Payment.status`` directly. Task 11 moves both call sites into
``_transition()``; at that point this guard turns green.

Uses pure file I/O — no Django DB fixture, no models loaded.

Validates: Requirements R1.7
"""

from __future__ import annotations

import re
from pathlib import Path


# ---------------------------------------------------------------------------
# Paths and exclusions
# ---------------------------------------------------------------------------

# backend/tests/unit/test_payment_service_sole_authority.py
#   .parents[0] -> backend/tests/unit
#   .parents[1] -> backend/tests
#   .parents[2] -> backend/
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_APPS_ROOT = _BACKEND_ROOT / "apps"

# The one module that is ALLOWED to mutate payments.status directly. Every
# other module must delegate to PaymentService._transition(...).
_ALLOWED_FILES = {
    (_APPS_ROOT / "documents" / "payment_service.py").resolve(),
}

# Directories we skip entirely (caches, compiled bytecode, etc.).
_SKIP_DIR_NAMES = {"__pycache__", "migrations"}


# ---------------------------------------------------------------------------
# Patterns — must match what the spec's R1.7 grep guard forbids.
# ---------------------------------------------------------------------------

# 1) Raw SQL: ``UPDATE payments SET status`` in any case, with arbitrary
#    whitespace between tokens. Case-insensitive.
_RAW_SQL_PATTERN = re.compile(
    r"UPDATE\s+payments\s+SET\s+status",
    re.IGNORECASE,
)

# 2) Bulk ORM queryset update: ``Payment.objects.<qs>.update(status=`` —
#    tolerates chained queryset methods between ``objects`` and ``update``.
_BULK_ORM_PATTERN = re.compile(
    r"Payment\.objects\.[^(]*\.update\(\s*status\s*=",
)

# 3) Direct attribute write on a Payment-shaped variable. We match any
#    ``<identifier>.status = 'literal'`` or ``.status = "literal"`` line
#    whose literal is one of the canonical payment status strings, and then
#    require that a ``.save(`` call appears within the next 5 non-blank
#    lines of the same file. This yields a high-signal match without
#    tripping on unrelated ``.status`` fields (applications, etc.).
_CANONICAL_STATUSES = (
    "pending",
    "deferred",
    "successful",
    "failed",
    "expired",
    "force_approved",
    "paid",  # legacy label still used in some webhook data paths
)
_STATUS_LITERAL = "|".join(_CANONICAL_STATUSES)
_ATTR_WRITE_PATTERN = re.compile(
    rf"""(?P<var>[A-Za-z_][A-Za-z_0-9]*)\.status\s*=\s*['"](?:{_STATUS_LITERAL})['"]"""
)
_SAVE_PATTERN = re.compile(r"\.save\s*\(")

# Maximum number of subsequent lines to scan for ``.save(`` after an
# attribute-write line. Five lines is enough for the common
# ``obj.status = 'x'; obj.updated_at = now(); obj.save(...)`` idiom.
_SAVE_LOOKAHEAD_LINES = 8


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _iter_py_files(root: Path):
    """Yield every ``*.py`` file under ``root`` excluding the cache dirs."""
    for path in root.rglob("*.py"):
        if any(part in _SKIP_DIR_NAMES for part in path.parts):
            continue
        yield path.resolve()


def _read_lines(path: Path) -> list[str]:
    """Read file as UTF-8 with fallback, returning a list of lines."""
    try:
        return path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace").splitlines()


def _scan_file_for_hits(path: Path) -> list[tuple[str, int, str]]:
    """Return a list of ``(pattern_name, line_no, matching_line)`` hits.

    Line numbers are 1-indexed to match editor expectations.
    """
    hits: list[tuple[str, int, str]] = []
    lines = _read_lines(path)

    # Pattern 1 and 2 — single-line matches.
    for idx, line in enumerate(lines, start=1):
        if _RAW_SQL_PATTERN.search(line):
            hits.append(("UPDATE payments SET status", idx, line.strip()))
        if _BULK_ORM_PATTERN.search(line):
            hits.append(("Payment.objects.*.update(status=", idx, line.strip()))

    # Pattern 3 — attribute write followed by a .save() within N lines.
    for idx, line in enumerate(lines, start=1):
        m = _ATTR_WRITE_PATTERN.search(line)
        if not m:
            continue
        # Ignore writes inside string/docstring literals by a simple heuristic:
        # require that the line is not obviously a string (crude check).
        # The pattern itself requires ``<var>.status = 'literal'`` with no
        # leading ``#`` comment marker outside the regex match position.
        before_match = line[: m.start()]
        if "#" in before_match and before_match.rstrip().endswith("#"):
            continue
        # Look ahead for a .save( call.
        end = min(len(lines), idx + _SAVE_LOOKAHEAD_LINES)
        found_save = any(
            _SAVE_PATTERN.search(lines[j]) for j in range(idx, end)
        )
        if found_save:
            hits.append(
                (
                    "<var>.status = '…' followed by .save(",
                    idx,
                    line.strip(),
                )
            )

    return hits


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------


def test_no_module_under_backend_apps_mutates_payment_status_directly():
    """PaymentService._transition() is the only allowed writer of payment.status.

    Walks every Python module under ``backend/apps/`` (excluding
    ``payment_service.py``) and asserts no forbidden pattern matches.

    Validates: Requirements R1.7
    """
    assert _APPS_ROOT.is_dir(), (
        f"expected backend/apps to exist at {_APPS_ROOT}"
    )

    offenders: dict[str, list[tuple[str, int, str]]] = {}

    for path in _iter_py_files(_APPS_ROOT):
        if path in _ALLOWED_FILES:
            continue
        hits = _scan_file_for_hits(path)
        if hits:
            # Report the path relative to the backend/ root so the failure
            # message is human-readable and clickable in editors.
            rel = path.relative_to(_BACKEND_ROOT)
            offenders[str(rel)] = hits

    if offenders:
        lines = [
            "PaymentService._transition() must be the sole writer of "
            "payments.status. The following modules mutate payment status "
            "out of band and must be refactored to delegate to "
            "PaymentService._transition(...):",
            "",
        ]
        for rel_path in sorted(offenders):
            lines.append(f"  {rel_path}")
            for pattern_name, line_no, match_text in offenders[rel_path]:
                lines.append(
                    f"    line {line_no} [{pattern_name}]: {match_text}"
                )
            lines.append("")
        raise AssertionError("\n".join(lines))
