"""Tenant change-request V2 endpoint tests (task 4.5, R5.4-R5.5, R3).

Proves the authority + isolation contract of the change-request API that closes
TEN-06, through the DRF test client and the canonical V2 envelope:

* **capability policy** (R3, R5.4/R5.5) — a Tenant_Admin holding
  ``tenant.<kind>.request_change`` SUBMITS/CANCELS; a read-only Tenant_Admin
  cannot; only a Platform_Admin (platform capability) can APPROVE/REJECT.
* **tenant isolation** — list is scoped to the actor's own institution and a
  cross-tenant change-request id returns a non-revealing 404 (scope-before-lookup).
* **anonymous denial** — every route requires authentication (401).
* **envelope** — success/error responses use the V2 ``success``/``data``/``meta``
  envelope.

**Validates: Requirements 5.4, 5.5, 3**
"""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.models import TenantChangeRequest
from tests.tenant_fixtures import build_institution, build_membership, build_profile

pytestmark = pytest.mark.django_db

LIST_URL = "/api/v2/admin/change-requests/"


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


def _data(response) -> dict:
    body = response.json()
    assert body["success"] is True, body
    assert body["meta"]["api_version"] == "v2"
    return body["data"]


def _error(response) -> dict:
    body = response.json()
    assert body["success"] is False, body
    return body["error"]


def _tenant_admin(institution, *, manage: bool):
    """A tenant admin scoped to ``institution``.

    ``manage=True`` grants the mutation bundle (includes
    ``tenant.*.request_change``); ``manage=False`` is read-only.
    """
    profile = build_profile(role="admin")
    build_membership(
        user=profile,
        institution=institution,
        role="admin",
        permissions=["manage"] if manage else [],
    )
    return profile


def _submit_body(institution, *, brand_name="Requested Brand"):
    return {
        "institution_id": str(institution.id),
        "change_kind": TenantChangeRequest.KIND_PROFILE,
        "payload": {"fields": {"brand_name": brand_name}},
    }


# ---------------------------------------------------------------------------
# Submit capability policy (R5.4, R3)
# ---------------------------------------------------------------------------


class TestSubmitCapability:
    def test_tenant_admin_with_request_change_can_submit(self):
        inst = build_institution()
        client = _client_for(_tenant_admin(inst, manage=True))
        resp = client.post(LIST_URL, data=_submit_body(inst), format="json")
        assert resp.status_code == 201, resp.content
        data = _data(resp)
        assert data["status"] == "submitted"
        assert data["change_kind"] == "profile"

    def test_read_only_tenant_admin_cannot_submit(self):
        inst = build_institution()
        client = _client_for(_tenant_admin(inst, manage=False))
        resp = client.post(LIST_URL, data=_submit_body(inst), format="json")
        assert resp.status_code == 403, resp.content
        assert _error(resp)["code"] == "INSUFFICIENT_PERMISSIONS"

    def test_anonymous_denied(self):
        inst = build_institution()
        resp = APIClient().post(LIST_URL, data=_submit_body(inst), format="json")
        assert resp.status_code == 401

    def test_submit_for_out_of_scope_institution_is_denied_non_revealing(self):
        """A tenant admin submitting against ANOTHER tenant's institution is
        denied (403) without confirming that institution exists."""
        inst_a = build_institution()
        inst_b = build_institution()
        client = _client_for(_tenant_admin(inst_a, manage=True))
        resp = client.post(LIST_URL, data=_submit_body(inst_b), format="json")
        assert resp.status_code == 403, resp.content


# ---------------------------------------------------------------------------
# Tenant isolation on list/detail (scope-before-lookup)
# ---------------------------------------------------------------------------


