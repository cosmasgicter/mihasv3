"""Live database schema manifest + diff engine (Admissions V2, task 3.1).

Motivation
----------
The legacy verifiers (``scripts/verify_schema_static.py`` and
``scripts/verify_migration.py``) trust *hand-maintained* Python lists of
``EXPECTED_TABLES`` / ``EXPECTED_FK_RELATIONSHIPS`` / ``EXPECTED_INDEXES`` and
treat missing indexes as informational only. Finding **DATA-08** flags that as
unreliable: the lists drift from reality, ``00_full_schema.sql`` lacks canonical
columns, and a missing index never fails the gate.

This module replaces those hand lists with a *live introspection* pass that
reads the real database catalog and emits a machine-readable **schema manifest**
(a plain ``dict`` that serialises to JSON). A pure-Python :func:`diff_manifests`
then compares two manifests structurally, and :func:`verify_manifest` checks a
single manifest for intrinsic failures (unvalidated foreign keys / check
constraints, missing required indexes).

Design (design.md ``§15.1``)
----------------------------
Manifest fields introspected:

    tables, columns, types, nullability, defaults,
    PK/FK targets and validation state,
    unique/check/exclusion constraints,
    indexes and predicates,
    triggers, extensions,
    migration ids/checksums/applied_at

The verifier compares fresh-from-empty, migrated snapshot, Neon branch, and
production read-only manifests. **Missing required indexes and unvalidated FKs
are failures** (R15.3, R15.4).

Reusability
-----------
The introspection SQL is Postgres-specific and driven by a DB-API ``cursor`` so
the same code path serves the Django ``connection`` (fresh/migrated local DBs)
and a standalone read-only ``psycopg2`` connection (Neon authoring branch,
production read-only). The :func:`diff_manifests` / :func:`verify_manifest`
functions are pure and DB-free so they can be regression-tested with
intentional-drift fixtures under any backend (no env gating / skips).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

MANIFEST_VERSION = "1"

# Categories whose *default* severity is a hard failure (release-gate blocking).
# Extra/version-drift categories default to a warning so cross-environment
# comparison during an in-flight migration is not drowned in noise, while the
# invariants the spec explicitly names as failures (missing objects, changed
# objects, unvalidated constraints, missing indexes) always block.
_FAILURE_CATEGORIES: frozenset[str] = frozenset(
    {
        "missing_table",
        "extra_table",
        "missing_column",
        "extra_column",
        "column_changed",
        "missing_primary_key",
        "primary_key_changed",
        "missing_foreign_key",
        "foreign_key_changed",
        "extra_foreign_key",
        "unvalidated_foreign_key",
        "missing_unique_constraint",
        "unique_constraint_changed",
        "missing_check_constraint",
        "check_constraint_changed",
        "unvalidated_check_constraint",
        "missing_exclusion_constraint",
        "exclusion_constraint_changed",
        "missing_index",
        "index_changed",
        "missing_required_index",
        "missing_trigger",
        "trigger_changed",
        "missing_extension",
        "missing_migration",
        "migration_checksum_changed",
    }
)

_WARNING_CATEGORIES: frozenset[str] = frozenset(
    {
        "extra_index",
        "extra_trigger",
        "extra_extension",
        "extension_version_changed",
        "extra_migration",
    }
)


def _severity_for(category: str) -> str:
    if category in _FAILURE_CATEGORIES:
        return "failure"
    if category in _WARNING_CATEGORIES:
        return "warning"
    # Unknown categories are treated conservatively as failures so a future
    # category added without updating this map cannot silently pass the gate.
    return "failure"


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Difference:
    """A single structural difference or intrinsic violation."""

    category: str
    object: str
    detail: str
    severity: str = ""

    def resolved_severity(self) -> str:
        return self.severity or _severity_for(self.category)

    def to_dict(self) -> dict[str, str]:
        return {
            "category": self.category,
            "object": self.object,
            "detail": self.detail,
            "severity": self.resolved_severity(),
        }


@dataclass
class DiffReport:
    """The structured outcome of comparing/verifying manifest(s)."""

    baseline_label: str
    candidate_label: str
    differences: list[Difference] = field(default_factory=list)

    def add(self, category: str, obj: str, detail: str) -> None:
        self.differences.append(
            Difference(category=category, object=obj, detail=detail,
                       severity=_severity_for(category))
        )

    @property
    def failures(self) -> list[Difference]:
        return [d for d in self.differences if d.resolved_severity() == "failure"]

    @property
    def warnings(self) -> list[Difference]:
        return [d for d in self.differences if d.resolved_severity() == "warning"]

    @property
    def ok(self) -> bool:
        """True when there are zero failure-severity differences."""
        return not self.failures

    def to_dict(self) -> dict[str, Any]:
        return {
            "baseline_label": self.baseline_label,
            "candidate_label": self.candidate_label,
            "ok": self.ok,
            "failure_count": len(self.failures),
            "warning_count": len(self.warnings),
            "differences": [d.to_dict() for d in self.differences],
        }


# ---------------------------------------------------------------------------
# Introspection (Postgres)
# ---------------------------------------------------------------------------


def _rows(cursor, sql: str, params: Optional[list] = None) -> list[tuple]:
    cursor.execute(sql, params or [])
    return list(cursor.fetchall())


def _introspect_tables(cursor) -> list[str]:
    rows = _rows(
        cursor,
        """
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND c.relkind IN ('r', 'p')
        ORDER BY c.relname
        """,
    )
    return [r[0] for r in rows]


def _introspect_columns(cursor) -> dict[str, list[dict]]:
    rows = _rows(
        cursor,
        """
        SELECT c.relname AS table_name,
               a.attname AS column_name,
               a.attnum  AS ordinal,
               pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
               a.attnotnull AS notnull,
               pg_get_expr(ad.adbin, ad.adrelid) AS default_expr
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
        WHERE n.nspname = current_schema()
          AND c.relkind IN ('r', 'p')
          AND a.attnum > 0
          AND NOT a.attisdropped
        ORDER BY c.relname, a.attnum
        """,
    )
    out: dict[str, list[dict]] = {}
    for table, column, ordinal, col_type, notnull, default_expr in rows:
        out.setdefault(table, []).append(
            {
                "name": column,
                "ordinal": int(ordinal),
                "type": col_type,
                "nullable": not bool(notnull),
                "default": default_expr,
            }
        )
    return out


def _introspect_constraints(cursor) -> dict[str, dict[str, list[dict]]]:
    """Return {table: {"primary_key": [...], "foreign_keys": [...],
    "unique_constraints": [...], "check_constraints": [...],
    "exclusion_constraints": [...]}}.

    ``convalidated`` is the FK/check validation state — a ``NOT VALID``
    constraint reports ``validated=False`` (R15.4).
    """
    rows = _rows(
        cursor,
        """
        SELECT rel.relname AS table_name,
               con.conname  AS name,
               con.contype  AS type,
               con.convalidated AS validated,
               pg_get_constraintdef(con.oid) AS definition,
               ref.relname AS ref_table
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = rel.relnamespace
        LEFT JOIN pg_class ref ON ref.oid = con.confrelid
        WHERE n.nspname = current_schema()
          AND rel.relkind IN ('r', 'p')
        ORDER BY rel.relname, con.conname
        """,
    )
    out: dict[str, dict[str, list[dict]]] = {}
    for table, name, ctype, validated, definition, ref_table in rows:
        bucket = out.setdefault(
            table,
            {
                "primary_key": [],
                "foreign_keys": [],
                "unique_constraints": [],
                "check_constraints": [],
                "exclusion_constraints": [],
            },
        )
        entry = {"name": name, "definition": definition}
        if ctype == "p":
            bucket["primary_key"].append(entry)
        elif ctype == "f":
            bucket["foreign_keys"].append(
                {
                    "name": name,
                    "definition": definition,
                    "ref_table": ref_table,
                    "validated": bool(validated),
                }
            )
        elif ctype == "u":
            bucket["unique_constraints"].append(entry)
        elif ctype == "c":
            bucket["check_constraints"].append(
                {"name": name, "definition": definition, "validated": bool(validated)}
            )
        elif ctype == "x":
            bucket["exclusion_constraints"].append(entry)
    return out


def _introspect_indexes(cursor) -> dict[str, list[dict]]:
    rows = _rows(
        cursor,
        """
        SELECT t.relname AS table_name,
               i.relname AS index_name,
               ix.indisunique  AS is_unique,
               ix.indisprimary AS is_primary,
               am.amname AS method,
               pg_get_indexdef(ix.indexrelid) AS definition,
               pg_get_expr(ix.indpred, ix.indrelid) AS predicate
        FROM pg_index ix
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_am am ON am.oid = i.relam
        WHERE n.nspname = current_schema()
          AND t.relkind IN ('r', 'p')
        ORDER BY t.relname, i.relname
        """,
    )
    out: dict[str, list[dict]] = {}
    for table, name, is_unique, is_primary, method, definition, predicate in rows:
        out.setdefault(table, []).append(
            {
                "name": name,
                "unique": bool(is_unique),
                "primary": bool(is_primary),
                "method": method,
                "predicate": predicate,
                "definition": definition,
            }
        )
    return out


def _introspect_triggers(cursor) -> dict[str, list[dict]]:
    rows = _rows(
        cursor,
        """
        SELECT c.relname AS table_name,
               t.tgname  AS trigger_name,
               pg_get_triggerdef(t.oid) AS definition
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = current_schema()
          AND NOT t.tgisinternal
        ORDER BY c.relname, t.tgname
        """,
    )
    out: dict[str, list[dict]] = {}
    for table, name, definition in rows:
        out.setdefault(table, []).append({"name": name, "definition": definition})
    return out


def _introspect_extensions(cursor) -> list[dict]:
    rows = _rows(
        cursor,
        "SELECT extname, extversion FROM pg_extension ORDER BY extname",
    )
    return [{"name": r[0], "version": r[1]} for r in rows]


def _introspect_migrations(cursor) -> list[dict]:
    exists = _rows(
        cursor,
        """
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'migration_history'
        LIMIT 1
        """,
    )
    if not exists:
        return []
    cols = {
        r[0]
        for r in _rows(
            cursor,
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'migration_history'
            """,
        )
    }
    checksum_sel = "checksum" if "checksum" in cols else "NULL AS checksum"
    applied_sel = "applied_at" if "applied_at" in cols else "NULL AS applied_at"
    rows = _rows(
        cursor,
        f"""
        SELECT migration_name, {checksum_sel}, {applied_sel}
        FROM migration_history
        ORDER BY migration_name
        """,
    )
    out: list[dict] = []
    for name, checksum, applied_at in rows:
        out.append(
            {
                "migration_name": name,
                "checksum": checksum,
                "applied_at": applied_at.isoformat()
                if isinstance(applied_at, datetime)
                else applied_at,
            }
        )
    return out


