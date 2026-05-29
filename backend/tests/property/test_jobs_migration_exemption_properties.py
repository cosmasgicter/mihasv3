"""Property-based tests for the migration-history coverage exemption.

Spec: .kiro/specs/jobs-ops-orm-db-drift/

Property 2 (Fix-Checking, migration): each exempt script is never reported as a
stale unrecorded migration (and the exemption never applies/records it).

Property 4 (Preservation, migration): for arbitrary non-exempt filenames, a
stale unrecorded one is still flagged and a recorded one stays clean — the
exemption must not weaken real-drift detection.
"""

import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.test")
os.environ["TESTING"] = "1"

from datetime import datetime, timedelta, timezone

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.common.management.commands import check_schema_drift
from apps.common.management.commands.check_schema_drift import (
    _COVERAGE_EXEMPT_SCRIPTS,
    _find_stale_unrecorded_migrations,
)

_OLD_COMMIT = datetime.now(timezone.utc) - timedelta(days=90)


def _write(directory, name, body="-- noop\n"):
    path = directory / name
    path.write_text(body)
    return path


@given(name=st.sampled_from(sorted(_COVERAGE_EXEMPT_SCRIPTS)))
@settings(max_examples=10, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
def test_property2_exempt_scripts_never_flagged(name, tmp_path, monkeypatch):
    """Property 2 — exempt scripts are never returned as stale gaps.

    Validates: Requirements 2.5, 2.6.
    """
    _write(tmp_path, name)
    monkeypatch.setattr(check_schema_drift, "_recorded_migration_names", lambda: set())
    monkeypatch.setattr(check_schema_drift, "_git_commit_timestamp", lambda path: _OLD_COMMIT)

    gaps = _find_stale_unrecorded_migrations(7, directory=tmp_path)
    flagged = {filename for filename, _ts, _src in gaps}
    assert name not in flagged


@given(
    other_name=st.text(
        alphabet="abcdefghijklmnopqrstuvwxyz0123456789_", min_size=3, max_size=24
    ).map(lambda s: f"2024_01_01_{s}.sql")
)
@settings(max_examples=30, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
def test_property4_non_exempt_stale_still_flagged(other_name, tmp_path, monkeypatch):
    """Property 4 — a genuinely stale, non-exempt, unrecorded script is flagged
    even when the exempt files are present.

    Validates: Requirement 3.7.
    """
    if other_name in _COVERAGE_EXEMPT_SCRIPTS or other_name.endswith("_rollback.sql"):
        return  # skip degenerate collisions

    _write(tmp_path, "00_full_schema.sql")
    _write(tmp_path, "legacy_columns_drop_2026_08_15.sql")
    _write(tmp_path, other_name)
    monkeypatch.setattr(check_schema_drift, "_recorded_migration_names", lambda: set())
    monkeypatch.setattr(check_schema_drift, "_git_commit_timestamp", lambda path: _OLD_COMMIT)

    gaps = _find_stale_unrecorded_migrations(7, directory=tmp_path)
    flagged = {filename for filename, _ts, _src in gaps}
    assert other_name in flagged
    assert flagged.isdisjoint(_COVERAGE_EXEMPT_SCRIPTS)


@given(
    recorded_name=st.text(
        alphabet="abcdefghijklmnopqrstuvwxyz0123456789_", min_size=3, max_size=24
    ).map(lambda s: f"2024_02_02_{s}.sql")
)
@settings(max_examples=20, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture])
def test_property4_recorded_non_exempt_stays_clean(recorded_name, tmp_path, monkeypatch):
    """Property 4 — a recorded non-exempt script is not flagged.

    Validates: Requirement 3.6.
    """
    if recorded_name in _COVERAGE_EXEMPT_SCRIPTS or recorded_name.endswith("_rollback.sql"):
        return

    _write(tmp_path, recorded_name)
    monkeypatch.setattr(
        check_schema_drift, "_recorded_migration_names", lambda: {recorded_name}
    )
    monkeypatch.setattr(check_schema_drift, "_git_commit_timestamp", lambda path: _OLD_COMMIT)

    gaps = _find_stale_unrecorded_migrations(7, directory=tmp_path)
    flagged = {filename for filename, _ts, _src in gaps}
    assert recorded_name not in flagged
