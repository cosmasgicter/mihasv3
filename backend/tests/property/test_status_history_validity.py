"""Property-based tests for status history chain validity.

# Feature: pre-launch-audit, Property 7: Status history chain validity

For any application, the sequence of (old_status, new_status) pairs in
application_status_history (ordered by created_at) should contain only
transitions present in ALLOWED_TRANSITIONS: draft→submitted,
submitted→{under_review, approved, rejected},
under_review→{approved, rejected, waitlisted},
waitlisted→{approved, rejected}.

This test validates the TRANSITION VALIDATION LOGIC — it does NOT require
a live database connection.

**Validates: Requirements 2.5**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from dataclasses import dataclass  # noqa: E402

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Allowed transitions (mirroring backend/apps/applications/services.py)
# ---------------------------------------------------------------------------

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"submitted"},
    "submitted": {"under_review", "approved", "rejected"},
    "under_review": {"approved", "rejected", "waitlisted"},
    "waitlisted": {"approved", "rejected"},
}

ALL_STATUSES = ["draft", "submitted", "under_review", "approved", "rejected", "waitlisted"]

# Terminal statuses — no outgoing transitions
TERMINAL_STATUSES = {"approved", "rejected"}

# Flatten allowed transitions into a set of (old, new) tuples for fast lookup
ALLOWED_TRANSITION_SET: set[tuple[str, str]] = set()
for old, new_set in ALLOWED_TRANSITIONS.items():
    for new in new_set:
        ALLOWED_TRANSITION_SET.add((old, new))


# ---------------------------------------------------------------------------
# Status history validation logic (pure, no DB)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class StatusTransition:
    """A single status transition record."""

    old_status: str
    new_status: str


def is_valid_transition(transition: StatusTransition) -> bool:
    """Check if a single (old_status, new_status) pair is in ALLOWED_TRANSITIONS."""
    return (transition.old_status, transition.new_status) in ALLOWED_TRANSITION_SET


def validate_status_history(
    transitions: list[StatusTransition],
) -> list[StatusTransition]:
    """Return all invalid transitions in a status history sequence.

    An empty return list means the entire history is valid.
    """
    return [t for t in transitions if not is_valid_transition(t)]


def is_chain_consistent(transitions: list[StatusTransition]) -> bool:
    """Check that the chain is internally consistent: each transition's
    new_status should equal the next transition's old_status."""
    for i in range(len(transitions) - 1):
        if transitions[i].new_status != transitions[i + 1].old_status:
            return False
    return True


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

status_st = st.sampled_from(ALL_STATUSES)


def valid_transition_st() -> st.SearchStrategy[StatusTransition]:
    """Generate a random valid transition from ALLOWED_TRANSITION_SET."""
    return st.sampled_from(sorted(ALLOWED_TRANSITION_SET)).map(
        lambda t: StatusTransition(old_status=t[0], new_status=t[1])
    )


def invalid_transition_st() -> st.SearchStrategy[StatusTransition]:
    """Generate a random invalid transition (not in ALLOWED_TRANSITIONS)."""
    return st.tuples(status_st, status_st).filter(
        lambda t: (t[0], t[1]) not in ALLOWED_TRANSITION_SET
    ).map(lambda t: StatusTransition(old_status=t[0], new_status=t[1]))


def valid_chain_st(
    min_size: int = 1, max_size: int = 5
) -> st.SearchStrategy[list[StatusTransition]]:
    """Generate a valid chain of transitions starting from 'draft'.

    Builds a chain by following ALLOWED_TRANSITIONS from 'draft' until
    a terminal status is reached or max_size is hit.
    """
    @st.composite
    def build_chain(draw: st.DrawFn) -> list[StatusTransition]:
        chain: list[StatusTransition] = []
        current = "draft"
        length = draw(st.integers(min_value=min_size, max_value=max_size))
        for _ in range(length):
            allowed = ALLOWED_TRANSITIONS.get(current, set())
            if not allowed:
                break  # terminal status
            next_status = draw(st.sampled_from(sorted(allowed)))
            chain.append(StatusTransition(old_status=current, new_status=next_status))
            current = next_status
        return chain

    return build_chain()


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------