def _server_version(cursor) -> Optional[str]:
    try:
        rows = _rows(cursor, "SHOW server_version")
        return rows[0][0] if rows else None
    except Exception:  # pragma: no cover - defensive
        return None


def _current_schema(cursor) -> str:
    rows = _rows(cursor, "SELECT current_schema()")
    return rows[0][0] if rows and rows[0][0] else "public"


def introspect_postgres(cursor, *, label: str = "", environment_identity: str = "") -> dict:
    """Build a manifest dict from a Postgres DB-API ``cursor``.

    The cursor may belong to the Django ``connection`` or a standalone
    read-only ``psycopg2`` connection. Only ``SELECT`` / ``SHOW`` statements
    are issued, so the pass is safe against a production read-only replica.
    """
    tables = _introspect_tables(cursor)
    columns = _introspect_columns(cursor)
    constraints = _introspect_constraints(cursor)
    indexes = _introspect_indexes(cursor)
    triggers = _introspect_triggers(cursor)

    empty_constraints = {
        "primary_key": [],
        "foreign_keys": [],
        "unique_constraints": [],
        "check_constraints": [],
        "exclusion_constraints": [],
    }

    table_manifest: dict[str, dict] = {}
    for table in tables:
        con = constraints.get(table, empty_constraints)
        table_manifest[table] = {
            "columns": columns.get(table, []),
            "primary_key": con["primary_key"],
            "foreign_keys": con["foreign_keys"],
            "unique_constraints": con["unique_constraints"],
            "check_constraints": con["check_constraints"],
            "exclusion_constraints": con["exclusion_constraints"],
            "indexes": indexes.get(table, []),
            "triggers": triggers.get(table, []),
        }

    manifest = {
        "manifest_version": MANIFEST_VERSION,
        "meta": {
            "label": label,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "vendor": "postgresql",
            "server_version": _server_version(cursor),
            "schema": _current_schema(cursor),
            "environment_identity": environment_identity,
            "reduced": False,
        },
        "extensions": _introspect_extensions(cursor),
        "tables": table_manifest,
        "migrations": _introspect_migrations(cursor),
    }
    manifest["meta"]["schema_fingerprint"] = compute_fingerprint(manifest)
    return manifest


