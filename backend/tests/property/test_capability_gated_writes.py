"""Property 7 — capability-gated writes / no privilege escalation.

Spec: ``.kiro/specs/enterprise-tenant-authority/`` — Task 5.4.

Feature: enterprise-tenant-authority, Property 7: Capability-gated writes / no privilege escalation

*For all* tenant-sensitive write operations the operation evaluates the required
capability through :class:`AdminCapabilityService` **before any serializer save**
and succeeds only if the actor holds that capability; otherwise it is denied with
**no mutation**. Creating or promoting a ``super_admin`` or an unscoped global
admin succeeds only for a ``super_admin``.

This drives the real write endpoints over DRF ``APIClient`` +
``force_authenticate`` as varied hypothesis-generated actors and asserts the
two halves of the property on every example:

* **Authorized** (the actor holds the required capability) → the write is *not*
  blocked by authorization (no ``403`` / no masked ``404``) and the intended
  mutation is observed (a new row, a changed field, a soft-delete, an
  activated domain).
* **Unauthorized** (the actor lacks the capability) → the write is denied with a
  non-revealing ``403`` (or a scope-masked ``404`` on the scoped detail views)
  and **no** mutation is observed (row counts / target fields are unchanged).

Endpoints exercised (the legacy catalog write paths, the super-admin-gated admin
tenant domain activation, and admin user creation):

* ``InstitutionListCreateView`` / ``InstitutionDetailView``
  (``/api/v1/catalog/institutions/`` POST/PATCH/DELETE) → ``platform.tenant.*``
  (R5.1, R3.4).
* ``ProgramListCreateView`` / ``ProgramDetailView``
  (``/api/v1/catalog/programs/`` POST/PATCH/DELETE) →
  ``can_manage_program`` (platform-only; ``tenant.program.request_change`` never
  authorizes a direct catalog write) (R5.2, R8.8).
* ``IntakeListCreateView`` / ``IntakeDetailView``
  (``/api/v1/catalog/intakes/`` POST/PATCH/DELETE) → ``platform.intake.manage``
  (R5.3).
* ``AdminTenantDomainActivateView``
  (``/api/v1/admin/institutions/{id}/domains/{id}/activate/`` POST) →
  Super_Admin only (R7.14).
* ``AdminUserListView.post`` (``/api/v1/admin/users/`` POST) — creating or
  promoting a ``super_admin`` or an unscoped global admin is Super_Admin only
  (R6.1, R6.2).

The catalog tenant offering / canonical-program assignment caps (R8.8) and the
template-edit gate (R9.4) all resolve through the same
``AdminCapabilityService.require_capability`` path these endpoints use, so the
single capability-evaluation invariant pinned here applies to them too.

Production scope semantics are required (the legacy ``admin`` all-access test
shim must not mask the production capability evaluation), so
``AccessScopeService._test_settings_active`` is monkeypatched to ``False``
(mirrors ``test_scope_before_lookup.py``).

Backend property test: ``pytest`` + ``hypothesis``, ≥100 examples, one property
(Property 7) per file. Run::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_capability_gated_writes.py -q

**Validates: Requirements 3.4, 5.1, 5.2, 5.3, 6.1, 6.2, 7.14, 8.8, 9.4**
"""

from __future__ import annotations

import uuid

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.accounts.models import Profile
from apps.catalog.models import (
    InstitutionDomain,
    Institution,
    Intake,
    Program,
)
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_institution_domain,
    build_intake,
    build_membership,
    build_offering,
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

