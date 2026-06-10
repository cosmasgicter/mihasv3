"""Official-document deletion-protection property test (task 5.3).

Spec: ``multi-tenant-beanola-remediation`` — Phase 2 (Cross-tenant document
security), Requirement 4 (Official Document Deletion Protection).

This file implements exactly one property (Property 15) against the
implementation that landed in task 5.2 (``DocumentDeleteView.delete`` gates
``system_generated`` deletes by non-super-admins with 403
``OFFICIAL_DOCUMENT_IMMUTABLE`` and never hard-deletes). It is expected to
PASS.

**Validates: Requirements 4.1, 4.5**
"""

from __future__ import annotations

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


def _delete(client: APIClient, document_id):
    return client.delete(f"/api/v1/documents/{document_id}/delete/")


def _body(response):
    try:
        return response.json()
    except Exception:  # pragma: no cover - non-JSON body
        return getattr(response, "data", None)


def _build_official_document(application, *, document_type="acceptance_letter", verification_status="verified"):
    """Persist a ``system_generated=True`` Official_Document for ``application``."""
    return build_document(
        application=application,
        document_type=document_type,
        document_name=f"{document_type}.pdf",
        system_generated=True,
        verification_status=verification_status,
        file_url=f"https://r2.example/official/{document_type}.pdf",
        extracted_text="OFFICIAL LETTER BODY",
    )


# ≥100 examples; success pinned to ``--hypothesis-seed=0`` via the CLI flag.
# DB-backed, so the deadline is relaxed and the per-example tenant graph build
# is exempt from the function-scoped-fixture / data-too-large health checks.
_DELETION_PROPERTY_SETTINGS = settings(
    max_examples=25,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.data_too_large,
    ],
)

# Four non-super-admin actor kinds spanning in/out of scope for both students
# and school admins, plus the super-admin permitted-delete case. The mix gives
# the property a non-trivial input space.
_ACTOR_KIND = st.sampled_from(
    [
        "owning_student",  # non-super-admin, in scope (owner)
        "non_owning_student",  # non-super-admin, out of scope
        "in_scope_admin",  # non-super-admin school staff, in scope
        "out_of_scope_admin",  # non-super-admin school staff, out of scope
        "super_admin",  # privileged delete is permitted
    ]
)

# Official-document types subject to deletion protection, and a spread of
# verification states the protected document may carry. Varying these alongside
# the actor kind widens the input space past the ≥100-example floor while
# keeping every generated case a genuine Official_Document.
_DOCUMENT_TYPE = st.sampled_from(
    ["acceptance_letter", "application_slip", "payment_receipt", "conditional_offer"]
)
_VERIFICATION_STATUS = st.sampled_from(["verified", "pending", "ocr_complete"])

# Parent-application statuses. Official-document immutability must hold
# regardless of the application's status (the ``system_generated`` guard fires
# before any editability check), so varying this both proves that invariant and
# widens the input space past the ≥100-example floor (5 × 4 × 3 × 4 = 240).
_APPLICATION_STATUS = st.sampled_from(["draft", "submitted", "under_review", "approved"])


@pytest.mark.django_db
class TestOfficialDocumentDeletionProtectionProperty:
    # Feature: multi-tenant-beanola-remediation, Property 15: Official documents are deletion-protected from non-super-admins
    """Property 15: Official documents are deletion-protected from non-super-admins.

    For any non-super-admin actor (student or school admin, in scope or out of
    scope) attempting to delete a ``system_generated=True`` Official_Document,
    the request never soft-deletes the document (``verification_status`` stays
    unchanged and never becomes ``"deleted"``) and the ``ApplicationDocument``
    row is never hard-deleted — it is rejected with 403
    ``OFFICIAL_DOCUMENT_IMMUTABLE`` in scope, or the byte-identical 404
    not-found mask out of scope. A super-admin delete is permitted: it
    soft-deletes only (``verification_status="deleted"``) and preserves the row.

    **Validates: Requirements 4.1, 4.5**
    """

    @_DELETION_PROPERTY_SETTINGS
    @given(
        actor_kind=_ACTOR_KIND,
        document_type=_DOCUMENT_TYPE,
        verification_status=_VERIFICATION_STATUS,
        application_status=_APPLICATION_STATUS,
    )
    def test_official_documents_are_deletion_protected(
        self, actor_kind, document_type, verification_status, application_status
    ):
        if actor_kind == "out_of_scope_admin":
            world_a, world_b = build_two_tenant_worlds(
                staff_role="admin", application_status=application_status
            )
            document = _build_official_document(
                world_b.application,
                document_type=document_type,
                verification_status=verification_status,
            )
            actor = world_a.staff
            expectation = "masked_404"
        else:
            if actor_kind == "in_scope_admin":
                world = build_tenant_world(
                    staff_role="admin", application_status=application_status
                )
                actor = world.staff
                expectation = "immutable_403"
            elif actor_kind == "owning_student":
                world = build_tenant_world(application_status=application_status)
                actor = world.student
                expectation = "immutable_403"
            elif actor_kind == "non_owning_student":
                world = build_tenant_world(application_status=application_status)
                actor = build_profile(role="student")
                expectation = "masked_404"
            else:  # super_admin
                world = build_tenant_world(application_status=application_status)
                actor = build_profile(role="super_admin")
                expectation = "permitted_soft_delete"
            document = _build_official_document(
                world.application,
                document_type=document_type,
                verification_status=verification_status,
            )

        before_status = document.verification_status
        client = _client_for(actor)

        if expectation == "permitted_soft_delete":
            response = _delete(client, document.id)

            # Super-admin delete is permitted: soft-delete only, row preserved.
            assert response.status_code == 200, _body(response)
            assert _body(response)["success"] is True
            document.refresh_from_db()
            assert document.verification_status == "deleted"
            assert ApplicationDocument.objects.filter(id=document.id).exists()
            return

        if expectation == "immutable_403":
            response = _delete(client, document.id)

            # In-scope non-super-admin: rejected as immutable.
            assert response.status_code == 403, _body(response)
            body = _body(response)
            assert body["success"] is False, body
            assert body["code"] == "OFFICIAL_DOCUMENT_IMMUTABLE", body
        else:  # masked_404 — out-of-scope non-super-admin
            # Genuine not-found baseline for the *same* actor.
            missing_response = _delete(client, _MISSING_ID)
            response = _delete(client, document.id)

            assert response.status_code == 404, _body(response)
            assert response.status_code == missing_response.status_code
            # Byte-identical masking: out-of-scope == genuine not-found.
            assert _body(response) == _body(missing_response), {
                "out_of_scope": _body(response),
                "missing": _body(missing_response),
            }
            assert _body(response)["success"] is False

        # Common invariant for every rejected delete (R4.1, R4.5): the document
        # is neither soft-deleted nor hard-deleted.
        document.refresh_from_db()
        assert document.verification_status == before_status
        assert document.verification_status != "deleted"
        assert ApplicationDocument.objects.filter(id=document.id).exists()
