"""Pure-logic core for Gate 7 — Brand_Scan_Gate (Requirement 7).

This module is the **pure, deterministic** decision layer behind the launch
brand-drift gate. It performs *no* filesystem scanning, *no* network access, and
imports *no* Django — it only evaluates predicates over already-collected facts
(a set of detected leaks, raw allowlist text, and per-entry filesystem answers
supplied as injected callables). That keeps it trivially importable from the
``run-brand-scan.py`` wrapper (task 9.4), from CI, and from the hypothesis
property tests (tasks 9.2 / 9.3), and lets the gate's logic be property-tested
independent of any real repository checkout.

The brand drift guards themselves
(``apps/admissions/tests/unit/brandDriftGuard.test.ts`` and
``backend/tests/unit/test_brand_drift_guard.py``) walk the active source tree and
emit raw hits; the reviewed allowlist is ``docs/legacy-brand-allowlist.json``.
This module encodes the acceptance rules that turn those raw facts into a
pass/fail verdict:

* **R7.1 / R7.7 — leak-set acceptance.** The scan passes **iff** the set of hard
  platform-brand leaks found *outside* the allowlist is empty.
  :func:`leak_set_outside_allowlist` computes that set (a leak is "outside" when
  the file it occurs in is not an allowlisted path), and
  :func:`brand_scan_passes` is true exactly when the set is empty.

* **R7.2 / R7.3 — allowlist JSON validity.** The allowlist must be well-formed
  JSON. :func:`allowlist_is_valid_json` returns ``(ok, error)`` and never raises.

* **R7.4 / R7.6 — per-entry validity.** Every allowlist entry must reference a
  single existing file, be classified as exactly one of the four allowed classes
  (:data:`VALID_CLASSIFICATIONS`), and currently contain at least one allowlisted
  (live) pattern. :func:`entry_is_valid` decides one entry given injected
  ``file_exists`` / ``file_contains_pattern`` booleans.

* **R7.5 — staleness.** An entry is *stale* when its referenced file no longer
  exists **or** no longer contains an allowlisted pattern.
  :func:`validate_allowlist` rolls the per-entry decisions up, taking filesystem
  access as injected callables so the core stays pure, and reports every invalid
  and every stale entry.

The classification strings are taken verbatim from the reviewed
``docs/legacy-brand-allowlist.json`` ``"classifications"`` array (its real
structure), which maps onto the four conceptual classes named in Requirement 7:
legitimate tenant seed, legacy compatibility, historical example, and
client-side preview fixture.

**Validates: Requirements 7.1, 7.2, 7.4, 7.6**
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable, List, Mapping, Optional, Sequence, Set, Tuple

__all__ = [
    "BRAND_PATTERNS",
    "CLASS_TENANT_SEED",
    "CLASS_HISTORICAL",
    "CLASS_LEGACY_COMPAT",
    "CLASS_PREVIEW_FIXTURE",
    "VALID_CLASSIFICATIONS",
    "PROBLEM_MALFORMED",
    "PROBLEM_MISSING_PATH",
    "PROBLEM_INVALID_CLASSIFICATION",
    "PROBLEM_FILE_MISSING",
    "PROBLEM_NO_PATTERN",
    "STALE_PROBLEMS",
    "allowlist_paths",
    "leak_set_outside_allowlist",
    "brand_scan_passes",
    "allowlist_is_valid_json",
    "entry_problems",
    "entry_is_valid",
    "AllowlistValidation",
    "validate_allowlist",
]


# --------------------------------------------------------------------------- #
# Canonical brand patterns + classifications (single source of truth mirror)
# --------------------------------------------------------------------------- #

#: The hard platform-brand patterns scanned for, kept in lock-step with the
#: ``"patterns"`` array in ``docs/legacy-brand-allowlist.json`` and the two
#: brand drift guards. The pure core never scans for these itself — the constant
#: is provided so the wrapper (task 9.4) and tests share one definition.
BRAND_PATTERNS: Tuple[str, ...] = (
    "MIHAS",
    "KATC",
    "Mukuba",
    "Kalulushi",
    "apply.mihas.edu.zm",
    "mihas.edu.zm",
    "mihas.beanola.com",
    "mihas.local",
)

# The four allowed classifications (R7.4), verbatim from the reviewed allowlist
# file's "classifications" array. Each maps to one conceptual class in R7.4:
#   seeded tenant data ............ legitimate tenant seed
#   named legacy-compatibility .... legacy compatibility
#   historical archived document .. historical example
#   dev/PDF-preview fixture ....... client-side preview fixture
CLASS_TENANT_SEED: str = "seeded tenant data"
CLASS_HISTORICAL: str = "historical archived document"
CLASS_LEGACY_COMPAT: str = "named legacy-compatibility code with a guard"
CLASS_PREVIEW_FIXTURE: str = (
    "dev/PDF-preview fixture not reachable from official-download paths"
)

#: The closed set of valid classifications — an entry must be classified as
#: **exactly one** of these (R7.4).
VALID_CLASSIFICATIONS: frozenset = frozenset(
    {
        CLASS_TENANT_SEED,
        CLASS_HISTORICAL,
        CLASS_LEGACY_COMPAT,
        CLASS_PREVIEW_FIXTURE,
    }
)

# Per-entry problem codes (used by validate_allowlist / entry_problems).
PROBLEM_MALFORMED: str = "malformed-entry"
PROBLEM_MISSING_PATH: str = "missing-path"
PROBLEM_INVALID_CLASSIFICATION: str = "invalid-classification"
PROBLEM_FILE_MISSING: str = "file-missing"
PROBLEM_NO_PATTERN: str = "no-allowlisted-pattern"

#: The subset of problems that make an entry *stale* per R7.5 (the referenced
#: file no longer exists, or no longer contains an allowlisted pattern).
STALE_PROBLEMS: frozenset = frozenset({PROBLEM_FILE_MISSING, PROBLEM_NO_PATTERN})


# --------------------------------------------------------------------------- #
# Path / leak normalisation helpers
# --------------------------------------------------------------------------- #


def _norm_path(path: Any) -> Optional[str]:
    """Normalise a repo-relative path for comparison, or ``None`` if unusable.

    Allowlist paths in ``docs/legacy-brand-allowlist.json`` are repo-root-relative
    and POSIX-style. Detected leaks may arrive with OS separators, so we fold
    backslashes to forward slashes and strip surrounding whitespace. Empty or
    non-string values normalise to ``None`` (no identifiable file).
    """
    if not isinstance(path, str):
        return None
    cleaned = path.strip().replace("\\", "/")
    return cleaned or None


def allowlist_paths(allowlist: Any) -> Set[str]:
    """Return the set of normalised allowlisted file paths from ``allowlist``.

    Accepts the parsed allowlist in any of the shapes a caller might hold:

    * a mapping with an ``"allowlist"`` list of entry mappings (the file shape),
    * a bare list/sequence of entry mappings (each with a ``"path"``), or
    * a list/set of path strings.

    Unrecognised or path-less items are skipped. Paths are normalised with
    :func:`_norm_path` so the comparison in :func:`leak_set_outside_allowlist`
    is separator-insensitive.
    """
    if allowlist is None:
        return set()

    entries: Sequence[Any]
    if isinstance(allowlist, Mapping):
        entries = allowlist.get("allowlist") or []
    elif isinstance(allowlist, (list, tuple, set, frozenset)):
        entries = list(allowlist)
    else:
        return set()

    paths: Set[str] = set()
    for entry in entries:
        if isinstance(entry, Mapping):
            candidate = _norm_path(entry.get("path"))
        else:
            candidate = _norm_path(entry)
        if candidate is not None:
            paths.add(candidate)
    return paths


def _normalize_leak(leak: Any) -> Tuple[Optional[str], Optional[str]]:
    """Normalise a single detected leak to a ``(path, pattern)`` tuple.

    A leak may be expressed as a bare path string, a ``(path, pattern)``
    tuple/list, or a mapping carrying a path under ``"path"``/``"file"``/
    ``"file_path"`` and the offending string under ``"pattern"``/``"string"``/
    ``"leak"``. ``path`` is normalised via :func:`_norm_path`; either element may
    be ``None`` when not supplied.
    """
    if isinstance(leak, str):
        return (_norm_path(leak), None)
    if isinstance(leak, Mapping):
        path = leak.get("path") or leak.get("file") or leak.get("file_path")
        pattern = leak.get("pattern") or leak.get("string") or leak.get("leak")
        return (_norm_path(path), pattern)
    if isinstance(leak, (tuple, list)) and leak:
        path = _norm_path(leak[0])
        pattern = leak[1] if len(leak) > 1 else None
        return (path, pattern)
    return (None, None)


# --------------------------------------------------------------------------- #
# Leak-set acceptance (R7.1 / R7.7)
# --------------------------------------------------------------------------- #


def leak_set_outside_allowlist(
    leaks: Sequence[Any],
    allowlist: Any,
) -> Set[Tuple[Optional[str], Optional[str]]]:
    """Return the set of leaks that occur **outside** the allowlist (R7.1/R7.7).

    A leak is "outside" the allowlist when the file it was found in is not one of
    the allowlisted paths. Each returned element is a normalised
    ``(path, pattern)`` tuple so the wrapper can record the leaking string and the
    file path (R7.7). A leak with no identifiable path can never be allowlisted
    and is therefore always counted as outside.

    The result is a ``set`` so that duplicate hits in the same file collapse to a
    single blocking entry; emptiness of this set is the pass condition.
    """
    allowed = allowlist_paths(allowlist)
    outside: Set[Tuple[Optional[str], Optional[str]]] = set()
    for leak in leaks or []:
        path, pattern = _normalize_leak(leak)
        if path is None or path not in allowed:
            outside.add((path, pattern))
    return outside


def brand_scan_passes(leaks: Sequence[Any], allowlist: Any) -> bool:
    """Return ``True`` iff no hard platform-brand leak exists outside the allowlist.

    This is the core acceptance rule of the Brand_Scan_Gate (R7.1, R7.7): the
    scan passes **iff** :func:`leak_set_outside_allowlist` is empty.
    """
    return len(leak_set_outside_allowlist(leaks, allowlist)) == 0


# --------------------------------------------------------------------------- #
# Allowlist JSON validity (R7.2 / R7.3)
# --------------------------------------------------------------------------- #


def allowlist_is_valid_json(text: Any) -> Tuple[bool, Optional[str]]:
    """Return ``(is_valid, error)`` for the allowlist's raw JSON ``text`` (R7.2/R7.3).

    The allowlist must be well-formed JSON. On success returns ``(True, None)``;
    on any parse failure (or a non-string input) returns ``(False, message)``
    with a human-readable error and never raises, so the wrapper can record the
    parse error and record no passing result (R7.3).
    """
    if not isinstance(text, (str, bytes, bytearray)):
        return (False, f"expected JSON text, got {type(text).__name__}")
    try:
        json.loads(text)
    except (json.JSONDecodeError, ValueError) as exc:
        return (False, str(exc))
    return (True, None)


# --------------------------------------------------------------------------- #
# Per-entry validity + staleness (R7.4 / R7.5 / R7.6)
# --------------------------------------------------------------------------- #


def entry_problems(
    entry: Any,
    file_exists: bool,
    file_contains_pattern: bool,
) -> List[str]:
    """Return the list of problem codes for a single allowlist ``entry``.

    Encodes R7.4 (one existing file, one valid classification, a live pattern)
    and R7.5 (staleness). The filesystem answers are **injected** as booleans so
    this function stays pure:

    * ``file_exists`` — whether the entry's referenced file currently exists.
    * ``file_contains_pattern`` — whether that file still contains at least one
      allowlisted pattern.

    An empty list means the entry is valid. Possible codes:
    :data:`PROBLEM_MALFORMED`, :data:`PROBLEM_MISSING_PATH`,
    :data:`PROBLEM_INVALID_CLASSIFICATION`, :data:`PROBLEM_FILE_MISSING`
    (stale), :data:`PROBLEM_NO_PATTERN` (stale).
    """
    if not isinstance(entry, Mapping):
        return [PROBLEM_MALFORMED]

    problems: List[str] = []

    path = entry.get("path")
    if not isinstance(path, str) or not path.strip():
        problems.append(PROBLEM_MISSING_PATH)

    if entry.get("classification") not in VALID_CLASSIFICATIONS:
        problems.append(PROBLEM_INVALID_CLASSIFICATION)

    # Staleness (R7.5): file-missing subsumes the pattern check, so only look at
    # the live-pattern condition when the file actually exists.
    if not file_exists:
        problems.append(PROBLEM_FILE_MISSING)
    elif not file_contains_pattern:
        problems.append(PROBLEM_NO_PATTERN)

    return problems


def entry_is_valid(
    entry: Any,
    file_exists: bool,
    file_contains_pattern: bool,
) -> bool:
    """Return ``True`` iff ``entry`` is a valid allowlist entry (R7.4).

    An entry is valid **iff** it references exactly one existing file, is
    classified as exactly one of :data:`VALID_CLASSIFICATIONS`, and currently
    contains at least one allowlisted (live) pattern — i.e. it has no problems
    per :func:`entry_problems`.
    """
    return not entry_problems(entry, file_exists, file_contains_pattern)


@dataclass(frozen=True)
class AllowlistValidation:
    """Immutable outcome of validating a whole allowlist (R7.4/R7.5)."""

    valid: bool
    invalid_entries: Tuple[dict, ...] = field(default_factory=tuple)
    stale_entries: Tuple[dict, ...] = field(default_factory=tuple)

    def to_checks(self) -> List[dict]:
        """Render the offending entries as Evidence_Artifact-style check rows."""
        return [
            {
                "id": f"allowlist-entry:{rec.get('path') or rec.get('index')}",
                "path": rec.get("path"),
                "problems": rec.get("problems", []),
                "result": "fail",
            }
            for rec in self.invalid_entries
        ]


def validate_allowlist(
    entries: Sequence[Any],
    file_exists_fn: Callable[[Optional[str]], bool],
    file_contains_pattern_fn: Callable[[Optional[str]], bool],
) -> AllowlistValidation:
    """Validate every allowlist entry, keeping filesystem access injected (R7.4/R7.5).

    Args:
        entries: the allowlist entry mappings (each ``{"path", "classification",
            ...}``).
        file_exists_fn: called with an entry's path; returns whether that file
            currently exists. Injected so this evaluator performs no I/O itself.
        file_contains_pattern_fn: called with an entry's path; returns whether
            that file still contains at least one allowlisted pattern.

    Returns:
        An :class:`AllowlistValidation`. ``valid`` is ``True`` **iff** every entry
        is valid (R7.4) — i.e. references one existing file, has exactly one valid
        classification, and contains a live pattern. ``invalid_entries`` lists
        every entry with at least one problem; ``stale_entries`` is the subset
        whose problems include staleness (file missing or no live pattern, R7.5).
        Each record carries ``path``, ``index``, and the ``problems`` list.
    """
    invalid: List[dict] = []
    stale: List[dict] = []

    for index, entry in enumerate(entries or []):
        path = entry.get("path") if isinstance(entry, Mapping) else None
        norm = _norm_path(path)

        exists = bool(file_exists_fn(path)) if norm is not None else False
        contains = (
            bool(file_contains_pattern_fn(path)) if (norm is not None and exists) else False
        )

        problems = entry_problems(entry, exists, contains)
        if not problems:
            continue

        record = {"index": index, "path": path, "problems": problems}
        invalid.append(record)
        if any(p in STALE_PROBLEMS for p in problems):
            stale.append(record)

    return AllowlistValidation(
        valid=not invalid,
        invalid_entries=tuple(invalid),
        stale_entries=tuple(stale),
    )
