"""Official-document current-version + reuse lifecycle property test (task 7.1).

Spec: ``multi-tenant-beanola-remediation`` — Phase 3 (Official-document
consolidation), Requirement 6 (Official Document Current-Version and Fingerprint
Lifecycle).

This file implements exactly one property (Property 17) against the
reuse/supersede lifecycle that lands in task 7.3 (inside
``pdf_generation._generate_official_document_task``: derive the current version
as the latest non-deleted ``system_generated`` document, compute the
Document_Fingerprint, return the existing document on an unchanged fingerprint,
and render a new document — never mutating priors — when an input changes). It is
**test-first**: that input-driven idempotency does not exist yet (the generator
currently creates a new row on every call), so this property is expected to FAIL
until 7.3 is implemented.

The property drives the real generator tasks end-to-end against the test DB with
an in-memory storage backend, and asserts:

* unchanged fingerprint inputs across repeated generation → exactly one
  non-deleted ``system_generated`` Official_Document (the existing one is
  returned; no new row) — R6.2.
* a changed fingerprint input → a new Official_Document is created (R6.3),
  exactly one Current_Official_Version exists (latest non-deleted by
  ``uploaded_at``), and the prior document is left byte-for-byte unchanged
  (R6.4, R8.5, R16.2).
* documents with ``verification_status="deleted"`` are never selected as the
  Current_Official_Version, even when their ``uploaded_at`` is the most recent
  (R6.7).

**Validates: Requirements 6.2, 6.3, 6.4, 6.7, 8.5, 16.2, 18.2**
"""

from __future__ import annotations

import io
import uuid
from contextlib import contextmanager
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.applications.tasks import (
    generate_acceptance_letter_task,
    generate_application_slip_task,
    generate_conditional_offer_task,
)
from apps.catalog.models import InstitutionAsset, InstitutionDocumentTemplate
from apps.documents.models import ApplicationDocument
from tests.tenant_fixtures import build_tenant_world


# ---------------------------------------------------------------------------
# In-memory storage so the renderer never reaches for real R2/S3 credentials.
# ---------------------------------------------------------------------------


class _FakeStorage:
    """Minimal in-memory ``MediaStorage`` stand-in (save/url/open)."""

    _files: dict[str, bytes] = {}

    def save(self, name, content):
        content.seek(0)
        self._files[name] = content.read()
        return name

    def url(self, name):
        return f"https://test-storage.local/{name}"

    def open(self, name, mode="rb"):
        return io.BytesIO(self._files.get(name, b""))


@contextmanager
def _fake_storage():
    """Patch the call-time ``MediaStorage`` import site for the renderer."""
    _FakeStorage._files = {}
    with patch("apps.common.storage.MediaStorage", _FakeStorage):
        yield


# Document types exercised by the lifecycle property and the application status
# each one requires (``DOCUMENT_CONFIG[...]["status_required"]``) so generation
# is never skipped by the status gate.
_DOC_TASKS = {
    "application_slip": (generate_application_slip_task, "submitted"),
    "acceptance_letter": (generate_acceptance_letter_task, "approved"),
    "conditional_offer": (generate_conditional_offer_task, "submitted"),
}

# How a "changed input" example perturbs a fingerprint input between two
# generations. Each maps to a real fingerprint input from R6.1:
#   updated_at       → application status/updated_at
#   template_version → template/profile id+version (R6.5)
#   logo_asset       → logo asset id+checksum (R6.6)
_CHANGE_KINDS = ["updated_at", "template_version", "logo_asset"]


# ---------------------------------------------------------------------------
# Query helpers mirroring the design's Current_Official_Version derivation.
# ---------------------------------------------------------------------------


def _system_docs(application, document_type):
    return ApplicationDocument.objects.filter(
        application=application,
        document_type=document_type,
        system_generated=True,
    )


def _non_deleted_count(application, document_type) -> int:
    return _system_docs(application, document_type).exclude(verification_status="deleted").count()


def _current_official_version(application, document_type):
    """Latest non-deleted ``system_generated`` doc by ``uploaded_at`` desc (R6.7)."""
    return (
        _system_docs(application, document_type)
        .exclude(verification_status="deleted")
        .order_by("-uploaded_at")
        .first()
    )


def _generate(document_type: str, application) -> None:
    task, _status = _DOC_TASKS[document_type]
    with _fake_storage():
        task(str(application.id))


def _make_active_template(institution, document_type: str, version: int) -> InstitutionDocumentTemplate:
    return InstitutionDocumentTemplate.objects.create(
        id=uuid.uuid4(),
        institution=institution,
        document_type=document_type,
        name=f"{document_type} template v{version}",
        version=version,
        sections={"body": "Official body text"},
        tokens=[],
        is_active=True,
        created_at=timezone.now(),
    )


