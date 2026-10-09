#!/usr/bin/env python3
"""Task 13.6 — finding traceability report.

Maps every finding in the spec's register (`findings.md`) to:
  * its severity, as declared in the register;
  * the requirement(s) that own it (`_Findings:` lines in requirements.md);
  * the task(s) that claim it (`_Findings:` lines in tasks.md);
  * each owning task's checkbox state;
  * whether the task's evidence directory exists.

Then it does the same for the GATE-13.x-NN findings that Phase 13's own
verification tasks filed, which live only in `docs/v2-evidence/13.*/README.md`
and are NOT in `findings.md` — that absence is itself a reported result.

Reuses scripts/validate_spec_governance.py's parsers so this report and the
blocking validator cannot disagree about what a finding or a task is.

Stdlib only. Writes a markdown table to stdout.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO / "scripts"))
import validate_spec_governance as vsg  # noqa: E402

SPEC = REPO / ".kiro/specs/admissions-v2-canonical-rebuild"
EVIDENCE = REPO / "docs/v2-evidence"

findings_text = (SPEC / "findings.md").read_text(encoding="utf-8")
requirements_text = (SPEC / "requirements.md").read_text(encoding="utf-8")
tasks_text = (SPEC / "tasks.md").read_text(encoding="utf-8")

register = vsg.parse_findings(findings_text)
req_data = vsg.parse_requirements(requirements_text)
tasks = vsg.parse_tasks(tasks_text)

# severity per finding, from the register's own table rows
severity: dict[str, str] = {}
_ROW = re.compile(r"^\|\s*([A-Z]{2,6}-\d+)\s*\|\s*(P[0-2])\s*\|")
for line in findings_text.splitlines():
    m = _ROW.match(line)
    if m:
        severity[m.group(1)] = m.group(2)

# owning requirement(s)
owner_reqs: dict[str, list[str]] = {f: [] for f in register}
for req, fids in req_data["findings_by_requirement"].items():
    for fid in fids:
        if fid in owner_reqs:
            owner_reqs[fid].append(req)

# owning task(s) + state.  A task line "_Findings: all_" or "_Findings: all;
# initial focus X_" claims every finding; record it as a wildcard claim so the
# report does not silently credit 71 findings to one task.
STATE_LABEL = {"x": "[x] complete", "-": "[-] in progress", "~": "[~] not started", " ": "[ ] open"}
owner_tasks: dict[str, list[tuple[str, str]]] = {f: [] for f in register}
wildcard_tasks: list[tuple[str, str]] = []
for t in tasks:
    raw = (t.get("raw_findings") or "")
    state = STATE_LABEL.get(t["state"].lower(), t["state"])
    if re.search(r"\ball\b", raw, re.I):
        wildcard_tasks.append((t["id"], state))
    for fid in t["finding_refs"]:
        if fid in owner_tasks:
            owner_tasks[fid].append((t["id"], state))

def ev_dir(task_id: str) -> bool:
    return vsg._dir_has_content(EVIDENCE / task_id)

print("## A. Register findings (findings.md) -> owning task -> state\n")
print("| finding | sev | owner requirement(s) | owning task(s) | every owning task [x]? | evidence dir(s) present |")
print("|---|---|---|---|---|---|")
unowned_by_task = []
open_owner = []
for fid in register:
    reqs = ", ".join(sorted(owner_reqs[fid], key=lambda r: int(r[1:]))) or "**NONE**"
    ots = owner_tasks[fid]
    if not ots:
        unowned_by_task.append(fid)
        tasks_cell = "**none (wildcard tasks only)**"
        all_done = "n/a"
        ev = "n/a"
    else:
        tasks_cell = ", ".join(f"{i} {s.split(' ')[0]}" for i, s in sorted(ots, key=lambda p: [int(x) for x in p[0].split('.')]))
        all_done = "yes" if all(s.startswith("[x]") for _, s in ots) else "**NO**"
        if all_done == "**NO**":
            open_owner.append(fid)
        missing = [i for i, _ in ots if not ev_dir(i)]
        ev = "yes" if not missing else "**missing: " + ", ".join(sorted(set(missing))) + "**"
    print(f"| {fid} | {severity.get(fid,'?')} | {reqs} | {tasks_cell} | {all_done} | {ev} |")

print()
print(f"Register findings: **{len(register)}**")
by_sev: dict[str, int] = {}
for fid in register:
    by_sev[severity.get(fid, "?")] = by_sev.get(severity.get(fid, "?"), 0) + 1
print("By severity: " + ", ".join(f"{k}={v}" for k, v in sorted(by_sev.items())))
print(f"Findings with no owner requirement: **{sum(1 for f in register if not owner_reqs[f])}**")
print(f"Findings claimed only by a wildcard (`_Findings: all_`) task: **{len(unowned_by_task)}** -> {', '.join(unowned_by_task) or 'none'}")
print(f"Findings with at least one non-[x] owning task: **{len(open_owner)}** -> {', '.join(open_owner) or 'none'}")
print("Wildcard tasks (`_Findings: all...`): " + ", ".join(f"{i} {s}" for i, s in wildcard_tasks))

# ---------------------------------------------------------------- GATE findings
print()
print("## B. Phase 13 GATE findings (filed in docs/v2-evidence/13.*/README.md)\n")
gate = {}
for task_dir in sorted(EVIDENCE.glob("13.*")):
    readme = task_dir / "README.md"
    if not readme.is_file():
        continue
    for fid in sorted(set(re.findall(r"GATE-13\.\d+-\d+", readme.read_text(encoding="utf-8")))):
        gate.setdefault(fid, set()).add(task_dir.name)

in_register = [f for f in gate if f in set(register)]
print(f"Distinct GATE findings mentioned across Phase 13 evidence: **{len(gate)}**")
print(f"GATE findings present in `findings.md`: **{len(in_register)}**")
print()
print("| GATE finding | filing task | also discussed in |")
print("|---|---|---|")
for fid in sorted(gate, key=lambda f: (f.split('-')[1], int(f.split('-')[2]))):
    filer = "13." + fid.split("-")[1].split(".")[1]
    others = sorted(d for d in gate[fid] if d != filer)
    print(f"| {fid} | {filer} | {', '.join(others) or '—'} |")

print()
print("## C. Task inventory\n")
counts: dict[str, int] = {}
for t in tasks:
    counts[t["state"]] = counts.get(t["state"], 0) + 1
print(f"Total tasks: **{len(tasks)}**")
for k, v in sorted(counts.items()):
    print(f"  {STATE_LABEL.get(k.lower(), k)}: {v}")
missing_ev = [t["id"] for t in tasks if not ev_dir(t["id"])]
print(f"Tasks with no non-empty `docs/v2-evidence/<id>/`: **{len(missing_ev)}** -> {', '.join(missing_ev) or 'none'}")
checked_missing = [t["id"] for t in tasks if t["checked"] and not ev_dir(t["id"])]
print(f"**[x] tasks** with no non-empty evidence dir: **{len(checked_missing)}** -> {', '.join(checked_missing) or 'none'}")
no_descriptor = [t["id"] for t in tasks if t["checked"] and not (t["evidence"] or "").strip()]
print(f"[x] tasks with no `_Evidence:` descriptor line: **{len(no_descriptor)}** -> {', '.join(no_descriptor) or 'none'}")
