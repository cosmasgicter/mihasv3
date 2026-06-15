# Per-School Data Quality & Seed Readiness — Beanola Admissions

> **Spec:** `.kiro/specs/beanola-production-readiness/` — Task 25.1, Component 12.
> **Validates:** Requirements **12.1**–**12.8**.
>
> **Purpose:** Give an operator a per-school checklist that proves production
> data is coherent and complete before applications open. Every check below is a
> **read-only `SELECT`** — there is **no `INSERT`/`UPDATE`/`DELETE`/`DDL`** in
> this document and nothing here is run as a production write from dev (R16.8).
>
> **Where to run:**
> - **Authoring/staging:** the Neon `mihasApplication` project
>   (`wild-bar-37055823`) default branch, or a throwaway Neon branch. Prefer the
>   Neon MCP `run_sql` tool (SELECT-only). This is where the "Current results"
>   below were captured.
> - **Production:** the self-hosted Postgres container `mihas-postgres-1` on the
>   EC2 box, via `docker compose -f docker-compose.prod.yml exec postgres psql`.
>   The same queries are copied into the runbook production evidence block after
>   the gated cutover (R3.7). **Never** the first place a change lands.
>
> **Read-only enforcement when using `psql`:** start the session with
> `SET default_transaction_read_only = on;` (or connect with a read-only role) so
> an accidental write aborts. The Neon MCP `run_sql` path is SELECT-only by the
> safety rules in `.kiro/steering/infrastructure.md`.

## How to read this document

Each requirement (R12.1–R12.8) has:

1. **What "ready" means** — the sign-off condition for an *active* school /
   *active* offering.
2. **Read-only query** — paste into `psql` or Neon `run_sql`.
3. **Not-ready flag** — a second `SELECT` that returns **zero rows when ready**
   and one row per problem when not. Treat any non-empty not-ready result as a
   launch blocker for that school/offering (R12.3, R12.5).
4. **Current results** — captured against the Neon authoring branch (see the
   results section at the end). Production results are filled in post-cutover.

Schema source of truth: `backend/apps/catalog/models.py`,
`backend/apps/accounts/models.py`, `backend/apps/documents/models.py`,
`backend/apps/common/models.py` (all `managed = False` over the Neon/prod
tables). Seed provenance: `seed_tenant_document_profiles.py` (document profiles)
and `brand_institutions.py` (institution branding).

Convention used by every query: **"active school"** = `institutions.is_active IS TRUE`,
**"active offering"** = `programs.is_active IS TRUE` and
`programs.offering_status = 'active'`.

---

## R12.1 — Institution data complete + signed off

**Ready when:** every active institution has a non-blank `slug`, `code`,
`brand_name`, `full_name` (legal name), an admissions/support email, a phone, at
least one active domain, and an explicit `is_active` flag.

### Per-school inventory (read-only)

```sql
-- R12.1 institution data, one row per institution, newest first.
SELECT
    i.code,
    i.slug,
    i.brand_name,
    i.full_name                         AS legal_name,
    i.name,
    i.admissions_email,
    i.support_email,
    i.email                             AS legacy_contact_email,
    i.phone,
    i.website,
    i.is_active,
    (
        SELECT count(*) FROM institution_domains d
        WHERE d.institution_id = i.id AND d.is_active IS TRUE
    )                                   AS active_domains,
    (
        SELECT string_agg(d.hostname, ', ' ORDER BY d.is_primary DESC, d.hostname)
        FROM institution_domains d
        WHERE d.institution_id = i.id AND d.is_active IS TRUE
    )                                   AS domains
FROM institutions i
ORDER BY i.is_active DESC NULLS LAST, i.code;
```

### Not-ready flag (read-only)

```sql
-- R12.1 NOT READY: active institutions missing required identity/contact data.
-- Expect ZERO rows at sign-off.
SELECT
    i.code,
    concat_ws(', ',
        CASE WHEN nullif(btrim(i.slug), '')        IS NULL THEN 'slug' END,
        CASE WHEN nullif(btrim(i.code), '')        IS NULL THEN 'code' END,
        CASE WHEN nullif(btrim(i.brand_name), '')  IS NULL THEN 'brand_name' END,
        CASE WHEN nullif(btrim(i.full_name), '')   IS NULL THEN 'legal_name(full_name)' END,
        CASE WHEN nullif(btrim(coalesce(i.admissions_email, i.email)), '') IS NULL
             THEN 'admissions/contact email' END,
        CASE WHEN nullif(btrim(i.phone), '')       IS NULL THEN 'phone' END,
        CASE WHEN NOT EXISTS (
                 SELECT 1 FROM institution_domains d
                 WHERE d.institution_id = i.id AND d.is_active IS TRUE
             ) THEN 'active domain' END
    ) AS missing_fields
FROM institutions i
WHERE i.is_active IS TRUE
  AND (
        nullif(btrim(i.slug), '')       IS NULL
     OR nullif(btrim(i.code), '')       IS NULL
     OR nullif(btrim(i.brand_name), '') IS NULL
     OR nullif(btrim(i.full_name), '')  IS NULL
     OR nullif(btrim(coalesce(i.admissions_email, i.email)), '') IS NULL
     OR nullif(btrim(i.phone), '')      IS NULL
     OR NOT EXISTS (
            SELECT 1 FROM institution_domains d
            WHERE d.institution_id = i.id AND d.is_active IS TRUE
        )
  )
ORDER BY i.code;
```

