"""Acceptance Scenario B — a MIHAS tenant admin is fully isolated from KATC.

Spec: ``.kiro/specs/enterprise-tenant-authority/`` — Task 17.2.

This is the end-to-end acceptance scenario behind **Requirement 17**: a MIHAS
``Tenant_Admin`` (an ``admin`` whose authority comes *only* from an active
``UserInstitutionMembership`` scoped to MIHAS) must never observe, fetch,
mutate, or infer any KATC data — through the admin tenant API **or** the
``Legacy_Catalog_Endpoints`` — and every denial must be non-revealing (no KATC
identifier, name, code, slug, or attribute in the response body).

Two real tenants ("MIHAS" and "KATC") are built via ``tests.tenant_fixtures``;
the actor is a fresh ``admin`` holding a single active membership to MIHAS only
(deliberately granted the ``manage`` bundle for MIHAS so every denial below is
proven to come from **tenant scope**, never from a missing mutation
permission).

As that MIHAS tenant-admin we assert:

* **List institutions** (``GET /api/v1/admin/institutions/``) returns only
  MIHAS, never KATC (R17.1, R17.2).
* **Fetch the KATC institution** (``GET /api/v1/admin/institutions/{katc}/``)
  is a non-revealing ``404`` — scope-before-lookup masks its existence
  (R17.2, R17.4).
* **Patch the KATC institution** through both the admin tenant API
  (``PATCH /api/v1/admin/institutions/{katc}/``) and the legacy catalog path
  (``PATCH /api/v1/catalog/institutions/{katc}/``) is a non-revealing
  ``403``/``404`` with the KATC row unchanged and no KATC data leaked
  (R17.2, R17.4).
* **Create an institution** through the admin tenant API
  (``POST /api/v1/admin/institutions/``) and the legacy catalog path
  (``POST /api/v1/catalog/institutions/``) is rejected ``403`` with no
  institution created (R17.3).
* **Create a KATC program by id** (``POST /api/v1/catalog/programs/`` carrying
  KATC's ``institution_id``) is rejected ``403`` with no ``Program`` created
  (R17.5).
* **Invite KATC staff** (``POST /api/v1/admin/memberships/`` with
  ``institution_id`` = KATC) is rejected ``403 STAFF_INVITE_FORBIDDEN`` with no
  membership materialised for KATC (R17.6).

Production scope semantics are required, so the legacy ``admin`` all-access test
shim is disabled by monkeypatching ``AccessScopeService._test_settings_active``
to return ``False`` (mirrors ``test_cross_tenant_invisibility.py`` and the
lifecycle drill's Step 14).

Run::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/unit/test_scenario_tenant_isolation.py -q

**Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5, 17.6**
"""

from __future__ import annotations

import json
import uuid

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.models import Institution, Program, UserInstitutionMembership
from apps.catalog.services import AccessScopeService
from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_membership,
    build_profile,
)

pytestmark = [pytest.mark.tenant, pytest.mark.django_db]


# ---------------------------------------------------------------------------
# Auth + capture helpers (mirrors the property isolation suite)
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


def _katc_tokens(katc: Institution) -> dict[str, str]:
    """Every unique KATC identifier / name / code / slug that must never leak."""
    candidates = {
        "institution_id": str(katc.id),
        "name": katc.name,
        "code": katc.code,
        "full_name": getattr(katc, "full_name", None),
        "slug": getattr(katc, "slug", None),
        "brand_name": getattr(katc, "brand_name", None),
    }
    return {label: value for label, value in candidates.items() if value}


def _assert_no_katc_leak(response, katc: Institution) -> None:
    """The response discloses no KATC identifier/name/code/slug/attribute."""
    blob = _blob(response)
    for label, value in _katc_tokens(katc).items():
        assert value not in blob, {
            "leaked": label,
            "value": value,
            "status": response.status_code,
            "blob": blob[:2000],
        }


# ---------------------------------------------------------------------------
# Scenario world
# ---------------------------------------------------------------------------


