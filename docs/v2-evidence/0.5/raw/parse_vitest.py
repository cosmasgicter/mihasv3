#!/usr/bin/env python3
"""Task 0.5 baseline helper: summarise the Vitest JSON report.

Prints file-level pass/fail counts, each failed file, and each failed test's
full name plus first failure message line. Read-only; parses local JSON only.
"""
import json
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "admissions-vitest.json"
data = json.load(open(path))

files = data.get("testResults", [])
failed_files = [f for f in files if f.get("status") == "failed"]

failed_tests = []
for f in files:
    for a in f.get("assertionResults", []):
        if a.get("status") == "failed":
            msgs = a.get("failureMessages") or []
            first = msgs[0].splitlines()[0][:160] if msgs else ""
            failed_tests.append((f.get("name", ""), a.get("fullName") or a.get("title", ""), first))

print("num_total_files:", data.get("numTotalTestSuites"))
print("num_failed_files:", data.get("numFailedTestSuites"))
print("num_total_tests:", data.get("numTotalTests"))
print("num_failed_tests:", data.get("numFailedTests"))
print("num_passed_tests:", data.get("numPassedTests"))
print("num_pending_tests:", data.get("numPendingTests"))
print()
print("=== failed files (%d) ===" % len(failed_files))
for f in failed_files:
    afail = sum(1 for a in f.get("assertionResults", []) if a.get("status") == "failed")
    acount = len(f.get("assertionResults", []))
    _mlines = (f.get("message") or "").splitlines()
    msg = _mlines[0][:140] if _mlines else ""
    print(f"- {f.get('name','')}  (assertions: {afail} failed / {acount}; collection_msg: {msg})")
print()
print("=== failed tests (%d) ===" % len(failed_tests))
for fname, full, msg in failed_tests:
    print(f"- {full}\n    file: {fname}\n    -> {msg}")
