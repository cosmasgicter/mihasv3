"""Admin end-to-end journey drill (task 17.2, R8.2).

Spec: ``.kiro/specs/beanola-production-readiness/`` — Phase 8 (End-to-end
workflow QA), Component 8, Requirement **R8.2**.

This is the **admin E2E_Flow set** authored as a backend integration walk: it
runs entirely against the ephemeral Django test database
(``config.settings.test`` → sqlite) and the in-process DRF test client. It never
touches the production EC2 Postgres or the Neon authoring branch. The live
staging run (Playwright, gated) is the optional browser confirmation of the same
seams — see ``apps/admissions/tests/e2e/adminJourney.spec.ts`` for run
instructions.

It walks the full R8.2 admin journey end to end, driving every step that has an
admin HTTP surface through that surface so a reviewer can read one file and see
every R8.2 element pass against the real API + services:

    1.  Super-admin "login" (force-authenticated super-admin actor)        R8.2
    2.  Institution creation         (POST /api/v1/admin/institutions/)    R8.2
    3.  Logo + signature upload      (POST .../assets/upload/)             R8.2
    4.  Document-profile creation    (POST .../document-profiles/)         R8.2
    5.  Offering creation + assignment (canonical program + offering +     R8.2
        program-intake via the shared model factory; no V1 create API)
    6.  Routing simulator            (POST /api/v1/admin/routing/simulate/) R8.2
    7.  Add a staff member           (POST /api/v1/admin/memberships/)     R8.2
    8.  Add a scoped Access_Grant    (POST /api/v1/admin/access-grants/)   R8.2
    9.  Staff login sees ONLY scoped data (GET /api/v1/applications/)      R8.2
    10. Application review           (POST .../{id}/review/ new_status)    R8.2
    11. Payment verification         (POST .../{id}/review/ paymentStatus) R8.2
    12. Official-document generation (acceptance letter from the profile)  R8.2
    13. Super-admin audit            (GET /api/v1/admin/tenant-audit/)     R8.2
    14. Scoped report export         (GET /api/v1/applications/export/)    R8.2

Where ``test_tenant_lifecycle_drill.py`` proves the multi-tenant *create →
apply → pay → document → scope* seams, this drill is the **admin operator
journey**: it exercises the admin onboarding/config + review/verify + audit +
export surfaces the R8.2 acceptance criterion enumerates, and asserts the
production (membership/grant-driven) scope semantics rather than the
test-settings legacy-admin all-access shortcut.

Run (sqlite, never the production/Neon DB)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/integration/test_admin_journey_drill.py -v

**Validates: Requirements 8.2**
"""

from __future__ import annotations

import base64
import io
import json
import uuid

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.catalog.models import (
    AccessGrant,
    Institution,
    InstitutionAsset,
    InstitutionDocumentProfile,
    UserInstitutionMembership,
)
from apps.catalog.services import AccessScopeService
from apps.documents.models import ApplicationDocument, Payment
from apps.documents.payment_service import PaymentService
from tests.tenant_fixtures import (
    build_canonical_program,
    build_intake,
    build_offering,
    build_profile,
    build_program_intake,
    build_tenant_world,
)

pytestmark = pytest.mark.tenant


# A real 1x1 transparent PNG so the upload magic-byte validator AND the
# reportlab ``ImageReader`` in the official-document renderer both succeed.
_PNG_1x1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQAB"
    "h6FO1AAAAABJRU5ErkJggg=="
)


class _FakeStorage:
    """Minimal in-memory MediaStorage stand-in for asset upload + PDF render.

    Both ``AdminTenantAssetUploadView`` and the official-document renderer do a
    call-time ``from apps.common.storage import MediaStorage`` then
    ``save``/``url``/``open``. Patching the module attribute swaps in this
    in-memory backend so the drill never reaches for real R2/S3 credentials.
    """

    _files: dict[str, bytes] = {}

    def save(self, name, content):
        content.seek(0)
        self._files[name] = content.read()
        return name

    def url(self, name):
        return f"https://test-storage.local/{name}"

    def open(self, name, mode="rb"):
        return io.BytesIO(self._files[name])


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


