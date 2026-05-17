"""CSRF token cache regression tests."""

from __future__ import annotations

import hashlib
import os
from unittest.mock import patch

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

django.setup()

import pytest  # noqa: E402

from apps.accounts.authentication import (  # noqa: E402
    CSRFPermissionDenied,
    validate_csrf_token_for_user,
)


class TestCSRFTokenCache:
    def test_cache_hit_positive_skips_db(self):
        """When cache says '1', no DB query happens."""
        token = "valid-token-abc"
        user_id = "11111111-1111-1111-1111-111111111111"
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        cache_key = f"csrf:valid:{user_id}:{token_hash}"

        with patch("django.core.cache.cache.get", return_value="1") as get_mock, \
             patch("apps.accounts.models.CSRFToken.objects") as objects:
            validate_csrf_token_for_user(user_id, token)
            get_mock.assert_called_once_with(cache_key)
            objects.filter.assert_not_called()

    def test_cache_hit_negative_skips_db_and_raises(self):
        """When cache says '0', no DB query happens and CSRFPermissionDenied is raised."""
        token = "stale-token"
        user_id = "11111111-1111-1111-1111-111111111111"

        with patch("django.core.cache.cache.get", return_value="0"), \
             patch("apps.accounts.models.CSRFToken.objects") as objects:
            with pytest.raises(CSRFPermissionDenied):
                validate_csrf_token_for_user(user_id, token)
            objects.filter.assert_not_called()

    def test_cache_miss_falls_through_to_db_and_caches_result(self):
        """Cache miss → DB query → cache.set called with result."""
        token = "fresh-token"
        user_id = "11111111-1111-1111-1111-111111111111"

        with patch("django.core.cache.cache.get", return_value=None), \
             patch("django.core.cache.cache.set") as set_mock, \
             patch("apps.accounts.models.CSRFToken.objects") as objects:
            objects.filter.return_value.exists.return_value = True
            validate_csrf_token_for_user(user_id, token)

            objects.filter.assert_called_once()
            set_mock.assert_called_once()
            # Second positional arg should be "1" (valid) and timeout=60.
            args, kwargs = set_mock.call_args
            assert args[1] == "1"
            assert kwargs.get("timeout") == 60

    def test_cache_outage_fails_open_to_db(self):
        """If cache.get raises, behavior matches the no-cache path."""
        token = "fresh-token"
        user_id = "11111111-1111-1111-1111-111111111111"

        with patch("django.core.cache.cache.get", side_effect=ConnectionError("redis down")), \
             patch("django.core.cache.cache.set"), \
             patch("apps.accounts.models.CSRFToken.objects") as objects:
            objects.filter.return_value.exists.return_value = True
            # Should not raise — DB says valid.
            validate_csrf_token_for_user(user_id, token)
            objects.filter.assert_called_once()

    def test_missing_token_raises_csrf_missing(self):
        from apps.accounts.authentication import CSRFPermissionDenied as Exc

        with pytest.raises(Exc) as exc_info:
            validate_csrf_token_for_user("user", None)
        assert exc_info.value.detail.code == "CSRF_MISSING"
