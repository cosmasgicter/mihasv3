"""Tests for the apply_sql_migrations management command.

Verifies:
- Tracking table creation on first run.
- Pending migrations are applied in filename order.
- Already-applied migrations are skipped on re-run.
- Each applied row stores filename + sha256 checksum.
- Failure in one migration raises CommandError; earlier successes kept.
- --dry-run lists pending migrations without applying them.
"""
from __future__ import annotations

import hashlib
from io import StringIO
from pathlib import Path

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection


@pytest.fixture
def fresh_tracking_table():
    """Drop applied_sql_migrations before and after each test so state is isolated."""
    with connection.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS applied_sql_migrations")
    yield
    with connection.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS applied_sql_migrations")


@pytest.fixture
def migrations_dir(tmp_path):
    d = tmp_path / "migrations"
    d.mkdir()
    return d


def _write(path: Path, sql: str) -> None:
    path.write_text(sql)


@pytest.mark.django_db
def test_empty_dir_is_a_no_op(fresh_tracking_table, migrations_dir):
    out = StringIO()
    call_command("apply_sql_migrations", "--migrations-dir", str(migrations_dir), stdout=out)
    assert "No migrations found" in out.getvalue()


@pytest.mark.django_db
def test_applies_pending_and_creates_tracking_table(fresh_tracking_table, migrations_dir):
    _write(
        migrations_dir / "0001_add_aux_table.sql",
        "CREATE TABLE IF NOT EXISTS _aux_smoke_a (id INT PRIMARY KEY);",
    )
    _write(
        migrations_dir / "0002_add_another.sql",
        "CREATE TABLE IF NOT EXISTS _aux_smoke_b (id INT PRIMARY KEY);",
    )

    out = StringIO()
    call_command("apply_sql_migrations", "--migrations-dir", str(migrations_dir), stdout=out)

    text = out.getvalue()
    assert "Pending migrations: 2/2" in text
    assert "0001_add_aux_table.sql" in text
    assert "0002_add_another.sql" in text

    with connection.cursor() as cur:
        cur.execute("SELECT filename FROM applied_sql_migrations ORDER BY filename")
        rows = [r[0] for r in cur.fetchall()]
        assert rows == ["0001_add_aux_table.sql", "0002_add_another.sql"]

        cur.execute("SELECT to_regclass('_aux_smoke_a'), to_regclass('_aux_smoke_b')")
        reg_a, reg_b = cur.fetchone()
        assert reg_a is not None
        assert reg_b is not None

    # Cleanup
    with connection.cursor() as cur:
        cur.execute("DROP TABLE IF EXISTS _aux_smoke_a")
        cur.execute("DROP TABLE IF EXISTS _aux_smoke_b")


@pytest.mark.django_db
def test_rerun_skips_applied(fresh_tracking_table, migrations_dir):
    _write(
        migrations_dir / "0001_idempotent.sql",
        "CREATE TABLE IF NOT EXISTS _aux_smoke_idem (id INT PRIMARY KEY);",
    )

    call_command("apply_sql_migrations", "--migrations-dir", str(migrations_dir), stdout=StringIO())
    out = StringIO()
    call_command("apply_sql_migrations", "--migrations-dir", str(migrations_dir), stdout=out)

    assert "already applied" in out.getvalue()

    with connection.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM applied_sql_migrations")
        assert cur.fetchone()[0] == 1
        cur.execute("DROP TABLE IF EXISTS _aux_smoke_idem")


@pytest.mark.django_db
def test_stores_checksum(fresh_tracking_table, migrations_dir):
    sql = "CREATE TABLE IF NOT EXISTS _aux_smoke_chk (id INT PRIMARY KEY);"
    _write(migrations_dir / "0001_chk.sql", sql)
    expected = hashlib.sha256(sql.encode()).hexdigest()

    call_command("apply_sql_migrations", "--migrations-dir", str(migrations_dir), stdout=StringIO())

    with connection.cursor() as cur:
        cur.execute("SELECT checksum FROM applied_sql_migrations WHERE filename = '0001_chk.sql'")
        assert cur.fetchone()[0] == expected
        cur.execute("DROP TABLE IF EXISTS _aux_smoke_chk")


@pytest.mark.django_db
def test_dry_run_does_not_apply(fresh_tracking_table, migrations_dir):
    _write(
        migrations_dir / "0001_unapplied.sql",
        "CREATE TABLE IF NOT EXISTS _aux_smoke_dry (id INT PRIMARY KEY);",
    )

    out = StringIO()
    call_command(
        "apply_sql_migrations",
        "--migrations-dir", str(migrations_dir),
        "--dry-run",
        stdout=out,
    )

    assert "[dry-run]" in out.getvalue()
    with connection.cursor() as cur:
        cur.execute("SELECT to_regclass('_aux_smoke_dry')")
        assert cur.fetchone()[0] is None


@pytest.mark.django_db
def test_failure_raises_and_earlier_success_kept(fresh_tracking_table, migrations_dir):
    _write(
        migrations_dir / "0001_ok.sql",
        "CREATE TABLE IF NOT EXISTS _aux_smoke_ok (id INT PRIMARY KEY);",
    )
    _write(
        migrations_dir / "0002_bad.sql",
        "THIS IS NOT VALID SQL;",
    )

    with pytest.raises(CommandError) as exc:
        call_command(
            "apply_sql_migrations",
            "--migrations-dir", str(migrations_dir),
            stdout=StringIO(),
        )
    assert "0002_bad.sql" in str(exc.value)

    # The first (successful) migration MUST still be recorded so a retry
    # does not double-apply it.
    with connection.cursor() as cur:
        cur.execute("SELECT filename FROM applied_sql_migrations ORDER BY filename")
        rows = [r[0] for r in cur.fetchall()]
        assert "0001_ok.sql" in rows
        assert "0002_bad.sql" not in rows
        cur.execute("DROP TABLE IF EXISTS _aux_smoke_ok")


@pytest.mark.django_db
def test_non_sql_files_are_ignored(fresh_tracking_table, migrations_dir):
    _write(migrations_dir / "README.md", "# nope")
    _write(migrations_dir / "helpers.py", "x = 1")
    _write(
        migrations_dir / "0001_real.sql",
        "CREATE TABLE IF NOT EXISTS _aux_smoke_filter (id INT PRIMARY KEY);",
    )

    call_command("apply_sql_migrations", "--migrations-dir", str(migrations_dir), stdout=StringIO())

    with connection.cursor() as cur:
        cur.execute("SELECT filename FROM applied_sql_migrations")
        rows = [r[0] for r in cur.fetchall()]
        assert rows == ["0001_real.sql"]
        cur.execute("DROP TABLE IF EXISTS _aux_smoke_filter")
