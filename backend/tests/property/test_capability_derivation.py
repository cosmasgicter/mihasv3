"""Property-based test — capability-set derivation (Property 1).

Feature: enterprise-tenant-authority, Property 1

Spec: ``.kiro/specs/enterprise-tenant-authority`` (task 2.4). Pins the
capability-derivation property from the design's Correctness Properties:

    Property 1 — Capability-set derivation
    For all actors, ``AdminCapabilityService.get_capabilities`` returns the full
    ``platform.*`` catalogue when and only when the actor's role is
    ``super_admin``; for every other actor it returns only ``tenant.*``
    capabilities, each attributable to an active (``is_active`` true) and
    non-expired Membership or Access_Grant for the institution it is scoped to;
    and it returns an empty capability set whenever the actor's role is not one
    of the four canonical roles, or the actor is a non-super-admin with no
    active Membership and no active Access_Grant.

This exercises the real :class:`AdminCapabilityService` against the test DB —
no production code is changed and nothing is mocked. Hypothesis generates
varied roles (canonical and non-canonical), per-institution membership/grant
configurations (active / inactive / expired), and granted-permission bundles,
and the test asserts the derived :class:`CapabilitySet` exactly.

Run (≥100 examples, SQLite-in-memory test settings)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_capability_derivation.py -q

**Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.2, 2.3, 3.2, 3.3**
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.catalog.services import AdminCapabilityService
from tests.tenant_fixtures import (
    build_access_grant,
    build_institution,
    build_membership,
    build_profile,
)


# ≥100 examples; deadline relaxed for DB-backed derivation; the function-scoped
# ``db`` health check is suppressed because every example shares the
# transactional test DB (rolled back per test, isolated per example by fresh
# unique rows).
HYPOTHESIS_SETTINGS = settings(
    max_examples=120,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)


CANONICAL_ROLES = ("super_admin", "admin", "reviewer", "student")
NON_CANONICAL_ROLES = ("manager", "guest", "owner", "operator", "")

# Permission allowlist values the grant/membership ``permissions`` column can
# hold (apps/catalog/admin_serializers.GRANT_PERMISSION_ALLOWLIST) and the
# ``tenant.*`` mutations each one grants on top of the read-default bundle.
READ_DEFAULTS = frozenset(
    {
        "tenant.profile.read",
        "tenant.application.read",
        "tenant.document.read",
        "tenant.payment.read",
        "tenant.staff.read",
        "tenant.audit.read",
        "tenant.program.read",
        "tenant.domain.read",
    }
)
PERMISSION_TO_CAPS = {
    "view": frozenset(),
    "review": frozenset({"tenant.application.review"}),
    "verify_documents": frozenset({"tenant.document.verify"}),
    "verify_payments": frozenset({"tenant.payment.verify"}),
    "export": frozenset({"tenant.application.export"}),
    "manage": frozenset(
        {
            "tenant.staff.invite",
            "tenant.staff.disable",
            "tenant.profile.request_change",
            "tenant.program.request_change",
            "tenant.domain.request_change",
        }
    ),
}

# A per-institution scope attachment. Only ``active_membership`` and
# ``active_grant`` contribute to the derived capabilities; the rest model
# signals that must confer no scope.
CONTRIBUTING_KINDS = {"active_membership", "active_grant"}

ROLE = st.sampled_from(CANONICAL_ROLES + NON_CANONICAL_ROLES)
PERMISSION = st.sampled_from(sorted(PERMISSION_TO_CAPS))
SCOPE_KIND = st.sampled_from(
    [
        "none",
        "active_membership",
        "inactive_membership",
        "active_grant",
        "expired_grant",
    ]
)
# (kind, permissions) per institution; up to four institutions per actor so the
# input space stays large (≥100 examples) without exhausting a tiny domain.
SCOPE_ENTRY = st.tuples(
    SCOPE_KIND,
    st.lists(PERMISSION, min_size=0, max_size=4, unique=True),
)
SCOPES = st.lists(SCOPE_ENTRY, min_size=0, max_size=4)


def _expected_caps_for(permissions: list[str]) -> frozenset[str]:
    """Read-default bundle plus the mutations granted by ``permissions``."""
    caps = set(READ_DEFAULTS)
    for value in permissions:
        caps |= PERMISSION_TO_CAPS[value]
    return frozenset(caps)


def _attach(staff, institution, kind: str, permissions: list[str]) -> None:
    """Attach one scope of ``kind`` (with ``permissions``) for ``institution``."""
    if kind == "active_membership":
        build_membership(
            user=staff, institution=institution, role="admin",
            is_active=True, permissions=permissions,
        )
    elif kind == "inactive_membership":
        build_membership(
            user=staff, institution=institution, role="admin",
            is_active=False, permissions=permissions,
        )
    elif kind == "active_grant":
        build_access_grant(
            user=staff, scope_type="institution", institution=institution,
            is_active=True, expires_at=None, permissions=permissions,
        )
    elif kind == "expired_grant":
        build_access_grant(
            user=staff, scope_type="institution", institution=institution,
            is_active=True,
            expires_at=timezone.now() - timedelta(days=1),
            permissions=permissions,
        )
    # "none" attaches nothing.


@pytest.mark.django_db
class TestCapabilitySetDerivation:
    """Property 1 — capability-set derivation.

    **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.2, 2.3, 3.2, 3.3**
    """

    @HYPOTHESIS_SETTINGS
    @given(role=ROLE, scopes=SCOPES)
    def test_capability_set_derivation(self, role, scopes):
        """For an actor with an arbitrary role and per-institution scope mix,
        the derived :class:`CapabilitySet` matches the rule exactly:

        - ``super_admin`` → the full ``platform.*`` catalogue and no tenant caps
          (platform authority never derived from a membership/grant);
        - any other canonical role → no ``platform.*`` caps and, per institution,
          only the ``tenant.*`` caps attributable to an active, non-expired
          membership/grant (read defaults + granted mutations); out-of-scope or
          inactive/expired signals confer nothing;
        - a non-canonical role → an entirely empty capability set.
        """
        service = AdminCapabilityService()
        staff = build_profile(role=role)

        expected_institution_caps: dict[str, frozenset[str]] = {}
        for kind, permissions in scopes:
            institution = build_institution()
            _attach(staff, institution, kind, permissions)
            if kind in CONTRIBUTING_KINDS:
                expected_institution_caps[str(institution.id)] = _expected_caps_for(
                    permissions
                )

        result = service.get_capabilities(staff)

        # The resolved role is always the normalized actor role.
        assert result.role == role.strip().lower()

        if role == "super_admin":
            # Full platform.* set, only for super_admin (R1.4, R2.2, R3.2).
            assert result.is_super_admin is True
            assert result.all_access is True
            assert result.platform_capabilities == AdminCapabilityService.PLATFORM_CAPABILITIES
            assert len(result.platform_capabilities) == 17
            # Super-admin authority subsumes tenants without deriving per-
            # institution tenant caps, and never leaks a platform cap as tenant.
            assert result.institution_capabilities == {}
            return

        # Every non-super-admin actor: no platform.* capabilities (R2.3).
        assert result.is_super_admin is False
        assert result.platform_capabilities == frozenset()

        if role not in {"admin", "reviewer", "student"}:
            # Non-canonical role → zero capabilities everywhere (R1.1).
            assert result.institution_capabilities == {}
            return

        # Canonical non-super-admin: institution_capabilities holds exactly the
        # contributing institutions, each with the attributable tenant.* caps
        # (R1.2, R1.3, R2.3, R3.3). An actor with no contributing scope (e.g. a
        # bare admin) therefore has an empty capability set.
        assert set(result.institution_capabilities) == set(expected_institution_caps)
        for institution_id, caps in expected_institution_caps.items():
            assert result.institution_capabilities[institution_id] == caps

        # Attributability: every derived capability is a tenant.* capability,
        # never a platform.* capability or anything outside the catalogue.
        for caps in result.institution_capabilities.values():
            assert caps <= AdminCapabilityService.TENANT_CAPABILITIES


@pytest.mark.django_db
class TestCapabilitySetDerivationExamples:
    """Concrete edge cases complementing the property (unit coverage).

    **Validates: Requirements 1.1, 1.3, 1.4, 2.2, 2.3, 3.3**
    """

    def test_super_admin_full_platform_set_ignores_memberships(self):
        """A super_admin gets the full platform.* set even with memberships,
        and never derives tenant caps from them (R1.4, R2.2)."""
        service = AdminCapabilityService()
        staff = build_profile(role="super_admin")
        institution = build_institution()
        build_membership(user=staff, institution=institution, role="admin",
                         is_active=True, permissions=["manage"])

        result = service.get_capabilities(staff)
        assert result.is_super_admin is True
        assert result.platform_capabilities == AdminCapabilityService.PLATFORM_CAPABILITIES
        assert result.institution_capabilities == {}

    def test_admin_with_no_active_scope_is_empty(self):
        """A bare admin with only an inactive membership and an expired grant
        resolves to zero capabilities (R1.3)."""
        service = AdminCapabilityService()
        staff = build_profile(role="admin")
        inst_a = build_institution()
        inst_b = build_institution()
        build_membership(user=staff, institution=inst_a, role="admin", is_active=False)
        build_access_grant(
            user=staff, scope_type="institution", institution=inst_b,
            is_active=True, expires_at=timezone.now() - timedelta(seconds=1),
        )

        result = service.get_capabilities(staff)
        assert result.platform_capabilities == frozenset()
        assert result.institution_capabilities == {}

    def test_membership_and_grant_union_for_same_institution(self):
        """An active membership and an active grant on the same institution
        union their granted mutations onto the read defaults (R2.3, R3.3)."""
        service = AdminCapabilityService()
        staff = build_profile(role="admin")
        institution = build_institution()
        build_membership(user=staff, institution=institution, role="admin",
                         is_active=True, permissions=["review"])
        build_access_grant(
            user=staff, scope_type="institution", institution=institution,
            is_active=True, expires_at=None, permissions=["verify_documents"],
        )

        caps = service.get_capabilities(staff).institution_capabilities[str(institution.id)]
        assert "tenant.application.review" in caps
        assert "tenant.document.verify" in caps
        assert READ_DEFAULTS <= caps

    def test_non_canonical_role_is_empty(self):
        """A role outside the four canonical roles has zero capabilities even
        with an active membership (R1.1)."""
        service = AdminCapabilityService()
        staff = build_profile(role="manager")
        institution = build_institution()
        build_membership(user=staff, institution=institution, role="admin",
                         is_active=True, permissions=["manage"])

        result = service.get_capabilities(staff)
        assert result.is_super_admin is False
        assert result.platform_capabilities == frozenset()
        assert result.institution_capabilities == {}