# ---------------------------------------------------------------------------
# Actors
# ---------------------------------------------------------------------------
#
# Four actor archetypes span the authorization space for these writes:
#
# * ``super_admin``        — holds every ``platform.*`` capability (R2.2).
# * ``tenant_admin_manage``— an ``admin`` with an active membership granting the
#   ``manage`` mutation bundle (``tenant.*`` caps incl.
#   ``tenant.program.request_change``) for the *target* institution. Holds NO
#   ``platform.*`` capability, so every platform-gated catalog write is denied
#   even though the actor can "see" the target.
# * ``tenant_admin_read``  — an ``admin`` with an active read-only membership for
#   the target institution.
# * ``no_scope_admin``     — a bare ``admin`` with no membership/grant (empty
#   capability set, R1.3).
ACTOR_KINDS = (
    "super_admin",
    "tenant_admin_manage",
    "tenant_admin_read",
    "no_scope_admin",
)
ACTOR = st.sampled_from(ACTOR_KINDS)

# The three legacy-catalog write methods.
WRITE_METHOD = st.sampled_from(["post", "patch", "delete"])


def _build_actor(kind: str, scoped_institution: Institution) -> Profile:
    """Build a Profile actor of ``kind``, scoping tenant-admins to ``scoped_institution``."""
    if kind == "super_admin":
        return build_profile(role="super_admin")
    actor = build_profile(role="admin")
    if kind == "no_scope_admin":
        return actor
    permissions = ["manage"] if kind == "tenant_admin_manage" else ["view"]
    build_membership(
        user=actor,
        institution=scoped_institution,
        role="admin",
        permissions=permissions,
    )
    return actor


