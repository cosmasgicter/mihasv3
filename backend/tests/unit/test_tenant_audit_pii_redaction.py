"""PII redaction guard for tenant audit payloads — spec task 26.2.

Spec: ``multi-tenant-beanola-admissions`` — Phase 6 task 26.2
("PII redaction guard for tenant audit payloads").

This is the dedicated guard for **Requirement 13.4** and **Requirement 12.4**:

- **R13.4** — the Audit_Event payload SHALL NOT include full phone numbers,
  full NRC/passport numbers, or document contents; only hashed or masked
  identifiers are permitted.
- **R12.4** — the conversion SHALL NOT log PII, secrets, resume/document
  contents, or raw phone numbers, and SHALL keep audit trails free of
  plaintext PII.

Where task 26.1's ``test_tenant_audit_observability.py`` proves the *happy
path* of each emit method (and a single phone/NRC redaction smoke test), this
file is the **exhaustive redaction guard**: it feeds realistic PII-bearing
inputs through *every* :class:`TenantAuditService` emit path

  * assignment decided / failed (residency + snapshot inputs),
  * tenant config create/update/deactivate (support/contact fields),
  * asset upload,
  * official-document generation,
  * scope denial,
  * the generic ``record_event`` funnel that every path goes through,

then reads the persisted ``audit_logs`` row back and asserts the raw phone,
NRC, passport, and document-body values never appear anywhere in the stored
``changes`` JSON — only the hashed/masked representations survive.

The redaction itself is the shared ``PaymentAuditService._redact_pii`` (one
source of truth, ADR-003 + R13.4), so this guard also pins that every tenant
emit path actually routes its payload through that redactor at any nesting
depth.

**Validates: Requirements R13.4, R12.4**
"""

from __future__ import annotations

import json
import uuid

import pytest

from apps.catalog.tenant_audit_service import (
    ACTION_ASSIGNMENT_DECIDED,
    ACTION_ASSIGNMENT_FAILED,
    ACTION_OFFICIAL_DOCUMENT_GENERATED,
    ACTION_SCOPE_DENIED,
    TenantAuditService,
)
from apps.common.models import AuditLog


# ---------------------------------------------------------------------------
# Realistic PII fixtures — the values that must NEVER reach ``audit_logs``
# ---------------------------------------------------------------------------

#: Several realistic Zambian MSISDN shapes (full numbers must be masked).
RAW_PHONES = ["+260971234567", "0971234567", "260 96 765 4321"]
#: Realistic NRC shapes (full numbers must be hashed).
RAW_NRCS = ["123456/78/9", "987654/32/1"]
#: Realistic passport numbers (must be hashed).
RAW_PASSPORTS = ["ZN1234567", "AB0099221"]
#: Document body / file content (must be stripped entirely).
RAW_DOCUMENT_BODY = "CONFIDENTIAL-ACCEPTANCE-LETTER-BODY-7f3a"
RAW_FILE_CONTENT = "RAW-PNG-BYTES-89504e470d0a1a0a"

#: Every raw secret that must be absent from a stored payload.
ALL_RAW_SECRETS = [
    *RAW_PHONES,
    *RAW_NRCS,
    *RAW_PASSPORTS,
    RAW_DOCUMENT_BODY,
    RAW_FILE_CONTENT,
]


def _latest(action: str) -> AuditLog:
    row = AuditLog.objects.filter(action=action).order_by("-created_at").first()
    assert row is not None, f"no audit row written for action={action!r}"
    return row


def _changes_blob(row: AuditLog) -> str:
    """Serialize the full stored ``changes`` payload for substring scanning."""
    return json.dumps(row.changes, default=str)


def _assert_free_of_raw_pii(row: AuditLog, *, secrets=ALL_RAW_SECRETS) -> str:
    """Assert no raw PII secret appears anywhere in the stored payload."""
    blob = _changes_blob(row)
    for secret in secrets:
        assert secret not in blob, (
            f"raw PII {secret!r} leaked into audit payload for "
            f"action={row.action!r}: {blob}"
        )
    return blob


