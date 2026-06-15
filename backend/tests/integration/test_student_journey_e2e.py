"""Student end-to-end journey walk on the test DB (task 17.1).

Spec: ``.kiro/specs/beanola-production-readiness/`` — Phase 8 (End-to-end
workflow QA), Component 8, Requirement **R8.1**.

This is the runnable backend half of the student E2E_Flow set. It is a
verification **walk**, not a production migration: it runs entirely against the
ephemeral Django test database (``config.settings.test`` → sqlite) and the
in-process DRF test client. It never touches the production EC2 Postgres or the
Neon authoring branch.

R8.1 requires the student E2E_Flow set to pass on **staging**, covering the full
journey. Staging needs real DNS/host overrides, a running app, and the gated
Neon cutover, so the live browser run is deferred to the gated Playwright spec
``apps/admissions/tests/e2e/studentJourney.spec.ts`` (documented run
instructions in its header). The journey's API/service seams are proven **now**
against the test DB here, walked as a single end-to-end drill so a reviewer can
read one file and see every R8.1 step hold against the real HTTP surface and the
real backend services:

    1.  signup (POST /api/v1/auth/register/)                       R8.1
    2.  verification dev-equivalent (email_verified := True)       R8.1
    3.  application creation (POST /api/v1/applications/)          R8.1
    4.  canonical-program + intake selection (program-first)       R8.1
    5.  seeing the assigned institution (assigned_school)          R8.1
    6.  document upload (POST /api/v1/documents/upload/)           R8.1
    7.  save-draft and resume (POST/GET /api/v1/applications/draft/) R8.1
    8.  pay-or-defer-where-allowed (PaymentService.initiate_payment) R8.1
    9.  submission (POST /api/v1/applications/{id}/submit/)        R8.1
    10. downloading the backend application slip                   R8.1
        (POST/GET official-documents/application_slip — backend-stored)
    11. public tracking (GET /api/v1/applications/track/)          R8.1
    12. receiving a communication (Notification row on submit)     R8.1
    13. the interview path (InterviewService.schedule_interview)   R8.1
    14. receiving a decision (admin review → approved)             R8.1
    15. downloading acceptance-letter + payment-receipt documents  R8.1
        (backend-stored Official_Documents)

It complements the broader suites:

- ``backend/tests/integration/test_tenant_lifecycle_drill.py`` — the create-
  school → apply → pay → document → scope admin/tenant lifecycle drill.
- ``backend/tests/integration/test_negative_flow_boundaries.py`` — the R8.3–R8.8
  negative-flow security drill (task 17.3).

Where the lifecycle drill walks the **tenant/admin** seams and the negative
drill walks the **security boundaries**, this module walks the **student happy
path** end to end.

Run (sqlite, never the production/Neon DB)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/integration/test_student_journey_e2e.py -v

**Validates: Requirements 8.1**
"""

from __future__ import annotations

import base64
import io
import json
import random
import string
import uuid

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.accounts.models import Profile
from apps.applications.interview_service import InterviewService
from apps.applications.models import Application, ApplicationInterview
from apps.catalog.models import Institution, InstitutionAsset
from apps.common.models import Notification
from apps.documents.models import ApplicationDocument, Payment
from apps.documents.payment_service import PaymentService
from tests.tenant_fixtures import (
    build_canonical_program,
    build_intake,
    build_offering,
    build_profile,
    build_program_intake,
)

pytestmark = pytest.mark.tenant


# A real 1x1 transparent PNG so both the upload magic-byte validator AND the
# reportlab ``ImageReader`` in the official-document renderer succeed (proving
# the asset is genuinely drawn into the PDF, not just skipped).
_PNG_1x1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQAB"
    "h6FO1AAAAABJRU5ErkJggg=="
)


# ---------------------------------------------------------------------------
# In-memory storage stand-in (no R2/S3 credentials under test settings)
# ---------------------------------------------------------------------------


