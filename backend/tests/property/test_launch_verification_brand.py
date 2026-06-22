"""Property-based tests for the Gate 7 launch-verification brand-scan core.

# Feature: beanola-launch-verification, Property 10: The brand scan passes iff the leak set outside the allowlist is empty
# Feature: beanola-launch-verification, Property 11: An allowlist is valid iff every entry references one existing file with one classification and a live pattern

These properties target the **pure decision core** of the Brand_Scan_Gate,
``scripts/launch-verification/brand_eval.py``. That module performs no
filesystem scanning, no network access, and imports no Django — it evaluates
predicates over already-collected facts (a set of detected leaks, raw allowlist
text, and per-entry filesystem answers supplied as injected callables). So the
acceptance logic is a deterministic function of its inputs and can be
property-tested with no I/O and no database at all.

Property 10: *For any* set of detected leaks and any allowlist of paths, the
brand scan passes (``brand_scan_passes``) **iff** the set of leaks occurring
outside the allowlist (``leak_set_outside_allowlist``) is empty — i.e. every
leak's file path is an allowlisted path.
**Validates: Requirements 7.1, 7.7**

Property 11: *For any* allowlist entry whose four controllable facts —
``path`` present, ``classification`` one-of-four, ``file_exists``,
``file_contains_pattern`` — are independently varied, ``entry_is_valid`` (and the
rolled-up ``validate_allowlist``) holds **iff** the entry references exactly one
existing file, carries exactly one valid classification, and contains a live
pattern; and the entry is *stale* **iff** its file is missing OR it has no live
pattern.
**Validates: Requirements 7.4, 7.5, 7.6**

Backend property-test conventions (spec ``beanola-launch-verification``):
``pytest`` + ``hypothesis``, >= 100 examples per property, one property per test
class, tagged with the Feature/Property markers above. The core under test is
pure (standard library only), so these run without a database.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from hypothesis import given, settings as hypothesis_settings
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Import the brand-scan core from scripts/launch-verification/brand_eval.py.
#
# brand_eval.py lives at the repo root (outside the ``backend`` import package)
# and is pure standard-library, so loading it by file path needs no sys.path
# manipulation. We register the module under its spec name before exec so the
# dataclass in the module can resolve its (stringized) annotations under
# ``from __future__ import annotations``.
# ---------------------------------------------------------------------------

# test file = backend/tests/property/test_...py
#   parents[0]=property [1]=tests [2]=backend [3]=<repo root>
_REPO_ROOT = Path(__file__).resolve().parents[3]
_BRAND_PATH = _REPO_ROOT / "scripts" / "launch-verification" / "brand_eval.py"


def _load_brand_eval():
    spec = importlib.util.spec_from_file_location(
        "launch_verification_brand_eval", _BRAND_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader, f"cannot load brand_eval module from {_BRAND_PATH}"
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


_brand = _load_brand_eval()

leak_set_outside_allowlist = _brand.leak_set_outside_allowlist
brand_scan_passes = _brand.brand_scan_passes
entry_is_valid = _brand.entry_is_valid
entry_problems = _brand.entry_problems
validate_allowlist = _brand.validate_allowlist
VALID_CLASSIFICATIONS = _brand.VALID_CLASSIFICATIONS
CLASS_TENANT_SEED = _brand.CLASS_TENANT_SEED
CLASS_HISTORICAL = _brand.CLASS_HISTORICAL
CLASS_LEGACY_COMPAT = _brand.CLASS_LEGACY_COMPAT
CLASS_PREVIEW_FIXTURE = _brand.CLASS_PREVIEW_FIXTURE
STALE_PROBLEMS = _brand.STALE_PROBLEMS
PROBLEM_FILE_MISSING = _brand.PROBLEM_FILE_MISSING
PROBLEM_NO_PATTERN = _brand.PROBLEM_NO_PATTERN
PROBLEM_MISSING_PATH = _brand.PROBLEM_MISSING_PATH
PROBLEM_INVALID_CLASSIFICATION = _brand.PROBLEM_INVALID_CLASSIFICATION

# Run a meaningful campaign: >= 100 examples per property.
PBT_SETTINGS = hypothesis_settings(max_examples=200, deadline=None)

# The four classification constants must be exactly the closed valid set.
_FOUR_CLASSES = (
    CLASS_TENANT_SEED,
    CLASS_HISTORICAL,
    CLASS_LEGACY_COMPAT,
    CLASS_PREVIEW_FIXTURE,
)

# Repo-relative-ish POSIX paths the generators draw from. A small shared pool of
# candidate paths guarantees meaningful overlap between leak paths and the
# allowlist (so both the pass and fail branches are exercised heavily).
_PATH_POOL = [
    "apps/admissions/src/config/seed.ts",
    "backend/apps/catalog/seed.py",
    "docs/legacy/letter.html",
    "apps/admissions/src/lib/pdf/preview.tsx",
    "backend/apps/common/legacy_codes.py",
    "scripts/launch-verification/brand_eval.py",
]

_paths = st.sampled_from(_PATH_POOL)

# Offending brand strings the scanner might surface (R7.7 records the string).
_patterns = st.sampled_from(["MIHAS", "KATC", "Mukuba", "mihas.edu.zm", "mihas.local"])


# ---------------------------------------------------------------------------
# Property 10 — brand scan passes iff the leak set outside the allowlist is empty
# ---------------------------------------------------------------------------


@st.composite
def leaks_and_allowlist(draw):
    """Generate a list of ``(path, pattern)`` leaks plus an allowlist of paths.

    Both the leak paths and the allowlist are drawn from a shared, small path
    pool so that the "every leak path is allowlisted" condition is satisfied a
    meaningful fraction of the time — covering both the passing (empty
    outside-set) and failing (non-empty outside-set) branches of the predicate.
    The allowlist is shaped as the real file shape (a mapping with an
    ``"allowlist"`` list of ``{"path": ...}`` entry mappings).
    """
    leaks = draw(
        st.lists(st.tuples(_paths, _patterns), min_size=0, max_size=8)
    )
    allowed_paths = draw(st.lists(_paths, min_size=0, max_size=6, unique=True))
    allowlist = {"allowlist": [{"path": p} for p in allowed_paths]}
    return leaks, allowed_paths, allowlist


class TestProperty10BrandScanPassesIffNoOutsideLeak:
    """Feature: beanola-launch-verification, Property 10: The brand scan passes iff the leak set outside the allowlist is empty."""

    @PBT_SETTINGS
    @given(data=leaks_and_allowlist())
    def test_passes_iff_every_leak_path_is_allowlisted(self, data) -> None:
        """brand_scan_passes is True iff no leak occurs outside the allowlist."""
        leaks, allowed_paths, allowlist = data
        allowed_set = set(allowed_paths)

        # Independent oracle: a leak is "outside" when its path is not allowlisted.
        expected_outside = {
            (path, pattern) for (path, pattern) in leaks if path not in allowed_set
        }
        expected_passes = len(expected_outside) == 0

        outside = leak_set_outside_allowlist(leaks, allowlist)
        passes = brand_scan_passes(leaks, allowlist)

        # The computed outside-set matches the oracle exactly.
        assert outside == expected_outside
        # The pass verdict is exactly the emptiness of the outside-set (the iff).
        assert passes == expected_passes
        assert passes == (len(outside) == 0)

    @PBT_SETTINGS
    @given(leaks=st.lists(st.tuples(_paths, _patterns), min_size=1, max_size=8))
    def test_empty_allowlist_passes_iff_no_leaks(self, leaks) -> None:
        """With an empty allowlist, any leak blocks; only zero leaks pass."""
        empty_allowlist = {"allowlist": []}
        # Every leak here has a path, none allowlisted -> all are outside.
        assert not brand_scan_passes(leaks, empty_allowlist)
        # The control case: no leaks at all always passes, regardless of allowlist.
        assert brand_scan_passes([], empty_allowlist)
        assert brand_scan_passes([], {"allowlist": [{"path": p} for p in _PATH_POOL]})

    @PBT_SETTINGS
    @given(
        allowed=st.lists(_paths, min_size=1, max_size=6, unique=True),
        pattern=_patterns,
    )
    def test_pathless_leak_can_never_be_allowlisted(self, allowed, pattern) -> None:
        """A leak with no identifiable path is always outside (never allowlisted)."""
        allowlist = {"allowlist": [{"path": p} for p in allowed]}
        # A leak whose path is None cannot match any allowlisted path.
        leaks = [(None, pattern)]
        assert not brand_scan_passes(leaks, allowlist)
        assert (None, pattern) in leak_set_outside_allowlist(leaks, allowlist)


# ---------------------------------------------------------------------------
# Property 11 — allowlist valid iff every entry: one existing file + one
# classification + a live pattern; stale iff file missing OR no live pattern.
# ---------------------------------------------------------------------------


@st.composite
def controllable_entry(draw):
    """Generate an allowlist entry plus its injected filesystem facts.

    Returns ``(entry, file_exists, file_contains_pattern, path_present,
    classification_valid)`` where the four controllable dimensions are varied
    independently:

    * ``path_present`` — whether the entry carries a non-empty ``path`` string.
    * ``classification_valid`` — whether ``classification`` is one of the four
      allowed classes (else a junk string).
    * ``file_exists`` — injected boolean: does the referenced file exist?
    * ``file_contains_pattern`` — injected boolean: does it still contain a live
      allowlisted pattern?
    """
    path_present = draw(st.booleans())
    classification_valid = draw(st.booleans())
    file_exists = draw(st.booleans())
    file_contains_pattern = draw(st.booleans())

    entry = {}
    if path_present:
        entry["path"] = draw(_paths)
    else:
        # Either omit the key or use a blank/non-string value (all "missing path").
        entry["path"] = draw(st.sampled_from(["", "   ", None]))

    if classification_valid:
        entry["classification"] = draw(st.sampled_from(_FOUR_CLASSES))
    else:
        entry["classification"] = draw(
            st.sampled_from(["", "bogus", "platform identity", "legitimate"])
        )

    return entry, file_exists, file_contains_pattern, path_present, classification_valid


class TestProperty11AllowlistValidIff:
    """Feature: beanola-launch-verification, Property 11: An allowlist is valid iff every entry references one existing file with one classification and a live pattern."""

    @PBT_SETTINGS
    @given(case=controllable_entry())
    def test_entry_valid_iff_all_three_conditions_hold(self, case) -> None:
        """entry_is_valid iff: path present AND one valid class AND live file."""
        entry, file_exists, contains, path_present, class_valid = case

        # Independent oracle for the three R7.4 conditions:
        #  * references one existing file (path present AND file_exists)
        #  * exactly one valid classification
        #  * a live pattern (file exists AND contains an allowlisted pattern)
        live_pattern = file_exists and contains
        expected_valid = path_present and class_valid and file_exists and live_pattern

        valid = entry_is_valid(entry, file_exists, contains)
        assert valid == expected_valid

        # Cross-check problem codes line up with each failing condition.
        problems = entry_problems(entry, file_exists, contains)
        assert (not problems) == valid
        assert (PROBLEM_MISSING_PATH in problems) == (not path_present)
        assert (PROBLEM_INVALID_CLASSIFICATION in problems) == (not class_valid)

    @PBT_SETTINGS
    @given(case=controllable_entry())
    def test_staleness_iff_file_missing_or_no_live_pattern(self, case) -> None:
        """An entry is stale iff its file is missing OR it has no live pattern (R7.5)."""
        entry, file_exists, contains, _path_present, _class_valid = case

        problems = entry_problems(entry, file_exists, contains)
        is_stale = any(p in STALE_PROBLEMS for p in problems)

        expected_stale = (not file_exists) or (not contains)
        assert is_stale == expected_stale

        # The specific stale code reflects which staleness arm fired.
        if not file_exists:
            assert PROBLEM_FILE_MISSING in problems
            # file-missing subsumes the pattern check (no double-reporting).
            assert PROBLEM_NO_PATTERN not in problems
        elif not contains:
            assert PROBLEM_NO_PATTERN in problems

    @PBT_SETTINGS
    @given(cases=st.lists(controllable_entry(), min_size=1, max_size=6))
    def test_validate_allowlist_rolls_up_per_entry_decisions(self, cases) -> None:
        """validate_allowlist().valid iff every entry is valid; stale subset is exact.

        Since allowlist entries may share path strings, the injected callables
        cannot reliably resolve per-entry facts by path. We therefore validate
        each entry as its own single-element allowlist (closing the entry's
        ``file_exists``/``file_contains`` facts into the callables) and assert the
        rollup matches the per-entry ``entry_problems`` oracle, then confirm the
        whole-list ``valid`` flag is the AND of the per-entry decisions.
        """
        expected_invalid = []
        expected_stale = []
        for idx, (entry, exists, contains, path_present, _cv) in enumerate(cases):
            # Mirror validate_allowlist's path-normalization gating: when the
            # entry's path is blank/missing it normalizes to None, so the file
            # cannot be probed -> exists is forced False (file-missing/stale) and
            # contains is forced False, regardless of the injected booleans.
            eff_exists = exists if path_present else False
            eff_contains = contains if (path_present and eff_exists) else False
            problems = entry_problems(entry, eff_exists, eff_contains)
            if problems:
                expected_invalid.append(idx)
                if any(p in STALE_PROBLEMS for p in problems):
                    expected_stale.append(idx)

        results_invalid = []
        results_stale = []
        for idx, (entry, exists, contains, _pp, _cv) in enumerate(cases):
            v = validate_allowlist(
                [entry],
                file_exists_fn=lambda _p, e=exists: e,
                file_contains_pattern_fn=lambda _p, c=contains: c,
            )
            if not v.valid:
                results_invalid.append(idx)
            if v.stale_entries:
                results_stale.append(idx)

        assert results_invalid == expected_invalid
        assert results_stale == expected_stale

        # Whole-list validity is the AND of per-entry validity. With every file
        # present and live, validity depends only on path-present AND valid-class.
        entries = [c[0] for c in cases]
        whole = validate_allowlist(
            entries,
            file_exists_fn=lambda _p: True,
            file_contains_pattern_fn=lambda _p: True,
        )
        expected_whole_valid = all((c[3] and c[4]) for c in cases)
        assert whole.valid == expected_whole_valid
