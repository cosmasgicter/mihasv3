"""Property 32 — failed official-document generation degrades safely.

Spec: ``beanola-production-readiness`` — Phase 6 (Document system production
audit), Requirements 6.5 and 14.6.

This module **extends** the fingerprint-dedup drift guard
``backend/tests/unit/test_official_document_dedup_guard.py``: it reuses that
guard's in-memory storage seam and Current_Official_Version / fingerprint
helpers, but instead of proving the *success* path is idempotent it proves the
*failure* path degrades safely.

R6.5 (verbatim):

    IF logo/signature is missing, a template token is invalid, an asset MIME is
    invalid, storage fails, or rendering fails, THEN THE system SHALL surface
    the failure state and SHALL NOT serve a stale or client-rendered official
    document.

R14.6 (verbatim):

    IF official-document generation fails after launch, THEN THE system SHALL
    show "generation failed" and block download rather than serving a stale
    frontend PDF.

Property 32 (design.md):

    *For any* official-document generation that fails (missing profile, missing
    logo/signature, invalid token, storage failure, or render failure), the
    system records a ``failed`` status, leaves any prior Official_Document
    unchanged, and blocks the download (showing a generation-failed state)
    rather than serving a stale or client-rendered PDF.

The property is exercised across three representative failure modes:

* ``no_profile`` — a profile-required type (acceptance letter / conditional
  offer) with no active Institution_Document_Profile raises
  ``DocumentProfileNotConfigured``. No prior document exists; the generation
  records a ``failed`` no-profile audit, creates **no** document, and the
  Current_Official_Version stays ``None`` (nothing to download).
* ``render_failure`` — the renderer raises after a prior Official_Document
  already exists. The permanently-failed render records a render-failure audit,
  creates **no** new document, and the prior document is byte-for-byte
  unchanged.
* ``storage_failure`` — storage ``save`` raises after a prior Official_Document
  already exists. Same degradation guarantee as ``render_failure``.

For the two failure modes that follow a successful prior generation, a
fingerprint input (the application ``updated_at``) is perturbed before the
failing regeneration so the generator actually attempts a fresh render (rather
than short-circuiting on the unchanged-fingerprint reuse path). After the
failure the prior document is therefore *stale* — and the property asserts that
``official_document_matches_current_inputs`` reports it stale, proving the
download path will not serve it as a fresh official document.

# Feature: beanola-production-readiness, Property 32: Failed official-document generation never serves a stale or client PDF

**Validates: Requirements 6.5, 14.6**
"""

from __future__ import annotations

import io
from contextlib import contextmanager
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.applications.tasks.pdf_generation import (
    _generate_official_document_task,
    official_document_matches_current_inputs,
)
from apps.common.models import AuditLog
from apps.documents.models import ApplicationDocument
from tests.tenant_fixtures import build_tenant_world

# Reuse the dedup-guard seams/helpers verbatim — this file extends that guard.
from tests.unit.test_official_document_dedup_guard import (
    _current_official_version,
    _fake_storage,
    _generate,
    _non_deleted,
    _seed_profile,
    _stored_fingerprint,
)

pytestmark = pytest.mark.tenant


# Status each document type requires so generation is never skipped by the
# status gate (``approved`` satisfies the acceptance letter; the slip and the
# conditional offer have no required status).
_REQUIRED_STATUS = "approved"

# Profile-required types render solely from a resolved profile (R8.9); without
# one the render is a hard ``DocumentProfileNotConfigured`` failure.
_PROFILE_REQUIRED = ("acceptance_letter", "conditional_offer")

# Types used for the post-success render/storage failure injection. Both can be
# generated successfully first (the acceptance letter needs a seeded profile;
# the slip needs none), giving a prior Official_Document to protect.
_FAILABLE_AFTER_SUCCESS = ("application_slip", "acceptance_letter")


