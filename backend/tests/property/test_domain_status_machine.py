"""Domain status machine property tests (Task 7.6).

# Feature: enterprise-tenant-authority, Property 11: Domain status machine allows only defined transitions

Spec: enterprise-tenant-authority — Task 7.6 (R7.2, R7.6, R7.7); design.md
"Property 11: Domain status machine allows only defined transitions".

Property 11 (Domain status machine allows only defined transitions): *for all*
``(from_status, to_status)`` pairs over the six ``InstitutionDomain.STATUS_*``
values, ``DomainStatusMachine.can_transition(from, to)`` is ``True`` *iff* the
pair is one of the seven allowed transitions, and ``assert_transition`` raises
``DomainTransitionError`` for every other pair. The activation rule
(``verified -> active`` permitted, activating a non-``verified`` domain
rejected) and the ``verified -> active`` edge that the view layer uses to record
``approved_by`` (R7.6, R7.7) are derived directly from this same pure table, so
they are pinned here without touching the database.

The machine is a pure, table-driven decision function — it holds no state and
performs no I/O — so this property needs no DB fixture (the seven-edge table is
the single source of truth reused by the create/activate views and the
verification Celery task).

**Validates: Requirements 7.2, 7.6, 7.7**
"""

from __future__ import annotations

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from apps.catalog.models import InstitutionDomain
from apps.catalog.services import DomainStatusMachine, DomainTransitionError

# The six canonical domain lifecycle statuses (R7.2). Generating pairs over this
# closed set keeps the input space exactly the machine's domain — every
# (from, to) combination is a legitimate question to ask the machine.
_ALL_STATUSES = (
    InstitutionDomain.STATUS_PENDING_DNS,
    InstitutionDomain.STATUS_PENDING_REVIEW,
    InstitutionDomain.STATUS_VERIFIED,
    InstitutionDomain.STATUS_ACTIVE,
    InstitutionDomain.STATUS_DISABLED,
    InstitutionDomain.STATUS_FAILED,
)

# The seven transitions the design permits — re-declared here independently of
# the implementation so the test pins the *specification*, not whatever the
# production frozenset happens to contain.
_EXPECTED_ALLOWED: frozenset[tuple[str, str]] = frozenset(
    {
        (InstitutionDomain.STATUS_PENDING_DNS, InstitutionDomain.STATUS_PENDING_REVIEW),
        (InstitutionDomain.STATUS_PENDING_DNS, InstitutionDomain.STATUS_FAILED),
        (InstitutionDomain.STATUS_PENDING_REVIEW, InstitutionDomain.STATUS_VERIFIED),
        (InstitutionDomain.STATUS_VERIFIED, InstitutionDomain.STATUS_ACTIVE),
        (InstitutionDomain.STATUS_ACTIVE, InstitutionDomain.STATUS_DISABLED),
        (InstitutionDomain.STATUS_FAILED, InstitutionDomain.STATUS_PENDING_DNS),
        (InstitutionDomain.STATUS_DISABLED, InstitutionDomain.STATUS_ACTIVE),
    }
)

_status = st.sampled_from(_ALL_STATUSES)

# ≥100 examples (task requirement). The machine is pure, so no DB fixtures and
# no relaxed deadline are needed.
_PROPERTY_SETTINGS = settings(max_examples=200)


# Feature: enterprise-tenant-authority, Property 11: Domain status machine allows only defined transitions
class TestDomainStatusMachineTransitions:
    """Property 11: ``DomainStatusMachine`` permits exactly the seven defined
    transitions and rejects every other pair.

    **Validates: Requirements 7.2, 7.6, 7.7**
    """

    @_PROPERTY_SETTINGS
    @given(from_status=_status, to_status=_status)
    def test_can_transition_iff_in_allowed_set(self, from_status, to_status):
        """``can_transition`` is ``True`` *iff* the pair is one of the seven
        allowed transitions — for every pair over the six statuses."""
        expected = (from_status, to_status) in _EXPECTED_ALLOWED
        assert DomainStatusMachine.can_transition(from_status, to_status) is expected

    @_PROPERTY_SETTINGS
    @given(from_status=_status, to_status=_status)
    def test_assert_transition_raises_iff_not_allowed(self, from_status, to_status):
        """``assert_transition`` raises ``DomainTransitionError`` for disallowed
        pairs and returns ``None`` (no raise) for allowed pairs. The raised
        error carries the offending ``from``/``to`` for non-revealing mapping."""
        if (from_status, to_status) in _EXPECTED_ALLOWED:
            assert DomainStatusMachine.assert_transition(from_status, to_status) is None
        else:
            with pytest.raises(DomainTransitionError) as exc_info:
                DomainStatusMachine.assert_transition(from_status, to_status)
            assert exc_info.value.from_status == from_status
            assert exc_info.value.to_status == to_status
            assert exc_info.value.code == "INVALID_DOMAIN_TRANSITION"

    @_PROPERTY_SETTINGS
    @given(from_status=_status)
    def test_activation_only_from_verified(self, from_status):
        """R7.6/R7.7 activation rule: ``-> active`` is permitted *iff* the
        domain is currently ``verified``. Activating any non-``verified`` domain
        is rejected (the view maps this to ``DOMAIN_NOT_VERIFIED`` with the
        status left unchanged), and ``verified -> active`` is the single edge the
        activate endpoint rides to record ``approved_by``."""
        to_active = DomainStatusMachine.can_transition(
            from_status, InstitutionDomain.STATUS_ACTIVE
        )
        if from_status == InstitutionDomain.STATUS_VERIFIED:
            assert to_active is True
        elif from_status == InstitutionDomain.STATUS_DISABLED:
            # disabled -> active is a re-enable, the one other edge into active.
            assert to_active is True
        else:
            assert to_active is False

    @_PROPERTY_SETTINGS
    @given(from_status=_status)
    def test_allowed_targets_matches_expected_table(self, from_status):
        """``allowed_targets`` returns exactly the reachable-in-one-step set for
        the source status, consistent with the expected transition table."""
        expected_targets = frozenset(
            target for source, target in _EXPECTED_ALLOWED if source == from_status
        )
        assert DomainStatusMachine.allowed_targets(from_status) == expected_targets

    @_PROPERTY_SETTINGS
    @given(status=_status)
    def test_self_transitions_always_rejected(self, status):
        """No-op self-transitions (``X -> X``) are never permitted for any of the
        six statuses — the table contains no self-edge."""
        assert DomainStatusMachine.can_transition(status, status) is False


# Feature: enterprise-tenant-authority, Property 11: Domain status machine allows only defined transitions
class TestDomainStatusMachineTableIntegrity:
    """The production table exposes precisely the seven specified edges.

    **Validates: Requirements 7.2**
    """

    def test_allowed_transitions_equals_specification(self):
        """The implementation's ``ALLOWED_TRANSITIONS`` equals the independently
        declared seven-edge specification — guarding against silent drift."""
        assert DomainStatusMachine.ALLOWED_TRANSITIONS == _EXPECTED_ALLOWED
        assert len(DomainStatusMachine.ALLOWED_TRANSITIONS) == 7
