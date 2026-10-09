"""Explicit classifications for unauthenticated API endpoints.

Any view that uses ``AllowAny`` must be listed here so public exposure is a
deliberate decision instead of an accidental permission regression.
"""

PUBLIC_ENDPOINT_CLASSIFICATIONS = {
    # health/meta/catalog public read
    #
    # The seven catalog entries are pinned under BOTH the canonical split module
    # (where the class is defined) and the ``apps.catalog.views`` re-export shim
    # (where callers still import it). That is this register's own existing
    # precedent — ``apps.accounts.auth_views.LoginView`` and
    # ``apps.accounts.views.LoginView`` are both below, as are the two
    # ``LencoWebhookView`` paths — and it is the same convention
    # ``tests/unit/test_view_auth_classification.py`` follows.
    #
    # The canonical keys were ADDED by admissions-v2 task 12.2. Task 12.1 split
    # ``apps/catalog/views.py`` into resource-scoped modules, and
    # ``test_every_allow_any_view_has_public_endpoint_classification`` derives its
    # keys by AST-scanning ``apps/**/*.py`` for the class DEFINITION — so all
    # seven ``AllowAny`` catalog views fell out of this register the moment they
    # changed defining module, and this gate has been failing since. It is the
    # SECOND ``__module__``-keyed gate that split broke; 12.1 §19 found and fixed
    # the first (``test_view_auth_classification.py``) and its §23 #2 wrote the
    # lesson, but the lesson was drawn from one instance and this one was outside
    # the suite selection that pass ran. It matters more than the first: this is
    # the register that makes unauthenticated exposure a deliberate decision, so
    # while it was stale a NEW ``AllowAny`` catalog view could have been added
    # without the gate noticing.
    "apps.catalog.context_views.CatalogContextView": "health_meta_catalog_public_read",
    "apps.catalog.program_views.CanonicalProgramListView": "health_meta_catalog_public_read",
    "apps.catalog.program_views.AssignmentPreviewView": "health_meta_catalog_public_read",
    "apps.catalog.program_views.ProgramListCreateView": "health_meta_catalog_public_read",
    "apps.catalog.intake_views.IntakeListCreateView": "health_meta_catalog_public_read",
    "apps.catalog.subject_views.SubjectListView": "health_meta_catalog_public_read",
    "apps.catalog.institution_views.InstitutionListCreateView": "health_meta_catalog_public_read",
    # V2's representative catalogue list is the same deliberate public-read
    # surface as the canonical V1 catalogue endpoints.
    "apps.common.v2.demo_views.V2ProgramListView": "health_meta_catalog_public_read",
    # …and the shim paths, kept alongside (see the note above).
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
    # The V2 session probe may answer an anonymous caller, matching the V1
    # SessionView classification.
    "apps.common.v2.demo_views.V2SessionView": "auth_password_public_flow",
    # Public invitee handoff: the not-yet-authenticated invitee sets their own
    # password by consuming the emailed single-use token (task 4.2, R4.3).
    "apps.catalog.staff_invitation_views.StaffInvitationAcceptView": "auth_password_public_flow",
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
