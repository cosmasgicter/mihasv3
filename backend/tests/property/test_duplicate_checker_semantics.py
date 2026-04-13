"""Property-based tests for DuplicateChecker semantics.

Feature: pre-launch-audit, Property 27: Duplicate checker distinguishes create-time and submit-time

DuplicateChecker.check_at_create() should block if a non-terminal application exists
(using NON_TERMINAL_STATUSES which excludes 'approved').
DuplicateChecker.check_at_submit() should block if a submitted application exists
(using SUBMITTED_STATUSES).

**Validates: Requirements 7.2**
"""

import os
import uuid
from unittest.mock import MagicMock, patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.applications.duplicate_checker import (  # noqa: E402
    DuplicateChecker,
    DuplicateCheckResult,
    NON_TERMINAL_STATUSES,
    SUBMITTED_STATUSES,
)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

user_ids = st.uuids(version=4).map(str)
program_codes = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-"),
    min_size=1,
    max_size=20,
)
intake_names = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789- "),
    min_size=1,
    max_size=30,
)

non_terminal_statuses = st.sampled_from(sorted(NON_TERMINAL_STATUSES))
submitted_statuses = st.sampled_from(sorted(SUBMITTED_STATUSES))
terminal_statuses = st.sampled_from(["approved", "rejected"])
all_statuses = st.sampled_from(
    ["draft", "submitted", "under_review", "approved", "rejected", "waitlisted"]
)


# ---------------------------------------------------------------------------
# Tests — Property 27: Duplicate checker semantics
# ---------------------------------------------------------------------------


class TestDuplicateCheckerStatusSets(SimpleTestCase):
    """Verify the status sets are correctly defined per go-live-polish Fix 11.

    **Validates: Requirements 7.2**
    """

    def test_approved_not_in_non_terminal_statuses(self):
        """'approved' must NOT be in NON_TERMINAL_STATUSES (go-live-polish Fix 11).
        This ensures students can create a new application after being approved."""
        self.assertNotIn("approved", NON_TERMINAL_STATUSES)

    def test_rejected_not_in_non_terminal_statuses(self):
        """'rejected' must NOT be in NON_TERMINAL_STATUSES."""
        self.assertNotIn("rejected", NON_TERMINAL_STATUSES)

    def test_non_terminal_contains_expected_statuses(self):
        """NON_TERMINAL_STATUSES should contain draft, submitted, under_review, waitlisted."""
        expected = {"draft", "submitted", "under_review", "waitlisted"}
        self.assertEqual(NON_TERMINAL_STATUSES, expected)

    def test_submitted_statuses_contains_expected(self):
        """SUBMITTED_STATUSES should contain submitted, under_review, approved, waitlisted."""
        expected = {"submitted", "under_review", "approved", "waitlisted"}
        self.assertEqual(SUBMITTED_STATUSES, expected)

    def test_draft_not_in_submitted_statuses(self):
        """'draft' must NOT be in SUBMITTED_STATUSES — drafts are not submitted."""
        self.assertNotIn("draft", SUBMITTED_STATUSES)


class TestCheckAtCreateBlocking(SimpleTestCase):
    """Property 27a: check_at_create() blocks if non-terminal app exists.

    **Validates: Requirements 7.2**
    """

    @given(
        user_id=user_ids,
        program=program_codes,
        intake=intake_names,
        existing_status=non_terminal_statuses,
    )
    @settings(max_examples=100)
    def test_blocks_when_non_terminal_app_exists(
        self, user_id, program, intake, existing_status
    ):
        """check_at_create() returns has_duplicate=True when an application
        with a non-terminal status exists for the same user+program+intake."""
        mock_existing = MagicMock()
        mock_existing.id = uuid.uuid4()
        mock_existing.status = existing_status

        with patch("apps.applications.duplicate_checker.Application.objects") as mock_qs:
            mock_qs.filter.return_value.first.return_value = mock_existing

            result = DuplicateChecker.check_at_create(user_id, program, intake)

        self.assertTrue(result.has_duplicate)
        self.assertEqual(result.existing_status, existing_status)
        self.assertIsNotNone(result.existing_id)

        # Verify filter used NON_TERMINAL_STATUSES
        mock_qs.filter.assert_called_once_with(
            user_id=user_id,
            program=program,
            intake=intake,
            status__in=NON_TERMINAL_STATUSES,
        )

    @given(
        user_id=user_ids,
        program=program_codes,
        intake=intake_names,
    )
    @settings(max_examples=100)
    def test_allows_when_no_non_terminal_app_exists(
        self, user_id, program, intake
    ):
        """check_at_create() returns has_duplicate=False when no non-terminal
        application exists."""
        with patch("apps.applications.duplicate_checker.Application.objects") as mock_qs:
            mock_qs.filter.return_value.first.return_value = None

            result = DuplicateChecker.check_at_create(user_id, program, intake)

        self.assertFalse(result.has_duplicate)
        self.assertIsNone(result.existing_id)


class TestCheckAtSubmitBlocking(SimpleTestCase):
    """Property 27b: check_at_submit() blocks if submitted app exists.

    **Validates: Requirements 7.2**
    """

    @given(
        user_id=user_ids,
        program=program_codes,
        intake=intake_names,
        existing_status=submitted_statuses,
        exclude_id=user_ids,
    )
    @settings(max_examples=100)
    def test_blocks_when_submitted_app_exists(
        self, user_id, program, intake, existing_status, exclude_id
    ):
        """check_at_submit() returns has_duplicate=True when an application
        with a submitted status exists for the same user+program+intake."""
        mock_existing = MagicMock()
        mock_existing.id = uuid.uuid4()
        mock_existing.status = existing_status

        with patch("apps.applications.duplicate_checker.Application.objects") as mock_qs:
            mock_qs.filter.return_value.exclude.return_value.first.return_value = mock_existing

            result = DuplicateChecker.check_at_submit(
                user_id, program, intake, exclude_id
            )

        self.assertTrue(result.has_duplicate)
        self.assertEqual(result.existing_status, existing_status)

        # Verify filter used SUBMITTED_STATUSES
        mock_qs.filter.assert_called_once_with(
            user_id=user_id,
            program=program,
            intake=intake,
            status__in=SUBMITTED_STATUSES,
        )

    @given(
        user_id=user_ids,
        program=program_codes,
        intake=intake_names,
        exclude_id=user_ids,
    )
    @settings(max_examples=100)
    def test_allows_when_no_submitted_app_exists(
        self, user_id, program, intake, exclude_id
    ):
        """check_at_submit() returns has_duplicate=False when no submitted
        application exists."""
        with patch("apps.applications.duplicate_checker.Application.objects") as mock_qs:
            mock_qs.filter.return_value.exclude.return_value.first.return_value = None

            result = DuplicateChecker.check_at_submit(
                user_id, program, intake, exclude_id
            )

        self.assertFalse(result.has_duplicate)
        self.assertIsNone(result.existing_id)
