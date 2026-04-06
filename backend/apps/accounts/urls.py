"""Account URL routing — auth endpoints.

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
]
