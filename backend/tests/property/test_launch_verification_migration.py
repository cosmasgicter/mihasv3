"""Property tests for Gate 1 — Migration_Evidence_Gate (Requirement 1).

This module exercises the **pure-logic core** of Gate 1 in
``scripts/launch-verification/migration_eval.py``. That module is
standard-library-only (it imports only ``datetime`` and ``typing`` and never
touches Django, the ORM, Neon/MCP, ``subprocess``, or the network), so the test
loads it directly via ``importlib`` from the hyphenated
``scripts/launch-verification/`` directory and drives it with hypothesis without
any database. This sidesteps the backend ``conftest.py`` Postgres fixtures — the
file is run with ``backend/.venv/bin/python`` directly.

# Feature: beanola-launch-verification, Property 17: Migration invariant evaluation passes iff all tenant invariants hold
# Feature: beanola-launch-verification, Property 18: Idempotent re-apply produces a zero delta, and backup precedes apply within the window

Property 17 (design.md): *For any* mapping of tenant invariant counts,
:func:`evaluate_invariants` passes **iff every** invariant holds —
``canonical_programs >= 1`` AND active ``institutions >= 1`` AND
``duplicate_hostnames == 0`` AND ``duplicate_slugs == 0`` AND active
``memberships >= 1`` — and on any failure the *specific* failed invariant(s) are
recorded. A missing, non-integer, negative, or boolean count is conservatively
treated as a failed invariant.
**Validates: Requirements 1.4, 1.5**

Property 18 (design.md): *For any* idempotency deltas,
:func:`idempotent_second_apply` is ``True`` **iff both** the
``migration_history`` delta and the schema delta are exactly ``0``; and *for any*
backup/apply timestamp pair, :func:`backup_precedes_apply` is ``True`` **iff**
the backup completes at or before the apply start (never after) and the gap is
within :data:`MAX_BACKUP_AGE_MINUTES` (60) minutes.
**Validates: Requirements 1.3, 1.6**

Backend property-test conventions (spec ``beanola-launch-verification``):
``pytest`` + ``hypothesis``, >= 100 examples per property, tagged with the
Feature/Property markers above. The module under test is pure standard library,
so these run without a database.
"""

from __future__ import annotations

import importlib.util
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from hypothesis import given, settings as hypothesis_settings
from hypothesis import strategies as st

# --------------------------------------------------------------------------- #
# Load the pure evaluator from the hyphenated scripts/launch-verification dir.
#
# ``scripts/launch-verification`` is not an importable package name (the hyphen
# is illegal in a dotted module path), so we resolve the file directly and load
# it with importlib. The module is registered in ``sys.modules`` under a legal
# alias *before* ``exec_module`` runs so any internal name resolution stays
# consistent and a second import reuses the already-loaded object.
# --------------------------------------------------------------------------- #

_MODULE_NAME = "launch_verification_migration_eval"
# test file = backend/tests/property/test_...py
#   parents[0]=property [1]=tests [2]=backend [3]=<repo root>
_MODULE_PATH = (
    Path(__file__).resolve().parents[3]
    / "scripts"
    / "launch-verification"
    / "migration_eval.py"
)

if _MODULE_NAME in sys.modules:  # pragma: no cover - import cache reuse
    migration_eval = sys.modules[_MODULE_NAME]
else:
    _spec = importlib.util.spec_from_file_location(_MODULE_NAME, _MODULE_PATH)
    assert _spec is not None and _spec.loader is not None, (
        f"cannot load migration_eval module from {_MODULE_PATH}"
    )
    migration_eval = importlib.util.module_from_spec(_spec)
    sys.modules[_MODULE_NAME] = migration_eval
    _spec.loader.exec_module(migration_eval)

MAX_BACKUP_AGE_MINUTES = migration_eval.MAX_BACKUP_AGE_MINUTES
INVARIANT_SPECS = migration_eval.INVARIANT_SPECS
PASS = migration_eval.PASS
FAIL = migration_eval.FAIL
NOT_MEASURED = migration_eval.NOT_MEASURED
evaluate_invariants = migration_eval.evaluate_invariants
idempotent_second_apply = migration_eval.idempotent_second_apply
backup_precedes_apply = migration_eval.backup_precedes_apply

# Run a meaningful campaign: well over the >= 100 examples per property minimum.
PBT_SETTINGS = hypothesis_settings(max_examples=250, deadline=None)

# The five invariant count keys, in declared order.
_INVARIANT_KEYS = [spec[0] for spec in INVARIANT_SPECS]
assert _INVARIANT_KEYS == [
    "canonical_programs",
    "active_institutions",
    "duplicate_hostnames",
    "duplicate_slugs",
    "active_memberships",
]


