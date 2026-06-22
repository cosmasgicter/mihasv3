"""Property 6 — foreign / override institution id never mutates.

Spec: ``.kiro/specs/enterprise-tenant-authority/`` — Task 5.5.

Feature: enterprise-tenant-authority, Property 6: Foreign / override institution id never mutates

*For all* mutation requests — **legacy catalog writes**, **admin tenant
writes**, and **application creation** — that carry an institution identifier
the actor is not authorized for (including an application-create
``institution_id`` that differs from the resolved tenant context), the request
is rejected with **no data mutation**, the resolved tenant binding is retained,
and **no target-tenant data** (id, name, code, or attribute) is disclosed.

This drives the three real write surfaces over DRF ``APIClient`` +
``force_authenticate`` as varied hypothesis-generated actors:

* **Legacy catalog write** — ``ProgramListCreateView``
  (``/api/v1/catalog/programs/`` POST) carrying a *foreign* ``institution_id``
  the actor cannot manage → non-revealing ``403`` ``FORBIDDEN`` with no
  ``Program`` row created (R5.4).
* **Admin tenant write** — ``AdminTenantDetailView``
  (``/api/v1/admin/institutions/{id}/`` PATCH) targeting another tenant's
  institution by a non-super-admin → non-revealing ``403`` ``FORBIDDEN`` with
  the target institution's fields unchanged (R4.4).
* **Application creation** — ``ApplicationListCreateView``
  (``/api/v1/applications/`` POST) on an *active white-label host* with a posted
  ``institution_id`` that differs from the resolved tenant → ``403``
  ``INSTITUTION_OVERRIDE_NOT_PERMITTED``; no application is created, nothing is
  bound to the foreign tenant, and the resolved binding is retained (R7.12).

A matching-institution positive control proves the gate is not a blanket reject:
posting the resolved tenant's own ``institution_id`` is **not** rejected with the
override code.

Production scope semantics are required (the legacy ``admin`` all-access test
shim must not mask the production capability evaluation), so
``AccessScopeService._test_settings_active`` is monkeypatched to ``False``
(mirrors ``test_capability_gated_writes.py`` / ``test_scope_before_lookup.py``).

Backend property test: ``pytest`` + ``hypothesis``, ≥100 examples, one property
(Property 6) per file. Run::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_foreign_institution_id.py -q

**Validates: Requirements 4.4, 5.4, 7.12, 17.5**
"""

from __future__ import annotations

import json
import uuid

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.accounts.models import Profile
from apps.applications.models import Application
from apps.catalog.models import Institution, InstitutionDomain, Program
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_institution_domain,
    build_intake,
    build_membership,
    build_offering,
    build_profile,
    build_program_intake,
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
# Property 6 only concerns actors who are *not* authorized for the foreign
# institution id they carry. Three non-super-admin archetypes span that space:
#
# * ``tenant_admin_manage`` — an ``admin`` with an active membership granting the
#   ``manage`` mutation bundle for a *different* institution (the actor's own
#   tenant), never the foreign target.
# * ``tenant_admin_read``   — an ``admin`` with an active read-only membership for
#   its own tenant.
# * ``no_scope_admin``      — a bare ``admin`` with no membership/grant (empty
#   capability set, R1.3).
UNAUTHORIZED_ACTOR_KINDS = (
    "tenant_admin_manage",
    "tenant_admin_read",
    "no_scope_admin",
)
UNAUTHORIZED_ACTOR = st.sampled_from(UNAUTHORIZED_ACTOR_KINDS)


