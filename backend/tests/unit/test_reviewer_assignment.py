"""Reviewer membership, eligibility, assignment, queue, and workload tests.

Admissions V2 canonical rebuild — task 2.5 (findings AUTH-01, AUTH-03),
Requirements R3, R8.2-R8.4, design §5.2/§5.3.

These are DB-backed (no mocks): assignment now locks rows and enforces
tenant membership/eligibility through ``ReviewerAssignmentService``, so the
previous mock-of-``Application.objects`` tests can no longer exercise the real
path. Pure-logic tests for the queue scorer and the assigned-reviewer filter
are retained unchanged.
"""

import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.applications.reviewer_assignment_service import (
    ReviewerAssignmentError,
    ReviewerAssignmentService,
)
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import (
    build_application,
    build_membership,
    build_profile,
    build_tenant_world,
    build_two_tenant_worlds,
)


def _client_for(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": profile.role,
                "first_name": profile.first_name,
                "last_name": profile.last_name,
            }
        )
    )
    return client


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    """Exercise membership/grant authority, never the test-admin shortcut."""
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


# ---------------------------------------------------------------------------
# Eligibility policy (design §5.3): membership + reviewer-capable role
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestReviewerEligibility:
    def test_member_reviewer_is_eligible(self):
        world = build_tenant_world()
        reviewer = build_profile(role="reviewer")
        build_membership(user=reviewer, institution=world.institution, role="reviewer")

        assert ReviewerAssignmentService.is_eligible_reviewer(
            reviewer, world.institution.id
        )

    def test_reviewer_without_membership_not_eligible(self):
        world = build_tenant_world()
        reviewer = build_profile(role="reviewer")  # no membership anywhere

        assert not ReviewerAssignmentService.is_eligible_reviewer(
            reviewer, world.institution.id
        )

    def test_inactive_membership_not_eligible(self):
        world = build_tenant_world()
        reviewer = build_profile(role="reviewer")
        build_membership(
            user=reviewer,
            institution=world.institution,
            role="reviewer",
            is_active=False,
        )

        assert not ReviewerAssignmentService.is_eligible_reviewer(
            reviewer, world.institution.id
        )

    def test_cross_tenant_membership_not_eligible(self):
        world_a, world_b = build_two_tenant_worlds()
        reviewer = build_profile(role="reviewer")
        build_membership(user=reviewer, institution=world_b.institution, role="reviewer")

        # Member of B is not eligible for A.
        assert not ReviewerAssignmentService.is_eligible_reviewer(
            reviewer, world_a.institution.id
        )
        assert ReviewerAssignmentService.is_eligible_reviewer(
            reviewer, world_b.institution.id
        )

    def test_student_role_not_eligible_even_with_membership(self):
        world = build_tenant_world()
        student = build_profile(role="student")
        build_membership(user=student, institution=world.institution, role="student")

        assert not ReviewerAssignmentService.is_eligible_reviewer(
            student, world.institution.id
        )

    def test_candidates_are_tenant_scoped(self):
        world_a, world_b = build_two_tenant_worlds()
        rev_a = build_profile(role="reviewer")
        build_membership(user=rev_a, institution=world_a.institution, role="reviewer")
        rev_b = build_profile(role="reviewer")
        build_membership(user=rev_b, institution=world_b.institution, role="reviewer")

        candidate_ids = set(
            str(pk)
            for pk in ReviewerAssignmentService.eligible_reviewers_queryset(
                [world_a.institution.id]
            ).values_list("id", flat=True)
        )

        assert str(rev_a.id) in candidate_ids
        assert str(rev_b.id) not in candidate_ids  # cross-tenant reviewer excluded

    def test_candidate_search_filters_by_name(self):
        world = build_tenant_world()
        alice = build_profile(role="reviewer", first_name="Alice", last_name="Mumba")
        build_membership(user=alice, institution=world.institution, role="reviewer")
        bob = build_profile(role="reviewer", first_name="Bob", last_name="Zulu")
        build_membership(user=bob, institution=world.institution, role="reviewer")

        results = set(
            str(pk)
            for pk in ReviewerAssignmentService.eligible_reviewers_queryset(
                [world.institution.id], search="alice"
            ).values_list("id", flat=True)
        )

        assert str(alice.id) in results
        assert str(bob.id) not in results


