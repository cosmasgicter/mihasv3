#!/usr/bin/env python3
"""Gate 3 — Performance_Gate API timing sampler + evidence combiner.

┌────────────────────────────────────────────────────────────────────────────┐
│ DEPLOYED-TARGET collector. Operator-run / scheduled. NOT auto-run in CI.     │
│ Requires a live, deployed staging/production-like target. python3 only.      │
└────────────────────────────────────────────────────────────────────────────┘

Responsibilities
----------------
1. **Sample** at least ``MIN_API_SAMPLES`` (100) request latencies per surface
   across the twelve API surfaces taken verbatim from the postmortem
   performance section (Requirement 3.4). It computes **nothing** itself —
   percentile/threshold logic lives entirely in the pure evaluator
   ``performance_eval`` so it stays property-testable without a live API.
2. Write a **timings CSV** (one row per sampled request) under
   ``docs/launch-evidence/03-performance/timings.csv`` (Requirement 3.5).
3. **Combine** the Lighthouse run-scores JSON (from ``run-lighthouse.mjs``) and
   the API samples, call ``performance_eval.evaluate_performance(...)``, and
   write the Performance_Gate ``Evidence_Artifact`` to
   ``docs/launch-evidence/03-performance/performance-evidence.json`` through the
   shared envelope (``from_dict`` validation + ``to_json``).

No live calls happen in the sandbox: sampling is isolated in ``collect_samples``
and a ``--synthetic`` dry-run path lets the combiner be exercised over small
in-memory inputs to confirm it emits a valid envelope JSON.

Per-surface p95 targets
------------------------
``P95_TARGETS_MS`` documents a sensible p95 budget for each of the twelve
surfaces. Lightweight context/status reads get tight budgets; third-party
payment initiation and file downloads get looser ones. Operators may override a
target from a JSON file via ``--targets`` without touching this module.

Validates: Requirements 3.1, 3.4, 3.5 (collector + combiner half of Gate 3).
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

# --------------------------------------------------------------------------- #
# Imports: the pure evaluator (same dir) + the shared envelope (backend/).
# --------------------------------------------------------------------------- #

_THIS_FILE = Path(__file__).resolve()
_SCRIPT_DIR = _THIS_FILE.parent
# parents[0] = scripts/launch-verification, [1] = scripts, [2] = repo root
REPO_ROOT = _THIS_FILE.parents[2]
_BACKEND_DIR = REPO_ROOT / "backend"

if str(_SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPT_DIR))
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

import performance_eval as perf  # noqa: E402

try:
    from apps.common.launch_verification.evidence import (  # noqa: E402
        EvidenceArtifactError,
        from_dict,
        to_json,
    )
except ImportError as exc:  # pragma: no cover - defensive
    raise SystemExit(
        "sample-api-timings: could not import the evidence envelope from "
        f"{_BACKEND_DIR}/apps/common/launch_verification/evidence.py — {exc}"
    )


# --------------------------------------------------------------------------- #
# Surface endpoints + documented p95 targets.
# --------------------------------------------------------------------------- #

#: Map each of the twelve surfaces to a representative (method, path) under
#: ``/api/v1/``. Paths are best-effort defaults an operator can override with a
#: ``--endpoints`` JSON file; the surface *names* are the verbatim contract and
#: must stay aligned with ``performance_eval.API_SURFACES``.
SURFACE_ENDPOINTS: Dict[str, Tuple[str, str]] = {
    "tenant context": ("GET", "/api/v1/meta/platform/"),
    "catalog offerings": ("GET", "/api/v1/catalog/programs/"),
    "draft save": ("PATCH", "/api/v1/applications/{application_id}/"),
    "application submit": ("POST", "/api/v1/applications/{application_id}/submit/"),
    "payment init": ("POST", "/api/v1/payments/initiate/"),
    "payment status": ("GET", "/api/v1/payments/{payment_id}/"),
    "tenant admin list": ("GET", "/api/v1/applications/"),
    "tenant admin detail": ("GET", "/api/v1/applications/{application_id}/"),
    "official document queue": ("GET", "/api/v1/applications/{application_id}/documents/"),
    "official document status": ("GET", "/api/v1/documents/{document_id}/"),
    "official document download": ("GET", "/api/v1/documents/{document_id}/download/"),
    "settlement summary": ("GET", "/api/v1/analytics/funnel/"),
}

#: Documented per-surface p95 budgets in milliseconds (Requirement 3.4/3.5).
#: Tight budgets for lightweight reads; looser budgets for heavy writes,
#: third-party payment initiation, and file downloads. Override via ``--targets``.
P95_TARGETS_MS: Dict[str, float] = {
    "tenant context": 300.0,
    "catalog offerings": 500.0,
    "draft save": 500.0,
    "application submit": 1500.0,
    "payment init": 2000.0,
    "payment status": 500.0,
    "tenant admin list": 800.0,
    "tenant admin detail": 600.0,
    "official document queue": 800.0,
    "official document status": 500.0,
    "official document download": 2000.0,
    "settlement summary": 1000.0,
}

#: CSV header for the raw timing file.
CSV_FIELDS = ("surface", "method", "path", "sample_index", "latency_ms", "http_status")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --------------------------------------------------------------------------- #
# Sampling (impure; isolated so the combiner stays sandbox-safe).
# --------------------------------------------------------------------------- #


@dataclass
class SampleRow:
    """One sampled request: a latency reading for a surface."""

    surface: str
    method: str
    path: str
    sample_index: int
    latency_ms: float
    http_status: int


def _one_request_latency(
    url: str,
    method: str,
    headers: Dict[str, str],
    timeout_s: float,
) -> Tuple[float, int]:
    """Issue a single request and return (latency_ms, http_status).

    A transport error is recorded as a 0-status, high-latency reading so a
    failing surface degrades toward *fail*, never a silent pass. Only ever
    called from the live ``collect_samples`` path — never in the sandbox.
    """
    req = urllib.request.Request(url, method=method, headers=headers)
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:  # noqa: S310
            resp.read()
            status = resp.status
    except urllib.error.HTTPError as exc:
        status = exc.code
    except (urllib.error.URLError, TimeoutError, OSError):
        status = 0
    latency_ms = (time.perf_counter() - start) * 1000.0
    return latency_ms, status


def collect_samples(
    base_url: str,
    *,
    surfaces: Sequence[str] = perf.API_SURFACES,
    endpoints: Optional[Dict[str, Tuple[str, str]]] = None,
    samples_per_surface: int = perf.MIN_API_SAMPLES,
    headers: Optional[Dict[str, str]] = None,
    path_params: Optional[Dict[str, str]] = None,
    timeout_s: float = 10.0,
) -> List[SampleRow]:
    """Sample ``samples_per_surface`` request latencies for every surface.

    DEPLOYED-TARGET only — performs live HTTP and is never invoked in CI or the
    sandbox (the combiner reads pre-collected samples or runs ``--synthetic``).
    Surfaces whose path still contains an unresolved ``{...}`` placeholder are
    recorded with a 0-status sentinel reading so they surface as not-measurable
    rather than silently passing.
    """
    endpoints = endpoints or SURFACE_ENDPOINTS
    headers = dict(headers or {})
    path_params = path_params or {}
    rows: List[SampleRow] = []

    for surface in surfaces:
        method, path_template = endpoints.get(surface, ("GET", ""))
        path = path_template
        for key, value in path_params.items():
            path = path.replace("{" + key + "}", value)
        resolvable = path and "{" not in path
        url = base_url.rstrip("/") + path
        for i in range(samples_per_surface):
            if resolvable:
                latency_ms, status = _one_request_latency(url, method, headers, timeout_s)
            else:
                latency_ms, status = (float(timeout_s * 1000.0), 0)
            rows.append(
                SampleRow(
                    surface=surface,
                    method=method,
                    path=path or path_template,
                    sample_index=i,
                    latency_ms=round(latency_ms, 3),
                    http_status=status,
                )
            )
    return rows


# --------------------------------------------------------------------------- #
# CSV + samples grouping (pure).
# --------------------------------------------------------------------------- #


def write_timings_csv(rows: Sequence[SampleRow], csv_path: Path) -> None:
    """Write one row per sampled request to ``csv_path`` (creates parent dirs)."""
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(CSV_FIELDS)
        for r in rows:
            writer.writerow(
                [r.surface, r.method, r.path, r.sample_index, r.latency_ms, r.http_status]
            )


def read_timings_csv(csv_path: Path) -> List[SampleRow]:
    """Load sampled rows back from a timings CSV (for the combiner)."""
    rows: List[SampleRow] = []
    with csv_path.open("r", newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for rec in reader:
            rows.append(
                SampleRow(
                    surface=rec["surface"],
                    method=rec["method"],
                    path=rec["path"],
                    sample_index=int(rec["sample_index"]),
                    latency_ms=float(rec["latency_ms"]),
                    http_status=int(rec["http_status"]),
                )
            )
    return rows


def group_latencies(rows: Sequence[SampleRow]) -> Dict[str, List[float]]:
    """Group sample rows into ``{surface: [latency_ms, ...]}`` order-preserving."""
    grouped: Dict[str, List[float]] = {}
    for r in rows:
        grouped.setdefault(r.surface, []).append(r.latency_ms)
    return grouped


# --------------------------------------------------------------------------- #
# Lighthouse run-scores loading (pure).
# --------------------------------------------------------------------------- #


def load_lighthouse_inputs(
    run_scores_path: Path,
) -> Tuple[List[Tuple[str, str, List[float]]], List[str]]:
    """Read the run-scores JSON emitted by ``run-lighthouse.mjs``.

    Returns ``(lighthouse_inputs, assets)`` where ``lighthouse_inputs`` is the
    ``(route, route_class, run_scores)`` triples the evaluator consumes and
    ``assets`` are the raw Lighthouse HTML/JSON paths (relative to the perf dir).
    A missing/invalid file yields empty run-scores for every route so the
    evaluator marks them not-measured (gate not passed) — never a false pass.
    """
    assets: List[str] = []
    if not run_scores_path.is_file():
        return (
            [(route, rclass, []) for (route, rclass) in perf.LIGHTHOUSE_ROUTES],
            assets,
        )
    try:
        payload = json.loads(run_scores_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return (
            [(route, rclass, []) for (route, rclass) in perf.LIGHTHOUSE_ROUTES],
            assets,
        )

    by_route = {r.get("route"): r for r in payload.get("routes", [])}
    inputs: List[Tuple[str, str, List[float]]] = []
    for route, rclass in perf.LIGHTHOUSE_ROUTES:
        rec = by_route.get(route, {})
        scores = [float(s) for s in rec.get("run_scores", [])]
        inputs.append((route, rec.get("route_class", rclass), scores))
        assets.extend(str(a) for a in rec.get("raw_assets", []))
    return inputs, assets


# --------------------------------------------------------------------------- #
# Combiner (pure given inputs).
# --------------------------------------------------------------------------- #


def build_performance_evidence(
    lighthouse_inputs: Sequence[Tuple[str, str, Sequence[float]]],
    grouped_latencies: Dict[str, List[float]],
    *,
    targets_ms: Optional[Dict[str, float]] = None,
    assets: Optional[Sequence[str]] = None,
    generated_at: Optional[str] = None,
) -> dict:
    """Call the pure evaluator and return a validated Evidence_Artifact dict.

    The evaluator computes every percentile/threshold decision; this combiner
    only marshals inputs and attaches the raw-artifact asset list. The result is
    round-tripped through ``from_dict``/``to_json`` so a malformed envelope can
    never be written.
    """
    targets_ms = targets_ms or P95_TARGETS_MS
    api_inputs: List[Tuple[str, List[float], float]] = []
    for surface in perf.API_SURFACES:
        samples = grouped_latencies.get(surface, [])
        target = float(targets_ms.get(surface, max(P95_TARGETS_MS.values())))
        api_inputs.append((surface, samples, target))

    envelope = perf.evaluate_performance(
        lighthouse_inputs,
        api_inputs,
        generated_at=generated_at or _utc_now_iso(),
        generated_by="deployed-target",
    )
    # Attach the raw Lighthouse artifacts + the timing CSV as evidence assets.
    envelope["assets"] = list(assets or [])

    # Validate the envelope shape before any caller serializes it.
    from_dict(envelope)
    return envelope


def write_evidence(envelope: dict, evidence_path: Path) -> None:
    """Serialize the validated envelope through the shared helper and write it."""
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    artifact = from_dict(envelope)
    evidence_path.write_text(to_json(artifact) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------- #
# Synthetic inputs for a sandbox dry-run.
# --------------------------------------------------------------------------- #


def synthetic_inputs() -> Tuple[
    List[Tuple[str, str, List[float]]], Dict[str, List[float]]
]:
    """Build small, deterministic inputs that satisfy every threshold.

    Used by ``--synthetic`` to prove the combiner emits a valid, *passing*
    envelope without a live target: three Lighthouse runs per route at/above
    threshold, and ``MIN_API_SAMPLES`` fast latencies per surface.
    """
    lighthouse_inputs: List[Tuple[str, str, List[float]]] = []
    for route, rclass in perf.LIGHTHOUSE_ROUTES:
        base = perf.PUBLIC_LH_MIN if rclass == perf.ROUTE_CLASS_PUBLIC else perf.AUTH_LH_MIN
        lighthouse_inputs.append((route, rclass, [base, base + 1.0, base + 2.0]))

    grouped: Dict[str, List[float]] = {}
    for surface in perf.API_SURFACES:
        # A flat, well-under-budget latency for every sample.
        fast = min(P95_TARGETS_MS[surface] / 4.0, 50.0)
        grouped[surface] = [fast] * perf.MIN_API_SAMPLES
    return lighthouse_inputs, grouped


# --------------------------------------------------------------------------- #
# CLI.
# --------------------------------------------------------------------------- #


def _default_perf_dir() -> Path:
    return REPO_ROOT / "docs" / "launch-evidence" / "03-performance"


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sample-api-timings.py",
        description=(
            "Gate 3 Performance_Gate: sample API timings, write the timings CSV, "
            "combine with Lighthouse run-scores, and emit performance-evidence.json. "
            "DEPLOYED-TARGET / operator-run; not auto-run in CI."
        ),
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("LV_BASE_URL", os.environ.get("API_URL", "")),
        help="Deployed API origin (env: LV_BASE_URL / API_URL). Required for live sampling.",
    )
    parser.add_argument(
        "--perf-dir",
        type=Path,
        default=_default_perf_dir(),
        help="Performance evidence dir (default: <repo>/docs/launch-evidence/03-performance).",
    )
    parser.add_argument(
        "--run-scores",
        type=Path,
        default=None,
        help="Lighthouse run-scores JSON (default: <perf-dir>/lighthouse/run-scores.json).",
    )
    parser.add_argument(
        "--samples-csv",
        type=Path,
        default=None,
        help="Pre-collected timings CSV to combine instead of live sampling.",
    )
    parser.add_argument(
        "--samples",
        type=int,
        default=perf.MIN_API_SAMPLES,
        help=f"Samples per surface when sampling live (default {perf.MIN_API_SAMPLES}).",
    )
    parser.add_argument(
        "--targets",
        type=Path,
        default=None,
        help="Optional JSON file overriding per-surface p95 targets (ms).",
    )
    parser.add_argument(
        "--synthetic",
        action="store_true",
        help="Dry-run over small synthetic inputs (no live calls); proves the envelope.",
    )
    return parser


def _load_targets(path: Optional[Path]) -> Dict[str, float]:
    targets = dict(P95_TARGETS_MS)
    if path is not None:
        overrides = json.loads(path.read_text(encoding="utf-8"))
        for surface, value in overrides.items():
            targets[surface] = float(value)
    return targets


def main(argv: Optional[Sequence[str]] = None) -> int:
    """CLI: produce the Performance_Gate evidence; exit non-zero unless it passes."""
    args = build_arg_parser().parse_args(argv)
    perf_dir: Path = args.perf_dir
    evidence_path = perf_dir / "performance-evidence.json"
    csv_path = perf_dir / "timings.csv"
    run_scores_path = args.run_scores or (perf_dir / "lighthouse" / "run-scores.json")
    targets = _load_targets(args.targets)

    if args.synthetic:
        lighthouse_inputs, grouped = synthetic_inputs()
        # Write a representative CSV so the asset exists alongside the evidence.
        synth_rows = [
            SampleRow(surface, "GET", "(synthetic)", i, latency, 200)
            for surface, latencies in grouped.items()
            for i, latency in enumerate(latencies)
        ]
        write_timings_csv(synth_rows, csv_path)
        assets = ["timings.csv"]
    else:
        lighthouse_inputs, lh_assets = load_lighthouse_inputs(run_scores_path)
        if args.samples_csv is not None:
            rows = read_timings_csv(args.samples_csv)
        else:
            if not args.base_url:
                sys.stderr.write(
                    "sample-api-timings: --base-url (or LV_BASE_URL) required for "
                    "live sampling; pass --samples-csv or --synthetic otherwise.\n"
                )
                return 2
            rows = collect_samples(args.base_url, samples_per_surface=args.samples)
            write_timings_csv(rows, csv_path)
        grouped = group_latencies(rows)
        assets = list(lh_assets) + ["timings.csv"]

    try:
        envelope = build_performance_evidence(
            lighthouse_inputs,
            grouped,
            targets_ms=targets,
            assets=assets,
        )
        write_evidence(envelope, evidence_path)
    except EvidenceArtifactError as exc:
        sys.stderr.write(f"sample-api-timings: refusing to write invalid envelope — {exc}\n")
        return 2

    passed = envelope["status"] == perf.STATUS_PASSED
    sys.stdout.write(f"sample-api-timings: status={envelope['status']}\n")
    sys.stdout.write(f"  evidence: {evidence_path}\n")
    sys.stdout.write(f"  timings:  {csv_path}\n")
    sys.stdout.write(f"  summary:  {envelope['summary']}\n")
    for failure in envelope["failures"]:
        sys.stdout.write(f"  - {failure}\n")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
