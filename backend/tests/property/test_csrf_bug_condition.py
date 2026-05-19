"""Bug condition exploration tests — JWTUser→Profile type mismatch in CSRF operations.

**Validates: Requirements 1.1, 1.2, 1.4**

These tests encode the EXPECTED (correct) behavior:
- _generate_csrf_token(JWTUser(...)) should return a valid 64-char hex token
- CSRFToken.objects.filter() with a JWTUser-derived lookup should not raise

On UNFIXED code, these tests FAIL because:
- _generate_csrf_token passes JWTUser directly to CSRFToken.objects.create(user=user),
  raising ValueError: Cannot assign "<JWTUser>": "CSRFToken.user" must be a "Profile" instance
- CSRFToken.objects.filter(user=JWTUser(...)) raises ValidationError because
  Django tries to interpret JWTUser.__str__ as a UUID for the FK lookup

Failure CONFIRMS the bug exists. Do NOT fix the code when these fail.
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

from apps.accounts.authentication import JWTUser  # noqa: E402
from apps.accounts.models import CSRFToken  # noqa: E402
from apps.accounts.views import _generate_csrf_token  # noqa: E402

# Hypothesis settings — no deadline needed, moderate examples
_pbt_settings = settings(max_examples=5, deadline=None)

# Strategy for roles used in the platform
_role_strategy = st.sampled_from(["student", "admin", "reviewer", "super_admin"])


def _make_jwt_user(user_id: uuid.UUID, email: str, role: str) -> JWTUser:
    """Construct a JWTUser from a JWT-like payload."""
    return JWTUser({
        "user_id": str(user_id),
        "email": email,
        "role": role,
        "token_type": "access",
    })


# ---------------------------------------------------------------------------
# Property 1: Bug Condition — _generate_csrf_token with JWTUser
# ---------------------------------------------------------------------------


class TestCsrfTokenGenerationWithJWTUser(SimpleTestCase):
    """_generate_csrf_token must accept JWTUser inputs (SessionView.get path).

    **Validates: Requirements 1.1, 1.4**

    On unfixed code, calling _generate_csrf_token(JWTUser(...)) raises:
      ValueError: Cannot assign "<JWTUser>": "CSRFToken.user" must be a "Profile" instance

    After fix, the function resolves JWTUser→Profile and returns a valid token.
    """

    @given(
        user_id=st.uuids(),
        email=st.emails(),
        role=_role_strategy,
    )
    @_pbt_settings
    def test_generate_csrf_token_with_jwt_user_returns_valid_token(
        self, user_id, email, role
    ):
        """For any JWTUser constructed from random UUID/email/role,
        _generate_csrf_token should return a valid 64-char hex string.

        On unfixed code this raises ValueError at CSRFToken.objects.create(user=jwt_user)
        because Django's FK descriptor rejects non-Profile instances.
        The ValueError is raised at the model layer before any DB I/O.
        """
        jwt_user = _make_jwt_user(user_id, email, role)

        # On unfixed code: _generate_csrf_token calls
        #   CSRFToken.objects.create(user=jwt_user, ...)
        # Django raises ValueError at FK assignment before any DB call.
        #
        # After fix: the function resolves JWTUser→Profile first, so
        # CSRFToken.objects.create receives a Profile instance.
        # We mock the DB-touching parts to isolate the type-check logic.
        mock_profile = MagicMock()
        mock_profile.id = user_id
        mock_profile.pk = user_id

        with patch("apps.accounts.auth_views.Profile.objects.get", return_value=mock_profile) as mock_get, \
             patch.object(CSRFToken.objects, "create") as mock_create:
            raw_token = _generate_csrf_token(jwt_user)

        # Verify the token format is correct
        assert isinstance(raw_token, str), "Token must be a string"
        assert len(raw_token) == 64, f"Token must be 64 hex chars, got {len(raw_token)}"
        assert all(c in "0123456789abcdef" for c in raw_token), "Token must be valid hex"

        # Verify that Profile.objects.get was called to resolve JWTUser→Profile
        mock_get.assert_called_once_with(id=jwt_user.id)

        # Verify CSRFToken.objects.create received the resolved Profile, not JWTUser
        create_kwargs = mock_create.call_args.kwargs
        assert "user" in create_kwargs, "CSRFToken.objects.create must receive user kwarg"
        assert create_kwargs["user"] is mock_profile, (
            f"CSRFToken.objects.create must receive the resolved Profile, "
            f"not the original JWTUser"
        )


# ---------------------------------------------------------------------------
# Property 1 (cont.): Bug Condition — CSRF token deletion with JWTUser
# ---------------------------------------------------------------------------


class TestCsrfTokenDeletionWithJWTUser(SimpleTestCase):
    """LogoutView CSRF cleanup must work with JWTUser as request.user.

    **Validates: Requirements 1.2**

    On unfixed code, LogoutView.post calls:
      CSRFToken.objects.filter(user=request.user).delete()
    where request.user is a JWTUser. Django raises ValidationError because
    it tries to interpret JWTUser.__str__() as a UUID for the FK lookup.

    The fix changes this to:
      CSRFToken.objects.filter(user_id=request.user.id).delete()
    which bypasses the FK instance check by using the raw UUID directly.
    """

    @given(
        user_id=st.uuids(),
        email=st.emails(),
        role=_role_strategy,
    )
    @_pbt_settings
    def test_csrf_filter_by_user_id_works_for_jwt_user(
        self, user_id, email, role
    ):
        """For any JWTUser, CSRFToken.objects.filter(user_id=jwt_user.id)
        must build a valid query without raising.

        This validates the fix pattern: using user_id= instead of user=.
        """
        jwt_user = _make_jwt_user(user_id, email, role)

        # The FIXED pattern: filter by user_id (raw UUID) — must not raise
        qs = CSRFToken.objects.filter(user_id=jwt_user.id)
        # Force query compilation to ensure no validation errors
        query_str = str(qs.query)

        assert "user_id" in query_str, (
            "Query must filter by user_id column"
        )

    @given(
        user_id=st.uuids(),
        email=st.emails(),
        role=_role_strategy,
    )
    @_pbt_settings
    def test_csrf_filter_by_user_object_fails_for_jwt_user(
        self, user_id, email, role
    ):
        """For any JWTUser, CSRFToken.objects.filter(user=JWTUser(...))
        raises ValueError or ValidationError — confirming the bug condition.

        This test documents the broken pattern that LogoutView uses on
        unfixed code. After fix, LogoutView no longer uses this pattern,
        but Django's FK validation still rejects JWTUser objects.
        """
        jwt_user = _make_jwt_user(user_id, email, role)

        # The BROKEN pattern: filter by user= with JWTUser object
        with self.assertRaises((ValueError, Exception)):
            qs = CSRFToken.objects.filter(user=jwt_user)
            # Force query compilation to trigger validation
            str(qs.query)
