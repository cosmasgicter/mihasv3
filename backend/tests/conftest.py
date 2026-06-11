"""Shared pytest fixtures for the MIHAS Django API test suite."""

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
