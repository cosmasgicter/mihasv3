#!/usr/bin/env python3
"""Attribute every non-passing backend test in the full tree to a cause cluster.

Clusters are matched on the failure message + owning module, in order. The last
cluster is 'unattributed' and is printed in full so nothing hides in a bucket.
"""
import json, re, collections

rows = json.load(open('docs/v2-evidence/13.1/raw/backend-full-failures.json'))
sel = {l.strip() for l in open('docs/v2-evidence/13.1/raw/backend-selection-52.txt') if l.strip()}

CLUSTERS = [
    ("A  9.4 document_views/interview_views rewiring: stale unguarded patch target",
     lambda r: ("does not have the attribute 'AccessScopeService'" in r['message']
                or "does not have the attribute '_staff_can_access_application'" in r['message'])),
    ("A' downstream of A: the patched view 500s instead of 403",
     lambda r: r['module'] == 'tests/property/test_application_endpoints.py' and '500 == 403' in r['message']),
    ("B  7.4 retired AI-summary views: tests still import the deleted symbol",
     lambda r: 'ApplicationAdminSummaryView' in r['message'] or 'ApplicationPreviewSummaryView' in r['message']),
    ("C  2.x capability migration: test asserts the retired IsAdmin permission class",
     lambda r: "permissions.IsAdmin'> not found in" in r['message']),
    ("D  verify_schema_static.EXPECTED_TABLES stale (6 new unmanaged tables)",
     lambda r: 'EXPECTED_TABLES' in r['message'] or 'AdminSavedFilter' in r['message']
               or 'Expected 49 models' in r['message']),
    ("E  new NOT NULL columns vs raw-insert test factories",
     lambda r: 'assignment_version' in r['message'] or 'application_quarantined' in r['message']),
    ("F  1.3 V2 demo endpoints (catalogued at task 0.5, outside 12.x's selection)",
     lambda r: r['module'] == 'tests/contract/test_v2_endpoint_contract.py'),
    ("G  9.2 perf-golden divergence vs the 2026-06-21 baseline",
     lambda r: 'divergence' in r['message'] or 'golden' in r['message']),
    ("H  communication_templates ON CONFLICT / unique-constraint switch",
     lambda r: 'ON CONFLICT specification' in r['message'] or r['module'].endswith('test_communication_template_properties.py')),
    ("I  R9.2 rollback-file inverse-additive violation",
     lambda r: 'inverse-additive' in r['message']),
    ("J  bare except:pass in an accounts view module (line 1214)",
     lambda r: 'bare except' in r['message'] or 'line(s) [1214]' in r['message'] or 'line 1214' in r['message']),
    ("K  12.1 §19 / 12.2 §9.3 deliberately-held classification counts",
     lambda r: 'not in any classification list' in r['message']
               or 'public_endpoint_classification' in r['name']
               or "only tagged 'api'" in r['message']),
]

assigned = {}
for r in rows:
    for label, pred in CLUSTERS:
        if pred(r):
            assigned.setdefault(label, []).append(r)
            break
    else:
        assigned.setdefault("Z  unattributed — listed individually below", []).append(r)

print("BACKEND FULL TREE — 179 non-passing tests attributed to cause clusters")
print("(106 failures + 73 setup errors; 5133 passed, 104 skipped, 5419 collected)\n")
tot = 0
for label, _ in CLUSTERS + [("Z  unattributed — listed individually below", None)]:
    got = assigned.get(label, [])
    if not got:
        continue
    tot += len(got)
    inside = sum(1 for r in got if r['module'] in sel)
    print(f"{len(got):5d}  {label}")
    print(f"       in the 52-file selection: {inside}   outside it: {len(got)-inside}")
    for m, n in collections.Counter(r['module'] for r in got).most_common():
        print(f"          {n:4d}  {m}")
    print()
print(f"attributed total: {tot} (of {len(rows)})\n")
print("=== the unattributed remainder, in full ===")
for r in sorted(assigned.get("Z  unattributed — listed individually below", []),
                key=lambda r: (r['module'], r['name'])):
    flag = 'IN-SELECTION ' if r['module'] in sel else 'never-run-before '
    print(f"[{r['kind'][:4]}] {flag}{r['module']}::{r['name']}")
    print(f"        {r['message'][:200]}")