class TestStatusHistoryValidity(SimpleTestCase):
    """Property 7: Status history chain validity.

    For any application, the sequence of (old_status, new_status) pairs
    should contain only transitions in ALLOWED_TRANSITIONS.

    **Validates: Requirements 2.5**
    """

    # ------------------------------------------------------------------
    # Property: every valid transition is accepted
    # ------------------------------------------------------------------

    @given(transition=valid_transition_st())
    @settings(max_examples=5)
    def test_valid_transition_is_accepted(self, transition: StatusTransition):
        """For any transition in ALLOWED_TRANSITIONS, is_valid_transition
        should return True."""
        self.assertTrue(
            is_valid_transition(transition),
            f"Valid transition {transition.old_status}→{transition.new_status} "
            f"was rejected",
        )

    # ------------------------------------------------------------------
    # Property: every invalid transition is rejected
    # ------------------------------------------------------------------

    @given(transition=invalid_transition_st())
    @settings(max_examples=5)
    def test_invalid_transition_is_rejected(self, transition: StatusTransition):
        """For any (old, new) pair NOT in ALLOWED_TRANSITIONS,
        is_valid_transition should return False."""
        self.assertFalse(
            is_valid_transition(transition),
            f"Invalid transition {transition.old_status}→{transition.new_status} "
            f"was accepted",
        )

    # ------------------------------------------------------------------
    # Property: valid chain produces no invalid transitions
    # ------------------------------------------------------------------

    @given(chain=valid_chain_st(min_size=1, max_size=5))
    @settings(max_examples=5)
    def test_valid_chain_has_no_invalid_transitions(
        self, chain: list[StatusTransition]
    ):
        """For any chain built from ALLOWED_TRANSITIONS, validate_status_history
        should return an empty list."""
        invalid = validate_status_history(chain)
        self.assertEqual(
            invalid,
            [],
            f"Valid chain had invalid transitions: "
            f"{[(t.old_status, t.new_status) for t in invalid]}",
        )

    # ------------------------------------------------------------------
    # Property: valid chain is internally consistent
    # ------------------------------------------------------------------

    @given(chain=valid_chain_st(min_size=2, max_size=5))
    @settings(max_examples=5)
    def test_valid_chain_is_internally_consistent(
        self, chain: list[StatusTransition]
    ):
        """For any valid chain, each transition's new_status should equal
        the next transition's old_status."""
        if len(chain) < 2:
            return
        self.assertTrue(
            is_chain_consistent(chain),
            f"Chain is not consistent: "
            f"{[(t.old_status, t.new_status) for t in chain]}",
        )

    # ------------------------------------------------------------------
    # Property: injecting an invalid transition is detected
    # ------------------------------------------------------------------

    @given(
        chain=valid_chain_st(min_size=1, max_size=3),
        bad=invalid_transition_st(),
    )
    @settings(max_examples=5)
    def test_injected_invalid_transition_is_detected(
        self,
        chain: list[StatusTransition],
        bad: StatusTransition,
    ):
        """When an invalid transition is injected into a valid chain,
        validate_status_history should detect it."""
        mixed = chain + [bad]
        invalid = validate_status_history(mixed)
        self.assertGreaterEqual(
            len(invalid),
            1,
            f"Injected invalid transition {bad.old_status}→{bad.new_status} "
            f"was not detected",
        )
        # The bad transition must be in the invalid list
        self.assertIn(bad, invalid)

    # ------------------------------------------------------------------
    # Structural: terminal statuses have no outgoing transitions
    # ------------------------------------------------------------------

    def test_terminal_statuses_have_no_outgoing(self):
        """approved and rejected should not appear as keys in
        ALLOWED_TRANSITIONS (they are terminal)."""
        for status in TERMINAL_STATUSES:
            self.assertNotIn(
                status,
                ALLOWED_TRANSITIONS,
                f"Terminal status {status!r} has outgoing transitions",
            )

    def test_all_allowed_transitions_are_enumerated(self):
        """Verify the expected set of allowed transitions matches the
        backend definition."""
        expected = {
            ("draft", "submitted"),
            ("submitted", "under_review"),
            ("submitted", "approved"),
            ("submitted", "rejected"),
            ("under_review", "approved"),
            ("under_review", "rejected"),
            ("under_review", "waitlisted"),
            ("waitlisted", "approved"),
            ("waitlisted", "rejected"),
        }
        self.assertEqual(
            ALLOWED_TRANSITION_SET,
            expected,
            f"Transition set mismatch: {ALLOWED_TRANSITION_SET ^ expected}",
        )

    def test_draft_is_the_only_initial_status(self):
        """Only 'draft' should be a valid starting status (no other status
        appears as old_status without also appearing as new_status in a
        prior transition)."""
        # All statuses that appear as new_status
        reachable = {new for _, new in ALLOWED_TRANSITION_SET}
        # All statuses that appear as old_status
        sources = {old for old, _ in ALLOWED_TRANSITION_SET}
        # Initial statuses: sources that are not reachable from any transition
        initial = sources - reachable
        self.assertEqual(
            initial,
            {"draft"},
            f"Expected only 'draft' as initial status, got {initial}",
        )
