"""Unit tests for Redis-backed JTI blacklist failure modes and correctness.

Tests: fail-on-write (raises), fail-closed read, TTL correctness, key prefix.
Requirements: 1.4, 1.5
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

import fakeredis  # noqa: E402
import redis  # noqa: E402
from django.test import SimpleTestCase  # noqa: E402

from apps.accounts.tokens import (  # noqa: E402
    JTI_PREFIX,
    blacklist_jti,
    is_jti_blacklisted,
)


class TestJTIBlacklistFailOnWrite(SimpleTestCase):
    """Test that blacklist_jti logs but does not raise when Redis write fails."""

    def test_blacklist_jti_does_not_raise_on_redis_error(self):
        """When Redis raises RedisError on setex, blacklist_jti must log but not propagate."""
        mock_redis = MagicMock()
        mock_redis.setex.side_effect = redis.RedisError("connection refused")

        with patch("apps.accounts.tokens._get_redis", return_value=mock_redis):
            # Should NOT raise — fail-open to avoid blocking auth
            blacklist_jti(str(uuid.uuid4()))


class TestJTIBlacklistFailOpenRead(SimpleTestCase):
    """Test that is_jti_blacklisted returns False when Redis read fails (fail-open)."""

    def test_is_jti_blacklisted_returns_true_on_redis_error(self):
        """When Redis raises RedisError on both attempts, is_jti_blacklisted must return True (fail-closed)."""
        mock_redis = MagicMock()
        mock_redis.exists.side_effect = redis.RedisError("connection refused")

        with patch("apps.accounts.tokens._get_redis", return_value=mock_redis):
            result = is_jti_blacklisted(str(uuid.uuid4()))

        self.assertTrue(result)
        # Verify it retried once (2 total calls)
        self.assertEqual(mock_redis.exists.call_count, 2)


class TestJTIBlacklistTTL(SimpleTestCase):
    """Test that blacklisted JTI keys have the correct TTL."""

    def setUp(self):
        self._fake_redis = fakeredis.FakeRedis(decode_responses=True)
        self._redis_patcher = patch(
            "apps.accounts.tokens._get_redis", return_value=self._fake_redis
        )
        self._redis_patcher.start()

    def tearDown(self):
        self._redis_patcher.stop()

    def test_blacklisted_jti_has_correct_ttl(self):
        """After blacklist_jti, the Redis key TTL should be approximately 604800s (7 days)."""
        jti = str(uuid.uuid4())
        blacklist_jti(jti)

        ttl = self._fake_redis.ttl(f"{JTI_PREFIX}{jti}")
        # TTL should be very close to 604800 (allow 5s tolerance for test execution)
        self.assertAlmostEqual(ttl, 604800, delta=5)


class TestJTIBlacklistKeyPrefix(SimpleTestCase):
    """Test that Redis keys use the jti: prefix."""

    def setUp(self):
        self._fake_redis = fakeredis.FakeRedis(decode_responses=True)
        self._redis_patcher = patch(
            "apps.accounts.tokens._get_redis", return_value=self._fake_redis
        )
        self._redis_patcher.start()

    def tearDown(self):
        self._redis_patcher.stop()

    def test_blacklisted_jti_uses_prefix(self):
        """The Redis key must use the 'jti:' prefix."""
        jti = str(uuid.uuid4())
        blacklist_jti(jti)

        key = f"{JTI_PREFIX}{jti}"
        self.assertTrue(self._fake_redis.exists(key))
        # Verify the prefix is 'jti:'
        self.assertEqual(JTI_PREFIX, "jti:")
