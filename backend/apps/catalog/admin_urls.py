"""Admin tenant URL routing for Beanola multi-school onboarding."""

from django.urls import path

from apps.catalog.admin_views import (
    AdminAccessGrantDetailView,
    AdminAccessGrantListCreateView,
    AdminInstitutionAuditView,
    AdminMembershipDetailView,
    AdminMembershipListCreateView,
    AdminRoutingSimulateView,
    AdminTenantAssetDetailView,
    AdminTenantAssetListCreateView,
    AdminTenantAssetUploadView,
    AdminTenantAuditView,
    AdminTenantDetailView,
    AdminTenantDomainDetailView,
    AdminTenantDomainListCreateView,
    AdminTenantListCreateView,
    AdminTenantRequiredDocumentDetailView,
    AdminTenantRequiredDocumentListCreateView,
    AdminTenantTemplateDetailView,
    AdminTenantTemplateListCreateView,
)

urlpatterns = [
    path("institutions/", AdminTenantListCreateView.as_view(), name="admin-tenant-institution-list"),
    path("institutions/<uuid:institution_id>/", AdminTenantDetailView.as_view(), name="admin-tenant-institution-detail"),
    path("institutions/<uuid:institution_id>/audit/", AdminInstitutionAuditView.as_view(), name="admin-tenant-institution-audit"),
    path("institutions/<uuid:institution_id>/domains/", AdminTenantDomainListCreateView.as_view(), name="admin-tenant-domains"),
    path("institutions/<uuid:institution_id>/domains/<uuid:item_id>/", AdminTenantDomainDetailView.as_view(), name="admin-tenant-domain-detail"),
    path("institutions/<uuid:institution_id>/assets/", AdminTenantAssetListCreateView.as_view(), name="admin-tenant-assets"),
    path("institutions/<uuid:institution_id>/assets/upload/", AdminTenantAssetUploadView.as_view(), name="admin-tenant-asset-upload"),
    path("institutions/<uuid:institution_id>/assets/<uuid:item_id>/", AdminTenantAssetDetailView.as_view(), name="admin-tenant-asset-detail"),
    path("institutions/<uuid:institution_id>/templates/", AdminTenantTemplateListCreateView.as_view(), name="admin-tenant-templates"),
    path("institutions/<uuid:institution_id>/templates/<uuid:item_id>/", AdminTenantTemplateDetailView.as_view(), name="admin-tenant-template-detail"),
    path(
        "institutions/<uuid:institution_id>/required-documents/",
        AdminTenantRequiredDocumentListCreateView.as_view(),
        name="admin-tenant-required-documents",
    ),
    path(
        "institutions/<uuid:institution_id>/required-documents/<uuid:item_id>/",
        AdminTenantRequiredDocumentDetailView.as_view(),
        name="admin-tenant-required-document-detail",
    ),
    path("memberships/", AdminMembershipListCreateView.as_view(), name="admin-tenant-memberships"),
    path("memberships/<uuid:membership_id>/", AdminMembershipDetailView.as_view(), name="admin-tenant-membership-detail"),
    path("access-grants/", AdminAccessGrantListCreateView.as_view(), name="admin-tenant-access-grants"),
    path("access-grants/<uuid:grant_id>/", AdminAccessGrantDetailView.as_view(), name="admin-tenant-access-grant-detail"),
    path("routing/simulate/", AdminRoutingSimulateView.as_view(), name="admin-routing-simulate"),
    path("tenant-audit/", AdminTenantAuditView.as_view(), name="admin-tenant-audit"),
]
