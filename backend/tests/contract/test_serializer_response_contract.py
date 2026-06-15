"""Backend serializer-response contract tests (Task 9.1, Component 4).

Spec: ``.kiro/specs/beanola-production-readiness/`` — Phase 4, Task 9.1.

These tests assert that the endpoints audited in
``docs/audits/api-contract-inventory.md`` return, over real HTTP through the
DRF stack:

- the **API_Envelope** ``{"success": true, "data": ...}`` for authenticated
  reads (R4.3); and
- for **list** endpoints, the paginated shape
  ``{page, pageSize, totalCount, results}`` *inside* ``data`` (R4.3,
  ``StandardPagination``); and
- the **documented serializer fields** for each surface — every field the
  inventory records as a ``data`` key / serializer field is present on the
  response, so no UI depends on an undocumented field and no documented field
  silently disappears (R4.4, R4.5).

Coverage spans one representative endpoint from each surface named in the
inventory's R4.2 surface list:

| Surface (inventory §)            | Endpoint exercised                                   |
|----------------------------------|------------------------------------------------------|
| Auth / profile (§2)              | ``GET /api/v1/auth/profile/``                        |
| Catalog / canonical programs (§3)| ``GET /api/v1/catalog/canonical-programs/`` (list)   |
| Applications — list (§4)         | ``GET /api/v1/applications/`` (paginated list)       |
| Applications — detail (§4)       | ``GET /api/v1/applications/{id}/summary/``           |
| Official documents (§6)          | ``GET /api/v1/applications/{id}/official-documents/``|
| Payments (§7)                    | ``GET /api/v1/payments/{id}/receipt/``               |
| Notifications (§9)               | ``GET /api/v1/notifications/`` (paginated list)      |
| Admin dashboard (§10a)           | ``GET /api/v1/admin/dashboard/``                     |
| Admin users (§10b)               | ``GET /api/v1/admin/users/`` (paginated list)        |
| Admin audit trail (§10c)         | ``GET /api/v1/admin/audit-logs/`` (paginated list)   |

Authentication uses the same ``APIClient.force_authenticate(JWTUser(...))``
pattern as ``tests/unit/test_scoped_access_matrix.py`` so the views run through
their real permission + serializer path. Admin surfaces are exercised as a
``super_admin`` so the ``AccessScopeService`` membership narrowing (a separate
R5 concern) does not mask the rows under test.

**Validates: Requirements 4.3, 4.4, 4.5**
"""

from __future__ import annotations

import uuid

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.common.models import AuditLog, Notification
from tests.tenant_fixtures import build_payment, build_profile


# ---------------------------------------------------------------------------
# Canonical envelope / pagination keys (single source of truth for assertions)
# ---------------------------------------------------------------------------

PAGINATION_KEYS = {"page", "pageSize", "totalCount", "results"}


def _client_for(profile) -> APIClient:
    """An APIClient authenticated as ``profile`` (a Profile row), mirroring the
    scoped-access matrix helper."""
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


def _body(response):
    """Return the parsed wire envelope (post-renderer) for a DRF response."""
    return response.json()


def _assert_success_envelope(body):
    """R4.3: an authenticated success response is ``{"success": true, "data": ...}``."""
    assert isinstance(body, dict), body
    assert body.get("success") is True, body
    assert "data" in body, body


def _assert_paginated(data):
    """R4.3: a list payload nests ``{page, pageSize, totalCount, results}`` in ``data``."""
    assert isinstance(data, dict), data
    assert PAGINATION_KEYS.issubset(data.keys()), data
    assert isinstance(data["results"], list), data
    assert isinstance(data["page"], int), data
    assert isinstance(data["pageSize"], int), data
    assert isinstance(data["totalCount"], int), data


def _assert_fields_present(record, expected_fields, label):
    """R4.4/R4.5: every documented serializer field is present on the record."""
    assert isinstance(record, dict), (label, record)
    missing = set(expected_fields) - set(record.keys())
    assert not missing, {"label": label, "missing": sorted(missing), "record": record}


