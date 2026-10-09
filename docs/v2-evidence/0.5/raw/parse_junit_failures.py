#!/usr/bin/env python3
"""Task 0.5 baseline helper: summarise pytest JUnit XML.

Reads backend-pytest-junit.xml and prints counts plus each failing/erroring
test node id and first-line message. Read-only; parses the local XML only.
"""
import sys
import xml.etree.ElementTree as ET

path = sys.argv[1] if len(sys.argv) > 1 else "backend-pytest-junit.xml"
root = ET.parse(path).getroot()

totals = {"tests": 0, "failures": 0, "errors": 0, "skipped": 0}
for suite in root.iter("testsuite"):
    for k in totals:
        totals[k] += int(suite.get(k, 0) or 0)

fails = []
for tc in root.iter("testcase"):
    for kind in ("failure", "error"):
        node = tc.find(kind)
        if node is not None:
            cls = tc.get("classname", "")
            name = tc.get("name", "")
            msg = (node.get("message", "") or "").splitlines()
            first = msg[0][:160] if msg else ""
            fails.append((f"{cls}::{name}", kind, first))

print("suite_totals:", totals)
print("failing_testcases:", len(fails))
for node_id, kind, msg in fails:
    print(f"[{kind}] {node_id}\n        -> {msg}")
