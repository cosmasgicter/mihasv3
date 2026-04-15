"""Feature: production-stability-hardening, Property 5: Token refresh succeeds with valid refresh token"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

import fakeredis  # noqa: E402
import jwt  # noqa: E402
from django.conf import settings as django_settings  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.accounts.tokens import (  # noqa: E402
    generate_refresh_token,
    is_jti_blacklisted,
    rotate_tokens,
    verify_token,
)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

_user_ids = st.uuids().map(str)
_roles = st.sampled_from(["student", "admin", "reviewer", "super_admin"])
_default_settings = settings(max_examples=100, deadline=None)


def _make_mock_user(user_id: str, role: str) -> MagicMock:
    """Build a minimal mock user object for token generation."""
    user = MagicMock()
    user.id = user_id
    user.pk = user_id
    user.email = "test@example.com"
    user.role = role
    user.first_name = "Test"
    user.last_name = "User"
    return user


class TestTokenRefreshSucceedsWithValidRefreshToken(SimpleTestCase):
    """Property 5: Token refresh succeeds with valid refresh token.

    For any valid, non-expired, non-blacklisted refresh token,
    ``rotate_tokens`` returns a new (access_token, refresh_token) pair
    where both are valid JWT strings, the old token's JTI is now
    blacklisted, and the new tokens have the same ``user_id`` / ``role``.

    **Validates: Requirements 8.1, 8.6**
    """

    def setUp(self):
        self._fake_redis = fakeredis.FakeRedis(decode_responses=True)
        self._redis_patcher = patch(
            "apps.accounts.tokens._get_redis", return_value=self._fake_redis
        )
        self._redis_patcher.start()

    def tearDown(self):
        self._redis_patcher.stop()

    @given(user_id=_user_ids, role=_roles)
    @_default_settings
    def test_rotate_tokens_returns_valid_jwt_pair(self, user_id: str, role: str):
        """rotate_tokens must return two valid JWT strings (access + refresh)."""
        self._fake_redis.flushall()

        user = _make_mock_user(user_id, role)
        refresh = generate_refresh_token(user)

        new_access, new_refresh = rotate_tokens(refresh, user=user)

        # Both must be decodable JWTs
        access_payload = verify_token(new_access, token_type="access")
        self.assertEqual(access_payload["token_type"], "access")

        refresh_payload = verify_token(new_refresh, token_type="refresh")
        self.assertEqual(refresh_payload["token_type"], "refresh")

    @given(user_id=_user_ids, role=_roles)
    @_default_settings
    def test_old_jti_is_blacklisted_after_rotation(self, user_id: str, role: str):
        """After rotate_tokens, the old refresh token's JTI must be blacklisted."""
        self._fake_redis.flushall()

        user = _make_mock_user(user_id, role)
        refresh = generate_refresh_token(user)

        # Extract old JTI before rotation
        signing_key = django_settings.SIMPLE_JWT["SIGNING_KEY"]
        algorithm = django_settings.SIMPLE_JWT["ALGORITHM"]
        old_payload = jwt.decode(refresh, signing_key, algorithms=[algorithm])
        old_jti = old_payload["jti"]

        rotate_tokens(refresh, user=user)

        self.assertTrue(is_jti_blacklisted(old_jti))

    @given(user_id=_user_ids, role=_roles)
    @_default_settings
    def test_new_tokens_preserve_user_id_and_role(self, user_id: str, role: str):
        """New access and refresh tokens must carry the same user_id and role."""
        self._fake_redis.flushall()

        user = _make_mock_user(user_id, role)
        refresh = generate_refresh_token(user)

        # Pass user to match production RefreshView code path
        new_access, new_refresh = rotate_tokens(refresh, user=user)

        access_payload = verify_token(new_access, token_type="access")
        self.assertEqual(access_payload["user_id"], user_id)
        self.assertEqual(access_payload["role"], role)

        refresh_payload = verify_token(new_refresh, token_type="refresh")
        self.assertEqual(refresh_payload["user_id"], user_id)
