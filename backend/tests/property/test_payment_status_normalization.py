"""Property-based tests for payment status normalization.

Feature: pre-launch-audit, Property 29: Payment status normalization handles all backend values

Frontend normalizePaymentStatus() should handle all backend payment status values
(pending, successful, failed, verified, paid, force_approved, null) and return a
valid display status. isPaymentVerified() should return true for verified, paid,
successful, and force_approved.

**Validates: Requirements 7.5**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

# ---------------------------------------------------------------------------
# Python mirror of frontend normalizePaymentStatus() and isPaymentVerified()
# from apps/admissions/src/lib/paymentStatus.ts
# ---------------------------------------------------------------------------

CANONICAL_STATUSES = {"not_paid", "pending_review", "verified", "rejected"}

# All known backend payment status values
BACKEND_PAYMENT_STATUSES = [
    "pending",
    "successful",
    "failed",
    "verified",
    "paid",
    "force_approved",
    None,
]

# Statuses that should normalize to 'verified' (payment complete)
VERIFIED_STATUSES = {"verified", "paid", "successful", "force_approved"}

# Statuses that should normalize to 'pending_review'
PENDING_STATUSES = {"pending", "pending_review"}

# Statuses that should normalize to 'rejected'
REJECTED_STATUSES = {"failed", "rejected"}


def normalize_payment_status(payment_status: str | None) -> str:
    """Python mirror of frontend normalizePaymentStatus().

    Must match the TypeScript implementation exactly:
      - pending, pending_review → 'pending_review'
      - verified, paid, successful, force_approved → 'verified'
      - failed, rejected → 'rejected'
      - anything else (including None) → 'not_paid'
    """
    if payment_status in ("pending", "pending_review"):
        return "pending_review"
    if payment_status in ("verified", "paid", "successful", "force_approved"):
        return "verified"
    if payment_status in ("failed", "rejected"):
        return "rejected"
    return "not_paid"


def is_payment_verified(payment_status: str | None) -> bool:
    """Python mirror of frontend isPaymentVerified()."""
    return normalize_payment_status(payment_status) == "verified"


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

backend_statuses = st.sampled_from(BACKEND_PAYMENT_STATUSES)
verified_statuses = st.sampled_from(sorted(VERIFIED_STATUSES))
pending_statuses = st.sampled_from(sorted(PENDING_STATUSES))
rejected_statuses = st.sampled_from(sorted(REJECTED_STATUSES))
unknown_statuses = st.text(min_size=0, max_size=30).filter(
    lambda s: s not in VERIFIED_STATUSES
    and s not in PENDING_STATUSES
    and s not in REJECTED_STATUSES
)
nullable_statuses = st.one_of(st.none(), backend_statuses)


# ---------------------------------------------------------------------------
# Tests — Property 29: Payment status normalization
# ---------------------------------------------------------------------------


class TestNormalizePaymentStatusCoversAllBackendValues(SimpleTestCase):
    """Property 29: normalizePaymentStatus() handles all backend payment
    status values and returns a valid canonical status.

    **Validates: Requirements 7.5**
    """

    @given(status=backend_statuses)
    @settings(max_examples=5)
    def test_all_backend_statuses_produce_valid_canonical_status(self, status):
        """For any backend payment status value, normalizePaymentStatus()
        returns one of the four canonical statuses."""
        result = normalize_payment_status(status)
        self.assertIn(result, CANONICAL_STATUSES)

    @given(status=verified_statuses)
    @settings(max_examples=5)
    def test_verified_statuses_normalize_to_verified(self, status):
        """verified, paid, successful, force_approved all normalize to 'verified'."""
        result = normalize_payment_status(status)
        self.assertEqual(result, "verified")

    @given(status=pending_statuses)
    @settings(max_examples=5)
    def test_pending_statuses_normalize_to_pending_review(self, status):
        """pending, pending_review normalize to 'pending_review'."""
        result = normalize_payment_status(status)
        self.assertEqual(result, "pending_review")

    @given(status=rejected_statuses)
    @settings(max_examples=5)
    def test_rejected_statuses_normalize_to_rejected(self, status):
        """failed, rejected normalize to 'rejected'."""
        result = normalize_payment_status(status)
        self.assertEqual(result, "rejected")

    @given(status=unknown_statuses)
    @settings(max_examples=5)
    def test_unknown_statuses_normalize_to_not_paid(self, status):
        """Any unrecognized status (including empty string) normalizes to 'not_paid'."""
        result = normalize_payment_status(status)
        self.assertEqual(result, "not_paid")

    def test_null_normalizes_to_not_paid(self):
        """None (null) normalizes to 'not_paid'."""
        result = normalize_payment_status(None)
        self.assertEqual(result, "not_paid")


class TestIsPaymentVerified(SimpleTestCase):
    """Property 29b: isPaymentVerified() returns true for verified, paid,
    successful, and force_approved.

    **Validates: Requirements 7.5**
    """

    @given(status=verified_statuses)
    @settings(max_examples=5)
    def test_verified_statuses_return_true(self, status):
        """isPaymentVerified() returns True for all verified-equivalent statuses."""
        self.assertTrue(is_payment_verified(status))

    @given(status=st.one_of(pending_statuses, rejected_statuses))
    @settings(max_examples=5)
    def test_non_verified_statuses_return_false(self, status):
        """isPaymentVerified() returns False for pending and rejected statuses."""
        self.assertFalse(is_payment_verified(status))

    def test_null_returns_false(self):
        """isPaymentVerified() returns False for None."""
        self.assertFalse(is_payment_verified(None))

    @given(status=unknown_statuses)
    @settings(max_examples=5)
    def test_unknown_statuses_return_false(self, status):
        """isPaymentVerified() returns False for any unrecognized status."""
        self.assertFalse(is_payment_verified(status))


class TestLegacyStatusCompatibility(SimpleTestCase):
    """Verify legacy 'verified' status is handled consistently with
    current 'paid'/'successful' statuses.

    **Validates: Requirements 7.5**
    """

    def test_legacy_verified_equals_current_paid(self):
        """Legacy 'verified' and current 'paid' produce the same result."""
        self.assertEqual(
            normalize_payment_status("verified"),
            normalize_payment_status("paid"),
        )

    def test_legacy_verified_equals_current_successful(self):
        """Legacy 'verified' and current 'successful' produce the same result."""
        self.assertEqual(
            normalize_payment_status("verified"),
            normalize_payment_status("successful"),
        )

    def test_force_approved_equals_verified(self):
        """Admin 'force_approved' produces the same result as 'verified'."""
        self.assertEqual(
            normalize_payment_status("force_approved"),
            normalize_payment_status("verified"),
        )