def _build_scenario():
    """Build MIHAS + KATC and a MIHAS tenant-admin scoped to MIHAS only.

    Returns ``(mihas, katc, actor_client)``. The actor is a fresh ``admin``
    holding a single active ``manage`` membership to MIHAS — so any KATC denial
    is unambiguously a *tenant-scope* denial, never a missing-permission one.
    """
    sfx = uuid.uuid4().hex[:8]
    # Codes are made unique per build (``MIHAS-{sfx}`` / ``KATC-{sfx}``) so a
    # broad multi-file pytest run cannot hit ``UNIQUE constraint failed:
    # institutions.code`` when another test commits a plain ``MIHAS``/``KATC``
    # row. ``name`` and ``brand_name`` stay the human-facing "MIHAS"/"KATC"
    # identifiers so the non-revealing-leak assertions still check the values a
    # tenant admin would actually recognise. ``_katc_tokens`` reads
    # ``katc.code`` directly, so the now-unique code is still asserted against.
    mihas = build_institution(
        suffix=f"mihas-{sfx}",
        name="MIHAS",
        code=f"MIHAS-{sfx}",
        full_name="Medical Institute of Health and Allied Sciences",
        slug=f"mihas-{sfx}",
        brand_name="MIHAS",
    )
    katc = build_institution(
        suffix=f"katc-{sfx}",
        name="KATC",
        code=f"KATC-{sfx}",
        full_name="Kafue Agricultural Training Centre",
        slug=f"katc-{sfx}",
        brand_name="KATC",
    )

    actor = build_profile(role="admin", suffix=f"mihas-admin-{sfx}")
    build_membership(
        user=actor, institution=mihas, role="admin", permissions=["manage"]
    )
    return mihas, katc, _client_for(actor)


@pytest.fixture()
def production_scope(monkeypatch):
    """Force the production membership/grant scope model.

    Under ``config.settings.test`` ``AccessScopeService`` grants a bare
    ``role == "admin"`` user all-access (legacy dev/test compatibility). This
    acceptance scenario asserts the production tenant-isolation behaviour, so
    disable that branch exactly as the property isolation suite does.
    """
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


# ---------------------------------------------------------------------------
# Requirement 17 — Scenario B
# ---------------------------------------------------------------------------


