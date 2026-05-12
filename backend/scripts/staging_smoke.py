#!/usr/bin/env python3
"""Staging-gate smoke test harness.

Exercises every `/api/v1/*` endpoint touched in the API remediation sprint
(Phase 2-4) with minimal fixture payloads. Checks:
    - endpoint is reachable
    - returns expected 2xx/3xx or documented 4xx
    - response conforms to the envelope contract ({"success": bool, ...})
    - deprecated aliases emit Deprecation + Sunset headers

Usage:
    python backend/scripts/staging_smoke.py --base-url https://staging.mihas.edu.zm --token <jwt>

Exit codes:
    0 — all smoke tests pass
    1 — one or more endpoints failed
    2 — config/connectivity error
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional

try:
    import requests
except ImportError:  # pragma: no cover
    print("ERROR: requests library not installed. pip install requests", file=sys.stderr)
    sys.exit(2)


@dataclass
class SmokeResult:
    endpoint: str
    method: str
    expected: str
    actual_status: Optional[int] = None
    passed: bool = False
    notes: List[str] = field(default_factory=list)
    latency_ms: Optional[float] = None


# Endpoints touched in Phase 2-4 of the remediation sprint. Each entry describes
# the expected behavior with minimal fixture data.
SMOKE_CHECKS: List[Dict[str, Any]] = [
    # --- Phase 2: quick wins ---
    {
        "name": "SessionView (optional-auth)",
        "method": "GET",
        "path": "/api/v1/auth/session/",
        "expected_status_any": [200, 401],
        "require_envelope": True,
    },
    {
        "name": "Notification canonical /read-all/",
        "method": "PUT",
        "path": "/api/v1/notifications/read-all/",
        "expected_status_any": [200, 401, 403],
        "require_envelope": True,
        "require_no_deprecation_header": True,
        "needs_auth": True,
    },
    {
        "name": "Notification deprecated alias /mark-all-read/",
        "method": "PUT",
        "path": "/api/v1/notifications/mark-all-read/",
        "expected_status_any": [200, 401, 403],
        "require_deprecation_header": True,
        "needs_auth": True,
    },
    {
        "name": "Notification deprecated alias /mark-read/",
        "method": "PUT",
        "path": "/api/v1/notifications/mark-read/",
        "expected_status_any": [200, 401, 403],
        "require_deprecation_header": True,
        "needs_auth": True,
    },
    # --- Phase 3: serializer validation on payments ---
    {
        "name": "MobileMoneyInitiate — empty body (validation error)",
        "method": "POST",
        "path": "/api/v1/payments/mobile-money/",
        "body": {},
        "expected_status_any": [400, 401, 403],
        "require_envelope": True,
        "needs_auth": True,
    },
    {
        "name": "DeferPayment — empty body (validation error)",
        "method": "POST",
        "path": "/api/v1/payments/defer/",
        "body": {},
        "expected_status_any": [400, 401, 403],
        "require_envelope": True,
        "needs_auth": True,
    },
    # --- Phase 3: serializer validation on admin ---
    {
        "name": "BatchUserImport — empty list (validation or empty batch)",
        "method": "POST",
        "path": "/api/v1/admin/users/batch-import/",
        "body": [],
        "expected_status_any": [200, 400, 401, 403],
        "require_envelope": True,
        "needs_auth": True,
    },
    # --- Phase 3: applications business-logic serializers ---
    {
        "name": "Amendment request — empty body",
        "method": "POST",
        "path": "/api/v1/applications/00000000-0000-0000-0000-000000000000/amendments/",
        "body": {},
        "expected_status_any": [400, 401, 403, 404],
        "require_envelope": True,
        "needs_auth": True,
    },
    {
        "name": "Assign reviewer — empty body",
        "method": "POST",
        "path": "/api/v1/applications/00000000-0000-0000-0000-000000000000/assign/",
        "body": {},
        "expected_status_any": [400, 401, 403, 404],
        "require_envelope": True,
        "needs_auth": True,
    },
    # --- Docs surface ---
    {
        "name": "OpenAPI schema",
        "method": "GET",
        "path": "/api/v1/schema/",
        "expected_status_any": [200, 401],
        "needs_auth": True,
    },
    # --- Schema-drift regression guard (incident: May 2026) ---
    # If application_documents has a declared Django column that doesn't
    # exist on the DB, this endpoint 500s on every request. The shape
    # test below returns 404 on an unknown UUID instead of 500 — and
    # a 500 here is what the production incident looked like.
    {
        "name": "ApplicationDocuments — unknown UUID returns 404 not 500",
        "method": "GET",
        "path": "/api/v1/applications/00000000-0000-0000-0000-000000000000/documents/",
        "expected_status_any": [401, 403, 404],
        "require_envelope": True,
        "require_no_5xx": True,
        "needs_auth": True,
    },
    # Same guard for the grades endpoint — also hits ApplicationDocument-
    # adjacent models via serializers.
    {
        "name": "ApplicationGrades — unknown UUID returns 404 not 500",
        "method": "GET",
        "path": "/api/v1/applications/00000000-0000-0000-0000-000000000000/grades/",
        "expected_status_any": [401, 403, 404],
        "require_envelope": True,
        "require_no_5xx": True,
        "needs_auth": True,
    },
    # Document upload — validation error on empty body. Also verifies
    # the upload view is reachable (was 500ing during the drift).
    {
        "name": "DocumentUpload — empty body validation",
        "method": "POST",
        "path": "/api/v1/documents/upload/",
        "body": {},
        "expected_status_any": [400, 401, 403, 415],
        "require_envelope": True,
        "require_no_5xx": True,
        "needs_auth": True,
    },
]


def run_check(
    check: Dict[str, Any],
    session: requests.Session,
    base_url: str,
    timeout: float,
) -> SmokeResult:
    name = check.get("name", check["path"])
    result = SmokeResult(
        endpoint=check["path"],
        method=check["method"],
        expected=f"status in {check.get('expected_status_any', [])}",
    )
    url = base_url.rstrip("/") + check["path"]
    kwargs = {"timeout": timeout}
    body = check.get("body")
    if body is not None:
        kwargs["json"] = body

    t0 = time.monotonic()
    try:
        resp = session.request(check["method"], url, **kwargs)
    except requests.RequestException as exc:
        result.notes.append(f"request failed: {exc}")
        result.passed = False
        return result
    result.latency_ms = (time.monotonic() - t0) * 1000
    result.actual_status = resp.status_code

    # Explicit 5xx guard — used by schema-drift regression checks where
    # the status might be in expected_status_any (e.g. 404) but a 500
    # from the same endpoint would indicate a real regression.
    if check.get("require_no_5xx") and 500 <= resp.status_code < 600:
        result.notes.append(
            f"5xx response on endpoint marked require_no_5xx: {resp.status_code}"
        )
        result.passed = False
        return result

    # Check status
    expected = check.get("expected_status_any", [])
    if expected and resp.status_code not in expected:
        result.notes.append(f"status {resp.status_code} not in expected {expected}")
        result.passed = False
        return result

    # Envelope check
    if check.get("require_envelope"):
        try:
            body = resp.json()
            if not isinstance(body, dict) or "success" not in body:
                result.notes.append("response missing envelope {success, ...}")
                result.passed = False
                return result
        except ValueError:
            # Non-JSON response is acceptable on 401/403/500
            if resp.status_code < 400:
                result.notes.append("expected JSON envelope, got non-JSON")
                result.passed = False
                return result

    # Deprecation headers
    if check.get("require_deprecation_header"):
        if resp.headers.get("Deprecation") != "true":
            result.notes.append(
                f"missing Deprecation: true header (got {resp.headers.get('Deprecation')!r})"
            )
            result.passed = False
            return result
        if "Sunset" not in resp.headers:
            result.notes.append("missing Sunset header")
            result.passed = False
            return result

    if check.get("require_no_deprecation_header"):
        if resp.headers.get("Deprecation"):
            result.notes.append(
                f"unexpected Deprecation header on canonical endpoint: {resp.headers.get('Deprecation')!r}"
            )
            result.passed = False
            return result

    result.passed = True
    return result


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="MIHAS staging smoke test harness")
    parser.add_argument("--base-url", required=True, help="e.g. https://staging.mihas.edu.zm")
    parser.add_argument("--token", help="Bearer token for authenticated endpoints")
    parser.add_argument("--report", default="/tmp/smoke_report.json", help="JSON report path")
    parser.add_argument("--timeout", type=float, default=15.0, help="Per-request timeout seconds")
    parser.add_argument(
        "--skip-auth",
        action="store_true",
        help="Skip checks marked needs_auth=True (useful for initial connectivity test)",
    )
    args = parser.parse_args(argv)

    session = requests.Session()
    if args.token:
        session.headers["Authorization"] = f"Bearer {args.token}"

    results: List[SmokeResult] = []
    for check in SMOKE_CHECKS:
        if args.skip_auth and check.get("needs_auth"):
            continue
        print(f"→ {check['method']} {check['path']} ... ", end="", flush=True)
        result = run_check(check, session, args.base_url, args.timeout)
        results.append(result)
        status_str = "✓" if result.passed else "✗"
        latency = f" ({result.latency_ms:.0f}ms)" if result.latency_ms else ""
        print(f"{status_str} [{result.actual_status}]{latency}")
        if not result.passed:
            for note in result.notes:
                print(f"    {note}")

    # Write JSON report
    report = {
        "base_url": args.base_url,
        "total_checks": len(results),
        "passed": sum(1 for r in results if r.passed),
        "failed": sum(1 for r in results if not r.passed),
        "results": [asdict(r) for r in results],
    }
    with open(args.report, "w") as f:
        json.dump(report, f, indent=2)

    print(f"\n{report['passed']}/{report['total_checks']} passed  (report: {args.report})")
    return 0 if report["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
