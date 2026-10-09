"""Freshness tests for the generated migration-history report (task 3.6).

These are pure-Python tests over report *fixtures* and the committed evidence
artifact — no database connection, no environment gating, no skips. They run in
every backend profile because the freshness/completeness/secret logic in
``apps.common.migration_history_report`` is DB-free by design.

The suite proves the two things task 3.6 requires of the "freshness test":

1. It **fails when the report is stale** — a June-2026+ migration script exists
   on disk but is absent from the generated report (the exact DATA-09 gap the
   real Neon-authoring-branch report exhibits), plus incomplete-report and
   secret-leak guards.
2. The **committed release evidence artifact is fresh** against the current
   on-disk migration scripts — so adding a June-2026+ migration without
   regenerating ``docs/v2-evidence/3.6/migration-history.release.json`` breaks
   the build.

Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.6
Requirements: R1.5, R15.8
Findings: DATA-09, GOV-05
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from apps.common.migration_history_report import (
    build_report_from_manifest,
    check_report_completeness,
    check_report_freshness,
    find_secret_leaks,
    forward_script_names,
    is_june_2026_or_later,
    render_markdown,
    verify_report,
)

# Repo-root-relative path to the committed release evidence artifact.
# backend/tests/unit/<file> -> parents[3] == repo root.
_REPO_ROOT = Path(__file__).resolve().parents[3]
_RELEASE_REPORT = _REPO_ROOT / "docs/v2-evidence/3.6/migration-history.release.json"


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _manifest(migrations, *, fingerprint="sha256:abc123", identity="host=h db=d"):
    """Build a minimal task-3.1-shaped manifest with the given migration rows."""
    return {
        "meta": {
            "label": "test",
            "generated_at": "2026-07-22T00:00:00+00:00",
            "vendor": "postgresql",
            "server_version": "17.0",
            "schema": "public",
            "environment_identity": identity,
            "reduced": False,
            "schema_fingerprint": fingerprint,
        },
        "migrations": list(migrations),
    }


def _row(name, checksum="a" * 64, applied_at="2026-07-01T00:00:00+00:00"):
    return {"migration_name": name, "checksum": checksum, "applied_at": applied_at}


_PRE_JUNE = "2026_05_18_hot_query_indexes.sql"
_JUNE_A = "2026_06_08_01_multi_tenant_beanola_admissions.sql"
_JUNE_B = "2026_07_19_03_payments_documents_validate.sql"
_ON_DISK = [_PRE_JUNE, _JUNE_A, _JUNE_B]


# ---------------------------------------------------------------------------
# June-2026 boundary classification
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name, expected",
    [
        ("2026_05_31_late_may.sql", False),
        ("2026_06_01_first_june.sql", True),
        ("2026_06_08_01_multi_tenant_beanola_admissions.sql", True),
        ("2026_07_19_03_payments_documents_validate.sql", True),
        ("2026_12_31_year_end.sql", True),
        ("2027_01_01_next_year.sql", True),
        ("2025_12_31_prior_year.sql", False),
        # Undated legacy scripts are pre-June by convention.
        ("lenco_payment_integration.sql", False),
        ("V2_013_PROF_COUNTRY", False),
        ("", False),
        # The deferred drop embeds "2026_08" but does NOT start with a date
        # prefix, so the name rule classifies it as not-June; it is also
        # excluded from the forward-script set entirely (see below).
        ("legacy_columns_drop_2026_08_15.sql", False),
    ],
)
def test_june_2026_boundary(name, expected):
    assert is_june_2026_or_later(name) is expected


# ---------------------------------------------------------------------------
# Fresh report -> no findings
# ---------------------------------------------------------------------------


def test_fresh_report_has_no_findings():
    """A report that records every on-disk forward script verifies clean."""
    manifest = _manifest([_row(_PRE_JUNE), _row(_JUNE_A), _row(_JUNE_B)])
    report = build_report_from_manifest(manifest, forward_scripts=_ON_DISK)
    assert verify_report(report, _ON_DISK) == []
    assert report["june_2026_plus_count"] == 2


# ---------------------------------------------------------------------------
# Stale report -> flagged (the "fails when stale" demonstration)
# ---------------------------------------------------------------------------


def test_stale_report_missing_june_migration_is_flagged():
    """A June-2026+ script on disk with no report entry is a freshness failure.

    This is the exact staleness the real Neon-authoring-branch report exhibits
    (44 rows, zero June+), and the condition that must break the build when a
    migration is added without regenerating the report.
    """
    # Report omits _JUNE_B even though it is on disk.
    manifest = _manifest([_row(_PRE_JUNE), _row(_JUNE_A)])
    report = build_report_from_manifest(manifest)
    findings = check_report_freshness(report, _ON_DISK)
    categories = {f.category for f in findings}
    objects = {f.object for f in findings}
    assert "june_migration_missing_from_report" in categories
    assert _JUNE_B in objects
    # The pre-June omission is NOT flagged — only June-2026+ coverage matters.
    assert _PRE_JUNE not in objects


def test_report_omitting_all_june_migrations_flags_each():
    """A pre-June-only report (the authoring-DB shape) flags every June+ script."""
    manifest = _manifest([_row(_PRE_JUNE)])
    report = build_report_from_manifest(manifest)
    findings = check_report_freshness(report, _ON_DISK)
    flagged = {f.object for f in findings if f.category == "june_migration_missing_from_report"}
    assert flagged == {_JUNE_A, _JUNE_B}


# ---------------------------------------------------------------------------
# Completeness (R15.8 required fields)
# ---------------------------------------------------------------------------


def test_report_missing_fingerprint_is_incomplete():
    manifest = _manifest([_row(_JUNE_A)], fingerprint=None)
    report = build_report_from_manifest(manifest, forward_scripts=[_JUNE_A])
    cats = {f.category for f in check_report_completeness(report)}
    assert "missing_schema_fingerprint" in cats


def test_report_with_non_sha256_fingerprint_is_incomplete():
    manifest = _manifest([_row(_JUNE_A)], fingerprint="deadbeef")
    report = build_report_from_manifest(manifest, forward_scripts=[_JUNE_A])
    cats = {f.category for f in check_report_completeness(report)}
    assert "missing_schema_fingerprint" in cats


def test_report_missing_environment_identity_is_incomplete():
    manifest = _manifest([_row(_JUNE_A)], identity="")
    report = build_report_from_manifest(manifest, forward_scripts=[_JUNE_A])
    cats = {f.category for f in check_report_completeness(report)}
    assert "missing_environment_identity" in cats


def test_june_migration_without_checksum_or_applied_at_is_incomplete():
    manifest = _manifest([_row(_JUNE_A, checksum=None, applied_at=None)])
    report = build_report_from_manifest(manifest, forward_scripts=[_JUNE_A])
    cats = {f.category for f in check_report_completeness(report)}
    assert "missing_checksum" in cats
    assert "missing_applied_at" in cats


def test_pre_june_missing_checksum_is_tolerated():
    """Legacy pre-June rows may lack a checksum (reconciled before checksums)."""
    manifest = _manifest([_row(_PRE_JUNE, checksum=None), _row(_JUNE_A)])
    report = build_report_from_manifest(manifest, forward_scripts=[_PRE_JUNE, _JUNE_A])
    cats = {f.category for f in check_report_completeness(report)}
    assert "missing_checksum" not in cats


# ---------------------------------------------------------------------------
# Secret-leak guardrail
# ---------------------------------------------------------------------------


def test_non_secret_host_identity_is_not_flagged():
    manifest = _manifest(
        [_row(_JUNE_A)],
        identity="host=ep-dawn-unit-ahj08a5x-pooler.c-3.us-east-1.aws.neon.tech db=neondb",
    )
    report = build_report_from_manifest(manifest, forward_scripts=[_JUNE_A])
    assert find_secret_leaks(report) == []


@pytest.mark.parametrize(
    "identity",
    [
        "postgresql://beanola:s3cr3t@ep-dawn.neon.tech/neondb",
        "host=x db=y password=hunter2",
        "host=x db=y sslmode=require",
    ],
)
def test_leaked_secret_in_identity_is_flagged(identity):
    manifest = _manifest([_row(_JUNE_A)], identity=identity)
    report = build_report_from_manifest(manifest, forward_scripts=[_JUNE_A])
    assert any(f.category == "secret_leak" for f in find_secret_leaks(report))


# ---------------------------------------------------------------------------
# Cross-check against a live migration_history snapshot (--against-db)
# ---------------------------------------------------------------------------


def test_recorded_june_migration_absent_from_report_is_flagged():
    manifest = _manifest([_row(_JUNE_A)])
    report = build_report_from_manifest(manifest)
    findings = check_report_freshness(
        report, [_JUNE_A], recorded_names=[_JUNE_A, _JUNE_B]
    )
    cats = {(f.category, f.object) for f in findings}
    assert ("recorded_migration_missing_from_report", _JUNE_B) in cats


def test_report_june_migration_not_recorded_in_db_is_flagged():
    manifest = _manifest([_row(_JUNE_A), _row(_JUNE_B)])
    report = build_report_from_manifest(manifest)
    findings = check_report_freshness(
        report, [_JUNE_A, _JUNE_B], recorded_names=[_JUNE_A]
    )
    cats = {(f.category, f.object) for f in findings}
    assert ("report_migration_not_recorded", _JUNE_B) in cats


# ---------------------------------------------------------------------------
# forward_script_names exclusion contract
# ---------------------------------------------------------------------------


def test_forward_script_names_excludes_snapshot_drop_and_rollbacks():
    names = set(forward_script_names())
    # Snapshot + deferred drop are excluded (never applied / never recorded).
    assert "00_full_schema.sql" not in names
    assert "legacy_columns_drop_2026_08_15.sql" not in names
    # No rollback sibling leaks in.
    assert not any(n.endswith("_rollback.sql") for n in names)
    # The real June+ tenant/canonical scripts ARE present on disk.
    assert "2026_06_08_01_multi_tenant_beanola_admissions.sql" in names
    assert "2026_07_19_03_payments_documents_validate.sql" in names


# ---------------------------------------------------------------------------
# Committed release evidence artifact must stay fresh (the CI staleness guard)
# ---------------------------------------------------------------------------


def test_release_evidence_artifact_exists():
    assert _RELEASE_REPORT.exists(), (
        f"missing committed release report {_RELEASE_REPORT}; regenerate with "
        f"`python manage.py migration_history_report --emit ...`"
    )


def test_committed_release_report_is_fresh_and_complete():
    """The committed release report verifies clean against the CURRENT on-disk
    migration scripts.

    This is the build-breaking guard: add a June-2026+ migration script and
    forget to regenerate ``migration-history.release.json`` and this test fails
    with the offending filename.
    """
    report = json.loads(_RELEASE_REPORT.read_text())
    findings = verify_report(report, forward_script_names())
    assert findings == [], "stale/incomplete release report: " + "; ".join(
        f"{f.category}:{f.object}" for f in findings
    )


def test_committed_release_report_covers_every_june_plus_script_on_disk():
    report = json.loads(_RELEASE_REPORT.read_text())
    report_names = {m["migration_name"] for m in report["migrations"]}
    june_on_disk = [s for s in forward_script_names() if is_june_2026_or_later(s)]
    assert june_on_disk, "expected at least one June 2026+ migration script on disk"
    missing = [s for s in june_on_disk if s not in report_names]
    assert missing == [], f"release report omits June 2026+ scripts: {missing}"


def test_committed_release_report_links_schema_fingerprint_and_identity():
    report = json.loads(_RELEASE_REPORT.read_text())
    assert str(report.get("schema_fingerprint", "")).startswith("sha256:")
    assert report.get("environment", {}).get("identity")
    # Non-secret identity only.
    assert find_secret_leaks(report) == []


def test_render_markdown_includes_fingerprint_and_june_rows():
    report = json.loads(_RELEASE_REPORT.read_text())
    md = render_markdown(report)
    assert report["schema_fingerprint"] in md
    assert "June 2026" in md
    assert "2026_07_19_03_payments_documents_validate.sql" in md
