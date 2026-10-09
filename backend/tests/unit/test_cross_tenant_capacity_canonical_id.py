"""Cross-tenant denial: capacity/config must resolve by canonical id, not display name.

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/``
Requirements: **R7.6, R10.6, R4.4, R14.3**
Findings:     **DATA-01, STU-01** (both P0) via **GATE-13.2-01** /
              **GATE-13.5-02** — remediation item **L1** of
              ``docs/v2-evidence/13.6/README.md`` §8.1.

The defect
----------
Five reads in the admissions domain resolved a canonical row from the
application's **display snapshot string** rather than from the canonical id the
application already carries::

    Intake.objects.filter(name=app.intake, is_active=True).first()

``docs/canonical-truth-map.md`` is explicit that ``applications.institution /
program / intake`` are *display snapshots only* and that canonical IDs are the
sole authority. A name-keyed lookup has no ordering, so when two tenants share
an intake **name** the row Postgres happens to yield first wins — and the staff
read publishes *that* tenant's capacity on *this* tenant's application.

This is not hypothetical. Task 13.5 preflight gate 21 measured **3 intake names
shared across the 2 active institutions** on the restored production-lineage
snapshot, so the collision these tests build by hand already exists in
production data.

What these tests pin
--------------------
Two institutions, **one shared intake name**, deliberately different capacities,
deadlines, calendar events and fees. For each of the five call sites, a read on
tenant A's application must surface tenant A's own number — and must **never**
surface tenant B's. Per ``.kiro/steering/enterprise-tenancy.md`` ("Cross-tenant
denial tests are required") each assertion is paired with the positive case, so
a pass means *scope*, not merely *absence*.

The sixth class of test is the **fail-closed** rule: an application with no
canonical intake id must publish **no** capacity rather than falling back to a
name lookup. Silence is the correct answer; another tenant's number is not.

**Validates: Requirements R7.6, R10.6, R4.4**
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.catalog.models import AcademicCalendarEvent, Intake
from tests.tenant_fixtures import build_tenant_world

# Deliberately different so a wrong row is observable rather than merely
# possible (the technique task 13.2 §2 used to make GATE-13.2-01 visible).
A_CAPACITY = 41
B_CAPACITY = 97


@pytest.fixture()
def shared_name_worlds(db):
    """Two tenant worlds whose intakes share one ``name`` (the live collision).

    Everything else differs: capacity, application deadline, and the
    ``enrollment_confirmation_deadline`` calendar event. The applications are
    ``submitted`` so the review/queue reads under test apply.
    """
    shared_intake_name = f"Shared Intake Name {uuid.uuid4().hex[:8]}"

    world_a = build_tenant_world(
        max_capacity=A_CAPACITY,
        application_status="submitted",
    )
    world_b = build_tenant_world(
        max_capacity=B_CAPACITY,
        application_status="submitted",
    )

    # Collapse the two intake names onto one another, and keep each
    # application's display snapshot consistent with its own intake — exactly
    # the production shape: same name, different tenant, different capacity.
    for world, capacity, deadline_days in ((world_a, A_CAPACITY, 60), (world_b, B_CAPACITY, 5)):
        Intake.objects.filter(id=world.intake.id).update(
            name=shared_intake_name,
            max_capacity=capacity,
            current_enrollment=capacity // 2,
            application_deadline=date.today() + timedelta(days=deadline_days),
        )
        world.intake.refresh_from_db()
        Application.objects.filter(id=world.application.id).update(intake=shared_intake_name)
        world.application.refresh_from_db()

    return world_a, world_b


def _grant_review(world):
    """Give the world's staff member ``tenant.application.review``.

    ``build_tenant_world`` creates a membership with an empty ``permissions``
    bundle, which resolves to the tenant **read** set only (the
    read-by-default / mutate-only-when-granted rule). The review command needs
    the review capability, so it is granted explicitly rather than assumed.
    """
    membership = world.membership
    membership.permissions = ["read", "review"]
    membership.save(update_fields=["permissions"])
    return world


def _staff_client(world) -> APIClient:
    """An APIClient authenticated as ``world``'s single-school staff admin."""
    staff = world.staff
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(staff.id),
                "email": staff.email,
                "role": staff.role,
                "first_name": staff.first_name,
                "last_name": staff.last_name,
            }
        )
    )
    return client


