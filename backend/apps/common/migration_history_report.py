"""Generate a migration-history report from a live database (Admissions V2 task 3.6).

Motivation
----------
Finding **DATA-09** flags that the migration history stopped before the June
2026 tenant migrations and that progress docs carry conflicting completion
claims. The hand-maintained ``backend/scripts/MIGRATION_HISTORY.md`` mirror
(last regenerated 2026-05-25, "40 rows") drifted from every real database.

R15.8 requires: *the migration history report SHALL be generated from the
database, include every June 2026 and later migration, and link the schema
fingerprint used for the release.*

This module produces that report **from the live catalog** rather than by hand.
It builds on task 3.1's :mod:`apps.common.schema_manifest`: the manifest already
introspects ``migration_history`` (ids/checksums/applied_at, design §15.1), the
schema fingerprint (``meta.schema_fingerprint``), and a **non-secret** host/db
environment identity (``meta.environment_identity`` — never a connection string
or password). This module projects those manifest fields into a focused
migration-history report, classifies each row as June-2026-or-later, and pairs
the report with a **freshness** checker.

Freshness (task 3.6 "generated history and freshness test")
-----------------------------------------------------------
A generated report is *stale* when it no longer agrees with reality:

* a June-2026+ forward migration script exists on disk but is absent from the
  report (someone added a migration and forgot to regenerate), or
* (when a live ``migration_history`` snapshot is supplied) a June-2026+ row is
  recorded in the database but missing from the report, or vice versa.

A report is *incomplete* when it omits the schema fingerprint, the environment
identity, or a checksum/applied_at for a June-2026+ migration. A report is
*leaking* when its serialized form contains a connection string or password.

All check functions are **pure** (no DB, no filesystem beyond an explicit script
list) so they run in the V2 CI profile without env gating or skips.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional

REPORT_VERSION = "1"

# A migration is "June 2026 or later" when its ``YYYY_MM`` date prefix is
# 2026-06 or newer. Dated scripts (``YYYY_MM_DD_description.sql``) sort
# chronologically by construction; undated legacy scripts (e.g.
# ``lenco_payment_integration.sql``, ``V2_013_PROF_COUNTRY``) have no date
# prefix and are treated as pre-June by convention.
_DATE_PREFIX_RE = re.compile(r"^(\d{4})_(\d{2})")


def is_june_2026_or_later(migration_name: str) -> bool:
    """Return True when ``migration_name`` has a ``YYYY_MM`` prefix >= 2026-06."""
    if not migration_name:
        return False
    match = _DATE_PREFIX_RE.match(migration_name)
    if not match:
        return False
    year, month = int(match.group(1)), int(match.group(2))
    if year > 2026:
        return True
    return year == 2026 and month >= 6


# ---------------------------------------------------------------------------
# On-disk forward-script enumeration (reuses the apply-runner's exclusion set)
# ---------------------------------------------------------------------------


def forward_script_names(scripts_dir: Optional[Path] = None) -> list[str]:
    """Return the top-level forward-only ``*.sql`` migration script filenames.

    Delegates to :func:`apply_sql_migrations._iter_migration_files` so the
    exclusion contract stays in exactly one place: ``*_rollback.sql`` siblings,
    subdirectories (``applied/``/``archive/``/``migrations/``), and the two
    intentionally-unapplied top-level files (``00_full_schema.sql`` snapshot and
    the future ``legacy_columns_drop_2026_08_15.sql`` drop) are all excluded.
    That means ``legacy_columns_drop_2026_08_15.sql`` — although it carries a
    2026-08 prefix — is correctly NOT required to appear in the history report.
    """
    from apps.common.management.commands.apply_sql_migrations import (
        DEFAULT_MIGRATIONS_DIR,
        _iter_migration_files,
    )

    directory = scripts_dir or DEFAULT_MIGRATIONS_DIR
    return [path.name for path in _iter_migration_files(Path(directory))]


# ---------------------------------------------------------------------------
# Report builder
# ---------------------------------------------------------------------------


def build_report_from_manifest(
    manifest: dict, *, forward_scripts: Optional[Iterable[str]] = None
) -> dict:
    """Project a task-3.1 schema manifest into a migration-history report.

    The manifest is the single source of the migration rows
    (``migration_name``/``checksum``/``applied_at``), the schema fingerprint,
    and the non-secret environment identity — this function never re-queries a
    database, so it is deterministic and testable. Each migration is tagged
    ``june_2026_plus`` and the rows are ordered by applied timestamp then name.

    ``forward_scripts`` (optional) records the on-disk forward-script inventory
    into the report so a reader can see the disk-vs-history relationship at a
    glance; the freshness checker uses the live disk state, not this snapshot.
    """
    meta = manifest.get("meta") or {}
    migrations: list[dict] = []
    for row in manifest.get("migrations") or []:
        name = row.get("migration_name")
        migrations.append(
            {
                "migration_name": name,
                "checksum": row.get("checksum"),
                "applied_at": row.get("applied_at"),
                "june_2026_plus": is_june_2026_or_later(name or ""),
            }
        )
    migrations.sort(key=lambda r: (r["applied_at"] or "", r["migration_name"] or ""))
    june_plus = [m for m in migrations if m["june_2026_plus"]]

    report = {
        "report_version": REPORT_VERSION,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "database-introspection (apps.common.schema_manifest)",
        "environment": {
            "label": meta.get("label", ""),
            # Non-secret host/db identity only (design §15.1, R17.2). Never a
            # connection string, user, or password.
            "identity": meta.get("environment_identity", ""),
            "vendor": meta.get("vendor"),
            "server_version": meta.get("server_version"),
            "schema": meta.get("schema"),
            "reduced": meta.get("reduced", False),
        },
        # Links the exact task-3.1 manifest fingerprint of the schema this
        # history describes (R15.8 "link the schema fingerprint used for the
        # release").
        "schema_fingerprint": meta.get("schema_fingerprint"),
        "manifest_generated_at": meta.get("generated_at"),
        "migration_count": len(migrations),
        "june_2026_plus_count": len(june_plus),
        "migrations": migrations,
    }
    if forward_scripts is not None:
        scripts = sorted(forward_scripts)
        report["forward_scripts_on_disk"] = scripts
        report["june_2026_plus_on_disk"] = [
            s for s in scripts if is_june_2026_or_later(s)
        ]
    return report


def build_report_from_connection(
    connection, *, label: str = "", forward_scripts: Optional[Iterable[str]] = None
) -> dict:
    """Introspect a Django ``connection`` and build a migration-history report."""
    from apps.common.schema_manifest import build_manifest_from_connection

    manifest = build_manifest_from_connection(connection, label=label)
    return build_report_from_manifest(manifest, forward_scripts=forward_scripts)


# ---------------------------------------------------------------------------
# Findings + freshness / completeness / secret checks (pure)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Finding:
    """A single freshness / completeness / secret finding."""

    category: str
    object: str
    detail: str

    def to_dict(self) -> dict[str, str]:
        return {"category": self.category, "object": self.object, "detail": self.detail}


def check_report_freshness(
    report: dict,
    forward_scripts: Iterable[str],
    *,
    recorded_names: Optional[Iterable[str]] = None,
) -> list[Finding]:
    """Return staleness findings comparing ``report`` to on-disk scripts (+ DB).

    Rule 1 (always): every June-2026+ forward migration **script on disk** must
    appear in the report. A script present on disk with no report entry means
    the report was not regenerated after the migration was added → stale.

    Rule 2 (when ``recorded_names`` is supplied — the live
    ``migration_history`` names): every June-2026+ row recorded in the database
    must appear in the report, and every June-2026+ report row must be recorded
    in the database. This catches a report generated against a different or
    older database state.
    """
    findings: list[Finding] = []
    report_names = {
        m.get("migration_name") for m in report.get("migrations", []) if m.get("migration_name")
    }

    for script in sorted(set(forward_scripts)):
        if is_june_2026_or_later(script) and script not in report_names:
            findings.append(
                Finding(
                    "june_migration_missing_from_report",
                    script,
                    "June 2026+ migration script exists on disk but is absent "
                    "from the generated report (regenerate the report)",
                )
            )

    if recorded_names is not None:
        recorded = {n for n in recorded_names if n}
        for name in sorted(recorded - report_names):
            if is_june_2026_or_later(name):
                findings.append(
                    Finding(
                        "recorded_migration_missing_from_report",
                        name,
                        "migration recorded in migration_history but absent from "
                        "the generated report",
                    )
                )
        for name in sorted(report_names - recorded):
            if is_june_2026_or_later(name):
                findings.append(
                    Finding(
                        "report_migration_not_recorded",
                        name,
                        "June 2026+ migration in the report is not present in the "
                        "live migration_history table",
                    )
                )
    return findings


def check_report_completeness(report: dict) -> list[Finding]:
    """Return findings when the report omits fields R15.8 requires.

    Requires a ``sha256:`` schema fingerprint, a non-empty environment identity,
    and — for every June-2026+ migration — a checksum and an applied_at
    timestamp. (Pre-June legacy rows are exempt from the checksum requirement
    because several were reconciled before ``apply_sql_migrations`` recorded
    checksums.)
    """
    findings: list[Finding] = []

    fingerprint = report.get("schema_fingerprint")
    if not fingerprint or not str(fingerprint).startswith("sha256:"):
        findings.append(
            Finding(
                "missing_schema_fingerprint",
                "schema_fingerprint",
                f"report must link a sha256 schema fingerprint; got {fingerprint!r}",
            )
        )

    identity = (report.get("environment") or {}).get("identity")
    if not identity:
        findings.append(
            Finding(
                "missing_environment_identity",
                "environment.identity",
                "report must record a non-secret host/db environment identity",
            )
        )

    for migration in report.get("migrations", []):
        if not migration.get("june_2026_plus"):
            continue
        name = migration.get("migration_name") or "(unnamed)"
        if not migration.get("checksum"):
            findings.append(
                Finding("missing_checksum", name, "June 2026+ migration has no checksum")
            )
        if not migration.get("applied_at"):
            findings.append(
                Finding(
                    "missing_applied_at", name, "June 2026+ migration has no applied_at timestamp"
                )
            )
    return findings


# Secret-leak guardrail. The environment identity is meant to be a non-secret
# ``host=... db=...`` string; these patterns catch an accidental raw DSN,
# embedded credentials, or a password field.
_SECRET_PATTERNS: tuple[tuple[re.Pattern, str], ...] = (
    (re.compile(r"://[^/\s:@]+:[^/\s@]+@"), "credentials embedded in a connection URL"),
    (re.compile(r"(?i)\bpassword\s*[=:]\s*\S"), "password field"),
    (re.compile(r"(?i)\bPGPASSWORD\b"), "PGPASSWORD"),
    (re.compile(r"(?i)sslmode\s*="), "raw DSN query string (sslmode=)"),
    (re.compile(r"(?i)secret[_-]?key"), "secret key"),
)


def find_secret_leaks(report: dict) -> list[Finding]:
    """Return findings when the serialized report appears to contain a secret."""
    blob = json.dumps(report, default=str)
    findings: list[Finding] = []
    for pattern, label in _SECRET_PATTERNS:
        if pattern.search(blob):
            findings.append(
                Finding("secret_leak", label, f"report appears to contain a secret: {label}")
            )
    return findings


def verify_report(
    report: dict,
    forward_scripts: Iterable[str],
    *,
    recorded_names: Optional[Iterable[str]] = None,
) -> list[Finding]:
    """Run freshness + completeness + secret checks and return all findings."""
    findings: list[Finding] = []
    findings.extend(find_secret_leaks(report))
    findings.extend(check_report_completeness(report))
    findings.extend(check_report_freshness(report, forward_scripts, recorded_names=recorded_names))
    return findings


# ---------------------------------------------------------------------------
# Human-readable markdown mirror
# ---------------------------------------------------------------------------


def render_markdown(report: dict) -> str:
    """Render a generated migration-history report as a human-readable table."""
    env = report.get("environment") or {}
    lines: list[str] = []
    lines.append("# Migration History (generated from the database)")
    lines.append("")
    lines.append(
        "> Generated by `python manage.py migration_history_report` "
        "(`apps.common.migration_history_report`). Do not hand-edit — "
        "regenerate from a real database."
    )
    lines.append("")
    lines.append(f"- **Environment label:** {env.get('label') or '(unlabelled)'}")
    lines.append(f"- **Environment identity:** `{env.get('identity') or '(none)'}`")
    lines.append(
        f"- **Vendor / server:** {env.get('vendor')} {env.get('server_version') or ''}".rstrip()
    )
    lines.append(f"- **Schema fingerprint:** `{report.get('schema_fingerprint')}`")
    lines.append(f"- **Generated at:** {report.get('generated_at')}")
    lines.append(
        f"- **Total migrations:** {report.get('migration_count')} "
        f"(**{report.get('june_2026_plus_count')}** are June 2026 or later)"
    )
    lines.append("")
    lines.append("| Migration | June 2026+ | Checksum (sha256) | Applied (UTC) |")
    lines.append("| --- | :---: | --- | --- |")
    for migration in report.get("migrations", []):
        checksum = migration.get("checksum")
        checksum_display = f"`{checksum[:16]}…`" if checksum else "—"
        marker = "✅" if migration.get("june_2026_plus") else ""
        lines.append(
            f"| `{migration.get('migration_name')}` | {marker} | "
            f"{checksum_display} | {migration.get('applied_at') or '—'} |"
        )
    lines.append("")
    return "\n".join(lines)