def _introspect_reduced(connection, *, label: str) -> dict:
    """Best-effort manifest for non-Postgres backends (e.g. SQLite test DB).

    Only tables + columns + indexes are captured via Django introspection.
    ``meta.reduced`` is True so consumers know the richer Postgres-only fields
    (validation state, triggers, extensions, migration checksums) are absent.
    """
    introspection = connection.introspection
    table_manifest: dict[str, dict] = {}
    with connection.cursor() as cursor:
        for table in sorted(introspection.table_names(cursor)):
            try:
                desc = introspection.get_table_description(cursor, table)
            except Exception:  # pragma: no cover - defensive
                continue
            columns = [
                {
                    "name": col.name,
                    "ordinal": idx + 1,
                    "type": str(col.type_code),
                    "nullable": bool(getattr(col, "null_ok", True)),
                    "default": getattr(col, "default", None),
                }
                for idx, col in enumerate(desc)
            ]
            table_manifest[table] = {
                "columns": columns,
                "primary_key": [],
                "foreign_keys": [],
                "unique_constraints": [],
                "check_constraints": [],
                "exclusion_constraints": [],
                "indexes": [],
                "triggers": [],
            }
    manifest = {
        "manifest_version": MANIFEST_VERSION,
        "meta": {
            "label": label,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "vendor": connection.vendor,
            "server_version": None,
            "schema": "",
            "environment_identity": "",
            "reduced": True,
        },
        "extensions": [],
        "tables": table_manifest,
        "migrations": [],
    }
    manifest["meta"]["schema_fingerprint"] = compute_fingerprint(manifest)
    return manifest


