"""Property-based tests for Zambian data format validation.

# Feature: python-backend-migration, Property 26: Zambian data format validation
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

from django.core.exceptions import ValidationError  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.common.validators import (  # noqa: E402
    normalize_nationality,
    validate_ecz_grade,
    validate_nrc,
    validate_zambian_phone,
)

# ---------------------------------------------------------------------------
# Strategies for valid Zambian data formats
# ---------------------------------------------------------------------------

# Valid Zambian phone: +260 followed by exactly 9 digits
_valid_phone = st.from_regex(r"\+260\d{9}", fullmatch=True)

# Invalid phone: any text that does NOT match +260 + 9 digits
# We generate various invalid patterns to cover edge cases
_invalid_phone = st.one_of(
    # Random text (very unlikely to match the pattern)
    st.text(min_size=1, max_size=30).filter(
        lambda s: not __import__("re").match(r"^\s*\+260\d{9}\s*$", s)
    ),
    # Wrong country code
    st.from_regex(r"\+261\d{9}", fullmatch=True),
    # Too few digits after +260
    st.from_regex(r"\+260\d{1,8}", fullmatch=True),
    # Too many digits after +260
    st.from_regex(r"\+260\d{10,15}", fullmatch=True),
    # Missing + prefix
    st.from_regex(r"260\d{9}", fullmatch=True),
)

# Valid NRC: 6 digits / 2 digits / 1 digit
_valid_nrc = st.from_regex(r"\d{6}/\d{2}/\d", fullmatch=True)

# Invalid NRC: text that does NOT match the NRC pattern
_invalid_nrc = st.one_of(
    st.text(min_size=1, max_size=30).filter(
        lambda s: not __import__("re").match(r"^\s*\d{6}/\d{2}/\d\s*$", s)
    ),
    # Wrong number of digits in first group
    st.from_regex(r"\d{5}/\d{2}/\d", fullmatch=True),
    st.from_regex(r"\d{7}/\d{2}/\d", fullmatch=True),
    # Wrong separator
    st.from_regex(r"\d{6}-\d{2}-\d", fullmatch=True),
)

# Valid ECZ grade: integer 1-9
_valid_grade = st.integers(min_value=1, max_value=9)

# Invalid ECZ grade: integer outside 1-9
_invalid_grade = st.one_of(
    st.integers(max_value=0),
    st.integers(min_value=10),
)


class TestZambianPhoneValidation(SimpleTestCase):
    """Property 26 (phone): Zambian phone number validation.

    For any string matching +260 followed by 9 digits, validate_zambian_phone
    should accept it. For any string NOT matching that pattern, it should
    raise ValidationError.

    **Validates: Requirements 16.1**
    """

    @given(phone=_valid_phone)
    @settings(max_examples=5)
    def test_valid_phone_accepted(self, phone):
        """Any +260XXXXXXXXX phone number should be accepted."""
        result = validate_zambian_phone(phone)
        self.assertEqual(result, phone.strip())

    @given(phone=_valid_phone, padding=st.sampled_from(["", " ", "  ", "\t"]))
    @settings(max_examples=5)
    def test_valid_phone_with_whitespace_accepted(self, phone, padding):
        """Valid phone numbers with leading/trailing whitespace should be accepted
        and returned stripped."""
        padded = padding + phone + padding
        result = validate_zambian_phone(padded)
        self.assertEqual(result, phone)

    @given(phone=_invalid_phone)
    @settings(max_examples=5)
    def test_invalid_phone_rejected(self, phone):
        """Any string not matching +260 + 9 digits should raise ValidationError."""
        with self.assertRaises(ValidationError):
            validate_zambian_phone(phone)


class TestNRCValidation(SimpleTestCase):
    """Property 26 (NRC): NRC number validation.

    For any string matching \\d{6}/\\d{2}/\\d, validate_nrc should accept it.
    For any string NOT matching that pattern, it should raise ValidationError.

    **Validates: Requirements 16.2**
    """

    @given(nrc=_valid_nrc)
    @settings(max_examples=5)
    def test_valid_nrc_accepted(self, nrc):
        """Any NRC in 123456/78/9 format should be accepted."""
        result = validate_nrc(nrc)
        self.assertEqual(result, nrc.strip())

    @given(nrc=_valid_nrc, padding=st.sampled_from(["", " ", "  ", "\t"]))
    @settings(max_examples=5)
    def test_valid_nrc_with_whitespace_accepted(self, nrc, padding):
        """Valid NRC numbers with whitespace should be accepted and stripped."""
        padded = padding + nrc + padding
        result = validate_nrc(padded)
        self.assertEqual(result, nrc)

    @given(nrc=_invalid_nrc)
    @settings(max_examples=5)
    def test_invalid_nrc_rejected(self, nrc):
        """Any string not matching the NRC pattern should raise ValidationError."""
        with self.assertRaises(ValidationError):
            validate_nrc(nrc)


class TestECZGradeValidation(SimpleTestCase):
    """Property 26 (ECZ grade): ECZ grade validation.

    For any integer 1-9, validate_ecz_grade should accept it.
    Outside that range, it should raise ValidationError.

    **Validates: Requirements 16.3**
    """

    @given(grade=_valid_grade)
    @settings(max_examples=5)
    def test_valid_grade_accepted(self, grade):
        """Any integer 1-9 should be accepted as a valid ECZ grade."""
        result = validate_ecz_grade(grade)
        self.assertEqual(result, grade)

    @given(grade=_invalid_grade)
    @settings(max_examples=5)
    def test_invalid_grade_rejected(self, grade):
        """Any integer outside 1-9 should raise ValidationError."""
        with self.assertRaises(ValidationError):
            validate_ecz_grade(grade)


class TestNormalizeNationality(SimpleTestCase):
    """Property 26 (nationality): Nationality normalization.

    For None or empty string, normalize_nationality should return "Zambian".

    **Validates: Requirements 16.5**
    """

    @given(value=st.sampled_from([None, "", " ", "  ", "\t", "\n"]))
    @settings(max_examples=5)
    def test_empty_or_none_defaults_to_zambian(self, value):
        """None, empty string, or whitespace-only should return 'Zambian'."""
        result = normalize_nationality(value)
        self.assertEqual(result, "Zambian")

    @given(
        value=st.text(min_size=1, max_size=50).filter(lambda s: s.strip() != "")
    )
    @settings(max_examples=5)
    def test_non_empty_value_returned_stripped(self, value):
        """Any non-empty, non-whitespace string should be returned stripped."""
        result = normalize_nationality(value)
        self.assertEqual(result, value.strip())
