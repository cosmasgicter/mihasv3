"""Pure-logic core for the Admissions V2 version + API-major drift guard.

This module is the **pure, deterministic** decision layer behind task 1.2 of the
``admissions-v2-canonical-rebuild`` spec (Requirement R2 — Platform Identity,
Release Version, And Compatibility). Like the other ``launch-verification``
evaluators (``smoke_eval``, ``operational_eval``, ``migration_eval`` …) it
performs **no** I/O: it imports no Django, reads no environment, opens no files,
and makes no network calls. It only evaluates predicates over
already-collected **version facts** passed in as plain data.

Keeping the decision core I/O-free means:

* the collector that reads real files / Django settings
  (``backend/scripts/generate_version_manifest.py``) can call it,
* CI can call it,
* and the drift-guard unit test can drive it with synthetic facts to prove it
  **fails** when a source drifts — without perturbing any real file.

The rules it encodes come straight from Requirement R2:

* **R2.1 — every maintained product-version source reports ``2.0.0``.** Each
  source classified ``maintained_product`` must equal the expected product
  version, else a ``product_drift`` violation is recorded by source name.

* **R2.5 — API major metadata is distinct from product version.** Each
  ``api_major`` source must equal the API-major label (``"v1"``); the three
  release labels (product, API major, target schema) must be **pairwise
  distinct** — a collision (e.g. someone relabelling the API major to the
  product string) is a ``label_conflation`` violation.

* **R2.7 — the version test fails on any maintained-source drift; immutable
  historical launch evidence stays labelled with its release/commit.** A source
  classified ``immutable_historical`` (the frozen ``1.0.0`` V1 OpenAPI baseline)
  is **never** flagged as drift regardless of its value — but it MUST carry a
  non-empty ``note`` naming the release/commit that produced it, else an
  ``unlabeled_immutable`` violation fires. This lets the guard *allow* the
  frozen baseline while still forbidding silent, unlabelled frozen artifacts.

A source record is a plain mapping::

    {
        "name": "apps/admissions/package.json",   # human label (not secret)
        "classification": "maintained_product",   # closed enum, see below
        "value": "2.0.0",                          # observed version/label
        "note": "...optional; required for immutable_historical...",
    }

``classification`` is one of :data:`CLASSIFICATIONS`.

:func:`evaluate_version_consistency` combines the per-source checks into a
single result object following the **common envelope** idiom used across the
harness (``gate_id`` ``"version-drift"``, ``requirement`` ``"R2"``) with a
**conservative** verdict: the gate is ``passed`` **iff every** check passed.

**Validates: Requirements 2.1, 2.5, 2.7**
"""

from __future__ import annotations

from typing import Any, List, Mapping, Sequence

__all__ = [
    # Gate identity + closed vocabularies
    "GATE_ID",
    "REQUIREMENT",
    "PASS",
    "FAIL",
    "STATUS_PASSED",
    "STATUS_FAILED",
    # Classifications
    "MAINTAINED_PRODUCT",
    "IMMUTABLE_HISTORICAL",
    "API_MAJOR",
    "TARGET_SCHEMA",
    "CLASSIFICATIONS",
    # Default release labels
    "PRODUCT_VERSION",
    "API_MAJOR_LABEL",
    "TARGET_SCHEMA_LABEL",
    # Predicates + rollup
    "labels_distinct",
    "evaluate_version_consistency",
]

# --- Gate identity + closed vocabularies -----------------------------------

#: Stable gate identity for the version drift guard.
GATE_ID: str = "version-drift"
REQUIREMENT: str = "R2"

#: Per-check result vocabulary (mirrors the shared Evidence_Artifact envelope).
PASS: str = "pass"
FAIL: str = "fail"

#: Gate status vocabulary (mirrors the shared Evidence_Artifact envelope).
STATUS_PASSED: str = "passed"
STATUS_FAILED: str = "failed"

# --- Source classifications ------------------------------------------------

#: A maintained release source that MUST report the product version (R2.1).
MAINTAINED_PRODUCT: str = "maintained_product"

