"""Shared pytest fixtures for the Beanola Django API test suite."""

import os

import django
import pytest

# Configure Django settings before anything else
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
os.environ.setdefault("TESTING", "1")

django.setup()

from rest_framework.test import APIClient, APIRequestFactory  # noqa: E402
from django.apps import apps  # noqa: E402
from django.core.cache import cache  # noqa: E402
from django.db import connection  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_rate_limit_cache():
    """Clear the shared cache before every test.

    The django-ratelimit ``RateLimitMiddleware`` stores per-IP request counts
    in the default cache. Without a reset between tests the coarse buckets
    accumulate across the suite and unrelated tests start seeing 429
    ``RATE_LIMITED`` responses (they pass in isolation but fail in a full
    run). Clearing the cache per test keeps rate-limit state isolated without
    disabling the middleware, so the limiter's own tests still exercise it.
    """
    cache.clear()
    yield
    cache.clear()


@pytest.fixture()
def api_client():
    """Return a DRF APIClient instance for making test requests."""
    return APIClient()


@pytest.fixture()
def api_request_factory():
    """Return a DRF APIRequestFactory for building request objects."""
    return APIRequestFactory()


# ---------------------------------------------------------------------------
# Multi-tenant (Beanola) shared fixtures — spec multi-tenant-beanola-admissions
# ---------------------------------------------------------------------------


@pytest.fixture()
def tenant_world(db):
    """Build one fully-linked tenant object graph against the test DB.

    Returns a ``TenantWorld`` dataclass exposing institution, canonical
    program, offering, intake, program-intake, student, application, staff,
    membership, and access-grant rows. Requires the pytest-django ``db``
    fixture so the ``managed=False`` tenant tables (created by the
    ``unmanaged_schema`` session fixture) are available.
    """
    from tests.tenant_fixtures import build_tenant_world

    return build_tenant_world()


@pytest.fixture()
def tenant_world_factory(db):
    """Return the ``build_tenant_world`` callable for parametrised builds.

    Lets a test create several independent or canonical-sharing worlds with
    custom priorities, residency rules, capacity, or grant scopes.
    """
    from tests.tenant_fixtures import build_tenant_world

    return build_tenant_world


@pytest.fixture()
def two_tenant_worlds(db):
    """Build two independent tenant worlds that share one canonical program."""
    from tests.tenant_fixtures import build_two_tenant_worlds

    return build_two_tenant_worlds()


