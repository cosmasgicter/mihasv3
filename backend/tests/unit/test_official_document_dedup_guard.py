"""Fingerprint-dedup drift guard for the official-document generator (task 40.2).

Spec: ``multi-tenant-beanola-remediation`` — Phase 11 (Drift guards),
Requirement 18.2.

R18.2 (verbatim):

    THE test suite SHALL include a guard that fails IF an official-document
    endpoint, given a request whose Document_Fingerprint equals that of an
    existing Official_Document, produces more than one persisted
    Official_Document record for that fingerprint instead of returning the
    existing record, where the guard reports the duplicated fingerprint on
    failure.

This guard drives the real generator
(``pdf_generation._generate_official_document_task`` via the public
``generate_*`` Celery task entrypoints) end-to-end against the test DB with an
in-memory storage backend, then:

* generates an Official_Document for an ``(application, document_type)``,
* generates it AGAIN with unchanged inputs (so the Document_Fingerprint is
  unchanged), and
* FAILS if more than one persisted, non-deleted ``system_generated``
  ``ApplicationDocument`` exists for that ``(application, document_type)`` —
  reporting the duplicated fingerprint in the assertion message (R18.2).

It exercises two surfaces:

* ``application_slip`` — no Institution_Document_Profile required.
* ``acceptance_letter`` — profile-driven (R8.9); an active institution-default
  profile is seeded so the success path runs.

To prove the guard is not trivially always-true (i.e. that the generator really
can create a second record when inputs change), it also asserts that perturbing
a fingerprint input (the application's ``updated_at``) DOES create a second,
distinct Current_Official_Version.

The Current_Official_Version derivation mirrors the design (R6.7): the latest
non-deleted ``system_generated`` document by ``uploaded_at`` desc.

**Validates: Requirements 18.2** (with R6.2 reuse / R6.3 supersede behaviour).
"""

from __future__ import annotations

import io
import json
import uuid
from contextlib import contextmanager
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone

from apps.applications.tasks import (
    generate_acceptance_letter_task,
    generate_application_slip_task,
)
from apps.catalog.models import InstitutionDocumentProfile
from apps.documents.models import ApplicationDocument
from tests.tenant_fixtures import build_tenant_world

pytestmark = pytest.mark.tenant


# Profile-required document types (R8.9): with no active
# Institution_Document_Profile the render fails and produces no document. The
# guard exercises the *success* path, so these types need a seeded profile.
_PROFILE_REQUIRED = {"acceptance_letter", "conditional_offer"}

# Document types exercised by the guard and the application status each one
# requires (``DOCUMENT_CONFIG[...]["status_required"]``) so generation is never
# skipped by the status gate.
_DOC_TASKS = {
    "application_slip": (generate_application_slip_task, "submitted"),
    "acceptance_letter": (generate_acceptance_letter_task, "approved"),
}


# ---------------------------------------------------------------------------
# In-memory storage so the renderer never reaches real R2/S3 (mirrors the
# lifecycle property test's ``_fake_storage`` seam).
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


# ---------------------------------------------------------------------------
# Helpers — Current_Official_Version derivation + fingerprint extraction.
# ---------------------------------------------------------------------------


def _system_docs(application, document_type):
    return ApplicationDocument.objects.filter(
        application=application,
        document_type=document_type,
        system_generated=True,
    )


def _non_deleted(application, document_type):
    return _system_docs(application, document_type).exclude(verification_status="deleted")


def _current_official_version(application, document_type):
    """Latest non-deleted ``system_generated`` doc by ``uploaded_at`` desc (R6.7)."""
    return _non_deleted(application, document_type).order_by("-uploaded_at").first()


def _stored_fingerprint(document) -> str | None:
    """Read ``verification_notes.official_document.fingerprint`` (or ``None``)."""
    raw = getattr(document, "verification_notes", None)
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if not isinstance(parsed, dict):
        return None
    official = parsed.get("official_document")
    if not isinstance(official, dict):
        return None
    fingerprint = official.get("fingerprint")
    return fingerprint if isinstance(fingerprint, str) else None


def _fingerprints(application, document_type) -> list[str]:
    return [
        fp
        for fp in (
            _stored_fingerprint(doc) for doc in _non_deleted(application, document_type)
        )
        if fp is not None
    ]


def _generate(document_type: str, application) -> None:
    task, _status = _DOC_TASKS[document_type]
    with _fake_storage():
        task(str(application.id))


