"""Property-based tests for infrastructure concerns.

# Feature: python-backend-migration, Property 40: Startup environment validation
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings
from hypothesis import given, settings
from hypothesis import strategies as st

from apps.common.env_validator import validate_required_env_vars

# The full list of required env vars from base.py
REQUIRED_ENV_VARS = [
    "SECRET_KEY",
    "DATABASE_URL",
    "REDIS_URL",
    "JWT_SIGNING_KEY",
    "ALLOWED_HOSTS",
    "CORS_ALLOWED_ORIGINS",
    "RESEND_API_KEY",
    "S3_ENDPOINT_URL",
    "S3_BUCKET",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
]


# Strategy: generate non-empty, non-whitespace-only strings for env values.
# Restrict to printable ASCII to avoid null bytes and surrogates that os.environ rejects.
_nonempty_value = st.text(
    alphabet=st.characters(
        whitelist_categories=("L", "N", "P", "S"),
        whitelist_characters="-_./:",
    ),
    min_size=1,
    max_size=50,
)


class TestStartupEnvironmentValidation(SimpleTestCase):
    """Property 40: Startup environment validation.

    For any subset of required environment variables where at least one is
    missing, the Django API should refuse to start and report which variables
    are missing. When all vars are present and non-empty, validation should pass.

    **Validates: Requirements 1.8**
    """

    @given(
        values=st.fixed_dictionaries(
            {var: _nonempty_value for var in REQUIRED_ENV_VARS}
        )
    )
    @settings(max_examples=5)
    @override_settings(REQUIRED_ENV_VARS=REQUIRED_ENV_VARS)
    def test_all_vars_present_and_nonempty_passes(self, values):
        """When every required var is present and non-empty, validation passes."""
        with patch.dict(os.environ, values, clear=False):
            # Should not raise
            validate_required_env_vars()

    @given(
        missing_subset=st.sets(
            st.sampled_from(REQUIRED_ENV_VARS), min_size=1
        )
    )
    @settings(max_examples=5)
    @override_settings(REQUIRED_ENV_VARS=REQUIRED_ENV_VARS)
    def test_missing_subset_raises_listing_all_missing(self, missing_subset):
        """When any subset of required vars is missing, validation raises
        ImproperlyConfigured and the error message lists every missing var."""
        # Build env with only the vars NOT in the missing subset
        present_vars = {
            var: f"value-for-{var}"
            for var in REQUIRED_ENV_VARS
            if var not in missing_subset
        }
        # Clear env and set only present vars so missing ones are truly absent
        with patch.dict(os.environ, present_vars, clear=True):
            with self.assertRaises(ImproperlyConfigured) as ctx:
                validate_required_env_vars()
            error_msg = str(ctx.exception)
            for var in missing_subset:
                self.assertIn(
                    var,
                    error_msg,
                    f"Missing var '{var}' should be listed in the error message",
                )

    @given(
        empty_subset=st.sets(
            st.sampled_from(REQUIRED_ENV_VARS), min_size=1
        )
    )
    @settings(max_examples=5)
    @override_settings(REQUIRED_ENV_VARS=REQUIRED_ENV_VARS)
    def test_empty_or_whitespace_vars_treated_as_missing(self, empty_subset):
        """Vars that are empty strings or whitespace-only are treated as missing."""
        env = {}
        for var in REQUIRED_ENV_VARS:
            if var in empty_subset:
                env[var] = "   "  # whitespace-only
            else:
                env[var] = f"valid-{var}"
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(ImproperlyConfigured) as ctx:
                validate_required_env_vars()
            error_msg = str(ctx.exception)
            for var in empty_subset:
                self.assertIn(
                    var,
                    error_msg,
                    f"Whitespace-only var '{var}' should be listed as missing",
                )
