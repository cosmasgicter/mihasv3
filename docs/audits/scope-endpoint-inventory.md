# Scope Endpoint Inventory — Beanola Admissions

> **Spec:** `.kiro/specs/beanola-production-readiness/` — Task 11.1, Component 5.
> **Validates:** Requirements **5.1** (every endpoint classified, no unknown-scope
> rows), **5.2** (staff-scoped tenant reads/mutations route through
> `AccessScopeService`), **5.8** (object-level checks use canonical IDs, never
> `Legacy_String_Fields`).
>
> **Verification basis:** every row below was verified against the repo URL
> configs (`backend/config/urls.py` + each app `urls.py`) and the view bodies on
> the date of this audit. The scope authority is
> `backend/apps/catalog/services.py:AccessScopeService` (`filters_for_user`,
> `filter_applications`, `filter_payments`, `filter_documents`).

## Classification model

Every admissions endpoint is exactly one of:

| Class | Meaning | Scope rule |
|-------|---------|-----------|
| **public-anonymous** | Reachable without authentication (`AllowAny`) | No tenant records, or deliberately minimized public projection. |
| **student-owned** | Authenticated; the caller may act only on their own application/profile/notifications | Owner check by `user_id` (canonical FK), never legacy strings. |
| **staff-scoped** | Admin/reviewer School_Staff bounded by membership + grant | Queryset **must** funnel through `AccessScopeService`; super-admin sees all. |
| **super-admin-only** | Global actor only (`IsSuperAdmin`) | Platform-wide; no per-tenant filter needed. |

`AccessScopeService.filters_for_user` returns `all_access=True` for a super-admin
and an institution/offering/application ID set otherwise. Staff-scoped views call
one of:

- `filter_applications(qs, user)` / `filter_payments(qs, user)` /
  `filter_documents(qs, user)` — queryset narrowing; or
- the shared scoped loaders `_get_authorized_application` /
  `_get_scoped_application` / `_get_authorized_document`; or
- the catalog-admin helper `_scope_institution_ids(user)` for tenant-config child
  resources.

All scope joins use **canonical IDs** (`application.institution_ref_id`,
`application.program_offering_id`, `application.pk`, `AccessGrant.program_id`,
`UserInstitutionMembership.institution_id`). No view authorizes on
`applications.institution` / `applications.program` / `applications.intake`
(the `Legacy_String_Fields`, which are immutable display snapshots only). **R5.8
holds across every staff-scoped row.**

---

## 1. Auth & profile — `/api/v1/auth/`

| Method | Path | View | Class | Scope mechanism |
|--------|------|------|-------|-----------------|
| POST | `auth/login/` | `LoginView` | public-anonymous | `AllowAny`; rate-limited. |
| POST | `auth/logout/` | `LogoutView` | student-owned | Acts on caller's own session. |
| POST | `auth/refresh/` | `RefreshView` | public-anonymous | Cookie-based token refresh. |
| POST | `auth/register/` | `RegisterView` | public-anonymous | `AllowAny`; rate-limited. |
| GET | `auth/session/` | `SessionView` | student-owned | Returns caller's own session/user. |
| POST | `auth/password-reset/` | `PasswordResetRequestView` | public-anonymous | `AllowAny`; rate-limited. |
| POST | `auth/password-reset/confirm/` | `PasswordResetConfirmView` | public-anonymous | Token-bound, single-use. |
| GET/PATCH | `auth/profile/` | `ProfileView` | student-owned | Reads/writes `request.user` only. |

## 2. Sessions — `/api/v1/sessions/`

| Method | Path | View | Class | Scope mechanism |
|--------|------|------|-------|-----------------|
| GET | `sessions/` | `SessionListView` | student-owned | Filters by `user_id == request.user`. |
| POST | `sessions/{id}/revoke/` | `SessionRevokeView` | student-owned | Caller's own session only. |
| POST | `sessions/revoke-all/` | `SessionRevokeAllView` | student-owned | Caller's own sessions. |

## 3. Applications — `/api/v1/applications/`

