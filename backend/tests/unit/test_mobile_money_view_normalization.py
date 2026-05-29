"""Unit tests — MSISDN normalisation and operator derivation.

Purpose
-------
Pin down the behaviour of the two module-level MSISDN helpers in
``apps.documents.payment_service`` (``_normalize_phone_e164`` and
``_operator_for_msisdn``) plus the narrow contract of
``PaymentService.initiate_mobile_money``. Both helpers are pure
functions with no DB dependency; the service method signature itself
acts as a compile-time guarantee that client-supplied ``operator``,
``amount``, and ``currency`` fields can never leak into the Lenco
request (R4.6).

Scope
-----
* Accepts every documented Zambian MSISDN shape — ``+260…``, ``0…``,
  ``260…``, bare 9-digit, with embedded whitespace, dashes, and
  parentheses — and normalises to ``+260XXXXXXXXX`` (R11.5).
* Derives the operator strictly from the MSISDN prefix: MTN (``97``,
  ``76``) and Airtel (``95``, ``96``, ``75``, ``77``). Unknown prefixes
  MUST raise ``ValueError("PROVIDER_UNAVAILABLE")`` — they are never
  guessed (R11.6).
* ``PaymentService.initiate_mobile_money`` takes only ``application_id``,
  ``user_id``, and ``phone_raw``. There is no client-supplied
  ``operator`` / ``amount`` / ``currency`` field on the method
  signature, so the "ignores client-supplied fields" guarantee is
  enforced at compile time rather than at runtime (R4.6).
* Invalid inputs — empty, ``None``, letters, wrong lengths — must all
  raise ``ValueError("INVALID_PHONE_FORMAT")``.

Validates: Requirements R11.5, R11.6, R4.6
"""

from __future__ import annotations

import inspect

import pytest

from apps.documents.payment_service import (
    PaymentService,
    _normalize_phone_e164,
    _operator_for_msisdn,
)


# ---------------------------------------------------------------------------
# _normalize_phone_e164 — canonical happy-path shapes
# ---------------------------------------------------------------------------


_CANONICAL = "+260977000000"


@pytest.mark.parametrize(
    "phone_raw",
    [
        # Already E.164 → identity.
        "+260977000000",
        # National trunk prefix ``0`` → stripped, ``+260`` prepended.
        "0977000000",
        # Country code without ``+`` → ``+`` prepended.
        "260977000000",
        # Bare 9-digit subscriber number.
        "977000000",
        # Whitespace between groups.
        "+260 977 000 000",
        # Dash separators.
        "+260-977-000-000",
        # Mixed separators (parens + dashes).
        "+260(977)000-000",
    ],
    ids=[
        "already-e164",
        "national-trunk-0",
        "country-code-no-plus",
        "bare-9-digit",
        "whitespace-separators",
        "dash-separators",
        "parens-and-dashes",
    ],
)
def test_normalize_phone_e164_returns_canonical_form(phone_raw: str) -> None:
    """All documented shapes normalise to the same ``+260977000000``.

    Validates: Requirements R11.5
    """
    assert _normalize_phone_e164(phone_raw) == _CANONICAL


# ---------------------------------------------------------------------------
# _normalize_phone_e164 — invalid inputs raise INVALID_PHONE_FORMAT
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "phone_raw",
    [
        "",                      # empty string
        "   ",                   # whitespace-only
        "abc977000000",          # letters
        "97700000",              # 8 digits (too short)
        "97700000000",           # 11 digits (wrong length for 9-bare / trunk / country)
        "26097700000000",        # 14 digits (too long)
        "+260-abc-000-000",      # letters after separators are stripped
        "+++",                   # only plus signs after strip
    ],
    ids=[
        "empty-string",
        "whitespace-only",
        "letters-prefix",
        "8-digit",
        "11-digit",
        "14-digit",
        "letters-embedded",
        "only-plus-signs",
    ],
)
def test_normalize_phone_e164_rejects_malformed(phone_raw: str) -> None:
    """Malformed inputs raise ``ValueError("INVALID_PHONE_FORMAT")``.

    Validates: Requirements R11.5
    """
    with pytest.raises(ValueError) as excinfo:
        _normalize_phone_e164(phone_raw)
    assert "INVALID_PHONE_FORMAT" in str(excinfo.value)


def test_normalize_phone_e164_rejects_none() -> None:
    """``None`` input raises ``ValueError("INVALID_PHONE_FORMAT")``.

    Validates: Requirements R11.5
    """
    with pytest.raises(ValueError) as excinfo:
        _normalize_phone_e164(None)  # type: ignore[arg-type]
    assert "INVALID_PHONE_FORMAT" in str(excinfo.value)


