"""Property-based test — tenant document requirement resolution (Property 18).

Feature: enterprise-tenant-authority, Property 18

Spec: ``.kiro/specs/enterprise-tenant-authority`` (task 9.2). Pins the
document-requirement-resolution property from the design's Correctness
Properties:

    Property 18 — Tenant document requirement resolution
    Resolution returns the single most-specific *active* profile matching
    (tenant, program, intake), and never a profile belonging to another tenant
    — even when another tenant has a more-specific matching profile.

This exercises the real
:meth:`apps.catalog.services.InstitutionDocumentProfileService.resolve`
against the test DB — no production code is changed and nothing is mocked.

Resolution precedence (most -> least specific), keyed on
``(institution, document_type)`` first:

    offering + intake -> offering -> canonical-program + intake
                      -> canonical program -> institution default

Within the winning specificity level the highest active ``version`` wins;
inactive rows are never selected; the result is ``None`` when no active profile
matches for *this* tenant.

The institution filter is pinned on every candidate scope, so the only scope
dimensions a different tenant can share are ``document_type``,
``canonical_program`` and ``intake`` (offerings are tenant-specific). Hypothesis
therefore builds a *foreign* tenant (B) whose canonical / canonical+intake /
institution-default profiles share those very dimensions with tenant A's
application, frequently at a **more specific** level and a **higher version**
than A's own best profile. A correct resolver must still return A's own
most-specific active profile (or ``None``), never B's decoy.

Run (>=100 examples, SQLite-in-memory test settings)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_document_requirement_resolution.py -q

**Validates: Requirements 9.1**
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.catalog.models import InstitutionDocumentProfile
from apps.catalog.services import InstitutionDocumentProfileService
from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_intake,
    build_offering,
)


DOCUMENT_TYPE = "acceptance_letter"

# Specificity ranks, most-specific (0) -> least-specific (4). The expected
# resolution is the lowest-rank level that has any active profile; within that
# level the highest version wins.
RANK_OFFERING_INTAKE = 0
RANK_OFFERING = 1
RANK_CANONICAL_INTAKE = 2
RANK_CANONICAL = 3
RANK_DEFAULT = 4

# Ranks whose scope columns a *foreign* tenant can share with this application
# (offering-level scopes pin the tenant-specific offering id, so they can never
# match across tenants).
FOREIGN_SHAREABLE_RANKS = (RANK_CANONICAL_INTAKE, RANK_CANONICAL, RANK_DEFAULT)


# >=100 examples; deadline relaxed for DB-backed resolution; the function-scoped
# ``db`` health check is suppressed because every example shares the
# transactional test DB (rolled back per test, isolated per example by fresh
# unique institutions / canonical programs / intakes).
HYPOTHESIS_SETTINGS = settings(
    max_examples=150,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)


def _make_profile(institution, *, program=None, canonical_program=None, intake=None, version=1, is_active=True):
    """Persist one ``institution_document_profiles`` row at a chosen scope."""
    now = timezone.now()
    return InstitutionDocumentProfile.objects.create(
        id=uuid.uuid4(),
        institution=institution,
        document_type=DOCUMENT_TYPE,
        program=program,
        canonical_program=canonical_program,
        intake=intake,
        layout_key="simple_letter",
        sections={},
        fee_chart=[],
        bank_accounts=[],
        requirements=[],
        signatory={},
        version=version,
        is_active=is_active,
        created_at=now,
        updated_at=now,
    )


def _scope_kwargs(rank, *, offering, canonical_program, intake):
    """The scope-column kwargs for a profile at ``rank``."""
    if rank == RANK_OFFERING_INTAKE:
        return {"program": offering, "canonical_program": None, "intake": intake}
    if rank == RANK_OFFERING:
        return {"program": offering, "canonical_program": None, "intake": None}
    if rank == RANK_CANONICAL_INTAKE:
        return {"program": None, "canonical_program": canonical_program, "intake": intake}
    if rank == RANK_CANONICAL:
        return {"program": None, "canonical_program": canonical_program, "intake": None}
    return {"program": None, "canonical_program": None, "intake": None}  # RANK_DEFAULT


@st.composite
def resolution_layouts(draw):
    """Generate tenant-A profiles per rank plus foreign-tenant-B decoys.

    Returns ``(own, foreign)`` where ``own`` maps each rank 0..4 to a list of
    booleans (one per profile at that rank, ``True`` == active) and ``foreign``
    maps each shareable rank to a bool (whether tenant B has an *active* decoy
    there). Versions are assigned deterministically (1..n within a rank) so the
    highest-active-version winner is unambiguous.
    """
    own = {rank: draw(st.lists(st.booleans(), min_size=0, max_size=3)) for rank in range(5)}
    foreign = {rank: draw(st.booleans()) for rank in FOREIGN_SHAREABLE_RANKS}
    return own, foreign


@pytest.mark.django_db
class TestDocumentRequirementResolution:
    """Property 18 — tenant document requirement resolution.

    **Validates: Requirements 9.1**
    """

    @HYPOTHESIS_SETTINGS
    @given(layout=resolution_layouts())
    def test_resolution_is_most_specific_active_and_tenant_isolated(self, layout):
        """For an arbitrary profile layout across tenant A and a foreign tenant B:

        - ``resolve`` returns the single most-specific **active** profile that
          belongs to tenant A (highest version within the winning level), or
          ``None`` when tenant A has no active profile (R9.1); and
        - it **never** returns a profile belonging to tenant B, even when B has
          a more-specific active decoy sharing the same document type, canonical
          program and intake (cross-tenant isolation).
        """
        own, foreign = layout
        service = InstitutionDocumentProfileService()

        # Fresh, shared dimensions for this example: one canonical program and
        # one intake shared by BOTH tenants so the foreign tenant's
        # canonical/intake/default decoys genuinely collide on every dimension
        # except the institution filter.
        canonical = build_canonical_program()
        intake = build_intake()

        institution_a = build_institution()
        offering_a = build_offering(institution=institution_a, canonical_program=canonical)

        institution_b = build_institution()
        offering_b = build_offering(institution=institution_b, canonical_program=canonical)

        # --- Tenant A profiles: version = index + 1 within each rank.
        own_profiles: dict[tuple[int, int], InstitutionDocumentProfile] = {}
        for rank, actives in own.items():
            scope = _scope_kwargs(
                rank, offering=offering_a, canonical_program=canonical, intake=intake
            )
            for index, is_active in enumerate(actives):
                version = index + 1
                own_profiles[(rank, version)] = _make_profile(
                    institution_a, version=version, is_active=is_active, **scope
                )

        # --- Foreign tenant B decoys at the shareable ranks, deliberately at a
        # HIGH version so that if the institution filter were ever dropped the
        # decoy would win.
        foreign_ids: set[str] = set()
        for rank, present in foreign.items():
            if not present:
                continue
            scope = _scope_kwargs(
                rank, offering=offering_b, canonical_program=canonical, intake=intake
            )
            decoy = _make_profile(institution_b, version=99, is_active=True, **scope)
            foreign_ids.add(str(decoy.id))

        # --- Expected winner: lowest rank with any active profile, highest
        # version within it.
        expected_id = None
        for rank in range(5):
            active_indices = [i for i, is_active in enumerate(own[rank]) if is_active]
            if active_indices:
                winner_version = max(active_indices) + 1
                expected_id = str(own_profiles[(rank, winner_version)].id)
                break

        application = SimpleNamespace(
            institution_ref_id=institution_a.id,
            program_offering_id=offering_a.id,
            canonical_program_id=canonical.id,
            intake_ref_id=intake.id,
        )

        result = service.resolve(application, DOCUMENT_TYPE)

        if expected_id is None:
            # Tenant A has no active profile: resolution must be empty and must
            # never borrow tenant B's decoy.
            assert result is None, (
                "expected no profile for tenant A, but resolve returned "
                f"{None if result is None else result.id}"
            )
        else:
            assert result is not None, "expected an active profile but got None"
            assert str(result.id) == expected_id, (
                "resolve did not return the most-specific active profile for tenant A"
            )

        # Cross-tenant isolation: whatever is returned, it is tenant A's and
        # never a foreign-tenant decoy.
        if result is not None:
            assert str(result.institution_id) == str(institution_a.id), (
                "resolve leaked a profile from another tenant"
            )
            assert str(result.id) not in foreign_ids, (
                "resolve returned a foreign tenant's decoy profile"
            )


@pytest.mark.django_db
class TestDocumentRequirementResolutionExamples:
    """Concrete edge cases complementing the property (unit coverage).

    **Validates: Requirements 9.1**
    """

    def _application(self, *, institution, offering, canonical, intake):
        return SimpleNamespace(
            institution_ref_id=institution.id,
            program_offering_id=offering.id,
            canonical_program_id=canonical.id,
            intake_ref_id=intake.id,
        )

    def test_more_specific_foreign_profile_never_wins(self):
        """Tenant A has only an institution-default profile; tenant B has a more
        specific (canonical+intake) active profile sharing the same canonical
        program and intake. Resolution must return A's default, never B's
        decoy (R9.1 cross-tenant isolation)."""
        service = InstitutionDocumentProfileService()
        canonical = build_canonical_program()
        intake = build_intake()

        inst_a = build_institution()
        offering_a = build_offering(institution=inst_a, canonical_program=canonical)
        a_default = _make_profile(inst_a)  # institution default

        inst_b = build_institution()
        _make_profile(
            inst_b, canonical_program=canonical, intake=intake, version=99, is_active=True
        )

        result = service.resolve(
            self._application(institution=inst_a, offering=offering_a, canonical=canonical, intake=intake),
            DOCUMENT_TYPE,
        )
        assert result is not None
        assert str(result.id) == str(a_default.id)
        assert str(result.institution_id) == str(inst_a.id)

    def test_returns_none_when_only_foreign_tenant_has_a_profile(self):
        """Tenant A has no profile at all; tenant B has an institution-default
        active profile. Resolution returns ``None`` and never borrows B's
        profile (R9.1)."""
        service = InstitutionDocumentProfileService()
        canonical = build_canonical_program()
        intake = build_intake()

        inst_a = build_institution()
        offering_a = build_offering(institution=inst_a, canonical_program=canonical)

        inst_b = build_institution()
        _make_profile(inst_b, is_active=True)

        result = service.resolve(
            self._application(institution=inst_a, offering=offering_a, canonical=canonical, intake=intake),
            DOCUMENT_TYPE,
        )
        assert result is None

    def test_most_specific_level_wins_over_less_specific(self):
        """An offering-scoped profile beats an institution-default profile for
        the same tenant (R9.1 most-specific-first)."""
        service = InstitutionDocumentProfileService()
        canonical = build_canonical_program()
        intake = build_intake()
        inst = build_institution()
        offering = build_offering(institution=inst, canonical_program=canonical)

        _make_profile(inst)  # institution default
        offering_profile = _make_profile(inst, program=offering)

        result = service.resolve(
            self._application(institution=inst, offering=offering, canonical=canonical, intake=intake),
            DOCUMENT_TYPE,
        )
        assert str(result.id) == str(offering_profile.id)

    def test_highest_active_version_wins_within_level(self):
        """Within the winning level the highest **active** version wins; an
        inactive higher version is ignored (R9.1 versioning)."""
        service = InstitutionDocumentProfileService()
        canonical = build_canonical_program()
        intake = build_intake()
        inst = build_institution()
        offering = build_offering(institution=inst, canonical_program=canonical)

        _make_profile(inst, program=offering, version=1, is_active=True)
        winner = _make_profile(inst, program=offering, version=2, is_active=True)
        _make_profile(inst, program=offering, version=3, is_active=False)  # inactive, ignored

        result = service.resolve(
            self._application(institution=inst, offering=offering, canonical=canonical, intake=intake),
            DOCUMENT_TYPE,
        )
        assert str(result.id) == str(winner.id)
        assert result.version == 2
