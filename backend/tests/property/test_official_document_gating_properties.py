"""Student official-document status-gating property test (task 8.1).

Spec: ``multi-tenant-beanola-remediation`` — Phase 3 (Official-document
consolidation), Requirement 5 (Student-Safe Official Document Endpoints).

This file implements exactly one property (Property 18) against the
student-safe official-document endpoints that land in task 8.2 (a new
``backend/apps/applications/official_document_views.py`` mounting):

    POST /api/v1/applications/{id}/official-documents/{document_type}/   generate/ensure current
    GET  /api/v1/applications/{id}/official-documents/                   list latest per type
    GET  /api/v1/applications/{id}/official-documents/{document_type}/   status + download_url

It is **test-first**: those views/routes do not exist yet, so this property is
expected to FAIL (the endpoints currently resolve to a framework 404 rather
than the gated success/mask envelopes) until 8.2 is implemented. The module is
written so it *collects* cleanly without importing the not-yet-existing views —
it only depends on shared tenant fixtures and the canonical
``RECEIPT_ELIGIBLE_STATUSES`` constant.

Property 18 pins the type gate enumerated in design.md §3a / R5.2–R5.5, plus the
404 not-found masking required for out-of-scope school staff (R5.6) and
not-permitted students (R5.8):

    application_slip   → permitted only in a non-draft submitted state   (R5.2)
    acceptance_letter  → permitted only when application is ``approved``  (R5.3)
    conditional_offer  → permitted only when ``conditionally_approved``   (R5.4)
    payment_receipt    → permitted only when a completed payment exists   (R5.5)

A student (owner) is permitted to generate/retrieve the Official_Document **iff**
the type's gate holds; when the gate does not hold, when the requester is not the
owner, or when a school-staff requester is out of scope, the system returns the
404 not-found envelope byte-identical to the genuine-not-found baseline, never
leaking the application's existence.

**Validates: Requirements 5.2, 5.3, 5.4, 5.5, 7.5**
"""

from __future__ import annotations

import pytest
from django.test import override_settings
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.documents.payment_constants import RECEIPT_ELIGIBLE_STATUSES
from tests.tenant_fixtures import (
    build_payment,
    build_profile,
    build_tenant_world,
    build_two_tenant_worlds,
)

# A syntactically-valid UUID that never matches a real application → the genuine
# not-found baseline that the masked responses are compared against.
_MISSING_ID = "00000000-0000-4000-8000-000000000000"

# The four official document types subject to a student status gate (R5.2–R5.5).
_DOCUMENT_TYPES = [
    "application_slip",
    "acceptance_letter",
    "conditional_offer",
    "payment_receipt",
]

# Application statuses spanning the full gate surface: ``draft`` (no slip),
# the non-draft submitted states, ``approved`` (acceptance gate), and
# ``conditionally_approved`` (conditional-offer gate). ``application_slip`` is
# permitted in every non-draft submitted state.
_APPLICATION_STATUSES = [
    "draft",
    "submitted",
    "under_review",
    "waitlisted",
    "conditionally_approved",
    "approved",
]

# A non-draft submitted state means the application has been submitted — i.e.
# anything except a still-editable ``draft`` (R5.2).
_NON_DRAFT_SUBMITTED_STATUSES = {
    "submitted",
    "under_review",
    "waitlisted",
    "conditionally_approved",
    "approved",
}

# Payment states the application may carry. A "completed payment" for the
# receipt gate (R5.5) is exactly a payment in the canonical
# ``RECEIPT_ELIGIBLE_STATUSES`` set; ``None`` models "no payment row at all".
_PAYMENT_STATES = [None, "successful", "force_approved", "pending", "failed"]

# Three student/staff actor kinds spanning the permitted owner path and the two
# 404-masking paths the property must also lock (R5.6, R5.8).
_ACTOR_KINDS = [
    "owning_student",  # owner — permitted iff the type gate holds
    "non_owning_student",  # not the owner → 404 mask regardless of gate (R5.8)
    "out_of_scope_staff",  # school staff outside scope → 404 mask (R5.6)
]


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


def _generate_url(application_id, document_type) -> str:
    return f"/api/v1/applications/{application_id}/official-documents/{document_type}/"


def _generate(client: APIClient, application_id, document_type):
    """POST the generate/ensure-current endpoint."""
    return client.post(_generate_url(application_id, document_type))


def _status(client: APIClient, application_id, document_type):
    """GET the status + download_url endpoint."""
    return client.get(_generate_url(application_id, document_type))


def _body(response):
    try:
        return response.json()
    except Exception:  # pragma: no cover - non-JSON body
        return getattr(response, "data", None)


def _is_permitted(response) -> bool:
    """A permitted official-document response: HTTP 2xx + ``success`` envelope (R5.1)."""
    body = _body(response)
    return (
        200 <= response.status_code < 300
        and isinstance(body, dict)
        and body.get("success") is True
    )