# ---------------------------------------------------------------------------
# Auth / profile — §2
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestProfileResponseContract:
    """``GET /api/v1/auth/profile/`` returns the envelope with the documented
    ``ProfileReadSerializer`` fields.

    **Validates: Requirements 4.3, 4.4, 4.5**
    """

    # Mirrors apps/accounts/serializers.py:ProfileReadSerializer.Meta.fields.
    PROFILE_FIELDS = {
        "id", "email", "role", "first_name", "last_name", "full_name",
        "phone", "date_of_birth", "sex", "residence_town", "country",
        "nrc_number", "address", "nationality", "next_of_kin_name",
        "next_of_kin_phone", "updated_at",
    }

    def test_profile_envelope_and_fields(self, tenant_world):
        response = _client_for(tenant_world.student).get("/api/v1/auth/profile/")
        assert response.status_code == 200, response.content
        body = _body(response)
        _assert_success_envelope(body)
        _assert_fields_present(body["data"], self.PROFILE_FIELDS, "profile")


# ---------------------------------------------------------------------------
# Catalog / canonical programs — §3 (list)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCanonicalProgramListContract:
    """``GET /api/v1/catalog/canonical-programs/`` returns a paginated envelope
    of ``CanonicalProgramSerializer`` rows.

    **Validates: Requirements 4.3, 4.4, 4.5**
    """

    CANONICAL_FIELDS = {
        "id", "name", "code", "description", "duration_months",
        "regulatory_body", "is_active", "available_offerings",
        "created_at", "updated_at",
    }

    def test_canonical_programs_paginated_envelope(self, tenant_world):
        # tenant_world builds one active canonical program with an active
        # offering + program_intake, so the shared-portal list is non-empty.
        response = _client_for(tenant_world.student).get(
            "/api/v1/catalog/canonical-programs/"
        )
        assert response.status_code == 200, response.content
        body = _body(response)
        _assert_success_envelope(body)
        _assert_paginated(body["data"])
        results = body["data"]["results"]
        assert results, "expected at least the tenant_world canonical program"
        _assert_fields_present(results[0], self.CANONICAL_FIELDS, "canonical_program")


# ---------------------------------------------------------------------------
# Applications — §4 (list + detail)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestApplicationListContract:
    """``GET /api/v1/applications/`` returns a paginated envelope of
    ``ApplicationListSerializer`` rows.

    **Validates: Requirements 4.3, 4.4, 4.5**
    """

    # A representative documented subset of ApplicationListSerializer.Meta.fields.
    APPLICATION_LIST_FIELDS = {
        "id", "user_id", "application_number", "public_tracking_code",
        "tracking_code", "full_name", "email", "phone", "program", "intake",
        "institution", "institution_id", "program_id", "program_offering_id",
        "intake_id", "status", "payment_status", "created_at", "updated_at",
    }

    def test_application_list_paginated_envelope(self, tenant_world):
        response = _client_for(tenant_world.student).get("/api/v1/applications/")
        assert response.status_code == 200, response.content
        body = _body(response)
        _assert_success_envelope(body)
        _assert_paginated(body["data"])
        results = body["data"]["results"]
        assert results, "student should see their own tenant_world application"
        _assert_fields_present(
            results[0], self.APPLICATION_LIST_FIELDS, "application_list_row"
        )


@pytest.mark.django_db
class TestApplicationSummaryContract:
    """``GET /api/v1/applications/{id}/summary/`` returns the envelope with the
    documented ``data`` keys (single object, not paginated).

    **Validates: Requirements 4.3, 4.4, 4.5**
    """

    SUMMARY_DATA_KEYS = {
        "application", "documents_count", "grades_count", "status_history",
    }

    def test_summary_envelope_and_keys(self, tenant_world):
        aid = tenant_world.application_id
        response = _client_for(tenant_world.student).get(
            f"/api/v1/applications/{aid}/summary/"
        )
        assert response.status_code == 200, response.content
        body = _body(response)
        _assert_success_envelope(body)
        _assert_fields_present(body["data"], self.SUMMARY_DATA_KEYS, "application_summary")
        assert isinstance(body["data"]["application"], dict), body
        assert isinstance(body["data"]["documents_count"], int), body
        assert isinstance(body["data"]["status_history"], list), body


