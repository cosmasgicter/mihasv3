"""Unit matrix tests — OfferingAssignmentService.

Spec: ``multi-tenant-beanola-admissions`` — Phase 2, task 6.1. These are the
explicit, deterministic example/edge-case checks for the assignment algorithm
that complement the ≥100-example property tests in
``backend/tests/property/test_assignment_properties.py``. The property tests
prove the invariants hold across generated inputs; this file pins the concrete
matrix cases from the task description so a regression names exactly which rule
broke.

Assignment correctness requirements covered:

    R2.1  candidate filtering — active offering (``is_active`` AND
          ``offering_status='active'``), canonical match, linked intake, active
          (or legacy-null-active) program-intake
    R2.2  white-label ``institution_id`` restricts candidates to one institution
    R2.3  offering ``assignment_rules`` + program-intake ``residency_rules``
          allow/block by country/nationality
    R2.4  capacity exhaustion excludes a candidate
    R2.5  deterministic sort — program-intake priority dominates, then offering
          priority (lower wins), then code/id tie-break
    R2.6  ``NO_ELIGIBLE_OFFERING`` raised when no candidate is eligible

The service under test is
``backend/apps/catalog/services.py:OfferingAssignmentService``. Tests build the
tenant object graph with the shared fixtures in
``backend/tests/tenant_fixtures.py`` (task 1.1) and run against the test DB via
``@pytest.mark.django_db``.

**Validates: Requirements R2.1, R2.2, R2.3, R2.4, R2.5, R2.6**
"""

from __future__ import annotations

import pytest

from apps.catalog.models import Program
from apps.catalog.services import (
    AssignmentResult,
    OfferingAssignmentError,
    OfferingAssignmentService,
)
from tests.tenant_fixtures import (
    CandidateSpec,
    build_assignment_scenario,
    build_canonical_program,
    build_intake,
    build_offering,
    build_program_intake,
)


def _service() -> OfferingAssignmentService:
    return OfferingAssignmentService()


def _assign_world(world, *, country="Zambia", nationality="Zambian", institution_id=None):
    return _service().assign(
        program_id=world.canonical_program_id,
        intake_id=world.intake_id,
        country=country,
        nationality=nationality,
        institution_id=institution_id,
    )


# ---------------------------------------------------------------------------
# R2.5 — deterministic sort (priority dominance + tie-break)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestDeterministicSort:
    """R2.5: ``(program_intake.assignment_priority, offering.assignment_priority,
    code, id)`` — lower wins at every level.

    **Validates: Requirements R2.5**
    """

    def test_program_intake_priority_dominates_offering_priority(self):
        """A candidate with the lowest program-intake priority wins even with the
        worst offering priority in the set."""
        scenario = build_assignment_scenario(
            [
                CandidateSpec(offering_priority=1, program_intake_priority=50, code="DOM-A"),
                CandidateSpec(offering_priority=999, program_intake_priority=10, code="DOM-B"),
            ]
        )
        winner = _service().assign(
            program_id=scenario.canonical_program_id,
            intake_id=scenario.intake_id,
            country="Zambia",
            nationality="Zambian",
        )
        assert winner.offering.code == "DOM-B"

    def test_offering_priority_is_secondary_key(self):
        """When program-intake priorities tie, the lower offering priority wins."""
        scenario = build_assignment_scenario(
            [
                CandidateSpec(offering_priority=5, program_intake_priority=20, code="SEC-LOW"),
                CandidateSpec(offering_priority=900, program_intake_priority=20, code="SEC-HIGH"),
            ]
        )
        winner = _service().assign(
            program_id=scenario.canonical_program_id,
            intake_id=scenario.intake_id,
            country="Zambia",
            nationality="Zambian",
        )
        assert winner.offering.code == "SEC-LOW"

    def test_tie_break_by_code_when_all_priorities_equal(self):
        """All priorities equal → deterministic tie-break by offering ``code``."""
        scenario = build_assignment_scenario(
            [
                CandidateSpec(offering_priority=100, program_intake_priority=10, code="TIE-ZZZ"),
                CandidateSpec(offering_priority=100, program_intake_priority=10, code="TIE-AAA"),
                CandidateSpec(offering_priority=100, program_intake_priority=10, code="TIE-MMM"),
            ]
        )
        winner = _service().assign(
            program_id=scenario.canonical_program_id,
            intake_id=scenario.intake_id,
            country="Zambia",
            nationality="Zambian",
        )
        assert winner.offering.code == "TIE-AAA"

    def test_legacy_null_program_intake_priority_falls_back_to_offering_priority(self):
        """A legacy-null program-intake priority uses the offering priority for
        the *primary* sort slot (design.md step 5)."""
        # Candidate A: pi=None, offering=5  → primary slot = 5
        # Candidate B: pi=10,   offering=1  → primary slot = 10
        # A's effective primary (5) < B's (10) → A wins.
        scenario = build_assignment_scenario(
            [
                CandidateSpec(offering_priority=5, program_intake_priority=None, code="NULL-A"),
                CandidateSpec(offering_priority=1, program_intake_priority=10, code="NULL-B"),
            ]
        )
        winner = _service().assign(
            program_id=scenario.canonical_program_id,
            intake_id=scenario.intake_id,
            country="Zambia",
            nationality="Zambian",
        )
        assert winner.offering.code == "NULL-A"

    def test_assignment_is_deterministic_across_repeated_calls(self):
        """Identical inputs always yield the same offering (R2.5 determinism)."""
        scenario = build_assignment_scenario(
            [
                CandidateSpec(offering_priority=3, program_intake_priority=7, code="DET-A"),
                CandidateSpec(offering_priority=3, program_intake_priority=7, code="DET-B"),
                CandidateSpec(offering_priority=3, program_intake_priority=7, code="DET-C"),
            ]
        )
        first = _service().assign(
            program_id=scenario.canonical_program_id,
            intake_id=scenario.intake_id,
            country="Zambia",
            nationality="Zambian",
        )
        second = _service().assign(
            program_id=scenario.canonical_program_id,
            intake_id=scenario.intake_id,
            country="Zambia",
            nationality="Zambian",
        )
        assert first.offering.id == second.offering.id
        assert first.offering.code == "DET-A"  # tie-break → lexicographically first


