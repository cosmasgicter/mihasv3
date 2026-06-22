"""Property-based test — audit event emission and shape (Property 20).

Feature: enterprise-tenant-authority, Property 20

Spec: ``.kiro/specs/enterprise-tenant-authority`` (task 10.2). Pins the
audit-emission property from the design's Correctness Properties:

    Property 20 — Audit event emitted and well-formed
    For all tenant-sensitive writes (tenant/domain/asset/template/document/
    program-assignment/user/membership/grant changes and review/
    document-verify/payment-verify decisions) and all failed authorizations on
    sensitive admin endpoints, exactly one Audit_Event is emitted carrying the
    required fields, with no raw PII (phone/NRC/passport/document body) in any
    field.

This exercises the real :class:`TenantAuditService`
(``backend/apps/catalog/tenant_audit_service.py``) against the test DB — no
production code is changed and nothing is mocked. ``TenantAuditService`` maps
the design's required fields onto the existing ``audit_logs`` row + ``changes``
jsonb (ADR-003 "reuse ``audit_logs``"):

    actor_user_id          -> ``audit_logs.actor_id``
    actor_role             -> ``changes.actor_role``
    target_institution_id  -> ``changes.institution_id``
    action                 -> ``audit_logs.action``
    object_type            -> ``audit_logs.entity_type``
    object_id              -> ``audit_logs.entity_id``
    request_id             -> ``changes.request_id`` (from ``RequestIDMiddleware``)
    ip_address             -> ``audit_logs.ip_address``  (SHA-256 hash, never raw)
    user_agent             -> ``audit_logs.user_agent``  (SHA-256 hash, never raw)
    created_at             -> ``audit_logs.created_at``

Hypothesis generates a varied PII-bearing metadata payload (phone/NRC/passport/
document-body at multiple nesting depths) and selects one tenant-sensitive emit
path per example. Each example asserts: exactly one new ``audit_logs`` row is
created, it is well-formed (action/object_type/changes/actor/institution/
request-id), its IP + user-agent are SHA-256 hashes (never the raw values), and
no raw phone/NRC/passport/document-body value survives anywhere in the stored
``changes`` JSON.

Run (≥100 examples, SQLite-in-memory test settings)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_audit_event_shape.py -q

**Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7**
"""

from __future__ import annotations

import json
import re
import uuid

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.catalog.tenant_audit_service import (
    ACTION_DOCUMENT_VERIFICATION_DECIDED,
    ACTION_OFFICIAL_DOCUMENT_DOWNLOADED,
    ACTION_OFFICIAL_DOCUMENT_EMAILED,
    ACTION_OFFICIAL_DOCUMENT_GENERATED,
    ACTION_PAYMENT_VERIFICATION_DECIDED,
    ACTION_REVIEW_DECIDED,
    ACTION_SCOPE_DENIED,
    TenantAuditService,
)
from apps.common.audit_network import hash_network_value
from apps.common.models import AuditLog


# ≥100 examples; deadline relaxed for DB-backed writes; the function-scoped
# ``db`` health check is suppressed because every example shares the
# transactional test DB (rolled back per test, isolated per example by counting
# only the rows each emit adds).
HYPOTHESIS_SETTINGS = settings(
    max_examples=120,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)

_SHA256_HEX = re.compile(r"\A[0-9a-f]{64}\Z")

CANONICAL_ROLES = ("super_admin", "admin", "reviewer", "student")

# Tenant child types covered by ``record_config_change`` (R10.1-R10.4): tenant
# create/update/deactivate, domain changes, asset/template/document-config
# changes, and user-invite/membership/grant changes.
TENANT_CONFIG_RESOURCES = (
    "institution",
    "domain",
    "asset",
    "template",
    "required_document",
    "membership",
    "grant",
)
CONFIG_VERBS = ("created", "updated", "deactivated")


# ---------------------------------------------------------------------------
# PII-bearing payload generator — the raw values that must NEVER be persisted
# ---------------------------------------------------------------------------

_DIGITS = "0123456789"
_HEX = "0123456789abcdef"
_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

