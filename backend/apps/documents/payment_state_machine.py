"""Payment state-machine validation logic - extracted from payment_service.py.

Pure functions for validating payment transitions and integrity checks.
These functions have no side effects (no DB writes, no audit emission).
The ``PaymentService`` class calls them and handles side effects itself.
"""

from __future__ import annotations

import logging
from decimal import Decimal, InvalidOperation
from typing import Optional

logger = logging.getLogger(__name__)


def check_integrity_gate(
    *,
    provider_data: dict,
    payment_amount: Decimal | None,
    payment_currency: str | None,
    payment_id,
    snapshot: dict,
) -> Optional[tuple[str, dict]]:
    """Run the 4-check integrity gate for ``successful`` transitions.

    Returns ``None`` when all checks pass. Otherwise returns a tuple of
    ``(risk_flag_type, details_dict)`` describing the failure.

    Pure function - no DB writes, no audit emission.

    Checks:

    1. Amount equality at 2 decimal places via ``Decimal``.
       Zero/negative/unparseable amounts yield ``invalid_amount``.
    2. Currency case-insensitive equality.
    3. Non-empty provider reference (``lencoReference``).
    4. Snapshot presence (advisory - logged but not blocking).
    """
    # --- Check 1: amount ---
    raw_amount = provider_data.get("amount")
    try:
        if raw_amount is None:
            raise InvalidOperation
        provider_amount = Decimal(str(raw_amount)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError, TypeError):
        return (
            "invalid_amount",
            {"received": str(raw_amount), "source": "integrity_gate"},
        )

    if provider_amount <= Decimal("0"):
        return (
            "invalid_amount",
            {
                "received": str(provider_amount),
                "source": "integrity_gate",
                "reason": "non_positive_amount",
            },
        )

    expected_amount = (
        Decimal(str(snapshot["expected_amount"])).quantize(Decimal("0.01"))
        if snapshot.get("expected_amount") is not None
        else (payment_amount or Decimal("0")).quantize(Decimal("0.01"))
    )
    if provider_amount != expected_amount:
        return (
            "amount_mismatch",
            {
                "expected": str(expected_amount),
                "received": str(provider_amount),
                "source": "integrity_gate",
            },
        )

    # --- Check 2: currency (case-insensitive) ---
    provider_currency = str(provider_data.get("currency") or "").strip()
    expected_currency = (
        snapshot.get("currency") or payment_currency or ""
    ).strip()
    if provider_currency and expected_currency and (
        provider_currency.upper() != expected_currency.upper()
    ):
        return (
            "currency_mismatch",
            {
                "expected": expected_currency,
                "received": provider_currency,
                "source": "integrity_gate",
            },
        )

    # --- Check 3: non-empty provider reference ---
    lenco_reference = str(
        provider_data.get("lencoReference") or ""
    ).strip()
    if not lenco_reference:
        return (
            "missing_provider_reference",
            {"source": "integrity_gate"},
        )

    # --- Check 4: snapshot presence (advisory) ---
    if not snapshot:
        logger.info(
            "Integrity gate: payment %s has no metadata.snapshot "
            "(pre-hardening row); proceeding without snapshot check",
            payment_id,
        )

    return None


def check_legacy_mismatch(
    lenco_data: dict,
    payment_amount: Decimal | None,
    payment_currency: str | None,
) -> Optional[tuple[str, dict]]:
    """Check amount/currency mismatch for the legacy ``_update_payment_status`` path.

    Returns ``None`` if no mismatch, or ``(risk_type, details)`` if blocked.
    """
    from apps.documents.payment_helpers import _parse_amount

    lenco_amount = _parse_amount(lenco_data.get("amount"))
    if lenco_amount is not None and lenco_amount != payment_amount:
        return (
            "amount_mismatch",
            {
                "expected": str(payment_amount),
                "received": str(lenco_amount),
                "source": "lenco_status_update",
            },
        )

    lenco_currency = str(lenco_data.get("currency", "")).upper()
    if lenco_currency and payment_currency and lenco_currency != payment_currency.upper():
        return (
            "currency_mismatch",
            {
                "expected": payment_currency,
                "received": lenco_currency,
                "source": "lenco_status_update",
            },
        )

    return None
