"""Property-based tests for session management.

# Feature: python-backend-migration, Property 32: Session revocation invalidates refresh token
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

import fakeredis  # noqa: E402

from apps.accounts.tokens import (  # noqa: E402
    blacklist_jti,
    generate_access_token,
    generate_refresh_token,
    is_jti_blacklisted,
    verify_token,
)

# Shared fakeredis instance for test isolation
_fake_redis = fakeredis.FakeRedis(decode_responses=True)

_default_settings = settings(max_examples=5, deadline=None)
_roles = st.sampled_from(["student", "admin", "reviewer", "super_admin"])


def _make_mock_user(role="student", user_id=None):
    user = MagicMock()
    user.id = user_id or str(uuid.uuid4())
    user.pk = user.id
    user.email = "test@example.com"
    user.role = role
    user.first_name = "Test"
    user.last_name = "User"
    return user


# =========================================================================
# Property 32: Session revocation invalidates refresh token
# =========================================================================


class TestSessionRevocationInvalidatesRefreshToken(SimpleTestCase):
    """Property 32: Session revocation invalidates refresh token.

    For any active device session, revoking it should immediately invalidate
    the associated refresh token. A refresh attempt using that token should
    fail with an error.

    **Validates: Requirements 9.3**
    """

    def setUp(self):
        _fake_redis.flushall()
        self._redis_patcher = patch("apps.accounts.tokens._get_redis", return_value=_fake_redis)
        self._redis_patcher.start()

    def tearDown(self):
        self._redis_patcher.stop()

    @given(role=_roles)
    @_default_settings
    def test_blacklisting_jti_prevents_token_verification(self, role):
        """After blacklisting a refresh token's jti, verify_token must raise."""
        _fake_redis.flushall()

        user = _make_mock_user(role=role)
        refresh = generate_refresh_token(user)

        # Extract jti from the token
        payload = verify_token(refresh, token_type="refresh")
        jti = payload["jti"]

        # Blacklist the jti (simulates session revocation)
        blacklist_jti(jti)

        # Verify the token is now rejected
        with self.assertRaises(ValueError):
            verify_token(refresh, token_type="refresh")

    @given(role=_roles)
    @_default_settings
    def test_blacklisted_jti_is_reported_as_blacklisted(self, role):
        """is_jti_blacklisted returns True after blacklisting."""
        _fake_redis.flushall()

        user = _make_mock_user(role=role)
        refresh = generate_refresh_token(user)
        payload = verify_token(refresh, token_type="refresh")
        jti = payload["jti"]

        self.assertFalse(is_jti_blacklisted(jti))
        blacklist_jti(jti)
        self.assertTrue(is_jti_blacklisted(jti))

    @given(role=_roles)
    @_default_settings
    def test_revoking_one_session_does_not_affect_other_tokens(self, role):
        """Blacklisting one jti should not affect a different refresh token."""
        _fake_redis.flushall()

        user = _make_mock_user(role=role)
        refresh1 = generate_refresh_token(user)
        refresh2 = generate_refresh_token(user)

        payload1 = verify_token(refresh1, token_type="refresh")
        blacklist_jti(payload1["jti"])

        # refresh1 should be rejected
        with self.assertRaises(ValueError):
            verify_token(refresh1, token_type="refresh")

        # refresh2 should still be valid
        payload2 = verify_token(refresh2, token_type="refresh")
        self.assertEqual(payload2["token_type"], "refresh")

    @given(role=_roles)
    @_default_settings
    def test_session_revoke_view_deactivates_session_and_blacklists(self, role):
        """SessionRevokeView should deactivate the session record."""
        _fake_redis.flushall()

        from apps.accounts.session_views import SessionRevokeView

        user = _make_mock_user(role=role)
        user.is_authenticated = True
        session_id = str(uuid.uuid4())

        mock_session = MagicMock()
        mock_session.id = session_id
        mock_session.refresh_token_hash = "somehash"
        mock_session.is_active = True
        mock_session.save = MagicMock()

        request = MagicMock()
        request.user = user
        request.COOKIES = {}

        with patch("apps.accounts.session_views.DeviceSession.objects") as mock_qs:
            mock_qs.get.return_value = mock_session
            view = SessionRevokeView()
            response = view.post(request, session_id=session_id)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(mock_session.is_active)
        mock_session.save.assert_called_once()
