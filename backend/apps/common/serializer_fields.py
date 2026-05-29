"""Shared DRF field types for the admissions and accounts domains.

Single source of truth for cross-app fields that historically drifted -
notably ``sex``, where the profile and application serializers used
different casings and the frontend Zod schema disagreed with both.
"""

from __future__ import annotations

from rest_framework import serializers

# Canonical sex values stored in the database. Lowercase by convention:
# the ``applications`` table already stored lowercase, the ``profiles``
# table historically stored mixed casings without enforcement. New writes
# go through this field and normalise to lowercase; reads echo back what
# is stored so the frontend normaliser (``normalizeSexForWizard``) can
# present the value as Male/Female regardless of legacy casing.
SEX_CHOICES = ("male", "female")


class SexField(serializers.CharField):
    """Case-insensitive sex field that normalises to lowercase on write.

    Accepts ``Male`` / ``Female`` / ``MALE`` / ``female`` / ``M`` / ``F``
    and returns ``"male"`` / ``"female"``. Empty strings are passed
    through unchanged so blank-allowed serializers keep working.
    """

    default_error_messages = {
        "invalid_choice": "Sex must be one of: male, female (case insensitive).",
    }

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("max_length", 10)
        super().__init__(*args, **kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if value is None:
            return value
        normalised = str(value).strip().lower()
        if normalised == "":
            return ""
        if normalised in {"m", "male"}:
            return "male"
        if normalised in {"f", "female"}:
            return "female"
        self.fail("invalid_choice")
        return None  # unreachable - fail() raises

    def to_representation(self, value):
        # Echo whatever is stored. Legacy rows may still hold "Male"/"Female";
        # the frontend normaliser handles both casings on read.
        return super().to_representation(value)