| Method | Path | View | Class | Scope mechanism |
|--------|------|------|-------|-----------------|
| GET/POST | `applications/` | `ApplicationListCreateView` | student-owned (GET self) / **staff-scoped** | Admin path → `AccessScopeService().filter_applications`; student path → `user_id` filter. ✅ |
| GET | `applications/export/` | `ApplicationExportView` | **staff-scoped** | `filter_applications` for non-super-admin; PII redaction for non-super-admin. ✅ |
| GET | `applications/track/` | `ApplicationTrackView` | public-anonymous | `AllowAny`; minimized public projection (`public_tracking_minimized`). |
| POST | `applications/bulk-status/` | `ApplicationBulkStatusView` | **staff-scoped** | ⚠️ **GAP-1** — batch loads `Application.objects.filter(id__in=app_ids)` with no `AccessScopeService` narrowing. |
| GET/POST | `applications/draft/` | `ApplicationDraftView` | student-owned | Caller's own draft. |
| GET | `applications/interviews/` | `ApplicationInterviewListView` | student-owned / **staff-scoped** | `mine=true` or non-admin → `user_id` filter; admin path → ⚠️ **GAP-2** (no `AccessScopeService` narrowing for staff). |
| GET | `applications/history/` | `TimelineHistoryView` | student-owned / **staff-scoped** | Self by `user_id`; admin may pass `?user_id=` → ⚠️ **GAP-3** (no `AccessScopeService` narrowing). |
| GET/PATCH/DELETE | `applications/{id}/` | `ApplicationDetailView` | student-owned / **staff-scoped** | Owner via `IsOwnerOrAdmin`; admin masked via `filter_applications().exists()`. ✅ |
| GET/PATCH/DELETE | `applications/{id}/details/` | `ApplicationDetailsView` | student-owned / **staff-scoped** | Subclass of `ApplicationDetailView`. ✅ |
| GET | `applications/{id}/documents/` | `ApplicationDocumentsView` | student-owned / **staff-scoped** | Admin masked via `filter_applications().exists()`. ✅ |
| GET/POST | `applications/{id}/grades/` | `ApplicationGradesView` | student-owned / staff | `IsOwnerOrAdmin`. ⚠️ **GAP-4** (admin object check via role only, no scope narrowing). |
| GET | `applications/{id}/summary/` | `ApplicationSummaryView` | student-owned / staff | `IsOwnerOrAdmin`. ⚠️ **GAP-4** (same pattern). |
| POST | `applications/{id}/submit/` | `ApplicationSubmitView` | student-owned | Owner submission gate. |
| GET | `applications/{id}/preview-summary/` | `ApplicationPreviewSummaryView` | student-owned | Owner preview (AI). |
| GET | `applications/{id}/admin-summary/` | `ApplicationAdminSummaryView` | **staff-scoped** | `IsAdmin`; ⚠️ **GAP-5** (loads application by id with no scope narrowing — confirmed). |
| POST/PATCH | `applications/{id}/review/` | `ApplicationReviewView` | **staff-scoped** | `filter_applications` for non-super-admin. ✅ |
| GET/POST/PATCH/PUT/DELETE | `applications/{id}/interviews/` | `ApplicationInterviewView` | student-owned / **staff-scoped** | GET via `IsOwnerOrAdmin`; write via `IsAdmin`. ⚠️ **GAP-6** (admin object access by role only, no `AccessScopeService`). |
| POST | `applications/{id}/verify-document/` | `ApplicationVerifyDocumentView` | **staff-scoped** | `_get_scoped_application` → `filter_applications`. ✅ |
| GET | `applications/{id}/application-slip/` | `ApplicationSlipView` | student-owned / staff | Legacy client-slip generator path (see R6 audit; document-flow guard governs). |
| GET | `applications/{id}/acceptance-letter/` | `AcceptanceLetterView` | student-owned / staff | Same as above. |
| GET | `applications/{id}/conditional-offer/` | `ConditionalOfferView` | student-owned / staff | Same as above. |
| GET | `applications/{id}/finance-receipt/` | `FinanceReceiptView` | student-owned / staff | Same as above. |
| GET | `applications/{id}/payment-receipt/` | `PaymentReceiptView` (apps) | student-owned / staff | Same as above. |
| GET | `applications/{id}/official-documents/` | `OfficialDocumentListView` | student-owned / **staff-scoped** | `_get_authorized_application` → `filter_applications` + 404 mask. ✅ |
| GET | `applications/{id}/official-documents/{type}/` | `OfficialDocumentDetailView` | student-owned / **staff-scoped** | `_get_authorized_application` → `filter_applications` + 404 mask. ✅ |
| POST | `applications/{id}/email-slip/` | `EmailSlipView` | student-owned / **staff-scoped** | Staff path → `filter_applications`. ✅ |
| POST | `applications/{id}/withdraw/` | `ApplicationWithdrawView` | student-owned | Owner withdrawal. |
| GET | `applications/{id}/waitlist-position/` | `ApplicationWaitlistPositionView` | student-owned / staff | Owner-or-admin role check. ⚠️ **GAP-7** (admin path not narrowed via `AccessScopeService`). |
| GET | `applications/{id}/conditions/` | `ApplicationConditionsView` | student-owned / staff | Owner-or-admin role check. ⚠️ **GAP-7** (same pattern). |
| POST | `applications/{id}/conditions/{cid}/verify/` | `ApplicationConditionVerifyView` | **staff-scoped** | `IsAdmin`; ⚠️ **GAP-8** (loads application/condition by id without scope narrowing). |
| POST | `applications/{id}/confirm-enrollment/` | `ApplicationConfirmEnrollmentView` | student-owned | Owner enrollment confirmation. |
| POST | `applications/{id}/assign/` | `ApplicationAssignView` | **super-admin-only** | `IsSuperAdmin`. ✅ |
| POST | `applications/auto-assign/` | `ApplicationAutoAssignView` | **super-admin-only** | `IsSuperAdmin`. ✅ |
| POST | `applications/{id}/fee-waiver/` | `ApplicationFeeWaiverView` | **super-admin-only** | `IsSuperAdmin`. ✅ |
| POST | `applications/{id}/amendments/` | `ApplicationAmendmentView` | student-owned | Owner amendment request. |
| POST | `applications/{id}/amendments/{aid}/review/` | `ApplicationAmendmentReviewView` | **staff-scoped** | `IsAdmin`; ⚠️ **GAP-8** (loads application by id without scope narrowing). |

