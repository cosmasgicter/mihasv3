#!/usr/bin/env python3
"""Extract the per-row / per-step results a 13.2 matrix must publish.

Task 13.2's deliverable requires that "a matrix with 16 rows must show 16 rows",
so this reads the Playwright JSON reports and prints every test with its status,
its expected status (so an *intended* failure is not confused with a regression),
its duration, and every annotation the test recorded.

Read-only. Usage:  python3 extract_rows.py <report.json> [more.json ...]
"""
from __future__ import annotations

import json
import re
import sys

ANSI = re.compile(r"\x1b\[[0-9;]*m")


def clean(value: str | None) -> str:
    return ANSI.sub("", value or "")


def walk(suites, out):
    for suite in suites:
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                for result in test.get("results", []):
                    out.append(
                        {
                            "project": test.get("projectName", ""),
                            "file": suite.get("file", ""),
                            "title": spec.get("title", ""),
                            "status": result.get("status"),
                            "expected": test.get("expectedStatus"),
                            "duration_ms": result.get("duration"),
                            "annotations": [
                                (a.get("type"), clean(a.get("description")))
                                for a in (result.get("annotations") or [])
                            ],
                            "errors": [
                                clean(e.get("message"))[:1200]
                                for e in (result.get("errors") or [])
                            ],
                        }
                    )
        walk(suite.get("suites", []), out)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    grand = {"passed": 0, "expected_failure": 0, "unexpected": 0}
    for path in sys.argv[1:]:
        with open(path) as handle:
            report = json.load(handle)
        rows: list[dict] = []
        walk(report.get("suites", []), rows)
        print("=" * 78)
        print(f"REPORT: {path}")
        print(f"stats:  {json.dumps(report.get('stats', {}))}")
        print("=" * 78)
        for row in rows:
            if row["status"] == "passed":
                verdict = "PASS"
                grand["passed"] += 1
            elif row["expected"] == "failed":
                verdict = "FAIL (EXPECTED — a recorded defect)"
                grand["expected_failure"] += 1
            else:
                verdict = "FAIL (UNEXPECTED)"
                grand["unexpected"] += 1
            print(f"\n[{row['project']}] {verdict}  {row['duration_ms']} ms")
            print(f"  {row['title']}")
            for kind, detail in row["annotations"]:
                print(f"    · {kind}: {detail}")
            for message in row["errors"]:
                print("    ! " + message.replace("\n", "\n      "))
    print("\n" + "=" * 78)
    print(
        "TOTAL  passed={passed}  expected-failure={expected_failure}  "
        "unexpected={unexpected}".format(**grand)
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