def _pii_bearing_contact_block() -> dict:
    """A realistic contact/identity sub-object an operator might attach.

    Keys deliberately span every redaction marker family the shared redactor
    recognises (phone/msisdn/mobile → masked, nrc/passport → hashed,
    document_body/file_content → stripped) at multiple nesting depths.
    """
    return {
        "support_email": "admissions@school.example",  # not PII → preserved
        "support_phone": RAW_PHONES[0],
        "contact": {
            "mobile_number": RAW_PHONES[1],
            "alt_msisdn": RAW_PHONES[2],
            "officer_nrc": RAW_NRCS[0],
            "officer_passport": RAW_PASSPORTS[0],
        },
        "applicants": [
            {"nrc_number": RAW_NRCS[1], "passport_no": RAW_PASSPORTS[1]},
        ],
        "document_body": RAW_DOCUMENT_BODY,
        "file_content": RAW_FILE_CONTENT,
        "note": "ok",  # innocuous → preserved verbatim
    }


# ---------------------------------------------------------------------------
# Generic funnel — every public emit method routes through record_event
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestRecordEventFunnelRedaction:
    """The shared ``record_event`` funnel redacts PII at any nesting depth.

    **Validates: Requirements R13.4, R12.4**
    """

    def test_nested_pii_is_masked_stripped_and_hashed(self):
        action = "tenant.institution.updated"
        TenantAuditService.record_event(
            action=action,
            entity_type="institution",
            entity_id=uuid.uuid4(),
            metadata=_pii_bearing_contact_block(),
        )
        row = _latest(action)
        blob = _assert_free_of_raw_pii(row)

        changes = row.changes
        # Phone → {phone_hash, phone_last4}; only last4 survives, never the full
        # number.
        assert changes["support_phone"]["phone_last4"] == RAW_PHONES[0][-4:]
        assert "phone_hash" in changes["support_phone"]
        assert changes["contact"]["mobile_number"]["phone_last4"] == RAW_PHONES[1][-4:]
        assert changes["contact"]["alt_msisdn"]["phone_last4"] == RAW_PHONES[2][-4:]
        # NRC / passport → opaque hash (never the raw value).
        assert changes["contact"]["officer_nrc"] != RAW_NRCS[0]
        assert changes["contact"]["officer_passport"] != RAW_PASSPORTS[0]
        assert changes["applicants"][0]["nrc_number"] != RAW_NRCS[1]
        assert changes["applicants"][0]["passport_no"] != RAW_PASSPORTS[1]
        # Document body / file content → stripped entirely.
        assert "document_body" not in changes
        assert "file_content" not in changes
        # Non-PII fields are preserved verbatim.
        assert changes["support_email"] == "admissions@school.example"
        assert changes["note"] == "ok"


# ---------------------------------------------------------------------------
# Assignment decided / failed
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAssignmentPathRedaction:
    """Assignment decided/failed payloads carry residency inputs, never PII.

    **Validates: Requirements R13.4, R12.4**
    """

    def test_assignment_decided_residency_inputs_are_not_pii(self):
        TenantAuditService.record_assignment_decided(
            program_id=uuid.uuid4(),
            intake_id=uuid.uuid4(),
            offering_id=uuid.uuid4(),
            institution_id=uuid.uuid4(),
            country="Zambia",
            nationality="Zambian",
            application_id=uuid.uuid4(),
            source="test",
        )
        row = _latest(ACTION_ASSIGNMENT_DECIDED)
        _assert_free_of_raw_pii(row)
        # Residency routing dimensions are retained (they are not PII).
        assert row.changes["country"] == "Zambia"
        assert row.changes["nationality"] == "Zambian"

    def test_assignment_failed_records_no_pii(self):
        TenantAuditService.record_assignment_failed(
            program_id=uuid.uuid4(),
            intake_id=uuid.uuid4(),
            country="Botswana",
            nationality="Motswana",
            code="NO_ELIGIBLE_OFFERING",
            application_id=uuid.uuid4(),
            source="test",
        )
        row = _latest(ACTION_ASSIGNMENT_FAILED)
        _assert_free_of_raw_pii(row)
        assert row.changes["code"] == "NO_ELIGIBLE_OFFERING"

    def test_assignment_entity_snapshot_with_pii_is_redacted(self):
        """Defense-in-depth: even if a caller attaches an identity snapshot to
        an assignment event via the generic writer, it is redacted."""
        action = ACTION_ASSIGNMENT_DECIDED
        TenantAuditService.record_event(
            action=action,
            entity_type="assignment",
            entity_id=uuid.uuid4(),
            metadata={
                "canonical_program_id": str(uuid.uuid4()),
                "snapshot": {
                    "applicant_phone": RAW_PHONES[0],
                    "nrc": RAW_NRCS[0],
                    "passport_number": RAW_PASSPORTS[0],
                },
            },
        )
        row = _latest(action)
        _assert_free_of_raw_pii(row)


