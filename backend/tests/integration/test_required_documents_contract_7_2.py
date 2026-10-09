"""Dynamic required-document contract — render, persist, validate (task 7.2).

Spec:         ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task **7.2**.
Requirements: R11.6-R11.8
Findings:     STU-13 (tenant-configured required documents are returned by
              assignment but the wizard only uploads two hardcoded types;
              requirement lookup errors fail open), STU-19 (replace may clear
              only local UI state).
Design:       §9.3 (Required Documents — "Requirements are versioned and
              snapshotted to the application assignment. The wizard renders each
              server requirement, including custom tenant types."), §13.1
              (Student IA — one document command plus an accessible overflow).

Required_Evidence (tasks.md 7.2): **"custom tenant requirement and interrupted
upload E2E"**. This module is the server half of both: a *custom* tenant
requirement type is published in the application's requirement contract and is
actually uploadable end to end, and an interrupted (failed mid-flight) upload
leaves no half-written evidence while the contract keeps reporting the
requirement as missing so the retry succeeds. Nothing here is skipped or
environment-gated.

**Validates: Requirements R11.6, R11.7, R11.8**
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.documents.models import ApplicationDocument
from tests.tenant_fixtures import build_document, build_tenant_world

pytestmark = pytest.mark.django_db

CONTRACT_URL = "/api/v1/applications/{id}/required-documents/"
UPLOAD_URL = "/api/v1/documents/upload/"

# The single seam every canonical required-document resolution flows through.
_REQUIRED_DOCS = "apps.catalog.services.OfferingAssignmentService.required_documents"
# The storage seam the upload view writes through.
_STORAGE = "apps.common.storage.MediaStorage"


@pytest.fixture(autouse=True)
def stubbed_object_storage():
    """R2/S3 is unavailable in the test environment.

    Only the object write is stubbed — every assertion in this module runs
    against real ``ApplicationDocument`` rows in the ephemeral test database and
    the real view/validator code path.
    """
    with patch(_STORAGE) as storage_cls:
        instance = MagicMock()
        instance.save.side_effect = lambda key, file_obj: key
        instance.url.side_effect = lambda name: f"https://r2.test/{name}"
        storage_cls.return_value = instance
        yield instance


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client(profile) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(profile.id),
                "email": profile.email,
                "role": profile.role,
                "first_name": profile.first_name,
                "last_name": profile.last_name,
                "token_type": "access",
            }
        )
    )
    return client


def _png_bytes(*, payload_size: int = 0) -> bytes:
    """A real PNG header plus optional padding, so magic-byte checks pass."""
    return b"\x89PNG\r\n\x1a\n" + b"\x00" * payload_size


def _pdf_bytes(*, payload_size: int = 0) -> bytes:
    return b"%PDF-1.7\n" + b"\x00" * payload_size


def _upload(client, application_id, document_type, *, content=None, name=None, content_type=None):
    from django.core.files.uploadedfile import SimpleUploadedFile

    content = _png_bytes(payload_size=64) if content is None else content
    name = name or "evidence.png"
    content_type = content_type or "image/png"
    return client.post(
        UPLOAD_URL,
        {
            "file": SimpleUploadedFile(name, content, content_type=content_type),
            "application_id": str(application_id),
            "document_type": document_type,
        },
        format="multipart",
    )


def _contract(client, application_id):
    return client.get(CONTRACT_URL.format(id=application_id))


def _requirements(payload) -> dict[str, dict]:
    data = payload["data"] if "data" in payload else payload
    return {row["document_type"]: row for row in data["requirements"]}


def _paid_world(**kwargs):
    """A draft world whose payment gate already passes (upload needs a draft)."""
    world = build_tenant_world(application_status="draft", **kwargs)
    Application.objects.filter(id=world.application.id).update(payment_status="verified")
    world.application.refresh_from_db()
    return world


def _seed_requirement(world, *, document_type, label, required=True, rules=None, **scope):
    from apps.catalog.models import InstitutionRequiredDocument

    return InstitutionRequiredDocument.objects.create(
        id=uuid.uuid4(),
        institution=world.institution,
        document_type=document_type,
        label=label,
        is_required=required,
        is_active=True,
        rules=rules,
        **scope,
    )


def _snapshot(world, requirements):
    """Stamp a versioned ``requirements_snapshot`` on the application row."""
    Application.objects.filter(id=world.application.id).update(
        requirements_snapshot=requirements,
        configuration_version="cfg-test0000000000",
    )
    world.application.refresh_from_db()


# ---------------------------------------------------------------------------
# 1. Custom tenant requirement is published in the contract (R11.6, STU-13)
# ---------------------------------------------------------------------------


class TestCustomTenantRequirementIsPublished:
    def test_a_custom_tenant_type_is_returned_with_its_upload_constraints(self):
        world = _paid_world()
        _snapshot(
            world,
            [
                {
                    "document_type": "nursing_council_letter",
                    "label": "Nursing Council clearance letter",
                    "required": True,
                    "rules": {
                        "accepted_mime_types": ["application/pdf"],
                        "max_size_bytes": 2 * 1024 * 1024,
                        "description": "Signed clearance from the council.",
                    },
                }
            ],
        )

        response = _contract(_client(world.student), world.application.id)

        assert response.status_code == 200, response.content
        body = response.json()
        assert body["success"] is True
        rows = _requirements(body)
        assert "nursing_council_letter" in rows, sorted(rows)
        row = rows["nursing_council_letter"]
        assert row["label"] == "Nursing Council clearance letter"
        assert row["required"] is True
        assert row["state"] == "missing"
        assert row["accepted_mime_types"] == ["application/pdf"]
        assert row["max_size_bytes"] == 2 * 1024 * 1024
        assert row["description"] == "Signed clearance from the council."
        # The contract is versioned, so the client renders a known configuration.
        assert body["data"]["configuration_version"] == "cfg-test0000000000"

    def test_the_snapshot_wins_over_drifted_live_configuration(self):
        world = _paid_world()
        _snapshot(
            world,
            [
                {
                    "document_type": "snapshot_only_letter",
                    "label": "Snapshot letter",
                    "required": True,
                    "rules": {},
                }
            ],
        )
        # Live config now says something else entirely.
        _seed_requirement(world, document_type="live_only_letter", label="Live letter")

        rows = _requirements(_contract(_client(world.student), world.application.id).json())

        assert "snapshot_only_letter" in rows
        assert "live_only_letter" not in rows

    def test_the_platform_identity_baseline_is_always_present(self):
        """Submission enforces the identity gate unconditionally, so the
        contract must publish it even when a tenant configures nothing."""
        world = _paid_world()
        _snapshot(world, [])

        rows = _requirements(_contract(_client(world.student), world.application.id).json())

        assert "extra_kyc" in rows, sorted(rows)
        assert rows["extra_kyc"]["required"] is True
        assert rows["extra_kyc"]["source"] == "platform"
        # An already-uploaded NRC satisfies the identity requirement.
        assert "nrc" in rows["extra_kyc"]["accepts_document_types"]

    def test_a_tenant_row_supersedes_the_platform_baseline_for_the_same_type(self):
        world = _paid_world()
        _snapshot(
            world,
            [
                {
                    "document_type": "result_slip",
                    "label": "Tenant-worded result slip",
                    "required": True,
                    "rules": {},
                }
            ],
        )

        rows = _requirements(_contract(_client(world.student), world.application.id).json())

        assert rows["result_slip"]["label"] == "Tenant-worded result slip"
        assert rows["result_slip"]["source"] == "tenant"
        assert len([r for r in rows.values() if r["document_type"] == "result_slip"]) == 1

    def test_a_legacy_row_still_gets_the_platform_baseline_not_an_empty_list(self):
        world = build_tenant_world(application_status="draft", with_canonical_ids=False)

        response = _contract(_client(world.student), world.application.id)

        assert response.status_code == 200, response.content
        rows = _requirements(response.json())
        assert set(rows) >= {"result_slip", "extra_kyc"}
        assert all(row["source"] == "platform" for row in rows.values())


# ---------------------------------------------------------------------------
# 2. Uploaded state, replacement, and current-document identity (R11.7)
# ---------------------------------------------------------------------------


class TestContractReportsUploadedState:
    def test_an_uploaded_document_is_reported_with_its_identity(self):
        world = _paid_world()
        _snapshot(
            world,
            [{"document_type": "result_slip", "label": "Result slip", "required": True, "rules": {}}],
        )
        document = build_document(
            application=world.application,
            document_type="result_slip",
            document_name="slip.pdf",
        )

        row = _requirements(_contract(_client(world.student), world.application.id).json())["result_slip"]

        assert row["state"] == "uploaded"
        assert row["document"]["id"] == str(document.id)
        assert row["document"]["document_name"] == "slip.pdf"
        assert row["document"]["verification_status"] == "pending"

    def test_replacement_reports_the_newest_document_as_current(self):
        world = _paid_world()
        _snapshot(
            world,
            [{"document_type": "result_slip", "label": "Result slip", "required": True, "rules": {}}],
        )
        client = _client(world.student)
        first = _upload(client, world.application.id, "result_slip", name="first.png")
        assert first.status_code == 201, first.content
        second = _upload(client, world.application.id, "result_slip", name="second.png")
        assert second.status_code == 201, second.content

        row = _requirements(_contract(client, world.application.id).json())["result_slip"]

        assert row["state"] == "uploaded"
        assert row["document"]["document_name"] == "second.png"
        # Prior evidence is preserved (task 7.3 owns the immutable-version
        # constraint; 7.2 must at least never destroy history).
        assert ApplicationDocument.objects.filter(
            application_id=world.application.id, document_type="result_slip"
        ).count() == 2

    def test_a_deleted_document_returns_the_requirement_to_missing(self):
        world = _paid_world()
        _snapshot(
            world,
            [{"document_type": "result_slip", "label": "Result slip", "required": True, "rules": {}}],
        )
        build_document(
            application=world.application,
            document_type="result_slip",
            verification_status="deleted",
        )

        row = _requirements(_contract(_client(world.student), world.application.id).json())["result_slip"]

        assert row["state"] == "missing"
        assert row["document"] is None

    def test_a_verified_document_is_reported_as_verified(self):
        world = _paid_world()
        _snapshot(
            world,
            [{"document_type": "transcript", "label": "Transcript", "required": True, "rules": {}}],
        )
        build_document(
            application=world.application,
            document_type="transcript",
            verification_status="verified",
        )

        row = _requirements(_contract(_client(world.student), world.application.id).json())["transcript"]

        assert row["state"] == "verified"


# ---------------------------------------------------------------------------
# 3. All configured types are uploadable (R11.6, STU-13)
# ---------------------------------------------------------------------------


class TestConfiguredTypesAreUploadable:
    def test_a_custom_tenant_type_can_actually_be_uploaded(self):
        world = _paid_world()
        _snapshot(
            world,
            [
                {
                    "document_type": "nursing_council_letter",
                    "label": "Nursing Council clearance letter",
                    "required": True,
                    "rules": {},
                }
            ],
        )

        response = _upload(_client(world.student), world.application.id, "nursing_council_letter")

        assert response.status_code == 201, response.content
        assert ApplicationDocument.objects.filter(
            application_id=world.application.id,
            document_type="nursing_council_letter",
        ).exists()

    def test_an_unconfigured_type_is_refused_with_a_stable_code(self):
        world = _paid_world()
        _snapshot(world, [])

        response = _upload(_client(world.student), world.application.id, "not_a_requirement")

        assert response.status_code == 400, response.content
        body = response.json()
        assert body["code"] == "DOCUMENT_TYPE_NOT_REQUIRED"
        assert not ApplicationDocument.objects.filter(
            application_id=world.application.id
        ).exists()

    def test_legacy_platform_types_keep_working_without_tenant_configuration(self):
        world = _paid_world()
        _snapshot(world, [])
        client = _client(world.student)

        for document_type in ("result_slip", "nrc", "passport", "extra_kyc"):
            response = _upload(client, world.application.id, document_type)
            assert response.status_code == 201, (document_type, response.content)


# ---------------------------------------------------------------------------
# 4. Type / size / malware validation per requirement (R11.6-R11.7)
# ---------------------------------------------------------------------------


class TestPerRequirementValidation:
    def test_a_requirement_narrower_mime_set_refuses_other_types(self):
        world = _paid_world()
        _snapshot(
            world,
            [
                {
                    "document_type": "nursing_council_letter",
                    "label": "Council letter",
                    "required": True,
                    "rules": {"accepted_mime_types": ["application/pdf"]},
                }
            ],
        )
        client = _client(world.student)

        rejected = _upload(client, world.application.id, "nursing_council_letter")
        assert rejected.status_code == 400, rejected.content
        assert rejected.json()["code"] == "INVALID_FILE_TYPE"

        accepted = _upload(
            client,
            world.application.id,
            "nursing_council_letter",
            content=_pdf_bytes(payload_size=32),
            name="letter.pdf",
            content_type="application/pdf",
        )
        assert accepted.status_code == 201, accepted.content

    def test_a_requirement_size_limit_is_enforced_and_published(self):
        world = _paid_world()
        _snapshot(
            world,
            [
                {
                    "document_type": "nursing_council_letter",
                    "label": "Council letter",
                    "required": True,
                    "rules": {"max_size_bytes": 1024},
                }
            ],
        )
        client = _client(world.student)

        row = _requirements(_contract(client, world.application.id).json())["nursing_council_letter"]
        assert row["max_size_bytes"] == 1024

        response = _upload(
            client,
            world.application.id,
            "nursing_council_letter",
            content=_png_bytes(payload_size=4096),
        )
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "FILE_TOO_LARGE"
        assert not ApplicationDocument.objects.filter(
            application_id=world.application.id
        ).exists()

    def test_a_tenant_cannot_raise_the_size_limit_above_the_platform_ceiling(self):
        world = _paid_world()
        _snapshot(
            world,
            [
                {
                    "document_type": "nursing_council_letter",
                    "label": "Council letter",
                    "required": True,
                    "rules": {"max_size_bytes": 999_999_999},
                }
            ],
        )
        client = _client(world.student)

        row = _requirements(_contract(client, world.application.id).json())["nursing_council_letter"]
        assert row["max_size_bytes"] == 10 * 1024 * 1024

        response = _upload(
            client,
            world.application.id,
            "nursing_council_letter",
            content=_png_bytes(payload_size=11 * 1024 * 1024),
        )
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "FILE_TOO_LARGE"

    def test_an_unsupported_tenant_mime_never_widens_the_platform_allowlist(self):
        world = _paid_world()
        _snapshot(
            world,
            [
                {
                    "document_type": "nursing_council_letter",
                    "label": "Council letter",
                    "required": True,
                    "rules": {"accepted_mime_types": ["application/x-msdownload", "image/png"]},
                }
            ],
        )
        client = _client(world.student)

        row = _requirements(_contract(client, world.application.id).json())["nursing_council_letter"]
        assert "application/x-msdownload" not in row["accepted_mime_types"]
        assert row["accepted_mime_types"] == ["image/png"]

    def test_content_that_lies_about_its_type_is_refused(self):
        """Malware/type validation: PNG bytes declared as a PDF."""
        world = _paid_world()
        _snapshot(
            world,
            [{"document_type": "result_slip", "label": "Result slip", "required": True, "rules": {}}],
        )

        response = _upload(
            _client(world.student),
            world.application.id,
            "result_slip",
            content=_png_bytes(payload_size=16),
            name="disguised.pdf",
            content_type="application/pdf",
        )

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "INVALID_FILE"
        assert not ApplicationDocument.objects.filter(
            application_id=world.application.id
        ).exists()

    def test_an_empty_file_is_refused(self):
        world = _paid_world()
        _snapshot(
            world,
            [{"document_type": "result_slip", "label": "Result slip", "required": True, "rules": {}}],
        )

        response = _upload(
            _client(world.student), world.application.id, "result_slip", content=b""
        )

        assert response.status_code == 400, response.content
        assert not ApplicationDocument.objects.filter(
            application_id=world.application.id
        ).exists()


# ---------------------------------------------------------------------------
# 5. Fail closed when the configuration cannot be evaluated (R11.6, DATA-04)
# ---------------------------------------------------------------------------


class TestFailsClosed:
    def test_the_contract_returns_a_retryable_503_when_requirements_are_unevaluable(self):
        world = _paid_world()
        assert world.application.requirements_snapshot in (None, [])

        with patch(_REQUIRED_DOCS, side_effect=RuntimeError("configuration store down")):
            response = _contract(_client(world.student), world.application.id)

        assert response.status_code == 503, response.content
        body = response.json()
        assert body["code"] == "CONFIGURATION_UNAVAILABLE"
        assert body["success"] is False

    def test_an_upload_is_refused_when_requirements_are_unevaluable(self):
        world = _paid_world()

        with patch(_REQUIRED_DOCS, side_effect=RuntimeError("configuration store down")):
            response = _upload(_client(world.student), world.application.id, "result_slip")

        assert response.status_code == 503, response.content
        assert response.json()["code"] == "CONFIGURATION_UNAVAILABLE"
        assert not ApplicationDocument.objects.filter(
            application_id=world.application.id
        ).exists()


# ---------------------------------------------------------------------------
# 6. Interrupted upload (Required_Evidence) — no half-written evidence
# ---------------------------------------------------------------------------


class TestInterruptedUpload:
    def test_an_interrupted_upload_leaves_no_document_and_stays_retryable(
        self, stubbed_object_storage
    ):
        world = _paid_world()
        _snapshot(
            world,
            [{"document_type": "result_slip", "label": "Result slip", "required": True, "rules": {}}],
        )
        client = _client(world.student)

        # The object write dies mid-flight (a dropped mobile connection).
        stubbed_object_storage.save.side_effect = OSError("connection reset mid-upload")
        interrupted = _upload(client, world.application.id, "result_slip")

        assert interrupted.status_code == 500, interrupted.content
        assert interrupted.json()["code"] == "STORAGE_ERROR"
        assert not ApplicationDocument.objects.filter(
            application_id=world.application.id
        ).exists()

        row = _requirements(_contract(client, world.application.id).json())["result_slip"]
        assert row["state"] == "missing"

        # The connection comes back and the same retry succeeds.
        stubbed_object_storage.save.side_effect = lambda key, file_obj: key
        retried = _upload(client, world.application.id, "result_slip")
        assert retried.status_code == 201, retried.content

        row = _requirements(_contract(client, world.application.id).json())["result_slip"]
        assert row["state"] == "uploaded"


# ---------------------------------------------------------------------------
# 7. Authority + tenant isolation on the contract (design §5.2)
# ---------------------------------------------------------------------------


class TestContractAuthority:
    def test_unauthenticated_requests_are_rejected(self):
        world = _paid_world()
        response = APIClient().get(CONTRACT_URL.format(id=world.application.id))
        assert response.status_code in (401, 403), response.status_code

    def test_another_students_contract_is_masked_as_not_found(self):
        owner = _paid_world()
        _snapshot(
            owner,
            [
                {
                    "document_type": "nursing_council_letter",
                    "label": "Council letter",
                    "required": True,
                    "rules": {},
                }
            ],
        )
        other = build_tenant_world(with_application=False)

        response = _contract(_client(other.student), owner.application.id)

        assert response.status_code in (403, 404), response.status_code
        serialized = response.content.decode()
        assert "nursing_council_letter" not in serialized
        assert owner.institution.name not in serialized

    def test_an_out_of_scope_admin_cannot_read_another_tenants_contract(self):
        owner = _paid_world()
        _snapshot(
            owner,
            [{"document_type": "result_slip", "label": "Result slip", "required": True, "rules": {}}],
        )
        other = build_tenant_world(with_application=False, staff_role="admin")

        response = _contract(_client(other.staff), owner.application.id)

        assert response.status_code == 404, response.status_code
        assert owner.institution.name not in response.content.decode()

    def test_an_unknown_application_is_not_found(self):
        world = build_tenant_world(with_application=False)
        response = _contract(_client(world.student), uuid.uuid4())
        assert response.status_code == 404

    def test_a_non_owner_cannot_upload_into_another_students_application(self):
        owner = _paid_world()
        _snapshot(
            owner,
            [{"document_type": "result_slip", "label": "Result slip", "required": True, "rules": {}}],
        )
        other = build_tenant_world(with_application=False)

        response = _upload(_client(other.student), owner.application.id, "result_slip")

        assert response.status_code in (403, 404), response.content
        assert not ApplicationDocument.objects.filter(
            application_id=owner.application.id
        ).exists()


# ---------------------------------------------------------------------------
# 8. The contract and the submission gate cannot disagree (R11.6)
# ---------------------------------------------------------------------------


class TestContractMatchesSubmissionGate:
    def test_every_unsatisfied_required_row_is_a_submission_blocker(self):
        from apps.applications.services import ApplicationSubmissionError, submit_application
        from tests.tenant_fixtures import build_grades

        world = _paid_world()
        _snapshot(
            world,
            [
                {
                    "document_type": "nursing_council_letter",
                    "label": "Council letter",
                    "required": True,
                    "rules": {},
                }
            ],
        )
        build_document(application=world.application, document_type="nrc")
        build_grades(application=world.application, count=5)

        rows = _requirements(_contract(_client(world.student), world.application.id).json())
        assert rows["nursing_council_letter"]["state"] == "missing"

        with pytest.raises(ApplicationSubmissionError) as excinfo:
            submit_application(
                application=world.application, changed_by=str(world.student.id)
            )
        assert excinfo.value.code == "REQUIRED_DOCUMENT_MISSING"

    def test_an_optional_requirement_never_blocks(self):
        world = _paid_world()
        _snapshot(
            world,
            [
                {
                    "document_type": "recommendation_letter",
                    "label": "Recommendation letter",
                    "required": False,
                    "rules": {},
                }
            ],
        )

        rows = _requirements(_contract(_client(world.student), world.application.id).json())

        assert rows["recommendation_letter"]["required"] is False
        assert rows["recommendation_letter"]["state"] == "missing"
        data = _contract(_client(world.student), world.application.id).json()["data"]
        assert "recommendation_letter" not in [
            row["document_type"] for row in data["missing_required"]
        ]


# ---------------------------------------------------------------------------
# 9. Content safety at the upload boundary (R11.7 — "malware/type/size check")
# ---------------------------------------------------------------------------


class TestActiveContentIsRefused:
    """Design §9.2: ``upload -> malware/type/size check -> …``.

    Magic bytes prove a file *is* the format it claims. They say nothing about
    what the format carries: a real PDF with an embedded ``/JavaScript`` action
    or a ``/Launch`` action passes every check above and is then handed to a
    reviewer's browser. These cases pin the deterministic active-content screen
    that refuses such a file with a stable code, and — just as importantly —
    that an ordinary scan or phone photo is never refused by it.
    """

    def _world_with_result_slip(self):
        world = _paid_world()
        _snapshot(
            world,
            [{"document_type": "result_slip", "label": "Result slip", "required": True, "rules": {}}],
        )
        return world

    @pytest.mark.parametrize(
        "payload",
        [
            b"%PDF-1.7\n1 0 obj<</Type/Action/S/JavaScript/JS(app.alert('x'))>>endobj\n",
            b"%PDF-1.7\n1 0 obj<</Type/Action/S/Launch/F(cmd.exe)>>endobj\n",
        ],
        ids=["embedded-javascript", "launch-action"],
    )
    def test_a_pdf_carrying_active_content_is_refused(self, payload):
        world = self._world_with_result_slip()
        response = _upload(
            _client(world.student),
            world.application.id,
            "result_slip",
            content=payload,
            name="slip.pdf",
            content_type="application/pdf",
        )
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "UNSAFE_FILE_CONTENT"
        assert not ApplicationDocument.objects.filter(
            application_id=world.application.id
        ).exists()

    def test_an_image_carrying_a_script_polyglot_is_refused(self):
        world = self._world_with_result_slip()
        response = _upload(
            _client(world.student),
            world.application.id,
            "result_slip",
            content=_png_bytes(payload_size=8) + b"<script>fetch('//evil')</script>",
            name="slip.png",
            content_type="image/png",
        )
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "UNSAFE_FILE_CONTENT"

    def test_an_ordinary_scan_is_not_refused(self):
        """The screen must not cost an applicant a legitimate upload."""
        world = self._world_with_result_slip()
        client = _client(world.student)
        # A PDF with the page-level actions a scanner or word processor emits.
        benign_pdf = (
            b"%PDF-1.7\n"
            b"1 0 obj<</Type/Catalog/OpenAction[3 0 R /Fit]/Pages 2 0 R>>endobj\n"
            b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            + b"\x00\xff\x10/JS-like-binary-noise\x00" * 64
        )
        response = _upload(
            client,
            world.application.id,
            "result_slip",
            content=benign_pdf,
            name="slip.pdf",
            content_type="application/pdf",
        )
        assert response.status_code == 201, response.content

    def test_an_empty_file_is_refused_with_the_shared_stable_code(self):
        """The client refuses an empty file locally; the codes must agree."""
        world = self._world_with_result_slip()
        response = _upload(
            _client(world.student), world.application.id, "result_slip", content=b""
        )
        assert response.status_code == 400, response.content
        assert response.json()["code"] == "EMPTY_FILE"
        assert not ApplicationDocument.objects.filter(
            application_id=world.application.id
        ).exists()
