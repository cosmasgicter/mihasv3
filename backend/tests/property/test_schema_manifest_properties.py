"""Property-based invariants for the schema manifest diff engine (task 3.1).

These properties exercise the pure diff/verify/fingerprint functions across
many generated manifests. They are DB-free, so they run without env gating or
skips in every CI profile (the Postgres-specific *introspection* is covered
separately in ``tests/unit/test_schema_manifest_introspection.py`` with the
repo's ``skipif(vendor != 'postgresql')`` convention).

Properties:

* P1 reflexivity      - a manifest diffed against itself has zero failures.
* P2 fingerprint      - deterministic and invariant under column/index reorder.
* P3 missing index    - dropping any index from the candidate is a failure.
* P4 unvalidated FK   - marking any FK NOT VALID is a failure (diff and verify).
* P5 extra column     - adding any column to the candidate is a failure.

Spec: .kiro/specs/admissions-v2-canonical-rebuild/ task 3.1
Requirements: R15.2, R15.3, R15.4
"""

from __future__ import annotations

import copy

from hypothesis import given, settings
from hypothesis import strategies as st

from apps.common.schema_manifest import (
    compute_fingerprint,
    diff_manifests,
    verify_manifest,
)

_IDENT = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz_", min_size=3, max_size=12
).filter(lambda s: not s.startswith("_") and not s.endswith("_"))

_TYPES = st.sampled_from([
    "uuid", "text", "integer", "boolean", "timestamp with time zone",
    "character varying(30)", "numeric(10,2)", "jsonb",
])


@st.composite
def _table_spec(draw, table_name: str):
    column_names = draw(st.lists(_IDENT, min_size=1, max_size=5, unique=True))
    columns = []
    for i, name in enumerate(column_names):
        columns.append({
            "name": name,
            "ordinal": i + 1,
            "type": draw(_TYPES),
            "nullable": draw(st.booleans()),
            "default": None,
        })
    # 0..2 indexes over existing columns.
    index_cols = draw(st.lists(st.sampled_from(column_names), min_size=0,
                               max_size=min(2, len(column_names)), unique=True))
    indexes = []
    for col in index_cols:
        idx_name = f"idx_{table_name}_{col}"
        indexes.append({
            "name": idx_name, "unique": False, "primary": False,
            "method": "btree", "predicate": None,
            "definition": f"CREATE INDEX {idx_name} ON {table_name} "
                          f"USING btree ({col})",
        })
    return {
        "columns": columns,
        "primary_key": [{"name": f"{table_name}_pkey",
                         "definition": f"PRIMARY KEY ({column_names[0]})"}],
        "foreign_keys": [],
        "unique_constraints": [],
        "check_constraints": [],
        "exclusion_constraints": [],
        "indexes": indexes,
        "triggers": [],
    }


@st.composite
def _manifest(draw):
    table_names = draw(st.lists(_IDENT, min_size=1, max_size=4, unique=True))
    tables = {}
    for name in table_names:
        tables[name] = draw(_table_spec(name))
    # Wire up to two validated FKs between generated tables.
    if len(table_names) >= 2:
        for _ in range(draw(st.integers(min_value=0, max_value=2))):
            src = draw(st.sampled_from(table_names))
            dst = draw(st.sampled_from(table_names))
            col = tables[src]["columns"][0]["name"]
            fk_name = f"{src}_{col}_fkey_{draw(st.integers(0, 9999))}"
            tables[src]["foreign_keys"].append({
                "name": fk_name,
                "definition": f"FOREIGN KEY ({col}) REFERENCES {dst}(id)",
                "ref_table": dst,
                "validated": True,
            })
    manifest = {
        "manifest_version": "1",
        "meta": {"label": "generated", "vendor": "postgresql", "reduced": False},
        "extensions": draw(st.lists(
            st.builds(lambda n: {"name": n, "version": "1.0"}, _IDENT),
            min_size=0, max_size=3, unique_by=lambda e: e["name"],
        )),
        "tables": tables,
        "migrations": [],
    }
    manifest["meta"]["schema_fingerprint"] = compute_fingerprint(manifest)
    return manifest


@settings(max_examples=40, deadline=2000)
@given(manifest=_manifest())
def test_p1_manifest_diffed_against_itself_has_no_failures(manifest):
    report = diff_manifests(manifest, copy.deepcopy(manifest))
    assert report.ok, [d.to_dict() for d in report.failures]


@settings(max_examples=40, deadline=2000)
@given(manifest=_manifest())
def test_p2_fingerprint_deterministic_and_reorder_invariant(manifest):
    fp = compute_fingerprint(manifest)
    shuffled = copy.deepcopy(manifest)
    for spec in shuffled["tables"].values():
        spec["columns"].reverse()
        spec["indexes"].reverse()
    shuffled["extensions"].reverse()
    assert compute_fingerprint(shuffled) == fp


@settings(max_examples=40, deadline=2000)
@given(data=st.data(), manifest=_manifest())
def test_p3_dropping_any_index_is_a_failure(data, manifest):
    indexed = [(t, idx["name"]) for t, spec in manifest["tables"].items()
               for idx in spec["indexes"]]
    if not indexed:
        return  # nothing to drop for this example
    table, index_name = data.draw(st.sampled_from(indexed))
    candidate = copy.deepcopy(manifest)
    candidate["tables"][table]["indexes"] = [
        i for i in candidate["tables"][table]["indexes"] if i["name"] != index_name
    ]
    report = diff_manifests(manifest, candidate)
    assert not report.ok
    assert any(d.category == "missing_index" and d.object == f"{table}.{index_name}"
               for d in report.failures)


@settings(max_examples=40, deadline=2000)
@given(data=st.data(), manifest=_manifest())
def test_p4_unvalidated_fk_is_a_failure(data, manifest):
    fks = [(t, i) for t, spec in manifest["tables"].items()
           for i, _ in enumerate(spec["foreign_keys"])]
    if not fks:
        return
    table, idx = data.draw(st.sampled_from(fks))
    candidate = copy.deepcopy(manifest)
    candidate["tables"][table]["foreign_keys"][idx]["validated"] = False
    diff_report = diff_manifests(manifest, candidate)
    verify_report = verify_manifest(candidate)
    assert not diff_report.ok
    assert not verify_report.ok
    assert any(d.category == "unvalidated_foreign_key" for d in verify_report.failures)


@settings(max_examples=40, deadline=2000)
@given(data=st.data(), manifest=_manifest())
def test_p5_extra_column_is_a_failure(data, manifest):
    table = data.draw(st.sampled_from(list(manifest["tables"].keys())))
    candidate = copy.deepcopy(manifest)
    candidate["tables"][table]["columns"].append(
        {"name": "zzz_unexpected", "ordinal": 999, "type": "text",
         "nullable": True, "default": None}
    )
    report = diff_manifests(manifest, candidate)
    assert not report.ok
    assert any(d.category == "extra_column" and d.object == f"{table}.zzz_unexpected"
               for d in report.failures)
