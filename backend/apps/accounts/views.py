"""Authentication views — re-export shim.

Decomposed during Stream 9 backend module decomposition.
All view classes, response serializers, and shared helpers are re-exported
here so that existing imports continue to work without changes.

Split files:
  - auth_views.py     — LoginView, LogoutView, RegisterView, RefreshView, SessionView
  - password_views.py — PasswordResetRequestView, PasswordResetConfirmView, ChangePasswordView
  - profile_views.py  — ProfileView
  - auth_helpers.py   — _set_auth_cookies, _clear_auth_cookies, _generate_csrf_token,
                        _has_recent_csrf_token, _get_client_ip, _hash_value
"""

# View classes
from apps.accounts.auth_views import (  # noqa: F401
    LoginResponseSerializer,
    LoginView,
    LogoutResponseSerializer,
    LogoutView,
    MessageEnvelopeSerializer,
    RefreshResponseSerializer,
    RefreshView,
    RegisterResponseSerializer,
    RegisterView,
    SessionResponseSerializer,
    SessionView,
)
from apps.accounts.password_views import (  # noqa: F401
    PasswordResetConfirmView,
    PasswordResetRequestView,
)
from apps.accounts.profile_views import ProfileView  # noqa: F401

# Test patch backward-compat: existing tests use
# ``@patch("apps.accounts.views.X")`` for these symbols.
from apps.accounts.models import CSRFToken, DeviceSession, Profile  # noqa: F401
from apps.accounts.tokens import (  # noqa: F401
    blacklist_jti,
    generate_access_token,
    generate_refresh_token,
    rotate_tokens,
    verify_token,
)
from apps.accounts.services import (  # noqa: F401
    LoginStatus,
    check_login_attempts,
    generate_password_reset_token,
    hash_password,
    needs_rehash,
    record_login_attempt,
    send_lockout_email,
    verify_password,
    verify_password_reset_token,
)

# Shared auth helpers
from apps.accounts.auth_helpers import (  # noqa: F401
    _clear_auth_cookies,
    _generate_csrf_token,
    _get_client_ip,
    _has_recent_csrf_token,
    _hash_value,
    _set_auth_cookies,
)

__all__ = [
    # View classes
    "LoginView",
    "LogoutView",
    "PasswordResetConfirmView",
    "PasswordResetRequestView",
    "ProfileView",
    "RefreshView",
    "RegisterView",
    "SessionView",
    # Response serializers
    "LoginResponseSerializer",
    "LogoutResponseSerializer",
    "MessageEnvelopeSerializer",
    "RefreshResponseSerializer",
    "RegisterResponseSerializer",
    "SessionResponseSerializer",
    # Helpers
    "_clear_auth_cookies",
    "_generate_csrf_token",
    "_get_client_ip",
    "_has_recent_csrf_token",
    "_hash_value",
    "_set_auth_cookies",
]
