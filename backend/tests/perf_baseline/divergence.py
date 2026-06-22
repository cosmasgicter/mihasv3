"""Reusable output-divergence comparator for the performance-hardening baseline.

This module is the heart of the task-2.1 harness and is deliberately
**framework-free** (no Django import) so it can be reused by unit, property,
and integration tests alike, and unit-tested in isolation.

It provides three capabilities the post-feature tests (R13.1, R13.2, R13.6)
need:

1. :func:`normalize_snapshot` — turn an arbitrary JSON-ish payload (dicts,
   lists, ``Decimal``, ``datetime``/``date``, ``UUID``, sets) into a stable,
   JSON-serialisable structure. Keys that are inherently variable run-to-run
   (ids, timestamps, references, …) are collapsed to the :data:`VOLATILE`
   sentinel so equality checks compare *behaviour* (computed values, envelope
   shape) rather than incidental identifiers.

2. :func:`diff_snapshots` / :func:`assert_equivalent` — compare a baseline
   ("old") snapshot against a candidate ("new") snapshot and report every
   divergence: missing/extra keys, type mismatches, value mismatches, and
   list-length mismatches, each with a JSON-path so failures are actionable.

3. :func:`structural_signature` — derive a value-independent description of a
   payload's *shape* (field names, value types, nesting depth, pagination
   structure) used to assert the envelope contract is preserved (R13.1)
   independently of the concrete values.

Plus :func:`assert_envelope`, which validates the canonical
``{"success": true, "data": ...}`` envelope and returns the inner ``data``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Iterable
from uuid import UUID

#: Sentinel substituted for the value of any *volatile* dict key — a key whose
#: value legitimately changes between runs (database ids, timestamps, payment
#: references, auto-generated codes, age/elapsed-day computations). Comparing
#: behaviour means comparing everything *except* these.
VOLATILE = "<volatile>"

#: Default set of dict keys treated as volatile during normalization. Callers
#: extend this per endpoint (e.g. the dashboard's ``recent_activity`` messages
#: embed application numbers). Kept intentionally broad: the goal is to compare
#: computed *behavioural* fields (status counts, capability lists, grade
#: summaries, payment amounts/currency) while ignoring incidental identifiers.
DEFAULT_VOLATILE_KEYS: frozenset[str] = frozenset(
    {
        "id",
        "user_id",
        "created_at",
        "updated_at",
        "submitted_at",
        "read_at",
        "verified_at",
        "paid_at",
        "payment_verified_at",
        "review_started_at",
        "decision_date",
        "timestamp",
        "application_number",
        "public_tracking_code",
        "tracking_code",
        "transaction_reference",
        "payment_reference",
        "last_payment_reference",
        "receipt_number",
        "after",
        "email",
        "phone",
        "date_of_birth",
        # Time-relative computed fields (depend on "today").
        "age",
        "days_since_submission",
    }
)


@dataclass(frozen=True)
class OutputDivergence:
    """A single difference found between a baseline and a candidate snapshot.

    ``path`` is a human-readable JSON path (``data.applications.total``,
    ``data.results[0].status``). ``kind`` is one of ``missing_key``,
    ``extra_key``, ``type_mismatch``, ``value_mismatch``, ``length_mismatch``.
    """

    path: str
    kind: str
    baseline: Any
    candidate: Any

    def __str__(self) -> str:  # pragma: no cover - trivial formatting
        return (
            f"[{self.kind}] {self.path}: "
            f"baseline={self.baseline!r} candidate={self.candidate!r}"
        )


# ---------------------------------------------------------------------------
# Normalization
# ---------------------------------------------------------------------------


def normalize_snapshot(
    value: Any,
    *,
    volatile_keys: Iterable[str] | None = None,
    drop_keys: Iterable[str] = (),
) -> Any:
    """Return a stable, JSON-serialisable copy of ``value``.

    - ``dict`` keys in ``volatile_keys`` have their value replaced by
      :data:`VOLATILE`; keys in ``drop_keys`` are removed entirely.
    - ``Decimal`` becomes a canonical string (so ``Decimal('750.00')`` and a
      DB-read ``Decimal('750.0000')`` compare via their string form).
    - ``datetime`` / ``date`` become ISO strings (usually also volatile).
    - ``UUID`` becomes ``str``; ``set``/``frozenset`` become sorted lists.
    - tuples become lists; everything else is returned unchanged.
    """
    vkeys = DEFAULT_VOLATILE_KEYS if volatile_keys is None else frozenset(volatile_keys)
    drop = frozenset(drop_keys)
    return _normalize(value, vkeys, drop)


def _normalize(value: Any, vkeys: frozenset[str], drop: frozenset[str]) -> Any:
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, item in value.items():
            skey = str(key)
            if skey in drop:
                continue
            if skey in vkeys:
                out[skey] = VOLATILE
            else:
                out[skey] = _normalize(item, vkeys, drop)
        return out
    if isinstance(value, (list, tuple)):
        return [_normalize(item, vkeys, drop) for item in value]
    if isinstance(value, (set, frozenset)):
        return sorted(_normalize(item, vkeys, drop) for item in value)
    if isinstance(value, bool):
        return value
    if isinstance(value, Decimal):
        return _canonical_decimal(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    return value


def _canonical_decimal(value: Decimal) -> str:
    """Canonical string for a Decimal that ignores trailing-zero scale.

    ``Decimal('750')``, ``Decimal('750.00')`` and ``Decimal('750.0000')`` all
    normalize to ``"750"`` so a column's storage scale never registers as a
    behavioural divergence.
    """
    normalized = value.normalize()
    # ``normalize`` can yield exponent notation for integers (e.g. 7.5E+2);
    # expand it back to plain notation for a stable, readable form.
    return format(normalized, "f")


# ---------------------------------------------------------------------------
# Diffing
# ---------------------------------------------------------------------------


def diff_snapshots(
    baseline: Any,
    candidate: Any,
    *,
    volatile_keys: Iterable[str] | None = None,
    drop_keys: Iterable[str] = (),
    normalized: bool = False,
) -> list[OutputDivergence]:
    """Return every :class:`OutputDivergence` between two snapshots.

    By default both sides are normalized first (so callers can pass raw
    serializer/response payloads). Pass ``normalized=True`` when the inputs are
    already normalized (e.g. loaded from a golden fixture) to skip re-work.
    """
    if normalized:
        base_n, cand_n = baseline, candidate
    else:
        base_n = normalize_snapshot(baseline, volatile_keys=volatile_keys, drop_keys=drop_keys)
        cand_n = normalize_snapshot(candidate, volatile_keys=volatile_keys, drop_keys=drop_keys)
    divergences: list[OutputDivergence] = []
    _diff(base_n, cand_n, "", divergences)
    return divergences


def _diff(base: Any, cand: Any, path: str, out: list[OutputDivergence]) -> None:
    # A VOLATILE sentinel on either side matches anything (the value was
    # intentionally erased during normalization).
    if base == VOLATILE or cand == VOLATILE:
        return

    if type(base) is not type(cand) and not _both_numeric(base, cand):
        out.append(OutputDivergence(path or "<root>", "type_mismatch", _typename(base), _typename(cand)))
        return

    if isinstance(base, dict):
        base_keys = set(base)
        cand_keys = set(cand)
        for key in sorted(base_keys - cand_keys):
            out.append(OutputDivergence(_join(path, key), "missing_key", base[key], None))
        for key in sorted(cand_keys - base_keys):
            out.append(OutputDivergence(_join(path, key), "extra_key", None, cand[key]))
        for key in sorted(base_keys & cand_keys):
            _diff(base[key], cand[key], _join(path, key), out)
        return

    if isinstance(base, list):
        if len(base) != len(cand):
            out.append(OutputDivergence(path or "<root>", "length_mismatch", len(base), len(cand)))
            # Still compare the overlapping prefix for actionable detail.
        for index in range(min(len(base), len(cand))):
            _diff(base[index], cand[index], f"{path}[{index}]", out)
        return

    if base != cand:
        out.append(OutputDivergence(path or "<root>", "value_mismatch", base, cand))


def _both_numeric(a: Any, b: Any) -> bool:
    numeric = (int, float)
    return isinstance(a, numeric) and isinstance(b, numeric) and not isinstance(a, bool) and not isinstance(b, bool)


def _typename(value: Any) -> str:
    return type(value).__name__


def _join(prefix: str, key: str) -> str:
    return f"{prefix}.{key}" if prefix else key


# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------


def assert_equivalent(
    baseline: Any,
    candidate: Any,
    *,
    label: str = "output",
    volatile_keys: Iterable[str] | None = None,
    drop_keys: Iterable[str] = (),
    normalized: bool = False,
) -> None:
    """Assert ``candidate`` is behaviourally equivalent to ``baseline``.

    Raises ``AssertionError`` with a readable, multi-line divergence report
    when any difference is found. Used by the post-feature regression and
    property tests to prove no observable behavior changed.
    """
    divergences = diff_snapshots(
        baseline,
        candidate,
        volatile_keys=volatile_keys,
        drop_keys=drop_keys,
        normalized=normalized,
    )
    if divergences:
        report = "\n".join(f"  - {d}" for d in divergences)
        raise AssertionError(
            f"{label}: {len(divergences)} divergence(s) between baseline and candidate:\n{report}"
        )


def assert_envelope(payload: Any, *, expect_success: bool = True) -> Any:
    """Validate the canonical ``{"success": bool, ...}`` envelope (R13.1).

    For a success envelope, asserts ``success is True`` and a ``data`` key is
    present, returning the inner ``data``. For an error envelope
    (``expect_success=False``), asserts ``success is False`` and returns the
    whole payload.
    """
    assert isinstance(payload, dict), f"envelope must be a dict, got {type(payload).__name__}"
    assert "success" in payload, "envelope missing 'success' key"
    if expect_success:
        assert payload["success"] is True, f"expected success=True, got {payload['success']!r}"
        assert "data" in payload, "success envelope missing 'data' key"
        return payload["data"]
    assert payload["success"] is False, f"expected success=False, got {payload['success']!r}"
    return payload


# ---------------------------------------------------------------------------
# Structural signature (shape-only, value-independent)
# ---------------------------------------------------------------------------


def structural_signature(value: Any) -> Any:
    """Return a value-independent description of ``value``'s shape.

    Two payloads share a structural signature iff they have the same field
    names, the same value *types*, the same nesting depth, and the same
    pagination structure (R13.1) — regardless of the concrete values. Lists are
    collapsed to a single representative element signature (merged across all
    elements) so length does not affect the signature.
    """
    if isinstance(value, dict):
        return {str(k): structural_signature(v) for k, v in sorted(value.items(), key=lambda kv: str(kv[0]))}
    if isinstance(value, (list, tuple)):
        if not value:
            return ["<empty-list>"]
        return [_merged_list_signature(value)]
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (set, frozenset)):
        return ["<set>"]
    return _scalar_type(value)


def _merged_list_signature(items: Iterable[Any]) -> Any:
    """Merge element signatures so a heterogeneous list reports every key.

    For a list of dicts whose elements omit different optional keys, the merged
    signature is the union of all keys (with each key's representative type),
    so the shape check is robust to optional/nullable fields.
    """
    signatures = [structural_signature(item) for item in items]
    if all(isinstance(sig, dict) for sig in signatures):
        merged: dict[str, Any] = {}
        for sig in signatures:
            for key, sub in sig.items():
                merged.setdefault(key, sub)
        return merged
    # Non-dict elements: if uniform, use that signature, else mark mixed.
    first = signatures[0]
    if all(sig == first for sig in signatures):
        return first
    return "<mixed>"


def _scalar_type(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if isinstance(value, Decimal):
        return "decimal"
    if isinstance(value, (datetime, date)):
        return "datetime"
    if isinstance(value, UUID):
        return "uuid"
    if isinstance(value, str):
        return "str"
    return type(value).__name__
