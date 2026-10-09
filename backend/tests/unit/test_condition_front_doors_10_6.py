"""Two staff condition front doors, one implementation.

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` task **10.6**.
Requirements: **R13.9** (per-condition review with a rejection reason),
              **R13.13** (one canonical owner), **R2.5** (measure before you
              remove).
Findings:     **STU-23**, **MAINT-01**, and the STU-16 gap task 10.2 §13 left
              open.

Task 10.2 gave the platform a three-outcome condition review
(``POST …/conditions/{cid}/review/``) beside the pre-existing two-outcome
``…/verify/``, made them share the one ``ConditionStateMachine``, and recorded in
its own evidence that choosing a single route belonged here.

What this task did, and what these cases pin:

1. ``/review/`` is **canonical** and the reviewer workspace uses it, so
   ``changes_required`` — the outcome a reviewer needs when evidence is *wrong*
   rather than absent — is reachable from the only place a reviewer works;
2. ``/verify/`` **decides nothing of its own** any more. It normalises its
   two-outcome request and delegates to ``review_condition``, so there is one
   implementation of the decision, one audit action, and one evidence-history
   writer. ``ConditionManager.verify_condition`` is no longer called by any view;
3. ``/verify/`` is **deprecated, not deleted**: it is a published staff route and
   R2.5 wants the measured window before removal. It answers with
   ``Deprecation``/``Link`` headers naming its successor;
4. its own contract is **preserved** across the delegation — a waiver still needs
   no reason *here*, its response shape is unchanged, and an already-resolved
   condition is still ``CONDITION_NOT_PENDING``.

Point 4 is the part worth being careful about. A deprecated route that quietly
adopts its successor's stricter rules breaks callers *and* hides the break behind
the word "deprecated". The canonical command requires a reason for a waiver; a
legacy caller of this route never sent one, so a documented fallback sentence is
recorded rather than a 400 returned.
"""

import uuid
from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import ApplicationCondition
from tests.tenant_fixtures import build_tenant_world, build_two_tenant_worlds

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _system_actor_profile(db):
    """Seed the system-actor profile that automated transitions write as.

    Resolving the last outstanding condition auto-promotes the application, and
    ``ConditionManager`` records that transition under ``SYSTEM_ACTOR_ID`` — a
    uuid FK into ``profiles``. The ephemeral test database is built from the
    models, so the row ``backend/scripts/system_actor_seed.sql`` provides in every
    real environment is absent and the deferred FK fails at teardown rather than
    inside the test, which is why the failure looked like a harness problem
    instead of a missing fixture. Same shape as
    ``tests/integration/test_capacity_waitlist_canonical_5_3.py``.
    """
    from apps.accounts.models import Profile
    from apps.applications.services import SYSTEM_ACTOR_ID

    Profile.objects.get_or_create(
        id=uuid.UUID(SYSTEM_ACTOR_ID),
        defaults={
            "email": "system@mihas.internal",
            "role": "student",
            "first_name": "System",
            "last_name": "Actor",
            "is_active": False,
            "created_at": timezone.now(),
            "updated_at": timezone.now(),
        },
    )


def _make_user(user_id=None, role="student"):
    uid = user_id or uuid.uuid4()
    return JWTUser(
        {
            "user_id": str(uid),
            "email": "staff@example.com",
            "role": role,
            "first_name": "Test",
            "last_name": "User",
        }
    )


