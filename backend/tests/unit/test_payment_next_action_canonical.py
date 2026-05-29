"""Drift-guard: pins every PaymentNextAction stable code emitted by backend.

Fails if backend emits a new next_action value without updating the
frontend mirror at apps/admissions/src/lib/paymentNextActions.ts.
"""
import re
from pathlib import Path

import pytest

# Backend source directories that emit next_action values
_BACKEND_DOCUMENTS_DIR = Path(__file__).resolve().parent.parent.parent / "apps" / "documents"

# Frontend canonical list
_FRONTEND_NEXT_ACTIONS_PATH = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "apps"
    / "admissions"
    / "src"
    / "lib"
    / "paymentNextActions.ts"
)

# Regex to find "next_action": "some_value" in Python source
_NEXT_ACTION_RE = re.compile(r'"next_action":\s*"(\w+)"')

# Regex to extract the PAYMENT_NEXT_ACTIONS array from the TS file
_TS_ARRAY_RE = re.compile(
    r"PAYMENT_NEXT_ACTIONS.*?\[([^\]]+)\]", re.DOTALL
)
_TS_ENTRY_RE = re.compile(r"'(\w+)'")


def _discover_backend_next_actions() -> set:
    """Parse all backend/apps/documents/**/*.py for next_action string values."""
    actions = set()
    for py_file in _BACKEND_DOCUMENTS_DIR.rglob("*.py"):
        rel = str(py_file.relative_to(_BACKEND_DOCUMENTS_DIR))
        if "test" in rel or "migration" in rel:
            continue
        try:
            source = py_file.read_text(encoding="utf-8")
        except Exception:
            continue
        for match in _NEXT_ACTION_RE.finditer(source):
            actions.add(match.group(1))
    return actions


def _parse_frontend_next_actions() -> set:
    """Parse the frontend PAYMENT_NEXT_ACTIONS array."""
    content = _FRONTEND_NEXT_ACTIONS_PATH.read_text(encoding="utf-8")
    array_match = _TS_ARRAY_RE.search(content)
    assert array_match, "Could not find PAYMENT_NEXT_ACTIONS array in paymentNextActions.ts"
    entries = _TS_ENTRY_RE.findall(array_match.group(1))
    return set(entries)


class TestPaymentNextActionCanonicalPin:
    """Every next_action emitted by backend must exist in the frontend mirror."""

    def test_frontend_file_exists(self):
        assert _FRONTEND_NEXT_ACTIONS_PATH.exists(), (
            f"Frontend paymentNextActions.ts not found at {_FRONTEND_NEXT_ACTIONS_PATH}"
        )

    def test_backend_emits_at_least_three_actions(self):
        actions = _discover_backend_next_actions()
        assert len(actions) >= 3, f"Expected >= 3 backend next_actions, got {sorted(actions)}"

    def test_all_backend_actions_covered_by_frontend(self):
        backend = _discover_backend_next_actions()
        frontend = _parse_frontend_next_actions()
        missing = backend - frontend
        assert not missing, (
            f"Backend emits next_action values not in frontend mirror: {sorted(missing)}. "
            f"Update apps/admissions/src/lib/paymentNextActions.ts."
        )

    def test_pinned_snapshot(self):
        """Pin the current set so additions are explicit."""
        backend = _discover_backend_next_actions()
        expected = {
            "already_paid",
            "check_status",
            "retry_with_different_number",
        }
        assert backend == expected, (
            f"Backend next_action set changed. "
            f"Added: {sorted(backend - expected)}. "
            f"Removed: {sorted(expected - backend)}. "
            f"Update this snapshot after verifying the frontend mirror."
        )
