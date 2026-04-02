"""Property-based tests for fallback email centralisation.

# Feature: tech-debt-remediation, Property 6: Fallback email from settings

Uses source inspection to verify that the 3 backend files that previously
hardcoded `admin@mihas.edu.zm` now reference `settings.ERROR_ALERT_EMAIL`
instead.

**Validates: Requirements 12.1, 12.2**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import re  # noqa: E402
from pathlib import Path  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings as h_settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Paths under test
# ---------------------------------------------------------------------------

BACKEND_ROOT = Path(__file__).resolve().parents[2]

TARGET_FILES = [
    BACKEND_ROOT / "apps" / "common" / "exceptions.py",
    BACKEND_ROOT / "apps" / "common" / "error_views.py",
    BACKEND_ROOT / "apps" / "common" / "tasks.py",
]

HARDCODED_EMAIL = "admin@mihas.edu.zm"
SETTINGS_REFERENCE = "settings.ERROR_ALERT_EMAIL"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _read_source(path: Path) -> str:
    """Read the raw source of a Python file."""
    return path.read_text(encoding="utf-8")


def _find_hardcoded_email_lines(source: str) -> list[tuple[int, str]]:
    """Return (line_number, stripped_line) for lines containing the hardcoded email."""
    matches = []
    for i, line in enumerate(source.splitlines(), start=1):
        if HARDCODED_EMAIL in line:
            matches.append((i, line.strip()))
    return matches


def _contains_settings_reference(source: str) -> bool:
    """Check whether the source references settings.ERROR_ALERT_EMAIL."""
    return SETTINGS_REFERENCE in source


# =========================================================================
# Property 6: Fallback email comes from settings, not hardcoded strings
# =========================================================================


class TestFallbackEmailFromSettings(SimpleTestCase):
    """Property 6: Fallback email from settings, not hardcoded.

    All alert email paths SHALL use settings.ERROR_ALERT_EMAIL,
    not the hardcoded string 'admin@mihas.edu.zm'.

    **Validates: Requirements 12.1, 12.2**
    """

    def test_target_files_exist(self):
        """All 3 target files must exist."""
        for path in TARGET_FILES:
            with self.subTest(file=path.name):
                self.assertTrue(
                    path.exists(),
                    f"Expected file at {path}",
                )

    def test_no_hardcoded_email_in_exceptions(self):
        """exceptions.py must not contain the hardcoded email string."""
        source = _read_source(TARGET_FILES[0])
        matches = _find_hardcoded_email_lines(source)
        self.assertEqual(
            matches,
            [],
            f"Found hardcoded '{HARDCODED_EMAIL}' in exceptions.py at: {matches}",
        )

    def test_no_hardcoded_email_in_error_views(self):
        """error_views.py must not contain the hardcoded email string."""
        source = _read_source(TARGET_FILES[1])
        matches = _find_hardcoded_email_lines(source)
        self.assertEqual(
            matches,
            [],
            f"Found hardcoded '{HARDCODED_EMAIL}' in error_views.py at: {matches}",
        )

    def test_no_hardcoded_email_in_tasks(self):
        """tasks.py must not contain the hardcoded email string."""
        source = _read_source(TARGET_FILES[2])
        matches = _find_hardcoded_email_lines(source)
        self.assertEqual(
            matches,
            [],
            f"Found hardcoded '{HARDCODED_EMAIL}' in tasks.py at: {matches}",
        )

    def test_exceptions_uses_settings_reference(self):
        """exceptions.py must reference settings.ERROR_ALERT_EMAIL."""
        source = _read_source(TARGET_FILES[0])
        self.assertTrue(
            _contains_settings_reference(source),
            f"exceptions.py does not reference {SETTINGS_REFERENCE}",
        )

    def test_error_views_uses_settings_reference(self):
        """error_views.py must reference settings.ERROR_ALERT_EMAIL."""
        source = _read_source(TARGET_FILES[1])
        self.assertTrue(
            _contains_settings_reference(source),
            f"error_views.py does not reference {SETTINGS_REFERENCE}",
        )

    def test_tasks_uses_settings_reference(self):
        """tasks.py must reference settings.ERROR_ALERT_EMAIL."""
        source = _read_source(TARGET_FILES[2])
        self.assertTrue(
            _contains_settings_reference(source),
            f"tasks.py does not reference {SETTINGS_REFERENCE}",
        )

    @given(file_index=st.integers(min_value=0, max_value=100))
    @h_settings(max_examples=50, deadline=None)
    def test_no_hardcoded_email_in_any_target_file(self, file_index):
        """For any target file, the hardcoded email string must not appear.

        Uses hypothesis to parameterise over file indices, ensuring the
        property holds regardless of which file is inspected.

        **Validates: Requirements 12.1, 12.2**
        """
        idx = file_index % len(TARGET_FILES)
        path = TARGET_FILES[idx]
        source = _read_source(path)
        matches = _find_hardcoded_email_lines(source)

        self.assertEqual(
            matches,
            [],
            f"Found hardcoded '{HARDCODED_EMAIL}' in {path.name} at: {matches}",
        )

    @given(file_index=st.integers(min_value=0, max_value=100))
    @h_settings(max_examples=50, deadline=None)
    def test_settings_reference_present_in_any_target_file(self, file_index):
        """For any target file, settings.ERROR_ALERT_EMAIL must be referenced.

        Uses hypothesis to parameterise over file indices, ensuring the
        property holds regardless of which file is inspected.

        **Validates: Requirements 12.1, 12.2**
        """
        idx = file_index % len(TARGET_FILES)
        path = TARGET_FILES[idx]
        source = _read_source(path)

        self.assertTrue(
            _contains_settings_reference(source),
            f"{path.name} does not reference {SETTINGS_REFERENCE}",
        )
