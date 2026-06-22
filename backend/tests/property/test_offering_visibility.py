"""Property-based test — offering visibility by portal (Property 17).

Feature: enterprise-tenant-authority, Property 17

Spec: ``.kiro/specs/enterprise-tenant-authority`` (task 8.2). Pins the
offering-visibility property from the design's Correctness Properties:

    Property 17 — Offering visibility by portal
    The shared Beanola portal lists exactly the active offerings grouped by
    canonical program across every tenant (no institution filter); a resolved
    tenant portal lists only that tenant's own active offerings (grouped by
    canonical program) and never another tenant's.

This exercises the real
:meth:`apps.catalog.services.OfferingDirectoryService.canonical_program_directory`
(which backs ``CanonicalProgramListView`` at
``GET /api/v1/catalog/canonical-programs/``) and ``resolved_institution_id``
against the test DB — no production code is changed and nothing is mocked.
Hypothesis builds several tenants, each offering a shared pool of canonical
programs with a mix of active and inactive offerings, and asserts visibility
per portal.

An "active offering" is a :class:`apps.catalog.models.Program` row with
``is_active=True`` **and** ``offering_status == "active"``; any other flavor
(deactivated row or non-active status) must never surface in either portal.

Note on accumulation: Hypothesis drives many examples inside a single
``@pytest.mark.django_db`` transaction, so rows from earlier examples persist
for the life of the test. The shared-portal listing spans **every** tenant in
the DB, so the test asserts per-canonical-program *membership* (only about the
canonical programs each example creates) rather than global set equality —
this is robust to cross-example accumulation while still pinning the property.

Run (≥100 examples, SQLite-in-memory test settings)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_offering_visibility.py -q

**Validates: Requirements 8.6, 8.7, 18.3**
"""

from __future__ import annotations

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.catalog.services import OfferingDirectoryService
from tests.tenant_fixtures import (
    build_canonical_program,
    build_institution,
    build_intake,
    build_offering,
    build_program_intake,
)


# ≥100 examples; deadline relaxed for DB-backed listing; the function-scoped
# ``db`` health check is suppressed because every example shares the
# transactional test DB (rolled back per test, isolated per example by fresh
# unique rows and per-id assertions).
HYPOTHESIS_SETTINGS = settings(
    max_examples=120,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)


# Offering flavors. Only ``active`` (is_active AND offering_status == "active")
# counts as a visible offering for either portal (R8.6, R8.7). The other two
# model the deactivated-row and non-active-status cases that must stay hidden.
FLAVORS: dict[str, dict[str, object]] = {
    "active": {"is_active": True, "offering_status": "active"},
    "inactive_flag": {"is_active": False, "offering_status": "active"},
    "inactive_status": {"is_active": True, "offering_status": "inactive"},
}
FLAVOR_NAMES = sorted(FLAVORS)


@st.composite
def directory_layouts(draw):
    """Generate a multi-tenant offering layout over a shared canonical pool.

    Returns ``(num_canonical, tenants)`` where ``tenants`` is a list (one per
    institution) of ``(canonical_index, flavor)`` offering specs. Every tenant
    draws from the same pool of canonical programs so the shared portal must
    group across tenants while each tenant portal stays scoped to its own
    offerings.
    """
    num_canonical = draw(st.integers(min_value=1, max_value=4))
    num_tenants = draw(st.integers(min_value=2, max_value=3))
    offering_spec = st.tuples(
        st.integers(min_value=0, max_value=num_canonical - 1),
        st.sampled_from(FLAVOR_NAMES),
    )
    tenants = [
        draw(st.lists(offering_spec, min_size=0, max_size=5))
        for _ in range(num_tenants)
    ]
    return num_canonical, tenants


@pytest.mark.django_db
class TestOfferingVisibilityByPortal:
    """Property 17 — offering visibility by portal.

    **Validates: Requirements 8.6, 8.7, 18.3**
    """

    @HYPOTHESIS_SETTINGS
    @given(layout=directory_layouts())
    def test_offering_visibility_by_portal(self, layout):
        """For an arbitrary multi-tenant offering layout:

        - the shared Beanola portal (no ``institution_id``) lists a canonical
          program iff at least one tenant has an **active** offering of it
          (R8.6); and
        - each tenant portal (``institution_id`` set) lists a canonical program
          iff **that tenant** has an active offering of it, never one offered
          only by another tenant (R8.7, R18.3).
        """
        num_canonical, tenants = layout
        service = OfferingDirectoryService()

        # Fresh canonical pool for this example so per-id assertions are immune
        # to rows accumulated by earlier Hypothesis examples.
        canonicals = [build_canonical_program() for _ in range(num_canonical)]
        canonical_ids = [str(c.id) for c in canonicals]

        shared_active: set[int] = set()  # canonical idx active in ANY tenant
        per_tenant: list[tuple[str, set[int]]] = []  # (institution_id, active idxs)

        for offerings in tenants:
            institution = build_institution()
            active_here: set[int] = set()
            for canonical_index, flavor in offerings:
                build_offering(
                    institution=institution,
                    canonical_program=canonicals[canonical_index],
                    **FLAVORS[flavor],
                )
                if flavor == "active":
                    active_here.add(canonical_index)
                    shared_active.add(canonical_index)
            per_tenant.append((str(institution.id), active_here))

        # --- Shared Beanola portal (R8.6): groups active offerings across all
        # tenants by canonical program. Assert membership only for the canonical
        # programs this example created (accumulation-safe).
        shared_ids = {str(c.id) for c in service.canonical_program_directory()}
        for index, canonical_id in enumerate(canonical_ids):
            assert (canonical_id in shared_ids) == (index in shared_active), (
                f"shared portal mismatch for canonical {index}: "
                f"present={canonical_id in shared_ids}, expected={index in shared_active}"
            )

        # --- Tenant portals (R8.7, R18.3): each lists only its own active
        # offerings, never another tenant's.
        for institution_id, active_here in per_tenant:
            tenant_ids = {
                str(c.id)
                for c in service.canonical_program_directory(institution_id=institution_id)
            }
            for index, canonical_id in enumerate(canonical_ids):
                assert (canonical_id in tenant_ids) == (index in active_here), (
                    f"tenant {institution_id} mismatch for canonical {index}: "
                    f"present={canonical_id in tenant_ids}, expected={index in active_here}"
                )
            # A canonical active only in a *different* tenant must never leak
            # into this tenant's portal (explicit cross-tenant isolation).
            other_only = (shared_active - active_here)
            for index in other_only:
                assert canonical_ids[index] not in tenant_ids, (
                    f"tenant {institution_id} leaked canonical {index} offered "
                    "only by another tenant"
                )


