"""Property-based tests for uptime task state transitions.

# Feature: cto-assessment-remediation, Property 9: Uptime task alerts on failure and recovers

Tests that for any sequence of health check results, the check_uptime_task
dispatches an alert email on healthy→unhealthy transition, a recovery email
on unhealthy→healthy transition, and no duplicate alerts for repeated failures.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Generate sequences of boolean values: True = healthy (200), False = unhealthy
_health_sequences = st.lists(
    st.booleans(),
    min_size=1,
    max_size=30,
)


# =========================================================================
# Property 9: Uptime task alerts on failure and recovers
# =========================================================================


class TestUptimeStateTransitions(SimpleTestCase):
    """Property 9: Uptime task alerts on failure and recovers.

    For any sequence of health check results, the check_uptime_task should
    dispatch an alert email when the health endpoint transitions from healthy
    to unhealthy (non-200 or timeout), and dispatch a recovery email when it
    transitions from unhealthy back to healthy (200). Repeated failures
    without a recovery should not produce duplicate alerts.

    **Validates: Requirements 5.3, 5.4**
    """

    @given(health_results=_health_sequences)
    @settings(max_examples=5, deadline=None)
    def test_uptime_state_transitions(self, health_results):
        """Alert on healthy→unhealthy, recovery on unhealthy→healthy,
        no duplicates for repeated failures."""
        from apps.common.tasks import (
            UPTIME_STATUS_DOWN,
            UPTIME_STATUS_OK,
            check_uptime_task,
        )

        # Simulate Redis cache state in-memory.
        redis_store = {}

        def mock_cache_get(key, default=None):
            return redis_store.get(key, default)

        def mock_cache_set(key, value, timeout=None):
            redis_store[key] = value

        # Track EmailQueue.objects.create calls to inspect subjects.
        email_creates = []

        def mock_email_create(**kwargs):
            email_creates.append(kwargs)
            mock_record = MagicMock()
            mock_record.id = f"fake-email-{len(email_creates)}"
            return mock_record

        # Track queued dispatch calls.
        dispatch_calls = []

        def mock_dispatch(*args, **kwargs):
            dispatch_calls.append(args)

        # Iterate through the health result sequence, calling
        # check_uptime_task for each result.
        for is_healthy in health_results:
            # Mock requests.get to return 200 or raise based on sequence.
            if is_healthy:
                mock_response = MagicMock()
                mock_response.status_code = 200
                requests_side_effect = None
                requests_return = mock_response
            else:
                requests_side_effect = ConnectionError("simulated failure")
                requests_return = None

            with patch(
                "requests.get",
                side_effect=requests_side_effect,
                return_value=requests_return,
            ), patch(
                "apps.common.tasks.cache.get",
                side_effect=mock_cache_get,
            ), patch(
                "apps.common.tasks.cache.set",
                side_effect=mock_cache_set,
            ), patch(
                "apps.common.outbox.transaction.atomic",
                side_effect=lambda: nullcontext(),
            ), patch(
                "apps.common.outbox.transaction.on_commit",
                side_effect=lambda fn: fn(),
            ), patch(
                "apps.common.models.EmailQueue.objects.create",
                side_effect=mock_email_create,
            ), patch(
                "apps.common.models.OutboxEvent.objects.create",
            ), patch(
                "apps.common.outbox.dispatch_email",
                side_effect=mock_dispatch,
            ):
                # Call the task directly (bypass Celery).
                check_uptime_task()

        # ---------------------------------------------------------------
        # Compute expected transitions from the sequence.
        # The task defaults previous_status to 'ok' on first run.
        # ---------------------------------------------------------------
        expected_alerts = 0  # healthy → unhealthy
        expected_recoveries = 0  # unhealthy → healthy

        previous = UPTIME_STATUS_OK  # default on first run
        for is_healthy in health_results:
            current = UPTIME_STATUS_OK if is_healthy else UPTIME_STATUS_DOWN
            if previous == UPTIME_STATUS_OK and current == UPTIME_STATUS_DOWN:
                expected_alerts += 1
            elif previous == UPTIME_STATUS_DOWN and current == UPTIME_STATUS_OK:
                expected_recoveries += 1
            previous = current

        expected_total_emails = expected_alerts + expected_recoveries

        # Verify total email dispatches match expected transitions.
        self.assertEqual(
            len(email_creates),
            expected_total_emails,
            f"Expected {expected_total_emails} emails "
            f"({expected_alerts} alerts + {expected_recoveries} recoveries) "
            f"for sequence {health_results}, got {len(email_creates)}",
        )

        self.assertEqual(
            len(dispatch_calls),
            expected_total_emails,
            f"Expected {expected_total_emails} dispatch_email calls "
            f"for sequence {health_results}, got {len(dispatch_calls)}",
        )

        # Verify email subjects match the transition type in order.
        email_idx = 0
        previous = UPTIME_STATUS_OK
        for is_healthy in health_results:
            current = UPTIME_STATUS_OK if is_healthy else UPTIME_STATUS_DOWN
            if previous == UPTIME_STATUS_OK and current == UPTIME_STATUS_DOWN:
                subject = email_creates[email_idx]["subject"]
                self.assertIn("Down", subject,
                              f"Alert email subject should contain 'Down': {subject}")
                self.assertEqual(email_creates[email_idx]["status"], "pending")
                email_idx += 1
            elif previous == UPTIME_STATUS_DOWN and current == UPTIME_STATUS_OK:
                subject = email_creates[email_idx]["subject"]
                self.assertIn("Recovered", subject,
                              f"Recovery email subject should contain 'Recovered': {subject}")
                self.assertEqual(email_creates[email_idx]["status"], "pending")
                email_idx += 1
            previous = current
from contextlib import nullcontext
