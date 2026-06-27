"""API contract shape matrix for the canonical multi-tenant surfaces.

This test complements the heavier lifecycle and endpoint-envelope tests. It
pins the exact serializer/output keys that the frontend relies on for tenant
configuration, draft routing, and official-document workflows.
"""

from __future__ import annotations

import pytest

from apps.accounts.admin_user_views import (
    CAPABILITY_INSTITUTION_PAYLOAD_KEYS,
    CAPABILITY_PAYLOAD_KEYS,
    _build_capability_payload,
)
from apps.applications.official_document_views import OfficialDocumentStatusSerializer
from apps.applications.serializers import ApplicationDraftSerializer
from apps.catalog.admin_serializers import (
    AdminDocumentProfileSerializer,
    AdminInstitutionAssetSerializer,
    AdminInstitutionDomainSerializer,
    AdminInstitutionSerializer,
    AdminRequiredDocumentSerializer,
)
from apps.catalog.serializers import ProgramSerializer


def _field_names(serializer_cls) -> set[str]:
    return set(serializer_cls().fields.keys())


def _assert_required_fields(serializer_cls, expected: set[str]) -> None:
    actual = _field_names(serializer_cls)
    missing = expected - actual
    assert not missing, f"{serializer_cls.__name__} missing contract fields: {sorted(missing)}"


def test_capability_and_admin_scope_payload_contract_source():
    """34.1/34.2: capabilities and admin scope share one stable payload shape."""

    assert _build_capability_payload
    assert CAPABILITY_PAYLOAD_KEYS == {
        "role",
        "is_super_admin",
        "all_access",
        "capabilities",
        "institutions",
    }
    assert CAPABILITY_INSTITUTION_PAYLOAD_KEYS == {"id", "code", "name", "capabilities"}


@pytest.mark.parametrize(
    "serializer_cls,expected",
    [
        (
            AdminInstitutionSerializer,
            {
                "id",
                "name",
                "code",
                "slug",
                "full_name",
                "brand_name",
                "type",
                "address",
                "phone",
                "email",
                "support_email",
                "admissions_email",
                "website",
                "primary_color",
                "secondary_color",
                "accreditation_status",
                "is_active",
                "description",
                "created_at",
                "updated_at",
            },
        ),
        (
            AdminInstitutionAssetSerializer,
            {
                "id",
                "institution_id",
                "asset_type",
                "storage_key",
                "public_url",
                "mime_type",
                "checksum_sha256",
                "version",
                "is_active",
                "metadata",
                "created_at",
                "created_by_id",
            },
        ),
        (
            AdminInstitutionDomainSerializer,
            {
                "id",
                "institution_id",
                "hostname",
                "is_primary",
                "is_active",
                "status",
                "verification_token",
                "dns_target",
                "verified_at",
                "last_checked_at",
                "last_error",
                "created_at",
                "created_by_id",
                "approved_by_id",
            },
        ),
        (
            AdminDocumentProfileSerializer,
            {
                "id",
                "institution_id",
                "document_type",
                "program_id",
                "canonical_program_id",
                "intake_id",
                "layout_key",
                "sections",
                "fee_chart",
                "bank_accounts",
                "requirements",
                "signatory",
                "rules",
                "version",
                "is_active",
                "created_at",
                "updated_at",
                "created_by_id",
            },
        ),
        (
            AdminRequiredDocumentSerializer,
            {
                "id",
                "institution_id",
                "program_id",
                "canonical_program_id",
                "document_type",
                "label",
                "is_required",
                "rules",
                "is_active",
                "created_at",
            },
        ),
        (
            ProgramSerializer,
            {
                "id",
                "name",
                "code",
                "institution",
                "institution_id",
                "duration_months",
                "canonical_program_id",
                "assignment_priority",
                "offering_status",
                "application_fee",
                "tuition_fee",
                "requirements",
                "regulatory_body",
                "accreditation_status",
                "is_active",
                "created_at",
                "updated_at",
            },
        ),
    ],
    ids=[
        "tenant-list-detail-create-update",
        "tenant-assets",
        "tenant-domains",
        "document-profiles",
        "required-documents",
        "offerings-program-assignment",
    ],
)
def test_tenant_configuration_serializer_contracts(serializer_cls, expected):
    """34.3-34.8: tenant configuration payloads keep frontend-required keys."""

    _assert_required_fields(serializer_cls, expected)


def test_draft_serializer_contract():
    """34.9: legacy draft payload keeps its compatibility fields."""

    _assert_required_fields(
        ApplicationDraftSerializer,
        {
            "id",
            "application_id",
            "user_id",
            "draft_data",
            "draft_name",
            "step_completed",
            "is_active",
            "last_accessed_at",
            "created_at",
            "updated_at",
        },
    )


def test_official_document_status_contract():
    """34.10: official document generation/status keeps the async status shape."""

    _assert_required_fields(
        OfficialDocumentStatusSerializer,
        {
            "document_id",
            "document_type",
            "status",
            "download_url",
            "generated_at",
            "template_version",
            "institution_id",
            "task_id",
            "error_code",
            "setup_required",
        },
    )
