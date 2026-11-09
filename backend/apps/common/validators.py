"""Zambian data format validators.

Implements task 6.4.
Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
"""

import re

from django.core.exceptions import ValidationError


_PHONE_MESSAGE = (
    "Enter a Zambian mobile number, for example 0977654321 or +260977654321."
)


def _strip_separators(value: str) -> str:
    cleaned = value.strip()
    for ch in (" ", "-", "(", ")", "\t"):
        cleaned = cleaned.replace(ch, "")
    return cleaned


def normalize_zambian_msisdn(phone_raw: str) -> str:
    """Normalise a Zambian MSISDN to E.164 (``+260XXXXXXXXX``).

    Accepts these shapes, with whitespace / dashes stripped:

    - ``+260XXXXXXXXX`` - already E.164, passed through.
    - ``0XXXXXXXXX``    - national trunk prefix stripped, ``+260`` added.
    - ``260XXXXXXXXX``  - country code without ``+``, ``+`` prepended.
    - ``XXXXXXXXX``     - 9-digit bare subscriber number, ``+260`` prepended.

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


def validate_zambian_phone(value):
    """Accept a Zambian mobile number as printed or as E.164; return ``+260XXXXXXXXX``.

    Accepts ``0971234567``, ``260971234567``, ``971234567`` and
    ``+260971234567`` (spaces, dashes and brackets ignored). The message never
    contains the submitted value.

    Registration-only pre-check: an input that starts with ``+`` must be
    ``+260`` followed by exactly nine digits. The shared normaliser reads
    ``+260`` plus six digits as a bare nine-digit number, which would store the
    typo as ``+260260...``; HEAD refused every such input, so it stays refused.
    """
    if not isinstance(value, str):
        raise ValidationError(_PHONE_MESSAGE, code="invalid_phone")
    stripped = _strip_separators(value)
    if stripped.startswith("+") and not re.fullmatch(r"\+260\d{9}", stripped):
        raise ValidationError(_PHONE_MESSAGE, code="invalid_phone")
    try:
        return normalize_zambian_msisdn(value)
    except ValueError:
        raise ValidationError(_PHONE_MESSAGE, code="invalid_phone") from None


def validate_nrc(value):
    """Validates NRC format: 123456/78/9. The message never contains the value."""
    cleaned = value.strip()
    if not re.match(r"^\d{6}/\d{2}/\d$", cleaned):
        raise ValidationError(
            "Enter an NRC number in the format 123456/78/9.", code="invalid_nrc"
        )
    return cleaned


def validate_ecz_grade(value):
    """Validates ECZ grade 1-9."""
    if not isinstance(value, int) or value < 1 or value > 9:
        raise ValidationError(f"{value} is not a valid ECZ grade (1-9)")
    return value


def validate_ecz_subject_code(value):
    """Validates subject code exists in subjects table."""
    from apps.catalog.models import Subject

    if not Subject.objects.filter(code=value).exists():
        raise ValidationError(f"{value} is not a valid ECZ subject code")
    return value


E164_PATTERN = re.compile(r"^\+?[0-9]{7,15}$")


def validate_phone_e164(phone):
    """Validates international phone: 7-15 digits, optional leading +."""
    if not E164_PATTERN.match(phone):
        raise ValidationError(
            {"phone": "Phone must be 7-15 digits, optionally prefixed with +."},
            code="INVALID_PHONE",
        )
    return phone


def normalize_nationality(value):
    """Normalizes nationality, defaults to 'Zambian'."""
    if not value or not value.strip():
        return "Zambian"
    return value.strip()
