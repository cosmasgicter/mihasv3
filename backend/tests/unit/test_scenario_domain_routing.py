"""Acceptance Scenario C — a configured tenant domain routes correctly.

Spec: ``.kiro/specs/enterprise-tenant-authority/`` — Task 17.3.

This is the end-to-end acceptance scenario behind **Requirement 18**: a request
arriving on MIHAS's configured **active** white-label domain must resolve the
MIHAS Tenant context end to end — branding, the program-offering catalog, and
application persistence must all agree on MIHAS, KATC offerings must never
surface on the MIHAS domain, and a KATC ``Tenant_Admin`` must be denied access
to an application submitted on the MIHAS domain.

Two real tenants ("MIHAS" and "KATC") are built via ``tests.tenant_fixtures``.
Both offer the **same** ``Canonical_Program`` for the **same** ``Intake`` (each
through its own active ``Institution_Program_Offering`` + ``ProgramIntake``), so
the offering-isolation assertion (R18.3) is non-vacuous: the shared canonical
program is genuinely offered by both schools and only the host-resolved tenant's
offering may appear on the MIHAS domain. MIHAS owns an **active**
``InstitutionDomain`` (``status=active``) so the ``Domain_Resolver`` resolves it;
KATC has none.

As a student / public actor on the active MIHAS host
(``HTTP_X_FORWARDED_HOST``) we assert:

* **Context resolves MIHAS** (``GET /api/v1/catalog/context/``) — ``portal_type``
  is ``white_label``, ``institution_id`` is MIHAS, and the resolved ``brand``
  carries MIHAS branding, never KATC's (R18.1, R18.2).
* **Catalog lists only MIHAS offerings** (``GET
  /api/v1/catalog/canonical-programs/``) on the MIHAS host — the MIHAS offering
  appears and the KATC offering for the same shared canonical program never does
  (R18.3).
* **Application persists against a MIHAS offering** (``POST
  /api/v1/applications/``) on the MIHAS host — the stored application's
  ``program_offering`` belongs to MIHAS and is never the KATC offering (R18.4).
* **A KATC tenant-admin is denied** (``GET /api/v1/applications/{id}/``) for that
  MIHAS application — a non-revealing ``404`` that leaks no MIHAS identifier
  (R18.5).

Production scope semantics are required for the KATC-admin denial, so the legacy
``admin`` all-access test shim is disabled by monkeypatching
``AccessScopeService._test_settings_active`` to return ``False`` (mirrors
``test_scenario_tenant_isolation.py`` task 17.2 and the lifecycle drill's
Step 14).

Run::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/unit/test_scenario_domain_routing.py -q

**Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5**
"""

from __future__ import annotations

import json
import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.catalog.models import InstitutionDomain
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

pytestmark = [pytest.mark.tenant, pytest.mark.django_db]


MIHAS_HOST = "apply.mihas.edu.zm"


# ---------------------------------------------------------------------------
# Auth + capture helpers (mirror the isolation scenario / lifecycle drill)
# ---------------------------------------------------------------------------


def _client_for(profile) -> APIClient:
    """An ``APIClient`` authenticated as ``profile`` (force_authenticate skips CSRF)."""
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


def _blob(response) -> str:
    """One searchable string from the parsed body + the raw response text."""
    try:
        body = response.json()
    except Exception:  # pragma: no cover - non-JSON defensive path
        body = getattr(response, "data", None)
    try:
        raw = response.content.decode("utf-8", "replace")
    except Exception:  # pragma: no cover - defensive only
        raw = ""
    return json.dumps(body, default=str) + "||" + raw


def _list_rows(body):
    """Extract the row list from a (possibly paginated) success envelope."""
    if not isinstance(body, dict):
        return body if isinstance(body, list) else []
    data = body.get("data", body)
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("results", [])
    return []


def _offering_ids(body) -> set[str]:
    """All offering ids surfaced under every canonical program's
    ``available_offerings`` in a canonical-programs listing."""
    ids: set[str] = set()
    for program in _list_rows(body):
        if not isinstance(program, dict):
            continue
        for offering in program.get("available_offerings", []) or []:
            if isinstance(offering, dict) and offering.get("id"):
                ids.add(str(offering["id"]))
    return ids


