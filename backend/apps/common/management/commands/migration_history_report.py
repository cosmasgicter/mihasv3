"""migration_history_report - generate a migration-history report from a live
database and gate its freshness (Admissions V2 task 3.6).

Replaces the hand-maintained ``backend/scripts/MIGRATION_HISTORY.md`` mirror
(finding DATA-09) with a report **generated from the real database** via task
3.1's live introspection. The report includes every June 2026+ migration id,
checksum, and applied timestamp, links the task-3.1 schema fingerprint, and
records only a non-secret ``host=... db=...`` environment identity (R15.8,
design §15.1).

Modes
-----
Emit a report from the active Django connection (fresh/migrated local DB)::

    python manage.py migration_history_report --emit report.json \
        --label release-canonical-committed-path --markdown report.md

Emit from a read-only DSN held in an env var (Neon branch / production
read-only) - the DSN is never printed or persisted, the session is read-only::

    python manage.py migration_history_report --emit neon.json \
        --label neon-default-branch --dsn-env NEON_DATABASE_URL

Render the markdown mirror from an already-emitted report (no DB)::

    python manage.py migration_history_report --from-report report.json \
        --markdown report.md

Check a report's freshness against the on-disk migration scripts (and,
optionally, a live ``migration_history`` table via the Django connection or a
``--dsn-env`` DSN); non-zero exit on any stale/incomplete/leak finding::

    python manage.py migration_history_report --check-freshness report.json
    python manage.py migration_history_report --check-freshness report.json --against-db

Exit status: 0 = ok, 1 = stale / incomplete / secret-leak / refused.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from apps.common.migration_history_report import (
    build_report_from_connection,
    build_report_from_manifest,
    forward_script_names,
    render_markdown,
    verify_report,
)
from apps.common.schema_manifest import introspect_postgres


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def _load_json(path: Path) -> dict:
    if not path.exists():
        raise CommandError(f"report not found: {path}")
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise CommandError(f"invalid report JSON {path}: {exc}") from exc


def _dsn_identity(dsn: str) -> str:
    """Return a non-secret ``host=... db=...`` identity from a DSN."""
    parts = urlsplit(dsn)
    host = parts.hostname or "unknown"
    database = (parts.path or "").lstrip("/") or "unknown"
    return f"host={host} db={database}"


class Command(BaseCommand):
    help = (
        "Generate a migration-history report from a live database (ids, "
        "checksums, applied_at, schema fingerprint, non-secret environment "
        "identity) and gate its freshness against the on-disk migration scripts."
    )

    def add_arguments(self, parser):
        parser.add_argument("--emit", metavar="PATH", help="Introspect a DB and write the report JSON.")
        parser.add_argument("--label", default="", help="Environment label (e.g. release-canonical-committed-path, neon-default-branch, production).")
        parser.add_argument("--dsn-env", metavar="VARNAME", help="Read a read-only Postgres DSN from this env var instead of the Django connection. The DSN is never logged.")
        parser.add_argument("--markdown", metavar="PATH", help="Also write a human-readable markdown mirror (with --emit or --from-report).")
        parser.add_argument("--from-report", metavar="PATH", help="Load an existing report JSON (for --markdown or --check-freshness) instead of introspecting a DB.")
        parser.add_argument("--check-freshness", metavar="PATH", help="Verify a report against the on-disk migration scripts; non-zero exit on any finding.")
        parser.add_argument("--against-db", action="store_true", help="With --check-freshness, also compare the report to the live migration_history names (Django connection or --dsn-env).")
        parser.add_argument("--report", metavar="PATH", help="With --check-freshness, write the findings JSON here.")

    # -- dispatch -----------------------------------------------------------

    def handle(self, *args, **options):
        if options.get("check_freshness"):
            return self._check_freshness(options)
        if options.get("emit"):
            return self._emit(options)
        if options.get("from_report"):
            return self._from_report(options)
        raise CommandError(
            "no mode selected; pass one of --emit / --from-report / --check-freshness"
        )

    # -- emit ---------------------------------------------------------------

    def _emit(self, options):
        label = options["label"]
        scripts = forward_script_names()
        dsn_env = options.get("dsn_env")
        if dsn_env:
            report = self._report_via_dsn(dsn_env, label, scripts)
        else:
            report = build_report_from_connection(
                connection, label=label, forward_scripts=scripts
            )
        path = Path(options["emit"])
        _write(path, json.dumps(report, indent=2, default=str))
        env = report["environment"]
        self.stdout.write(
            self.style.SUCCESS(
                f"Wrote migration-history report '{label or '(unlabelled)'}' -> {path} "
                f"(migrations={report['migration_count']} "
                f"june_2026_plus={report['june_2026_plus_count']} "
                f"fingerprint={report['schema_fingerprint']} "
                f"identity={env['identity'] or '(none)'})"
            )
        )
        if options.get("markdown"):
            md_path = Path(options["markdown"])
            _write(md_path, render_markdown(report))
            self.stdout.write(f"Wrote markdown mirror -> {md_path}")

    def _report_via_dsn(self, dsn_env: str, label: str, scripts) -> dict:
        dsn = os.environ.get(dsn_env)
        if not dsn:
            raise CommandError(f"env var {dsn_env} is empty or unset")
        try:
            import psycopg2
        except ImportError as exc:  # pragma: no cover - env-dependent
            raise CommandError("psycopg2 is required for --dsn-env introspection") from exc
        conn = psycopg2.connect(dsn)
        try:
            # Force a read-only session so introspection can never mutate a
            # production replica or the Neon authoring branch.
            conn.set_session(readonly=True, autocommit=True)
            with conn.cursor() as cursor:
                manifest = introspect_postgres(
                    cursor, label=label, environment_identity=_dsn_identity(dsn)
                )
        finally:
            conn.close()
        return build_report_from_manifest(manifest, forward_scripts=scripts)

    # -- from-report --------------------------------------------------------

    def _from_report(self, options):
        report = _load_json(Path(options["from_report"]))
        if options.get("markdown"):
            md_path = Path(options["markdown"])
            _write(md_path, render_markdown(report))
            self.stdout.write(self.style.SUCCESS(f"Wrote markdown mirror -> {md_path}"))
        else:
            raise CommandError("--from-report needs --markdown (nothing else to do)")

    # -- check-freshness ----------------------------------------------------

    def _check_freshness(self, options):
        report = _load_json(Path(options["check_freshness"]))
        scripts = forward_script_names()
        recorded = None
        if options.get("against_db"):
            recorded = self._recorded_names(options.get("dsn_env"))
        findings = verify_report(report, scripts, recorded_names=recorded)

        for finding in findings:
            self.stdout.write(
                self.style.ERROR(f"STALE  {finding.category}: {finding.object} - {finding.detail}")
            )
        if options.get("report"):
            _write(
                Path(options["report"]),
                json.dumps(
                    {
                        "ok": not findings,
                        "finding_count": len(findings),
                        "findings": [f.to_dict() for f in findings],
                    },
                    indent=2,
                ),
            )
        if findings:
            self.stdout.write(
                self.style.ERROR(f"FRESHNESS FAIL: {len(findings)} finding(s).")
            )
            sys.exit(1)
        self.stdout.write(
            self.style.SUCCESS(
                f"FRESHNESS OK: report covers every June 2026+ migration script on disk "
                f"({report.get('june_2026_plus_count')} June+ rows), links "
                f"{report.get('schema_fingerprint')}, no secrets."
            )
        )

    def _recorded_names(self, dsn_env):
        """Return live ``migration_history.migration_name`` values."""
        if dsn_env:
            dsn = os.environ.get(dsn_env)
            if not dsn:
                raise CommandError(f"env var {dsn_env} is empty or unset")
            import psycopg2

            conn = psycopg2.connect(dsn)
            try:
                conn.set_session(readonly=True, autocommit=True)
                with conn.cursor() as cursor:
                    cursor.execute("SELECT migration_name FROM migration_history")
                    return [row[0] for row in cursor.fetchall()]
            finally:
                conn.close()
        with connection.cursor() as cursor:
            cursor.execute("SELECT migration_name FROM migration_history")
            return [row[0] for row in cursor.fetchall()]
