"""Live-introspection tests for the schema manifest builder (task 3.1).

The pure diff/verify logic is covered DB-free in
``test_schema_manifest_diff.py``. This module exercises the *introspection*
path against the live test database.

Backend policy (matches the repo convention, e.g.
``tests/property/test_schema_reconciliation_invariants.py``):

* The rich Postgres introspection assertions are gated with
  ``skipif(connection.vendor != 'postgresql')`` because they read
  ``pg_catalog`` / ``information_schema`` structures unavailable on SQLite.
* A vendor-agnostic smoke asserts ``build_manifest_from_connection`` always
  returns a well-formed manifest (reduced on SQLite, full on Postgres) so the
  builder itself is exercised in every CI profile with no skip.

Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.1
Requirements: R15.2, R15.3
"""

from __future__ import annotations

import pytest
from django.db import connection

from apps.common.schema_manifest import (
    build_manifest_from_connection,
    compute_fingerprint,
    diff_manifests,
    verify_manifest,
)

pg_only = pytest.mark.skipif(
    connection.vendor != "postgresql",
    reason="Postgres-only introspection (pg_catalog / information_schema); "
           f"active backend is {connection.vendor!r}.",
)


@pytest.mark.django_db
def test_builder_returns_well_formed_manifest_any_backend():
    """Vendor-agnostic: the builder always returns the manifest contract."""
    manifest = build_manifest_from_connection(connection, label="test")
    assert manifest["manifest_version"] == "1"
    assert set(manifest["meta"]) >= {
        "label", "generated_at", "vendor", "schema_fingerprint", "reduced",
    }
    assert manifest["meta"]["label"] == "test"
    assert isinstance(manifest["tables"], dict)
    assert manifest["meta"]["schema_fingerprint"].startswith("sha256:")
    # Fingerprint recomputation is stable for the emitted manifest.
    assert compute_fingerprint(manifest) == manifest["meta"]["schema_fingerprint"]


@pytest.mark.django_db
def test_builder_manifest_is_self_consistent_under_diff():
    """A manifest diffed against itself never reports a failure."""
    manifest = build_manifest_from_connection(connection, label="a")
    report = diff_manifests(manifest, manifest)
    assert report.ok, [d.to_dict() for d in report.failures]


@pg_only
@pytest.mark.django_db
def test_postgres_manifest_captures_core_tables_and_columns():
    manifest = build_manifest_from_connection(connection, label="pg")
    assert manifest["meta"]["reduced"] is False
    tables = manifest["tables"]
    # The applications table and its status column must be introspected.
    assert "applications" in tables
    app_cols = {c["name"] for c in tables["applications"]["columns"]}
    assert "status" in app_cols
    for col in tables["applications"]["columns"]:
        assert {"name", "ordinal", "type", "nullable", "default"} <= set(col)


@pg_only
@pytest.mark.django_db
def test_postgres_manifest_captures_primary_key_and_indexes():
    manifest = build_manifest_from_connection(connection, label="pg")
    apps_table = manifest["tables"]["applications"]
    assert apps_table["primary_key"], "expected a primary key on applications"
    assert apps_table["indexes"], "expected at least one index on applications"
    # Every FK entry carries an explicit validation flag (R15.4).
    for fk in apps_table["foreign_keys"]:
        assert isinstance(fk["validated"], bool)
        assert "ref_table" in fk


@pg_only
@pytest.mark.django_db
def test_postgres_manifest_verifies_clean_on_test_db():
    """The ephemeral test DB should have no unvalidated FK/check constraints."""
    manifest = build_manifest_from_connection(connection, label="pg")
    report = verify_manifest(manifest)
    assert report.ok, [d.to_dict() for d in report.failures]
