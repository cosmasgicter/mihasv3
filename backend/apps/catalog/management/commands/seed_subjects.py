"""Seed the canonical subject catalogue into the ``subjects`` table.

Run: ``python manage.py seed_subjects``

Idempotent — upserts on the ``code`` unique constraint. The catalogue itself
lives in :mod:`apps.catalog.subject_catalog` (admissions-v2 task 7.1), which is
also what the selector endpoint, the alias catalogue, and
``backend/scripts/2026_07_25_01_canonical_subject_catalog.sql`` read, so the
command can no longer drift from the deployed data.

The SQL migration is what production and Neon actually apply at boot; this
command stays for local/dev seeding and for re-asserting the catalogue after a
manual data fix.
"""

from django.core.management.base import BaseCommand
from django.db import connection

from apps.catalog.subject_catalog import (
    CANONICAL_SUBJECTS,
    LEGACY_DUPLICATE_CODES,
    SUBJECT_CATALOG_VERSION,
)


class Command(BaseCommand):
    help = "Seed the canonical ECZ Grade 12 and A-Level subject catalogue (idempotent)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--deactivate-legacy-duplicates",
            action="store_true",
            help=(
                "Also deactivate the inventoried duplicate-identity rows "
                "(ADD_MATH/MUS/PHYS). Reference repointing is owned by the SQL "
                "migration; this flag only flips is_active."
            ),
        )

    def handle(self, *args, **options):
        written = 0

        with connection.cursor() as cursor:
            for entry in CANONICAL_SUBJECTS:
                cursor.execute(
                    """
                    INSERT INTO subjects (id, name, code, category, is_core, is_active, curriculum_type, created_at)
                    VALUES (gen_random_uuid(), %s, %s, %s, %s, true, %s, now())
                    ON CONFLICT (code) DO UPDATE SET
                        name = EXCLUDED.name,
                        category = EXCLUDED.category,
                        is_core = EXCLUDED.is_core,
                        is_active = true,
                        curriculum_type = EXCLUDED.curriculum_type
                    WHERE subjects.name IS DISTINCT FROM EXCLUDED.name
                       OR subjects.category IS DISTINCT FROM EXCLUDED.category
                       OR subjects.is_core IS DISTINCT FROM EXCLUDED.is_core
                       OR subjects.is_active IS DISTINCT FROM true
                       OR subjects.curriculum_type IS DISTINCT FROM EXCLUDED.curriculum_type
                    """,
                    [entry.name, entry.code, entry.category, entry.is_core, entry.curriculum_type],
                )
                if cursor.rowcount > 0:
                    written += 1

            deactivated = 0
            if options.get("deactivate_legacy_duplicates"):
                cursor.execute(
                    "UPDATE subjects SET is_active = false "
                    "WHERE code = ANY(%s) AND is_active IS DISTINCT FROM false",
                    [list(LEGACY_DUPLICATE_CODES)],
                )
                deactivated = cursor.rowcount

        total = len(CANONICAL_SUBJECTS)
        if written == 0:
            # F6: an idempotent re-run writes nothing because the catalogue is
            # already current — say so, rather than printing a bare "0 row(s)
            # written" that reads like a failure.
            message = (
                f"Catalogue {SUBJECT_CATALOG_VERSION}: already up to date "
                f"({total} subject(s) verified, no changes)"
            )
        else:
            message = (
                f"Catalogue {SUBJECT_CATALOG_VERSION}: {written} of {total} "
                f"subject(s) upserted ({total} checked)"
            )
        if options.get("deactivate_legacy_duplicates"):
            message += f"; {deactivated} legacy duplicate row(s) deactivated"
        self.stdout.write(self.style.SUCCESS(message))
