"""R7 exploration: decisions and decision documents (P0b; fixed in task 5).

Spec: student-journey-repair task 1.7, clauses 1.34, 1.36, 1.37
(design R7-a, R7-c, R7-d).

* ``seed_school_admins`` creates memberships with no permissions, so a seeded
  school admin holds only the read bundle and every review command is 403. A
  re-run never adds ``review`` to the memberships it created.
* ``conditionally_approved`` with no conditions takes the plain transition branch
  and is accepted, recording a conditional offer with nothing to meet.
* A letter GET for a tenant with no document profile answers ``not_requested``,
  so the student is offered a Prepare action that can only fail.

The membership and grant model is measured for real (no test admin shortcut).
Emails and codes are fictional.
"""
from __future__ import annotations

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.accounts.models import Profile
from apps.applications.models import Application
from apps.catalog.models import UserInstitutionMembership
from apps.catalog.services import AccessScopeService
from apps.common.models import AuditLog
from tests.tenant_fixtures import build_membership, build_profile, build_tenant_world

pytestmark = pytest.mark.django_db(transaction=True)

# A fictional local credential; never a real secret.
SEED_PASSWORD = "Sjr-seed-0nly-local!"


@pytest.fixture(autouse=True)
def production_scope(monkeypatch):
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


def _client(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": profile.role,
                "first_name": profile.first_name,
                "last_name": profile.last_name,
                "token_type": "access",
            }
        )
    )
    return client


def _seed(world, email):
    call_command(
        "seed_school_admins",
        "--admin",
        f"{world.institution.code}={email}",
        "--password",
        SEED_PASSWORD,
    )
    return Profile.objects.get(email__iexact=email)


# --- R7-a: seeded admins can decide (task 5.1) -----------------------------


def test_a_seeded_school_admin_can_review():
    world = build_tenant_world(application_status="submitted")
    admin = _seed(world, "decider@example-school.test")

    response = _client(admin).post(
        f"/api/v1/applications/{world.application.id}/review/",
        {"new_status": "under_review"},
        format="json",
    )

    # HEAD: 403, because the membership was created with no permissions.
    assert response.status_code != 403, response.content
    assert response.status_code == 200, response.content
    membership = UserInstitutionMembership.objects.get(user=admin, institution=world.institution)
    assert "review" in (membership.permissions or [])


def test_a_rerun_adds_review_to_a_membership_the_old_command_created():
    world = build_tenant_world(application_status="submitted")
    admin = build_profile(role="admin")
    admin.email = "legacy-seed@example-school.test"
    admin.save(update_fields=["email"])
    # What the command at HEAD leaves behind: an active admin membership, [].
    membership = build_membership(
        user=admin, institution=world.institution, role="admin", permissions=[]
    )

    _seed(world, admin.email)

    membership.refresh_from_db()
    assert "review" in (membership.permissions or [])
    # Scoped to this membership: audit_logs is unmanaged and not flushed between
    # tests, so a global count also sees rows other seed tests wrote (5.1).
    events = AuditLog.objects.filter(
        action="tenant.membership.permissions_seeded", entity_id=membership.id
    )
    assert events.count() == 1
    assert events.first().changes.get("permissions_before") == []


# --- R7-c: conditional offers carry conditions (task 5.3) ------------------


def test_conditionally_approved_without_conditions_is_refused():
    world = build_tenant_world(application_status="under_review")
    Application.objects.filter(id=world.application.id).update(payment_status="verified")
    admin = build_profile(role="admin")
    build_membership(user=admin, institution=world.institution, role="admin", permissions=["review"])

    response = _client(admin).post(
        f"/api/v1/applications/{world.application.id}/review/",
        {"new_status": "conditionally_approved"},
        format="json",
    )

    # HEAD: 200; the application becomes a conditional offer with nothing to meet.
    assert response.status_code == 400, response.content
    assert response.json()["code"] == "NO_CONDITIONS_PROVIDED"
    world.application.refresh_from_db()
    assert world.application.status == "under_review"


# --- R7-d: letters without a profile (task 5.4) ----------------------------


def test_a_letter_for_a_tenant_with_no_profile_is_setup_required():
    world = build_tenant_world(application_status="approved")

    response = _client(world.student).get(
        f"/api/v1/applications/{world.application.id}/official-documents/acceptance_letter/"
    )

    assert response.status_code == 200, response.content
    data = response.json()["data"]
    # HEAD: "not_requested", which offers a Prepare that can only fail.
    assert data["status"] == "setup_required"
    assert data.get("error_code") == "DOCUMENT_PROFILE_NOT_CONFIGURED"