@pytest.mark.django_db
class TestOfferingVisibilityExamples:
    """Concrete edge cases complementing the property (unit coverage).

    **Validates: Requirements 8.6, 8.7, 18.3**
    """

    def test_shared_portal_spans_tenants_grouped_by_canonical(self):
        """Two tenants offering the same canonical program collapse to a single
        grouped entry in the shared portal (R8.6)."""
        service = OfferingDirectoryService()
        canonical = build_canonical_program()
        inst_a = build_institution()
        inst_b = build_institution()
        build_offering(institution=inst_a, canonical_program=canonical)
        build_offering(institution=inst_b, canonical_program=canonical)

        shared = list(service.canonical_program_directory())
        matches = [c for c in shared if str(c.id) == str(canonical.id)]
        # Grouped by canonical program: exactly one row despite two offerings.
        assert len(matches) == 1

    def test_tenant_portal_lists_only_its_own_offering(self):
        """A resolved tenant portal lists only the resolving tenant's offering
        and never the other tenant's, even for the same canonical program
        (R8.7, R18.3)."""
        service = OfferingDirectoryService()
        canonical_shared = build_canonical_program()
        canonical_b_only = build_canonical_program()

        inst_a = build_institution()
        inst_b = build_institution()
        build_offering(institution=inst_a, canonical_program=canonical_shared)
        build_offering(institution=inst_b, canonical_program=canonical_shared)
        build_offering(institution=inst_b, canonical_program=canonical_b_only)

        a_ids = {
            str(c.id)
            for c in service.canonical_program_directory(institution_id=str(inst_a.id))
        }
        assert str(canonical_shared.id) in a_ids
        # The canonical only offered by tenant B must not appear in A's portal.
        assert str(canonical_b_only.id) not in a_ids

    def test_inactive_offering_hidden_in_both_portals(self):
        """An offering that is deactivated or not in ``active`` status is hidden
        from both the shared and the tenant portal (R8.6, R8.7)."""
        service = OfferingDirectoryService()
        canonical_dead = build_canonical_program()
        institution = build_institution()
        build_offering(
            institution=institution,
            canonical_program=canonical_dead,
            is_active=False,
            offering_status="active",
        )

        shared_ids = {str(c.id) for c in service.canonical_program_directory()}
        tenant_ids = {
            str(c.id)
            for c in service.canonical_program_directory(institution_id=str(institution.id))
        }
        assert str(canonical_dead.id) not in shared_ids
        assert str(canonical_dead.id) not in tenant_ids

    def test_intake_filter_constrains_directory(self):
        """``intake_id`` restricts the listing to canonical programs with an
        active program-intake in that period (R8.6 intake constraint)."""
        service = OfferingDirectoryService()
        canonical = build_canonical_program()
        institution = build_institution()
        offering = build_offering(institution=institution, canonical_program=canonical)
        intake_in = build_intake()
        intake_other = build_intake()
        build_program_intake(offering=offering, intake=intake_in)

        in_ids = {
            str(c.id)
            for c in service.canonical_program_directory(intake_id=str(intake_in.id))
        }
        other_ids = {
            str(c.id)
            for c in service.canonical_program_directory(intake_id=str(intake_other.id))
        }
        assert str(canonical.id) in in_ids
        assert str(canonical.id) not in other_ids

    def test_resolved_institution_id_prefers_explicit_then_context(self):
        """``resolved_institution_id`` returns the explicit request id, else the
        resolved tenant from context, else ``None`` for the shared portal
        (R8.7)."""
        service = OfferingDirectoryService()
        institution = build_institution()

        class _Ctx:
            def __init__(self, inst):
                self.institution = inst

        # Explicit request id wins over context.
        assert (
            service.resolved_institution_id(_Ctx(institution), requested_institution_id="explicit-id")
            == "explicit-id"
        )
        # Falls back to the resolved tenant from the portal context.
        assert service.resolved_institution_id(_Ctx(institution)) == str(institution.id)
        # Shared Beanola portal: neutral context resolves to None.
        assert service.resolved_institution_id(_Ctx(None)) is None
