"""Property-based tests for unused backend dependency removal.

# Feature: tech-debt-remediation, Property 5 (backend): djangorestframework-simplejwt not in requirements.txt

Uses source inspection to verify that `djangorestframework-simplejwt` does not
appear in `backend/requirements.txt` after remediation.

**Validates: Requirements 8.1**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

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
REQUIREMENTS_FILE = BACKEND_ROOT / "requirements.txt"

DEAD_DEPENDENCY = "djangorestframework-simplejwt"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _read_requirements() -> str:
    """Read the raw content of requirements.txt."""
    return REQUIREMENTS_FILE.read_text(encoding="utf-8")


def _find_dependency_lines(content: str, dep_name: str) -> list[tuple[int, str]]:
    """Return (line_number, stripped_line) for lines containing the dependency name."""
    matches = []
    for i, line in enumerate(content.splitlines(), start=1):
        stripped = line.strip()
        # Skip empty lines and comments
        if not stripped or stripped.startswith("#"):
            continue
        if dep_name in stripped:
            matches.append((i, stripped))
    return matches


# =========================================================================
# Property 5 (backend): djangorestframework-simplejwt not in requirements.txt
# =========================================================================


class TestDeadBackendDependencyRemoval(SimpleTestCase):
    """Property 5 (backend): djangorestframework-simplejwt removed from requirements.txt.

    The dead dependency SHALL NOT appear in requirements.txt after remediation.

    **Validates: Requirements 8.1**
    """

    def test_requirements_file_exists(self):
        """requirements.txt must exist."""
        self.assertTrue(
            REQUIREMENTS_FILE.exists(),
            f"Expected requirements.txt at {REQUIREMENTS_FILE}",
        )

    def test_simplejwt_not_in_requirements(self):
        """djangorestframework-simplejwt must not appear in requirements.txt."""
        content = _read_requirements()
        matches = _find_dependency_lines(content, DEAD_DEPENDENCY)
        self.assertEqual(
            matches,
            [],
            f"Found '{DEAD_DEPENDENCY}' in requirements.txt at: {matches}",
        )

    @given(line_index=st.integers(min_value=0, max_value=500))
    @h_settings(max_examples=50, deadline=None)
    def test_no_line_contains_simplejwt(self, line_index):
        """For any line in requirements.txt, djangorestframework-simplejwt must not appear.

        Uses hypothesis to parameterise over line indices, ensuring the
        property holds regardless of which line is inspected.

        **Validates: Requirements 8.1**
        """
        content = _read_requirements()
        lines = [
            line.strip()
            for line in content.splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]

        if not lines:
            return  # Empty requirements file — vacuously true

        idx = line_index % len(lines)
        line = lines[idx]

        self.assertNotIn(
            DEAD_DEPENDENCY,
            line,
            f"Line {idx + 1} contains dead dependency '{DEAD_DEPENDENCY}': {line}",
        )