# ---------------------------------------------------------------------------
# R2.3 — assignment_rules + residency_rules allow/block
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestRuleEvaluation:
    """R2.3: both the offering ``assignment_rules`` and the program-intake
    ``residency_rules`` are applied against ``country``/``nationality``.

    **Validates: Requirements R2.3, R2.6**
    """

    def test_residency_rules_exclude_country_blocks(self, tenant_world_factory):
        world = tenant_world_factory(residency_rules={"exclude_countries": ["Zambia"]})
        with pytest.raises(OfferingAssignmentError) as exc:
            _assign_world(world)
        assert exc.value.code == "NO_ELIGIBLE_OFFERING"

    def test_residency_rules_exclude_nationality_blocks(self, tenant_world_factory):
        world = tenant_world_factory(residency_rules={"exclude_nationalities": ["Zambian"]})
        with pytest.raises(OfferingAssignmentError):
            _assign_world(world)

    def test_residency_rules_allow_list_omitting_applicant_blocks(self, tenant_world_factory):
        """An allow-list that does not include the applicant's country blocks."""
        world = tenant_world_factory(residency_rules={"countries": ["Narnia"]})
        with pytest.raises(OfferingAssignmentError):
            _assign_world(world)

    def test_offering_assignment_rules_block_independently(self, tenant_world_factory):
        """The offering's own ``assignment_rules`` block even when the
        program-intake ``residency_rules`` are open (R2.3 'apply BOTH')."""
        world = tenant_world_factory(
            assignment_rules={"exclude_nationalities": ["Zambian"]},
            residency_rules=None,
        )
        with pytest.raises(OfferingAssignmentError):
            _assign_world(world)

    def test_rule_matching_is_case_insensitive(self, tenant_world_factory):
        """Rule values are matched case-insensitively against the applicant."""
        world = tenant_world_factory(residency_rules={"exclude_countries": ["zambia"]})
        with pytest.raises(OfferingAssignmentError):
            _assign_world(world)

    def test_allowed_applicant_is_assigned(self, tenant_world_factory):
        """An allow-listed applicant is assigned the offering."""
        world = tenant_world_factory(
            residency_rules={"countries": ["Zambia"]},
            assignment_rules={"nationalities": ["Zambian"]},
        )
        result = _assign_world(world)
        assert result.offering.id == world.offering.id

    def test_no_rules_means_open(self, tenant_world_factory):
        """No rules (None) → the applicant is eligible regardless of residency."""
        world = tenant_world_factory(residency_rules=None, assignment_rules=None)
        result = _assign_world(world, country="Narnia", nationality="Elvish")
        assert result.offering.id == world.offering.id

    def test_blocked_candidate_excluded_but_allowed_sibling_assigned(self):
        """In a mixed set, the blocked candidate is skipped and an allowed
        sibling is assigned — not a raise."""
        scenario = build_assignment_scenario(
            [
                CandidateSpec(
                    code="RULE-BLOCKED",
                    program_intake_priority=1,  # would win on priority…
                    residency_rules={"exclude_countries": ["Zambia"]},
                ),
                CandidateSpec(
                    code="RULE-OPEN",
                    program_intake_priority=50,
                    residency_rules=None,
                ),
            ]
        )
        result = _service().assign(
            program_id=scenario.canonical_program_id,
            intake_id=scenario.intake_id,
            country="Zambia",
            nationality="Zambian",
        )
        # …but it is blocked, so the open (worse-priority) sibling wins.
        assert result.offering.code == "RULE-OPEN"


