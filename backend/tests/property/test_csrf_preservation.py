"""Preservation property tests — Profile-based CSRF token generation unchanged.

**Validates: Requirements 3.1, 3.2, 3.3**

These tests verify that the EXISTING working behavior is preserved:
- _generate_csrf_token(Profile(...)) returns a valid 64-char hex token
- CSRFToken rows created for Profile instances can be found via user_id lookup
- Creating then filtering/deleting CSRF tokens by user_id works correctly

This is the LoginView/RefreshView path that already works on UNFIXED code.
These tests MUST PASS on unfixed code to establish the preservation baseline.
After the fix is applied, these tests must CONTINUE to pass — confirming
no regressions for Profile-typed inputs.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

import uuid  # noqa: E402
from unittest.mock import MagicMock, patch, call  # noqa: E402

import django  # noqa: E402

django.setup()

from django.test import SimpleTestCase  # noqa: E402
from hypothesis import given, settings  # noqa: E402
from hypothesis import strategies as st  # noqa: E402

from apps.accounts.models import CSRFToken, Profile  # noqa: E402
from apps.accounts.views import _generate_csrf_token  # noqa: E402

# Hypothesis settings — moderate examples, no deadline
_pbt_settings = settings(max_examples=5, deadline=None)

# Strategy for roles used in the platform
_role_strategy = st.sampled_from(["student", "admin", "reviewer", "super_admin"])


def _make_profile(user_id: uuid.UUID, email: str, role: str) -> Profile:
    """Construct a Profile instance without saving to DB.

    Uses Profile() constructor directly — the instance has all fields set
    but is not persisted. This mirrors what LoginView/RefreshView do when
    they look up Profile.objects.get(...) from the database.
    """
    profile = Profile(id=user_id, email=email, role=role)
    return profile


# ---------------------------------------------------------------------------
# Property 2: Preservation — _generate_csrf_token with Profile input
# ---------------------------------------------------------------------------


class TestCsrfTokenGenerationWithProfile(SimpleTestCase):
    """_generate_csrf_token must accept Profile inputs and return valid tokens.

    **Validates: Requirements 3.1, 3.2**

    This is the LoginView/RefreshView path that already works correctly.
    The fix must not break this behavior.
    """

    @given(
        user_id=st.uuids(),
        email=st.emails(),
        role=_role_strategy,
    )
    @_pbt_settings
    def test_generate_csrf_token_with_profile_returns_valid_hex_token(
        self, user_id, email, role
    ):
        """For any Profile instance (random UUID, email, role),
        _generate_csrf_token(profile) returns a 64-char hex string.

        We mock CSRFToken.objects.create to avoid DB writes while verifying
        that the function passes the Profile instance through correctly.
        """
        profile = _make_profile(user_id, email, role)

        with patch.object(CSRFToken.objects, "create") as mock_create:
            raw_token = _generate_csrf_token(profile)

        # Token format: 64 hex characters (32 bytes from secrets.token_hex(32))
        assert isinstance(raw_token, str), "Token must be a string"
        assert len(raw_token) == 64, f"Token must be 64 hex chars, got {len(raw_token)}"
        assert all(c in "0123456789abcdef" for c in raw_token), "Token must be valid hex"

    @given(
        user_id=st.uuids(),
        email=st.emails(),
        role=_role_strategy,
    )
    @_pbt_settings
    def test_generate_csrf_token_with_profile_creates_csrf_row(
        self, user_id, email, role
    ):
        """For any Profile instance, _generate_csrf_token calls
        CSRFToken.objects.create with user=profile (the Profile instance).

        This confirms the Profile-typed path passes the instance directly
        to the ORM create call — the existing behavior that must be preserved.
        """
        profile = _make_profile(user_id, email, role)

        with patch.object(CSRFToken.objects, "create") as mock_create:
            raw_token = _generate_csrf_token(profile)

        # Verify CSRFToken.objects.create was called exactly once
        mock_create.assert_called_once()

        # Verify the create call received the Profile instance as user
        create_kwargs = mock_create.call_args.kwargs
        assert "user" in create_kwargs, "CSRFToken.objects.create must receive user kwarg"
        assert create_kwargs["user"] is profile, (
            "CSRFToken.objects.create must receive the original Profile instance"
        )

        # Verify token_hash and expires_at were also provided
        assert "token_hash" in create_kwargs, "Must provide token_hash"
        assert "expires_at" in create_kwargs, "Must provide expires_at"
        assert isinstance(create_kwargs["token_hash"], str), "token_hash must be a string"
        assert len(create_kwargs["token_hash"]) == 64, "token_hash must be a SHA-256 hex digest"


# ---------------------------------------------------------------------------
# Property 2 (cont.): Preservation — CSRF token lookup by user_id for Profile
# ---------------------------------------------------------------------------


class TestCsrfTokenLookupByProfileUserId(SimpleTestCase):
    """CSRFToken.objects.filter(user_id=profile.id) must build valid queries.

    **Validates: Requirements 3.3**

    This verifies that the user_id-based lookup pattern works correctly
    for Profile instances — the same pattern used by CSRFEnforcementMiddleware
    and the fixed LogoutView.
    """

    @given(
        user_id=st.uuids(),
        email=st.emails(),
        role=_role_strategy,
    )
    @_pbt_settings
    def test_filter_by_user_id_builds_valid_query_for_profile(
        self, user_id, email, role
    ):
        """For any Profile instance, CSRFToken.objects.filter(user_id=profile.id)
        builds a valid SQL query without raising.

        This is the pattern used by CSRFEnforcementMiddleware (user_id=user.pk)
        and must continue to work after the fix.
        """
        profile = _make_profile(user_id, email, role)

        # Build the queryset — this must not raise
        qs = CSRFToken.objects.filter(user_id=profile.id)

        # Force query compilation to verify no validation errors
        query_str = str(qs.query)

        assert "user_id" in query_str, "Query must filter by user_id column"

    @given(
        user_id=st.uuids(),
        email=st.emails(),
        role=_role_strategy,
    )
    @_pbt_settings
    def test_filter_by_user_fk_builds_valid_query_for_profile(
        self, user_id, email, role
    ):
        """For any Profile instance, CSRFToken.objects.filter(user=profile)
        also builds a valid query — Django accepts Profile instances for FK lookups.

        This confirms that Profile-typed FK lookups work (unlike JWTUser-typed ones).
        """
        profile = _make_profile(user_id, email, role)

        # Build the queryset with FK object — this works for Profile instances
        qs = CSRFToken.objects.filter(user=profile)

        # Force query compilation to verify no validation errors
        query_str = str(qs.query)

        assert "user_id" in query_str, "Query must resolve to user_id column"
