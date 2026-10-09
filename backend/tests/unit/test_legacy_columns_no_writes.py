"""
Test that no Django code path writes to any column in LEGACY_DEPRECATED_COLUMNS.

Uses ast.parse to scan backend/apps/ for attribute assignments on model instances
that target deprecated column names.
"""

import ast
import os
from pathlib import Path

import pytest

from apps.common.legacy_columns import LEGACY_DEPRECATED_COLUMNS


# Which Django model owns each registry table. Needed for the ORM-mapping filter
# below (admissions-v2 task 12.3).
_TABLE_MODELS: dict[str, tuple[str, str]] = {
    "applications": ("apps/applications/models.py", "Application"),
    "profiles": ("apps/accounts/models.py", "Profile"),
    "error_logs": ("apps/common/models.py", "ErrorLog"),
}

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent


def _declared_fields(rel_source: str, class_name: str) -> set[str]:
    """Field names the given model class declares, by AST."""
    path = _BACKEND_ROOT / rel_source
    if not path.exists():
        return set()
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            return {
                t.id
                for stmt in node.body
                if isinstance(stmt, ast.Assign)
                for t in stmt.targets
                if isinstance(t, ast.Name)
            }
    return set()


# Deprecated columns that are ACTUALLY REACHABLE through the ORM.
#
# admissions-v2 task 12.3 — this filter is the fix for a classification bug.
# This test scans for attribute assignments by NAME, which cannot by itself tell
# `application.payment_method = x` from `payment.payment_method = x`. Both models
# have a `payment_method`; only one of them is in the deprecation registry.
#
# The rigorous distinction is ORM mapping. Django writes a column only if the
# model DECLARES the field, so a deprecated column its owning model does not
# declare is unreachable through the ORM no matter what any code assigns. Seven of
# the nine registered `applications` columns are in exactly that state — see the
# "Legacy unmapped columns (AUDIT-1.3-003)" docstring on `Application`.
#
# Before this filter, `_KNOWN_DAY0_VIOLATIONS` carried six `payment_method`
# entries described as "legacy sync writes ... to applications". Every one of them
# was a write to `Payment.payment_method`. The allow-list was suppressing findings
# that were never violations, and the runbook's Day-60 review inherited the same
# mistake. See docs/v2-evidence/12.3/README.md §6.1.
_ALL_DEPRECATED_COLUMNS: set[str] = set()
_UNMAPPED_DEPRECATED_COLUMNS: set[str] = set()
for _table, _cols in LEGACY_DEPRECATED_COLUMNS.items():
    _source, _model = _TABLE_MODELS.get(_table, ("", ""))
    _declared = _declared_fields(_source, _model) if _source else set()
    for col_name in _cols:
        if col_name == "__entire_table__":
            continue
        if col_name in _declared:
            _ALL_DEPRECATED_COLUMNS.add(col_name)
        else:
            _UNMAPPED_DEPRECATED_COLUMNS.add(col_name)

# Known Day 0 violations — legacy sync writes that must be removed by sunset date.
# Remove entries from this set as the code is cleaned up.
#
# Both remaining entries are REAL: they assign to `Application.payment_verified_at`
# / `payment_verified_by_id`, which Application does declare. Task 12.3 registered
# both columns as Legacy_Exceptions with an announced end date rather than
# contracting them (apps/common/compatibility_register.py); removing the write is
# item 3 of their exit criteria.
_KNOWN_DAY0_VIOLATIONS: set[tuple[str, str]] = {
    # The dev-bypass fallback that syncs the admin-override verification stamp onto
    # the application. Reachable only when PaymentService._transition() has not
    # already synced application status.
    ("apps/documents/payment_widget_views.py", "payment_verified_at"),
    # Stream 9 moved that write out of views.py; the shim is allow-listed too in
    # case the original module is consulted.
    ("apps/documents/views.py", "payment_verified_at"),
}

# Directories to scan
_APPS_DIR = Path(__file__).resolve().parent.parent.parent / "apps"