## 4. Catalog — `/api/v1/catalog/`

| Method | Path | View | Class | Scope mechanism |
|--------|------|------|-------|-----------------|
| GET | `catalog/context/` | `CatalogContextView` | public-anonymous | Host-based brand resolution. |
| GET | `catalog/canonical-programs/` | `CanonicalProgramListView` | public-anonymous | Shared program-first choices. |
| GET | `catalog/assignment-preview/` | `AssignmentPreviewView` | public-anonymous | Read-only routing preview, no records. |
| GET / POST | `catalog/programs/` | `ProgramListCreateView` | public-anonymous (GET) / super-admin-write* | GET `AllowAny`; POST `IsAdmin`. Catalog config, not tenant applicant data. |
| GET/PATCH/DELETE | `catalog/programs/{id}/` | `ProgramDetailView` | staff-config (`IsAdmin`) | Catalog config object, not applicant data. |
| GET / POST | `catalog/intakes/` | `IntakeListCreateView` | public-anonymous (GET) / staff-write | GET `AllowAny`; POST `IsAdmin`. |
| GET/PATCH/DELETE | `catalog/intakes/{id}/` | `IntakeDetailView` | staff-config (`IsAdmin`) | Catalog config. |
| GET | `catalog/subjects/` | `SubjectListView` | public-anonymous | Reference data. |
| GET / POST | `catalog/institutions/` | `InstitutionListCreateView` | public-anonymous (GET) / staff-write | GET `AllowAny` (public brand list); POST `IsAdmin`. |
| GET/PATCH/DELETE | `catalog/institutions/{id}/` | `InstitutionDetailView` | staff-config (`IsAdmin`) | Public-readable institution record. |

> **Note:** the `catalog/` config endpoints serve shared catalog/reference data
> (canonical programs, offerings, intakes, subjects, institution brand records),
> not per-tenant applicant data, so they are not governed by the R5.2 applicant
> scope rule. The **tenant-onboarding child resources** under `/api/v1/admin/`
> (section 8) are the scoped tenant-config surface.

## 5. Meta — `/api/v1/meta/`

| Method | Path | View | Class | Scope mechanism |
|--------|------|------|-------|-----------------|
| GET | `meta/platform/` | `PlatformMetaView` | public-anonymous | `AllowAny`; platform attribution metadata. |

## 6. Documents — `/api/v1/documents/`