def _application_ids(body) -> set[str]:
    """Extract application ids from a (possibly paginated) list envelope."""
    if not isinstance(body, dict):
        if isinstance(body, list):
            return {str(r["id"]) for r in body if isinstance(r, dict) and r.get("id")}
        return set()
    data = body.get("data", body)
    if isinstance(data, dict):
        rows = data.get("results", [])
    elif isinstance(data, list):
        rows = data
    else:
        rows = []
    return {str(r["id"]) for r in rows if isinstance(r, dict) and r.get("id")}


def _create_application(client, *, program_id, intake_id, suffix):
    """POST /api/v1/applications/ program-first; return the response."""
    payload = {
        "full_name": f"Journey Applicant {suffix}",
        "nrc_number": "123456/78/9",
        "date_of_birth": "2000-01-01",
        "sex": "Female",
        "phone": "+260970000001",
        "email": f"journey-{suffix}@example.com",
        "residence_town": "Lusaka",
        "country": "Zambia",
        "nationality": "Zambian",
        "program_id": str(program_id),
        "intake_id": str(intake_id),
    }
    return client.post("/api/v1/applications/", data=payload, format="json")


@pytest.mark.django_db
class TestAdminJourneyDrill:
    """The full super-admin → onboard → staff-scope → review → audit → export
    admin journey (R8.2).

    **Validates: Requirements 8.2**
    """

    def test_full_admin_journey(self, monkeypatch):
        # Swap real R2/S3 storage for the in-memory backend (asset upload + PDF).
        _FakeStorage._files = {}
        monkeypatch.setattr("apps.common.storage.MediaStorage", _FakeStorage)

        super_admin = build_profile(role="super_admin")
        admin = _client_for(super_admin)
        sfx = uuid.uuid4().hex[:8]

        # ----------------------------------------------------------------- #
        # Step 1 — Super-admin login                                        #
        #   The force-authenticated super-admin actor stands in for a real  #
        #   cookie login; every admin write below is gated on this role.    #
        # ----------------------------------------------------------------- #
        assert super_admin.role == "super_admin"

        # ----------------------------------------------------------------- #
        # Step 2 — Institution creation (POST /api/v1/admin/institutions/)  #
        # ----------------------------------------------------------------- #
        resp = admin.post(
            "/api/v1/admin/institutions/",
            data={
                "name": f"Journey School {sfx}",
                "code": f"JRNY-{sfx.upper()}",
                "slug": f"journey-school-{sfx}",
                "brand_name": f"Journey School {sfx}",
                "primary_color": "#0F766E",
                "support_email": f"support-{sfx}@journeyschool.edu",
                "admissions_email": f"admissions-{sfx}@journeyschool.edu",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.content
        institution_id = resp.json()["data"]["id"]
        institution = Institution.objects.get(id=institution_id)

        # ----------------------------------------------------------------- #
        # Step 3 — Logo + signature asset upload (POST .../assets/upload/)  #
        # ----------------------------------------------------------------- #
        for asset_type in ("logo", "signature"):
            upload = SimpleUploadedFile(
                f"{asset_type}.png", _PNG_1x1, content_type="image/png"
            )
            resp = admin.post(
                f"/api/v1/admin/institutions/{institution_id}/assets/upload/",
                data={"file": upload, "asset_type": asset_type},
                format="multipart",
            )
            assert resp.status_code == 201, (asset_type, resp.content)
            assert resp.json()["data"]["asset_type"] == asset_type
        assert InstitutionAsset.objects.filter(
            institution_id=institution_id, is_active=True
        ).count() == 2

        # ----------------------------------------------------------------- #
        # Step 4 — Document-profile creation (POST .../document-profiles/)   #
        #   The profile-required acceptance letter renders solely from this  #
        #   profile (step 12); without it the render fails by design (R8.5). #
        # ----------------------------------------------------------------- #
        resp = admin.post(
            f"/api/v1/admin/institutions/{institution_id}/document-profiles/",
            data={
                "institution_id": institution_id,
                "document_type": "acceptance_letter",
                "layout_key": "fee_chart_letter",
                "sections": {
                    "body": "Dear {{student_name}}, welcome to {{institution}}.",
                },
                "fee_chart": [{"item": "Tuition", "amount": 5000}],
                "bank_accounts": [
                    {
                        "bank_name": "Beanola Bank",
                        "account_name": "Journey School",
                        "account_number": "0123456789",
                        "branch": "Main",
                    }
                ],
                "requirements": ["Bring your NRC", "Bring your result slip"],
                "signatory": {"name": "Registrar", "role": "Admissions"},
                "is_active": True,
            },
            format="json",
        )
        assert resp.status_code == 201, resp.content
        profile_id = resp.json()["data"]["id"]
        assert InstitutionDocumentProfile.objects.filter(
            id=profile_id, institution_id=institution_id, is_active=True
        ).exists()

        # ----------------------------------------------------------------- #
        # Step 5 — Offering creation + assignment (R8.2)                     #
        #   No public create endpoint for canonical programs/offerings in    #
        #   V1; built via the shared model factory against the test DB so    #
        #   the routing simulator + assignment have a real candidate.        #
        # ----------------------------------------------------------------- #
        canonical = build_canonical_program(suffix=sfx)
        offering = build_offering(
            institution=institution,
            canonical_program=canonical,
            suffix=sfx,
            offering_status="active",
            assignment_priority=100,
        )
        intake = build_intake(suffix=sfx, max_capacity=100)
        build_program_intake(
            offering=offering, intake=intake, is_active=True, max_capacity=50
        )

        # ----------------------------------------------------------------- #
        # Step 6 — Routing simulator (POST /api/v1/admin/routing/simulate/)  #
        #   Dry-run the canonical assignment service; the simulated offering #
        #   must match the offering created in step 5 (no reimplementation). #
        # ----------------------------------------------------------------- #
        resp = admin.post(
            "/api/v1/admin/routing/simulate/",
            data={
                "program_id": str(canonical.id),
                "intake_id": str(intake.id),
                "nationality": "Zambian",
                "country": "Zambia",
            },
            format="json",
        )
        assert resp.status_code == 200, resp.content
        sim = resp.json()["data"]
        assert sim["assigned"] is True, sim
        assert sim["program_offering_id"] == str(offering.id), sim
        assert sim["institution_id"] == institution_id, sim

        # ----------------------------------------------------------------- #
        # Step 7 — Add a staff member (POST /api/v1/admin/memberships/)      #
        # ----------------------------------------------------------------- #
        staff = build_profile(role="admin", suffix=f"staff-{sfx}")
        resp = admin.post(
            "/api/v1/admin/memberships/",
            data={
                "user_id": str(staff.id),
                "institution_id": institution_id,
                "role": "admin",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.content
        assert UserInstitutionMembership.objects.filter(
            user_id=staff.id, institution_id=institution_id, is_active=True
        ).exists()

        # A second, offering-scoped staff member receives ONLY a scoped grant
        # (no institution-wide membership), so the grant alone gates their view.
        scoped_staff = build_profile(role="admin", suffix=f"scoped-{sfx}")

        # ----------------------------------------------------------------- #
        # Step 8 — Add a scoped Access_Grant (POST .../access-grants/)       #
        #   An offering-scoped grant to the single offering created above.   #
        # ----------------------------------------------------------------- #
        resp = admin.post(
            "/api/v1/admin/access-grants/",
            data={
                "user_id": str(scoped_staff.id),
                "scope_type": "program_offering",
                "program_id": str(offering.id),
            },
            format="json",
        )
        assert resp.status_code == 201, resp.content
        grant_id = resp.json()["data"]["id"]
        assert AccessGrant.objects.filter(
            id=grant_id, user_id=scoped_staff.id, program_id=offering.id, is_active=True
        ).exists()

        # ----------------------------------------------------------------- #
        # Seed two applications on THIS school so there is something to       #
        # review, verify, and (for the scoped staff) see.                    #
        # ----------------------------------------------------------------- #
        student = build_profile(role="student", suffix=f"stu-{sfx}")
        resp = _create_application(
            _client_for(student),
            program_id=canonical.id,
            intake_id=intake.id,
            suffix=f"a-{sfx}",
        )
        assert resp.status_code == 201, resp.content
        app_body = resp.json()["data"]
        app_id = app_body["id"]
        assert app_body["assigned_school"]["id"] == institution_id

        # A second student/application so the scoped staff list has >1 in-scope.
        student2 = build_profile(role="student", suffix=f"stu2-{sfx}")
        resp = _create_application(
            _client_for(student2),
            program_id=canonical.id,
            intake_id=intake.id,
            suffix=f"b-{sfx}",
        )
        assert resp.status_code == 201, resp.content
        app_id2 = resp.json()["data"]["id"]

        # ----------------------------------------------------------------- #
        # Step 9 — Staff login sees ONLY scoped data (R8.2)                  #
        #   Assert the PRODUCTION (membership/grant-driven) scope model, not #
        #   the test-settings legacy-admin all-access shortcut. Build an     #
        #   unrelated school B and prove neither staff actor can see it.     #
        # ----------------------------------------------------------------- #
        monkeypatch.setattr(
            AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
        )
        other = build_tenant_world()  # school B + its own offering + application

        # Institution-scoped staff sees both of school A's applications...
        member_list = _client_for(staff).get("/api/v1/applications/")
        assert member_list.status_code == 200, member_list.content
        member_ids = _application_ids(member_list.json())
        assert app_id in member_ids
        assert app_id2 in member_ids
        assert other.application_id not in member_ids  # never school B

        # Offering-scoped staff sees the same offering's applications and never
        # school B's (their grant is the single offering, which is school A's).
        scoped_list = _client_for(scoped_staff).get("/api/v1/applications/")
        assert scoped_list.status_code == 200, scoped_list.content
        scoped_ids = _application_ids(scoped_list.json())
        assert app_id in scoped_ids
        assert other.application_id not in scoped_ids

        # Out-of-scope detail read is masked as not-found (no existence leak).
        oos = _client_for(staff).get(f"/api/v1/applications/{other.application_id}/summary/")
        assert oos.status_code == 404, oos.content
        assert other.institution.name not in str(oos.json())

        # ----------------------------------------------------------------- #
        # Step 10 — Application review (POST .../{id}/review/)               #
        #   Admin moves the application submitted → under_review. The review #
        #   endpoint is staff-scoped, so the in-scope member may drive it.   #
        # ----------------------------------------------------------------- #
        # Admin force-submits first (draft → submitted) so review can proceed.
        submit_resp = _client_for(staff).post(
            f"/api/v1/applications/{app_id}/review/",
            data={"new_status": "submitted"},
            format="json",
        )
        assert submit_resp.status_code == 200, submit_resp.content

        review_resp = _client_for(staff).post(
            f"/api/v1/applications/{app_id}/review/",
            data={"new_status": "under_review", "notes": "Reviewing journey applicant"},
            format="json",
        )
        assert review_resp.status_code == 200, review_resp.content
        Application.objects.get(id=app_id).refresh_from_db()
        assert Application.objects.get(id=app_id).status == "under_review"

        # ----------------------------------------------------------------- #
        # Step 11 — Payment verification (POST .../{id}/review/ paymentStatus)#
        #   Admin verifies the payment; the review path mints a canonical    #
        #   resolved payment row so approval is unblocked.                   #
        # ----------------------------------------------------------------- #
        verify_resp = _client_for(staff).post(
            f"/api/v1/applications/{app_id}/review/",
            data={"paymentStatus": "verified", "verificationNotes": "Offline payment confirmed"},
            format="json",
        )
        assert verify_resp.status_code == 200, verify_resp.content
        assert Payment.objects.filter(
            application_id=app_id, status__in=("successful", "force_approved", "verified"),
        ).exists()

        # Approve (payment now resolved, so no force needed).
        approve_resp = _client_for(staff).post(
            f"/api/v1/applications/{app_id}/review/",
            data={"new_status": "approved", "notes": "Approved"},
            format="json",
        )
        assert approve_resp.status_code == 200, approve_resp.content
        application = Application.objects.get(id=app_id)
        assert application.status == "approved"

        # ----------------------------------------------------------------- #
        # Step 12 — Official-document generation (acceptance letter, R8.2)   #
        #   The acceptance letter renders from the profile created in step 4 #
        #   and snapshots the assigned-school + asset + profile provenance.  #
        # ----------------------------------------------------------------- #
        from apps.applications.tasks import generate_acceptance_letter_task

        generate_acceptance_letter_task.apply(args=[str(app_id)])
        acceptance = (
            ApplicationDocument.objects.filter(
                application_id=app_id, document_type="acceptance_letter"
            )
            .order_by("-uploaded_at")
            .first()
        )
        assert acceptance is not None, "acceptance letter was not generated"
        provenance = json.loads(acceptance.verification_notes)["official_document"]
        assert provenance["institution_id"] == institution_id
        assert provenance["profile_id"] == profile_id
        assert provenance["logo_asset_id"] is not None
        assert provenance["signature_asset_id"] is not None
        assert provenance["logo_render"] != "none"

        # ----------------------------------------------------------------- #
        # Step 13 — Super-admin audit (GET /api/v1/admin/tenant-audit/)      #
        #   The config writes above (institution/asset/profile/membership/   #
        #   grant) surface as ``tenant.*`` Audit_Events in the super-admin    #
        #   operational-review feed.                                          #
        # ----------------------------------------------------------------- #
        audit_resp = admin.get("/api/v1/admin/tenant-audit/")
        assert audit_resp.status_code == 200, audit_resp.content
        audit_rows = audit_resp.json()["data"]["results"]
        audit_actions = {row.get("action") for row in audit_rows}
        # At least the tenant config-change family is present.
        assert any(
            str(a).startswith("tenant.") for a in audit_actions
        ), audit_actions
        # The audit feed is super-admin only: school staff are masked out.
        staff_audit = _client_for(staff).get("/api/v1/admin/tenant-audit/")
        assert staff_audit.status_code in (403, 404), staff_audit.content

        # ----------------------------------------------------------------- #
        # Step 14 — Scoped report export (GET /api/v1/applications/export/)  #
        #   The in-scope member exports ONLY their school's applications;    #
        #   a non-super-admin export is scope-narrowed and PII-redacted, and #
        #   never includes school B's applicant.                             #
        # ----------------------------------------------------------------- #
        export_resp = _client_for(staff).get("/api/v1/applications/export/")
        assert export_resp.status_code == 200, export_resp.content
        export_blob = export_resp.content.decode("utf-8", errors="ignore")
        # School A's applications are present; school B's is absent (scoped).
        assert application.application_number in export_blob
        assert other.application.application_number not in export_blob
        # Super-admin export spans every school (cross-school visibility).
        super_export = admin.get("/api/v1/applications/export/")
        assert super_export.status_code == 200, super_export.content
        super_blob = super_export.content.decode("utf-8", errors="ignore")
        assert application.application_number in super_blob
        assert other.application.application_number in super_blob
