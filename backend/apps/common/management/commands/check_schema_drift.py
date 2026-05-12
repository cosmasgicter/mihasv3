"""check_schema_drift — fail fast when Django models reference DB columns
that do not exist on a ``managed = False`` table.

Motivation
----------
Django models whose ``Meta.managed = False`` are NOT managed by
``makemigrations`` / ``migrate``. Schema changes to those tables are
hand-written SQL (see ``scripts/migrations/``). If a developer adds a
field to such a model but the corresponding ``ALTER TABLE`` has not run
on the target database, Django will issue ``SELECT ..., <missing_col>
FROM <table>`` on every query and Postgres will error with
"column does not exist", which we see as a 500 per request.

This command is designed to run at container startup BEFORE
``uvicorn``. If drift is detected the command exits non-zero, the
container crashloops, and the operator sees the mismatch in logs
immediately — instead of shipping a broken deployment to users.

What it checks
--------------
For every ``Model`` with ``Meta.managed = False``:
  * The underlying table exists.
  * Every non-m2m, non-many-to-one-related concrete field maps to a
    column present on that table. Column existence is looked up in
    ``information_schema.columns`` so schema introspection works on
    Postgres.

What it does NOT check (intentionally)
--------------------------------------
  * Type compatibility (``VARCHAR`` vs ``TEXT`` etc.): not a 500 risk
    in practice — Postgres auto-coerces most compatible types.
  * Nullability: Django's default vs DB nullability drift usually
    surfaces as a validation error, not a 500.
  * Extra DB columns not on the model: these do not break the app.
  * Django-managed tables: covered by ``migrate`` already.

Usage
-----
::

    python manage.py check_schema_drift

Exit status:
  0 — no drift
  1 — drift detected (list of missing columns printed)
"""

from __future__ import annotations

import sys
from collections import defaultdict
from typing import Iterable

from django.apps import apps
from django.core.management.base import BaseCommand
from django.db import connection
from django.db.models import Model


def _iter_unmanaged_models() -> Iterable[type[Model]]:
    for model in apps.get_models():
        if getattr(model._meta, "managed", True) is False:
            yield model


def _declared_columns(model: type[Model]) -> list[str]:
    """Return the DB column names for every concrete field on ``model``.

    ``ForeignKey`` fields contribute the ``<name>_id`` column; m2m fields
    have their own through-table and are ignored here.
    """
    cols: list[str] = []
    for field in model._meta.get_fields():
        # Skip reverse relations and m2m.
        if getattr(field, "many_to_many", False):
            continue
        if not getattr(field, "concrete", False):
            continue
        # ``column`` exists for concrete fields (including FK's _id column).
        column = getattr(field, "column", None)
        if column:
            cols.append(column)
    return cols


def _existing_columns(table: str) -> set[str]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = %s
              AND table_schema = current_schema()
            """,
            [table],
        )
        return {row[0] for row in cursor.fetchall()}


def _table_exists(table: str) -> bool:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT 1
            FROM information_schema.tables
            WHERE table_name = %s
              AND table_schema = current_schema()
            LIMIT 1
            """,
            [table],
        )
        return cursor.fetchone() is not None


class Command(BaseCommand):
    help = (
        "Verify that every managed=False model's declared fields map to "
        "existing columns in the database. Non-zero exit on drift."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--strict",
            action="store_true",
            help="Also fail when a managed=False model refers to a missing table "
                 "(default: warn and continue; table may legitimately be absent "
                 "in some bootstrapping contexts).",
        )

    def handle(self, *args, **options):
        strict = options["strict"]

        models = list(_iter_unmanaged_models())
        if not models:
            self.stdout.write(self.style.WARNING(
                "No managed=False models found — nothing to check."
            ))
            return

        missing_tables: list[str] = []
        missing_columns: dict[str, list[str]] = defaultdict(list)
        checked = 0

        for model in models:
            table = model._meta.db_table
            if not _table_exists(table):
                missing_tables.append(f"{model.__module__}.{model.__name__} -> {table}")
                continue

            declared = _declared_columns(model)
            existing = _existing_columns(table)
            gaps = [c for c in declared if c not in existing]
            checked += 1
            if gaps:
                for col in gaps:
                    missing_columns[table].append(
                        f"{model.__module__}.{model.__name__}.{col}"
                    )

        if missing_tables and strict:
            self.stdout.write(self.style.ERROR(
                f"Missing tables ({len(missing_tables)}):"
            ))
            for item in missing_tables:
                self.stdout.write(f"  - {item}")
        elif missing_tables:
            self.stdout.write(self.style.WARNING(
                f"Missing tables ({len(missing_tables)}) — skipping these (run with --strict to fail):"
            ))
            for item in missing_tables:
                self.stdout.write(f"  - {item}")

        if missing_columns:
            self.stdout.write(self.style.ERROR(
                f"Schema drift detected — {sum(len(v) for v in missing_columns.values())} "
                f"missing column(s) across {len(missing_columns)} table(s):"
            ))
            for table, items in sorted(missing_columns.items()):
                self.stdout.write(f"  table {table}:")
                for item in items:
                    self.stdout.write(f"    - {item}")
            self.stdout.write("")
            self.stdout.write(
                "Apply pending SQL migrations before starting the app:"
            )
            self.stdout.write("  python manage.py apply_sql_migrations")
            sys.exit(1)

        if missing_tables and strict:
            sys.exit(1)

        self.stdout.write(self.style.SUCCESS(
            f"No schema drift. Verified {checked} managed=False model(s)."
        ))
