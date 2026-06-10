"""Document-template configuration safety tests (task 15.3).

Spec: ``multi-tenant-beanola-admissions`` — Phase 4 task 15.3
("Template safety (no arbitrary merge engines)"). These cover the
**configuration-time** safety surface of the document-template create/update
API:

    POST  /api/v1/admin/institutions/{institution_id}/templates/
    PATCH /api/v1/admin/institutions/{institution_id}/templates/{item_id}/

distinct from the render-time allowlist + ``html.escape`` coverage in
``tests/unit/test_official_documents.py`` (P13) which exercises
``DocumentTemplateService.render``.

Acceptance criteria:

- **R5.7** the Document_Template create/update API SHALL accept only safe
  sections and tokens and SHALL NOT accept or execute arbitrary uploaded
  DOCX/PDF merge documents.
- **R6.4** when a Document_Template renders tokens, the renderer SHALL
  HTML-escape token values and SHALL restrict tokens to an allowlist,
  rejecting or safely ignoring unknown or injected tokens. The configuration
  boundary rejects disallowed/injected tokens up front under the stable
  ``TEMPLATE_TOKEN_REJECTED`` code.

The pure validator (``apps.catalog.services.validate_template_payload``) is
covered directly (no DB); the endpoint behaviour is covered via the
Super_Admin ``JWTUser`` ``force_authenticate`` pattern used by
``test_tenant_asset_upload.py``.

**Validates: Requirements R5.7, R6.4**
"""

from __future__ import annotations

import uuid

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.catalog.models import InstitutionDocumentTemplate
from apps.catalog.services import (
    ALLOWED_TEMPLATE_SECTIONS,
    ALLOWED_TEMPLATE_TOKENS,
    TemplateValidationError,
    validate_template_payload,
)
from tests.tenant_fixtures import build_institution, build_profile

# Tagged ``tenant`` so the Phase 0/4 ``-k "... or tenant or template ..."``
# selectors pick it up.
pytestmark = pytest.mark.tenant


_LIST_URL = "/api/v1/admin/institutions/{institution_id}/templates/"
_DETAIL_URL = "/api/v1/admin/institutions/{institution_id}/templates/{item_id}/"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client_for(profile) -> APIClient:
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


def _super_admin():
    return build_profile(role="super_admin")


def _safe_payload(**overrides):
    payload = {
        "document_type": "acceptance_letter",
        "name": "Acceptance Letter",
        "version": 1,
        "sections": {
            "body": "Dear {{student_name}}, welcome to {{institution}}.",
            "signatory": "Admissions Office",
        },
        "tokens": ["student_name", "institution"],
        "is_active": True,
    }
    payload.update(overrides)
    return payload


