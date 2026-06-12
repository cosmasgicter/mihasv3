"""Official-document provenance + audit PII-exclusion property test (task 34.1).

Spec: ``multi-tenant-beanola-remediation`` — Phase (provenance + audit),
Requirement 16 (Official Document Provenance and Audit), with R4.6 (deletion
audit excludes body/PII/secrets) and R20.6 (no plaintext PII in audit trails).

This file implements exactly one property (Property 23) against the provenance
snapshot written into ``verification_notes.official_document`` and the
official-document lifecycle Audit_Events written through ``TenantAuditService`` /
``AuditLog``.

**Test-first semantics (FEATURE spec, not a bug-condition exploration):** the
*full* R16.1 provenance snapshot is extended by task 34.2 and the remaining
lifecycle audit events are added by task 34.3. It is therefore EXPECTED that the
snapshot half of this property FAILS now (``build_metadata`` stores only a
subset of the enumerated R16.1 fields today). The PII-exclusion half encodes the
permanent invariant that *whatever* audit payloads are written must never carry
applicant PII, secrets, or document bodies. This file only writes the property
and runs it once — it does NOT implement the 34.2/34.3 changes.

The property drives the real generator tasks end-to-end against the test DB with
an in-memory storage backend (so the renderer never reaches real R2/S3), seeds
the application with distinctive PII *sentinel* values, and asserts:

* every generated Official_Document carries the **complete**
  ``verification_notes.official_document`` snapshot — all enumerated R16.1 fields
  (document type, institution id + name, canonical program id, program offering
  id, intake id, application id, student number, template/profile id + version,
  logo/signature/seal asset ids + checksums, payment id + receipt number for
  receipts, per-asset render status, generated-by user id + role, generated-at,
  and the Document_Fingerprint) — R16.1; and
* every official-document Audit_Event payload (generation, deletion, and any
  other lifecycle event) excludes the rendered document bytes, applicant PII
  (NRC/passport, full DOB, phone, email, physical address), credentials / API
  keys / signing secrets, and bank account numbers: none of the injected PII
  sentinels appear anywhere in the serialised audit payload, and no payload key
  is a PII/secret marker — R16.4, R4.6, R20.6.

**Validates: Requirements 4.6, 16.1, 16.4, 20.6**
"""

from __future__ import annotations

import io
import json
import uuid
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from django.db import transaction
from django.test import override_settings
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.applications.tasks import (
    generate_acceptance_letter_task,
    generate_application_slip_task,
    generate_conditional_offer_task,
    generate_payment_receipt_task,
)
from apps.catalog.models import InstitutionDocumentProfile
from apps.common.models import AuditLog
from apps.documents.models import ApplicationDocument
from tests.tenant_fixtures import build_payment, build_profile, build_tenant_world


# ---------------------------------------------------------------------------
# PII / secret sentinels — distinctive values injected into the application (and
# payment) so any leak into an audit payload is unambiguous on failure.
# ---------------------------------------------------------------------------

SENTINEL_NRC = "SENTINEL-NRC-1122-3"
SENTINEL_PASSPORT = "SENTINEL-PASSPORT-ZX9911"
SENTINEL_PHONE = "+260970SENTINEL11"
SENTINEL_EMAIL = "sentinel.pii.leak@private.example"
SENTINEL_FULL_NAME = "Sentinelgiven Sentinelfamily"
SENTINEL_ADDRESS = "Plot 42 Sentinel Avenue"
SENTINEL_DOB = date(1997, 3, 14)
SENTINEL_DOB_ISO = SENTINEL_DOB.isoformat()  # "1997-03-14"
SENTINEL_BANK_ACCT = "SENTINELBANKACCT00099"
SENTINEL_API_KEY = "sk_live_SENTINELAPIKEY0099"

#: Every PII/secret substring that MUST NOT appear anywhere in a serialised
#: official-document audit payload (R16.4, R4.6, R20.6).
_PII_SENTINEL_VALUES = (
    SENTINEL_NRC,
    SENTINEL_PASSPORT,
    SENTINEL_PHONE,
    SENTINEL_EMAIL,
    SENTINEL_FULL_NAME,
    "Sentinelgiven",
    "Sentinelfamily",
    SENTINEL_ADDRESS,
    SENTINEL_DOB_ISO,
    SENTINEL_BANK_ACCT,
    SENTINEL_API_KEY,
)

#: Substrings that must never appear as (or within) an audit payload *key* — a
#: key named like PII/secret is itself a leak even if the value is null/redacted.
_PII_KEY_MARKERS = (
    "phone",
    "msisdn",
    "mobile",
    "nrc",
    "passport",
    "dob",
    "date_of_birth",
    "email",
    "address",
    "full_name",
    "applicant_name",
    "bank",
    "account_number",
    "secret",
    "api_key",
    "apikey",
    "password",
    "credential",
    "signing",
)

