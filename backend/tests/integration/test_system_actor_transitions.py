"""Real-DB integration tests for system-actor transitions.

These tests exercise the full code path WITHOUT mocking
``apps.applications.services.transition_application_status``. The pre-existing
unit tests in ``test_expiry.py``, ``test_conditions.py``, ``test_waitlist.py``
all mock that function, which is precisely why the historical
``changed_by="system"`` FK-type bug was silent in production.

This module is the regression net: every automated transition that previously
passed the literal string ``"system"`` is exercised here against a real
Postgres connection. If the bug ever returns, these tests will fail loudly.

Requirement: F5 (Stream 5 — System Actor Truth) of the canonical-truth program.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.applications.services import SYSTEM_ACTOR_ID


pytestmark = pytest.mark.django_db(transaction=True)


# ---------------------------------------------------------------------------
# Test fixtures (real rows, no mocks)
# ---------------------------------------------------------------------------


@pytest.fixture
def system_actor_profile(db):
    """Ensure the system-actor profile row exists.

    Mirrors backend/scripts/system_actor_seed.sql so the integration tests
    can run on a fresh database without the seed having been applied
    separately.
    """
    from apps.accounts.models import Profile

    profile, _ = Profile.objects.get_or_create(
        id=uuid.UUID(SYSTEM_ACTOR_ID),
        defaults={
            "email": "system@mihas.internal",
            "role": "super_admin",
            "is_active": False,
            "first_name": "System",
            "last_name": "Actor",
        },
    )
    return profile


@pytest.fixture
def student_profile(db):
    from apps.accounts.models import Profile

    return Profile.objects.create(
        id=uuid.uuid4(),
        email=f"student-{uuid.uuid4().hex[:6]}@example.com",
        role="student",
        is_active=True,
        first_name="Test",
        last_name="Student",
    )


def _make_application(
    student_profile,
    *,
    status: str,
    days_old: int = 0,
    program: str = "Diploma in Nursing",
    intake: str = "January 2026",
):
    """Build a real Application row with a configurable updated_at age."""
    from apps.applications.models import Application

    now = timezone.now()
    updated_at = now - timedelta(days=days_old)
    return Application.objects.create(
        id=uuid.uuid4(),
        application_number=f"TEST{now.year}{uuid.uuid4().hex[:5].upper()}",
        user=student_profile,
        full_name="Test Student",
        date_of_birth="2000-01-01",
        sex="Male",
        phone="+260971234567",
        email=student_profile.email,
        residence_town="Lusaka",
        program=program,
        intake=intake,
        institution="MIHAS",
        status=status,
        submitted_at=updated_at if status != "draft" else None,
        created_at=updated_at,
        updated_at=updated_at,
    )


# ---------------------------------------------------------------------------
# Stream 5 regression tests
# ---------------------------------------------------------------------------


class TestSystemActorIdGuard:
    """The UUID guard rejects non-UUID changed_by values up front."""

    def test_string_literal_system_is_rejected(self, system_actor_profile, student_profile):
        """The historical bug — passing the literal string "system" — must
        now raise a clear ValueError, not a silent FK error."""
        from apps.applications.services import transition_application_status

        app = _make_application(student_profile, status="draft")
        with pytest.raises(ValueError, match="changed_by must be a UUID"):
            transition_application_status(
                application=app,
                new_status="expired",
                changed_by="system",
            )

    def test_arbitrary_string_is_rejected(self, system_actor_profile, student_profile):
        from apps.applications.services import transition_application_status

        app = _make_application(student_profile, status="draft")
        with pytest.raises(ValueError, match="changed_by must be a UUID"):
            transition_application_status(
                application=app,
                new_status="expired",
                changed_by="not-a-uuid",
            )

    def test_valid_uuid_is_accepted(self, system_actor_profile, student_profile):
        from apps.applications.services import transition_application_status

        app = _make_application(student_profile, status="draft")
        # Should not raise.
        transition_application_status(
            application=app,
            new_status="expired",
            changed_by=SYSTEM_ACTOR_ID,
        )
        app.refresh_from_db()
        assert app.status == "expired"


class TestDraftExpiryTask:
    """draft_expiry_reminder_task expires drafts >30 days old via SYSTEM_ACTOR_ID."""

    def test_30_day_old_draft_is_actually_expired(self, system_actor_profile, student_profile):
        from apps.applications.models import Application, ApplicationStatusHistory
        from apps.applications.tasks import draft_expiry_reminder_task

        app = _make_application(student_profile, status="draft", days_old=35)

        result = draft_expiry_reminder_task()

        app.refresh_from_db()
        assert app.status == "expired", (
            f"Draft should have been expired by the task, but status is {app.status!r}. "
            f"This indicates the system-actor FK regression has returned."
        )

        history = (
            ApplicationStatusHistory.objects
            .filter(application_id=app.id, new_status="expired")
            .first()
        )
        assert history is not None, "Expected a status history row for the expiry"
        assert str(history.changed_by_id) == SYSTEM_ACTOR_ID

        assert isinstance(result, dict)
        assert result.get("expired", 0) >= 1


class TestConditionExpiryTask:
    """condition_expiry_task auto-rejects applications with expired conditions."""

    def test_expired_conditions_trigger_auto_rejection(
        self, system_actor_profile, student_profile
    ):
        from apps.applications.models import Application, ApplicationCondition
        from apps.applications.tasks import condition_expiry_task

        app = _make_application(student_profile, status="conditionally_approved")
        # Create a condition with a deadline already in the past.
        ApplicationCondition.objects.create(
            application=app,
            description="Submit final transcripts",
            condition_type="academic",
            deadline=(timezone.now() - timedelta(days=1)).date(),
            status="pending",
        )

        condition_expiry_task()

        app.refresh_from_db()
        assert app.status == "rejected", (
            f"Application should be auto-rejected when conditions expire, "
            f"got status {app.status!r}. Indicates SYSTEM_ACTOR_ID regression."
        )


class TestEnrollmentConfirmationExpiryTask:
    """enrollment_confirmation_expiry_task moves stale approved apps to enrollment_expired."""

    def test_stale_approved_app_transitions_to_enrollment_expired(
        self, system_actor_profile, student_profile
    ):
        from apps.applications.models import Application
        from apps.applications.tasks import enrollment_confirmation_expiry_task

        app = _make_application(student_profile, status="approved")
        # Set the deadline in the past.
        app.enrollment_confirmation_deadline = timezone.now() - timedelta(days=1)
        app.save(update_fields=["enrollment_confirmation_deadline"])

        enrollment_confirmation_expiry_task()

        app.refresh_from_db()
        assert app.status == "enrollment_expired", (
            f"Application should transition to enrollment_expired when the "
            f"deadline passes; got {app.status!r}."
        )


class TestWaitlistManagerPromote:
    """WaitlistManager.promote_next promotes the next waitlisted application."""

    def test_promote_next_transitions_to_approved(
        self, system_actor_profile, student_profile
    ):
        from apps.applications.models import Application
        from apps.applications.waitlist_manager import WaitlistManager

        app = _make_application(student_profile, status="waitlisted")
        app.waitlist_position = 1
        app.save(update_fields=["waitlist_position"])

        promoted = WaitlistManager.promote_next(
            program=app.program, intake=app.intake
        )

        assert promoted is not None
        assert promoted.id == app.id
        promoted.refresh_from_db()
        assert promoted.status == "approved", (
            f"Waitlist promotion should transition to approved; got {promoted.status!r}."
        )
