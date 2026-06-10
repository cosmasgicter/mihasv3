"""End-to-end tenant lifecycle drill (task 29).

Spec: ``multi-tenant-beanola-admissions`` — Phase 6 task 29 ("E2E tenant
lifecycle drill"). This is a verification DRILL, **not** a production
migration: it runs entirely against the ephemeral Django test database
(``config.settings.test`` → sqlite) and the in-process DRF test client. It
never touches the production EC2 Postgres or the Neon authoring branch.

It walks the full Beanola multi-school lifecycle end to end, proving the
critical seams hold together:

    1.  Create a school (POST /api/v1/admin/institutions/)                 R5.1
    2.  Add a white-label domain (POST .../domains/)                       R3.1
    3.  Upload logo + signature assets (POST .../assets/upload/)           R6.1
    4.  Create a canonical program + a school offering linked to it        R2.1
    5.  Attach an intake + per-offering capacity (program_intakes)         R2.1
    6.  Configure a required document (POST .../required-documents/)       R5.1
    7.  Configure an official-document template (POST .../templates/)      R6.1
    8.  Add a staff membership (POST /api/v1/admin/memberships/)           R4.x
    9.  Apply on the SHARED portal (program-first, no host filter)         R3.2
    10. Apply on the WHITE-LABEL portal (host-filtered to the school)      R3.1
    11. Confirm the assigned school + fee BEFORE payment (preview)         R2.1
    12. Simulate payment (settlement metadata tagged on initiation)        R7.1
    13. Generate every official document (provenance snapshot)            R6.1
    14. School staff sees ONLY their assigned records                      R4.3
    15. Super admin sees ALL records                                       R4.3

Resources that have a public/admin HTTP surface are driven through that
surface (institutions, domains, assets, required docs, templates,
memberships, application create, assignment preview, settlement summary,
scoped application list). Resources with no create endpoint in V1 (canonical
programs, offerings, program-intake capacity links) are built through the
shared ``tests.tenant_fixtures`` model factories against the same test DB —
documented inline at each step.

Run (sqlite, never the production/Neon DB)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/integration/test_tenant_lifecycle_drill.py -v

**Validates: Requirements R2.1, R3.1, R4.3, R6.1, R7.1**
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
    Institution,
    InstitutionAsset,
    UserInstitutionMembership,
)
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


# A real 1x1 transparent PNG so both the upload magic-byte validator AND the
# reportlab ``ImageReader`` in the official-document renderer succeed (proving
# the asset is genuinely drawn into the PDF, not just skipped).
_PNG_1x1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQAB"
    "h6FO1AAAAABJRU5ErkJggg=="
)

WHITE_LABEL_HOST = "apply.drillschool.edu"


# ---------------------------------------------------------------------------
# In-memory storage stand-in (no R2/S3 credentials under test settings)
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


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


def _create_application(client, *, program_id, intake_id, suffix, institution_id=None):
    """POST /api/v1/applications/ program-first; return the parsed envelope."""
    payload = {
        "full_name": f"Drill Applicant {suffix}",
        "nrc_number": "123456/78/9",
        "date_of_birth": "2000-01-01",
        "sex": "Female",
        "phone": "+260970000001",
        "email": f"drill-{suffix}@example.com",
        "residence_town": "Lusaka",
        "country": "Zambia",
        "nationality": "Zambian",
        "program_id": str(program_id),
        "intake_id": str(intake_id),
    }
    if institution_id is not None:
        payload["institution_id"] = str(institution_id)
    response = client.post("/api/v1/applications/", data=payload, format="json")
    return response


@pytest.mark.django_db
class TestTenantLifecycleDrill:
    """The full create-school → apply → pay → document → scope drill.

    **Validates: Requirements R2.1, R3.1, R4.3, R6.1, R7.1**
    """

    def test_full_tenant_lifecycle(self, monkeypatch):
        # Swap real R2/S3 storage for the in-memory backend (asset upload + PDF).
        _FakeStorage._files = {}
        monkeypatch.setattr("apps.common.storage.MediaStorage", _FakeStorage)

        super_admin = build_profile(role="super_admin")
        admin = _client_for(super_admin)
        sfx = uuid.uuid4().hex[:8]

        # ----------------------------------------------------------------- #
        # Step 1 — Create the school (R5.1)                                  #
        # ----------------------------------------------------------------- #
        resp = admin.post(
            "/api/v1/admin/institutions/",
            data={
                "name": f"Drill School {sfx}",
                "code": f"DRILL-{sfx.upper()}",
                "slug": f"drill-school-{sfx}",
                "brand_name": f"Drill School {sfx}",
                "primary_color": "#0F766E",
                "support_email": f"support-{sfx}@drillschool.edu",
                "admissions_email": f"admissions-{sfx}@drillschool.edu",
            },
            format="json",
        )
        assert resp.status_code == 201, resp.content
        institution_id = resp.json()["data"]["id"]
        institution = Institution.objects.get(id=institution_id)

        # ----------------------------------------------------------------- #
        # Step 2 — Add a white-label domain (R3.1)                           #
        # ----------------------------------------------------------------- #
        resp = admin.post(
            f"/api/v1/admin/institutions/{institution_id}/domains/",
            data={"hostname": WHITE_LABEL_HOST, "is_primary": True, "is_active": True},
            format="json",
        )
        assert resp.status_code == 201, resp.content
        assert resp.json()["data"]["hostname"] == WHITE_LABEL_HOST

        # ----------------------------------------------------------------- #
        # Step 3 — Upload logo + signature assets (R6.1)                     #
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
            body = resp.json()["data"]
            assert body["asset_type"] == asset_type
            assert body["mime_type"] == "image/png"
            assert body["checksum_sha256"]
        assert InstitutionAsset.objects.filter(
            institution_id=institution_id, is_active=True
        ).count() == 2

        # ----------------------------------------------------------------- #
        # Step 4 — Canonical program + linked school offering (R2.1)         #
        #   (No public create endpoint for canonical programs/offerings in   #
        #    V1; built via the shared model factory against the test DB.)    #
        # ----------------------------------------------------------------- #
        canonical = build_canonical_program(suffix=sfx)
        offering = build_offering(
            institution=institution,
            canonical_program=canonical,
            suffix=sfx,
            offering_status="active",
            assignment_priority=100,
        )

        # ----------------------------------------------------------------- #
        # Step 5 — Attach an intake + per-offering capacity (R2.1)           #
        # ----------------------------------------------------------------- #
        intake = build_intake(suffix=sfx, max_capacity=100)
        build_program_intake(
            offering=offering, intake=intake, is_active=True, max_capacity=50
        )

        # ----------------------------------------------------------------- #
        # Step 6 — Configure a required document (R5.1)                      #
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

        # ----------------------------------------------------------------- #
        # Step 7 — Configure an official-document template (R6.1)            #
        #   Safe sections + allow-listed tokens only (no merge engine).      #
        # ----------------------------------------------------------------- #
        resp = admin.post(
            f"/api/v1/admin/institutions/{institution_id}/templates/",
            data={
                "institution_id": institution_id,
                "document_type": "acceptance_letter",
                "name": "Drill Acceptance Template",
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
        # Step 8 — Add a staff membership (R4.x)                             #
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

        # ----------------------------------------------------------------- #
        # Step 9 — Apply on the SHARED portal (R3.2)                         #
        #   No host → shared Beanola context; program-first create with no   #
        #   white-label filter still resolves to the (only) eligible school. #
        # ----------------------------------------------------------------- #
        public = APIClient()
        ctx = public.get("/api/v1/catalog/context/")
        assert ctx.status_code == 200, ctx.content
        assert ctx.json()["data"]["portal_type"] == "shared"

        shared_programs = public.get(
            f"/api/v1/catalog/canonical-programs/?intake={intake.id}"
        )
        assert shared_programs.status_code == 200, shared_programs.content
        shared_ids = {
            r["id"] for r in shared_programs.json()["data"]
            if isinstance(r, dict) and r.get("id")
        } if isinstance(shared_programs.json().get("data"), list) else set()
        # The data may be paginated; fall back to results.
        if not shared_ids:
            data = shared_programs.json().get("data", {})
            shared_ids = {
                r["id"] for r in data.get("results", []) if r.get("id")
            }
        assert str(canonical.id) in shared_ids

        shared_student = build_profile(role="student", suffix=f"shared-{sfx}")
        resp = _create_application(
            _client_for(shared_student),
            program_id=canonical.id,
            intake_id=intake.id,
            suffix=f"shared-{sfx}",
        )
        assert resp.status_code == 201, resp.content
        shared_body = resp.json()["data"]
        shared_app_id = shared_body["id"]
        assert shared_body["assigned_school"]["id"] == institution_id
        # Canonical IDs persisted in the same transaction as creation (R2.1).
        shared_app = Application.objects.get(id=shared_app_id)
        assert str(shared_app.institution_ref_id) == institution_id
        assert str(shared_app.canonical_program_id) == str(canonical.id)
        assert str(shared_app.program_offering_id) == str(offering.id)
        assert str(shared_app.intake_ref_id) == str(intake.id)

        # ----------------------------------------------------------------- #
        # Step 10 — Apply on the WHITE-LABEL portal (R3.1)                   #
        #   Host resolves to the school; catalog + create are filtered to it.#
        # ----------------------------------------------------------------- #
        wl_ctx = public.get(
            "/api/v1/catalog/context/", HTTP_X_FORWARDED_HOST=WHITE_LABEL_HOST
        )
        assert wl_ctx.status_code == 200, wl_ctx.content
        wl_data = wl_ctx.json()["data"]
        assert wl_data["portal_type"] == "white_label"
        assert wl_data["institution_id"] == institution_id

        wl_student = build_profile(role="student", suffix=f"wl-{sfx}")
        resp = _create_application(
            _client_for(wl_student),
            program_id=canonical.id,
            intake_id=intake.id,
            suffix=f"wl-{sfx}",
            institution_id=institution_id,  # white-label restriction
        )
        assert resp.status_code == 201, resp.content
        wl_body = resp.json()["data"]
        wl_app_id = wl_body["id"]
        assert wl_body["assigned_school"]["id"] == institution_id

        # ----------------------------------------------------------------- #
        # Step 11 — Confirm assigned school + fee BEFORE payment (R2.1)      #
        # ----------------------------------------------------------------- #
        preview = public.get(
            "/api/v1/catalog/assignment-preview/"
            f"?program_id={canonical.id}&intake_id={intake.id}&nationality=Zambian&country=Zambia"
        )
        assert preview.status_code == 200, preview.content
        pdata = preview.json()["data"]
        assert pdata["assigned_school"]["id"] == institution_id
        assert pdata["fee"] is not None and pdata["fee"]["amount"]
        assert pdata["contact"]["email"]
        # Required documents configured in step 6 surface in the checkpoint.
        assert any(d["document_type"] == "nrc" for d in pdata["required_documents"])

        # ----------------------------------------------------------------- #
        # Step 12 — Simulate payment + settlement tagging (R7.1)            #
        #   Initiation stamps the Beanola collector + tenant snapshot.       #
        # ----------------------------------------------------------------- #
        # Point the legacy program snapshot at the offering code so the fee
        # resolver can resolve a program (mirrors the proven settlement test).
        Application.objects.filter(id=shared_app_id).update(program=offering.code)
        shared_app.refresh_from_db()

        result = PaymentService().initiate_payment(shared_app.id, shared_student.id)
        assert result.payment_id is not None
        payment = Payment.objects.get(id=result.payment_id)
        meta = payment.metadata or {}
        assert meta.get("collector") == "beanola"
        assert meta.get("institution_id") == institution_id
        assert meta.get("program_id") == str(canonical.id)
        assert meta.get("program_offering_id") == str(offering.id)
        assert meta.get("intake_id") == str(intake.id)

        # Mark the payment settled so receipt-bearing documents can render.
        Payment.objects.filter(id=payment.id).update(
            status="successful",
            verified_at=timezone.now(),
            receipt_number=f"RCPT-{sfx.upper()}",
        )

        # Scoped settlement summary attributes the payment to the school.
        settle = _client_for(staff).get("/api/v1/payments/settlements/")
        assert settle.status_code == 200, settle.content
        settle_rows = settle.json()["data"]["results"]
        assert any(r["institution_id"] == institution_id for r in settle_rows)

        # ----------------------------------------------------------------- #
        # Step 13 — Generate every official document (R6.1)                  #
        #   Approve first so acceptance/conditional are eligible. Tasks run  #
        #   synchronously via .apply() (Celery is not eager under test).     #
        # ----------------------------------------------------------------- #
        Application.objects.filter(id=shared_app_id).update(status="approved")

        from apps.applications.tasks import (
            generate_acceptance_letter_task,
            generate_application_slip_task,
            generate_conditional_offer_task,
            generate_finance_receipt_task,
            generate_payment_receipt_task,
        )

        doc_tasks = {
            "application_slip": generate_application_slip_task,
            "acceptance_letter": generate_acceptance_letter_task,
            "conditional_offer": generate_conditional_offer_task,
            "finance_receipt": generate_finance_receipt_task,
            "payment_receipt": generate_payment_receipt_task,
        }
        for document_type, task in doc_tasks.items():
            task.apply(args=[str(shared_app_id)])
            doc = (
                ApplicationDocument.objects.filter(
                    application_id=shared_app_id, document_type=document_type
                )
                .order_by("-uploaded_at")
                .first()
            )
            assert doc is not None, f"{document_type} was not generated"
            provenance = json.loads(doc.verification_notes)["official_document"]
            # R6.2: provenance snapshots the assigned-school + asset context.
            assert provenance["institution_id"] == institution_id
            assert provenance["logo_asset_id"] is not None
            assert provenance["signature_asset_id"] is not None
            assert provenance["logo_render"] != "none"

        # The acceptance letter used the configured template (R6.1/R6.2).
        acceptance = (
            ApplicationDocument.objects.filter(
                application_id=shared_app_id, document_type="acceptance_letter"
            )
            .order_by("-uploaded_at")
            .first()
        )
        acc_prov = json.loads(acceptance.verification_notes)["official_document"]
        assert acc_prov["template_id"] == template_id
        assert acc_prov["template_version"] == 1

        # ----------------------------------------------------------------- #
        # Step 14 — School staff sees ONLY their assigned records (R4.3)     #
        #   Build a second, unrelated school (B) and prove isolation under   #
        #   genuine production (membership/grant-driven) scope semantics.    #
        # ----------------------------------------------------------------- #
        monkeypatch.setattr(
            "apps.catalog.services.AccessScopeService._test_settings_active",
            staticmethod(lambda: False),
        )
        other = build_tenant_world()  # school B + its own offering + application

        staff_list = _client_for(staff).get("/api/v1/applications/")
        assert staff_list.status_code == 200, staff_list.content
        staff_ids = _application_ids(staff_list.json())
        # School A staff sees both of school A's applications...
        assert shared_app_id in staff_ids
        assert wl_app_id in staff_ids
        # ...and never school B's.
        assert other.application_id not in staff_ids

        # Out-of-scope detail read is masked as not-found (no existence leak).
        oos = _client_for(staff).get(f"/api/v1/applications/{other.application_id}/")
        assert oos.status_code == 404, oos.content
        assert other.institution.name not in str(oos.json())

        # Settlement summary stays scoped: a school-B payment never appears.
        Payment.objects.create(
            id=uuid.uuid4(),
            application=other.application,
            user=other.student,
            amount="153.00",
            currency="ZMW",
            status="successful",
            metadata={
                "collector": "beanola",
                "institution_id": other.institution_id,
                "institution_name": other.institution.name,
                "program_offering_id": other.offering_id,
            },
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )
        scoped_settle = _client_for(staff).get("/api/v1/payments/settlements/")
        scoped_blob = json.dumps(scoped_settle.json())
        assert other.institution_id not in scoped_blob
        assert other.institution.name not in scoped_blob

        # ----------------------------------------------------------------- #
        # Step 15 — Super admin sees ALL records (R4.3)                      #
        # ----------------------------------------------------------------- #
        super_list = _client_for(super_admin).get("/api/v1/applications/")
        assert super_list.status_code == 200, super_list.content
        super_ids = _application_ids(super_list.json())
        assert shared_app_id in super_ids
        assert wl_app_id in super_ids
        assert other.application_id in super_ids  # cross-school visibility

        super_settle = _client_for(super_admin).get("/api/v1/payments/settlements/")
        super_blob = json.dumps(super_settle.json())
        assert institution_id in super_blob
        assert other.institution_id in super_blob