_phone_st = st.builds(lambda d: "+260" + d, st.text(alphabet=_DIGITS, min_size=9, max_size=9))
_nrc_st = st.builds(
    lambda a, b, c: f"{a}/{b}/{c}",
    st.text(alphabet=_DIGITS, min_size=6, max_size=6),
    st.text(alphabet=_DIGITS, min_size=2, max_size=2),
    st.text(alphabet=_DIGITS, min_size=1, max_size=1),
)
_passport_st = st.builds(
    lambda letters, nums: letters + nums,
    st.text(alphabet=_UPPER, min_size=2, max_size=2),
    st.text(alphabet=_DIGITS, min_size=7, max_size=7),
)
_body_st = st.builds(lambda h: "DOCBODY-" + h, st.text(alphabet=_HEX, min_size=8, max_size=16))
_NOTE = st.sampled_from(["ok", "reviewed", "approved by ops", "n/a", "verified"])


@st.composite
def pii_payload(draw):
    """Return ``(payload, raw_secrets)``.

    ``payload`` mixes innocuous keys with phone/NRC/passport/document-body PII
    at multiple nesting depths; ``raw_secrets`` lists the exact raw values that
    must never survive into the persisted ``changes`` JSON.
    """
    phone1 = draw(_phone_st)
    phone2 = draw(_phone_st)
    nrc1 = draw(_nrc_st)
    nrc2 = draw(_nrc_st)
    passport = draw(_passport_st)
    body = draw(_body_st)
    note = draw(_NOTE)
    payload = {
        "support_email": "admissions@school.example",  # not PII -> preserved
        "support_phone": phone1,
        "contact": {
            "mobile_number": phone2,
            "officer_nrc": nrc1,
            "officer_passport": passport,
        },
        "applicants": [{"nrc_number": nrc2}],
        "document_body": body,
        "note": note,
    }
    return payload, [phone1, phone2, nrc1, nrc2, passport, body]


# ---------------------------------------------------------------------------
# Fake request — supplies raw IP / user-agent / request-id for the writer
# ---------------------------------------------------------------------------


class _FakeRequest:
    """Minimal request stand-in carrying raw network context + a request id."""

    def __init__(self, ip: str, user_agent: str, request_id: str):
        self.META = {"REMOTE_ADDR": ip, "HTTP_USER_AGENT": user_agent}
        self.request_id = request_id


_IP = st.builds(lambda a, b: f"203.0.{a}.{b}", st.integers(1, 254), st.integers(1, 254))
_UA = st.sampled_from(
    [
        "Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605",
        "curl/8.4.0",
    ]
)


# ---------------------------------------------------------------------------
# Operation specs — each emits exactly one tenant-sensitive Audit_Event
# ---------------------------------------------------------------------------

# (kind,) plus optional (resource, verb) for the config_change family.
_CONFIG_OPS = [("config_change", r, v) for r in TENANT_CONFIG_RESOURCES for v in CONFIG_VERBS]
_SIMPLE_OPS = [
    ("asset_upload",),
    ("official_document_generated",),
    ("official_document_downloaded",),
    ("official_document_emailed",),
    ("review_decision",),
    ("document_verification",),
    ("payment_verification",),
    ("scope_denied",),  # failed authorization (R10.6)
    ("record_event",),
]
OP = st.sampled_from(_CONFIG_OPS + _SIMPLE_OPS)