# ---------------------------------------------------------------------------
# Manual assignment endpoint (AUTH-03): payload + eligibility + no leakage
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestManualAssignmentEndpoint:
    def _assign(self, actor, application_id, body):
        return _client_for(actor).post(
            f"/api/v1/applications/{application_id}/assign/", body, format="json"
        )

    def test_assign_eligible_reviewer_succeeds(self):
        world = build_tenant_world(application_status="submitted")
        reviewer = build_profile(role="reviewer")
        build_membership(user=reviewer, institution=world.institution, role="reviewer")
        super_admin = build_profile(role="super_admin")

        resp = self._assign(
            super_admin, world.application.id, {"reviewer_id": str(reviewer.id)}
        )

        assert resp.status_code == 200, resp.content
        assert resp.json()["data"]["assigned_reviewer_id"] == str(reviewer.id)
        world.application.refresh_from_db()
        assert str(world.application.assigned_reviewer_id_id) == str(reviewer.id)

    def test_assign_reviewer_without_membership_rejected_no_mutation(self):
        world = build_tenant_world(application_status="submitted")
        outsider = build_profile(role="reviewer")  # no membership in the tenant
        super_admin = build_profile(role="super_admin")

        resp = self._assign(
            super_admin, world.application.id, {"reviewer_id": str(outsider.id)}
        )

        assert resp.status_code == 400, resp.content
        assert resp.json()["code"] == "REVIEWER_NOT_ELIGIBLE"
        world.application.refresh_from_db()
        assert world.application.assigned_reviewer_id_id is None  # no mutation

    def test_assign_cross_tenant_reviewer_rejected(self):
        world_a, world_b = build_two_tenant_worlds(application_status="submitted")
        reviewer_b = build_profile(role="reviewer")
        build_membership(user=reviewer_b, institution=world_b.institution, role="reviewer")
        super_admin = build_profile(role="super_admin")

        resp = self._assign(
            super_admin, world_a.application.id, {"reviewer_id": str(reviewer_b.id)}
        )

        assert resp.status_code == 400, resp.content
        assert resp.json()["code"] == "REVIEWER_NOT_ELIGIBLE"
        world_a.application.refresh_from_db()
        assert world_a.application.assigned_reviewer_id_id is None

    def test_empty_reviewer_id_rejected(self):
        """AUTH-03: the old client posted an empty reviewer_id."""
        world = build_tenant_world(application_status="submitted")
        super_admin = build_profile(role="super_admin")

        resp = self._assign(super_admin, world.application.id, {"reviewer_id": ""})

        assert resp.status_code == 400, resp.content
        assert resp.json()["code"] == "VALIDATION_ERROR"

    def test_missing_reviewer_id_rejected(self):
        world = build_tenant_world(application_status="submitted")
        super_admin = build_profile(role="super_admin")

        resp = self._assign(super_admin, world.application.id, {})

        assert resp.status_code == 400, resp.content
        assert resp.json()["code"] == "VALIDATION_ERROR"

    def test_unknown_application_returns_404(self):
        super_admin = build_profile(role="super_admin")
        reviewer = build_profile(role="reviewer")

        resp = self._assign(super_admin, uuid.uuid4(), {"reviewer_id": str(reviewer.id)})

        assert resp.status_code == 404, resp.content
        assert resp.json()["code"] == "NOT_FOUND"

    def test_student_cannot_assign(self):
        """A student is masked as not-found, not refused with a 403.

        Admissions-v2 task 9.4 moved this command off the ``IsSuperAdmin`` role
        class onto ``resolve_scoped_application`` + the derived
        ``tenant.application.review`` capability. A student has no tenant scope, so
        they now receive the canonical **404** every other application route gives
        them — the same body as an id that does not exist.

        A deliberate strengthening, not a regression: the previous 403 *confirmed
        the application existed* to a caller with no right to know that, which is
        exactly the disclosure R3.2 forbids. The command does not run either way.
        """
        world = build_tenant_world(application_status="submitted")
        student = build_profile(role="student")

        resp = self._assign(
            student, world.application.id, {"reviewer_id": str(uuid.uuid4())}
        )

        assert resp.status_code == 404, resp.content
        assert resp.json()["code"] == "NOT_FOUND"
        world.application.refresh_from_db()
        assert world.application.assigned_reviewer_id_id is None

    def test_regular_admin_cannot_assign(self):
        world = build_tenant_world(application_status="submitted")
        admin = build_profile(role="admin")
        build_membership(user=admin, institution=world.institution, role="admin")

        resp = self._assign(
            admin, world.application.id, {"reviewer_id": str(uuid.uuid4())}
        )

        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Assignment candidate search endpoint (R8.2)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAssignmentCandidatesEndpoint:
    def _get(self, actor, application_id, query=""):
        return _client_for(actor).get(
            f"/api/v1/applications/{application_id}/assignment-candidates/{query}"
        )

    def test_lists_only_eligible_tenant_members(self):
        world_a, world_b = build_two_tenant_worlds(application_status="submitted")
        rev_a = build_profile(role="reviewer")
        build_membership(user=rev_a, institution=world_a.institution, role="reviewer")
        rev_b = build_profile(role="reviewer")
        build_membership(user=rev_b, institution=world_b.institution, role="reviewer")
        super_admin = build_profile(role="super_admin")

        resp = self._get(super_admin, world_a.application.id)

        assert resp.status_code == 200, resp.content
        ids = {row["id"] for row in resp.json()["data"]}
        assert str(rev_a.id) in ids
        assert str(rev_b.id) not in ids

    def test_search_narrows_candidates(self):
        world = build_tenant_world(application_status="submitted")
        alice = build_profile(role="reviewer", first_name="Alice", last_name="Mumba")
        build_membership(user=alice, institution=world.institution, role="reviewer")
        bob = build_profile(role="reviewer", first_name="Bob", last_name="Zulu")
        build_membership(user=bob, institution=world.institution, role="reviewer")
        super_admin = build_profile(role="super_admin")

        resp = self._get(super_admin, world.application.id, "?search=Mumba")

        assert resp.status_code == 200, resp.content
        ids = {row["id"] for row in resp.json()["data"]}
        assert str(alice.id) in ids
        assert str(bob.id) not in ids

    def test_non_super_admin_denied(self):
        world = build_tenant_world(application_status="submitted")
        admin = build_profile(role="admin")
        build_membership(user=admin, institution=world.institution, role="admin")

        resp = self._get(admin, world.application.id)

        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Auto-assignment endpoint: tenant-eligible selection only (AUTH-03)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAutoAssignEndpoint:
    def _auto_assign(self, actor):
        return _client_for(actor).post("/api/v1/applications/auto-assign/", {}, format="json")

    def test_only_assigns_tenant_eligible_reviewers(self):
        world = build_tenant_world(application_status="submitted", staff_role="reviewer")
        eligible = world.staff  # reviewer with membership in the tenant
        outsider = build_profile(role="reviewer")  # no membership → ineligible
        super_admin = build_profile(role="super_admin")

        resp = self._auto_assign(super_admin)

        assert resp.status_code == 200, resp.content
        world.application.refresh_from_db()
        assigned = world.application.assigned_reviewer_id_id
        assert assigned is not None
        assert str(assigned) == str(eligible.id)
        assert str(assigned) != str(outsider.id)

    def test_no_eligible_reviewers_returns_error(self):
        # An unassigned submitted application whose tenant has no eligible
        # reviewer (staff exists but has no membership after we strip it).
        world = build_tenant_world(application_status="submitted", with_application=True)
        # Deactivate the only membership so nobody is eligible for the tenant.
        world.membership.is_active = False
        world.membership.save(update_fields=["is_active"])
        super_admin = build_profile(role="super_admin")

        resp = self._auto_assign(super_admin)

        assert resp.status_code == 400, resp.content
        assert resp.json()["code"] == "NO_REVIEWERS"
        world.application.refresh_from_db()
        assert world.application.assigned_reviewer_id_id is None