@pytest.mark.django_db
class TestStaffApplicationReadCapacity:
    """``student_draft_views.py`` — ``GET /api/v1/applications/{id}/`` (the primary site).

    **Validates: Requirements R7.6, R4.4**
    """

    def test_read_publishes_own_tenant_capacity_never_the_other(self, shared_name_worlds):
        world_a, world_b = shared_name_worlds
        client = _staff_client(world_a)

        response = client.get(f"/api/v1/applications/{world_a.application.id}/")

        assert response.status_code == 200, response.content
        data = response.json()["data"]
        assert data["intake_capacity"] == A_CAPACITY, (
            "tenant A's application must report tenant A's own intake capacity"
        )
        assert data["intake_capacity"] != B_CAPACITY
        assert data["intake_enrollment"] == world_a.intake.current_enrollment

    def test_read_of_other_tenant_application_is_still_not_found(self, shared_name_worlds):
        """The pairing that makes the row above mean *scope*: the same actor
        cannot read tenant B's application at all (R4.4 masked 404)."""
        world_a, world_b = shared_name_worlds
        client = _staff_client(world_a)

        response = client.get(f"/api/v1/applications/{world_b.application.id}/")

        assert response.status_code == 404
        assert b"intake_capacity" not in response.content

    def test_legacy_row_without_canonical_intake_publishes_no_capacity(self, shared_name_worlds):
        """Fail closed: no canonical intake id → no capacity, not a name lookup."""
        world_a, _world_b = shared_name_worlds
        Application.objects.filter(id=world_a.application.id).update(intake_ref=None)
        client = _staff_client(world_a)

        response = client.get(f"/api/v1/applications/{world_a.application.id}/")

        assert response.status_code == 200, response.content
        data = response.json()["data"]
        assert "intake_capacity" not in data, (
            "an application with no canonical intake id must publish no capacity "
            "rather than falling back to a name lookup"
        )
        assert "intake_enrollment" not in data


@pytest.mark.django_db
class TestReviewCommandCapacity:
    """``admin_review_views.py`` — the review command's capacity echo.

    **Validates: Requirements R7.6, R4.4**
    """

    def test_review_response_echoes_own_tenant_capacity(self, shared_name_worlds):
        world_a, _world_b = shared_name_worlds
        client = _staff_client(_grant_review(world_a))

        response = client.patch(
            f"/api/v1/applications/{world_a.application.id}/review/",
            {"status": "under_review", "notes": "cross-tenant capacity probe"},
            format="json",
        )

        assert response.status_code == 200, response.content
        data = response.json()["data"]
        assert data.get("intake_capacity") == A_CAPACITY, (
            "the review command must echo the reviewed application's own capacity"
        )
        assert data.get("intake_capacity") != B_CAPACITY


@pytest.mark.django_db
class TestReviewQueueDeadlineUrgency:
    """``review_queue.py`` — deadline urgency must read the app's own intake.

    **Validates: Requirements R7.6**
    """

    def test_urgency_uses_own_intake_deadline(self, shared_name_worlds):
        from apps.applications.review_queue import ReviewQueueScorer

        world_a, world_b = shared_name_worlds
        # A's deadline is 60 days out (urgency 50); B's is 5 days out (80).
        urgency_a = ReviewQueueScorer()._deadline_urgency(world_a.application)
        urgency_b = ReviewQueueScorer()._deadline_urgency(world_b.application)

        assert urgency_a == 50, "A's own deadline is 60 days out — not urgent"
        assert urgency_b == 80, "B's own deadline is 5 days out — urgent"


@pytest.mark.django_db
class TestEnrollmentDeadlineCalendar:
    """``enrollment_service.py`` — the calendar event must be the app's own.

    **Validates: Requirements R7.6**
    """

    def test_deadline_comes_from_own_tenant_calendar_event(self, shared_name_worlds):
        from apps.applications.enrollment_service import EnrollmentService

        world_a, world_b = shared_name_worlds
        event_date_a = date.today() + timedelta(days=30)
        event_date_b = date.today() + timedelta(days=200)
        for intake, event_date in ((world_a.intake, event_date_a), (world_b.intake, event_date_b)):
            AcademicCalendarEvent.objects.create(
                id=uuid.uuid4(),
                intake=intake,
                event_type="enrollment_confirmation_deadline",
                event_date=event_date,
                description=f"Enrollment deadline for intake {intake.id}",
            )

        deadline_a = EnrollmentService.compute_deadline(world_a.application)
        deadline_b = EnrollmentService.compute_deadline(world_b.application)

        assert deadline_a.date() == event_date_a, (
            "A's enrollment deadline must come from A's own intake calendar"
        )
        assert deadline_b.date() == event_date_b


@pytest.mark.django_db
class TestLateFeeOffering:
    """``services.py`` — the late-application fee must be the app's own offering's.

    **Validates: Requirements R7.6**
    """

    def test_late_fee_resolves_own_offering_fee(self, shared_name_worlds):
        from apps.documents.models import ProgramFee

        world_a, world_b = shared_name_worlds
        # Same offering NAME on both tenants, different late fee.
        offering_name = f"Shared Offering Name {uuid.uuid4().hex[:8]}"
        for world, amount in ((world_a, Decimal("50.00")), (world_b, Decimal("500.00"))):
            world.offering.name = offering_name
            world.offering.save(update_fields=["name"])
            Application.objects.filter(id=world.application.id).update(program=offering_name)
            ProgramFee.objects.create(
                id=uuid.uuid4(),
                program=world.offering,
                fee_type="late_application",
                residency_category="local",
                amount=amount,
                currency="ZMW",
                is_active=True,
                created_at=timezone.now(),
            )
        world_a.application.refresh_from_db()

        from apps.applications.services import _resolve_offering_for_fees

        resolved = _resolve_offering_for_fees(world_a.application)
        assert resolved is not None
        assert str(resolved.id) == str(world_a.offering.id), (
            "the late fee must resolve through the application's own canonical "
            "offering id, not a same-name other tenant's offering"
        )
