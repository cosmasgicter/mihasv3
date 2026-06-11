"""Cross-surface out-of-scope masking property test (task 9.1).

Spec: ``multi-tenant-beanola-remediation`` — Phase 3 (Official-document
consolidation), Requirements 3.3, 3.6, 4.3, 5.6, 5.8.

This file implements exactly one property (Property 13) against the three
document surfaces that an out-of-scope requester might probe to infer the
existence of another tenant's application/document:

  1. OCR extract       — ``POST   /api/v1/documents/{id}/extract/``
                         (``DocumentExtractView`` → ``_get_authorized_document``)
  2. Official document — ``POST``/``GET``
                         ``/api/v1/applications/{id}/official-documents/{document_type}/``
                         (``official_document_views`` → ``_get_authorized_application``)
  3. Delete            — ``DELETE /api/v1/documents/{id}/delete/``
                         (``DocumentDeleteView`` → ``_get_authorized_document``)

For an out-of-scope requester (school staff outside their scope, or a
non-owning student), every one of those surfaces must return a 404 response
**byte-identical** to the genuine not-found baseline for that *same* actor — so
existence cannot be inferred — **and** enqueue no Celery task **and** mutate no
document/application state. The masking baseline shape is
``{"success": false, "error": "Document not found", "code": "NOT_FOUND"}`` at
HTTP 404 (``_document_not_found_response`` / ``_not_found_response``).

**Validates: Requirements 3.3, 3.6, 4.3, 5.6, 5.8**
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
from django.test import override_settings
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.documents.models import ApplicationDocument
from tests.tenant_fixtures import (
    build_document,
    build_profile,
    build_tenant_world,
    build_two_tenant_worlds,
)

# A syntactically-valid UUID that never matches a real row → the genuine
# not-found baseline the out-of-scope responses are compared against. Reused
# for both the document-id surfaces (extract/delete) and the application-id
# surface (official documents).
_MISSING_ID = "00000000-0000-4000-8000-000000000000"

# Patch targets. The OCR view does ``from apps.documents.tasks import
# extract_document_text_task`` then ``extract_document_text_task.delay(...)`` —
# patching the symbol on its home module covers the late import. The
# official-document POST surface enqueues its renderer through the module-level
# ``_enqueue_generation`` helper, so patching that asserts no generation task is
# dispatched for an out-of-scope request.
_OCR_TASK_PATH = "apps.documents.tasks.extract_document_text_task"
_GENERATION_ENQUEUE_PATH = "apps.applications.official_document_views._enqueue_generation"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client_for(profile) -> APIClient:
    """An APIClient authenticated as ``profile`` via a JWTUser (no DB session)."""
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


def _extract_url(document_id) -> str:
    return f"/api/v1/documents/{document_id}/extract/"


def _delete_url(document_id) -> str:
    return f"/api/v1/documents/{document_id}/delete/"


def _official_url(application_id, document_type) -> str:
    return f"/api/v1/applications/{application_id}/official-documents/{document_type}/"


def _body(response):
    try:
        return response.json()
    except Exception:  # pragma: no cover - non-JSON body
        return getattr(response, "data", None)


def _assert_masked(response, baseline) -> None:
    """The response is the 404 not-found mask, byte-identical to ``baseline``."""
    assert response.status_code == 404, _body(response)
    assert response.status_code == baseline.status_code, {
        "response": response.status_code,
        "baseline": baseline.status_code,
    }
    # Byte-identical masking: same status code, error, and code — out-of-scope
    # access is indistinguishable from a genuine not-found (Property 13).
    assert _body(response) == _body(baseline), {
        "out_of_scope": _body(response),
        "missing": _body(baseline),
    }
    assert _body(response)["success"] is False, _body(response)
    assert _body(response)["code"] == "NOT_FOUND", _body(response)


# ≥100 examples is the spec convention (success pinned to
# ``--hypothesis-seed=0``). Every example builds two full tenant graphs and
# issues ten HTTP requests across three surfaces, so the run is DB-heavy; the
# deadline is relaxed and the per-example fixture build is exempt from the
# function-scoped-fixture / data-too-large health checks (same pattern as the
# deletion + gating properties in this spec). The input space (2 actor kinds ×
# 4 document types × 4 application statuses = 32 combinations) is well covered.
_ISOLATION_PROPERTY_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.data_too_large,
    ],
)

# Two out-of-scope requester kinds: school staff outside their scope, and a
# non-owning student. Both must be masked as not-found on every surface.
_ACTOR_KIND = st.sampled_from(["out_of_scope_admin", "non_owning_student"])

# Official-document types subject to the student gate / scope mask (R5.x).
_DOCUMENT_TYPE = st.sampled_from(
    ["application_slip", "acceptance_letter", "conditional_offer", "payment_receipt"]
)

# Parent-application statuses. Masking must hold regardless of status (the scope
# check fires before any gate), so varying this both proves that invariant and
# widens the input space.
_APPLICATION_STATUS = st.sampled_from(["draft", "submitted", "conditionally_approved", "approved"])


@pytest.mark.django_db
class TestCrossSurfaceMaskingProperty:
    # Feature: multi-tenant-beanola-remediation, Property 13: Out-of-scope document access is indistinguishable from not-found
    """Property 13: Out-of-scope document access is indistinguishable from not-found.

    For an out-of-scope requester (school staff outside scope, or a non-owning
    student), each of the three document surfaces — OCR extract, official
    document (POST + GET), and delete — returns a 404 response byte-identical to
    the genuine not-found baseline for that same actor (same status, error, and
    code), enqueues no Celery task, and mutates no document/application state.

    **Validates: Requirements 3.3, 3.6, 4.3, 5.6, 5.8**
    """

    @override_settings(RATELIMIT_ENABLE=False)
    @_ISOLATION_PROPERTY_SETTINGS
    @given(
        actor_kind=_ACTOR_KIND,
        document_type=_DOCUMENT_TYPE,
        application_status=_APPLICATION_STATUS,
    )
    def test_out_of_scope_access_masks_as_not_found(
        self, actor_kind, document_type, application_status
    ):
        # --- Build the tenant graph + out-of-scope actor for this example ---
        if actor_kind == "out_of_scope_admin":
            world_a, world_b = build_two_tenant_worlds(
                staff_role="admin", application_status=application_status
            )
            application = world_b.application
            actor = world_a.staff  # School A admin probing a School B resource
        else:  # non_owning_student
            world = build_tenant_world(application_status=application_status)
            application = world.application
            actor = build_profile(role="student")  # not the owner

        # A real uploaded document on the target (out-of-scope) application —
        # the resource the extract and delete surfaces are asked to act on.
        document = build_document(application=application)

        before_doc_status = document.verification_status
        before_app_status = application.status
        before_doc_count = ApplicationDocument.objects.filter(
            application_id=application.id
        ).count()

        client = _client_for(actor)

        with patch(_OCR_TASK_PATH) as ocr_task, patch(_GENERATION_ENQUEUE_PATH) as gen_enqueue:
            ocr_task.delay.return_value = MagicMock(id="task-" + uuid.uuid4().hex[:8])
            gen_enqueue.return_value = None

            # Surface 1 — OCR extract. Baseline first, then the out-of-scope hit.
            missing_extract = client.post(_extract_url(_MISSING_ID), data={}, format="json")
            oos_extract = client.post(_extract_url(document.id), data={}, format="json")

            # Surface 2 — Official document (POST generate + GET status).
            missing_off_post = client.post(_official_url(_MISSING_ID, document_type))
            oos_off_post = client.post(_official_url(application.id, document_type))
            missing_off_get = client.get(_official_url(_MISSING_ID, document_type))
            oos_off_get = client.get(_official_url(application.id, document_type))

            # Surface 3 — Delete. Baseline first, then the out-of-scope hit.
            missing_delete = client.delete(_delete_url(_MISSING_ID))
            oos_delete = client.delete(_delete_url(document.id))

        # --- No Celery task enqueued on any surface (R3.3, R5.6) -------------
        assert ocr_task.delay.call_count == 0, "no OCR task may be enqueued out of scope"
        assert gen_enqueue.call_count == 0, "no generation task may be enqueued out of scope"

        # --- Byte-identical 404 masking on every surface --------------------
        # OCR extract (R3.3, R3.6).
        _assert_masked(oos_extract, missing_extract)
        # Official document POST + GET (R5.6, R5.8).
        _assert_masked(oos_off_post, missing_off_post)
        _assert_masked(oos_off_get, missing_off_get)
        # Delete (R4.3).
        _assert_masked(oos_delete, missing_delete)

        # --- No document/application state mutated --------------------------
        document.refresh_from_db()
        assert document.verification_status == before_doc_status
        assert document.verification_status != "deleted"
        assert ApplicationDocument.objects.filter(id=document.id).exists()

        application.refresh_from_db()
        assert application.status == before_app_status

        # No new (official) document row was created by the generate surface.
        assert (
            ApplicationDocument.objects.filter(application_id=application.id).count()
            == before_doc_count
        )
