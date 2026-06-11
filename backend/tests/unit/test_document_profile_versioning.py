"""InstitutionDocumentProfile versioning + provenance tests (task 16.2).

Spec: ``multi-tenant-beanola-remediation`` — Phase 4 (Tenant document profiles),
Requirement 8.5 (Tenant Document Profiles versioning) with the provenance link
to Requirement 6.4 (supersede-never-mutate fingerprint lifecycle).

This file formalises and locks the ``InstitutionDocumentProfile`` versioning
contract that R8.5 / design.md Component 4 ("Versioning (R8.5)") describes:

    Creating a new profile version inserts a NEW row with ``version + 1``; prior
    versions are retained as readable records and are never altered, regenerated,
    or deleted. Fingerprint provenance preserves the producing version — a
    document generated from version N keeps ``profile_version=N`` even after
    version N+1 is created.

It covers, against the **test DB** (``managed = False`` tables created by the
session-scoped ``unmanaged_schema`` fixture in ``conftest.py``):

1. ``InstitutionDocumentProfileService.create_new_version`` inserts a row with
   ``version + 1`` for the scope and leaves every prior row present + readable
   (never UPDATE-in-place, never delete).
2. ``resolve`` returns the highest active version within the winning scope.
3. Deactivating / superseding an older version does not delete prior versions.
4. ``create_new_version`` validates the new payload via
   ``validate_profile_payload`` before inserting (a rejected payload persists
   nothing — the version count is unchanged).
5. A document generated from an earlier profile version keeps its
   ``profile_version`` provenance after a newer version is created and a new
   document is generated (R6.4 supersede-never-mutate + R8.5).

**Validates: Requirements R8.5, R6.4**
"""

from __future__ import annotations

import io
import json
import uuid
from contextlib import contextmanager
from unittest.mock import patch

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.applications.tasks import generate_acceptance_letter_task
from apps.catalog.models import InstitutionDocumentProfile
from apps.catalog.services import (
    InstitutionDocumentProfileService,
    TemplateValidationError,
)
from apps.documents.models import ApplicationDocument
from tests.tenant_fixtures import build_tenant_world

pytestmark = pytest.mark.tenant


_DOCUMENT_TYPE = "acceptance_letter"


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
# Helpers
# ---------------------------------------------------------------------------


def _make_institution_default_profile(
    institution,
    *,
    document_type: str = _DOCUMENT_TYPE,
    version: int = 1,
    is_active: bool = True,
    sections: dict | None = None,
) -> InstitutionDocumentProfile:
    """Persist an institution-default (no offering/canonical/intake) profile."""
    now = timezone.now()
    return InstitutionDocumentProfile.objects.create(
        id=uuid.uuid4(),
        institution=institution,
        document_type=document_type,
        program=None,
        canonical_program=None,
        intake=None,
        layout_key="fee_chart_letter",
        sections=sections if sections is not None else {"body": "Profile body v1."},
        fee_chart=[],
        bank_accounts=[],
        requirements=[],
        signatory={"name": "Registrar", "role": "Admissions"},
        version=version,
        is_active=is_active,
        created_at=now,
        updated_at=now,
    )


def _scope_count(profile: InstitutionDocumentProfile) -> int:
    return InstitutionDocumentProfile.objects.filter(
        institution_id=profile.institution_id,
        document_type=profile.document_type,
        program_id=profile.program_id,
        canonical_program_id=profile.canonical_program_id,
        intake_id=profile.intake_id,
    ).count()


def _generate_acceptance(application) -> None:
    with _fake_storage():
        generate_acceptance_letter_task(str(application.id))


def _current_acceptance_doc(application):
    return (
        ApplicationDocument.objects.filter(
            application=application,
            document_type=_DOCUMENT_TYPE,
            system_generated=True,
        )
        .exclude(verification_status="deleted")
        .order_by("-uploaded_at")
        .first()
    )


def _provenance(doc) -> dict:
    notes = json.loads(doc.verification_notes or "{}")
    return notes.get("official_document", {})