class TestScenarioBMihasTenantAdminIsolatedFromKatc:
    """Requirement 17: a MIHAS Tenant_Admin is fully isolated from KATC.

    **Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5, 17.6**
    """

    def test_list_institutions_returns_only_mihas_never_katc(self, production_scope):
        """``GET /api/v1/admin/institutions/`` returns only MIHAS; KATC is
        absent from the body entirely (R17.1, R17.2)."""
        mihas, katc, client = _build_scenario()

        resp = client.get("/api/v1/admin/institutions/")

        assert resp.status_code == 200, resp.content
        blob = _blob(resp)
        # The actor's own tenant is present (no vacuous pass)...
        assert str(mihas.id) in blob
        assert "MIHAS" in blob
        # ...and KATC never surfaces on the list.
        _assert_no_katc_leak(resp, katc)

    def test_fetch_katc_institution_is_non_revealing_not_found(self, production_scope):
        """``GET /api/v1/admin/institutions/{katc}/`` is masked as a
        non-revealing 404 (scope before lookup); KATC's existence is never
        confirmed (R17.2, R17.4)."""
        _mihas, katc, client = _build_scenario()

        resp = client.get(f"/api/v1/admin/institutions/{katc.id}/")

        assert resp.status_code == 404, (resp.status_code, resp.content)
        _assert_no_katc_leak(resp, katc)

    def test_patch_katc_admin_api_is_rejected_without_mutation(self, production_scope):
        """``PATCH /api/v1/admin/institutions/{katc}/`` is a non-revealing
        403/404 with KATC unchanged and no KATC data leaked (R17.2, R17.4)."""
        _mihas, katc, client = _build_scenario()
        original_name = katc.name

        resp = client.patch(
            f"/api/v1/admin/institutions/{katc.id}/",
            {"name": "Hijacked By MIHAS"},
            format="json",
        )

        assert resp.status_code in (403, 404), (resp.status_code, resp.content)
        katc.refresh_from_db()
        assert katc.name == original_name
        assert katc.name != "Hijacked By MIHAS"
        _assert_no_katc_leak(resp, katc)

    def test_patch_katc_legacy_catalog_is_rejected_without_mutation(
        self, production_scope
    ):
        """The legacy catalog ``PATCH /api/v1/catalog/institutions/{katc}/`` is
        equally a non-revealing 403/404 with KATC unchanged (R17.4)."""
        _mihas, katc, client = _build_scenario()
        original_name = katc.name

        resp = client.patch(
            f"/api/v1/catalog/institutions/{katc.id}/",
            {"name": "Hijacked Via Legacy"},
            format="json",
        )

        assert resp.status_code in (403, 404), (resp.status_code, resp.content)
        katc.refresh_from_db()
        assert katc.name == original_name
        assert katc.name != "Hijacked Via Legacy"
        _assert_no_katc_leak(resp, katc)

    def test_create_institution_admin_api_is_rejected(self, production_scope):
        """``POST /api/v1/admin/institutions/`` is rejected 403 with no new
        institution created (R17.3)."""
        _mihas, _katc, client = _build_scenario()
        before = Institution.objects.count()

        resp = client.post(
            "/api/v1/admin/institutions/",
            {
                "name": "Rogue Tenant Admin School",
                "code": "ROGUE-ADMIN",
                "slug": f"rogue-admin-{uuid.uuid4().hex[:8]}",
            },
            format="json",
        )

        assert resp.status_code == 403, (resp.status_code, resp.content)
        assert Institution.objects.count() == before
        assert not Institution.objects.filter(code="ROGUE-ADMIN").exists()

    def test_create_institution_legacy_catalog_is_rejected(self, production_scope):
        """The legacy catalog ``POST /api/v1/catalog/institutions/`` is equally
        rejected 403 with no new institution created (R17.3)."""
        _mihas, _katc, client = _build_scenario()
        before = Institution.objects.count()

        resp = client.post(
            "/api/v1/catalog/institutions/",
            {
                "name": "Rogue Legacy School",
                "code": "ROGUE-LEGACY",
                "slug": f"rogue-legacy-{uuid.uuid4().hex[:8]}",
            },
            format="json",
        )

        assert resp.status_code == 403, (resp.status_code, resp.content)
        assert Institution.objects.count() == before
        assert not Institution.objects.filter(code="ROGUE-LEGACY").exists()

    def test_create_katc_program_by_id_is_rejected_without_mutation(
        self, production_scope
    ):
        """Posting KATC's ``institution_id`` to ``POST /api/v1/catalog/programs/``
        is rejected 403 with no ``Program`` created and no KATC data leaked
        (R17.5)."""
        _mihas, katc, client = _build_scenario()
        canonical = build_canonical_program(suffix=uuid.uuid4().hex[:8])
        code = f"KATC-OFR-{uuid.uuid4().hex[:8].upper()}"
        before = Program.objects.count()

        resp = client.post(
            "/api/v1/catalog/programs/",
            {
                "name": "KATC Offering Via MIHAS Admin",
                "code": code,
                "institution_id": str(katc.id),
                "canonical_program_id": str(canonical.id),
            },
            format="json",
        )

        assert resp.status_code == 403, (resp.status_code, resp.content)
        assert Program.objects.count() == before
        assert not Program.objects.filter(code=code).exists()
        _assert_no_katc_leak(resp, katc)

    def test_invite_katc_staff_is_rejected_with_stable_code(self, production_scope):
        """Inviting staff into KATC via ``POST /api/v1/admin/memberships/`` is
        rejected ``403 STAFF_INVITE_FORBIDDEN`` with no KATC membership created
        and no KATC data leaked (R17.6)."""
        _mihas, katc, client = _build_scenario()
        invitee = build_profile(role="admin", suffix=f"invitee-{uuid.uuid4().hex[:8]}")
        before = UserInstitutionMembership.objects.filter(
            institution_id=katc.id
        ).count()

        resp = client.post(
            "/api/v1/admin/memberships/",
            {
                "user_id": str(invitee.id),
                "institution_id": str(katc.id),
                "role": "admin",
            },
            format="json",
        )

        assert resp.status_code == 403, (resp.status_code, resp.content)
        assert resp.data.get("code") == "STAFF_INVITE_FORBIDDEN", resp.data
        # No cross-tenant membership materialised for KATC.
        assert (
            UserInstitutionMembership.objects.filter(institution_id=katc.id).count()
            == before
        )
        assert not UserInstitutionMembership.objects.filter(
            user_id=invitee.id, institution_id=katc.id
        ).exists()
        _assert_no_katc_leak(resp, katc)
