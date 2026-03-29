"""Zambian data format validators.

Implements task 6.4.
Requirements: 16.1, 16.2, 16.3, 16.4, 16.5
"""

import re

from django.core.exceptions import ValidationError


def validate_zambian_phone(value):
    """Validates +260 followed by 9 digits."""
    cleaned = value.strip()
    if not re.match(r"^\+260\d{9}$", cleaned):
        raise ValidationError(
            f"{value} is not a valid Zambian phone number (+260XXXXXXXXX)"
        )
    return cleaned


def validate_nrc(value):
    """Validates NRC format: 123456/78/9."""
    cleaned = value.strip()
    if not re.match(r"^\d{6}/\d{2}/\d$", cleaned):
        raise ValidationError(
            f"{value} is not a valid NRC number (format: 123456/78/9)"
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


def normalize_nationality(value):
    """Normalizes nationality, defaults to 'Zambian'."""
    if not value or not value.strip():
        return "Zambian"
    return value.strip()
