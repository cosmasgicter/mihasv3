"""
Preservation Property Tests — Admissions Approval Flow

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**

These tests capture BASELINE behavior on UNFIXED code. They MUST PASS
before and after fixes — failure indicates a regression.

Property 2: Preservation — Admissions Approval Flow Preservation
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from django.utils import timezone

from apps.applications.condition_manager import ConditionError, ConditionManager
from apps.applications.models import Application, ApplicationCondition, ApplicationStatusHistory
from apps.applications.services import ALLOWED_TRANSITIONS, transition_application_status


# ---------------------------------------------------------------------------
# Bug 1 Preservation — verify_condition() side effects unchanged
# ---------------------------------------------------------------------------

class TestBug1PreservationNonPendingRaisesError:
    """Preservation: calling verify_condition() on a non-pending condition
    still raises ConditionError("CONDITION_NOT_PENDING").

    **Validates: Requirements 3.1, 3.2**
    """

    @given(
        condition_status=st.sampled_from(["met", "waived", "expired"]),
        target_status=st.sampled_from(["met", "waived"]),
    )
    @settings(max_examples=10, deadline=None)
    def test_non_pending_condition_raises_condition_not_pending(
        self, condition_status, target_status
    ):
        """Non-pending conditions must raise ConditionError with code
        CONDITION_NOT_PENDING regardless of the target status."""

        condition_id = str(uuid.uuid4())
        admin_id = str(uuid.uuid4())

        mock_condition = MagicMock(spec=ApplicationCondition)
        mock_condition.id = condition_id
        mock_condition.status = condition_status  # NOT "pending"

        with patch('apps.applications.condition_manager.transaction') as mock_tx:
            mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
            mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

            with patch.object(
                ApplicationCondition.objects, 'select_for_update'
            ) as mock_sfu:
                mock_qs = MagicMock()
                mock_qs.get.return_value = mock_condition
                mock_sfu.return_value = mock_qs

                with pytest.raises(ConditionError) as exc_info:
                    ConditionManager.verify_condition(condition_id, target_status, admin_id)

                assert exc_info.value.code == "CONDITION_NOT_PENDING"


class TestBug1PreservationInvalidStatusRaisesError:
    """Preservation: calling verify_condition() with an invalid status
    (not met/waived) raises ConditionError("INVALID_CONDITION_STATUS").

    **Validates: Requirements 3.1, 3.2**
    """

    @given(
        invalid_status=st.sampled_from(["expired", "pending", "cancelled", "unknown", ""]),
    )
    @settings(max_examples=10, deadline=None)
    def test_invalid_status_raises_invalid_condition_status(self, invalid_status):
        """Statuses other than met/waived must raise ConditionError with code
        INVALID_CONDITION_STATUS."""

        condition_id = str(uuid.uuid4())
        admin_id = str(uuid.uuid4())

        with pytest.raises(ConditionError) as exc_info:
            ConditionManager.verify_condition(condition_id, invalid_status, admin_id)

        assert exc_info.value.code == "INVALID_CONDITION_STATUS"


class TestBug1PreservationAutoPromotionTriggers:
    """Preservation: auto_promote_if_all_met() is still called after
    a successful verify_condition() call.

    **Validates: Requirements 3.1**
    """

    @given(status=st.sampled_from(["met", "waived"]))
    @settings(max_examples=6, deadline=None)
    def test_auto_promote_called_after_verification(self, status):
        """After verifying a pending condition, auto_promote_if_all_met()
        must be invoked with the condition's application_id."""

        condition_id = str(uuid.uuid4())
        admin_id = str(uuid.uuid4())
        app_id = str(uuid.uuid4())

        mock_condition = MagicMock(spec=ApplicationCondition)
        mock_condition.id = condition_id
        mock_condition.status = "pending"
        mock_condition.application_id = app_id
        mock_condition.description = "Test condition"
        mock_condition.updated_at = None

        with patch('apps.applications.condition_manager.transaction') as mock_tx:
            mock_tx.atomic.return_value.__enter__ = MagicMock(return_value=None)
            mock_tx.atomic.return_value.__exit__ = MagicMock(return_value=False)

            with patch.object(
                ApplicationCondition.objects, 'select_for_update'
            ) as mock_sfu:
                mock_qs = MagicMock()
                mock_qs.get.return_value = mock_condition
                mock_sfu.return_value = mock_qs

                with patch.object(
                    ConditionManager, 'auto_promote_if_all_met'
                ) as mock_auto_promote:
                    with patch('apps.applications.condition_manager.Application') as MockApp:
                        MockApp.objects.get.return_value = MagicMock()
                        with patch(
                            'apps.applications.condition_manager.CommunicationService',
                            create=True,
                        ):
                            try:
                                ConditionManager.verify_condition(
                                    condition_id, status, admin_id
                                )
                            except Exception:
                                pass

                    mock_auto_promote.assert_called_once_with(app_id)


