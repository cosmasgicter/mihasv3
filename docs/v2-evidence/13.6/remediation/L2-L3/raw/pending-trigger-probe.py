#!/usr/bin/env python3
"""pending-trigger-probe - the SECOND layer of GATE-13.4-02, measured.

Admissions-V2 task 13.6 remediation L3 (second finding).

WHY THIS EXISTS
---------------
With L3 (``2026_06_08_00_canonical_programs_id_default.sql``) applied, the
documented remedy for GATE-13.4-02 gets one statement further and then dies on a
DIFFERENT error inside the SAME script
(raw/06-sweep-after-run1.txt)::

    psycopg2.errors.ObjectInUse: cannot CREATE INDEX "programs"
        because it has pending trigger events

13.5 §4.1 could not see this: the sweep never reached it, because the missing
``canonical_programs.id`` default aborted the transaction first. So 13.5's root
cause was correct and INCOMPLETE.

``apply_sql_migrations`` sends the whole file as ONE ``cursor.execute`` inside one
``transaction.atomic()`` (``_apply_transactional``, apply_sql_migrations.py:665).
That is what makes the collision possible at all: every statement in the file
shares one transaction, so a deferred constraint check queued by an early
statement is still pending when a later statement wants to touch the same table.

WHAT IT MEASURES
----------------
1. **The deferred-constraint inventory** - which FK constraints on the tables the
   June script writes are ``DEFERRABLE INITIALLY DEFERRED``. This is the root
   cause, and it is a property of the LINEAGE, not of the script: this database
   carries BOTH the hand-written non-deferrable FKs and Django-created
   ``DEFERRABLE INITIALLY DEFERRED`` duplicates. Postgres queues a deferred
   check to COMMIT; ``CheckTableNotInUse`` then refuses DDL on a relation with
   queued events.
2. **Every colliding statement, not just the first.** The runner aborts the whole
   file at the first error, so the sweep can only ever show one. This probe wraps
   each statement in its own SAVEPOINT, so a failure is recorded and stepped over
   and the walk continues - which is how you learn whether the fix has to cover
   one index or eight statements across two tables.
3. **Candidate fixes, in the same instrument.** ``--mode`` selects what is done
   before the walk, so the before/after comparison is like-for-like:

   * ``baseline``   - nothing. Reproduces the sweep failure.
   * ``immediate``  - ``SET CONSTRAINTS ALL IMMEDIATE`` first, so deferred checks
     fire at end of statement instead of queueing to COMMIT.
   * ``precreate``  - create the June script's ``programs`` / ``applications``
     indexes up front, so its own ``CREATE INDEX IF NOT EXISTS`` are no-ops.
     Tests whether the ``IF NOT EXISTS`` short-circuit happens BEFORE the
     pending-events check - undocumented ordering, hence measured rather than
     assumed.

The statements are split with the RUNNER'S OWN ``_split_sql_statements``, so the
statement boundaries are the ones production would use, dollar-quoted DO blocks
included.

SAFETY
------
* Never run against production. Never run against ``v2_snap_13_4``.
* The whole walk is inside ONE transaction that is ALWAYS rolled back, including
  on success, so the database is unchanged by any mode. The probe re-reads
  ``migration_history`` and ``canonical_programs`` afterwards and prints both, so
  "unchanged" is asserted rather than promised.
* Prints no secret - the DSN comes from the environment and is never echoed.

USAGE
-----
    cd backend
    DATABASE_URL="<scratch dsn>" .venv/bin/python \\
      ../docs/v2-evidence/13.6/remediation/L2-L3/raw/pending-trigger-probe.py \\
      --mode baseline

Exit status: 0 = the walk completed with no failing statement,
             1 = at least one statement failed (the collision is reachable).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[6] / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django  # noqa: E402

django.setup()

from django.db import connection, transaction  # noqa: E402

from apps.common.management.commands.apply_sql_migrations import (  # noqa: E402
    _split_sql_statements,
)

JUNE = BACKEND / "scripts" / "2026_06_08_01_multi_tenant_beanola_admissions.sql"

# The indexes the June script declares on the two tables it also writes rows to.
# Copied verbatim from the script so ``precreate`` mode tests the real thing.
PRECREATE = [
    (
        "CREATE INDEX IF NOT EXISTS idx_programs_canonical_program_id "
        "ON programs (canonical_program_id)"
    ),
    (
        "CREATE INDEX IF NOT EXISTS idx_programs_offering_assignment "
        "ON programs (canonical_program_id, offering_status, assignment_priority, id)"
    ),
    (
        "CREATE INDEX IF NOT EXISTS idx_applications_tenant_ids "
        "ON applications (institution_id, program_id, program_offering_id, intake_id)"
    ),
]

WATCHED = ("programs", "applications", "canonical_programs", "institutions")


class _Rollback(Exception):
    """Sentinel used to unwind ``transaction.atomic`` without a real error."""


def _deferred_inventory() -> list[tuple[str, str, str, str]]:
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT c.conname, ch.relname AS child, par.relname AS parent,
                   CASE WHEN c.condeferred THEN 'INITIALLY DEFERRED'
                        WHEN c.condeferrable THEN 'DEFERRABLE'
                        ELSE 'not deferrable' END AS mode
            FROM pg_constraint c
            JOIN pg_class ch ON ch.oid = c.conrelid
            LEFT JOIN pg_class par ON par.oid = c.confrelid
            WHERE c.contype = 'f'
              AND c.condeferred
              AND (ch.relname = ANY(%s) OR par.relname = ANY(%s))
            ORDER BY ch.relname, c.conname
            """,
            [list(WATCHED), list(WATCHED)],
        )
        return list(cur.fetchall())


