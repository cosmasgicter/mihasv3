"""Account URL routing - auth endpoints.

Implements task 9.6.
Requirements: 10.1
"""

from django.urls import path

from apps.accounts.views import (
    LoginView,
    LogoutView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    ProfileView,
    RefreshView,
    RegisterView,
    SessionView,
)
from apps.catalog.staff_invitation_views import StaffInvitationAcceptView

app_name = "accounts"

urlpatterns = [
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("register/", RegisterView.as_view(), name="auth-register"),
    path("session/", SessionView.as_view(), name="auth-session"),
    path("password-reset/", PasswordResetRequestView.as_view(), name="auth-password-reset"),
    path("password-reset/confirm/", PasswordResetConfirmView.as_view(), name="auth-password-reset-confirm"),
    path("profile/", ProfileView.as_view(), name="auth-profile"),
    # Public staff-invitation acceptance handoff (task 4.2, R4.3): the invitee
    # sets their own password by consuming the single-use token. Unauthenticated
    # (they are not yet signed in) — the token is the sole guard.
    path(
        "staff-invitation/accept/",
        StaffInvitationAcceptView.as_view(),
        name="auth-staff-invitation-accept",
    ),
]
