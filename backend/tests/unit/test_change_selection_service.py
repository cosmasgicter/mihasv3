"""Unit tests — change-selection classification + PATCH assignment-field lock.

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` — task 6.4.
Requirements: R7.2, R10.5 · Findings: STU-01, DATA-01
Design: design.md §7.2 (Application Assignment).

Covers the two pure/structural halves of task 6.4:

1. ``classify_selection_change`` — the gate that decides whether the payment
   lock applies (only a genuine reassignment moves the student's choice).
2. The generic-PATCH assignment-field removal — ``program`` / ``intake`` /
   ``institution`` and every canonical ID are read-only on
   ``ApplicationSerializer`` regardless of role, status, or request context.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from apps.applications.assignment_resolution import AssignmentSnapshot
from apps.applications.change_selection_service import (
    CANONICALIZATION,
    DEPENDENT_ANSWER_FIELDS,
    REASSIGNMENT,
    UNCHANGED,
    classify_selection_change,
)
from apps.applications.serializers import (
    ASSIGNMENT_FIELDS,
    DRAFT_SAFE_FIELDS,
    ApplicationSerializer,
)

INSTITUTION_A = str(uuid.uuid4())
INSTITUTION_B = str(uuid.uuid4())
CANONICAL_A = str(uuid.uuid4())
CANONICAL_B = str(uuid.uuid4())
OFFERING_A = str(uuid.uuid4())
OFFERING_B = str(uuid.uuid4())
INTAKE_A = str(uuid.uuid4())
INTAKE_B = str(uuid.uuid4())


def _snapshot(
    *,
    institution_id=INSTITUTION_A,
    canonical_program_id=CANONICAL_A,
    program_offering_id=OFFERING_A,
    intake_id=INTAKE_A,
    institution_name="School A",
    program_name="Diploma in Nursing",
    intake_name="January 2027",
    configuration_version="cfg-aaaa",
) -> AssignmentSnapshot:
    return AssignmentSnapshot(
        institution_id=institution_id,
        canonical_program_id=canonical_program_id,
        program_offering_id=program_offering_id,
        intake_id=intake_id,
        institution_name=institution_name,
        program_name=program_name,
        intake_name=intake_name,
        required_documents=[],
        eligibility_rules=[],
        configuration_version=configuration_version,
    )


def _application(**overrides):
    defaults = dict(
        institution_ref_id=INSTITUTION_A,
        canonical_program_id=CANONICAL_A,
        program_offering_id=OFFERING_A,
        intake_ref_id=INTAKE_A,
        institution="School A",
        program="Diploma in Nursing",
        intake="January 2027",
        configuration_version="cfg-aaaa",
        assignment_version=1,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class TestClassifySelectionChange:
    def test_identical_selection_is_unchanged(self):
        assert classify_selection_change(_application(), _snapshot()) == UNCHANGED

    def test_different_program_is_reassignment(self):
        app = _application()
        snap = _snapshot(
            canonical_program_id=CANONICAL_B,
            program_offering_id=OFFERING_B,
            program_name="Diploma in Pharmacy",
        )
        assert classify_selection_change(app, snap) == REASSIGNMENT

    def test_different_intake_is_reassignment(self):
        app = _application()
        snap = _snapshot(intake_id=INTAKE_B, intake_name="July 2027")
        assert classify_selection_change(app, snap) == REASSIGNMENT

    def test_same_name_other_tenant_offering_is_reassignment(self):
        """Two tenants offering the same-name canonical program are NOT the same
        selection — the offering + institution IDs discriminate them."""
        app = _application()
        snap = _snapshot(
            institution_id=INSTITUTION_B,
            program_offering_id=OFFERING_B,
            institution_name="School B",
        )
        assert classify_selection_change(app, snap) == REASSIGNMENT

    def test_stale_display_snapshot_on_same_target_is_canonicalization(self):
        """Catalog rename: same canonical IDs, drifted display snapshot."""
        app = _application(program="Old Programme Name")
        assert classify_selection_change(app, _snapshot()) == CANONICALIZATION

    def test_drifted_configuration_version_on_same_target_is_canonicalization(self):
        app = _application(configuration_version="cfg-old")
        assert classify_selection_change(app, _snapshot()) == CANONICALIZATION

    def test_legacy_row_without_canonical_ids_same_display_is_canonicalization(self):
        """A legacy display-string-only draft whose selection is unchanged is a
        repair (fill in the canonical IDs), not a student-initiated reroute."""
        app = _application(
            institution_ref_id=None,
            canonical_program_id=None,
            program_offering_id=None,
            intake_ref_id=None,
            configuration_version=None,
        )
        assert classify_selection_change(app, _snapshot()) == CANONICALIZATION

    def test_legacy_row_with_different_display_is_reassignment(self):
        app = _application(
            institution_ref_id=None,
            canonical_program_id=None,
            program_offering_id=None,
            intake_ref_id=None,
            configuration_version=None,
            program="Diploma in Pharmacy",
        )
        assert classify_selection_change(app, _snapshot()) == REASSIGNMENT

    def test_partially_canonical_row_is_reassignment_not_repair(self):
        """A row carrying *some* canonical IDs that disagree with the target is a
        real assignment move and must go through the payment gate."""
        app = _application(program_offering_id=None, intake_ref_id=INTAKE_B)
        assert classify_selection_change(app, _snapshot()) == REASSIGNMENT

    def test_display_comparison_ignores_case_and_padding(self):
        app = _application(program="  diploma in NURSING ", institution="school a")
        assert classify_selection_change(app, _snapshot()) == UNCHANGED


class TestDependentAnswerFields:
    def test_dependent_answers_are_the_assignment_derived_ones(self):
        """Pin the cleared set: every entry is derived from the old offering's
        configuration, and none of them is student-entered identity data."""
        assert set(DEPENDENT_ANSWER_FIELDS) == {
            "eligibility_status",
            "eligibility_score",
            "eligibility_notes",
            "waitlist_position",
            "is_late_submission",
        }


class TestGenericPatchAssignmentLock:
    """Design §7.2: generic PATCH never accepts assignment ids or snapshots."""

    def test_assignment_fields_are_not_draft_safe(self):
        assert not (ASSIGNMENT_FIELDS & DRAFT_SAFE_FIELDS)

    @pytest.mark.parametrize(
        "field_name",
        ["program", "intake", "institution", "program_id", "intake_id",
         "institution_id", "program_offering_id"],
    )
    def test_assignment_fields_are_read_only_without_request_context(self, field_name):
        fields = ApplicationSerializer().get_fields()
        assert fields[field_name].read_only is True

    @pytest.mark.parametrize("role", ["student", "admin", "super_admin"])
    def test_assignment_fields_are_read_only_on_patch_for_every_role(self, role):
        request = SimpleNamespace(method="PATCH", user=SimpleNamespace(role=role))
        serializer = ApplicationSerializer(
            instance=SimpleNamespace(status="draft"), context={"request": request}
        )
        fields = serializer.get_fields()
        for field_name in ASSIGNMENT_FIELDS:
            assert fields[field_name].read_only is True, field_name

    def test_personal_draft_fields_remain_writable_on_patch(self):
        """The lock is narrow: ordinary draft-safe editing is untouched."""
        request = SimpleNamespace(method="PATCH", user=SimpleNamespace(role="student"))
        serializer = ApplicationSerializer(
            instance=SimpleNamespace(status="draft"), context={"request": request}
        )
        fields = serializer.get_fields()
        for field_name in ("full_name", "phone", "email", "residence_town",
                           "nationality", "country", "next_of_kin_name"):
            assert fields[field_name].read_only is False, field_name

    def test_assignment_display_fields_are_declared_read_only_in_meta(self):
        meta_read_only = set(ApplicationSerializer.Meta.read_only_fields)
        assert {"program", "intake", "institution"} <= meta_read_only