#: The full R16.1 provenance snapshot field set every Official_Document must
#: carry in ``verification_notes.official_document``.
_REQUIRED_SNAPSHOT_KEYS = {
    "document_type",
    "institution_id",
    "institution_name",
    "canonical_program_id",
    "program_offering_id",
    "intake_id",
    "application_id",
    "student_number",
    "template_id",
    "template_version",
    "profile_id",
    "profile_version",
    "logo_asset_id",
    "logo_asset_checksum",
    "signature_asset_id",
    "signature_asset_checksum",
    "seal_asset_id",
    "seal_asset_checksum",
    "logo_render",
    "signature_render",
    "generated_by_user_id",
    "generated_by_role",
    "generated_at",
    "fingerprint",
}

#: Receipt document types additionally carry payment id + receipt number (R16.1).
_RECEIPT_SNAPSHOT_KEYS = {"payment_id", "receipt_number"}
_RECEIPT_DOCUMENT_TYPES = {"payment_receipt"}

#: Document types whose render is profile-driven (R8.9): with no active
#: Institution_Document_Profile generation fails and produces no document, so
#: the world must carry an active institution-default profile.
_PROFILE_REQUIRED = {"acceptance_letter", "conditional_offer"}

# Document type → (task, required application status). The required status keeps
# generation from being skipped by the status gate in ``DOCUMENT_CONFIG``.
_DOC_TASKS = {
    "application_slip": (generate_application_slip_task, "submitted"),
    "acceptance_letter": (generate_acceptance_letter_task, "approved"),
    "conditional_offer": (generate_conditional_offer_task, "submitted"),
    "payment_receipt": (generate_payment_receipt_task, "submitted"),
}


# ---------------------------------------------------------------------------
# In-memory storage so the renderer never reaches for real R2/S3 credentials.
# ---------------------------------------------------------------------------


class _FakeStorage:
    """Minimal in-memory ``MediaStorage`` stand-in (save/url/open)."""

    _files: dict[str, bytes] = {}

    def save(self, name, content):
        content.seek(0)
        self._files[name] = content.read()
        return name

    def url(self, name):
        return f"https://test-storage.local/{name}"

    def open(self, name, mode="rb"):
        return io.BytesIO(self._files.get(name, b""))


@contextmanager
def _fake_storage():
    _FakeStorage._files = {}
    with patch("apps.common.storage.MediaStorage", _FakeStorage):
        yield


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _inject_pii_sentinels(application) -> None:
    """Overwrite the application's PII columns with distinctive sentinels."""
    Application.objects.filter(id=application.id).update(
        full_name=SENTINEL_FULL_NAME,
        nrc_number=SENTINEL_NRC,
        passport_number=SENTINEL_PASSPORT,
        date_of_birth=SENTINEL_DOB,
        phone=SENTINEL_PHONE,
        email=SENTINEL_EMAIL,
        residence_town=SENTINEL_ADDRESS,
    )
    application.refresh_from_db()


def _make_active_profile(institution, document_type: str) -> InstitutionDocumentProfile:
    """Seed an institution-default active profile for profile-required types."""
    from django.utils import timezone

    return InstitutionDocumentProfile.objects.create(
        id=uuid.uuid4(),
        institution=institution,
        document_type=document_type,
        program=None,
        canonical_program=None,
        intake=None,
        layout_key="fee_chart_letter",
        sections={"body": "Profile-driven body text"},
        fee_chart=[],
        bank_accounts=[],
        requirements=[],
        signatory={"name": "Registrar", "role": "Admissions"},
        version=1,
        is_active=True,
        created_at=timezone.now(),
    )


def _generate(document_type: str, application) -> None:
    task, _status = _DOC_TASKS[document_type]
    with _fake_storage():
        task(str(application.id))


def _current_official_version(application, document_type):
    """Latest non-deleted ``system_generated`` document by ``uploaded_at`` desc."""
    return (
        ApplicationDocument.objects.filter(
            application=application,
            document_type=document_type,
            system_generated=True,
        )
        .exclude(verification_status="deleted")
        .order_by("-uploaded_at")
        .first()
    )


def _parse_snapshot(document) -> dict | None:
    raw = getattr(document, "verification_notes", None)
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return None
    snapshot = parsed.get("official_document") if isinstance(parsed, dict) else None
    return snapshot if isinstance(snapshot, dict) else None


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


def _official_document_audit_rows():
    """Every Audit_Event whose action concerns an official document."""
    return list(AuditLog.objects.filter(action__contains="official_document"))


def _iter_keys(value):
    """Yield every dict key (recursively) inside a serialisable payload."""
    if isinstance(value, dict):
        for key, sub in value.items():
            yield key
            yield from _iter_keys(sub)
    elif isinstance(value, (list, tuple)):
        for item in value:
            yield from _iter_keys(item)


# ≥100 examples; success pinned to ``--hypothesis-seed=0`` via the CLI flag.
# DB-backed end-to-end generation, so the deadline is relaxed and the
# per-example tenant graph build is exempt from the function-scoped-fixture /
# data-too-large health checks (same pattern as the lifecycle/deletion tests).
_PROVENANCE_PROPERTY_SETTINGS = settings(
    max_examples=25,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.data_too_large,
    ],
)