# ---------------------------------------------------------------------------
# Bug 5 Preservation — review transitions still set review_started_at
# ---------------------------------------------------------------------------

# Review target statuses that SHOULD set review_started_at when it's None
REVIEW_TRANSITIONS = []
for old_status, targets in ALLOWED_TRANSITIONS.items():
    for target in targets:
        if target in ("under_review", "conditionally_approved", "approved", "rejected"):
            REVIEW_TRANSITIONS.append((old_status, target))


class TestBug5PreservationReviewTransitionsSetReviewStartedAt:
    """Preservation: transitions to under_review, conditionally_approved,
    approved, rejected still set review_started_at when it was None.

    **Validates: Requirements 3.9, 3.10**
    """

    @given(transition=st.sampled_from(REVIEW_TRANSITIONS))
    @settings(max_examples=20, deadline=None)
    def test_review_transition_sets_review_started_at(self, transition):
        """review_started_at must be set to a non-None value when
        transitioning to a review status and it was previously None."""

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

        with patch('apps.applications.services.ApplicationStatusHistory') as MockHistory:
            MockHistory.objects.create.return_value = MagicMock()

            transition_application_status(
                application=mock_app,
                new_status=new_status,
                changed_by=user_id,
            )

        assert mock_app.review_started_at is not None, (
            f"review_started_at should be set for '{old_status}' → '{new_status}' "
            f"transition, but it remained None."
        )


class TestBug5PreservationAllowedTransitionsEnforced:
    """Preservation: ALLOWED_TRANSITIONS enforcement still raises ValueError
    for invalid transitions.

    **Validates: Requirements 3.9, 3.10**
    """

    @given(
        old_status=st.sampled_from(list(ALLOWED_TRANSITIONS.keys())),
        new_status=st.sampled_from([
            "under_review", "approved", "rejected", "submitted",
            "conditionally_approved", "waitlisted", "enrolled",
            "withdrawn", "expired", "enrollment_expired",
        ]),
    )
    @settings(max_examples=20, deadline=None)
    def test_invalid_transitions_raise_value_error(self, old_status, new_status):
        """Transitions not in ALLOWED_TRANSITIONS must raise ValueError."""

        allowed = ALLOWED_TRANSITIONS.get(old_status, set())
        if new_status in allowed:
            # This is a valid transition — skip
            return

        user_id = str(uuid.uuid4())

        mock_app = MagicMock(spec=Application)
        mock_app.id = str(uuid.uuid4())
        mock_app.status = old_status
        mock_app.review_started_at = None

        with pytest.raises(ValueError):
            transition_application_status(
                application=mock_app,
                new_status=new_status,
                changed_by=user_id,
            )


class TestBug5PreservationStatusHistoryCreated:
    """Preservation: ApplicationStatusHistory is still created for every
    valid transition.

    **Validates: Requirements 3.9, 3.10**
    """

    @given(transition=st.sampled_from(REVIEW_TRANSITIONS))
    @settings(max_examples=15, deadline=None)
    def test_status_history_created_on_valid_transition(self, transition):
        """A valid transition must create an ApplicationStatusHistory record."""

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

        with patch('apps.applications.services.ApplicationStatusHistory') as MockHistory:
            MockHistory.objects.create.return_value = MagicMock()

            transition_application_status(
                application=mock_app,
                new_status=new_status,
                changed_by=user_id,
            )

            MockHistory.objects.create.assert_called_once()
            call_kwargs = MockHistory.objects.create.call_args[1]
            assert call_kwargs['application'] == mock_app
            assert call_kwargs['status'] == new_status
            assert call_kwargs['old_status'] == old_status
            assert call_kwargs['new_status'] == new_status
            assert call_kwargs['changed_by_id'] == user_id
