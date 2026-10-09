"""Tenant change-request state-machine property tests (task 4.5, R5.4).

Spec: ``.kiro/specs/admissions-v2-canonical-rebuild/`` task 4.5; design.md §6.4
(TenantChangeRequest state machine).

Design §6.4::

    draft -> submitted -> approved -> applied
                      \\-> rejected
    draft/submitted -> cancelled

Property: *for all* ``(from_status, to_status)`` pairs over the six change-request
statuses, ``TenantChangeRequestStateMachine.can_transition(from, to)`` is ``True``
*iff* the pair is one of the six allowed transitions. The machine is pure and
table-driven (no state, no I/O), so this needs no DB fixture — the six-edge table
is the single authority reused by the create/submit/cancel/reject/approve service
commands.

**Validates: Requirements 5.4**
"""

from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st

from apps.catalog.change_request_service import TenantChangeRequestStateMachine as SM
from apps.catalog.models import TenantChangeRequest as CR

# The six canonical change-request statuses (design §6.4). Generating pairs over
# this closed set keeps the input space exactly the machine's domain.
_ALL_STATUSES = (
    CR.STATUS_DRAFT,
    CR.STATUS_SUBMITTED,
    CR.STATUS_APPROVED,
    CR.STATUS_APPLIED,
    CR.STATUS_REJECTED,
    CR.STATUS_CANCELLED,
)

# The six transitions design §6.4 permits — re-declared independently of the
# implementation so the test pins the *specification*, not whatever the
# production frozenset happens to contain.
_EXPECTED_ALLOWED: frozenset[tuple[str, str]] = frozenset(
    {
        (CR.STATUS_DRAFT, CR.STATUS_SUBMITTED),
        (CR.STATUS_SUBMITTED, CR.STATUS_APPROVED),
        (CR.STATUS_APPROVED, CR.STATUS_APPLIED),
        (CR.STATUS_SUBMITTED, CR.STATUS_REJECTED),
        (CR.STATUS_DRAFT, CR.STATUS_CANCELLED),
        (CR.STATUS_SUBMITTED, CR.STATUS_CANCELLED),
    }
)

_status = st.sampled_from(_ALL_STATUSES)
_PROPERTY_SETTINGS = settings(max_examples=200)


class TestChangeRequestStateMachineTransitions:
    """The machine permits exactly the six defined transitions.

    **Validates: Requirements 5.4**
    """

    @_PROPERTY_SETTINGS
    @given(from_status=_status, to_status=_status)
    def test_can_transition_iff_in_allowed_set(self, from_status, to_status):
        expected = (from_status, to_status) in _EXPECTED_ALLOWED
        assert SM.can_transition(from_status, to_status) is expected

    @_PROPERTY_SETTINGS
    @given(from_status=_status)
    def test_allowed_targets_matches_expected_table(self, from_status):
        expected_targets = frozenset(
            target for source, target in _EXPECTED_ALLOWED if source == from_status
        )
        assert SM.allowed_targets(from_status) == expected_targets

    @_PROPERTY_SETTINGS
    @given(status=_status)
    def test_self_transitions_always_rejected(self, status):
        """No-op self-transitions (``X -> X``) are never permitted."""
        assert SM.can_transition(status, status) is False

    @_PROPERTY_SETTINGS
    @given(status=_status)
    def test_terminal_states_have_no_outbound_edge(self, status):
        """``applied`` / ``rejected`` / ``cancelled`` are terminal (no targets);
        every non-terminal status has at least one target."""
        is_terminal = status in (CR.STATUS_APPLIED, CR.STATUS_REJECTED, CR.STATUS_CANCELLED)
        assert SM.is_terminal(status) is is_terminal
        assert (SM.allowed_targets(status) == frozenset()) is is_terminal


class TestChangeRequestStateMachineTableIntegrity:
    """The production table exposes precisely the six specified edges.

    **Validates: Requirements 5.4**
    """

    def test_allowed_transitions_equals_specification(self):
        assert SM.ALLOWED_TRANSITIONS == _EXPECTED_ALLOWED
        assert len(SM.ALLOWED_TRANSITIONS) == 6

    def test_status_domain_matches_model_choices(self):
        """The statuses the machine reasons over are exactly the model's status
        choices — a drift guard between the machine and the persisted column."""
        model_statuses = {value for value, _label in CR.STATUS_CHOICES}
        assert set(_ALL_STATUSES) == model_statuses
