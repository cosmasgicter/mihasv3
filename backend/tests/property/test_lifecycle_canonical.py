"""Property tests for lifecycle state machine canonical truth.

Asserts cross-layer consistency between:
- backend/apps/applications/services.py (ALLOWED_TRANSITIONS)
- backend/apps/applications/duplicate_checker.py (TERMINAL_STATUSES)
- apps/admissions/src/lib/applicationStatusUi.ts (frontend label map)
"""

import re
from pathlib import Path

import pytest

from apps.applications.services import ALLOWED_TRANSITIONS
from apps.applications.duplicate_checker import TERMINAL_STATUSES

REPO_ROOT = Path(__file__).resolve().parents[3]
STATUS_UI_PATH = REPO_ROOT / "apps" / "admissions" / "src" / "lib" / "applicationStatusUi.ts"


def _parse_ts_status_keys(source: str) -> set[str]:
    """Extract keys from the ADMIN_APPLICATION_STATUS_BADGES record."""
    keys: set[str] = set()
    for match in re.finditer(r"^\s*(\w+)\s*:", source, re.MULTILINE):
        candidate = match.group(1)
        # Skip TS keywords and non-status identifiers
        if candidate in ("cardClassName", "tableClassName", "value", "label"):
            continue
        keys.add(candidate)
    return keys


@pytest.fixture(scope="module")
def frontend_statuses() -> set[str]:
    source = STATUS_UI_PATH.read_text()
    return _parse_ts_status_keys(source)


def _all_statuses_in_transitions() -> set[str]:
    statuses: set[str] = set()
    for source, targets in ALLOWED_TRANSITIONS.items():
        statuses.add(source)
        statuses.update(targets)
    return statuses


class TestLifecycleCanonical:
    def test_all_transition_pairs_are_valid_statuses(self):
        all_statuses = _all_statuses_in_transitions()
        for source, targets in ALLOWED_TRANSITIONS.items():
            assert source in all_statuses
            for target in targets:
                assert target in all_statuses, f"{source} -> {target}: target not a valid status"

    def test_every_reachable_status_has_frontend_label(self, frontend_statuses: set[str]):
        all_statuses = _all_statuses_in_transitions()
        for status in all_statuses:
            assert status in frontend_statuses, (
                f"Status '{status}' reachable in ALLOWED_TRANSITIONS but missing from applicationStatusUi.ts"
            )

    def test_terminal_statuses_match_duplicate_checker(self):
        canonical_terminal = {"rejected", "withdrawn", "expired", "enrolled", "enrollment_expired"}
        assert TERMINAL_STATUSES == canonical_terminal

    def test_terminal_statuses_have_no_outbound_transitions(self):
        for status in TERMINAL_STATUSES:
            assert status not in ALLOWED_TRANSITIONS, (
                f"Terminal status '{status}' should not have outbound transitions"
            )