def _emit(op, *, actor_id, actor_role, institution_id, entity_id, metadata, request):
    """Dispatch one emit call and return ``(expected_action, flags)``.

    ``flags`` is ``(institution_scoped, actor_recorded)`` describing what the
    chosen path is expected to persist.
    """
    kind = op[0]
    if kind == "config_change":
        _, resource, verb = op
        TenantAuditService.record_config_change(
            resource=resource,
            verb=verb,
            entity_id=entity_id,
            institution_id=institution_id,
            actor_id=actor_id,
            actor_role=actor_role,
            metadata=metadata,
            request=request,
        )
        return f"tenant.{resource}.{verb}", (True, True)

    if kind == "asset_upload":
        TenantAuditService.record_asset_upload(
            asset_id=entity_id,
            institution_id=institution_id,
            asset_type="logo",
            version=2,
            mime_type="image/png",
            checksum_sha256="a" * 64,
            actor_id=actor_id,
            actor_role=actor_role,
            request=request,
        )
        return "tenant.asset.uploaded", (True, True)

    if kind == "official_document_generated":
        # Background render: actor is intentionally not recorded.
        TenantAuditService.record_official_document_generated(
            application_id=entity_id,
            institution_id=institution_id,
            document_type="acceptance_letter",
            template_id=uuid.uuid4(),
            template_version=3,
            request=request,
        )
        return ACTION_OFFICIAL_DOCUMENT_GENERATED, (True, False)

    if kind == "official_document_downloaded":
        TenantAuditService.record_official_document_downloaded(
            document_id=entity_id,
            application_id=uuid.uuid4(),
            institution_id=institution_id,
            document_type="acceptance_letter",
            actor_id=actor_id,
            actor_role=actor_role,
            request=request,
        )
        return ACTION_OFFICIAL_DOCUMENT_DOWNLOADED, (True, True)

    if kind == "official_document_emailed":
        TenantAuditService.record_official_document_emailed(
            application_id=entity_id,
            institution_id=institution_id,
            document_type="acceptance_letter",
            actor_id=actor_id,
            actor_role=actor_role,
            request=request,
        )
        return ACTION_OFFICIAL_DOCUMENT_EMAILED, (True, True)

    if kind == "review_decision":
        TenantAuditService.record_review_decision(
            application_id=entity_id,
            institution_id=institution_id,
            new_status="under_review",
            old_status="submitted",
            actor_id=actor_id,
            actor_role=actor_role,
            reason="reviewed",
            request=request,
        )
        return ACTION_REVIEW_DECIDED, (True, True)

    if kind == "document_verification":
        TenantAuditService.record_document_verification(
            document_id=entity_id,
            application_id=uuid.uuid4(),
            institution_id=institution_id,
            new_status="verified",
            old_status="pending",
            document_type="nrc",
            actor_id=actor_id,
            actor_role=actor_role,
            reason="ok",
            request=request,
        )
        return ACTION_DOCUMENT_VERIFICATION_DECIDED, (True, True)

    if kind == "payment_verification":
        TenantAuditService.record_payment_verification(
            payment_id=entity_id,
            institution_id=institution_id,
            outcome_status="successful",
            application_id=uuid.uuid4(),
            outcome_code="PAYMENT_OK",
            actor_id=actor_id,
            actor_role=actor_role,
            reason="verified",
            request=request,
        )
        return ACTION_PAYMENT_VERIFICATION_DECIDED, (True, True)

    if kind == "scope_denied":
        # Failed authorization (R10.6): no institution scope is attached.
        TenantAuditService.record_scope_denied(
            resource_type="application",
            resource_id=entity_id,
            actor_id=actor_id,
            actor_role=actor_role,
            request=request,
        )
        return ACTION_SCOPE_DENIED, (False, True)

    if kind == "record_event":
        TenantAuditService.record_event(
            action="tenant.membership.updated",
            entity_type="institution_membership",
            entity_id=entity_id,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            metadata=metadata,
            request=request,
        )
        return "tenant.membership.updated", (True, True)

    raise AssertionError(f"unhandled op {op!r}")


