-- Admissions V2 — task 9.1 (one scoped applications query and aggregate
-- contract), server-side saved filters. EXPAND phase (additive, idempotent).
--
-- Spec:         .kiro/specs/admissions-v2-canonical-rebuild/
-- Requirements: R8.1 (list, filters, facets, search, pagination, aggregates,
--               and dashboard links served by ONE scoped query contract)
-- Findings:     ADM-01
-- Design:       design.md §13.2 — "Applications: server query, saved filters,
--               queue, detail/review."
--
-- What this adds
-- --------------
-- One additive table so a named applications query is a **server** record
-- rather than browser state. Before this migration the roster's filters lived
-- in ``sessionStorage`` under one key (``admin_applications_filters``), which
-- meant:
--
--   * a saved view did not survive a different browser, a cleared session, or
--     a second device — so it could not be shared with a colleague or cited in
--     a handover;
--   * there was exactly one slot, so "saved filters" was really "the last
--     filters I used";
--   * nothing recorded which tenant a saved view belonged to, so a filter saved
--     while one school was selected silently reapplied to another.
--
-- A saved filter is therefore stored as what it is: an actor-owned, optionally
-- institution-scoped, named query over the registered parameters of the task-9.1
-- applications contract.
--
--   * user_id        — the owning actor. Saved filters are private to their
--                      owner; the list/read/delete paths scope by this column
--                      BEFORE any lookup, so one operator's saved view is never
--                      observable by another.
--   * institution_id — optional tenant binding. NULL means "not bound to one
--                      school" (a platform actor's cross-tenant view). When set,
--                      the read path re-resolves it through
--                      visible_institution_queryset, so a saved filter cannot
--                      become a way to keep reading a school after a membership
--                      is revoked.
--   * name           — the operator's label for the view.
--   * query          — jsonb map of registered query parameters. Validated
--                      against ApplicationQueryService.REGISTERED_PARAMETERS on
--                      write, so a saved view can never persist a parameter the
--                      contract does not implement (that is ADM-01's
--                      ignored-filter defect, written to disk).
--
-- Online-safety: CREATE TABLE IF NOT EXISTS plus additive indexes only. No
-- existing table is touched, no column is altered, no data is migrated. The FKs
-- are declared ON DELETE CASCADE (owner) / ON DELETE CASCADE (institution) so a
-- deactivated actor or a deleted tenant leaves no orphan saved query behind.
--
-- Re-runnable: every statement is guarded, so a re-run after a tracking-table
-- wipe converges rather than failing.

CREATE TABLE IF NOT EXISTS admin_saved_filters (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    institution_id  uuid NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name            varchar(120) NOT NULL,
    query           jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One name per owner: saving an existing name is an update, not a duplicate.
-- Partial-unique on the owner + lower(name) pair so "Overdue" and "overdue" are
-- the same saved view rather than two rows an operator cannot tell apart.
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_saved_filters_owner_name
    ON admin_saved_filters (user_id, lower(name));

-- The list read is always "this actor's saved filters, most recent first".
CREATE INDEX IF NOT EXISTS idx_admin_saved_filters_owner_updated
    ON admin_saved_filters (user_id, updated_at DESC);

-- Tenant-scoped reads narrow by institution before touching a row.
CREATE INDEX IF NOT EXISTS idx_admin_saved_filters_institution
    ON admin_saved_filters (institution_id)
    WHERE institution_id IS NOT NULL;

COMMENT ON TABLE admin_saved_filters IS
    'Admissions V2 task 9.1 (R8.1, ADM-01): actor-owned, optionally tenant-bound named queries over the registered applications query parameters. Replaces the single sessionStorage filter slot.';
COMMENT ON COLUMN admin_saved_filters.query IS
    'Registered applications query parameters only — validated against ApplicationQueryService.REGISTERED_PARAMETERS on write.';
