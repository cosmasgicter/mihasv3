"""Brand drift guard for the Django backend (R2.1, R10).

Feature: beanola-production-readiness, Property 28: No non-allowlisted legacy brand string in active source

Scans ``backend/apps`` and ``backend/config`` for the legacy brand strings
MIHAS / KATC / Mukuba / Kalulushi and legacy MIHAS domains and fails —
reporting the offending file and line — for any hit in a file that is not
present in the shared ``docs/legacy-brand-allowlist.json`` Brand_Allowlist
(R2.1, R10.1, R10.3). ``backend/config`` is named in-scope by R2.1, so it is
scanned alongside ``backend/apps``. Allowlisted files are permitted to contain
those strings (R10.4).

This is the backend half of the guard. The frontend half lives at
``apps/admissions/tests/unit/brandDriftGuard.test.ts`` and reads the *same*
allowlist file, so the allowlist is the single source of truth.
"""

import json
from datetime import date
from pathlib import Path

from django.test import SimpleTestCase

# backend/tests/unit/test_brand_drift_guard.py -> repo root is parents[3].
REPO_ROOT = Path(__file__).resolve().parents[3]
ALLOWLIST_PATH = REPO_ROOT / "docs" / "legacy-brand-allowlist.json"
# R2.1 names both backend/apps and backend/config as in-scope active runtime
# source, so scan both roots.
SCAN_ROOTS = (
    REPO_ROOT / "backend" / "apps",
    REPO_ROOT / "backend" / "config",
)

# Legacy brand strings that must not reappear in non-allowlisted production
# source. Kept in sync with docs/legacy-brand-allowlist.json -> "patterns".
BRAND_PATTERNS = (
    "MIHAS",
    "KATC",
    "Mukuba",
    "Kalulushi",
    "apply.mihas.edu.zm",
    "mihas.edu.zm",
    "mihas.beanola.com",
    "mihas.local",
    "mihas:",
    "mihas_",
    "mihas-",
)

# Only scan real source files; skip caches and compiled artifacts.
_SCANNED_SUFFIXES = {".py", ".md", ".txt", ".html", ".json", ".cfg", ".ini"}
_SKIP_DIR_NAMES = {"__pycache__", ".pytest_cache", "migrations"}

# --------------------------------------------------------------------------- #
# Owner and removal date — admissions-v2 task 12.5 pass 2 (finding GATE-13.6-01)
# --------------------------------------------------------------------------- #
#
# Set under the user's authorization, on behalf of this register's owning spec.
# Every entry is in exactly ONE of two populations (docs/legacy-brand-allowlist.json
# "legacyExceptionPolicy"):
#
# * a Legacy_Exception — ``owner`` + ``removeBy``, where ``removeBy`` IS task 12.2's
#   announced window, read here from the canonical register; or
# * permanent by design — ``owner`` + ``reviewBucket`` (task 12.5's vocabulary) +
#   ``permanentBecause``, and no removal date, because a date would assert a
#   removal nobody intends (the way ``DECLINED_REMOVALS`` is kept undated).
#
# This replaces the blanket ``removeBy > date.today()`` check M11 Q12 flagged
# (docs/v2-evidence/13.6/remediation/M11/README.md): that put a time bomb on ten
# entries whose own reason says "Cannot be removed" and checked an owner that
# no record named. The mechanism is task 13.6 item L10's, applied unchanged
# (docs/v2-evidence/13.6/remediation/L9-L11/README.md §4.4).

#: Owner -> the repo record that names it. Not coined here:
#:
#: * ``beanola-production-readiness`` — both brand guards carry its Property 28,
#:   its task 3.2 wrote each pre-12.5 entry's classification and reason (R2.4),
#:   and GATE-13.6-01 names it as this register's owning lane;
#: * ``platform-admissions`` — admissions-v2, the owner string
#:   ``compatibility_register.py`` already uses for this spec; it registered three
#:   entries (docs/v2-evidence/12.5/README.md §2.5).
OWNER_PROVENANCE = {
    "beanola-production-readiness": ".kiro/specs/_archived/beanola-production-readiness",
    "platform-admissions": "backend/apps/common/compatibility_register.py",
}

