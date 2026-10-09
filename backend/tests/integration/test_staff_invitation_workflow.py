"""Atomic tenant staff invitation + membership handoff — API integration (task 4.2).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 4.2
Requirements: R4.3, R4.4, R6.3. Findings: TEN-01, TEN-05.
Design: design.md §5.3 (People And Access), §6.1 (Tenant Aggregate).

The paired ``tests/unit/test_staff_invitation_service.py`` proves the service
aggregate directly. This module proves the **HTTP surface** that replaces the
fragile client multi-call invite (TEN-01): a single durable admin command that
creates the identity + invitation + membership atomically and returns **no
plaintext credential** (R4.3), a candidate **search selector** endpoint instead
of raw UUID entry (R6.3, TEN-05), resend/revoke commands, and a public
token-based accept handoff — all through the DRF test client and the canonical
``{"success", "data"}`` envelope, with the authority boundary enforced by the
backend (anonymous 401, non-staff 403), not by UI hiding.

Run (sqlite test DB, never the production/Neon DB)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/integration/test_staff_invitation_workflow.py -q

**Validates: Requirements 4.3, 4.4, 6.3**
"""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.accounts.models import Profile
from apps.catalog.models import TenantStaffInvitation, UserInstitutionMembership
from apps.catalog.staff_invitation_service import StaffInvitationService
from tests.tenant_fixtures import build_institution, build_membership, build_profile

pytestmark = [pytest.mark.django_db, pytest.mark.tenant]

INVITES_URL = "/api/v1/admin/staff/invitations/"
CANDIDATES_URL = "/api/v1/admin/staff/candidates/"
ACCEPT_URL = "/api/v1/auth/staff-invitation/accept/"


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


def _data(response):
    body = response.json()
    assert body["success"] is True, body
    return body["data"]


def _tenant_admin(institution):
    """A Tenant_Admin scoped to ``institution`` with staff-invite capability."""
    admin = build_profile(role="admin", suffix=uuid.uuid4().hex[:6])
    build_membership(
        user=admin, institution=institution, role="admin", permissions=["manage"]
    )
    return admin


class TestInviteApi:
    def test_super_admin_invite_returns_no_credential(self):
        institution = build_institution()
        client = _client_for(build_profile(role="super_admin"))
        sfx = uuid.uuid4().hex[:8]
        email = f"invitee-{sfx}@example.com"
        response = client.post(
            INVITES_URL,
            {"email": email, "role": "admin", "institution_id": str(institution.id)},
            format="json",
        )
        assert response.status_code == 201, response.content
        data = _data(response)
        assert data["email"] == email
        assert data["status"] == "pending"
        # R4.3: the response NEVER carries a token or password.
        assert "token" not in data and "token_hash" not in data and "password" not in data
        # Identity + membership were created atomically.
        assert Profile.objects.filter(email__iexact=email).exists()
        assert UserInstitutionMembership.objects.filter(id=data["membership_id"], is_active=True).exists()

    def test_tenant_admin_with_capability_can_invite(self):
        institution = build_institution()
        client = _client_for(_tenant_admin(institution))
        sfx = uuid.uuid4().hex[:8]
        response = client.post(
            INVITES_URL,
            {"email": f"rev-{sfx}@example.com", "role": "reviewer", "institution_id": str(institution.id)},
            format="json",
        )
        assert response.status_code == 201, response.content

    def test_duplicate_pending_invite_conflicts(self):
        institution = build_institution()
        client = _client_for(build_profile(role="super_admin"))
        sfx = uuid.uuid4().hex[:8]
        email = f"dup-{sfx}@example.com"
        body = {"email": email, "role": "admin", "institution_id": str(institution.id)}
        assert client.post(INVITES_URL, body, format="json").status_code == 201
        conflict = client.post(INVITES_URL, body, format="json")
        assert conflict.status_code == 409, conflict.content
        assert conflict.json()["code"] == "INVITATION_ALREADY_PENDING"

    def test_missing_email_is_validation_error(self):
        institution = build_institution()
        client = _client_for(build_profile(role="super_admin"))
        response = client.post(
            INVITES_URL, {"role": "admin", "institution_id": str(institution.id)}, format="json"
        )
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "VALIDATION_ERROR"

    def test_anonymous_is_unauthenticated(self):
        institution = build_institution()
        response = APIClient().post(
            INVITES_URL,
            {"email": "x@example.com", "role": "admin", "institution_id": str(institution.id)},
            format="json",
        )
        assert response.status_code in (401, 403)

    def test_student_is_forbidden(self):
        institution = build_institution()
        client = _client_for(build_profile(role="student"))
        response = client.post(
            INVITES_URL,
            {"email": "x@example.com", "role": "admin", "institution_id": str(institution.id)},
            format="json",
        )
        assert response.status_code == 403, response.content

    def test_tenant_admin_cannot_invite_into_other_tenant(self):
        # Cross-tenant: a tenant admin scoped to A cannot invite into B (R6.8).
        institution_a = build_institution()
        institution_b = build_institution()
        client = _client_for(_tenant_admin(institution_a))
        response = client.post(
            INVITES_URL,
            {"email": "x@example.com", "role": "admin", "institution_id": str(institution_b.id)},
            format="json",
        )
        assert response.status_code == 403, response.content


