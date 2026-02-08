# Contract Mismatch Report

> Forensic audit of frontend-backend API contract alignment

**Generated**: 2026-02-02T16:25:36.768Z
**Project Root**: C:\Users\Administrator\Documents\mihasv3
**Audit Version**: 1.0.0

## Executive Summary

**Report Generated**: 2026-02-02T16:25:36.769Z

### Contract Health Status

🔴 **CRITICAL** - Immediate action required

### Overview

| Metric | Count |
|--------|-------|
| Frontend API Calls | 92 |
| Backend Endpoints | 12 |
| Total Mismatches | 78 |

### Mismatches by Severity

| Severity | Type | Count |
|----------|------|-------|
| 🔴 Critical | MISSING_ENDPOINT | 70 |
| 🟠 High | AUTH_MISMATCH | 1 |
| 🟠 High | METHOD_MISMATCH | 0 |
| 🟡 Medium | SCHEMA_MISMATCH | 0 |
| 🟢 Low | UNUSED_ENDPOINT | 7 |

### Quick Stats

- **Matched Endpoints**: 5 / 12
- **Unmatched Frontend Calls**: 70
- **Auth Issues**: 1

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Mismatches by Type](#mismatches-by-type)
   - [MISSING_ENDPOINT](#-missing_endpoint-70)
   - [AUTH_MISMATCH](#-auth_mismatch-1)
   - [UNUSED_ENDPOINT](#-unused_endpoint-7)
3. [Recommendations](#recommendations)
4. [Appendix: All Frontend Calls](#appendix-all-frontend-calls)
5. [Appendix: All Backend Endpoints](#appendix-all-backend-endpoints)

## Mismatches by Type

### 🔴 MISSING_ENDPOINT (70)

**Description**: Frontend calls an endpoint that does not exist in the backend

**Recommendation**: Either implement the missing backend endpoint or remove the frontend call

---

#### 1. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/admin/dashboard at src\services\admin\dashboard.ts:317, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\admin\dashboard.ts`
- **Line**: 317
- **Endpoint**: `/api/admin/dashboard`
- **Method**: `GET`
- **Auth**: cookie

---

#### 2. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/admin/users at src\services\admin\users.ts:5, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\admin\users.ts`
- **Line**: 5
- **Endpoint**: `/api/admin/users`
- **Method**: `GET`
- **Auth**: cookie

---

#### 3. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/admin/users/DYNAMIC at src\services\admin\users.ts:9, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\admin\users.ts`
- **Line**: 9
- **Endpoint**: `/api/admin/users/DYNAMIC`
- **Method**: `GET`
- **Auth**: cookie

---

#### 4. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/admin/users/DYNAMIC/role at src\services\admin\users.ts:10, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\admin\users.ts`
- **Line**: 10
- **Endpoint**: `/api/admin/users/DYNAMIC/role`
- **Method**: `GET`
- **Auth**: cookie

---

#### 5. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/admin/users/DYNAMIC/permissions at src\services\admin\users.ts:11, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\admin\users.ts`
- **Line**: 11
- **Endpoint**: `/api/admin/users/DYNAMIC/permissions`
- **Method**: `POST`
- **Auth**: cookie

---

#### 6. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/admin/users at src\services\admin\users.ts:13, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\admin\users.ts`
- **Line**: 13
- **Endpoint**: `/api/admin/users`
- **Method**: `POST`
- **Auth**: cookie

---

#### 7. MISSING_ENDPOINT

**Evidence**: Frontend calls PUT /api/admin/users/DYNAMIC at src\services\admin\users.ts:18, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\admin\users.ts`
- **Line**: 18
- **Endpoint**: `/api/admin/users/DYNAMIC`
- **Method**: `PUT`
- **Auth**: cookie

---

#### 8. MISSING_ENDPOINT

**Evidence**: Frontend calls PUT /api/admin/users/DYNAMIC/permissions at src\services\admin\users.ts:23, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\admin\users.ts`
- **Line**: 23
- **Endpoint**: `/api/admin/users/DYNAMIC/permissions`
- **Method**: `PUT`
- **Auth**: cookie

---

#### 9. MISSING_ENDPOINT

**Evidence**: Frontend calls DELETE /api/admin/users/DYNAMIC at src\services\admin\users.ts:28, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\admin\users.ts`
- **Line**: 28
- **Endpoint**: `/api/admin/users/DYNAMIC`
- **Method**: `DELETE`
- **Auth**: cookie

---

#### 10. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/applications/DYNAMIC at src\services\applications.ts:60, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\applications.ts`
- **Line**: 60
- **Endpoint**: `/api/applications/DYNAMIC`
- **Method**: `POST`
- **Auth**: cookie

---

#### 11. MISSING_ENDPOINT

**Evidence**: Frontend calls PUT /api/applications/DYNAMIC at src\services\applications.ts:73, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\applications.ts`
- **Line**: 73
- **Endpoint**: `/api/applications/DYNAMIC`
- **Method**: `PUT`
- **Auth**: cookie

---

#### 12. MISSING_ENDPOINT

**Evidence**: Frontend calls DELETE /api/applications/DYNAMIC at src\services\applications.ts:81, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\applications.ts`
- **Line**: 81
- **Endpoint**: `/api/applications/DYNAMIC`
- **Method**: `DELETE`
- **Auth**: cookie

---

#### 13. MISSING_ENDPOINT

**Evidence**: Frontend calls PATCH /api/applications/DYNAMIC at src\services\applications.ts:88, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\applications.ts`
- **Line**: 88
- **Endpoint**: `/api/applications/DYNAMIC`
- **Method**: `PATCH`
- **Auth**: cookie

---

#### 14. MISSING_ENDPOINT

**Evidence**: Frontend calls PATCH /api/applications/DYNAMIC at src\services\applications.ts:99, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\applications.ts`
- **Line**: 99
- **Endpoint**: `/api/applications/DYNAMIC`
- **Method**: `PATCH`
- **Auth**: cookie

---

#### 15. MISSING_ENDPOINT

**Evidence**: Frontend calls PATCH /api/applications/DYNAMIC at src\services\applications.ts:113, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\applications.ts`
- **Line**: 113
- **Endpoint**: `/api/applications/DYNAMIC`
- **Method**: `PATCH`
- **Auth**: cookie

---

#### 16. MISSING_ENDPOINT

**Evidence**: Frontend calls PATCH /api/applications/DYNAMIC at src\services\applications.ts:124, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\applications.ts`
- **Line**: 124
- **Endpoint**: `/api/applications/DYNAMIC`
- **Method**: `PATCH`
- **Auth**: cookie

---

#### 17. MISSING_ENDPOINT

**Evidence**: Frontend calls PATCH /api/applications/DYNAMIC at src\services\applications.ts:130, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\applications.ts`
- **Line**: 130
- **Endpoint**: `/api/applications/DYNAMIC`
- **Method**: `PATCH`
- **Auth**: cookie

---

#### 18. MISSING_ENDPOINT

**Evidence**: Frontend calls PATCH /api/applications/DYNAMIC at src\services\applications.ts:136, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\applications.ts`
- **Line**: 136
- **Endpoint**: `/api/applications/DYNAMIC`
- **Method**: `PATCH`
- **Auth**: cookie

---

#### 19. MISSING_ENDPOINT

**Evidence**: Frontend calls PATCH /api/applications/DYNAMIC at src\services\applications.ts:142, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\applications.ts`
- **Line**: 142
- **Endpoint**: `/api/applications/DYNAMIC`
- **Method**: `PATCH`
- **Auth**: cookie

---

#### 20. MISSING_ENDPOINT

**Evidence**: Frontend calls PATCH /api/applications/DYNAMIC at src\services\applications.ts:160, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\applications.ts`
- **Line**: 160
- **Endpoint**: `/api/applications/DYNAMIC`
- **Method**: `PATCH`
- **Auth**: cookie

---

#### 21. MISSING_ENDPOINT

**Evidence**: Frontend calls PATCH /api/applications/DYNAMIC at src\services\applications.ts:178, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\applications.ts`
- **Line**: 178
- **Endpoint**: `/api/applications/DYNAMIC`
- **Method**: `PATCH`
- **Auth**: cookie

---

#### 22. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/auth/register at src\services\auth.ts:18, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\auth.ts`
- **Line**: 18
- **Endpoint**: `/api/auth/register`
- **Method**: `POST`
- **Auth**: cookie

---

#### 23. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/auth/login at src\services\auth.ts:30, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\auth.ts`
- **Line**: 30
- **Endpoint**: `/api/auth/login`
- **Method**: `POST`
- **Auth**: cookie

---

#### 24. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/auth/signin at src\services\auth.ts:35, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\auth.ts`
- **Line**: 35
- **Endpoint**: `/api/auth/signin`
- **Method**: `POST`
- **Auth**: cookie

---

#### 25. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/notifications/send at src\services\backupRecovery.ts:851, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\backupRecovery.ts`
- **Line**: 851
- **Endpoint**: `/api/notifications/send`
- **Method**: `POST`
- **Auth**: cookie

---

#### 26. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/catalog/programs at src\services\catalog.ts:47, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 47
- **Endpoint**: `/api/catalog/programs`
- **Method**: `GET`
- **Auth**: cookie

---

#### 27. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/catalog/intakes at src\services\catalog.ts:51, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 51
- **Endpoint**: `/api/catalog/intakes`
- **Method**: `GET`
- **Auth**: cookie

---

#### 28. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/catalog/subjects at src\services\catalog.ts:55, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 55
- **Endpoint**: `/api/catalog/subjects`
- **Method**: `GET`
- **Auth**: cookie

---

#### 29. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/catalog/institutions at src\services\catalog.ts:59, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 59
- **Endpoint**: `/api/catalog/institutions`
- **Method**: `GET`
- **Auth**: cookie

---

#### 30. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/catalog/programs at src\services\catalog.ts:66, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 66
- **Endpoint**: `/api/catalog/programs`
- **Method**: `GET`
- **Auth**: cookie

---

#### 31. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/catalog/programs at src\services\catalog.ts:70, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 70
- **Endpoint**: `/api/catalog/programs`
- **Method**: `POST`
- **Auth**: cookie

---

#### 32. MISSING_ENDPOINT

**Evidence**: Frontend calls PUT /api/catalog/programs at src\services\catalog.ts:77, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 77
- **Endpoint**: `/api/catalog/programs`
- **Method**: `PUT`
- **Auth**: cookie

---

#### 33. MISSING_ENDPOINT

**Evidence**: Frontend calls DELETE /api/catalog/programs at src\services\catalog.ts:84, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 84
- **Endpoint**: `/api/catalog/programs`
- **Method**: `DELETE`
- **Auth**: cookie

---

#### 34. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/catalog/intakes at src\services\catalog.ts:94, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 94
- **Endpoint**: `/api/catalog/intakes`
- **Method**: `GET`
- **Auth**: cookie

---

#### 35. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/catalog/intakes at src\services\catalog.ts:98, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 98
- **Endpoint**: `/api/catalog/intakes`
- **Method**: `POST`
- **Auth**: cookie

---

#### 36. MISSING_ENDPOINT

**Evidence**: Frontend calls PUT /api/catalog/intakes at src\services\catalog.ts:105, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 105
- **Endpoint**: `/api/catalog/intakes`
- **Method**: `PUT`
- **Auth**: cookie

---

#### 37. MISSING_ENDPOINT

**Evidence**: Frontend calls DELETE /api/catalog/intakes at src\services\catalog.ts:112, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 112
- **Endpoint**: `/api/catalog/intakes`
- **Method**: `DELETE`
- **Auth**: cookie

---

#### 38. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/user-consents at src\services\consents.ts:26, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\consents.ts`
- **Line**: 26
- **Endpoint**: `/api/user-consents`
- **Method**: `GET`
- **Auth**: cookie

---

#### 39. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/user-consents at src\services\consents.ts:30, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\consents.ts`
- **Line**: 30
- **Endpoint**: `/api/user-consents`
- **Method**: `POST`
- **Auth**: cookie

---

#### 40. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/monitoring/database-metrics at src\services\databaseOptimization.ts:136, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\databaseOptimization.ts`
- **Line**: 136
- **Endpoint**: `/api/monitoring/database-metrics`
- **Method**: `GET`
- **Auth**: cookie

---

#### 41. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/documents/extract at src\services\documentExtraction.ts:36, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\documentExtraction.ts`
- **Line**: 36
- **Endpoint**: `/api/documents/extract`
- **Method**: `POST`
- **Auth**: cookie

---

#### 42. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/documents/upload at src\services\documents.ts:11, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\documents.ts`
- **Line**: 11
- **Endpoint**: `/api/documents/upload`
- **Method**: `POST`
- **Auth**: cookie

---

#### 43. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/documents/acceptance-letter at src\services\documents.ts:19, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\documents.ts`
- **Line**: 19
- **Endpoint**: `/api/documents/acceptance-letter`
- **Method**: `POST`
- **Auth**: cookie

---

#### 44. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/documents/finance-receipt at src\services\documents.ts:25, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\documents.ts`
- **Line**: 25
- **Endpoint**: `/api/documents/finance-receipt`
- **Method**: `POST`
- **Auth**: cookie

---

#### 45. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/interview/schedule at src\services\interviews.ts:27, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\interviews.ts`
- **Line**: 27
- **Endpoint**: `/api/interview/schedule`
- **Method**: `POST`
- **Auth**: cookie

---

#### 46. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/interview/schedule${applicationId ?  at src\services\interviews.ts:33, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\interviews.ts`
- **Line**: 33
- **Endpoint**: `/api/interview/schedule${applicationId ? `
- **Method**: `GET`
- **Auth**: cookie

---

#### 47. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/interview/reminders at src\services\interviews.ts:38, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\interviews.ts`
- **Line**: 38
- **Endpoint**: `/api/interview/reminders`
- **Method**: `GET`
- **Auth**: cookie

---

#### 48. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/notifications/send at src\services\notifications.ts:71, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 71
- **Endpoint**: `/api/notifications/send`
- **Method**: `POST`
- **Auth**: cookie

---

#### 49. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/notifications/application-submitted at src\services\notifications.ts:88, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 88
- **Endpoint**: `/api/notifications/application-submitted`
- **Method**: `POST`
- **Auth**: cookie

---

#### 50. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/notifications/dispatch-channel at src\services\notifications.ts:93, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 93
- **Endpoint**: `/api/notifications/dispatch-channel`
- **Method**: `POST`
- **Auth**: cookie

---

#### 51. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/notifications/preferences?include_audit=DYNAMIC&audit_limit=DYNAMIC at src\services\notifications.ts:98, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 98
- **Endpoint**: `/api/notifications/preferences?include_audit=DYNAMIC&audit_limit=DYNAMIC`
- **Method**: `GET`
- **Auth**: cookie
- **Query Params**: {"include_audit":""}

---

#### 52. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/notifications/update-consent at src\services\notifications.ts:102, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 102
- **Endpoint**: `/api/notifications/update-consent`
- **Method**: `POST`
- **Auth**: cookie

---

#### 53. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/notifications/preferences at src\services\notifications.ts:109, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 109
- **Endpoint**: `/api/notifications/preferences`
- **Method**: `POST`
- **Auth**: cookie

---

#### 54. MISSING_ENDPOINT

**Evidence**: Frontend calls PUT /api/notifications/preferences at src\services\notifications.ts:115, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 115
- **Endpoint**: `/api/notifications/preferences`
- **Method**: `PUT`
- **Auth**: cookie

---

#### 55. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/notifications/consent at src\services\notifications.ts:121, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 121
- **Endpoint**: `/api/notifications/consent`
- **Method**: `POST`
- **Auth**: cookie

---

#### 56. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/notifications/consent at src\services\notifications.ts:132, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 132
- **Endpoint**: `/api/notifications/consent`
- **Method**: `GET`
- **Auth**: cookie

---

#### 57. MISSING_ENDPOINT

**Evidence**: Frontend calls PUT /api/notifications/consent at src\services\notifications.ts:138, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 138
- **Endpoint**: `/api/notifications/consent`
- **Method**: `PUT`
- **Auth**: cookie

---

#### 58. MISSING_ENDPOINT

**Evidence**: Frontend calls DELETE /api/notifications/consent at src\services\notifications.ts:149, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 149
- **Endpoint**: `/api/notifications/consent`
- **Method**: `DELETE`
- **Auth**: cookie

---

#### 59. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/notifications/send at src\services\performanceAlerting.ts:600, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\performanceAlerting.ts`
- **Line**: 600
- **Endpoint**: `/api/notifications/send`
- **Method**: `POST`
- **Auth**: cookie

---

#### 60. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/notifications/send at src\services\performanceAlerting.ts:620, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\performanceAlerting.ts`
- **Line**: 620
- **Endpoint**: `/api/notifications/send`
- **Method**: `POST`
- **Auth**: cookie

---

#### 61. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/push-subscriptions at src\services\pushSubscriptions.ts:20, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\pushSubscriptions.ts`
- **Line**: 20
- **Endpoint**: `/api/push-subscriptions`
- **Method**: `POST`
- **Auth**: cookie

---

#### 62. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/push-subscriptions/dispatch at src\services\pushSubscriptions.ts:25, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\pushSubscriptions.ts`
- **Line**: 25
- **Endpoint**: `/api/push-subscriptions/dispatch`
- **Method**: `POST`
- **Auth**: cookie

---

#### 63. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/monitoring/system-metrics at src\services\systemMonitoring.ts:107, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\systemMonitoring.ts`
- **Line**: 107
- **Endpoint**: `/api/monitoring/system-metrics`
- **Method**: `GET`
- **Auth**: cookie

---

#### 64. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/monitoring/database-metrics at src\services\systemMonitoring.ts:119, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\systemMonitoring.ts`
- **Line**: 119
- **Endpoint**: `/api/monitoring/database-metrics`
- **Method**: `GET`
- **Auth**: cookie

---

#### 65. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/monitoring/health at src\services\systemMonitoring.ts:131, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\systemMonitoring.ts`
- **Line**: 131
- **Endpoint**: `/api/monitoring/health`
- **Method**: `GET`
- **Auth**: cookie

---

#### 66. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/monitoring/alerts at src\services\systemMonitoring.ts:143, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\systemMonitoring.ts`
- **Line**: 143
- **Endpoint**: `/api/monitoring/alerts`
- **Method**: `GET`
- **Auth**: cookie

---

#### 67. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/monitoring/historical-metrics at src\services\systemMonitoring.ts:210, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\systemMonitoring.ts`
- **Line**: 210
- **Endpoint**: `/api/monitoring/historical-metrics`
- **Method**: `POST`
- **Auth**: cookie

---

#### 68. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/monitoring/alerts at src\services\systemMonitoring.ts:229, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\systemMonitoring.ts`
- **Line**: 229
- **Endpoint**: `/api/monitoring/alerts`
- **Method**: `POST`
- **Auth**: cookie

---

#### 69. MISSING_ENDPOINT

**Evidence**: Frontend calls PATCH /api/monitoring/alerts/DYNAMIC/resolve at src\services\systemMonitoring.ts:248, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\systemMonitoring.ts`
- **Line**: 248
- **Endpoint**: `/api/monitoring/alerts/DYNAMIC/resolve`
- **Method**: `PATCH`
- **Auth**: cookie

---

#### 70. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/monitoring/track-metric at src\services\systemMonitoring.ts:329, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\systemMonitoring.ts`
- **Line**: 329
- **Endpoint**: `/api/monitoring/track-metric`
- **Method**: `POST`
- **Auth**: cookie

---

### 🟠 AUTH_MISMATCH (1)

**Description**: Authentication requirements differ between frontend and backend

**Recommendation**: Ensure frontend sends appropriate authentication for protected endpoints

---

#### 1. AUTH_MISMATCH

**Evidence**: Frontend sends no auth for /api/notifications?action=push-subscribe at src\services\pushNotificationManager.ts:527, but backend requires authenticated

**Frontend Call**:
- **File**: `src\services\pushNotificationManager.ts`
- **Line**: 527
- **Endpoint**: `/api/notifications?action=push-subscribe`
- **Method**: `POST`
- **Auth**: none
- **Query Params**: {"action":"push-subscribe"}

**Backend Endpoint**:
- **File**: `api-src\notifications.ts`
- **Endpoint**: `/api/notifications`
- **Methods**: `GET,POST,DELETE`
- **Actions**: preferences, send, push-subscribe, push-send
- **Auth Required**: Yes

---



### 🟢 UNUSED_ENDPOINT (7)

**Description**: Backend endpoint is defined but never called by frontend

**Recommendation**: Either add frontend calls to use this endpoint or remove it from the backend

---

#### 1. UNUSED_ENDPOINT

**Evidence**: Backend endpoint /api/admin (actions: dashboard, users, settings, register, stats, errors, migrate, set-password, import-settings, reset-settings, eligibility-rules, update-role, eligibility-assessments) defined in api-src\admin.ts is never called by frontend code

**Backend Endpoint**:
- **File**: `api-src\admin.ts`
- **Endpoint**: `/api/admin`
- **Methods**: `GET,POST,PUT`
- **Actions**: dashboard, users, settings, register, stats, errors, migrate, set-password, import-settings, reset-settings, eligibility-rules, update-role, eligibility-assessments
- **Auth Required**: Yes
- **Roles**: admin, super_admin

---

#### 2. UNUSED_ENDPOINT

**Evidence**: Backend endpoint /api/bootstrap defined in api-src\bootstrap.ts is never called by frontend code

**Backend Endpoint**:
- **File**: `api-src\bootstrap.ts`
- **Endpoint**: `/api/bootstrap`
- **Methods**: `POST`
- **Actions**: (none)
- **Auth Required**: No

---

#### 3. UNUSED_ENDPOINT

**Evidence**: Backend endpoint /api/catalog (actions: programs, intakes, subjects, institutions) defined in api-src\catalog.ts is never called by frontend code

**Backend Endpoint**:
- **File**: `api-src\catalog.ts`
- **Endpoint**: `/api/catalog`
- **Methods**: `GET`
- **Actions**: programs, intakes, subjects, institutions
- **Auth Required**: No

---

#### 4. UNUSED_ENDPOINT

**Evidence**: Backend endpoint /api/documents (actions: upload, extract, download, signed-url) defined in api-src\documents.ts is never called by frontend code

**Backend Endpoint**:
- **File**: `api-src\documents.ts`
- **Endpoint**: `/api/documents`
- **Methods**: `GET,POST,DELETE`
- **Actions**: upload, extract, download, signed-url
- **Auth Required**: Yes

---

#### 5. UNUSED_ENDPOINT

**Evidence**: Backend endpoint /api/health (actions: ping, db, env) defined in api-src\health.ts is never called by frontend code

**Backend Endpoint**:
- **File**: `api-src\health.ts`
- **Endpoint**: `/api/health`
- **Methods**: `GET`
- **Actions**: ping, db, env
- **Auth Required**: No

---

#### 6. UNUSED_ENDPOINT

**Evidence**: Backend endpoint /api/payments (actions: receipt) defined in api-src\payments.ts is never called by frontend code

**Backend Endpoint**:
- **File**: `api-src\payments.ts`
- **Endpoint**: `/api/payments`
- **Methods**: `GET`
- **Actions**: receipt
- **Auth Required**: Yes

---

#### 7. UNUSED_ENDPOINT

**Evidence**: Backend endpoint /api/ping defined in api-src\ping.ts is never called by frontend code

**Backend Endpoint**:
- **File**: `api-src\ping.ts`
- **Endpoint**: `/api/ping`
- **Methods**: `GET,POST`
- **Actions**: (none)
- **Auth Required**: No

---

## Recommendations

### Priority Actions

**1. Fix Missing Endpoints (Critical)**

The following frontend calls have no matching backend endpoint:

- `GET /api/admin/dashboard` at `src\services\admin\dashboard.ts:317`
- `GET /api/admin/users` at `src\services\admin\users.ts:5`
- `GET /api/admin/users/DYNAMIC` at `src\services\admin\users.ts:9`
- `GET /api/admin/users/DYNAMIC/role` at `src\services\admin\users.ts:10`
- `POST /api/admin/users/DYNAMIC/permissions` at `src\services\admin\users.ts:11`
- `POST /api/admin/users` at `src\services\admin\users.ts:13`
- `PUT /api/admin/users/DYNAMIC` at `src\services\admin\users.ts:18`
- `PUT /api/admin/users/DYNAMIC/permissions` at `src\services\admin\users.ts:23`
- `DELETE /api/admin/users/DYNAMIC` at `src\services\admin\users.ts:28`
- `POST /api/applications/DYNAMIC` at `src\services\applications.ts:60`
- `PUT /api/applications/DYNAMIC` at `src\services\applications.ts:73`
- `DELETE /api/applications/DYNAMIC` at `src\services\applications.ts:81`
- `PATCH /api/applications/DYNAMIC` at `src\services\applications.ts:88`
- `PATCH /api/applications/DYNAMIC` at `src\services\applications.ts:99`
- `PATCH /api/applications/DYNAMIC` at `src\services\applications.ts:113`
- `PATCH /api/applications/DYNAMIC` at `src\services\applications.ts:124`
- `PATCH /api/applications/DYNAMIC` at `src\services\applications.ts:130`
- `PATCH /api/applications/DYNAMIC` at `src\services\applications.ts:136`
- `PATCH /api/applications/DYNAMIC` at `src\services\applications.ts:142`
- `PATCH /api/applications/DYNAMIC` at `src\services\applications.ts:160`
- `PATCH /api/applications/DYNAMIC` at `src\services\applications.ts:178`
- `POST /api/auth/register` at `src\services\auth.ts:18`
- `POST /api/auth/login` at `src\services\auth.ts:30`
- `POST /api/auth/signin` at `src\services\auth.ts:35`
- `POST /api/notifications/send` at `src\services\backupRecovery.ts:851`
- `GET /api/catalog/programs` at `src\services\catalog.ts:47`
- `GET /api/catalog/intakes` at `src\services\catalog.ts:51`
- `GET /api/catalog/subjects` at `src\services\catalog.ts:55`
- `GET /api/catalog/institutions` at `src\services\catalog.ts:59`
- `GET /api/catalog/programs` at `src\services\catalog.ts:66`
- `POST /api/catalog/programs` at `src\services\catalog.ts:70`
- `PUT /api/catalog/programs` at `src\services\catalog.ts:77`
- `DELETE /api/catalog/programs` at `src\services\catalog.ts:84`
- `GET /api/catalog/intakes` at `src\services\catalog.ts:94`
- `POST /api/catalog/intakes` at `src\services\catalog.ts:98`
- `PUT /api/catalog/intakes` at `src\services\catalog.ts:105`
- `DELETE /api/catalog/intakes` at `src\services\catalog.ts:112`
- `GET /api/user-consents` at `src\services\consents.ts:26`
- `POST /api/user-consents` at `src\services\consents.ts:30`
- `GET /api/monitoring/database-metrics` at `src\services\databaseOptimization.ts:136`
- `POST /api/documents/extract` at `src\services\documentExtraction.ts:36`
- `POST /api/documents/upload` at `src\services\documents.ts:11`
- `POST /api/documents/acceptance-letter` at `src\services\documents.ts:19`
- `POST /api/documents/finance-receipt` at `src\services\documents.ts:25`
- `POST /api/interview/schedule` at `src\services\interviews.ts:27`
- `GET /api/interview/schedule${applicationId ? ` at `src\services\interviews.ts:33`
- `GET /api/interview/reminders` at `src\services\interviews.ts:38`
- `POST /api/notifications/send` at `src\services\notifications.ts:71`
- `POST /api/notifications/application-submitted` at `src\services\notifications.ts:88`
- `POST /api/notifications/dispatch-channel` at `src\services\notifications.ts:93`
- `GET /api/notifications/preferences?include_audit=DYNAMIC&audit_limit=DYNAMIC` at `src\services\notifications.ts:98`
- `POST /api/notifications/update-consent` at `src\services\notifications.ts:102`
- `POST /api/notifications/preferences` at `src\services\notifications.ts:109`
- `PUT /api/notifications/preferences` at `src\services\notifications.ts:115`
- `POST /api/notifications/consent` at `src\services\notifications.ts:121`
- `GET /api/notifications/consent` at `src\services\notifications.ts:132`
- `PUT /api/notifications/consent` at `src\services\notifications.ts:138`
- `DELETE /api/notifications/consent` at `src\services\notifications.ts:149`
- `POST /api/notifications/send` at `src\services\performanceAlerting.ts:600`
- `POST /api/notifications/send` at `src\services\performanceAlerting.ts:620`
- `POST /api/push-subscriptions` at `src\services\pushSubscriptions.ts:20`
- `POST /api/push-subscriptions/dispatch` at `src\services\pushSubscriptions.ts:25`
- `GET /api/monitoring/system-metrics` at `src\services\systemMonitoring.ts:107`
- `GET /api/monitoring/database-metrics` at `src\services\systemMonitoring.ts:119`
- `GET /api/monitoring/health` at `src\services\systemMonitoring.ts:131`
- `GET /api/monitoring/alerts` at `src\services\systemMonitoring.ts:143`
- `POST /api/monitoring/historical-metrics` at `src\services\systemMonitoring.ts:210`
- `POST /api/monitoring/alerts` at `src\services\systemMonitoring.ts:229`
- `PATCH /api/monitoring/alerts/DYNAMIC/resolve` at `src\services\systemMonitoring.ts:248`
- `POST /api/monitoring/track-metric` at `src\services\systemMonitoring.ts:329`

**2. Fix Authentication Mismatches (High)**

The following calls have authentication configuration issues:

- `/api/notifications?action=push-subscribe` at `src\services\pushNotificationManager.ts:527`

**3. Review Unused Endpoints (Low)**

The following backend endpoints are never called by frontend code:

- `/api/admin` in `api-src\admin.ts`
- `/api/bootstrap` in `api-src\bootstrap.ts`
- `/api/catalog` in `api-src\catalog.ts`
- `/api/documents` in `api-src\documents.ts`
- `/api/health` in `api-src\health.ts`
- `/api/payments` in `api-src\payments.ts`
- `/api/ping` in `api-src\ping.ts`

Consider removing these if they are truly unused, or document why they exist.

## Appendix: All Frontend Calls

Total: 92 API calls

| File | Line | Method | Endpoint | Auth |
|------|------|--------|----------|------|
| `src\hooks\admin\useApplicationStatusUpdate.ts` | 117 | POST | `/api/applications?id=DYNAMIC` | cookie |
| `src\hooks\auth\useOptimizedAuthState.ts` | 47 | GET | `/api/auth?action=session` | cookie |
| `src\hooks\auth\useProfileQuery.ts` | 152 | GET | `/api/auth?action=session` | cookie |
| `src\hooks\auth\useTokenRefresh.ts` | 36 | POST | `/api/auth?action=refresh` | cookie |
| `src\hooks\queries\useAuthMutations.ts` | 25 | POST | `/api/auth?action=logout` | cookie |
| `src\hooks\queries\useAuthMutations.ts` | 44 | POST | `/api/auth?action=refresh` | cookie |
| `src\hooks\queries\useAuthMutations.ts` | 66 | POST | `/api/auth?action=reset-password` | cookie |
| `src\hooks\queries\useSupabaseQuery.ts` | 87 | GET | `/api/auth?action=session` | cookie |
| `src\hooks\queries\useSupabaseQuery.ts` | 104 | GET | `/api/auth?action=session` | cookie |
| `src\hooks\useApplicationSubmitFixed.ts` | 195 | GET | `/api/auth?action=session` | cookie |
| `src\services\admin\audit.ts` | 47 | GET | `/api/auth?action=session` | cookie |
| `src\services\admin\dashboard.ts` | 317 | GET | `/api/admin/dashboard` | cookie |
| `src\services\admin\users.ts` | 5 | GET | `/api/admin/users` | cookie |
| `src\services\admin\users.ts` | 9 | GET | `/api/admin/users/DYNAMIC` | cookie |
| `src\services\admin\users.ts` | 10 | GET | `/api/admin/users/DYNAMIC/role` | cookie |
| `src\services\admin\users.ts` | 11 | POST | `/api/admin/users/DYNAMIC/permissions` | cookie |
| `src\services\admin\users.ts` | 13 | POST | `/api/admin/users` | cookie |
| `src\services\admin\users.ts` | 18 | PUT | `/api/admin/users/DYNAMIC` | cookie |
| `src\services\admin\users.ts` | 23 | PUT | `/api/admin/users/DYNAMIC/permissions` | cookie |
| `src\services\admin\users.ts` | 28 | DELETE | `/api/admin/users/DYNAMIC` | cookie |
| `src\services\applications.ts` | 48 | GET | `/api/applications` | cookie |
| `src\services\applications.ts` | 54 | GET | `/api/applications` | cookie |
| `src\services\applications.ts` | 60 | POST | `/api/applications/DYNAMIC` | cookie |
| `src\services\applications.ts` | 66 | POST | `/api/applications` | cookie |
| `src\services\applications.ts` | 73 | PUT | `/api/applications/DYNAMIC` | cookie |
| `src\services\applications.ts` | 81 | DELETE | `/api/applications/DYNAMIC` | cookie |
| `src\services\applications.ts` | 88 | PATCH | `/api/applications/DYNAMIC` | cookie |
| `src\services\applications.ts` | 99 | PATCH | `/api/applications/DYNAMIC` | cookie |
| `src\services\applications.ts` | 113 | PATCH | `/api/applications/DYNAMIC` | cookie |
| `src\services\applications.ts` | 124 | PATCH | `/api/applications/DYNAMIC` | cookie |
| `src\services\applications.ts` | 130 | PATCH | `/api/applications/DYNAMIC` | cookie |
| `src\services\applications.ts` | 136 | PATCH | `/api/applications/DYNAMIC` | cookie |
| `src\services\applications.ts` | 142 | PATCH | `/api/applications/DYNAMIC` | cookie |
| `src\services\applications.ts` | 160 | PATCH | `/api/applications/DYNAMIC` | cookie |
| `src\services\applications.ts` | 178 | PATCH | `/api/applications/DYNAMIC` | cookie |
| `src\services\auth.ts` | 18 | POST | `/api/auth/register` | cookie |
| `src\services\auth.ts` | 30 | POST | `/api/auth/login` | cookie |
| `src\services\auth.ts` | 35 | POST | `/api/auth/signin` | cookie |
| `src\services\backupRecovery.ts` | 851 | POST | `/api/notifications/send` | cookie |
| `src\services\catalog.ts` | 47 | GET | `/api/catalog/programs` | cookie |
| `src\services\catalog.ts` | 51 | GET | `/api/catalog/intakes` | cookie |
| `src\services\catalog.ts` | 55 | GET | `/api/catalog/subjects` | cookie |
| `src\services\catalog.ts` | 59 | GET | `/api/catalog/institutions` | cookie |
| `src\services\catalog.ts` | 66 | GET | `/api/catalog/programs` | cookie |
| `src\services\catalog.ts` | 70 | POST | `/api/catalog/programs` | cookie |
| `src\services\catalog.ts` | 77 | PUT | `/api/catalog/programs` | cookie |
| `src\services\catalog.ts` | 84 | DELETE | `/api/catalog/programs` | cookie |
| `src\services\catalog.ts` | 94 | GET | `/api/catalog/intakes` | cookie |
| `src\services\catalog.ts` | 98 | POST | `/api/catalog/intakes` | cookie |
| `src\services\catalog.ts` | 105 | PUT | `/api/catalog/intakes` | cookie |
| `src\services\catalog.ts` | 112 | DELETE | `/api/catalog/intakes` | cookie |
| `src\services\communicationService.ts` | 62 | GET | `/api/auth?action=session` | cookie |
| `src\services\communicationService.ts` | 182 | POST | `/api/notifications?action=send` | cookie |
| `src\services\consents.ts` | 26 | GET | `/api/user-consents` | cookie |
| `src\services\consents.ts` | 30 | POST | `/api/user-consents` | cookie |
| `src\services\databaseOptimization.ts` | 136 | GET | `/api/monitoring/database-metrics` | cookie |
| `src\services\documentExtraction.ts` | 36 | POST | `/api/documents/extract` | cookie |
| `src\services\documents.ts` | 11 | POST | `/api/documents/upload` | cookie |
| `src\services\documents.ts` | 19 | POST | `/api/documents/acceptance-letter` | cookie |
| `src\services\documents.ts` | 25 | POST | `/api/documents/finance-receipt` | cookie |
| `src\services\interviews.ts` | 27 | POST | `/api/interview/schedule` | cookie |
| `src\services\interviews.ts` | 33 | GET | `/api/interview/schedule${applicationId ? ` | cookie |
| `src\services\interviews.ts` | 38 | GET | `/api/interview/reminders` | cookie |
| `src\services\notifications.ts` | 71 | POST | `/api/notifications/send` | cookie |
| `src\services\notifications.ts` | 88 | POST | `/api/notifications/application-submitted` | cookie |
| `src\services\notifications.ts` | 93 | POST | `/api/notifications/dispatch-channel` | cookie |
| `src\services\notifications.ts` | 98 | GET | `/api/notifications/preferences?include_audit=DYNAMIC&audit_limit=DYNAMIC` | cookie |
| `src\services\notifications.ts` | 102 | POST | `/api/notifications/update-consent` | cookie |
| `src\services\notifications.ts` | 109 | POST | `/api/notifications/preferences` | cookie |
| `src\services\notifications.ts` | 115 | PUT | `/api/notifications/preferences` | cookie |
| `src\services\notifications.ts` | 121 | POST | `/api/notifications/consent` | cookie |
| `src\services\notifications.ts` | 132 | GET | `/api/notifications/consent` | cookie |
| `src\services\notifications.ts` | 138 | PUT | `/api/notifications/consent` | cookie |
| `src\services\notifications.ts` | 149 | DELETE | `/api/notifications/consent` | cookie |
| `src\services\offlineSync.ts` | 51 | GET | `/api/auth?action=session` | cookie |
| `src\services\optimizedAuthService.ts` | 67 | POST | `/api/sessions?action=track` | cookie |
| `src\services\optimizedAuthService.ts` | 102 | POST | `/api/auth?action=login` | cookie |
| `src\services\optimizedAuthService.ts` | 176 | GET | `/api/auth?action=session` | cookie |
| `src\services\performanceAlerting.ts` | 600 | POST | `/api/notifications/send` | cookie |
| `src\services\performanceAlerting.ts` | 620 | POST | `/api/notifications/send` | cookie |
| `src\services\pushNotificationManager.ts` | 527 | POST | `/api/notifications?action=push-subscribe` | none |
| `src\services\pushSubscriptions.ts` | 20 | POST | `/api/push-subscriptions` | cookie |
| `src\services\pushSubscriptions.ts` | 25 | POST | `/api/push-subscriptions/dispatch` | cookie |
| `src\services\sessionService.ts` | 35 | POST | `/api/sessions?action=revoke-all` | cookie |
| `src\services\systemMonitoring.ts` | 107 | GET | `/api/monitoring/system-metrics` | cookie |
| `src\services\systemMonitoring.ts` | 119 | GET | `/api/monitoring/database-metrics` | cookie |
| `src\services\systemMonitoring.ts` | 131 | GET | `/api/monitoring/health` | cookie |
| `src\services\systemMonitoring.ts` | 143 | GET | `/api/monitoring/alerts` | cookie |
| `src\services\systemMonitoring.ts` | 210 | POST | `/api/monitoring/historical-metrics` | cookie |
| `src\services\systemMonitoring.ts` | 229 | POST | `/api/monitoring/alerts` | cookie |
| `src\services\systemMonitoring.ts` | 248 | PATCH | `/api/monitoring/alerts/DYNAMIC/resolve` | cookie |
| `src\services\systemMonitoring.ts` | 329 | POST | `/api/monitoring/track-metric` | cookie |

## Appendix: All Backend Endpoints

Total: 12 endpoints

| File | Endpoint | Methods | Actions | Auth |
|------|----------|---------|---------|------|
| `api-src\[...path].ts` | `/api/[...path]` | GET,POST | - | No |
| `api-src\admin.ts` | `/api/admin` | GET,POST,PUT | dashboard, users, settings, register, stats... | Yes (admin, super_admin) |
| `api-src\applications.ts` | `/api/applications` | GET,POST,PUT,DELETE,PATCH | details, documents, grades, summary, review... | Yes |
| `api-src\auth.ts` | `/api/auth` | GET,POST | login, logout, register, session, refresh... | No |
| `api-src\bootstrap.ts` | `/api/bootstrap` | POST | - | No |
| `api-src\catalog.ts` | `/api/catalog` | GET | programs, intakes, subjects, institutions | No |
| `api-src\documents.ts` | `/api/documents` | GET,POST,DELETE | upload, extract, download, signed-url | Yes |
| `api-src\health.ts` | `/api/health` | GET | ping, db, env | No |
| `api-src\notifications.ts` | `/api/notifications` | GET,POST,DELETE | preferences, send, push-subscribe, push-send | Yes |
| `api-src\payments.ts` | `/api/payments` | GET | receipt | Yes |
| `api-src\ping.ts` | `/api/ping` | GET,POST | - | No |
| `api-src\sessions.ts` | `/api/sessions` | GET,POST | list, track, revoke, revoke-all | Yes |

---

*This report was generated by the MIHAS Frontend-Backend Forensic Audit System.*

**Validates**: Requirement 1.8 - CONTRACT_MISMATCH_REPORT generation