# ---------------------------------------------------------------------------
# R2.1 — candidate filtering (active / canonical / linked intake / active PI)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCandidateFiltering:
    """R2.1: only active, canonically-matched, intake-linked offerings with an
    active (or legacy-null-active) program-intake are candidates.

    **Validates: Requirements R2.1, R2.6**
    """

    def test_archived_offering_excluded_but_readable(self, tenant_world_factory):
        """An ``offering_status='archived'`` offering is excluded from new
        assignment but stays readable via the ORM."""
        world = tenant_world_factory(offering_status="archived")
        with pytest.raises(OfferingAssignmentError) as exc:
            _assign_world(world)
        assert exc.value.code == "NO_ELIGIBLE_OFFERING"
        # Readability invariant: archived row remains queryable.
        assert Program.objects.filter(id=world.offering.id).exists()
        assert Program.objects.get(id=world.offering.id).offering_status == "archived"

    def test_inactive_offering_excluded(self):
        """An ``is_active=False`` offering is not a candidate (canonical program
        and intake stay active)."""
        scenario = build_assignment_scenario(
            [CandidateSpec(code="OFF-INACTIVE", is_active=False)]
        )
        with pytest.raises(OfferingAssignmentError) as exc:
            _service().assign(
                program_id=scenario.canonical_program_id,
                intake_id=scenario.intake_id,
                country="Zambia",
                nationality="Zambian",
            )
        assert exc.value.code == "NO_ELIGIBLE_OFFERING"
        # Readability invariant: the inactive offering row is still queryable.
        inactive = scenario.offerings[0]
        assert Program.objects.filter(id=inactive.id).exists()

    def test_inactive_program_intake_excluded(self):
        """A program-intake with ``is_active=False`` is excluded."""
        scenario = build_assignment_scenario(
            [CandidateSpec(code="PI-INACTIVE", program_intake_is_active=False)]
        )
        with pytest.raises(OfferingAssignmentError) as exc:
            _service().assign(
                program_id=scenario.canonical_program_id,
                intake_id=scenario.intake_id,
                country="Zambia",
                nationality="Zambian",
            )
        assert exc.value.code == "NO_ELIGIBLE_OFFERING"

    def test_archived_excluded_active_sibling_assigned(self):
        """With one archived and one active offering, the active one is assigned."""
        scenario = build_assignment_scenario(
            [
                CandidateSpec(code="ARC-OFF", offering_status="archived", program_intake_priority=1),
                CandidateSpec(code="ACT-OFF", offering_status="active", program_intake_priority=50),
            ]
        )
        result = _service().assign(
            program_id=scenario.canonical_program_id,
            intake_id=scenario.intake_id,
            country="Zambia",
            nationality="Zambian",
        )
        assert result.offering.code == "ACT-OFF"

    def test_offering_for_different_intake_is_not_a_candidate(self, tenant_world_factory):
        """An offering only linked to a *different* intake is not a candidate
        for the requested intake."""
        world = tenant_world_factory()
        other_intake = build_intake(suffix="other-intake")
        # The world's offering has no program-intake row for ``other_intake``.
        with pytest.raises(OfferingAssignmentError) as exc:
            _service().assign(
                program_id=world.canonical_program_id,
                intake_id=str(other_intake.id),
                country="Zambia",
                nationality="Zambian",
            )
        assert exc.value.code == "NO_ELIGIBLE_OFFERING"

    def test_offering_for_different_canonical_program_excluded(self, tenant_world_factory):
        """An offering linked to a different canonical program is not a
        candidate, even when it shares the requested intake."""
        world = tenant_world_factory()
        other_canonical = build_canonical_program(suffix="other-canon")
        other_offering = build_offering(
            institution=world.institution,
            canonical_program=other_canonical,
            suffix="other-canon",
        )
        build_program_intake(offering=other_offering, intake=world.intake)
        # Requesting the *other* canonical program for the world's intake must
        # only ever resolve to that program's offering, never the world's.
        result = _service().assign(
            program_id=str(other_canonical.id),
            intake_id=world.intake_id,
            country="Zambia",
            nationality="Zambian",
        )
        assert result.offering.id == other_offering.id
        assert result.offering.id != world.offering.id