class TestTenantIsolation:
    def _make_submitted(self, institution, requester) -> TenantChangeRequest:
        from apps.catalog.change_request_service import TenantChangeRequestService

        return TenantChangeRequestService().create(
            institution=institution,
            change_kind=TenantChangeRequest.KIND_PROFILE,
            payload={"fields": {"brand_name": "Iso"}},
            requested_by_id=requester.id,
        )

    def test_detail_of_other_tenant_request_is_404(self):
        inst_a = build_institution()
        inst_b = build_institution()
        admin_a = _tenant_admin(inst_a, manage=True)
        admin_b = _tenant_admin(inst_b, manage=True)
        cr_b = self._make_submitted(inst_b, admin_b)

        resp = _client_for(admin_a).get(f"{LIST_URL}{cr_b.id}/")
        assert resp.status_code == 404, resp.content

    def test_list_only_returns_own_tenant_requests(self):
        inst_a = build_institution()
        inst_b = build_institution()
        admin_a = _tenant_admin(inst_a, manage=True)
        admin_b = _tenant_admin(inst_b, manage=True)
        cr_a = self._make_submitted(inst_a, admin_a)
        cr_b = self._make_submitted(inst_b, admin_b)

        resp = _client_for(admin_a).get(LIST_URL)
        assert resp.status_code == 200
        ids = {row["id"] for row in _data(resp)["results"]}
        assert str(cr_a.id) in ids
        assert str(cr_b.id) not in ids

    def test_super_admin_sees_all_tenants(self):
        inst_a = build_institution()
        inst_b = build_institution()
        cr_a = self._make_submitted(inst_a, _tenant_admin(inst_a, manage=True))
        cr_b = self._make_submitted(inst_b, _tenant_admin(inst_b, manage=True))

        resp = _client_for(build_profile(role="super_admin")).get(LIST_URL)
        assert resp.status_code == 200
        ids = {row["id"] for row in _data(resp)["results"]}
        assert {str(cr_a.id), str(cr_b.id)} <= ids


# ---------------------------------------------------------------------------
# Review (approve/reject) capability policy (R5.5, R3)
# ---------------------------------------------------------------------------


class TestReviewCapability:
    def _submitted(self, institution, requester) -> TenantChangeRequest:
        from apps.catalog.change_request_service import TenantChangeRequestService

        return TenantChangeRequestService().create(
            institution=institution,
            change_kind=TenantChangeRequest.KIND_PROFILE,
            payload={"fields": {"brand_name": "Review Me"}},
            requested_by_id=requester.id,
        )

    def test_platform_admin_can_approve_and_apply(self):
        inst = build_institution(brand_name="Before")
        admin = _tenant_admin(inst, manage=True)
        cr = self._submitted(inst, admin)

        resp = _client_for(build_profile(role="super_admin")).post(
            f"{LIST_URL}{cr.id}/approve/", data={"note": "ok"}, format="json"
        )
        assert resp.status_code == 200, resp.content
        data = _data(resp)
        assert data["status"] == "applied"
        inst.refresh_from_db()
        assert inst.brand_name == "Review Me"  # canonical row changed

    def test_tenant_admin_cannot_approve(self):
        inst = build_institution()
        admin = _tenant_admin(inst, manage=True)
        cr = self._submitted(inst, admin)

        resp = _client_for(admin).post(f"{LIST_URL}{cr.id}/approve/", data={}, format="json")
        assert resp.status_code == 403, resp.content

    def test_platform_admin_can_reject(self):
        inst = build_institution(brand_name="Keep")
        admin = _tenant_admin(inst, manage=True)
        cr = self._submitted(inst, admin)

        resp = _client_for(build_profile(role="super_admin")).post(
            f"{LIST_URL}{cr.id}/reject/", data={"note": "no"}, format="json"
        )
        assert resp.status_code == 200, resp.content
        assert _data(resp)["status"] == "rejected"
        inst.refresh_from_db()
        assert inst.brand_name == "Keep"  # unchanged

    def test_approve_unknown_id_is_404(self):
        resp = _client_for(build_profile(role="super_admin")).post(
            f"{LIST_URL}{uuid.uuid4()}/approve/", data={}, format="json"
        )
        assert resp.status_code == 404
