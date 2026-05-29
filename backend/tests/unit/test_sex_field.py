"""Unit tests for apps.common.serializer_fields.SexField."""

import pytest
from rest_framework import serializers

from apps.common.serializer_fields import SexField


class TestSexFieldToInternalValue:
    def setup_method(self):
        self.field = SexField()
        self.field._run_validation = lambda d: d  # bypass parent validators
        # Bind field so fail() works
        self.field.field_name = "sex"
        self.field.parent = None

    def test_lowercase_male(self):
        assert self.field.to_internal_value("male") == "male"

    def test_lowercase_female(self):
        assert self.field.to_internal_value("female") == "female"

    def test_uppercase_male(self):
        assert self.field.to_internal_value("MALE") == "male"

    def test_uppercase_female(self):
        assert self.field.to_internal_value("FEMALE") == "female"

    def test_mixed_case_male(self):
        assert self.field.to_internal_value("Male") == "male"

    def test_mixed_case_female(self):
        assert self.field.to_internal_value("Female") == "female"

    def test_single_letter_m(self):
        assert self.field.to_internal_value("M") == "male"

    def test_single_letter_f(self):
        assert self.field.to_internal_value("F") == "female"

    def test_empty_string(self):
        assert self.field.to_internal_value("") == ""

    def test_whitespace_male(self):
        assert self.field.to_internal_value("  male  ") == "male"

    def test_whitespace_female(self):
        assert self.field.to_internal_value("  F  ") == "female"

    def test_invalid_value(self):
        with pytest.raises(serializers.ValidationError):
            self.field.to_internal_value("other")

    def test_none_raises_when_not_allowed(self):
        with pytest.raises(serializers.ValidationError):
            self.field.to_internal_value(None)


class TestSexFieldToRepresentation:
    def setup_method(self):
        self.field = SexField()

    def test_echoes_lowercase(self):
        assert self.field.to_representation("male") == "male"

    def test_echoes_legacy_mixed_case(self):
        assert self.field.to_representation("Male") == "Male"

    def test_echoes_uppercase(self):
        assert self.field.to_representation("FEMALE") == "FEMALE"

    def test_echoes_empty(self):
        assert self.field.to_representation("") == ""