class _FakeStorage:
    """Minimal in-memory MediaStorage stand-in for upload + PDF render.

    Mirrors the seam used by ``test_tenant_lifecycle_drill.py``: both the upload
    view and the official-document renderer do a call-time
    ``from apps.common.storage import MediaStorage`` then ``save``/``url``/
    ``open``. Patching the module attribute swaps in this in-memory backend so
    the walk never reaches for real R2/S3 credentials.
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


def _data(body):
    """Return the ``data`` payload from an envelope, tolerating list/dict."""
    if isinstance(body, dict):
        return body.get("data", body)
    return body


@pytest.mark.django_db
class TestStudentJourneyE2E:
    """The full student happy-path journey, walked end to end (R8.1).

    **Validates: Requirements 8.1**
    """

    def test_full_student_journey(self, monkeypatch):
        # Swap real R2/S3 storage for the in-memory backend (upload + PDF).
        _FakeStorage._files = {}
        monkeypatch.setattr("apps.common.storage.MediaStorage", _FakeStorage)
        # The official-document status read presigns a download URL via
        # ``apps.common.storage.generate_signed_url`` (call-time import). No R2/S3
        # credentials exist under test settings, so stub it to a deterministic
        # signed URL — the journey only needs to prove a backend-stored document
        # yields a download link, not exercise boto3.
        monkeypatch.setattr(
            "apps.common.storage.generate_signed_url",
            lambda key, *a, **k: f"https://test-storage.local/signed/{key}?sig=stub",
        )

        sfx = uuid.uuid4().hex[:8]
        # All-letters institution code so the generated application number
        # (``{CODE}{YEAR}{SEQ}``) matches the public tracker's
        # ``[A-Z]{2,10}\d{9,14}`` format (R8.1 public-tracking step).
        inst_code = "JNY" + "".join(random.choices(string.ascii_uppercase, k=4))
        super_admin = build_profile(role="super_admin", suffix=f"sa-{sfx}")
        admin = _client_for(super_admin)
        public = APIClient()

        # ----------------------------------------------------------------- #
        # Tenant pre-seed: an institution + canonical program/offering/intake #
        #   + logo/signature assets + an acceptance-letter template. This is  #
        #   the school the program-first applicant will be assigned to. The   #
        #   admin tenant-onboarding seams themselves are proven by the        #
        #   lifecycle drill (task 29 / 17.2); here they are just the stage.   #
        # ----------------------------------------------------------------- #
        inst_resp = admin.post(
            "/api/v1/admin/institutions/",
            data={
                "name": f"Journey School {sfx}",
                "code": inst_code,
                "slug": f"journey-school-{sfx}",
                "brand_name": f"Journey School {sfx}",
                "primary_color": "#0F766E",
                "support_email": f"support-{sfx}@journeyschool.edu",
                "admissions_email": f"admissions-{sfx}@journeyschool.edu",
            },
            format="json",
        )
        assert inst_resp.status_code == 201, inst_resp.content
        institution_id = inst_resp.json()["data"]["id"]
        institution = Institution.objects.get(id=institution_id)

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
        assert InstitutionAsset.objects.filter(
            institution_id=institution_id, is_active=True
        ).count() == 2

        # Acceptance-letter template (safe sections + allow-listed tokens).
        tmpl_resp = admin.post(
            f"/api/v1/admin/institutions/{institution_id}/templates/",
            data={
                "institution_id": institution_id,
                "document_type": "acceptance_letter",
                "name": "Journey Acceptance Template",
                "sections": {
                    "body": "Dear {{student_name}}, welcome to {{institution}}.",
                    "signatory": "Registrar",
                },
                "tokens": ["student_name", "institution"],
                "is_active": True,
            },
            format="json",
        )
        assert tmpl_resp.status_code == 201, tmpl_resp.content

        # Acceptance-letter document profile (R6.1/R6.7). The acceptance letter
        # is a profile-required document type — it renders solely from the
        # persisted ``InstitutionDocumentProfile`` (fee chart, banks,
        # requirements, signatory), never frontend content. Without an active
        # profile the official generation is a hard ``failed`` (proven by the
        # R8.5 negative-flow drill); the happy path needs it configured.
        profile_resp = admin.post(
            f"/api/v1/admin/institutions/{institution_id}/document-profiles/",
            data={
                "institution_id": institution_id,
                "document_type": "acceptance_letter",
                "layout_key": "fee_chart_letter",
                "sections": {"intro": "Congratulations on your admission."},
                "fee_chart": [{"item": "Tuition", "amount": 1000.0}],
                "bank_accounts": [
                    {"bank_name": "Test Bank", "account_number": "0000000000"}
                ],
                "requirements": ["Bring your NRC on registration day."],
                "signatory": {"name": "The Registrar", "title": "Registrar"},
                "rules": {},
                "is_active": True,
            },
            format="json",
        )
        assert profile_resp.status_code == 201, profile_resp.content
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
        # Step 1 — Signup (R8.1)                                             #
        #   Real public registration creates an unverified student profile.  #
        # ----------------------------------------------------------------- #
        student_email = f"journey-student-{sfx}@example.com"
        signup = public.post(
            "/api/v1/auth/register/",
            data={
                "email": student_email,
                "password": "JourneyPass123",
                "first_name": "Journey",
                "last_name": f"Student-{sfx}",
                "phone": "+260970000001",
                "nationality": "Zambian",
            },
            format="json",
        )
        assert signup.status_code == 201, signup.content
        assert signup.json()["success"] is True
        student = Profile.objects.get(email=student_email)
        assert student.role == "student"
        assert student.email_verified is False

        # ----------------------------------------------------------------- #
        # Step 2 — Verification (dev equivalent) (R8.1)                      #
        #   Staging uses an emailed token; the dev-equivalent flips the flag #
        #   so the rest of the authenticated journey can proceed.            #
        # ----------------------------------------------------------------- #
        Profile.objects.filter(id=student.id).update(email_verified=True)
        student.refresh_from_db()
        assert student.email_verified is True

        student_client = _client_for(student)

        # ----------------------------------------------------------------- #
        # Step 7a — Save a draft BEFORE creating the application (R8.1)      #
        #   Students often start on the shared portal and save progress.     #
        # ----------------------------------------------------------------- #
        draft_payload = {"full_name": "Journey Student", "step": "kyc"}
        save_draft = student_client.post(
            "/api/v1/applications/draft/",
            data={"draft_data": draft_payload},
            format="json",
        )
        assert save_draft.status_code in (200, 201), save_draft.content

        # Step 7b — Resume the draft (R8.1): the saved data round-trips.
        resume = student_client.get("/api/v1/applications/draft/")
        assert resume.status_code == 200, resume.content
        assert _data(resume.json())["draft_data"] == draft_payload

        # ----------------------------------------------------------------- #
        # Steps 3-5 — Application creation, canonical-program + intake       #
        #   selection, and seeing the assigned institution (R8.1)            #
        #   Program-first create with no white-label filter resolves to the  #
        #   single eligible school and surfaces ``assigned_school``.         #
        # ----------------------------------------------------------------- #
        create = student_client.post(
            "/api/v1/applications/",
            data={
                "full_name": "Journey Student",
                "nrc_number": "123456/78/9",
                "date_of_birth": "2000-01-01",
                "sex": "Female",
                "phone": "+260970000001",
                "email": student_email,
                "residence_town": "Lusaka",
                "country": "Zambia",
                "nationality": "Zambian",
                "program_id": str(canonical.id),
                "intake_id": str(intake.id),
            },
            format="json",
        )
        assert create.status_code == 201, create.content
        app_body = create.json()["data"]
        application_id = app_body["id"]
        # Step 5: the student sees the assigned institution.
        assert app_body["assigned_school"]["id"] == institution_id
        # Canonical IDs persisted in the same transaction as creation.
        application = Application.objects.get(id=application_id)
        assert str(application.institution_ref_id) == institution_id
        assert str(application.canonical_program_id) == str(canonical.id)
        assert str(application.program_offering_id) == str(offering.id)
        assert str(application.intake_ref_id) == str(intake.id)

        # ----------------------------------------------------------------- #
        # Step 6 — Document upload (R8.1)                                    #
        #   Mandatory NRC upload via the real storage upload endpoint.       #
        # ----------------------------------------------------------------- #
        nrc_upload = SimpleUploadedFile("nrc.png", _PNG_1x1, content_type="image/png")
        upload = student_client.post(
            "/api/v1/documents/upload/",
            data={
                "file": nrc_upload,
                "document_type": "nrc",
                "application_id": str(application_id),
            },
            format="multipart",
        )
        assert upload.status_code in (200, 201), upload.content
        assert ApplicationDocument.objects.filter(
            application_id=application_id, document_type="nrc"
        ).exclude(verification_status__in=["deleted", "rejected"]).exists()

        # ----------------------------------------------------------------- #
        # Step 8 — Pay (where allowed) (R8.1)                                #
        #   Initiation stamps the Beanola collector + tenant snapshot; mark  #
        #   the payment settled so submission's payment gate is satisfied    #
        #   and receipt-bearing documents can render. (Defer is the          #
        #   alternative branch, proven by the submission-gate suite.)        #
        # ----------------------------------------------------------------- #
        # Point the legacy program snapshot at the offering code so the fee
        # resolver can resolve a program (mirrors the lifecycle drill).
        Application.objects.filter(id=application_id).update(program=offering.code)
        application.refresh_from_db()

        result = PaymentService().initiate_payment(application.id, student.id)
        assert result.payment_id is not None
        payment = Payment.objects.get(id=result.payment_id)
        meta = payment.metadata or {}
        assert meta.get("collector") == "beanola"
        assert meta.get("institution_id") == institution_id

        Payment.objects.filter(id=payment.id).update(
            status="successful",
            verified_at=timezone.now(),
            receipt_number=f"RCPT-{sfx.upper()}",
        )

        # ----------------------------------------------------------------- #
        # Step 9 — Submission (R8.1)                                         #
        #   Canonical submit endpoint with the explicit confirmation gate.   #
        # ----------------------------------------------------------------- #
        submit = student_client.post(
            f"/api/v1/applications/{application_id}/submit/",
            data={"confirm_submission": True},
            format="json",
        )
        assert submit.status_code == 200, submit.content
        assert submit.json()["data"]["status"] == "submitted"
        application.refresh_from_db()
        assert application.status == "submitted"

        # ----------------------------------------------------------------- #
        # Step 12 — Receiving a communication (R8.1)                         #
        #   Submission dispatches the ``application_submitted`` template,     #
        #   which (channel notification/both) writes a Notification row to    #
        #   the student.                                                      #
        # ----------------------------------------------------------------- #
        assert Notification.objects.filter(user_id=student.id).exists(), (
            "submission should create a student notification"
        )

        # ----------------------------------------------------------------- #
        # Step 11 — Public tracking (R8.1)                                   #
        #   Anonymous tracker returns the minimal status payload (no PII —    #
        #   the PII guarantee itself is asserted by the negative-flow drill). #
        # ----------------------------------------------------------------- #
        track = public.get(
            f"/api/v1/applications/track/?code={application.application_number}"
        )
        assert track.status_code == 200, track.content
        track_data = track.json()["data"]
        assert track_data["application_number"] == application.application_number
        assert track_data["status"] == "submitted"

        # ----------------------------------------------------------------- #
        # Step 10 — Downloading the backend application slip (R8.1)          #
        #   Generate the backend Official_Document, then read it back as the  #
        #   student through the official-documents endpoint — a backend-      #
        #   stored record with a signed download URL, never a client render. #
        # ----------------------------------------------------------------- #
        from apps.applications.tasks import generate_application_slip_task

        generate_application_slip_task.apply(args=[str(application_id)])
        slip_doc = (
            ApplicationDocument.objects.filter(
                application_id=application_id, document_type="application_slip"
            )
            .order_by("-uploaded_at")
            .first()
        )
        assert slip_doc is not None, "application slip was not generated"
        assert slip_doc.system_generated is True

        slip_read = student_client.get(
            f"/api/v1/applications/{application_id}/official-documents/application_slip/"
        )
        assert slip_read.status_code == 200, slip_read.content
        slip_payload = slip_read.json()["data"]
        assert slip_payload["status"] == "ready"
        assert slip_payload.get("download_url"), slip_payload

        # ----------------------------------------------------------------- #
        # Step 13 — The interview path (R8.1)                                #
        #   An admin schedules an interview; the student sees it via the      #
        #   single-query ``?mine=true`` endpoint.                             #
        # ----------------------------------------------------------------- #
        interview, _validation = InterviewService.schedule_interview(
            application=application,
            scheduled_at=timezone.now() + timezone.timedelta(days=5),
            mode="virtual",
            location="https://meet.example.com/journey",
            notes="Virtual interview for the journey applicant.",
            admin_id=str(super_admin.id),
        )
        assert isinstance(interview, ApplicationInterview)
        application.refresh_from_db()
        # Scheduling auto-transitions a submitted application to under_review.
        assert application.status == "under_review"

        mine = student_client.get("/api/v1/applications/interviews/?mine=true")
        assert mine.status_code == 200, mine.content
        mine_ids = {str(r["id"]) for r in _data(mine.json()) if r.get("id")}
        assert str(interview.id) in mine_ids

        # ----------------------------------------------------------------- #
        # Step 14 — Receiving a decision (R8.1)                              #
        #   The admin reviews and approves (payment already verified, so no   #
        #   force needed). The decision reaches the canonical state machine.  #
        # ----------------------------------------------------------------- #
        decision = admin.post(
            f"/api/v1/applications/{application_id}/review/",
            data={"new_status": "approved", "notes": "Strong applicant."},
            format="json",
        )
        assert decision.status_code == 200, decision.content
        application.refresh_from_db()
        assert application.status == "approved"

        # ----------------------------------------------------------------- #
        # Step 15 — Downloading acceptance letter + payment receipt (R8.1)   #
        #   Both are backend-generated Official_Documents; the student reads  #
        #   them back through the official-documents endpoint once the gate   #
        #   (approved / completed-payment) is open.                           #
        # ----------------------------------------------------------------- #
        from apps.applications.tasks import (
            generate_acceptance_letter_task,
            generate_payment_receipt_task,
        )

        generate_acceptance_letter_task.apply(args=[str(application_id)])
        generate_payment_receipt_task.apply(args=[str(application_id)])

        for document_type in ("acceptance_letter", "payment_receipt"):
            doc = (
                ApplicationDocument.objects.filter(
                    application_id=application_id, document_type=document_type
                )
                .order_by("-uploaded_at")
                .first()
            )
            assert doc is not None, f"{document_type} was not generated"
            assert doc.system_generated is True
            # Provenance snapshots the assigned-school context (backend-only).
            provenance = json.loads(doc.verification_notes)["official_document"]
            assert provenance["institution_id"] == institution_id

            read = student_client.get(
                f"/api/v1/applications/{application_id}"
                f"/official-documents/{document_type}/"
            )
            assert read.status_code == 200, (document_type, read.content)
            payload = read.json()["data"]
            assert payload["status"] == "ready", (document_type, payload)
            assert payload.get("download_url"), (document_type, payload)
