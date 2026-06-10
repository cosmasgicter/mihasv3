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


# ---------------------------------------------------------------------------
# Auto-detection: every APIView subclass must appear in a classification list
# ---------------------------------------------------------------------------

# Collect all classified view paths from the parametrize lists above + all discovered views
_PUBLIC_PERSONALIZABLE = {
    "apps.catalog.views.CatalogContextView",
    "apps.catalog.views.CanonicalProgramListView",
    "apps.catalog.views.AssignmentPreviewView",
    "apps.catalog.views.ProgramListCreateView",
    "apps.catalog.views.IntakeListCreateView",
    "apps.catalog.views.SubjectListView",
    "apps.catalog.views.InstitutionListCreateView",
    "apps.applications.views.ApplicationTrackView",
    "apps.applications.public_views.ApplicationTrackView",
    "apps.jobs.views.JobListView",
    "apps.jobs.views.JobDetailView",
    "apps.accounts.views.SessionView",
}

_AUTH_EXEMPT = {
    "apps.accounts.views.LoginView",
    "apps.accounts.views.RegisterView",
    "apps.accounts.views.RefreshView",
    "apps.accounts.views.PasswordResetRequestView",
    "apps.accounts.views.PasswordResetConfirmView",
    "apps.common.health.LivenessView",
    "apps.common.health.ReadinessView",
    "apps.common.health.RedisHealthView",
    "apps.common.meta_views.PlatformMetaView",
    "apps.common.error_views.ErrorReportView",
    "apps.documents.views.LencoWebhookView",
    "apps.integrations.views.TelegramWebhookView",
    "apps.integrations.email_views.EmailDeliveryWebhookView",
}

