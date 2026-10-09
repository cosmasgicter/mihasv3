#!/usr/bin/env python3
"""width-drift-probe - the schema-drift class ``check_schema_drift`` skips.

Admissions-V2 task 13.5 (canary preparation). READ-ONLY.

WHY THIS EXISTS
---------------
``manage.py check_schema_drift`` is the boot gate. Its own docstring says, under
"What it does NOT check (intentionally)":

    * Type compatibility (``VARCHAR`` vs ``TEXT`` etc.): not a 500 risk
      in practice - Postgres auto-coerces most compatible types.

That assumption is false in one direction. Postgres coerces a *wider* column
happily, but a column that is **narrower than the model declares** raises
``DataError: value too long for type character varying(N)`` the first time a
real value exceeds N - which Django surfaces as an unhandled 500. That is
exactly GATE-13.3-13 (``applications.intake`` snapshot vs ``intakes.name``
source), and it is invisible to the boot gate because the column *exists*.

So this probe answers the question the boot gate does not: for every
``managed = False`` model field with a declared ``max_length``, is the target
column at least that wide on THIS database?

WHAT IT DOES
------------
* opens the configured Django connection, forces the session read-only,
* reads ``information_schema.columns.character_maximum_length``,
* compares it with each concrete non-relational field's ``max_length``,
* reports NARROWER (a 500 waiting to happen), WIDER (harmless), and MISSING
  (already the boot gate's job, reported for completeness).

Exit status: 0 = no narrower column, 1 = at least one narrower column.

USAGE
-----
    cd backend
    DATABASE_URL="<dsn>" .venv/bin/python \\
      ../docs/v2-evidence/13.5/raw/width-drift-probe.py

No writes of any kind. The session is pinned
``default_transaction_read_only = on`` before the first catalogue read.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[4] / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django  # noqa: E402

django.setup()

from django.apps import apps  # noqa: E402
from django.db import connection  # noqa: E402


def main() -> int:
    with connection.cursor() as cur:
        cur.execute("SET default_transaction_read_only = on")
        cur.execute("SELECT current_database(), current_setting('server_version')")
        dbname, server_version = cur.fetchone()
        cur.execute(
            """
            SELECT table_name, column_name, character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND character_maximum_length IS NOT NULL
            """
        )
        widths = {(t, c): n for t, c, n in cur.fetchall()}
        cur.execute(
            """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
            """
        )
        tables = {row[0] for row in cur.fetchall()}

    narrower: list[tuple[str, str, int, int]] = []
    wider: list[tuple[str, str, int, int]] = []
    missing: list[tuple[str, str]] = []
    absent_tables: list[str] = []
    checked = 0
    models_checked = 0

    for model in apps.get_models():
        if model._meta.managed:
            continue
        table = model._meta.db_table
        if table not in tables:
            absent_tables.append(table)
            continue
        models_checked += 1
        for field in model._meta.get_fields():
            if not getattr(field, "concrete", False):
                continue
            if getattr(field, "many_to_many", False):
                continue
            max_length = getattr(field, "max_length", None)
            if not isinstance(max_length, int):
                continue
            column = field.column
            checked += 1
            actual = widths.get((table, column))
            if actual is None:
                if (table, column) not in widths and not _column_exists(
                    table, column, widths, tables
                ):
                    missing.append((table, column))
                continue
            if actual < max_length:
                narrower.append((table, column, max_length, actual))
            elif actual > max_length:
                wider.append((table, column, max_length, actual))

    print(f"database           : {dbname}")
    print(f"server_version     : {server_version}")
    print(f"managed=False models with a table here : {models_checked}")
    print(f"bounded-length fields compared          : {checked}")
    print()
    print(f"NARROWER than the model declares (500 risk) : {len(narrower)}")
    for table, column, declared, actual in sorted(narrower):
        print(
            f"  NARROWER {table}.{column}: model declares {declared}, "
            f"column is varchar({actual}) -> DataError at {actual + 1} chars"
        )
    print()
    print(f"WIDER than the model declares (harmless)    : {len(wider)}")
    for table, column, declared, actual in sorted(wider)[:40]:
        print(f"  wider    {table}.{column}: model {declared}, column {actual}")
    if len(wider) > 40:
        print(f"  ... and {len(wider) - 40} more")
    print()
    print(f"column absent (already check_schema_drift's job) : {len(missing)}")
    for table, column in sorted(missing):
        print(f"  MISSING  {table}.{column}")
    print()
    print(f"managed=False tables absent from this database   : {len(absent_tables)}")
    for table in sorted(absent_tables):
        print(f"  no table {table}")
    print()
    verdict = "FAIL" if narrower else "PASS"
    print(f"VERDICT: {verdict} - narrower_columns={len(narrower)}")
    return 1 if narrower else 0


def _column_exists(table, column, widths, tables) -> bool:
    """A non-varchar column (e.g. text) has no character_maximum_length.

    Only report MISSING when the column really is absent, so this probe does
    not duplicate - or contradict - the boot gate.
    """
    from django.db import connection as conn

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = %s AND column_name = %s
            """,
            [table, column],
        )
        return cur.fetchone() is not None


if __name__ == "__main__":
    raise SystemExit(main())
