"""Acceptance Scenario A — super admin creates a tenant end to end (task 17.1).

Spec: ``enterprise-tenant-authority`` — Requirement 16 ("Acceptance Scenario —
Super Admin Creates A Tenant End To End"). This is a focused acceptance test
that drives the **real** admin tenant APIs as a ``super_admin`` and proves the
four Requirement-16 acceptance criteria hold end to end, with no manual DB edit
of the tenant/config rows that have an HTTP create surface.

It mirrors the seams already proven by
``tests/integration/test_tenant_lifecycle_drill.py`` but stays scoped to the
Scenario-A criteria:

    R16.1  A Super_Admin onboarding flow (institution profile → domain →
           templates → required documents) persists the tenant + its config via
           the admin APIs with **no manual DB edit** of those rows.
    R16.2  The invited Tenant_Admin is created with a ``UserInstitutionMembership``
           scoped **only** to the new tenant.
    R16.3  The invited Tenant_Admin, listing institutions, sees **only** the new
           tenant — never a second, unrelated tenant — under genuine production
           (membership/grant-driven) scope semantics.
    R16.4  A student applying on the new tenant's resolved (active white-label)
           portal sees **only** that tenant's offerings and binds the
           application to that tenant's offering.

Resources with a create endpoint (institution, domain, template, required
document, membership) are driven through that HTTP surface. Resources with no
V1 create endpoint (canonical programs, offerings, program-intake links) are
built through the shared ``tests.tenant_fixtures`` model factories against the
same ephemeral test DB — documented inline at each step. This keeps the
"no manual DB edit" assertion honest for exactly the rows R16.1 governs.

Run (sqlite test DB, never the production/Neon DB)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/unit/test_scenario_super_admin_onboarding.py -q

**Validates: Requirements 16.1, 16.2, 16.3, 16.4**
"""

from __future__ import annotations

import uuid

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.catalog.models import (
    Institution,
    InstitutionDomain,
    InstitutionRequiredDocument,
    InstitutionDocumentTemplate,
    UserInstitutionMembership,
)
from tests.tenant_fixtures import (
    build_canonical_program,
    build_intake,
    build_offering,
    build_profile,
    build_program_intake,
)

pytestmark = pytest.mark.tenant

WHITE_LABEL_HOST = "apply.newtenant.edu"


def _client_for(profile) -> APIClient:
    """An APIClient authenticated as ``profile`` via the JWTUser pattern."""
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


def _institution_ids(body) -> set[str]:
    """Extract institution ids from a (possibly paginated) list envelope."""
    if not isinstance(body, dict):
        return set()
    data = body.get("data", body)
    if isinstance(data, dict):
        rows = data.get("results", [])
    elif isinstance(data, list):
        rows = data
    else:
        rows = []
    return {str(r["id"]) for r in rows if isinstance(r, dict) and r.get("id")}


def _canonical_program_ids(body) -> set[str]:
    """Extract canonical-program ids from the canonical-programs listing."""
    if not isinstance(body, dict):
        return set()
    data = body.get("data", body)
    rows = data.get("results", []) if isinstance(data, dict) else (data if isinstance(data, list) else [])
    return {str(r["id"]) for r in rows if isinstance(r, dict) and r.get("id")}