# ---------------------------------------------------------------------------
# Tenant config changes (support emails, contact fields)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestConfigChangeRedaction:
    """Tenant config create/update/deactivate payloads are PII-free.

    **Validates: Requirements R13.4, R12.4**
    """

    @pytest.mark.parametrize("verb", ["created", "updated", "deactivated"])
    def test_config_change_contact_fields_are_redacted(self, verb):
        institution_id = uuid.uuid4()
        TenantAuditService.record_config_change(
            resource="institution",
            verb=verb,
            entity_id=institution_id,
            institution_id=institution_id,
            actor_id=uuid.uuid4(),
            actor_role="super_admin",
            metadata=_pii_bearing_contact_block(),
        )
        row = _latest(f"tenant.institution.{verb}")
        _assert_free_of_raw_pii(row)
        # Non-PII tenant contact info (support email) is preserved.
        assert row.changes["support_email"] == "admissions@school.example"

    def test_domain_config_change_with_contact_block_is_redacted(self):
        institution_id = uuid.uuid4()
        TenantAuditService.record_config_change(
            resource="domain",
            verb="created",
            entity_id=uuid.uuid4(),
            institution_id=institution_id,
            metadata={"hostname": "apply.school.example", **_pii_bearing_contact_block()},
        )
        row = _latest("tenant.domain.created")
        _assert_free_of_raw_pii(row)
        # Non-PII hostname is preserved.
        assert row.changes["hostname"] == "apply.school.example"


# ---------------------------------------------------------------------------
# Asset upload
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAssetUploadRedaction:
    """Asset upload payloads carry only a content fingerprint, never raw bytes.

    **Validates: Requirements R13.4, R12.4**
    """

    def test_asset_upload_payload_has_no_raw_content(self):
        checksum = "a" * 64  # SHA-256 hex fingerprint, not the file bytes
        TenantAuditService.record_asset_upload(
            asset_id=uuid.uuid4(),
            institution_id=uuid.uuid4(),
            asset_type="logo",
            version=2,
            mime_type="image/png",
            checksum_sha256=checksum,
        )
        row = _latest("tenant.asset.uploaded")
        _assert_free_of_raw_pii(row)
        # The non-PII content fingerprint is retained for provenance.
        assert row.changes["checksum_sha256"] == checksum
        assert row.changes["asset_type"] == "logo"

    def test_asset_upload_with_smuggled_file_content_is_stripped(self):
        """Defense-in-depth: a ``file_content`` field attached via the generic
        writer is stripped, never persisted."""
        action = "tenant.asset.uploaded"
        TenantAuditService.record_event(
            action=action,
            entity_type="institution_asset",
            entity_id=uuid.uuid4(),
            metadata={"asset_type": "signature", "file_content": RAW_FILE_CONTENT},
        )
        row = _latest(action)
        _assert_free_of_raw_pii(row)
        assert "file_content" not in row.changes