# ---------------------------------------------------------------------------
# Official documents — §6 (list)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOfficialDocumentListContract:
    """``GET /api/v1/applications/{id}/official-documents/`` returns the
    envelope with a ``data`` list (latest Official_Document per type).

    With no generated documents the list is empty, which still proves the
    envelope + list shape the frontend ``OfficialDocumentStatus[]`` type maps
    onto (R4.3/R4.5).

    **Validates: Requirements 4.3, 4.4, 4.5**
    """

    OFFICIAL_DOC_FIELDS = {
        "document_id", "document_type", "status", "generated_at",
        "template_version", "institution_id",
    }

    def test_official_documents_list_envelope(self, tenant_world):
        aid = tenant_world.application_id
        response = _client_for(tenant_world.student).get(
            f"/api/v1/applications/{aid}/official-documents/"
        )
        assert response.status_code == 200, response.content
        body = _body(response)
        _assert_success_envelope(body)
        assert isinstance(body["data"], list), body
        # Each entry (if any) mirrors the backend _build_envelope shape.
        for entry in body["data"]:
            _assert_fields_present(entry, self.OFFICIAL_DOC_FIELDS, "official_document")


# ---------------------------------------------------------------------------
# Payments — §7
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPaymentReceiptContract:
    """``GET /api/v1/payments/{id}/receipt/`` returns the envelope with the
    documented receipt ``data`` fields.

    **Validates: Requirements 4.3, 4.4, 4.5**
    """

    RECEIPT_FIELDS = {
        "payment_id", "amount", "currency", "status", "receipt_number",
        "created_at", "application_number", "institution_id",
        "institution_name", "program_id", "program_offering_id", "program",
        "applicant_name", "override",
    }

    def test_payment_receipt_envelope_and_fields(self, tenant_world):
        # A receipt is only built for a receipt-eligible (successful) payment;
        # set receipt_number so the view skips on-the-fly generation.
        payment = build_payment(
            application=tenant_world.application,
            user=tenant_world.student,
            status="successful",
            receipt_number=f"RC-{uuid.uuid4().hex[:10].upper()}",
        )
        response = _client_for(tenant_world.student).get(
            f"/api/v1/payments/{payment.id}/receipt/"
        )
        assert response.status_code == 200, response.content
        body = _body(response)
        _assert_success_envelope(body)
        _assert_fields_present(body["data"], self.RECEIPT_FIELDS, "payment_receipt")
        assert body["data"]["payment_id"] == str(payment.id), body


# ---------------------------------------------------------------------------
# Notifications — §9 (list)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestNotificationListContract:
    """``GET /api/v1/notifications/`` returns the paginated envelope of
    ``NotificationItemSerializer`` rows.

    **Validates: Requirements 4.3, 4.4, 4.5**
    """

    NOTIFICATION_FIELDS = {
        "id", "title", "message", "type", "is_read", "created_at",
    }

    def test_notifications_paginated_envelope(self, tenant_world):
        Notification.objects.create(
            id=uuid.uuid4(),
            user=tenant_world.student,
            title="Application received",
            message="We received your application.",
            type="info",
            is_read=False,
            created_at=timezone.now(),
        )
        response = _client_for(tenant_world.student).get("/api/v1/notifications/")
        assert response.status_code == 200, response.content
        body = _body(response)
        _assert_success_envelope(body)
        _assert_paginated(body["data"])
        results = body["data"]["results"]
        assert results, "student should see their own notification"
        _assert_fields_present(results[0], self.NOTIFICATION_FIELDS, "notification")