def _client_for(profile: Profile) -> APIClient:
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
    7 asserts the production capability evaluation, so disable that branch
    exactly as ``test_scope_before_lookup.py`` does.
    """
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


def _sfx() -> str:
    return uuid.uuid4().hex[:10]


def _is_denial(status_code: int) -> bool:
    """A non-revealing authorization denial: a 403 (capability gate) or a
    scope-masked 404 (the scoped detail views collapse out-of-scope ids)."""
    return status_code in (403, 404)


# ---------------------------------------------------------------------------
# Property 7
# ---------------------------------------------------------------------------


@pytest.mark.tenant
@pytest.mark.django_db
class TestProperty7CapabilityGatedWrites:
    """Property 7: Capability-gated writes / no privilege escalation.

    Feature: enterprise-tenant-authority, Property 7: Capability-gated writes / no privilege escalation

    **Validates: Requirements 3.4, 5.1, 5.2, 5.3, 6.1, 6.2, 7.14, 8.8, 9.4**
    """

    # -- Institution legacy writes (R5.1, R3.4) -----------------------------

    @HYPOTHESIS_SETTINGS
    @given(actor_kind=ACTOR, method=WRITE_METHOD)
    def test_institution_write_requires_platform_capability(
        self, actor_kind, method, production_scope
    ):
        """Creating/updating/deactivating an Institution succeeds only for a
        Super_Admin (``platform.tenant.*``); every other actor is denied with no
        mutation (R5.1, R3.4)."""
        target = build_institution(suffix=_sfx())
        actor = _build_actor(actor_kind, target)
        client = _client_for(actor)
        authorized = actor_kind == "super_admin"

        if method == "post":
            code = f"NEW-{_sfx().upper()}"
            before = Institution.objects.count()
            resp = client.post(
                "/api/v1/catalog/institutions/",
                {"name": "Created School", "code": code},
                format="json",
            )
            after = Institution.objects.count()
            if authorized:
                assert resp.status_code == 201, (resp.status_code, resp.data)
                assert after == before + 1
                assert Institution.objects.filter(code=code).exists()
            else:
                assert _is_denial(resp.status_code), (resp.status_code, resp.data)
                assert after == before
                assert not Institution.objects.filter(code=code).exists()
            return

        url = f"/api/v1/catalog/institutions/{target.id}/"
        if method == "patch":
            resp = client.patch(url, {"name": "Renamed School"}, format="json")
            target.refresh_from_db()
            if authorized:
                assert resp.status_code == 200, (resp.status_code, resp.data)
                assert target.name == "Renamed School"
            else:
                assert _is_denial(resp.status_code), (resp.status_code, resp.data)
                assert target.name != "Renamed School"
        else:  # delete (soft-delete; target has no active programs)
            resp = client.delete(url)
            target.refresh_from_db()
            if authorized:
                assert resp.status_code == 200, (resp.status_code, resp.data)
                assert target.is_active is False
            else:
                assert _is_denial(resp.status_code), (resp.status_code, resp.data)
                assert target.is_active is True

    # -- Program legacy writes (R5.2, R8.8) ---------------------------------

    @HYPOTHESIS_SETTINGS
    @given(actor_kind=ACTOR, method=WRITE_METHOD)
    def test_program_write_requires_platform_program_capability(
        self, actor_kind, method, production_scope
    ):
        """Creating/updating/deactivating a Program offering succeeds only for a
        Super_Admin: ``can_manage_program`` is platform-only, so even a
        tenant-admin holding ``tenant.program.request_change`` (the ``manage``
        bundle) for the owning institution cannot mutate it through the legacy
        catalog endpoint (R5.2, R8.8). Denials never mutate."""
        institution = build_institution(suffix=_sfx())
        canonical = build_canonical_program(suffix=_sfx())
        actor = _build_actor(actor_kind, institution)
        client = _client_for(actor)
        authorized = actor_kind == "super_admin"

        if method == "post":
            code = f"OFR-{_sfx().upper()}"
            before = Program.objects.count()
            resp = client.post(
                "/api/v1/catalog/programs/",
                {
                    "name": "Created Offering",
                    "code": code,
                    "institution_id": str(institution.id),
                    "canonical_program_id": str(canonical.id),
                },
                format="json",
            )
            after = Program.objects.count()
            if authorized:
                assert resp.status_code == 201, (resp.status_code, resp.data)
                assert after == before + 1
                assert Program.objects.filter(code=code).exists()
            else:
                assert _is_denial(resp.status_code), (resp.status_code, resp.data)
                assert after == before
                assert not Program.objects.filter(code=code).exists()
            return

        program = build_offering(
            institution=institution, canonical_program=canonical, suffix=_sfx()
        )
        url = f"/api/v1/catalog/programs/{program.id}/"
        if method == "patch":
            resp = client.patch(url, {"name": "Renamed Offering"}, format="json")
            program.refresh_from_db()
            if authorized:
                assert resp.status_code == 200, (resp.status_code, resp.data)
                assert program.name == "Renamed Offering"
            else:
                assert _is_denial(resp.status_code), (resp.status_code, resp.data)
                assert program.name != "Renamed Offering"
        else:  # delete (soft-delete)
            resp = client.delete(url)
            program.refresh_from_db()
            if authorized:
                assert resp.status_code == 200, (resp.status_code, resp.data)
                assert program.is_active is False
            else:
                assert _is_denial(resp.status_code), (resp.status_code, resp.data)
                assert program.is_active is True

    # -- Intake legacy writes (R5.3) ----------------------------------------

    @HYPOTHESIS_SETTINGS
    @given(actor_kind=ACTOR, method=WRITE_METHOD)
    def test_intake_write_requires_platform_intake_capability(
        self, actor_kind, method, production_scope
    ):
        """Creating/updating/deactivating an Intake succeeds only for a
        Super_Admin (``platform.intake.manage``); intakes are global so no
        tenant capability can authorize the write. Denials never mutate (R5.3)."""
        institution = build_institution(suffix=_sfx())
        actor = _build_actor(actor_kind, institution)
        client = _client_for(actor)
        authorized = actor_kind == "super_admin"

        if method == "post":
            name = f"Intake {_sfx()}"
            before = Intake.objects.count()
            resp = client.post(
                "/api/v1/catalog/intakes/",
                {"name": name, "year": 2031},
                format="json",
            )
            after = Intake.objects.count()
            if authorized:
                assert resp.status_code == 201, (resp.status_code, resp.data)
                assert after == before + 1
                assert Intake.objects.filter(name=name).exists()
            else:
                assert _is_denial(resp.status_code), (resp.status_code, resp.data)
                assert after == before
                assert not Intake.objects.filter(name=name).exists()
            return

        intake = build_intake(suffix=_sfx())
        url = f"/api/v1/catalog/intakes/{intake.id}/"
        if method == "patch":
            resp = client.patch(url, {"name": "Renamed Intake"}, format="json")
            intake.refresh_from_db()
            if authorized:
                assert resp.status_code == 200, (resp.status_code, resp.data)
                assert intake.name == "Renamed Intake"
            else:
                assert _is_denial(resp.status_code), (resp.status_code, resp.data)
                assert intake.name != "Renamed Intake"
        else:  # delete (soft-delete)
            resp = client.delete(url)
            intake.refresh_from_db()
            if authorized:
                assert resp.status_code == 200, (resp.status_code, resp.data)
                assert intake.is_active is False
            else:
                assert _is_denial(resp.status_code), (resp.status_code, resp.data)
                assert intake.is_active is True

    # -- Domain activation is Super_Admin only (R7.14) ----------------------

    @HYPOTHESIS_SETTINGS
    @given(actor_kind=ACTOR)
    def test_domain_activation_is_super_admin_only(
        self, actor_kind, production_scope
    ):
        """Activating a ``verified`` domain (``verified → active``) succeeds only
        for a Super_Admin (R7.14). Any other actor is denied (403) and the domain
        stays ``verified`` — no mutation."""
        institution = build_institution(suffix=_sfx())
        domain = build_institution_domain(
            institution=institution,
            hostname=f"apply-{_sfx()}.example",
            status=InstitutionDomain.STATUS_VERIFIED,
        )
        actor = _build_actor(actor_kind, institution)
        client = _client_for(actor)
        authorized = actor_kind == "super_admin"

        url = (
            f"/api/v1/admin/institutions/{institution.id}"
            f"/domains/{domain.id}/activate/"
        )
        resp = client.post(url, {}, format="json")
        domain.refresh_from_db()

        if authorized:
            assert resp.status_code == 200, (resp.status_code, resp.data)
            assert domain.status == InstitutionDomain.STATUS_ACTIVE
            assert str(domain.approved_by_id) == str(actor.id)
        else:
            assert resp.status_code == 403, (resp.status_code, resp.data)
            assert domain.status == InstitutionDomain.STATUS_VERIFIED

    # -- No privilege escalation on user creation (R6.1, R6.2) --------------

    @HYPOTHESIS_SETTINGS
    @given(actor_kind=ACTOR, target_role=st.sampled_from(["super_admin", "admin"]))
    def test_super_admin_or_global_admin_creation_requires_super_admin(
        self, actor_kind, target_role, production_scope
    ):
        """Creating (or promoting to) a ``super_admin`` or an unscoped global
        ``admin`` succeeds only for a Super_Admin; every other admin actor is
        rejected with ``PRIVILEGE_ESCALATION`` and no Profile row is created
        (R6.1, R6.2)."""
        institution = build_institution(suffix=_sfx())
        actor = _build_actor(actor_kind, institution)
        client = _client_for(actor)
        authorized = actor_kind == "super_admin"

        email = f"new-{_sfx()}@example.com"
        before = Profile.objects.count()
        # No ``institution_id`` → an unscoped global user; ``target_role`` is the
        # privileged role being minted/promoted.
        resp = client.post(
            "/api/v1/admin/users/",
            {
                "email": email,
                "password": "Sup3rSecret!",
                "first_name": "New",
                "last_name": "Operator",
                "role": target_role,
            },
            format="json",
        )
        after = Profile.objects.count()

        if authorized:
            assert resp.status_code == 201, (resp.status_code, resp.data)
            assert after == before + 1
            created = Profile.objects.filter(email__iexact=email).first()
            assert created is not None and created.role == target_role
        else:
            assert resp.status_code == 403, (resp.status_code, resp.data)
            assert resp.data.get("code") == "PRIVILEGE_ESCALATION", resp.data
            assert after == before
            assert not Profile.objects.filter(email__iexact=email).exists()