def _usable_count(value) -> bool:
    """Independent oracle: is ``value`` a non-negative, non-bool integer?"""
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _invariant_holds(key: str, value) -> bool:
    """Independent oracle for a single invariant given a raw (possibly bad) value.

    A non-usable count (missing, bool, non-int, negative) never satisfies an
    invariant. The "at least one" invariants require ``>= 1``; the duplicate
    invariants require exactly ``0``.
    """
    if not _usable_count(value):
        return False
    if key in ("canonical_programs", "active_institutions", "active_memberships"):
        return value >= 1
    # duplicate_hostnames / duplicate_slugs
    return value == 0


# A count value strategy spanning valid counts, the zero/one boundaries, large
# values, plus the conservatively-rejected cases: negative ints, booleans,
# floats, strings, and ``None`` (missing).
_COUNT_VALUE = st.one_of(
    st.integers(min_value=0, max_value=5),  # dense around the 0/1 boundary
    st.integers(min_value=-5, max_value=50),  # negatives + larger values
    st.sampled_from([0, 1]),  # explicit boundary hammering
    st.booleans(),  # bool is an int subclass but never a count
    st.none(),  # missing key
    st.floats(allow_nan=False, allow_infinity=False, min_value=-3, max_value=3),
    st.text(max_size=3),  # non-numeric junk
)


@st.composite
def count_mappings(draw):
    """Generate a counts mapping, sometimes omitting keys entirely.

    For each invariant key we either drop it (exercising the missing-key path)
    or assign a value from ``_COUNT_VALUE`` (valid, boundary, or invalid).
    """
    counts = {}
    for key in _INVARIANT_KEYS:
        if draw(st.booleans()):
            counts[key] = draw(_COUNT_VALUE)
        # else: omit the key entirely (missing -> conservatively failed)
    return counts


class TestProperty17InvariantEvaluation:
    """Feature: beanola-launch-verification, Property 17: Migration invariant evaluation passes iff all tenant invariants hold."""

    @PBT_SETTINGS
    @given(counts=count_mappings())
    def test_passes_iff_all_invariants_hold(self, counts) -> None:
        """evaluate_invariants passes iff every one of the five invariants holds."""
        result = evaluate_invariants(counts)

        # Independent oracle: which invariants hold given the raw input.
        expected_holds = {
            key: _invariant_holds(key, counts.get(key)) for key in _INVARIANT_KEYS
        }
        expected_passed = all(expected_holds.values())
        expected_failed = [k for k in _INVARIANT_KEYS if not expected_holds[k]]

        assert result["passed"] is expected_passed
        # R1.5: the specific failed invariant(s) are recorded, in declared order.
        assert result["failed_invariants"] == expected_failed
        # passed is exactly the equivalent of "no failed invariants".
        assert result["passed"] == (len(result["failed_invariants"]) == 0)

    @PBT_SETTINGS
    @given(counts=count_mappings())
    def test_check_rows_match_invariant_outcomes(self, counts) -> None:
        """Each per-invariant check row reflects pass / fail / not-measured."""
        result = evaluate_invariants(counts)
        checks = {c["id"]: c for c in result["checks"]}

        # Exactly one check row per invariant, keyed ``invariant:<key>``.
        assert set(checks) == {f"invariant:{k}" for k in _INVARIANT_KEYS}

        for key in _INVARIANT_KEYS:
            row = checks[f"invariant:{key}"]
            raw = counts.get(key)
            if not _usable_count(raw):
                # Missing / bool / non-int / negative -> not measured + blocking.
                assert row["result"] == NOT_MEASURED
                assert key in result["failed_invariants"]
            elif _invariant_holds(key, raw):
                assert row["result"] == PASS
                assert key not in result["failed_invariants"]
            else:
                assert row["result"] == FAIL
                assert key in result["failed_invariants"]

    @PBT_SETTINGS
    @given(
        canonical_programs=st.integers(min_value=1, max_value=100),
        active_institutions=st.integers(min_value=1, max_value=100),
        active_memberships=st.integers(min_value=1, max_value=100),
    )
    def test_all_valid_counts_pass(
        self, canonical_programs, active_institutions, active_memberships
    ) -> None:
        """A mapping satisfying every invariant always passes with no failures."""
        counts = {
            "canonical_programs": canonical_programs,
            "active_institutions": active_institutions,
            "duplicate_hostnames": 0,
            "duplicate_slugs": 0,
            "active_memberships": active_memberships,
        }
        result = evaluate_invariants(counts)
        assert result["passed"] is True
        assert result["failed_invariants"] == []
        assert all(c["result"] == PASS for c in result["checks"])


