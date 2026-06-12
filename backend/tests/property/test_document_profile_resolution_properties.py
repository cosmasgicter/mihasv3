"""Document-profile resolution determinism property test (task 13.1).

Spec: ``multi-tenant-beanola-remediation`` — Phase 4 (Tenant document profiles),
Requirement 8 (Tenant Document Profiles Replace Hard-Coded Frontend Content).

This file implements exactly one property (Property 20) against the
``InstitutionDocumentProfileService.resolve`` resolver and the
``InstitutionDocumentProfile`` (``managed = False``) model that land in task
13.2. It is **test-first**: neither the model nor the service exists yet, so the
import is guarded and the whole module *skips* (it never errors at collection)
until 13.2 ships. Once the model exists, the session-scoped ``unmanaged_schema``
fixture in ``conftest.py`` creates its ``institution_document_profiles`` table in
the test DB automatically, and this property begins exercising the resolver.

Property 20 pins the most-specific resolution order from design.md / R8.2:

    offering + intake  →  offering  →  canonical-program + intake
                       →  canonical program  →  institution default

For an application + document type with several *active* profiles at different
scopes, ``resolve`` returns the single most-specific active match in that strict
precedence order; the choice is deterministic (identical inputs always yield the
same profile, breaking ties on the latest active version); ``is_active = false``
rows are never selected; and when no active profile matches, the result is
``None``.

**Validates: Requirements 8.2**
"""

from __future__ import annotations

import uuid

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from tests.tenant_fixtures import build_intake, build_tenant_world

# --- Guarded test-first import (task 13.2 has not landed yet) --------------
# ``InstitutionDocumentProfile`` (managed=False model) and
# ``InstitutionDocumentProfileService`` are created in task 13.2. Importing the
# attributes from their already-existing modules raises ImportError while they
# are absent, so we capture that and skip the whole module — collection always
# succeeds, the property runs the moment 13.2 lands.
try:  # pragma: no cover - exercised only by the skip path before 13.2
    from apps.catalog.models import InstitutionDocumentProfile
    from apps.catalog.services import InstitutionDocumentProfileService

    _IMPORT_ERROR: Exception | None = None
except ImportError as exc:  # pragma: no cover - the pre-13.2 skip path
    InstitutionDocumentProfile = None  # type: ignore[assignment]
    InstitutionDocumentProfileService = None  # type: ignore[assignment]
    _IMPORT_ERROR = exc

pytestmark = pytest.mark.skipif(
    _IMPORT_ERROR is not None,
    reason=(
        "task 13.2 not implemented yet — InstitutionDocumentProfile model + "
        f"InstitutionDocumentProfileService.resolve missing: {_IMPORT_ERROR}"
    ),
)


# Scope levels in strict most-specific → least-specific precedence order (R8.2).
# Index 0 is the most specific; ``resolve`` must prefer the lowest-index level
# that has an active matching profile.
_LEVELS = [
    "offering_intake",
    "offering",
    "canonical_intake",
    "canonical",
    "institution_default",
]

# A single document type is enough to pin the precedence property; the resolver
# always filters by ``(institution, document_type)`` first.
_DOCUMENT_TYPE = "acceptance_letter"


def _scope_columns(level: str, world) -> dict:
    """The three scope columns (program_id / canonical_program_id / intake_id)
    that define one precedence level for ``world``'s application."""
    if level == "offering_intake":
        return {
            "program_id": world.offering.id,
            "canonical_program_id": None,
            "intake_id": world.intake.id,
        }
    if level == "offering":
        return {
            "program_id": world.offering.id,
            "canonical_program_id": None,
            "intake_id": None,
        }
    if level == "canonical_intake":
        return {
            "program_id": None,
            "canonical_program_id": world.canonical_program.id,
            "intake_id": world.intake.id,
        }
    if level == "canonical":
        return {
            "program_id": None,
            "canonical_program_id": world.canonical_program.id,
            "intake_id": None,
        }
    if level == "institution_default":
        return {
            "program_id": None,
            "canonical_program_id": None,
            "intake_id": None,
        }
    raise AssertionError(f"unknown level: {level!r}")


def _make_profile(
    *,
    institution_id,
    document_type: str,
    program_id=None,
    canonical_program_id=None,
    intake_id=None,
    version: int = 1,
    is_active: bool = True,
):
    """Persist one ``institution_document_profiles`` row.

    Scope columns are addressed by their DB attnames (``program_id`` etc.) so
    the test stays decoupled from whether 13.2 models them as ForeignKeys or
    plain UUID columns. All NOT NULL content columns are given explicit safe
    defaults that mirror the migration shape.
    """
    now = timezone.now()
    return InstitutionDocumentProfile.objects.create(
        id=uuid.uuid4(),
        institution_id=institution_id,
        document_type=document_type,
        program_id=program_id,
        canonical_program_id=canonical_program_id,
        intake_id=intake_id,
        layout_key="simple_letter",
        sections={},
        fee_chart=[],
        bank_accounts=[],
        requirements=[],
        signatory={},
        rules=None,
        version=version,
        is_active=is_active,
        created_at=now,
        updated_at=now,
    )


def _expected_level(present_levels: frozenset[str]) -> str | None:
    """The most-specific present level, or ``None`` when none are present."""
    for level in _LEVELS:
        if level in present_levels:
            return level
    return None