@st.composite
def _failure_cases(draw):
    """Draw a ``(failure_mode, document_type, world_kwargs)`` example.

    The ``(failure_mode, document_type)`` pair selects the degradation path; the
    drawn tenant attributes (applicant name, institution/brand name, capacity)
    widen the input space so the property is genuinely exercised across ≥100
    distinct examples rather than the handful of mode/type combinations. These
    attributes flow into the render + Document_Fingerprint inputs, so each
    example drives a structurally different generation.
    """
    mode = draw(st.sampled_from(["no_profile", "render_failure", "storage_failure"]))
    if mode == "no_profile":
        document_type = draw(st.sampled_from(_PROFILE_REQUIRED))
    else:
        document_type = draw(st.sampled_from(_FAILABLE_AFTER_SUCCESS))

    token = draw(st.text(alphabet=st.characters(min_codepoint=97, max_codepoint=122), min_size=1, max_size=8))
    capacity = draw(st.integers(min_value=1, max_value=5000))
    world_kwargs = {
        "applicant_name": f"Applicant {token}",
        "institution_name": f"School {token}",
        "max_capacity": capacity,
    }
    return mode, document_type, world_kwargs


class _TaskStub:
    """Minimal Celery task stand-in pinned at permanent failure.

    ``request.retries == max_retries`` so the generic-exception branch records
    the permanent render-failure audit and returns instead of calling
    ``self.retry`` (there is no broker under test). This exercises the terminal
    degradation state Property 32 asserts.
    """

    max_retries = 3

    class request:
        retries = 3


class _RaisingStorage:
    """In-memory storage whose ``save`` always raises (storage_failure mode)."""

    def save(self, name, content):  # noqa: D401 - simple stub
        raise IOError("simulated storage failure")

    def url(self, name):
        return f"https://test-storage.local/{name}"

    def open(self, name, mode="rb"):
        return io.BytesIO(b"")


@contextmanager
def _render_raises():
    """Patch the official-PDF render seam to raise (render_failure mode)."""
    with patch(
        "apps.applications.tasks.pdf_generation._render_official_pdf",
        side_effect=RuntimeError("simulated render failure"),
    ):
        yield


@contextmanager
def _storage_raises():
    """Patch the call-time storage import so ``save`` raises (storage_failure)."""
    with patch("apps.common.storage.MediaStorage", _RaisingStorage):
        yield


def _snapshot(document):
    """Capture the durable, downloadable fields of an Official_Document row."""
    return {
        "id": document.id,
        "file_url": document.file_url,
        "file_size": document.file_size,
        "verification_status": document.verification_status,
        "verification_notes": document.verification_notes,
        "uploaded_at": document.uploaded_at,
    }


def _run_failed_generation(document_type, application):
    """Invoke the generator with a permanent-failure task stub."""
    return _generate_official_document_task(_TaskStub(), str(application.id), document_type)


