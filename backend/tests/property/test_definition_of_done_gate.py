"""Property-based test for the all-or-nothing Definition-of-Done exit gate.

# Feature: beanola-production-readiness, Property 33: The Definition-of-Done exit gate is all-or-nothing

Property 33 (Requirements 15.1–15.8): *For any* combination of Definition_of_Done
condition outcomes, the production-ready gate evaluates to ``True`` **if and only
if every** Component 1–14 exit condition (canonical map + reviewed allowlist;
clean brand scans; migrations applied to staging and production with evidence;
every tenant-data endpoint scope-reviewed and scoped-tested and every frontend
service shape matching the contract; every UI_Route passed at every
Mobile_Breakpoint with a Smoke_Check per critical workflow; Verification_Gate +
production Smoke_Check passing; monitoring/backups/error-reporting/alert-email/
CORS/cookies/env verified) is ``True``; if **any** single condition is unmet, the
gate is ``False`` and the platform is not marked production-ready.

This pins the pure evaluator ``apps.common.definition_of_done`` (no ORM, no I/O):
the gate is the exact logical AND of the seven exit conditions.

Backend property test conventions (spec ``beanola-production-readiness``):
- ``pytest`` + ``hypothesis``, ``--hypothesis-seed=0``, exactly one property per
  test method. Example count is intentionally reduced for a faster run.

**Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")
os.environ["TESTING"] = "1"

from hypothesis import given, settings as hypothesis_settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.common.definition_of_done import (  # noqa: E402
    DefinitionOfDoneConditions,
    evaluate_definition_of_done,
    unmet_conditions,
)

# The seven Component 1–14 exit conditions (R15.1–R15.7), in declaration order.
_CONDITION_FIELDS = (
    "canonical_map_and_allowlist",
    "brand_scans_clean",
    "migrations_applied_with_evidence",
    "endpoints_scoped_and_contract_matches",
    "ui_routes_and_smoke_checks",
    "verification_gate_and_prod_smoke",
    "ops_and_env_verified",
)

# Reduced example count for a faster run (seed pinned via --hypothesis-seed=0).
_settings = hypothesis_settings(max_examples=20, deadline=None)


def _conditions_from_flags(flags):
    """Build a DefinitionOfDoneConditions from a 7-tuple of booleans."""
    return DefinitionOfDoneConditions(**dict(zip(_CONDITION_FIELDS, flags)))


class TestDefinitionOfDoneGateProperty33:
    """Property 33: The Definition-of-Done exit gate is all-or-nothing.

    **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8**
    """

    @given(flags=st.tuples(*([st.booleans()] * len(_CONDITION_FIELDS))))
    @_settings
    def test_gate_is_true_iff_all_conditions_true(self, flags):
        """gate(conditions) == (every condition is True), for any combination.

        This is the core all-or-nothing biconditional (R15.8): the gate equals
        the logical AND of all seven exit conditions, so it is ``True`` exactly
        when none are unmet and ``False`` the moment any single one is unmet.
        """
        conditions = _conditions_from_flags(flags)

        gate = evaluate_definition_of_done(conditions)
        all_true = all(flags)

        assert gate is all_true

        # The diagnostic set is empty iff the gate passes, and otherwise names
        # exactly the unmet conditions — keeping "why not ready" verifiable.
        unmet = unmet_conditions(conditions)
        if gate:
            assert unmet == ()
        else:
            expected_unmet = {
                name for name, flag in zip(_CONDITION_FIELDS, flags) if not flag
            }
            assert set(unmet) == expected_unmet
            assert len(unmet) >= 1
