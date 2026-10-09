"""Unit tests — canonical assignment + requirement resolution service.

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task 5.2.
Requirements: R7.1-R7.3, R7.5, R11.6 · Findings: DATA-01, DATA-04, STU-01, STU-13

Covers ``apps.applications.assignment_resolution``:

* Canonical-only resolution (reuses OfferingAssignmentService; no name/code
  fallback) that snapshots required documents + eligibility rules and stamps a
  deterministic configuration version.
* Fail-closed behaviour: a dependency failure in required-document or
  eligibility resolution raises ``AssignmentConfigurationError`` (retryable 503),
  never a silent empty-requirements result (DATA-04, STU-13).
* Configuration-version determinism + content sensitivity (R7.2).

**Validates: Requirements R7.1, R7.2, R11.6**
"""

from __future__ import annotations

import uuid
from unittest.mock import patch

import pytest

from apps.applications.assignment_resolution import (
    AssignmentConfigurationError,
    AssignmentSnapshot,
    compute_configuration_version,
    resolve_assignment_snapshot,
    resolve_eligibility_rules,
    resolve_required_documents,
)
from apps.catalog.models import CourseRequirement, InstitutionRequiredDocument
from apps.catalog.services import OfferingAssignmentError
from tests.tenant_fixtures import build_tenant_world

pytestmark = pytest.mark.django_db


def _seed_required_doc(world, *, document_type, label, required=True, **scope):
    return InstitutionRequiredDocument.objects.create(
        id=uuid.uuid4(),
        institution=world.institution,
        document_type=document_type,
        label=label,
        is_required=required,
        is_active=True,
        **scope,
    )


class TestResolveAssignmentSnapshot:
    def test_resolves_canonical_ids_and_snapshots_configuration(self):
        world = build_tenant_world(with_application=False)
        _seed_required_doc(world, document_type="transcript", label="Academic Transcript")

        snapshot = resolve_assignment_snapshot(
            program_id=world.canonical_program_id,
            intake_id=world.intake_id,
        )

        assert isinstance(snapshot, AssignmentSnapshot)
        # Every canonical ID is derived server-side from the resolved graph.
        assert snapshot.institution_id == str(world.institution.id)
        assert snapshot.canonical_program_id == str(world.canonical_program.id)
        assert snapshot.program_offering_id == str(world.offering.id)
        assert snapshot.intake_id == str(world.intake.id)
        # Display snapshots.
        assert snapshot.institution_name == world.institution.name
        assert snapshot.program_name == world.canonical_program.name
        # Required documents are snapshotted.
        doc_types = {row["document_type"] for row in snapshot.required_documents}
        assert "transcript" in doc_types
        # Deterministic configuration version is stamped.
        assert snapshot.configuration_version.startswith("cfg-")

    def test_snapshot_columns_map_to_application_fields(self):
        world = build_tenant_world(with_application=False)
        snapshot = resolve_assignment_snapshot(
            program_id=world.canonical_program_id,
            intake_id=world.intake_id,
        )
        cols = snapshot.snapshot_columns()
        assert cols["institution_ref_id"] == str(world.institution.id)
        assert cols["canonical_program_id"] == str(world.canonical_program.id)
        assert cols["program_offering_id"] == str(world.offering.id)
        assert cols["intake_ref_id"] == str(world.intake.id)
        assert cols["configuration_version"] == snapshot.configuration_version
        assert cols["requirements_snapshot"] == snapshot.required_documents
        assert cols["eligibility_snapshot"] == snapshot.eligibility_rules
        assert cols["assignment_version"] == 1

    def test_no_eligible_offering_raises_offering_error_not_config_error(self):
        """A genuine no-offering stays a client error (400), not a 503."""
        world = build_tenant_world(with_application=False, offering_status="inactive")
        with pytest.raises(OfferingAssignmentError):
            resolve_assignment_snapshot(
                program_id=world.canonical_program_id,
                intake_id=world.intake_id,
            )

    def test_required_document_dependency_failure_fails_closed(self):
        """A required-document resolution failure fails closed (DATA-04/STU-13)."""
        world = build_tenant_world(with_application=False)
        with patch(
            "apps.catalog.services.OfferingAssignmentService.required_documents",
            side_effect=RuntimeError("db unavailable"),
        ):
            with pytest.raises(AssignmentConfigurationError) as exc:
                resolve_assignment_snapshot(
                    program_id=world.canonical_program_id,
                    intake_id=world.intake_id,
                )
        assert exc.value.code == "CONFIGURATION_UNAVAILABLE"
        assert exc.value.retryable is True
        assert exc.value.status_code == 503

    def test_eligibility_dependency_failure_fails_closed(self):
        world = build_tenant_world(with_application=False)
        with patch(
            "apps.applications.assignment_resolution.resolve_eligibility_rules",
            side_effect=AssignmentConfigurationError(),
        ):
            with pytest.raises(AssignmentConfigurationError):
                resolve_assignment_snapshot(
                    program_id=world.canonical_program_id,
                    intake_id=world.intake_id,
                )


