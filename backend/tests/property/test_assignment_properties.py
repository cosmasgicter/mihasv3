"""Property-based tests — OfferingAssignmentService (P1–P5 + white-label).

Spec: ``multi-tenant-beanola-admissions`` — Phase 2, task 6.1 (built on the
Phase 0 exploration baseline from tasks 1.1 / 1.3 / 1.4). These tests pin the
assignment correctness properties from the design's Testing Strategy:

    P1  Assignment determinism — same inputs → same offering
    P2  Priority ordering — program-intake priority dominates offering priority;
        ties resolved deterministically
    P3  Residency / country / nationality block excludes a candidate
    P4  Archived offering is readable but never newly assigned
    P5  Capacity exhaustion excludes a candidate
    --  White-label ``institution_id`` restricts candidates to one institution
        (R2.2) — added by task 6.1 alongside the unit matrix in
        ``backend/tests/unit/test_offering_assignment.py``.

Each backend property test is configured to run ≥100 examples with
``--hypothesis-seed=0`` (see ``HYPOTHESIS_SETTINGS`` below).

Task 6.2 (done) made ``OfferingAssignmentService.assign(...)`` sort by the full
design tuple ``(program_intake.assignment_priority, offering.assignment_priority,
code, id)``; the P2 properties below are hard passes (the Phase 0 strict-xfail
markers were removed once the service was fixed).

**Validates: Requirements R2.1, R2.2, R2.3, R2.4, R2.5, R2.6, R14.1**
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.catalog.models import Program
from apps.catalog.services import (
    OfferingAssignmentError,
    OfferingAssignmentService,
)
from tests.tenant_fixtures import (
    CandidateSpec,
    build_assignment_scenario,
    build_canonical_program,
    build_intake,
    build_white_label_scenario,
)


# ---------------------------------------------------------------------------
# Shared strategies for assignment scenarios (P1 / P2 — task 1.3)
# ---------------------------------------------------------------------------

# Offering / program-intake ``assignment_priority`` values. ``IntegerField``
# in production; lower wins. We keep the band wide enough to generate ties and
# inversions but bounded so scenarios stay cheap to build.
PRIORITY = st.integers(min_value=0, max_value=1000)
# Program-intake priority is nullable in the schema (legacy-null rows fall back
# to the offering priority in the current service).
OPTIONAL_PRIORITY = st.one_of(st.none(), PRIORITY)

# (offering_priority, program_intake_priority) pairs, one per candidate offering.
CANDIDATE_PRIORITIES = st.lists(
    st.tuples(PRIORITY, OPTIONAL_PRIORITY),
    min_size=1,
    max_size=5,
)


# ---------------------------------------------------------------------------
# Shared strategies for eligibility scenarios (P3 / P4 / P5 — task 1.4)
# ---------------------------------------------------------------------------

# Every eligibility scenario fixes a single applicant so the test oracle is
# trivial: we know by construction which candidates a rule blocks.
APPLICANT_COUNTRY = "Zambia"
APPLICANT_NATIONALITY = "Zambian"

# Rules that BLOCK the fixed applicant. The current service
# (``OfferingAssignmentService._rules_match``) reads the keys
# ``countries`` / ``exclude_countries`` / ``nationalities`` /
# ``exclude_nationalities`` case-insensitively, so each of these excludes a
# Zambian applicant from Zambia: explicit exclusion, or an allow-list that
# omits them. The lowercase variant pins the case-insensitive contract.
_BLOCKING_RULES: list[dict[str, Any]] = [
    {"exclude_countries": ["Zambia"]},
    {"exclude_nationalities": ["Zambian"]},
    {"countries": ["Narnia"]},  # allow-list excludes Zambia
    {"nationalities": ["Elvish"]},  # allow-list excludes Zambian
    {"exclude_countries": ["zambia"]},  # case-insensitivity
]

# Rules that ALLOW the fixed applicant (incl. "no rules" sentinels).
_ALLOWING_RULES: list[dict[str, Any] | None] = [
    None,
    {},
    {"countries": ["Zambia"]},
    {"nationalities": ["Zambian"]},
    {"exclude_countries": ["Narnia"]},
    {"exclude_nationalities": ["Elvish"]},
    {"countries": ["Zambia", "Narnia"]},
]

# One candidate descriptor for the residency property: whether it is blocked,
# which rule slot carries the rule (offering ``assignment_rules`` vs
# program-intake ``residency_rules`` — both must be honoured per R2.3), and the
# concrete blocking/allowing rule.
RESIDENCY_CANDIDATE = st.fixed_dictionaries(
    {
        "blocked": st.booleans(),
        "slot": st.sampled_from(["offering", "intake"]),
        "block_rule": st.sampled_from(_BLOCKING_RULES),
        "allow_rule": st.sampled_from(_ALLOWING_RULES),
    }
)
RESIDENCY_CANDIDATES = st.lists(RESIDENCY_CANDIDATE, min_size=1, max_size=4)

# Archived scenario: one boolean per candidate (True → archived offering).
ARCHIVED_FLAGS = st.lists(st.booleans(), min_size=1, max_size=4)

# Capacity scenario: per-candidate (capacity, fill). A candidate is exhausted
# when ``fill >= capacity`` — mirrors ``_has_capacity`` (``current < capacity``).
# The ``fill`` band straddles ``capacity`` so both the boundary (``fill ==
# capacity``) and headroom (``fill < capacity``) are generated.
CAPACITY_CANDIDATE = st.fixed_dictionaries(
    {
        "capacity": st.integers(min_value=1, max_value=30),
        "fill": st.integers(min_value=0, max_value=40),
    }
)
CAPACITY_CANDIDATES = st.lists(CAPACITY_CANDIDATE, min_size=1, max_size=4)


# ---------------------------------------------------------------------------
# White-label institution filter strategy (R2.2 — task 6.1)
# ---------------------------------------------------------------------------

# A white-label scenario builds several institutions that each offer the SAME
# canonical program + intake. Each institution gets 1–3 candidate offerings
# with random offering / program-intake priorities so the per-institution
# winner is itself a non-trivial assignment. ``min_size=2`` guarantees there is
# always at least one OTHER institution whose offerings must never be selected
# when ``institution_id`` is supplied.
WL_INSTITUTION = st.lists(
    st.tuples(PRIORITY, OPTIONAL_PRIORITY),
    min_size=1,
    max_size=3,
)
WHITE_LABEL_INSTITUTIONS = st.lists(WL_INSTITUTION, min_size=2, max_size=4)


def _fresh_token() -> str:
    """A short uppercase token unique per generated example.

    Offerings need distinct ``programs.code`` values to coexist, and within a
    single property test every generated example shares one DB transaction, so
    each example must mint its own token to avoid code collisions.
    """
    return uuid.uuid4().hex[:8].upper()


def _assign(scenario, *, country="Zambia", nationality="Zambian"):
    """Run ``OfferingAssignmentService.assign`` for a built scenario."""
    return OfferingAssignmentService().assign(
        program_id=scenario.canonical_program_id,
        intake_id=scenario.intake_id,
        country=country,
        nationality=nationality,
    )


def _winning_program_intake_priority(scenario, *, country="Zambia", nationality="Zambian"):
    """Return the program-intake ``assignment_priority`` of the assigned offering."""
    winner = _assign(scenario, country=country, nationality=nationality).offering
    for cand in scenario.candidates:
        if cand.offering.id == winner.id:
            return cand.program_intake_priority
    raise AssertionError("assigned offering was not among the scenario candidates")


# ≥100 examples, deadline relaxed for DB-backed assignment; seed pinned via
# the CLI flag ``--hypothesis-seed=0`` per the design's Testing Strategy.
HYPOTHESIS_SETTINGS = settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)


# ---------------------------------------------------------------------------
# P1 — Assignment determinism
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestAssignmentDeterminism:
    """P1: same ``(program, intake, residency, white-label)`` inputs always
    yield the same single offering.

    **Validates: Requirements R2.1, R2.5, R14.1**
    """

    def test_assign_is_deterministic_for_single_offering(self, tenant_world):
        """Concrete check: two identical assign() calls return the same single
        offering when only one candidate exists."""
        service = OfferingAssignmentService()
        first = service.assign(
            program_id=tenant_world.canonical_program_id,
            intake_id=tenant_world.intake_id,
            country="Zambia",
            nationality="Zambian",
        )
        second = service.assign(
            program_id=tenant_world.canonical_program_id,
            intake_id=tenant_world.intake_id,
            country="Zambia",
            nationality="Zambian",
        )
        assert first.offering.id == second.offering.id == tenant_world.offering.id
        assert first.institution.id == tenant_world.institution.id

    @HYPOTHESIS_SETTINGS
    @given(priorities=CANDIDATE_PRIORITIES)
    def test_assign_is_deterministic_over_many_candidates(self, priorities):
        """P1: with N competing offerings for one canonical program + intake,
        ``assign`` is a deterministic function of its inputs.

        Generators randomise both offering ``assignment_priority`` and the
        program-intake ``assignment_priority`` (incl. legacy-null). The chosen
        offering must (a) be one of the candidates, (b) be identical across
        repeated calls, and (c) be identical regardless of the row insertion
        order — a pure function of the inputs, never of DB iteration order.
        """
        specs = [
            CandidateSpec(offering_priority=off, program_intake_priority=pi)
            for off, pi in priorities
        ]
        scenario = build_assignment_scenario(specs)
        candidate_ids = {str(o.id) for o in scenario.offerings}

        first = _assign(scenario)
        second = _assign(scenario)

        # (a) result is one of the generated candidates
        assert str(first.offering.id) in candidate_ids
        # (b) repeated calls are stable
        assert first.offering.id == second.offering.id
        # the institution + canonical program resolve consistently too
        assert first.institution.id == scenario.institution.id
        assert str(first.canonical_program.id) == scenario.canonical_program_id

    @HYPOTHESIS_SETTINGS
    @given(
        rows=st.lists(
            st.tuples(PRIORITY, st.integers(min_value=0, max_value=1000)),
            min_size=1,
            max_size=5,
            unique_by=lambda pair: pair[1],  # distinct program-intake priorities
        )
    )
    def test_assignment_independent_of_insertion_order(self, rows):
        """P1: the same candidate set inserted in a different row order must
        select the same offering.

        To make the choice comparable across two independent builds (which need
        distinct ``programs.code`` values to coexist in one transaction), each
        candidate is given a **distinct program-intake priority**. With no ties
        on the primary key, the winner is fully determined by priority and is
        independent of offering code / row insertion order. We then build the
        candidates forward and reversed and assert both pick the candidate with
        the minimum program-intake priority.
        """
        token = uuid.uuid4().hex[:8].upper()
        forward_specs = [
            CandidateSpec(
                offering_priority=off,
                program_intake_priority=pi,
                code=f"OFF-{token}-F-{index:02d}",
            )
            for index, (off, pi) in enumerate(rows)
        ]
        backward_specs = [
            CandidateSpec(
                offering_priority=off,
                program_intake_priority=pi,
                code=f"OFF-{token}-B-{index:02d}",
            )
            for index, (off, pi) in enumerate(reversed(rows))
        ]
        forward = build_assignment_scenario(forward_specs)
        backward = build_assignment_scenario(backward_specs)

        winning_pi_forward = _winning_program_intake_priority(forward)
        winning_pi_backward = _winning_program_intake_priority(backward)

        expected_min = min(pi for _, pi in rows)
        assert winning_pi_forward == expected_min
        assert winning_pi_backward == expected_min


# ---------------------------------------------------------------------------
# P2 — Priority ordering and deterministic tie-break
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestPriorityOrdering:
    """P2: program-intake priority dominates offering priority; ties resolved
    deterministically by offering code/id.

    The design's ``OfferingAssignmentService`` algorithm (design.md, step 5)
    sorts candidates by::

        (program_intake.assignment_priority,
         offering.assignment_priority,   # lower wins, secondary key
         offering.code,
         offering.id)

    These tests pin that ordering. Lower priority value wins.

    **Validates: Requirements R2.5, R14.1**
    """

    def test_program_intake_priority_dominates_offering_priority(self):
        """P2a: a candidate with the lowest program-intake priority wins even
        when its *offering* priority is the worst in the set.

        Two offerings:
          A: offering_priority=1   (best offering), program_intake_priority=50
          B: offering_priority=999 (worst offering), program_intake_priority=10

        Program-intake priority dominates, so B (pi=10) must win despite its
        terrible offering priority.
        """
        scenario = build_assignment_scenario(
            [
                CandidateSpec(offering_priority=1, program_intake_priority=50, code="OFFER-A"),
                CandidateSpec(offering_priority=999, program_intake_priority=10, code="OFFER-B"),
            ]
        )
        winner = _assign(scenario).offering
        assert winner.code == "OFFER-B"

    def test_offering_priority_breaks_tie_when_program_intake_priority_equal(self):
        """P2b: when two candidates share the same program-intake priority, the
        *offering* ``assignment_priority`` is the next key (lower wins).

        Two offerings, identical program-intake priority (both 20):
          A: offering_priority=5
          B: offering_priority=900

        Per the design sort key, A (offering_priority=5) must win. This is the
        secondary-key behaviour the design mandates.
        """
        scenario = build_assignment_scenario(
            [
                CandidateSpec(offering_priority=5, program_intake_priority=20, code="OFFER-LOWOFF"),
                CandidateSpec(offering_priority=900, program_intake_priority=20, code="OFFER-HIGHOFF"),
            ]
        )
        winner = _assign(scenario).offering
        assert winner.code == "OFFER-LOWOFF"

    def test_tie_break_by_code_when_all_priorities_equal(self):
        """P2c: when every priority is equal, ties resolve deterministically by
        offering ``code`` (the design's tertiary key)."""
        scenario = build_assignment_scenario(
            [
                CandidateSpec(offering_priority=100, program_intake_priority=10, code="OFFER-ZZZ"),
                CandidateSpec(offering_priority=100, program_intake_priority=10, code="OFFER-AAA"),
                CandidateSpec(offering_priority=100, program_intake_priority=10, code="OFFER-MMM"),
            ]
        )
        winner = _assign(scenario).offering
        assert winner.code == "OFFER-AAA"

    @HYPOTHESIS_SETTINGS
    @given(priorities=CANDIDATE_PRIORITIES)
    def test_assigned_offering_minimises_design_sort_key(self, priorities):
        """P2 (property): the assigned offering is exactly the minimum under the
        design's lexicographic sort key.

        Expected key per candidate (design.md step 5)::

            (program_intake.assignment_priority,
             offering.assignment_priority,
             offering.code)

        with legacy-null program-intake priority falling back to the offering
        priority for the *primary* slot. The service must return the candidate
        that minimises this tuple.
        """
        token = uuid.uuid4().hex[:8].upper()
        specs = [
            CandidateSpec(
                offering_priority=off,
                program_intake_priority=pi,
                code=f"OFFER-{token}-{index:03d}",
            )
            for index, (off, pi) in enumerate(priorities)
        ]
        scenario = build_assignment_scenario(specs)

        def expected_key(cand):
            primary = (
                cand.program_intake_priority
                if cand.program_intake_priority is not None
                else cand.offering_priority
            )
            secondary = cand.offering_priority if cand.offering_priority is not None else 100
            return (primary, secondary, cand.offering.code, str(cand.offering.id))

        expected_winner = min(scenario.candidates, key=expected_key).offering
        actual_winner = _assign(scenario).offering

        assert actual_winner.code == expected_winner.code, (
            "assigned offering is not the minimum under the design's "
            "(program_intake_priority, offering_priority, code, id) sort key"
        )


# ---------------------------------------------------------------------------
# P3 — Residency / country / nationality block
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestResidencyBlock:
    """P3: residency/country/nationality rules exclude blocked candidates.

    The current ``OfferingAssignmentService`` applies BOTH the offering's
    ``assignment_rules`` and the program-intake's ``residency_rules`` against
    the applicant's ``country``/``nationality`` (design.md step 4), reading the
    keys ``countries`` / ``exclude_countries`` / ``nationalities`` /
    ``exclude_nationalities`` case-insensitively. A blocked candidate is never
    assigned.

    **Validates: Requirements R2.3, R14.1**
    """

    def test_blocked_country_raises_no_eligible_offering(self, tenant_world_factory):
        """Concrete check: a single offering that excludes the applicant's
        country leaves no candidate, so assign() raises ``NO_ELIGIBLE_OFFERING``."""
        world = tenant_world_factory(
            residency_rules={"exclude_countries": ["Zambia"]},
        )
        service = OfferingAssignmentService()
        with pytest.raises(OfferingAssignmentError) as exc_info:
            service.assign(
                program_id=world.canonical_program_id,
                intake_id=world.intake_id,
                country="Zambia",
                nationality="Zambian",
            )
        assert exc_info.value.code == "NO_ELIGIBLE_OFFERING"

    def test_offering_assignment_rules_block_independently(self, tenant_world_factory):
        """Concrete check: the *offering's* ``assignment_rules`` block the
        applicant even when the program-intake ``residency_rules`` are open."""
        world = tenant_world_factory(
            assignment_rules={"exclude_nationalities": ["Zambian"]},
            residency_rules=None,
        )
        service = OfferingAssignmentService()
        with pytest.raises(OfferingAssignmentError) as exc_info:
            service.assign(
                program_id=world.canonical_program_id,
                intake_id=world.intake_id,
                country="Zambia",
                nationality="Zambian",
            )
        assert exc_info.value.code == "NO_ELIGIBLE_OFFERING"

    @HYPOTHESIS_SETTINGS
    @given(candidates=RESIDENCY_CANDIDATES)
    def test_blocked_candidates_never_assigned(self, candidates):
        """P3 (property): across a mix of blocked and allowed candidates, the
        assigned offering is never one whose rule blocks the applicant; and the
        service raises ``NO_ELIGIBLE_OFFERING`` exactly when every candidate is
        blocked.

        Each candidate carries its blocking/allowing rule on either the offering
        (``assignment_rules``) or the program-intake (``residency_rules``) slot —
        proving both rule sources are honoured (R2.3).
        """
        token = _fresh_token()
        specs: list[CandidateSpec] = []
        blocked_codes: set[str] = set()
        allowed_codes: set[str] = set()
        for index, cand in enumerate(candidates):
            code = f"RES-{token}-{index:02d}"
            rule = cand["block_rule"] if cand["blocked"] else cand["allow_rule"]
            spec = CandidateSpec(code=code)
            if cand["slot"] == "offering":
                spec.assignment_rules = rule
            else:
                spec.residency_rules = rule
            specs.append(spec)
            (blocked_codes if cand["blocked"] else allowed_codes).add(code)

        scenario = build_assignment_scenario(specs)
        service = OfferingAssignmentService()

        if not allowed_codes:
            # Every candidate is blocked → no eligible offering.
            with pytest.raises(OfferingAssignmentError) as exc_info:
                service.assign(
                    program_id=scenario.canonical_program_id,
                    intake_id=scenario.intake_id,
                    country=APPLICANT_COUNTRY,
                    nationality=APPLICANT_NATIONALITY,
                )
            assert exc_info.value.code == "NO_ELIGIBLE_OFFERING"
        else:
            result = service.assign(
                program_id=scenario.canonical_program_id,
                intake_id=scenario.intake_id,
                country=APPLICANT_COUNTRY,
                nationality=APPLICANT_NATIONALITY,
            )
            # The winner must be an allowed candidate, never a blocked one.
            assert result.offering.code in allowed_codes
            assert result.offering.code not in blocked_codes


# ---------------------------------------------------------------------------
# P4 — Archived offering readable but never newly assigned
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestArchivedOfferingExcluded:
    """P4: an archived offering is excluded from new assignment but stays
    readable.

    The current candidate query filters ``offering_status='active'`` (design.md
    step 2), so ``offering_status='archived'`` removes the offering from
    assignment. Readability is part of the invariant: the archived row must
    still be queryable through the ORM (it is only excluded from *assignment*,
    not from the database).

    **Validates: Requirements R2.1, R14.1**
    """

    def test_archived_offering_not_assigned_but_readable(self, tenant_world_factory):
        """Concrete check: ``offering_status='archived'`` removes the only
        candidate (assign raises ``NO_ELIGIBLE_OFFERING``) while the offering
        row remains queryable via the ORM."""
        world = tenant_world_factory(offering_status="archived")
        service = OfferingAssignmentService()
        with pytest.raises(OfferingAssignmentError) as exc_info:
            service.assign(
                program_id=world.canonical_program_id,
                intake_id=world.intake_id,
                country="Zambia",
                nationality="Zambian",
            )
        assert exc_info.value.code == "NO_ELIGIBLE_OFFERING"

        # Readability invariant: the archived offering is still in the DB.
        assert Program.objects.filter(id=world.offering.id).exists()
        reread = Program.objects.get(id=world.offering.id)
        assert reread.offering_status == "archived"

    @HYPOTHESIS_SETTINGS
    @given(flags=ARCHIVED_FLAGS)
    def test_archived_excluded_active_assigned(self, flags):
        """P4 (property): with a mix of archived and active offerings, the
        assigned offering is always active; archived offerings are never chosen
        yet always remain readable; and assignment fails only when every
        candidate is archived.
        """
        token = _fresh_token()
        specs: list[CandidateSpec] = []
        archived_codes: set[str] = set()
        active_codes: set[str] = set()
        for index, is_archived in enumerate(flags):
            code = f"ARC-{token}-{index:02d}"
            specs.append(
                CandidateSpec(
                    code=code,
                    offering_status="archived" if is_archived else "active",
                )
            )
            (archived_codes if is_archived else active_codes).add(code)

        scenario = build_assignment_scenario(specs)
        service = OfferingAssignmentService()

        if not active_codes:
            with pytest.raises(OfferingAssignmentError) as exc_info:
                service.assign(
                    program_id=scenario.canonical_program_id,
                    intake_id=scenario.intake_id,
                    country="Zambia",
                    nationality="Zambian",
                )
            assert exc_info.value.code == "NO_ELIGIBLE_OFFERING"
        else:
            result = service.assign(
                program_id=scenario.canonical_program_id,
                intake_id=scenario.intake_id,
                country="Zambia",
                nationality="Zambian",
            )
            assert result.offering.code in active_codes
            assert result.offering.code not in archived_codes

        # Readability invariant holds for every candidate, archived or not:
        # all rows remain queryable regardless of assignment eligibility.
        for offering in scenario.offerings:
            assert Program.objects.filter(id=offering.id).exists()
        archived_in_db = set(
            Program.objects.filter(
                id__in=[o.id for o in scenario.offerings],
                offering_status="archived",
            ).values_list("code", flat=True)
        )
        assert archived_in_db == archived_codes


# ---------------------------------------------------------------------------
# P5 — Capacity exhaustion
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestCapacityExhaustion:
    """P5: a capacity-exhausted program-intake is excluded from assignment.

    The current ``OfferingAssignmentService._has_capacity`` excludes a candidate
    when ``current_enrollment >= effective_capacity`` (program-intake capacity,
    falling back to the intake capacity). At the boundary ``current == capacity``
    the candidate is full; with ``current < capacity`` it has headroom.

    **Validates: Requirements R2.4, R14.1**
    """

    def test_full_capacity_excludes_candidate(self, tenant_world_factory):
        """Concrete check: ``current_enrollment == max_capacity`` removes the
        only candidate, so assign() raises ``NO_ELIGIBLE_OFFERING``."""
        world = tenant_world_factory(max_capacity=10, current_enrollment=10)
        service = OfferingAssignmentService()
        with pytest.raises(OfferingAssignmentError) as exc_info:
            service.assign(
                program_id=world.canonical_program_id,
                intake_id=world.intake_id,
                country="Zambia",
                nationality="Zambian",
            )
        assert exc_info.value.code == "NO_ELIGIBLE_OFFERING"

    def test_one_seat_of_headroom_is_assignable(self, tenant_world_factory):
        """Concrete boundary check: ``current_enrollment == max_capacity - 1``
        leaves exactly one seat, so the candidate is assignable."""
        world = tenant_world_factory(max_capacity=10, current_enrollment=9)
        service = OfferingAssignmentService()
        result = service.assign(
            program_id=world.canonical_program_id,
            intake_id=world.intake_id,
            country="Zambia",
            nationality="Zambian",
        )
        assert result.offering.id == world.offering.id

    @HYPOTHESIS_SETTINGS
    @given(candidates=CAPACITY_CANDIDATES)
    def test_capacity_exhausted_candidates_excluded(self, candidates):
        """P5 (property): an offering whose program-intake is full
        (``fill >= capacity``) is never assigned; the winner always has
        headroom; and assignment fails only when every candidate is full.
        """
        token = _fresh_token()
        specs: list[CandidateSpec] = []
        full_codes: set[str] = set()
        open_codes: set[str] = set()
        for index, cand in enumerate(candidates):
            code = f"CAP-{token}-{index:02d}"
            capacity = cand["capacity"]
            fill = cand["fill"]
            specs.append(
                CandidateSpec(
                    code=code,
                    max_capacity=capacity,
                    current_enrollment=fill,
                )
            )
            (full_codes if fill >= capacity else open_codes).add(code)

        # A large shared intake capacity ensures the program-intake capacity is
        # the binding constraint, not the intake-level fallback.
        scenario = build_assignment_scenario(specs, intake_max_capacity=10_000)
        service = OfferingAssignmentService()

        if not open_codes:
            with pytest.raises(OfferingAssignmentError) as exc_info:
                service.assign(
                    program_id=scenario.canonical_program_id,
                    intake_id=scenario.intake_id,
                    country="Zambia",
                    nationality="Zambian",
                )
            assert exc_info.value.code == "NO_ELIGIBLE_OFFERING"
        else:
            result = service.assign(
                program_id=scenario.canonical_program_id,
                intake_id=scenario.intake_id,
                country="Zambia",
                nationality="Zambian",
            )
            assert result.offering.code in open_codes
            assert result.offering.code not in full_codes


# ---------------------------------------------------------------------------
# White-label — institution_id restricts candidates (R2.2)
# ---------------------------------------------------------------------------


@pytest.mark.django_db
class TestWhiteLabelInstitutionFilter:
    """R2.2: when a white-label ``institution_id`` is supplied, the candidate
    set is restricted to that institution only.

    The design's ``OfferingAssignmentService`` algorithm (design.md step 3)
    applies ``queryset.filter(institution_id=institution_id)`` before scoring,
    so a white-label portal never resolves to another school's offering even
    when another school has a strictly better (lower) priority for the same
    canonical program + intake.

    **Validates: Requirements R2.2, R14.1**
    """

    def test_institution_filter_selects_within_institution(self):
        """Concrete check: two institutions offer the same canonical program +
        intake. Passing institution A's id assigns A's offering; passing B's id
        assigns B's offering — the filter, not priority, picks the school."""
        canonical = build_canonical_program(suffix="wl-concrete")
        intake = build_intake(suffix="wl-concrete", max_capacity=10_000)
        # A: best possible priority; B: worst possible priority.
        scenario_a = build_assignment_scenario(
            [CandidateSpec(offering_priority=1, program_intake_priority=1, code="WL-A")],
            suffix="wl-a",
            canonical_program=canonical,
            intake=intake,
        )
        scenario_b = build_assignment_scenario(
            [CandidateSpec(offering_priority=999, program_intake_priority=999, code="WL-B")],
            suffix="wl-b",
            canonical_program=canonical,
            intake=intake,
        )
        service = OfferingAssignmentService()

        result_a = service.assign(
            program_id=str(canonical.id),
            intake_id=str(intake.id),
            country="Zambia",
            nationality="Zambian",
            institution_id=scenario_a.institution_id,
        )
        result_b = service.assign(
            program_id=str(canonical.id),
            intake_id=str(intake.id),
            country="Zambia",
            nationality="Zambian",
            institution_id=scenario_b.institution_id,
        )

        assert result_a.institution.id == scenario_a.institution.id
        assert result_a.offering.code == "WL-A"
        # B wins under its own filter despite a far worse priority than A.
        assert result_b.institution.id == scenario_b.institution.id
        assert result_b.offering.code == "WL-B"

    def test_institution_filter_does_not_fall_back_to_other_school(self):
        """Concrete check: a white-label institution whose only offering is
        archived raises ``NO_ELIGIBLE_OFFERING`` rather than silently falling
        back to another active school's offering for the same program."""
        canonical = build_canonical_program(suffix="wl-nofallback")
        intake = build_intake(suffix="wl-nofallback", max_capacity=10_000)
        # White-label school: only an archived offering (ineligible).
        wl_scenario = build_assignment_scenario(
            [CandidateSpec(offering_status="archived", code="WL-ARCHIVED")],
            suffix="wl-archived",
            canonical_program=canonical,
            intake=intake,
        )
        # Another school has a perfectly good active offering for the same slot.
        build_assignment_scenario(
            [CandidateSpec(offering_status="active", code="OTHER-ACTIVE")],
            suffix="wl-other",
            canonical_program=canonical,
            intake=intake,
        )
        service = OfferingAssignmentService()
        with pytest.raises(OfferingAssignmentError) as exc_info:
            service.assign(
                program_id=str(canonical.id),
                intake_id=str(intake.id),
                country="Zambia",
                nationality="Zambian",
                institution_id=wl_scenario.institution_id,
            )
        assert exc_info.value.code == "NO_ELIGIBLE_OFFERING"

    @HYPOTHESIS_SETTINGS
    @given(institutions=WHITE_LABEL_INSTITUTIONS)
    def test_white_label_filter_never_crosses_institution(self, institutions):
        """R2.2 (property): with ≥2 institutions offering the same canonical
        program + intake, ``assign(institution_id=X)`` always returns an
        offering belonging to institution X — never another school's offering,
        regardless of how much better the other school's priorities are.

        For each institution in the generated set we run a filtered assignment
        and assert the chosen offering's ``institution_id`` is exactly that
        institution and the chosen offering is one of that institution's own
        candidates.
        """
        specs_per_institution = [
            [
                CandidateSpec(offering_priority=off, program_intake_priority=pi)
                for off, pi in inst_priorities
            ]
            for inst_priorities in institutions
        ]
        world = build_white_label_scenario(specs_per_institution)
        service = OfferingAssignmentService()

        for scenario in world.scenarios:
            own_offering_ids = {str(o.id) for o in scenario.offerings}
            result = service.assign(
                program_id=world.canonical_program_id,
                intake_id=world.intake_id,
                country="Zambia",
                nationality="Zambian",
                institution_id=scenario.institution_id,
            )
            assert result.institution.id == scenario.institution.id
            assert str(result.offering.id) in own_offering_ids

    @HYPOTHESIS_SETTINGS
    @given(institutions=WHITE_LABEL_INSTITUTIONS)
    def test_white_label_winner_matches_within_institution_ranking(self, institutions):
        """R2.2 + R2.5 (property): the white-label winner for institution X is
        exactly the offering that minimises the design sort key *within X's own
        candidate set* — proving the institution filter is applied before, and
        independently of, the priority ranking.
        """
        specs_per_institution = [
            [
                CandidateSpec(offering_priority=off, program_intake_priority=pi)
                for off, pi in inst_priorities
            ]
            for inst_priorities in institutions
        ]
        world = build_white_label_scenario(specs_per_institution)
        service = OfferingAssignmentService()

        def expected_key(cand):
            primary = (
                cand.program_intake_priority
                if cand.program_intake_priority is not None
                else cand.offering_priority
            )
            secondary = cand.offering_priority if cand.offering_priority is not None else 100
            return (primary, secondary, cand.offering.code, str(cand.offering.id))

        for scenario in world.scenarios:
            expected_winner = min(scenario.candidates, key=expected_key).offering
            result = service.assign(
                program_id=world.canonical_program_id,
                intake_id=world.intake_id,
                country="Zambia",
                nationality="Zambian",
                institution_id=scenario.institution_id,
            )
            assert result.offering.code == expected_winner.code
