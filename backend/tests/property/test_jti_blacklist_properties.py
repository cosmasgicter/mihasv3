"""Property-based tests for Redis-backed JTI blacklist round-trip.

# Feature: monorepo-restructure, Property 1: JTI Blacklist Round-Trip
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from unittest.mock import patch  # noqa: E402

import django  # noqa: E402

django.setup()

import fakeredis  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.accounts.tokens import blacklist_jti, is_jti_blacklisted  # noqa: E402

# Strategy: generate valid UUID strings
_uuids = st.uuids().map(str)

_default_settings = settings(max_examples=5, deadline=None)


class TestJTIBlacklistRoundTrip(SimpleTestCase):
    """Property 1: JTI Blacklist Round-Trip.

    For any valid JTI string, after calling blacklist_jti(jti),
    is_jti_blacklisted(jti) returns True. For any JTI that has never
    been blacklisted, is_jti_blacklisted(jti) returns False.

    **Validates: Requirements 1.1, 1.2, 1.3**
    """

    def setUp(self):
        self._fake_redis = fakeredis.FakeRedis(decode_responses=True)
        self._redis_patcher = patch(
            "apps.accounts.tokens._get_redis", return_value=self._fake_redis
        )
        self._redis_patcher.start()

    def tearDown(self):
        self._redis_patcher.stop()

    @given(jti=_uuids)
    @_default_settings
    def test_blacklisted_jti_is_detected(self, jti):
        """After blacklist_jti(jti), is_jti_blacklisted(jti) must return True."""
        self._fake_redis.flushall()
        blacklist_jti(jti)
        self.assertTrue(is_jti_blacklisted(jti))

    @given(jti=_uuids)
    @_default_settings
    def test_non_blacklisted_jti_is_not_detected(self, jti):
        """A JTI that was never blacklisted must return False."""
        self._fake_redis.flushall()
        self.assertFalse(is_jti_blacklisted(jti))
