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


# Collect all deprecated column names across all tables (excluding __entire_table__)
_ALL_DEPRECATED_COLUMNS: set[str] = set()
for _table, _cols in LEGACY_DEPRECATED_COLUMNS.items():
    for col_name in _cols:
        if col_name != "__entire_table__":
            _ALL_DEPRECATED_COLUMNS.add(col_name)

# Known Day 0 violations — legacy sync writes that must be removed by sunset date.
# Remove entries from this set as the code is cleaned up.
_KNOWN_DAY0_VIOLATIONS: set[tuple[str, str]] = {
    # payment_service.py syncs payment_method to applications during transition
    ("apps/documents/payment_service.py", "payment_method"),
    # payment_service_mixins/ — verbatim code moved from payment_service.py
    ("apps/documents/payment_service_mixins/_core.py", "payment_method"),
    ("apps/documents/payment_service_mixins/_verification.py", "payment_method"),
    ("apps/documents/payment_service_mixins/_initiation.py", "payment_method"),
    # Stream 9 decomposition moved admin override writes from views.py to payment_widget_views.py.
    # Both locations are allow-listed in case the original views.py shim is consulted.
    ("apps/documents/views.py", "payment_method"),
    ("apps/documents/views.py", "payment_verified_at"),
    ("apps/documents/payment_widget_views.py", "payment_method"),
    ("apps/documents/payment_widget_views.py", "payment_verified_at"),
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