@pytest.mark.django_db
class TestAuditEventEmittedAndWellFormed:
    """Property 20 — audit event emitted and well-formed.

    **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7**
    """

    @HYPOTHESIS_SETTINGS
    @given(
        op=OP,
        payload=pii_payload(),
        actor_role=st.sampled_from(CANONICAL_ROLES),
        raw_ip=_IP,
        raw_ua=_UA,
    )
    def test_audit_event_emitted_and_well_formed(
        self, op, payload, actor_role, raw_ip, raw_ua
    ):
        """A single tenant-sensitive emit writes exactly one well-formed,
        PII-free ``audit_logs`` row with hashed network context."""
        metadata, raw_secrets = payload
        actor_id = uuid.uuid4()
        institution_id = uuid.uuid4()
        entity_id = uuid.uuid4()
        request_id = uuid.uuid4().hex
        request = _FakeRequest(raw_ip, raw_ua, request_id)

        before_ids = set(AuditLog.objects.values_list("id", flat=True))
        expected_action, (institution_scoped, actor_recorded) = _emit(
            op,
            actor_id=actor_id,
            actor_role=actor_role,
            institution_id=institution_id,
            entity_id=entity_id,
            metadata=metadata,
            request=request,
        )
        after_ids = set(AuditLog.objects.values_list("id", flat=True))

        # --- Exactly one Audit_Event per tenant-sensitive write / failed auth ---
        new_ids = after_ids - before_ids
        assert len(new_ids) == 1, (
            f"expected exactly one new audit row for op={op!r}; "
            f"got {len(new_ids)}"
        )
        row = AuditLog.objects.get(id=new_ids.pop())

        # --- Well-formed: action / object_type / object_id / changes ---
        assert row.action == expected_action
        assert 0 < len(row.action) <= 50
        assert row.entity_type and len(row.entity_type) <= 50  # object_type
        assert row.entity_id is not None  # object_id
        assert isinstance(row.changes, dict)
        assert row.created_at is not None

        # --- request_id correlation (R10.7) ---
        assert row.changes.get("request_id") == request_id

        # --- actor_user_id + actor_role (R10.7) ---
        if actor_recorded:
            assert str(row.actor_id) == str(actor_id)
            assert row.changes.get("actor_role") == actor_role

        # --- target_institution_id recorded for institution-scoped writes ---
        if institution_scoped:
            assert row.changes.get("institution_id") == str(institution_id)

        # --- ip_address / user_agent are SHA-256 hashes, never raw (R10.7) ---
        assert row.ip_address == hash_network_value(raw_ip)
        assert _SHA256_HEX.match(row.ip_address or "")
        assert raw_ip not in (row.ip_address or "")
        assert row.user_agent == hash_network_value(raw_ua)
        assert _SHA256_HEX.match(row.user_agent or "")
        assert raw_ua not in (row.user_agent or "")

        # --- No raw PII anywhere in the persisted changes payload ---
        blob = json.dumps(row.changes, default=str)
        for secret in raw_secrets:
            assert secret not in blob, (
                f"raw PII {secret!r} leaked into audit payload for "
                f"op={op!r}: {blob}"
            )


@pytest.mark.django_db
class TestAuditEventShapeExamples:
    """Concrete edge cases complementing the property (unit coverage).

    **Validates: Requirements 10.1, 10.5, 10.6, 10.7**
    """

    def _fake_request(self):
        return _FakeRequest("198.51.100.7", "curl/8.4.0", uuid.uuid4().hex)

    def test_failed_authorization_emits_exactly_one_scope_denied(self):
        """A failed authorization emits exactly one ``scope.denied`` event with
        security retention and no institution scope (R10.6)."""
        request = self._fake_request()
        before = AuditLog.objects.filter(action=ACTION_SCOPE_DENIED).count()
        TenantAuditService.record_scope_denied(
            resource_type="payment",
            resource_id=uuid.uuid4(),
            actor_id=uuid.uuid4(),
            actor_role="admin",
            request=request,
        )
        after = AuditLog.objects.filter(action=ACTION_SCOPE_DENIED).count()
        assert after - before == 1
        row = AuditLog.objects.filter(action=ACTION_SCOPE_DENIED).order_by("-created_at").first()
        assert row.retention_category == "security"
        assert row.changes.get("request_id") == request.request_id
        # Hashed network context, never raw.
        assert row.ip_address == hash_network_value("198.51.100.7")
        assert "198.51.100.7" not in (row.ip_address or "")

    def test_config_change_redacts_phone_and_nrc(self):
        """A tenant config write masks phone (hash + last4) and hashes NRC, and
        preserves non-PII fields (R10.1, R10.7)."""
        institution_id = uuid.uuid4()
        TenantAuditService.record_config_change(
            resource="institution",
            verb="updated",
            entity_id=institution_id,
            institution_id=institution_id,
            actor_id=uuid.uuid4(),
            actor_role="super_admin",
            metadata={"phone": "+260971234567", "nrc_number": "123456/78/9", "note": "ok"},
            request=self._fake_request(),
        )
        row = (
            AuditLog.objects.filter(action="tenant.institution.updated")
            .order_by("-created_at")
            .first()
        )
        assert row is not None
        blob = json.dumps(row.changes, default=str)
        assert "+260971234567" not in blob
        assert "123456/78/9" not in blob
        assert row.changes["phone"]["phone_last4"] == "4567"
        assert row.changes["nrc_number"] != "123456/78/9"
        assert row.changes["note"] == "ok"
        assert row.changes["institution_id"] == str(institution_id)
