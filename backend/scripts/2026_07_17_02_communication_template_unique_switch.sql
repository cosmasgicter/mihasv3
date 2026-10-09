-- Admissions V2 — task 3.3 communication-template uniqueness SWITCH.
--
-- Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.3
-- Requirements: R5.6, R15.5 | Findings: TEN-08 | Design: §15.2 (priority #1).
--
-- Drops the legacy global UNIQUE(template_key) constraint that the single-tenant
-- schema (00_full_schema.sql) created and the June tenant migration
-- (2026_06_08_04_communication_templates_tenant.sql) deliberately left intact.
-- That global unique forbids more than one row per template_key, which blocks
-- the tenant-aware model (one Beanola platform row + per-institution rows, each
-- versioned). The null-safe tenant-scoped replacements — uq_comm_templates_
-- key_inst_version and uq_comm_templates_one_active — are created FIRST by
-- script 01, so there is never a window without uniqueness enforcement.
--
-- Preflight (docs/v2-evidence/3.3/inventory.sql block P6, run READ-ONLY on the
-- Neon default branch before authoring): 33 template rows, 0 duplicate
-- template_key values, 0 duplicate (key, institution_id, version) tuples, 0
-- duplicate active (key, institution_id) pairs. Dropping the global unique
-- therefore loses no enforcement the tenant-scoped uniques do not already
-- provide for the current data.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS. Additive-only lint safe — the runner
-- lint (apply_sql_migrations._find_non_additive_violations) rejects DROP COLUMN
-- / DROP TABLE / TRUNCATE / unqualified DELETE / narrowing ALTER TYPE, none of
-- which this is; DROP CONSTRAINT on a superseded unique is the intended,
-- preflight-gated "switch" step of the expand→switch sequence (design §15.2).

ALTER TABLE communication_templates
    DROP CONSTRAINT IF EXISTS communication_templates_template_key_key;
