# Inline Interface Audit Report — api-src/ vs Live Schema

**Task 5.2 — Phase 4: Interface & Query Builder Audit**
**Source of Truth**: Live Neon Postgres schema (project: wild-bar-37055823)

---

## 1. SystemSetting (admin.ts) ↔ settings table

**Interface fields**: 9 (all optional except `key` and `value`) | **Table columns**: 9

### Interface Definition:
```typescript
interface SystemSetting {
  id?: string;           // uuid NOT NULL
  key: string;           // varchar(100) NOT NULL
  value: unknown;        // jsonb NOT NULL
  description?: string;  // text nullable
  category?: string;     // varchar(50) nullable
  is_public?: boolean;   // boolean nullable (default false)
  updated_by?: string;   // uuid nullable
  created_at?: string;   // timestamptz nullable
  updated_at?: string;   // timestamptz nullable
}
```

### Extra Fields: 0 ✅
### Missing Fields: 0 ✅

### Type Compatibility Issues: 0 ✅

### Nullability Issues: 1

| Field | TS | DB | Severity |
|-------|----|----|----------|
| `id` | optional (`?`) | NOT NULL | 🟡 MEDIUM — `id` is always present in DB rows but interface marks it optional (likely for create operations where id is auto-generated) |

**Verdict**: SystemSetting is a near-perfect match. The optional `id` is acceptable for create/update patterns.

---

## 2. ProgramRow (catalog.ts) ↔ programs table

**Interface fields**: 15 (including 2 joined fields) | **Table columns**: 14

### Extra Fields: 2 (intentional joined fields)

| Extra Field | Notes | Severity |
|-------------|-------|----------|
| `institution_name` | Joined from institutions table | 🔵 LOW — intentional |
| `institution_full_name` | Joined from institutions table | 🔵 LOW — intentional |

### Missing Fields: 2

| Missing Column | DB Type | Nullable | Severity |
|---------------|---------|----------|----------|
| `requirements` | jsonb | YES | 🟡 MEDIUM — program requirements data |

### Type Compatibility Issues: 0 ✅

### Nullability Issues: 0 ✅
All nullable fields correctly marked with `| null`.

**Verdict**: ProgramRow is well-aligned. Missing `requirements` jsonb column is the only gap.

---

## 3. IntakeRow (catalog.ts) ↔ intakes table

**Interface fields**: 13 | **Table columns**: 13

### Extra Fields: 0 ✅
### Missing Fields: 0 ✅

### Type Compatibility Issues: 0 ✅

### Nullability Issues: 3

| Field | TS Nullable | DB Nullable | Severity |
|-------|------------|-------------|----------|
| `start_date` | No (`string`) | Yes (nullable) | 🟡 MEDIUM |
| `end_date` | No (`string`) | Yes (nullable) | 🟡 MEDIUM |
| `application_deadline` | No (`string`) | Yes (nullable) | 🟡 MEDIUM |

**Verdict**: IntakeRow is a good match. Same nullability issues as IntakeRecord in lib/queries.ts.

---

## 4. InstitutionRecord (catalog.ts) ↔ institutions table

**Interface fields**: 9 | **Table columns**: 14

### Extra Fields: 0 ✅

### Missing Fields: 5

| Missing Column | DB Type | Nullable | Severity |
|---------------|---------|----------|----------|
| `type` | varchar(100) | YES | 🟡 MEDIUM |
| `address` | text | YES | 🟡 MEDIUM |
| `phone` | varchar(20) | YES | 🟡 MEDIUM |
| `email` | varchar(255) | YES | 🟡 MEDIUM |
| `website` | varchar(255) | YES | 🟡 MEDIUM |
| `accreditation_status` | varchar(50) | YES | 🟡 MEDIUM |

### Type Compatibility Issues: 0 ✅

### Nullability Issues: 1

| Field | TS Nullable | DB Nullable | Severity |
|-------|------------|-------------|----------|
| `is_active` | No (`boolean`) | Yes (nullable, default true) | 🟡 MEDIUM |

**Verdict**: InstitutionRecord is a minimal subset. Missing 6 columns but these are optional display fields not critical for catalog operations.

---

## Summary

| Interface | Match Quality | Critical Issues | High Issues | Medium Issues |
|-----------|--------------|-----------------|-------------|---------------|
| SystemSetting | ✅ Near-perfect | 0 | 0 | 1 |
| ProgramRow | ✅ Good | 0 | 0 | 1 |
| IntakeRow | ✅ Good | 0 | 0 | 3 |
| InstitutionRecord | 🟡 Minimal subset | 0 | 0 | 7 |

Total: 0 critical, 0 high, 12 medium issues across all 4 inline interfaces.