# ---------------------------------------------------------------------------
# Admin dashboard — §10a
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAdminDashboardContract:
    """``GET /api/v1/admin/dashboard/`` returns the envelope with the documented
    snake_case aggregate ``data`` keys (the live ``AdminDashboardView`` shape
    pinned in inventory finding F1).

    **Validates: Requirements 4.3, 4.4, 4.5**
    """

    DASHBOARD_TOP_KEYS = {
        "no_school_access", "applications", "users", "needs_attention",
        "recent_activity",
    }
    APPLICATIONS_KEYS = {"by_status", "total", "today", "this_week", "this_month"}
    USERS_KEYS = {"total", "active"}
    NEEDS_ATTENTION_KEYS = {
        "pending_payments", "pending_documents", "upcoming_interviews",
    }

    def test_admin_dashboard_envelope_and_keys(self, tenant_world):
        super_admin = build_profile(role="super_admin")
        response = _client_for(super_admin).get("/api/v1/admin/dashboard/")
        assert response.status_code == 200, response.content
        body = _body(response)
        _assert_success_envelope(body)
        data = body["data"]
        _assert_fields_present(data, self.DASHBOARD_TOP_KEYS, "admin_dashboard")
        _assert_fields_present(data["applications"], self.APPLICATIONS_KEYS, "dashboard.applications")
        _assert_fields_present(data["users"], self.USERS_KEYS, "dashboard.users")
        _assert_fields_present(
            data["needs_attention"], self.NEEDS_ATTENTION_KEYS, "dashboard.needs_attention"
        )
        assert isinstance(data["recent_activity"], list), data


# ---------------------------------------------------------------------------
# Admin users — §10b (list)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAdminUserListContract:
    """``GET /api/v1/admin/users/`` returns a paginated envelope of
    ``AdminUserSerializer`` rows.

    **Validates: Requirements 4.3, 4.4, 4.5**
    """

    ADMIN_USER_FIELDS = {
        "id", "email", "first_name", "last_name", "role", "is_active",
        "created_at",
    }

    def test_admin_users_paginated_envelope(self, tenant_world):
        super_admin = build_profile(role="super_admin")
        response = _client_for(super_admin).get("/api/v1/admin/users/")
        assert response.status_code == 200, response.content
        body = _body(response)
        _assert_success_envelope(body)
        _assert_paginated(body["data"])
        results = body["data"]["results"]
        assert results, "at least the tenant_world + super_admin profiles exist"
        _assert_fields_present(results[0], self.ADMIN_USER_FIELDS, "admin_user")


# ---------------------------------------------------------------------------
# Admin audit trail — §10c (list)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAdminAuditLogContract:
    """``GET /api/v1/admin/audit-logs/`` returns a paginated envelope of
    ``AuditLogSerializer`` rows.

    **Validates: Requirements 4.3, 4.4, 4.5**
    """

    AUDIT_FIELDS = {
        "id", "actor_id", "action", "entity_type", "entity_id", "changes",
        "ip_hash", "user_agent_hash", "request_ip", "request_user_agent",
        "retention_category", "created_at",
    }

    def test_audit_logs_paginated_envelope(self, tenant_world):
        super_admin = build_profile(role="super_admin")
        AuditLog.objects.create(
            id=uuid.uuid4(),
            actor_id=super_admin.id,
            action="user_update",
            entity_type="profiles",
            entity_id=tenant_world.student.id,
            changes={"role": {"old": "student", "new": "student"}},
            retention_category="security",
        )
        response = _client_for(super_admin).get("/api/v1/admin/audit-logs/")
        assert response.status_code == 200, response.content
        body = _body(response)
        _assert_success_envelope(body)
        _assert_paginated(body["data"])
        results = body["data"]["results"]
        assert results, "the seeded audit row should be visible to super_admin"
        _assert_fields_present(results[0], self.AUDIT_FIELDS, "audit_log")