_PROTECTED = {
    # accounts
    "apps.accounts.views.LogoutView",
    "apps.accounts.views.ProfileView",
    "apps.accounts.session_views.SessionListView",
    "apps.accounts.session_views.SessionRevokeView",
    "apps.accounts.session_views.SessionRevokeAllView",
    "apps.accounts.admin_views.AdminDashboardView",
    "apps.accounts.admin_views.AdminUserListView",
    "apps.accounts.admin_views.AdminUserDetailView",
    "apps.accounts.admin_views.AdminUserExportView",
    "apps.accounts.admin_views.AdminAuditLogView",
    "apps.accounts.admin_views.AdminSettingsListView",
    "apps.accounts.admin_views.AdminSettingDetailView",
    "apps.accounts.admin_views.AdminSettingsImportView",
    "apps.accounts.admin_views.AdminSettingsResetView",
    "apps.accounts.batch_views.BatchUserImportView",
    # applications — legacy re-exports
    "apps.applications.views.ApplicationListCreateView",
    "apps.applications.views.ApplicationDetailView",
    "apps.applications.views.ApplicationSubmitView",
    # applications — student
    "apps.applications.student_views.ApplicationDetailView",
    "apps.applications.student_views.ApplicationDetailsView",
    "apps.applications.student_views.ApplicationDraftView",
    "apps.applications.student_views.ApplicationGradesView",
    "apps.applications.student_views.ApplicationDocumentsView",
    "apps.applications.student_views.ApplicationSummaryView",
    "apps.applications.student_views.ApplicationPreviewSummaryView",
    "apps.applications.student_views.ApplicationSubmitView",
    "apps.applications.student_views.ApplicationWithdrawView",
    "apps.applications.student_views.ApplicationWaitlistPositionView",
    "apps.applications.student_views.ApplicationConditionsView",
    "apps.applications.student_views.ApplicationConfirmEnrollmentView",
    "apps.applications.student_views.ApplicationAmendmentView",
    "apps.applications.student_views.EmailSlipView",
    # applications — admin
    "apps.applications.admin_views.ApplicationListCreateView",
    "apps.applications.admin_views.ApplicationReviewView",
    "apps.applications.admin_views.ApplicationAssignView",
    "apps.applications.admin_views.ApplicationAutoAssignView",
    "apps.applications.admin_views.ApplicationBulkStatusView",
    "apps.applications.admin_views.ApplicationExportView",
    "apps.applications.admin_views.ApplicationFeeWaiverView",
    "apps.applications.admin_views.ApplicationConditionVerifyView",
    "apps.applications.admin_views.ApplicationAmendmentReviewView",
    "apps.applications.admin_views.ApplicationAdminSummaryView",
    # applications — documents, interviews, history
    "apps.applications.document_views.ApplicationVerifyDocumentView",
    "apps.applications.document_views.AcceptanceLetterView",
    "apps.applications.document_views.ApplicationSlipView",
    "apps.applications.document_views.ConditionalOfferView",
    "apps.applications.document_views.FinanceReceiptView",
    "apps.applications.document_views.PaymentReceiptView",
    "apps.applications.interview_views.ApplicationInterviewView",
    "apps.applications.interview_views.ApplicationInterviewListView",
    "apps.applications.history_views.TimelineHistoryView",
    # catalog detail views
    "apps.catalog.views.ProgramDetailView",
    "apps.catalog.views.IntakeDetailView",
    "apps.catalog.views.InstitutionDetailView",
    # catalog tenant admin
    "apps.catalog.admin_views.AdminAccessGrantDetailView",
    "apps.catalog.admin_views.AdminAccessGrantListCreateView",
    "apps.catalog.admin_views.AdminInstitutionAuditView",
    "apps.catalog.admin_views.AdminMembershipDetailView",
    "apps.catalog.admin_views.AdminMembershipListCreateView",
    "apps.catalog.admin_views.AdminRoutingSimulateView",
    "apps.catalog.admin_views.AdminTenantAssetDetailView",
    "apps.catalog.admin_views.AdminTenantAssetListCreateView",
    "apps.catalog.admin_views.AdminTenantAssetUploadView",
    "apps.catalog.admin_views.AdminTenantAuditView",
    "apps.catalog.admin_views.AdminTenantDetailView",
    "apps.catalog.admin_views.AdminTenantDomainDetailView",
    "apps.catalog.admin_views.AdminTenantDomainListCreateView",
    "apps.catalog.admin_views.AdminTenantListCreateView",
    "apps.catalog.admin_views.AdminTenantRequiredDocumentDetailView",
    "apps.catalog.admin_views.AdminTenantRequiredDocumentListCreateView",
    "apps.catalog.admin_views.AdminTenantTemplateDetailView",
    "apps.catalog.admin_views.AdminTenantTemplateListCreateView",
    "apps.catalog.admin_views._InstitutionChildDetailView",
    "apps.catalog.admin_views._InstitutionChildListCreateView",
    # documents
    "apps.documents.views.DocumentUploadView",
    "apps.documents.views.DocumentDeleteView",
    "apps.documents.views.DocumentDownloadView",
    "apps.documents.views.DocumentExtractView",
    "apps.documents.views.DocumentInfoView",
    "apps.documents.views.DocumentSignedUrlView",
    "apps.documents.views.PaymentInitiateView",
    "apps.documents.views.PaymentVerifyView",
    "apps.documents.views.PaymentListView",
    "apps.documents.views.PaymentReceiptView",
    "apps.documents.views.PaymentDevBypassView",
    "apps.documents.views.MobileMoneyInitiateView",
    "apps.documents.views.DeferPaymentView",
    "apps.documents.views.FeeResolveView",
    "apps.documents.views.ProgramFeeViewSet",
    # documents — job views
    "apps.documents.job_views.ResumeListView",
    "apps.documents.job_views.ResumeVariantCreateView",
    "apps.documents.job_views.CoverLetterGenerateView",
    "apps.documents.job_views.DocumentVersionListView",
    "apps.documents.job_views.QuestionBankAnswerView",
    # jobs
    "apps.jobs.views.JobActionBaseView",
    "apps.jobs.views.JobApplicationActionBaseView",
    "apps.jobs.views.JobApplicationListCreateView",
    "apps.jobs.views.JobApplicationDetailView",
    "apps.jobs.views.JobApplicationSubmitView",
    "apps.jobs.views.JobApplicationApproveView",
    "apps.jobs.views.JobApplicationRejectView",
    "apps.jobs.views.JobApplicationPauseView",
    "apps.jobs.views.JobApplicationResumeView",
    "apps.jobs.views.JobScoreView",
    "apps.jobs.views.JobWatchView",
    "apps.jobs.views.JobDismissView",
    "apps.jobs.views.JobTailorDocumentsView",
    "apps.jobs.views.DiscoveryRunCreateView",
    "apps.jobs.views.DiscoveryRunDetailView",
    # outreach
    "apps.outreach.views.OutreachContactListCreateView",
    "apps.outreach.views.OutreachContactEnrichView",
    "apps.outreach.views.OutreachCampaignListCreateView",
    "apps.outreach.views.OutreachMessageGenerateView",
    "apps.outreach.views.OutreachMessageSendView",
    # automation
    "apps.automation.views.AutomationRuleListCreateView",
    "apps.automation.views.AutomationRunListCreateView",
    "apps.automation.views.AutomationRunDetailView",
    "apps.automation.views.AutomationRunApproveView",
    "apps.automation.views.AutomationRunCancelView",
    # integrations
    "apps.integrations.views.TelegramConnectView",
    "apps.integrations.views.TelegramTestView",
    "apps.integrations.views.OpenAITestView",
    "apps.integrations.email_views.EmailThreadListView",
    "apps.integrations.email_views.EmailMessageListView",
    "apps.integrations.email_views.ZohoConnectView",
    # analytics
    "apps.analytics.views.FunnelAnalyticsView",
    "apps.analytics.views.SourceAnalyticsView",
    "apps.analytics.views.OutreachAnalyticsView",
    "apps.analytics.views.DailyDigestReportView",
    # notifications
    "apps.common.notification_views.NotificationListView",
    "apps.common.notification_views.NotificationMarkReadView",
    "apps.common.notification_views.NotificationMarkAllReadView",
    "apps.common.notification_views.NotificationMarkAllReadAliasView",
    "apps.common.notification_views.NotificationMarkReadBatchAliasView",
    "apps.common.notification_views.NotificationDeleteView",
    "apps.common.notification_views.NotificationPreferenceView",
    "apps.common.notification_views.NotificationSendView",
    "apps.common.notification_views.EmailSendView",
    "apps.common.notification_views.AdminNotificationHistoryView",
    # templates
    "apps.common.template_views.CommunicationTemplateListView",
    "apps.common.template_views.CommunicationTemplateUpdateView",
}

