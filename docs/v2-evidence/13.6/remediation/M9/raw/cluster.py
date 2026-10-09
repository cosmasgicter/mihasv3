#!/usr/bin/env python3
"""M3's clustering instrument.

Groups every failure header in a pytest whole-tree artifact by CAUSE, not by
file, using the first ``E `` line of each traceback plus the test file.

Written for M3 (docs/v2-evidence/13.6/remediation/M3/) so the cluster table in
the README is derived from the artifact rather than typed from memory. Run it
against the before artifact and the after artifact with the same rules, so the
two tables are comparable:

    python3 raw/cluster.py raw/00-baseline-backend-whole-tree.txt
    python3 raw/cluster.py raw/90-after-backend-whole-tree.txt

The rules are ordered: the first match wins. A failure that matches no rule is
reported under ``UNCLUSTERED`` rather than silently folded into a neighbour --
an unexplained failure is the one thing a cluster table must not hide.
"""

from __future__ import annotations

import collections
import pathlib
import re
import sys

# (cluster id, human label, file regex or None, error-text regex or None)
RULES: list[tuple[str, str, str | None, str | None]] = [
    # --- fixture / isolation defects are matched FIRST, because several of them
    #     land inside suites whose name suggests a contract cluster.
    ("H-fixture", "test-isolation / fixture defect: raw-insert factory omits a NOT NULL column",
     None, r"NotNullViolation"),
    ("H-fixture", "test-isolation / fixture defect: hypothesis-generated duplicate",
     None, r"UniqueViolation|InvalidColumnReference|TransactionManagementError"),
    ("A-golden-unstable", "task-9.2 suite: run-to-run instability (not a contract change)",
     r"test_perf_", r"run-to-run stability|cache-on vs flag-off"),
    # --- deliberate task-9.2 contract change vs committed pre-9.2 goldens
    ("A-golden", "task-9.2 perf goldens: committed golden holds the pre-9.2 shape",
     r"test_perf_golden_snapshots|test_perf_divergence_regression|test_perf_output_equivalence",
     None),
    ("A-golden", "task-9.2 contract change: dashboard.users.active -> users.enabled",
     r"test_serializer_response_contract", r"'missing': \['active'\]"),
    # --- capability endpoint
    ("B-cap404", "capability endpoint returns 404 to a no-scope staff actor",
     None, r"NOT_FOUND.*Not found\.|404 == 200|'capabilities', 'admin', 404"),
    ("B-cap-cache", "capability cache: primed entry not served from cache",
     r"test_perf_capability_invalidation", r"served from cache"),
    # --- registry / catalogue drift
    ("F-tables", "EXPECTED_TABLES drift: managed=False model absent from verify_schema_static",
     r"test_drift_bug6_fix|test_migration_properties", None),
    ("G-errcodes", "ERROR_CODES catalogue gap", r"test_error_codes_canonical", None),
    ("C-viewauth", "unclassified APIView subclasses", r"test_view_auth_classification", None),
    ("D-allowany", "unclassified AllowAny views", r"test_public_endpoint_policy", None),
    ("K-isadmin", "stale assertion: view must carry the retired raw-role IsAdmin gate",
     r"test_admin_endpoint_auth", None),
    ("E-spectacular", "drf-spectacular: schema errors / warnings / tags",
     r"test_launch_verification_spectacular|test_schema_tags|test_api_quality_script", None),
    ("I-rollback", "rollback lint: non-inverse-additive statements",
     r"test_rollback_safe_operations", None),
    ("J-migreport", "migration-report freshness (item M4, not M3)",
     r"test_migration_history_report_freshness", None),
    ("L-bareexcept", "bare except:pass in accounts views",
     r"test_accounts_error_handling", None),
    ("M-v2mock", "V2 contract suite: mock-based test vs the real view",
     r"test_v2_endpoint_contract", None),
    ("N-retired", "stale assertion: imports a route/view retired by a later task",
     None, r"ImportError: cannot import name"),
    ("N-mock", "stale mock: patches a symbol the view no longer calls",
     None, r"MagicMock|to have been called once"),
    ("O-scope", "scope / disclosure: masked-vs-permitted or 403-vs-404 disagreement",
     None, r"403|404|NotFound|PermissionDenied|INSUFFICIENT_PERM|in set\(\)"),
    ("P-role-envelope", "stale role-assignment denial envelope assertion",
     r"test_capability_gated_writes", None),
    ("Q-tenant-directory", "stale tenant-directory authority assertion",
     r"test_admissions_v2_authority_policies", None),
]


def parse(path: pathlib.Path):
    lines = path.read_text(errors="replace").splitlines()
    try:
        start = next(i for i, l in enumerate(lines) if l.startswith("=================================== FAILURES"))
    except StopIteration:
        return [], []
    try:
        end = next(i for i, l in enumerate(lines) if l.startswith("=============================== warnings summary"))
    except StopIteration:
        end = len(lines)
    hdr = re.compile(r"^_+ (.+?) _+$")
    out: list[list] = []
    for l in lines[start + 1:end]:
        m = hdr.match(l)
        if m:
            out.append([m.group(1).strip(), []])
        elif out:
            out[-1][1].append(l)
    rows = []
    for name, body in out:
        f = "?"
        for l in body:
            m = re.match(r"^(tests/[\w/.\-]+\.py):\d+", l) or re.search(r"\b(tests/[\w/.\-]+\.py)\b", l)
            if m:
                f = m.group(1)
                break
        err = ""
        for l in body:
            s = l.strip()
            if s.startswith("E ") and len(s) > 3:
                err = s[2:].strip()
                break
        rows.append((f, name, err))
    # errors block
    errs = []
    for i, l in enumerate(lines):
        if l.startswith("==================================== ERRORS"):
            for j in range(i + 1, min(i + 400, len(lines))):
                if lines[j].startswith("==================================="):
                    break
                m = re.match(r"^_+ (ERROR at setup of .+?) _+$", lines[j])
                if m:
                    errs.append(m.group(1))
    return rows, errs


def classify(f: str, err: str) -> tuple[str, str]:
    for cid, label, frx, erx in RULES:
        if frx and not re.search(frx, f):
            continue
        if erx and not re.search(erx, err):
            continue
        return cid, label
    return "UNCLUSTERED", "no rule matched"


def main() -> int:
    path = pathlib.Path(sys.argv[1])
    rows, errs = parse(path)
    buckets: dict[tuple[str, str], list] = collections.OrderedDict()
    for f, name, err in rows:
        key = classify(f, err)
        buckets.setdefault(key, []).append((f, name, err))
    print(f"# cluster report for {path.name}")
    print(f"# failure headers: {len(rows)}   setup errors: {len(errs)}")
    print()
    print("| cluster | what it is | count |")
    print("|---|---|---:|")
    for (cid, label), items in sorted(buckets.items(), key=lambda kv: (-len(kv[1]), kv[0][0])):
        print(f"| `{cid}` | {label} | **{len(items)}** |")
    print(f"| — | **total failure headers** | **{len(rows)}** |")
    print(f"| — | setup errors | {len(errs)} |")
    print()
    for (cid, label), items in sorted(buckets.items(), key=lambda kv: (-len(kv[1]), kv[0][0])):
        print(f"### {cid} — {label}  ({len(items)})")
        for f, name, err in sorted(items):
            print(f"  {f} :: {name}")
            if err:
                print(f"      {err[:190]}")
        print()
    if errs:
        print("### setup errors")
        for e in errs:
            print(f"  {e}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