| Method | Path | View | Class | Scope mechanism |
|--------|------|------|-------|-----------------|
| POST | `documents/upload/` | `DocumentUploadView` | student-owned | Owner upload via `_get_authorized_document` seam family. |
| POST | `documents/{id}/extract/` | `DocumentExtractView` | student-owned / **staff-scoped** | `_get_authorized_document`. ✅ |
| GET | `documents/{id}/signed-url/` | `DocumentSignedUrlView` | student-owned / **staff-scoped** | `_get_authorized_document` + signed-URL expiry. ✅ |
| GET | `documents/{id}/download/` | `DocumentDownloadView` | student-owned / **staff-scoped** | `_get_authorized_document`. ✅ |
| GET | `documents/{id}/info/` | `DocumentInfoView` | student-owned / **staff-scoped** | `_get_authorized_document`. ✅ |
| DELETE | `documents/{id}/delete/` | `DocumentDeleteView` | student-owned / **staff-scoped** | `_get_authorized_document` + delete protection. ✅ |

> `resumes/`, `cover-letters/`, `question-bank/`, `versions/` routes in this app
> module are **jobs-ops** surfaces — out of scope for this admissions audit
> (R16.10), so they are not classified here.

## 7. Payments — `/api/v1/payments/`

| Method | Path | View | Class | Scope mechanism |
|--------|------|------|-------|-----------------|
| GET | `payments/` | `PaymentListView` | student-owned / **staff-scoped** | Admin path → `filter_payments`; student → `user_id`. ✅ |
| POST | `payments/initiate/` | `PaymentInitiateView` | student-owned | Owner; throttled; dev-bypass locked in prod. |
| POST | `payments/defer/` | `DeferPaymentView` | student-owned | Owner; throttled. |
| POST | `payments/mobile-money/` | `MobileMoneyInitiateView` | student-owned | Owner; throttled. |
| POST | `payments/dev-bypass/` | `PaymentDevBypassView` | student-owned (dev only) | 404 in production via `require_not_dev_bypass_in_production`. |
| GET | `payments/resolve-fee/` | `FeeResolveView` | student-owned | Fee config resolution; no other tenant records. |
| POST | `payments/webhook/lenco/` | `LencoWebhookView` | public-anonymous | `AllowAny`, HMAC-SHA512 validated, no auth. |
| GET | `payments/risk-flags/` | `RiskFlagsListView` | **super-admin-only** | `IsSuperAdmin` + dev-bypass lock + throttle. ✅ |
| GET | `payments/settlements/` | `PaymentSettlementSummaryView` | **staff-scoped** | `filter_payments` for non-super-admin. ✅ |
| GET | `payments/{id}/receipt/` | `PaymentReceiptView` | student-owned / **staff-scoped** | Admin masked via `filter_payments().exists()`; owner check. ✅ |
| POST | `payments/{id}/verify/` | `PaymentVerifyView` | student-owned / **staff-scoped** | Admin masked via `filter_payments().exists()`. ✅ |
| POST | `payments/{id}/correct/` | `SuperAdminPaymentCorrectionView` | **super-admin-only** | `IsSuperAdmin` + dev-bypass lock + idempotent. ✅ |

## 7a. Program fees — `/api/v1/programs/{id}/fees/`

| Method | Path | View | Class | Scope mechanism |
|--------|------|------|-------|-----------------|
| GET/POST/PUT/PATCH/DELETE | `programs/{id}/fees/` `…/{pk}/` | `ProgramFeeViewSet` | staff-config (`IsAdmin`) | Per-program fee config, not applicant data. |

## 8. Admin — users, settings, audit — `/api/v1/admin/`

| Method | Path | View | Class | Scope mechanism |
|--------|------|------|-------|-----------------|
| GET | `admin/dashboard/` | `AdminDashboardView` | **staff-scoped** | App + user aggregates narrowed via `filter_applications` + membership `institution_ids`; `has_no_scope` signal. ✅ |
| GET/POST | `admin/users/` | `AdminUserListView` | **staff-scoped** | Non-super-admin → users scoped via `UserInstitutionMembership` + `filters_for_user`. ✅ |
| GET | `admin/users/export/` | `AdminUserExportView` | **staff-scoped** | ⚠️ **GAP-9** — queryset is `Profile.objects.all()` with no institution narrowing for non-super-admin (PII redacted, but row set not scoped). |
| POST | `admin/users/batch-import/` | `BatchUserImportView` | **staff-scoped** | `IsAdmin`; role-level validation + audit. (Creates users; no cross-tenant read leak.) |
| GET/PATCH | `admin/users/{id}/` | `AdminUserDetailView` | **staff-scoped** | ⚠️ **GAP-10** — loads `Profile.objects.get(pk)` with no membership-scope check (role-escalation guards present, but not tenant scope). |
| GET/POST | `admin/settings/` | `AdminSettingsListView` | super-admin-config (`IsAdmin`) | Platform settings, not tenant applicant data. |
| POST | `admin/settings/import/` | `AdminSettingsImportView` | staff-config (`IsAdmin`) | Platform settings. |
| POST | `admin/settings/reset/` | `AdminSettingsResetView` | staff-config (`IsAdmin`) | Platform settings. |
| GET/PATCH/DELETE | `admin/settings/{id}/` | `AdminSettingDetailView` | staff-config (`IsAdmin`) | Platform settings. |
| GET | `admin/audit-logs/` | `AdminAuditLogView` | **staff-scoped** | ⚠️ **GAP-11** — `AuditLog.objects.all()` with filter params only; no `AccessScopeService` institution narrowing for non-super-admin. |