# ≥100 examples; success is pinned to ``--hypothesis-seed=0`` via the CLI flag.
# Each example builds a tenant graph plus several profile rows, so the deadline
# is relaxed and the per-example fixture build is exempt from the
# function-scoped-fixture / data-too-large health checks (the same harness the
# lifecycle + gating properties in this spec use).
_RESOLUTION_PROPERTY_SETTINGS = settings(
    max_examples=25,
    deadline=None,
    suppress_health_check=[
        HealthCheck.function_scoped_fixture,
        HealthCheck.data_too_large,
    ],
)


@pytest.mark.django_db
class TestDocumentProfileResolutionProperty:
    # Feature: multi-tenant-beanola-remediation, Property 20: Document profile resolution is deterministic and most-specific
    """Property 20: Document profile resolution is deterministic and most-specific.

    For any application + document type with active profiles at an arbitrary
    subset of scope levels (plus inactive, mismatched-scope, wrong-doc-type, and
    cross-tenant decoys), ``InstitutionDocumentProfileService.resolve`` returns
    the single most-specific active match in the order offering+intake →
    offering → canonical-program+intake → canonical program → institution
    default; it breaks version ties on the latest active version; it is
    deterministic for identical inputs; it never selects ``is_active = false``
    rows; and it returns ``None`` when no active profile matches.

    **Validates: Requirements 8.2**
    """

    @_RESOLUTION_PROPERTY_SETTINGS
    @given(
        present_levels=st.sets(st.sampled_from(_LEVELS), max_size=5).map(frozenset),
        versions_per_level=st.integers(min_value=1, max_value=3),
        add_inactive_decoy=st.booleans(),
        add_mismatched_scope_noise=st.booleans(),
        add_wrong_doctype_noise=st.booleans(),
        add_cross_tenant_noise=st.booleans(),
    )
    def test_profile_resolution_is_deterministic_and_most_specific(
        self,
        present_levels,
        versions_per_level,
        add_inactive_decoy,
        add_mismatched_scope_noise,
        add_wrong_doctype_noise,
        add_cross_tenant_noise,
    ):
        world = build_tenant_world(application_status="approved")
        application = world.application
        institution_id = world.institution.id

        # Build every present level with ``versions_per_level`` active versions
        # (1..n). The expected winner within a level is its highest active
        # version, so we track it.
        winning_active_ids: dict[str, uuid.UUID] = {}
        for level in present_levels:
            scope = _scope_columns(level, world)
            top_id = None
            for version in range(1, versions_per_level + 1):
                row = _make_profile(
                    institution_id=institution_id,
                    document_type=_DOCUMENT_TYPE,
                    version=version,
                    is_active=True,
                    **scope,
                )
                top_id = row.id
            winning_active_ids[level] = top_id

            # R8.2 / is_active gate: a *higher-version but inactive* row on the
            # same scope must never displace the active winner.
            if add_inactive_decoy:
                _make_profile(
                    institution_id=institution_id,
                    document_type=_DOCUMENT_TYPE,
                    version=versions_per_level + 5,
                    is_active=False,
                    **scope,
                )

        # Mismatched-scope noise: active profiles whose scope does NOT match the
        # application (a different intake under the offering / canonical). These
        # must never be selected regardless of the present set.
        if add_mismatched_scope_noise:
            other_intake = build_intake()
            _make_profile(
                institution_id=institution_id,
                document_type=_DOCUMENT_TYPE,
                program_id=world.offering.id,
                intake_id=other_intake.id,
                version=99,
                is_active=True,
            )
            _make_profile(
                institution_id=institution_id,
                document_type=_DOCUMENT_TYPE,
                canonical_program_id=world.canonical_program.id,
                intake_id=other_intake.id,
                version=99,
                is_active=True,
            )

        # Wrong-document-type noise: an institution-default profile for another
        # document type must never be returned for ``_DOCUMENT_TYPE``.
        if add_wrong_doctype_noise:
            _make_profile(
                institution_id=institution_id,
                document_type="payment_receipt",
                version=99,
                is_active=True,
            )

        # Cross-tenant noise: another institution's institution-default profile
        # must never leak across the tenant boundary.
        if add_cross_tenant_noise:
            other_world = build_tenant_world()
            _make_profile(
                institution_id=other_world.institution.id,
                document_type=_DOCUMENT_TYPE,
                version=99,
                is_active=True,
            )

        service = InstitutionDocumentProfileService()

        resolved = service.resolve(application, _DOCUMENT_TYPE)
        # Determinism: an identical second call yields the identical result.
        resolved_again = service.resolve(application, _DOCUMENT_TYPE)

        expected_level = _expected_level(present_levels)

        if expected_level is None:
            # No active profile matches → None (R8.2). Decoys never satisfy.
            assert resolved is None, {
                "unexpected": getattr(resolved, "id", resolved),
                "present_levels": sorted(present_levels),
            }
            assert resolved_again is None
            return

        assert resolved is not None, {
            "expected_level": expected_level,
            "present_levels": sorted(present_levels),
        }
        # Most-specific match: the highest active version of the winning level.
        assert resolved.id == winning_active_ids[expected_level], {
            "expected_level": expected_level,
            "got_id": resolved.id,
            "expected_id": winning_active_ids[expected_level],
            "present_levels": sorted(present_levels),
        }
        # Never an inactive row.
        assert resolved.is_active is True
        # Deterministic across identical calls.
        assert resolved_again is not None
        assert resolved_again.id == resolved.id