# ---------------------------------------------------------------------------
# Reviewer assignment scope (AUTH-01): only assigned review commands + queue
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestReviewerAssignmentScope:
    def _reviewer_with_review_cap(self, institution):
        reviewer = build_profile(role="reviewer")
        build_membership(
            user=reviewer,
            institution=institution,
            role="reviewer",
            permissions=["review"],
        )
        return reviewer

    def test_reviewer_can_review_assigned_application(self):
        world = build_tenant_world(application_status="submitted")
        reviewer = self._reviewer_with_review_cap(world.institution)
        world.application.assigned_reviewer_id = reviewer
        world.application.save(update_fields=["assigned_reviewer_id"])

        resp = _client_for(reviewer).post(
            f"/api/v1/applications/{world.application.id}/review/",
            {"new_status": "under_review"},
            format="json",
        )

        assert resp.status_code == 200, resp.content

    def test_reviewer_cannot_review_unassigned_application_in_tenant(self):
        world = build_tenant_world(application_status="submitted")
        reviewer = self._reviewer_with_review_cap(world.institution)
        # application is NOT assigned to this reviewer

        resp = _client_for(reviewer).post(
            f"/api/v1/applications/{world.application.id}/review/",
            {"new_status": "under_review"},
            format="json",
        )

        # 404 mask — an unassigned application's existence is not confirmed.
        assert resp.status_code == 404, resp.content

    def test_tenant_admin_can_review_unassigned_application(self):
        """Regression: a Tenant_Admin (admin role) is NOT assignment-scoped."""
        world = build_tenant_world(application_status="submitted")
        admin = build_profile(role="admin")
        build_membership(
            user=admin,
            institution=world.institution,
            role="admin",
            permissions=["review"],
        )

        resp = _client_for(admin).post(
            f"/api/v1/applications/{world.application.id}/review/",
            {"new_status": "under_review"},
            format="json",
        )

        assert resp.status_code == 200, resp.content

    def test_reviewer_queue_lists_only_assigned_work(self):
        world = build_tenant_world(application_status="submitted")
        reviewer = self._reviewer_with_review_cap(world.institution)
        # Assign only the first application to this reviewer.
        assigned_app = world.application
        assigned_app.assigned_reviewer_id = reviewer
        assigned_app.save(update_fields=["assigned_reviewer_id"])
        # A second, unassigned application in the same tenant.
        other_app = build_application(
            student=world.student,
            institution=world.institution,
            canonical_program=world.canonical_program,
            offering=world.offering,
            intake=world.intake,
            status="submitted",
        )

        resp = _client_for(reviewer).get("/api/v1/applications/")

        assert resp.status_code == 200, resp.content
        body = resp.json()
        results = body["data"]["results"] if isinstance(body.get("data"), dict) else body["data"]
        listed_ids = {row["id"] for row in results}
        assert str(assigned_app.id) in listed_ids
        assert str(other_app.id) not in listed_ids


