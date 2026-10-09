#!/usr/bin/env python3
"""Task 13.6 — per-task evidence audit over all 73 tasks.

For each task: checkbox state, its `_Evidence:` descriptor, whether
docs/v2-evidence/<id>/ exists, whether it holds a README.md, its file count and
byte size. Reuses the blocking validator's parsers.
"""
from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO / "scripts"))
import validate_spec_governance as vsg  # noqa: E402

SPEC = REPO / ".kiro/specs/admissions-v2-canonical-rebuild"
EV = REPO / "docs/v2-evidence"

tasks = vsg.parse_tasks((SPEC / "tasks.md").read_text(encoding="utf-8"))

print("| task | state | evidence dir | README | files | bytes | `_Evidence:` descriptor present |")
print("|---|---|---|---|---:|---:|---|")
missing = []
for t in tasks:
    d = EV / t["id"]
    if d.is_dir():
        files = [p for p in d.rglob("*") if p.is_file()]
        n = len(files)
        size = sum(p.stat().st_size for p in files)
        readme = "yes" if (d / "README.md").is_file() else "**no**"
        present = "yes"
    else:
        n, size, readme, present = 0, 0, "n/a", "**ABSENT**"
        missing.append(t["id"])
    desc = "yes" if (t["evidence"] or "").strip() else "**no**"
    print(f"| {t['id']} | `{t['state']}` | {present} | {readme} | {n} | {size:,} | {desc} |")

print()
print(f"Tasks: **{len(tasks)}**")
print(f"Evidence directories absent: **{len(missing)}** -> {', '.join(missing) or 'none'}")
all_files = [p for p in EV.rglob("*") if p.is_file()]
print(f"Total files under docs/v2-evidence/: **{len(all_files):,}**")
print(f"Total bytes under docs/v2-evidence/: **{sum(p.stat().st_size for p in all_files):,}**")
dirs = sorted(p.name for p in EV.iterdir() if p.is_dir())
task_ids = {t["id"] for t in tasks}
orphan = [d for d in dirs if d not in task_ids]
print(f"Evidence directories with no matching task: **{len(orphan)}** -> {', '.join(orphan) or 'none'}")