**Sign-off:** an operator records each active school's row from the inventory
query and initials it. Branding columns are seeded by `brand_institutions.py`
(idempotent, blank-only fill); domains live in `institution_domains`.

---

## R12.2 — Assets present (logo, signature, seal, checksums, active version)

**Ready when:** every active institution has an **active** `logo` and
`signature` asset (and a `seal` where the school's documents need one), each with
a non-blank `checksum_sha256`, a `mime_type`, and `version >= 1`.

### Per-school asset inventory (read-only)

```sql
-- R12.2 active assets per institution by type.
SELECT
    i.code,
    a.asset_type,
    a.version,
    a.mime_type,
    a.checksum_sha256,
    a.is_active,
    a.storage_key
FROM institutions i
LEFT JOIN institution_assets a
       ON a.institution_id = i.id AND a.is_active IS TRUE
WHERE i.is_active IS TRUE
ORDER BY i.code, a.asset_type, a.version DESC;
```

### Not-ready flag (read-only)

```sql
-- R12.2 NOT READY: active schools missing a required active asset, or an active
-- asset with a blank checksum / missing mime. 'seal' is advisory (warn) here;
-- logo + signature are required for branded official documents.
-- Expect ZERO required-asset rows at sign-off.
SELECT
    i.code,
    t.asset_type,
    CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM institution_assets a
            WHERE a.institution_id = i.id
              AND a.asset_type = t.asset_type
              AND a.is_active IS TRUE
        ) THEN 'no active ' || t.asset_type
        ELSE 'active ' || t.asset_type || ' has blank checksum or mime'
    END AS issue,
    t.severity
FROM institutions i
CROSS JOIN (VALUES ('logo','required'), ('signature','required'), ('seal','advisory'))
        AS t(asset_type, severity)
WHERE i.is_active IS TRUE
  AND (
        NOT EXISTS (
            SELECT 1 FROM institution_assets a
            WHERE a.institution_id = i.id
              AND a.asset_type = t.asset_type
              AND a.is_active IS TRUE
        )
     OR EXISTS (
            SELECT 1 FROM institution_assets a
            WHERE a.institution_id = i.id
              AND a.asset_type = t.asset_type
              AND a.is_active IS TRUE
              AND (nullif(btrim(a.checksum_sha256), '') IS NULL
                   OR nullif(btrim(a.mime_type), '') IS NULL)
        )
  )
ORDER BY i.code,
         CASE t.severity WHEN 'required' THEN 0 ELSE 1 END,
         t.asset_type;
```

**Note:** rows with `severity = 'advisory'` (`seal`) are a warning, not a
blocker, unless a school's document profile references a seal token. Rows with
`severity = 'required'` are launch blockers.

---

## R12.3 — Active offering must link a canonical program, an intake, and a fee rule

**Ready when:** every **active** offering (`programs.is_active` and
`offering_status='active'`) has a non-null `canonical_program_id`, at least one
active `program_intakes` row, and at least one active `program_fees` row.

### Per-offering inventory (read-only)

```sql
-- R12.3 active offering linkage snapshot.
SELECT
    i.code                                  AS school,
    p.code                                  AS offering_code,
    p.name                                  AS offering_name,
    p.offering_status,
    p.canonical_program_id IS NOT NULL      AS has_canonical_link,
    cp.code                                 AS canonical_code,
    (SELECT count(*) FROM program_intakes pi
      WHERE pi.program_id = p.id AND pi.is_active IS TRUE)      AS active_intakes,
    (SELECT count(*) FROM program_fees pf
      WHERE pf.program_id = p.id AND pf.is_active IS TRUE)      AS active_fee_rules
FROM programs p
JOIN institutions i              ON i.id = p.institution_id
LEFT JOIN canonical_programs cp  ON cp.id = p.canonical_program_id
WHERE p.is_active IS TRUE
  AND p.offering_status = 'active'
ORDER BY i.code, p.code;
```

### Not-ready flag (read-only) — **R12.3 blocker**

```sql
-- R12.3 NOT READY: active offering missing canonical link, intake, or fee rule.
-- Expect ZERO rows at sign-off.
SELECT
    i.code AS school,
    p.code AS offering_code,
    p.name AS offering_name,
    concat_ws(', ',
        CASE WHEN p.canonical_program_id IS NULL THEN 'no canonical-program link' END,
        CASE WHEN NOT EXISTS (
                 SELECT 1 FROM program_intakes pi
                 WHERE pi.program_id = p.id AND pi.is_active IS TRUE
             ) THEN 'no active intake' END,
        CASE WHEN NOT EXISTS (
                 SELECT 1 FROM program_fees pf
                 WHERE pf.program_id = p.id AND pf.is_active IS TRUE
             ) THEN 'no active fee rule' END
    ) AS not_ready_reason
FROM programs p
JOIN institutions i ON i.id = p.institution_id
WHERE p.is_active IS TRUE
  AND p.offering_status = 'active'
  AND (
        p.canonical_program_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM program_intakes pi
                     WHERE pi.program_id = p.id AND pi.is_active IS TRUE)
     OR NOT EXISTS (SELECT 1 FROM program_fees pf
                     WHERE pf.program_id = p.id AND pf.is_active IS TRUE)
  )
ORDER BY i.code, p.code;
```

---

## R12.4 — Catalog data present (programs, offerings, intakes, fees, capacity, priority, eligibility)

**Ready when:** `canonical_programs` is non-empty; every active offering has a
`duration_months`, an `assignment_priority`, at least one intake with a
`max_capacity` and application window dates, fee rows for the residency
categories in use, and (where eligibility is enforced) `course_requirements`
rows.

### Catalog completeness snapshot (read-only)

```sql
-- R12.4 catalog snapshot per active offering.
SELECT
    i.code                          AS school,
    p.code                          AS offering_code,
    p.duration_months,
    p.assignment_priority,
    p.canonical_program_id IS NOT NULL AS canonical_linked,
    (SELECT count(*) FROM program_intakes pi
      WHERE pi.program_id = p.id AND pi.is_active IS TRUE)  AS active_intakes,
    (SELECT count(*) FROM program_fees pf
      WHERE pf.program_id = p.id AND pf.is_active IS TRUE)  AS active_fee_rules,
    (SELECT string_agg(DISTINCT pf.residency_category, ', ')
       FROM program_fees pf
      WHERE pf.program_id = p.id AND pf.is_active IS TRUE)  AS residency_categories,
    (SELECT count(*) FROM course_requirements cr
      WHERE cr.program_id = p.id)                           AS eligibility_rules
FROM programs p
JOIN institutions i ON i.id = p.institution_id
WHERE p.is_active IS TRUE
  AND p.offering_status = 'active'
ORDER BY i.code, p.code;
```

```sql
-- R12.4 intake-level capacity + window completeness for active offerings.
SELECT
    i.code         AS school,
    p.code         AS offering_code,
    it.name        AS intake,
    it.year,
    pi.max_capacity,
    pi.current_enrollment,
    pi.assignment_priority,
    it.application_start_date,
    it.application_deadline
FROM program_intakes pi
JOIN programs p     ON p.id = pi.program_id
JOIN institutions i ON i.id = p.institution_id
JOIN intakes it     ON it.id = pi.intake_id
WHERE p.is_active IS TRUE
  AND p.offering_status = 'active'
  AND pi.is_active IS TRUE
ORDER BY i.code, p.code, it.year, it.name;
```

### Not-ready flag (read-only)

```sql
-- R12.4 NOT READY: catalog gaps. Includes the empty-canonical-table guard and
-- per-offering catalog-field gaps. Expect ZERO rows at sign-off.
SELECT '*' AS school, '(global)' AS offering_code,
       'canonical_programs table is empty' AS not_ready_reason
WHERE NOT EXISTS (SELECT 1 FROM canonical_programs)
UNION ALL
SELECT i.code, p.code,
    concat_ws(', ',
        CASE WHEN p.duration_months IS NULL OR p.duration_months <= 0
             THEN 'missing duration_months' END,
        CASE WHEN p.assignment_priority IS NULL
             THEN 'missing assignment_priority' END,
        CASE WHEN NOT EXISTS (
                 SELECT 1 FROM program_intakes pi
                 JOIN intakes it ON it.id = pi.intake_id
                 WHERE pi.program_id = p.id AND pi.is_active IS TRUE
                   AND coalesce(pi.max_capacity, it.max_capacity) IS NOT NULL
             ) THEN 'no intake with capacity' END,
        CASE WHEN NOT EXISTS (
                 SELECT 1 FROM program_intakes pi
                 JOIN intakes it ON it.id = pi.intake_id
                 WHERE pi.program_id = p.id AND pi.is_active IS TRUE
                   AND it.application_start_date IS NOT NULL
                   AND it.application_deadline   IS NOT NULL
             ) THEN 'no intake with application window' END
    ) AS not_ready_reason
FROM programs p
JOIN institutions i ON i.id = p.institution_id
WHERE p.is_active IS TRUE
  AND p.offering_status = 'active'
  AND (
        p.duration_months IS NULL OR p.duration_months <= 0
     OR p.assignment_priority IS NULL
     OR NOT EXISTS (SELECT 1 FROM program_intakes pi JOIN intakes it ON it.id = pi.intake_id
                     WHERE pi.program_id = p.id AND pi.is_active IS TRUE
                       AND coalesce(pi.max_capacity, it.max_capacity) IS NOT NULL)
     OR NOT EXISTS (SELECT 1 FROM program_intakes pi JOIN intakes it ON it.id = pi.intake_id
                     WHERE pi.program_id = p.id AND pi.is_active IS TRUE
                       AND it.application_start_date IS NOT NULL
                       AND it.application_deadline IS NOT NULL)
  )
ORDER BY 1, 2;
```

---

## R12.5 — Active school must have a required document profile + assets

**Ready when:** every active school has at least one **active**
`institution_document_profiles` row for the document types it issues
(`acceptance_letter` at minimum), and the assets that profile depends on (logo +
signature) are present and active (ties back to R12.2).

### Per-school document-profile inventory (read-only)

```sql
-- R12.5 active document profiles per school.
SELECT
    i.code                              AS school,
    dp.document_type,
    dp.layout_key,
    dp.version,
    dp.program_id IS NOT NULL           AS offering_scoped,
    p.code                              AS offering_code,
    jsonb_array_length(coalesce(to_jsonb(dp.fee_chart),     '[]'::jsonb)) AS fee_rows,
    jsonb_array_length(coalesce(to_jsonb(dp.bank_accounts), '[]'::jsonb)) AS bank_rows,
    (dp.signatory ->> 'name')           AS signatory_name
FROM institutions i
LEFT JOIN institution_document_profiles dp
       ON dp.institution_id = i.id AND dp.is_active IS TRUE
LEFT JOIN programs p ON p.id = dp.program_id
WHERE i.is_active IS TRUE
ORDER BY i.code, dp.document_type, dp.version DESC;
```

### Not-ready flag (read-only) — **R12.5 blocker**

```sql
-- R12.5 NOT READY: active school with no active acceptance_letter profile, OR a
-- profile present but its required branding assets (logo/signature) missing.
-- Expect ZERO rows at sign-off.
SELECT
    i.code AS school,
    concat_ws(', ',
        CASE WHEN NOT EXISTS (
                 SELECT 1 FROM institution_document_profiles dp
                 WHERE dp.institution_id = i.id
                   AND dp.document_type = 'acceptance_letter'
                   AND dp.is_active IS TRUE
             ) THEN 'no active acceptance_letter profile' END,
        CASE WHEN NOT EXISTS (
                 SELECT 1 FROM institution_assets a
                 WHERE a.institution_id = i.id AND a.asset_type = 'logo'
                   AND a.is_active IS TRUE
             ) THEN 'no active logo asset' END,
        CASE WHEN NOT EXISTS (
                 SELECT 1 FROM institution_assets a
                 WHERE a.institution_id = i.id AND a.asset_type = 'signature'
                   AND a.is_active IS TRUE
             ) THEN 'no active signature asset' END
    ) AS not_ready_reason
FROM institutions i
WHERE i.is_active IS TRUE
  AND (
        NOT EXISTS (SELECT 1 FROM institution_document_profiles dp
                     WHERE dp.institution_id = i.id
                       AND dp.document_type = 'acceptance_letter'
                       AND dp.is_active IS TRUE)
     OR NOT EXISTS (SELECT 1 FROM institution_assets a
                     WHERE a.institution_id = i.id AND a.asset_type = 'logo'
                       AND a.is_active IS TRUE)
     OR NOT EXISTS (SELECT 1 FROM institution_assets a
                     WHERE a.institution_id = i.id AND a.asset_type = 'signature'
                       AND a.is_active IS TRUE)
  )
ORDER BY i.code;
```

> **Profile seeding:** the MIHAS RN, KATC COG, and KATC EHT acceptance-letter
> profiles are seeded idempotently by
> `python manage.py seed_tenant_document_profiles` (validate first with
> `--dry-run`). A Beanola demo profile must exist **only** on staging (R6.7).

---

## R12.6 — Document configuration present per school

**Ready when:** per school and per issued document type — required-document rows
exist (`institution_required_documents`), the document profile / template
declares its `sections` + `tokens`, bank details (`bank_accounts`) are present
for any fee-bearing letter, and a `signatory` (name + role) is set.

### Document-config inventory (read-only)

```sql
-- R12.6 required documents per school.
SELECT
    i.code AS school,
    rd.document_type,
    rd.label,
    rd.is_required,
    p.code AS offering_code
FROM institution_required_documents rd
JOIN institutions i ON i.id = rd.institution_id
LEFT JOIN programs p ON p.id = rd.program_id
WHERE rd.is_active IS TRUE
ORDER BY i.code, rd.document_type;
```

```sql
-- R12.6 profile config completeness: tokens/sections/bank/signatory presence.
SELECT
    i.code AS school,
    dp.document_type,
    dp.version,
    (dp.sections  IS NOT NULL AND dp.sections  <> '{}'::jsonb) AS has_sections,
    jsonb_array_length(coalesce(to_jsonb(dp.bank_accounts), '[]'::jsonb)) AS bank_rows,
    (dp.signatory ->> 'name') AS signatory_name,
    (dp.signatory ->> 'role') AS signatory_role
FROM institution_document_profiles dp
JOIN institutions i ON i.id = dp.institution_id
WHERE dp.is_active IS TRUE
ORDER BY i.code, dp.document_type, dp.version DESC;
```

> **Template tokens:** the configurable official-document templates live in
> `institution_document_templates` (`sections`, `tokens` columns). A school may
> issue documents via an `InstitutionDocumentProfile` (rich fee-chart letters,
> as seeded) and/or `InstitutionDocumentTemplate` rows. The query below covers
> templates where used.

```sql
-- R12.6 active document templates + declared tokens per school (where used).
SELECT
    i.code AS school,
    t.document_type,
    t.name,
    t.version,
    (t.tokens IS NOT NULL) AS has_tokens
FROM institution_document_templates t
JOIN institutions i ON i.id = t.institution_id
WHERE t.is_active IS TRUE
ORDER BY i.code, t.document_type, t.version DESC;
```

### Not-ready flag (read-only)

```sql
-- R12.6 NOT READY: active school issuing acceptance letters but missing config
-- (no sections, no signatory name, or a fee-chart letter with no bank rows).
-- Expect ZERO rows at sign-off.
SELECT
    i.code AS school,
    dp.document_type,
    concat_ws(', ',
        CASE WHEN dp.sections IS NULL OR dp.sections = '{}'::jsonb
             THEN 'no sections' END,
        CASE WHEN nullif(btrim(dp.signatory ->> 'name'), '') IS NULL
             THEN 'no signatory name' END,
        CASE WHEN dp.layout_key = 'fee_chart_letter'
              AND jsonb_array_length(coalesce(to_jsonb(dp.bank_accounts), '[]'::jsonb)) = 0
             THEN 'fee-chart letter with no bank details' END
    ) AS not_ready_reason
FROM institution_document_profiles dp
JOIN institutions i ON i.id = dp.institution_id
WHERE i.is_active IS TRUE
  AND dp.is_active IS TRUE
  AND (
        dp.sections IS NULL OR dp.sections = '{}'::jsonb
     OR nullif(btrim(dp.signatory ->> 'name'), '') IS NULL
     OR (dp.layout_key = 'fee_chart_letter'
         AND jsonb_array_length(coalesce(to_jsonb(dp.bank_accounts), '[]'::jsonb)) = 0)
  )
ORDER BY i.code, dp.document_type;
```

---

## R12.7 — Staff data present (super-admins, institution admins, reviewers, finance approvers, scoped grants)

**Ready when:** at least one platform `super_admin` exists; every active school
has at least one active institution-admin membership and at least one reviewer;
and any scoped/expiring `access_grants` are intentional and not silently expired.

### Platform + per-school staff inventory (read-only)

```sql
-- R12.7 platform super-admins.
SELECT id, email, role, is_active
FROM profiles
WHERE role = 'super_admin'
ORDER BY email;
```

```sql
-- R12.7 staff per school via institution memberships.
SELECT
    i.code AS school,
    m.role,
    count(*) FILTER (WHERE m.is_active IS TRUE) AS active_members
FROM user_institution_memberships m
JOIN institutions i ON i.id = m.institution_id
GROUP BY i.code, m.role
ORDER BY i.code, m.role;
```

```sql
-- R12.7 access grants: scope type, target, expiry status.
SELECT
    p.email,
    g.scope_type,
    i.code            AS institution,
    pr.code           AS program,
    g.application_id,
    g.is_active,
    g.expires_at,
    (g.expires_at IS NOT NULL AND g.expires_at < now()) AS expired
FROM access_grants g
JOIN profiles p          ON p.id = g.user_id
LEFT JOIN institutions i ON i.id = g.institution_id
LEFT JOIN programs pr    ON pr.id = g.program_id
ORDER BY p.email, g.scope_type;
```

### Not-ready flag (read-only)

```sql
-- R12.7 NOT READY (platform): no active super-admin anywhere. Expect ZERO rows.
SELECT 'no active super_admin on the platform' AS not_ready_reason
WHERE NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE role = 'super_admin' AND is_active IS TRUE
);
```

```sql
-- R12.7 NOT READY (per school): active school with no active institution admin
-- (membership role 'admin'/'institution_admin') or no active reviewer.
-- 'finance approver' is recorded where the deployment uses a dedicated role;
-- if finance approval is handled by admins, that column reads as covered.
-- Expect ZERO rows at sign-off.
SELECT
    i.code AS school,
    concat_ws(', ',
        CASE WHEN NOT EXISTS (
                 SELECT 1 FROM user_institution_memberships m
                 WHERE m.institution_id = i.id AND m.is_active IS TRUE
                   AND m.role IN ('admin', 'institution_admin')
             ) THEN 'no active institution admin' END,
        CASE WHEN NOT EXISTS (
                 SELECT 1 FROM user_institution_memberships m
                 WHERE m.institution_id = i.id AND m.is_active IS TRUE
                   AND m.role = 'reviewer'
             ) THEN 'no active reviewer' END
    ) AS not_ready_reason
FROM institutions i
WHERE i.is_active IS TRUE
  AND (
        NOT EXISTS (SELECT 1 FROM user_institution_memberships m
                     WHERE m.institution_id = i.id AND m.is_active IS TRUE
                       AND m.role IN ('admin', 'institution_admin'))
     OR NOT EXISTS (SELECT 1 FROM user_institution_memberships m
                     WHERE m.institution_id = i.id AND m.is_active IS TRUE
                       AND m.role = 'reviewer')
  )
ORDER BY i.code;
```

> **Role note:** the canonical platform roles are `student < reviewer < admin <
> super_admin` (`backend/apps/accounts/models.py:ROLE_CHOICES`). Per-school staff
> binding is via `user_institution_memberships.role`; "finance approver" is a
> deployment-specific scoped role recorded in that table or via `access_grants`
> permissions. Adjust the role-name set above to match the deployment's
> convention before sign-off.

---

## R12.8 — Communication config present, Beanola-or-tenant-derived

**Ready when:** for every message type the platform sends, there is either an
active Beanola platform template (`institution_id IS NULL`) or an active
per-school template; the sender email and support contact resolve to a Beanola
or tenant-owned address (never a personal/legacy address).

### Comms inventory (read-only)

```sql
-- R12.8 communication templates by key and scope (platform vs per-school).
SELECT
    ct.template_key,
    ct.institution_id IS NULL          AS beanola_platform_default,
    i.code                             AS school,
    ct.channel,
    ct.version,
    ct.is_active
FROM communication_templates ct
LEFT JOIN institutions i ON i.id = ct.institution_id
WHERE ct.is_active IS TRUE
ORDER BY ct.template_key, beanola_platform_default DESC, i.code, ct.version DESC;
```

```sql
-- R12.8 sender/support contacts derive from Beanola or tenant domains.
SELECT
    i.code,
    i.admissions_email,
    i.support_email,
    i.email AS legacy_contact_email
FROM institutions i
WHERE i.is_active IS TRUE
ORDER BY i.code;
```

### Not-ready flag (read-only)

```sql
-- R12.8 NOT READY: a message key with no active template at any scope, OR a
-- school contact email that is neither a beanola.com nor a tenant-domain
-- address. The expected message keys mirror render_message() in
-- backend/apps/common/email/render.py.
-- Expect ZERO rows at sign-off.
SELECT k.template_key, 'no active template at any scope' AS not_ready_reason
FROM (VALUES
        ('application_submitted'),
        ('payment_received'),
        ('interview_scheduled'),
        ('acceptance'),
        ('conditional_acceptance'),
        ('rejection'),
        ('password_reset')
     ) AS k(template_key)
WHERE NOT EXISTS (
    SELECT 1 FROM communication_templates ct
    WHERE ct.template_key = k.template_key AND ct.is_active IS TRUE
)
UNION ALL
SELECT i.code, 'contact email not Beanola/tenant-derived: '
               || coalesce(nullif(btrim(coalesce(i.admissions_email, i.email)), ''), '(blank)')
FROM institutions i
WHERE i.is_active IS TRUE
  AND coalesce(i.admissions_email, i.email) IS NOT NULL
  AND coalesce(i.admissions_email, i.email) NOT ILIKE '%@%beanola.com'
  AND NOT EXISTS (
        SELECT 1 FROM institution_domains d
        WHERE d.institution_id = i.id
          AND d.is_active IS TRUE
          AND coalesce(i.admissions_email, i.email) ILIKE '%@' || d.hostname
  )
ORDER BY 1;
```

> **Sender note:** the platform sends outbound only (Zoho SMTP primary, Resend
> fallback) — `tech.md`. SMS templates are covered by the same
> `communication_templates.channel` column (`sms`/`both`); none are required
> unless an SMS flow is enabled. The Beanola platform default template per key is
> the safe fallback resolved by `CommunicationService`.

---

## Aggregate readiness roll-up (read-only)

A single query an operator can run to count outstanding blockers across R12.3,
R12.5, R12.7-platform, and R12.8 keys. **Ready when every count is zero.**

```sql
SELECT
    (SELECT count(*) FROM programs p
       WHERE p.is_active IS TRUE AND p.offering_status = 'active'
         AND (p.canonical_program_id IS NULL
              OR NOT EXISTS (SELECT 1 FROM program_intakes pi
                              WHERE pi.program_id = p.id AND pi.is_active IS TRUE)
              OR NOT EXISTS (SELECT 1 FROM program_fees pf
                              WHERE pf.program_id = p.id AND pf.is_active IS TRUE)))
        AS r123_offerings_not_ready,
    (SELECT count(*) FROM institutions i
       WHERE i.is_active IS TRUE
         AND NOT EXISTS (SELECT 1 FROM institution_document_profiles dp
                          WHERE dp.institution_id = i.id
                            AND dp.document_type = 'acceptance_letter'
                            AND dp.is_active IS TRUE))
        AS r125_schools_without_profile,
    (SELECT count(*) FROM profiles
       WHERE role = 'super_admin' AND is_active IS TRUE) = 0
        AS r127_no_super_admin,
    (SELECT count(*) FROM (VALUES
            ('application_submitted'),('payment_received'),('interview_scheduled'),
            ('acceptance'),('conditional_acceptance'),('rejection'),('password_reset')
         ) AS k(template_key)
       WHERE NOT EXISTS (SELECT 1 FROM communication_templates ct
                          WHERE ct.template_key = k.template_key AND ct.is_active IS TRUE))
        AS r128_message_keys_uncovered;
```

---

## Current results — Neon authoring branch

> **Captured:** against the Neon `mihasApplication` project (`wild-bar-37055823`)
> **default branch** via Neon MCP `run_sql` (SELECT-only, no writes). The same
> block, run against `mihas-postgres-1` on the EC2 box after the gated cutover
> (R3), is copied into the runbook production evidence section (R3.7).

### ⚠️ Key finding — the multi-tenant additive schema is NOT applied on this branch

The four additive scripts (`2026_06_08_01…04`) that this readiness check assumes
are **not yet applied** on the Neon default branch. Concretely, on the date of
capture:

- `institutions` is **missing** the branding/identity columns the queries rely
  on: `slug`, `brand_name`, `primary_color`, `secondary_color`, `support_email`,
  `admissions_email`. Only the base columns (`code`, `name`, `full_name`,
  `email`, `phone`, `website`, `is_active`, …) exist.
- `programs` is **missing** `canonical_program_id`, `offering_status`,
  `assignment_priority`, `assignment_rules` (only base columns + `is_active`,
  `duration_months` exist).
- `communication_templates` is **missing** the tenant columns `institution_id`
  and `version`.
- The new tenant **tables exist** but are **empty**: `institution_assets` (0),
  `institution_document_profiles` (0), `institution_required_documents` (0),
  `institution_domains` (0), `user_institution_memberships` (0),
  `access_grants` (0), `canonical_programs` (0).

**Interpretation:** this matches the spec state — Phase 3 (R3) production cutover
is **operator-gated and pending**, and the multi-tenant base was Neon-validated
on a **separate branch** during the remediation spec, not promoted to this
default branch. **This whole branch is therefore NOT READY by R12.1–R12.8** and
every blocker flag (R12.3 / R12.5 / R12.7-platform / R12.8) would fire once the
columns exist. The columned queries above must be re-run on the branch where the
four additive scripts have been applied (the remediation validation branch, or a
fresh branch off it), and again on production post-cutover.

### Baseline counts captured (queries adapted to the columns that exist today)

| Metric | Neon default branch |
|--------|--------------------|
| institutions / active | 2 / 2 (MIHAS, KATC) |
| canonical_programs | **0** (R12.4 empty-table blocker would fire) |
| programs / active | 4 / 4 |
| intakes | 3 |
| program_intakes | 12 |
| program_fees | 8 (2 active per offering) |
| institution_assets | **0** (R12.2 blocker) |
| institution_document_profiles | **0** (R12.5 blocker) |
| institution_required_documents | **0** |
| institution_domains | **0** (R12.1 blocker) |
| user_institution_memberships | **0** (R12.7 per-school blocker) |
| access_grants | 0 |
| communication_templates | 33 active |
| profiles role=super_admin | 2 (R12.7 platform check passes) |

Per-offering catalog snapshot (R12.3/R12.4, adapted — no `canonical_program_id`/
`offering_status` columns on this branch, so canonical-link and offering-status
gates are reported as "column absent"):

| School | Offering | Active | Intakes | Active fee rules | Eligibility rules |
|--------|----------|--------|---------|------------------|-------------------|
| KATC | DCM — Diploma in Clinical Medicine | yes | 3 | 2 | 5 |
| KATC | DEH — Diploma in Environmental Health | yes | 3 | 2 | 5 |
| MIHAS | CPC — Certificate In Psychosocial Counselling | yes | 3 | 2 | 3 |
| MIHAS | DRN — Diploma in Registered Nursing | yes | 3 | 2 | 5 |

Institution detail (R12.1, adapted to existing columns):

| School | Legal name | email | phone | website | active |
|--------|-----------|-------|-------|---------|--------|
| KATC | Kalulushi Training Centre | _null_ | _null_ | _null_ | yes |
| MIHAS | Mukuba Institute of Health and Allied Sciences | _null_ | _null_ | _null_ | yes |

> Note the `name`/`full_name` here read "Allied Sciences" on this branch, whereas
> the seed/branding command (`brand_institutions.py`) uses "Applied Sciences".
> Reconcile the legal name during R12.1 sign-off on the cutover branch.

Comms key coverage (R12.8) — **the stored keys do not match the seven
`render_message()` keys** used in the not-ready flag. On this branch the active
keys are status-event keys (`application_approved`, `application_rejected`,
`payment_verified`, `enrollment_confirmed`, …), not `acceptance` /
`payment_received` / `rejection` / `password_reset`. So the literal R12.8
not-ready query reports `acceptance`, `conditional_acceptance`, `payment_received`,
`rejection`, `password_reset` as "no active template", while functionally
equivalent keys exist. **Action for sign-off:** reconcile the expected-key list
in the R12.8 query against the authoritative `communication_templates` rows on
the cutover branch (or confirm `render_message()` maps event → key), rather than
treating these as true gaps.

### Roll-up status

| Check | Neon (default branch) result | Prod result (post-cutover) | Sign-off |
|-------|------------------------------|----------------------------|----------|
| R12.1 institution data | **NOT READY** — branding/identity columns absent; 0 domains; contacts null | _pending cutover_ | |
| R12.2 assets | **NOT READY** — 0 institution_assets | _pending cutover_ | |
| R12.3 offering linkage (blocker) | **INDETERMINATE** — `canonical_program_id`/`offering_status` columns absent | _pending cutover_ | |
| R12.4 catalog data | **NOT READY** — canonical_programs empty (0) | _pending cutover_ | |
| R12.5 doc profile + assets (blocker) | **NOT READY** — 0 document profiles, 0 assets | _pending cutover_ | |
| R12.6 document config | **NOT READY** — 0 profiles / 0 required docs / 0 templates | _pending cutover_ | |
| R12.7 staff data | **PARTIAL** — 2 super_admins (platform OK); 0 memberships (per-school NOT READY) | _pending cutover_ | |
| R12.8 comms config | **RECONCILE** — 33 active templates but key-naming differs from query list; contacts null | _pending cutover_ | |
| **Aggregate roll-up** | **NOT READY on this branch** — expected: cutover pending | _pending cutover_ | |

### Per-school sign-off (R12.1) — to complete on the cutover branch / production

| School (code) | slug | brand_name | legal_name | admissions email | phone | active domains | is_active | Initials |
|---------------|------|-----------|-----------|------------------|-------|----------------|-----------|----------|
| MIHAS | _pending_ | _pending_ | Mukuba Institute of Health and Applied Sciences | _pending_ | _pending_ | _pending_ | yes | |
| KATC  | _pending_ | _pending_ | Kalulushi Training Centre | _pending_ | _pending_ | _pending_ | yes | |
