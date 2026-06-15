"""Negative E2E flows proving the Beanola security boundaries (task 17.3).

Spec: ``.kiro/specs/beanola-production-readiness/`` — Phase 8 (End-to-end
workflow QA), Component 8, Requirements **R8.3–R8.8**.

This is a focused **negative-flow integration drill**, not a production
migration: it runs entirely against the ephemeral Django test database
(``config.settings.test`` → sqlite) and the in-process DRF test client. It never
touches the production EC2 Postgres or the Neon authoring branch. Staging
(R8.1/R8.2 happy-path) may be unavailable, so the security boundaries the
negative flows assert are proven here as automated integration tests against the
test DB — the same seams the live staging run would exercise.

It complements the broader suites that already prove these invariants in depth:

- ``backend/tests/unit/test_scoped_access_matrix.py`` — the endpoint-level
  R5.3–R5.7 scoped-access matrix (wrong-school 404 masking, expired grant,
  grant-width, super-admin).
- ``backend/tests/property/test_production_scope_masking_properties.py`` —
  Property 26 tenant isolation across every audited endpoint (R8.3, R8.4).
- ``backend/tests/unit/test_official_documents.py`` /
  ``backend/tests/property/test_official_document_failure_degradation.py`` — the
  no-profile ``DOCUMENT_PROFILE_NOT_CONFIGURED`` failure (R8.5).
- ``backend/tests/property/test_payment_webhook_properties.py`` /
  ``backend/tests/property/test_submission_gate.py`` — failed payment never
  produces a paid receipt (R8.7) and the payment gate.

Where those suites prove each invariant in isolation, **this module walks the
six negative flows as a single end-to-end drill** so a reviewer can read one
file and see every R8 security boundary hold against the real HTTP surface and
the real backend services:

    R8.3  wrong-school staff      → Not_Found_Envelope (byte-identical 404)
    R8.4  expired Access_Grant    → cannot open the previously granted
                                     payment / document (Not_Found_Envelope)
    R8.5  no document profile      → official generation blocked,
                                     DOCUMENT_PROFILE_NOT_CONFIGURED, no doc row
    R8.6  duplicate application    → blocked (DUPLICATE_APPLICATION);
                                     full intake → recoverable guidance
    R8.7  failed payment           → never produces a paid receipt
    R8.8  anonymous public tracker → leaks no PII

Run (sqlite, never the production/Neon DB)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/integration/test_negative_flow_boundaries.py -v

**Validates: Requirements 8.3, 8.4, 8.5, 8.6, 8.7, 8.8**
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.intake_enforcer import IntakeEnforcer
from apps.applications.models import Application
from apps.catalog.services import AccessScopeService
from apps.documents.models import ApplicationDocument, Payment
from tests.tenant_fixtures import (
    build_access_grant,
    build_document,
    build_payment,
    build_profile,
    build_tenant_world,
)

pytestmark = pytest.mark.tenant


# ---------------------------------------------------------------------------
# Helpers
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


def _capture(response):
    """Return ``(status_code, parsed_body)`` for a DRF response."""
    try:
        body = response.json()
    except Exception:  # pragma: no cover - non-JSON body
        body = getattr(response, "data", None)
    return response.status_code, body


@pytest.fixture()
def production_scope(monkeypatch):
    """Disable the dev/test legacy-admin all-access compatibility branch.

    Under the test settings module ``AccessScopeService`` grants a bare
    ``role == "admin"`` user all-access (legacy compat). The negative flows must
    assert the **production** membership/grant-driven model, so we force
    ``_test_settings_active()`` False — exactly as the R5 HTTP matrix does.
    """
    monkeypatch.setattr(
        AccessScopeService, "_test_settings_active", staticmethod(lambda: False)
    )


# ===========================================================================
# R8.3 — wrong-school staff → Not_Found_Envelope
# ===========================================================================


@pytest.mark.django_db
class TestWrongSchoolStaffMaskedAsNotFound:
    """R8.3: a wrong-school staff member opening another school's application,
    payment, or document gets the byte-identical Not_Found_Envelope.

    Each surface is hit twice as the *same* school-A staff user: once with a
    random missing UUID (the genuine not-found baseline) and once with school
    B's real id (the out-of-scope read). The two responses must be identical in
    status, envelope shape, and message, and the other school's data must never
    appear — so existence cannot be inferred.

    **Validates: Requirements 8.3**
    """

    def test_wrong_school_application_read_masks_as_not_found(
        self, two_tenant_worlds, production_scope
    ):
        world_a, world_b = two_tenant_worlds
        client = _client_for(world_a.staff)

        missing = _capture(client.get(f"/api/v1/applications/{uuid.uuid4()}/summary/"))
        out_of_scope = _capture(
            client.get(f"/api/v1/applications/{world_b.application_id}/summary/")
        )

        assert out_of_scope[0] == 404, out_of_scope
        assert out_of_scope == missing, {"out_of_scope": out_of_scope, "missing": missing}
        # No leak of the other school's identity.
        assert world_b.institution.name not in str(out_of_scope[1])
        assert world_b.application.full_name not in str(out_of_scope[1])

    def test_wrong_school_payment_read_masks_as_not_found(
        self, two_tenant_worlds, production_scope
    ):
        world_a, world_b = two_tenant_worlds
        payment_b = build_payment(application=world_b.application, status="successful")
        client = _client_for(world_a.staff)

        missing = _capture(client.get(f"/api/v1/payments/{uuid.uuid4()}/receipt/"))
        out_of_scope = _capture(client.get(f"/api/v1/payments/{payment_b.id}/receipt/"))

        assert out_of_scope[0] == 404, out_of_scope
        assert out_of_scope == missing, {"out_of_scope": out_of_scope, "missing": missing}
        assert world_b.institution.name not in str(out_of_scope[1])

    def test_wrong_school_document_read_masks_as_not_found(
        self, two_tenant_worlds, production_scope
    ):
        world_a, world_b = two_tenant_worlds
        doc_b = build_document(application=world_b.application)
        client = _client_for(world_a.staff)

        missing = _capture(client.get(f"/api/v1/documents/{uuid.uuid4()}/info/"))
        out_of_scope = _capture(client.get(f"/api/v1/documents/{doc_b.id}/info/"))

        assert out_of_scope[0] == 404, out_of_scope
        assert out_of_scope == missing, {"out_of_scope": out_of_scope, "missing": missing}
        if isinstance(out_of_scope[1], dict):
            assert out_of_scope[1].get("success") is not True, out_of_scope


# ===========================================================================
# R8.4 — expired Access_Grant cannot open the previously granted resource
# ===========================================================================


@pytest.mark.django_db
class TestExpiredGrantCannotOpenPaymentOrDocument:
    """R8.4: once an Access_Grant has expired, the staff member can no longer
    open the previously granted payment or document — both mask as not-found.

    The actor is an admin whose ONLY scope is an application-scoped grant that
    has already expired. A control with the same grant unexpired proves the
    not-found is the expiry, not a broken fixture.

    **Validates: Requirements 8.4**
    """

    def _admin_with_application_grant(self, world, *, expires_at):
        admin = build_profile(role="admin")
        build_access_grant(
            user=admin,
            scope_type="application",
            application_id=world.application.id,
            expires_at=expires_at,
        )
        return admin

    def test_expired_grant_cannot_open_payment(self, two_tenant_worlds, production_scope):
        world_a, _world_b = two_tenant_worlds
        payment = build_payment(application=world_a.application, status="successful")
        admin = self._admin_with_application_grant(
            world_a, expires_at=timezone.now() - timedelta(days=1)
        )
        client = _client_for(admin)

        missing = _capture(client.get(f"/api/v1/payments/{uuid.uuid4()}/receipt/"))
        expired = _capture(client.get(f"/api/v1/payments/{payment.id}/receipt/"))

        assert expired[0] == 404, expired
        assert expired == missing, {"expired": expired, "missing": missing}

    def test_expired_grant_cannot_open_document(self, two_tenant_worlds, production_scope):
        world_a, _world_b = two_tenant_worlds
        doc = build_document(application=world_a.application)
        admin = self._admin_with_application_grant(
            world_a, expires_at=timezone.now() - timedelta(days=1)
        )
        client = _client_for(admin)

        missing = _capture(client.get(f"/api/v1/documents/{uuid.uuid4()}/info/"))
        expired = _capture(client.get(f"/api/v1/documents/{doc.id}/info/"))

        assert expired[0] == 404, expired
        assert expired == missing, {"expired": expired, "missing": missing}

    def test_active_grant_still_opens_document(self, two_tenant_worlds, production_scope):
        """Control: the same grant, unexpired, permits the read."""
        world_a, _world_b = two_tenant_worlds
        doc = build_document(application=world_a.application)
        admin = self._admin_with_application_grant(
            world_a, expires_at=timezone.now() + timedelta(days=1)
        )
        status_code, body = _capture(
            _client_for(admin).get(f"/api/v1/documents/{doc.id}/info/")
        )
        assert status_code == 200, (status_code, body)
        assert body.get("success") is True, body


# ===========================================================================
# R8.5 — no document profile blocks official generation with a clear error
# ===========================================================================


@pytest.mark.django_db
class TestNoProfileBlocksOfficialGeneration:
    """R8.5: a profile-required official document (acceptance letter /
    conditional offer) with NO active Institution_Document_Profile fails the
    render with the stable ``DOCUMENT_PROFILE_NOT_CONFIGURED`` code, creates no
    ApplicationDocument from frontend/default content, and does not retry.

    Drives ``_generate_official_document_task`` directly (no broker in tests),
    reusing the in-memory storage seam from the dedup guard.

    **Validates: Requirements 8.5**
    """

    class _TaskStub:
        max_retries = 3

        class request:
            retries = 0

    @pytest.mark.parametrize("document_type", ["acceptance_letter", "conditional_offer"])
    def test_no_profile_blocks_generation_with_clear_error(self, document_type):
        from apps.applications.tasks.pdf_generation import _generate_official_document_task
        from apps.catalog.models import InstitutionDocumentProfile
        from apps.common.models import AuditLog

        # Import the shared in-memory storage seam from the dedup guard so the
        # render path never reaches real R2/S3 credentials.
        from tests.unit.test_official_document_dedup_guard import _fake_storage

        required_status = "approved" if document_type == "acceptance_letter" else "submitted"
        world = build_tenant_world(application_status=required_status)
        application = world.application

        # Precondition: no document profile of this type exists for the school.
        assert not InstitutionDocumentProfile.objects.filter(
            institution=world.institution, document_type=document_type
        ).exists()

        with _fake_storage():
            result = _generate_official_document_task(
                self._TaskStub(), str(application.id), document_type
            )

        # The task swallows the no-profile failure and returns (no retry).
        assert result is None

        # No ApplicationDocument was produced from default/frontend content.
        assert not ApplicationDocument.objects.filter(
            application=application, document_type=document_type
        ).exists()

        # A non-PII audit row records the clear, stable failure code.
        audit_rows = list(
            AuditLog.objects.filter(
                action="official_document_render_failed", entity_id=application.id
            )
        )
        assert len(audit_rows) == 1, audit_rows
        changes = audit_rows[0].changes
        assert changes["error_code"] == "DOCUMENT_PROFILE_NOT_CONFIGURED"
        assert changes["status"] == "failed"
        assert changes["retried"] is False
        assert changes["document_type"] == document_type


# ===========================================================================
# R8.6 — duplicate application blocked; full intake → recoverable guidance
# ===========================================================================


@pytest.mark.django_db
class TestDuplicateBlockedAndFullIntakeGuidance:
    """R8.6: the canonical duplicate logic blocks a duplicate application, and a
    full intake/offering returns recoverable guidance (not a hard crash).

    **Validates: Requirements 8.6**
    """

    def _create_payload(self, world, suffix):
        return {
            "full_name": f"Negative Flow Applicant {suffix}",
            "nrc_number": "123456/78/9",
            "date_of_birth": "2000-01-01",
            "sex": "Female",
            "phone": "+260970000001",
            "email": f"neg-{suffix}@example.com",
            "residence_town": "Lusaka",
            "country": "Zambia",
            "nationality": "Zambian",
            "program_id": str(world.canonical_program_id),
            "intake_id": str(world.intake_id),
        }

    def test_duplicate_application_is_blocked(self):
        world = build_tenant_world(with_application=False)
        student = build_profile(role="student")
        client = _client_for(student)
        payload = self._create_payload(world, suffix=uuid.uuid4().hex[:8])

        first = _capture(client.post("/api/v1/applications/", data=payload, format="json"))
        assert first[0] == 201, first

        # Second create with the same identity + canonical program/intake is a
        # non-terminal duplicate and is blocked.
        second = _capture(client.post("/api/v1/applications/", data=payload, format="json"))
        assert second[0] == 409, second
        assert second[1]["code"] == "DUPLICATE_APPLICATION", second[1]
        assert second[1]["success"] is False
        # Recoverable: the conflict points the student back to the existing app.
        assert second[1].get("existing_id"), second[1]
        assert second[1].get("resume_url"), second[1]

    def test_full_intake_returns_recoverable_guidance(self):
        """A full intake yields a recoverable INTAKE_CAPACITY_REACHED result
        (allowed=False + a human-readable message) rather than an exception."""
        # An intake at capacity: max_capacity=1 with one live (submitted) app.
        world = build_tenant_world(
            max_capacity=1, with_application=True, application_status="submitted"
        )
        # The live submitted application fills the single seat.
        result = IntakeEnforcer.check_submission(
            world.intake.name, world.offering.name
        )

        assert result.allowed is False
        assert result.code == "INTAKE_CAPACITY_REACHED"
        # Recoverable guidance: a clear, actionable message (not a raw error).
        assert result.message
        assert "capacity" in result.message.lower()


# ===========================================================================
# R8.7 — failed payment never produces a paid receipt
# ===========================================================================


@pytest.mark.django_db
class TestFailedPaymentNeverProducesReceipt:
    """R8.7: a failed payment never produces a paid receipt — neither the
    backend receipt generator nor the receipt API will yield one.

    **Validates: Requirements 8.7**
    """

    class _TaskStub:
        max_retries = 3

        class request:
            retries = 0

    def test_receipt_generation_skips_failed_payment(self):
        from apps.applications.tasks.pdf_generation import generate_payment_receipt_task

        world = build_tenant_world(application_status="submitted")
        application = world.application
        # The only payment on the application is FAILED.
        build_payment(application=application, status="failed", amount=Decimal("153.00"))

        # No broker in tests → run synchronously via .apply().
        generate_payment_receipt_task.apply(args=[str(application.id)])

        # No payment-receipt document was produced for the failed payment.
        assert not ApplicationDocument.objects.filter(
            application=application, document_type="payment_receipt"
        ).exists()

    def test_receipt_api_rejects_failed_payment(self):
        world = build_tenant_world(application_status="submitted")
        payment = build_payment(
            application=world.application, status="failed", amount=Decimal("153.00")
        )
        # The owning student requests a receipt for their failed payment.
        status_code, body = _capture(
            _client_for(world.student).get(f"/api/v1/payments/{payment.id}/receipt/")
        )

        assert status_code == 400, (status_code, body)
        assert body["success"] is False
        assert body["code"] == "RECEIPT_NOT_ELIGIBLE", body
        # No receipt number was minted for the failed payment.
        payment.refresh_from_db()
        assert not payment.receipt_number


# ===========================================================================
# R8.8 — anonymous public tracker leaks no PII
# ===========================================================================


@pytest.mark.django_db
class TestPublicTrackerLeaksNoPII:
    """R8.8: the anonymous public tracker exposes only the minimal status fields
    and never applicant PII (full name, NRC, phone, email, date of birth).

    **Validates: Requirements 8.8**
    """

    def test_public_tracker_exposes_no_pii(self):
        world = build_tenant_world(application_status="submitted")
        application = world.application
        # Give the application unmistakable PII so a leak would be obvious.
        Application.objects.filter(id=application.id).update(
            full_name="Jane Privacy Mwansa",
            nrc_number="998877/66/5",
            phone="+260955123456",
            email="jane.privacy@example.com",
        )
        application.refresh_from_db()

        # Anonymous client (no auth) tracks by application number.
        public = APIClient()
        status_code, body = _capture(
            public.get(f"/api/v1/applications/track/?code={application.application_number}")
        )

        assert status_code == 200, (status_code, body)
        assert body["success"] is True, body
        data = body["data"]

        # Whitelist: only the minimal, non-PII status fields are present.
        allowed_keys = {
            "application_number",
            "public_tracking_code",
            "status",
            "program",
            "intake",
            "institution",
            "created_at",
            "submitted_at",
        }
        assert set(data.keys()) <= allowed_keys, set(data.keys()) - allowed_keys

        # No applicant PII appears anywhere in the serialized response.
        blob = str(body)
        assert application.full_name not in blob
        assert application.nrc_number not in blob
        assert application.phone not in blob
        assert application.email not in blob
        assert "2000-01-01" not in blob  # date_of_birth

    def test_public_tracker_unknown_code_is_not_found(self):
        """A valid-format but unknown code returns a clean not-found, leaking
        nothing about whether any application exists."""
        public = APIClient()
        status_code, body = _capture(
            public.get("/api/v1/applications/track/?code=TRK-ABCDEF123456")
        )
        assert status_code == 404, (status_code, body)
        assert body["success"] is False
        assert body["code"] == "NOT_FOUND", body