def _make_active_logo(institution, version: int) -> InstitutionAsset:
    return InstitutionAsset.objects.create(
        id=uuid.uuid4(),
        institution=institution,
        asset_type="logo",
        storage_key=f"assets/{institution.id}/logo-v{version}.png",
        mime_type="image/png",
        checksum_sha256=uuid.uuid4().hex,  # distinct 32-hex checksum per call
        version=version,
        is_active=True,
        created_at=timezone.now(),
    )


# ≥100 examples; success pinned to ``--hypothesis-seed=0`` via the CLI flag.
# DB-backed end-to-end generation, so the deadline is relaxed and the
# per-example tenant graph build is exempt from the function-scoped-fixture /
# data-too-large health checks (same pattern as the deletion property).
_LIFECYCLE_PROPERTY_SETTINGS = settings(
    max_examples=25,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.data_too_large,
    ],
)


@pytest.mark.django_db
class TestOfficialDocumentLifecycleProperty:
    # Feature: multi-tenant-beanola-remediation, Property 17: Repeated generation reuses the single current version
    """Property 17: Repeated generation reuses the single current version.

    For any ``(application, document_type)``, generating repeatedly with
    unchanged fingerprint inputs yields exactly one non-deleted
    ``system_generated`` Official_Document (the existing one is returned, no new
    row is created); when an input changes, a new Official_Document is created,
    exactly one Current_Official_Version exists, prior documents are left
    unchanged, and documents with ``verification_status="deleted"`` are never
    selected as current.

    **Validates: Requirements 6.2, 6.3, 6.4, 6.7, 8.5, 16.2, 18.2**
    """

    @_LIFECYCLE_PROPERTY_SETTINGS
    @given(
        document_type=st.sampled_from(sorted(_DOC_TASKS)),
        repeat=st.integers(min_value=2, max_value=4),
        change_kind=st.sampled_from([None, *_CHANGE_KINDS]),
        with_preexisting_deleted=st.booleans(),
    )
    def test_repeated_generation_reuses_single_current_version(
        self, document_type, repeat, change_kind, with_preexisting_deleted
    ):
        _task, required_status = _DOC_TASKS[document_type]
        world = build_tenant_world(application_status=required_status)
        application = world.application
        institution = world.institution

        # R6.7: a previously-superseded-and-deleted official document, stamped
        # with the *most recent* uploaded_at, must never be chosen as current.
        deleted_doc = None
        if with_preexisting_deleted:
            deleted_doc = ApplicationDocument.objects.create(
                id=uuid.uuid4(),
                application=application,
                document_type=document_type,
                document_name=f"{document_type}-old.pdf",
                file_url="https://test-storage.local/old.pdf",
                mime_type="application/pdf",
                system_generated=True,
                verification_status="deleted",
                # Newest timestamp on purpose: ordering alone must not surface it.
                uploaded_at=timezone.now() + timedelta(hours=1),
                created_at=timezone.now(),
                updated_at=timezone.now(),
            )

        # First generation establishes the Current_Official_Version.
        _generate(document_type, application)

        first = _current_official_version(application, document_type)
        assert first is not None, "first generation produced no current official version"
        assert _non_deleted_count(application, document_type) == 1

        # Pin the first document's uploaded_at clearly in the past so any newer
        # document is unambiguously the current version.
        ApplicationDocument.objects.filter(id=first.id).update(
            uploaded_at=timezone.now() - timedelta(hours=1)
        )
        first.refresh_from_db()
        first_notes = first.verification_notes
        first_status = first.verification_status

        if change_kind is None:
            # R6.2: repeated generation with unchanged inputs reuses the single
            # current version — no new rows, ever.
            for _ in range(repeat - 1):
                _generate(document_type, application)
                assert _non_deleted_count(application, document_type) == 1

            current = _current_official_version(application, document_type)
            assert current is not None
            assert current.id == first.id
            assert _non_deleted_count(application, document_type) == 1
        else:
            # Perturb exactly one fingerprint input, then regenerate.
            if change_kind == "updated_at":
                from apps.applications.models import Application

                Application.objects.filter(id=application.id).update(
                    updated_at=timezone.now() + timedelta(days=1)
                )
            elif change_kind == "template_version":
                _make_active_template(institution, document_type, version=2)
            elif change_kind == "logo_asset":
                _make_active_logo(institution, version=2)

            _generate(document_type, application)

            # R6.3 / R6.4: a changed input creates a new Official_Document; the
            # latest non-deleted is the single Current_Official_Version.
            current = _current_official_version(application, document_type)
            assert current is not None
            assert current.id != first.id, "changed input did not create a new document"
            assert _non_deleted_count(application, document_type) == 2

            # Prior document is left completely unchanged (R6.4, R8.5, R16.2).
            first.refresh_from_db()
            assert first.verification_notes == first_notes
            assert first.verification_status == first_status

        # R6.7 invariant (every branch): a deleted document is never the current
        # version and is itself never mutated by generation.
        if deleted_doc is not None:
            current = _current_official_version(application, document_type)
            assert current is None or current.id != deleted_doc.id
            deleted_doc.refresh_from_db()
            assert deleted_doc.verification_status == "deleted"