_PUBLIC_PERSONALIZABLE.update(
    {
        "apps.accounts.auth_views.SessionView",
    }
)

_AUTH_EXEMPT.update(
    {
        "apps.accounts.auth_views.LoginView",
        "apps.accounts.auth_views.RegisterView",
        "apps.accounts.auth_views.RefreshView",
        "apps.accounts.password_views.PasswordResetRequestView",
        "apps.accounts.password_views.PasswordResetConfirmView",
        "apps.documents.lenco_webhook_views.LencoWebhookView",
    }
)

_PROTECTED.update(
    {
        # accounts split modules
        "apps.accounts.auth_views.LogoutView",
        "apps.accounts.profile_views.ProfileView",
        "apps.accounts.admin_user_views.AdminDashboardView",
        "apps.accounts.admin_user_views.AdminUserListView",
        "apps.accounts.admin_user_views.AdminUserDetailView",
        "apps.accounts.admin_user_views.AdminUserExportView",
        "apps.accounts.admin_audit_views.AdminAuditLogView",
        "apps.accounts.admin_settings_views.AdminSettingsListView",
        "apps.accounts.admin_settings_views.AdminSettingDetailView",
        "apps.accounts.admin_settings_views.AdminSettingsImportView",
        "apps.accounts.admin_settings_views.AdminSettingsResetView",
        # applications split modules
        "apps.applications.admin_amendment_views.ApplicationAdminSummaryView",
        "apps.applications.admin_amendment_views.ApplicationAmendmentReviewView",
        "apps.applications.admin_amendment_views.ApplicationConditionVerifyView",
        "apps.applications.admin_assignment_views.ApplicationAssignView",
        "apps.applications.admin_assignment_views.ApplicationAutoAssignView",
        "apps.applications.admin_assignment_views.ApplicationFeeWaiverView",
        "apps.applications.admin_bulk_views.ApplicationBulkStatusView",
        "apps.applications.admin_export_views.ApplicationExportView",
        "apps.applications.admin_review_views.ApplicationListCreateView",
        "apps.applications.admin_review_views.ApplicationReviewView",
        "apps.applications.student_amendment_views.ApplicationAmendmentView",
        "apps.applications.student_document_views.ApplicationDocumentsView",
        "apps.applications.student_document_views.EmailSlipView",
        "apps.applications.student_draft_views.ApplicationDetailView",
        "apps.applications.student_draft_views.ApplicationDetailsView",
        "apps.applications.student_draft_views.ApplicationDraftView",
        "apps.applications.student_submission_views.ApplicationGradesView",
        "apps.applications.student_submission_views.ApplicationPreviewSummaryView",
        "apps.applications.student_submission_views.ApplicationSubmitView",
        "apps.applications.student_submission_views.ApplicationSummaryView",
        "apps.applications.student_withdrawal_views.ApplicationConditionsView",
        "apps.applications.student_withdrawal_views.ApplicationConfirmEnrollmentView",
        "apps.applications.student_withdrawal_views.ApplicationWaitlistPositionView",
        "apps.applications.student_withdrawal_views.ApplicationWithdrawView",
        # documents split modules
        "apps.documents.document_storage_views.DocumentDeleteView",
        "apps.documents.document_storage_views.DocumentDownloadView",
        "apps.documents.document_storage_views.DocumentExtractView",
        "apps.documents.document_storage_views.DocumentInfoView",
        "apps.documents.document_storage_views.DocumentSignedUrlView",
        "apps.documents.document_storage_views.DocumentUploadView",
        "apps.documents.mobile_money_views.MobileMoneyInitiateView",
        "apps.documents.payment_admin_views.SuperAdminPaymentCorrectionView",
        "apps.documents.payment_query_views.FeeResolveView",
        "apps.documents.payment_query_views.PaymentListView",
        "apps.documents.payment_query_views.PaymentReceiptView",
        "apps.documents.payment_query_views.PaymentSettlementSummaryView",
        "apps.documents.payment_query_views.PaymentVerifyView",
        "apps.documents.payment_query_views.ProgramFeeViewSet",
        "apps.documents.payment_widget_views.DeferPaymentView",
        "apps.documents.payment_widget_views.PaymentDevBypassView",
        "apps.documents.payment_widget_views.PaymentInitiateView",
        "apps.documents.risk_views.RiskFlagsListView",
    }
)