# ===========================================================================
# 1. create_new_version inserts version+1 and leaves priors readable
# ===========================================================================


@pytest.mark.django_db
class TestCreateNewVersion:
    """``InstitutionDocumentProfileService.create_new_version`` contract (R8.5).

    **Validates: Requirements R8.5**
    """

    def test_inserts_version_plus_one_and_retains_prior_row(self):
        world = build_tenant_world()
        v1 = _make_institution_default_profile(
            world.institution, sections={"body": "Original body."}
        )

        service = InstitutionDocumentProfileService()
        v2 = service.create_new_version(v1, sections={"body": "Revised body."})

        # New row with version+1 — a genuine INSERT, distinct id.
        assert v2.id != v1.id
        assert v2.version == v1.version + 1 == 2
        assert v2.sections == {"body": "Revised body."}

        # The prior row is still present and unchanged (never UPDATE-in-place).
        v1.refresh_from_db()
        assert v1.version == 1
        assert v1.sections == {"body": "Original body."}
        assert v1.is_active is True  # create_new_version never deactivates priors

        # Both rows live in the same scope.
        assert _scope_count(v1) == 2

    def test_copies_fields_when_no_overrides_given(self):
        world = build_tenant_world()
        v1 = _make_institution_default_profile(
            world.institution,
            sections={"body": "Body to copy."},
        )
        v1.fee_chart = [{"item": "Tuition", "amount": 5000}]
        v1.requirements = ["Bring NRC"]
        v1.save(update_fields=["fee_chart", "requirements"])

        v2 = InstitutionDocumentProfileService().create_new_version(v1)

        assert v2.version == 2
        assert v2.sections == {"body": "Body to copy."}
        assert v2.fee_chart == [{"item": "Tuition", "amount": 5000}]
        assert v2.requirements == ["Bring NRC"]
        assert v2.layout_key == v1.layout_key

    def test_chained_versions_increment_monotonically(self):
        world = build_tenant_world()
        v1 = _make_institution_default_profile(world.institution)
        service = InstitutionDocumentProfileService()

        v2 = service.create_new_version(v1)
        v3 = service.create_new_version(v2)
        v4 = service.create_new_version(v3)

        assert [v1.version, v2.version, v3.version, v4.version] == [1, 2, 3, 4]
        # Every prior version remains a readable record.
        assert _scope_count(v1) == 4
        versions = sorted(
            InstitutionDocumentProfile.objects.filter(
                institution_id=v1.institution_id, document_type=v1.document_type
            ).values_list("version", flat=True)
        )
        assert versions == [1, 2, 3, 4]

    def test_next_version_ignores_other_scopes(self):
        """Version numbering is per resolution scope, not per institution."""
        world = build_tenant_world()
        # Institution-default scope reaches version 3.
        default_v1 = _make_institution_default_profile(world.institution)
        service = InstitutionDocumentProfileService()
        service.create_new_version(default_v1)
        service.create_new_version(
            InstitutionDocumentProfile.objects.filter(
                institution=world.institution, program=None
            ).order_by("-version").first()
        )

        # A different (offering) scope starts its own version sequence at 1.
        now = timezone.now()
        offering_v1 = InstitutionDocumentProfile.objects.create(
            id=uuid.uuid4(),
            institution=world.institution,
            document_type=_DOCUMENT_TYPE,
            program=world.offering,
            canonical_program=None,
            intake=None,
            layout_key="fee_chart_letter",
            sections={"body": "Offering body."},
            fee_chart=[],
            bank_accounts=[],
            requirements=[],
            signatory={},
            version=1,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        offering_v2 = service.create_new_version(offering_v1)
        assert offering_v2.version == 2  # not 4 — scoped independently

    def test_rejects_invalid_payload_before_insert(self):
        """A payload that violates Safe_Template_Policy persists nothing."""
        world = build_tenant_world()
        v1 = _make_institution_default_profile(world.institution)
        before = _scope_count(v1)

        with pytest.raises(TemplateValidationError):
            # An unknown/injected token is rejected by validate_profile_payload.
            InstitutionDocumentProfileService().create_new_version(
                v1, sections={"body": "Dear {{secret_token}}"}
            )

        assert _scope_count(v1) == before  # no new row written
        v1.refresh_from_db()
        assert v1.version == 1  # original untouched

    def test_can_stage_inactive_version(self):
        world = build_tenant_world()
        v1 = _make_institution_default_profile(world.institution)
        v2 = InstitutionDocumentProfileService().create_new_version(
            v1, is_active=False
        )
        assert v2.is_active is False
        # v1 stays the active resolved version.
        resolved = InstitutionDocumentProfileService().resolve(
            world.application, _DOCUMENT_TYPE
        )
        assert resolved is not None
        assert resolved.id == v1.id


# ===========================================================================
# 2. resolve returns the highest active version
# ===========================================================================


@pytest.mark.django_db
class TestResolveHighestActiveVersion:
    """``resolve`` picks the highest active version (task 13.2 precedence).

    **Validates: Requirements R8.5, R8.2**
    """

    def test_resolve_returns_highest_active_version(self):
        world = build_tenant_world()
        v1 = _make_institution_default_profile(world.institution)
        service = InstitutionDocumentProfileService()
        v2 = service.create_new_version(v1, sections={"body": "v2 body."})
        v3 = service.create_new_version(v2, sections={"body": "v3 body."})

        resolved = service.resolve(world.application, _DOCUMENT_TYPE)
        assert resolved is not None
        assert resolved.id == v3.id
        assert resolved.version == 3

    def test_resolve_skips_inactive_highest_version(self):
        world = build_tenant_world()
        v1 = _make_institution_default_profile(world.institution)
        service = InstitutionDocumentProfileService()
        v2 = service.create_new_version(v1, sections={"body": "v2 body."})
        # v3 is created but inactive — resolve must fall back to v2.
        service.create_new_version(v2, sections={"body": "v3 body."}, is_active=False)

        resolved = service.resolve(world.application, _DOCUMENT_TYPE)
        assert resolved is not None
        assert resolved.id == v2.id
        assert resolved.version == 2


# ===========================================================================
# 3. Deactivating / superseding does not delete prior versions
# ===========================================================================


@pytest.mark.django_db
class TestSupersedeNeverDeletes:
    """Superseding a version retains prior rows as readable records (R8.5).

    **Validates: Requirements R8.5**
    """

    def test_deactivating_prior_version_does_not_delete_it(self):
        world = build_tenant_world()
        v1 = _make_institution_default_profile(world.institution)
        v2 = InstitutionDocumentProfileService().create_new_version(
            v1, sections={"body": "v2 body."}
        )

        # Operator deactivates v1 when v2 goes live (an UPDATE of is_active only,
        # never a delete).
        InstitutionDocumentProfile.objects.filter(id=v1.id).update(is_active=False)

        # v1 is still a readable record.
        v1.refresh_from_db()
        assert v1.is_active is False
        assert v1.version == 1
        assert v1.sections == {"body": "Profile body v1."}
        assert _scope_count(v1) == 2

        # resolve now returns the active v2.
        resolved = InstitutionDocumentProfileService().resolve(
            world.application, _DOCUMENT_TYPE
        )
        assert resolved is not None
        assert resolved.id == v2.id


# ===========================================================================
# 4. Provenance: a document generated from version N keeps profile_version=N
#    after version N+1 is created (R6.4 supersede-never-mutate + R8.5)
# ===========================================================================


@pytest.mark.django_db
class TestVersionProvenancePreserved:
    """A v1 document keeps profile_version=1 after v2 is created (R6.4 + R8.5).

    **Validates: Requirements R8.5, R6.4**
    """

    def test_v1_document_provenance_unchanged_when_v2_created(self):
        world = build_tenant_world(application_status="approved")
        application = world.application
        institution = world.institution

        v1 = _make_institution_default_profile(
            institution, sections={"body": "Acceptance body v1."}
        )

        # Generate from v1 — provenance records profile_version=1.
        _generate_acceptance(application)
        v1_doc = _current_acceptance_doc(application)
        assert v1_doc is not None
        v1_prov = _provenance(v1_doc)
        assert v1_prov["profile_id"] == str(v1.id)
        assert v1_prov["profile_version"] == 1
        v1_doc_id = v1_doc.id
        v1_notes = v1_doc.verification_notes

        # Create v2 (active) — the fingerprint input (profile version) changes,
        # so the next generation produces a NEW document recording v2.
        v2 = InstitutionDocumentProfileService().create_new_version(
            v1, sections={"body": "Acceptance body v2 — revised."}
        )
        assert v2.version == 2

        _generate_acceptance(application)
        v2_doc = _current_acceptance_doc(application)
        assert v2_doc is not None
        assert v2_doc.id != v1_doc_id, "v2 generation did not create a new document"
        v2_prov = _provenance(v2_doc)
        assert v2_prov["profile_id"] == str(v2.id)
        assert v2_prov["profile_version"] == 2

        # The v1 document row is byte-for-byte unchanged — its provenance still
        # points at v1 (supersede-never-mutate).
        v1_doc.refresh_from_db()
        assert v1_doc.verification_notes == v1_notes
        assert _provenance(v1_doc)["profile_version"] == 1

        # Both documents coexist; v1 is retained as a readable record.
        assert ApplicationDocument.objects.filter(
            application=application,
            document_type=_DOCUMENT_TYPE,
            system_generated=True,
        ).count() == 2


# ===========================================================================
# 5. Property — create_new_version is a monotonic, prior-preserving INSERT
# ===========================================================================


_VERSIONING_PROPERTY_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.data_too_large,
    ],
)


