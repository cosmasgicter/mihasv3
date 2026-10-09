"""Property-based test: rollback files contain only inverse-additive operations.

# Feature: production-schema-reconciliation
# Property: Rollback Inverse-Additive Safety

Every ``*_rollback.sql`` file under ``backend/scripts/`` SHALL contain
only inverse-additive operations selected from the closed set:

* ``DROP INDEX`` (with optional ``CONCURRENTLY`` and ``IF EXISTS``)
* ``DROP COLUMN`` (standalone or as clauses inside ``ALTER TABLE``)
* ``DROP TABLE``
* ``DROP SEQUENCE``
* ``DELETE FROM migration_history`` (any form, with or without WHERE)
* ``DELETE FROM <other_table> WHERE ...`` (scoped DELETE only — must
  carry a ``WHERE`` clause)

And SHALL NOT contain any of these forward-additive / destructive forms:

* ``TRUNCATE``
* ``DELETE FROM <other_table>`` without a ``WHERE`` clause (unbounded
  DELETE on any non-``migration_history`` table)
* ``ALTER TABLE ... ADD`` (forward-additive — would re-create what the
  forward script created)
* ``CREATE`` (any flavour: TABLE, INDEX, SEQUENCE, FUNCTION, VIEW, etc.)
* ``INSERT`` (forward-additive — rollbacks remove rows, they do not add)

This property is the structural complement of ``test_rollback_pairing``:
that test confirms a rollback file *exists* alongside every forward
script; this test confirms each rollback file *only contains operations
that undo additive changes*. Together they back the
``Rollback_Plan`` term in the requirements glossary.

Pre-processing:

1. Strip ``--`` line comments from each line (only outside string
   literals — but rollback files do not embed ``--`` inside strings,
   so a simple substring search is sufficient).
2. Remove ``DO $$ ... END $$;`` notice blocks per Requirement 9.4 —
   these blocks contain ``RAISE NOTICE`` row-count diagnostics that
   would otherwise look like SQL statements but are explicitly allowed
   by Requirement 9.4 as operator-facing safety surfaces.
3. Split the remaining SQL on ``;`` into atomic statements.
4. For each non-empty trimmed statement, normalise whitespace and
   classify against the allow-list.

Hypothesis is used to draw arbitrary non-empty subsets of the
discovered rollback-file set so that, when a future operator authors
a rollback containing a forbidden statement, the shrunk
counter-example identifies the offending file rather than dumping
every rollback at once.

**Validates: Requirements 9.2**

Spec: ``.kiro/specs/production-schema-reconciliation/`` — Task 2.5.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ["TESTING"] = "1"

from hypothesis import given, settings
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Discover the rollback-file set (top-level only)
# ---------------------------------------------------------------------------

# ``parents[2]`` resolves to ``backend/`` regardless of cwd:
#   tests/property/test_rollback_safe_operations.py
#   parents[0] = property/
#   parents[1] = tests/
#   parents[2] = backend/
SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"

ROLLBACK_SUFFIX = "_rollback.sql"


def _discover_rollback_files() -> list[Path]:
    """Return the sorted list of rollback files at the top level of scripts/.

    Top-level ``backend/scripts/*_rollback.sql`` only. The ``applied/``,
    ``archive/``, and legacy ``migrations/`` subdirectories are excluded
    by virtue of not iterating into them — those directories should not
    contain rollback files in the first place (per design.md Component 3,
    they hold either historical applied scripts or legacy stubs).
    """
    if not SCRIPTS_DIR.is_dir():
        return []

    return sorted(
        entry
        for entry in SCRIPTS_DIR.iterdir()
        if entry.is_file() and entry.name.endswith(ROLLBACK_SUFFIX)
    )


ROLLBACK_FILES: list[Path] = _discover_rollback_files()


# ---------------------------------------------------------------------------
# SQL pre-processing
# ---------------------------------------------------------------------------


def _strip_line_comments(sql: str) -> str:
    """Strip ``--`` line comments from each line of SQL.

    Rollback files in this project never embed ``--`` inside string
    literals, so a per-line ``find('--')`` is sufficient and avoids the
    complexity of a full SQL tokeniser.
    """
    cleaned: list[str] = []
    for line in sql.splitlines():
        idx = line.find("--")
        if idx >= 0:
            line = line[:idx]
        cleaned.append(line)
    return "\n".join(cleaned)


# ``DO $$ ... END $$;`` notice block. Multi-line, non-greedy so back-to-back
# blocks (as in 2026_05_18_hot_query_indexes_rollback.sql) match
# independently. The trailing ``;`` is required by Postgres syntax for
# anonymous code blocks.
# 13.6 remediation M3 — INSTRUMENT-A. This pattern required WHITESPACE either
# side of the dollar quotes (``DO\s+\$\$`` … ``END\s+\$\$``). Postgres does not:
# ``DO $$ … END$$;`` is the same statement, and four rollback files in this
# repository are written that way. The block therefore was not stripped, its
# ``IF EXISTS … THEN ALTER TABLE …`` interior was split on ``;`` like ordinary
# SQL, and 16 fragments were reported as violations — every one of them a piece
# of a guard block Requirement 9.4 explicitly allows.
#
# The whitespace is now optional and the dollar-quote **tag** is honoured
# (``$$`` or ``$name$``), with the closing tag required to match the opening one
# via a backreference. That is stricter about pairing than the old pattern while
# accepting the two spellings Postgres accepts.
_DO_BLOCK_RE = re.compile(
    r"DO\s*(\$[A-Za-z_]*\$).*?END\s*\1\s*;",
    flags=re.DOTALL | re.IGNORECASE,
)


def _strip_do_blocks(sql: str) -> str:
    """Remove every ``DO $$ ... END $$;`` block from the SQL text.

    Requirement 9.4 explicitly allows these blocks at the head of any
    rollback that touches ``payments`` / ``applications`` / student-data
    tables, so the safety check must whitelist them — they are not
    inverse-additive operations themselves but operator-facing
    row-count diagnostics that run before the destructive work.
    """
    return _DO_BLOCK_RE.sub("", sql)


def _split_statements(sql: str) -> list[str]:
    """Split SQL text on ``;`` into trimmed, non-empty statements."""
    return [stmt.strip() for stmt in sql.split(";") if stmt.strip()]


def _normalise_whitespace(stmt: str) -> str:
    """Collapse runs of whitespace into single spaces for prefix matching."""
    return re.sub(r"\s+", " ", stmt).strip()


# ---------------------------------------------------------------------------
# Allowed and rejected pattern definitions
# ---------------------------------------------------------------------------

# Allowed prefixes — the closed set from Requirement 9.2 plus the task
# description's two extensions (DROP SEQUENCE for application_number
# sequence rollback, and scoped DELETE FROM <table> WHERE ... for the
# seed-row rollbacks that delete by deterministic primary key).
_ALLOWED_DROP_PREFIXES = (
    re.compile(r"^DROP\s+INDEX\b", re.IGNORECASE),
    re.compile(r"^DROP\s+TABLE\b", re.IGNORECASE),
    re.compile(r"^DROP\s+SEQUENCE\b", re.IGNORECASE),
    re.compile(r"^DROP\s+COLUMN\b", re.IGNORECASE),
)

_DELETE_MIGRATION_HISTORY_RE = re.compile(
    r"^DELETE\s+FROM\s+migration_history\b",
    re.IGNORECASE,
)

_DELETE_FROM_TABLE_RE = re.compile(
    r"^DELETE\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*)\b",
    re.IGNORECASE,
)

# ALTER TABLE <name> DROP COLUMN ..., DROP COLUMN ...; — Postgres syntax
# for dropping multiple columns in one statement. Allowed only when EVERY
# clause inside the ALTER TABLE body is a DROP COLUMN — any ADD, ALTER
# COLUMN TYPE, or other operation re-introduces forward-additive shape.
#
# 13.6 remediation M3 — INSTRUMENT-B. ``(?:ONLY\s+)?`` admitted
# ``ALTER TABLE ONLY t`` but not ``ALTER TABLE IF EXISTS t``, which is standard
# Postgres and strictly *more* defensive than the bare form — it makes the
# rollback idempotent when the table is already gone. Six statements in
# ``2026_07_26_01_document_evidence_lifecycle_rollback.sql`` were reported for
# using it. ``_ALTER_TABLE_TARGET`` is now shared by both allowed forms so the
# two cannot drift apart again.
_ALTER_TABLE_TARGET = r"ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?[A-Za-z_][A-Za-z0-9_.]*\s+"

_ALTER_TABLE_DROP_COLUMN_RE = re.compile(
    r"^" + _ALTER_TABLE_TARGET + r"DROP\s+COLUMN\b",
    re.IGNORECASE,
)

# ``ALTER TABLE <name> DROP CONSTRAINT [IF EXISTS] <constraint>`` — the exact
# inverse of a forward ``ALTER TABLE ... ADD CONSTRAINT`` (e.g. a NOT VALID
# foreign key). Dropping a named constraint removes only metadata; it cannot
# destroy a row, so it is strictly inverse-additive and safe in a rollback.
_ALTER_TABLE_DROP_CONSTRAINT_RE = re.compile(
    r"^" + _ALTER_TABLE_TARGET + r"DROP\s+CONSTRAINT\b",
    re.IGNORECASE,
)

# ``ALTER TABLE ... ADD`` is the forward-additive complement we explicitly
# reject. The ``\bADD\b`` look matches ADD COLUMN, ADD CONSTRAINT, ADD
# FOREIGN KEY, etc.
_ALTER_TABLE_ADD_RE = re.compile(
    r"^ALTER\s+TABLE\b.*\bADD\b",
    re.IGNORECASE | re.DOTALL,
)

# Catch-all rejected tokens. ``CREATE`` matches every CREATE flavour
# (TABLE, INDEX, SEQUENCE, FUNCTION, VIEW, TRIGGER, MATERIALIZED VIEW,
# SCHEMA, TYPE, EXTENSION, OR REPLACE FUNCTION, ...). ``INSERT INTO``
# matches the forward-additive seed insert. ``TRUNCATE`` is the
# nuclear-option destructive form Requirement 9.2 explicitly forbids
# even when the operator's intent is "remove all seeded rows".
_REJECTED_TOKEN_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bTRUNCATE\b", re.IGNORECASE), "TRUNCATE"),
    (re.compile(r"\bINSERT\s+INTO\b", re.IGNORECASE), "INSERT INTO"),
    (re.compile(r"\bCREATE\b", re.IGNORECASE), "CREATE"),
)


# ---------------------------------------------------------------------------
# Statement classifier
# ---------------------------------------------------------------------------


def _classify_statement(stmt: str) -> tuple[bool, str]:
    """Decide whether a single SQL statement is inverse-additive-safe.

    Returns ``(allowed, reason)``. ``reason`` is a short human-readable
    string used to build the assertion failure message and the shrunk
    counter-example when hypothesis surfaces a violation.
    """
    normalised = _normalise_whitespace(stmt)

    # 0. Transaction-control statements (BEGIN/COMMIT/ROLLBACK/START
    #    TRANSACTION/END) are inert wrappers — they move no data and are
    #    safe inside a rollback script. Allow them so a transactional
    #    rollback file is not flagged for its BEGIN/COMMIT envelope.
    if re.match(r"^(BEGIN|COMMIT|ROLLBACK|END|START\s+TRANSACTION)\b", normalised, re.IGNORECASE):
        return True, "transaction-control"

    # 1. Reject the forbidden tokens first. Order matters: we want the
    #    earliest match to win so the failure message points at the most
    #    specific violation (a TRUNCATE in a statement that also happens
    #    to contain CREATE in a string literal is reported as TRUNCATE).
    for pattern, label in _REJECTED_TOKEN_PATTERNS:
        if pattern.search(normalised):
            return False, f"contains forbidden token {label!r}: {normalised[:120]}"

    # 2. Reject ``ALTER TABLE ... ADD`` explicitly (forward-additive).
    if _ALTER_TABLE_ADD_RE.match(normalised):
        return False, f"forbidden ALTER TABLE ... ADD: {normalised[:120]}"

    # 3. Allow standalone DROP INDEX / DROP TABLE / DROP SEQUENCE /
    #    DROP COLUMN.
    for pattern in _ALLOWED_DROP_PREFIXES:
        if pattern.match(normalised):
            return True, "drop"

    # 4. Allow DELETE FROM migration_history in any form (the audit-table
    #    contract permits unbounded DELETE on this specific table because
    #    the bookkeeping rows are not student data — but we still match
    #    the table name explicitly so a missing WHERE on a *different*
    #    table is caught by the next branch).
    if _DELETE_MIGRATION_HISTORY_RE.match(normalised):
        return True, "delete-migration-history"

    # 5. Allow DELETE FROM <other_table> only when a WHERE clause is
    #    present. This is the "scoped DELETE" form from the task
    #    description.
    delete_match = _DELETE_FROM_TABLE_RE.match(normalised)
    if delete_match:
        table_name = delete_match.group(1).lower()
        # migration_history was already handled above; this branch is
        # only for non-migration_history tables.
        if re.search(r"\bWHERE\b", normalised, re.IGNORECASE):
            return True, "delete-with-where"
        return False, (
            f"DELETE FROM {table_name} without WHERE clause "
            f"(unbounded DELETE forbidden on non-migration_history tables): "
            f"{normalised[:120]}"
        )

    # 6. Allow ``ALTER TABLE <name> DROP COLUMN ..., DROP COLUMN ...``
    #    only when every comma-separated clause is itself a DROP COLUMN.
    if _ALTER_TABLE_DROP_COLUMN_RE.match(normalised):
        # Strip the ``ALTER TABLE [ONLY] <name>`` prefix to inspect the
        # body. The remaining text is a comma-separated list of clauses.
        body = re.sub(
            r"^" + _ALTER_TABLE_TARGET,
            "",
            normalised,
            flags=re.IGNORECASE,
        ).strip()
        clauses = [clause.strip() for clause in body.split(",") if clause.strip()]
        if not clauses:
            return False, f"empty ALTER TABLE body: {normalised[:120]}"
        for clause in clauses:
            if not re.match(r"^DROP\s+COLUMN\b", clause, re.IGNORECASE):
                return False, (
                    f"non-DROP-COLUMN clause inside ALTER TABLE: {clause[:120]} "
                    f"(full: {normalised[:120]})"
                )
        return True, "alter-drop-column"

    # 6b. Allow ``ALTER TABLE <name> DROP CONSTRAINT [IF EXISTS] <name>`` —
    #     the inverse of a forward ``ADD CONSTRAINT`` (e.g. a NOT VALID FK).
    #     Removing a named constraint is metadata-only and cannot destroy a
    #     row, so it is inverse-additive-safe. Guard against an accidental
    #     ``ADD`` elsewhere in the statement (already rejected in step 2).
    if _ALTER_TABLE_DROP_CONSTRAINT_RE.match(normalised):
        return True, "alter-drop-constraint"

    # 6c. Allow a strictly READ-ONLY statement (13.6 remediation M3 —
    #     INSTRUMENT-C). Two rollback files are deliberately inert: the forward
    #     script they undo only *validated* an already-present NOT VALID
    #     constraint, and a validation has no inverse worth writing, so the
    #     rollback is a single ``SELECT 1`` documenting that on purpose rather
    #     than an empty file that looks like an oversight. A read moves no data
    #     and cannot destroy a row, so it belongs in the allowed set.
    #
    #     The guard is that it must be read-*only*: Postgres lets a CTE carry
    #     DML (``WITH x AS (DELETE FROM t RETURNING *) SELECT …``), which is a
    #     data-modifying statement wearing a SELECT's clothes. A statement
    #     naming INSERT / UPDATE / DELETE / MERGE anywhere is therefore not
    #     accepted here and falls through to the rejection below —
    #     ``test_a_select_wrapping_dml_is_still_rejected`` pins that.
    if re.match(r"^(SELECT|WITH)\b", normalised, re.IGNORECASE) and not re.search(
        r"\b(INSERT|UPDATE|DELETE|MERGE)\b", normalised, re.IGNORECASE
    ):
        return True, "read-only"

    # 7. Anything else is rejected.
    return False, (
        f"statement does not match any allowed inverse-additive prefix "
        f"(expected DROP INDEX/COLUMN/TABLE/SEQUENCE, DELETE FROM "
        f"migration_history, scoped DELETE FROM <table> WHERE ..., or "
        f"ALTER TABLE ... DROP COLUMN ...): {normalised[:160]}"
    )


def _audit_rollback_file(path: Path) -> list[str]:
    """Return a list of failure messages for ``path`` (empty when safe)."""
    sql = path.read_text(encoding="utf-8")
    sql = _strip_line_comments(sql)
    sql = _strip_do_blocks(sql)
    statements = _split_statements(sql)

    failures: list[str] = []
    for stmt in statements:
        allowed, reason = _classify_statement(stmt)
        if not allowed:
            failures.append(f"{path.name}: {reason}")
    return failures


# ---------------------------------------------------------------------------
# Property: every rollback statement is inverse-additive-safe
# ---------------------------------------------------------------------------


@given(
    rollback_subset=st.lists(
        st.sampled_from(ROLLBACK_FILES) if ROLLBACK_FILES else st.nothing(),
        min_size=1,
        max_size=max(1, len(ROLLBACK_FILES)),
        unique=True,
    )
)
@settings(max_examples=20, deadline=2000)
def test_every_rollback_statement_is_inverse_additive(
    rollback_subset: list[Path],
) -> None:
    """Every statement in a rollback file matches the allow-list.

    Requirement 9.2 binds every rollback to a closed set of
    inverse-additive operations. Drawing arbitrary non-empty subsets
    of the discovered rollback files exercises the property under
    hypothesis-controlled shrinking, so a forbidden statement shows
    up with the offending file and a 120-character snippet of the
    statement in the shrunk counter-example.

    **Validates: Requirements 9.2**
    """
    failures: list[str] = []
    for rollback_path in rollback_subset:
        failures.extend(_audit_rollback_file(rollback_path))

    assert not failures, (
        "Rollback file(s) contain non-inverse-additive operations. Per "
        "Requirement 9.2, every rollback statement must be one of: "
        "DROP INDEX, DROP COLUMN, DROP TABLE, DROP SEQUENCE, "
        "DELETE FROM migration_history (any form), or scoped "
        "DELETE FROM <table> WHERE ... .\n\nViolations:\n  - "
        + "\n  - ".join(failures)
    )


# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------


def test_rollback_file_discovery_is_non_empty() -> None:
    """Guard against the property silently passing on an empty draw set.

    If ``ROLLBACK_FILES`` is empty (e.g. someone moves the scripts
    directory or a future refactor breaks the path resolution), the
    hypothesis ``sampled_from`` strategy collapses to ``st.nothing()``
    and the property degenerates into a no-op. This sanity check makes
    that mode an explicit failure so the operator sees the
    misconfiguration immediately.

    **Validates: Requirements 9.2**
    """
    assert SCRIPTS_DIR.is_dir(), (
        f"backend/scripts/ not found at expected path {SCRIPTS_DIR}. "
        "The rollback-safety property cannot run."
    )
    assert ROLLBACK_FILES, (
        f"No *_rollback.sql files discovered under {SCRIPTS_DIR}. "
        "Either the directory is empty or the discovery glob has "
        "drifted. Verify ROLLBACK_SUFFIX has not been redefined."
    )


def test_every_discovered_rollback_file_is_individually_safe() -> None:
    """Per-file safety check separate from the hypothesis-driven property.

    The hypothesis property draws random non-empty subsets and so may
    not visit every file on every run. This deterministic test ensures
    each rollback file is audited at least once per pytest invocation,
    which is what an operator running the suite as a pre-deployment
    gate actually wants — every file checked, every run.

    **Validates: Requirements 9.2**
    """
    all_failures: list[str] = []
    for rollback_path in ROLLBACK_FILES:
        all_failures.extend(_audit_rollback_file(rollback_path))

    assert not all_failures, (
        "Rollback file(s) contain non-inverse-additive operations.\n"
        "Violations:\n  - " + "\n  - ".join(all_failures)
    )


# ---------------------------------------------------------------------------
# The widened patterns must still say NO (13.6 remediation M3)
# ---------------------------------------------------------------------------
#
# Widening an over-narrow lint is only defensible if the dangerous forms are
# still caught. Each case below is a statement the widened classifier could
# plausibly have started accepting by accident, and none of them is accepted.


def test_do_block_stripping_accepts_both_dollar_quote_spellings() -> None:
    """``END $$;`` and ``END$$;`` are the same statement to Postgres.

    **Validates: Requirements 9.2, 9.4**
    """
    spaced = "DO $$ BEGIN RAISE NOTICE 'x'; END $$;\nDROP TABLE t;"
    tight = "DO $$ BEGIN RAISE NOTICE 'x'; END$$;\nDROP TABLE t;"
    tagged = "DO $blk$ BEGIN RAISE NOTICE 'x'; END$blk$;\nDROP TABLE t;"
    for sql in (spaced, tight, tagged):
        assert _split_statements(_strip_do_blocks(sql)) == ["DROP TABLE t"], sql


def test_do_block_stripping_requires_matching_tags() -> None:
    """A mismatched dollar-quote tag is not treated as a closed block.

    Stricter than the pattern it replaced, which had no tag concept at all.

    **Validates: Requirements 9.2**
    """
    sql = "DO $a$ BEGIN RAISE NOTICE 'x'; END$b$;\nDROP TABLE t;"
    assert "DO $a$" in _strip_do_blocks(sql)


def test_alter_table_if_exists_drop_is_allowed_but_add_is_not() -> None:
    """``IF EXISTS`` makes a rollback idempotent; it must not smuggle in ADD.

    **Validates: Requirements 9.2**
    """
    for allowed in (
        "ALTER TABLE IF EXISTS t DROP CONSTRAINT IF EXISTS c",
        "ALTER TABLE IF EXISTS ONLY t DROP COLUMN c",
        "ALTER TABLE ONLY t DROP COLUMN c",
    ):
        ok, reason = _classify_statement(allowed)
        assert ok, (allowed, reason)

    for rejected in (
        "ALTER TABLE IF EXISTS t ADD COLUMN c integer",
        "ALTER TABLE IF EXISTS t ADD CONSTRAINT c CHECK (x > 0)",
        "ALTER TABLE IF EXISTS t DROP COLUMN a, ADD COLUMN b integer",
        "ALTER TABLE IF EXISTS t ALTER COLUMN c TYPE text",
    ):
        ok, reason = _classify_statement(rejected)
        assert not ok, (rejected, reason)


def test_a_select_wrapping_dml_is_still_rejected() -> None:
    """A read-only statement is allowed; a CTE carrying DML is not.

    This is the one that matters: Postgres lets ``WITH x AS (DELETE FROM t
    RETURNING *) SELECT * FROM x`` destroy rows while beginning with ``WITH``.

    **Validates: Requirements 9.2**
    """
    for allowed in ("SELECT 1", "select 1", "WITH x AS (SELECT 1) SELECT * FROM x"):
        ok, reason = _classify_statement(allowed)
        assert ok, (allowed, reason)

    for rejected in (
        "WITH x AS (DELETE FROM subjects RETURNING *) SELECT * FROM x",
        "WITH x AS (UPDATE subjects SET is_active = true RETURNING *) SELECT * FROM x",
        "WITH x AS (INSERT INTO subjects (code) VALUES ('A') RETURNING *) SELECT * FROM x",
        "SELECT * FROM (DELETE FROM t RETURNING *) s",
    ):
        ok, reason = _classify_statement(rejected)
        assert not ok, (rejected, reason)


def test_the_destructive_forms_requirement_9_2_forbids_are_still_rejected() -> None:
    """The whole rejected set, re-asserted after the widening.

    **Validates: Requirements 9.2**
    """
    for rejected in (
        "TRUNCATE subjects",
        "TRUNCATE TABLE subjects",
        "DELETE FROM subjects",
        "INSERT INTO subjects (code) VALUES ('A')",
        "CREATE TABLE t (id uuid)",
        "CREATE INDEX i ON t (id)",
        "UPDATE subjects SET is_active = true WHERE code = 'MUS'",
        "DROP DATABASE mihas",
    ):
        ok, reason = _classify_statement(rejected)
        assert not ok, (rejected, reason)

    # And the forms Requirement 9.2 does allow are unchanged by the widening.
    for allowed in (
        "DROP INDEX CONCURRENTLY IF EXISTS i",
        "DROP TABLE IF EXISTS t",
        "DROP SEQUENCE IF EXISTS s",
        "DELETE FROM migration_history",
        "DELETE FROM migration_history WHERE migration_name = 'x'",
        "DELETE FROM subjects WHERE code = 'MUS'",
        "BEGIN",
        "COMMIT",
    ):
        ok, reason = _classify_statement(allowed)
        assert ok, (allowed, reason)
