"""Property-based test: Tracking code pattern accepts all documented formats.

Feature: system-alignment-audit, Property 7: Tracking code pattern accepts all documented formats

For any string matching one of the documented formats (APP-YYYYMMDD-XXXXXXXX,
MIHAS+9digits, KATC+9digits, TRK-12alphanum, TRK+5-6alphanum), the
TRACKING_CODE_PATTERN regex should match. For any random string not matching
these formats, the regex should not match.

**Validates: Requirements 6.4**
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import django  # noqa: E402

django.setup()

import re  # noqa: E402

from hypothesis import assume, given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.applications.views import ApplicationTrackView  # noqa: E402

TRACKING_CODE_PATTERN = ApplicationTrackView.TRACKING_CODE_PATTERN

_default_settings = settings(max_examples=100, deadline=None)

# ---------------------------------------------------------------------------
# Strategies — generate strings that match each documented format
# ---------------------------------------------------------------------------

# Helpers
_upper_alphanum = st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
_digit = st.sampled_from("0123456789")
_upper_letter = st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ")


def _fixed_length_string(char_strategy, length):
    """Draw exactly `length` characters from `char_strategy` and join."""
    return st.tuples(*([char_strategy] * length)).map(lambda t: "".join(t))


# 1) APP-YYYYMMDD-XXXXXXXX
_app_format = st.builds(
    lambda year, month, day, suffix: f"APP-{year}{month}{day}-{suffix}",
    year=st.integers(min_value=2020, max_value=2099).map(str),
    month=st.integers(min_value=1, max_value=12).map(lambda m: str(m).zfill(2)),
    day=st.integers(min_value=1, max_value=28).map(lambda d: str(d).zfill(2)),
    suffix=_fixed_length_string(_upper_alphanum, 8),
)

# 2) MIHAS + 9 digits  (e.g. MIHAS202500001)
_mihas_format = st.builds(
    lambda digits: f"MIHAS{digits}",
    digits=_fixed_length_string(_digit, 9),
)

# 3) KATC + 9 digits  (e.g. KATC202610579)
_katc_format = st.builds(
    lambda digits: f"KATC{digits}",
    digits=_fixed_length_string(_digit, 9),
)

# 4) TRK- + 12 alphanum  (e.g. TRK-ABCDEF123456)
_trk_dash_12 = st.builds(
    lambda chars: f"TRK-{chars}",
    chars=_fixed_length_string(_upper_alphanum, 12),
)

# 5) TRK + 5-6 alphanum (no dash)  (e.g. TRK370990, TRKHKAUTY)
_trk_no_dash = st.builds(
    lambda chars: f"TRK{chars}",
    chars=st.integers(min_value=5, max_value=6).flatmap(
        lambda n: _fixed_length_string(_upper_alphanum, n)
    ),
)

# Combined valid strategy
_valid_tracking_code = st.one_of(
    _app_format,
    _mihas_format,
    _katc_format,
    _trk_dash_12,
    _trk_no_dash,
)

# Random strings that should NOT match
_random_string = st.text(
    alphabet=st.characters(min_codepoint=32, max_codepoint=126),
    min_size=1,
    max_size=40,
)


# =========================================================================
# Property 7: Tracking code pattern accepts all documented formats
# =========================================================================


class TestTrackingCodePatternFormats:
    """Property 7: Tracking code pattern accepts all documented formats.

    Feature: system-alignment-audit, Property 7: Tracking code pattern accepts all documented formats

    **Validates: Requirements 6.4**
    """

    @given(code=_valid_tracking_code)
    @_default_settings
    def test_valid_formats_are_accepted(self, code):
        """Any string matching a documented format must be accepted by the pattern."""
        assert TRACKING_CODE_PATTERN.match(code), (
            f"TRACKING_CODE_PATTERN rejected a valid code: {code!r}"
        )

    @given(code=_random_string)
    @_default_settings
    def test_random_strings_are_rejected(self, code):
        """Random strings not matching any documented format should be rejected."""
        assume(not TRACKING_CODE_PATTERN.match(code))
        # If we reach here, the pattern correctly rejected the string.
        assert TRACKING_CODE_PATTERN.match(code) is None