## 9. Admin — tenant onboarding (child resources) — `/api/v1/admin/`

| Method | Path | View | Class | Scope mechanism |
|--------|------|------|-------|-----------------|
| GET/POST | `admin/institutions/` | `AdminTenantListCreateView` | **staff-scoped** | List narrowed via `_scope_institution_ids`; create super-admin-only (`_write_allowed`). ✅ |
| GET/PATCH | `admin/institutions/{id}/` | `AdminTenantDetailView` | **staff-scoped** | `_scope_institution_ids` filter; write super-admin-only. ✅ |
| GET | `admin/institutions/{id}/audit/` | `AdminInstitutionAuditView` | **staff-scoped** | `_scope_institution_ids` + 404 mask for out-of-scope. ✅ |
| GET/POST | `admin/institutions/{id}/domains/` | `AdminTenantDomainListCreateView` | **staff-scoped** | `_InstitutionChildListCreateView` → `_scope_institution_ids`. ✅ |
| GET/PATCH | `admin/institutions/{id}/domains/{item}/` | `AdminTenantDomainDetailView` | **staff-scoped** | `_InstitutionChildDetailView` → `_scope_institution_ids`. ✅ |
| GET/POST | `admin/institutions/{id}/assets/` | `AdminTenantAssetListCreateView` | **staff-scoped** | `_scope_institution_ids`; write super-admin-only. ✅ |
| POST | `admin/institutions/{id}/assets/upload/` | `AdminTenantAssetUploadView` | **super-admin-only** (write) | `_write_allowed`; storage-key prefix + MIME validation. ✅ |
| GET/PATCH | `admin/institutions/{id}/assets/{item}/` | `AdminTenantAssetDetailView` | **staff-scoped** | `_scope_institution_ids`. ✅ |
| GET/POST | `admin/institutions/{id}/templates/` | `AdminTenantTemplateListCreateView` | **staff-scoped** | `_scope_institution_ids`. ✅ |
| GET/PATCH | `admin/institutions/{id}/templates/{item}/` | `AdminTenantTemplateDetailView` | **staff-scoped** | `_scope_institution_ids`. ✅ |
| GET/POST | `admin/institutions/{id}/document-profiles/` | `AdminTenantProfileListCreateView` | **staff-scoped** | `_scope_institution_ids`. ✅ |
| GET/PATCH | `admin/institutions/{id}/document-profiles/{item}/` | `AdminTenantProfileDetailView` | **staff-scoped** | `_scope_institution_ids`. ✅ |
| POST | `admin/institutions/{id}/document-profiles/{item}/clone/` | `AdminTenantProfileCloneView` | **staff-scoped** | `_scope_institution_ids`; write super-admin-only. ✅ |
| GET/POST | `admin/institutions/{id}/required-documents/` | `AdminTenantRequiredDocumentListCreateView` | **staff-scoped** | `_scope_institution_ids`. ✅ |
| GET/PATCH | `admin/institutions/{id}/required-documents/{item}/` | `AdminTenantRequiredDocumentDetailView` | **staff-scoped** | `_scope_institution_ids`. ✅ |
| GET/POST | `admin/memberships/` | `AdminMembershipListCreateView` | **staff-scoped** | `_scope_institution_ids` filter; no-scope non-super-admin → `none()`. ✅ |
| GET/PATCH | `admin/memberships/{id}/` | `AdminMembershipDetailView` | **staff-scoped** | `_scope_institution_ids`. ✅ |
| GET/POST | `admin/access-grants/` | `AdminAccessGrantListCreateView` | **staff-scoped** | `_scope_institution_ids` (institution + `program__institution_id`). ✅ |
| GET/PATCH | `admin/access-grants/{id}/` | `AdminAccessGrantDetailView` | **staff-scoped** | `_scope_institution_ids`. ✅ |
| POST | `admin/routing/simulate/` | `AdminRoutingSimulateView` | **super-admin-only** | `IsSuperAdmin`. ✅ |
| GET | `admin/tenant-audit/` | `AdminTenantAuditView` | **super-admin-only** | `IsSuperAdmin`. ✅ |

