"""Unit tests for view auth classification.

Verifies that every view declares the correct authentication strategy:
- Auth-exempt views use authentication_classes = []
- Public-personalizable views use [OptionalJWTCookieAuthentication]
- Protected views inherit the DRF default [JWTCookieAuthentication]

Validates: Requirements 2.1, 2.2, 2.3
"""

import pytest

from apps.accounts.authentication import (
    JWTCookieAuthentication,
    OptionalJWTCookieAuthentication,
)


# ---------------------------------------------------------------------------
# Public-personalizable views: must use OptionalJWTCookieAuthentication
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "view_path,view_name",
    [
        ("apps.catalog.views.ProgramListCreateView", "ProgramListCreateView"),
        ("apps.catalog.views.IntakeListCreateView", "IntakeListCreateView"),
        ("apps.catalog.views.SubjectListView", "SubjectListView"),
        ("apps.catalog.views.InstitutionListCreateView", "InstitutionListCreateView"),
        ("apps.applications.views.ApplicationTrackView", "ApplicationTrackView"),
        ("apps.jobs.views.JobListView", "JobListView"),
        ("apps.jobs.views.JobDetailView", "JobDetailView"),
        ("apps.accounts.views.SessionView", "SessionView"),
    ],
    ids=[
        "ProgramListCreateView",
        "IntakeListCreateView",
        "SubjectListView",
        "InstitutionListCreateView",
        "ApplicationTrackView",
        "JobListView",
        "JobDetailView",
        "SessionView",
    ],
)
def test_public_personalizable_views_use_optional_jwt(view_path, view_name):
    """Public-personalizable views must declare [OptionalJWTCookieAuthentication]."""
    module_path, class_name = view_path.rsplit(".", 1)
    import importlib

    module = importlib.import_module(module_path)
    view_cls = getattr(module, class_name)

    auth_classes = view_cls.authentication_classes
    assert len(auth_classes) == 1, (
        f"{view_name}.authentication_classes should have exactly 1 entry, "
        f"got {len(auth_classes)}: {auth_classes}"
    )
    assert auth_classes[0] is OptionalJWTCookieAuthentication, (
        f"{view_name}.authentication_classes[0] should be "
        f"OptionalJWTCookieAuthentication, got {auth_classes[0]}"
    )


# ---------------------------------------------------------------------------
# Auth-exempt views: must use authentication_classes = []
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "view_path,view_name",
    [
        ("apps.accounts.views.LoginView", "LoginView"),
        ("apps.accounts.views.RegisterView", "RegisterView"),
        ("apps.accounts.views.RefreshView", "RefreshView"),
        ("apps.accounts.views.PasswordResetRequestView", "PasswordResetRequestView"),
        ("apps.accounts.views.PasswordResetConfirmView", "PasswordResetConfirmView"),
        ("apps.common.health.LivenessView", "LivenessView"),
        ("apps.common.health.ReadinessView", "ReadinessView"),
        ("apps.common.meta_views.PlatformMetaView", "PlatformMetaView"),
        ("apps.common.error_views.ErrorReportView", "ErrorReportView"),
    ],
    ids=[
        "LoginView",
        "RegisterView",
        "RefreshView",
        "PasswordResetRequestView",
        "PasswordResetConfirmView",
        "LivenessView",
        "ReadinessView",
        "PlatformMetaView",
        "ErrorReportView",
    ],
)
def test_auth_exempt_views_use_empty_auth_classes(view_path, view_name):
    """Auth-exempt views must declare authentication_classes = []."""
    module_path, class_name = view_path.rsplit(".", 1)
    import importlib

    module = importlib.import_module(module_path)
    view_cls = getattr(module, class_name)

    auth_classes = view_cls.authentication_classes
    assert auth_classes == [], (
        f"{view_name}.authentication_classes should be [], got {auth_classes}"
    )


# ---------------------------------------------------------------------------
# Protected views: must NOT set authentication_classes (inherit DRF default)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "view_path,view_name",
    [
        ("apps.accounts.views.LogoutView", "LogoutView"),
        ("apps.accounts.views.ProfileView", "ProfileView"),
        ("apps.accounts.session_views.SessionListView", "SessionListView"),
        ("apps.applications.views.ApplicationListCreateView", "ApplicationListCreateView"),
        ("apps.applications.views.ApplicationDetailView", "ApplicationDetailView"),
        ("apps.applications.views.ApplicationSubmitView", "ApplicationSubmitView"),
    ],
    ids=[
        "LogoutView",
        "ProfileView",
        "SessionListView",
        "ApplicationListCreateView",
        "ApplicationDetailView",
        "ApplicationSubmitView",
    ],
)
def test_protected_views_inherit_drf_default_auth(view_path, view_name):
    """Protected views must NOT explicitly set authentication_classes,
    so they inherit the DRF default [JWTCookieAuthentication] from settings."""
    module_path, class_name = view_path.rsplit(".", 1)
    import importlib

    module = importlib.import_module(module_path)
    view_cls = getattr(module, class_name)

    # Protected views should not define authentication_classes on the class itself.
    # They rely on the DRF default from REST_FRAMEWORK settings.
    has_own_auth = "authentication_classes" in view_cls.__dict__
    assert not has_own_auth, (
        f"{view_name} should NOT explicitly set authentication_classes "
        f"(should inherit DRF default JWTCookieAuthentication). "
        f"Found: {view_cls.__dict__.get('authentication_classes')}"
    )

    # Verify the inherited value resolves to JWTCookieAuthentication
    from django.conf import settings

    default_auth = settings.REST_FRAMEWORK.get("DEFAULT_AUTHENTICATION_CLASSES", [])
    assert "apps.accounts.authentication.JWTCookieAuthentication" in default_auth, (
        "DRF DEFAULT_AUTHENTICATION_CLASSES should include JWTCookieAuthentication"
    )
