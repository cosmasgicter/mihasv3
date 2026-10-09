"""harness_bootstrap — prepare a fresh throwaway DB for the local V2 E2E harness.

This is the ONLY schema/bootstrap entry point the isolated local release
harness (``.kiro/specs/admissions-v2-canonical-rebuild`` design section 16,
R18.1) uses. It is deliberately harness-only and never runs in production.

Why not ``apply_sql_migrations``?
--------------------------------
The core admissions models are ``managed = False`` and their production schema
is applied by hand-written SQL scripts. However ``00_full_schema.sql`` is a
stale May-22 snapshot whose ``migration_history`` table predates the
``checksum`` column, so ``apply_sql_migrations`` refuses to run against a fresh
empty DB (``MIGRATION_HISTORY_NOT_EXTENDED``). That staleness is finding DATA-08
and its remediation (a live schema manifest + regenerated full-schema snapshot)
is task 3.1 — a separate, later slice.

For a *runnable app harness today* we build the current schema the same way the
entire existing test suite trusts (``backend/tests/conftest.py`` →
``unmanaged_schema``): create every ``managed = False`` table from the current
models via ``schema_editor`` and add the partial/unique indexes the models do
not emit. This reflects the current source, is deterministic, and is honest
about the separation: *migration-from-empty SQL verification is task 0.5/3.1's
job, not this harness's.*

Steps
-----
1. ``migrate`` the Django-managed apps (contenttypes, sessions, admin, …).
2. Create every ``managed = False`` table from the current models + the
   explicit indexes/constraints (mirrors the test conftest).
3. Seed the canonical subject catalogue (``seed_subjects``).
4. Create/refresh the platform super-admin from env (bcrypt-hashed; never
   printed, never stored in plaintext).

Usage (inside the backend container):

    python manage.py harness_bootstrap
    HARNESS_SUPERADMIN_EMAIL=… HARNESS_SUPERADMIN_PASSWORD=… python manage.py harness_bootstrap
"""

from __future__ import annotations

import os

from django.apps import apps
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection


