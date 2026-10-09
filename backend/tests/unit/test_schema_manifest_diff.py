"""Regression tests for the schema manifest diff/verify engine (task 3.1).

These are pure-Python tests over manifest *fixtures* - no database connection,
no environment gating, no skips. They run in every backend profile (SQLite fast
suite and Postgres) because the diff/verify logic is DB-free by design.

Intentional-drift fixtures prove the three failure modes the task names
explicitly:

* missing required index  -> failure
* unvalidated foreign key -> failure
* unexpected column       -> failure

plus the supporting invariants (missing table/column, changed column, changed
FK, migration checksum drift, missing extension) and the "no drift -> ok"
baseline.

Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.1
Requirements: R15.2, R15.3, R15.4
Findings: DATA-07, DATA-08, DATA-09
"""

from __future__ import annotations

import copy

import pytest

from apps.common.schema_manifest import (
    compute_fingerprint,
    diff_manifests,
    verify_manifest,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _canonical_manifest() -> dict:
    """A small but structurally complete canonical manifest."""
    manifest = {
        "manifest_version": "1",
        "meta": {"label": "canonical", "vendor": "postgresql", "reduced": False},
        "extensions": [
            {"name": "pgcrypto", "version": "1.3"},
            {"name": "uuid-ossp", "version": "1.1"},
        ],
        "tables": {
            "applications": {
                "columns": [
                    {"name": "id", "ordinal": 1, "type": "uuid",
                     "nullable": False, "default": None},
                    {"name": "status", "ordinal": 2, "type": "character varying(30)",
                     "nullable": False, "default": "'draft'::character varying"},
                    {"name": "canonical_program_id", "ordinal": 3, "type": "uuid",
                     "nullable": True, "default": None},
                ],
                "primary_key": [
                    {"name": "applications_pkey", "definition": "PRIMARY KEY (id)"},
                ],
                "foreign_keys": [
                    {
                        "name": "applications_canonical_program_id_fkey",
                        "definition": "FOREIGN KEY (canonical_program_id) "
                                      "REFERENCES canonical_programs(id)",
                        "ref_table": "canonical_programs",
                        "validated": True,
                    },
                ],
                "unique_constraints": [],
                "check_constraints": [
                    {"name": "applications_status_check",
                     "definition": "CHECK (status <> ''::text)", "validated": True},
                ],
                "exclusion_constraints": [],
                "indexes": [
                    {"name": "applications_pkey", "unique": True, "primary": True,
                     "method": "btree", "predicate": None,
                     "definition": "CREATE UNIQUE INDEX applications_pkey ON "
                                   "applications USING btree (id)"},
                    {"name": "idx_applications_status", "unique": False,
                     "primary": False, "method": "btree", "predicate": None,
                     "definition": "CREATE INDEX idx_applications_status ON "
                                   "applications USING btree (status)"},
                ],
                "triggers": [],
            },
            "canonical_programs": {
                "columns": [
                    {"name": "id", "ordinal": 1, "type": "uuid",
                     "nullable": False, "default": None},
                ],
                "primary_key": [
                    {"name": "canonical_programs_pkey", "definition": "PRIMARY KEY (id)"},
                ],
                "foreign_keys": [],
                "unique_constraints": [],
                "check_constraints": [],
                "exclusion_constraints": [],
                "indexes": [
                    {"name": "canonical_programs_pkey", "unique": True, "primary": True,
                     "method": "btree", "predicate": None,
                     "definition": "CREATE UNIQUE INDEX canonical_programs_pkey ON "
                                   "canonical_programs USING btree (id)"},
                ],
                "triggers": [],
            },
        },
        "migrations": [
            {"migration_name": "2026_06_08_01_multi_tenant", "checksum": "abc123",
             "applied_at": "2026-06-08T00:00:00+00:00"},
        ],
    }
    manifest["meta"]["schema_fingerprint"] = compute_fingerprint(manifest)
    return manifest


# ---------------------------------------------------------------------------
# Baseline: no drift
# ---------------------------------------------------------------------------


def test_identical_manifests_have_zero_failures():
    baseline = _canonical_manifest()
    candidate = copy.deepcopy(baseline)
    # applied_at differs across environments; the diff must ignore it.
    candidate["migrations"][0]["applied_at"] = "2026-07-01T12:00:00+00:00"
    report = diff_manifests(baseline, candidate)
    assert report.ok, [d.to_dict() for d in report.failures]
    assert report.failures == []


# ---------------------------------------------------------------------------
# Named failure mode 1: missing index -> failure
# ---------------------------------------------------------------------------


def test_missing_index_is_a_failure():
    baseline = _canonical_manifest()
    candidate = copy.deepcopy(baseline)
    candidate["tables"]["applications"]["indexes"] = [
        idx for idx in candidate["tables"]["applications"]["indexes"]
        if idx["name"] != "idx_applications_status"
    ]
    report = diff_manifests(baseline, candidate)
    assert not report.ok
    categories = {d.category for d in report.failures}
    assert "missing_index" in categories
    objs = {d.object for d in report.failures if d.category == "missing_index"}
    assert "applications.idx_applications_status" in objs


def test_missing_required_index_flagged_by_verify():
    manifest = _canonical_manifest()
    report = verify_manifest(manifest, required_indexes=["idx_applications_submitted_at"])
    assert not report.ok
    assert any(d.category == "missing_required_index" for d in report.failures)


def test_present_required_index_passes_verify():
    manifest = _canonical_manifest()
    report = verify_manifest(manifest, required_indexes=["idx_applications_status"])
    assert report.ok


# ---------------------------------------------------------------------------
# Named failure mode 2: unvalidated FK -> failure
# ---------------------------------------------------------------------------


def test_unvalidated_fk_is_a_failure_in_diff():
    baseline = _canonical_manifest()
    candidate = copy.deepcopy(baseline)
    candidate["tables"]["applications"]["foreign_keys"][0]["validated"] = False
    report = diff_manifests(baseline, candidate)
    assert not report.ok
    assert any(d.category == "unvalidated_foreign_key" for d in report.failures)


def test_unvalidated_fk_is_a_failure_in_verify():
    manifest = _canonical_manifest()
    manifest["tables"]["applications"]["foreign_keys"][0]["validated"] = False
    report = verify_manifest(manifest)
    assert not report.ok
    assert any(d.category == "unvalidated_foreign_key" for d in report.failures)


def test_unvalidated_check_constraint_is_a_failure():
    manifest = _canonical_manifest()
    manifest["tables"]["applications"]["check_constraints"][0]["validated"] = False
    report = verify_manifest(manifest)
    assert not report.ok
    assert any(d.category == "unvalidated_check_constraint" for d in report.failures)


# ---------------------------------------------------------------------------
# Named failure mode 3: unexpected column -> failure
# ---------------------------------------------------------------------------


def test_unexpected_column_is_a_failure():
    baseline = _canonical_manifest()
    candidate = copy.deepcopy(baseline)
    candidate["tables"]["applications"]["columns"].append(
        {"name": "legacy_scratch", "ordinal": 99, "type": "text",
         "nullable": True, "default": None}
    )
    report = diff_manifests(baseline, candidate)
    assert not report.ok
    assert any(d.category == "extra_column" and d.object == "applications.legacy_scratch"
               for d in report.failures)


# ---------------------------------------------------------------------------
# Supporting invariants
# ---------------------------------------------------------------------------


def test_missing_table_is_a_failure():
    baseline = _canonical_manifest()
    candidate = copy.deepcopy(baseline)
    del candidate["tables"]["canonical_programs"]
    report = diff_manifests(baseline, candidate)
    assert any(d.category == "missing_table" and d.object == "canonical_programs"
               for d in report.failures)


def test_missing_column_is_a_failure():
    baseline = _canonical_manifest()
    candidate = copy.deepcopy(baseline)
    candidate["tables"]["applications"]["columns"] = [
        c for c in candidate["tables"]["applications"]["columns"]
        if c["name"] != "canonical_program_id"
    ]
    report = diff_manifests(baseline, candidate)
    assert any(d.category == "missing_column"
               and d.object == "applications.canonical_program_id"
               for d in report.failures)


def test_column_type_change_is_a_failure():
    baseline = _canonical_manifest()
    candidate = copy.deepcopy(baseline)
    candidate["tables"]["applications"]["columns"][1]["type"] = "text"
    report = diff_manifests(baseline, candidate)
    assert any(d.category == "column_changed" and d.object == "applications.status"
               for d in report.failures)


def test_column_nullability_change_is_a_failure():
    baseline = _canonical_manifest()
    candidate = copy.deepcopy(baseline)
    candidate["tables"]["applications"]["columns"][1]["nullable"] = True
    report = diff_manifests(baseline, candidate)
    assert any(d.category == "column_changed" for d in report.failures)


def test_changed_foreign_key_is_a_failure():
    baseline = _canonical_manifest()
    candidate = copy.deepcopy(baseline)
    candidate["tables"]["applications"]["foreign_keys"][0]["definition"] = (
        "FOREIGN KEY (canonical_program_id) REFERENCES programs(id)"
    )
    report = diff_manifests(baseline, candidate)
    assert any(d.category == "foreign_key_changed" for d in report.failures)


def test_migration_checksum_drift_is_a_failure():
    baseline = _canonical_manifest()
    candidate = copy.deepcopy(baseline)
    candidate["migrations"][0]["checksum"] = "deadbeef"
    report = diff_manifests(baseline, candidate)
    assert any(d.category == "migration_checksum_changed" for d in report.failures)


def test_missing_migration_is_a_failure():
    baseline = _canonical_manifest()
    candidate = copy.deepcopy(baseline)
    candidate["migrations"] = []
    report = diff_manifests(baseline, candidate)
    assert any(d.category == "missing_migration" for d in report.failures)


def test_missing_extension_is_a_failure():
    baseline = _canonical_manifest()
    candidate = copy.deepcopy(baseline)
    candidate["extensions"] = [e for e in candidate["extensions"] if e["name"] != "pgcrypto"]
    report = diff_manifests(baseline, candidate)
    assert any(d.category == "missing_extension" and d.object == "pgcrypto"
               for d in report.failures)


# ---------------------------------------------------------------------------
# Warnings do not fail the gate
# ---------------------------------------------------------------------------


def test_extra_index_is_a_warning_not_a_failure():
    baseline = _canonical_manifest()
    candidate = copy.deepcopy(baseline)
    candidate["tables"]["applications"]["indexes"].append(
        {"name": "idx_applications_created_at", "unique": False, "primary": False,
         "method": "btree", "predicate": None,
         "definition": "CREATE INDEX idx_applications_created_at ON applications "
                       "USING btree (created_at)"}
    )
    report = diff_manifests(baseline, candidate)
    assert report.ok  # extra index is a warning, not a failure
    assert any(d.category == "extra_index" for d in report.warnings)


def test_extension_version_drift_is_a_warning():
    baseline = _canonical_manifest()
    candidate = copy.deepcopy(baseline)
    candidate["extensions"][0]["version"] = "1.99"
    report = diff_manifests(baseline, candidate)
    assert report.ok
    assert any(d.category == "extension_version_changed" for d in report.warnings)


# ---------------------------------------------------------------------------
# Fingerprint behaviour
# ---------------------------------------------------------------------------


def test_fingerprint_is_deterministic_and_order_independent():
    manifest = _canonical_manifest()
    fp1 = compute_fingerprint(manifest)
    reordered = copy.deepcopy(manifest)
    reordered["tables"]["applications"]["indexes"].reverse()
    reordered["extensions"].reverse()
    fp2 = compute_fingerprint(reordered)
    assert fp1 == fp2
    assert fp1.startswith("sha256:")


def test_fingerprint_changes_when_schema_shape_changes():
    manifest = _canonical_manifest()
    fp1 = compute_fingerprint(manifest)
    mutated = copy.deepcopy(manifest)
    mutated["tables"]["applications"]["columns"].append(
        {"name": "new_col", "ordinal": 50, "type": "text", "nullable": True, "default": None}
    )
    assert compute_fingerprint(mutated) != fp1


def test_fingerprint_ignores_applied_at_and_extension_version():
    manifest = _canonical_manifest()
    fp1 = compute_fingerprint(manifest)
    drifted = copy.deepcopy(manifest)
    drifted["migrations"][0]["applied_at"] = "2099-01-01T00:00:00+00:00"
    drifted["extensions"][0]["version"] = "9.9"
    assert compute_fingerprint(drifted) == fp1


def test_report_to_dict_shape():
    baseline = _canonical_manifest()
    candidate = copy.deepcopy(baseline)
    del candidate["tables"]["canonical_programs"]
    report = diff_manifests(baseline, candidate)
    payload = report.to_dict()
    assert payload["ok"] is False
    assert payload["failure_count"] >= 1
    assert isinstance(payload["differences"], list)
    assert {"category", "object", "detail", "severity"} <= set(payload["differences"][0])


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__, "-q"]))
