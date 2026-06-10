"""Official-document deletion-protection tests (test-first, task 5.1).

Spec: ``multi-tenant-beanola-remediation`` — Phase 2 (Cross-tenant document
security), Requirement 4 (Official Document Deletion Protection).

These tests are written **before** the implementation change in task 5.2 (gate
``DocumentDeleteView.delete`` on ``system_generated`` + audit privileged
deletes). They encode the *target* behaviour:

  * a non-super-admin (student or school admin) cannot delete a
    ``system_generated=True`` Official_Document — the request is rejected with
    HTTP 403, ``success=false``, code ``OFFICIAL_DOCUMENT_IMMUTABLE``, and the
    document is **not** soft-deleted (R4.1);
  * a School_Staff user requesting deletion of a document outside their scope
    receives the byte-identical 404 not-found mask from the loader (R4.3);
  * a Super_Admin soft-deleting a ``system_generated`` Official_Document
    succeeds and writes an Audit_Event carrying only actor / document id /
    application id / document type / ``system_generated`` / institution id —
    never the document body, PII, or secrets (R4.4, R4.6);
  * a student deleting their own non-system draft document is allowed (R4.2);
  * every permitted delete only sets ``verification_status="deleted"`` and
    never hard-deletes the row (R4.5).

Against the *current* code (no ``system_generated`` guard, no audit write) the
following cases are expected to FAIL — that is correct for a test-first task and
is documented in the task report:

  * ``test_student_cannot_delete_system_generated_document`` — current code
    soft-deletes the system doc and returns 200 instead of 403;
  * ``test_school_admin_cannot_delete_system_generated_document`` (in-scope) —
    current code allows the admin to soft-delete it;
  * ``test_super_admin_soft_delete_system_doc_writes_audit`` — current code
    soft-deletes but writes no Audit_Event.

The already-passing cases on current code: the out-of-scope school-admin 404
mask (task 4.2 routed delete through ``_get_authorized_document``), the
permitted student draft delete, and the soft-delete-not-hard-delete invariant
for permitted deletes.

Scope is computed through ``AccessScopeService`` (via the
``_get_authorized_document`` loader), never on the ``admin`` role alone.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**
"""

from __future__ import annotations

import json

import pytest
from rest_framework.test import APIClient

from apps.accounts.authentication import JWTUser
from apps.applications.models import Application
from apps.common.models import AuditLog
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


def _delete_url(document_id) -> str:
    return f"/api/v1/documents/{document_id}/delete/"


def _delete(client: APIClient, document_id):
    return client.delete(_delete_url(document_id))


def _body(response):
    try:
        return response.json()
    except Exception:  # pragma: no cover - non-JSON body
        return getattr(response, "data", None)


def _build_official_document(application):
    """Persist a ``system_generated=True`` Official_Document for ``application``.

    Carries a file URL, extracted text, and provenance notes so the audit
    PII/secret-exclusion assertions (R4.6) have real sensitive content to prove
    is *not* leaked into the Audit_Event.
    """
    return build_document(
        application=application,
        document_type="acceptance_letter",
        document_name="acceptance-letter.pdf",
        system_generated=True,
        verification_status="verified",
        file_url="https://r2.example/official/acceptance-letter-secret-key.pdf",
        extracted_text="OFFICIAL LETTER BODY — confidential applicant content",
        verification_notes=json.dumps(
            {"official_document": {"fingerprint": "abc123", "template_version": 1}}
        ),
    )


