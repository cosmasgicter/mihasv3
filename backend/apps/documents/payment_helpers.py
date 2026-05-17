"""Payment service module-level helper functions — extracted from payment_service.py.

Stream 9 Phase 2 of the canonical-truth program. Pure helpers used by the
``PaymentService`` class and by other modules (validators, tasks, tests).
Keeping them here lets callers import without instantiating the full service.

The ``payment_service.py`` module continues to re-export every symbol here
for backward compatibility with existing imports.
"""

from __future__ import annotations

import base64
import secrets
import time
from decimal import Decimal


# ---------------------------------------------------------------------------
# Reference & receipt generators
# ---------------------------------------------------------------------------


def _generate_reference(application_number: str) -> str:
    """Build a unique payment reference.

    Format: ``MIHAS-{application_number}-{unix_timestamp_ms}``
    Example: ``MIHAS-APP-2025-0001-1719849600000``
    """
    ts_ms = int(time.time() * 1000)
    return f"MIHAS-{application_number}-{ts_ms}"


def _generate_receipt_number() -> str:
    """Allocate a 12-character base32 receipt identifier.

    Uses ``secrets.token_bytes(8)`` (64 bits) as entropy source, then
    base32-encodes and trims to 12 characters (~60 bits). The output
    character set is ``[A-Z2-7]`` (standard base32 alphabet, padding
    stripped) so receipts are safe to print, read aloud, and embed in
    URLs without additional encoding.

    Uniqueness is enforced downstream by ``uq_payments_receipt_number``.
    """
    raw = secrets.token_bytes(8)
    return base64.b32encode(raw).decode("ascii").rstrip("=")[:12]


def _parse_amount(value) -> Decimal | None:
    """Safely coerce a Lenco amount value to ``Decimal``."""
    if value is None:
        return None
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    except Exception:
        return None


# ---------------------------------------------------------------------------
# MSISDN helpers — shared between mobile-money initiation and validators
# ---------------------------------------------------------------------------

# Two-digit MSISDN prefixes (after +260) for each operator. Sourced from
# Lenco's country documentation for Zambia. Kept deliberately narrow —
# numbers outside these prefixes must be rejected with ``PROVIDER_UNAVAILABLE``
# rather than guessed.
_AIRTEL_PREFIXES: frozenset[str] = frozenset({"95", "96", "75", "77"})
_MTN_PREFIXES: frozenset[str] = frozenset({"97", "76"})


def _normalize_phone_e164(phone_raw: str) -> str:
    """Normalise a Zambian MSISDN to E.164 (``+260XXXXXXXXX``).

    Accepts these shapes, with whitespace / dashes stripped:

    - ``+260XXXXXXXXX`` — already E.164, passed through.
    - ``0XXXXXXXXX``    — national trunk prefix stripped, ``+260`` added.
    - ``260XXXXXXXXX``  — country code without ``+``, ``+`` prepended.
    - ``XXXXXXXXX``     — 9-digit bare subscriber number, ``+260`` prepended.

    Anything else raises ``ValueError("INVALID_PHONE_FORMAT")``.
    """
    if phone_raw is None:
        raise ValueError("INVALID_PHONE_FORMAT")

    cleaned = phone_raw.strip()
    for ch in (" ", "-", "(", ")", "\t"):
        cleaned = cleaned.replace(ch, "")

    if not cleaned:
        raise ValueError("INVALID_PHONE_FORMAT")

    digits = cleaned[1:] if cleaned.startswith("+") else cleaned

    if not digits.isdigit():
        raise ValueError("INVALID_PHONE_FORMAT")

    # +260XXXXXXXXX → 260 + 9 digits
    if digits.startswith("260") and len(digits) == 12:
        return f"+{digits}"

    # 0XXXXXXXXX → strip trunk, add +260
    if digits.startswith("0") and len(digits) == 10:
        return f"+260{digits[1:]}"

    # Bare 9-digit subscriber number
    if len(digits) == 9:
        return f"+260{digits}"

    raise ValueError("INVALID_PHONE_FORMAT")


def _operator_for_msisdn(phone_e164: str) -> str:
    """Derive the operator (``airtel`` / ``mtn``) from an E.164 MSISDN.

    Expects the output shape of ``_normalize_phone_e164`` — i.e. ``+260``
    followed by 9 digits. The two digits immediately after ``+260`` identify
    the operator.

    Raises ``ValueError("PROVIDER_UNAVAILABLE")`` when the prefix is not a
    recognised Airtel or MTN Zambia range.
    """
    if not phone_e164 or not phone_e164.startswith("+260") or len(phone_e164) != 13:
        raise ValueError("PROVIDER_UNAVAILABLE")
    prefix = phone_e164[4:6]
    if prefix in _AIRTEL_PREFIXES:
        return "airtel"
    if prefix in _MTN_PREFIXES:
        return "mtn"
    raise ValueError("PROVIDER_UNAVAILABLE")


__all__ = [
    "_AIRTEL_PREFIXES",
    "_MTN_PREFIXES",
    "_generate_receipt_number",
    "_generate_reference",
    "_normalize_phone_e164",
    "_operator_for_msisdn",
    "_parse_amount",
]