def build_manifest_from_connection(connection, *, label: str = "") -> dict:
    """Build a manifest from a Django database ``connection`` (vendor-aware)."""
    if connection.vendor == "postgresql":
        with connection.cursor() as cursor:
            return introspect_postgres(
                cursor,
                label=label,
                environment_identity=_environment_identity_from_settings(connection),
            )
    return _introspect_reduced(connection, label=label)


def _environment_identity_from_settings(connection) -> str:
    """Non-secret host/db identity for the active Django connection."""
    settings_dict = getattr(connection, "settings_dict", {}) or {}
    host = settings_dict.get("HOST") or "localhost"
    name = settings_dict.get("NAME") or ""
    return f"host={host} db={name}"


# ---------------------------------------------------------------------------
# Fingerprint
# ---------------------------------------------------------------------------


def _fingerprint_payload(manifest: dict) -> dict:
    """Structural (meta-free, timestamp-free) projection used for hashing.

    Excludes ``meta`` (timestamps, environment identity), migration
    ``applied_at`` (differs per environment), and extension versions (patch
    drift), so the fingerprint captures schema *shape*, not deployment state.
    """
    tables = {}
    for table, spec in sorted((manifest.get("tables") or {}).items()):
        tables[table] = {
            "columns": [
                {k: c.get(k) for k in ("name", "type", "nullable", "default", "ordinal")}
                for c in sorted(spec.get("columns", []), key=lambda c: c.get("ordinal", 0))
            ],
            "primary_key": sorted(
                (c.get("definition", "") for c in spec.get("primary_key", []))
            ),
            "foreign_keys": sorted(
                (f"{c.get('definition','')}|validated={c.get('validated')}"
                 for c in spec.get("foreign_keys", []))
            ),
            "unique_constraints": sorted(
                (c.get("definition", "") for c in spec.get("unique_constraints", []))
            ),
            "check_constraints": sorted(
                (f"{c.get('definition','')}|validated={c.get('validated')}"
                 for c in spec.get("check_constraints", []))
            ),
            "exclusion_constraints": sorted(
                (c.get("definition", "") for c in spec.get("exclusion_constraints", []))
            ),
            "indexes": sorted(
                (c.get("definition", "") for c in spec.get("indexes", []))
            ),
            "triggers": sorted(
                (c.get("definition", "") for c in spec.get("triggers", []))
            ),
        }
    extensions = sorted((e.get("name", "") for e in manifest.get("extensions", [])))
    migrations = sorted(
        (f"{m.get('migration_name','')}|{m.get('checksum')}"
         for m in manifest.get("migrations", []))
    )
    return {
        "tables": tables,
        "extensions": extensions,
        "migrations": migrations,
    }


