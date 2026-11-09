"""Preservation (g): re-running the seed command never removes granted authority.

Spec: student-journey-repair task 2.2, design "New preservation tests" (g),
clause 3.24.

The documented production command (``seed_school_admins --admin <CODE>=<email>
--password …``) creates a school admin's membership. An operator then sets that
membership's permissions to some set G in the admin UI (``PATCH
/api/v1/admin/memberships/{id}/``) and adds an access grant. Running the same
command twice more must leave the permissions a superset of G and the access
grant unchanged, and the second re-run must write no
``tenant.membership.permissions_seeded`` row.

This holds at HEAD (the command never touches an existing membership's
permissions) and must still hold after task 5.1, which makes the command add
``review`` by default. Codes, emails and the password are fictional.
"""
from __future__ import annotations

import uuid

import pytest
from django.core.management import call_command
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.accounts.models import Profile
from apps.catalog.admin_serializers import GRANT_PERMISSION_ALLOWLIST
from apps.catalog.models import AccessGrant, UserInstitutionMembership
from apps.common.models import AuditLog
from tests.tenant_fixtures import build_institution, build_profile

pytestmark = pytest.mark.django_db(transaction=True)

SEED_PASSWORD = "Sjr-seed-preservation-0nly!"
PERMISSION_SETS = st.sets(st.sampled_from(sorted(GRANT_PERMISSION_ALLOWLIST)), min_size=1)


def _super_admin_client() -> APIClient:
    profile = build_profile(role="super_admin")
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": "super_admin",
                "first_name": profile.first_name,
                "last_name": profile.last_name,
                "token_type": "access",
            }
        )
    )
    return client


def _grant_snapshot(grant_id):
    grant = AccessGrant.objects.get(id=grant_id)
    return (
        grant.user_id,
        grant.scope_type,
        grant.institution_id,
        sorted(grant.permissions or []),
        grant.is_active,
        grant.expires_at,
    )


@settings(
    max_examples=10,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture, HealthCheck.too_slow],
)
@given(granted=PERMISSION_SETS)
def test_reruns_keep_operator_grants(granted):
    suffix = uuid.uuid4().hex[:8]
    institution = build_institution(code=f"SJRX{suffix}".upper()[:12], suffix=suffix)
    email = f"seeded-{suffix}@example-school.test"
    command = ("seed_school_admins", "--admin", f"{institution.code}={email}", "--password", SEED_PASSWORD)

    call_command(*command)
    admin = Profile.objects.get(email__iexact=email)
    membership = UserInstitutionMembership.objects.get(user=admin, institution=institution)

    client = _super_admin_client()
    patched = client.patch(
        f"/api/v1/admin/memberships/{membership.id}/",
        {"permissions": sorted(granted)},
        format="json",
    )
    assert patched.status_code == 200, patched.content
    created = client.post(
        "/api/v1/admin/access-grants/",
        {
            "user_id": str(admin.id),
            "scope_type": "institution",
            "institution_id": str(institution.id),
            "permissions": ["view"],
        },
        format="json",
    )
    assert created.status_code == 201, created.content
    grant_id = created.json()["data"]["id"]
    grant_before = _grant_snapshot(grant_id)

    call_command(*command)
    membership.refresh_from_db()
    assert set(granted) <= set(membership.permissions or [])
    assert _grant_snapshot(grant_id) == grant_before
    seeded_after_first_rerun = AuditLog.objects.filter(
        action="tenant.membership.permissions_seeded", entity_id=membership.id
    ).count()

    call_command(*command)
    membership.refresh_from_db()
    assert set(granted) <= set(membership.permissions or [])
    assert _grant_snapshot(grant_id) == grant_before
    assert (
        AuditLog.objects.filter(
            action="tenant.membership.permissions_seeded", entity_id=membership.id
        ).count()
        == seeded_after_first_rerun
    ), "the second re-run changed authority"