class TestListApi:
    def test_list_is_scoped_and_enveloped(self):
        institution = build_institution()
        client = _client_for(build_profile(role="super_admin"))
        client.post(
            INVITES_URL,
            {"email": f"a-{uuid.uuid4().hex[:6]}@example.com", "role": "admin", "institution_id": str(institution.id)},
            format="json",
        )
        data = _data(client.get(f"{INVITES_URL}?institution={institution.id}"))
        assert set(data.keys()) >= {"page", "pageSize", "totalCount", "results"}
        assert data["totalCount"] >= 1


class TestCandidateSearchApi:
    def test_super_admin_search_returns_minimal_projection(self):
        build_profile(role="student", email="candidate-search@example.com", suffix="cand")
        client = _client_for(build_profile(role="super_admin"))
        data = _data(client.get(f"{CANDIDATES_URL}?q=candidate-search"))
        assert any(r["email"] == "candidate-search@example.com" for r in data)
        for row in data:
            assert set(row.keys()) == {"id", "email", "full_name", "role"}

    def test_tenant_admin_search_requires_institution(self):
        institution = build_institution()
        client = _client_for(_tenant_admin(institution))
        # Without institution scoping a non-super-admin is denied.
        assert client.get(f"{CANDIDATES_URL}?q=someone").status_code == 403
        # With their own institution it is allowed.
        assert client.get(f"{CANDIDATES_URL}?q=someone&institution={institution.id}").status_code == 200

    def test_student_search_forbidden(self):
        client = _client_for(build_profile(role="student"))
        assert client.get(f"{CANDIDATES_URL}?q=someone").status_code == 403


class TestResendRevokeApi:
    def test_resend_then_revoke(self):
        institution = build_institution()
        client = _client_for(build_profile(role="super_admin"))
        sfx = uuid.uuid4().hex[:8]
        invite = _data(
            client.post(
                INVITES_URL,
                {"email": f"rr-{sfx}@example.com", "role": "admin", "institution_id": str(institution.id)},
                format="json",
            )
        )
        iid = invite["id"]
        resent = _data(client.post(f"{INVITES_URL}{iid}/resend/", {}, format="json"))
        assert resent["resend_count"] == 1

        revoked = _data(client.post(f"{INVITES_URL}{iid}/revoke/", {}, format="json"))
        assert revoked["status"] == "revoked"
        assert UserInstitutionMembership.objects.filter(
            id=invite["membership_id"], is_active=False
        ).exists()

    def test_command_on_unknown_invitation_is_not_found(self):
        client = _client_for(build_profile(role="super_admin"))
        response = client.post(f"{INVITES_URL}{uuid.uuid4()}/resend/", {}, format="json")
        assert response.status_code == 404, response.content


class TestAcceptApi:
    def test_public_accept_sets_password(self):
        # Invite via the service so the test holds the raw token (the API invite
        # deliberately never returns it — R4.3).
        institution = build_institution()
        sfx = uuid.uuid4().hex[:8]
        invitation, raw_token = StaffInvitationService().invite(
            institution_id=institution.id, email=f"acc-{sfx}@example.com", invited_role="admin"
        )
        # Unauthenticated client — the invitee is not yet signed in.
        response = APIClient().post(
            ACCEPT_URL, {"token": raw_token, "password": "Str0ngPass!"}, format="json"
        )
        assert response.status_code == 200, response.content
        assert _data(response)["email"] == f"acc-{sfx}@example.com"
        invitation.refresh_from_db()
        assert invitation.status == "accepted"

    def test_public_accept_invalid_token(self):
        response = APIClient().post(
            ACCEPT_URL, {"token": "not-real", "password": "Str0ngPass!"}, format="json"
        )
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "INVITATION_INVALID"
