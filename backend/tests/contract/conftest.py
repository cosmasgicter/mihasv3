"""Fixtures for contract parity tests.

Loads recorded Vercel request/response pairs from the recordings/ directory
and provides helpers for building Django test requests from them.
"""

import json
from pathlib import Path
from uuid import uuid4

import pytest
from django.db import connection
from django.utils import timezone

RECORDINGS_DIR = Path(__file__).parent / "recordings"

# Fields that are expected to differ between Vercel and Django responses
TOLERATED_FIELDS = frozenset({
    "timestamps",
    "request_ids",
    "token_values",
})


def _load_recordings() -> list[dict]:
    """Load all JSON recording fixtures from the recordings directory."""
    recordings = []
    if not RECORDINGS_DIR.exists():
        return recordings
    for filepath in sorted(RECORDINGS_DIR.glob("*.json")):
        with open(filepath) as f:
            data = json.load(f)
            data["_source_file"] = filepath.name
            recordings.append(data)
    return recordings


@pytest.fixture()
def all_recordings() -> list[dict]:
    """Return all recorded Vercel request/response pairs."""
    return _load_recordings()


@pytest.fixture(params=_load_recordings(), ids=lambda r: r.get("name", "unknown"))
def recording(request) -> dict:
    """Parametrized fixture — yields one recording at a time."""
    return request.param


@pytest.fixture()
def recording_by_name() -> dict[str, dict]:
    """Return recordings indexed by name for targeted lookups."""
    return {r["name"]: r for r in _load_recordings()}


@pytest.fixture(scope="session", autouse=True)
def sqlite_contract_seed(django_db_setup, django_db_blocker):
    """Provision a minimal schema/seed set for contract tests on SQLite.

    The contract parity suite only exercises a narrow public/auth surface. In
    CI or on a developer machine with a real Postgres test DB, Django's normal
    DB setup is enough. When the suite is run against a temporary SQLite DB,
    the `managed = False` models need a small bootstrap schema so the recorded
    endpoints can execute.
    """
    if connection.vendor != "sqlite":
        return

    from apps.accounts.models import LoginAttempt, Profile
    from apps.catalog.models import Institution, Program

    with django_db_blocker.unblock():
        existing_tables = set(connection.introspection.table_names())
        required_models = [Institution, Program, Profile, LoginAttempt]

        with connection.schema_editor() as schema_editor:
            for model in required_models:
                if model._meta.db_table not in existing_tables:
                    schema_editor.create_model(model)
                    existing_tables.add(model._meta.db_table)

        if not Institution.objects.filter(code="MIHAS").exists():
            institution = Institution.objects.create(
                id=uuid4(),
                name="MIHAS",
                code="MIHAS",
                full_name="MIHAS Institute of Health and Applied Sciences",
                is_active=True,
                created_at=timezone.now(),
                updated_at=timezone.now(),
            )
        else:
            institution = Institution.objects.get(code="MIHAS")

        if not Program.objects.filter(code="CS101").exists():
            Program.objects.create(
                id=uuid4(),
                name="Computer Science",
                code="CS101",
                institution=institution,
                duration_months=48,
                application_fee="150.00",
                is_active=True,
                created_at=timezone.now(),
                updated_at=timezone.now(),
            )
