"""apply_sql_migrations — idempotent auto-runner for hand-written SQL migrations.

Runs every ``.sql`` file under ``backend/scripts/migrations/`` in filename
order, tracking applied migrations in a dedicated table so each file runs
exactly once per database. Each file is expected to be idempotent as a
second layer of safety — so re-running the command after a tracking-table
wipe still converges.

This command is intended to be invoked at container startup, BEFORE
``uvicorn`` so that schema changes are guaranteed in place before
Django serves any request against a ``managed = False`` model.

Design notes
------------
* Tracking table: ``applied_sql_migrations (filename TEXT PRIMARY KEY,
  checksum TEXT, applied_at TIMESTAMPTZ DEFAULT now())``. Checksum is a
  SHA-256 of the file contents so drift is visible in audit trails.
* Ordering: lexicographic by filename. Migrations are named
  ``NNNN_description.sql`` (4-digit zero-padded prefix).
* Rollbacks and preflight scripts intentionally live OUTSIDE this
  directory. Only safe-to-auto-apply additive migrations go here.
* Atomicity: each migration runs inside its own transaction. If one
  file fails, earlier successes are kept; the command exits non-zero
  so the container crashloops visibly.
* No-op when the directory is missing or empty — useful during tests.

Usage:
    python manage.py apply_sql_migrations
    python manage.py apply_sql_migrations --dry-run
    python manage.py apply_sql_migrations --migrations-dir /path/to/dir
"""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import Iterable

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

logger = logging.getLogger(__name__)


DEFAULT_MIGRATIONS_DIR = Path(__file__).resolve().parents[4] / "scripts" / "migrations"

_TRACKING_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS applied_sql_migrations (
    filename TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""


def _checksum(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def _iter_migration_files(directory: Path) -> Iterable[Path]:
    if not directory.exists():
        return []
    return sorted(p for p in directory.iterdir() if p.is_file() and p.suffix == ".sql")


def _ensure_tracking_table() -> None:
    with connection.cursor() as cursor:
        cursor.execute(_TRACKING_TABLE_DDL)


def _applied_filenames() -> set[str]:
    with connection.cursor() as cursor:
        cursor.execute("SELECT filename FROM applied_sql_migrations")
        return {row[0] for row in cursor.fetchall()}


def _record_applied(filename: str, checksum: str) -> None:
    with connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO applied_sql_migrations (filename, checksum) VALUES (%s, %s) "
            "ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, "
            "applied_at = now()",
            [filename, checksum],
        )


class Command(BaseCommand):
    help = (
        "Apply pending hand-written SQL migrations from scripts/migrations/ "
        "in filename order. Idempotent — tracked in applied_sql_migrations."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--migrations-dir",
            type=str,
            default=None,
            help="Override migrations directory (defaults to backend/scripts/migrations/).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="List pending migrations without applying them.",
        )

    def handle(self, *args, **options):
        migrations_dir = Path(options["migrations_dir"]) if options["migrations_dir"] else DEFAULT_MIGRATIONS_DIR
        dry_run = options["dry_run"]

        files = list(_iter_migration_files(migrations_dir))
        if not files:
            self.stdout.write(self.style.WARNING(
                f"No migrations found at {migrations_dir}. Nothing to do."
            ))
            return

        if not dry_run:
            _ensure_tracking_table()
            applied = _applied_filenames()
        else:
            try:
                _ensure_tracking_table()
                applied = _applied_filenames()
            except Exception:
                # In dry-run we tolerate tracking-table unavailability
                applied = set()

        pending = [f for f in files if f.name not in applied]

        if not pending:
            self.stdout.write(self.style.SUCCESS(
                f"All {len(files)} migrations already applied. Nothing to do."
            ))
            return

        self.stdout.write(self.style.NOTICE(
            f"Pending migrations: {len(pending)}/{len(files)}"
        ))

        for path in pending:
            label = f"{path.name}"
            checksum = _checksum(path)
            if dry_run:
                self.stdout.write(f"  [dry-run] would apply: {label} (sha256={checksum[:12]})")
                continue

            self.stdout.write(f"  applying: {label} (sha256={checksum[:12]}) ... ", ending="")
            sql = path.read_text()
            try:
                # Each migration runs in its own transaction.
                with transaction.atomic():
                    with connection.cursor() as cursor:
                        cursor.execute(sql)
                    _record_applied(path.name, checksum)
            except Exception as exc:
                self.stdout.write(self.style.ERROR("FAIL"))
                logger.exception("apply_sql_migrations failed on %s", label)
                raise CommandError(f"Migration {label} failed: {exc}")
            self.stdout.write(self.style.SUCCESS("OK"))

        self.stdout.write(self.style.SUCCESS(
            f"Applied {len(pending)} migration(s) successfully."
        ))
