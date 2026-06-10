"""Unit tests — submission-time offering assignment revalidation.

Spec: ``multi-tenant-beanola-admissions`` — Phase 2, task 7.1 (Property 4 /
Requirements R2.7, R2.4).

``submit_application`` re-runs the offering assignment against the application's
**locked snapshot** canonical IDs + residency inputs. If the previously
assigned offering is no longer eligible it raises ``OFFERING_NO_LONGER_AVAILABLE``
(409); if its capacity filled before submit it raises ``OFFERING_CAPACITY_FULL``
(409). Both carry a recoverable next action — submission never silently succeeds
on a stale draft assignment. Revalidation is strictly additive: legacy rows with
null canonical IDs submit exactly as before.

These tests build a real tenant object graph with the shared fixtures in
``backend/tests/tenant_fixtures.py`` and run against the test DB.
"""

from __future__ import annotations

import pytest

from apps.applications.models import Application
from apps.applications.services import (
    ApplicationSubmissionError,
    submit_application,
)
from tests.tenant_fixtures import (
    build_document,
    build_tenant_world,
)

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_submittable_world(**kwargs):
    """Build a draft tenant world whose payment + identity-doc gates pass.

    Sets ``payment_status='verified'`` (a RESOLVED_PAYMENT_STATUSES value) and
    attaches an NRC document so the only thing left to exercise is the
    submission-time offering revalidation. Returns the ``TenantWorld``.
    """
    world = build_tenant_world(application_status="draft", **kwargs)
    Application.objects.filter(id=world.application.id).update(payment_status="verified")
    world.application.refresh_from_db()
    build_document(application=world.application, document_type="nrc")
    return world


def _submit(world):
    return submit_application(
        application=world.application,
        changed_by=str(world.student.id),
    )


# ---------------------------------------------------------------------------
# Happy path — still eligible → submit succeeds
# ---------------------------------------------------------------------------


class TestHappyPathStillEligible:
    def test_submit_succeeds_when_offering_still_eligible(self):
        """An active offering with available capacity submits normally."""
        world = _make_submittable_world(max_capacity=100, current_enrollment=0)

        submitted_app, old_status = _submit(world)

        assert old_status == "draft"
        assert submitted_app.status == "submitted"


# ---------------------------------------------------------------------------
# Capacity filled before submit → OFFERING_CAPACITY_FULL
# ---------------------------------------------------------------------------


class TestCapacityFilledAtSubmit:
    def test_draft_assigned_then_filled_returns_capacity_full(self):
        """Draft assigned to an offering, then that offering's capacity is
        filled before submit → OFFERING_CAPACITY_FULL (409)."""
        # Offering's program-intake is exhausted (capacity 1 / enrolled 1),
        # but the intake-level live count stays 0 so IntakeEnforcer still
        # allows the submission and the offering revalidation is what trips.
        world = _make_submittable_world(max_capacity=1, current_enrollment=1)

        with pytest.raises(ApplicationSubmissionError) as exc:
            _submit(world)

        assert exc.value.code == "OFFERING_CAPACITY_FULL"
        assert exc.value.status_code == 409
        # Recoverable: carries a waitlist next action, never a dead end.
        assert exc.value.next_action is not None
        assert exc.value.next_action["type"] == "join_waitlist"

        # Never silently succeeds — the row stays a draft.
        world.application.refresh_from_db()
        assert world.application.status == "draft"


# ---------------------------------------------------------------------------
# Offering archived / ineligible before submit → OFFERING_NO_LONGER_AVAILABLE
# ---------------------------------------------------------------------------


class TestOfferingArchivedAtSubmit:
    def test_draft_assigned_then_archived_returns_no_longer_available(self):
        """Draft assigned, then the offering is archived before submit →
        OFFERING_NO_LONGER_AVAILABLE (409)."""
        world = _make_submittable_world(max_capacity=100, current_enrollment=0)
        world.offering.offering_status = "archived"
        world.offering.save(update_fields=["offering_status"])

        with pytest.raises(ApplicationSubmissionError) as exc:
            _submit(world)

        assert exc.value.code == "OFFERING_NO_LONGER_AVAILABLE"
        assert exc.value.status_code == 409
        assert exc.value.next_action is not None
        assert exc.value.next_action["type"] == "choose_another_intake"

        world.application.refresh_from_db()
        assert world.application.status == "draft"

    def test_draft_assigned_then_residency_blocked_returns_no_longer_available(self):
        """If the offering's residency rules later exclude the locked snapshot
        residency, revalidation fails recoverably rather than silently
        succeeding."""
        world = _make_submittable_world(max_capacity=100, current_enrollment=0)
        # The application's locked snapshot country is "Zambia"; block it.
        world.offering.assignment_rules = {"exclude_countries": ["Zambia"]}
        world.offering.save(update_fields=["assignment_rules"])

        with pytest.raises(ApplicationSubmissionError) as exc:
            _submit(world)

        assert exc.value.code == "OFFERING_NO_LONGER_AVAILABLE"
        assert exc.value.status_code == 409


# ---------------------------------------------------------------------------
# Legacy null-canonical-ID application → submission unaffected
# ---------------------------------------------------------------------------


class TestLegacyApplicationUnaffected:
    def test_legacy_null_canonical_ids_submits_without_revalidation(self):
        """A pre-migration application with null canonical IDs is never forced
        through assignment — it submits exactly as before."""
        world = _make_submittable_world(with_canonical_ids=False)
        # Sanity: the row genuinely lacks canonical IDs.
        assert world.application.canonical_program_id is None
        assert world.application.program_offering_id is None
        assert world.application.intake_ref_id is None

        submitted_app, old_status = _submit(world)

        assert old_status == "draft"
        assert submitted_app.status == "submitted"

    def test_legacy_archived_offering_still_submits(self):
        """Even if a same-named offering is archived, a legacy null-canonical
        application is unaffected because revalidation keys on canonical IDs."""
        world = _make_submittable_world(with_canonical_ids=False, offering_status="archived")
        assert world.application.program_offering_id is None

        submitted_app, _old = _submit(world)

        assert submitted_app.status == "submitted"