## 10. Admin — communication templates — `/api/v1/admin/`

| Method | Path | View | Class | Scope mechanism |
|--------|------|------|-------|-----------------|
| GET | `admin/templates/` | `CommunicationTemplateListView` | **staff-scoped** | Non-super-admin narrowed via `_scope_institution_ids`; platform (NULL) rows super-admin-only. ✅ |
| PUT | `admin/templates/{key}/` | `CommunicationTemplateUpdateView` | **staff-scoped** | `_can_manage_institution` authorizes before any write; `OUT_OF_SCOPE` mask. ✅ |

## 11. Notifications & communication — `/api/v1/notifications/`, `/api/v1/email/`

| Method | Path | View | Class | Scope mechanism |
|--------|------|------|-------|-----------------|
| GET | `notifications/` | `NotificationListView` | student-owned | `user_id == request.user`. |
| POST | `notifications/` | `NotificationSendView` | staff | `IsAuthenticated`; serializer validates target `user_id`. |
| GET/PUT | `notifications/preferences/` | `NotificationPreferenceView` | student-owned | Caller's own preferences. |
| PUT/POST | `notifications/read-all/` | `NotificationMarkAllReadView` | student-owned | Caller's own notifications. |
| PUT/POST | `notifications/mark-all-read/` | `NotificationMarkAllReadAliasView` | student-owned | Deprecated alias; caller's own. |
| PUT/POST | `notifications/mark-read/` | `NotificationMarkReadBatchAliasView` | student-owned | Deprecated alias; caller's own. |
| PUT/POST | `notifications/{id}/read/` | `NotificationMarkReadView` | student-owned | `pk + user_id` filter. |
| DELETE | `notifications/{id}/` | `NotificationDeleteView` | student-owned | `pk + user_id` filter. |
| GET | `notifications/user/{id}/` | `AdminNotificationHistoryView` | **staff-scoped** | ⚠️ **GAP-12** — admin-gated, but target user's notifications loaded by `user_id` with no membership-scope narrowing. |
| POST | `email/send/` | `EmailSendView` | staff | `IsAuthenticated`; serializer-validated recipients. |
| POST | `email/accounts/zoho/connect/` | `ZohoConnectView` | staff (jobs-ops adjacent) | `IsAuthenticated`. |
| GET | `email/messages/` | `EmailMessageListView` | jobs-ops* | Out of admissions scope (R16.10). |
| GET | `email/threads/` | `EmailThreadListView` | jobs-ops* | Out of admissions scope (R16.10). |
| POST | `email/webhooks/delivery/` | `EmailDeliveryWebhookView` | public-anonymous | `AllowAny`, no auth (provider webhook). |

## 12. Error monitoring — `/api/v1/errors/`

| Method | Path | View | Class | Scope mechanism |
|--------|------|------|-------|-----------------|
| POST | `errors/report/` | `ErrorReportView` | public-anonymous | `AllowAny`, CSRF-exempt, rate-limited (frontend error forwarding). |

---

## Result — R5.1 completeness

**Every admissions endpoint above is classified. There are zero unresolved
"unknown scope" rows.** ✅ (R5.1)

Counts by class (admissions surface; jobs-ops `resumes/`, `cover-letters/`,
`question-bank/`, `email/messages|threads/` rows are noted out-of-scope and not
counted):

| Class | Count |
|-------|-------|
| public-anonymous | 16 |
| student-owned (pure) | 21 |
| student-owned **or** staff-scoped (dual-path by role) | 14 |
| staff-scoped (admin/reviewer) | 26 |
| super-admin-only | 7 |
| staff-config (catalog/settings/program-fee, non-applicant data) | 12 |
| **Total classified admissions endpoints** | **96** |