#: Immutable historical launch evidence (the frozen V1 baseline). Never flagged
#: as drift, but must stay labelled with its release/commit (R2.7).
IMMUTABLE_HISTORICAL: str = "immutable_historical"

#: The API major/compatibility label (the ``/api/v1/`` prefix, meta endpoint
#: ``api_version``). Distinct from product version (R2.5).
API_MAJOR: str = "api_major"

#: The forward target schema label (the future strict ``/api/v2/`` contract per
#: design.md §4). Distinct from both product version and API major (R2.5).
TARGET_SCHEMA: str = "target_schema"

#: The closed set of recognised classifications.
CLASSIFICATIONS: frozenset = frozenset(
    {MAINTAINED_PRODUCT, IMMUTABLE_HISTORICAL, API_MAJOR, TARGET_SCHEMA}
)

# --- Default release labels (task 1.1 outcome) -----------------------------

#: The maintained product version (task 1.1 set every maintained source here).
PRODUCT_VERSION: str = "2.0.0"

#: The API major/compatibility label. The URL prefix stays ``/api/v1/``.
API_MAJOR_LABEL: str = "v1"

#: The forward target schema label for the strict V2 contract.
TARGET_SCHEMA_LABEL: str = "v2"


# --- Label distinctness (R2.5) ---------------------------------------------


def labels_distinct(product: Any, api_major: Any, target_schema: Any) -> bool:
    """Return ``True`` iff the three release labels are pairwise distinct (R2.5).

    Product version, API major, and target schema are three **separate**
    contracts. Conflating any two of them (e.g. relabelling the API major to the
    product string, or letting the target schema equal the product version)
    defeats the whole point of the guard, so the rollup records a
    ``label_conflation`` violation when this predicate is false.
    """
    labels = [str(product), str(api_major), str(target_schema)]
    return len(set(labels)) == len(labels)


def _check(check_id: str, source: str, passed: bool, **indicators: Any) -> dict:
    """Build a single check row recording the source *name* + derived indicators.

    Version strings and label names are not secret, so they are recorded as-is.
    """
    row: dict = {
        "id": str(check_id),
        "source": str(source),
        "result": PASS if passed else FAIL,
    }
    row.update(indicators)
    return row


# --- Conservative rollup (R2.1, R2.5, R2.7) --------------------------------


