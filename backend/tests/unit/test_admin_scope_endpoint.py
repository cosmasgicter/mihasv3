"""AdminScopeView — exposes the actor's tenant access scope to the frontend.

Drives the multi-tenant admin UX: a super-admin gets all-access + the full
institution list (institution switcher); a scoped school admin gets only their
institution (auto-locked, no switcher). Scope comes from AccessScopeService.
"""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.admin_views import AdminScopeView

pytestmark = pytest.mark.django_db


class _JWTUser:
    is_authenticated = True

    def __init__(self, role, user_id):
        self.role = role
        self.id = user_id
        self.pk = user_id


def _institution(code, name):
    from apps.catalog.models import Institution

    return Institution.objects.create(
        id=uuid.uuid4(), code=code, name=name, full_name=name, is_active=True
    )


def _membership(user_id, institution):
    from apps.catalog.models import UserInstitutionMembership

    return UserInstitutionMembership.objects.create(
        id=uuid.uuid4(), user_id=user_id, institution=institution, role="admin", is_active=True
    )


def _call(user):
    request = APIRequestFactory().get("/api/v1/admin/scope/")
    force_authenticate(request, user=user)
    return AdminScopeView.as_view()(request)


def test_super_admin_gets_all_access_and_full_institution_list():
    _institution("AAA", "Alpha School")
    _institution("BBB", "Beta School")
    resp = _call(_JWTUser("super_admin", uuid.uuid4()))
    assert resp.status_code == 200
    data = resp.data["data"]
    assert data["all_access"] is True
    assert data["role"] == "super_admin"
    # Every institution is offered so a super-admin can switch to any school.
    codes = {i["code"] for i in data["institutions"]}
    assert {"AAA", "BBB"}.issubset(codes)


def test_scoped_admin_gets_only_their_institution():
    from tests.tenant_fixtures import build_profile

    alpha = _institution("AAA2", "Alpha School")
    _institution("BBB2", "Beta School")  # another school the admin must NOT see
    actor = build_profile(role="admin")
    _membership(actor.id, alpha)

    resp = _call(_JWTUser("admin", actor.id))
    assert resp.status_code == 200
    data = resp.data["data"]
    assert data["all_access"] is False
    codes = [i["code"] for i in data["institutions"]]
    assert codes == ["AAA2"]  # only the membership institution, not Beta


def test_scoped_admin_with_no_membership_gets_empty_list():
    resp = _call(_JWTUser("admin", uuid.uuid4()))
    assert resp.status_code == 200
    data = resp.data["data"]
    assert data["all_access"] is False
    assert data["institutions"] == []
