#!/usr/bin/env python3
"""Gate 7 — Brand_Scan_Gate execution wrapper.

This is the **integration/execution wrapper** around the pure
:mod:`brand_eval` core (task 9.1). The pure core performs *no* I/O — it only
evaluates predicates over already-collected facts. This wrapper does the actual
filesystem work the gate needs:

1. **Scan** the guard-defined active source paths for the hard platform-brand
   :data:`brand_eval.BRAND_PATTERNS`, collecting every hit as a
   ``(path, pattern)`` leak. The scanned paths and file-type rules are taken
   verbatim from the two brand drift guards so this gate and the guards stay in
   lock-step:

   * frontend (``apps/admissions/tests/unit/brandDriftGuard.test.ts``):
     every file under ``apps/admissions/src`` plus ``apps/admissions/index.html``
     with a ``.ts/.tsx/.js/.jsx/.css/.html/.md/.json`` extension;
   * backend (``backend/tests/unit/test_brand_drift_guard.py``):
     every ``.py/.md/.txt/.html/.json/.cfg/.ini`` file under ``backend/apps`` and
     ``backend/config``, skipping ``__pycache__`` / ``.pytest_cache`` /
     ``migrations`` directories.

2. **Load + validate** ``docs/legacy-brand-allowlist.json``. JSON validity is
   checked **first** via :func:`brand_eval.allowlist_is_valid_json`; if the
   allowlist is not valid JSON the gate records the parse error, emits **no
   passing result** (status ``failed``), and exits non-zero (R7.3).

3. **Compute** the leaks that fall *outside* the allowlist via
   :func:`brand_eval.leak_set_outside_allowlist` (R7.1/R7.7), and **validate**
   every allowlist entry for validity + staleness via
   :func:`brand_eval.validate_allowlist`, supplying *real* ``file_exists`` /
   ``file_contains_pattern`` callables (R7.4/R7.5).

4. **Emit** ``docs/launch-evidence/07-brand/brand-evidence.json`` through the
   shared Evidence_Artifact envelope (``gate_id="brand"``, ``requirement="R7"``,
   ``generated_by="ci"``) and through the shared redaction helper. The gate
   **passes iff** there are zero leaks outside the allowlist **and** the
   allowlist is valid JSON **and** there are no stale/invalid entries
   (R7.1/R7.7). Any leak, parse error, or stale/invalid entry yields a
   non-zero exit.

The pure :mod:`brand_eval` core is imported from this same directory; the shared
Evidence_Artifact envelope + redaction helper are imported from ``backend/`` via
a robust ``sys.path`` insert (the same pattern :mod:`rollup` uses).

**Validates: Requirements 7.1, 7.2, 7.3, 7.5, 7.7**
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Set, Tuple

# ---------------------------------------------------------------------------
# Locate the repo root and wire up imports (pure core + shared schema/redaction)
# ---------------------------------------------------------------------------
#
# This script lives at ``<repo>/scripts/launch-verification/run-brand-scan.py``.
#   * the pure core ``brand_eval`` is its sibling in this directory;
#   * the evidence envelope + redaction helper live under ``<repo>/backend`` as
#     ``apps.common.launch_verification.{evidence,redaction}``.
# We resolve everything from this file's location so imports are robust
# regardless of the current working directory.

_THIS_FILE = Path(__file__).resolve()
_SCRIPT_DIR = _THIS_FILE.parent
# parents[0] = scripts/launch-verification, [1] = scripts, [2] = repo root
REPO_ROOT = _THIS_FILE.parents[2]
_BACKEND_DIR = REPO_ROOT / "backend"


def _ensure_on_path(directory: Path) -> None:
    """Insert ``directory`` at the front of ``sys.path`` if not already present."""
    as_str = str(directory)
    if as_str not in sys.path:
        sys.path.insert(0, as_str)


_ensure_on_path(_SCRIPT_DIR)
_ensure_on_path(_BACKEND_DIR)

try:
    import brand_eval  # noqa: E402  (sibling pure core)
except ImportError as exc:  # pragma: no cover - defensive, surfaces a clear error
    raise SystemExit(
        "launch-verification brand scan: could not import the pure core "
        f"brand_eval from {_SCRIPT_DIR}/brand_eval.py — {exc}"
    )

try:
    from apps.common.launch_verification.evidence import (  # noqa: E402
        EvidenceArtifact,
        EvidenceCheck,
        to_dict,
    )
    from apps.common.launch_verification.redaction import redact  # noqa: E402
except ImportError as exc:  # pragma: no cover - defensive, surfaces a clear error
    raise SystemExit(
        "launch-verification brand scan: could not import the evidence schema / "
        f"redaction helper from {_BACKEND_DIR}/apps/common/launch_verification/ — {exc}"
    )

import json  # noqa: E402  (after sys.path setup, std-lib)


# ---------------------------------------------------------------------------
# Guard-defined active scan surface (verbatim from the two brand drift guards)
# ---------------------------------------------------------------------------

ALLOWLIST_REL = "docs/legacy-brand-allowlist.json"
EVIDENCE_REL = "docs/launch-evidence/07-brand/brand-evidence.json"

# Frontend guard surface (brandDriftGuard.test.ts).
_FRONTEND_SRC_DIR = REPO_ROOT / "apps" / "admissions" / "src"
_FRONTEND_INDEX_HTML = REPO_ROOT / "apps" / "admissions" / "index.html"
_FRONTEND_EXT_RE = re.compile(r"\.(ts|tsx|js|jsx|css|html|md|json)$")

# Backend guard surface (test_brand_drift_guard.py).
_BACKEND_SCAN_ROOTS = (
    REPO_ROOT / "backend" / "apps",
    REPO_ROOT / "backend" / "config",
)
_BACKEND_SUFFIXES = {".py", ".md", ".txt", ".html", ".json", ".cfg", ".ini"}
_BACKEND_SKIP_DIR_NAMES = {"__pycache__", ".pytest_cache", "migrations"}


def _rel(path: Path) -> str:
    """Return a repo-root-relative POSIX path string."""
    return path.relative_to(REPO_ROOT).as_posix()


def _iter_frontend_files() -> List[Path]:
    files: List[Path] = []
    if _FRONTEND_SRC_DIR.exists():
        for path in sorted(_FRONTEND_SRC_DIR.rglob("*")):
            if path.is_file() and _FRONTEND_EXT_RE.search(path.name):
                files.append(path)
    if _FRONTEND_INDEX_HTML.is_file():
        files.append(_FRONTEND_INDEX_HTML)
    return files


def _iter_backend_files() -> List[Path]:
    files: List[Path] = []
    for scan_root in _BACKEND_SCAN_ROOTS:
        if not scan_root.exists():
            continue
        for path in sorted(scan_root.rglob("*")):
            if not path.is_file():
                continue
            parts = path.relative_to(REPO_ROOT).parts
            if any(part in _BACKEND_SKIP_DIR_NAMES for part in parts):
                continue
            if path.suffix.lower() not in _BACKEND_SUFFIXES:
                continue
            files.append(path)
    return files


def scan_source_for_leaks() -> Tuple[List[Tuple[str, str]], int]:
    """Scan the guard-defined active source paths for hard platform-brand leaks.

    Returns ``(leaks, files_scanned)`` where ``leaks`` is a sorted list of
    ``(repo_relative_path, pattern)`` tuples — one per distinct (file, pattern)
    hit — and ``files_scanned`` is the total number of files inspected. This is
    the gate's actual filesystem I/O; the verdict over these facts is delegated
    to the pure :mod:`brand_eval` core.
    """
    patterns: Sequence[str] = brand_eval.BRAND_PATTERNS
    leaks: Set[Tuple[str, str]] = set()
    files = _iter_frontend_files() + _iter_backend_files()

    for path in files:
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        rel = _rel(path)
        for pattern in patterns:
            if pattern in text:
                leaks.add((rel, pattern))

    return sorted(leaks), len(files)


# ---------------------------------------------------------------------------
# Real filesystem callables injected into the pure validator (R7.4/R7.5)
# ---------------------------------------------------------------------------


def _make_fs_callables():
    """Build ``(file_exists, file_contains_pattern)`` callables over the real repo."""

    def file_exists(path: Optional[str]) -> bool:
        if not isinstance(path, str) or not path.strip():
            return False
        return (REPO_ROOT / path).is_file()

    def file_contains_pattern(path: Optional[str]) -> bool:
        if not isinstance(path, str) or not path.strip():
            return False
        target = REPO_ROOT / path
        try:
            text = target.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            return False
        return any(pat in text for pat in brand_eval.BRAND_PATTERNS)

    return file_exists, file_contains_pattern


# ---------------------------------------------------------------------------
# Evidence assembly
# ---------------------------------------------------------------------------


def build_artifact(
    *,
    allowlist_rel: str = ALLOWLIST_REL,
) -> Tuple[EvidenceArtifact, bool]:
    """Run the full brand scan and build the Evidence_Artifact.

    Returns ``(artifact, passed)``. ``passed`` is ``True`` **iff** the allowlist
    is valid JSON, there are zero leaks outside the allowlist, and there are no
    invalid/stale allowlist entries.
    """
    leaks, files_scanned = scan_source_for_leaks()
    allowlist_path = REPO_ROOT / allowlist_rel

    checks: List[EvidenceCheck] = []
    failures: List[Dict] = []

    # ---- Step 1: allowlist JSON validity FIRST (R7.2/R7.3) ----------------
    try:
        raw_text = allowlist_path.read_text(encoding="utf-8")
    except OSError as exc:
        raw_text = None
        json_ok, json_err = False, f"allowlist unreadable: {exc}"
    else:
        json_ok, json_err = brand_eval.allowlist_is_valid_json(raw_text)

    checks.append(
        EvidenceCheck(
            id="allowlist-json-valid",
            result="pass" if json_ok else "fail",
            observed="valid" if json_ok else "invalid",
            threshold="valid JSON",
            detail="" if json_ok else f"parse error: {json_err}",
            fields={"allowlist": allowlist_rel},
        )
    )

    # A parse error means we cannot trust the allowlist at all: record it and
    # emit NO passing result (R7.3). We still report the raw leak count found so
    # the artifact is informative, but the gate fails.
    if not json_ok:
        failures.append(
            {
                "type": "allowlist-parse-error",
                "allowlist": allowlist_rel,
                "error": str(json_err),
            }
        )
        # Record the leak surface scanned even though the allowlist is unusable.
        checks.append(
            EvidenceCheck(
                id="brand-leak-scan",
                result="not-measured",
                observed=f"{len(leaks)} raw hit(s)",
                threshold="0 outside allowlist",
                detail="allowlist invalid — leak set outside allowlist not evaluable",
                fields={"files_scanned": files_scanned},
            )
        )
        artifact = EvidenceArtifact(
            gate_id="brand",
            requirement="R7",
            status="failed",
            generated_by="ci",
            summary=(
                f"Brand_Scan_Gate FAILED: {allowlist_rel} is not valid JSON "
                f"({json_err}). No passing result recorded (R7.3)."
            ),
            checks=checks,
            assets=[allowlist_rel],
            failures=failures,
        )
        return artifact, False

    # ---- Step 2: leaks outside the allowlist (R7.1/R7.7) ------------------
    parsed = json.loads(raw_text)  # safe: validity already confirmed above
    outside = brand_eval.leak_set_outside_allowlist(leaks, parsed)
    outside_sorted = sorted(
        ((p or "<no-path>", pat or "<no-pattern>") for p, pat in outside)
    )

    checks.append(
        EvidenceCheck(
            id="brand-leak-scan",
            result="pass" if not outside else "fail",
            observed=f"{len(outside)} leak(s) outside allowlist",
            threshold="0",
            detail=(
                ""
                if not outside
                else "hard platform-brand strings found outside the Brand_Allowlist"
            ),
            fields={
                "files_scanned": files_scanned,
                "total_hits": len(leaks),
                "leaks_outside_allowlist": len(outside),
            },
        )
    )
    for path, pattern in outside_sorted:
        failures.append({"type": "brand-leak", "path": path, "pattern": pattern})

    # ---- Step 3: per-entry validity + staleness (R7.4/R7.5) ---------------
    entries = parsed.get("allowlist", []) if isinstance(parsed, dict) else []
    file_exists, file_contains_pattern = _make_fs_callables()
    validation = brand_eval.validate_allowlist(
        entries, file_exists, file_contains_pattern
    )

    checks.append(
        EvidenceCheck(
            id="allowlist-entries-valid",
            result="pass" if validation.valid else "fail",
            observed=f"{len(validation.invalid_entries)} invalid entry(ies)",
            threshold="0",
            detail=(
                ""
                if validation.valid
                else "allowlist entries failed the single-file/one-class/live-pattern rule"
            ),
            fields={"entry_count": len(entries)},
        )
    )
    checks.append(
        EvidenceCheck(
            id="allowlist-staleness",
            result="pass" if not validation.stale_entries else "fail",
            observed=f"{len(validation.stale_entries)} stale entry(ies)",
            threshold="0",
            detail=(
                ""
                if not validation.stale_entries
                else "allowlist entries reference a missing file or no longer contain a live pattern (R7.5)"
            ),
        )
    )
    for rec in validation.invalid_entries:
        failures.append(
            {
                "type": "stale-entry"
                if any(p in brand_eval.STALE_PROBLEMS for p in rec.get("problems", []))
                else "invalid-entry",
                "path": rec.get("path"),
                "index": rec.get("index"),
                "problems": rec.get("problems", []),
            }
        )

    # ---- Verdict: pass iff no leaks outside AND valid JSON AND no bad entries
    passed = (not outside) and json_ok and validation.valid

    if passed:
        summary = (
            f"Brand_Scan_Gate PASSED: scanned {files_scanned} active source file(s); "
            f"0 hard-brand leaks outside the Brand_Allowlist; "
            f"{len(entries)} allowlist entry(ies) all valid and live."
        )
    else:
        bits: List[str] = []
        if outside:
            bits.append(f"{len(outside)} leak(s) outside allowlist")
        if validation.invalid_entries:
            bits.append(f"{len(validation.invalid_entries)} invalid entry(ies)")
        if validation.stale_entries:
            bits.append(f"{len(validation.stale_entries)} stale entry(ies)")
        summary = (
            f"Brand_Scan_Gate FAILED: scanned {files_scanned} active source file(s); "
            + "; ".join(bits)
            + "."
        )

    artifact = EvidenceArtifact(
        gate_id="brand",
        requirement="R7",
        status="passed" if passed else "failed",
        generated_by="ci",
        summary=summary,
        checks=checks,
        assets=[allowlist_rel],
        failures=failures,
    )
    return artifact, passed


def write_artifact(artifact: EvidenceArtifact, output_path: Path) -> None:
    """Write the artifact to ``output_path`` as redacted, pretty JSON."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    # Route the whole envelope through the shared redaction helper so no secret
    # value can ever land in the evidence store (design Property 16).
    payload = redact(to_dict(artifact))
    output_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------


def _default_output() -> Path:
    return REPO_ROOT / EVIDENCE_REL


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="run-brand-scan.py",
        description=(
            "Gate 7 Brand_Scan_Gate: scan the guard-defined active source paths "
            "for hard platform-brand leaks, validate the Brand_Allowlist, and "
            "emit the brand evidence artifact."
        ),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help=f"Output path for the evidence artifact (default: <repo>/{EVIDENCE_REL}).",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    """CLI: run the brand scan, write the artifact, return the exit code.

    Returns ``0`` only when the gate passes; a leak outside the allowlist, an
    allowlist parse error, or a stale/invalid entry all return ``1`` so CI fails
    closed (R7.3/R7.7).
    """
    args = build_arg_parser().parse_args(argv)
    output_path: Path = args.output or _default_output()

    artifact, passed = build_artifact()
    write_artifact(artifact, output_path)

    print(f"launch-verification brand scan: {artifact.status}")
    print(f"  summary: {artifact.summary}")
    print(f"  written: {output_path}")
    if artifact.failures:
        print(f"  failures: {len(artifact.failures)}")
        for failure in artifact.failures[:20]:
            print(f"    - {failure}")
        if len(artifact.failures) > 20:
            print(f"    ... and {len(artifact.failures) - 20} more")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