def _client_for(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(user=_make_user(user_id=profile.id, role=profile.role))
    return client


def _grant_review(world):
    """Give the world's staff member the review capability.

    ``build_tenant_world`` creates a membership with an empty ``permissions``
    bundle, which resolves to the tenant **read** set only — the
    read-by-default/mutate-only-when-granted rule. A condition decision needs
    ``tenant.application.review``, so it is granted explicitly here rather than
    assumed, which is also the shape the negative cases below rely on.
    """
    membership = world.membership
    membership.permissions = ["read", "review"]
    membership.save(update_fields=["permissions"])
    return world


def _condition_for(application, status="pending", days=30) -> ApplicationCondition:
    now = timezone.now()
    return ApplicationCondition.objects.create(
        id=uuid.uuid4(),
        application=application,
        condition_type="document",
        description="Certified copy of your final transcript",
        deadline=(now + timedelta(days=days)).date(),
        status=status,
        created_at=now,
        updated_at=now,
    )


def _verify_url(application_id, condition_id) -> str:
    return (
        f"/api/v1/applications/{application_id}/conditions/{condition_id}/verify/"
    )


def _review_url(application_id, condition_id) -> str:
    return (
        f"/api/v1/applications/{application_id}/conditions/{condition_id}/review/"
    )


# ---------------------------------------------------------------------------
# 1. The deprecated door delegates rather than deciding
# ---------------------------------------------------------------------------
class TestVerifyDelegates:
    def test_no_view_calls_condition_manager_verify_condition(self):
        """The duplicate decision path is unreachable from the API surface.

        ``ConditionManager.verify_condition`` still exists — it is a service
        method and other callers may exist in future — but no *view* calls it, so
        there is exactly one implementation behind both routes.
        """
        import importlib
        import inspect
        import pkgutil

        import apps.applications as package

        offenders = []
        for module in pkgutil.iter_modules(package.__path__):
            if module.ispkg or not module.name.endswith("_views"):
                continue
            imported = importlib.import_module(f"apps.applications.{module.name}")
            source = inspect.getsource(imported)
            if "ConditionManager.verify_condition" in source:
                offenders.append(module.name)
        assert offenders == [], offenders

    def test_the_deprecated_door_names_its_successor(self):
        world = _grant_review(build_tenant_world(application_status="conditionally_approved"))
        condition = _condition_for(world.application)

        response = _client_for(world.staff).post(
            _verify_url(world.application.id, condition.id),
            {"status": "met"},
            format="json",
        )

        assert response.status_code == 200, response.content
        assert response["Deprecation"] == "true"
        assert "conditions/{cid}/review/" in response["Link"]

    def test_a_refusal_also_names_the_successor(self):
        """A legacy caller is told where the route went even when it says no."""
        world = _grant_review(build_tenant_world(application_status="conditionally_approved"))
        condition = _condition_for(world.application)

        response = _client_for(world.staff).post(
            _verify_url(world.application.id, condition.id),
            {"status": "not_a_status"},
            format="json",
        )

        assert response.status_code == 400
        assert response.json()["code"] == "VALIDATION_ERROR"
        assert response["Deprecation"] == "true"

    def test_the_canonical_route_still_answers(self):
        world = _grant_review(build_tenant_world(application_status="conditionally_approved"))
        condition = _condition_for(world.application)

        response = _client_for(world.staff).post(
            _review_url(world.application.id, condition.id),
            {"outcome": "met"},
            format="json",
        )

        assert response.status_code == 200, response.content
        condition.refresh_from_db()
        assert condition.status == "met"


# ---------------------------------------------------------------------------
# 2. The deprecated door's own contract survives the delegation
# ---------------------------------------------------------------------------
class TestVerifyContractPreserved:
    def test_met_still_works_with_no_notes(self):
        world = _grant_review(build_tenant_world(application_status="conditionally_approved"))
        condition = _condition_for(world.application)

        response = _client_for(world.staff).post(
            _verify_url(world.application.id, condition.id), {"status": "met"}, format="json"
        )

        assert response.status_code == 200, response.content
        condition.refresh_from_db()
        assert condition.status == "met"

    def test_waive_still_needs_no_reason_here(self):
        """The canonical command requires one; this route never did.

        Turning a working legacy request into a 400 would be a breaking change
        dressed up as a deprecation. A documented fallback reason is recorded
        instead, and it says where it came from so the audit trail and the
        student-facing note do not read as if a reviewer wrote it.
        """
        from apps.applications.admin_amendment_views import (
            ApplicationConditionVerifyView,
        )

        world = _grant_review(build_tenant_world(application_status="conditionally_approved"))
        condition = _condition_for(world.application)

        response = _client_for(world.staff).post(
            _verify_url(world.application.id, condition.id),
            {"status": "waived"},
            format="json",
        )

        assert response.status_code == 200, response.content
        condition.refresh_from_db()
        assert condition.status == "waived"
        assert condition.notes == ApplicationConditionVerifyView.LEGACY_WAIVER_REASON

    def test_an_extra_body_key_is_ignored_not_rejected(self):
        """A key this route never accepted still does not break the caller.

        ``ConditionVerifyRequestSerializer`` declares ``status`` and nothing else —
        it did before this task and it does after, so a reason has never been
        expressible through this door. The deprecated route is deliberately not
        given one now: extending the surface being retired is the opposite of
        consolidating it, and the canonical ``/review/`` command is where a
        reviewer's reason belongs.

        What matters for compatibility is that an unrecognised key is *ignored*
        rather than rejected, so a caller sending a hopeful ``notes`` gets the
        same 200 it always got — and the recorded reason is the documented
        fallback, not a sentence the platform pretends a reviewer wrote.
        """
        from apps.applications.admin_amendment_views import (
            ApplicationConditionVerifyView,
        )

        world = _grant_review(build_tenant_world(application_status="conditionally_approved"))
        condition = _condition_for(world.application)

        response = _client_for(world.staff).post(
            _verify_url(world.application.id, condition.id),
            {"status": "waived", "notes": "Equivalent qualification on file."},
            format="json",
        )

        assert response.status_code == 200, response.content
        condition.refresh_from_db()
        assert condition.status == "waived"
        assert condition.notes == ApplicationConditionVerifyView.LEGACY_WAIVER_REASON

    def test_the_published_request_body_is_status_only(self):
        """The contract, asserted against the serializer the schema publishes."""
        from apps.applications._view_helpers import ConditionVerifyRequestSerializer

        assert list(ConditionVerifyRequestSerializer().fields) == ["status"]

    def test_the_response_shape_is_unchanged(self):
        world = _grant_review(build_tenant_world(application_status="conditionally_approved"))
        condition = _condition_for(world.application)

        response = _client_for(world.staff).post(
            _verify_url(world.application.id, condition.id), {"status": "met"}, format="json"
        )

        body = response.json()
        assert body["success"] is True
        data = body["data"]
        # `ApplicationConditionSerializer`'s own fields, plus the two the versioned
        # command layer adds. Not the canonical read-back payload.
        for key in ("id", "status", "condition_type", "description"):
            assert key in data, key
        assert "version" in data
        assert "allowed_transitions" in data

    def test_an_already_resolved_condition_is_still_condition_not_pending(self):
        """The stable code a legacy caller branches on did not move.

        The canonical command answers ``CONDITION_ALREADY_RESOLVED`` with a 409;
        this door answered ``CONDITION_NOT_PENDING`` with a 400 and still does.
        """
        world = _grant_review(build_tenant_world(application_status="conditionally_approved"))
        condition = _condition_for(world.application, status="met")

        response = _client_for(world.staff).post(
            _verify_url(world.application.id, condition.id), {"status": "waived"}, format="json"
        )

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "CONDITION_NOT_PENDING"

    def test_an_unknown_condition_is_still_a_404(self):
        world = _grant_review(build_tenant_world(application_status="conditionally_approved"))

        response = _client_for(world.staff).post(
            _verify_url(world.application.id, uuid.uuid4()), {"status": "met"}, format="json"
        )

        assert response.status_code == 404
        assert response.json()["code"] == "NOT_FOUND"


# ---------------------------------------------------------------------------
# 3. Both doors keep the same authority and the same tenant mask
# ---------------------------------------------------------------------------
class TestBothDoorsShareAuthority:
    def test_a_student_cannot_use_either_door(self):
        world = _grant_review(build_tenant_world(application_status="conditionally_approved"))
        condition = _condition_for(world.application)
        client = _client_for(world.student)

        verify = client.post(
            _verify_url(world.application.id, condition.id), {"status": "met"}, format="json"
        )
        review = client.post(
            _review_url(world.application.id, condition.id), {"outcome": "met"}, format="json"
        )

        assert verify.status_code in (403, 404), verify.content
        assert review.status_code in (403, 404), review.content
        condition.refresh_from_db()
        assert condition.status == "pending"

    def test_out_of_tenant_staff_is_masked_on_both_doors(self):
        world_a, world_b = build_two_tenant_worlds(
            staff_role="admin",
            application_status="conditionally_approved",
        )
        # Tenant A's staff hold review authority for tenant A. The refusal below
        # must therefore be about *scope*, not about a missing capability.
        _grant_review(world_a)
        _grant_review(world_b)
        condition = _condition_for(world_b.application)
        client = _client_for(world_a.staff)

        verify = client.post(
            _verify_url(world_b.application.id, condition.id), {"status": "met"}, format="json"
        )
        review = client.post(
            _review_url(world_b.application.id, condition.id), {"outcome": "met"}, format="json"
        )

        assert verify.status_code in (403, 404), verify.content
        assert review.status_code in (403, 404), review.content
        condition.refresh_from_db()
        assert condition.status == "pending"


# ---------------------------------------------------------------------------
# 4. Both routes are still registered (the deprecation window, R2.5)
# ---------------------------------------------------------------------------
class TestBothRoutesStillRegistered:
    def test_the_deprecated_route_is_still_reachable(self):
        url = reverse(
            "applications:application-condition-verify",
            kwargs={"application_id": uuid.uuid4(), "condition_id": uuid.uuid4()},
        )
        assert url.endswith("/verify/")

    def test_the_canonical_route_is_registered(self):
        url = reverse(
            "applications:application-condition-review",
            kwargs={"application_id": uuid.uuid4(), "condition_id": uuid.uuid4()},
        )
        assert url.endswith("/review/")