> Dual-path rows are counted once in the dual-path bucket. "staff-config" rows
> serve shared catalog/platform configuration (not per-tenant applicant data) and
> are therefore outside the R5.2 applicant-scope rule, but are still classified
> for R5.1 completeness.

## R5.2 — staff-scoped queryset funnels through AccessScopeService

The large majority of staff-scoped applicant-data endpoints route through
`AccessScopeService` (queryset `filter_*`, shared scoped loaders, or
`_scope_institution_ids` for tenant-config children) — marked ✅ above. The
exceptions are recorded as gaps below.

## R5.8 — canonical IDs, never Legacy_String_Fields

All scope joins observed use canonical FKs (`institution_ref_id`,
`program_offering_id`, `pk`/`application_id`, `AccessGrant.program_id`,
`UserInstitutionMembership.institution_id`). **No endpoint authorizes on
`applications.institution` / `applications.program` / `applications.intake`.**
R5.8 holds across the inventory. ✅

---

## Gap register (unscoped or partially-scoped querysets)

> These are **findings only**. Per Task 11.1 scope, no production DB changes are
> applied and no behavioural fixes are made in this task. Fixes are tracked for
> Task 11.2/11.3 (scoped-access test matrix) and the scope/unscoped guards. Each
> gap is an additive `AccessScopeService` narrowing tied to R5.2/R5.9.

| ID | Endpoint | View / file | Finding | Severity | Notes |
|----|----------|-------------|---------|----------|-------|
| GAP-1 | `POST applications/bulk-status/` | `admin_bulk_views.py:ApplicationBulkStatusView` | Batch loads `Application.objects.filter(id__in=app_ids)` with **no** `AccessScopeService` narrowing; a scoped admin could transition applications outside their school. | High | `IsAdmin` gate only. Fix: filter the batch through `filter_applications` and report out-of-scope IDs as `NOT_FOUND`. |
| GAP-2 | `GET applications/interviews/` (admin path) | `interview_views.py:ApplicationInterviewListView` | Admin (non-`mine`) branch returns all interviews with no institution narrowing. | High | Student/`mine` path is correctly owner-filtered. Fix: narrow admin queryset via `filter_applications` on `application`. |
| GAP-3 | `GET applications/history/` (admin path) | `history_views.py:TimelineHistoryView` | Admin may pass `?user_id=` to read any user's status history with no scope narrowing. | Medium | Fix: when admin targets another user, intersect with `filter_applications`. |
| GAP-4 | `GET applications/{id}/grades/`, `…/summary/` | `student_submission_views.py` | `IsOwnerOrAdmin` authorizes any admin by role for object access; no `AccessScopeService` narrowing for cross-school masking. | Medium | Owner path correct. Fix: add `filter_applications().exists()` 404-mask for `role == admin` (mirror `ApplicationDetailView`). |
| GAP-5 | `GET applications/{id}/admin-summary/` | `admin_amendment_views.py:ApplicationAdminSummaryView` | **Confirmed:** loads `Application.objects.get(id=application_id)` with no `AccessScopeService` narrowing, returning an AI review brief of **any** school's application to a scoped admin. | High | Fix: 404-mask out-of-scope application for staff via `filter_applications` before generating the summary. |
| GAP-6 | `applications/{id}/interviews/` (CRUD) | `interview_views.py:ApplicationInterviewView` | GET uses `IsOwnerOrAdmin` (role-only admin), write uses `IsAdmin`; neither narrows via `AccessScopeService`. | High | Fix: 404-mask out-of-scope application for staff via `filter_applications`. |
| GAP-7 | `GET applications/{id}/waitlist-position/`, `…/conditions/` | `student_withdrawal_views.py` | Owner-or-admin role check authorizes any admin; no institution narrowing. | Medium | Owner path correct. Fix: add scope mask for admin role. |
| GAP-8 | `POST applications/{id}/conditions/{cid}/verify/`, `…/amendments/{aid}/review/` | `admin_amendment_views.py` | `IsAdmin`-gated writes load application/condition/amendment by id with **no** `AccessScopeService` narrowing. | High | Fix: scope-narrow the application load before mutating. |
| GAP-9 | `GET admin/users/export/` | `admin_user_views.py:AdminUserExportView` | Export queryset is `Profile.objects.all()`; non-super-admin rows are PII-redacted but the **row set is not institution-scoped**. | Medium | PII redaction limits leakage; row scoping still recommended for parity with `AdminUserListView`. |
| GAP-10 | `GET/PATCH admin/users/{id}/` | `admin_user_views.py:AdminUserDetailView` | Loads `Profile.objects.get(pk)` with no membership-scope check; role-escalation guards exist but a scoped admin can read/modify a user outside their school. | Medium | Fix: intersect target user with the actor's `UserInstitutionMembership` scope. |
| GAP-11 | `GET admin/audit-logs/` | `admin_audit_views.py:AdminAuditLogView` | `AuditLog.objects.all()` with filter params only; no `AccessScopeService` narrowing for non-super-admin. | Medium | The scoped per-institution feed (`AdminInstitutionAuditView`) is correctly masked; this global feed should be super-admin-only or institution-scoped. |
| GAP-12 | `GET notifications/user/{id}/` | `notification_views.py:AdminNotificationHistoryView` | Admin-gated; loads target user's notifications by `user_id` with no membership-scope narrowing. | Low | Fix: confirm target user is within actor scope before listing. |

