"""schema_manifest - live schema manifest + diff tool (Admissions V2 task 3.1).

Replaces the hand-maintained ``EXPECTED_TABLES`` / ``EXPECTED_FK_RELATIONSHIPS``
/ ``EXPECTED_INDEXES`` lists in ``scripts/verify_schema_static.py`` and
``scripts/verify_migration.py`` (finding DATA-08) with a *live introspection*
pass that reads the real database catalog and emits a machine-readable manifest,
plus a structural diff that fails on missing required indexes and unvalidated
foreign keys (R15.2-R15.4).

Modes
-----
Emit a manifest from the active Django connection (fresh/migrated local DB)::

    python manage.py schema_manifest --emit out.json --label migrated-snapshot

Emit a manifest from a read-only DSN held in an environment variable (Neon
authoring branch, production read-only replica) - the DSN is never printed or
persisted, and the session is forced read-only::

    python manage.py schema_manifest --emit neon.json --label neon-branch \
        --dsn-env NEON_DATABASE_URL

Diff two manifests (baseline treated as canonical); non-zero exit on failure::

    python manage.py schema_manifest --diff canonical.json candidate.json \
        --report diff.json

Diff a set against one baseline (fresh vs migrated vs neon vs production)::

    python manage.py schema_manifest --matrix fresh.json migrated.json neon.json \
        --report matrix.json

Verify a single manifest for intrinsic violations (unvalidated FK/check,
missing required indexes)::

    python manage.py schema_manifest --verify neon.json \
        --required-index idx_applications_status

Regenerate ``00_full_schema.sql`` from a *verified canonical* database only -
refuses unless the manifest verifies clean AND ``--i-verified-canonical`` is
supplied (R15 / task 3.1: "regenerate only from a verified canonical DB")::

    python manage.py schema_manifest --regenerate-full-schema \
        --from-manifest canonical.json --i-verified-canonical

Exit status: 0 = ok, 1 = failure-severity difference(s) or refused regeneration.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from apps.common.canonical_assignment import run_invariants
from apps.common.schema_manifest import (
    build_manifest_from_connection,
    diff_manifests,
    introspect_postgres,
    verify_manifest,
)

# Presence probe for the task 3.2 canonical-assignment remediation objects
# (the exception ledger + the quarantine flag). Postgres-only; the Django
# non-Postgres path uses introspection instead. Returns two booleans.
_CANONICAL_ASSIGNMENT_PRESENCE_SQL = """
SELECT
    to_regclass('canonical_assignment_exceptions') IS NOT NULL AS ledger_present,
    EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'applications'
          AND column_name = 'assignment_quarantined'
    ) AS quarantine_column_present