def _seed_profile(institution, document_type: str) -> InstitutionDocumentProfile:
    """Persist an institution-default active profile so a profile-required
    document type renders rather than failing with
    DOCUMENT_PROFILE_NOT_CONFIGURED (R8.9)."""
    now = timezone.now()
    return InstitutionDocumentProfile.objects.create(
        id=uuid.uuid4(),
        institution=institution,
        document_type=document_type,
        program=None,
        canonical_program=None,
        intake=None,
        layout_key="fee_chart_letter",
        sections={"body": "Profile-driven body text"},
        fee_chart=[],
        bank_accounts=[],
        requirements=[],
        signatory={"name": "Registrar", "role": "Admissions"},
        version=1,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def _build_world(document_type: str):
    _task, required_status = _DOC_TASKS[document_type]
    world = build_tenant_world(application_status=required_status)
    if document_type in _PROFILE_REQUIRED:
        _seed_profile(world.institution, document_type)
    return world


# ===========================================================================
# The guard: unchanged fingerprint → no duplicate persisted record.
# ===========================================================================


@pytest.mark.django_db
class TestOfficialDocumentDedupGuard:
    """R18.2 fingerprint-dedup guard.

    Repeated official-document generation with unchanged inputs must NOT create
    a second persisted Official_Document record for the unchanged
    Document_Fingerprint; the existing record is returned instead.

    **Validates: Requirements 18.2**
    """

    @pytest.mark.parametrize("document_type", sorted(_DOC_TASKS))
    def test_unchanged_fingerprint_produces_no_duplicate_record(self, document_type):
        world = _build_world(document_type)
        application = world.application

        # First generation establishes the Current_Official_Version.
        _generate(document_type, application)
        first = _current_official_version(application, document_type)
        assert first is not None, (
            f"first generation produced no Official_Document for {document_type}"
        )
        baseline_fingerprint = _stored_fingerprint(first)
        assert baseline_fingerprint is not None, (
            "generated Official_Document stored no fingerprint in "
            "verification_notes.official_document"
        )

        # Generate AGAIN with unchanged inputs (same Document_Fingerprint).
        _generate(document_type, application)

        # R18.2: the duplicated fingerprint must yield exactly one persisted,
        # non-deleted system_generated record — the existing one is returned.
        persisted = list(_non_deleted(application, document_type))
        if len(persisted) > 1:
            duplicated = [
                fp for fp in _fingerprints(application, document_type)
                if fp == baseline_fingerprint
            ]
            pytest.fail(
                f"R18.2 dedup guard: official-document generation for "
                f"{document_type!r} produced {len(persisted)} persisted records "
                f"for an unchanged Document_Fingerprint "
                f"(duplicated fingerprint={baseline_fingerprint!r}; "
                f"all stored fingerprints={duplicated!r}). Expected the existing "
                f"record to be returned, not a new row."
            )

        current = _current_official_version(application, document_type)
        assert current is not None
        assert current.id == first.id, (
            "regeneration replaced the Current_Official_Version for an unchanged "
            "fingerprint instead of returning the existing record"
        )
        assert _stored_fingerprint(current) == baseline_fingerprint

    @pytest.mark.parametrize("document_type", sorted(_DOC_TASKS))
    def test_changed_fingerprint_creates_second_version(self, document_type):
        """Non-triviality check: the generator CAN create a second record when a
        fingerprint input actually changes, so the dedup guard above is a real
        assertion rather than always-true (R6.3)."""
        from apps.applications.models import Application

        world = _build_world(document_type)
        application = world.application

        _generate(document_type, application)
        first = _current_official_version(application, document_type)
        assert first is not None
        first_fingerprint = _stored_fingerprint(first)

        # Pin the first document clearly in the past so any newer document is
        # unambiguously the Current_Official_Version.
        ApplicationDocument.objects.filter(id=first.id).update(
            uploaded_at=timezone.now() - timedelta(hours=1)
        )

        # Perturb a fingerprint input (application updated_at, an R6.1 input).
        Application.objects.filter(id=application.id).update(
            updated_at=timezone.now() + timedelta(days=1)
        )

        _generate(document_type, application)

        persisted = list(_non_deleted(application, document_type))
        assert len(persisted) == 2, (
            "a changed fingerprint input did not create a second Official_Document "
            f"(found {len(persisted)} records for {document_type!r})"
        )
        current = _current_official_version(application, document_type)
        assert current is not None
        assert current.id != first.id, "changed input did not supersede the prior version"
        assert _stored_fingerprint(current) != first_fingerprint, (
            "changed input did not change the stored Document_Fingerprint"
        )