### Gap summary

- **12 partially-scoped/unscoped staff endpoints** identified (5 High, 6 Medium,
  1 Low). None expose data to anonymous or student-owned callers — all
  require an authenticated admin/reviewer; the risk is **cross-school** leakage
  among School_Staff, which R5.2/R5.9 forbid.
- The existing `test_scope_drift_guard.py` (admin-alone authorization) and
  `test_unscoped_endpoint_guard.py` (document-serving modules) **do not currently
  cover** these specific surfaces: the unscoped guard scans only the five
  document-serving modules, and the scope-drift guard only fires on a literal
  `role == "admin"` equality paired with a resource model. GAP-1/2/3/8/9/10/11/12
  use role membership checks (`role in (...)`) or `IsAdmin` permission classes, so
  they slip past both heuristics.
- **Recommended follow-up (Task 11.2 / 11.3):** add scoped-access tests for each
  gap proving out-of-scope → `Not_Found_Envelope`, then apply the additive
  `AccessScopeService` narrowing, and **extend** `test_unscoped_endpoint_guard.py`
  to cover `admin_bulk_views.py`, `interview_views.py`, `history_views.py`,
  `student_withdrawal_views.py`, `admin_amendment_views.py`, `admin_user_views.py`,
  `admin_audit_views.py`, and `notification_views.py` so these cannot regress
  silently.

### Task 11.3 closure — guard extension + remaining narrowing

- **Guard extension (done, Task 11.3):** `test_unscoped_endpoint_guard.py` now
  carries an explicit **gap-register scope guard** that pins each gap endpoint
  (GAP-1…GAP-12) by `module::ClassName` and asserts the class body references an
  `AccessScopeService` scope seam (`AccessScopeService` / `filter_*` /
  `_get_authorized_*` / `_get_scoped_application` / `_staff_can_access_application`
  / `filters_for_user` / `_scope_institution_ids` / `_scoped_user_ids`). It uses
  AST identifiers (not substrings) so docstrings/comments cannot defang it, does
  **not** false-positive on owner-scoped siblings (`NotificationListView`,
  `ApplicationWithdrawView`), and ships self-tests proving it flags a reverted
  fix and passes a scoped one. R5.9 cannot regress silently.
- **Narrowing applied in Task 11.3 (GAP-9/10/11/12):** the four staff endpoints
  outside the application domain were given additive `AccessScopeService`
  membership narrowing:
  - **GAP-9** `AdminUserExportView` — export rows narrowed to the actor's
    membership scope (`_scoped_user_ids`) in addition to the existing PII
    redaction.
  - **GAP-10** `AdminUserDetailView` — GET/PATCH 404-mask out-of-scope target
    users; the RBAC role-escalation guards still fire first (403) before the
    tenant mask (404).
  - **GAP-11** `AdminAuditLogView` — non-super-admins narrowed to audit entries
    authored by actors within their institution membership scope.
  - **GAP-12** `AdminNotificationHistoryView` — out-of-scope target user masked
    as not-found before listing notifications.
  GAP-1/2/3/6/5/8/7 (application-domain) are narrowed by Task 11.2 via
  `filter_applications` / `_staff_can_access_application`. All 12 are now pinned
  by the guard.

> No production DB changes were made by this task. No view behaviour was changed.
> This document is the R5.1 inventory artifact; gap fixes are additive and tied
> to R5.2/R5.9 in the subsequent Phase-5 tasks.
