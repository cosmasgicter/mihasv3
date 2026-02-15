# MIHAS Full Forensic Audit Report

> Generated: 2026-02-15 16:48:58
> All 8 auditors + summary

---

# Contract Mismatch Report

> Forensic audit of frontend-backend API contract alignment

**Generated**: 2026-02-15T14:46:36.593Z
**Project Root**: C:\Users\Administrator\Documents\mihasv3
**Audit Version**: 1.0.0

## Executive Summary

**Report Generated**: 2026-02-15T14:46:36.681Z

### Contract Health Status

🔴 **CRITICAL** - Immediate action required

### Overview

| Metric | Count |
|--------|-------|
| Frontend API Calls | 75 |
| Backend Endpoints | 12 |
| Total Mismatches | 62 |

### Mismatches by Severity

| Severity | Type | Count |
|----------|------|-------|
| 🔴 Critical | MISSING_ENDPOINT | 54 |
| 🟠 High | AUTH_MISMATCH | 1 |
| 🟠 High | METHOD_MISMATCH | 0 |
| 🟡 Medium | SCHEMA_MISMATCH | 0 |
| 🟢 Low | UNUSED_ENDPOINT | 7 |

### Quick Stats

- **Matched Endpoints**: 5 / 12
- **Unmatched Frontend Calls**: 54
- **Auth Issues**: 1

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Mismatches by Type](#mismatches-by-type)
   - [MISSING_ENDPOINT](#-missing_endpoint-54)
   - [AUTH_MISMATCH](#-auth_mismatch-1)
   - [UNUSED_ENDPOINT](#-unused_endpoint-7)
3. [Recommendations](#recommendations)
4. [Appendix: All Frontend Calls](#appendix-all-frontend-calls)
5. [Appendix: All Backend Endpoints](#appendix-all-backend-endpoints)

## Mismatches by Type

### 🔴 MISSING_ENDPOINT (54)

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

**Evidence**: Frontend calls GET /api/catalog/programs at src\services\catalog.ts:47, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 47
- **Endpoint**: `/api/catalog/programs`
- **Method**: `GET`
- **Auth**: cookie

---

#### 26. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/catalog/intakes at src\services\catalog.ts:51, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 51
- **Endpoint**: `/api/catalog/intakes`
- **Method**: `GET`
- **Auth**: cookie

---

#### 27. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/catalog/subjects at src\services\catalog.ts:55, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 55
- **Endpoint**: `/api/catalog/subjects`
- **Method**: `GET`
- **Auth**: cookie

---

#### 28. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/catalog/institutions at src\services\catalog.ts:59, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 59
- **Endpoint**: `/api/catalog/institutions`
- **Method**: `GET`
- **Auth**: cookie

---

#### 29. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/catalog/programs at src\services\catalog.ts:66, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 66
- **Endpoint**: `/api/catalog/programs`
- **Method**: `GET`
- **Auth**: cookie

---

#### 30. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/catalog/programs at src\services\catalog.ts:70, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 70
- **Endpoint**: `/api/catalog/programs`
- **Method**: `POST`
- **Auth**: cookie

---

#### 31. MISSING_ENDPOINT

**Evidence**: Frontend calls PUT /api/catalog/programs at src\services\catalog.ts:77, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 77
- **Endpoint**: `/api/catalog/programs`
- **Method**: `PUT`
- **Auth**: cookie

---

#### 32. MISSING_ENDPOINT

**Evidence**: Frontend calls DELETE /api/catalog/programs at src\services\catalog.ts:84, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 84
- **Endpoint**: `/api/catalog/programs`
- **Method**: `DELETE`
- **Auth**: cookie

---

#### 33. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/catalog/intakes at src\services\catalog.ts:94, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 94
- **Endpoint**: `/api/catalog/intakes`
- **Method**: `GET`
- **Auth**: cookie

---

#### 34. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/catalog/intakes at src\services\catalog.ts:98, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 98
- **Endpoint**: `/api/catalog/intakes`
- **Method**: `POST`
- **Auth**: cookie

---

#### 35. MISSING_ENDPOINT

**Evidence**: Frontend calls PUT /api/catalog/intakes at src\services\catalog.ts:105, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 105
- **Endpoint**: `/api/catalog/intakes`
- **Method**: `PUT`
- **Auth**: cookie

---

#### 36. MISSING_ENDPOINT

**Evidence**: Frontend calls DELETE /api/catalog/intakes at src\services\catalog.ts:112, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\catalog.ts`
- **Line**: 112
- **Endpoint**: `/api/catalog/intakes`
- **Method**: `DELETE`
- **Auth**: cookie

---

#### 37. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/documents/extract at src\services\documentExtraction.ts:36, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\documentExtraction.ts`
- **Line**: 36
- **Endpoint**: `/api/documents/extract`
- **Method**: `POST`
- **Auth**: cookie

---

#### 38. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/documents/upload at src\services\documents.ts:11, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\documents.ts`
- **Line**: 11
- **Endpoint**: `/api/documents/upload`
- **Method**: `POST`
- **Auth**: cookie

---

#### 39. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/documents/acceptance-letter at src\services\documents.ts:19, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\documents.ts`
- **Line**: 19
- **Endpoint**: `/api/documents/acceptance-letter`
- **Method**: `POST`
- **Auth**: cookie

---

#### 40. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/documents/finance-receipt at src\services\documents.ts:25, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\documents.ts`
- **Line**: 25
- **Endpoint**: `/api/documents/finance-receipt`
- **Method**: `POST`
- **Auth**: cookie

---

#### 41. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/interview/schedule at src\services\interviews.ts:27, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\interviews.ts`
- **Line**: 27
- **Endpoint**: `/api/interview/schedule`
- **Method**: `POST`
- **Auth**: cookie

---

#### 42. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/interview/schedule${applicationId ?  at src\services\interviews.ts:33, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\interviews.ts`
- **Line**: 33
- **Endpoint**: `/api/interview/schedule${applicationId ? `
- **Method**: `GET`
- **Auth**: cookie

---

#### 43. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/interview/reminders at src\services\interviews.ts:38, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\interviews.ts`
- **Line**: 38
- **Endpoint**: `/api/interview/reminders`
- **Method**: `GET`
- **Auth**: cookie

---

#### 44. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/notifications/send at src\services\notifications.ts:71, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 71
- **Endpoint**: `/api/notifications/send`
- **Method**: `POST`
- **Auth**: cookie

---

#### 45. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/notifications/application-submitted at src\services\notifications.ts:88, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 88
- **Endpoint**: `/api/notifications/application-submitted`
- **Method**: `POST`
- **Auth**: cookie

---

#### 46. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/notifications/dispatch-channel at src\services\notifications.ts:93, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 93
- **Endpoint**: `/api/notifications/dispatch-channel`
- **Method**: `POST`
- **Auth**: cookie

---

#### 47. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/notifications/preferences?include_audit=DYNAMIC&audit_limit=DYNAMIC at src\services\notifications.ts:98, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 98
- **Endpoint**: `/api/notifications/preferences?include_audit=DYNAMIC&audit_limit=DYNAMIC`
- **Method**: `GET`
- **Auth**: cookie
- **Query Params**: {"include_audit":""}

---

#### 48. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/notifications/update-consent at src\services\notifications.ts:102, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 102
- **Endpoint**: `/api/notifications/update-consent`
- **Method**: `POST`
- **Auth**: cookie

---

#### 49. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/notifications/preferences at src\services\notifications.ts:109, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 109
- **Endpoint**: `/api/notifications/preferences`
- **Method**: `POST`
- **Auth**: cookie

---

#### 50. MISSING_ENDPOINT

**Evidence**: Frontend calls PUT /api/notifications/preferences at src\services\notifications.ts:115, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 115
- **Endpoint**: `/api/notifications/preferences`
- **Method**: `PUT`
- **Auth**: cookie

---

#### 51. MISSING_ENDPOINT

**Evidence**: Frontend calls POST /api/notifications/consent at src\services\notifications.ts:121, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 121
- **Endpoint**: `/api/notifications/consent`
- **Method**: `POST`
- **Auth**: cookie

---

#### 52. MISSING_ENDPOINT

**Evidence**: Frontend calls GET /api/notifications/consent at src\services\notifications.ts:132, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 132
- **Endpoint**: `/api/notifications/consent`
- **Method**: `GET`
- **Auth**: cookie

---

#### 53. MISSING_ENDPOINT

**Evidence**: Frontend calls PUT /api/notifications/consent at src\services\notifications.ts:138, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 138
- **Endpoint**: `/api/notifications/consent`
- **Method**: `PUT`
- **Auth**: cookie

---

#### 54. MISSING_ENDPOINT

**Evidence**: Frontend calls DELETE /api/notifications/consent at src\services\notifications.ts:149, but no matching backend endpoint exists

**Frontend Call**:
- **File**: `src\services\notifications.ts`
- **Line**: 149
- **Endpoint**: `/api/notifications/consent`
- **Method**: `DELETE`
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

Total: 75 API calls

| File | Line | Method | Endpoint | Auth |
|------|------|--------|----------|------|
| `src\hooks\admin\useApplicationStatusUpdate.ts` | 117 | POST | `/api/applications?id=DYNAMIC` | cookie |
| `src\hooks\auth\useOptimizedAuthState.ts` | 57 | GET | `/api/auth?action=session` | cookie |
| `src\hooks\auth\useProfileQuery.ts` | 74 | GET | `/api/auth?action=profile` | cookie |
| `src\hooks\auth\useProfileQuery.ts` | 137 | PATCH | `/api/auth?action=profile` | cookie |
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
| `src\services\pushNotificationManager.ts` | 527 | POST | `/api/notifications?action=push-subscribe` | none |
| `src\services\sessionService.ts` | 35 | POST | `/api/sessions?action=revoke-all` | cookie |

## Appendix: All Backend Endpoints

Total: 12 endpoints

| File | Endpoint | Methods | Actions | Auth |
|------|----------|---------|---------|------|
| `api-src\[...path].ts` | `/api/[...path]` | GET,POST | - | No |
| `api-src\admin.ts` | `/api/admin` | GET,POST,PUT | dashboard, users, settings, register, stats... | Yes (admin, super_admin) |
| `api-src\applications.ts` | `/api/applications` | GET,POST,PUT,DELETE,PATCH | details, documents, grades, summary, review... | Yes |
| `api-src\auth.ts` | `/api/auth` | GET,POST,PATCH | login, logout, register, session, refresh... | No |
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

---

# Page Validation Matrix Report

> Forensic audit of all page components for data loading, auth, error handling, state management, race conditions, and mobile responsiveness.

**Generated**: 2026-02-15T14:46:42.288Z
**Audit Version**: 1.0.0

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Page Validation Matrix](#page-validation-matrix)
3. [Detailed Findings](#detailed-findings)
4. [Recommendations](#recommendations)
5. [Appendix: Data Load Paths](#appendix-data-load-paths)

## Executive Summary

**Report Generated**: 2026-02-15T14:46:42.288Z

### Page Health Status

🔴 **CRITICAL** - Immediate action required

### Overview

| Metric | Count |
|--------|-------|
| Total Pages Analyzed | 65 |
| Pages with Issues | 62 |
| Healthy Pages | 3 |
| Warning Pages | 20 |
| Critical Pages | 42 |

### Issues by Category

| Category | Pages Affected | Status |
|----------|----------------|--------|
| Auth Issues | 38 | ⚠️ |
| Error Handling | 31 | ⚠️ |
| State Handling | 16 | ⚠️ |
| Race Conditions | 24 | ⚠️ |
| Mobile Responsiveness | 16 | ⚠️ |


## Page Validation Matrix

| Page | Health | Auth | Error | Loading | Empty | Race | Mobile |
|------|--------|------|-------|---------|-------|------|--------|
| `...lytics\components\AnalyticsHeader.tsx` | 🔴 | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `...lytics\components\MetricsOverview.tsx` | 🔴 | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `src\pages\admin\analytics\index.tsx` | 🔴 | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `src\pages\admin\Analytics.tsx` | 🔴 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `...ges\admin\ApplicationFlowAnalysis.tsx` | 🔴 | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `src\pages\admin\Applications.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `src\pages\admin\ApplicationsAdmin.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `src\pages\admin\AuditTrail.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `src\pages\admin\BatchOperations.tsx` | 🔴 | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `src\pages\admin\ComplianceAnalytics.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `...pages\admin\EligibilityManagement.tsx` | 🔴 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `src\pages\admin\Intakes.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `src\pages\admin\Monitoring.tsx` | 🔴 | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `src\pages\admin\Programs.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `src\pages\admin\RealtimeMetrics.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `src\pages\admin\RoleManagement.tsx` | 🔴 | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| `src\pages\admin\Settings.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `...pages\admin\SystemHealthDashboard.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `src\pages\admin\Users.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `src\pages\admin\WorkflowAutomation.tsx` | 🔴 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `src\pages\student\ApplicationDetail.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `src\pages\student\ApplicationStatus.tsx` | 🔴 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `...ard\components\AnalyticsDashboard.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `...ard\components\ApplicationPreview.tsx` | 🔴 | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `...ionWizard\components\DraftManager.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `...ponents\EnhancedProgressIndicator.tsx` | 🔴 | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `...cationWizard\components\FieldHelp.tsx` | 🔴 | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `...\components\KeyboardShortcutsHelp.tsx` | 🔴 | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `...izard\components\ReminderSettings.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| `...onWizard\components\StepChecklist.tsx` | 🔴 | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `...nWizard\components\StepTransition.tsx` | 🔴 | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `...zard\components\SubmissionSuccess.tsx` | 🔴 | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `...s\student\applicationWizard\index.tsx` | 🔴 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `...licationWizard\steps\BasicKycStep.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `...icationWizard\steps\EducationStep.tsx` | 🔴 | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `...plicationWizard\steps\PaymentStep.tsx` | 🔴 | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `...pplicationWizard\steps\SubmitStep.tsx` | 🔴 | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `src\pages\student\ApplicationWizard.tsx` | 🔴 | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `src\pages\student\Interview.tsx` | 🔴 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `...ages\student\NotificationSettings.tsx` | 🔴 | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `src\pages\student\Payment.tsx` | 🔴 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `src\pages\student\Settings.tsx` | 🔴 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `src\pages\admin\CacheMonitor.tsx` | 🟡 | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| `src\pages\admin\Dashboard.tsx` | 🟡 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `src\pages\admin\EnhancedDashboard.tsx` | 🟡 | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| `src\pages\AdminTest.tsx` | 🟡 | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `src\pages\auth\AuthCallbackPage.tsx` | 🟡 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `src\pages\auth\AuthLayout.tsx` | 🟡 | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `src\pages\auth\ForgotPasswordPage.tsx` | 🟡 | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| `src\pages\auth\ResetPasswordPage.tsx` | 🟡 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `src\pages\auth\SignInPage.tsx` | 🟡 | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `src\pages\auth\SignUpPage.tsx` | 🟡 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `src\pages\LandingPage.tsx` | 🟡 | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| `src\pages\NotFoundPage.tsx` | 🟡 | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `...ker\components\ApplicationActions.tsx` | 🟡 | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `...er\components\ApplicationInfoGrid.tsx` | 🟡 | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `...mponents\ApplicationStatusDetails.tsx` | 🟡 | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `...omponents\ApplicationStatusHeader.tsx` | 🟡 | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `...ic\tracker\components\HelpSection.tsx` | 🟡 | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `...\tracker\components\NoResultsView.tsx` | 🟡 | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| `...lic\tracker\components\ShareModal.tsx` | 🟡 | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `src\pages\PublicApplicationTracker.tsx` | 🟡 | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `...r\components\TrackerSearchSection.tsx` | 🟢 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `src\pages\public\tracker\index.tsx` | 🟢 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `src\pages\student\Dashboard.tsx` | 🟢 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Legend**: ✅ Pass | ❌ Fail | 🟢 Healthy | 🟡 Warning | 🔴 Critical

## Detailed Findings

### 🔴 Src\pages\admin\analytics\components\AnalyticsHeader

**File**: `src\pages\admin\analytics\components\AnalyticsHeader.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

#### Error Handling Issues

- No error handling mechanisms detected

---

### 🔴 Src\pages\admin\analytics\components\MetricsOverview

**File**: `src\pages\admin\analytics\components\MetricsOverview.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

#### Error Handling Issues

- No error handling mechanisms detected

---

### 🔴 Src\pages\admin\analytics\index

**File**: `src\pages\admin\analytics\index.tsx`
**Status**: CRITICAL

#### Error Handling Issues

- No error handling mechanisms detected

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

### 🔴 Src\pages\admin\Analytics

**File**: `src\pages\admin\Analytics.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing role check - should verify admin/super_admin role

#### Race Condition Risks

- 🔴 **HIGH**: State update 'setLoading' in async callback without cleanup mechanism
- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues
- 🔴 **HIGH**: State update 'setApplicationStats' in async callback without cleanup mechanism
- 🔴 **HIGH**: State update 'setProgramAnalytics' in async callback without cleanup mechanism
- 🔴 **HIGH**: State update 'setEligibilityAnalytics' in async callback without cleanup mechanism
- 🔴 **HIGH**: State update 'setAnalyticsSummary' in async callback without cleanup mechanism

---

### 🔴 Src\pages\admin\ApplicationFlowAnalysis

**File**: `src\pages\admin\ApplicationFlowAnalysis.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

#### Error Handling Issues

- No error handling mechanisms detected

---

### 🔴 Src\pages\admin\Applications

**File**: `src\pages\admin\Applications.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

#### Error Handling Issues

- Unhandled: service at line 200

#### Race Condition Risks

- 🟡 **MEDIUM**: Query 'applications' may depend on 'application' but lacks explicit dependency

---

### 🔴 Src\pages\admin\ApplicationsAdmin

**File**: `src\pages\admin\ApplicationsAdmin.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

#### Error Handling Issues

- Unhandled: service at line 642
- Unhandled: service at line 646

#### Race Condition Risks

- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues
- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues
- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues
- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues
- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues

---

### 🔴 Src\pages\admin\AuditTrail

**File**: `src\pages\admin\AuditTrail.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

#### Race Condition Risks

- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues

---

### 🔴 Src\pages\admin\BatchOperations

**File**: `src\pages\admin\BatchOperations.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

#### Error Handling Issues

- No error handling mechanisms detected

---

### 🔴 Src\pages\admin\ComplianceAnalytics

**File**: `src\pages\admin\ComplianceAnalytics.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

---

### 🔴 Src\pages\admin\EligibilityManagement

**File**: `src\pages\admin\EligibilityManagement.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing role check - should verify admin/super_admin role

#### Error Handling Issues

- Unhandled: service at line 62

#### State Handling Issues

- Missing empty state handling

#### Race Condition Risks

- 🔴 **HIGH**: State update 'setLoading' in async callback without cleanup mechanism

---

### 🔴 Src\pages\admin\Intakes

**File**: `src\pages\admin\Intakes.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

#### Race Condition Risks

- 🔴 **HIGH**: State update 'setLoading' in async callback without cleanup mechanism
- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues
- 🔴 **HIGH**: State update 'setError' in async callback without cleanup mechanism
- 🔴 **HIGH**: State update 'setIntakes' in async callback without cleanup mechanism

---

### 🔴 Src\pages\admin\Monitoring

**File**: `src\pages\admin\Monitoring.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

#### Error Handling Issues

- No error handling mechanisms detected

---

### 🔴 Src\pages\admin\Programs

**File**: `src\pages\admin\Programs.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

#### Error Handling Issues

- Unhandled: service at line 156
- Unhandled: service at line 184
- Unhandled: service at line 201

#### Race Condition Risks

- 🔴 **HIGH**: State update 'setLoading' in async callback without cleanup mechanism
- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues
- 🔴 **HIGH**: State update 'setError' in async callback without cleanup mechanism
- 🔴 **HIGH**: State update 'setPrograms' in async callback without cleanup mechanism

---

### 🔴 Src\pages\admin\RealtimeMetrics

**File**: `src\pages\admin\RealtimeMetrics.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

---

### 🔴 Src\pages\admin\RoleManagement

**File**: `src\pages\admin\RoleManagement.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

#### Error Handling Issues

- No error handling mechanisms detected

#### State Handling Issues

- Missing empty state handling

---

### 🔴 Src\pages\admin\Settings

**File**: `src\pages\admin\Settings.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

#### Race Condition Risks

- 🔴 **HIGH**: State update 'setLoading' in async callback without cleanup mechanism
- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues
- 🔴 **HIGH**: State update 'setSettings' in async callback without cleanup mechanism

---

### 🔴 Src\pages\admin\SystemHealthDashboard

**File**: `src\pages\admin\SystemHealthDashboard.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

---

### 🔴 Src\pages\admin\Users

**File**: `src\pages\admin\Users.tsx`
**Status**: CRITICAL

#### Auth Issues

- Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- Admin page missing role check - should verify admin/super_admin role

#### Race Condition Risks

- 🟡 **MEDIUM**: Query 'users' may depend on 'user' but lacks explicit dependency
- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues
- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues

---

### 🔴 Src\pages\admin\WorkflowAutomation

**File**: `src\pages\admin\WorkflowAutomation.tsx`
**Status**: CRITICAL

#### Race Condition Risks

- 🔴 **HIGH**: State update 'setLoading' in async callback without cleanup mechanism
- 🔴 **HIGH**: State update 'setRules' in async callback without cleanup mechanism
- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues
- 🔴 **HIGH**: State update 'setStats' in async callback without cleanup mechanism

---

### 🔴 Src\pages\student\ApplicationDetail

**File**: `src\pages\student\ApplicationDetail.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### Race Condition Risks

- 🔴 **HIGH**: State update 'setLoading' in async callback without cleanup mechanism
- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues
- 🔴 **HIGH**: State update 'setError' in async callback without cleanup mechanism

---

### 🔴 Src\pages\student\ApplicationStatus

**File**: `src\pages\student\ApplicationStatus.tsx`
**Status**: CRITICAL

#### State Handling Issues

- Missing empty state handling

#### Race Condition Risks

- 🔴 **HIGH**: State update 'setLoading' in async callback without cleanup mechanism
- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues
- 🔴 **HIGH**: State update 'setError' in async callback without cleanup mechanism

---

### 🔴 Src\pages\student\applicationWizard\components\AnalyticsDashboard

**File**: `src\pages\student\applicationWizard\components\AnalyticsDashboard.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

### 🔴 Src\pages\student\applicationWizard\components\ApplicationPreview

**File**: `src\pages\student\applicationWizard\components\ApplicationPreview.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### Error Handling Issues

- No error handling mechanisms detected

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

### 🔴 Src\pages\student\applicationWizard\components\DraftManager

**File**: `src\pages\student\applicationWizard\components\DraftManager.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### Race Condition Risks

- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues

---

### 🔴 Src\pages\student\applicationWizard\components\EnhancedProgressIndicator

**File**: `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### Error Handling Issues

- No error handling mechanisms detected

---

### 🔴 Src\pages\student\applicationWizard\components\FieldHelp

**File**: `src\pages\student\applicationWizard\components\FieldHelp.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### Error Handling Issues

- No error handling mechanisms detected

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

### 🔴 Src\pages\student\applicationWizard\components\KeyboardShortcutsHelp

**File**: `src\pages\student\applicationWizard\components\KeyboardShortcutsHelp.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### Error Handling Issues

- No error handling mechanisms detected

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

### 🔴 Src\pages\student\applicationWizard\components\ReminderSettings

**File**: `src\pages\student\applicationWizard\components\ReminderSettings.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

### 🔴 Src\pages\student\applicationWizard\components\StepChecklist

**File**: `src\pages\student\applicationWizard\components\StepChecklist.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### Error Handling Issues

- No error handling mechanisms detected

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

### 🔴 Src\pages\student\applicationWizard\components\StepTransition

**File**: `src\pages\student\applicationWizard\components\StepTransition.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### Error Handling Issues

- No error handling mechanisms detected

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

### 🔴 Src\pages\student\applicationWizard\components\SubmissionSuccess

**File**: `src\pages\student\applicationWizard\components\SubmissionSuccess.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### Error Handling Issues

- No error handling mechanisms detected

---

### 🔴 Src\pages\student\applicationWizard\index

**File**: `src\pages\student\applicationWizard\index.tsx`
**Status**: CRITICAL

#### Race Condition Risks

- 🔴 **HIGH**: useEffect without dependency array runs on every render, potentially causing race conditions

---

### 🔴 Src\pages\student\applicationWizard\steps\BasicKycStep

**File**: `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

---

### 🔴 Src\pages\student\applicationWizard\steps\EducationStep

**File**: `src\pages\student\applicationWizard\steps\EducationStep.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### Error Handling Issues

- No error handling mechanisms detected

---

### 🔴 Src\pages\student\applicationWizard\steps\PaymentStep

**File**: `src\pages\student\applicationWizard\steps\PaymentStep.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### Race Condition Risks

- 🟡 **MEDIUM**: Potential stale closure: variables [then, error, Failed] used but not in dependency array

---

### 🔴 Src\pages\student\applicationWizard\steps\SubmitStep

**File**: `src\pages\student\applicationWizard\steps\SubmitStep.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### Error Handling Issues

- No error handling mechanisms detected

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

### 🔴 Src\pages\student\ApplicationWizard

**File**: `src\pages\student\ApplicationWizard.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### Error Handling Issues

- No error handling mechanisms detected

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

### 🔴 Src\pages\student\Interview

**File**: `src\pages\student\Interview.tsx`
**Status**: CRITICAL

#### Race Condition Risks

- 🔴 **HIGH**: Async useEffect with state updates but no cleanup - may update unmounted component
- 🔴 **HIGH**: State update 'setState' in async callback without cleanup mechanism
- 🟡 **MEDIUM**: Potential stale closure: variables [fetchInterviews, prev, loading] used but not in dependency array

---

### 🔴 Src\pages\student\NotificationSettings

**File**: `src\pages\student\NotificationSettings.tsx`
**Status**: CRITICAL

#### Auth Issues

- Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

#### State Handling Issues

- Missing empty state handling

#### Race Condition Risks

- 🔴 **HIGH**: State update 'setLoading' in async callback without cleanup mechanism
- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues
- 🔴 **HIGH**: State update 'setError' in async callback without cleanup mechanism
- 🔴 **HIGH**: State update 'setPreferences' in async callback without cleanup mechanism

---

### 🔴 Src\pages\student\Payment

**File**: `src\pages\student\Payment.tsx`
**Status**: CRITICAL

#### Race Condition Risks

- 🔴 **HIGH**: Async useEffect with state updates but no cleanup - may update unmounted component
- 🔴 **HIGH**: State update 'setLoading' in async callback without cleanup mechanism
- 🟡 **MEDIUM**: Potential stale closure: variables [fetchApplications, Fetch, all] used but not in dependency array

---

### 🔴 Src\pages\student\Settings

**File**: `src\pages\student\Settings.tsx`
**Status**: CRITICAL

#### State Handling Issues

- Missing empty state handling

#### Race Condition Risks

- 🟡 **MEDIUM**: Query 'profile' may depend on 'profile' but lacks explicit dependency
- 🟡 **MEDIUM**: Query 'profile' may depend on 'profile' but lacks explicit dependency
- 🔴 **HIGH**: State update 'setLoading' in async callback without cleanup mechanism
- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues
- 🔴 **HIGH**: State update 'setError' in async callback without cleanup mechanism
- 🔴 **HIGH**: State update 'setSuccess' in async callback without cleanup mechanism

---

### 🟡 Src\pages\admin\CacheMonitor

**File**: `src\pages\admin\CacheMonitor.tsx`
**Status**: WARNING

#### Auth Issues

- Admin page missing role check - should verify admin/super_admin role

#### Error Handling Issues

- No error handling mechanisms detected

#### State Handling Issues

- Missing loading state handling
- Missing empty state handling

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

### 🟡 Src\pages\admin\Dashboard

**File**: `src\pages\admin\Dashboard.tsx`
**Status**: WARNING

#### Auth Issues

- Admin page missing role check - should verify admin/super_admin role

#### State Handling Issues

- Missing empty state handling

#### Race Condition Risks

- 🟡 **MEDIUM**: Potential stale closure: variables [logger, log, triggered] used but not in dependency array

---

### 🟡 Src\pages\admin\EnhancedDashboard

**File**: `src\pages\admin\EnhancedDashboard.tsx`
**Status**: WARNING

#### Auth Issues

- Admin page missing role check - should verify admin/super_admin role

#### Error Handling Issues

- No error handling mechanisms detected

#### State Handling Issues

- Missing empty state handling

---

### 🟡 Src\pages\AdminTest

**File**: `src\pages\AdminTest.tsx`
**Status**: WARNING

#### Error Handling Issues

- No error handling mechanisms detected

#### State Handling Issues

- Missing loading state handling
- Missing empty state handling

---

### 🟡 Src\pages\auth\AuthCallbackPage

**File**: `src\pages\auth\AuthCallbackPage.tsx`
**Status**: WARNING

#### State Handling Issues

- Missing empty state handling

#### Race Condition Risks

- 🟡 **MEDIUM**: Potential stale closure: variables [timeoutId, NodeJS, Timeout] used but not in dependency array

---

### 🟡 Src\pages\auth\AuthLayout

**File**: `src\pages\auth\AuthLayout.tsx`
**Status**: WARNING

#### Error Handling Issues

- No error handling mechanisms detected

---

### 🟡 Src\pages\auth\ForgotPasswordPage

**File**: `src\pages\auth\ForgotPasswordPage.tsx`
**Status**: WARNING

#### State Handling Issues

- Missing empty state handling

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

### 🟡 Src\pages\auth\ResetPasswordPage

**File**: `src\pages\auth\ResetPasswordPage.tsx`
**Status**: WARNING

#### State Handling Issues

- Missing empty state handling

#### Race Condition Risks

- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues
- 🟡 **MEDIUM**: Potential stale closure: variables [Get, token, from] used but not in dependency array

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

### 🟡 Src\pages\auth\SignInPage

**File**: `src\pages\auth\SignInPage.tsx`
**Status**: WARNING

#### State Handling Issues

- Missing empty state handling

#### Race Condition Risks

- 🟢 **LOW**: Multiple state updates in async flow may cause batching issues

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

### 🟡 Src\pages\auth\SignUpPage

**File**: `src\pages\auth\SignUpPage.tsx`
**Status**: WARNING

#### State Handling Issues

- Missing empty state handling

---

### 🟡 Src\pages\LandingPage

**File**: `src\pages\LandingPage.tsx`
**Status**: WARNING

#### Error Handling Issues

- No error handling mechanisms detected

#### State Handling Issues

- Missing empty state handling

---

### 🟡 Src\pages\NotFoundPage

**File**: `src\pages\NotFoundPage.tsx`
**Status**: WARNING

#### Error Handling Issues

- No error handling mechanisms detected

#### State Handling Issues

- Missing loading state handling
- Missing empty state handling

---

### 🟡 Src\pages\public\tracker\components\ApplicationActions

**File**: `src\pages\public\tracker\components\ApplicationActions.tsx`
**Status**: WARNING

#### Error Handling Issues

- No error handling mechanisms detected

---

### 🟡 Src\pages\public\tracker\components\ApplicationInfoGrid

**File**: `src\pages\public\tracker\components\ApplicationInfoGrid.tsx`
**Status**: WARNING

#### Error Handling Issues

- No error handling mechanisms detected

---

### 🟡 Src\pages\public\tracker\components\ApplicationStatusDetails

**File**: `src\pages\public\tracker\components\ApplicationStatusDetails.tsx`
**Status**: WARNING

#### Error Handling Issues

- No error handling mechanisms detected

---

### 🟡 Src\pages\public\tracker\components\ApplicationStatusHeader

**File**: `src\pages\public\tracker\components\ApplicationStatusHeader.tsx`
**Status**: WARNING

#### Error Handling Issues

- No error handling mechanisms detected

---

### 🟡 Src\pages\public\tracker\components\HelpSection

**File**: `src\pages\public\tracker\components\HelpSection.tsx`
**Status**: WARNING

#### Error Handling Issues

- No error handling mechanisms detected

---

### 🟡 Src\pages\public\tracker\components\NoResultsView

**File**: `src\pages\public\tracker\components\NoResultsView.tsx`
**Status**: WARNING

#### Error Handling Issues

- No error handling mechanisms detected

---

### 🟡 Src\pages\public\tracker\components\ShareModal

**File**: `src\pages\public\tracker\components\ShareModal.tsx`
**Status**: WARNING

#### Error Handling Issues

- No error handling mechanisms detected

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

### 🟡 Src\pages\PublicApplicationTracker

**File**: `src\pages\PublicApplicationTracker.tsx`
**Status**: WARNING

#### Error Handling Issues

- No error handling mechanisms detected

#### Mobile Responsiveness Issues

- Page lacks responsive styling (Tailwind breakpoints or media queries)

---

## Recommendations

### Priority Actions

**1. Fix Authentication Issues (Critical)**

The following protected pages have authentication issues:

- `src\pages\admin\analytics\components\AnalyticsHeader.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\admin\analytics\components\MetricsOverview.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\admin\Analytics.tsx`: Admin page missing role check - should verify admin/super_admin role
- `src\pages\admin\ApplicationFlowAnalysis.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\admin\Applications.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\admin\ApplicationsAdmin.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\admin\AuditTrail.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\admin\BatchOperations.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\admin\CacheMonitor.tsx`: Admin page missing role check - should verify admin/super_admin role
- `src\pages\admin\ComplianceAnalytics.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\admin\Dashboard.tsx`: Admin page missing role check - should verify admin/super_admin role
- `src\pages\admin\EligibilityManagement.tsx`: Admin page missing role check - should verify admin/super_admin role
- `src\pages\admin\EnhancedDashboard.tsx`: Admin page missing role check - should verify admin/super_admin role
- `src\pages\admin\Intakes.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\admin\Monitoring.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\admin\Programs.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\admin\RealtimeMetrics.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\admin\RoleManagement.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\admin\Settings.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\admin\SystemHealthDashboard.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\admin\Users.tsx`: Admin page missing auth check - should use useAuth, AdminRoute, or ProtectedRoute
- `src\pages\student\ApplicationDetail.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\applicationWizard\components\AnalyticsDashboard.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\applicationWizard\components\ApplicationPreview.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\applicationWizard\components\DraftManager.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\applicationWizard\components\FieldHelp.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\applicationWizard\components\KeyboardShortcutsHelp.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\applicationWizard\components\ReminderSettings.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\applicationWizard\components\StepChecklist.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\applicationWizard\components\StepTransition.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\applicationWizard\components\SubmissionSuccess.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\applicationWizard\steps\EducationStep.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\applicationWizard\steps\PaymentStep.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\applicationWizard\steps\SubmitStep.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\ApplicationWizard.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute
- `src\pages\student\NotificationSettings.tsx`: Student page missing auth check - should use useAuth, StudentRoute, or ProtectedRoute

**Action**: Add appropriate auth checks using `useAuth`, `ProtectedRoute`, or `AdminRoute`.

**2. Fix High-Severity Race Conditions (High)**

The following pages have high-severity race condition risks:

- `src\pages\admin\Analytics.tsx`: 5 high-severity risk(s)
- `src\pages\admin\EligibilityManagement.tsx`: 1 high-severity risk(s)
- `src\pages\admin\Intakes.tsx`: 3 high-severity risk(s)
- `src\pages\admin\Programs.tsx`: 3 high-severity risk(s)
- `src\pages\admin\Settings.tsx`: 2 high-severity risk(s)
- `src\pages\admin\WorkflowAutomation.tsx`: 3 high-severity risk(s)
- `src\pages\student\ApplicationDetail.tsx`: 2 high-severity risk(s)
- `src\pages\student\ApplicationStatus.tsx`: 2 high-severity risk(s)
- `src\pages\student\applicationWizard\index.tsx`: 1 high-severity risk(s)
- `src\pages\student\Interview.tsx`: 2 high-severity risk(s)
- `src\pages\student\NotificationSettings.tsx`: 3 high-severity risk(s)
- `src\pages\student\Payment.tsx`: 2 high-severity risk(s)
- `src\pages\student\Settings.tsx`: 3 high-severity risk(s)

**Action**: Add cleanup functions to async useEffects, use AbortController for fetch cancellation.

**3. Add Error Handling (Medium)**

The following pages lack error handling:

- `src\pages\admin\analytics\components\AnalyticsHeader.tsx`
- `src\pages\admin\analytics\components\MetricsOverview.tsx`
- `src\pages\admin\analytics\index.tsx`
- `src\pages\admin\ApplicationFlowAnalysis.tsx`
- `src\pages\admin\BatchOperations.tsx`
- `src\pages\admin\CacheMonitor.tsx`
- `src\pages\admin\EnhancedDashboard.tsx`
- `src\pages\admin\Monitoring.tsx`
- `src\pages\admin\RoleManagement.tsx`
- `src\pages\AdminTest.tsx`
- ... and 21 more

**Action**: Add try-catch blocks, .catch() handlers, or onError callbacks to API calls.

**4. Add Loading/Empty State Handling (Medium)**

The following pages lack proper state handling:

- `src\pages\admin\CacheMonitor.tsx`: Missing loading, empty state handling
- `src\pages\admin\Dashboard.tsx`: Missing empty state handling
- `src\pages\admin\EligibilityManagement.tsx`: Missing empty state handling
- `src\pages\admin\EnhancedDashboard.tsx`: Missing empty state handling
- `src\pages\admin\RoleManagement.tsx`: Missing empty state handling
- `src\pages\AdminTest.tsx`: Missing loading, empty state handling
- `src\pages\auth\AuthCallbackPage.tsx`: Missing empty state handling
- `src\pages\auth\ForgotPasswordPage.tsx`: Missing empty state handling
- `src\pages\auth\ResetPasswordPage.tsx`: Missing empty state handling
- `src\pages\auth\SignInPage.tsx`: Missing empty state handling
- ... and 6 more

**Action**: Add isLoading conditionals with Skeleton/Spinner components, and empty state UI.

**5. Improve Mobile Responsiveness (Low)**

The following pages lack responsive styling:

- `src\pages\admin\analytics\index.tsx`
- `src\pages\admin\CacheMonitor.tsx`
- `src\pages\auth\ForgotPasswordPage.tsx`
- `src\pages\auth\ResetPasswordPage.tsx`
- `src\pages\auth\SignInPage.tsx`
- `src\pages\public\tracker\components\ShareModal.tsx`
- `src\pages\PublicApplicationTracker.tsx`
- `src\pages\student\applicationWizard\components\AnalyticsDashboard.tsx`
- `src\pages\student\applicationWizard\components\ApplicationPreview.tsx`
- `src\pages\student\applicationWizard\components\FieldHelp.tsx`
- ... and 6 more

**Action**: Add Tailwind responsive prefixes (sm:, md:, lg:) for mobile-first design.

## Appendix: Data Load Paths

This section documents the data loading patterns for each page.

### Src\pages\admin\Analytics

**File**: `src\pages\admin\Analytics.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useRoleQuery | `/api/auth?action=session` | default |
| useToastStore | `unknown` | default |

### Src\pages\admin\Applications

**File**: `src\pages\admin\Applications.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useApplicationFilters | `unknown` | default |
| useApplicationsData | `unknown` | default |
| useToastStore | `unknown` | default |

### Src\pages\admin\ApplicationsAdmin

**File**: `src\pages\admin\ApplicationsAdmin.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useApplicationsData | `unknown` | default |
| useDebounce | `unknown` | default |
| useBulkOperations | `unknown` | default |

### Src\pages\admin\AuditTrail

**File**: `src\pages\admin\AuditTrail.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useToastStore | `unknown` | default |

### Src\pages\admin\CacheMonitor

**File**: `src\pages\admin\CacheMonitor.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useAuth | `/api/auth?action=session` | default |

### Src\pages\admin\ComplianceAnalytics

**File**: `src\pages\admin\ComplianceAnalytics.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useToastStore | `unknown` | default |
| useComplianceCheck | `unknown` | default |
| useGenerateComplianceReport | `unknown` | default |
| useValidateCompliance | `unknown` | default |

### Src\pages\admin\Dashboard

**File**: `src\pages\admin\Dashboard.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useIsMobile | `unknown` | default |
| useAuth | `/api/auth?action=session` | default |
| useProfileQuery | `/api/auth?action=session` | default |
| useAnalytics | `/api/admin?action=stats` | default |
| useAdminDashboardPolling | `/api/admin?action=dashboard` | default |
| useAdminDashboardRefresh | `/api/admin?action=dashboard` | default |

### Src\pages\admin\EligibilityManagement

**File**: `src\pages\admin\EligibilityManagement.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useAuth | `/api/auth?action=session` | default |
| useConfirmDialog | `unknown` | default |
| useToastStore | `unknown` | default |

### Src\pages\admin\EnhancedDashboard

**File**: `src\pages\admin\EnhancedDashboard.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useAuth | `/api/auth?action=session` | default |
| useProfileQuery | `/api/auth?action=session` | default |

### Src\pages\admin\RealtimeMetrics

**File**: `src\pages\admin\RealtimeMetrics.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useToastStore | `unknown` | default |
| useRealtimeMetrics | `unknown` | default |

### Src\pages\admin\RoleManagement

**File**: `src\pages\admin\RoleManagement.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useQuery | `unknown` | default |
| useMutation | `unknown` | default |

### Src\pages\admin\Settings

**File**: `src\pages\admin\Settings.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useConfirmDialog | `unknown` | default |

### Src\pages\admin\Users

**File**: `src\pages\admin\Users.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useUsers | `/api/admin?action=users` | default |
| useCreateUser | `unknown` | default |
| useUpdateUser | `unknown` | default |
| useDeleteUser | `unknown` | default |
| useUpdateUserPermissions | `unknown` | default |
| useUserPermissions | `/api/admin?action=users` | default |

### Src\pages\admin\WorkflowAutomation

**File**: `src\pages\admin\WorkflowAutomation.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useProfileQuery | `/api/auth?action=session` | default |
| useRoleQuery | `/api/auth?action=session` | default |
| useToastStore | `unknown` | default |

### Src\pages\AdminTest

**File**: `src\pages\AdminTest.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useAuth | `/api/auth?action=session` | default |
| useProfileQuery | `/api/auth?action=session` | default |
| useRoleQuery | `/api/auth?action=session` | default |

### Src\pages\auth\AuthCallbackPage

**File**: `src\pages\auth\AuthCallbackPage.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useNavigate | `unknown` | default |

### Src\pages\auth\ForgotPasswordPage

**File**: `src\pages\auth\ForgotPasswordPage.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useAuth | `/api/auth?action=session` | default |

### Src\pages\auth\ResetPasswordPage

**File**: `src\pages\auth\ResetPasswordPage.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useAuth | `/api/auth?action=session` | default |
| useNavigate | `unknown` | default |

### Src\pages\auth\SignInPage

**File**: `src\pages\auth\SignInPage.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useNavigate | `unknown` | default |
| useLocation | `unknown` | default |
| useAuth | `/api/auth?action=session` | default |

### Src\pages\auth\SignUpPage

**File**: `src\pages\auth\SignUpPage.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useNavigate | `unknown` | default |
| useAuth | `/api/auth?action=session` | default |

### Src\pages\LandingPage

**File**: `src\pages\LandingPage.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useAuth | `/api/auth?action=session` | default |
| useNavigate | `unknown` | default |

### Src\pages\NotFoundPage

**File**: `src\pages\NotFoundPage.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useLocation | `unknown` | default |
| useAuth | `/api/auth?action=session` | default |

### Src\pages\public\tracker\index

**File**: `src\pages\public\tracker\index.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useToastStore | `unknown` | default |
| useApplicationTracker | `unknown` | default |

### Src\pages\student\ApplicationStatus

**File**: `src\pages\student\ApplicationStatus.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useNavigate | `unknown` | default |
| useAuth | `/api/auth?action=session` | default |

### Src\pages\student\applicationWizard\components\DraftManager

**File**: `src\pages\student\applicationWizard\components\DraftManager.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useMultiDraft | `unknown` | default |

### Src\pages\student\applicationWizard\components\EnhancedProgressIndicator

**File**: `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useOptimizedAnimation | `unknown` | default |

### Src\pages\student\applicationWizard\components\ReminderSettings

**File**: `src\pages\student\applicationWizard\components\ReminderSettings.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useToastStore | `unknown` | default |

### Src\pages\student\applicationWizard\index

**File**: `src\pages\student\applicationWizard\index.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useWizardController | `unknown` | default |
| useStepValidation | `unknown` | default |
| useOverallProgress | `unknown` | default |
| useSmartAutoSave | `unknown` | default |
| useEstimatedTime | `unknown` | default |
| useOptimizedAnimation | `unknown` | default |

### Src\pages\student\applicationWizard\steps\BasicKycStep

**File**: `src\pages\student\applicationWizard\steps\BasicKycStep.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useOptimizedAnimation | `unknown` | default |

### Src\pages\student\Dashboard

**File**: `src\pages\student\Dashboard.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useAuth | `/api/auth?action=session` | default |
| useProfileQuery | `/api/auth?action=session` | default |
| useConfirmDialog | `unknown` | default |
| useStudentDashboardRefresh | `/api/applications` | default |

### Src\pages\student\Interview

**File**: `src\pages\student\Interview.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useAuth | `/api/auth?action=session` | default |

### Src\pages\student\Payment

**File**: `src\pages\student\Payment.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useNavigate | `unknown` | default |
| useAuth | `/api/auth?action=session` | default |

### Src\pages\student\Settings

**File**: `src\pages\student\Settings.tsx`

| Hook | Endpoint | Cache Strategy |
|------|----------|----------------|
| useAuth | `/api/auth?action=session` | default |
| useProfileQuery | `/api/auth?action=session` | default |
| useProfileAutoPopulation | `unknown` | default |

---

*This report was generated by the MIHAS Frontend-Backend Forensic Audit System.*

**Validates**: Requirements 2.1-2.12 - Page-by-Page Functional Audit

---

# Loader Unification Plan

> Forensic audit of all loader/spinner/skeleton implementations with a detailed unification strategy.

**Generated**: 2026-02-15T14:46:45.190Z
**Audit Version**: 1.0.0

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Loader Inventory](#loader-inventory)
3. [Redundant Loader Groups](#redundant-loader-groups)
4. [Replacement Strategy](#replacement-strategy)
5. [Global Loading State Management](#global-loading-state-management)
6. [Action Items](#action-items)
7. [Appendix: Loader Usages](#appendix-loader-usages)

## Executive Summary

**Report Generated**: 2026-02-15T14:46:45.190Z

### Loader System Health Status

 **CRITICAL** - High loader redundancy

### Overview

| Metric | Count |
|--------|-------|
| Total Loader Definitions | 57 |
| Total Loader Usages | 359 |
| Unique Loader Components | 46 |
| Redundant Loaders | 49 |
| Redundant Groups | 5 |

### Loaders by Type

| Type | Total | Redundant | Keep |
|------|-------|-----------|------|
|  Spinner | 105 | 9 | 96 |
|  Skeleton | 196 | 32 | 164 |
|  Progress | 14 | 6 | 8 |
|  Overlay | 9 | 1 | 8 |
|  Inline | 8 | 1 | 7 |


## Loader Inventory

Complete list of all loader components found in the codebase.

### Loader Definitions

| Component | Type | File | Line | Status |
|-----------|------|------|------|--------|
| `ProgressBar` |  progress | `src\components\8starlabs\partition-bar.tsx` | 125 |  Redundant |
| `ApplicationsSkeleton` |  skeleton | `...dmin\applications\ApplicationsSkeleton.tsx` | 3 |  Redundant |
| `DashboardSkeleton` |  skeleton | `src\components\admin\DashboardSkeleton.tsx` | 3 |  Redundant |
| `DashboardSkeleton` |  skeleton | `src\components\student\DashboardSkeleton.tsx` | 171 |  Redundant |
| `StudentDashboardSkeleton` |  skeleton | `...nents\student\StudentDashboardSkeleton.tsx` | 3 |  Redundant |
| `ApplicationProgress` |  progress | `src\components\ui\ApplicationProgress.tsx` | 10 |  Redundant |
| `AuthLoadingOverlay` |  overlay | `src\components\ui\AuthLoadingOverlay.tsx` | 17 |  Redundant |
| `EnhancedLoadingSpinner` |  spinner | `src\components\ui\EnhancedLoadingSpinner.tsx` | 39 |  Redundant |
| `FullScreenLoader` |  overlay | `src\components\ui\EnhancedLoadingSpinner.tsx` | 117 |  Keep |
| `SkeletonCard` |  skeleton | `src\components\ui\EnhancedLoadingSpinner.tsx` | 142 |  Redundant |
| `SkeletonTable` |  skeleton | `src\components\ui\EnhancedLoadingSpinner.tsx` | 154 |  Redundant |
| `SkeletonForm` |  skeleton | `src\components\ui\EnhancedLoadingSpinner.tsx` | 169 |  Redundant |
| `LoadingButton` |  inline | `src\components\ui\EnhancedLoadingSpinner.tsx` | 181 |  Keep |
| `FancyPreloader` |  spinner | `src\components\ui\FancyPreloader.tsx` | 4 |  Redundant |
| `InlineLoader` |  inline | `src\components\ui\InlineLoader.tsx` | 21 |  Keep |
| `DataTableLoader` |  spinner | `src\components\ui\InlineLoader.tsx` | 73 |  Redundant |
| `FormSubmissionLoader` |  spinner | `src\components\ui\InlineLoader.tsx` | 85 |  Keep |
| `PageContentLoader` |  spinner | `src\components\ui\InlineLoader.tsx` | 95 |  Redundant |
| `LoadingButton` |  inline | `src\components\ui\LoadingButton.tsx` | 20 |  Redundant |
| `LoadingFallback` |  spinner | `src\components\ui\LoadingFallback.tsx` | 20 |  Redundant |
| `LoadingOverlay` |  overlay | `src\components\ui\LoadingOverlay.tsx` | 19 |  Keep |
| `LoadingSpinner` |  spinner | `src\components\ui\LoadingSpinner.tsx` | 18 |  Redundant |
| `LoadingState` |  spinner | `src\components\ui\LoadingState.tsx` | 11 |  Keep |
| `Skeleton` |  skeleton | `src\components\ui\LoadingState.tsx` | 38 |  Keep |
| `TableSkeleton` |  skeleton | `src\components\ui\LoadingState.tsx` | 51 |  Redundant |
| `CardSkeleton` |  skeleton | `src\components\ui\LoadingState.tsx` | 65 |  Redundant |
| `PageLoadingFallback` |  spinner | `src\components\ui\PageLoadingFallback.tsx` | 25 |  Redundant |
| `CompactLoadingFallback` |  spinner | `src\components\ui\PageLoadingFallback.tsx` | 45 |  Redundant |
| `Progress` |  progress | `src\components\ui\progress.tsx` | 8 |  Keep |
| `ProgressIndicator` |  progress | `src\components\ui\ProgressIndicator.tsx` | 20 |  Redundant |
| `CircularProgress` |  progress | `src\components\ui\ProgressIndicator.tsx` | 95 |  Redundant |
| `IndeterminateProgress` |  progress | `src\components\ui\ProgressIndicator.tsx` | 154 |  Redundant |
| `Skeleton` |  skeleton | `src\components\ui\skeleton.tsx` | 11 |  Redundant |
| `SkeletonText` |  skeleton | `src\components\ui\skeleton.tsx` | 49 |  Redundant |
| `SkeletonCard` |  skeleton | `src\components\ui\skeleton.tsx` | 63 |  Redundant |
| `SkeletonTable` |  skeleton | `src\components\ui\skeleton.tsx` | 78 |  Redundant |
| `SkeletonDashboard` |  skeleton | `src\components\ui\skeleton.tsx` | 99 |  Redundant |
| `SkeletonLoader` |  skeleton | `src\components\ui\SkeletonLoader.tsx` | 13 |  Redundant |
| `SkeletonCard` |  skeleton | `src\components\ui\SkeletonLoader.tsx` | 53 |  Redundant |
| `SkeletonTable` |  skeleton | `src\components\ui\SkeletonLoader.tsx` | 63 |  Redundant |
| `SkeletonAvatar` |  skeleton | `src\components\ui\SkeletonLoader.tsx` | 90 |  Redundant |
| `SkeletonBase` |  skeleton | `src\components\ui\skeletons\index.tsx` | 29 |  Redundant |
| `SkeletonCard` |  skeleton | `src\components\ui\skeletons\index.tsx` | 75 |  Redundant |
| `SkeletonTable` |  skeleton | `src\components\ui\skeletons\index.tsx` | 114 |  Redundant |
| `SkeletonForm` |  skeleton | `src\components\ui\skeletons\index.tsx` | 154 |  Redundant |
| `SkeletonHero` |  skeleton | `src\components\ui\skeletons\index.tsx` | 183 |  Redundant |
| `SkeletonDashboard` |  skeleton | `src\components\ui\skeletons\index.tsx` | 234 |  Redundant |
| `SkeletonStats` |  skeleton | `src\components\ui\skeletons\index.tsx` | 268 |  Redundant |
| `SkeletonTimeline` |  skeleton | `src\components\ui\skeletons\index.tsx` | 290 |  Redundant |
| `SkeletonNavigation` |  skeleton | `src\components\ui\skeletons\index.tsx` | 319 |  Redundant |
| `SkeletonList` |  skeleton | `src\components\ui\skeletons\index.tsx` | 352 |  Redundant |
| `SkeletonProfile` |  skeleton | `src\components\ui\skeletons\index.tsx` | 380 |  Redundant |
| `SkeletonWrapper` |  skeleton | `src\components\ui\skeletons\index.tsx` | 415 |  Redundant |
| `UnifiedLoader` |  spinner | `src\components\ui\UnifiedLoader.tsx` | 356 |  Redundant |
| `SkeletonProvider` |  skeleton | `src\contexts\SkeletonContext.tsx` | 56 |  Redundant |
| `SkeletonContext` |  skeleton | `src\contexts\SkeletonContext.tsx` | 49 |  Redundant |
| `EnhancedProgressIndicator` |  progress | `...d\components\EnhancedProgressIndicator.tsx` | 198 |  Redundant |

**Legend**: 🟢 Keep | 🔴 Redundant

## Redundant Loader Groups

The following groups of loaders serve similar purposes and should be unified.

###  redundant-loader-group-1

**Type**: progress
**Similarity**: 80%
**Confidence**: likely

#### Keep (Primary)

- **`Progress`**
  - File: `src\components\ui\progress.tsx`
  - Line: 8
  - Global: No

#### Remove (Redundant)

- **`ProgressBar`**
  - File: `src\components\8starlabs\partition-bar.tsx`
  - Line: 125
- **`ApplicationProgress`**
  - File: `src\components\ui\ApplicationProgress.tsx`
  - Line: 10
- **`ProgressIndicator`**
  - File: `src\components\ui\ProgressIndicator.tsx`
  - Line: 20
- **`CircularProgress`**
  - File: `src\components\ui\ProgressIndicator.tsx`
  - Line: 95
- **`IndeterminateProgress`**
  - File: `src\components\ui\ProgressIndicator.tsx`
  - Line: 154
- **`EnhancedProgressIndicator`**
  - File: `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`
  - Line: 198

#### Reason

> Same loader type: progress; Serve the same functional purpose based on naming patterns; Similar names: "ProgressBar" and "Progress"; One appears to be a variant/enhanced version of the other; Similar names: "ApplicationProgress" and "Progress"; Similar names: "Progress" and "ProgressIndicator"; Similar names: "Progress" and "CircularProgress"; Similar names: "Progress" and "IndeterminateProgress"; Similar names: "Progress" and "EnhancedProgressIndicator"; Similar names: "ProgressIndicator" and "EnhancedProgressIndicator"

---

###  redundant-loader-group-2

**Type**: skeleton
**Similarity**: 82%
**Confidence**: likely

#### Keep (Primary)

- **`Skeleton`**
  - File: `src\components\ui\LoadingState.tsx`
  - Line: 38
  - Global: No

#### Remove (Redundant)

- **`ApplicationsSkeleton`**
  - File: `src\components\admin\applications\ApplicationsSkeleton.tsx`
  - Line: 3
- **`DashboardSkeleton`**
  - File: `src\components\admin\DashboardSkeleton.tsx`
  - Line: 3
- **`DashboardSkeleton`**
  - File: `src\components\student\DashboardSkeleton.tsx`
  - Line: 171
- **`StudentDashboardSkeleton`**
  - File: `src\components\student\StudentDashboardSkeleton.tsx`
  - Line: 3
- **`SkeletonCard`**
  - File: `src\components\ui\EnhancedLoadingSpinner.tsx`
  - Line: 142
- **`SkeletonTable`**
  - File: `src\components\ui\EnhancedLoadingSpinner.tsx`
  - Line: 154
- **`SkeletonForm`**
  - File: `src\components\ui\EnhancedLoadingSpinner.tsx`
  - Line: 169
- **`TableSkeleton`**
  - File: `src\components\ui\LoadingState.tsx`
  - Line: 51
- **`CardSkeleton`**
  - File: `src\components\ui\LoadingState.tsx`
  - Line: 65
- **`Skeleton`**
  - File: `src\components\ui\skeleton.tsx`
  - Line: 11
- **`SkeletonText`**
  - File: `src\components\ui\skeleton.tsx`
  - Line: 49
- **`SkeletonCard`**
  - File: `src\components\ui\skeleton.tsx`
  - Line: 63
- **`SkeletonTable`**
  - File: `src\components\ui\skeleton.tsx`
  - Line: 78
- **`SkeletonDashboard`**
  - File: `src\components\ui\skeleton.tsx`
  - Line: 99
- **`SkeletonLoader`**
  - File: `src\components\ui\SkeletonLoader.tsx`
  - Line: 13
- **`SkeletonCard`**
  - File: `src\components\ui\SkeletonLoader.tsx`
  - Line: 53
- **`SkeletonTable`**
  - File: `src\components\ui\SkeletonLoader.tsx`
  - Line: 63
- **`SkeletonAvatar`**
  - File: `src\components\ui\SkeletonLoader.tsx`
  - Line: 90
- **`SkeletonBase`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 29
- **`SkeletonCard`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 75
- **`SkeletonTable`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 114
- **`SkeletonForm`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 154
- **`SkeletonHero`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 183
- **`SkeletonDashboard`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 234
- **`SkeletonStats`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 268
- **`SkeletonTimeline`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 290
- **`SkeletonNavigation`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 319
- **`SkeletonList`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 352
- **`SkeletonProfile`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 380
- **`SkeletonWrapper`**
  - File: `src\components\ui\skeletons\index.tsx`
  - Line: 415
- **`SkeletonProvider`**
  - File: `src\contexts\SkeletonContext.tsx`
  - Line: 56
- **`SkeletonContext`**
  - File: `src\contexts\SkeletonContext.tsx`
  - Line: 49

#### Reason

> Same loader type: skeleton; Serve the same functional purpose based on naming patterns; Similar names: "ApplicationsSkeleton" and "Skeleton"; Similar names: "ApplicationsSkeleton" and "SkeletonLoader"; Similar names: "DashboardSkeleton" and "DashboardSkeleton"; Similar names: "DashboardSkeleton" and "StudentDashboardSkeleton"; Similar names: "DashboardSkeleton" and "Skeleton"; Similar names: "DashboardSkeleton" and "SkeletonLoader"; Similar names: "StudentDashboardSkeleton" and "Skeleton"; Similar names: "StudentDashboardSkeleton" and "SkeletonLoader"; Similar names: "SkeletonCard" and "Skeleton"; Similar names: "SkeletonCard" and "SkeletonCard"; Similar names: "SkeletonCard" and "SkeletonLoader"; Similar names: "SkeletonTable" and "Skeleton"; Similar names: "SkeletonTable" and "SkeletonTable"; Similar names: "SkeletonTable" and "SkeletonLoader"; Similar names: "SkeletonForm" and "Skeleton"; Similar names: "SkeletonForm" and "SkeletonLoader"; Similar names: "SkeletonForm" and "SkeletonForm"; Similar names: "Skeleton" and "TableSkeleton"; Similar names: "Skeleton" and "CardSkeleton"; Similar names: "Skeleton" and "Skeleton"; Similar names: "Skeleton" and "SkeletonText"; Similar names: "Skeleton" and "SkeletonCard"; Similar names: "Skeleton" and "SkeletonTable"; Similar names: "Skeleton" and "SkeletonDashboard"; Similar names: "Skeleton" and "SkeletonLoader"; Similar names: "Skeleton" and "SkeletonAvatar"; Similar names: "Skeleton" and "SkeletonBase"; Similar names: "Skeleton" and "SkeletonForm"; Similar names: "Skeleton" and "SkeletonHero"; Similar names: "Skeleton" and "SkeletonStats"; Similar names: "Skeleton" and "SkeletonTimeline"; Similar names: "Skeleton" and "SkeletonNavigation"; Similar names: "Skeleton" and "SkeletonList"; Similar names: "Skeleton" and "SkeletonProfile"; Similar names: "Skeleton" and "SkeletonWrapper"; Similar names: "Skeleton" and "SkeletonProvider"; Similar names: "Skeleton" and "SkeletonContext"; Similar names: "TableSkeleton" and "Skeleton"; Similar names: "TableSkeleton" and "SkeletonLoader"; Similar names: "CardSkeleton" and "Skeleton"; Similar names: "CardSkeleton" and "SkeletonLoader"; Similar names: "SkeletonText" and "SkeletonLoader"; Similar names: "SkeletonText" and "SkeletonContext"; Similar names: "SkeletonDashboard" and "SkeletonLoader"; Similar names: "SkeletonDashboard" and "SkeletonDashboard"; Similar names: "SkeletonLoader" and "SkeletonCard"; Similar names: "SkeletonLoader" and "SkeletonTable"; Similar names: "SkeletonLoader" and "SkeletonAvatar"; Similar names: "SkeletonLoader" and "SkeletonBase"; Similar names: "SkeletonLoader" and "SkeletonForm"; Similar names: "SkeletonLoader" and "SkeletonHero"; Similar names: "SkeletonLoader" and "SkeletonDashboard"; Similar names: "SkeletonLoader" and "SkeletonStats"; Similar names: "SkeletonLoader" and "SkeletonTimeline"; Similar names: "SkeletonLoader" and "SkeletonNavigation"; Similar names: "SkeletonLoader" and "SkeletonList"; Similar names: "SkeletonLoader" and "SkeletonProfile"; Similar names: "SkeletonLoader" and "SkeletonWrapper"; Similar names: "SkeletonLoader" and "SkeletonProvider"; Similar names: "SkeletonLoader" and "SkeletonContext"; Similar names: "SkeletonProfile" and "SkeletonProvider"

---

###  redundant-loader-group-3

**Type**: overlay
**Similarity**: 96%
**Confidence**: certain

#### Keep (Primary)

- **`LoadingOverlay`**
  - File: `src\components\ui\LoadingOverlay.tsx`
  - Line: 19
  - Global: No

#### Remove (Redundant)

- **`AuthLoadingOverlay`**
  - File: `src\components\ui\AuthLoadingOverlay.tsx`
  - Line: 17

#### Reason

> Similar names: "AuthLoadingOverlay" and "LoadingOverlay"; Same loader type: overlay; Serve the same functional purpose based on naming patterns

---

###  redundant-loader-group-4

**Type**: spinner
**Similarity**: 69%
**Confidence**: possible

#### Keep (Primary)

- **`LoadingState`**
  - File: `src\components\ui\LoadingState.tsx`
  - Line: 11
  - Global: No

#### Remove (Redundant)

- **`EnhancedLoadingSpinner`**
  - File: `src\components\ui\EnhancedLoadingSpinner.tsx`
  - Line: 39
- **`FancyPreloader`**
  - File: `src\components\ui\FancyPreloader.tsx`
  - Line: 4
- **`DataTableLoader`**
  - File: `src\components\ui\InlineLoader.tsx`
  - Line: 73
- **`PageContentLoader`**
  - File: `src\components\ui\InlineLoader.tsx`
  - Line: 95
- **`LoadingFallback`**
  - File: `src\components\ui\LoadingFallback.tsx`
  - Line: 20
- **`LoadingSpinner`**
  - File: `src\components\ui\LoadingSpinner.tsx`
  - Line: 18
- **`PageLoadingFallback`**
  - File: `src\components\ui\PageLoadingFallback.tsx`
  - Line: 25
- **`CompactLoadingFallback`**
  - File: `src\components\ui\PageLoadingFallback.tsx`
  - Line: 45
- **`UnifiedLoader`**
  - File: `src\components\ui\UnifiedLoader.tsx`
  - Line: 356

#### Reason

> Same loader type: spinner; Serve the same functional purpose based on naming patterns; One appears to be a variant/enhanced version of the other; Similar names: "EnhancedLoadingSpinner" and "LoadingSpinner"; Similar names: "LoadingFallback" and "PageLoadingFallback"; Similar names: "LoadingFallback" and "CompactLoadingFallback"

---

###  redundant-loader-group-5

**Type**: inline
**Similarity**: 100%
**Confidence**: certain

#### Keep (Primary)

- **`LoadingButton`**
  - File: `src\components\ui\EnhancedLoadingSpinner.tsx`
  - Line: 181
  - Global: No

#### Remove (Redundant)

- **`LoadingButton`**
  - File: `src\components\ui\LoadingButton.tsx`
  - Line: 20

#### Reason

> Similar names: "LoadingButton" and "LoadingButton"; Same loader type: inline; Serve the same functional purpose based on naming patterns

---

## Replacement Strategy

This section provides a detailed plan for migrating to the UnifiedLoader component.

### Target: UnifiedLoader Component

All loaders should be replaced with the `UnifiedLoader` component located at:

```
src/components/ui/UnifiedLoader.tsx
```

### UnifiedLoader Variants

| Variant | Use Case | Replaces |
|---------|----------|----------|
| `page` | Full page loading states | LoadingFallback, PageLoader, FullScreenLoader |
| `inline` | Within content loading | LoadingSpinner, InlineLoader, Spinner |
| `skeleton` | Placeholder content | Skeleton, SkeletonCard, SkeletonTable |
| `overlay` | Modal-like overlay | LoadingOverlay, AuthLoadingOverlay |

### UnifiedLoader Sizes

| Size | Use Case |
|------|----------|
| `sm` | Buttons, inline text |
| `md` | Cards, sections (default) |
| `lg` | Full page, modals |

### Migration Examples

#### Migrating Progress

**Before:**
```tsx
<Progress />
```

**After:**
```tsx
<UnifiedLoader variant="inline" />
```

#### Migrating Skeleton

**Before:**
```tsx
<Skeleton />
```

**After:**
```tsx
<UnifiedLoader variant="skeleton" />
```

#### Migrating LoadingOverlay

**Before:**
```tsx
<LoadingOverlay />
```

**After:**
```tsx
<UnifiedLoader variant="overlay" />
```

#### Migrating LoadingState

**Before:**
```tsx
<LoadingState />
```

**After:**
```tsx
<UnifiedLoader variant="inline" />
```

#### Migrating LoadingButton

**Before:**
```tsx
<LoadingButton />
```

**After:**
```tsx
<UnifiedLoader variant="inline" />
```

## Global Loading State Management

The application uses a Zustand store for managing global loading states.

### Loading Store Location

```
src/stores/loadingStore.ts
```

### Usage Pattern

```tsx
import { useLoadingStore, useLoadingKey } from '@/stores/loadingStore';

// Option 1: Full store access
const { startLoading, stopLoading, isKeyLoading } = useLoadingStore();

// Option 2: Single key helper
const [isLoading, startLoading, stopLoading] = useLoadingKey('fetch-data');

// Start loading
startLoading('fetch-applications');

// Check loading state
if (isKeyLoading('fetch-applications')) {
  return <UnifiedLoader variant="page" message="Loading applications..." />;
}

// Stop loading
stopLoading('fetch-applications');
```

### Benefits

- **Single source of truth**: All loading states in one store
- **No double loaders**: Prevents multiple spinners from showing
- **Key-based tracking**: Track multiple concurrent operations
- **Easy debugging**: `getActiveKeys()` shows all active loading operations


## Action Items

### Priority 1: Remove Redundant Loaders (High)

The following loaders should be removed and replaced with UnifiedLoader:

1. Remove `ProgressBar` from `src\components\8starlabs\partition-bar.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
2. Remove `ApplicationProgress` from `src\components\ui\ApplicationProgress.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
3. Remove `ProgressIndicator` from `src\components\ui\ProgressIndicator.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
4. Remove `CircularProgress` from `src\components\ui\ProgressIndicator.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
5. Remove `IndeterminateProgress` from `src\components\ui\ProgressIndicator.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
6. Remove `EnhancedProgressIndicator` from `src\pages\student\applicationWizard\components\EnhancedProgressIndicator.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
7. Remove `ApplicationsSkeleton` from `src\components\admin\applications\ApplicationsSkeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
8. Remove `DashboardSkeleton` from `src\components\admin\DashboardSkeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
9. Remove `DashboardSkeleton` from `src\components\student\DashboardSkeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
10. Remove `StudentDashboardSkeleton` from `src\components\student\StudentDashboardSkeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
11. Remove `SkeletonCard` from `src\components\ui\EnhancedLoadingSpinner.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
12. Remove `SkeletonTable` from `src\components\ui\EnhancedLoadingSpinner.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
13. Remove `SkeletonForm` from `src\components\ui\EnhancedLoadingSpinner.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
14. Remove `TableSkeleton` from `src\components\ui\LoadingState.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
15. Remove `CardSkeleton` from `src\components\ui\LoadingState.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
16. Remove `Skeleton` from `src\components\ui\skeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
17. Remove `SkeletonText` from `src\components\ui\skeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
18. Remove `SkeletonCard` from `src\components\ui\skeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
19. Remove `SkeletonTable` from `src\components\ui\skeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
20. Remove `SkeletonDashboard` from `src\components\ui\skeleton.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
21. Remove `SkeletonLoader` from `src\components\ui\SkeletonLoader.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
22. Remove `SkeletonCard` from `src\components\ui\SkeletonLoader.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
23. Remove `SkeletonTable` from `src\components\ui\SkeletonLoader.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
24. Remove `SkeletonAvatar` from `src\components\ui\SkeletonLoader.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
25. Remove `SkeletonBase` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
26. Remove `SkeletonCard` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
27. Remove `SkeletonTable` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
28. Remove `SkeletonForm` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
29. Remove `SkeletonHero` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
30. Remove `SkeletonDashboard` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
31. Remove `SkeletonStats` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
32. Remove `SkeletonTimeline` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
33. Remove `SkeletonNavigation` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
34. Remove `SkeletonList` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
35. Remove `SkeletonProfile` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
36. Remove `SkeletonWrapper` from `src\components\ui\skeletons\index.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
37. Remove `SkeletonProvider` from `src\contexts\SkeletonContext.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
38. Remove `SkeletonContext` from `src\contexts\SkeletonContext.tsx`
   - Replace with: `<UnifiedLoader variant="skeleton" />`
39. Remove `AuthLoadingOverlay` from `src\components\ui\AuthLoadingOverlay.tsx`
   - Replace with: `<UnifiedLoader variant="overlay" />`
40. Remove `EnhancedLoadingSpinner` from `src\components\ui\EnhancedLoadingSpinner.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
41. Remove `FancyPreloader` from `src\components\ui\FancyPreloader.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
42. Remove `DataTableLoader` from `src\components\ui\InlineLoader.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
43. Remove `PageContentLoader` from `src\components\ui\InlineLoader.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
44. Remove `LoadingFallback` from `src\components\ui\LoadingFallback.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
45. Remove `LoadingSpinner` from `src\components\ui\LoadingSpinner.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
46. Remove `PageLoadingFallback` from `src\components\ui\PageLoadingFallback.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
47. Remove `CompactLoadingFallback` from `src\components\ui\PageLoadingFallback.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
48. Remove `UnifiedLoader` from `src\components\ui\UnifiedLoader.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`
49. Remove `LoadingButton` from `src\components\ui\LoadingButton.tsx`
   - Replace with: `<UnifiedLoader variant="inline" />`

### Priority 2: Update Import Statements (Medium)

After removing redundant loaders, update all files that import them.

### Priority 3: Verify No Visual Regressions (Low)

After migration, verify:

- [ ] No visual flicker during page transitions
- [ ] No double loaders appearing
- [ ] Loading states work on mobile devices
- [ ] Accessibility labels are present (screen reader support)
- [ ] Reduced motion preference is respected

## Appendix: Loader Usages

This section documents where each loader is used in the codebase.

### LoadingSpinner

**Total Usages**: 101 (43 imports, 58 JSX)

**Imported in:**

- `src\components\admin\ApplicationFlowAnalyzer.tsx:4`
- `src\components\admin\applications\ApplicationApprovalActions.tsx:4`
- `src\components\admin\applications\ApplicationCard.tsx:3`
- `src\components\admin\applications\ApplicationDetailModal.tsx:7`
- `src\components\admin\applications\ApplicationsTable.tsx:2`
- `src\components\admin\applications\modal\DocumentsTab.tsx:2`
- `src\components\admin\applications\modal\GradesTab.tsx:2`
- `src\components\admin\applications\modal\StatusHistoryTab.tsx:2`
- `src\components\admin\CommunicationHistory.tsx:12`
- `src\components\admin\DatabaseMonitoring.tsx:5`
- ... and 33 more

### Skeleton

**Total Usages**: 90 (3 imports, 87 JSX)

**Imported in:**

- `src\components\admin\applications\ApplicationsSkeleton.tsx:1`
- `src\components\student\DashboardSkeleton.tsx:9`
- `src\components\student\StudentDashboardSkeleton.tsx:1`

### SkeletonBase

**Total Usages**: 34 (0 imports, 34 JSX)

### Loader2

**Total Usages**: 30 (14 imports, 16 JSX)

**Imported in:**

- `src\components\8starlabs\timeline.tsx:10`
- `src\components\DashboardRedirect.tsx:5`
- `src\components\student\ApplicationSlipActions.tsx:3`
- `src\components\student\QuickActions.tsx:10`
- `src\components\ui\EnhancedLoadingSpinner.tsx:13`
- `src\components\ui\FormFeedback.tsx:9`
- `src\components\ui\LoadingState.tsx:2`
- `src\components\ui\ProgressIndicator.tsx:9`
- `src\components\ui\TouchOptimizedButton.tsx:4`
- `src\pages\auth\ForgotPasswordPage.tsx:20`
- ... and 4 more

### SkeletonCard

**Total Usages**: 9 (2 imports, 7 JSX)

**Imported in:**

- `src\components\admin\applications\ApplicationsSkeleton.tsx:1`
- `src\components\student\StudentDashboardSkeleton.tsx:1`

### EnhancedLoadingSpinner

**Total Usages**: 8 (2 imports, 6 JSX)

**Imported in:**

- `src\components\ui\EnhancedFileUpload.tsx:5`
- `src\components\ui\MobileOptimizedButton.tsx:3`

### SkeletonLoader

**Total Usages**: 7 (0 imports, 7 JSX)

### AuthLoadingOverlay

**Total Usages**: 5 (2 imports, 3 JSX)

**Imported in:**

- `src\pages\auth\SignInPage.tsx:19`
- `src\pages\auth\SignUpPage.tsx:22`

### ProgressIndicator

**Total Usages**: 4 (2 imports, 2 JSX)

**Imported in:**

- `src\components\application\SimpleFileUpload.tsx:4`
- `src\components\ui\EnhancedFileUpload.tsx:6`

### InlineLoader

**Total Usages**: 4 (0 imports, 4 JSX)

### SkeletonLine

**Total Usages**: 4 (0 imports, 4 JSX)

### UnifiedLoaderProps

**Total Usages**: 4 (0 imports, 4 JSX)

### UnifiedLoader

**Total Usages**: 4 (0 imports, 4 JSX)

### ApplicationsSkeleton

**Total Usages**: 4 (2 imports, 2 JSX)

**Imported in:**

- `src\pages\admin\Applications.tsx:5`
- `src\pages\admin\ApplicationsAdmin.tsx:10`

### DashboardSkeleton

**Total Usages**: 4 (2 imports, 2 JSX)

**Imported in:**

- `src\pages\admin\Dashboard.tsx:48`
- `src\pages\student\Dashboard.tsx:20`

### TableSkeleton

**Total Usages**: 3 (1 imports, 2 JSX)

**Imported in:**

- `src\pages\admin\Users.tsx:6`

### SkeletonText

**Total Usages**: 3 (1 imports, 2 JSX)

**Imported in:**

- `src\components\student\StudentDashboardSkeleton.tsx:1`

### Spinner

**Total Usages**: 3 (0 imports, 3 JSX)

### LoadingState

**Total Usages**: 3 (1 imports, 2 JSX)

**Imported in:**

- `src\pages\admin\Users.tsx:6`

### SkeletonProvider

**Total Usages**: 2 (1 imports, 1 JSX)

**Imported in:**

- `src\App.tsx:7`

### Progress

**Total Usages**: 2 (1 imports, 1 JSX)

**Imported in:**

- `src\components\admin\BulkNotificationManager.tsx:15`

### SkeletonDashboard

**Total Usages**: 2 (1 imports, 1 JSX)

**Imported in:**

- `src\components\admin\DashboardSkeleton.tsx:1`

### SkeletonTable

**Total Usages**: 2 (1 imports, 1 JSX)

**Imported in:**

- `src\components\admin\EnhancedApplicationsTable.tsx:6`

### LoadingButton

**Total Usages**: 2 (1 imports, 1 JSX)

**Imported in:**

- `src\components\application\SimpleFileUpload.tsx:3`

### ProgressPrimitive

**Total Usages**: 2 (0 imports, 2 JSX)

### CardSkeleton

**Total Usages**: 2 (1 imports, 1 JSX)

**Imported in:**

- `src\pages\admin\Users.tsx:6`

### EnhancedProgressIndicator

**Total Usages**: 2 (1 imports, 1 JSX)

**Imported in:**

- `src\pages\student\applicationWizard\index.tsx:19`

### LoadingFallback

**Total Usages**: 1 (1 imports, 0 JSX)

**Imported in:**

- `src\App.tsx:15`

### MetricCardSkeleton

**Total Usages**: 1 (0 imports, 1 JSX)

### StatusOverviewSkeleton

**Total Usages**: 1 (0 imports, 1 JSX)

### ApplicationCardSkeleton

**Total Usages**: 1 (0 imports, 1 JSX)

### TimelineSkeleton

**Total Usages**: 1 (0 imports, 1 JSX)

### ProfileSummarySkeleton

**Total Usages**: 1 (0 imports, 1 JSX)

### DeadlinesSkeleton

**Total Usages**: 1 (0 imports, 1 JSX)

### QuickActionSkeleton

**Total Usages**: 1 (0 imports, 1 JSX)

### FileWithProgress

**Total Usages**: 1 (0 imports, 1 JSX)

### FullScreenLoader

**Total Usages**: 1 (0 imports, 1 JSX)

### LoadingOverlay

**Total Usages**: 1 (0 imports, 1 JSX)

### SkeletonStats

**Total Usages**: 1 (0 imports, 1 JSX)

### SkeletonTimeline

**Total Usages**: 1 (0 imports, 1 JSX)

### SkeletonCardContent

**Total Usages**: 1 (0 imports, 1 JSX)

### PageLoader

**Total Usages**: 1 (0 imports, 1 JSX)

### OverlayLoader

**Total Usages**: 1 (0 imports, 1 JSX)

### SkeletonContextValue

**Total Usages**: 1 (0 imports, 1 JSX)

### SkeletonContext

**Total Usages**: 1 (0 imports, 1 JSX)

### useOverallProgress

**Total Usages**: 1 (1 imports, 0 JSX)

**Imported in:**

- `src\pages\student\applicationWizard\index.tsx:26`

---

*This report was generated by the MIHAS Frontend-Backend Forensic Audit System.*

**Validates**: Requirements 3.1, 3.2 - Loader System Unification

---

# Auth Workflow Report

**Generated**: 2026-02-15T14:46:49.989Z

## Summary
- Student workflow steps: 7
- Admin workflow steps: 7
- Auth state fragmented: Yes
- Admin pages missing role checks: 0
- Redirect loops: 0
- Security issues: 8
- Health status: warning


---

# SSE Implementation Report

> Forensic audit of Server-Sent Events implementation for real-time updates

**Generated**: 2026-02-15T14:46:54.589Z
**Project Root**: C:\Users\Administrator\Documents\mihasv3
**Audit Version**: 1.0.0

## Executive Summary

**Report Generated**: 2026-02-15T14:46:54.589Z

### SSE System Health Status

🔴 **CRITICAL** - SSE implementation needs immediate attention

### Overview

| Metric | Count |
|--------|-------|
| Backend SSE Endpoints | 1 |
| Frontend SSE Listeners | 1 |
| Unique Event Types (Backend) | 6 |
| Unique Event Types (Frontend) | 0 |
| Listeners with Reconnect | 1 |
| Listeners with Backoff | 1 |

### Issues Summary

| Issue Type | Count | Status |
|------------|-------|--------|
| Missing Reconnect Logic | 0 | ✅ |
| Missing Backoff Logic | 0 | ✅ |
| Unwired Features | 6 | ⚠️ |

### Quick Stats

- **SSE Client Implementation**: ⚠️ No centralized client
- **Reconnection Coverage**: 100%
- **Backoff Coverage**: 100%
- **Auth Required Endpoints**: 1 / 1

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Backend SSE Endpoints](#backend-sse-endpoints)
3. [Frontend SSE Listeners](#frontend-sse-listeners)
4. [Endpoint-Listener Mapping](#endpoint-listener-mapping)
5. [Feature Wiring Status](#feature-wiring-status)
6. [Gaps and Issues](#gaps-and-issues)
7. [Recommendations](#recommendations)

## Backend SSE Endpoints

### SSE Utility Modules

These are shared SSE utilities used by API endpoints:

| Module | File | Events Defined | Auth Required |
|--------|------|----------------|---------------|
| `/lib/realtime` | `lib\realtime.ts` | application_update, notification, payment_update, interview_scheduled, document_processed, ping | ✅ Yes |

### Event Types Defined

The following SSE event types are defined in the backend:

- `application_update`
- `document_processed`
- `interview_scheduled`
- `notification`
- `payment_update`
- `ping`

## Frontend SSE Listeners

| File | Line | Endpoint | Events | Reconnect | Backoff |
|------|------|----------|--------|-----------|---------|
| `src\hooks\useRealtime.ts` | 2 | `[unknown]` | (generic) | ✅ | ✅ |

## Endpoint-Listener Mapping

This section shows how backend SSE endpoints are connected to frontend listeners.

### Mapping Summary

| Status | Count | Description |
|--------|-------|-------------|
| ✅ Wired | 0 | Endpoint has matching listeners for all events |
| 🟡 Partial | 0 | Endpoint has listeners but some events are not handled |
| ❌ Unwired | 1 | Endpoint has no matching listeners |

### Detailed Mapping

#### ❌ /lib/realtime

- **File**: `lib\realtime.ts`
- **Events**: application_update, notification, payment_update, interview_scheduled, document_processed, ping
- **Auth Required**: Yes
- **Status**: UNWIRED

**No listeners found for this endpoint.**

**Missing Event Handlers:**

- `application_update` - No listener handles this event
- `notification` - No listener handles this event
- `payment_update` - No listener handles this event
- `interview_scheduled` - No listener handles this event
- `document_processed` - No listener handles this event
- `ping` - No listener handles this event

## Feature Wiring Status

This section shows the SSE wiring status for expected real-time features.

| Feature | Event Type | Backend | Frontend | Status |
|---------|------------|---------|----------|--------|
| Notifications | `notification` | ✅ | ❌ | 🟡 Backend only |
| Application Status | `application_update` | ✅ | ❌ | 🟡 Backend only |
| Admin Dashboard | `admin_update` | ❌ | ❌ | ❌ Not implemented |
| Payment Updates | `payment_update` | ✅ | ❌ | 🟡 Backend only |
| Interview Scheduling | `interview_scheduled` | ✅ | ❌ | 🟡 Backend only |
| Document Processing | `document_processed` | ✅ | ❌ | 🟡 Backend only |

### Requirements Mapping

| Requirement | Description | Status |
|-------------|-------------|--------|
| 5.1 | Backend SSE endpoints function correctly | ✅ |
| 5.2 | Frontend SSE listeners properly implemented | ✅ |
| 5.3 | Auto-reconnect on connection loss | ✅ |
| 5.4 | Exponential backoff strategy | ✅ |
| 5.5 | Battery-friendly on mobile | ⚠️ |
| 5.6 | Wired to notification updates | ❌ |
| 5.7 | Wired to application status updates | ❌ |
| 5.8 | Wired to admin dashboard updates | ⚠️ |
| 5.9 | Wired to user-facing updates | ✅ |
| 5.10 | Polling fallback where SSE impossible | ⚠️ |

## Gaps and Issues

### ⚠️ Unwired Features

The following features should use SSE but are not properly wired:

- Notifications (notification): Endpoint exists but no listener found
- Application Status (application_update): Endpoint exists but no listener found
- Admin Dashboard (admin_update): Neither endpoint nor listener implemented
- Payment Updates (payment_update): Endpoint exists but no listener found
- Interview Scheduling (interview_scheduled): Endpoint exists but no listener found
- Document Processing (document_processed): Endpoint exists but no listener found

**Recommendation**: Wire these features to SSE for real-time updates, with polling fallback.

## Recommendations

### Priority Actions

**1. Wire Remaining Features to SSE (Medium)**

The following features should use SSE for real-time updates:
- Notifications (notification): Endpoint exists but no listener found
- Application Status (application_update): Endpoint exists but no listener found
- Admin Dashboard (admin_update): Neither endpoint nor listener implemented
- Payment Updates (payment_update): Endpoint exists but no listener found
- Interview Scheduling (interview_scheduled): Endpoint exists but no listener found
- Document Processing (document_processed): Endpoint exists but no listener found

Ensure polling fallback is implemented for each (Requirement 5.10).

---

*This report was generated by the MIHAS Frontend-Backend Forensic Audit System.*

**Validates**: Requirements 5.1-5.10 - SSE implementation and real-time updates

---

# Notification Flow Report

> Forensic audit of notification triggers, email dispatch, and idempotency controls

**Generated**: 2026-02-15T14:47:11.786Z
**Project Root**: C:\Users\Administrator\Documents\mihasv3
**Audit Version**: 1.0.0

## Executive Summary

**Report Generated**: 2026-02-15T14:47:11.786Z

### Notification System Health Status

🔴 **CRITICAL** - Notification system needs immediate attention

### Overview

| Metric | Count |
|--------|-------|
| Total Notification Triggers | 99 |
| Email Dispatch Points | 5 |
| Unique Event Types | 24 |
| Unique Email Templates | 5 |
| Files with Triggers | 27 |
| Files with Email Dispatches | 4 |

### Delivery Mechanism Breakdown

| Mechanism | Count | Percentage |
|-----------|-------|------------|
| Realtime Only | 94 | 95% |
| Email Only | 2 | 2% |
| Both (Multi-channel) | 3 | 3% |

### Idempotency Status

| Metric | Status | Count |
|--------|--------|-------|
| Triggers with Idempotency | ❌ | 0 (0%) |
| Triggers without Idempotency | ⚠️ | 99 |
| Email Dispatches with Deduplication | ❌ | 1 (20%) |
| Email Dispatches with Retry | ❌ | 0 (0%) |

### Issues Summary

| Issue Type | Count | Status |
|------------|-------|--------|
| Critical Issues | 6 | 🔴 |
| High Risk Issues | 3 | 🟠 |
| Total Issues | 103 | ⚠️ |
| Duplicate Send Risks | 5 | ⚠️ |

### Quick Stats

- **Overall Risk Level**: 🔴 CRITICAL
- **Idempotency Coverage (Triggers)**: 0%
- **Deduplication Coverage (Email)**: 20%
- **Email Risk Level**: 🟠 HIGH

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Notification Triggers](#notification-triggers)
3. [Email Dispatch Points](#email-dispatch-points)
4. [Idempotency Analysis](#idempotency-analysis)
5. [Recommendations](#recommendations)
6. [Requirements Validation](#requirements-validation)

## Notification Triggers

### Event Types

The following notification event types were detected:

- `applicationCreated` (3 triggers)
- `applicationDeleted` (2 triggers)
- `applicationStatusChanged` (2 triggers)
- `applicationSubmitted` (1 trigger)
- `applicationUpdated` (5 triggers)
- `channel_dispatch` (1 trigger)
- `db_notification` (1 trigger)
- `draftCleared` (2 triggers)
- `email_notification` (1 trigger)
- `error` (1 trigger)
- `in_app_notification` (2 triggers)
- `info` (2 triggers)
- `multi_channel_notification` (5 triggers)
- `notification_send` (1 trigger)
- `paymentStatusChanged` (1 trigger)
- `ping` (2 triggers)
- `plugin:component:registered` (1 trigger)
- `push_notification` (2 triggers)
- `sse_broadcast` (13 triggers)
- `sse_event` (4 triggers)
- `success` (6 triggers)
- `ui_toast` (38 triggers)
- `userLoggedIn` (2 triggers)
- `warning` (1 trigger)

### By Delivery Mechanism

#### ⚡ Realtime Triggers

| File | Line | Event | Idempotency |
|------|------|-------|-------------|
| `api-src\notifications.ts` | 350 | `push_notification` | ❌ No |
| `lib\realtime.ts` | 64 | `sse_event` | ❌ No |
| `lib\realtime.ts` | 99 | `ping` | ❌ No |
| `lib\realtime.ts` | 117 | `sse_event` | ❌ No |
| `lib\realtime.ts` | 129 | `ping` | ❌ No |
| `lib\realtime.ts` | 154 | `sse_broadcast` | ❌ No |
| `lib\realtime.ts` | 177 | `sse_event` | ❌ No |
| `lib\realtime.ts` | 192 | `sse_broadcast` | ❌ No |
| `lib\realtime.ts` | 212 | `sse_event` | ❌ No |
| `lib\realtime.ts` | 291 | `sse_broadcast` | ❌ No |
| `lib\realtime.ts` | 294 | `sse_broadcast` | ❌ No |
| `lib\realtime.ts` | 298 | `sse_broadcast` | ❌ No |
| `lib\realtime.ts` | 301 | `sse_broadcast` | ❌ No |
| `lib\realtime.ts` | 305 | `sse_broadcast` | ❌ No |
| `lib\realtime.ts` | 308 | `sse_broadcast` | ❌ No |
| `lib\realtime.ts` | 312 | `sse_broadcast` | ❌ No |
| `lib\realtime.ts` | 315 | `sse_broadcast` | ❌ No |
| `lib\realtime.ts` | 319 | `sse_broadcast` | ❌ No |
| `lib\realtime.ts` | 322 | `sse_broadcast` | ❌ No |
| `lib\realtime.ts` | 326 | `sse_broadcast` | ❌ No |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 1277 | `applicationUpdated` | ❌ No |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 1292 | `applicationUpdated` | ❌ No |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 1304 | `applicationUpdated` | ❌ No |
| `src\components\admin\InterviewScheduler.tsx` | 36 | `ui_toast` | ❌ No |
| `src\components\admin\InterviewScheduler.tsx` | 39 | `ui_toast` | ❌ No |
| `src\components\admin\NotificationPreferences.tsx` | 47 | `ui_toast` | ❌ No |
| `src\components\admin\NotificationPreferences.tsx` | 49 | `ui_toast` | ❌ No |
| `src\components\admin\TestEmailButton.tsx` | 14 | `ui_toast` | ❌ No |
| `src\components\admin\TestEmailButton.tsx` | 29 | `ui_toast` | ❌ No |
| `src\components\admin\TestEmailButton.tsx` | 32 | `ui_toast` | ❌ No |
| `src\components\admin\TestEmailButton.tsx` | 35 | `ui_toast` | ❌ No |
| `src\components\admin\WorkflowRuleForm.tsx` | 30 | `ui_toast` | ❌ No |
| `src\components\admin\WorkflowRuleForm.tsx` | 33 | `ui_toast` | ❌ No |
| `src\components\application\ContinueApplication.tsx` | 80 | `draftCleared` | ❌ No |
| `src\components\student\DocumentButtons.tsx` | 22 | `ui_toast` | ❌ No |
| `src\components\student\DocumentButtons.tsx` | 24 | `ui_toast` | ❌ No |
| `src\components\student\DownloadReceiptButton.tsx` | 23 | `ui_toast` | ❌ No |
| `src\components\student\DownloadReceiptButton.tsx` | 25 | `ui_toast` | ❌ No |
| `src\components\ui\ActiveSessions.tsx` | 91 | `ui_toast` | ❌ No |
| `src\components\ui\ActiveSessions.tsx` | 103 | `ui_toast` | ❌ No |
| `src\components\ui\ActiveSessions.tsx` | 110 | `ui_toast` | ❌ No |
| `src\components\ui\ActiveSessions.tsx` | 114 | `ui_toast` | ❌ No |
| `src\data\applications.ts` | 219 | `applicationCreated` | ❌ No |
| `src\data\applications.ts` | 248 | `applicationUpdated` | ❌ No |
| `src\data\applications.ts` | 277 | `applicationStatusChanged` | ❌ No |
| `src\data\applications.ts` | 317 | `applicationDeleted` | ❌ No |
| `src\data\applications.ts` | 351 | `applicationStatusChanged` | ❌ No |
| `src\data\applications.ts` | 384 | `paymentStatusChanged` | ❌ No |
| `src\data\applications.ts` | 412 | `applicationDeleted` | ❌ No |
| `src\hooks\auth\useSessionListener.ts` | 127 | `userLoggedIn` | ❌ No |
| `src\hooks\auth\useSessionListener.ts` | 196 | `userLoggedIn` | ❌ No |
| `src\hooks\useApplicationSubmitFixed.ts` | 107 | `success` | ❌ No |
| `src\hooks\useApplicationSubmitFixed.ts` | 110 | `success` | ❌ No |
| `src\hooks\useApplicationSubmitFixed.ts` | 270 | `applicationCreated` | ❌ No |
| `src\hooks\useErrorHandler.ts` | 63 | `error` | ❌ No |
| `src\lib\adminNotifications.ts` | 89 | `info` | ❌ No |
| `src\lib\adminNotifications.ts` | 127 | `in_app_notification` | ❌ No |
| `src\lib\draftCleanup.ts` | 63 | `draftCleared` | ❌ No |
| `src\lib\multiChannelNotifications.ts` | 108 | `multi_channel_notification` | ❌ No |
| `src\lib\multiChannelNotifications.ts` | 332 | `channel_dispatch` | ❌ No |
| `src\lib\multiChannelNotifications.ts` | 413 | `push_notification` | ❌ No |
| `src\lib\notificationService.ts` | 94 | `in_app_notification` | ❌ No |
| `src\lib\notificationService.ts` | 137 | `multi_channel_notification` | ❌ No |
| `src\lib\notificationService.ts` | 153 | `success` | ❌ No |
| `src\lib\notificationService.ts` | 175 | `success` | ❌ No |
| `src\lib\notificationService.ts` | 188 | `warning` | ❌ No |
| `src\lib\plugins\PluginAPIProvider.ts` | 337 | `plugin:component:registered` | ❌ No |
| `src\lib\plugins\PluginAPIProvider.ts` | 355 | `success` | ❌ No |
| `src\lib\plugins\PluginAPIProvider.ts` | 362 | `success` | ❌ No |
| `src\lib\workflowAutomation.ts` | 574 | `multi_channel_notification` | ❌ No |
| `src\lib\workflowAutomation.ts` | 678 | `multi_channel_notification` | ❌ No |
| `src\pages\admin\Dashboard.tsx` | 169 | `ui_toast` | ❌ No |
| `src\pages\admin\WorkflowAutomation.tsx` | 83 | `ui_toast` | ❌ No |
| `src\pages\admin\WorkflowAutomation.tsx` | 87 | `ui_toast` | ❌ No |
| `src\pages\admin\WorkflowAutomation.tsx` | 351 | `ui_toast` | ❌ No |
| `src\pages\admin\WorkflowAutomation.tsx` | 363 | `ui_toast` | ❌ No |
| `src\pages\admin\WorkflowAutomation.tsx` | 375 | `ui_toast` | ❌ No |
| `src\pages\student\applicationWizard\components\ReminderSettings.tsx` | 17 | `ui_toast` | ❌ No |
| `src\pages\student\applicationWizard\components\ReminderSettings.tsx` | 18 | `ui_toast` | ❌ No |
| `src\pages\student\applicationWizard\hooks\useWizardController.ts` | 142 | `ui_toast` | ❌ No |
| `src\pages\student\applicationWizard\hooks\useWizardController.ts` | 143 | `ui_toast` | ❌ No |
| `src\pages\student\applicationWizard\hooks\useWizardController.ts` | 144 | `ui_toast` | ❌ No |
| `src\pages\student\applicationWizard\hooks\useWizardController.ts` | 145 | `ui_toast` | ❌ No |
| `src\pages\student\applicationWizard\hooks\useWizardController.ts` | 865 | `applicationUpdated` | ❌ No |
| `src\pages\student\applicationWizard\hooks\useWizardController.ts` | 915 | `applicationCreated` | ❌ No |
| `src\pages\student\applicationWizard\hooks\useWizardController.ts` | 1165 | `applicationSubmitted` | ❌ No |
| `src\pages\student\Dashboard.tsx` | 61 | `ui_toast` | ❌ No |
| `src\pages\student\Dashboard.tsx` | 364 | `ui_toast` | ❌ No |
| `src\pages\student\Dashboard.tsx` | 369 | `ui_toast` | ❌ No |
| `src\pages\student\Dashboard.tsx` | 547 | `ui_toast` | ❌ No |
| `src\pages\student\Dashboard.tsx` | 553 | `ui_toast` | ❌ No |
| `src\pages\student\Dashboard.tsx` | 558 | `ui_toast` | ❌ No |
| `src\pages\student\Dashboard.tsx` | 628 | `ui_toast` | ❌ No |
| `src\pages\student\Dashboard.tsx` | 633 | `ui_toast` | ❌ No |

#### 📧 Email Triggers

| File | Line | Event | Idempotency |
|------|------|-------|-------------|
| `api-src\notifications.ts` | 182 | `email_notification` | ❌ No |
| `src\lib\multiChannelNotifications.ts` | 390 | `notification_send` | ❌ No |

#### 📬 Multi-Channel Triggers (Email + Realtime)

| File | Line | Event | Idempotency |
|------|------|-------|-------------|
| `api-src\notifications.ts` | 152 | `db_notification` | ❌ No |
| `src\analysis\integration\SystemIntegrator.ts` | 245 | `multi_channel_notification` | ❌ No |
| `src\lib\multiChannelNotifications.ts` | 438 | `info` | ❌ No |

## Email Dispatch Points

### Summary

- **Total Dispatch Points**: 5
- **With Retry Logic**: 0 (0%)
- **With Deduplication**: 1 (20%)
- **Risk Level**: 🟠 HIGH

### Email Templates

| Template | Dispatch Count | Retry | Deduplication |
|----------|----------------|-------|---------------|
| `Your MIHAS Application Portal Password Has Been Set` | 1 | ❌ | ❌ |
| `[dynamic: string]` | 1 | ❌ | ✅ |
| `[dynamic: this]` | 1 | ❌ | ❌ |
| `[dynamic: title]` | 1 | ❌ | ❌ |
| `unknown` | 1 | ❌ | ❌ |

### All Dispatch Points

| File | Line | Template | Retry | Deduplication |
|------|------|----------|-------|---------------|
| `api-src\notifications.ts` | 182 | `[dynamic: title]` | ❌ | ❌ |
| `scripts\set-passwords-and-notify.ts` | 68 | `Your MIHAS Application Portal Password Has Been Set` | ❌ | ❌ |
| `src\lib\multiChannelNotifications.ts` | 305 | `[dynamic: this]` | ❌ | ❌ |
| `src\lib\multiChannelNotifications.ts` | 368 | `[dynamic: string]` | ❌ | ✅ |
| `supabase\functions\send-email\index.ts` | 39 | `unknown` | ❌ | ❌ |

### ⚠️ High-Risk Dispatches

These dispatch points are missing **both** retry and deduplication logic:

| File | Line | Template |
|------|------|----------|
| `api-src\notifications.ts` | 182 | `[dynamic: title]` |
| `scripts\set-passwords-and-notify.ts` | 68 | `Your MIHAS Application Portal Password Has Been Set` |
| `src\lib\multiChannelNotifications.ts` | 305 | `[dynamic: this]` |
| `supabase\functions\send-email\index.ts` | 39 | `unknown` |

**Impact**: These can cause duplicate emails on retry or lost emails on failure.

## Idempotency Analysis

### Overall Status: 🔴 CRITICAL

- **Trigger Idempotency Coverage**: 0%
- **Email Deduplication Coverage**: 20%
- **Total Issues**: 103
- **Top Issue**: MISSING_IDEMPOTENCY_KEY in api-src\notifications.ts:182

### Issues by Risk Level

#### 🔴 Critical Issues

These issues require immediate attention:

**MISSING_IDEMPOTENCY_KEY** in `api-src\notifications.ts:182`

> Notification trigger for 'email_notification' (email) lacks idempotency key

**Recommendation**: Add an idempotency key using a unique identifier (e.g., `${userId}_${eventType}_${timestamp}` or a UUID). Store sent notification IDs in a cache or database to prevent duplicate sends.

**MISSING_IDEMPOTENCY_KEY** in `src\lib\multiChannelNotifications.ts:390`

> Notification trigger for 'notification_send' (email) lacks idempotency key

**Recommendation**: Add an idempotency key using a unique identifier (e.g., `${userId}_${eventType}_${timestamp}` or a UUID). Store sent notification IDs in a cache or database to prevent duplicate sends.

**MISSING_DEDUPLICATION** in `api-src\notifications.ts:182`

> Email dispatch for template '[dynamic: title]' lacks deduplication logic

**Recommendation**: Add deduplication logic using an idempotency key. Check if an email with the same key has been sent before dispatching. Add retry logic with exponential backoff for transient failures.

**MISSING_DEDUPLICATION** in `scripts\set-passwords-and-notify.ts:68`

> Email dispatch for template 'Your MIHAS Application Portal Password Has Been Set' lacks deduplication logic

**Recommendation**: Add deduplication logic using an idempotency key. Check if an email with the same key has been sent before dispatching. Add retry logic with exponential backoff for transient failures.

**MISSING_DEDUPLICATION** in `src\lib\multiChannelNotifications.ts:305`

> Email dispatch for template '[dynamic: this]' lacks deduplication logic

**Recommendation**: Add deduplication logic using an idempotency key. Check if an email with the same key has been sent before dispatching. Add retry logic with exponential backoff for transient failures.

**MISSING_DEDUPLICATION** in `supabase\functions\send-email\index.ts:39`

> Email dispatch for template 'unknown' lacks deduplication logic

**Recommendation**: Add deduplication logic using an idempotency key. Check if an email with the same key has been sent before dispatching. Add retry logic with exponential backoff for transient failures.

#### 🟠 High Risk Issues

| File | Line | Type | Description |
|------|------|------|-------------|
| `api-src\notifications.ts` | 152 | MISSING_IDEMPOTENCY_KEY | Notification trigger for 'db_notification' (both) lacks idem... |
| `src\analysis\integration\SystemIntegrator.ts` | 245 | MISSING_IDEMPOTENCY_KEY | Notification trigger for 'multi_channel_notification' (both)... |
| `src\lib\multiChannelNotifications.ts` | 438 | MISSING_IDEMPOTENCY_KEY | Notification trigger for 'info' (both) lacks idempotency key... |

#### 🟡 Medium Risk Issues

| File | Line | Type |
|------|------|------|
| `api-src\notifications.ts` | 350 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 64 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 99 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 117 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 129 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 154 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 177 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 192 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 212 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 291 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 294 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 298 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 301 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 305 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 308 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 312 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 315 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 319 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 322 | MISSING_IDEMPOTENCY_KEY |
| `lib\realtime.ts` | 326 | MISSING_IDEMPOTENCY_KEY |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 1277 | MISSING_IDEMPOTENCY_KEY |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 1292 | MISSING_IDEMPOTENCY_KEY |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 1304 | MISSING_IDEMPOTENCY_KEY |
| `src\components\admin\InterviewScheduler.tsx` | 36 | MISSING_IDEMPOTENCY_KEY |
| `src\components\admin\InterviewScheduler.tsx` | 39 | MISSING_IDEMPOTENCY_KEY |
| `src\components\admin\NotificationPreferences.tsx` | 47 | MISSING_IDEMPOTENCY_KEY |
| `src\components\admin\NotificationPreferences.tsx` | 49 | MISSING_IDEMPOTENCY_KEY |
| `src\components\admin\TestEmailButton.tsx` | 14 | MISSING_IDEMPOTENCY_KEY |
| `src\components\admin\TestEmailButton.tsx` | 29 | MISSING_IDEMPOTENCY_KEY |
| `src\components\admin\TestEmailButton.tsx` | 32 | MISSING_IDEMPOTENCY_KEY |
| `src\components\admin\TestEmailButton.tsx` | 35 | MISSING_IDEMPOTENCY_KEY |
| `src\components\admin\WorkflowRuleForm.tsx` | 30 | MISSING_IDEMPOTENCY_KEY |
| `src\components\admin\WorkflowRuleForm.tsx` | 33 | MISSING_IDEMPOTENCY_KEY |
| `src\components\application\ContinueApplication.tsx` | 80 | MISSING_IDEMPOTENCY_KEY |
| `src\components\student\DocumentButtons.tsx` | 22 | MISSING_IDEMPOTENCY_KEY |
| `src\components\student\DocumentButtons.tsx` | 24 | MISSING_IDEMPOTENCY_KEY |
| `src\components\student\DownloadReceiptButton.tsx` | 23 | MISSING_IDEMPOTENCY_KEY |
| `src\components\student\DownloadReceiptButton.tsx` | 25 | MISSING_IDEMPOTENCY_KEY |
| `src\components\ui\ActiveSessions.tsx` | 91 | MISSING_IDEMPOTENCY_KEY |
| `src\components\ui\ActiveSessions.tsx` | 103 | MISSING_IDEMPOTENCY_KEY |
| `src\components\ui\ActiveSessions.tsx` | 110 | MISSING_IDEMPOTENCY_KEY |
| `src\components\ui\ActiveSessions.tsx` | 114 | MISSING_IDEMPOTENCY_KEY |
| `src\data\applications.ts` | 219 | MISSING_IDEMPOTENCY_KEY |
| `src\data\applications.ts` | 248 | MISSING_IDEMPOTENCY_KEY |
| `src\data\applications.ts` | 277 | MISSING_IDEMPOTENCY_KEY |
| `src\data\applications.ts` | 317 | MISSING_IDEMPOTENCY_KEY |
| `src\data\applications.ts` | 351 | MISSING_IDEMPOTENCY_KEY |
| `src\data\applications.ts` | 384 | MISSING_IDEMPOTENCY_KEY |
| `src\data\applications.ts` | 412 | MISSING_IDEMPOTENCY_KEY |
| `src\hooks\auth\useSessionListener.ts` | 127 | MISSING_IDEMPOTENCY_KEY |
| `src\hooks\auth\useSessionListener.ts` | 196 | MISSING_IDEMPOTENCY_KEY |
| `src\hooks\useApplicationSubmitFixed.ts` | 107 | MISSING_IDEMPOTENCY_KEY |
| `src\hooks\useApplicationSubmitFixed.ts` | 110 | MISSING_IDEMPOTENCY_KEY |
| `src\hooks\useApplicationSubmitFixed.ts` | 270 | MISSING_IDEMPOTENCY_KEY |
| `src\hooks\useErrorHandler.ts` | 63 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\adminNotifications.ts` | 89 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\adminNotifications.ts` | 127 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\draftCleanup.ts` | 63 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\multiChannelNotifications.ts` | 108 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\multiChannelNotifications.ts` | 332 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\multiChannelNotifications.ts` | 413 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\notificationService.ts` | 94 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\notificationService.ts` | 137 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\notificationService.ts` | 153 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\notificationService.ts` | 175 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\notificationService.ts` | 188 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\plugins\PluginAPIProvider.ts` | 337 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\plugins\PluginAPIProvider.ts` | 355 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\plugins\PluginAPIProvider.ts` | 362 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\workflowAutomation.ts` | 574 | MISSING_IDEMPOTENCY_KEY |
| `src\lib\workflowAutomation.ts` | 678 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\admin\Dashboard.tsx` | 169 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\admin\WorkflowAutomation.tsx` | 83 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\admin\WorkflowAutomation.tsx` | 87 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\admin\WorkflowAutomation.tsx` | 351 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\admin\WorkflowAutomation.tsx` | 363 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\admin\WorkflowAutomation.tsx` | 375 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\applicationWizard\components\ReminderSettings.tsx` | 17 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\applicationWizard\components\ReminderSettings.tsx` | 18 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\applicationWizard\hooks\useWizardController.ts` | 142 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\applicationWizard\hooks\useWizardController.ts` | 143 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\applicationWizard\hooks\useWizardController.ts` | 144 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\applicationWizard\hooks\useWizardController.ts` | 145 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\applicationWizard\hooks\useWizardController.ts` | 865 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\applicationWizard\hooks\useWizardController.ts` | 915 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\applicationWizard\hooks\useWizardController.ts` | 1165 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\Dashboard.tsx` | 61 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\Dashboard.tsx` | 364 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\Dashboard.tsx` | 369 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\Dashboard.tsx` | 547 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\Dashboard.tsx` | 553 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\Dashboard.tsx` | 558 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\Dashboard.tsx` | 628 | MISSING_IDEMPOTENCY_KEY |
| `src\pages\student\Dashboard.tsx` | 633 | MISSING_IDEMPOTENCY_KEY |

### Issues by File

| File | Issue Count | Highest Risk |
|------|-------------|--------------|
| `lib\realtime.ts` | 19 | 🟡 medium |
| `src\pages\student\Dashboard.tsx` | 8 | 🟡 medium |
| `src\data\applications.ts` | 7 | 🟡 medium |
| `src\pages\student\applicationWizard\hooks\useWizardController.ts` | 7 | 🟡 medium |
| `src\lib\multiChannelNotifications.ts` | 6 | 🔴 critical |
| `src\lib\notificationService.ts` | 5 | 🟡 medium |
| `src\pages\admin\WorkflowAutomation.tsx` | 5 | 🟡 medium |
| `api-src\notifications.ts` | 4 | 🔴 critical |
| `src\components\admin\TestEmailButton.tsx` | 4 | 🟡 medium |
| `src\components\ui\ActiveSessions.tsx` | 4 | 🟡 medium |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 3 | 🟡 medium |
| `src\hooks\useApplicationSubmitFixed.ts` | 3 | 🟡 medium |
| `src\lib\plugins\PluginAPIProvider.ts` | 3 | 🟡 medium |
| `src\components\admin\InterviewScheduler.tsx` | 2 | 🟡 medium |
| `src\components\admin\NotificationPreferences.tsx` | 2 | 🟡 medium |
| `src\components\admin\WorkflowRuleForm.tsx` | 2 | 🟡 medium |
| `src\components\student\DocumentButtons.tsx` | 2 | 🟡 medium |
| `src\components\student\DownloadReceiptButton.tsx` | 2 | 🟡 medium |
| `src\hooks\auth\useSessionListener.ts` | 2 | 🟡 medium |
| `src\lib\adminNotifications.ts` | 2 | 🟡 medium |
| `src\lib\workflowAutomation.ts` | 2 | 🟡 medium |
| `src\pages\student\applicationWizard\components\ReminderSettings.tsx` | 2 | 🟡 medium |
| `scripts\set-passwords-and-notify.ts` | 1 | 🔴 critical |
| `supabase\functions\send-email\index.ts` | 1 | 🔴 critical |
| `src\analysis\integration\SystemIntegrator.ts` | 1 | 🟠 high |
| `src\components\application\ContinueApplication.tsx` | 1 | 🟡 medium |
| `src\hooks\useErrorHandler.ts` | 1 | 🟡 medium |
| `src\lib\draftCleanup.ts` | 1 | 🟡 medium |
| `src\pages\admin\Dashboard.tsx` | 1 | 🟡 medium |

## Recommendations

### Priority Actions

#### 1. Add Idempotency to Critical Email Dispatches

**Effort**: 🟡 Medium

4 email dispatch point(s) lack both deduplication and retry logic. These are at high risk of sending duplicate emails or losing emails on failure. Implement idempotency keys and retry with exponential backoff.

**Affected Files**:

- `api-src\notifications.ts`
- `scripts\set-passwords-and-notify.ts`
- `src\lib\multiChannelNotifications.ts`
- `supabase\functions\send-email\index.ts`

#### 2. Add Idempotency Keys to Email Triggers

**Effort**: 🟢 Low

5 email notification trigger(s) lack idempotency keys. This can result in duplicate emails being sent if the trigger is called multiple times. Generate a unique idempotency key for each notification event.

**Affected Files**:

- `api-src\notifications.ts`
- `src\analysis\integration\SystemIntegrator.ts`
- `src\lib\multiChannelNotifications.ts`

#### 3. Create Centralized Idempotency Service

**Effort**: 🟡 Medium

Multiple idempotency issues detected across the codebase. Consider creating a centralized idempotency service in `lib/idempotency.ts` that: (1) generates consistent idempotency keys, (2) tracks sent notifications in a cache/database, (3) provides a simple API for checking and recording sends.

**Affected Files**:

- `lib/idempotency.ts (new)`

#### 4. Add Idempotency to Realtime Triggers

**Effort**: 🟢 Low

94 realtime notification trigger(s) lack idempotency. While less critical than email, duplicate toasts/notifications can degrade UX. Consider adding client-side deduplication for realtime notifications.

**Affected Files**:

- `api-src\notifications.ts`
- `lib\realtime.ts`
- `src\components\admin\applications\ApplicationDetailModal.tsx`
- `src\components\admin\InterviewScheduler.tsx`
- `src\components\admin\NotificationPreferences.tsx`
- ... and 21 more files

#### 5. Add Monitoring for Duplicate Sends

**Effort**: 🟢 Low

Implement monitoring to detect duplicate notification/email sends in production. Log idempotency key usage and alert on potential duplicates. This helps catch issues that slip through code review.

**Affected Files**:

- `lib/auditLogger.ts`

## Requirements Validation

This section maps the audit findings to the specification requirements.

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| 6.1 | Audit all notification triggers | ✅ | 99 triggers found |
| 6.2 | Audit all delivery mechanisms | ✅ | Realtime: 94, Email: 2, Both: 3 |
| 6.3 | Verify realtime sync works correctly | ✅ | 94 realtime triggers |
| 6.4 | Verify email dispatch mechanisms | ✅ | 5 dispatch points |
| 6.5 | Notifications display instantly | ✅ | Realtime triggers present |
| 6.6 | Emails trigger exactly once per event | ⚠️ | 5 duplicate risks |
| 6.7 | Flag duplicate notification sends | ✅ | 5 flagged |
| 6.8 | Implement idempotency keys | ⚠️ | 0 triggers with keys |

### Overall Compliance: 75%

6 of 8 requirements fully satisfied.

---

*This report was generated by the MIHAS Frontend-Backend Forensic Audit System.*

**Validates**: Requirements 6.1-6.8 - Notification and email pipeline audit

---

# Performance Fixes Report

> Forensic audit of performance issues, animation usage, bundle size, and mobile optimization

**Generated**: 2026-02-15T14:47:15.382Z
**Project Root**: C:\Users\Administrator\Documents\mihasv3
**Audit Version**: 1.0.0

## Executive Summary

**Report Generated**: 2026-02-15T14:47:15.382Z

### Performance Health Status

🔴 **CRITICAL** — Performance issues require immediate attention

### Overview

| Metric | Value |
|--------|-------|
| Total Performance Issues | 47 |
| High Impact Issues | 4 |
| Medium Impact Issues | 43 |
| Low Impact Issues | 0 |
| Total Animations Found | 224 |
| Heavy Animations | 37 |
| Total JS Bundle Size | 4.06 MB |
| Bundle Threshold | 500.00 KB |
| Bundle Status | ❌ Exceeds threshold |

### Issue Breakdown by Type

| Issue Type | Count | Highest Impact |
|------------|-------|----------------|
| Heavy Animation | 37 | 🟡 |
| Large Bundle | 10 | 🔴 |
| Memory Leak | 0 | — |
| Excessive Rerender | 0 | — |
| Unoptimized Image | 0 | — |
| Blocking Script | 0 | — |

### Quick Stats

- **framer-motion Files**: 0
- **Animation Libraries**: framer-motion (0), CSS (224), Custom (0)
- **Oversized Chunks**: 10
- **Mobile Optimizations Recommended**: 8

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Animation Issues](#animation-issues)
3. [Bundle Size Analysis](#bundle-size-analysis)
4. [All Performance Issues](#all-performance-issues)
5. [Mobile Optimization Recommendations](#mobile-optimization-recommendations)
6. [Logo Animation Audit](#logo-animation-audit)
7. [Requirements Validation](#requirements-validation)

## Animation Issues

### Summary

- **Total Animations Found**: 224
- **Heavy Animations**: 37
- **Lightweight Animations**: 187

### Library Breakdown

| Library | Count | Status |
|---------|-------|--------|
| framer-motion | 0 | ✅ Not used |
| CSS Animations | 224 | 🟡 Some heavy |
| Custom/Other | 0 | ✅ None |

### Heavy Animation Details

| File | Line | Library | Type | Recommendation |
|------|------|---------|------|----------------|
| `src\components\ui\EnhancedLoadingSpinner.tsx` | 67 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\index.css` | 279 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\accreditation.css` | 121 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\accreditation.css` | 32 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\accreditation.css` | 56 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\animations.css` | 104 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\animations.css` | 120 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\animations.css` | 180 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\animations.css` | 196 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\animations.css` | 126 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\animations.css` | 136 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\animations.css` | 142 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\animations.css` | 156 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\mobile-enhancements.css` | 80 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\mobile-enhancements.css` | 121 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\mobile-enhancements.css` | 555 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\mobile-enhancements.css` | 133 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\mobile-enhancements.css` | 159 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\mobile-enhancements.css` | 188 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\mobile-enhancements.css` | 372 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\mobile-enhancements.css` | 510 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\mobile-enhancements.css` | 521 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\pwa.css` | 145 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\pwa.css` | 252 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 44 | css | css-keyframes | Review keyframe animation complexity. Consider simplifying or using transform-only animations. |
| `src\styles\smooth-animations.css` | 174 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 178 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 182 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 283 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 293 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 297 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 301 | css | css-animation-property | Ensure animation uses GPU-accelerated properties (transform, opacity) only. |
| `src\styles\smooth-animations.css` | 211 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\smooth-animations.css` | 217 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\smooth-animations.css` | 223 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\smooth-animations.css` | 244 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |
| `src\styles\smooth-animations.css` | 261 | css | css-transition-complex | Simplify transition. Avoid transitioning multiple properties simultaneously. |

### Lightweight Animations (No Action Required)

187 lightweight animation(s) detected. These are acceptable for performance.

| File | Line | Library | Type |
|------|------|---------|------|
| `src\components\8starlabs\status-indicator.tsx` | 107 | css | css-animation-property |
| `src\components\8starlabs\timeline.tsx` | 121 | css | css-animation-property |
| `src\components\8starlabs\timeline.tsx` | 190 | css | css-animation-property |
| `src\components\8starlabs\timeline.tsx` | 254 | css | css-animation-property |
| `src\components\admin\AdminSidebar.tsx` | 200 | css | css-animation-property |
| `src\components\admin\AdminSidebar.tsx` | 205 | css | css-animation-property |
| `src\components\admin\AnalyticsCharts.tsx` | 254 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 666 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 668 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 669 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 672 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 679 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 680 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 681 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 688 | css | css-animation-property |
| `src\components\admin\applications\ApplicationDetailModal.tsx` | 689 | css | css-animation-property |
| `src\components\admin\BulkNotificationManager.tsx` | 513 | css | css-animation-property |
| `src\components\admin\CacheMonitor.tsx` | 212 | css | css-animation-property |
| `src\components\admin\CommunicationModal.tsx` | 347 | css | css-animation-property |
| `src\components\admin\EnhancedApplicationsManager.tsx` | 317 | css | css-animation-property |
| ... | ... | ... | ... |
| *(167 more)* | | | |

## Bundle Size Analysis

### Overall Status: ❌ EXCEEDS THRESHOLD

- **Total JS Size**: 4.06 MB (target: <500.00 KB)
- **Total CSS Size**: 158.90 KB
- **Estimated Gzip**: ~1.42 MB

### Chunk Summary

| Chunk Type | Count |
|------------|-------|
| Entry | 6 |
| Vendor | 3 |
| Lazy-loaded | 94 |
| CSS | 2 |
| **Total** | **120** |

### Top 10 Largest Chunks

| # | Chunk | Size | Type | Status |
|---|-------|------|------|--------|
| 1 | `vendor-excel-CACNO4NF.js` | 1.29 MB | vendor | ⚠️ Oversized |
| 2 | `vendor-pdf-C9V55MG-.js` | 917.21 KB | vendor | ⚠️ Oversized |
| 3 | `index-CYgLaqPk.js` | 360.78 KB | entry | ⚠️ Oversized |
| 4 | `html2canvas.esm-CyxsxQj2.js` | 194.76 KB | lazy | ⚠️ Oversized |
| 5 | `index.es-BfpRQIwM.js` | 152.76 KB | entry | ✅ OK |
| 6 | `index-DiZrAVzm.js` | 119.33 KB | entry | ✅ OK |
| 7 | `Analytics-BEbgWONF.js` | 112.23 KB | lazy | ⚠️ Oversized |
| 8 | `schemas-BF37txuA.js` | 89.23 KB | shared | ⚠️ Oversized |
| 9 | `Users-D6fZKP0y.js` | 66.17 KB | shared | ⚠️ Oversized |
| 10 | `useApplicationsData-hlZD6QZx.js` | 65.32 KB | shared | ⚠️ Oversized |

### ⚠️ Oversized Chunks

These chunks exceed their type-specific thresholds:

| Chunk | Size | Type | Threshold | Over By |
|-------|------|------|-----------|---------|
| `Analytics-BEbgWONF.js` | 112.23 KB | lazy | 50.00 KB | +62.23 KB |
| `Applications-C42Q-v-7.js` | 50.44 KB | lazy | 50.00 KB | +446 B |
| `html2canvas.esm-CyxsxQj2.js` | 194.76 KB | lazy | 50.00 KB | +144.76 KB |
| `index-CYgLaqPk.js` | 360.78 KB | entry | 200.00 KB | +160.78 KB |
| `schemas-BF37txuA.js` | 89.23 KB | shared | 50.00 KB | +39.23 KB |
| `useApplicationsData-hlZD6QZx.js` | 65.32 KB | shared | 50.00 KB | +15.32 KB |
| `Users-D6fZKP0y.js` | 66.17 KB | shared | 50.00 KB | +16.17 KB |
| `vendor-excel-CACNO4NF.js` | 1.29 MB | vendor | 150.00 KB | +1.14 MB |
| `vendor-pdf-C9V55MG-.js` | 917.21 KB | vendor | 150.00 KB | +767.21 KB |
| `index-BlnwHNfm.css` | 157.04 KB | css | 100.00 KB | +57.04 KB |

### Bundle Recommendations

- Total bundle exceeds target by 3.58 MB. Priority: reduce bundle size.
- Entry chunks are large. Consider lazy-loading non-critical routes and components.
- 2 vendor chunk(s) exceed threshold. Review dependencies for lighter alternatives.
- Multiple chunks have similar sizes. Check for duplicate code that could be extracted to shared chunks.
- Total CSS is 158.9 KB. Consider purging unused Tailwind classes.

## All Performance Issues

### 🔴 High Impact Issues

These issues have the greatest impact on performance and should be addressed first.

#### LARGE_BUNDLE — `dist/assets/js/`

> Total JS bundle size is 4.06 MB, exceeding the 500 KB threshold

**Recommendation**: Review and optimize bundle. Consider code splitting, tree shaking, and removing unused dependencies.

#### LARGE_BUNDLE — `assets\js\index-CYgLaqPk.js`

> Chunk "index-CYgLaqPk.js" is 360.78 KB, exceeding the 200 KB threshold for entry chunks

**Recommendation**: Consider code splitting to reduce entry chunk size. Move non-critical code to lazy-loaded chunks.

#### LARGE_BUNDLE — `assets\js\vendor-excel-CACNO4NF.js`

> Chunk "vendor-excel-CACNO4NF.js" is 1.29 MB, exceeding the 150 KB threshold for vendor chunks

**Recommendation**: Review vendor dependencies. Consider tree-shaking or replacing heavy libraries.

#### LARGE_BUNDLE — `assets\js\vendor-pdf-C9V55MG-.js`

> Chunk "vendor-pdf-C9V55MG-.js" is 917.21 KB, exceeding the 150 KB threshold for vendor chunks

**Recommendation**: Review vendor dependencies. Consider tree-shaking or replacing heavy libraries.

### 🟡 Medium Impact Issues

| File | Line | Type | Evidence | Recommendation |
|------|------|------|----------|----------------|
| `src\components\ui\EnhancedLoadingSpinner.tsx` | 67 | HEAVY_ANIMATION | css-animation-property: style={{
                  animat... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\index.css` | 279 | HEAVY_ANIMATION | css-animation-property: background-size: 1000px 100%;
   ... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\accreditation.css` | 121 | HEAVY_ANIMATION | css-animation-property: background-size: 200% 100%;
  ani... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\accreditation.css` | 32 | HEAVY_ANIMATION | css-transition-complex: justify-content: space-between;
 ... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\accreditation.css` | 56 | HEAVY_ANIMATION | css-transition-complex: object-fit: contain;
  transition... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\animations.css` | 104 | HEAVY_ANIMATION | css-animation-property: .animate-shimmer {
  animation: s... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\animations.css` | 120 | HEAVY_ANIMATION | css-animation-property: background: linear-gradient(90deg... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\animations.css` | 180 | HEAVY_ANIMATION | css-animation-property: .loading-pulse {
  animation: pul... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\animations.css` | 196 | HEAVY_ANIMATION | css-animation-property: background-size: 200% 100%;
  ani... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\animations.css` | 126 | HEAVY_ANIMATION | css-transition-complex: /* Only transition transform and ... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\animations.css` | 136 | HEAVY_ANIMATION | css-transition-complex: /* Fast transitions for immediate... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\animations.css` | 142 | HEAVY_ANIMATION | css-transition-complex: /* Use transform instead of box-s... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\animations.css` | 156 | HEAVY_ANIMATION | css-transition-complex: .hover-scale {
  transition: tran... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\mobile-enhancements.css` | 80 | HEAVY_ANIMATION | css-animation-property: background-size: 200% 100%;
  ani... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\mobile-enhancements.css` | 121 | HEAVY_ANIMATION | css-animation-property: .mobile-pulse {
  animation: smoo... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\mobile-enhancements.css` | 555 | HEAVY_ANIMATION | css-animation-property: );
  animation: upload-progress 2... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\mobile-enhancements.css` | 133 | HEAVY_ANIMATION | css-transition-complex: border-radius: 8px;
  transition:... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\mobile-enhancements.css` | 159 | HEAVY_ANIMATION | css-transition-complex: border-radius: 12px !important;
 ... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\mobile-enhancements.css` | 188 | HEAVY_ANIMATION | css-transition-complex: opacity: 0;
  transition: opacity... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\mobile-enhancements.css` | 372 | HEAVY_ANIMATION | css-transition-complex: font-size: 16px !important;
    t... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\mobile-enhancements.css` | 510 | HEAVY_ANIMATION | css-transition-complex: opacity: 1;
    transition: trans... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\mobile-enhancements.css` | 521 | HEAVY_ANIMATION | css-transition-complex: opacity: 0;
    transition: trans... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\pwa.css` | 145 | HEAVY_ANIMATION | css-animation-property: border-radius: 50%;
  animation: ... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\pwa.css` | 252 | HEAVY_ANIMATION | css-animation-property: margin-bottom: 2rem;
  animation:... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 44 | HEAVY_ANIMATION | css-keyframes: }
}

@keyframes smoothBounce {
  0%, 20%, ... | Review keyframe animation complexity. Consider simplifyin... |
| `src\styles\smooth-animations.css` | 174 | HEAVY_ANIMATION | css-animation-property: .smooth-spin {
  animation: smoot... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 178 | HEAVY_ANIMATION | css-animation-property: .smooth-pulse {
  animation: smoo... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 182 | HEAVY_ANIMATION | css-animation-property: .smooth-bounce {
  animation: smo... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 283 | HEAVY_ANIMATION | css-animation-property: background-size: 200% 100%;
  ani... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 293 | HEAVY_ANIMATION | css-animation-property: .floating-orb-1 {
  animation: sm... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 297 | HEAVY_ANIMATION | css-animation-property: .floating-orb-2 {
  animation: sm... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 301 | HEAVY_ANIMATION | css-animation-property: .floating-orb-3 {
  animation: sm... | Ensure animation uses GPU-accelerated properties (transfo... |
| `src\styles\smooth-animations.css` | 211 | HEAVY_ANIMATION | css-transition-complex: .smooth-transition {
  transition... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\smooth-animations.css` | 217 | HEAVY_ANIMATION | css-transition-complex: .smooth-transition-fast {
  trans... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\smooth-animations.css` | 223 | HEAVY_ANIMATION | css-transition-complex: .smooth-transition-slow {
  trans... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\smooth-animations.css` | 244 | HEAVY_ANIMATION | css-transition-complex: .smooth-button {
  transition: al... | Simplify transition. Avoid transitioning multiple propert... |
| `src\styles\smooth-animations.css` | 261 | HEAVY_ANIMATION | css-transition-complex: .smooth-nav-item {
  transition: ... | Simplify transition. Avoid transitioning multiple propert... |
| `assets\js\Analytics-BEbgWONF.js` | — | LARGE_BUNDLE | Chunk "Analytics-BEbgWONF.js" is 112.23 KB, exceeding the... | Lazy chunk is larger than expected. Consider further spli... |
| `assets\js\Applications-C42Q-v-7.js` | — | LARGE_BUNDLE | Chunk "Applications-C42Q-v-7.js" is 50.44 KB, exceeding t... | Lazy chunk is larger than expected. Consider further spli... |
| `assets\js\html2canvas.esm-CyxsxQj2.js` | — | LARGE_BUNDLE | Chunk "html2canvas.esm-CyxsxQj2.js" is 194.76 KB, exceedi... | Lazy chunk is larger than expected. Consider further spli... |
| `assets\js\schemas-BF37txuA.js` | — | LARGE_BUNDLE | Chunk "schemas-BF37txuA.js" is 89.23 KB, exceeding the 50... | Shared chunk is large. Review for unused exports or consi... |
| `assets\js\useApplicationsData-hlZD6QZx.js` | — | LARGE_BUNDLE | Chunk "useApplicationsData-hlZD6QZx.js" is 65.32 KB, exce... | Shared chunk is large. Review for unused exports or consi... |
| `assets\js\Users-D6fZKP0y.js` | — | LARGE_BUNDLE | Chunk "Users-D6fZKP0y.js" is 66.17 KB, exceeding the 50 K... | Shared chunk is large. Review for unused exports or consi... |

## Mobile Optimization Recommendations

These recommendations target low-end Android phones on slow (3G) networks,
which is the primary use case for MIHAS students in Zambia.

### Priority Actions

1. Replace heavy animations with CSS transitions using transform and opacity only (GPU-accelerated).
2. Reduce total JS bundle by 3.58 MB to meet the <500.00 KB target.
3. Review 2 oversized vendor chunk(s) for lighter alternatives or tree-shaking opportunities.
4. Ensure all page components use React.lazy() for code splitting — critical for 3G load times.
5. Use loading="lazy" on all below-the-fold images to reduce initial payload.
6. Prefer CSS transitions over JS animations — lower CPU and battery usage on cheap Android phones.
7. Debounce search inputs (300ms minimum) to reduce CPU usage on low-end devices.
8. Ensure prefers-reduced-motion is respected in all animation components for accessibility.

### Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| First Contentful Paint | <1.5s | Critical for user perception |
| Largest Contentful Paint | <2.5s | Main content visible |
| Main Bundle Size | <500KB | Total JS payload |
| Lighthouse Score | >90 | Overall performance |
| First Load (3G) | <2.5s | Zambian network conditions |
| Wizard Navigation | <100ms | Perceived responsiveness |

## Logo Animation Audit

The logo animation component (`src/components/ui/LogoAnimation.tsx`) is audited
against Requirements 8.1-8.4.

| Requirement | Description | Expected |
|-------------|-------------|----------|
| 8.1 | Lightweight character-shuffle effect | CSS/JS-only, no heavy libraries |
| 8.2 | Non-blocking to page rendering | Async or deferred execution |
| 8.3 | Respects prefers-reduced-motion | Media query or matchMedia check |
| 8.4 | Does not affect performance metrics | No layout shifts, no blocking |

> **Note**: The LogoAnimation component was implemented as part of task 13.5.
> Verify these properties are maintained when modifying the component.

## Requirements Validation

This section maps the audit findings to the specification requirements.

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| 7.1 | Test layout responsiveness | ✅ | Covered by page auditor (mobileChecker) |
| 7.2 | Flag heavy animations for removal | ✅ | 37 heavy animation(s) flagged |
| 7.3 | Low memory usage on mobile | ✅ | No heavy animation libraries |
| 7.4 | Low CPU usage on mobile | ❌ | 37 heavy animation(s) increase CPU |
| 7.5 | Minimize JS bundle impact | ❌ | Total: 4.06 MB (target: <500.00 KB) |
| 7.6 | Optimized for cheap Android phones | ✅ | 8 optimization(s) recommended |
| 7.7 | Optimized for slow networks (3G) | ❌ | Bundle size is above threshold |
| 8.1 | Logo uses lightweight character-shuffle | ✅ | LogoAnimation component implemented |
| 8.2 | Logo is non-blocking | ✅ | No render-blocking detected |
| 8.3 | Reduced-motion preference respected | ✅ | Covered by property test (Property 22) |
| 8.4 | Logo does not affect performance | ✅ | No performance impact detected |

### Overall Compliance: 73%

8 of 11 requirements fully satisfied.

---

*This report was generated by the MIHAS Frontend-Backend Forensic Audit System.*

**Validates**: Requirements 7.1-7.7, 8.1-8.4 — Mobile performance and logo animation

---

# Stale Code Removal List

**Generated**: 2026-02-15T14:47:25.297Z

## Summary
- Unused components: 0
- Unused hooks: 181
- Unused services: 0
- Legacy integrations: 157
- Commented code blocks: 8
- Dead feature flags: 0
- Total dead code items: 346
- Estimated removable lines: 929


---

# Final Clean Architecture Summary

> Executive summary of the MIHAS Frontend-Backend Forensic Audit

**Generated**: 2026-02-15T14:47:42.479Z

## Overall System Health

🔴 **CRITICAL** — Immediate action required

## Subsystem Health

| Subsystem | Status | Key Metric |
|-----------|--------|------------|
| Frontend-Backend Contract | 🔴 critical | 62 mismatches |
| Auth & Security | 🟡 warning | 8 security issues |
| Dead Code | 🔴 critical | 346 items, ~929 lines removable |

## Issue Counts

### Contract Audit

- Frontend API Calls: 75
- Backend Endpoints: 12
- Missing Endpoints: 54
- Unused Endpoints: 7
- Method Mismatches: 0
- Schema Mismatches: 0
- Auth Mismatches: 1

### Auth & Security

- Student Workflow Steps: 7
- Admin Workflow Steps: 7
- Auth State Sources: 5
- State Fragmented: Yes ⚠️
- Security Issues: 8

### Dead Code

- Unused Components: 0
- Unused Hooks: 181
- Unused Services: 0
- Legacy References: 157
- Commented Code Blocks: 8
- Dead Feature Flags: 0

## Prioritized Action Items

**1. Fix 54 Missing Endpoint(s)** — Critical
   Frontend calls endpoints that don't exist in the backend.

**2. Address 8 Security Issue(s)** — Critical
   Auth workflow has security concerns that need review.

**3. Unify Auth State** — High
   Auth state is fragmented across multiple sources.

**4. Fix 1 Auth Mismatch(es)** — High
   Frontend/backend auth requirements are misaligned.

**5. Remove 157 Legacy Reference(s)** — Medium
   Supabase/Cloudflare references remain after migration.

**6. Clean Up 346 Dead Code Item(s)** — Low
   ~929 lines can be safely removed.

## Detailed Reports

| Report | Path |
|--------|------|
| Contract Mismatch Report | `forensic_reports/contract-mismatch-report.md` |
| Page Validation Matrix | `forensic_reports/page-validation-matrix.md` |
| Loader Unification Plan | `forensic_reports/loader-unification-plan.md` |
| Auth Workflow Report | `forensic_reports/auth-workflow-report.md` |
| SSE Implementation Report | `forensic_reports/sse-implementation-report.md` |
| Notification Flow Report | `forensic_reports/notification-flow-report.md` |
| Performance Fixes Report | `forensic_reports/performance-fixes-report.md` |
| Stale Code Removal List | `forensic_reports/stale-code-removal-list.md` |

---

*Generated by the MIHAS Frontend-Backend Forensic Audit System.*

---