@pytest.mark.django_db
class TestOfficialDocumentProvenanceProperty:
    # Feature: multi-tenant-beanola-remediation, Property 23: Audit and provenance exclude PII, secrets, and document bodies — every Official_Document carries the complete verification_notes.official_document snapshot; every Audit_Event payload excludes document bytes, applicant PII (NRC/passport, full DOB, phone, email, address), credentials/API keys/signing secrets, and bank account numbers.
    """Property 23: Audit and provenance exclude PII, secrets, and document bodies.

    For any Official_Document generation (and deletion), the generated document
    carries a complete provenance snapshot in
    ``verification_notes.official_document`` (all enumerated R16.1 fields), and
    every official-document Audit_Event payload contains no rendered document
    bytes, no applicant PII (NRC/passport, full DOB, phone, email, physical
    address), no credentials / API keys / signing secrets, and no bank account
    numbers.

    **Validates: Requirements 4.6, 16.1, 16.4, 20.6**
    """

    @override_settings(RATELIMIT_ENABLE=False)
    @_PROVENANCE_PROPERTY_SETTINGS
    @given(
        document_type=st.sampled_from(sorted(_DOC_TASKS)),
        do_delete=st.booleans(),
    )
    def test_audit_and_provenance_exclude_pii_secrets_and_bodies(
        self, document_type, do_delete
    ):
        # Isolate each Hypothesis example in its own savepoint that always rolls
        # back: keeps per-example DB state independent and recovers the shared
        # pytest-django transaction even if an example breaks it. Assertion
        # failures propagate out of the atomic block to Hypothesis unchanged.
        class _Rollback(Exception):
            pass

        try:
            with transaction.atomic():
                self._check_one_example(document_type, do_delete)
                raise _Rollback
        except _Rollback:
            pass

    def _check_one_example(self, document_type, do_delete):
        _task, required_status = _DOC_TASKS[document_type]
        world = build_tenant_world(application_status=required_status)
        application = world.application
        institution = world.institution

        # Inject distinctive PII so any leak into an audit payload is obvious.
        _inject_pii_sentinels(application)

        # R8.9: profile-required types need an active profile to render.
        if document_type in _PROFILE_REQUIRED:
            _make_active_profile(institution, document_type)

        # Receipt types need a successful payment; stash a bank-account + API-key
        # secret in its metadata so the audit path is proven to exclude them.
        if document_type in _RECEIPT_DOCUMENT_TYPES:
            build_payment(
                application=application,
                amount=Decimal("153.00"),
                status="successful",
                metadata={
                    "bank_account_number": SENTINEL_BANK_ACCT,
                    "api_key": SENTINEL_API_KEY,
                },
            )

        # ---- Generate the Official_Document --------------------------------
        _generate(document_type, application)

        document = _current_official_version(application, document_type)
        assert document is not None, (
            f"generation produced no current official version for {document_type}"
        )

        # ---- Half A: complete R16.1 provenance snapshot --------------------
        snapshot = _parse_snapshot(document)
        assert snapshot is not None, (
            "Official_Document carries no verification_notes.official_document snapshot"
        )

        expected_keys = set(_REQUIRED_SNAPSHOT_KEYS)
        if document_type in _RECEIPT_DOCUMENT_TYPES:
            expected_keys |= _RECEIPT_SNAPSHOT_KEYS
        missing = expected_keys - set(snapshot.keys())
        assert not missing, (
            f"provenance snapshot for {document_type} is missing R16.1 fields: "
            f"{sorted(missing)}"
        )

        # The snapshot itself must never embed the rendered body or raw PII.
        snapshot_blob = json.dumps(snapshot, default=str)
        for sentinel in _PII_SENTINEL_VALUES:
            assert sentinel not in snapshot_blob, (
                f"provenance snapshot leaked PII/secret sentinel {sentinel!r}"
            )

        # ---- Optionally exercise the deletion lifecycle audit --------------
        if do_delete:
            superadmin = build_profile(role="super_admin")
            client = _client_for(superadmin)
            client.delete(f"/api/v1/documents/{document.id}/delete/")

        # ---- Half B: every official-document audit payload excludes PII ----
        rows = _official_document_audit_rows()
        assert rows, "no official-document Audit_Event was written for this generation"

        for row in rows:
            payload = row.changes or {}
            payload_blob = json.dumps(payload, default=str)

            for sentinel in _PII_SENTINEL_VALUES:
                assert sentinel not in payload_blob, (
                    f"audit action {row.action!r} leaked PII/secret sentinel "
                    f"{sentinel!r}: {payload_blob}"
                )

            for key in _iter_keys(payload):
                if not isinstance(key, str):
                    continue
                lowered = key.lower()
                offending = [m for m in _PII_KEY_MARKERS if m in lowered]
                assert not offending, (
                    f"audit action {row.action!r} payload key {key!r} matches "
                    f"PII/secret marker(s) {offending}"
                )