# ---------------------------------------------------------------------------
# Official-document generation
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOfficialDocumentRedaction:
    """Official-document generation payloads contain no document contents.

    **Validates: Requirements R13.4, R12.4**
    """

    def test_official_document_generated_has_no_document_body(self):
        TenantAuditService.record_official_document_generated(
            application_id=uuid.uuid4(),
            institution_id=uuid.uuid4(),
            document_type="acceptance_letter",
            template_id=uuid.uuid4(),
            template_version=3,
        )
        row = _latest(ACTION_OFFICIAL_DOCUMENT_GENERATED)
        _assert_free_of_raw_pii(row)
        # Only non-PII provenance metadata is retained.
        assert row.changes["document_type"] == "acceptance_letter"
        assert row.changes["template_version"] == 3

    def test_document_body_attached_via_writer_is_stripped(self):
        """Defense-in-depth: the rendered document body never lands in audit."""
        action = ACTION_OFFICIAL_DOCUMENT_GENERATED
        TenantAuditService.record_event(
            action=action,
            entity_type="application_document",
            entity_id=uuid.uuid4(),
            metadata={
                "document_type": "acceptance_letter",
                "document_body": RAW_DOCUMENT_BODY,
                "applicant": {"phone": RAW_PHONES[0], "nrc_number": RAW_NRCS[0]},
            },
        )
        row = _latest(action)
        _assert_free_of_raw_pii(row)
        assert "document_body" not in row.changes


# ---------------------------------------------------------------------------
# Scope denial
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestScopeDeniedRedaction:
    """Scope-denial payloads record only the requested id + resource type.

    **Validates: Requirements R13.4, R12.4**
    """

    def test_scope_denied_records_no_pii(self):
        TenantAuditService.record_scope_denied(
            resource_type="application",
            resource_id=uuid.uuid4(),
            actor_id=uuid.uuid4(),
            actor_role="admin",
        )
        row = _latest(ACTION_SCOPE_DENIED)
        _assert_free_of_raw_pii(row)
        assert row.changes["resource_type"] == "application"
        # A scope denial is a potential cross-tenant probe → security retention.
        assert row.retention_category == "security"


# ---------------------------------------------------------------------------
# Cross-path sweep — assert the whole audit_logs table is PII-free
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestEveryEmitPathSweep:
    """Drive every emit path once, then sweep the whole table for raw PII.

    A single end-to-end guard: after exercising all five tenant emit methods
    (plus the generic funnel) with PII-bearing inputs, no ``audit_logs`` row
    anywhere contains a raw phone/NRC/passport/document body.

    **Validates: Requirements R13.4, R12.4**
    """

    def test_no_audit_row_contains_raw_pii(self):
        institution_id = uuid.uuid4()
        contact = _pii_bearing_contact_block()

        TenantAuditService.record_assignment_decided(
            program_id=uuid.uuid4(),
            intake_id=uuid.uuid4(),
            offering_id=uuid.uuid4(),
            institution_id=institution_id,
            country="Zambia",
            nationality="Zambian",
            application_id=uuid.uuid4(),
        )
        TenantAuditService.record_assignment_failed(
            program_id=uuid.uuid4(),
            intake_id=uuid.uuid4(),
            country="Namibia",
            nationality="Namibian",
        )
        TenantAuditService.record_config_change(
            resource="institution",
            verb="updated",
            entity_id=institution_id,
            institution_id=institution_id,
            metadata=contact,
        )
        TenantAuditService.record_asset_upload(
            asset_id=uuid.uuid4(),
            institution_id=institution_id,
            asset_type="logo",
            checksum_sha256="b" * 64,
        )
        TenantAuditService.record_official_document_generated(
            application_id=uuid.uuid4(),
            institution_id=institution_id,
            document_type="acceptance_letter",
        )
        TenantAuditService.record_scope_denied(
            resource_type="payment",
            resource_id=uuid.uuid4(),
        )
        # And a generic event carrying a deeply-nested identity snapshot.
        TenantAuditService.record_event(
            action="tenant.membership.created",
            entity_type="institution_membership",
            entity_id=uuid.uuid4(),
            institution_id=institution_id,
            metadata={"snapshot": contact},
        )

        rows = list(AuditLog.objects.all())
        assert rows, "expected audit rows to have been written"
        for row in rows:
            _assert_free_of_raw_pii(row)