# ---------------------------------------------------------------------------
# R2.4 — capacity exhaustion
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCapacityExhaustion:
    """R2.4: a capacity-exhausted program-intake is excluded.

    **Validates: Requirements R2.4, R2.6**
    """

    def test_full_capacity_excludes(self, tenant_world_factory):
        world = tenant_world_factory(max_capacity=10, current_enrollment=10)
        with pytest.raises(OfferingAssignmentError) as exc:
            _assign_world(world)
        assert exc.value.code == "NO_ELIGIBLE_OFFERING"

    def test_over_capacity_excludes(self, tenant_world_factory):
        world = tenant_world_factory(max_capacity=10, current_enrollment=15)
        with pytest.raises(OfferingAssignmentError):
            _assign_world(world)

    def test_one_seat_headroom_is_assignable(self, tenant_world_factory):
        world = tenant_world_factory(max_capacity=10, current_enrollment=9)
        result = _assign_world(world)
        assert result.offering.id == world.offering.id

    def test_null_capacity_is_unbounded(self):
        """A null program-intake capacity AND null intake capacity is treated as
        unlimited — high enrollment still assigns."""
        canonical = build_canonical_program(suffix="cap-null")
        # Both the intake-level and program-intake-level capacities are null,
        # so there is no binding capacity constraint.
        intake = build_intake(suffix="cap-null", max_capacity=None)
        scenario = build_assignment_scenario(
            [CandidateSpec(code="CAP-NULL", max_capacity=None, current_enrollment=10_000)],
            suffix="cap-null",
            canonical_program=canonical,
            intake=intake,
        )
        result = _service().assign(
            program_id=str(canonical.id),
            intake_id=str(intake.id),
            country="Zambia",
            nationality="Zambian",
        )
        assert result.offering.code == "CAP-NULL"

    def test_full_candidate_excluded_open_sibling_assigned(self):
        """A full candidate is skipped in favour of an open sibling even when the
        full one has the better priority."""
        scenario = build_assignment_scenario(
            [
                CandidateSpec(
                    code="CAP-FULL",
                    program_intake_priority=1,
                    max_capacity=5,
                    current_enrollment=5,
                ),
                CandidateSpec(
                    code="CAP-OPEN",
                    program_intake_priority=50,
                    max_capacity=5,
                    current_enrollment=0,
                ),
            ],
            intake_max_capacity=10_000,
        )
        result = _service().assign(
            program_id=scenario.canonical_program_id,
            intake_id=scenario.intake_id,
            country="Zambia",
            nationality="Zambian",
        )
        assert result.offering.code == "CAP-OPEN"