def _first_line(statement: str) -> str:
    for line in statement.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("--"):
            return stripped[:96]
    return statement.strip()[:96]


def _walk(statements: list[str], mode: str) -> list[tuple[int, str, str]]:
    """Execute each statement in its own savepoint; return the failures."""
    failures: list[tuple[int, str, str]] = []
    for index, statement in enumerate(statements, start=1):
        body = statement.strip().rstrip(";").strip()
        if not body:
            continue
        try:
            with transaction.atomic():  # SAVEPOINT
                with connection.cursor() as cur:
                    cur.execute(body)
        except Exception as exc:  # noqa: BLE001 - we are cataloguing them
            failures.append(
                (index, _first_line(statement), f"{type(exc).__name__}: {exc}".strip())
            )
    return failures


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--mode",
        choices=("baseline", "immediate", "precreate"),
        default="baseline",
    )
    args = parser.parse_args()

    statements = [s for s in _split_sql_statements(JUNE.read_text()) if s.strip()]
    print(f"database   : {connection.settings_dict['NAME']}")
    print(f"script     : {JUNE.name}")
    print(f"statements : {len(statements)} (split by the runner's own splitter)")
    print(f"mode       : {args.mode}")

    print()
    print("DEFERRABLE INITIALLY DEFERRED foreign keys on the tables this script writes:")
    inventory = _deferred_inventory()
    if not inventory:
        print("  (none - this lineage would not queue a deferred check at all)")
    for conname, child, parent, mode in inventory:
        print(f"  {child:<22} -> {parent:<20} {conname}  [{mode}]")

    failures: list[tuple[int, str, str]] = []
    pre_errors: list[str] = []
    try:
        with transaction.atomic():
            if args.mode == "immediate":
                with connection.cursor() as cur:
                    cur.execute("SET CONSTRAINTS ALL IMMEDIATE")
            elif args.mode == "precreate":
                for statement in PRECREATE:
                    try:
                        with transaction.atomic():
                            with connection.cursor() as cur:
                                cur.execute(statement)
                    except Exception as exc:  # noqa: BLE001
                        pre_errors.append(f"{type(exc).__name__}: {exc}".strip())
            failures = _walk(statements, args.mode)
            raise _Rollback()
    except _Rollback:
        pass

    if pre_errors:
        print()
        print("mode setup errors:")
        for message in pre_errors:
            print(f"  {message}")

    print()
    if failures:
        print(f"FAILING STATEMENTS ({len(failures)} of {len(statements)}):")
        for index, line, message in failures:
            print(f"  [{index:>2}] {line}")
            print(f"       -> {message.splitlines()[0]}")
    else:
        print(f"FAILING STATEMENTS (0 of {len(statements)}): none")

    print()
    print("after rollback (must be unchanged):")
    with connection.cursor() as cur:
        cur.execute("SELECT count(*) FROM migration_history")
        migs = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM canonical_programs")
        canonical = cur.fetchone()[0]
        cur.execute(
            "SELECT count(*) FROM pg_class WHERE relname = 'idx_programs_canonical_program_id'"
        )
        idx = cur.fetchone()[0]
    print(f"  migration_history rows            : {migs}")
    print(f"  canonical_programs rows           : {canonical}")
    print(f"  idx_programs_canonical_program_id : {idx}")

    print()
    print(
        f"VERDICT ({args.mode}): {'FAIL' if failures else 'PASS'} - "
        f"failing_statements={len(failures)}"
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