class Command(BaseCommand):
    help = "Bootstrap a fresh throwaway DB for the local V2 E2E harness (schema + subjects + super-admin)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--superadmin-email",
            default=os.environ.get("HARNESS_SUPERADMIN_EMAIL", "platform-admin@harness.beanola.local"),
        )
        parser.add_argument(
            "--superadmin-password",
            default=os.environ.get("HARNESS_SUPERADMIN_PASSWORD"),
            help="Plaintext password for the seeded platform super-admin (or set "
            "HARNESS_SUPERADMIN_PASSWORD). Hashed with bcrypt before storage.",
        )
        parser.add_argument("--skip-subjects", action="store_true", default=False)

    def handle(self, *args, **opts):
        # Refuse to run against anything that looks like a real/production DB.
        db_url = os.environ.get("DATABASE_URL", "")
        for danger in ("neon.tech", "amazonaws.com", "rds.", "beanola.com"):
            if danger in db_url:
                raise CommandError(
                    f"harness_bootstrap refuses to run: DATABASE_URL points at a "
                    f"non-local host ({danger!r}). The harness is local-only."
                )

        password = opts.get("superadmin_password")
        if not password:
            raise CommandError(
                "A super-admin password is required: pass --superadmin-password or "
                "set HARNESS_SUPERADMIN_PASSWORD."
            )

        self.stdout.write(self.style.NOTICE("[1/4] migrate Django-managed apps"))
        call_command("migrate", "--noinput", verbosity=0)

        self.stdout.write(self.style.NOTICE("[2/4] build managed=False schema from current models"))
        created = self._build_unmanaged_schema()
        self.stdout.write(f"      created {created} table(s) from managed=False models")

        if not opts["skip_subjects"]:
            self.stdout.write(self.style.NOTICE("[3/5] seed canonical subjects"))
            call_command("seed_subjects", verbosity=0)
        else:
            self.stdout.write(self.style.NOTICE("[3/5] skipped subjects (--skip-subjects)"))

        # Canonical programs are platform catalogue definitions (Beanola's global
        # program list), not tenant data — the same class of platform bootstrap
        # data as subjects (R18.1). Seeding them lets the clean-database tenant
        # A/B launch journey (task 4.3, R4.7) assign real offerings via the API
        # WITHOUT any pre-linked tenant offering: the journey fetches these
        # canonical programs (never a hardcoded/seed-specific id) and creates a
        # fresh offering per tenant from the SAME canonical program (the
        # realistic "same program name across two schools" isolation case).
        self.stdout.write(self.style.NOTICE("[4/5] seed canonical programs (platform catalogue)"))
        seeded = self._seed_canonical_programs()
        self.stdout.write(f"      canonical programs present: {seeded}")

        self.stdout.write(self.style.NOTICE("[5/5] create/refresh platform super-admin"))
        email = opts["superadmin_email"]
        self._ensure_super_admin(email=email, password=password)

        self.stdout.write(self.style.SUCCESS(f"harness_bootstrap complete (super-admin: {email})"))

    # ------------------------------------------------------------------
    # Canonical programs — platform catalogue bootstrap (task 4.3, R4.7)
    # ------------------------------------------------------------------
    def _seed_canonical_programs(self) -> int:
        """Idempotently ensure a small canonical-program catalogue exists.

        These are global Beanola program definitions (never tenant-scoped). The
        tenant A/B launch journey assigns offerings from them via the canonical
        `POST /catalog/programs/` write path. Idempotent: re-running the harness
        never duplicates a canonical program.
        """
        from django.utils import timezone

        from apps.catalog.models import CanonicalProgram

        now = timezone.now()
        catalogue = [
            {
                "code": "CANON-DRN",
                "name": "Diploma in Registered Nursing",
                "description": "Canonical program definition shared across schools.",
                "duration_months": 36,
                "regulatory_body": "NMCZ",
            },
            {
                "code": "CANON-CM",
                "name": "Diploma in Clinical Medicine",
                "description": "Canonical program definition shared across schools.",
                "duration_months": 36,
                "regulatory_body": "HPCZ",
            },
        ]
        for spec in catalogue:
            CanonicalProgram.objects.get_or_create(
                code=spec["code"],
                defaults={
                    "name": spec["name"],
                    "description": spec["description"],
                    "duration_months": spec["duration_months"],
                    "regulatory_body": spec["regulatory_body"],
                    "is_active": True,
                    "metadata": {},
                    "created_at": now,
                    "updated_at": now,
                },
            )
        return CanonicalProgram.objects.filter(is_active=True).count()

    # ------------------------------------------------------------------
    # Schema builder — mirrors backend/tests/conftest.py::unmanaged_schema
    # ------------------------------------------------------------------
    def _build_unmanaged_schema(self) -> int:
        created = 0
        existing_tables = set(connection.introspection.table_names())
        with connection.schema_editor() as schema_editor:
            for model in apps.get_models():
                if model._meta.managed is not False:
                    continue
                table = model._meta.db_table
                if table not in existing_tables:
                    schema_editor.create_model(model)
                    existing_tables.add(table)
                    created += 1
                else:
                    # Table exists (e.g. a Django-managed migration created it):
                    # add any missing model columns so reads/writes do not fail.
                    with connection.cursor() as cursor:
                        columns = {
                            col.name
                            for col in connection.introspection.get_table_description(cursor, table)
                        }
                    for field in model._meta.local_fields:
                        if field.column not in columns:
                            schema_editor.add_field(model, field)

        self._add_explicit_indexes()
        return created

    def _add_explicit_indexes(self) -> None:
        """Create the partial/unique indexes the models do not emit.

        Copied from ``backend/tests/conftest.py`` so the harness DB carries the
        same invariants the property/unit suites rely on (Postgres only).
        """
        table_names = set(connection.introspection.table_names())

        if "institution_domains" in table_names:
            with connection.cursor() as cursor:
                cursor.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS "
                    "uq_institution_domains_active_hostname "
                    "ON institution_domains (lower(hostname)) WHERE status = 'active';"
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS idx_institution_domains_status "
                    "ON institution_domains (status);"
                )

        if connection.vendor != "postgresql":
            return

        with connection.cursor() as cursor:
            cursor.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_transaction_reference_present
                ON payments (transaction_reference)
                WHERE transaction_reference IS NOT NULL AND transaction_reference <> '';
                CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_active_per_application
                ON payments (application_id)
                WHERE application_id IS NOT NULL AND status IN ('pending', 'deferred');
                CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_receipt_number
                ON payments (receipt_number)
                WHERE receipt_number IS NOT NULL AND receipt_number <> '';
                CREATE INDEX IF NOT EXISTS idx_payments_application_status
                ON payments (application_id, status);
                CREATE INDEX IF NOT EXISTS idx_payments_user_status
                ON payments (user_id, status);
                CREATE INDEX IF NOT EXISTS idx_payments_status_created_at
                ON payments (status, created_at);
                CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_processed_reference_event
                ON webhook_event_logs (reference, event_type) WHERE processed IS TRUE;
                CREATE INDEX IF NOT EXISTS idx_comm_templates_tenant_lookup
                ON communication_templates (institution_id, template_key, is_active, version);
                CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_saved_filters_owner_name
                ON admin_saved_filters (user_id, lower(name));
                -- admissions-v2 task 10.5 (R13.12, STU-22): the public tracking
                -- selector's uniqueness. Mirrors
                -- scripts/2026_08_09_01_application_tracking_secret.sql. The
                -- Application model deliberately does not declare unique=True on
                -- tracking_selector (uniqueness is partial, over issued secrets
                -- only), so create_model/add_field emits the column but not this
                -- index — and without it a selector collision would produce two
                -- rows one public lookup could resolve to.
                CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_tracking_selector
                ON applications (tracking_selector) WHERE tracking_selector IS NOT NULL;
                """
            )

            # Mirror production's covering index on every FK column.
            cursor.execute(
                """
                SELECT tc.table_name, kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND tc.table_schema = current_schema()
                """
            )
            for table_name, column_name in cursor.fetchall():
                index_name = f"idx_{table_name}_{column_name}"[:63]
                cursor.execute(
                    f'CREATE INDEX IF NOT EXISTS "{index_name}" '
                    f'ON "{table_name}" ("{column_name}");'
                )

    # ------------------------------------------------------------------
    # Platform super-admin (the only platform bootstrap data — R18.1)
    # ------------------------------------------------------------------
    def _ensure_super_admin(self, *, email: str, password: str) -> None:
        from django.utils import timezone

        from apps.accounts.models import Profile
        from apps.accounts.services import hash_password

        now = timezone.now()
        prof = Profile.objects.filter(email__iexact=email).first()
        action = "updated" if prof else "created"
        if prof is None:
            prof = Profile(email=email, created_at=now)
        prof.role = "super_admin"
        prof.is_active = True
        prof.email_verified = True
        prof.first_name = prof.first_name or "Platform"
        prof.last_name = prof.last_name or "Admin"
        prof.full_name = f"{prof.first_name} {prof.last_name}"
        prof.password_hash = hash_password(password)
        prof.password_changed_at = now
        prof.updated_at = now
        prof.save()
        self.stdout.write(self.style.SUCCESS(f"      super-admin {action}: {email} (super_admin)"))