# ---------------------------------------------------------------------------
# Retained pure-logic tests (unchanged behaviour)
# ---------------------------------------------------------------------------


class TestReviewQueueScorerAssignmentBonus:
    """Priority score bonus for assigned apps (Req 11.9)."""

    def test_assigned_app_gets_bonus(self):
        from unittest.mock import patch

        from apps.applications.review_queue import ReviewQueueScorer

        from unittest.mock import MagicMock

        app_assigned = MagicMock()
        app_assigned.payment_status = "paid"
        app_assigned.assigned_reviewer_id_id = uuid.uuid4()
        app_assigned.status = "submitted"
        app_assigned.review_started_at = None
        app_assigned.submitted_at = None

        app_unassigned = MagicMock()
        app_unassigned.payment_status = "paid"
        app_unassigned.assigned_reviewer_id_id = None
        app_unassigned.status = "submitted"
        app_unassigned.review_started_at = None
        app_unassigned.submitted_at = None

        scorer = ReviewQueueScorer()

        with patch.object(scorer, "_deadline_urgency", return_value=50):
            score_assigned = scorer.score(app_assigned, 80, False)
            score_unassigned = scorer.score(app_unassigned, 80, False)

        assert score_assigned.score > score_unassigned.score


class TestAssignedReviewerFilter:
    """ApplicationFilter supports assigned_reviewer_id (Req 11.8)."""

    def test_filter_has_assigned_reviewer_id(self):
        from apps.applications.filters import ApplicationFilter
        assert "assigned_reviewer_id" in ApplicationFilter.declared_filters

    def test_filter_has_reviewer_assignment_alias(self):
        from apps.applications.filters import ApplicationFilter
        assert "reviewer_assignment" in ApplicationFilter.declared_filters
