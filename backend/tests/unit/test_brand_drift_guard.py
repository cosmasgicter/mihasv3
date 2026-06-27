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
        # Patterns in the file must match what this guard enforces.
        self.assertEqual(tuple(data.get("patterns", [])), BRAND_PATTERNS)

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
