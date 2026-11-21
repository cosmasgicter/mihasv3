"""SQL functions the application calls, for databases the boot sweep did not build.

``apply_sql_migrations`` (run at container start) applies every top-level script
in ``backend/scripts/``, and with them the SQL functions the application calls.
Two database builds skip it and create the tables from the models instead: the
local harness (``harness_bootstrap``) and the backend test database
(``tests/conftest.py::unmanaged_schema``). Without this module those databases
have no ``next_application_number``, so every application create there logged
"next_application_number SQL helper unavailable" and took the count-based
fallback, which collides under concurrent creates (problem 4 of the
finish-2026-11-21 run).

The function is installed from the same scripts, in the order the sweep applies
them, so there is one definition. PostgreSQL only: the scripts are PL/pgSQL, and
on SQLite the application uses its fallback, as before.
"""

from __future__ import annotations

from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"

#: The scripts that define ``next_application_number``, in sweep (filename) order.
APPLICATION_NUMBER_SCRIPTS: tuple[str, ...] = (
    "application_number_sequences.sql",
    "application_number_sequences_race_safe.sql",
)


def install_application_number_function(connection) -> tuple[str, ...]:
    """Apply the ``next_application_number`` scripts; return the names applied.

    The scripts are idempotent (``CREATE SEQUENCE IF NOT EXISTS``,
    ``CREATE OR REPLACE FUNCTION`` and a re-runnable sequence-alignment block),
    so running this on a database that already has the function is a no-op apart
    from re-aligning each sequence with the highest number in use.
    """
    if connection.vendor != "postgresql":
        return ()
    with connection.cursor() as cursor:
        for name in APPLICATION_NUMBER_SCRIPTS:
            cursor.execute((SCRIPTS_DIR / name).read_text(encoding="utf-8"))
    return APPLICATION_NUMBER_SCRIPTS


__all__ = ["APPLICATION_NUMBER_SCRIPTS", "install_application_number_function"]