# ---------------------------------------------------------------------------
# R2.2 — white-label institution_id filter
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestWhiteLabelFilter:
    """R2.2: a supplied ``institution_id`` restricts candidates to that school.

    **Validates: Requirements R2.2, R2.6**
    """

    def _two_school_slot(self):
        """Two institutions offering the same canonical program + intake."""
        canonical = build_canonical_program(suffix="wl-unit")
        intake = build_intake(suffix="wl-unit", max_capacity=10_000)
        school_a = build_assignment_scenario(
            [CandidateSpec(offering_priority=1, program_intake_priority=1, code="UWL-A")],
            suffix="wl-unit-a",
            canonical_program=canonical,
            intake=intake,
        )
        school_b = build_assignment_scenario(
            [CandidateSpec(offering_priority=999, program_intake_priority=999, code="UWL-B")],
            suffix="wl-unit-b",
            canonical_program=canonical,
            intake=intake,
        )
        return canonical, intake, school_a, school_b

    def test_filter_selects_requested_institution(self):
        canonical, intake, school_a, school_b = self._two_school_slot()
        result = _service().assign(
            program_id=str(canonical.id),
            intake_id=str(intake.id),
            country="Zambia",
            nationality="Zambian",
            institution_id=school_b.institution_id,
        )
        # School B wins under its own filter despite a far worse priority than A.
        assert result.institution.id == school_b.institution.id
        assert result.offering.code == "UWL-B"

    def test_filter_does_not_cross_to_better_other_school(self):
        canonical, intake, school_a, school_b = self._two_school_slot()
        result = _service().assign(
            program_id=str(canonical.id),
            intake_id=str(intake.id),
            country="Zambia",
            nationality="Zambian",
            institution_id=school_a.institution_id,
        )
        assert result.institution.id == school_a.institution.id
        assert result.offering.code == "UWL-A"

    def test_no_filter_picks_globally_best(self):
        """Without an ``institution_id`` the globally best candidate wins across
        schools (the shared-portal case)."""
        canonical, intake, school_a, school_b = self._two_school_slot()
        result = _service().assign(
            program_id=str(canonical.id),
            intake_id=str(intake.id),
            country="Zambia",
            nationality="Zambian",
        )
        # A has priority 1 vs B's 999, so A wins the shared portal.
        assert result.offering.code == "UWL-A"

    def test_filter_to_school_with_no_eligible_offering_raises(self):
        """If the requested institution has no eligible offering, the service
        raises ``NO_ELIGIBLE_OFFERING`` rather than falling back to a sibling
        school."""
        canonical = build_canonical_program(suffix="wl-empty")
        intake = build_intake(suffix="wl-empty", max_capacity=10_000)
        wl = build_assignment_scenario(
            [CandidateSpec(offering_status="archived", code="WLE-ARCH")],
            suffix="wl-empty-a",
            canonical_program=canonical,
            intake=intake,
        )
        build_assignment_scenario(
            [CandidateSpec(offering_status="active", code="WLE-OTHER")],
            suffix="wl-empty-b",
            canonical_program=canonical,
            intake=intake,
        )
        with pytest.raises(OfferingAssignmentError) as exc:
            _service().assign(
                program_id=str(canonical.id),
                intake_id=str(intake.id),
                country="Zambia",
                nationality="Zambian",
                institution_id=wl.institution_id,
            )
        assert exc.value.code == "NO_ELIGIBLE_OFFERING"


# ---------------------------------------------------------------------------
# R2.6 — NO_ELIGIBLE_OFFERING + result shape
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestNoEligibleOfferingAndResultShape:
    """R2.6: empty candidate set raises a stable-code error; a success returns a
    fully-populated ``AssignmentResult``.

    **Validates: Requirements R2.1, R2.6**
    """

    def test_error_carries_stable_code(self, tenant_world_factory):
        world = tenant_world_factory(offering_status="archived")
        with pytest.raises(OfferingAssignmentError) as exc:
            _assign_world(world)
        assert exc.value.code == "NO_ELIGIBLE_OFFERING"

    def test_error_is_value_error_subclass(self, tenant_world_factory):
        """The error remains a ``ValueError`` subclass for callers that catch
        broadly while still exposing the stable ``code``."""
        world = tenant_world_factory(max_capacity=1, current_enrollment=1)
        with pytest.raises(ValueError) as exc:
            _assign_world(world)
        assert getattr(exc.value, "code", None) == "NO_ELIGIBLE_OFFERING"

    def test_successful_result_is_fully_populated(self, tenant_world):
        """A successful assignment returns the canonical program, intake,
        offering, institution, and the resolved required-documents list."""
        result = _assign_world(tenant_world)
        assert isinstance(result, AssignmentResult)
        assert result.canonical_program.id == tenant_world.canonical_program.id
        assert result.intake.id == tenant_world.intake.id
        assert result.offering.id == tenant_world.offering.id
        assert result.institution.id == tenant_world.institution.id
        assert isinstance(result.required_documents, list)