"""


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=False, default=str))


def _load_json(path: Path) -> dict:
    if not path.exists():
        raise CommandError(f"manifest not found: {path}")
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise CommandError(f"invalid manifest JSON {path}: {exc}") from exc


def _dsn_identity(dsn: str) -> str:
    """Return a non-secret ``host=... db=...`` identity from a DSN."""
    parts = urlsplit(dsn)
    host = parts.hostname or "unknown"
    db = (parts.path or "").lstrip("/") or "unknown"
    return f"host={host} db={db}"


class Command(BaseCommand):
    help = (
        "Introspect a live database into a machine-readable schema manifest, "
        "diff manifests (fresh/migrated/Neon/production), and verify intrinsic "
        "invariants. Replaces the static hand-maintained schema lists."
    )

    def add_arguments(self, parser):
        parser.add_argument("--emit", metavar="PATH",
                            help="Introspect a DB and write the manifest JSON to PATH.")
        parser.add_argument("--label", default="",
                            help="Manifest label (e.g. fresh-empty, migrated-snapshot, "
                                 "neon-branch, production).")
        parser.add_argument("--dsn-env", metavar="VARNAME",
                            help="Read a read-only Postgres DSN from this env var instead "
                                 "of using the Django connection. The DSN is never logged.")
        parser.add_argument("--diff", nargs=2, metavar=("BASELINE", "CANDIDATE"),
                            help="Diff CANDIDATE against canonical BASELINE.")
        parser.add_argument("--matrix", nargs="+", metavar="MANIFEST",
                            help="Diff every manifest after the first against the first "
                                 "(the canonical baseline).")
        parser.add_argument("--verify", metavar="PATH",
                            help="Verify a single manifest for intrinsic violations.")
        parser.add_argument("--required-index", action="append", default=[],
                            metavar="NAME",
                            help="Required index name for --verify (repeatable).")
        parser.add_argument("--report", metavar="PATH",
                            help="Write the diff/verify report JSON to PATH.")
        parser.add_argument("--regenerate-full-schema", action="store_true",
                            help="Regenerate 00_full_schema.sql from a verified canonical DB.")
        parser.add_argument("--from-manifest", metavar="PATH",
                            help="Canonical manifest used to gate --regenerate-full-schema.")
        parser.add_argument("--i-verified-canonical", action="store_true",
                            help="Operator attestation that --from-manifest is canonical.")
        parser.add_argument("--verify-canonical-assignment", action="store_true",
                            help="Run the task 3.2 canonical-assignment post-state DATA "
                                 "invariants (apps.common.canonical_assignment.run_invariants) "
                                 "against a live DB (the Django connection, or a read-only "
                                 "--dsn-env DSN). Non-zero exit if any invariant count is "
                                 "non-zero. Schema-shape validation (CHECK/FK validated) "
                                 "stays with --verify against an emitted manifest.")
        parser.add_argument("--require-applied", action="store_true",
                            help="With --verify-canonical-assignment, FAIL (not skip) when the "
                                 "task 3.2 remediation objects are absent — use in a post-apply "
                                 "release gate that expects the remediation to already be live.")

    # -- dispatch -----------------------------------------------------------

    def handle(self, *args, **options):
        if options["emit"]:
            return self._emit(options)
        if options["diff"]:
            return self._diff(options["diff"][0], options["diff"][1], options.get("report"))
        if options["matrix"]:
            return self._matrix(options["matrix"], options.get("report"))
        if options["verify"]:
            return self._verify(options["verify"], options["required_index"],
                                options.get("report"))
        if options.get("verify_canonical_assignment"):
            return self._verify_canonical_assignment(options)
        if options["regenerate_full_schema"]:
            return self._regenerate(options)
        raise CommandError(
            "no mode selected; pass one of --emit / --diff / --matrix / --verify / "
            "--verify-canonical-assignment / --regenerate-full-schema"
        )

    # -- emit ---------------------------------------------------------------

    def _emit(self, options):
        label = options["label"]
        dsn_env = options.get("dsn_env")
        if dsn_env:
            dsn = os.environ.get(dsn_env)
            if not dsn:
                raise CommandError(f"env var {dsn_env} is empty or unset")
            manifest = self._introspect_via_dsn(dsn, label)
        else:
            manifest = build_manifest_from_connection(connection, label=label)
        path = Path(options["emit"])
        _write_json(path, manifest)
        meta = manifest["meta"]
        self.stdout.write(self.style.SUCCESS(
            f"Wrote manifest '{label or '(unlabelled)'}' -> {path} "
            f"(vendor={meta['vendor']} reduced={meta['reduced']} "
            f"tables={len(manifest['tables'])} fingerprint={meta['schema_fingerprint']})"
        ))

    def _introspect_via_dsn(self, dsn: str, label: str) -> dict:
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
                return introspect_postgres(
                    cursor, label=label, environment_identity=_dsn_identity(dsn)
                )
        finally:
            conn.close()

    # -- diff / matrix ------------------------------------------------------

    def _diff(self, baseline_path, candidate_path, report_path):
        baseline = _load_json(Path(baseline_path))
        candidate = _load_json(Path(candidate_path))
        report = diff_manifests(baseline, candidate)
        self._print_report(report)
        if report_path:
            _write_json(Path(report_path), report.to_dict())
            self.stdout.write(f"Report written to {report_path}")
        if not report.ok:
            sys.exit(1)

    def _matrix(self, manifest_paths, report_path):
        if len(manifest_paths) < 2:
            raise CommandError("--matrix needs a baseline plus at least one candidate")
        baseline = _load_json(Path(manifest_paths[0]))
        combined = {"baseline": manifest_paths[0], "comparisons": [], "ok": True}
        any_fail = False
        for candidate_path in manifest_paths[1:]:
            candidate = _load_json(Path(candidate_path))
            report = diff_manifests(baseline, candidate)
            self.stdout.write(self.style.MIGRATE_HEADING(
                f"\n=== {report.baseline_label} vs {report.candidate_label} "
                f"({candidate_path}) ==="
            ))
            self._print_report(report)
            combined["comparisons"].append({"candidate": candidate_path, **report.to_dict()})
            if not report.ok:
                any_fail = True
        combined["ok"] = not any_fail
        if report_path:
            _write_json(Path(report_path), combined)
            self.stdout.write(f"Matrix report written to {report_path}")
        if any_fail:
            sys.exit(1)

    # -- verify -------------------------------------------------------------

    def _verify(self, manifest_path, required_indexes, report_path):
        manifest = _load_json(Path(manifest_path))
        report = verify_manifest(manifest, required_indexes=required_indexes or None)
        self._print_report(report)
        if report_path:
            _write_json(Path(report_path), report.to_dict())
        if not report.ok:
            sys.exit(1)

    # -- verify canonical-assignment data invariants (task 3.2) -------------

    def _verify_canonical_assignment(self, options):
        """Run the task 3.2 canonical-assignment post-state DATA invariants.

        Reuses ``apps.common.canonical_assignment.run_invariants`` (the same
        contract the SQL scripts implement and the ``inventory.sql`` I8 gate
        checks) against a live database — either the Django connection (CI's
        migrated-snapshot / rehearsal DB) or a read-only ``--dsn-env`` DSN
        (Neon authoring branch, production read-only replica). Every invariant
        count must be zero. Object presence is checked first so the gate is
        meaningful only where the remediation has been applied.
        """
        dsn_env = options.get("dsn_env")
        if dsn_env:
            dsn = os.environ.get(dsn_env)
            if not dsn:
                raise CommandError(f"env var {dsn_env} is empty or unset")
            present, missing, results = self._canonical_gate_via_dsn(dsn)
        else:
            present, missing, results = self._canonical_gate_via_connection()
        self._report_canonical_gate(present, missing, results,
                                    require_applied=options.get("require_applied", False))

    def _canonical_gate_via_connection(self):
        """Presence-check + run invariants against the active Django connection."""
        if connection.vendor == "postgresql":
            with connection.cursor() as cursor:
                cursor.execute(_CANONICAL_ASSIGNMENT_PRESENCE_SQL)
                ledger_present, column_present = cursor.fetchone()
                missing = self._canonical_missing(ledger_present, column_present)
                if missing:
                    return (False, missing, None)
                return (True, [], run_invariants(cursor))
        # Non-Postgres (SQLite fast profile): use Django introspection. The
        # invariant SQL is plain enough to run on SQLite when the objects exist.
        with connection.cursor() as cursor:
            tables = set(connection.introspection.table_names(cursor))
            ledger_present = "canonical_assignment_exceptions" in tables
            column_present = False
            if "applications" in tables:
                column_present = "assignment_quarantined" in {
                    col.name
                    for col in connection.introspection.get_table_description(
                        cursor, "applications"
                    )
                }
            missing = self._canonical_missing(ledger_present, column_present)
            if missing:
                return (False, missing, None)
            return (True, [], run_invariants(cursor))

    def _canonical_gate_via_dsn(self, dsn: str):
        """Presence-check + run invariants against a read-only Postgres DSN."""
        try:
            import psycopg2
        except ImportError as exc:  # pragma: no cover - env-dependent
            raise CommandError("psycopg2 is required for --dsn-env verification") from exc
        conn = psycopg2.connect(dsn)
        try:
            # Force a read-only session so the gate can never mutate a
            # production replica or the Neon authoring branch.
            conn.set_session(readonly=True, autocommit=True)
            with conn.cursor() as cursor:
                cursor.execute(_CANONICAL_ASSIGNMENT_PRESENCE_SQL)
                ledger_present, column_present = cursor.fetchone()
                missing = self._canonical_missing(ledger_present, column_present)
                if missing:
                    return (False, missing, None)
                return (True, [], run_invariants(cursor))
        finally:
            conn.close()

    @staticmethod
    def _canonical_missing(ledger_present, column_present) -> list[str]:
        missing: list[str] = []
        if not ledger_present:
            missing.append("table canonical_assignment_exceptions")
        if not column_present:
            missing.append("column applications.assignment_quarantined")
        return missing

    def _report_canonical_gate(self, present, missing, results, *, require_applied):
        if not present:
            msg = (f"canonical-assignment remediation not applied here "
                   f"(missing: {', '.join(missing)})")
            if require_applied:
                self.stdout.write(self.style.ERROR(f"FAIL  {msg} [--require-applied]"))
                sys.exit(1)
            self.stdout.write(self.style.WARNING(
                f"SKIP  {msg}; task 3.2 expand not applied — data-invariant gate N/A."
            ))
            return
        failed = {name: count for name, count in results.items() if count != 0}
        for name, count in results.items():
            style = self.style.ERROR if count != 0 else self.style.SUCCESS
            self.stdout.write(style(f"  {name} = {count}"))
        if failed:
            self.stdout.write(self.style.ERROR(
                f"DRIFT: {len(failed)} canonical-assignment invariant(s) non-zero "
                f"({', '.join(sorted(failed))}). See the exception ledger / re-run the "
                f"backfill."
            ))
            sys.exit(1)
        self.stdout.write(self.style.SUCCESS(
            "OK: canonical-assignment post-state invariants all zero ("
            + ", ".join(f"{k}={v}" for k, v in results.items()) + ")."
        ))

    # -- regenerate ---------------------------------------------------------

    def _regenerate(self, options):
        from_manifest = options.get("from_manifest")
        if not from_manifest:
            raise CommandError("--regenerate-full-schema requires --from-manifest")
        manifest = _load_json(Path(from_manifest))
        report = verify_manifest(manifest)
        reduced = (manifest.get("meta") or {}).get("reduced")
        if reduced:
            raise CommandError(
                "refusing to regenerate 00_full_schema.sql from a reduced "
                "(non-Postgres) manifest - introspect a real Postgres canonical DB."
            )
        if not report.ok:
            self._print_report(report)
            raise CommandError(
                "refusing to regenerate 00_full_schema.sql: the source manifest is "
                "NOT canonical (intrinsic violations above). Remediate first."
            )
        if not options.get("i_verified_canonical"):
            raise CommandError(
                "refusing to regenerate 00_full_schema.sql without "
                "--i-verified-canonical. The manifest verified clean, but the operator "
                "must attest the database is the canonical source per R15/task 3.1."
            )
        raise CommandError(
            "guard reached: regeneration of 00_full_schema.sql is intentionally an "
            "operator step (pg_dump --schema-only from the attested canonical DB). This "
            "command verifies canonicity but does not overwrite the file automatically."
        )

    # -- shared -------------------------------------------------------------

    def _print_report(self, report):
        for diff in report.warnings:
            self.stdout.write(self.style.WARNING(
                f"WARN  {diff.category}: {diff.object} - {diff.detail}"
            ))
        for diff in report.failures:
            self.stdout.write(self.style.ERROR(
                f"FAIL  {diff.category}: {diff.object} - {diff.detail}"
            ))
        if report.ok:
            self.stdout.write(self.style.SUCCESS(
                f"OK: {report.baseline_label} vs {report.candidate_label} - "
                f"0 failures, {len(report.warnings)} warning(s)."
            ))
        else:
            self.stdout.write(self.style.ERROR(
                f"DRIFT: {len(report.failures)} failure(s), "
                f"{len(report.warnings)} warning(s)."
            ))