class TestProperty18IdempotencyAndBackupTiming:
    """Feature: beanola-launch-verification, Property 18: Idempotent re-apply produces a zero delta, and backup precedes apply within the window."""

    @PBT_SETTINGS
    @given(
        history_delta=st.one_of(
            st.integers(min_value=-3, max_value=5),
            st.booleans(),
            st.none(),
            st.floats(allow_nan=False, allow_infinity=False, min_value=-2, max_value=2),
        ),
        schema_delta=st.one_of(
            st.integers(min_value=-3, max_value=5),
            st.booleans(),
            st.none(),
            st.floats(allow_nan=False, allow_infinity=False, min_value=-2, max_value=2),
        ),
    )
    def test_idempotent_iff_both_deltas_zero(self, history_delta, schema_delta) -> None:
        """idempotent_second_apply is True iff both deltas are exactly int 0."""
        # Oracle: only a usable (non-neg, non-bool) integer that equals 0 counts.
        history_zero = _usable_count(history_delta) and history_delta == 0
        schema_zero = _usable_count(schema_delta) and schema_delta == 0
        expected = history_zero and schema_zero

        assert idempotent_second_apply(history_delta, schema_delta) is expected

    @PBT_SETTINGS
    @given(
        gap_minutes=st.one_of(
            st.just(0),  # boundary: backup exactly at apply start
            st.just(MAX_BACKUP_AGE_MINUTES),  # boundary: exactly 60 min before
            st.integers(min_value=-30, max_value=120),  # incl backup-after-apply
            st.floats(
                allow_nan=False,
                allow_infinity=False,
                min_value=-30.0,
                max_value=120.0,
            ),
        ),
    )
    def test_backup_precedes_apply_within_window(self, gap_minutes) -> None:
        """backup_precedes_apply passes iff 0 <= (apply - backup) <= 60 minutes.

        ``gap_minutes`` is how long *before* the apply the backup completed.
        Negative gaps mean the backup completed *after* the apply (must fail);
        gaps above 60 are too old (must fail); 0 and 60 are passing boundaries.
        """
        apply_started = datetime(2026, 6, 20, 12, 0, 0, tzinfo=timezone.utc)
        backup_completed = apply_started - timedelta(minutes=gap_minutes)

        # Compute the oracle from the *actual* datetimes the function receives:
        # ``timedelta`` only has microsecond resolution, so a sub-microsecond
        # ``gap_minutes`` collapses to a 0-gap. Measuring the real gap keeps the
        # oracle exactly consistent with the function's input domain.
        actual_gap_minutes = (apply_started - backup_completed).total_seconds() / 60.0
        expected = 0 <= actual_gap_minutes <= MAX_BACKUP_AGE_MINUTES
        actual = backup_precedes_apply(backup_completed, apply_started)
        assert actual is expected, (
            f"gap={actual_gap_minutes} min: backup_precedes_apply -> {actual}, "
            f"expected {expected}"
        )

    @PBT_SETTINGS
    @given(
        gap_minutes=st.sampled_from([0, 1, 30, 59, 60]),
    )
    def test_backup_timing_accepts_iso_strings(self, gap_minutes) -> None:
        """ISO-8601 string timestamps (trailing Z) behave like datetimes."""
        apply_started = datetime(2026, 6, 20, 12, 0, 0, tzinfo=timezone.utc)
        backup_completed = apply_started - timedelta(minutes=gap_minutes)

        apply_iso = apply_started.strftime("%Y-%m-%dT%H:%M:%SZ")
        backup_iso = backup_completed.strftime("%Y-%m-%dT%H:%M:%SZ")

        # All sampled gaps are within [0, 60] so every case passes.
        assert backup_precedes_apply(backup_iso, apply_iso) is True

    @PBT_SETTINGS
    @given(
        backup=st.one_of(st.none(), st.text(max_size=4), st.just("not-a-date")),
        apply=st.one_of(st.none(), st.text(max_size=4), st.just("nope")),
    )
    def test_unparseable_timestamps_fail_closed(self, backup, apply) -> None:
        """Unparseable timestamps conservatively fail the backup-timing check."""
        assert backup_precedes_apply(backup, apply) is False

    @PBT_SETTINGS
    @given(
        backup_after_minutes=st.integers(min_value=1, max_value=120),
    )
    def test_backup_after_apply_always_fails(self, backup_after_minutes) -> None:
        """A backup completing after the apply start never passes (R1.6)."""
        apply_started = datetime(2026, 6, 20, 12, 0, 0, tzinfo=timezone.utc)
        backup_completed = apply_started + timedelta(minutes=backup_after_minutes)
        assert backup_precedes_apply(backup_completed, apply_started) is False
