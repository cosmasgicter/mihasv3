"""Unit tests for password rehash — bcrypt migration on login.

Tests:
- SHA-256 user can log in and hash is upgraded to bcrypt (Requirement 8.1)
- needs_rehash() returns True for SHA-256, False for bcrypt (Requirement 8.4)
- needs_rehash() returns False for empty string (Requirement 8.4)
"""

import hashlib
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid
from unittest.mock import MagicMock, patch

import django

django.setup()

from django.test import SimpleTestCase

from apps.accounts.services import LoginStatus, hash_password, needs_rehash


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(email="student@example.com", password_hash=None, user_id=None):
    """Build a minimal mock user (Profile-like) object."""
    user = MagicMock()
    user.id = user_id or uuid.uuid4()
    user.email = email
    user.first_name = "Test"
    user.last_name = "User"
    user.role = "student"
    user.is_active = True
    user.password_hash = password_hash or "$2b$12$somebcrypthashvaluehere1234567890abcdef"
    return user


# =========================================================================
# Test: SHA-256 user can log in and hash is upgraded to bcrypt
# Requirements: 8.1, 8.2, 8.3
# =========================================================================


class TestSHA256UserLoginAndUpgrade(SimpleTestCase):
    """A user with a legacy SHA-256 password hash should be able to log in
    successfully, and the stored hash should be upgraded to bcrypt."""

    @patch("apps.accounts.auth_views._generate_csrf_token", return_value="mock_csrf")
    @patch("apps.accounts.auth_views.DeviceSession.objects.create")
    @patch("apps.accounts.auth_views.generate_refresh_token", return_value="mock_refresh")
    @patch("apps.accounts.auth_views.generate_access_token", return_value="mock_access")
    @patch("apps.accounts.auth_views.record_login_attempt")
    @patch("apps.accounts.auth_views.check_login_attempts")
    @patch("apps.accounts.auth_views.Profile.objects.get")
    def test_sha256_user_logs_in_and_hash_upgraded(
        self,
        mock_profile_get,
        mock_check_attempts,
        mock_record_attempt,
        mock_access,
        mock_refresh,
        mock_device_create,
        mock_csrf,
    ):
        password = "mysecretpassword"
        sha256_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()

        user = _make_user(password_hash=sha256_hash)

        # Track save calls to capture the upgraded hash
        saved_hashes = []

        def mock_save(update_fields=None):
            if update_fields and "password_hash" in update_fields:
                saved_hashes.append(user.password_hash)

        user.save = mock_save
        mock_profile_get.return_value = user
        mock_check_attempts.return_value = LoginStatus.ALLOWED

        from rest_framework.test import APIRequestFactory

        from apps.accounts.views import LoginView

        factory = APIRequestFactory()
        request = factory.post(
            "/api/v1/auth/login/",
            {"email": "student@example.com", "password": password},
            format="json",
        )

        view = LoginView.as_view()
        response = view(request)

        # Login should succeed
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])

        # Hash should have been upgraded exactly once
        self.assertEqual(len(saved_hashes), 1, "password_hash should be saved once")

        upgraded_hash = saved_hashes[0]

        # Upgraded hash should be bcrypt (starts with $2)
        self.assertTrue(
            upgraded_hash.startswith("$2"),
            f"Upgraded hash should be bcrypt, got: {upgraded_hash[:20]}...",
        )

        # needs_rehash should return False for the upgraded hash
        self.assertFalse(needs_rehash(upgraded_hash))


# =========================================================================
# Test: needs_rehash() returns True for SHA-256, False for bcrypt
# Requirement: 8.4
# =========================================================================


class TestNeedsRehashClassification(SimpleTestCase):
    """needs_rehash() should return True for SHA-256 hashes and False for
    bcrypt hashes."""

    def test_returns_true_for_sha256_hash(self):
        sha256_hash = hashlib.sha256(b"password123").hexdigest()
        self.assertTrue(needs_rehash(sha256_hash))

    def test_returns_false_for_bcrypt_hash(self):
        bcrypt_hash = hash_password("password123")
        self.assertFalse(needs_rehash(bcrypt_hash))


# =========================================================================
# Test: needs_rehash() returns False for empty string
# Requirement: 8.4
# =========================================================================


class TestNeedsRehashEmptyString(SimpleTestCase):
    """needs_rehash() should return False for an empty string."""

    def test_returns_false_for_empty_string(self):
        self.assertFalse(needs_rehash(""))
