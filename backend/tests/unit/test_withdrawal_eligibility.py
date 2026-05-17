"""Unit tests for withdrawal eligibility rules.

Decision A1: withdrawal is allowed from 5 statuses and rejected from all others.
"""

import pytest

from apps.applications.withdrawal_service import WITHDRAWABLE_STATUSES


ALLOWED = {"submitted", "under_review", "waitlisted", "conditionally_approved", "approved"}
REJECTED = {"draft", "enrolled", "rejected", "withdrawn", "expired", "enrollment_expired"}


class TestWithdrawalEligibility:
    @pytest.mark.parametrize("status", sorted(ALLOWED))
    def test_withdrawal_allowed(self, status: str):
        assert status in WITHDRAWABLE_STATUSES

    @pytest.mark.parametrize("status", sorted(REJECTED))
    def test_withdrawal_rejected(self, status: str):
        assert status not in WITHDRAWABLE_STATUSES

    def test_withdrawable_set_is_exactly_5(self):
        assert WITHDRAWABLE_STATUSES == ALLOWED
