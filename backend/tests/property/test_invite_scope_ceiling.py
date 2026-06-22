"""Property-based test — invite scope and role ceiling (Property 8).

Feature: enterprise-tenant-authority, Property 8

Spec: ``.kiro/specs/enterprise-tenant-authority`` (task 6.2). Pins the
invite-authority property from the design's Correctness Properties:

    Property 8 — Invite scope and role ceiling
    A non-super-admin invite succeeds only when the actor holds
    ``tenant.staff.invite`` for the **target** institution **and** the assignable
    ``target_role`` is at or below the actor's own delegated authority
    (``ROLE_HIERARCHY``); otherwise it is rejected. A Super_Admin may invite any
    role into any institution.

This exercises the real
:meth:`AdminCapabilityService.can_invite_staff(user, institution, target_role)`
predicate — the single authority gate the membership/user-create invite paths
(`AdminMembershipListCreateView.post` in ``backend/apps/catalog/admin_views.py``
and `AdminUserListView.post` in ``backend/apps/accounts/admin_user_views.py``)
delegate to — against the test DB. No production code is changed and nothing is
mocked. Hypothesis generates varied actor roles (canonical and non-canonical),
per-institution scope configurations (active / inactive / expired membership or
grant, on the target institution or elsewhere), granted-permission bundles
(``tenant.staff.invite`` is conferred only by the ``manage`` bundle), and
target roles (canonical, non-canonical, missing), and the test asserts the
boolean decision matches the rule exactly on every example.

``tenant.staff.invite`` is derived only from an **active, non-expired**
membership/grant for the institution whose ``permissions`` include ``manage``;
an out-of-scope, inactive, expired, or read-only scope confers no invite
capability, so a cross-tenant or under-privileged invite is rejected (R6.3,
R6.4, R17.6).

Run (≥100 examples, SQLite-in-memory test settings)::

    cd backend && DJANGO_SETTINGS_MODULE=config.settings.test \
      .venv/bin/python -m pytest tests/property/test_invite_scope_ceiling.py -q

**Validates: Requirements 6.3, 6.4, 17.6**
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.accounts.permissions import ROLE_HIERARCHY
from apps.catalog.services import AdminCapabilityService
from tests.tenant_fixtures import (
    build_access_grant,
    build_institution,
    build_membership,
    build_profile,
)


# ≥100 examples (spec minimum). Deadline relaxed for DB-backed capability
# derivation; the function-scoped ``db`` health check is suppressed because every
# example shares the transactional test DB (rolled back per test, isolated per
# example by fresh unique rows).
HYPOTHESIS_SETTINGS = settings(
    max_examples=120,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)


CANONICAL_ROLES = ("super_admin", "admin", "reviewer", "student")
NON_CANONICAL_ROLES = ("manager", "guest", "owner", "operator", "")

# Only ``manage`` confers ``tenant.staff.invite`` (the design's granted-mutation
# bundle); every other permission leaves the actor with read-only tenant caps.
PERMISSIONS = ("view", "review", "verify_documents", "verify_payments", "export", "manage")
INVITE_GRANTING_PERMISSION = "manage"

# Per-institution scope attachments. Only ``active_membership`` and
# ``active_grant`` are active + non-expired and therefore contribute capabilities;
# the rest are signals that must confer nothing.
CONTRIBUTING_KINDS = {"active_membership", "active_grant"}
SCOPE_KINDS = (
    "none",
    "active_membership",
    "inactive_membership",
    "active_grant",
    "expired_grant",
)

ACTOR_ROLE = st.sampled_from(CANONICAL_ROLES + NON_CANONICAL_ROLES)
# ``target_role`` spans canonical roles, non-canonical strings, and the missing
# case (``None``) the serializer could pass through.
TARGET_ROLE = st.sampled_from(CANONICAL_ROLES + NON_CANONICAL_ROLES + (None,))
SCOPE_KIND = st.sampled_from(SCOPE_KINDS)
PERMISSION_BUNDLE = st.lists(st.sampled_from(PERMISSIONS), min_size=0, max_size=4, unique=True)
# Whether the generated scope lands on the *target* institution or a different
# institution (noise that must never confer invite authority on the target).
SCOPE_ON_TARGET = st.booleans()
# Whether the predicate is called with the Institution object or its raw id
# string (the endpoint passes the id from the serializer; both must behave the
# same).
PASS_INSTITUTION_AS_ID = st.booleans()


def _attach(staff, institution, kind: str, permissions: list[str]) -> None:
    """Attach one scope of ``kind`` (carrying ``permissions``) for ``institution``."""
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


def _expected_can_invite(
    *,
    actor_role: str,
    target_has_invite_cap: bool,
    target_role,
) -> bool:
    """The rule under test, computed independently of the service.

    - ``super_admin`` → always ``True`` (R6.3/R6.4 do not constrain a Super_Admin).
    - otherwise the actor must hold ``tenant.staff.invite`` for the target
      institution (``target_has_invite_cap``) **and** the canonical
      ``target_role`` must be at or below the actor's authority. An unknown /
      missing ``target_role`` (hierarchy level 0) is never assignable.
    """
    if actor_role == "super_admin":
        return True
    if not target_has_invite_cap:
        return False
    inviter_level = ROLE_HIERARCHY.get((actor_role or "").strip().lower(), 0)
    target_level = ROLE_HIERARCHY.get((target_role or "").strip().lower(), 0)
    if target_level == 0:
        return False
    return target_level <= inviter_level


@pytest.mark.tenant
@pytest.mark.django_db
class TestInviteScopeAndRoleCeiling:
    """Property 8 — invite scope and role ceiling.

    Feature: enterprise-tenant-authority, Property 8: Invite scope and role ceiling

    **Validates: Requirements 6.3, 6.4, 17.6**
    """

    @HYPOTHESIS_SETTINGS
    @given(
        actor_role=ACTOR_ROLE,
        target_role=TARGET_ROLE,
        scope_kind=SCOPE_KIND,
        permissions=PERMISSION_BUNDLE,
        scope_on_target=SCOPE_ON_TARGET,
        pass_as_id=PASS_INSTITUTION_AS_ID,
    )
    def test_invite_decision_matches_scope_and_role_ceiling(
        self,
        actor_role,
        target_role,
        scope_kind,
        permissions,
        scope_on_target,
        pass_as_id,
    ):
        """``can_invite_staff`` returns ``True`` iff the actor is a Super_Admin,
        or holds ``tenant.staff.invite`` for the *target* institution via an
        active non-expired membership/grant whose permissions include ``manage``
        **and** the canonical ``target_role`` is at or below the actor's
        authority. Every other combination is rejected."""
        service = AdminCapabilityService()
        staff = build_profile(role=actor_role)
        target_institution = build_institution()

        # Attach the generated scope either to the target institution or to a
        # different one (noise that must never authorize the target).
        scope_institution = (
            target_institution if scope_on_target else build_institution()
        )
        _attach(staff, scope_institution, scope_kind, permissions)

        # The target institution confers ``tenant.staff.invite`` only when the
        # actor is a canonical non-super-admin, the contributing scope is on the
        # target, and the bundle includes ``manage``.
        target_has_invite_cap = (
            actor_role in {"admin", "reviewer", "student"}
            and scope_on_target
            and scope_kind in CONTRIBUTING_KINDS
            and INVITE_GRANTING_PERMISSION in permissions
        )

        expected = _expected_can_invite(
            actor_role=actor_role,
            target_has_invite_cap=target_has_invite_cap,
            target_role=target_role,
        )

        institution_arg = (
            str(target_institution.id) if pass_as_id else target_institution
        )
        result = service.can_invite_staff(staff, institution_arg, target_role)

        assert result is expected, {
            "actor_role": actor_role,
            "target_role": target_role,
            "scope_kind": scope_kind,
            "permissions": permissions,
            "scope_on_target": scope_on_target,
            "target_has_invite_cap": target_has_invite_cap,
            "expected": expected,
            "result": result,
        }

        # Cross-tenant guard: when the only contributing scope is on a *different*
        # institution, a non-super-admin can never invite into the target.
        if actor_role != "super_admin" and not scope_on_target:
            assert result is False


@pytest.mark.tenant
@pytest.mark.django_db
class TestInviteScopeAndRoleCeilingExamples:
    """Concrete edge cases complementing the property (unit coverage).

    **Validates: Requirements 6.3, 6.4, 17.6**
    """

    def _admin_with_invite_cap(self, institution):
        staff = build_profile(role="admin")
        build_membership(
            user=staff, institution=institution, role="admin",
            is_active=True, permissions=["manage"],
        )
        return staff

    def test_super_admin_invites_any_role_anywhere(self):
        """A Super_Admin may invite any role into any institution, with no
        membership of their own (R6.3)."""
        service = AdminCapabilityService()
        staff = build_profile(role="super_admin")
        institution = build_institution()
        for target_role in ("super_admin", "admin", "reviewer", "student"):
            assert service.can_invite_staff(staff, institution, target_role) is True

    def test_admin_with_invite_cap_can_invite_at_or_below(self):
        """An admin holding ``tenant.staff.invite`` may invite admin/reviewer/
        student but not super_admin (role ceiling, R6.4)."""
        service = AdminCapabilityService()
        institution = build_institution()
        staff = self._admin_with_invite_cap(institution)
        assert service.can_invite_staff(staff, institution, "admin") is True
        assert service.can_invite_staff(staff, institution, "reviewer") is True
        assert service.can_invite_staff(staff, institution, "student") is True
        assert service.can_invite_staff(staff, institution, "super_admin") is False

    def test_read_only_membership_cannot_invite(self):
        """A read-only membership (no ``manage``) confers no invite capability,
        so the invite is rejected even for a low target role (R6.3)."""
        service = AdminCapabilityService()
        institution = build_institution()
        staff = build_profile(role="admin")
        build_membership(
            user=staff, institution=institution, role="admin",
            is_active=True, permissions=["view"],
        )
        assert service.can_invite_staff(staff, institution, "student") is False

    def test_invite_cap_for_other_institution_does_not_authorize_target(self):
        """Holding the invite capability for institution A never authorizes an
        invite into institution B (cross-tenant guard, R6.3, R17.6)."""
        service = AdminCapabilityService()
        inst_a = build_institution()
        inst_b = build_institution()
        staff = self._admin_with_invite_cap(inst_a)
        assert service.can_invite_staff(staff, inst_a, "student") is True
        assert service.can_invite_staff(staff, inst_b, "student") is False

    def test_unknown_target_role_is_never_assignable(self):
        """An unknown / missing ``target_role`` (hierarchy level 0) is rejected
        even with the invite capability (R6.4)."""
        service = AdminCapabilityService()
        institution = build_institution()
        staff = self._admin_with_invite_cap(institution)
        assert service.can_invite_staff(staff, institution, "manager") is False
        assert service.can_invite_staff(staff, institution, "") is False
        assert service.can_invite_staff(staff, institution, None) is False

    def test_reviewer_with_invite_cap_cannot_invite_admin(self):
        """A reviewer holding the invite capability may invite only at/below
        reviewer authority — never an admin (R6.4)."""
        service = AdminCapabilityService()
        institution = build_institution()
        staff = build_profile(role="reviewer")
        build_membership(
            user=staff, institution=institution, role="reviewer",
            is_active=True, permissions=["manage"],
        )
        assert service.can_invite_staff(staff, institution, "reviewer") is True
        assert service.can_invite_staff(staff, institution, "student") is True
        assert service.can_invite_staff(staff, institution, "admin") is False

    def test_expired_grant_confers_no_invite_capability(self):
        """An expired grant (even with ``manage``) confers nothing, so the
        invite is rejected (R6.3)."""
        service = AdminCapabilityService()
        institution = build_institution()
        staff = build_profile(role="admin")
        build_access_grant(
            user=staff, scope_type="institution", institution=institution,
            is_active=True, expires_at=timezone.now() - timedelta(seconds=1),
            permissions=["manage"],
        )
        assert service.can_invite_staff(staff, institution, "student") is False
