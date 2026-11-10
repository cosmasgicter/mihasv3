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
        ("apps.applications.public_views.ApplicationTrackView", "ApplicationTrackView"),
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
        ("apps.applications.admin_review_views.ApplicationListCreateView", "ApplicationListCreateView"),
        ("apps.applications.student_draft_views.ApplicationDetailView", "ApplicationDetailView"),
        ("apps.applications.student_submission_views.ApplicationSubmitView", "ApplicationSubmitView"),
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
    # The catalog views were split by admissions-v2 task 12.1 (MAINT-01) and
    # ``apps.catalog.views`` is now a re-export shim. ``_discover_all_api_views``
    # keys on ``obj.__module__``, so a class is only ever found under the module
    # that *defines* it — the canonical module has to be pinned as well as the
    # shim, exactly as task 9.3 did for the user directory and as the
    # ``apps.applications`` split already is below.
    "apps.catalog.context_views.CatalogContextView",
    "apps.catalog.program_views.CanonicalProgramListView",
    "apps.catalog.program_views.AssignmentPreviewView",
    "apps.catalog.program_views.ProgramListCreateView",
    "apps.catalog.intake_views.IntakeListCreateView",
    "apps.catalog.subject_views.SubjectListView",
    "apps.catalog.institution_views.InstitutionListCreateView",
    "apps.applications.public_views.ApplicationTrackView",
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
    # Public invitee handoff guarded by a single-use emailed token (task 4.2).
    "apps.catalog.staff_invitation_views.StaffInvitationAcceptView",
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
    "apps.applications.admin_review_views.ApplicationListCreateView",
    "apps.applications.student_draft_views.ApplicationDetailView",
    "apps.applications.student_submission_views.ApplicationSubmitView",
    # applications — student
    "apps.applications.student_views.ApplicationDetailView",
    "apps.applications.student_views.ApplicationDetailsView",
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
    # ``EmailSlipView`` removed by admissions-v2 task 10.6 (R13.5, API-04).
    "apps.applications.student_draft_views.ApplicationDraftListView",
    "apps.applications.student_draft_views.ApplicationDraftDetailView",
    "apps.applications.student_draft_views.ApplicationDraftRenameView",
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
    "apps.applications.official_document_views.OfficialDocumentListView",
    "apps.applications.official_document_views.OfficialDocumentDetailView",
    # Task 10.4 (R13.5): the one canonical official-document email route. Same
    # authority as the detail read it reuses — `IsAuthenticated` plus the shared
    # owner/scope path with 404 masking — so it belongs in exactly this bucket.
    "apps.applications.official_document_views.OfficialDocumentEmailView",
    "apps.applications.interview_views.ApplicationInterviewView",
    "apps.applications.interview_views.ApplicationInterviewListView",
    "apps.applications.history_views.TimelineHistoryView",
    # applications — canonical admin-query and student V2/split surfaces
    "apps.applications.admin_query_views.AdminApplicationQueryView",
    "apps.applications.admin_query_views.AdminApplicationSavedFilterDetailView",
    "apps.applications.admin_query_views.AdminApplicationSavedFilterListView",
    "apps.applications.readiness_v2_views.V2ApplicationReadinessView",
    "apps.applications.student_document_views.ApplicationRequiredDocumentsView",
    "apps.applications.student_draft_views.ApplicationDraftChangeSelectionView",
    # catalog detail views — shim path plus the canonical split module (task 12.1)
    "apps.catalog.views.ProgramDetailView",
    "apps.catalog.views.IntakeDetailView",
    "apps.catalog.views.InstitutionDetailView",
    "apps.catalog.program_views.ProgramDetailView",
    "apps.catalog.intake_views.IntakeDetailView",
    "apps.catalog.institution_views.InstitutionDetailView",
    # catalog tenant admin
    "apps.catalog.admin_views.AdminAccessGrantDetailView",
    "apps.catalog.admin_views.AdminAccessGrantListCreateView",
    "apps.catalog.admin_views.AdminInstitutionAuditView",
    "apps.catalog.admin_views.AdminMembershipDetailView",
    "apps.catalog.admin_views.AdminMembershipListCreateView",
    "apps.catalog.admin_program_intake_views.AdminProgramIntakeCreateView",
    "apps.catalog.admin_views.AdminRoutingSimulateView",
    "apps.catalog.admin_views.AdminTenantAssetDetailView",
    "apps.catalog.admin_views.AdminTenantAssetListCreateView",
    "apps.catalog.admin_views.AdminTenantAssetUploadView",
    "apps.catalog.admin_views.AdminTenantAuditView",
    "apps.catalog.admin_views.AdminTenantDetailView",
    "apps.catalog.admin_views.AdminTenantDomainActivateView",
    "apps.catalog.admin_views.AdminTenantDomainDetailView",
    "apps.catalog.admin_views.AdminTenantDomainListCreateView",
    "apps.catalog.admin_views.AdminTenantListCreateView",
    "apps.catalog.admin_views.AdminTenantProgramDetailView",
    "apps.catalog.admin_views.AdminTenantProgramListView",
    "apps.catalog.admin_views.AdminTenantReadinessView",
    "apps.catalog.admin_views.AdminTenantRequiredDocumentDetailView",
    "apps.catalog.admin_views.AdminTenantRequiredDocumentListCreateView",
    "apps.catalog.admin_views.AdminTenantTemplateDetailView",
    "apps.catalog.admin_views.AdminTenantTemplateListCreateView",
    "apps.catalog.admin_views.AdminTenantProfileListCreateView",
    "apps.catalog.admin_views.AdminTenantProfileDetailView",
    "apps.catalog.admin_views.AdminTenantProfileCloneView",
    "apps.catalog.admin_views._InstitutionChildDetailView",
    "apps.catalog.admin_views._InstitutionChildListCreateView",
    # catalog tenant admin — the canonical split modules (admissions-v2 task
    # 12.1, MAINT-01). ``apps.catalog.admin_views`` is a re-export shim now, and
    # discovery keys on the *defining* module, so these are the entries that
    # actually classify the live views; the shim paths above stay pinned for the
    # same reason task 9.3 kept both.
    "apps.catalog.admin_tenant_views.AdminTenantListCreateView",
    "apps.catalog.admin_tenant_views.AdminTenantDetailView",
    "apps.catalog.admin_tenant_views.AdminTenantReadinessView",
    "apps.catalog.admin_tenant_views.AdminTenantProgramListView",
    "apps.catalog.admin_tenant_views.AdminTenantProgramDetailView",
    "apps.catalog.admin_domain_views.AdminTenantDomainListCreateView",
    "apps.catalog.admin_domain_views.AdminTenantDomainDetailView",
    "apps.catalog.admin_domain_views.AdminTenantDomainActivateView",
    # Task 4.4 lifecycle commands: routed platform-domain operations with the
    # inherited JWT authentication strategy.
    "apps.catalog.admin_domain_views.AdminTenantDomainApproveView",
    "apps.catalog.admin_domain_views.AdminTenantDomainReactivateView",
    "apps.catalog.admin_domain_views.AdminTenantDomainRejectView",
    "apps.catalog.admin_domain_views.AdminTenantDomainRetryView",
    # Platform intake administration.
    "apps.catalog.admin_intake_views.AdminIntakeDetailView",
    "apps.catalog.admin_intake_views.AdminIntakeListCreateView",
    "apps.catalog.admin_asset_views.AdminTenantAssetListCreateView",
    "apps.catalog.admin_asset_views.AdminTenantAssetUploadView",
    "apps.catalog.admin_asset_views.AdminTenantAssetDetailView",
    "apps.catalog.admin_document_config_views.AdminTenantTemplateListCreateView",
    "apps.catalog.admin_document_config_views.AdminTenantTemplateDetailView",
    "apps.catalog.admin_document_config_views.AdminTenantProfileListCreateView",
    "apps.catalog.admin_document_config_views.AdminTenantProfileDetailView",
    "apps.catalog.admin_document_config_views.AdminTenantProfileCloneView",
    "apps.catalog.admin_document_config_views.AdminTenantRequiredDocumentListCreateView",
    "apps.catalog.admin_document_config_views.AdminTenantRequiredDocumentDetailView",
    "apps.catalog.admin_access_views.AdminMembershipListCreateView",
    "apps.catalog.admin_access_views.AdminMembershipDetailView",
    "apps.catalog.admin_access_views.AdminAccessGrantListCreateView",
    "apps.catalog.admin_access_views.AdminAccessGrantDetailView",
    "apps.catalog.admin_routing_views.AdminRoutingSimulateView",
    "apps.catalog.admin_audit_views.AdminTenantAuditView",
    "apps.catalog.admin_audit_views.AdminInstitutionAuditView",
    "apps.catalog._admin_view_helpers._InstitutionChildDetailView",
    "apps.catalog._admin_view_helpers._InstitutionChildListCreateView",
    # V2 tenant change-request workflow.
    "apps.catalog.change_request_v2_views.V2TenantChangeRequestApproveView",
    "apps.catalog.change_request_v2_views.V2TenantChangeRequestCancelView",
    "apps.catalog.change_request_v2_views.V2TenantChangeRequestDetailView",
    "apps.catalog.change_request_v2_views.V2TenantChangeRequestListCreateView",
    "apps.catalog.change_request_v2_views.V2TenantChangeRequestRejectView",
    "apps.catalog.change_request_v2_views.V2TenantChangeRequestSubmitView",
    # V2 tenant onboarding workflow. The shared command base is deliberately in
    # `_ABSTRACT_UNROUTED`, not misclassified as a mounted protected endpoint.
    "apps.catalog.onboarding_v2_views.V2TenantOnboardingActivateView",
    "apps.catalog.onboarding_v2_views.V2TenantOnboardingBlockersView",
    "apps.catalog.onboarding_v2_views.V2TenantOnboardingCancelView",
    "apps.catalog.onboarding_v2_views.V2TenantOnboardingDetailView",
    "apps.catalog.onboarding_v2_views.V2TenantOnboardingListCreateView",
    "apps.catalog.onboarding_v2_views.V2TenantOnboardingRejectView",
    "apps.catalog.onboarding_v2_views.V2TenantOnboardingResumeView",
    "apps.catalog.onboarding_v2_views.V2TenantOnboardingStepView",
    "apps.catalog.onboarding_v2_views.V2TenantOnboardingSubmitView",
    "apps.catalog.onboarding_v2_views.V2TenantOnboardingSuspendView",
    # Tenant staff invitation administration. The public accept handoff is in
    # `_AUTH_EXEMPT`; its shared command base is `_ABSTRACT_UNROUTED`.
    "apps.catalog.staff_invitation_views.AdminStaffCandidateSearchView",
    "apps.catalog.staff_invitation_views.AdminStaffInvitationListCreateView",
    "apps.catalog.staff_invitation_views.AdminStaffInvitationResendView",
    "apps.catalog.staff_invitation_views.AdminStaffInvitationRevokeView",
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
    "apps.documents.fee_admin_views.AdminFeeListView",
    "apps.documents.ocr_opt_in_views.OcrOptInView",
    "apps.documents.fee_quote_views.FeeQuoteView",
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
    # Task 10.1 (R13.4): owner-scoped redelivery. Authority is ownership — the
    # notification is fetched from the caller's own rows — so an id that is not
    # theirs is the same 404 as an unknown one.
    "apps.common.notification_views.CommunicationRetryView",
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
        "apps.accounts.admin_user_views.AdminScopeView",
        "apps.accounts.admin_user_views.AdminCapabilitiesView",
        "apps.accounts.admin_user_views.AdminUserListView",
        "apps.accounts.admin_user_views.AdminUserDetailView",
        "apps.accounts.admin_user_views.AdminUserEffectiveCapabilitiesView",
        "apps.accounts.admin_user_views.AdminUserExportView",
        # The user directory, rebuilt by admissions-v2 task 9.3 (R6.1-R6.5).
        # ``admin_user_views`` re-exports these, so the canonical module is
        # pinned as well as the shim.
        "apps.accounts.user_directory_views.AdminUserListView",
        "apps.accounts.user_directory_views.AdminUserDetailView",
        "apps.accounts.user_directory_views.AdminUserExportView",
        "apps.accounts.user_directory_views.AdminUserBulkView",
        "apps.accounts.user_directory_views.AdminUserBatchImportView",
        "apps.accounts.user_directory_views.AdminUserImportPreviewView",
        "apps.accounts.admin_audit_views.AdminAuditLogView",
        "apps.accounts.admin_settings_views.AdminSettingsListView",
        "apps.accounts.admin_settings_views.AdminSettingDetailView",
        "apps.accounts.admin_settings_views.AdminSettingsImportView",
        "apps.accounts.admin_settings_views.AdminSettingsResetView",
        # applications split modules
        # ``ApplicationAdminSummaryView`` is intentionally absent: task 7.4 deleted
        # the generative admin review summary (R11.1) and admissions-v2 task 9.4
        # removed its last caller. Its replacement is the deterministic
        # ``readiness`` section of ``AdminApplicationReviewWorkspaceView``, below.
        "apps.applications.admin_review_workspace_views.AdminApplicationReviewWorkspaceView",
        "apps.applications.admin_amendment_views.ApplicationAmendmentReviewView",
        "apps.applications.admin_amendment_views.ApplicationConditionVerifyView",
        "apps.applications.admin_assignment_views.ApplicationAssignView",
        "apps.applications.admin_assignment_views.ApplicationAutoAssignView",
        "apps.applications.admin_assignment_views.ApplicationFeeWaiverView",
        "apps.applications.admin_assignment_views.AssignmentCandidatesView",
        "apps.applications.admin_bulk_views.ApplicationBulkStatusView",
        "apps.applications.admin_export_views.ApplicationExportView",
        "apps.applications.admin_review_views.ApplicationListCreateView",
        "apps.applications.admin_review_views.ApplicationReviewView",
        "apps.applications.student_amendment_views.ApplicationAmendmentView",
        # admissions-v2 task 10.2 (R13.9-R13.10, STU-16 / STU-17)
        "apps.applications.student_amendment_views.ApplicationAmendmentDetailView",
        "apps.applications.condition_views.ApplicationConditionDetailView",
        "apps.applications.condition_views.ApplicationConditionEvidenceView",
        "apps.applications.condition_views.ApplicationConditionReviewView",
        "apps.applications.student_document_views.ApplicationDocumentsView",
        # ``EmailSlipView`` removed by admissions-v2 task 10.6 (R13.5, API-04).
        "apps.applications.student_draft_views.ApplicationDetailView",
        "apps.applications.student_draft_views.ApplicationDetailsView",
        "apps.applications.student_submission_views.ApplicationGradesView",
        "apps.applications.student_submission_views.ApplicationPreviewSummaryView",
        "apps.applications.student_submission_views.ApplicationSubmitView",
        "apps.applications.student_submission_views.ApplicationSummaryView",
        # admissions-v2 task 10.5 (R13.12, STU-22): the owner issues their own
        # public tracking link. Owner-only with the shared 404 mask — the same
        # bucket as withdraw, and deliberately NOT staff-accessible, because
        # issuing revokes the applicant's live link.
        "apps.applications.student_tracking_views.ApplicationTrackingLinkView",
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

