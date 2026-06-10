"""OCR extraction tenant-scope tests (test-first, task 4.1).

Spec: ``multi-tenant-beanola-remediation`` — Phase 2 (Cross-tenant document
security), Requirement 3 (OCR Extraction Tenant Scope).

These tests are written **before** the implementation change in task 4.2 (route
``DocumentExtractView.post`` through ``_get_authorized_document``). They encode
the *target* behaviour: the OCR extract endpoint must authorize the target
document through the shared scope path **before** any OCR task is enqueued and
before any document state is mutated, and out-of-scope reads must be
indistinguishable from a genuine not-found (no existence leak).

Against the *current* ownership-only code two cases are expected to fail — that
is correct for a test-first task and is documented in the task report:

  * a School A admin extracting a School B document currently passes the
    role-based shortcut (``role in ("admin", "super_admin")``), enqueues a task,
    and returns 202 instead of masking as 404; and
  * a non-owning student currently gets a 403 ``INSUFFICIENT_PERMISSIONS``
    instead of the 404 not-found mask.

The authorized paths (owning student, super-admin, in-scope School A admin) and
the "no task on a genuine not-found" case already hold on the current code.

Scope is computed through ``AccessScopeService`` (via the
``_get_authorized_document`` loader once task 4.2 lands), never on the ``admin``
role alone. Under ``config.settings.dev`` the legacy-admin all-access
compatibility branch is inactive (``_test_settings_active()`` is False), so an
``admin`` actor is genuinely scoped by membership/grant.

**Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.7**
(also exercises 3.3, 3.6, 3.8 — masking + no-role-shortcut)
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest
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

# A syntactically-valid UUID that never matches a real document → the genuine
# not-found baseline the out-of-scope responses are compared against.
_MISSING_ID = "00000000-0000-4000-8000-000000000000"

# Patch target: the view does ``from apps.documents.tasks import
# extract_document_text_task`` then ``extract_document_text_task.delay(...)``.
# Patching the symbol on its home module covers the late import.
_TASK_PATH = "apps.documents.tasks.extract_document_text_task"


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


def _post_extract(client: APIClient, document_id):
    """POST the extract endpoint with the task delay patched.

    Returns ``(response, delay_mock)`` so callers can assert both the HTTP
    response and exactly how many OCR tasks were enqueued.
    """
    with patch(_TASK_PATH) as task_mock:
        task_mock.delay.return_value = MagicMock(id="task-" + uuid.uuid4().hex[:8])
        response = client.post(_extract_url(document_id), data={}, format="json")
    return response, task_mock.delay


def _body(response):
    try:
        return response.json()
    except Exception:  # pragma: no cover - non-JSON body
        return getattr(response, "data", None)


# ---------------------------------------------------------------------------
# Example-based scope cases (Requirement 3.1–3.8)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOcrExtractScope:
    """The OCR extract endpoint authorizes before any side effect.

    **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**
    """

    def test_in_scope_admin_extracts_own_school_document_enqueues_one_task(self):
        """R3.4/R3.8: a School A admin extracting a School A document is
        authorized through scope and enqueues exactly one OCR task."""
        world = build_tenant_world()
        document = build_document(application=world.application)

        response, delay = _post_extract(_client_for(world.staff), document.id)

        assert response.status_code == 202, _body(response)
        body = _body(response)
        assert body["success"] is True, body
        assert body["data"]["status"] == "queued", body
        assert body["data"]["document_id"] == str(document.id), body
        assert delay.call_count == 1, "exactly one OCR task must be enqueued"

    def test_out_of_scope_admin_masks_as_not_found_and_enqueues_no_task(self):
        """R3.2/R3.3/R3.8: a School A admin extracting a School B document must
        receive a 404 not-found mask byte-identical to a genuine not-found, and
        must enqueue no OCR task and mutate no document state."""
        world_a, world_b = build_two_tenant_worlds()
        document_b = build_document(application=world_b.application)
        before_status = document_b.verification_status
        client = _client_for(world_a.staff)

        # Genuine not-found baseline for the *same* actor.
        missing_response, missing_delay = _post_extract(client, _MISSING_ID)
        # Out-of-scope request: School B's real document.
        oos_response, oos_delay = _post_extract(client, document_b.id)

        # No side effects on either the not-found or out-of-scope path.
        assert missing_delay.call_count == 0
        assert oos_delay.call_count == 0, "no OCR task may be enqueued out of scope"

        # Byte-identical masking: same status code, code, and message (R3.3).
        assert oos_response.status_code == 404, _body(oos_response)
        assert oos_response.status_code == missing_response.status_code
        assert _body(oos_response) == _body(missing_response), {
            "out_of_scope": _body(oos_response),
            "missing": _body(missing_response),
        }
        assert _body(oos_response)["success"] is False

        # No document state mutated.
        document_b.refresh_from_db()
        assert document_b.verification_status == before_status

    def test_super_admin_extracts_any_document_enqueues_one_task(self):
        """R3.4: a super-admin is authorized for any document and enqueues
        exactly one OCR task."""
        world = build_tenant_world()
        document = build_document(application=world.application)
        super_admin = build_profile(role="super_admin")

        response, delay = _post_extract(_client_for(super_admin), document.id)

        assert response.status_code == 202, _body(response)
        assert _body(response)["success"] is True
        assert delay.call_count == 1

    def test_owning_student_extracts_own_document_enqueues_one_task(self):
        """R3.5: a student extracting a document they own is authorized and
        enqueues exactly one OCR task."""
        world = build_tenant_world()
        document = build_document(application=world.application)

        response, delay = _post_extract(_client_for(world.student), document.id)

        assert response.status_code == 202, _body(response)
        assert _body(response)["success"] is True
        assert delay.call_count == 1

    def test_non_owning_student_masks_as_not_found_and_enqueues_no_task(self):
        """R3.6: a student extracting a document they do not own receives the
        404 not-found mask and enqueues no OCR task."""
        world = build_tenant_world()
        document = build_document(application=world.application)
        before_status = document.verification_status
        other_student = build_profile(role="student")
        client = _client_for(other_student)

        missing_response, missing_delay = _post_extract(client, _MISSING_ID)
        oos_response, oos_delay = _post_extract(client, document.id)

        assert missing_delay.call_count == 0
        assert oos_delay.call_count == 0, "no OCR task may be enqueued for a non-owner"

        assert oos_response.status_code == 404, _body(oos_response)
        assert _body(oos_response) == _body(missing_response), {
            "out_of_scope": _body(oos_response),
            "missing": _body(missing_response),
        }
        assert _body(oos_response)["success"] is False

        document.refresh_from_db()
        assert document.verification_status == before_status

    def test_genuine_not_found_enqueues_no_task(self):
        """R3.2: a genuine not-found returns the 404 ``{"success": false}``
        envelope and enqueues no OCR task (no side effect)."""
        world = build_tenant_world()

        response, delay = _post_extract(_client_for(world.student), _MISSING_ID)

        assert response.status_code == 404, _body(response)
        assert _body(response)["success"] is False
        assert _body(response)["code"] == "NOT_FOUND"
        assert delay.call_count == 0


# ---------------------------------------------------------------------------
# Property 14 — OCR extraction authorizes before any side effect
# ---------------------------------------------------------------------------

# ≥100 examples; success pinned to ``--hypothesis-seed=0`` via the CLI flag.
# DB-backed, so the deadline is relaxed and the per-example tenant graph build
# is exempt from the function-scoped-fixture health check.
_OCR_PROPERTY_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.data_too_large,
    ],
)

# Two authorized actor kinds (owning student, super-admin) and two unauthorized
# actor kinds (non-owning student, out-of-scope School A admin on a School B
# document). The mix gives the property a non-trivial input space.
_ACTOR_KIND = st.sampled_from(
    ["owning_student", "super_admin", "non_owning_student", "out_of_scope_admin"]
)


@pytest.mark.django_db
class TestOcrExtractAuthorizeBeforeSideEffectProperty:
    # Feature: multi-tenant-beanola-remediation, Property 14: OCR extraction authorizes before any side effect
    """Property 14: OCR extraction authorizes before any side effect.

    For any extract request, when authorization fails the view returns the
    authorization error unchanged and enqueues no OCR task and mutates no
    document state; when authorization succeeds for an owning student or
    super-admin, exactly one OCR task is enqueued.

    **Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.7**
    """

    @_OCR_PROPERTY_SETTINGS
    @given(actor_kind=_ACTOR_KIND)
    def test_authorize_before_side_effect(self, actor_kind):
        if actor_kind == "out_of_scope_admin":
            world_a, world_b = build_two_tenant_worlds()
            document = build_document(application=world_b.application)
            actor = world_a.staff
            authorized = False
        else:
            world = build_tenant_world()
            document = build_document(application=world.application)
            if actor_kind == "owning_student":
                actor = world.student
                authorized = True
            elif actor_kind == "super_admin":
                actor = build_profile(role="super_admin")
                authorized = True
            else:  # non_owning_student
                actor = build_profile(role="student")
                authorized = False

        before_status = document.verification_status
        client = _client_for(actor)
        response, delay = _post_extract(client, document.id)

        if authorized:
            # Exactly one OCR task is enqueued on the authorized path.
            assert response.status_code == 202, _body(response)
            assert _body(response)["success"] is True
            assert delay.call_count == 1
        else:
            # Authorization failed: no task enqueued, no state mutated, and the
            # response is the not-found mask (success=false), unchanged.
            assert delay.call_count == 0
            assert response.status_code == 404, _body(response)
            assert _body(response)["success"] is False
            document.refresh_from_db()
            assert document.verification_status == before_status