@pytest.fixture(scope="session", autouse=True)
def unmanaged_schema(django_db_setup, django_db_blocker):
    """Create unmanaged-model tables inside ephemeral test databases."""
    with django_db_blocker.unblock():
        existing_tables = set(connection.introspection.table_names())
        with connection.schema_editor() as schema_editor:
            for model in apps.get_models():
                if model._meta.managed is False and model._meta.db_table not in existing_tables:
                    schema_editor.create_model(model)
                    existing_tables.add(model._meta.db_table)
                elif model._meta.managed is False and model._meta.db_table in existing_tables:
                    with connection.cursor() as cursor:
                        columns = {
                            column.name
                            for column in connection.introspection.get_table_description(
                                cursor,
                                model._meta.db_table,
                            )
                        }
                    for field in model._meta.local_fields:
                        if field.column not in columns:
                            schema_editor.add_field(model, field)
                            with connection.cursor() as cursor:
                                columns = {
                                    column.name
                                    for column in connection.introspection.get_table_description(
                                        cursor,
                                        model._meta.db_table,
                                    )
                                }

        # Active-hostname uniqueness index (R7.10, Property 15). The
        # InstitutionDomain model is managed=False, so create_model emits the
        # table plus its column-level UNIQUE(hostname) but NOT the partial
        # unique index from
        # scripts/2026_06_18_01_institution_domain_lifecycle.sql. Create it here
        # (vendor-neutral: both SQLite and Postgres support partial/expression
        # indexes) so the active-hostname-uniqueness property is genuinely
        # exercised against the ephemeral test DB and not merely satisfied by the
        # blanket column-level unique constraint.
        if "institution_domains" in set(connection.introspection.table_names()):
            with connection.cursor() as cursor:
                cursor.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS "
                    "uq_institution_domains_active_hostname "
                    "ON institution_domains (lower(hostname)) "
                    "WHERE status = 'active';"
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS idx_institution_domains_status "
                    "ON institution_domains (status);"
                )

        # Immutable document versions: exactly one *current* version per
        # (application, document_type). Mirrors
        # scripts/2026_07_19_03_payments_documents_validate.sql (task 3.5) — the
        # model is managed=False so create_model does not emit the partial unique
        # index, and admissions-v2 task 7.3's replace/delete commands are only
        # genuinely exercised when the database enforces the invariant.
        # Vendor-neutral: SQLite and Postgres both support partial unique indexes.
        if "application_documents" in set(connection.introspection.table_names()):
            with connection.cursor() as cursor:
                cursor.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS "
                    "uq_application_documents_one_current "
                    "ON application_documents (application_id, document_type) "
                    "WHERE is_current;"
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS idx_application_documents_version_chain "
                    "ON application_documents (application_id, document_type, version DESC);"
                )

        # Task 7.3 staged-write ledger: at most one open command per
        # (application, document_type, idempotency_key). Mirrors
        # scripts/2026_07_26_01_document_evidence_lifecycle.sql. The
        # DocumentUploadStage model is managed=False, so create_model emits the
        # table but not this partial unique index — and without it the test DB
        # would silently accept two stage rows for one declared command identity,
        # which is exactly the case the upload view's replay lookup exists to
        # answer. Vendor-neutral: SQLite and Postgres both support partial unique
        # indexes.
        if "document_upload_stages" in set(connection.introspection.table_names()):
            with connection.cursor() as cursor:
                cursor.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS "
                    "uq_document_upload_stages_idempotency "
                    "ON document_upload_stages (application_id, document_type, idempotency_key) "
                    "WHERE idempotency_key IS NOT NULL;"
                )

        # Task 8.1 fee-quote uniqueness: at most one *live* quote per
        # (application, fee_type) and at most one quote per funded payment.
        # Mirrors scripts/2026_07_30_01_payment_fee_quotes.sql. The FeeQuote model
        # is managed=False, so create_model emits the table but not these partial
        # unique indexes — and without them the ephemeral test DB would allow two
        # contradictory live prices for one application, or one payment funded by
        # two quotes, which are the exact things the task makes impossible.
        # Vendor-neutral: SQLite and Postgres both support partial unique indexes,
        # so the fast SQLite suite enforces them too (the money CHECK constraints
        # cannot be added to an existing SQLite table and stay Postgres-only
        # below).
        if "payment_fee_quotes" in set(connection.introspection.table_names()):
            with connection.cursor() as cursor:
                cursor.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS "
                    "uq_payment_fee_quotes_one_active "
                    "ON payment_fee_quotes (application_id, fee_type) "
                    "WHERE status = 'active';"
                )
                cursor.execute(
                    "CREATE UNIQUE INDEX IF NOT EXISTS "
                    "uq_payment_fee_quotes_payment "
                    "ON payment_fee_quotes (payment_id) "
                    "WHERE payment_id IS NOT NULL;"
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS idx_payment_fee_quotes_application "
                    "ON payment_fee_quotes (application_id, created_at DESC);"
                )
                cursor.execute(
                    "CREATE INDEX IF NOT EXISTS idx_payment_fee_quotes_expiring "
                    "ON payment_fee_quotes (expires_at) WHERE status = 'active';"
                )

        if connection.vendor == "postgresql":
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
                    ON webhook_event_logs (reference, event_type)
                    WHERE processed IS TRUE;
                    -- Tenant-aware communication_templates lookup, mirrors
                    -- scripts/2026_06_08_04_communication_templates_tenant.sql
                    -- (the model is managed=False so create_model does not emit
                    -- this composite index; tests assert its presence).
                    CREATE INDEX IF NOT EXISTS idx_comm_templates_tenant_lookup
                    ON communication_templates (institution_id, template_key, is_active, version);
                    """
                )

            # Admissions V2 task 3.3 integrity constraints. Mirrors
            # backend/scripts/2026_07_17_01_integrity_constraints_expand.sql and
            # 2026_07_17_02_communication_template_unique_switch.sql. create_model
            # does not emit these partial / NULLS NOT DISTINCT / scope-guarded
            # objects, so add them here (Postgres-only, as the scripts require
            # PG15+ NULLS NOT DISTINCT) so the ephemeral test DB enforces the same
            # invariants the constraint-introspection and duplicate-rejection
            # tests assert. Idempotent (IF NOT EXISTS / pg_constraint guards).
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    DO $$
                    BEGIN
                        -- ProgramIntake unique (program_id, intake_id): the model
                        -- unique_together already emits program_intakes_program_id_
                        -- intake_id_key via create_model, so only add ours if no
                        -- unique already covers the pair (mirrors the script guard).
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_constraint c
                            WHERE c.conrelid = 'program_intakes'::regclass
                              AND c.contype = 'u'
                              AND c.conkey = ARRAY[
                                  (SELECT attnum FROM pg_attribute WHERE attrelid='program_intakes'::regclass AND attname='program_id'),
                                  (SELECT attnum FROM pg_attribute WHERE attrelid='program_intakes'::regclass AND attname='intake_id')
                              ]::smallint[]
                        ) THEN
                            CREATE UNIQUE INDEX IF NOT EXISTS uq_program_intakes_program_intake
                                ON program_intakes (program_id, intake_id);
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_program_intakes_capacity_nonneg') THEN
                            ALTER TABLE program_intakes ADD CONSTRAINT chk_program_intakes_capacity_nonneg CHECK (max_capacity >= 0);
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_program_intakes_enrollment_nonneg') THEN
                            ALTER TABLE program_intakes ADD CONSTRAINT chk_program_intakes_enrollment_nonneg CHECK (current_enrollment >= 0);
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_intakes_capacity_nonneg') THEN
                            ALTER TABLE intakes ADD CONSTRAINT chk_intakes_capacity_nonneg CHECK (max_capacity >= 0);
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_intakes_enrollment_nonneg') THEN
                            ALTER TABLE intakes ADD CONSTRAINT chk_intakes_enrollment_nonneg CHECK (current_enrollment >= 0);
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_access_grants_scope_target') THEN
                            ALTER TABLE access_grants ADD CONSTRAINT chk_access_grants_scope_target CHECK (
                                scope_type IN ('institution','program_offering','application')
                                AND (
                                    (scope_type='institution' AND institution_id IS NOT NULL)
                                    OR (scope_type='program_offering' AND program_id IS NOT NULL)
                                    OR (scope_type='application' AND application_id IS NOT NULL)
                                )
                            );
                        END IF;
                        -- Task 8.1 money integrity on payment_fee_quotes.
                        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_payment_fee_quotes_total_is_sum') THEN
                            ALTER TABLE payment_fee_quotes ADD CONSTRAINT chk_payment_fee_quotes_total_is_sum
                                CHECK (total_amount = base_amount + provider_fee);
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_payment_fee_quotes_merchant_bearer_zero_fee') THEN
                            ALTER TABLE payment_fee_quotes ADD CONSTRAINT chk_payment_fee_quotes_merchant_bearer_zero_fee
                                CHECK (bearer <> 'merchant' OR provider_fee = 0);
                        END IF;
                        -- Redemption binding. A redeemed quote must be timestamped
                        -- and only a redeemed quote may name a payment; a redeemed
                        -- quote is NOT required to still name a live payment_id
                        -- because payment_id is ON DELETE SET NULL (deleting a
                        -- funded Payment must not be impossible, and the quote row
                        -- survives as audit evidence). Mirrors the script exactly.
                        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_payment_fee_quotes_redeemed_binding') THEN
                            ALTER TABLE payment_fee_quotes ADD CONSTRAINT chk_payment_fee_quotes_redeemed_binding
                                CHECK (
                                    (status = 'redeemed' AND redeemed_at IS NOT NULL)
                                    OR (status <> 'redeemed' AND payment_id IS NULL AND redeemed_at IS NULL)
                                );
                        END IF;
                        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_payment_fee_quotes_signature_present') THEN
                            ALTER TABLE payment_fee_quotes ADD CONSTRAINT chk_payment_fee_quotes_signature_present
                                CHECK (length(signature) >= 32);
                        END IF;
                    END$$;
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_program_fees_one_active
                        ON program_fees (program_id, fee_type, residency_category) WHERE is_active;
                    -- Admissions V2 task 8.1 fee-quote invariants. Mirrors
                    -- backend/scripts/2026_07_30_01_payment_fee_quotes.sql: the
                    -- FeeQuote model is managed=False, so create_model emits the
                    -- table but neither the partial unique indexes nor the money
                    -- CHECKs. Without them the ephemeral test DB would let two
                    -- live quotes, two quotes on one payment, or a total that does
                    -- not add up exist — the exact things the task makes
                    -- impossible.
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_fee_quotes_one_active
                        ON payment_fee_quotes (application_id, fee_type) WHERE status = 'active';
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_fee_quotes_payment
                        ON payment_fee_quotes (payment_id) WHERE payment_id IS NOT NULL;
                    CREATE INDEX IF NOT EXISTS idx_payment_fee_quotes_application
                        ON payment_fee_quotes (application_id, created_at DESC);
                    CREATE INDEX IF NOT EXISTS idx_payment_fee_quotes_expiring
                        ON payment_fee_quotes (expires_at) WHERE status = 'active';
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_access_grants_active_institution
                        ON access_grants (user_id, institution_id) WHERE is_active AND scope_type='institution';
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_access_grants_active_program
                        ON access_grants (user_id, program_id) WHERE is_active AND scope_type='program_offering';
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_access_grants_active_application
                        ON access_grants (user_id, application_id) WHERE is_active AND scope_type='application';
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_profiles_scope_version
                        ON institution_document_profiles
                           (institution_id, document_type, program_id, canonical_program_id, intake_id, version)
                        NULLS NOT DISTINCT;
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_templates_key_inst_version
                        ON communication_templates (template_key, institution_id, version) NULLS NOT DISTINCT;
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_comm_templates_one_active
                        ON communication_templates (template_key, institution_id) NULLS NOT DISTINCT WHERE is_active;
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_waitlist_position
                        ON applications (program_offering_id, intake_id, waitlist_position)
                        WHERE waitlist_position IS NOT NULL
                          AND program_offering_id IS NOT NULL
                          AND intake_id IS NOT NULL;
                    -- Admissions V2 task 9.1 saved-filter uniqueness. Mirrors
                    -- backend/scripts/2026_08_06_01_admin_saved_filters.sql: the
                    -- AdminSavedFilter model is managed=False, so create_model
                    -- emits the table but not the case-insensitive per-owner
                    -- unique index. Without it "Overdue" and "overdue" would be
                    -- two saved views an operator cannot tell apart, and the
                    -- IntegrityError race guard in AdminApplicationSavedFilter-
                    -- ListView.post would never fire on the test DB.
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_saved_filters_owner_name
                        ON admin_saved_filters (user_id, lower(name));
                    -- Admissions V2 task 10.5 tracking-secret selector uniqueness.
                    -- Mirrors backend/scripts/2026_08_09_01_application_tracking_secret.sql:
                    -- the Application model is managed=False and deliberately does
                    -- NOT declare unique=True on tracking_selector (uniqueness is
                    -- partial, over issued secrets only), so create_model/add_field
                    -- emits the column but not this index. Without it a selector
                    -- collision would silently produce two rows one public lookup
                    -- could resolve to.
                    CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_tracking_selector
                        ON applications (tracking_selector)
                        WHERE tracking_selector IS NOT NULL;
                    -- Switch step (script 02): the test-DB model does not carry the
                    -- legacy global UNIQUE(template_key), so this is a no-op here,
                    -- kept for parity/self-documentation with the production script.
                    ALTER TABLE communication_templates
                        DROP CONSTRAINT IF EXISTS communication_templates_template_key_key;
                    """
                )

            # FK-index backfill: production (Neon) carries a covering btree
            # index on every foreign-key column (enforced by the drift-guard
            # job against a real fork). schema_editor.create_model does not
            # reproduce all of these on the ephemeral test DB, so mirror the
            # invariant here — create idx_<table>_<column> for any FK column
            # that lacks a covering index. Keeps check_schema_drift
            # --check-fk-indexes green in CI without hardcoding the list.
            with connection.cursor() as cursor:
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
                fk_columns = cursor.fetchall()
                for table_name, column_name in fk_columns:
                    index_name = f"idx_{table_name}_{column_name}"[:63]
                    cursor.execute(
                        f'CREATE INDEX IF NOT EXISTS "{index_name}" '
                        f'ON "{table_name}" ("{column_name}");'
                    )