def evaluate_version_consistency(
    sources: Sequence[Mapping[str, Any]],
    *,
    expected_product: str = PRODUCT_VERSION,
    api_major_label: str = API_MAJOR_LABEL,
    target_schema_label: str = TARGET_SCHEMA_LABEL,
) -> dict:
    """Roll every version-source check up to a single conservative verdict.

    Args:
        sources: an iterable of source records (see the module docstring). Each
            record needs a ``name``, a ``classification`` in
            :data:`CLASSIFICATIONS`, and a ``value``; ``immutable_historical``
            records additionally need a non-empty ``note`` (R2.7).
        expected_product: the product version every ``maintained_product``
            source must report (default ``"2.0.0"``).
        api_major_label: the label every ``api_major`` source must report
            (default ``"v1"``).
        target_schema_label: the label every ``target_schema`` source must
            report (default ``"v2"``).

    Returns:
        A result object combining the per-source check rows and a conservative
        verdict::

            {
                "gate_id": "version-drift",
                "requirement": "R2",
                "status": "passed" | "failed",
                "passed": bool,
                "labels": {"product": ..., "api_major": ..., "target_schema": ...},
                "checks": [<check row>, ...],
                "failed": [<check id>, ...],
                "drift": [                       # human-readable violations
                    {"source": ..., "kind": ..., "expected": ..., "observed": ...},
                    ...
                ],
            }

        ``passed`` is ``True`` **iff every** included check passed. Any
        maintained-source drift, mis-labelled API-major source, unlabelled
        immutable historical source, unknown classification, or label conflation
        forces ``passed = False`` and is recorded in ``drift`` by source name.
    """
    checks: List[dict] = []
    drift: List[dict] = []

    # --- Label distinctness gate (R2.5) ------------------------------------
    distinct = labels_distinct(expected_product, api_major_label, target_schema_label)
    checks.append(
        _check(
            "version:labels_distinct",
            "release-labels",
            distinct,
            product=str(expected_product),
            api_major=str(api_major_label),
            target_schema=str(target_schema_label),
        )
    )
    if not distinct:
        drift.append(
            {
                "source": "release-labels",
                "kind": "label_conflation",
                "expected": "product != api_major != target_schema",
                "observed": {
                    "product": str(expected_product),
                    "api_major": str(api_major_label),
                    "target_schema": str(target_schema_label),
                },
            }
        )

    # --- Per-source checks --------------------------------------------------
    for index, source in enumerate(sources or []):
        name = str(source.get("name", f"source[{index}]"))
        classification = source.get("classification")
        value = source.get("value")
        note = source.get("note")

        if classification == MAINTAINED_PRODUCT:
            ok = value == expected_product
            checks.append(
                _check(
                    f"version:maintained:{name}",
                    name,
                    ok,
                    classification=classification,
                    expected=str(expected_product),
                    observed=(None if value is None else str(value)),
                )
            )
            if not ok:
                drift.append(
                    {
                        "source": name,
                        "kind": "product_drift",
                        "expected": str(expected_product),
                        "observed": (None if value is None else str(value)),
                    }
                )

        elif classification == API_MAJOR:
            ok = value == api_major_label
            checks.append(
                _check(
                    f"version:api_major:{name}",
                    name,
                    ok,
                    classification=classification,
                    expected=str(api_major_label),
                    observed=(None if value is None else str(value)),
                )
            )
            if not ok:
                drift.append(
                    {
                        "source": name,
                        "kind": "api_major_drift",
                        "expected": str(api_major_label),
                        "observed": (None if value is None else str(value)),
                    }
                )

        elif classification == TARGET_SCHEMA:
            ok = value == target_schema_label
            checks.append(
                _check(
                    f"version:target_schema:{name}",
                    name,
                    ok,
                    classification=classification,
                    expected=str(target_schema_label),
                    observed=(None if value is None else str(value)),
                )
            )
            if not ok:
                drift.append(
                    {
                        "source": name,
                        "kind": "target_schema_drift",
                        "expected": str(target_schema_label),
                        "observed": (None if value is None else str(value)),
                    }
                )

        elif classification == IMMUTABLE_HISTORICAL:
            # Immutable historical evidence is NEVER flagged as drift regardless
            # of its value (R2.7) — but it MUST stay labelled with a release/
            # commit note, else it is an unlabelled frozen artifact.
            labelled = bool(note and str(note).strip())
            checks.append(
                _check(
                    f"version:immutable:{name}",
                    name,
                    labelled,
                    classification=classification,
                    observed=(None if value is None else str(value)),
                    labelled=labelled,
                    note=(str(note) if note else None),
                )
            )
            if not labelled:
                drift.append(
                    {
                        "source": name,
                        "kind": "unlabeled_immutable",
                        "expected": "non-empty release/commit note",
                        "observed": (None if value is None else str(value)),
                    }
                )

        else:
            # Unknown/absent classification — fail closed.
            checks.append(
                _check(
                    f"version:unknown:{name}",
                    name,
                    False,
                    classification=(None if classification is None else str(classification)),
                    observed=(None if value is None else str(value)),
                )
            )
            drift.append(
                {
                    "source": name,
                    "kind": "unknown_classification",
                    "expected": f"one of {sorted(CLASSIFICATIONS)}",
                    "observed": (None if classification is None else str(classification)),
                }
            )

    failed: List[str] = [c["id"] for c in checks if c["result"] != PASS]
    passed = len(failed) == 0

    return {
        "gate_id": GATE_ID,
        "requirement": REQUIREMENT,
        "status": STATUS_PASSED if passed else STATUS_FAILED,
        "passed": passed,
        "labels": {
            "product": str(expected_product),
            "api_major": str(api_major_label),
            "target_schema": str(target_schema_label),
        },
        "checks": checks,
        "failed": failed,
        "drift": drift,
    }