def _gate_holds(document_type: str, application_status: str, has_completed_payment: bool) -> bool:
    """The single source of truth for the student type gate (R5.2–R5.5)."""
    if document_type == "application_slip":
        return application_status in _NON_DRAFT_SUBMITTED_STATUSES
    if document_type == "acceptance_letter":
        return application_status == "approved"
    if document_type == "conditional_offer":
        return application_status == "conditionally_approved"
    if document_type == "payment_receipt":
        return has_completed_payment
    raise AssertionError(f"unexpected document type: {document_type!r}")


# ≥100 examples; success is pinned to ``--hypothesis-seed=0`` via the CLI flag.
# DB-backed (each example builds a tenant graph), so the deadline is relaxed and
# the per-example fixture build is exempt from the function-scoped-fixture /
# data-too-large health checks (same pattern as the deletion + lifecycle
# properties in this spec).
_GATING_PROPERTY_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.data_too_large,
    ],
)


def _no_throttle_rest_framework() -> dict:
    """Deprecated shim retained for import stability — see _RATELIMIT_OFF.

    The 429s in this property come from the django-ratelimit
    ``RateLimitMiddleware`` (coarse per-IP scope buckets), not DRF throttles,
    so disabling DRF throttle classes had no effect. The real lever is
    ``RATELIMIT_ENABLE=False`` applied via ``@override_settings`` on the test.
    """
    from django.conf import settings as dj_settings

    return dict(getattr(dj_settings, "REST_FRAMEWORK", {}))


@pytest.mark.django_db
class TestOfficialDocumentGatingProperty:
    # Feature: multi-tenant-beanola-remediation, Property 18: Student official-document status gating
    """Property 18: Student official-document status gating.

    For any application status, document type, and payment state, a student
    (owner) is permitted to generate/retrieve the Official_Document if and only
    if the type's gate holds: application_slip → a non-draft submitted status,
    acceptance_letter → ``approved``, conditional_offer →
    ``conditionally_approved``, payment_receipt → a completed payment exists.
    When the gate does not hold, when the requester is not the owner, or when a
    school-staff requester is out of scope, the generate and status endpoints
    return the 404 not-found envelope byte-identical to the genuine-not-found
    baseline for that same actor, never leaking the application's existence.

    **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 7.5**
    """

    @override_settings(RATELIMIT_ENABLE=False)
    @_GATING_PROPERTY_SETTINGS
    @given(
        actor_kind=st.sampled_from(_ACTOR_KINDS),
        document_type=st.sampled_from(_DOCUMENT_TYPES),
        application_status=st.sampled_from(_APPLICATION_STATUSES),
        payment_state=st.sampled_from(_PAYMENT_STATES),
    )
    def test_student_official_document_status_gating(
        self, actor_kind, document_type, application_status, payment_state
    ):
        # --- Build the tenant graph + actor for this example ----------------
        if actor_kind == "out_of_scope_staff":
            world_a, world_b = build_two_tenant_worlds(
                staff_role="admin", application_status=application_status
            )
            application = world_b.application
            actor = world_a.staff
        else:
            world = build_tenant_world(application_status=application_status)
            application = world.application
            if actor_kind == "owning_student":
                actor = world.student
            else:  # non_owning_student
                actor = build_profile(role="student")

        # Attach the payment that drives the receipt gate (R5.5). A completed
        # payment is exactly one in the canonical RECEIPT_ELIGIBLE_STATUSES set.
        if payment_state is not None:
            build_payment(application=application, status=payment_state)
        has_completed_payment = payment_state in RECEIPT_ELIGIBLE_STATUSES

        client = _client_for(actor)

        # Genuine not-found baseline for *this same actor* — the response the
        # masked cases must be byte-identical to so existence cannot be inferred.
        missing_generate = _generate(client, _MISSING_ID, document_type)
        missing_status = _status(client, _MISSING_ID, document_type)

        generate_response = _generate(client, application.id, document_type)
        status_response = _status(client, application.id, document_type)

        owner_gate_open = (
            actor_kind == "owning_student"
            and _gate_holds(document_type, application_status, has_completed_payment)
        )

        if owner_gate_open:
            # Permitted: owner + gate holds → 2xx success envelope on both the
            # generate and status endpoints (R5.1, R5.2–R5.5, R7.5).
            assert _is_permitted(generate_response), {
                "generate": _body(generate_response),
                "status_code": generate_response.status_code,
                "document_type": document_type,
                "application_status": application_status,
                "payment_state": payment_state,
            }
            assert _is_permitted(status_response), {
                "status": _body(status_response),
                "status_code": status_response.status_code,
            }
        else:
            # Not permitted — owner with the gate closed (R5.8), a non-owner
            # student (R5.8), or out-of-scope school staff (R5.6). Every such
            # response is the 404 not-found envelope, byte-identical to the
            # genuine-not-found baseline for the same actor: no existence leak.
            assert generate_response.status_code == 404, _body(generate_response)
            assert generate_response.status_code == missing_generate.status_code
            assert _body(generate_response) == _body(missing_generate), {
                "not_permitted": _body(generate_response),
                "missing": _body(missing_generate),
            }

            assert status_response.status_code == 404, _body(status_response)
            assert status_response.status_code == missing_status.status_code
            assert _body(status_response) == _body(missing_status), {
                "not_permitted": _body(status_response),
                "missing": _body(missing_status),
            }
