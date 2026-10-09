"""Integration test — assignment/requirement dependency failure fails closed.

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task 5.2.
Requirements: R7.5, R11.6 · Findings: DATA-04, STU-13

Required_Evidence (task 5.2): *"dependency-failure integration test (proving
fail-closed retryable error, not empty requirements)"*.

When the canonical required-document configuration cannot be evaluated (a
dependency failure — e.g. the requirement store is unreachable), the platform
must NOT silently return an empty requirement list and let a create or a
submission proceed on an unverified configuration (the DATA-04 fail-open). It
must fail closed with a stable retryable ``CONFIGURATION_UNAVAILABLE`` (503).

These tests inject the failure by making the requirement resolver raise, and
assert the fail-closed behaviour at both the create endpoint and the submission
service — and that no application state advanced.

Runs entirely against the ephemeral Django test DB and the in-process DRF test
client (never Neon / production).

**Validates: Requirements R7.5, R11.6**
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.applications.services import ApplicationSubmissionError, submit_application
from tests.tenant_fixtures import build_document, build_grades, build_tenant_world

pytestmark = pytest.mark.django_db

# The single seam every canonical requirement resolution flows through
# (OfferingAssignmentService.required_documents). Patching it to raise models a
# requirement-store dependency failure.
_REQUIRED_DOCS = "apps.catalog.services.OfferingAssignmentService.required_documents"


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


def _make_submittable_world():
    """Draft world whose payment, identity-doc and canonical grade gates pass.

    The five persisted canonical grades satisfy the authoritative in-lock
    readiness gate added by task 6.5 (R11.5, STU-11) so these tests keep
    exercising only the configuration fail-closed behaviour.
    """
    world = build_tenant_world(application_status="draft")
    Application.objects.filter(id=world.application.id).update(payment_status="verified")
    world.application.refresh_from_db()
    build_document(application=world.application, document_type="nrc")
    build_grades(application=world.application, count=5)
    return world


class TestCreateEndpointFailsClosed:
    def test_create_returns_503_configuration_unavailable_not_empty_requirements(self):
        world = build_tenant_world(with_application=False)
        client = _student_client(world.student)
        payload = {
            "full_name": "Config Failure Applicant",
            "nrc_number": "123456/78/9",
            "date_of_birth": "2000-01-01",
            "sex": "female",
            "phone": "+260970000066",
            "email": "config-failure@example.com",
            "residence_town": "Lusaka",
            "country": "Zambia",
            "nationality": "Zambian",
            "program_id": world.canonical_program_id,
            "intake_id": world.intake_id,
        }

        before = Application.objects.count()
        with patch(_REQUIRED_DOCS, side_effect=RuntimeError("requirement store down")):
            response = client.post("/api/v1/applications/", payload, format="json")

        # Fail closed: a stable retryable 503, not a 201 with empty requirements.
        assert response.status_code == 503, (response.status_code, response.json())
        body = response.json()
        assert body["success"] is False
        assert body["code"] == "CONFIGURATION_UNAVAILABLE"
        assert body.get("retryable") is True
        # No application row was created on the failed configuration read.
        assert Application.objects.count() == before


class TestSubmissionFailsClosed:
    def test_submit_raises_configuration_unavailable_when_requirements_unevaluable(self):
        world = _make_submittable_world()

        with patch(_REQUIRED_DOCS, side_effect=RuntimeError("requirement store down")):
            with pytest.raises(ApplicationSubmissionError) as exc:
                submit_application(
                    application=world.application,
                    changed_by=str(world.student.id),
                )

        assert exc.value.code == "CONFIGURATION_UNAVAILABLE"
        assert exc.value.status_code == 503
        assert exc.value.retryable is True
        # Submission did not advance — the application stays a draft (fail closed,
        # not a silent success on an unverified configuration).
        world.application.refresh_from_db()
        assert world.application.status == "draft"

    def test_submit_uses_drift_free_snapshot_when_present(self):
        """A canonical app with a requirements snapshot submits from the snapshot
        and does not re-resolve — so a transient dependency blip cannot block it
        (the snapshot is the authoritative, drift-free requirement set)."""
        world = _make_submittable_world()
        # Simulate an assignment-time snapshot with no required documents.
        Application.objects.filter(id=world.application.id).update(requirements_snapshot=[])
        world.application.refresh_from_db()

        with patch(_REQUIRED_DOCS, side_effect=RuntimeError("should not be called")):
            submitted, old_status = submit_application(
                application=world.application,
                changed_by=str(world.student.id),
            )

        assert old_status == "draft"
        assert submitted.status == "submitted"

    def test_legacy_application_without_canonical_ids_is_not_blocked(self):
        """A legacy row without canonical IDs keeps the additive skip (no 503)."""
        world = build_tenant_world(application_status="draft", with_canonical_ids=False)
        Application.objects.filter(id=world.application.id).update(payment_status="verified")
        world.application.refresh_from_db()
        build_document(application=world.application, document_type="nrc")

        with patch(_REQUIRED_DOCS, side_effect=RuntimeError("must not be reached")):
            submitted, old_status = submit_application(
                application=world.application,
                changed_by=str(world.student.id),
            )

        assert old_status == "draft"
        assert submitted.status == "submitted"