def compute_fingerprint(manifest: dict) -> str:
    """Return a deterministic ``sha256:<hex>`` fingerprint of schema shape."""
    payload = _fingerprint_payload(manifest)
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    digest = hashlib.sha256(blob.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"


# ---------------------------------------------------------------------------
# Diff + verify (pure functions — DB-free, testable everywhere)
# ---------------------------------------------------------------------------


def _by_name(items: Iterable[dict]) -> dict[str, dict]:
    return {it["name"]: it for it in items}


def _columns_by_name(columns: Iterable[dict]) -> dict[str, dict]:
    return {c["name"]: c for c in columns}


def _diff_table(report: DiffReport, table: str, base: dict, cand: dict) -> None:
    # Columns ---------------------------------------------------------------
    base_cols = _columns_by_name(base.get("columns", []))
    cand_cols = _columns_by_name(cand.get("columns", []))
    for name in base_cols.keys() - cand_cols.keys():
        report.add("missing_column", f"{table}.{name}",
                   "column present in baseline but absent in candidate")
    for name in cand_cols.keys() - base_cols.keys():
        report.add("extra_column", f"{table}.{name}",
                   "column present in candidate but absent in baseline")
    for name in base_cols.keys() & cand_cols.keys():
        b, c = base_cols[name], cand_cols[name]
        for attr in ("type", "nullable", "default"):
            if b.get(attr) != c.get(attr):
                report.add(
                    "column_changed", f"{table}.{name}",
                    f"{attr}: baseline={b.get(attr)!r} candidate={c.get(attr)!r}",
                )

    # Primary key -----------------------------------------------------------
    base_pk = sorted(p.get("definition", "") for p in base.get("primary_key", []))
    cand_pk = sorted(p.get("definition", "") for p in cand.get("primary_key", []))
    if base_pk and not cand_pk:
        report.add("missing_primary_key", table, "primary key missing in candidate")
    elif base_pk != cand_pk:
        report.add("primary_key_changed", table,
                   f"baseline={base_pk} candidate={cand_pk}")

    # Foreign keys ----------------------------------------------------------
    base_fk = _by_name(base.get("foreign_keys", []))
    cand_fk = _by_name(cand.get("foreign_keys", []))
    for name in base_fk.keys() - cand_fk.keys():
        report.add("missing_foreign_key", f"{table}.{name}",
                   f"FK missing in candidate: {base_fk[name].get('definition','')}")
    for name in cand_fk.keys() - base_fk.keys():
        report.add("extra_foreign_key", f"{table}.{name}",
                   f"FK only in candidate: {cand_fk[name].get('definition','')}")
    for name in base_fk.keys() & cand_fk.keys():
        if base_fk[name].get("definition") != cand_fk[name].get("definition"):
            report.add("foreign_key_changed", f"{table}.{name}",
                       f"baseline={base_fk[name].get('definition')!r} "
                       f"candidate={cand_fk[name].get('definition')!r}")

    # Unique / check / exclusion -------------------------------------------
    _diff_named_defs(report, table, "unique_constraint",
                     base.get("unique_constraints", []),
                     cand.get("unique_constraints", []))
    _diff_named_defs(report, table, "check_constraint",
                     base.get("check_constraints", []),
                     cand.get("check_constraints", []))
    _diff_named_defs(report, table, "exclusion_constraint",
                     base.get("exclusion_constraints", []),
                     cand.get("exclusion_constraints", []))

    # Indexes ---------------------------------------------------------------
    base_idx = _by_name(base.get("indexes", []))
    cand_idx = _by_name(cand.get("indexes", []))
    for name in base_idx.keys() - cand_idx.keys():
        report.add("missing_index", f"{table}.{name}",
                   f"index missing in candidate: {base_idx[name].get('definition','')}")
    for name in cand_idx.keys() - base_idx.keys():
        report.add("extra_index", f"{table}.{name}",
                   f"index only in candidate: {cand_idx[name].get('definition','')}")
    for name in base_idx.keys() & cand_idx.keys():
        if base_idx[name].get("definition") != cand_idx[name].get("definition"):
            report.add("index_changed", f"{table}.{name}",
                       f"baseline={base_idx[name].get('definition')!r} "
                       f"candidate={cand_idx[name].get('definition')!r}")

    # Triggers --------------------------------------------------------------
    base_trg = _by_name(base.get("triggers", []))
    cand_trg = _by_name(cand.get("triggers", []))
    for name in base_trg.keys() - cand_trg.keys():
        report.add("missing_trigger", f"{table}.{name}", "trigger missing in candidate")
    for name in cand_trg.keys() - base_trg.keys():
        report.add("extra_trigger", f"{table}.{name}", "trigger only in candidate")
    for name in base_trg.keys() & cand_trg.keys():
        if base_trg[name].get("definition") != cand_trg[name].get("definition"):
            report.add("trigger_changed", f"{table}.{name}",
                       "trigger definition differs")


def _diff_named_defs(report: DiffReport, table: str, kind: str,
                     base_items: list[dict], cand_items: list[dict]) -> None:
    base = _by_name(base_items)
    cand = _by_name(cand_items)
    for name in base.keys() - cand.keys():
        report.add(f"missing_{kind}", f"{table}.{name}",
                   f"{kind} missing in candidate: {base[name].get('definition','')}")
    for name in cand.keys() - base.keys():
        # An extra constraint the baseline lacks is still drift; classify it as
        # the same failure family as a change so a stricter candidate is caught.
        report.add(f"{kind}_changed", f"{table}.{name}",
                   f"{kind} only in candidate: {cand[name].get('definition','')}")
    for name in base.keys() & cand.keys():
        if base[name].get("definition") != cand[name].get("definition"):
            report.add(f"{kind}_changed", f"{table}.{name}",
                       f"baseline={base[name].get('definition')!r} "
                       f"candidate={cand[name].get('definition')!r}")


def diff_manifests(baseline: dict, candidate: dict) -> DiffReport:
    """Compare two manifests structurally.

    ``baseline`` is treated as the expected/canonical schema and ``candidate``
    as the database under test. Missing objects, changed objects, extra tables/
    columns/FKs, and unvalidated FK/check constraints on the candidate are
    failures (R15.3, R15.4). Extra indexes/triggers/extensions and version /
    ``applied_at`` drift are warnings.

    The candidate is also run through :func:`verify_manifest` so intrinsic
    violations (unvalidated FKs/checks) always contribute to the gate even when
    both manifests share them.
    """
    report = DiffReport(
        baseline_label=(baseline.get("meta") or {}).get("label") or "baseline",
        candidate_label=(candidate.get("meta") or {}).get("label") or "candidate",
    )

    base_tables = baseline.get("tables") or {}
    cand_tables = candidate.get("tables") or {}
    for table in base_tables.keys() - cand_tables.keys():
        report.add("missing_table", table, "table present in baseline but absent in candidate")
    for table in cand_tables.keys() - base_tables.keys():
        report.add("extra_table", table, "table present in candidate but absent in baseline")
    for table in sorted(base_tables.keys() & cand_tables.keys()):
        _diff_table(report, table, base_tables[table], cand_tables[table])

    # Extensions ------------------------------------------------------------
    base_ext = {e["name"]: e.get("version") for e in baseline.get("extensions", [])}
    cand_ext = {e["name"]: e.get("version") for e in candidate.get("extensions", [])}
    for name in base_ext.keys() - cand_ext.keys():
        report.add("missing_extension", name, "extension missing in candidate")
    for name in cand_ext.keys() - base_ext.keys():
        report.add("extra_extension", name, "extension only in candidate")
    for name in base_ext.keys() & cand_ext.keys():
        if base_ext[name] != cand_ext[name]:
            report.add("extension_version_changed", name,
                       f"baseline={base_ext[name]} candidate={cand_ext[name]}")

    # Migrations (by name + checksum; applied_at intentionally ignored) ------
    base_mig = {m["migration_name"]: m.get("checksum") for m in baseline.get("migrations", [])}
    cand_mig = {m["migration_name"]: m.get("checksum") for m in candidate.get("migrations", [])}
    for name in base_mig.keys() - cand_mig.keys():
        report.add("missing_migration", name, "migration recorded in baseline but not candidate")
    for name in cand_mig.keys() - base_mig.keys():
        report.add("extra_migration", name, "migration recorded in candidate but not baseline")
    for name in base_mig.keys() & cand_mig.keys():
        if base_mig[name] is not None and cand_mig[name] is not None \
                and base_mig[name] != cand_mig[name]:
            report.add("migration_checksum_changed", name,
                       f"baseline={base_mig[name]} candidate={cand_mig[name]}")

    # Intrinsic candidate violations (unvalidated FK/check) -----------------
    for diff in _intrinsic_violations(candidate):
        report.differences.append(diff)

    return report


def _intrinsic_violations(manifest: dict,
                          required_indexes: Optional[Iterable[str]] = None) -> list[Difference]:
    out: list[Difference] = []
    tables = manifest.get("tables") or {}
    all_index_names: set[str] = set()
    for table, spec in tables.items():
        for fk in spec.get("foreign_keys", []):
            if fk.get("validated") is False:
                out.append(Difference(
                    "unvalidated_foreign_key", f"{table}.{fk.get('name')}",
                    f"FK is NOT VALID: {fk.get('definition','')}",
                    _severity_for("unvalidated_foreign_key"),
                ))
        for chk in spec.get("check_constraints", []):
            if chk.get("validated") is False:
                out.append(Difference(
                    "unvalidated_check_constraint", f"{table}.{chk.get('name')}",
                    f"CHECK is NOT VALID: {chk.get('definition','')}",
                    _severity_for("unvalidated_check_constraint"),
                ))
        for idx in spec.get("indexes", []):
            all_index_names.add(idx.get("name"))
    if required_indexes:
        for required in required_indexes:
            if required not in all_index_names:
                out.append(Difference(
                    "missing_required_index", required,
                    "required index absent from manifest",
                    _severity_for("missing_required_index"),
                ))
    return out


def verify_manifest(manifest: dict,
                    required_indexes: Optional[Iterable[str]] = None) -> DiffReport:
    """Verify a *single* manifest for intrinsic release-gate violations.

    Fails on any unvalidated foreign key, any unvalidated check constraint, and
    any required index that is absent (R15.3, R15.4). This is the single-DB gate
    used by ``schema_manifest --verify``; :func:`diff_manifests` folds the same
    intrinsic checks into the candidate side of a comparison.
    """
    label = (manifest.get("meta") or {}).get("label") or "manifest"
    report = DiffReport(baseline_label=label, candidate_label=label)
    report.differences.extend(_intrinsic_violations(manifest, required_indexes))
    return report
