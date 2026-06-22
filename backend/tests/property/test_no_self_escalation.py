"""Property 10 — tenant-admins cannot self-escalate or cross-grant.

Spec: ``.kiro/specs/enterprise-tenant-authority/`` — Task 6.4.

Feature: enterprise-tenant-authority, Property 10: Tenant-admins cannot self-escalate or cross-grant

*For all* mutation attempts made by a non-super-admin (a Tenant_Admin) that

* target **the actor's own** membership or access grant, or
* attempt to **grant access to an institution outside the actor's scope**
  (a cross-tenant invite/grant),

the request is **rejected with a non-revealing 403 and no mutation** — no new
membership/grant row is created and no targeted row is altered (R6.7, R6.8).

This drives the real admin tenant-management endpoints over DRF ``APIClient`` +
``force_authenticate`` as hypothesis-generated Tenant_Admin actors and asserts
the rejection-and-no-mutation invariant on every example. Endpoints exercised:

* ``AdminMembershipListCreateView.post`` (``POST /api/v1/admin/memberships/``):
  a non-super-admin targeting their **own** ``user_id`` is rejected with
  ``SELF_GRANT_FORBIDDEN`` (R6.7); an invite into an institution **outside the
  actor's scope** is rejected with ``STAFF_INVITE_FORBIDDEN`` via
  ``AdminCapabilityService.can_invite_staff`` (R6.8).
* ``AdminMembershipDetailView.patch`` (``PATCH /api/v1/admin/memberships/{id}/``)
  — membership mutation is Super_Admin-only (``_write_allowed``), so a
  Tenant_Admin editing **their own** membership is rejected with ``FORBIDDEN``
  and no field changes (R6.7).
* ``AdminAccessGrantListCreateView.post`` (``POST /api/v1/admin/access-grants/``)
  and ``AdminAccessGrantDetailView.patch``
  (``PATCH /api/v1/admin/access-grants/{id}/``) — grant create/mutate is
  Super_Admin-only (``_write_allowed``), so a Tenant_Admin granting access to
  themselves or to a foreign institution, or editing their own grant, is
  rejected with ``FORBIDDEN`` and no mutation (R6.7, R6.8).

Production scope semantics are required (the legacy ``admin`` all-access test
shim must not mask the real capability evaluation behind
``can_invite_staff``), so ``AccessScopeService._test_settings_active`` is
monkeypatched to ``False`` — mirrors ``test_capability_gated_writes.py`` and
``test_scope_before_lookup.py``.

Backend property test: ``pytest`` + ``hypothesis``, ≥100 examples, one property
(Property 10) per file. Run::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_no_self_escalation.py -q

**Validates: Requirements 6.7, 6.8**
"""

from __future__ import annotations

import uuid

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.models import (
    AccessGrant,
    Institution,
    UserInstitutionMembership,
)
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import (
    build_access_grant,
    build_institution,
    build_membership,
    build_profile,
)

# ≥100 examples (spec minimum). Deadline relaxed for the DB + HTTP round-trips;
# the function-scoped ``production_scope`` fixture is intentionally combined with
# ``@given`` (one shim flip per example is cheap), so suppress that health check.
HYPOTHESIS_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)

# Two Tenant_Admin archetypes span the non-super-admin authority space:
#
# * ``tenant_admin_manage`` — an ``admin`` with an active membership carrying the
#   ``manage`` mutation bundle for their scoped institution (the *most*
#   privileged non-super case; still cannot self-escalate or cross-grant).
# * ``tenant_admin_read``   — an ``admin`` with an active read-only membership.
TENANT_ADMIN_KIND = st.sampled_from(["tenant_admin_manage", "tenant_admin_read"])

# Roles a tenant-admin might try to mint when inviting staff.
TARGET_ROLE = st.sampled_from(["admin", "reviewer", "student"])

# Grant scopes the create/patch endpoints accept.
GRANT_SCOPE = st.sampled_from(["institution", "program_offering", "application"])


def _sfx() -> str:
    return uuid.uuid4().hex[:10]


