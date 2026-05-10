"""Snapshot pin of the stable error code catalogue.

Locks in the `(code → HTTP status, message)` triples published by
``apps.documents.payment_error_codes.PAYMENT_ERROR_CODES``. Any accidental
rename, HTTP-status change, or message drift fails CI so breaking
changes to the stable-code contract are surfaced at review time.

Validates: Requirements R15.5.
"""

from __future__ import annotations

import pytest

from apps.documents.payment_error_codes import PAYMENT_ERROR_CODES


# Canonical snapshot. Update deliberately — do NOT sync-on-write.
_EXPECTED: dict[str, tuple[int, str]] = {
    "NOT_OWNER": (403, "Not authorized"),
    "APPLICATION_NOT_FOUND": (404, "Application not found"),
    "APPLICATION_NOT_PAYABLE": (400, "Application is not payable"),
    "ALREADY_PAID": (200, "Application is already paid"),
    "MAX_PAYMENT_ATTEMPTS_EXCEEDED": (
        400,
        "Maximum payment attempts exceeded. Please contact support.",
    ),
    "PAYMENT_PENDING": (200, "Payment is still being processed"),
    "PAYMENT_CONFIRMED": (200, "Payment confirmed"),
    "AMOUNT_MISMATCH": (200, "Payment amount does not match expected fee"),
    "CURRENCY_MISMATCH": (
        200,
        "Payment currency does not match expected currency",
    ),
    "MISSING_PROVIDER_REFERENCE": (
        200,
        "Payment provider reference is missing",
    ),
    "PROVIDER_UNAVAILABLE": (
        200,
        "Payment provider is temporarily unavailable. Please try again.",
    ),
    "PAYMENT_UNAVAILABLE": (503, "Payment processing is unavailable"),
    "FEE_UNAVAILABLE": (
        404,
        "Fee is not available for this program and residency",
    ),
    "PAYMENT_SENSITIVE_FIELDS_LOCKED": (
        409,
        "Payment-sensitive fields cannot be changed while payment activity exists",
    ),
    "DRAFT_DELETE_BLOCKED_BY_PAYMENT": (
        409,
        "Draft cannot be deleted while a payment record exists",
    ),
    "CANNOT_REVERSE_SUCCESSFUL_PAYMENT": (
        409,
        "A successful payment cannot be reversed",
    ),
    "OVERRIDE_REASON_REQUIRED": (
        400,
        "A reason of at least 10 characters is required",
    ),
    "RECEIPT_NOT_ELIGIBLE": (409, "Receipt is not available for this payment"),
    "RATE_LIMITED": (429, "Too many requests. Please wait and try again."),
    "VALIDATION_ERROR": (400, "Validation failed"),
}


def test_stable_code_set_matches_snapshot() -> None:
    """The set of stable codes in the catalogue matches the snapshot exactly."""
    actual_codes = set(PAYMENT_ERROR_CODES)
    expected_codes = set(_EXPECTED)

    added = actual_codes - expected_codes
    removed = expected_codes - actual_codes

    assert not added and not removed, (
        f"Stable-code catalogue drifted.\n"
        f"Added (bump snapshot after review): {sorted(added)!r}\n"
        f"Removed (do NOT repurpose codes — add a new code instead): "
        f"{sorted(removed)!r}"
    )


@pytest.mark.parametrize(
    ("code", "expected_http_status", "expected_message"),
    [(code, http, msg) for code, (http, msg) in _EXPECTED.items()],
    ids=sorted(_EXPECTED),
)
def test_stable_code_entry_is_exact_match(
    code: str, expected_http_status: int, expected_message: str,
) -> None:
    """Every `(code → http_status, message)` triple matches the snapshot.

    The catalogue entry's ``code`` field must equal the dict key, the
    HTTP status must match, and the user-facing message must be
    byte-identical. Drift on any of the three fails this test.
    """
    entry = PAYMENT_ERROR_CODES[code]

    assert entry.code == code, (
        f"PAYMENT_ERROR_CODES[{code!r}].code is {entry.code!r}; "
        f"catalogue key and code field must stay in sync."
    )
    assert entry.http_status == expected_http_status, (
        f"HTTP status drifted for {code!r}: snapshot expects "
        f"{expected_http_status}, catalogue has {entry.http_status}."
    )
    assert entry.message == expected_message, (
        f"User-facing message drifted for {code!r}.\n"
        f"Snapshot:  {expected_message!r}\n"
        f"Catalogue: {entry.message!r}"
    )