@pytest.mark.django_db
class TestVersioningProperty:
    # Feature: multi-tenant-beanola-remediation, Property: create_new_version is a monotonic prior-preserving insert
    """For any number of successive ``create_new_version`` calls, versions form
    the contiguous sequence ``1..N+1``, every prior row is retained unchanged,
    and ``resolve`` returns the highest active version.

    **Validates: Requirements R8.5**
    """

    @_VERSIONING_PROPERTY_SETTINGS
    @given(extra_versions=st.integers(min_value=0, max_value=6))
    def test_monotonic_versions_and_priors_preserved(self, extra_versions):
        world = build_tenant_world()
        service = InstitutionDocumentProfileService()
        v1 = _make_institution_default_profile(world.institution)

        created = [v1]
        snapshots = {v1.id: (v1.version, json.dumps(v1.sections, sort_keys=True))}
        for i in range(extra_versions):
            nxt = service.create_new_version(
                created[-1], sections={"body": f"Body revision {i + 2}."}
            )
            created.append(nxt)
            snapshots[nxt.id] = (
                nxt.version,
                json.dumps(nxt.sections, sort_keys=True),
            )

        total = extra_versions + 1
        # Versions are exactly the contiguous sequence 1..total.
        versions = sorted(
            InstitutionDocumentProfile.objects.filter(
                institution_id=v1.institution_id,
                document_type=v1.document_type,
                program_id=None,
                canonical_program_id=None,
                intake_id=None,
            ).values_list("version", flat=True)
        )
        assert versions == list(range(1, total + 1))

        # Every prior row is retained unchanged (no UPDATE-in-place, no delete).
        for profile in created:
            profile.refresh_from_db()
            expected_version, expected_sections = snapshots[profile.id]
            assert profile.version == expected_version
            assert json.dumps(profile.sections, sort_keys=True) == expected_sections

        # resolve returns the highest active version.
        resolved = service.resolve(world.application, _DOCUMENT_TYPE)
        assert resolved is not None
        assert resolved.version == total
        assert resolved.id == created[-1].id
