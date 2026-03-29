"""Unit tests for startup environment variable validation."""

import os
from unittest.mock import patch

import django
from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.base")
os.environ["TESTING"] = "1"

from apps.common.env_validator import validate_required_env_vars


class EnvValidatorTests(SimpleTestCase):
    """Tests for validate_required_env_vars."""

    @override_settings(REQUIRED_ENV_VARS=[])
    def test_empty_required_list_does_nothing(self):
        """No error when REQUIRED_ENV_VARS is empty."""
        validate_required_env_vars()  # should not raise

    @override_settings(REQUIRED_ENV_VARS=["SECRET_KEY", "DATABASE_URL"])
    @patch.dict(os.environ, {"SECRET_KEY": "s3cret", "DATABASE_URL": "postgres://x"})
    def test_all_present_passes(self):
        """No error when all required vars are set and non-empty."""
        validate_required_env_vars()  # should not raise

    @override_settings(REQUIRED_ENV_VARS=["SECRET_KEY", "MISSING_VAR"])
    @patch.dict(os.environ, {"SECRET_KEY": "s3cret"}, clear=False)
    def test_missing_var_raises(self):
        """Raises ImproperlyConfigured when a required var is absent."""
        # Ensure MISSING_VAR is truly absent
        env = os.environ.copy()
        env.pop("MISSING_VAR", None)
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(ImproperlyConfigured) as ctx:
                validate_required_env_vars()
            self.assertIn("MISSING_VAR", str(ctx.exception))

    @override_settings(REQUIRED_ENV_VARS=["EMPTY_VAR"])
    @patch.dict(os.environ, {"EMPTY_VAR": ""})
    def test_empty_var_raises(self):
        """Raises ImproperlyConfigured when a required var is empty string."""
        with self.assertRaises(ImproperlyConfigured) as ctx:
            validate_required_env_vars()
        self.assertIn("EMPTY_VAR", str(ctx.exception))

    @override_settings(REQUIRED_ENV_VARS=["WHITESPACE_VAR"])
    @patch.dict(os.environ, {"WHITESPACE_VAR": "   "})
    def test_whitespace_only_var_raises(self):
        """Raises ImproperlyConfigured when a required var is only whitespace."""
        with self.assertRaises(ImproperlyConfigured) as ctx:
            validate_required_env_vars()
        self.assertIn("WHITESPACE_VAR", str(ctx.exception))

    @override_settings(REQUIRED_ENV_VARS=["VAR_A", "VAR_B", "VAR_C"])
    @patch.dict(os.environ, {"VAR_B": "present"}, clear=True)
    def test_multiple_missing_vars_all_listed(self):
        """Error message lists every missing variable."""
        with self.assertRaises(ImproperlyConfigured) as ctx:
            validate_required_env_vars()
        msg = str(ctx.exception)
        self.assertIn("VAR_A", msg)
        self.assertIn("VAR_C", msg)
        self.assertNotIn("VAR_B", msg)
