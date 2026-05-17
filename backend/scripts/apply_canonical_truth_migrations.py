#!/usr/bin/env python3
"""Apply the canonical-truth program SQL migrations to a Postgres database.

Usage:
    DATABASE_URL=postgresql://user:pass@host:5432/dbname?sslmode=require \\
        python3 backend/scripts/apply_canonical_truth_migrations.py

Or directly:
    python3 backend/scripts/apply_canonical_truth_migrations.py \\
        --database-url 'postgresql://...'

Applies:
    1. system_actor_seed.sql       — system actor profile (Stream 5)
    2. application_number_sequences.sql — per-(institution, year) sequences (Item 4)

Both scripts are idempotent. Re-running is safe.

Exit codes:
    0 — both migrations applied (or already in place)
    1 — connection failed
    2 — system_actor_seed.sql failed
    3 — application_number_sequences.sql failed
    4 — verification failed
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

try:
    import psycopg2
    from psycopg2 import sql as _sql  # noqa: F401  # imported for reflection only
except ImportError:
    sys.stderr.write(
        "psycopg2 not installed. Install with `pip install psycopg2-binary` "
        "or activate the project venv (`source backend/.venv/bin/activate`).\n"
    )
    sys.exit(1)


SCRIPT_DIR = Path(__file__).resolve().parent
SYSTEM_ACTOR_SEED = SCRIPT_DIR / "system_actor_seed.sql"
APPLICATION_NUMBER_SEQUENCES = SCRIPT_DIR / "application_number_sequences.sql"


def apply_sql_file(conn, path: Path, label: str) -> None:
    print(f"\n[apply] {label}: {path.name}")
    sql = path.read_text(encoding="utf-8")
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    print(f"[ok]    {label} applied")


def verify_system_actor(conn) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, email, role, is_active FROM profiles "
            "WHERE id = '00000000-0000-0000-0000-000000000001'::uuid"
        )
        row = cur.fetchone()
        if row is None:
            print("[verify-fail] system actor row missing")
            return False
        actor_id, email, role, is_active = row
        print(
            f"[verify-ok]  system actor: id={actor_id} email={email} "
            f"role={role} is_active={is_active}"
        )
        if is_active:
            print(
                "[verify-warn] system actor has is_active=True. "
                "It SHOULD be False so the row cannot be authenticated as. "
                "Update via:  UPDATE profiles SET is_active=false "
                "WHERE id='00000000-0000-0000-0000-000000000001';"
            )
        return True


def verify_application_number_sequences(conn) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT proname FROM pg_proc WHERE proname = 'next_application_number'"
        )
        if cur.fetchone() is None:
            print("[verify-fail] next_application_number function missing")
            return False

        # Smoke-test the function with a known institution+year (uses the sequence
        # but doesn't insert any application row).
        cur.execute("SELECT next_application_number('MIHAS', 2026)")
        sample = cur.fetchone()[0]
        # Roll back the sequence advance so the smoke test doesn't burn a number.
        # NOTE: nextval() advances the sequence; setval rewinds.
        cur.execute(
            "SELECT setval('app_num_mihas_2026', "
            "GREATEST(currval('app_num_mihas_2026') - 1, 1), true)"
        )
        conn.commit()
        print(f"[verify-ok]  next_application_number sample → {sample}")

        # List sequences.
        cur.execute(
            "SELECT sequence_name, last_value FROM pg_sequences "
            "WHERE sequence_name LIKE 'app_num_%' ORDER BY sequence_name"
        )
        rows = cur.fetchall()
        if not rows:
            print("[verify-fail] no app_num_* sequences exist")
            return False
        print(f"[verify-ok]  {len(rows)} app_num_* sequences:")
        for name, last in rows:
            print(f"             - {name} (last_value={last})")
        return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL"),
        help="Postgres connection URL. Defaults to $DATABASE_URL.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Connect + verify only; do not apply migrations.",
    )
    args = parser.parse_args()

    if not args.database_url:
        sys.stderr.write(
            "No DATABASE_URL supplied. Either:\n"
            "  - export DATABASE_URL='postgresql://...' and re-run, OR\n"
            "  - pass --database-url 'postgresql://...'\n"
        )
        return 1

    print(f"[connect] {args.database_url.split('@')[-1].split('?')[0]}")
    try:
        conn = psycopg2.connect(args.database_url)
    except Exception as exc:
        sys.stderr.write(f"Connection failed: {exc}\n")
        return 1

    try:
        if not args.dry_run:
            try:
                apply_sql_file(conn, SYSTEM_ACTOR_SEED, "Stream 5 — system actor seed")
            except Exception as exc:
                conn.rollback()
                sys.stderr.write(f"system_actor_seed.sql failed: {exc}\n")
                return 2

            try:
                apply_sql_file(
                    conn,
                    APPLICATION_NUMBER_SEQUENCES,
                    "Item 4 — application number sequences",
                )
            except Exception as exc:
                conn.rollback()
                sys.stderr.write(f"application_number_sequences.sql failed: {exc}\n")
                return 3

        print("\n--- Verification ---")
        ok_actor = verify_system_actor(conn)
        ok_seq = verify_application_number_sequences(conn)
        if not (ok_actor and ok_seq):
            return 4

        print("\n[done] All migrations applied + verified.")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
