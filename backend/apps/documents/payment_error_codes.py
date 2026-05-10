"""Stable payment error-code catalogue.

Spec:     ``.kiro/specs/payment-hardening/``
Task:     22.1 — stable error code catalogue (single source of truth for
          backend payment endpoints).
Phase:    Phase 3 — webhook dedup strict + stable error codes.

Every payment endpoint returns error envelopes whose ``code`` value comes
from :data:`PAYMENT_ERROR_CODES`. The frontend's
``apps/admissions/src/lib/paymentErrorCodes.ts`` mirrors the same code
list (drift detected by ``test_payment_error_codes_snapshot.py``).

Each entry carries:

* ``http_status``  — the HTTP status the endpoint MUST emit.
* ``message``      — the user-facing message the error envelope carries.
                     Plain language, no provider names, no technical detail.

**Stable code contract**:

* Codes are strings.
* Codes never change meaning across releases (R15.5).
* New cases are added as new codes, not by repurposing existing ones.

Requirements satisfied: R15.1, R15.2, R15.3, R15.4, R15.5.
"""

from __future__ import annotations

from dataclasses import dataclass

from rest_framework import status


@dataclass(frozen=True)
class PaymentErrorCode:
    """One row of the stable-code catalogue."""

    code: str
    http_status: int
    message: str


# ---------------------------------------------------------------------------
# Authoritative catalogue
# ---------------------------------------------------------------------------
#
# The key of each entry equals the ``code`` string — keep them in sync.
# ``test_payment_error_codes_snapshot.py`` snapshots the whole dict so any
# accidental rename or message drift fails CI.

PAYMENT_ERROR_CODES: dict[str, PaymentErrorCode] = {
    # Ownership / lookup
    "NOT_OWNER": PaymentErrorCode(
        code="NOT_OWNER",
        http_status=status.HTTP_403_FORBIDDEN,
        message="Not authorized",
    ),
    "APPLICATION_NOT_FOUND": PaymentErrorCode(
        code="APPLICATION_NOT_FOUND",
        http_status=status.HTTP_404_NOT_FOUND,
        message="Application not found",
    ),
    "APPLICATION_NOT_PAYABLE": PaymentErrorCode(
        code="APPLICATION_NOT_PAYABLE",
        http_status=status.HTTP_400_BAD_REQUEST,
        message="Application is not payable",
    ),
    "ALREADY_PAID": PaymentErrorCode(
        code="ALREADY_PAID",
        http_status=status.HTTP_200_OK,
        message="Application is already paid",
    ),

    # Initiation
    "MAX_PAYMENT_ATTEMPTS_EXCEEDED": PaymentErrorCode(
        code="MAX_PAYMENT_ATTEMPTS_EXCEEDED",
        http_status=status.HTTP_400_BAD_REQUEST,
        message="Maximum payment attempts exceeded. Please contact support.",
    ),

    # Verify stable codes
    "PAYMENT_PENDING": PaymentErrorCode(
        code="PAYMENT_PENDING",
        http_status=status.HTTP_200_OK,
        message="Payment is still being processed",
    ),
    "PAYMENT_CONFIRMED": PaymentErrorCode(
        code="PAYMENT_CONFIRMED",
        http_status=status.HTTP_200_OK,
        message="Payment confirmed",
    ),

    # Integrity-gate risk codes
    "AMOUNT_MISMATCH": PaymentErrorCode(
        code="AMOUNT_MISMATCH",
        http_status=status.HTTP_200_OK,
        message="Payment amount does not match expected fee",
    ),
    "CURRENCY_MISMATCH": PaymentErrorCode(
        code="CURRENCY_MISMATCH",
        http_status=status.HTTP_200_OK,
        message="Payment currency does not match expected currency",
    ),
    "MISSING_PROVIDER_REFERENCE": PaymentErrorCode(
        code="MISSING_PROVIDER_REFERENCE",
        http_status=status.HTTP_200_OK,
        message="Payment provider reference is missing",
    ),

    # Provider availability
    "PROVIDER_UNAVAILABLE": PaymentErrorCode(
        code="PROVIDER_UNAVAILABLE",
        http_status=status.HTTP_200_OK,
        message="Payment provider is temporarily unavailable. Please try again.",
    ),
    "PAYMENT_UNAVAILABLE": PaymentErrorCode(
        code="PAYMENT_UNAVAILABLE",
        http_status=status.HTTP_503_SERVICE_UNAVAILABLE,
        message="Payment processing is unavailable",
    ),

    # Fee resolver
    "FEE_UNAVAILABLE": PaymentErrorCode(
        code="FEE_UNAVAILABLE",
        http_status=status.HTTP_404_NOT_FOUND,
        message="Fee is not available for this program and residency",
    ),

    # Sensitive-field + draft locks
    "PAYMENT_SENSITIVE_FIELDS_LOCKED": PaymentErrorCode(
        code="PAYMENT_SENSITIVE_FIELDS_LOCKED",
        http_status=status.HTTP_409_CONFLICT,
        message="Payment-sensitive fields cannot be changed while payment activity exists",
    ),
    "DRAFT_DELETE_BLOCKED_BY_PAYMENT": PaymentErrorCode(
        code="DRAFT_DELETE_BLOCKED_BY_PAYMENT",
        http_status=status.HTTP_409_CONFLICT,
        message="Draft cannot be deleted while a payment record exists",
    ),

    # Admin + super-admin
    "CANNOT_REVERSE_SUCCESSFUL_PAYMENT": PaymentErrorCode(
        code="CANNOT_REVERSE_SUCCESSFUL_PAYMENT",
        http_status=status.HTTP_409_CONFLICT,
        message="A successful payment cannot be reversed",
    ),
    "OVERRIDE_REASON_REQUIRED": PaymentErrorCode(
        code="OVERRIDE_REASON_REQUIRED",
        http_status=status.HTTP_400_BAD_REQUEST,
        message="A reason of at least 10 characters is required",
    ),

    # Receipt
    "RECEIPT_NOT_ELIGIBLE": PaymentErrorCode(
        code="RECEIPT_NOT_ELIGIBLE",
        http_status=status.HTTP_409_CONFLICT,
        message="Receipt is not available for this payment",
    ),

    # Throttling / validation
    "RATE_LIMITED": PaymentErrorCode(
        code="RATE_LIMITED",
        http_status=status.HTTP_429_TOO_MANY_REQUESTS,
        message="Too many requests. Please wait and try again.",
    ),
    "VALIDATION_ERROR": PaymentErrorCode(
        code="VALIDATION_ERROR",
        http_status=status.HTTP_400_BAD_REQUEST,
        message="Validation failed",
    ),
}


def get_error_code(code: str) -> PaymentErrorCode:
    """Look up a catalogue entry by stable code.

    Raises ``KeyError`` on unknown codes so callers fail fast in tests.
    """
    return PAYMENT_ERROR_CODES[code]


__all__ = [
    "PAYMENT_ERROR_CODES",
    "PaymentErrorCode",
    "get_error_code",
]
