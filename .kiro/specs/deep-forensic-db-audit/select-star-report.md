# SELECT * Usage Report — Deep Forensic DB Audit (Round 4)

**Generated:** 2025-07-15
**Priority:** MEDIUM — These usages are fragile to schema changes but not causing runtime errors.
**Recommendation:** Do NOT change these in bulk — each requires careful column enumeration to avoid breaking callers. Address incrementally when touching each file.

---

## Why SELECT * Is Problematic

1. **Schema fragility** — Adding/removing columns silently changes query results, potentially breaking TypeScript type assumptions
2. **Performance** — Fetches unnecessary columns (e.g., large `jsonb` fields) when only a few are needed
3. **Security** — May expose sensitive columns (e.g., `password_hash`) unintentionally in API responses

---

## SELECT * Usages in `lib/queries.ts`

### CatalogQueries (5 usages)

| Function | Table | Line | Notes |
|----------|-------|------|-------|
| `getIntakes()` | `intakes` | ~1830 | Returns all intake columns |
| `getActiveIntakes()` | `intakes` | ~1842 | Filtered by `is_active` and deadline |
| `getIntakeById(id)` | `intakes` | ~1855 | Single row lookup |
| `getSubjects()` | `subjects` | ~1868 | Filtered by `is_active` |
| `getSubjectById(id)` | `subjects` | ~1881 | Single row lookup |

**Recommended fix:** Replace with explicit column lists matching `IntakeRecord` and `SubjectRecord` interfaces.

### ApplicationQueries (6 usages)

| Function | Table | Line | Notes |
|----------|-------|------|-------|
| `findAll(limit, offset)` | `applications` | ~1174 | Paginated list — fetches all 40+ columns |
| `findByUserId(userId)` | `applications` | ~1187 | User's applications |
| `findById(id)` | `applications` | ~1200 | Single application lookup |
| `findByIdForUser(id, userId)` | `applications` | ~1213 | Ownership-scoped lookup |
| `findPendingReview()` | `applications` | ~1226 | Admin review queue |
| `findByStatus(status)` | `applications` | ~1239 | Status-filtered list |

**Recommended fix:** Replace with explicit column list matching `ApplicationRecord` interface. This is the highest-impact change since `applications` has 40+ columns.

### DocumentQueries (3 usages)

| Function | Table | Line | Notes |
|----------|-------|------|-------|
| `findAll(limit, offset)` | `application_documents` | ~1462 | Paginated list |
| `findByApplicationId(appId)` | `application_documents` | ~1475 | Documents for an application |
| `findById(id)` | `application_documents` | ~1488 | Single document lookup |

**Recommended fix:** Replace with explicit column list matching `DocumentRecord` interface.

### GradeQueries (1 usage)

| Function | Table | Line | Notes |
|----------|-------|------|-------|
| `findAll(limit, offset)` | `application_grades` | ~1593 | Paginated list |

**Recommended fix:** Replace with explicit column list matching `GradeRecord` interface.

### NotificationQueries (1 usage)

| Function | Table | Line | Notes |
|----------|-------|------|-------|
| `getPreferences(userId)` | `user_notification_preferences` | ~1924 | User preferences lookup |

**Recommended fix:** Replace with explicit column list matching `NotificationPreferencesRecord` interface.

---

## SELECT * Usages in `api-src/` Files

### `api-src/admin.ts` (2 usages)

| Function/Context | Table | Line | Notes |
|------------------|-------|------|-------|
| `handleGetSettings()` | `settings` | ~330 | Fetches all settings — typed as `SystemSetting` |
| `handleListUsers()` | `profiles` | ~639 | Dynamic query with WHERE clause — typed as `Record<string, unknown>` |

**Recommended fix for settings:** Replace with explicit columns matching `SystemSetting` interface (`id, key, value, description, category, is_public, updated_by, created_at, updated_at`).

**Recommended fix for profiles:** Replace with explicit columns. The `Record<string, unknown>` typing already indicates loose typing — enumerating columns would improve both safety and documentation.

### `api-src/payments.ts` (1 usage)

| Function/Context | Table | Line | Notes |
|------------------|-------|------|-------|
| Receipt handler | `applications` | ~79 | Fetches full application row for receipt generation |

**Recommended fix:** Replace with only the columns needed for receipt generation.

---

## RETURNING * Usages

These are less risky than SELECT * since they return the row that was just inserted/updated, and the caller typically knows the shape. However, they still expose all columns.

### `lib/queries.ts` (10 usages)

| Query Builder | Table | Context |
|---------------|-------|---------|
| `ApplicationQueries.updateStatus()` | `applications` | After status update |
| `ApplicationQueries.update()` | `applications` | After dynamic field update |
| `ApplicationQueries.updatePaymentStatus()` | `applications` | After payment status change |
| `ApplicationQueries.submit()` | `applications` | After submission |
| `DocumentQueries.create()` | `application_documents` | After document insert |
| `DocumentQueries.updateStatus()` | `application_documents` | After verdict update |
| `GradeQueries.upsert()` | `application_grades` | After grade upsert |
| `StatusHistoryQueries.create()` | `application_status_history` | After history insert |
| `NotificationQueries.upsertPreferences()` | `user_notification_preferences` | After preferences upsert |
| `PaymentQueries.createFromApplication()` | `applications` (via subquery) | After payment record creation |

### `api-src/catalog.ts` (4 usages)

| Context | Table |
|---------|-------|
| Program INSERT | `programs` |
| Program UPDATE | `programs` |
| Intake INSERT | `intakes` |
| Intake UPDATE | `intakes` |

### `api-src/admin.ts` (2 usages)

| Context | Table |
|---------|-------|
| Settings INSERT | `settings` |
| Settings UPDATE | `settings` |

### `api-src/notifications.ts` (4 usages)

| Context | Table |
|---------|-------|
| Preferences UPSERT | `user_notification_preferences` |
| Notification INSERT (send action) | `notifications` |
| Notification INSERT (notify action) | `notifications` |
| Notification INSERT (bulk) | `notifications` |

### `api-src/applications.ts` (4 usages)

| Context | Table |
|---------|-------|
| Application INSERT (handleCreate) | `applications` |
| Status update CTE | `applications` |
| Review update CTE | `applications` |
| Notification INSERT | `notifications` |
| Draft update | `applications` |

---

## Summary

| Category | Count | Risk Level |
|----------|-------|------------|
| SELECT * in query builders (`lib/queries.ts`) | 16 | Medium — typed via interfaces but fragile |
| SELECT * in API sources (`api-src/`) | 3 | Medium-High — some use loose typing |
| RETURNING * in query builders | 10 | Low — shape is known from the INSERT/UPDATE |
| RETURNING * in API sources | 14 | Low — shape is known from the INSERT/UPDATE |
| **Total** | **43** | |

### Prioritized Fix Order (if addressed)

1. `ApplicationQueries.findAll/findByUserId/findById/findByIdForUser/findPendingReview/findByStatus` — highest column count (40+), most callers
2. `api-src/admin.ts handleListUsers()` — uses `Record<string, unknown>` loose typing
3. `DocumentQueries.findAll/findByApplicationId/findById` — moderate column count
4. `CatalogQueries.getIntakes/getActiveIntakes/getIntakeById` — moderate column count
5. `CatalogQueries.getSubjects/getSubjectById` — small table, low risk
6. `api-src/admin.ts handleGetSettings()` — small table, low risk
7. `api-src/payments.ts` receipt handler — single usage, low risk
8. All `RETURNING *` usages — lowest priority, shape is predictable