# ---------------------------------------------------------------------------
# _operator_for_msisdn — prefix → operator mapping
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("msisdn", "expected_operator"),
    [
        # MTN prefixes (ZICTA numbering plan: 96, 76).
        ("+260960000000", "mtn"),
        ("+260760000000", "mtn"),
        # Airtel prefixes (ZICTA numbering plan: 97, 77).
        ("+260970000000", "airtel"),
        ("+260770000000", "airtel"),
    ],
    ids=[
        "mtn-96",
        "mtn-76",
        "airtel-97",
        "airtel-77",
    ],
)
def test_operator_for_msisdn_maps_known_prefix(
    msisdn: str, expected_operator: str,
) -> None:
    """Known MTN/Airtel prefixes resolve to the correct operator string.

    Mapping follows the ZICTA national numbering plan: 96/76 -> MTN,
    97/77 -> Airtel. (Earlier code inverted 96/97, which made Lenco return
    "Account details was not found" because the operator was wrong.)

    Validates: Requirements R11.6
    """
    assert _operator_for_msisdn(msisdn) == expected_operator


@pytest.mark.parametrize(
    "msisdn",
    [
        "+260900000000",   # 90 — not allocated to MTN/Airtel in design
        "+260100000000",   # 10 — out of range
        "+260220000000",   # 22 — unknown prefix
        "+260000000000",   # 00 — clearly invalid prefix
        "+260950000000",   # 95 — Zamtel (no Lenco mobile money)
        "+260750000000",   # 75 — Zamtel (no Lenco mobile money)
    ],
    ids=[
        "prefix-90",
        "prefix-10",
        "prefix-22",
        "prefix-00",
        "zamtel-95",
        "zamtel-75",
    ],
)
def test_operator_for_msisdn_rejects_unknown_prefix(msisdn: str) -> None:
    """Unknown prefixes raise ``ValueError("PROVIDER_UNAVAILABLE")``.

    The design is explicit that the operator classification is a backend
    responsibility only — unknown prefixes are refused rather than
    guessed.

    Validates: Requirements R11.6
    """
    with pytest.raises(ValueError) as excinfo:
        _operator_for_msisdn(msisdn)
    assert "PROVIDER_UNAVAILABLE" in str(excinfo.value)


@pytest.mark.parametrize(
    "msisdn",
    [
        "",                  # empty
        "+26097700000",      # too short (missing one digit)
        "+2609770000000",    # too long
        "260977000000",      # no leading ``+``
        "+261977000000",     # wrong country code
    ],
    ids=[
        "empty",
        "too-short",
        "too-long",
        "no-plus-prefix",
        "wrong-country-code",
    ],
)
def test_operator_for_msisdn_rejects_malformed_e164(msisdn: str) -> None:
    """Mis-shaped E.164 inputs also raise ``PROVIDER_UNAVAILABLE``.

    Validates: Requirements R11.6
    """
    with pytest.raises(ValueError) as excinfo:
        _operator_for_msisdn(msisdn)
    assert "PROVIDER_UNAVAILABLE" in str(excinfo.value)


# ---------------------------------------------------------------------------
# Env override for operator prefixes (ops can correct routing w/o redeploy)
# ---------------------------------------------------------------------------


def test_operator_prefix_env_override(settings) -> None:
    """``LENCO_MTN_PREFIXES`` / ``LENCO_AIRTEL_PREFIXES`` override defaults.

    Lets ops re-route an operator prefix without a code deploy if Lenco's
    routing ever diverges from the ZICTA plan.
    """
    # Swap 96 to Airtel and 97 to MTN via env (inverse of the default).
    settings.LENCO_AIRTEL_PREFIXES = "96"
    settings.LENCO_MTN_PREFIXES = "97"
    assert _operator_for_msisdn("+260960000000") == "airtel"
    assert _operator_for_msisdn("+260970000000") == "mtn"


# ---------------------------------------------------------------------------
# initiate_mobile_money — method signature enforces R4.6 at compile time
# ---------------------------------------------------------------------------


def test_initiate_mobile_money_signature_has_no_client_override_fields() -> None:
    """``initiate_mobile_money`` accepts only server-trusted inputs.

    Because the method signature only takes ``application_id``, ``user_id``,
    and ``phone_raw``, there is no mechanism by which a caller could
    supply an ``operator``, ``amount``, or ``currency`` override — the
    operator is derived from the MSISDN and the amount/currency come from
    the fee snapshot. This is a compile-time guarantee: any attempt to
    pass those fields raises ``TypeError`` at call time rather than
    leaking into the Lenco request.

    Validates: Requirements R4.6
    """
    sig = inspect.signature(PaymentService.initiate_mobile_money)
    params = set(sig.parameters.keys())
    # ``self`` plus the three documented parameters and nothing else.
    assert params == {"self", "application_id", "user_id", "phone_raw"}, (
        f"Unexpected parameters on initiate_mobile_money: {params!r}. "
        "Client-supplied operator/amount/currency fields must not be "
        "accepted on the service signature."
    )
    # No positional-or-keyword parameter may accept operator/amount/currency
    # by name — belt-and-braces check in case the signature grows later.
    forbidden = {"operator", "amount", "currency"}
    assert forbidden.isdisjoint(params), (
        f"initiate_mobile_money must not accept client-override fields; "
        f"found {forbidden & params!r}."
    )