class TestResolveRequiredDocuments:
    def test_empty_config_returns_empty_list_not_error(self):
        """No configured requirements is a valid empty list — never an error."""
        world = build_tenant_world(with_application=False)
        result = resolve_required_documents(world.offering, world.canonical_program)
        assert result == []

    def test_resolution_failure_raises_config_error(self):
        world = build_tenant_world(with_application=False)
        with patch(
            "apps.catalog.services.OfferingAssignmentService.required_documents",
            side_effect=RuntimeError("boom"),
        ):
            with pytest.raises(AssignmentConfigurationError):
                resolve_required_documents(world.offering, world.canonical_program)


class TestResolveEligibilityRules:
    def test_snapshots_course_requirements(self):
        world = build_tenant_world(with_application=False)
        from apps.catalog.models import Subject

        subject = Subject.objects.create(id=uuid.uuid4(), name="Mathematics", code="MATH")
        CourseRequirement.objects.create(
            id=uuid.uuid4(),
            program=world.offering,
            subject=subject,
            is_mandatory=True,
            minimum_grade=6,
        )
        rules = resolve_eligibility_rules(world.offering)
        assert len(rules) == 1
        assert rules[0]["subject_name"] == "Mathematics"
        assert rules[0]["minimum_grade"] == 6
        assert rules[0]["is_mandatory"] is True

    def test_no_rules_returns_empty_list(self):
        world = build_tenant_world(with_application=False)
        assert resolve_eligibility_rules(world.offering) == []


class TestConfigurationVersion:
    def test_deterministic_for_same_content(self):
        args = dict(
            institution_id="i1",
            canonical_program_id="c1",
            program_offering_id="o1",
            intake_id="k1",
            required_documents=[{"document_type": "nrc", "required": True}],
            eligibility_rules=[{"subject_id": "s1", "minimum_grade": 6}],
        )
        assert compute_configuration_version(**args) == compute_configuration_version(**args)

    def test_changes_when_requirements_change(self):
        base = dict(
            institution_id="i1",
            canonical_program_id="c1",
            program_offering_id="o1",
            intake_id="k1",
            eligibility_rules=[],
        )
        v1 = compute_configuration_version(required_documents=[], **base)
        v2 = compute_configuration_version(
            required_documents=[{"document_type": "transcript", "required": True}], **base
        )
        assert v1 != v2

    def test_differs_across_tenants_with_same_program(self):
        """Two tenants → different offering/institution IDs → different version."""
        common = dict(
            canonical_program_id="shared-canonical",
            intake_id="shared-intake",
            required_documents=[],
            eligibility_rules=[],
        )
        v_a = compute_configuration_version(
            institution_id="inst-a", program_offering_id="off-a", **common
        )
        v_b = compute_configuration_version(
            institution_id="inst-b", program_offering_id="off-b", **common
        )
        assert v_a != v_b