#: Task 12.5's buckets an entry may be reclassified into when it is permanent by
#: design. ``registered-exception`` and ``unregistered`` are the other population
#: and the verdict; ``dev-preview`` is deliberately absent, because the client
#: preview surface is itself dated (documentFlowDriftGuard's PREVIEW_ALLOWLIST).
PERMANENT_BUCKETS = frozenset({"canonical", "test-fixture", "immutable-evidence", "comment"})

#: The removal date's source — the same COMPATIBILITY_SURFACES entry the SHIMS
#: register reads (test_compatibility_surfaces_12_2.SHIM_REMOVAL_DATE_SOURCE), so
#: every dated register carries one date with one place to change it.
WINDOW_SOURCE = "catalog.legacy_institution_write"


def _announced_window_end() -> str:
    """Task 12.2's announced window end, read from the canonical register."""
    from apps.common.compatibility_register import COMPATIBILITY_SURFACES

    return COMPATIBILITY_SURFACES[WINDOW_SOURCE].end_date


def _load_entries() -> list[dict]:
    with ALLOWLIST_PATH.open(encoding="utf-8") as fh:
        return json.load(fh).get("allowlist", [])


def _is_legacy_exception(entry: dict) -> bool:
    return "removeBy" in entry


def _is_permanent(entry: dict) -> bool:
    return "reviewBucket" in entry or "permanentBecause" in entry


def _load_allowlist() -> set[str]:
    """Return the set of repo-root-relative allowlisted paths."""
    with ALLOWLIST_PATH.open(encoding="utf-8") as fh:
        data = json.load(fh)
    return {entry["path"] for entry in data.get("allowlist", [])}


def _iter_source_files():
    for scan_root in SCAN_ROOTS:
        if not scan_root.exists():
            continue
        for path in sorted(scan_root.rglob("*")):
            if not path.is_file():
                continue
            if any(part in _SKIP_DIR_NAMES for part in path.relative_to(REPO_ROOT).parts):
                continue
            if path.suffix.lower() not in _SCANNED_SUFFIXES:
                continue
            yield path


def _scan_for_violations(allowlist: set[str]) -> list[str]:
    """Return human-readable 'path:line: snippet' violation strings."""
    violations: list[str] = []
    for path in _iter_source_files():
        rel = path.relative_to(REPO_ROOT).as_posix()
        if rel in allowlist:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for lineno, line in enumerate(text.splitlines(), start=1):
            for pattern in BRAND_PATTERNS:
                if pattern in line:
                    violations.append(f"{rel}:{lineno}: {line.strip()[:160]}")
                    break
    return violations


