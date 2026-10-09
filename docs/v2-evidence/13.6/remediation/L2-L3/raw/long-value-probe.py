#!/usr/bin/env python3
"""long-value-probe - GATE-13.3-13's actual reproduction, at the write layer.

Admissions-V2 task 13.6 remediation L2 (GATE-13.5-01 / GATE-13.3-13).

WHY THIS EXISTS
---------------
13.5's ``width-drift-probe.py`` reads ``information_schema`` and reports that
``applications.institution / intake / program`` are narrower than the model
declares. That is a catalogue fact. It is not the same thing as an application
create actually failing, and 13.3 filed the finding from the failure:

    GATE-13.3-13 - a legally-named long intake returns HTTP 500 on every
    application create.

This probe closes the loop the width probe leaves open. It gives real catalogue
rows longer - still legal, still inside their own varchar(255) ceiling - names,
then writes an ``applications`` row carrying those names in its display-snapshot
columns, exactly as the create path does. Before the widening Postgres raises
``DataError: value too long for type character varying(50)``, which Django
surfaces through ``envelope_exception_handler`` as an unhandled HTTP 500. After
the widening the same write succeeds and stores the whole value.

WHAT IT MEASURES, IN ORDER
--------------------------
1. **one column at a time** - three writes, each with exactly ONE long snapshot
   value and the other two short. This is what makes the result attributable:
   the answer is per column, so "institution is the only one that 500s" and "all
   three 500" are distinguishable outcomes rather than one aggregate failure.
2. **all three at once** - the realistic shape, a tenant whose institution,
   intake and programme names are all fully spelt out.
3. **the ORM's own create** - the strongest form of the claim. On an
   **un-migrated production-lineage snapshot it cannot run at all**: the V2 model
   declares columns the snapshot has never had (``configuration_version``,
   ``draft_name``), so the ORM's INSERT fails with ``ProgrammingError: column ...
   does not exist`` before it ever reaches a width ceiling. That is not noise -
   it is GATE-13.4-02 restated from the application side: this database cannot
   serve V2 code until it is brought forward. Reported, never hidden, and it does
   not decide the verdict.

Writes 1 and 2 use the ``Application`` model's own concrete column list,
intersected with the columns this database actually has, bound by Django's own
parameter layer. That is the instrument which stays *comparable across a
migration*, because it also works on an un-migrated snapshot.

Every write happens inside a transaction that is unconditionally rolled back, so
the database is unchanged either way. The rollback matters: this probe runs twice
against the same scratch database (before and after the widening) and neither run
may leave the catalogue or the application set changed.

SAFETY
------
* Never run against production. Never run against ``v2_snap_13_4``.
* Every write is inside a rolled-back transaction; the intended target is this
  batch's own scratch database.
* Prints no secret - the DSN comes from the environment and is never echoed.

USAGE
-----
    cd backend
    DATABASE_URL="<scratch dsn>" .venv/bin/python \\
      ../docs/v2-evidence/13.6/remediation/L2-L3/raw/long-value-probe.py

Exit status: 0 = every write succeeded (the columns hold legal long names),
             1 = at least one write raised DataError (the HTTP 500 is reachable).
"""
from __future__ import annotations

import os
import sys
import uuid
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[6] / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")

import django  # noqa: E402

django.setup()

from django.db import DataError, ProgrammingError, connection, transaction  # noqa: E402

from apps.applications.models import Application  # noqa: E402
from apps.catalog.models import Institution, Intake, Program  # noqa: E402

# The ordinary real-world rename: a campus / school qualifier appended to names
# one of which already sits at 46 of 50 characters. Nothing exotic - and each
# stays inside its OWN column's varchar(255) ceiling, so the catalogue accepts
# it. Only the application's display snapshot cannot hold it.
INSTITUTION_SUFFIX = " (Ndola Campus)"
INTAKE_SUFFIX = " (School of Nursing and Midwifery)"
PROGRAM_SUFFIX = " and Community Health Practice"

# Minimum viable applicant identity for a draft row. Values are synthetic and
# non-PII; the e-mail domain is reserved by RFC 2606 so it can never be routed.
_APPLICANT = {
    "full_name": "Width Probe Applicant",
    "date_of_birth": date(2000, 1, 1),
    "sex": "female",
    "phone": "0970000000",
    "email": "width-probe@example.invalid",
    "residence_town": "Ndola",
    "status": "draft",
}


class _Rollback(Exception):
    """Sentinel used to unwind ``transaction.atomic`` without a real error."""


def _snapshot_widths() -> dict[str, int]:
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT column_name, character_maximum_length
            FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'applications'
              AND column_name IN ('institution', 'intake', 'program')
            """
        )
        return dict(cur.fetchall())


def _existing_columns() -> set[str]:
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = 'applications'
            """
        )
        return {row[0] for row in cur.fetchall()}


def _some_profile_id():
    with connection.cursor() as cur:
        cur.execute("SELECT id FROM profiles ORDER BY created_at LIMIT 1")
        row = cur.fetchone()
        return row[0] if row else None