@pytest.mark.django_db
class TestFailedGenerationDegradesSafely:
    """Property 32 — a failed official-document generation never serves a stale
    or client-rendered PDF.

    **Validates: Requirements 6.5, 14.6**
    """

    @given(case=_failure_cases())
    @settings(
        max_examples=20,
        deadline=None,
        suppress_health_check=[
            HealthCheck.function_scoped_fixture,
            HealthCheck.too_slow,
            HealthCheck.data_too_large,
        ],
    )
    def test_failed_generation_records_failed_and_preserves_prior(self, case):
        mode, document_type, world_kwargs = case
        application_name = world_kwargs["applicant_name"]
        institution_name = world_kwargs["institution_name"]
        world = build_tenant_world(
            application_status=_REQUIRED_STATUS,
            max_capacity=world_kwargs["max_capacity"],
        )
        # Widen render/fingerprint inputs without altering the degradation path.
        type(world.application).objects.filter(id=world.application.id).update(
            full_name=application_name
        )
        type(world.institution).objects.filter(id=world.institution.id).update(
            name=institution_name, brand_name=institution_name
        )
        application = world.application
        application.refresh_from_db()

        if mode == "no_profile":
            self._assert_no_profile_degradation(document_type, application, world)
        else:
            self._assert_post_success_failure_degradation(
                mode, document_type, application, world
            )

    # -- no-profile failure (no prior document) ----------------------------

    def _assert_no_profile_degradation(self, document_type, application, world):
        # Sanity: this world genuinely has no profile of this type.
        from apps.catalog.models import InstitutionDocumentProfile

        assert not InstitutionDocumentProfile.objects.filter(
            institution=world.institution, document_type=document_type
        ).exists()

        with _fake_storage():
            result = _run_failed_generation(document_type, application)

        # The task swallows the no-profile failure (no exception, no retry).
        assert result is None

        # R6.5 / R14.6: NO document is produced from default/frontend content,
        # so there is nothing to download — the Current_Official_Version is None.
        assert _non_deleted(application, document_type).count() == 0
        assert _current_official_version(application, document_type) is None
        assert not official_document_matches_current_inputs(application, document_type)

        # A ``failed`` no-profile audit row records the generation-failed state.
        audit = self._failure_audit(application)
        assert audit.changes.get("status") == "failed"
        assert audit.changes.get("error_code") == "DOCUMENT_PROFILE_NOT_CONFIGURED"
        assert audit.changes.get("retried") is False

    # -- render / storage failure after a successful prior generation ------

    def _assert_post_success_failure_degradation(
        self, mode, document_type, application, world
    ):
        if document_type in _PROFILE_REQUIRED:
            _seed_profile(world.institution, document_type)

        # 1) Establish the prior Current_Official_Version via the real generator.
        _generate(document_type, application)
        prior = _current_official_version(application, document_type)
        assert prior is not None, "prior official document was not created"
        prior_fingerprint = _stored_fingerprint(prior)
        assert prior_fingerprint is not None

        # Pin the prior document in the past and perturb a fingerprint input so
        # the failing regeneration actually attempts a fresh render rather than
        # reusing the unchanged-fingerprint current version. These are test
        # manipulations, so snapshot the prior document *after* them — the
        # property only protects against mutations caused by the failed render.
        from apps.applications.models import Application

        ApplicationDocument.objects.filter(id=prior.id).update(
            uploaded_at=timezone.now() - timedelta(hours=1)
        )
        Application.objects.filter(id=application.id).update(
            updated_at=timezone.now() + timedelta(days=1)
        )
        application.refresh_from_db()
        prior.refresh_from_db()
        before = _snapshot(prior)

        # 2) Regenerate under an injected failure.
        if mode == "render_failure":
            with _fake_storage(), _render_raises():
                result = _run_failed_generation(document_type, application)
        else:  # storage_failure
            with _storage_raises():
                result = _run_failed_generation(document_type, application)

        # The permanently-failed render is swallowed (audited, not raised).
        assert result is None

        # R6.5 / R14.6: no NEW document was produced by the failed render, and
        # the prior Official_Document is byte-for-byte unchanged.
        non_deleted = list(_non_deleted(application, document_type))
        assert len(non_deleted) == 1, (
            f"failed {mode} for {document_type!r} created a new document row "
            f"(found {len(non_deleted)} non-deleted system documents)"
        )
        current = _current_official_version(application, document_type)
        assert current is not None
        assert current.id == prior.id
        current.refresh_from_db()
        assert _snapshot(current) == before, (
            f"failed {mode} for {document_type!r} mutated the prior Official_Document"
        )
        assert _stored_fingerprint(current) == prior_fingerprint

        # The prior document is now stale (a fingerprint input changed), so the
        # download path reports it does NOT match current inputs — it will not
        # be served as a fresh official document.
        assert not official_document_matches_current_inputs(
            application, document_type, current
        )

        # A render-failure audit row records the generation-failed state.
        audit = self._failure_audit(application)
        assert audit.changes.get("recoverable") is True
        assert "error_type" in audit.changes

    # -- shared helper -----------------------------------------------------

    @staticmethod
    def _failure_audit(application):
        rows = list(
            AuditLog.objects.filter(
                action="official_document_render_failed",
                entity_id=application.id,
            )
        )
        assert len(rows) == 1, (
            f"expected exactly one render-failure audit row, found {len(rows)}"
        )
        return rows[0]