# ---------------------------------------------------------------------------
# Example-based deletion-protection cases (Requirement 4.1–4.6)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestOfficialDocumentDeletionProtection:
    """``DocumentDeleteView`` protects official documents from deletion.

    **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**
    """

    def test_student_cannot_delete_system_generated_document(self):
        """R4.1: a student deleting a ``system_generated`` document is rejected
        with 403 ``OFFICIAL_DOCUMENT_IMMUTABLE`` and the doc is not soft-deleted."""
        world = build_tenant_world()
        document = _build_official_document(world.application)
        before_status = document.verification_status

        response = _delete(_client_for(world.student), document.id)

        assert response.status_code == 403, _body(response)
        body = _body(response)
        assert body["success"] is False, body
        assert body["code"] == "OFFICIAL_DOCUMENT_IMMUTABLE", body

        # Not soft-deleted: the document state is unchanged.
        document.refresh_from_db()
        assert document.verification_status == before_status
        assert document.verification_status != "deleted"

    def test_school_admin_cannot_delete_system_generated_document(self):
        """R4.1: an in-scope School_Staff admin (not super-admin) deleting a
        ``system_generated`` document is rejected with 403
        ``OFFICIAL_DOCUMENT_IMMUTABLE`` and the doc is not soft-deleted."""
        world = build_tenant_world(staff_role="admin")
        document = _build_official_document(world.application)
        before_status = document.verification_status

        response = _delete(_client_for(world.staff), document.id)

        assert response.status_code == 403, _body(response)
        body = _body(response)
        assert body["success"] is False, body
        assert body["code"] == "OFFICIAL_DOCUMENT_IMMUTABLE", body

        document.refresh_from_db()
        assert document.verification_status == before_status
        assert document.verification_status != "deleted"

    def test_out_of_scope_admin_masks_as_not_found(self):
        """R4.3: a School A admin deleting a School B document receives the 404
        not-found mask byte-identical to a genuine not-found, and the document
        is not soft-deleted."""
        world_a, world_b = build_two_tenant_worlds()
        document_b = _build_official_document(world_b.application)
        before_status = document_b.verification_status
        client = _client_for(world_a.staff)

        # Genuine not-found baseline for the *same* actor.
        missing_response = _delete(client, _MISSING_ID)
        # Out-of-scope request: School B's real document.
        oos_response = _delete(client, document_b.id)

        assert oos_response.status_code == 404, _body(oos_response)
        assert oos_response.status_code == missing_response.status_code
        assert _body(oos_response) == _body(missing_response), {
            "out_of_scope": _body(oos_response),
            "missing": _body(missing_response),
        }
        assert _body(oos_response)["success"] is False

        # No document state mutated out of scope.
        document_b.refresh_from_db()
        assert document_b.verification_status == before_status
        assert document_b.verification_status != "deleted"

    def test_super_admin_soft_delete_system_doc_writes_audit(self):
        """R4.4/R4.6: a super-admin soft-deletes a ``system_generated``
        Official_Document; the delete succeeds and writes an Audit_Event
        recording actor / document id / application id / document type /
        ``system_generated`` / institution id and excluding the document body,
        PII, and secrets."""
        world = build_tenant_world()
        document = _build_official_document(world.application)
        super_admin = build_profile(role="super_admin")

        before_audit_ids = set(AuditLog.objects.values_list("id", flat=True))

        response = _delete(_client_for(super_admin), document.id)

        assert response.status_code == 200, _body(response)
        assert _body(response)["success"] is True

        # The soft-delete completed (R4.5) — never a hard-delete.
        document.refresh_from_db()
        assert document.verification_status == "deleted"
        assert ApplicationDocument.objects.filter(id=document.id).exists()

        # Exactly one new Audit_Event was written for the privileged deletion.
        new_audits = list(AuditLog.objects.exclude(id__in=before_audit_ids))
        assert len(new_audits) >= 1, "a privileged official-document delete must be audited"
        # Identify the deletion audit referencing this document/application.
        deletion_audits = [
            a
            for a in new_audits
            if str(a.entity_id) in {str(document.id), str(world.application.id)}
        ]
        assert deletion_audits, {
            "expected_entity_ids": [str(document.id), str(world.application.id)],
            "new_audits": [(a.action, str(a.entity_id)) for a in new_audits],
        }
        audit = deletion_audits[0]

        # Actor is recorded.
        assert str(audit.actor_id) == str(super_admin.id), audit.actor_id

        changes = audit.changes or {}
        serialized = json.dumps(changes, default=str)

        # Required non-PII identifiers are present (R4.4).
        assert str(document.id) in serialized, changes
        assert str(world.application.id) in serialized, changes
        assert "acceptance_letter" in serialized, changes
        assert str(world.institution.id) in serialized, changes
        # The ``system_generated`` flag is recorded.
        assert "system_generated" in serialized, changes

        # No document body, PII, or secrets leak into the audit payload (R4.6).
        forbidden_substrings = [
            "OFFICIAL LETTER BODY",  # document body / extracted text
            "confidential applicant content",
            "acceptance-letter-secret-key",  # file URL / storage secret
            world.application.nrc_number,  # applicant PII
            world.application.full_name,
            world.application.phone,
            world.application.email,
        ]
        for needle in forbidden_substrings:
            assert needle and needle not in serialized, (needle, changes)

    def test_student_can_delete_own_non_system_draft_document(self):
        """R4.2: a student deleting their own non-system-generated document is
        allowed while the application is in an editable (draft) status."""
        world = build_tenant_world(application_status="draft")
        document = build_document(
            application=world.application,
            document_type="result_slip",
            system_generated=False,
            verification_status="pending",
        )

        response = _delete(_client_for(world.student), document.id)

        assert response.status_code == 200, _body(response)
        assert _body(response)["success"] is True

        # Permitted delete only sets ``verification_status="deleted"`` (R4.5).
        document.refresh_from_db()
        assert document.verification_status == "deleted"
        assert ApplicationDocument.objects.filter(id=document.id).exists()

    def test_permitted_delete_is_soft_delete_never_hard_delete(self):
        """R4.5: a permitted deletion only sets ``verification_status="deleted"``
        and never removes the ``ApplicationDocument`` row."""
        world = build_tenant_world(application_status="draft")
        document = build_document(
            application=world.application,
            document_type="result_slip",
            system_generated=False,
        )

        response = _delete(_client_for(world.student), document.id)

        assert response.status_code == 200, _body(response)

        # Row still present; only the soft-delete marker changed.
        assert ApplicationDocument.objects.filter(id=document.id).exists()
        document.refresh_from_db()
        assert document.verification_status == "deleted"