# ---------------------------------------------------------------------------
# Scenario world
# ---------------------------------------------------------------------------


def _build_scenario():
    """MIHAS + KATC sharing one canonical program + intake; MIHAS has an
    ACTIVE domain, each school has its own active offering.

    Returns a namespace-ish dict with the rows the assertions need.
    """
    sfx = uuid.uuid4().hex[:8]

    canonical = build_canonical_program(suffix=f"canon-{sfx}")
    intake = build_intake(suffix=f"intake-{sfx}")

    mihas = build_institution(
        suffix=f"mihas-{sfx}",
        name="MIHAS",
        full_name="Medical Institute of Health and Allied Sciences",
        brand_name="MIHAS",
    )
    katc = build_institution(
        suffix=f"katc-{sfx}",
        name="KATC",
        full_name="Kafue Agricultural Training Centre",
        brand_name="KATC",
    )

    # Each school offers the SAME canonical program for the SAME intake through
    # its own active offering — so the offering-isolation assertion is real.
    mihas_offering = build_offering(
        institution=mihas,
        canonical_program=canonical,
        suffix=f"mihas-ofr-{sfx}",
        offering_status="active",
    )
    katc_offering = build_offering(
        institution=katc,
        canonical_program=canonical,
        suffix=f"katc-ofr-{sfx}",
        offering_status="active",
    )
    build_program_intake(offering=mihas_offering, intake=intake, is_active=True)
    build_program_intake(offering=katc_offering, intake=intake, is_active=True)

    # MIHAS owns the active white-label domain; KATC has none.
    build_institution_domain(
        institution=mihas,
        hostname=MIHAS_HOST,
        is_primary=True,
        is_active=True,
        status=InstitutionDomain.STATUS_ACTIVE,
    )

    return {
        "canonical": canonical,
        "intake": intake,
        "mihas": mihas,
        "katc": katc,
        "mihas_offering": mihas_offering,
        "katc_offering": katc_offering,
    }


@pytest.fixture()
def production_scope(monkeypatch):
    """Force the production membership/grant scope model.

    Under ``config.settings.test`` ``AccessScopeService`` grants a bare
    ``role == "admin"`` user all-access (legacy dev/test compatibility). The
    KATC-admin denial (R18.5) asserts the production tenant-isolation behaviour,
    so disable that branch exactly as task 17.2 and the lifecycle drill do.
    """
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


def _create_application_on_host(client, *, program_id, intake_id, host, suffix):
    """POST /api/v1/applications/ program-first on a given resolved host."""
    payload = {
        "full_name": f"Domain Applicant {suffix}",
        "nrc_number": "123456/78/9",
        "date_of_birth": "2000-01-01",
        "sex": "Female",
        "phone": "+260970000001",
        "email": f"domain-{suffix}@example.com",
        "residence_town": "Lusaka",
        "country": "Zambia",
        "nationality": "Zambian",
        "program_id": str(program_id),
        "intake_id": str(intake_id),
    }
    return client.post(
        "/api/v1/applications/",
        data=payload,
        format="json",
        HTTP_X_FORWARDED_HOST=host,
    )


# ---------------------------------------------------------------------------
# Requirement 18 — Scenario C
# ---------------------------------------------------------------------------


