"""Explicit classifications for unauthenticated API endpoints.

Any view that uses ``AllowAny`` must be listed here so public exposure is a
deliberate decision instead of an accidental permission regression.
"""

PUBLIC_ENDPOINT_CLASSIFICATIONS = {
    # health/meta/catalog public read
    "apps.catalog.views.CatalogContextView": "health_meta_catalog_public_read",
    "apps.catalog.views.CanonicalProgramListView": "health_meta_catalog_public_read",
    "apps.catalog.views.AssignmentPreviewView": "health_meta_catalog_public_read",
    "apps.catalog.views.ProgramListCreateView": "health_meta_catalog_public_read",
    "apps.catalog.views.IntakeListCreateView": "health_meta_catalog_public_read",
    "apps.catalog.views.SubjectListView": "health_meta_catalog_public_read",
    "apps.catalog.views.InstitutionListCreateView": "health_meta_catalog_public_read",
    "apps.common.health.LivenessView": "health_meta_catalog_public_read",
    "apps.common.health.ReadinessView": "health_meta_catalog_public_read",
    "apps.common.health.RedisHealthView": "health_meta_catalog_public_read",
    "apps.common.meta_views.PlatformMetaView": "health_meta_catalog_public_read",
    "apps.jobs.views.JobListView": "health_meta_catalog_public_read",
    "apps.jobs.views.JobDetailView": "health_meta_catalog_public_read",
    # auth/password public flow
    "apps.accounts.auth_views.LoginView": "auth_password_public_flow",
    "apps.accounts.auth_views.RefreshView": "auth_password_public_flow",
    "apps.accounts.auth_views.RegisterView": "auth_password_public_flow",
    "apps.accounts.auth_views.SessionView": "auth_password_public_flow",
    "apps.accounts.password_views.PasswordResetRequestView": "auth_password_public_flow",
    "apps.accounts.password_views.PasswordResetConfirmView": "auth_password_public_flow",
    "apps.accounts.views.LoginView": "auth_password_public_flow",
    "apps.accounts.views.RefreshView": "auth_password_public_flow",
    "apps.accounts.views.RegisterView": "auth_password_public_flow",
    "apps.accounts.views.SessionView": "auth_password_public_flow",
    "apps.accounts.views.PasswordResetRequestView": "auth_password_public_flow",
    "apps.accounts.views.PasswordResetConfirmView": "auth_password_public_flow",
    # signed webhook
    "apps.documents.lenco_webhook_views.LencoWebhookView": "signed_webhook",
    "apps.documents.views.LencoWebhookView": "signed_webhook",
    "apps.integrations.views.TelegramWebhookView": "signed_webhook",
    "apps.integrations.email_views.EmailDeliveryWebhookView": "signed_webhook",
    # public tracking with minimized data
    "apps.applications.public_views.ApplicationTrackView": "public_tracking_minimized",
    # error reporting with payload caps and throttling
    "apps.common.error_views.ErrorReportView": "error_reporting_capped_throttled",
}

PUBLIC_ENDPOINT_CATEGORIES = frozenset(PUBLIC_ENDPOINT_CLASSIFICATIONS.values())