def _build_tenant_admin(kind: str, scoped_institution: Institution):
    """Build an ``admin`` Profile scoped to ``scoped_institution`` via a membership."""
    actor = build_profile(role="admin", suffix=f"ta-{_sfx()}")
    permissions = ["manage"] if kind == "tenant_admin_manage" else ["view"]
    membership = build_membership(
        user=actor,
        institution=scoped_institution,
        role="admin",
        permissions=permissions,
    )
    return actor, membership


def _client_for(profile) -> APIClient:
    """An ``APIClient`` authenticated as ``profile`` (force_authenticate bypasses CSRF)."""
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


@pytest.fixture()
def production_scope(monkeypatch):
    """Force the production membership/grant scope model.

    Under ``config.settings.test`` ``AccessScopeService`` grants a bare
    ``role == "admin"`` user all-access (legacy dev/test compatibility). Property
    10 asserts the production capability evaluation behind ``can_invite_staff``,
    so disable that branch exactly as ``test_capability_gated_writes.py`` does.
    """
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


@pytest.mark.tenant
@pytest.mark.django_db
class TestProperty10NoSelfEscalationOrCrossGrant:
    """Property 10: Tenant-admins cannot self-escalate or cross-grant.

    Feature: enterprise-tenant-authority, Property 10: Tenant-admins cannot self-escalate or cross-grant

    **Validates: Requirements 6.7, 6.8**
    """

    # -- Self-targeted membership invite (R6.7) -----------------------------

    @HYPOTHESIS_SETTINGS
    @given(actor_kind=TENANT_ADMIN_KIND, target_role=TARGET_ROLE)
    def test_self_membership_invite_rejected(
        self, actor_kind, target_role, production_scope
    ):
        """A Tenant_Admin inviting **themselves** (their own ``user_id``) — even
        into the institution they manage — is rejected with
        ``SELF_GRANT_FORBIDDEN`` and no new membership is created (R6.7)."""
        institution = build_institution(suffix=_sfx())
        actor, _ = _build_tenant_admin(actor_kind, institution)
        client = _client_for(actor)

        before = UserInstitutionMembership.objects.filter(user_id=actor.id).count()
        resp = client.post(
            "/api/v1/admin/memberships/",
            {
                "user_id": str(actor.id),
                "institution_id": str(institution.id),
                "role": target_role,
            },
            format="json",
        )
        after = UserInstitutionMembership.objects.filter(user_id=actor.id).count()

        assert resp.status_code == 403, (resp.status_code, resp.data)
        assert resp.data.get("code") == "SELF_GRANT_FORBIDDEN", resp.data
        # No new membership row: the actor still holds only their scoping
        # membership (no self-minted escalation).
        assert after == before

    # -- Cross-tenant membership invite (R6.8) ------------------------------

    @HYPOTHESIS_SETTINGS
    @given(actor_kind=TENANT_ADMIN_KIND, target_role=TARGET_ROLE)
    def test_cross_tenant_membership_invite_rejected(
        self, actor_kind, target_role, production_scope
    ):
        """A Tenant_Admin scoped to institution A inviting a user into a
        **foreign** institution B (outside scope) is rejected with
        ``STAFF_INVITE_FORBIDDEN`` and no membership is created for B (R6.8)."""
        scoped = build_institution(suffix=_sfx())
        foreign = build_institution(suffix=_sfx())
        actor, _ = _build_tenant_admin(actor_kind, scoped)
        target_user = build_profile(role=target_role, suffix=f"tgt-{_sfx()}")
        client = _client_for(actor)

        before = UserInstitutionMembership.objects.filter(
            institution_id=foreign.id
        ).count()
        resp = client.post(
            "/api/v1/admin/memberships/",
            {
                "user_id": str(target_user.id),
                "institution_id": str(foreign.id),
                "role": target_role,
            },
            format="json",
        )
        after = UserInstitutionMembership.objects.filter(
            institution_id=foreign.id
        ).count()

        assert resp.status_code == 403, (resp.status_code, resp.data)
        assert resp.data.get("code") == "STAFF_INVITE_FORBIDDEN", resp.data
        # No cross-tenant membership materialized for the foreign institution.
        assert after == before == 0
        assert not UserInstitutionMembership.objects.filter(
            user_id=target_user.id, institution_id=foreign.id
        ).exists()

    # -- Editing own membership is Super_Admin-only (R6.7) ------------------

    @HYPOTHESIS_SETTINGS
    @given(actor_kind=TENANT_ADMIN_KIND, new_role=TARGET_ROLE)
    def test_own_membership_patch_rejected(
        self, actor_kind, new_role, production_scope
    ):
        """A Tenant_Admin patching **their own** membership (e.g. widening
        ``permissions`` or changing ``role``) is rejected with ``FORBIDDEN`` and
        the membership is left unchanged — no self-escalation (R6.7)."""
        institution = build_institution(suffix=_sfx())
        actor, membership = _build_tenant_admin(actor_kind, institution)
        original_role = membership.role
        original_permissions = list(membership.permissions or [])
        client = _client_for(actor)

        resp = client.patch(
            f"/api/v1/admin/memberships/{membership.id}/",
            {"role": new_role, "permissions": ["manage"]},
            format="json",
        )
        membership.refresh_from_db()

        assert resp.status_code == 403, (resp.status_code, resp.data)
        assert resp.data.get("code") == "FORBIDDEN", resp.data
        # The actor's own membership is untouched.
        assert membership.role == original_role
        assert list(membership.permissions or []) == original_permissions

    # -- Creating a self / cross-tenant grant is Super_Admin-only (R6.7/R6.8)

    @HYPOTHESIS_SETTINGS
    @given(
        actor_kind=TENANT_ADMIN_KIND,
        scope_type=GRANT_SCOPE,
        self_target=st.booleans(),
    )
    def test_access_grant_create_rejected(
        self, actor_kind, scope_type, self_target, production_scope
    ):
        """A Tenant_Admin creating an access grant — whether targeting
        **themselves** (self-escalation) or a **foreign** institution
        (cross-grant) — is rejected with ``FORBIDDEN`` and no grant row is
        created (grant creation is Super_Admin-only, R6.7/R6.8)."""
        scoped = build_institution(suffix=_sfx())
        foreign = build_institution(suffix=_sfx())
        actor, _ = _build_tenant_admin(actor_kind, scoped)
        target_user = (
            actor if self_target else build_profile(role="admin", suffix=f"g-{_sfx()}")
        )
        # Self-escalation grants the actor more of their own scope; cross-grant
        # targets an institution the actor does not manage. Both must be denied.
        grant_institution = scoped if self_target else foreign
        client = _client_for(actor)

        before = AccessGrant.objects.count()
        resp = client.post(
            "/api/v1/admin/access-grants/",
            {
                "user_id": str(target_user.id),
                "scope_type": scope_type,
                "institution_id": str(grant_institution.id),
                "permissions": ["manage"],
            },
            format="json",
        )
        after = AccessGrant.objects.count()

        assert resp.status_code == 403, (resp.status_code, resp.data)
        assert resp.data.get("code") == "FORBIDDEN", resp.data
        # No grant materialized for anyone.
        assert after == before

    # -- Editing own grant is Super_Admin-only (R6.7) -----------------------

    @HYPOTHESIS_SETTINGS
    @given(actor_kind=TENANT_ADMIN_KIND)
    def test_own_access_grant_patch_rejected(self, actor_kind, production_scope):
        """A Tenant_Admin patching **their own** access grant (e.g. widening
        ``permissions``) is rejected with ``FORBIDDEN`` and the grant is left
        unchanged — no self-escalation (R6.7)."""
        institution = build_institution(suffix=_sfx())
        actor, _ = _build_tenant_admin(actor_kind, institution)
        grant = build_access_grant(
            user=actor,
            scope_type="institution",
            institution=institution,
            permissions=["view"],
        )
        original_permissions = list(grant.permissions or [])
        client = _client_for(actor)

        resp = client.patch(
            f"/api/v1/admin/access-grants/{grant.id}/",
            {"permissions": ["manage"]},
            format="json",
        )
        grant.refresh_from_db()

        assert resp.status_code == 403, (resp.status_code, resp.data)
        assert resp.data.get("code") == "FORBIDDEN", resp.data
        # The actor's own grant is untouched.
        assert list(grant.permissions or []) == original_permissions