def _raw_insert(values: dict[str, object]) -> tuple[str, str]:
    """INSERT using the model's own column names, filtered to what exists here."""
    model_columns = {f.name: f.column for f in Application._meta.local_concrete_fields}
    present = _existing_columns()
    columns: list[str] = []
    params: list[object] = []
    for field_name, value in values.items():
        column = model_columns.get(field_name, field_name)
        if column not in present:
            continue
        columns.append(column)
        params.append(value)

    quoted = ", ".join(f'"{c}"' for c in columns)
    placeholders = ", ".join(["%s"] * len(columns))
    sql = f"INSERT INTO applications ({quoted}) VALUES ({placeholders}) RETURNING id"
    with connection.cursor() as cur:
        try:
            cur.execute(sql, params)
        except DataError as exc:
            return "DataError", str(exc).strip()
        row_id = cur.fetchone()[0]
        cur.execute(
            "SELECT length(institution), length(intake), length(program) "
            "FROM applications WHERE id = %s",
            [row_id],
        )
        inst, take, prog = cur.fetchone()
        return "ok", f"stored institution={inst} intake={take} program={prog}"


def _orm_insert(values: dict[str, object]) -> tuple[str, str]:
    try:
        created = Application.objects.create(**values)
    except DataError as exc:
        return "DataError", str(exc).strip()
    except ProgrammingError as exc:
        return "unavailable", str(exc).strip().splitlines()[0]
    created.refresh_from_db()
    return "ok", (
        f"stored institution={len(created.institution)} "
        f"intake={len(created.intake)} program={len(created.program)}"
    )


def _attempt(writer, values: dict[str, object], renames) -> tuple[str, str]:
    """Run ``writer`` inside its own always-rolled-back transaction."""
    outcome = detail = ""
    try:
        with transaction.atomic():
            for model, pk, name in renames:
                model.objects.filter(pk=pk).update(name=name)
            outcome, detail = writer(values)
            raise _Rollback()
    except _Rollback:
        pass
    return outcome, detail


def main() -> int:
    widths = _snapshot_widths()
    print(f"database                     : {connection.settings_dict['NAME']}")
    print(
        "applications snapshot widths : "
        + ", ".join(f"{k}=varchar({v})" for k, v in sorted(widths.items()))
    )

    institution = Institution.objects.order_by("-name").first()
    intake = Intake.objects.order_by("name").first()
    program = Program.objects.order_by("-name").first()
    if not (institution and intake and program):
        print("SKIP: the database has no catalogue rows to rename")
        return 2
    owner_id = _some_profile_id()
    if owner_id is None:
        print("SKIP: the database has no profile row to own an application")
        return 2

    long_institution = institution.name + INSTITUTION_SUFFIX
    long_intake = intake.name + INTAKE_SUFFIX
    long_program = program.name + PROGRAM_SUFFIX
    renames = (
        (Institution, institution.pk, long_institution),
        (Intake, intake.pk, long_intake),
        (Program, program.pk, long_program),
    )

    print()
    print("the legal rename this probe performs (all inside rolled-back txs):")
    for label, before, after in (
        ("institutions.name", institution.name, long_institution),
        ("intakes.name", intake.name, long_intake),
        ("programs.name", program.name, long_program),
    ):
        print(f"  {label:<20} {len(before):>3} -> {len(after):>3} chars   {after!r}")

    base = dict(_APPLICANT)
    base["user_id"] = owner_id
    short = {
        "institution": institution.name,
        "intake": intake.name,
        "program": program.name,
    }
    longs = {
        "institution": long_institution,
        "intake": long_intake,
        "program": long_program,
    }

    failures = 0

    print()
    print("1. one long snapshot column at a time")
    for column in ("institution", "intake", "program"):
        values = dict(base)
        values.update(short)
        values[column] = longs[column]
        values["application_number"] = f"PROBE-{column[:4].upper()}-{uuid.uuid4().hex[:6].upper()}"
        outcome, detail = _attempt(_raw_insert, values, renames)
        print(f"  {column:<12} ({len(longs[column])} chars) -> {outcome}: {detail}")
        if outcome != "ok":
            failures += 1

    print()
    print("2. all three long at once (the realistic shape)")
    values = dict(base)
    values.update(longs)
    values["application_number"] = f"PROBE-ALL-{uuid.uuid4().hex[:6].upper()}"
    outcome, detail = _attempt(_raw_insert, values, renames)
    print(f"  model-column INSERT -> {outcome}: {detail}")
    if outcome != "ok":
        failures += 1

    print()
    print("3. the ORM's own Application.objects.create")
    values = dict(base)
    values.update(longs)
    values["application_number"] = f"PROBE-ORM-{uuid.uuid4().hex[:6].upper()}"
    orm_outcome, orm_detail = _attempt(_orm_insert, values, renames)
    print(f"  objects.create -> {orm_outcome}: {orm_detail}")
    if orm_outcome == "unavailable":
        print(
            "  (GATE-13.4-02 from the application side: the V2 model declares a "
            "column this un-migrated database has never had, so the ORM cannot "
            "insert at all. Not counted in the verdict.)"
        )
    elif orm_outcome != "ok":
        failures += 1

    print()
    print("after rollback (must equal the pre-probe values):")
    institution.refresh_from_db()
    intake.refresh_from_db()
    program.refresh_from_db()
    print(f"  institutions.name : {len(institution.name):>3} chars {institution.name!r}")
    print(f"  intakes.name      : {len(intake.name):>3} chars {intake.name!r}")
    print(f"  programs.name     : {len(program.name):>3} chars {program.name!r}")
    with connection.cursor() as cur:
        cur.execute(
            "SELECT count(*) FROM applications WHERE application_number LIKE 'PROBE-%'"
        )
        print(f"  probe rows remaining : {cur.fetchone()[0]}")

    print()
    print(
        f"VERDICT: {'FAIL' if failures else 'PASS'} - failing_writes={failures} "
        + (
            "(a legal long catalogue name cannot reach the application snapshot; "
            "HTTP 500 reachable)"
            if failures
            else "(every legal long catalogue name is stored whole)"
        )
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