@pytest.mark.django_db
class TestScenarioSuperAdminOnboarding:
    """Scenario A: a Super_Admin onboards a tenant and a student applies on it.

    **Validates: Requirements 16.1, 16.2, 16.3, 16.4**
    """

    def test_super_admin_creates_tenant_end_to_end(self, monkeypatch):
        super_admin = build_profile(role="super_admin")
        admin = _client_for(super_admin)
        sfx = uuid.uuid4().hex[:8]

        # ----------------------------------------------------------------- #
        # R16.1 — Step 1: create the new tenant via the admin API.           #
        #   No manual DB edit: the institution row is born from the POST.    #
        # ----------------------------------------------------------------- #
        resp = admin.post(
            "/api/v1/admin/institutions/",
            data={
                "name": f"New Tenant {sfx}",
                "code": f"NEW-{sfx.upper()}",
                "slug": f"new-tenant-{sfx}",
                "brand_name": f"New Tenant {sfx}",
                "primary_color": "#0F766E",
                "support_email": f"support-{sfx}@newtenant.edu",
                "admissions_email": f"admissions-{sfx}@newtenant.edu",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.content
        institution_id = resp.json()["data"]["id"]

        # The tenant persists through the API alone (R16.1) — read it back via
        # the admin detail endpoint, not by reaching into a fixture.
        readback = admin.get(f"/api/v1/admin/institutions/{institution_id}/")
        assert readback.status_code == 200, readback.content
        assert readback.json()["data"]["code"] == f"NEW-{sfx.upper()}"

        # ----------------------------------------------------------------- #
        # R16.1 — Step 2: add + verify + activate a white-label domain.       #
        #   Create lands in pending_dns (R7.3); simulate DNS verification by   #
        #   advancing to verified, then activate through the super-admin       #
        #   endpoint (verified → active, R7.6) so the portal can resolve it.   #
        # ----------------------------------------------------------------- #
        resp = admin.post(
            f"/api/v1/admin/institutions/{institution_id}/domains/",
            data={"hostname": WHITE_LABEL_HOST, "is_primary": True, "is_active": True},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        domain_id = resp.json()["data"]["id"]
        assert resp.json()["data"]["status"] == "pending_dns"
        assert len(resp.json()["data"]["verification_token"]) >= 32

        InstitutionDomain.objects.filter(id=domain_id).update(
            status=InstitutionDomain.STATUS_VERIFIED, verified_at=timezone.now()
        )
        resp = admin.post(
            f"/api/v1/admin/institutions/{institution_id}/domains/{domain_id}/activate/",
            data={},
            format="json",
        )
        assert resp.status_code == 200, resp.content
        assert resp.json()["data"]["status"] == "active"

        # ----------------------------------------------------------------- #
        # R16.1 — Step 3: configure an application template via the API.      #
        # ----------------------------------------------------------------- #
        resp = admin.post(
            f"/api/v1/admin/institutions/{institution_id}/templates/",
            data={
                "institution_id": institution_id,
                "document_type": "acceptance_letter",
                "name": "New Tenant Acceptance Template",
                "sections": {
                    "body": "Dear {{student_name}}, welcome to {{institution}}.",
                    "signatory": "Registrar",
                },
                "tokens": ["student_name", "institution"],
                "is_active": True,
            },
            format="json",
        )
        assert resp.status_code == 201, resp.content
        template_id = resp.json()["data"]["id"]

        # ----------------------------------------------------------------- #
        # R16.1 — Step 4: configure a required document via the API.          #
        # ----------------------------------------------------------------- #
        resp = admin.post(
            f"/api/v1/admin/institutions/{institution_id}/required-documents/",
            data={
                "institution_id": institution_id,
                "document_type": "nrc",
                "label": "National Registration Card",
                "is_required": True,
            },
            format="json",
        )
        assert resp.status_code == 201, resp.content

        # R16.1: every config row above persists via the API, no manual DB edit.
        assert InstitutionDomain.objects.filter(
            id=domain_id, institution_id=institution_id, status="active"
        ).exists()
        assert InstitutionDocumentTemplate.objects.filter(
            id=template_id, institution_id=institution_id, is_active=True
        ).exists()
        assert InstitutionRequiredDocument.objects.filter(
            institution_id=institution_id, document_type="nrc"
        ).exists()

        # ----------------------------------------------------------------- #
        # Step 5: canonical program + linked offering + intake for the new    #
        #   tenant. No public create endpoint for canonical programs/          #
        #   offerings/program-intakes in V1 — built via the shared model       #
        #   factory against the test DB (mirrors the lifecycle drill).         #
        # ----------------------------------------------------------------- #
        institution = Institution.objects.get(id=institution_id)
        canonical = build_canonical_program(suffix=sfx)
        offering = build_offering(
            institution=institution,
            canonical_program=canonical,
            suffix=sfx,
            offering_status="active",
            assignment_priority=100,
        )
        intake = build_intake(suffix=sfx, max_capacity=100)
        build_program_intake(offering=offering, intake=intake, is_active=True, max_capacity=50)

        # ----------------------------------------------------------------- #
        # R16.2 — Step 6: invite a Tenant_Admin scoped to the new tenant.     #
        # ----------------------------------------------------------------- #
        tenant_admin = build_profile(role="admin", suffix=f"tadmin-{sfx}")
        resp = admin.post(
            "/api/v1/admin/memberships/",
            data={
                "user_id": str(tenant_admin.id),
                "institution_id": institution_id,
                "role": "admin",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.content

        # R16.2: the invited tenant-admin's membership is scoped ONLY to the new
        # tenant — exactly one active membership, on this institution.
        memberships = list(
            UserInstitutionMembership.objects.filter(
                user_id=tenant_admin.id, is_active=True
            )
        )
        assert len(memberships) == 1
        assert str(memberships[0].institution_id) == institution_id

        # ----------------------------------------------------------------- #
        # Step 7: build a SECOND, unrelated tenant (institution B) with its    #
        #   own canonical program + active offering, to prove isolation.       #
        # ----------------------------------------------------------------- #
        other_sfx = uuid.uuid4().hex[:8]
        resp = admin.post(
            "/api/v1/admin/institutions/",
            data={
                "name": f"Other Tenant {other_sfx}",
                "code": f"OTH-{other_sfx.upper()}",
                "slug": f"other-tenant-{other_sfx}",
                "brand_name": f"Other Tenant {other_sfx}",
                "primary_color": "#7C2D12",
                "support_email": f"support-{other_sfx}@other.edu",
                "admissions_email": f"admissions-{other_sfx}@other.edu",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.content
        other_institution_id = resp.json()["data"]["id"]
        other_institution = Institution.objects.get(id=other_institution_id)
        other_canonical = build_canonical_program(suffix=other_sfx)
        other_offering = build_offering(
            institution=other_institution,
            canonical_program=other_canonical,
            suffix=other_sfx,
            offering_status="active",
            assignment_priority=100,
        )
        build_program_intake(
            offering=other_offering, intake=intake, is_active=True, max_capacity=50
        )

        # ----------------------------------------------------------------- #
        # R16.3 — disable the legacy admin test-scope shim so genuine          #
        #   production (membership/grant-driven) scope semantics apply, then   #
        #   list institutions as the invited Tenant_Admin.                     #
        # ----------------------------------------------------------------- #
        monkeypatch.setattr(
            "apps.catalog.services.AccessScopeService._test_settings_active",
            staticmethod(lambda: False),
        )

        tenant_admin_client = _client_for(tenant_admin)
        listing = tenant_admin_client.get("/api/v1/admin/institutions/")
        assert listing.status_code == 200, listing.content
        visible_ids = _institution_ids(listing.json())
        # R16.3: the tenant-admin sees ONLY the new tenant, never tenant B.
        assert visible_ids == {institution_id}, visible_ids
        assert other_institution_id not in visible_ids

        # And an out-of-scope detail read is masked as not-found (no existence
        # leak of tenant B).
        oos = tenant_admin_client.get(f"/api/v1/admin/institutions/{other_institution_id}/")
        assert oos.status_code == 404, oos.content
        assert other_institution.name not in str(oos.json())

        # ----------------------------------------------------------------- #
        # R16.4 — a student on the new tenant's resolved white-label portal    #
        #   sees ONLY its offerings and binds the application to its offering. #
        # ----------------------------------------------------------------- #
        public = APIClient()

        # The active white-label host resolves to the new tenant context.
        ctx = public.get("/api/v1/catalog/context/", HTTP_X_FORWARDED_HOST=WHITE_LABEL_HOST)
        assert ctx.status_code == 200, ctx.content
        ctx_data = ctx.json()["data"]
        assert ctx_data["portal_type"] == "white_label"
        assert ctx_data["institution_id"] == institution_id

        # The tenant portal lists ONLY the new tenant's offerings (R16.4 / R8.7):
        # the new tenant's canonical program is present; tenant B's is absent.
        programs = public.get(
            f"/api/v1/catalog/canonical-programs/?intake={intake.id}",
            HTTP_X_FORWARDED_HOST=WHITE_LABEL_HOST,
        )
        assert programs.status_code == 200, programs.content
        program_ids = _canonical_program_ids(programs.json())
        assert str(canonical.id) in program_ids
        assert str(other_canonical.id) not in program_ids

        # A student applies on the new tenant's portal; the application binds to
        # the new tenant's offering (R16.4).
        student = build_profile(role="student", suffix=f"stu-{sfx}")
        resp = _client_for(student).post(
            "/api/v1/applications/",
            data={
                "full_name": f"New Tenant Applicant {sfx}",
                "nrc_number": "123456/78/9",
                "date_of_birth": "2000-01-01",
                "sex": "Female",
                "phone": "+260970000001",
                "email": f"stu-{sfx}@example.com",
                "residence_town": "Lusaka",
                "country": "Zambia",
                "nationality": "Zambian",
                "program_id": str(canonical.id),
                "intake_id": str(intake.id),
                "institution_id": institution_id,  # white-label restriction
            },
            format="json",
        )
        assert resp.status_code == 201, resp.content
        body = resp.json()["data"]
        assert body["assigned_school"]["id"] == institution_id

        application = Application.objects.get(id=body["id"])
        assert str(application.institution_ref_id) == institution_id
        assert str(application.program_offering_id) == str(offering.id)
        assert str(application.canonical_program_id) == str(canonical.id)
