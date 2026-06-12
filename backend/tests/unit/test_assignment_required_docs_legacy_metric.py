"""Unit tests — R15.6 assigned required-document submission gate + R15.7 legacy
string-create metric.

Spec: ``multi-tenant-beanola-remediation`` — Phase 8, task 31.3.

R15.6 (verbatim): *"WHEN assignment succeeds, THE system SHALL expose the
assigned Offering's Required_Documents so the student upload UI reflects
school/offering/canonical-program requirements, and missing required documents
SHALL block submission per the assigned configuration."*

R15.7 (verbatim): *"WHEN the legacy string-create path (`program`, `intake`,
`institution` strings) is used, THE system SHALL record a warning/metric for
legacy-path usage while still functioning for backward compatibility."*

These tests build a real tenant object graph with the shared fixtures in
``backend/tests/tenant_fixtures.py`` and run against the test DB.

**Validates: Requirements R15.6, R15.7**
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.applications.services import (
    ApplicationSubmissionError,
    submit_application,
)
from apps.catalog.models import InstitutionRequiredDocument
from tests.tenant_fixtures import build_document, build_tenant_world

pytestmark = pytest.mark.django_db


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _student_client(student) -> APIClient:
    client = APIClient()
    client.force_authenticate(
        user=JWTUser(
            {
                "user_id": str(student.id),
                "email": student.email,
                "role": student.role,
                "first_name": student.first_name,
                "last_name": student.last_name,
                "token_type": "access",
            }
        )
    )
    return client


def _seed_required_document(world, *, document_type: str, label: str, **scope):
    """Persist an active institution-scoped required document for the world."""
    return InstitutionRequiredDocument.objects.create(
        id=uuid.uuid4(),
        institution=world.institution,
        document_type=document_type,
        label=label,
        is_required=True,
        is_active=True,
        **scope,
    )


def _make_submittable_world(**kwargs):
    """Draft tenant world whose payment + identity-doc gates already pass."""
    world = build_tenant_world(application_status="draft", **kwargs)
    Application.objects.filter(id=world.application.id).update(payment_status="verified")
    world.application.refresh_from_db()
    build_document(application=world.application, document_type="nrc")
    return world


# ---------------------------------------------------------------------------
# R15.6 — assigned-config required documents gate submission
# ---------------------------------------------------------------------------


class TestAssignedRequiredDocumentGate:
    """Missing assigned-config required documents block submission (R15.6)."""

    def test_submit_blocked_when_assigned_required_document_missing(self):
        """An institution-default required doc with no upload blocks submit."""
        world = _make_submittable_world()
        # NRC (identity) is uploaded by the helper; a transcript is also required
        # by the assigned configuration but is not uploaded.
        _seed_required_document(
            world, document_type="transcript", label="Academic Transcript"
        )

        with pytest.raises(ApplicationSubmissionError) as exc:
            submit_application(
                application=world.application,
                changed_by=str(world.student.id),
            )

        assert exc.value.code == "REQUIRED_DOCUMENT_MISSING"
        assert "Academic Transcript" in str(exc.value)
        world.application.refresh_from_db()
        assert world.application.status == "draft"

    def test_submit_succeeds_when_assigned_required_document_present(self):
        """Uploading the required doc satisfies the gate and submit proceeds."""
        world = _make_submittable_world()
        _seed_required_document(
            world, document_type="transcript", label="Academic Transcript"
        )
        build_document(application=world.application, document_type="transcript")

        submitted_app, old_status = submit_application(
            application=world.application,
            changed_by=str(world.student.id),
        )

        assert old_status == "draft"
        assert submitted_app.status == "submitted"

    def test_submit_succeeds_when_no_required_documents_configured(self):
        """No assigned required-document config → only the legacy identity gate."""
        world = _make_submittable_world()

        submitted_app, old_status = submit_application(
            application=world.application,
            changed_by=str(world.student.id),
        )

        assert old_status == "draft"
        assert submitted_app.status == "submitted"

    def test_admin_force_bypasses_required_document_gate(self):
        """admin_force=True bypasses the assigned required-document gate (R15.6
        gate sits behind the same admin-force escape as the identity gate)."""
        world = _make_submittable_world()
        _seed_required_document(
            world, document_type="transcript", label="Academic Transcript"
        )

        submitted_app, old_status = submit_application(
            application=world.application,
            changed_by=str(world.student.id),
            admin_force=True,
        )

        assert old_status == "draft"
        assert submitted_app.status == "submitted"

    def test_optional_assigned_document_does_not_block_submit(self):
        """A non-required (is_required=False) configured doc never blocks."""
        world = _make_submittable_world()
        InstitutionRequiredDocument.objects.create(
            id=uuid.uuid4(),
            institution=world.institution,
            document_type="transcript",
            label="Academic Transcript",
            is_required=False,
            is_active=True,
        )

        submitted_app, old_status = submit_application(
            application=world.application,
            changed_by=str(world.student.id),
        )

        assert submitted_app.status == "submitted"


# ---------------------------------------------------------------------------
# R15.7 — legacy string-create path emits legacy_string_create metric
# ---------------------------------------------------------------------------


class TestLegacyStringCreateMetric:
    """The legacy string-create path stays functional and emits a metric (R15.7)."""

    def _legacy_payload(self, world):
        return {
            "full_name": "Legacy Applicant",
            "nrc_number": "123456/78/9",
            "date_of_birth": "2000-01-01",
            "sex": "female",
            "phone": "+260970000099",
            "email": "legacy-applicant@example.com",
            "residence_town": "Lusaka",
            "country": "Zambia",
            "nationality": "Zambian",
            # Legacy display strings only — NO program_id / intake_id.
            "program": world.offering.name,
            "intake": world.intake.name,
            "institution": world.institution.name,
        }

    def test_legacy_create_emits_metric_and_still_creates(self):
        world = build_tenant_world(with_application=False)
        client = _student_client(world.student)

        with patch(
            "apps.applications.admin_review_views.emit_metric"
        ) as mock_emit:
            response = client.post(
                "/api/v1/applications/", self._legacy_payload(world), format="json"
            )

        assert response.status_code == 201, (response.status_code, response.json())
        body = response.json()
        assert body["success"] is True

        # Backward compatibility: the application is created from legacy strings
        # with NO canonical IDs.
        app = Application.objects.get(id=body["data"]["id"])
        assert app.canonical_program_id is None
        assert app.program_offering_id is None

        # R15.7: the legacy_string_create metric was emitted exactly once.
        legacy_calls = [
            c for c in mock_emit.call_args_list
            if c.args and c.args[0] == "legacy_string_create"
        ]
        assert len(legacy_calls) == 1, mock_emit.call_args_list
        # No PII in the metric labels — only role + a boolean.
        kwargs = legacy_calls[0].kwargs
        assert set(kwargs.keys()) <= {"actor_role", "has_institution"}

    def test_canonical_create_does_not_emit_legacy_metric(self):
        world = build_tenant_world(with_application=False)
        client = _student_client(world.student)
        payload = {
            "full_name": "Canonical Applicant",
            "nrc_number": "123456/78/9",
            "date_of_birth": "2000-01-01",
            "sex": "female",
            "phone": "+260970000098",
            "email": "canonical-applicant@example.com",
            "residence_town": "Lusaka",
            "country": "Zambia",
            "nationality": "Zambian",
            "program_id": world.canonical_program_id,
            "intake_id": world.intake_id,
        }

        with patch(
            "apps.applications.admin_review_views.emit_metric"
        ) as mock_emit:
            response = client.post("/api/v1/applications/", payload, format="json")

        assert response.status_code == 201, (response.status_code, response.json())
        legacy_calls = [
            c for c in mock_emit.call_args_list
            if c.args and c.args[0] == "legacy_string_create"
        ]
        assert legacy_calls == []