def _build_unauthorized_actor(kind: str, own_institution: Institution) -> Profile:
    """Build a non-super-admin actor of ``kind`` scoped (if at all) only to
    ``own_institution`` — never to the foreign target institution."""
    actor = build_profile(role="admin")
    if kind == "no_scope_admin":
        return actor
    permissions = ["manage"] if kind == "tenant_admin_manage" else ["view"]
    build_membership(
        user=actor,
        institution=own_institution,
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


def _sfx() -> str:
    return uuid.uuid4().hex[:10]


def _blob(response) -> str:
    """Serialized response body (parsed + raw) for leakage assertions."""
    try:
        body = response.json()
    except Exception:  # pragma: no cover - non-JSON defensive path
        body = getattr(response, "data", None)
    try:
        raw = response.content.decode("utf-8", "replace")
    except Exception:  # pragma: no cover - defensive only
        raw = ""
    return json.dumps(body, default=str) + "||" + raw


def _assert_no_target_leak(response, target: Institution) -> None:
    """The response discloses no identifier/name/code of the foreign tenant."""
    blob = _blob(response)
    for value in (str(target.id), target.name, target.code):
        assert value and value not in blob, (value, blob)


@pytest.fixture()
def production_scope(monkeypatch):
    """Force the production membership/grant scope model.

    Under ``config.settings.test`` ``AccessScopeService`` grants a bare
    ``role == "admin"`` user all-access (legacy dev/test compatibility). Property
    6 asserts the production capability evaluation, so disable that branch
    exactly as ``test_capability_gated_writes.py`` does.
    """
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


# ---------------------------------------------------------------------------
# Property 6
# ---------------------------------------------------------------------------


@pytest.mark.tenant
@pytest.mark.django_db
class TestProperty6ForeignInstitutionId:
    """Property 6: Foreign / override institution id never mutates.

    Feature: enterprise-tenant-authority, Property 6: Foreign / override institution id never mutates

    **Validates: Requirements 4.4, 5.4, 7.12, 17.5**
    """

    # -- Legacy catalog write: program create with a foreign id (R5.4) ------

    @HYPOTHESIS_SETTINGS
    @given(actor_kind=UNAUTHORIZED_ACTOR)
    def test_legacy_catalog_program_create_with_foreign_institution_id(
        self, actor_kind, production_scope
    ):
        """Creating a Program offering whose ``institution_id`` is a tenant the
        actor cannot manage is rejected with a non-revealing ``403 FORBIDDEN``
        before any serializer save — no ``Program`` row is created and the
        foreign tenant's data is not disclosed (R5.4)."""
        own = build_institution(suffix=_sfx())
        foreign = build_institution(suffix=_sfx())
        canonical = build_canonical_program(suffix=_sfx())
        actor = _build_unauthorized_actor(actor_kind, own)
        client = _client_for(actor)

        code = f"OFR-{_sfx().upper()}"
        before = Program.objects.count()
        resp = client.post(
            "/api/v1/catalog/programs/",
            {
                "name": "Foreign Offering",
                "code": code,
                "institution_id": str(foreign.id),
                "canonical_program_id": str(canonical.id),
            },
            format="json",
        )
        after = Program.objects.count()

        assert resp.status_code == 403, (resp.status_code, resp.data)
        assert resp.data.get("code") == "FORBIDDEN", resp.data
        # No mutation.
        assert after == before
        assert not Program.objects.filter(code=code).exists()
        # No target-tenant disclosure.
        _assert_no_target_leak(resp, foreign)

    # -- Admin tenant write: patch a foreign institution (R4.4) -------------

    @HYPOTHESIS_SETTINGS
    @given(actor_kind=UNAUTHORIZED_ACTOR)
    def test_admin_tenant_patch_of_foreign_institution_never_mutates(
        self, actor_kind, production_scope
    ):
        """A non-super-admin PATCHing another tenant's institution through the
        admin tenant API is rejected with a non-revealing ``403 FORBIDDEN``; the
        target institution's fields are unchanged and no target data leaks
        (R4.4)."""
        own = build_institution(suffix=_sfx())
        foreign = build_institution(suffix=_sfx())
        original_name = foreign.name
        actor = _build_unauthorized_actor(actor_kind, own)
        client = _client_for(actor)

        resp = client.patch(
            f"/api/v1/admin/institutions/{foreign.id}/",
            {"name": "Hijacked School"},
            format="json",
        )
        foreign.refresh_from_db()

        assert resp.status_code == 403, (resp.status_code, resp.data)
        assert resp.data.get("code") == "FORBIDDEN", resp.data
        # No mutation: the foreign tenant keeps its original name.
        assert foreign.name == original_name
        assert foreign.name != "Hijacked School"
        _assert_no_target_leak(resp, foreign)

    # -- Application create: override id differs from resolved tenant (R7.12) -

    @HYPOTHESIS_SETTINGS
    @given(data=st.data())
    def test_application_create_override_institution_is_rejected(
        self, data, production_scope
    ):
        """On an active white-label host, an application-create request whose
        posted ``institution_id`` differs from the resolved tenant is rejected
        with ``403 INSTITUTION_OVERRIDE_NOT_PERMITTED``; no application is
        created, nothing is bound to the foreign tenant, and the resolved
        binding is retained (R7.12)."""
        # Resolved tenant (A) reachable via an active white-label domain.
        resolved = build_institution(suffix=_sfx())
        hostname = f"apply-{_sfx()}.example"
        build_institution_domain(
            institution=resolved,
            hostname=hostname,
            status=InstitutionDomain.STATUS_ACTIVE,
            is_active=True,
        )
        # Foreign tenant (B) the applicant tries to override onto.
        foreign = build_institution(suffix=_sfx())
        canonical = build_canonical_program(suffix=_sfx())
        intake = build_intake(suffix=_sfx())

        student = build_profile(role="student", suffix=_sfx())
        client = _client_for(student)

        before = Application.objects.count()
        resp = client.post(
            "/api/v1/applications/",
            {
                "full_name": "Override Applicant",
                "date_of_birth": "2000-01-01",
                "sex": "Female",
                "phone": "+260970000001",
                "email": f"override-{_sfx()}@example.com",
                "residence_town": "Lusaka",
                "program_id": str(canonical.id),
                "intake_id": str(intake.id),
                "institution_id": str(foreign.id),
            },
            format="json",
            HTTP_X_FORWARDED_HOST=hostname,
        )
        after = Application.objects.count()

        assert resp.status_code == 403, (resp.status_code, resp.data)
        assert resp.data.get("code") == "INSTITUTION_OVERRIDE_NOT_PERMITTED", resp.data
        # No mutation and nothing bound to the foreign tenant.
        assert after == before
        assert not Application.objects.filter(institution_ref_id=foreign.id).exists()
        # No target-tenant disclosure.
        _assert_no_target_leak(resp, foreign)

    # -- Positive control: matching institution id is NOT override-rejected --

    @HYPOTHESIS_SETTINGS
    @given(data=st.data())
    def test_application_create_matching_institution_is_not_override_rejected(
        self, data, production_scope
    ):
        """Posting the resolved tenant's own ``institution_id`` is not rejected
        with the override code — proving the gate rejects only a *differing*
        (foreign) id, not every create (R7.11/R7.12 boundary)."""
        resolved = build_institution(suffix=_sfx())
        hostname = f"apply-{_sfx()}.example"
        build_institution_domain(
            institution=resolved,
            hostname=hostname,
            status=InstitutionDomain.STATUS_ACTIVE,
            is_active=True,
        )
        canonical = build_canonical_program(suffix=_sfx())
        intake = build_intake(suffix=_sfx())
        # Wire a resolvable offering for the resolved tenant so assignment can
        # proceed past the override gate.
        offering = build_offering(
            institution=resolved, canonical_program=canonical, suffix=_sfx()
        )
        build_program_intake(offering=offering, intake=intake)

        student = build_profile(role="student", suffix=_sfx())
        client = _client_for(student)

        resp = client.post(
            "/api/v1/applications/",
            {
                "full_name": "Matching Applicant",
                "date_of_birth": "2000-01-01",
                "sex": "Female",
                "phone": "+260970000001",
                "email": f"match-{_sfx()}@example.com",
                "residence_town": "Lusaka",
                "program_id": str(canonical.id),
                "intake_id": str(intake.id),
                "institution_id": str(resolved.id),
            },
            format="json",
            HTTP_X_FORWARDED_HOST=hostname,
        )

        # The override gate must not fire for the resolved tenant's own id.
        override_rejected = (
            resp.status_code == 403
            and isinstance(resp.data, dict)
            and resp.data.get("code") == "INSTITUTION_OVERRIDE_NOT_PERMITTED"
        )
        assert not override_rejected, (resp.status_code, resp.data)