# These classes are intentionally discoverable as APIView subclasses because
# concrete routed views inherit their implementation. They are not endpoints and
# must not be presented as protected routes merely to satisfy the registry gate.
_ABSTRACT_UNROUTED = {
    "apps.accounts.user_directory_views._ImportBase",
    "apps.catalog.onboarding_v2_views._OnboardingCommandView",
    "apps.catalog.staff_invitation_views._StaffInvitationCommandView",
}

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
    unclassified = all_views - _ALL_CLASSIFIED - _ABSTRACT_UNROUTED
    assert not unclassified, (
        f"Found {len(unclassified)} APIView subclass(es) not in any classification list. "
        f"Add them to the appropriate parametrize list in this file:\n"
        + "\n".join(f"  - {v}" for v in sorted(unclassified))
    )


def test_abstract_unrouted_exclusions_are_discovered_but_not_mounted():
    """Every exclusion is a real implementation base and remains off the URL tree."""
    from django.urls import get_resolver
    from rest_framework.views import APIView

    discovered = _discover_all_api_views()
    assert _ABSTRACT_UNROUTED <= discovered
    assert _ABSTRACT_UNROUTED.isdisjoint(_ALL_CLASSIFIED)

    routed: set[str] = set()

    def walk(patterns):
        for pattern in patterns:
            nested = getattr(pattern, "url_patterns", None)
            if nested is not None:
                walk(nested)
                continue
            callback = getattr(pattern, "callback", None)
            view_class = getattr(callback, "view_class", None) or getattr(
                callback, "cls", None
            )
            if isinstance(view_class, type) and issubclass(view_class, APIView):
                routed.add(f"{view_class.__module__}.{view_class.__name__}")

    walk(get_resolver().url_patterns)
    assert _ABSTRACT_UNROUTED.isdisjoint(routed), (
        "An APIView base excluded as abstract/unrouted is now mounted; classify "
        f"the concrete endpoint instead: {sorted(_ABSTRACT_UNROUTED & routed)}"
    )