class TestScenarioCTenantDomainRoutesCorrectly:
    """Requirement 18: a configured tenant domain routes consistently.

    **Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5**
    """

    def test_active_mihas_domain_resolves_mihas_context_and_branding(self):
        """``GET /api/v1/catalog/context/`` on the active MIHAS host resolves the
        MIHAS white-label context + MIHAS branding, never KATC's (R18.1, R18.2)."""
        world = _build_scenario()
        public = APIClient()

        resp = public.get(
            "/api/v1/catalog/context/", HTTP_X_FORWARDED_HOST=MIHAS_HOST
        )

        assert resp.status_code == 200, resp.content
        data = resp.json()["data"]
        # R18.1: the domain resolver resolved the MIHAS tenant context.
        assert data["portal_type"] == "white_label"
        assert data["institution_id"] == str(world["mihas"].id)
        assert data["institution_code"] == world["mihas"].code
        # R18.2: MIHAS-specific branding is served...
        assert data["brand"]["name"] == "MIHAS"
        # ...and KATC branding never surfaces on the MIHAS domain.
        blob = _blob(resp)
        assert "KATC" not in blob
        assert str(world["katc"].id) not in blob

    def test_mihas_domain_lists_only_mihas_offerings_never_katc(self):
        """``GET /api/v1/catalog/canonical-programs/`` on the MIHAS host lists
        only the MIHAS offering for the shared canonical program; the KATC
        offering never appears (R18.3)."""
        world = _build_scenario()
        public = APIClient()

        resp = public.get(
            f"/api/v1/catalog/canonical-programs/?intake={world['intake'].id}",
            HTTP_X_FORWARDED_HOST=MIHAS_HOST,
        )

        assert resp.status_code == 200, resp.content
        offering_ids = _offering_ids(resp.json())
        # The MIHAS offering is present (no vacuous pass)...
        assert str(world["mihas_offering"].id) in offering_ids
        # ...and the KATC offering for the same canonical program never is.
        assert str(world["katc_offering"].id) not in offering_ids
        # Belt-and-braces: no KATC identifier leaks anywhere in the body.
        blob = _blob(resp)
        assert str(world["katc"].id) not in blob
        assert str(world["katc_offering"].id) not in blob

    def test_application_on_mihas_domain_persists_against_mihas_offering(self):
        """``POST /api/v1/applications/`` on the MIHAS host stores the
        application against a MIHAS ``Institution_Program_Offering`` (R18.4)."""
        world = _build_scenario()
        student = build_profile(role="student", suffix=f"stu-{uuid.uuid4().hex[:8]}")

        resp = _create_application_on_host(
            _client_for(student),
            program_id=world["canonical"].id,
            intake_id=world["intake"].id,
            host=MIHAS_HOST,
            suffix="mihas",
        )

        assert resp.status_code == 201, resp.content
        body = resp.json()["data"]
        # The create response attributes the application to MIHAS.
        assert body["assigned_school"]["id"] == str(world["mihas"].id)

        # The persisted row is bound to the MIHAS offering, never KATC's (R18.4).
        application = Application.objects.get(id=body["id"])
        assert str(application.institution_ref_id) == str(world["mihas"].id)
        assert str(application.program_offering_id) == str(world["mihas_offering"].id)
        assert str(application.program_offering_id) != str(world["katc_offering"].id)
        assert str(application.canonical_program_id) == str(world["canonical"].id)
        assert str(application.intake_ref_id) == str(world["intake"].id)

    def test_katc_admin_is_denied_access_to_mihas_application(self, production_scope):
        """A KATC ``Tenant_Admin`` (scoped to KATC only) requesting an
        application submitted on the MIHAS domain gets a non-revealing ``404``
        that leaks no MIHAS identifier (R18.5)."""
        world = _build_scenario()

        # A MIHAS application persisted on the MIHAS domain.
        student = build_profile(role="student", suffix=f"stu-{uuid.uuid4().hex[:8]}")
        create = _create_application_on_host(
            _client_for(student),
            program_id=world["canonical"].id,
            intake_id=world["intake"].id,
            host=MIHAS_HOST,
            suffix="mihas-target",
        )
        assert create.status_code == 201, create.content
        mihas_app_id = create.json()["data"]["id"]

        # A KATC tenant-admin whose authority comes ONLY from an active
        # membership scoped to KATC.
        katc_admin = build_profile(
            role="admin", suffix=f"katc-admin-{uuid.uuid4().hex[:8]}"
        )
        build_membership(
            user=katc_admin,
            institution=world["katc"],
            role="admin",
            permissions=["manage"],
        )

        resp = _client_for(katc_admin).get(f"/api/v1/applications/{mihas_app_id}/")

        # R18.5: out-of-scope read is masked as not-found (no existence leak).
        assert resp.status_code == 404, (resp.status_code, resp.content)
        blob = _blob(resp)
        assert str(world["mihas"].id) not in blob
        assert "MIHAS" not in blob
        assert str(world["mihas_offering"].id) not in blob
