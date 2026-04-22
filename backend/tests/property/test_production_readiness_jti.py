"""Property-based tests for the JTI blacklist recovery command.

# Feature: production-readiness-hardening, Property 9: JTI Recovery Command Logs Counts

**Validates: Requirements 5.2**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import io  # noqa: E402
from datetime import timedelta  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from django.utils import timezone  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Number of active sessions (future expiry) — 0 to 50
ACTIVE_COUNT = st.integers(min_value=0, max_value=50)

# Number of expired sessions (past expiry but still is_active=True) — 0 to 50
EXPIRED_COUNT = st.integers(min_value=0, max_value=50)


def _make_session_mock(is_expired, now):
    """Create a mock DeviceSession-like object."""
    session = MagicMock()
    session.is_active = True
    if is_expired:
        session.expires_at = now - timedelta(hours=1)
    else:
        session.expires_at = now + timedelta(hours=1)
    return session


# =========================================================================
# Property 9: JTI Recovery Command Logs Counts
# =========================================================================


class TestJTIRecoveryCommandLogsCounts(SimpleTestCase):
    """Property 9: JTI Recovery Command Logs Counts.

    For any execution of the recover_jti_blacklist command with a set of active
    and expired sessions, the command output SHALL include the count of sessions
    invalidated and the count of expired sessions skipped.

    # Feature: production-readiness-hardening, Property 9: JTI Recovery Command Logs Counts
    **Validates: Requirements 5.2**
    """

    @given(active_count=ACTIVE_COUNT, expired_count=EXPIRED_COUNT)
    @settings(max_examples=20, deadline=None)
    def test_output_includes_invalidated_and_skipped_counts(
        self, active_count, expired_count
    ):
        """Command output always reports both invalidated and skipped counts."""
        from apps.accounts.management.commands.recover_jti_blacklist import Command

        cmd = Command()
        out = io.StringIO()
        cmd.stdout = out
        cmd.stderr = io.StringIO()

        # Build mock querysets that return the right counts
        active_qs = MagicMock()
        active_qs.count.return_value = active_count
        active_qs.update.return_value = active_count

        expired_qs = MagicMock()
        expired_qs.count.return_value = expired_count

        def fake_filter(**kwargs):
            if kwargs.get("expires_at__gt"):
                return active_qs
            if kwargs.get("expires_at__lte"):
                return expired_qs
            return MagicMock()

        mock_objects = MagicMock()
        mock_objects.filter.side_effect = fake_filter

        # Mock Redis as reachable and DeviceSession.objects
        mock_cache = MagicMock()
        mock_cache.get.return_value = "1"

        with patch("django.core.cache.cache", mock_cache), \
             patch("apps.accounts.models.DeviceSession.objects", mock_objects):
            cmd.handle()

        output = out.getvalue()

        # Output must contain the invalidated count
        self.assertIn(
            str(active_count),
            output,
            f"Output should contain invalidated count {active_count}: {output!r}",
        )

        # Output must contain the skipped count
        self.assertIn(
            str(expired_count),
            output,
            f"Output should contain skipped count {expired_count}: {output!r}",
        )

        # Output must mention both "invalidated" and "skipped"
        self.assertIn("invalidated", output.lower())
        self.assertIn("skipped", output.lower())

        # Verify the exact pattern: "<N> sessions invalidated, <M> expired sessions skipped"
        pattern = rf"{active_count} sessions invalidated.*{expired_count} expired sessions skipped"
        self.assertRegex(
            output,
            pattern,
            f"Output should match pattern '{pattern}': {output!r}",
        )