_ALL_CLASSIFIED = _PUBLIC_PERSONALIZABLE | _AUTH_EXEMPT | _PROTECTED


def _discover_all_api_views():
    """Dynamically discover all APIView subclasses in backend apps."""
    import importlib
    import inspect
    import pkgutil

    from django.apps import apps as django_apps
    from rest_framework.views import APIView

    found = set()
    # Scan every installed app that starts with "apps."
    for app_config in django_apps.get_app_configs():
        if not app_config.name.startswith("apps."):
            continue
        app_module = app_config.module
        app_path = getattr(app_module, "__path__", None)
        if not app_path:
            continue
        for _importer, mod_name, _ispkg in pkgutil.iter_modules(app_path):
            # Only scan modules likely to contain views
            if "view" not in mod_name and mod_name not in ("health",):
                continue
            full_module = f"{app_config.name}.{mod_name}"
            try:
                module = importlib.import_module(full_module)
            except Exception:
                continue
            for name, obj in inspect.getmembers(module, inspect.isclass):
                if (
                    issubclass(obj, APIView)
                    and obj is not APIView
                    and obj.__module__ == full_module
                ):
                    found.add(f"{full_module}.{name}")
    return found


def test_all_api_views_are_classified():
    """Every APIView subclass in backend apps must appear in one of the
    classification lists. New unclassified views will cause this test to fail."""
    all_views = _discover_all_api_views()
    unclassified = all_views - _ALL_CLASSIFIED
    assert not unclassified, (
        f"Found {len(unclassified)} APIView subclass(es) not in any classification list. "
        f"Add them to the appropriate parametrize list in this file:\n"
        + "\n".join(f"  - {v}" for v in sorted(unclassified))
    )
