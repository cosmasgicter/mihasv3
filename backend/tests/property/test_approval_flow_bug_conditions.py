"""
Bug Condition Exploration — Admissions Approval Flow Bugs

**Validates: Requirements 1.1, 1.2, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14**

These tests encode the EXPECTED (fixed) behavior. They MUST FAIL on unfixed
code — failure confirms the bugs exist. DO NOT fix the code or the tests
when they fail.

Property 1: Bug Condition — Admissions Approval Flow Bug Conditions
"""

import uuid
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from django.utils import timezone

from apps.applications.condition_manager import ConditionManager
from apps.applications.models import Application, ApplicationCondition
from apps.applications.services import ALLOWED_TRANSITIONS, transition_application_status


# ---------------------------------------------------------------------------
# Bug 1 — verify_condition() does not explicitly set updated_at
# ---------------------------------------------------------------------------

class TestBug1UpdatedAtExplicitlySet:
    """Bug 1: verify_condition() relies on auto_now for updated_at instead of
    explicitly setting it before save(). On unfixed code, condition.updated_at
    is never assigned to timezone.now() before save — the test should FAIL.

    **Validates: Requirements 1.1, 1.2**
    """

    @given(status=st.sampled_from(["met", "waived"]))
    @settings(max_examples=10, deadline=None)
    def test_updated_at_explicitly_set_before_save(self, status):
        """Assert that verify_condition() explicitly sets condition.updated_at
        to timezone.now() BEFORE calling save(). On unfixed code, updated_at
        is never explicitly assigned — it relies on auto_now=True.

        We mock timezone.now() to a known value and verify that
        condition.updated_at equals that value BEFORE save() is called."""

        condition_id = str(uuid.uuid4())
        admin_id = str(uuid.uuid4())
        app_id = str(uuid.uuid4())
        frozen_now = timezone.now()

        # Build a mock condition that behaves like a pending ApplicationCondition
        mock_condition = MagicMock(spec=ApplicationCondition)
        mock_condition.id = condition_id
        mock_condition.status = "pending"
        mock_condition.application_id = app_id
        mock_condition.description = "Test condition"
        # Start with updated_at as None — auto_now won't fire on a mock
        mock_condition.updated_at = None

        # Track the value of updated_at at the moment save() is called
        updated_at_at_save_time = []

        def tracking_save(*args, **kwargs):
            updated_at_at_save_time.append(mock_condition.updated_at)

        mock_condition.save = tracking_save

        with patch('apps.applications.condition_manager.timezone') as mock_tz:
            mock_tz.now.return_value = frozen_now
            with patch('apps.applications.condition_manager.transaction') as mock_tx:
                # Make transaction.atomic() a no-op context manager
                mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
                mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

                with patch.object(
                    ApplicationCondition.objects,
                    'select_for_update',
                ) as mock_sfu:
                    mock_qs = MagicMock()
                    mock_qs.get.return_value = mock_condition
                    mock_sfu.return_value = mock_qs

                    with patch.object(ConditionManager, 'auto_promote_if_all_met'):
                        with patch('apps.applications.condition_manager.Application') as MockApp:
                            MockApp.objects.get.return_value = MagicMock()
                            with patch('apps.applications.condition_manager.CommunicationService', create=True):
                                try:
                                    ConditionManager.verify_condition(condition_id, status, admin_id)
                                except Exception:
                                    pass

        # The key assertion: save() must have been called
        assert updated_at_at_save_time, "save() was never called"
        # updated_at must have been explicitly set to frozen_now BEFORE save()
        assert updated_at_at_save_time[0] == frozen_now, (
            f"updated_at was NOT explicitly set to timezone.now() before save(). "
            f"Expected {frozen_now}, got {updated_at_at_save_time[0]}. "
            f"The code relies on auto_now=True instead of explicit assignment."
        )


# ---------------------------------------------------------------------------
# Bug 5 — review_started_at set on non-review transitions
# ---------------------------------------------------------------------------

# Non-review target statuses: statuses that should NOT trigger review_started_at
NON_REVIEW_STATUSES = []
for old_status, targets in ALLOWED_TRANSITIONS.items():
    for target in targets:
        if target not in ("under_review", "conditionally_approved", "approved", "rejected"):
            NON_REVIEW_STATUSES.append((old_status, target))


class TestBug5ReviewStartedAtOnNonReviewTransitions:
    """Bug 5: transition_application_status() unconditionally sets
    review_started_at when it is None, even for non-review transitions like
    draft → submitted. On unfixed code, review_started_at gets set — test FAILS.

    **Validates: Requirements 1.13, 1.14**
    """

    @given(transition=st.sampled_from(NON_REVIEW_STATUSES))
    @settings(max_examples=20, deadline=None)
    def test_non_review_transition_does_not_set_review_started_at(self, transition):
        """Assert that review_started_at remains None after a non-review
        transition. On unfixed code, it gets set unconditionally — test FAILS."""

        old_status, new_status = transition
        user_id = str(uuid.uuid4())

        mock_app = MagicMock(spec=Application)
        mock_app.id = str(uuid.uuid4())
        mock_app.status = old_status
        mock_app.review_started_at = None
        mock_app.reviewed_by_id = None
        mock_app.admin_feedback = None
        mock_app.admin_feedback_date = None
        mock_app.admin_feedback_by_id = None
        mock_app.decision_date = None
        mock_app.updated_at = None
        mock_app.waitlist_position = None
        mock_app.enrollment_confirmation_deadline = None

        # Track the actual value assigned to review_started_at
        review_started_at_value = [None]

        original_setattr = object.__setattr__

        def tracking_setattr(self, name, value):
            if name == 'review_started_at':
                review_started_at_value[0] = value
            # Use MagicMock's normal setattr
            type(mock_app).__setattr__(self, name, value)

        with patch.object(
            ApplicationStatusHistory := MagicMock(),
            'objects',
            create=True,
        ):
            with patch('apps.applications.services.ApplicationStatusHistory') as MockHistory:
                MockHistory.objects.create.return_value = MagicMock()

                try:
                    transition_application_status(
                        application=mock_app,
                        new_status=new_status,
                        changed_by=user_id,
                    )
                except Exception:
                    pass

        # The key assertion: review_started_at should remain None for non-review transitions
        assert mock_app.review_started_at is None, (
            f"review_started_at was set during '{old_status}' → '{new_status}' transition, "
            f"but this is NOT a review transition — it should remain None. "
            f"Got: {mock_app.review_started_at}"
        )
