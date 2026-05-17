"""Assert PAYMENT_TO_APP_MAP covers every CanonicalStatus and maps to valid app statuses."""

import typing

import pytest

from apps.documents.payment_service import PAYMENT_TO_APP_MAP, CanonicalStatus


# Extract literal values from CanonicalStatus type alias
CANONICAL_STATUS_VALUES = set(typing.get_args(CanonicalStatus))

# Valid application-level payment_status values (the derived column)
VALID_APP_PAYMENT_STATUSES = {
    "verified",
    "failed",
    "not_paid",
    "deferred",
    "pending_review",
}


class TestPaymentToAppMapCompleteness:
    def test_map_covers_every_canonical_status(self):
        missing = CANONICAL_STATUS_VALUES - set(PAYMENT_TO_APP_MAP.keys())
        assert not missing, f"PAYMENT_TO_APP_MAP missing canonical statuses: {missing}"

    def test_no_extra_keys_beyond_canonical(self):
        extra = set(PAYMENT_TO_APP_MAP.keys()) - CANONICAL_STATUS_VALUES
        assert not extra, f"PAYMENT_TO_APP_MAP has keys not in CanonicalStatus: {extra}"

    def test_all_derived_values_are_valid_app_statuses(self):
        for canonical, derived in PAYMENT_TO_APP_MAP.items():
            assert derived in VALID_APP_PAYMENT_STATUSES, (
                f"PAYMENT_TO_APP_MAP['{canonical}'] = '{derived}' is not a valid app payment status"
            )

    def test_map_is_non_empty(self):
        assert len(PAYMENT_TO_APP_MAP) >= 6
