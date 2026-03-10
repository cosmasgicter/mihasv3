# audit_logs Audit Report — Task 5.7

## Live Schema (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| actor_id | uuid | YES | |
| action | varchar | NO | |
| entity_type | varchar | NO | |
| entity_id | uuid | NO | |
| changes | jsonb | YES | |
| ip_address | inet | YES | |
| user_agent | text | YES | |
| created_at | timestamptz | YES | now() |
| retention_category | varchar | NO | 'standard' |

## CHECK Constraint

```sql
chk_retention_category: CHECK (retention_category IN ('standard', 'security'))
```
✅ Constraint exists and enforces valid values.

## entity_id Type Analysis

- DB type: `uuid NOT NULL`
- Interface type: `string | null` — ❌ allows null but DB is NOT NULL
- `sanitizeEntityId()` function replaces null/non-UUID with placeholder `00000000-0000-0000-0000-000000000000`
- All AuditQueries use `$N::uuid` cast on entity_id values
- **Runtime behavior is correct** — sanitizeEntityId ensures a valid UUID is always passed
- **Interface is misleading** — `entity_id: string | null` suggests null is acceptable

| Check | Result |
|-------|--------|
| sanitizeEntityId(null) → placeholder UUID | ✅ |
| sanitizeEntityId('bulk') → placeholder UUID + _entity_id_label in changes | ✅ |
| sanitizeEntityId(valid-uuid) → pass-through | ✅ |
| $4::uuid cast in SQL | ✅ Compatible with sanitized output |

## ip_address Type Analysis

- DB type: `inet`
- Code passes: string values from `extractRequestMetadata()`
- PostgreSQL auto-casts varchar→inet for valid IP addresses
- **Risk**: If an invalid IP string is passed (e.g., 'unknown', 'localhost'), the INSERT will fail with `invalid input syntax for type inet`

### ip_address Flow:
1. `extractRequestMetadata(ipAddress)` → sanitizes but returns the original IP string
2. `AuditQueries.log(input)` → passes `input.ip_address` directly as `$6`
3. SQL: `ip_address` column is `inet` type
4. PostgreSQL attempts varchar→inet cast

### Potential Failure Scenarios:
- `ipAddress = 'unknown'` → ❌ FAILS (not valid inet)
- `ipAddress = '::1'` → ✅ OK (valid IPv6)
- `ipAddress = '192.168.1.1'` → ✅ OK (valid IPv4)
- `ipAddress = null` → ✅ OK (nullable column)
- `ipAddress = '192.168.1.1, 10.0.0.1'` → ❌ FAILS (X-Forwarded-For with multiple IPs)

**Severity**: ⚠️ MEDIUM — If Vercel passes X-Forwarded-For with multiple IPs or non-IP values, audit logging silently fails (caught by try/catch, doesn't crash the request).

## retention_category Analysis

- DB: `varchar NOT NULL DEFAULT 'standard'`, CHECK constraint `IN ('standard', 'security')`
- **All AuditQueries INSERT methods omit `retention_category`** — always gets default 'standard'
- Security events (auth_failure, authorization_failure, account_locked) should use 'security' retention (365 days)
- The `AuditLogInput` interface doesn't include `retention_category` field

### Impact:
- Security audit events are stored with 'standard' retention (90 days)
- If a cleanup job runs `deleteOlderThan(90)`, security events get deleted
- `deleteOlderThan()` doesn't filter by retention_category

## AuditLogRecord Interface vs Live Schema

| Interface Field | DB Column | Match? |
|----------------|-----------|--------|
| id: string | id uuid | ✅ |
| actor_id: string \| null | actor_id uuid YES | ✅ |
| action: AuditAction \| string | action varchar | ✅ |
| entity_type: AuditEntityType \| string | entity_type varchar | ✅ |
| entity_id: string \| null | entity_id uuid NOT NULL | ❌ Nullability mismatch |
| changes: Record \| null | changes jsonb | ✅ |
| ip_address: string \| null | ip_address inet | ⚠️ Type mismatch (string vs inet) |
| user_agent: string \| null | user_agent text | ✅ |
| created_at: Date | created_at timestamptz | ✅ |
| — | retention_category varchar NOT NULL | ❌ MISSING from interface |

## Summary

| Finding | Severity | Details |
|---------|----------|---------|
| retention_category omitted from all INSERTs | ⚠️ HIGH | All audit logs get 'standard' retention; security events should get 'security' |
| retention_category missing from interface | ⚠️ HIGH | AuditLogRecord and AuditLogInput don't model this column |
| retention_category missing from all SELECTs | ⚠️ MEDIUM | Admin audit trail view can't display retention category |
| entity_id nullability mismatch | ⚠️ MEDIUM | Interface allows null, DB is NOT NULL (runtime safe due to sanitizeEntityId) |
| ip_address inet type risk | ⚠️ MEDIUM | Invalid IP strings would cause INSERT failure (caught by try/catch) |
| deleteOlderThan ignores retention_category | ⚠️ MEDIUM | Could delete security events prematurely |
| sanitizeEntityId | ✅ CORRECT | Properly handles null and non-UUID values |
| CHECK constraint exists | ✅ CORRECT | Enforces 'standard' or 'security' |