class _DeprecatedWriteVisitor(ast.NodeVisitor):
    """AST visitor that detects assignments to deprecated column names."""

    def __init__(self):
        self.violations: list[tuple[str, int, str]] = []  # (file, line, column_name)
        self._current_file = ""

    def check_file(self, filepath: str):
        self._current_file = filepath
        try:
            source = Path(filepath).read_text(encoding="utf-8")
            tree = ast.parse(source, filename=filepath)
            self.visit(tree)
        except (SyntaxError, UnicodeDecodeError):
            pass

    def visit_Assign(self, node: ast.Assign):
        for target in node.targets:
            self._check_target(target, node.lineno)
        self.generic_visit(node)

    def visit_AugAssign(self, node: ast.AugAssign):
        self._check_target(node.target, node.lineno)
        self.generic_visit(node)

    def _check_target(self, target: ast.AST, lineno: int):
        if isinstance(target, ast.Attribute):
            if target.attr in _ALL_DEPRECATED_COLUMNS:
                self.violations.append((self._current_file, lineno, target.attr))


def _collect_python_files() -> list[str]:
    """Collect all .py files under backend/apps/."""
    files = []
    for root, _dirs, filenames in os.walk(_APPS_DIR):
        # Skip migrations and test directories
        if "/migrations/" in root or "/tests/" in root:
            continue
        for fname in filenames:
            if fname.endswith(".py"):
                files.append(os.path.join(root, fname))
    return files


class TestLegacyColumnsNoWrites:
    def test_no_new_writes_to_deprecated_columns(self):
        """No NEW code in backend/apps/ should write to deprecated columns."""
        visitor = _DeprecatedWriteVisitor()

        for filepath in _collect_python_files():
            visitor.check_file(filepath)

        # Filter out known Day 0 violations
        new_violations = []
        for filepath, line, col in visitor.violations:
            # Normalize: extract path relative to backend/ (e.g. "apps/documents/views.py")
            parts = filepath.replace("\\", "/").split("/")
            try:
                apps_idx = parts.index("apps")
                rel_key = "/".join(parts[apps_idx:])
            except ValueError:
                rel_key = filepath
            if (rel_key, col) not in _KNOWN_DAY0_VIOLATIONS:
                new_violations.append((filepath, line, col))

        if new_violations:
            report = "\n".join(
                f"  {f}:{line} writes to '{col}'"
                for f, line, col in new_violations
            )
            pytest.fail(
                f"Found {len(new_violations)} NEW write(s) to deprecated columns:\n{report}\n"
                f"If these are legacy sync writes being removed during the 90-day cycle,\n"
                f"add them to _KNOWN_DAY0_VIOLATIONS in this test file."
            )

    def test_known_violations_documented(self):
        """Ensure _KNOWN_DAY0_VIOLATIONS is not empty (remove this test at sunset)."""
        assert len(_KNOWN_DAY0_VIOLATIONS) > 0, (
            "All known violations resolved! Remove _KNOWN_DAY0_VIOLATIONS and this test."
        )

    def test_allow_list_does_not_grow_and_names_only_reachable_columns(self):
        """The allow-list is budgeted at today's count, with no slack.

        admissions-v2 task 12.3. Two properties, both of which the list violated
        before this task:

        1. Every entry names a column the ORM can actually reach. An entry for an
           unmapped column suppresses a finding that was never a violation, which
           is worse than no entry: it reads as evidence of a write that does not
           exist. Six of the eight entries were in that state.
        2. The list does not grow. Task 12.2 §18 #8 is the general rule — "remove
           it later" is not a plan, ``assert len(...) <= N`` is. The two remaining
           entries are item 3 of the exit criteria on
           ``applications.payment_verified_at`` in the compatibility register, so
           the number can only go down.
        """
        for _path, column in _KNOWN_DAY0_VIOLATIONS:
            assert column not in _UNMAPPED_DEPRECATED_COLUMNS, (
                f"_KNOWN_DAY0_VIOLATIONS allow-lists a write to '{column}', but the "
                f"owning model does not declare it — no ORM write can reach that "
                f"column, so the entry is suppressing a same-named attribute on some "
                f"other model. Remove the entry instead of carrying it."
            )
            assert column in _ALL_DEPRECATED_COLUMNS, (
                f"'{column}' is allow-listed but is not a mapped deprecated column at "
                f"all. Either the registry changed or the entry is stale."
            )
        assert len(_KNOWN_DAY0_VIOLATIONS) <= 2, (
            "the Day-0 violation allow-list grew. It is budgeted at the 2026-08-11 "
            "count (2) with no slack: a new legacy write is a regression, not a "
            "candidate for the allow-list."
        )