def _make_template(institution, *, sections, tokens, document_type="acceptance_letter"):
    now = timezone.now()
    return InstitutionDocumentTemplate.objects.create(
        id=uuid.uuid4(),
        institution=institution,
        document_type=document_type,
        name="Existing Template",
        version=1,
        sections=sections,
        tokens=tokens,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


# ---------------------------------------------------------------------------
# Pure validator — allowlist + merge-document rejection (no DB)
# ---------------------------------------------------------------------------


class TestValidatorAllowlist:
    """``validate_template_payload`` accepts only safe sections + allowlisted
    tokens and rejects everything else (R5.7 / R6.4).

    **Validates: Requirements R5.7, R6.4**
    """

    def test_safe_payload_passes(self):
        # Returns None (no exception) for a safe section/token payload.
        assert (
            validate_template_payload(
                sections={
                    "body": "Dear {{student_name}},",
                    "signatory": "Registrar",
                },
                tokens=["student_name"],
            )
            is None
        )

    def test_none_sections_and_tokens_pass(self):
        # A partial update that omits sections/tokens is unaffected.
        assert validate_template_payload(sections=None, tokens=None) is None

    def test_allowlists_are_the_documented_sets(self):
        assert ALLOWED_TEMPLATE_SECTIONS == frozenset({"body", "signatory"})
        assert "student_name" in ALLOWED_TEMPLATE_TOKENS
        assert "receipt_number" in ALLOWED_TEMPLATE_TOKENS

    def test_disallowed_section_key_rejected(self):
        with pytest.raises(TemplateValidationError):
            validate_template_payload(
                sections={"script": "anything"}, tokens=None
            )

    def test_disallowed_token_in_list_rejected(self):
        with pytest.raises(TemplateValidationError):
            validate_template_payload(
                sections=None, tokens=["student_name", "ssn"]
            )

    def test_injected_unknown_token_in_body_rejected(self):
        # A {{token}} reference that is not on the allowlist is rejected at
        # configuration time (defence-in-depth alongside the render allowlist).
        with pytest.raises(TemplateValidationError):
            validate_template_payload(
                sections={"body": "Owed: {{secret_balance}}"},
                tokens=["student_name"],
            )

    def test_non_string_section_value_rejected(self):
        with pytest.raises(TemplateValidationError):
            validate_template_payload(
                sections={"body": {"nested": "object"}}, tokens=None
            )

    def test_non_list_tokens_rejected(self):
        with pytest.raises(TemplateValidationError):
            validate_template_payload(sections=None, tokens="student_name")

    def test_oversized_section_rejected(self):
        with pytest.raises(TemplateValidationError):
            validate_template_payload(
                sections={"body": "x" * 20_001}, tokens=None
            )

    @pytest.mark.parametrize(
        "merge_blob",
        [
            "%PDF-1.7\n%merge",  # PDF
            "PK\x03\x04binary-docx-zip",  # DOCX/ZIP container
            "{\\rtf1 merge}",  # RTF
            "\xd0\xcf\x11\xe0legacy-doc",  # OLE2 .doc
            "<w:body><w:p>merge</w:p></w:body>",  # WordprocessingML
            "Hello { MERGEFIELD Name }",  # mail-merge field code
            "embedded\x00nul",  # raw NUL byte
        ],
    )
    def test_merge_document_content_in_section_rejected(self, merge_blob):
        with pytest.raises(TemplateValidationError):
            validate_template_payload(
                sections={"body": merge_blob}, tokens=None
            )

    def test_uploaded_file_flag_rejected(self):
        with pytest.raises(TemplateValidationError):
            validate_template_payload(
                sections=None, tokens=None, has_uploaded_file=True
            )

    @pytest.mark.parametrize(
        "reserved_key",
        ["file", "document", "upload", "merge_document", "attachment", "template_file"],
    )
    def test_reserved_merge_document_key_rejected(self, reserved_key):
        with pytest.raises(TemplateValidationError):
            validate_template_payload(
                sections={"body": "ok"},
                tokens=None,
                extra_keys=["document_type", reserved_key],
            )


# ---------------------------------------------------------------------------
# Endpoint — create rejects unsafe templates with TEMPLATE_TOKEN_REJECTED
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTemplateCreateSafety:
    """``POST .../templates/`` accepts safe templates and rejects unsafe ones
    with the stable ``TEMPLATE_TOKEN_REJECTED`` 400 code, persisting no row
    (R5.7 / R6.4).

    **Validates: Requirements R5.7, R6.4**
    """

    def test_safe_template_is_created(self):
        institution = build_institution()
        client = _client_for(_super_admin())

        response = client.post(
            _LIST_URL.format(institution_id=institution.id),
            data=_safe_payload(),
            format="json",
        )

        assert response.status_code == 201, response.content
        body = response.json()
        assert body["success"] is True
        assert body["data"]["document_type"] == "acceptance_letter"
        assert InstitutionDocumentTemplate.objects.filter(
            institution_id=institution.id
        ).count() == 1

    def test_disallowed_section_rejected(self):
        institution = build_institution()
        client = _client_for(_super_admin())

        response = client.post(
            _LIST_URL.format(institution_id=institution.id),
            data=_safe_payload(sections={"script": "alert(1)"}),
            format="json",
        )

        assert response.status_code == 400, response.content
        body = response.json()
        assert body["success"] is False
        assert body["code"] == "TEMPLATE_TOKEN_REJECTED"
        assert InstitutionDocumentTemplate.objects.filter(
            institution_id=institution.id
        ).count() == 0

    def test_disallowed_token_rejected(self):
        institution = build_institution()
        client = _client_for(_super_admin())

        response = client.post(
            _LIST_URL.format(institution_id=institution.id),
            data=_safe_payload(tokens=["student_name", "ssn"]),
            format="json",
        )

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "TEMPLATE_TOKEN_REJECTED"
        assert InstitutionDocumentTemplate.objects.filter(
            institution_id=institution.id
        ).count() == 0

    def test_injected_token_in_body_rejected(self):
        institution = build_institution()
        client = _client_for(_super_admin())

        response = client.post(
            _LIST_URL.format(institution_id=institution.id),
            data=_safe_payload(
                sections={"body": "Balance owed: {{secret_balance}}"},
                tokens=["student_name"],
            ),
            format="json",
        )

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "TEMPLATE_TOKEN_REJECTED"
        assert InstitutionDocumentTemplate.objects.filter(
            institution_id=institution.id
        ).count() == 0

    @pytest.mark.parametrize(
        "merge_blob",
        [
            "%PDF-1.7 arbitrary pdf merge document",
            "PK\x03\x04 docx zip container",
            "{\\rtf1 arbitrary rtf}",
            "<w:body><w:p>MERGEFIELD</w:p></w:body>",
        ],
    )
    def test_merge_document_in_section_rejected(self, merge_blob):
        institution = build_institution()
        client = _client_for(_super_admin())

        response = client.post(
            _LIST_URL.format(institution_id=institution.id),
            data=_safe_payload(sections={"body": merge_blob}),
            format="json",
        )

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "TEMPLATE_TOKEN_REJECTED"
        assert InstitutionDocumentTemplate.objects.filter(
            institution_id=institution.id
        ).count() == 0

    def test_uploaded_merge_document_rejected(self):
        """A multipart file part (an arbitrary DOCX/PDF upload) is rejected —
        templates are safe section/token definitions, not uploaded merge
        documents (R5.7)."""
        institution = build_institution()
        client = _client_for(_super_admin())
        upload = SimpleUploadedFile(
            "merge.docx",
            b"PK\x03\x04 arbitrary docx bytes",
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

        response = client.post(
            _LIST_URL.format(institution_id=institution.id),
            data={
                "document_type": "acceptance_letter",
                "name": "Uploaded",
                "file": upload,
            },
            format="multipart",
        )

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "TEMPLATE_TOKEN_REJECTED"
        assert InstitutionDocumentTemplate.objects.filter(
            institution_id=institution.id
        ).count() == 0

    def test_non_super_admin_cannot_create(self):
        """A school admin (non-super-admin) is denied with 403 FORBIDDEN before
        any payload inspection."""
        institution = build_institution()
        client = _client_for(build_profile(role="admin"))

        response = client.post(
            _LIST_URL.format(institution_id=institution.id),
            data=_safe_payload(sections={"script": "alert(1)"}),
            format="json",
        )

        assert response.status_code == 403, response.content
        assert response.json()["code"] == "FORBIDDEN"
        assert InstitutionDocumentTemplate.objects.filter(
            institution_id=institution.id
        ).count() == 0


# ---------------------------------------------------------------------------
# Endpoint — update rejects unsafe templates and never mutates the prior row
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestTemplateUpdateSafety:
    """``PATCH .../templates/{id}/`` enforces the same allowlist and never
    mutates the existing row on rejection (R5.7 / R6.4).

    **Validates: Requirements R5.7, R6.4**
    """

    def test_safe_update_is_applied(self):
        institution = build_institution()
        template = _make_template(
            institution,
            sections={"body": "Dear {{student_name}},"},
            tokens=["student_name"],
        )
        client = _client_for(_super_admin())

        response = client.patch(
            _DETAIL_URL.format(institution_id=institution.id, item_id=template.id),
            data={"sections": {"body": "Welcome {{student_name}} to {{institution}}."},
                  "tokens": ["student_name", "institution"]},
            format="json",
        )

        assert response.status_code == 200, response.content
        template.refresh_from_db()
        assert "{{institution}}" in template.sections["body"]

    def test_unsafe_update_rejected_and_row_unchanged(self):
        institution = build_institution()
        template = _make_template(
            institution,
            sections={"body": "Dear {{student_name}},"},
            tokens=["student_name"],
        )
        original_sections = dict(template.sections)
        client = _client_for(_super_admin())

        response = client.patch(
            _DETAIL_URL.format(institution_id=institution.id, item_id=template.id),
            data={"sections": {"body": "Leak: {{secret_balance}}"}},
            format="json",
        )

        assert response.status_code == 400, response.content
        assert response.json()["code"] == "TEMPLATE_TOKEN_REJECTED"
        template.refresh_from_db()
        assert template.sections == original_sections