class BrandDriftGuardTests(SimpleTestCase):
    """R2.1/R10 — no non-allowlisted legacy brand strings under backend/apps or backend/config."""

    def test_allowlist_file_is_present_and_well_formed(self):
        self.assertTrue(
            ALLOWLIST_PATH.exists(),
            f"Brand_Allowlist not found at {ALLOWLIST_PATH}",
        )
        with ALLOWLIST_PATH.open(encoding="utf-8") as fh:
            data = json.load(fh)
        self.assertIn("allowlist", data)
        self.assertIsInstance(data["allowlist"], list)
        for entry in data["allowlist"]:
            self.assertIn("path", entry, f"allowlist entry missing 'path': {entry}")
            self.assertIn("reason", entry, f"allowlist entry missing 'reason': {entry}")
        # Owner and removal date are evaluated by the two tests below, per
        # population — not here, where a blanket date check would expire the
        # entries that are permanent by design.
        # Patterns in the file must match what this guard enforces.
        self.assertEqual(tuple(data.get("patterns", [])), BRAND_PATTERNS)

    def test_every_entry_is_a_dated_legacy_exception_or_permanent_by_design(self):
        """Exactly one population per entry, and an owner with a record (12.5 clause)."""
        problems: list[str] = []
        for entry in _load_entries():
            path = entry.get("path", "<no path>")
            exception, permanent = _is_legacy_exception(entry), _is_permanent(entry)
            if exception == permanent:
                problems.append(
                    f"{path}: must be EITHER a Legacy_Exception (owner + removeBy) OR "
                    "permanent by design (owner + reviewBucket + permanentBecause) — "
                    f"it is {'both' if exception else 'neither'}"
                )
                continue
            owner = (entry.get("owner") or "").strip()
            record = OWNER_PROVENANCE.get(owner)
            if record is None:
                problems.append(
                    f"{path}: owner {owner!r} has no record in OWNER_PROVENANCE — name the "
                    "lane that owns the entry, not an invented one"
                )
            elif not (REPO_ROOT / record).exists():
                problems.append(f"{path}: owner {owner!r}'s record {record} is missing")
            if permanent:
                if entry.get("reviewBucket") not in PERMANENT_BUCKETS:
                    problems.append(
                        f"{path}: reviewBucket {entry.get('reviewBucket')!r} is not one of "
                        f"{sorted(PERMANENT_BUCKETS)}"
                    )
                if not (entry.get("permanentBecause") or "").strip():
                    problems.append(f"{path}: permanent by design, but permanentBecause is empty")
        self.assertEqual(
            problems,
            [],
            "Brand_Allowlist populations (docs/legacy-brand-allowlist.json "
            "legacyExceptionPolicy):\n  " + "\n  ".join(problems),
        )

    def test_legacy_exceptions_carry_the_announced_window(self):
        """Every dated entry is on task 12.2's window, and the window is evaluated.

        Parity first: a JSON literal is a copy, and a drifted copy would announce
        two windows for one decision. Then the window itself: once it closes this
        test fails ON PURPOSE, naming the two legitimate answers — the same
        mechanism the SHIMS, LEGACY_EXCEPTIONS and PREVIEW_ALLOWLIST registers use.
        """
        window_end = _announced_window_end()
        exceptions = [e for e in _load_entries() if _is_legacy_exception(e)]
        if not exceptions:
            # Every remaining entry is permanent by design: there is no window to
            # hold, and a closed window must not fail a register with nothing dated.
            return
        drift = [
            f"{e.get('path')}: removeBy {e.get('removeBy')!r}"
            for e in exceptions
            if e.get("removeBy") != window_end
        ]
        self.assertEqual(
            drift,
            [],
            f"These removeBy values are not the announced window {window_end} "
            f"(compatibility_register.COMPATIBILITY_SURFACES[{WINDOW_SOURCE!r}].end_date). "
            "One decision, one window: change the register and let this guard carry the "
            "change to the allowlist.\n  " + "\n  ".join(drift),
        )
        today = date.today()
        self.assertGreaterEqual(
            date.fromisoformat(window_end),
            today,
            f"The announced window for {len(exceptions)} Brand_Allowlist Legacy_Exceptions "
            f"closed on {window_end} (today {today.isoformat()}). The two legitimate answers: "
            "remove the brand strings and delete their entries, or announce a new window in "
            "apps/common/compatibility_register.py on purpose and move removeBy with it.\n  "
            + "\n  ".join(e["path"] for e in exceptions),
        )

    def test_no_non_allowlisted_brand_strings_in_backend_apps(self):
        allowlist = _load_allowlist()
        violations = _scan_for_violations(allowlist)
        self.assertEqual(
            violations,
            [],
            "Legacy brand strings/domains found in non-allowlisted backend source "
            "(backend/apps or backend/config). Either remove the brand "
            "fallback (R9) or, if this is legitimate tenant/seed/historical data, "
            "add the file to docs/legacy-brand-allowlist.json with a reason "
            "(R10.2).\nOffending hits:\n  " + "\n  ".join(violations),
        )

    def test_allowlist_entries_still_contain_a_brand_string(self):
        """Keep the allowlist small (R10.2): drop entries that no longer match."""
        allowlist = _load_allowlist()
        stale: list[str] = []
        for rel in sorted(allowlist):
            if not rel.startswith("backend/"):
                continue  # frontend entries are validated by the TS guard
            path = REPO_ROOT / rel
            if not path.exists():
                stale.append(f"{rel} (file missing)")
                continue
            text = path.read_text(encoding="utf-8")
            if not any(pat in text for pat in BRAND_PATTERNS):
                stale.append(f"{rel} (no brand string present)")
        self.assertEqual(
            stale,
            [],
            "Stale Brand_Allowlist entries — remove these from "
            "docs/legacy-brand-allowlist.json:\n  " + "\n  ".join(stale),
        )
