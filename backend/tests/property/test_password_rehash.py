"""Property-based tests for password rehash classification.

# Feature: cto-assessment-remediation, Property 11: needs_rehash correctly classifies hash formats

Tests that for any bcrypt hash (starting with $2), needs_rehash() returns False,
and for any SHA-256 hex digest (64 hex chars), needs_rehash() returns True.
"""

import hashlib
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import bcrypt  # noqa: E402
import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.accounts.services import needs_rehash  # noqa: E402

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

# Generate random passwords (1-72 bytes, bcrypt's max input length)
_passwords = st.text(
    alphabet=st.characters(min_codepoint=32, max_codepoint=126),
    min_size=1,
    max_size=72,
)

# Generate SHA-256 hex digests: 64 hex characters
_sha256_digests = _passwords.map(
    lambda pw: hashlib.sha256(pw.encode("utf-8")).hexdigest()
)


# =========================================================================
# Property 11: needs_rehash correctly classifies hash formats
# =========================================================================


class TestNeedsRehashClassification(SimpleTestCase):
    """Property 11: needs_rehash correctly classifies hash formats.

    For any bcrypt hash (starting with $2), needs_rehash() should return False.
    For any SHA-256 hex digest (64 hex characters, not starting with $2),
    needs_rehash() should return True.

    **Validates: Requirements 8.4**
    """

    @given(password=_passwords)
    @settings(max_examples=100, deadline=None)
    def test_bcrypt_hashes_do_not_need_rehash(self, password):
        """Bcrypt hashes (starting with $2) should not need rehashing."""
        hashed = bcrypt.hashpw(
            password.encode("utf-8"), bcrypt.gensalt(rounds=4)
        ).decode("utf-8")

        self.assertTrue(hashed.startswith("$2"))
        self.assertFalse(
            needs_rehash(hashed),
            f"needs_rehash() returned True for bcrypt hash: {hashed[:20]}...",
        )

    @given(digest=_sha256_digests)
    @settings(max_examples=100, deadline=None)
    def test_sha256_digests_need_rehash(self, digest):
        """SHA-256 hex digests (64 hex chars) should need rehashing."""
        self.assertEqual(len(digest), 64)
        self.assertTrue(
            needs_rehash(digest),
            f"needs_rehash() returned False for SHA-256 digest: {digest[:20]}...",
        )


import uuid  # noqa: E402
from unittest.mock import MagicMock, PropertyMock, patch  # noqa: E402


# =========================================================================
# Property 12: Legacy hash is upgraded to bcrypt on login
# =========================================================================

# Feature: cto-assessment-remediation, Property 12: Legacy hash is upgraded to bcrypt on login


class TestLegacyHashUpgradedOnLogin(SimpleTestCase):
    """Property 12: Legacy hash is upgraded to bcrypt on login.

    For any user whose password_hash is a SHA-256 digest of their password,
    after a successful login through LoginView, the stored password_hash on
    the Profile record should start with $2 (bcrypt prefix) and needs_rehash()
    should return False for the updated hash.

    **Validates: Requirements 8.1**
    """

    # Passwords that survive DRF CharField strip + blank validation:
    # must contain at least one non-whitespace character.
    _login_passwords = st.text(
        alphabet=st.characters(min_codepoint=33, max_codepoint=126),
        min_size=1,
        max_size=72,
    )

    @given(password=_login_passwords)
    @settings(max_examples=100, deadline=None)
    def test_legacy_sha256_hash_upgraded_to_bcrypt_on_login(self, password):
        """After login with a SHA-256 hashed password, the stored hash
        should be upgraded to bcrypt ($2 prefix) and needs_rehash() should
        return False."""
        from rest_framework.test import APIRequestFactory

        from apps.accounts.views import LoginView

        email = "testuser@example.com"
        sha256_hash = hashlib.sha256(password.encode("utf-8")).hexdigest()

        # Build a mock Profile with the legacy SHA-256 hash
        mock_user = MagicMock()
        mock_user.id = uuid.uuid4()
        mock_user.email = email
        mock_user.first_name = "Test"
        mock_user.last_name = "User"
        mock_user.role = "student"
        mock_user.is_active = True
        mock_user.password_hash = sha256_hash

        # Track what save() receives
        saved_hashes = []

        def mock_save(update_fields=None):
            if update_fields and "password_hash" in update_fields:
                saved_hashes.append(mock_user.password_hash)

        mock_user.save = mock_save

        # Mock LoginAttempt queries for check_login_attempts
        mock_attempt_qs = MagicMock()
        mock_attempt_qs.count.return_value = 0

        with patch(
            "apps.accounts.views.Profile.objects.get",
            return_value=mock_user,
        ), patch(
            "apps.accounts.views.check_login_attempts",
            return_value=MagicMock(value="allowed"),
        ) as mock_check, patch(
            "apps.accounts.views.record_login_attempt",
        ), patch(
            "apps.accounts.views.generate_access_token",
            return_value="mock_access_token",
        ), patch(
            "apps.accounts.views.generate_refresh_token",
            return_value="mock_refresh_token",
        ), patch(
            "apps.accounts.views.DeviceSession.objects.create",
        ), patch(
            "apps.accounts.views._generate_csrf_token",
            return_value="mock_csrf_token",
        ):
            # Make check_login_attempts return ALLOWED
            from apps.accounts.services import LoginStatus
            mock_check.return_value = LoginStatus.ALLOWED

            factory = APIRequestFactory()
            request = factory.post(
                "/api/v1/auth/login/",
                {"email": email, "password": password},
                format="json",
            )

            view = LoginView.as_view()
            response = view(request)

        # Login should succeed (200)
        self.assertEqual(
            response.status_code,
            200,
            f"Expected 200 but got {response.status_code}: {response.data}",
        )

        # Verify save was called with an upgraded hash
        self.assertEqual(
            len(saved_hashes),
            1,
            "Expected password_hash to be saved exactly once during rehash",
        )

        upgraded_hash = saved_hashes[0]

        # Verify the upgraded hash starts with $2 (bcrypt)
        self.assertTrue(
            upgraded_hash.startswith("$2"),
            f"Upgraded hash should start with $2 (bcrypt), got: {upgraded_hash[:20]}...",
        )

        # Verify needs_rehash returns False for the upgraded hash
        self.assertFalse(
            needs_rehash(upgraded_hash),
            f"needs_rehash() should return False for upgraded bcrypt hash: {upgraded_hash[:20]}...",
        )
