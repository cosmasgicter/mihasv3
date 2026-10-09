#!/usr/bin/env python3
"""Task 0.5 baseline: READ-ONLY Neon introspection.

Connects with the backend/.env DATABASE_URL, forces a read-only transaction,
and records a schema fingerprint, FK validation state, index/constraint counts,
migration history, and canonical-assignment / payment invariants.

This script performs SELECT-only work inside a READ ONLY transaction. It never
writes, never DDLs, and never prints the connection secret.
"""
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

ENV_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..", "backend", ".env"
)


def load_database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    with open(os.path.abspath(ENV_PATH), "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("DATABASE_URL not found in env or backend/.env")


def redact_host(url: str) -> str:
    m = re.search(r"@([^/:?]+)", url)
    return m.group(1) if m else "unknown-host"


def q(cur, sql, params=None):
    cur.execute(sql, params or ())
    return cur.fetchall()


def safe(cur, label, sql, params=None):
    """Run a query, capturing errors without aborting the read-only txn."""
    try:
        cur.execute(sql, params or ())
        rows = cur.fetchall()
        return {"ok": True, "rows": rows}
    except Exception as exc:  # noqa: BLE001
        cur.connection.rollback()
        cur.execute("SET TRANSACTION READ ONLY")
        return {"ok": False, "error": str(exc).splitlines()[0]}


def main():
    url = load_database_url()
    host = redact_host(url)
    out = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "db_host": host,
        "mode": "READ ONLY",
    }
    conn = psycopg2.connect(url)
    conn.set_session(readonly=True, autocommit=False)
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    cur.execute("SET TRANSACTION READ ONLY")

    out["server_version"] = q(cur, "SHOW server_version")[0][0]
    out["current_database"] = q(cur, "SELECT current_database()")[0][0]

    # ---- schema fingerprint (public schema tables/columns) ----
    cols = q(
        cur,
        """
        SELECT table_name, column_name, data_type, is_nullable,
               COALESCE(column_default, '')
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
        """,
    )
    fingerprint_src = "\n".join(
        f"{r[0]}|{r[1]}|{r[2]}|{r[3]}|{r[4]}" for r in cols
    )
    out["schema_fingerprint_sha256"] = hashlib.sha256(
        fingerprint_src.encode("utf-8")
    ).hexdigest()
    out["public_table_count"] = len({r[0] for r in cols})
    out["public_column_count"] = len(cols)

    tables = q(
        cur,
        """
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE'
        ORDER BY table_name
        """,
    )
    out["public_tables"] = [r[0] for r in tables]

    # ---- constraint validation state ----
    fk = q(
        cur,
        """
        SELECT conrelid::regclass::text AS tbl, conname, convalidated
        FROM pg_constraint WHERE contype='f'
        ORDER BY 1,2
        """,
    )
    out["foreign_key_total"] = len(fk)
    out["foreign_key_not_valid"] = [
        {"table": r[0], "constraint": r[1]} for r in fk if not r[2]
    ]
    out["foreign_key_not_valid_count"] = len(out["foreign_key_not_valid"])

    chk = q(
        cur,
        "SELECT count(*) FROM pg_constraint WHERE contype='c' AND NOT convalidated",
    )
    out["check_constraint_not_valid_count"] = chk[0][0]

    out["index_count"] = q(
        cur, "SELECT count(*) FROM pg_indexes WHERE schemaname='public'"
    )[0][0]

    # ---- migration history ----
    mh = safe(
        cur,
        "migration_history",
        "SELECT count(*) FROM migration_history",
    )
    if mh["ok"]:
        out["migration_history_count"] = mh["rows"][0][0]
        recent = safe(
            cur,
            "migration_history_recent",
            """
            SELECT migration_name, applied_at
            FROM migration_history ORDER BY applied_at DESC NULLS LAST LIMIT 10
            """,
        )
        out["migration_history_recent"] = (
            [{"name": r[0], "applied_at": str(r[1])} for r in recent["rows"]]
            if recent["ok"]
            else recent
        )
    else:
        out["migration_history_count"] = mh

    # ---- canonical assignment invariants (applications) ----
    invariants = {}
    invariants["applications_total"] = safe(
        cur, "applications_total", "SELECT count(*) FROM applications"
    )
    for colname in (
        "institution_id",
        "canonical_program_id",
        "program_offering_id",
        "intake_id",
        "intake_offering_id",
    ):
        invariants[f"applications_null_{colname}"] = safe(
            cur,
            colname,
            f"SELECT count(*) FROM applications WHERE {colname} IS NULL",
        )

    # payments
    invariants["payments_total"] = safe(
        cur, "payments_total", "SELECT count(*) FROM payments"
    )
    invariants["payments_null_application"] = safe(
        cur,
        "payments_null_application",
        "SELECT count(*) FROM payments WHERE application_id IS NULL",
    )

    # institutions / domains
    invariants["institutions_active"] = safe(
        cur,
        "institutions_active",
        "SELECT count(*) FROM institutions WHERE is_active",
    )
    invariants["duplicate_active_hostnames"] = safe(
        cur,
        "dup_hostnames",
        """
        SELECT count(*) FROM (
          SELECT hostname FROM institution_domains
          WHERE is_active AND status='active'
          GROUP BY hostname HAVING count(*) > 1
        ) d
        """,
    )
    invariants["canonical_programs"] = safe(
        cur, "canonical_programs", "SELECT count(*) FROM canonical_programs"
    )
    invariants["memberships_active"] = safe(
        cur,
        "memberships_active",
        "SELECT count(*) FROM user_institution_memberships WHERE is_active",
    )

    # collapse invariant rows to scalars
    def scalar(r):
        if isinstance(r, dict) and r.get("ok"):
            return r["rows"][0][0]
        return r

    out["invariants"] = {k: scalar(v) for k, v in invariants.items()}

    conn.rollback()
    cur.close()
    conn.close()

    print(json.dumps(out, indent=2, default=str))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"fatal_error": str(exc)}, indent=2))
        sys.exit(1)
