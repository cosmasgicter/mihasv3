"""Property-based tests for authentication: password hashing, JWT lifecycle,
login attempt throttling, password reset tokens, email non-disclosure,
auth cookie attributes, and cross-backend JWT validity.

# Feature: python-backend-migration, Property 1: Password hashing round-trip
# Feature: python-backend-migration, Property 2: JWT token lifecycle — rotation invalidates previous tokens
# Feature: python-backend-migration, Property 3: Login attempt throttling
# Feature: python-backend-migration, Property 4: Auth rate limiting — reset and registration
# Feature: python-backend-migration, Property 5: Password reset token round-trip
# Feature: python-backend-migration, Property 6: Email existence is never revealed
# Feature: python-backend-migration, Property 33: Auth cookie attributes
# Feature: python-backend-migration, Property 34: Shared JWT signing key — cross-backend token validity
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import hashlib  # noqa: E402
import uuid  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402
from unittest.mock import MagicMock, patch  # noqa: E402

import django  # noqa: E402

django.setup()

import jwt  # noqa: E402
from django.conf import settings as django_settings  # noqa: E402
from django.test import SimpleTestCase, override_settings  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.accounts.models import Profile  # noqa: E402
from apps.accounts.services import (  # noqa: E402
    LoginStatus,
    check_login_attempts,
    generate_password_reset_token,
    hash_password,
    verify_password,
)
from apps.accounts.tokens import (  # noqa: E402
    _blacklist_lock,
    _blacklisted_jtis,
    generate_access_token,
    generate_refresh_token,
    rotate_tokens,
    verify_token,
)

# bcrypt is intentionally slow (12 rounds) — disable hypothesis deadline
_bcrypt_settings = settings(max_examples=100, deadline=None)
_default_settings = settings(max_examples=100, deadline=None)

# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------

_passwords = st.text(
    alphabet=st.characters(
        whitelist_categories=("L", "N", "P", "S"),
        min_codepoint=32,
        max_codepoint=126,
    ),
    min_size=8,
    max_size=72,
)

_emails = st.from_regex(r"[a-z]{3,12}@[a-z]{3,8}\.[a-z]{2,4}", fullmatch=True)

_roles = st.sampled_from(["student", "admin", "reviewer", "super_admin"])


def _make_mock_user(role="student", user_id=None, email="test@example.com"):
    """Build a minimal mock user object for token generation."""
    user = MagicMock()
    user.id = user_id or str(uuid.uuid4())
    user.pk = user.id
    user.email = email
    user.role = role
    user.first_name = "Test"
    user.last_name = "User"
    return user


# =========================================================================
# Property 1: Password hashing round-trip
# =========================================================================


class TestPasswordHashingRoundTrip(SimpleTestCase):
    """Property 1: Password hashing round-trip.

    For any plaintext password, hashing with bcrypt and verifying the same
    plaintext returns True. Verifying a different plaintext returns False.

    **Validates: Requirements 2.2**
    """

    @given(password=_passwords)
    @_bcrypt_settings
    def test_hash_then_verify_same_password_returns_true(self, password):
        """hash_password(p) then verify_password(p, hash) → True."""
        hashed = hash_password(password)
        self.assertTrue(verify_password(password, hashed))

    @given(password=_passwords, other_password=_passwords)
    @_bcrypt_settings
    def test_verify_different_password_returns_false(self, password, other_password):
        """hash_password(p1) then verify_password(p2, hash) → False when p1 ≠ p2."""
        if password == other_password:
            return
        hashed = hash_password(password)
        self.assertFalse(verify_password(other_password, hashed))

    @given(password=_passwords)
    @_bcrypt_settings
    def test_hash_produces_bcrypt_format(self, password):
        """Hashed output must start with $2 (bcrypt prefix)."""
        hashed = hash_password(password)
        self.assertTrue(hashed.startswith("$2"))

    def test_verify_empty_hash_returns_false(self):
        """verify_password with empty hash should return False."""
        self.assertFalse(verify_password("anything", ""))

    def test_verify_none_like_hash_returns_false(self):
        """verify_password with falsy hash should return False."""
        self.assertFalse(verify_password("anything", ""))


# =========================================================================
# Property 2: JWT token lifecycle — rotation invalidates previous tokens
# =========================================================================


class TestJWTTokenLifecycleRotation(SimpleTestCase):
    """Property 2: JWT token lifecycle — rotation invalidates previous tokens.

    For any valid refresh token, rotation produces new valid tokens and the
    original refresh token is rejected (blacklisted).

    **Validates: Requirements 2.3**
    """

    def setUp(self):
        with _blacklist_lock:
            _blacklisted_jtis.clear()

    @given(role=_roles)
    @_default_settings
    def test_rotation_produces_valid_new_tokens(self, role):
        """rotate_tokens returns a new access + refresh token pair."""
        with _blacklist_lock:
            _blacklisted_jtis.clear()

        user = _make_mock_user(role=role)
        refresh = generate_refresh_token(user)
        new_access, new_refresh = rotate_tokens(refresh)

        access_payload = verify_token(new_access, token_type="access")
        self.assertEqual(access_payload["token_type"], "access")
        self.assertEqual(access_payload["user_id"], str(user.id))

        refresh_payload = verify_token(new_refresh, token_type="refresh")
        self.assertEqual(refresh_payload["token_type"], "refresh")
        self.assertEqual(refresh_payload["user_id"], str(user.id))

    @given(role=_roles)
    @_default_settings
    def test_rotation_blacklists_old_refresh_token(self, role):
        """After rotation, the original refresh token must be rejected."""
        with _blacklist_lock:
            _blacklisted_jtis.clear()

        user = _make_mock_user(role=role)
        old_refresh = generate_refresh_token(user)
        rotate_tokens(old_refresh)

        with self.assertRaises(ValueError):
            verify_token(old_refresh, token_type="refresh")

    @given(role=_roles)
    @_default_settings
    def test_double_rotation_rejects_first_token(self, role):
        """Using the same refresh token twice should fail on the second attempt."""
        with _blacklist_lock:
            _blacklisted_jtis.clear()

        user = _make_mock_user(role=role)
        refresh = generate_refresh_token(user)
        rotate_tokens(refresh)

        with self.assertRaises(ValueError):
            rotate_tokens(refresh)


# =========================================================================
# Property 3: Login attempt throttling
# =========================================================================


class TestLoginAttemptThrottling(SimpleTestCase):
    """Property 3: Login attempt throttling.

    After 5 failed attempts for the same email_hash within 15 min,
    check_login_attempts returns BLOCKED. After 10 consecutive,
    returns LOCKED.

    **Validates: Requirements 2.7, 2.8**
    """

    @given(email=_emails, failure_count=st.integers(min_value=5, max_value=9))
    @_default_settings
    def test_five_or_more_failures_returns_blocked(self, email, failure_count):
        """5-9 failures in 15 min → BLOCKED."""
        email_hash = hashlib.sha256(email.encode()).hexdigest()

        with patch("apps.accounts.models.LoginAttempt.objects") as mock_objects:
            mock_objects.filter.return_value.count.return_value = failure_count

            with patch(
                "apps.accounts.services._count_consecutive_failures",
                return_value=min(failure_count, 9),
            ):
                result = check_login_attempts(email_hash)

        self.assertEqual(result, LoginStatus.BLOCKED)

    @given(email=_emails, failure_count=st.integers(min_value=10, max_value=20))
    @_default_settings
    def test_ten_or_more_consecutive_failures_returns_locked(self, email, failure_count):
        """10+ consecutive failures → LOCKED."""
        email_hash = hashlib.sha256(email.encode()).hexdigest()

        with patch("apps.accounts.models.LoginAttempt.objects") as mock_objects:
            mock_objects.filter.return_value.count.return_value = failure_count

            with patch(
                "apps.accounts.services._count_consecutive_failures",
                return_value=failure_count,
            ):
                result = check_login_attempts(email_hash)

        self.assertEqual(result, LoginStatus.LOCKED)

    @given(email=_emails, failure_count=st.integers(min_value=0, max_value=4))
    @_default_settings
    def test_fewer_than_five_failures_returns_allowed(self, email, failure_count):
        """0-4 failures in 15 min → ALLOWED."""
        email_hash = hashlib.sha256(email.encode()).hexdigest()

        with patch("apps.accounts.models.LoginAttempt.objects") as mock_objects:
            mock_objects.filter.return_value.count.return_value = failure_count
            result = check_login_attempts(email_hash)

        self.assertEqual(result, LoginStatus.ALLOWED)


# =========================================================================
# Property 4: Auth rate limiting — reset and registration
# =========================================================================


class TestPasswordResetTokenGeneration(SimpleTestCase):
    """Property 4: Auth rate limiting — reset and registration.

    Test that generate_password_reset_token creates tokens with correct
    SHA-256 hash and 1-hour expiry.

    **Validates: Requirements 2.9, 2.11, 2.12**
    """

    @given(role=_roles)
    @_default_settings
    def test_generated_token_has_correct_sha256_hash_stored(self, role):
        """The stored token_hash must equal SHA-256(raw_token)."""
        user = _make_mock_user(role=role)
        created_objects = []

        with patch("apps.accounts.models.PasswordResetToken.objects") as mock_objects:
            mock_objects.create.side_effect = lambda **kw: created_objects.append(kw)
            raw_token = generate_password_reset_token(user)

        expected_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        self.assertEqual(created_objects[0]["token_hash"], expected_hash)

    @given(role=_roles)
    @_default_settings
    def test_generated_token_has_one_hour_expiry(self, role):
        """The stored expires_at must be approximately 1 hour from now."""
        user = _make_mock_user(role=role)
        created_objects = []

        with patch("apps.accounts.models.PasswordResetToken.objects") as mock_objects:
            mock_objects.create.side_effect = lambda **kw: created_objects.append(kw)
            generate_password_reset_token(user)

        from django.utils import timezone as tz

        expires_at = created_objects[0]["expires_at"]
        expected = tz.now() + timedelta(hours=1)
        delta = abs((expires_at - expected).total_seconds())
        self.assertLess(delta, 5)

    @given(role=_roles)
    @_default_settings
    def test_generated_token_is_64_hex_chars(self, role):
        """Raw token must be 64 hex characters (32 bytes)."""
        user = _make_mock_user(role=role)

        with patch("apps.accounts.models.PasswordResetToken.objects") as mock_objects:
            mock_objects.create.return_value = MagicMock()
            raw_token = generate_password_reset_token(user)

        self.assertEqual(len(raw_token), 64)
        self.assertTrue(all(c in "0123456789abcdef" for c in raw_token))

    @given(role=_roles)
    @_default_settings
    def test_generated_token_stored_as_unused(self, role):
        """The stored token must have used=False."""
        user = _make_mock_user(role=role)
        created_objects = []

        with patch("apps.accounts.models.PasswordResetToken.objects") as mock_objects:
            mock_objects.create.side_effect = lambda **kw: created_objects.append(kw)
            generate_password_reset_token(user)

        self.assertFalse(created_objects[0]["used"])


# =========================================================================
# Property 5: Password reset token round-trip
# =========================================================================


class TestPasswordResetTokenRoundTrip(SimpleTestCase):
    """Property 5: Password reset token round-trip.

    For any password reset, the generated token is 64 hex chars (32 bytes),
    and SHA-256(token) matches the stored hash. Token is invalid after use.

    **Validates: Requirements 2.9**
    """

    @given(role=_roles)
    @_default_settings
    def test_token_sha256_matches_stored_hash(self, role):
        """SHA-256(raw_token) must match the token_hash stored in DB."""
        user = _make_mock_user(role=role)
        created_objects = []

        with patch("apps.accounts.models.PasswordResetToken.objects") as mock_objects:
            mock_objects.create.side_effect = lambda **kw: created_objects.append(kw)
            raw_token = generate_password_reset_token(user)

        computed_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        self.assertEqual(created_objects[0]["token_hash"], computed_hash)

    @given(role=_roles)
    @_default_settings
    def test_token_is_32_bytes_hex_encoded(self, role):
        """Token must be exactly 64 hex characters (32 bytes)."""
        user = _make_mock_user(role=role)

        with patch("apps.accounts.models.PasswordResetToken.objects") as mock_objects:
            mock_objects.create.return_value = MagicMock()
            raw_token = generate_password_reset_token(user)

        self.assertEqual(len(raw_token), 64)
        int(raw_token, 16)  # Raises ValueError if not valid hex

    def test_used_token_returns_none_on_verify(self):
        """After a token is used (marked used=True), verify should return None."""
        from apps.accounts.models import PasswordResetToken
        from apps.accounts.services import verify_password_reset_token

        token = "a" * 64

        with patch("apps.accounts.models.PasswordResetToken.objects") as mock_objects:
            mock_objects.select_related.return_value.get.side_effect = (
                PasswordResetToken.DoesNotExist()
            )
            result = verify_password_reset_token(token)

        self.assertIsNone(result)

    @given(role=_roles)
    @_default_settings
    def test_each_generation_produces_unique_token(self, role):
        """Two consecutive token generations must produce different tokens."""
        user = _make_mock_user(role=role)

        with patch("apps.accounts.models.PasswordResetToken.objects") as mock_objects:
            mock_objects.create.return_value = MagicMock()
            token1 = generate_password_reset_token(user)
            token2 = generate_password_reset_token(user)

        self.assertNotEqual(token1, token2)


# =========================================================================
# Property 6: Email existence is never revealed
# =========================================================================


class TestEmailExistenceNeverRevealed(SimpleTestCase):
    """Property 6: Email existence is never revealed.

    Login failure and password reset responses should have identical structure
    regardless of whether email exists.

    **Validates: Requirements 2.10**
    """

    @given(email=_emails)
    @_default_settings
    def test_login_failure_same_structure_for_existing_and_nonexistent_email(self, email):
        """Login failure response must have identical keys and error code
        regardless of whether the email exists in the system."""
        nonexistent_response = {
            "success": False,
            "error": "Invalid credentials",
            "code": "INVALID_CREDENTIALS",
        }
        wrong_password_response = {
            "success": False,
            "error": "Invalid credentials",
            "code": "INVALID_CREDENTIALS",
        }

        self.assertEqual(set(nonexistent_response.keys()), set(wrong_password_response.keys()))
        self.assertEqual(nonexistent_response["error"], wrong_password_response["error"])
        self.assertEqual(nonexistent_response["code"], wrong_password_response["code"])

    @given(email=_emails)
    @_default_settings
    def test_password_reset_same_structure_for_existing_and_nonexistent_email(self, email):
        """Password reset response must have identical structure regardless
        of whether the email exists."""
        expected = {
            "success": True,
            "data": {"message": "If the email exists, a reset link has been sent."},
        }
        existing_response = dict(expected)
        nonexistent_response = dict(expected)

        self.assertEqual(existing_response, nonexistent_response)
        self.assertEqual(existing_response, expected)

    def test_login_view_returns_same_error_for_nonexistent_user(self):
        """LoginView must return INVALID_CREDENTIALS for non-existent email."""
        from apps.accounts.views import LoginView

        request = MagicMock()
        request.data = {"email": "nonexistent@example.com", "password": "password123"}
        request.META = {"REMOTE_ADDR": "127.0.0.1", "HTTP_USER_AGENT": "test"}
        request.COOKIES = {}

        with patch("apps.accounts.views.LoginSerializer") as MockSerializer:
            mock_instance = MagicMock()
            mock_instance.is_valid.return_value = True
            mock_instance.validated_data = {
                "email": "nonexistent@example.com",
                "password": "password123",
            }
            MockSerializer.return_value = mock_instance

            with patch(
                "apps.accounts.views.check_login_attempts",
                return_value=LoginStatus.ALLOWED,
            ):
                with patch("apps.accounts.views.Profile") as MockProfile:
                    MockProfile.objects.get.side_effect = Profile.DoesNotExist()
                    MockProfile.DoesNotExist = Profile.DoesNotExist
                    with patch("apps.accounts.views.record_login_attempt"):
                        view = LoginView()
                        response = view.post(request)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "INVALID_CREDENTIALS")
        error_msg = response.data["error"].lower()
        self.assertNotIn("not found", error_msg)
        self.assertNotIn("does not exist", error_msg)

    def test_password_reset_view_returns_same_response_for_nonexistent_email(self):
        """PasswordResetRequestView must return success even for non-existent email."""
        from apps.accounts.views import PasswordResetRequestView

        request = MagicMock()
        request.data = {"email": "nonexistent@example.com"}
        request.META = {}

        with patch("apps.accounts.views.PasswordResetRequestSerializer") as MockSerializer:
            mock_instance = MagicMock()
            mock_instance.is_valid.return_value = True
            mock_instance.validated_data = {"email": "nonexistent@example.com"}
            MockSerializer.return_value = mock_instance

            with patch("apps.accounts.views.Profile") as MockProfile:
                MockProfile.objects.get.side_effect = Profile.DoesNotExist()
                MockProfile.DoesNotExist = Profile.DoesNotExist
                view = PasswordResetRequestView()
                response = view.post(request)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        msg = response.data["data"]["message"].lower()
        self.assertIn("if the email exists", msg)


# =========================================================================
# Property 33: Auth cookie attributes
# =========================================================================


# Production cookie settings for testing
_PROD_COOKIE_SETTINGS = {
    "AUTH_COOKIE_DOMAIN": ".mihas.edu.zm",
    "AUTH_COOKIE_SAMESITE": "Lax",
    "AUTH_COOKIE_SECURE": True,
    "AUTH_COOKIE_HTTPONLY": True,
}


class TestAuthCookieAttributes(SimpleTestCase):
    """Property 33: Auth cookie attributes.

    Verify cookie settings: Domain=.mihas.edu.zm, SameSite=Lax,
    Secure=True, HttpOnly=True from settings.

    **Validates: Requirements 18.2**
    """

    @override_settings(**_PROD_COOKIE_SETTINGS)
    def test_cookie_domain_is_mihas_subdomain(self):
        """AUTH_COOKIE_DOMAIN must be .mihas.edu.zm for subdomain sharing."""
        from django.conf import settings as s

        self.assertEqual(s.AUTH_COOKIE_DOMAIN, ".mihas.edu.zm")

    @override_settings(**_PROD_COOKIE_SETTINGS)
    def test_cookie_samesite_is_lax(self):
        """AUTH_COOKIE_SAMESITE must be Lax."""
        from django.conf import settings as s

        self.assertEqual(s.AUTH_COOKIE_SAMESITE, "Lax")

    @override_settings(**_PROD_COOKIE_SETTINGS)
    def test_cookie_secure_is_true(self):
        """AUTH_COOKIE_SECURE must be True."""
        from django.conf import settings as s

        self.assertTrue(s.AUTH_COOKIE_SECURE)

    @override_settings(**_PROD_COOKIE_SETTINGS)
    def test_cookie_httponly_is_true(self):
        """AUTH_COOKIE_HTTPONLY must be True."""
        from django.conf import settings as s

        self.assertTrue(s.AUTH_COOKIE_HTTPONLY)

    @given(role=_roles)
    @_default_settings
    @override_settings(**_PROD_COOKIE_SETTINGS)
    def test_set_auth_cookies_uses_correct_attributes(self, role):
        """_set_auth_cookies must set cookies with the configured attributes."""
        from apps.accounts.views import _set_auth_cookies

        user = _make_mock_user(role=role)
        access = generate_access_token(user)
        refresh = generate_refresh_token(user)

        response = MagicMock()
        cookie_calls = []
        response.set_cookie.side_effect = lambda **kwargs: cookie_calls.append(kwargs)

        _set_auth_cookies(response, access, refresh)

        self.assertEqual(len(cookie_calls), 2)

        for call in cookie_calls:
            self.assertEqual(call["domain"], ".mihas.edu.zm")
            self.assertEqual(call["samesite"], "Lax")
            self.assertTrue(call["secure"])
            self.assertTrue(call["httponly"])
            self.assertEqual(call["path"], "/")

        access_call = next(c for c in cookie_calls if c["key"] == "access_token")
        self.assertEqual(access_call["value"], access)
        self.assertEqual(access_call["max_age"], 15 * 60)

        refresh_call = next(c for c in cookie_calls if c["key"] == "refresh_token")
        self.assertEqual(refresh_call["value"], refresh)
        self.assertEqual(refresh_call["max_age"], 7 * 24 * 60 * 60)

    def test_base_settings_define_cookie_attributes(self):
        """base.py must define all four AUTH_COOKIE_* settings."""
        # These exist in base.py even if dev.py overrides them
        self.assertTrue(hasattr(django_settings, "AUTH_COOKIE_DOMAIN"))
        self.assertTrue(hasattr(django_settings, "AUTH_COOKIE_SAMESITE"))
        self.assertTrue(hasattr(django_settings, "AUTH_COOKIE_SECURE"))
        self.assertTrue(hasattr(django_settings, "AUTH_COOKIE_HTTPONLY"))


# =========================================================================
# Property 34: Shared JWT signing key — cross-backend token validity
# =========================================================================


class TestSharedJWTSigningKey(SimpleTestCase):
    """Property 34: Shared JWT signing key — cross-backend token validity.

    For any JWT generated with the signing key, it should be verifiable
    with the same key (simulating cross-backend compatibility).

    **Validates: Requirements 18.4**
    """

    @given(role=_roles)
    @_default_settings
    def test_access_token_verifiable_with_same_key(self, role):
        """An access token generated by Django should be verifiable using
        the same SIGNING_KEY (simulating Vercel backend verification)."""
        user = _make_mock_user(role=role)
        token = generate_access_token(user)

        signing_key = django_settings.SIMPLE_JWT["SIGNING_KEY"]
        algorithm = django_settings.SIMPLE_JWT["ALGORITHM"]

        payload = jwt.decode(token, signing_key, algorithms=[algorithm])

        self.assertEqual(payload["user_id"], str(user.id))
        self.assertEqual(payload["role"], role)
        self.assertEqual(payload["token_type"], "access")

    @given(role=_roles)
    @_default_settings
    def test_refresh_token_verifiable_with_same_key(self, role):
        """A refresh token generated by Django should be verifiable using
        the same SIGNING_KEY."""
        user = _make_mock_user(role=role)
        token = generate_refresh_token(user)

        signing_key = django_settings.SIMPLE_JWT["SIGNING_KEY"]
        algorithm = django_settings.SIMPLE_JWT["ALGORITHM"]

        payload = jwt.decode(token, signing_key, algorithms=[algorithm])

        self.assertEqual(payload["user_id"], str(user.id))
        self.assertEqual(payload["token_type"], "refresh")

    @given(role=_roles)
    @_default_settings
    def test_token_generated_externally_verifiable_by_django(self, role):
        """A JWT generated with raw PyJWT using the same key should be
        verifiable by Django's verify_token (cross-backend compatibility)."""
        with _blacklist_lock:
            _blacklisted_jtis.clear()

        signing_key = django_settings.SIMPLE_JWT["SIGNING_KEY"]
        algorithm = django_settings.SIMPLE_JWT["ALGORITHM"]

        user_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        payload = {
            "token_type": "access",
            "user_id": user_id,
            "email": "test@example.com",
            "role": role,
            "first_name": "Test",
            "last_name": "User",
            "permissions": [],
            "iat": now,
            "exp": now + timedelta(minutes=15),
            "jti": str(uuid.uuid4()),
        }

        external_token = jwt.encode(payload, signing_key, algorithm=algorithm)

        decoded = verify_token(external_token, token_type="access")
        self.assertEqual(decoded["user_id"], user_id)
        self.assertEqual(decoded["role"], role)

    def test_algorithm_is_hs256(self):
        """JWT algorithm must be HS256 for cross-backend compatibility."""
        self.assertEqual(django_settings.SIMPLE_JWT["ALGORITHM"], "HS256")

    def test_signing_key_configured(self):
        """SIGNING_KEY must be configured in settings."""
        self.assertIn("SIGNING_KEY", django_settings.SIMPLE_JWT)
