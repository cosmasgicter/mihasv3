#!/usr/bin/env python3
"""Task 13.6 SECOND PASS (O10) — traceability over the *second* finding population.

`docs/v2-evidence/13.6/raw/traceability.py` (first pass) reports:
  * part A — the 71 register findings the validator's grammar can parse;
  * part B — the GATE-13.x-NN ids Phase 13's own evidence mentions, and how many
    of them `findings.md` holds (it read 0 of 34 on the first pass).

Since then, remediation item L9 registered **39** Phase 13 GATE findings in
`findings.md` (`.../L9-L11/README.md` §1). This script is part D: it reads those
rows out of the register, reports them by state and severity, cross-checks them
against every id Phase 13's evidence *and* the six remediation READMEs mention,
and then demonstrates — rather than asserts — the mechanical gap filed as
GATE-13.6-04: the validator's finding-id grammar cannot parse a dotted id, so
`finding_count` is still 71 and R1.3 rule 3 cannot fire over any of the 39.

It does NOT edit, widen or monkey-patch the validator. It imports the real module
and reports what the real pattern does.

Stdlib only. Writes markdown to stdout.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(REPO / "scripts"))
import validate_spec_governance as vsg  # noqa: E402

SPEC = REPO / ".kiro/specs/admissions-v2-canonical-rebuild"
EVIDENCE = REPO / "docs/v2-evidence"

findings_text = (SPEC / "findings.md").read_text(encoding="utf-8")
requirements_text = (SPEC / "requirements.md").read_text(encoding="utf-8")

# ---------------------------------------------------------------------------
# D1. the dotted GATE rows the register now holds
# ---------------------------------------------------------------------------
GATE_ROW = re.compile(
    r"^\|\s*(GATE-13\.\d+-\d+)\s*\|\s*(high|med|low)\s*\|(.+?)\|(.+?)\|(.+?)\|(.+?)\|\s*$",
    re.I,
)

rows: dict[str, dict[str, str]] = {}
for line in findings_text.splitlines():
    m = GATE_ROW.match(line)
    if not m:
        continue
    fid, sev, issue, owner_req, lane, state = (g.strip() for g in m.groups())
    rows[fid] = {
        "severity": sev.lower(),
        "issue": issue,
        "owner_req": owner_req,
        "lane": lane,
        "state": state,
    }


def normalise_state(cell: str) -> str:
    """Bucket the register's own State prose into one comparable label.

    The register's wording is deliberately richer than a boolean; this collapses
    it for counting only, and the raw cell is printed alongside so the reader can
    disagree with the bucketing.
    """
    low = cell.lower()
    if "partly fixed" in low:
        return "partly fixed"
    # A fix rehearsed on v2_snap_13_6 is NOT applied to production. The register
    # says so in words; this bucket keeps the count from saying otherwise.
    if "rehearsal lineage" in low:
        return "fixed on the rehearsal lineage (NOT applied to production)"
    if "fixed for registration" in low:
        return "fixed"
    if "one half fixed" in low:
        return "open — one half fixed"
    if "accepted with reasoning" in low:
        return "open — accepted with reasoning"
    if low.lstrip("*").startswith("fixed"):
        return "fixed"
    if "**fixed**" in low:
        return "fixed"
    if low.lstrip("*").startswith("open"):
        return "open"
    if "**open**" in low:
        return "open"
    return "UNCLASSIFIED"


print("## D. The 39 Phase 13 GATE findings, as the register now holds them\n")
print("Source: `.kiro/specs/admissions-v2-canonical-rebuild/findings.md`, section")
print("*Phase 13 Verification Findings (Task 13.6 Remediation, Item L9)*.\n")
print("| GATE finding | sev | state (bucketed) | owner requirement(s) | state cell, verbatim |")
print("|---|---|---|---|---|")
by_state: dict[str, list[str]] = {}
by_sev: dict[str, int] = {}
unowned: list[str] = []
for fid in sorted(rows, key=lambda f: (f.split("-")[1], int(f.split("-")[2]))):
    r = rows[fid]
    st = normalise_state(r["state"])
    by_state.setdefault(st, []).append(fid)
    by_sev[r["severity"]] = by_sev.get(r["severity"], 0) + 1
    if not r["owner_req"] or r["owner_req"] in {"-", "—", "**NONE**"}:
        unowned.append(fid)
    print(f"| {fid} | {r['severity']} | {st} | {r['owner_req']} | {r['state']} |")

print()
print(f"Registered Phase 13 GATE findings: **{len(rows)}**")
print()
print("| state | n | which |")
print("|---|---:|---|")
for st in sorted(by_state, key=lambda s: (-len(by_state[s]), s)):
    print(f"| {st} | {len(by_state[st])} | {', '.join(by_state[st])} |")
print()
print("| severity | n |")
print("|---|---:|")
for sv in ("high", "med", "low"):
    print(f"| {sv} | {by_sev.get(sv, 0)} |")
print()
print(f"Rows with no owner requirement of record: **{len(unowned)}** -> {', '.join(unowned) or 'none'}")

still_open = sum(len(v) for k, v in by_state.items() if k.startswith("open") or k == "partly fixed")
print(f"Rows NOT in a plain `fixed` state: **{still_open}**")
high_open = [f for f in rows if rows[f]["severity"] == "high" and normalise_state(rows[f]["state"]) != "fixed"]
print(f"`high` rows not in a plain `fixed` state: **{len(high_open)}** -> {', '.join(sorted(high_open)) or 'none'}")
unclassified = by_state.get("UNCLASSIFIED", [])
print(f"State cells this script could not bucket: **{len(unclassified)}** -> {', '.join(unclassified) or 'none'}")

# ---------------------------------------------------------------------------
# D2. cross-check against every id Phase 13 and the remediation batches mention
# ---------------------------------------------------------------------------
print()
print("## D2. Cross-check: mentioned in evidence vs registered\n")

mentioned: dict[str, set[str]] = {}
sources = sorted(EVIDENCE.glob("13.*/README.md")) + sorted(
    EVIDENCE.glob("13.6/remediation/*/README.md")
)
for readme in sources:
    label = str(readme.relative_to(EVIDENCE).parent)
    for fid in set(re.findall(r"GATE-13\.\d+-\d+", readme.read_text(encoding="utf-8"))):
        mentioned.setdefault(fid, set()).add(label)

registered = set(rows)
only_mentioned = sorted(set(mentioned) - registered)
only_registered = sorted(registered - set(mentioned))

print(f"READMEs scanned: **{len(sources)}** -> {', '.join(str(p.relative_to(EVIDENCE).parent) for p in sources)}")
print(f"Distinct GATE ids mentioned in Phase 13 + remediation evidence: **{len(mentioned)}**")
print(f"Distinct GATE ids registered in findings.md: **{len(registered)}**")
print(f"Mentioned but NOT registered: **{len(only_mentioned)}** -> {', '.join(only_mentioned) or 'none'}")
print(f"Registered but not mentioned in any README scanned: **{len(only_registered)}** -> {', '.join(only_registered) or 'none'}")

# ---------------------------------------------------------------------------
# D3. the mechanical gap — demonstrated with the real validator
# ---------------------------------------------------------------------------
print()
print("## D3. GATE-13.6-04, demonstrated rather than asserted\n")

parsed = vsg.parse_findings(findings_text)
req_data = vsg.parse_requirements(requirements_text)
owned_ids = {fid for fids in req_data["findings_by_requirement"].values() for fid in fids}

print("```")
print(f"validator module              : {Path(vsg.__file__).relative_to(REPO)}")
print(f"_FINDING_ROW_RE              : {vsg._FINDING_ROW_RE.pattern}")
print(f"_FINDING_ID_RE               : {vsg._FINDING_ID_RE.pattern}")
print(f"vsg.parse_findings() count   : {len(parsed)}      <- 'finding_count' the gate prints")
matched = [f for f in rows if vsg._FINDING_ROW_RE.match(f"| {f} | high | x | y | z | w |")]
print(f"dotted rows the grammar parses: {len(matched)} of {len(rows)}")
print(f"dotted ids owned by a requirement `_Findings:` line: "
      f"{len([f for f in rows if f in owned_ids])} of {len(rows)}")
print(f"register total, documented   : {len(parsed)} parsed + {len(rows)} documental = {len(parsed) + len(rows)}")
print("```")
print()
print("So the 39 rows are registered **documentally**: a reader gets an answer from")
print("`findings.md`, and R1.3 rule 3 still cannot fire over any of them. That gap is")
print("GATE-13.6-04, open by design (`.../L9-L11/README.md` §3.3) — closing it needs the")
print("grammar widened **and** `requirements.md`'s `_Findings:` lines extended in one edit,")
print("which is the requirements author's call, not a closure audit's.")
